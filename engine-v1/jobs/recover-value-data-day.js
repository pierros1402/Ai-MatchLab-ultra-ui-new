import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { joinCanonicalFixturesWithModelAssessments } from "../core/plan-b-canonical-membership.js";
import { planValueDataRecovery, missingUpcomingAssessmentFixtures } from "../core/value-data-recovery-policy.js";

function read(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function snapshotTree(root) {
  const files = new Map();
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error("recovery_symlink_forbidden");
    if (entry.isDirectory()) for (const [name, bytes] of snapshotTree(file)) files.set(name, bytes);
    else files.set(file, fs.readFileSync(file));
  }
  return files;
}
function rollback(root, baseline) {
  for (const file of snapshotTree(root).keys()) if (!baseline.has(file)) fs.unlinkSync(file);
  for (const [file, bytes] of baseline) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
}
function protectedValues(dayKey) {
  const files = snapshotTree(resolveDataPath("value-plans", dayKey));
  for (const file of [resolveDataPath("value", `${dayKey}.json`), resolveDataPath("value", "_audit", `${dayKey}.json`),
    resolveDataPath("deploy-snapshots", dayKey, "value.json"), resolveDataPath("deploy-snapshots", dayKey, "value-audit.json"),
    resolveDataPath("deploy-snapshots", "latest.json")]) if (fs.existsSync(file)) files.set(file, fs.readFileSync(file));
  return files;
}
function unchanged(baseline, current) {
  return baseline.size === current.size && [...baseline].every(([file, bytes]) => current.has(file) && bytes.equals(current.get(file)));
}

