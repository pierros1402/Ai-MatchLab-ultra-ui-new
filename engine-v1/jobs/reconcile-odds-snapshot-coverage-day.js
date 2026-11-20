/**
 * Recover a current-day odds publication without touching canonical truth.
 *
 * The frozen V3.5 exporter remains byte-identical. This post-export
 * reconciliation may promote ONLY pre-existing, independently corroborated
 * model assessments and assessments emitted by the current pre-kickoff run.
 * Missing evidence remains a hard publication failure.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { getOddsForDay } from "../storage/odds-memory-db.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import { resolveCanonicalAssessmentOwnership, joinCanonicalFixturesWithModelAssessments } from "../core/plan-b-canonical-membership.js";
import { classifyAssessmentPublication, assessPublicationIdentity } from "../core/assessment-publication-identity.js";
import { overlayProductionEvidenceDocumentReadView } from "../core/production-evidence-identity-overlay.js";
import { assessmentRowCount, contentHash, snapshotRegressionReason } from "./export-odds-snapshot-day.js";

const id = row => String(row?.canonicalId || "").trim();
const hasModel = row => Boolean(row?.aiAssessment?.markets &&
  typeof row.aiAssessment.markets === "object" &&
  Object.keys(row.aiAssessment.markets).length);

export function buildRecoveredOddsMatches({
  canonical = [],
  existingMatches = [],
  candidateMatches = [],
  currentRunAssessments = [],
  requiredIds = []
} = {}) {
  const canonicalIds = new Set(canonical.map(id).filter(Boolean));
  const ownership = resolveCanonicalAssessmentOwnership(canonical, candidateMatches);
  const joined = joinCanonicalFixturesWithModelAssessments(canonical, ownership.matches);
  const strict = classifyAssessmentPublication(ownership.matches, canonical);
  if (strict.holds.length || joined.ambiguousCanonicalMatches.length ||
      joined.ambiguousAssessmentAliases.length ||
      joined.canonicalRowsMissingIdentity.length) {
    return { ok: false, reason: "candidate_identity_hold" };
  }

  const quarantined = new Set([
    ...joined.orphanAssessmentRows,
    ...strict.quarantined.map(x => x.row)
  ]);
  const result = ownership.matches.map(row =>
    quarantined.has(row) ? { ...row, aiAssessment: null } : { ...row }
  );

  const accepted = new Map();
  const addCertified = rows => {
    const published = classifyAssessmentPublication(rows, canonical);
    if (published.holds.length) return false;
    const ids = new Set();
    for (const { row } of published.publishable) {
      const key = id(row);
      if (!canonicalIds.has(key) || !hasModel(row) || ids.has(key)) return false;
      ids.add(key);
      accepted.set(key, row);
    }
    return true;
  };

  // Existing genuine evidence first, then freshly generated evidence.
  // A new assessment is admitted only with the same independent identity proof.
  if (!addCertified(existingMatches) || !addCertified(currentRunAssessments)) {
    return { ok: false, reason: "certified_evidence_conflict" };
  }

  const candidateIds = new Set();
  let restored = 0;
  for (let i = 0; i < result.length; i++) {
    const row = result[i];
    const key = id(row);
    if (!key || !canonicalIds.has(key)) continue;
    if (candidateIds.has(key)) return { ok: false, reason: "duplicate_candidate_canonical_id" };
    candidateIds.add(key);
    if (hasModel(row)) continue;
    const trusted = accepted.get(key);
    if (!trusted) continue;
    const combined = { ...row, aiAssessment: trusted.aiAssessment };
    if (assessPublicationIdentity(combined, canonical).status !== "publish") {
      return { ok: false, reason: "recovered_identity_not_certified", fixtureId: key };
    }
    result[i] = combined;
    restored++;
  }
  for (const [key, trusted] of accepted) {
    if (candidateIds.has(key)) continue;
    result.push({ ...trusted });
    candidateIds.add(key);
    restored++;
  }

  const finalStrict = classifyAssessmentPublication(result, canonical);
  const finalJoin = joinCanonicalFixturesWithModelAssessments(canonical, result);
  if (finalStrict.holds.length || finalStrict.quarantined.some(x => hasModel(x.row)) ||
      finalJoin.ambiguousCanonicalMatches.length ||
      finalJoin.ambiguousAssessmentAliases.length ||
      finalJoin.canonicalRowsMissingIdentity.length ||
      finalJoin.orphanAssessmentRows.length) {
    return { ok: false, reason: "recovered_identity_hold" };
  }
  const assessed = new Set(finalJoin.joinedMatches.map(row => String(row.canonicalId || "")));
  const missing = [...new Set(requiredIds.map(String))].filter(key => !assessed.has(key));
  if (missing.length) {
    return { ok: false, reason: "required_assessment_still_missing", missingRequiredFixtureIds: missing };
  }
  const regression = snapshotRegressionReason(existingMatches, result, canonical);
  if (regression) return { ok: false, reason: regression };
  return { ok: true, matches: result, restored, required: requiredIds.length };
}

function readSnapshot(dayKey) {
  const file = resolveDataPath("deploy-snapshots", dayKey, "odds.json");
  return overlayProductionEvidenceDocumentReadView(
    JSON.parse(fs.readFileSync(file, "utf8"))
  );
}

function writeSnapshot(dayKey, payload) {
  const directory = resolveDataPath("deploy-snapshots", dayKey);
  const file = resolveDataPath("deploy-snapshots", dayKey, "odds.json");
  ensureDir(directory);
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(payload, null, 2), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
  } catch (error) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

export function reconcileOddsSnapshotCoverageDay(dayKey, {
  currentRunAssessments = [],
  requiredIds = [],
  getCanonical = canonicalFixturesForDay,
  getCandidate = key => getOddsForDay(key, { publication: true }).matches,
  readExisting = readSnapshot,
  write = writeSnapshot
} = {}) {
  const existing = readExisting(dayKey);
  if (!existing || !Array.isArray(existing.matches)) {
    return { ok: false, changed: false, reason: "existing_snapshot_missing" };
  }
  const canonical = getCanonical(dayKey);
  const result = buildRecoveredOddsMatches({
    canonical,
    existingMatches: existing.matches,
    candidateMatches: getCandidate(dayKey),
    currentRunAssessments,
    requiredIds
  });
  if (!result.ok) return { ...result, changed: false };

  const hash = contentHash(result.matches);
  if (hash === contentHash(existing.matches)) {
    return { ok: true, changed: false, restored: result.restored, reason: "no_material_change" };
  }
  const payload = {
    ...existing,
    ok: true,
    date: dayKey,
    generatedAt: new Date().toISOString(),
    hash,
    count: result.matches.length,
    assessmentRows: assessmentRowCount(result.matches),
    assessmentOwnership: {
      ...(existing.assessmentOwnership || {}),
      policy: "independently_certified_exact_canonical_current_run_reconciliation",
      recoveredCertifiedAssessments: result.restored
    },
    matches: result.matches
  };
  write(dayKey, payload);
  return { ok: true, changed: true, restored: result.restored, count: result.matches.length };
}