export async function recoverValueDataDay(dayKey, { apply = false, maxFixtures = 500, nowMs = Date.now(), dependencies = {} } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new Error("invalid_day_key");
  const { auditDetailsFoundationDay } = await import("./audit-details-foundation-day.js");
  const audit = dependencies.audit || auditDetailsFoundationDay;
  const snapshotRoot = resolveDataPath("deploy-snapshots", dayKey);
  const fixtures = read(path.join(snapshotRoot, "fixtures.json")).fixtures;
  if (!Array.isArray(fixtures)) throw new Error("publication_fixtures_missing");
  const before = audit(dayKey);
  const plan = planValueDataRecovery(before, fixtures, { maxFixtures });
  const readOdds = () => fs.existsSync(path.join(snapshotRoot, "odds.json")) ? read(path.join(snapshotRoot, "odds.json")).matches || [] : [];
  const joinBefore = joinCanonicalFixturesWithModelAssessments(fixtures, readOdds());
  const missing = missingUpcomingAssessmentFixtures(fixtures, joinBefore, nowMs);
  const report = { schema: "ai-matchlab.value-data-recovery.v1", dayKey, generatedAt: new Date().toISOString(), apply,
    plan, before: { details: before.summary, membership: joinBefore.summary }, assessmentCandidates: missing.map(row => row.canonicalId),
    historicalPredictionsRegenerated: false, frozenValuesPreserved: true, latestPromoted: false };
  if (!apply) return { ...report, status: "DRY_RUN", mutation: false };
  if (plan.status === "BLOCKED") return { ...report, status: "BLOCKED", mutation: false };
  const guard = protectedValues(dayKey);
  const roots = [snapshotRoot, resolveDataPath("details", dayKey), resolveDataPath("value-plans", dayKey)];
  const baseline = roots.map(root => snapshotTree(root));
  const memoryBefore = new Map(missing.map(row => {
    const file = resolveDataPath("odds-memory", `${row.canonicalId || row.matchId}.json`);
    return [file, fs.existsSync(file) ? fs.readFileSync(file) : null];
  }));
  try {
    if (plan.status === "REPAIRABLE") {
      const build = dependencies.build || (await import("./build-details-day.js")).ensureDetailsForFixtures;
      const targets = fixtures.filter(row => plan.fixtureIds.includes(row.canonicalId || row.matchId));
      const result = await build(dayKey, targets, { rebuild: true, allRows: fixtures });
      if (result?.ok !== true) throw new Error("details_rebuild_failed");
      for (const id of plan.fixtureIds) {
        const file = resolveDataPath("details", dayKey, `${id}.json`);
        const detail = read(file);
        detail.meta = { ...detail.meta, recovery: { kind: "verified_data_reconstruction", repairedAt: report.generatedAt,
          historicalPredictionsRegenerated: false } };
        fs.writeFileSync(file, JSON.stringify(detail, null, 2) + "\n");
        fs.copyFileSync(file, path.join(snapshotRoot, "details", `${id}.json`));
      }
      if (audit(dayKey).ok !== true) throw new Error("details_repair_verification_failed");
      const exportSnapshot = dependencies.exportSnapshot || (await import("./export-deploy-snapshot-day.js")).exportDeploySnapshotDay;
      const manifest = read(path.join(snapshotRoot, "manifest.json"));
      const resultExport = await exportSnapshot(dayKey, { preserveDetails: true, preserveValue: true, updateLatest: false,
        publicationMode: "intraday_status_only", fixtureIdAllowlist: fixtures.map(row => row.canonicalId || row.matchId),
        authoritativelyRemovedFixtureIds: manifest.publicationUniverse?.authoritativelyRemovedFixtureIds || [],
        legacyPrunedFixtureIds: manifest.publicationUniverse?.legacyPrunedFixtureIds || [], buildMissingDetails: false, failOnMissingDetails: true });
      if (resultExport?.ok === false || audit(dayKey).ok !== true) throw new Error("snapshot_repair_verification_failed");
    }
    if (missing.length) {
      const supplement = dependencies.supplement || (await import("./canonical-assessment-supplement.js")).supplementCanonicalAssessments;
      report.assessmentSupplement = supplement(dayKey, { canonicalFixtures: missing, nowMs });
      if (report.assessmentSupplement.assessmentRowsWritten > 0) {
        const exportOdds = dependencies.exportOdds || (await import("./export-odds-snapshot-day.js")).exportOddsSnapshotDay;
        await exportOdds(dayKey);
      }
    }
    if (!unchanged(guard, protectedValues(dayKey))) throw new Error("frozen_value_mutation_forbidden");
    const joinAfter = joinCanonicalFixturesWithModelAssessments(fixtures, readOdds());
    report.after = { details: audit(dayKey).summary, membership: joinAfter.summary };
    report.remainingUpcomingAssessmentIds = missingUpcomingAssessmentFixtures(fixtures, joinAfter, nowMs).map(row => row.canonicalId);
    report.ambiguousAssessmentIds = joinAfter.ambiguousCanonicalMatches.map(row => row.canonicalId);
    report.historicalMissingAssessmentIds = joinAfter.canonicalRowsWithoutAssessment.filter(row => Date.parse(row.kickoffUtc || row.kickoff || "") <= nowMs).map(row => row.canonicalId || row.matchId);
    report.status = report.ambiguousAssessmentIds.length ? "BLOCKED_IDENTITY" : report.remainingUpcomingAssessmentIds.length ? "UPSTREAM_DATA_UNAVAILABLE" : report.historicalMissingAssessmentIds.length ? "ARTIFACTS_VERIFIED_HISTORICAL_EVIDENCE_UNAVAILABLE" : "VERIFIED";
    report.mutation = plan.status === "REPAIRABLE" || Number(report.assessmentSupplement?.assessmentRowsWritten || 0) > 0;
    report.protectedValueHashes = [...guard].map(([file, bytes]) => ({ file: path.relative(resolveDataPath(), file).replaceAll("\\", "/"), sha256: crypto.createHash("sha256").update(bytes).digest("hex") }));
    return report;
  } catch (error) {
    roots.forEach((root, index) => rollback(root, baseline[index]));
    for (const [file, bytes] of memoryBefore) {
      if (bytes === null) { if (fs.existsSync(file)) fs.unlinkSync(file); }
      else fs.writeFileSync(file, bytes);
    }
    for (const [file, bytes] of guard) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await recoverValueDataDay(process.argv[2], { apply: process.argv.includes("--apply") });
  if (result.apply) fs.writeFileSync(resolveDataPath("deploy-snapshots", result.dayKey, "value-data-recovery.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "BLOCKED") process.exitCode = 2;
}
