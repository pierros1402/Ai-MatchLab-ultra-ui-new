/**
 * audit-historical-integrity-range.js
 *
 * Read-only historical integrity sweep for deploy snapshots. It does not repair
 * or mutate data; it only tells us which old days are safe to use as evidence
 * for settlement/cumulative/backtesting and which must be repaired first.
 *
 * Usage:
 *   node engine-v1/jobs/audit-historical-integrity-range.js --from=2026-07-01 --to=2026-07-08 --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { sameTeamName } from "../core/fixture-dedup.js";

const __filename = fileURLToPath(import.meta.url);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, payload) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const out = { from: null, to: null, write: false };
  for (const arg of argv) {
    if (arg.startsWith("--from=")) out.from = arg.slice("--from=".length);
    else if (arg.startsWith("--to=")) out.to = arg.slice("--to=".length);
    else if (arg === "--write") out.write = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/audit-historical-integrity-range.js --from=YYYY-MM-DD --to=YYYY-MM-DD --write",
    "",
    "Output:",
    "  data/historical-integrity/latest.json",
    "  data/historical-integrity/YYYY-MM-DD.json per day when --write is supplied"
  ].join("\n");
}

function listSnapshotDays({ from, to } = {}) {
  const root = resolveDataPath("deploy-snapshots");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter(name => DAY_RE.test(name))
    .filter(day => (!from || day >= from) && (!to || day <= to))
    .sort();
}

function kickoffMinute(row) {
  const ts = new Date(row?.kickoffUtc || row?.kickoff || 0).getTime();
  return Number.isFinite(ts) && ts > 0 ? Math.floor(ts / 60000) : null;
}

function findAliasDuplicatePairs(fixtures) {
  const byLeague = new Map();
  for (const fx of fixtures) {
    const slug = String(fx?.leagueSlug || "unknown");
    if (!byLeague.has(slug)) byLeague.set(slug, []);
    byLeague.get(slug).push(fx);
  }

  const pairs = [];
  for (const [slug, rows] of byLeague) {
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i];
        const b = rows[j];
        const ma = kickoffMinute(a);
        const mb = kickoffMinute(b);
        if (ma === null || mb === null || ma !== mb) continue;
        if (!sameTeamName(slug, a?.homeTeam || a?.home, b?.homeTeam || b?.home)) continue;
        if (!sameTeamName(slug, a?.awayTeam || a?.away, b?.awayTeam || b?.away)) continue;
        pairs.push({
          slug,
          a: String(a?.canonicalId || a?.matchId || ""),
          b: String(b?.canonicalId || b?.matchId || ""),
          label: `${a?.homeTeam || a?.home} v ${a?.awayTeam || a?.away} == ${b?.homeTeam || b?.home} v ${b?.awayTeam || b?.away}`
        });
      }
    }
  }
  return pairs;
}

export function auditHistoricalIntegrityDay(dayKey) {
  const snapshotDir = resolveDataPath("deploy-snapshots", dayKey);
  const fixturesPayload = readJsonSafe(path.join(snapshotDir, "fixtures.json"), null);
  const manifest = readJsonSafe(path.join(snapshotDir, "manifest.json"), null);
  const invariant = readJsonSafe(path.join(snapshotDir, "invariant-report.json"), null);
  const buildReport = readJsonSafe(resolveDataPath("build-reports", `${dayKey}.json`), null);
  const value = readJsonSafe(path.join(snapshotDir, "value.json"), null);
  const valueAudit = readJsonSafe(path.join(snapshotDir, "value-audit.json"), null);

  const detailsDir = path.join(snapshotDir, "details");
  const fixtures = Array.isArray(fixturesPayload?.fixtures) ? fixturesPayload.fixtures : [];
  const fixtureIds = fixtures
    .map(fx => String(fx?.canonicalId || fx?.matchId || "").trim())
    .filter(Boolean);
  const uniqueFixtureIds = [...new Set(fixtureIds)];
  const detailIds = fs.existsSync(detailsDir)
    ? fs.readdirSync(detailsDir).filter(name => name.endsWith(".json")).map(name => name.slice(0, -5)).sort()
    : [];
  const detailIdSet = new Set(detailIds);
  const fixtureIdSet = new Set(uniqueFixtureIds);
  const duplicateCanonicalIds = [...fixtureIds.reduce((map, id) => {
    map.set(id, (map.get(id) || 0) + 1);
    return map;
  }, new Map()).entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count }));

  const detailsWithoutFixture = detailIds.filter(id => !fixtureIdSet.has(id));
  const fixturesWithoutDetail = uniqueFixtureIds.filter(id => !detailIdSet.has(id));
  const aliasDuplicatePairs = findAliasDuplicatePairs(fixtures);

  const checkedAt = Date.parse(invariant?.checkedAt || "");
  const manifestGeneratedAt = Date.parse(manifest?.generatedAt || "");
  const invariantFresh = Boolean(
    invariant &&
    Number.isFinite(checkedAt) &&
    (!Number.isFinite(manifestGeneratedAt) || checkedAt >= manifestGeneratedAt)
  );

  const hardFailures = [];
  if (!manifest) hardFailures.push("manifest_missing");
  if (!fixturesPayload) hardFailures.push("fixtures_missing");
  if (duplicateCanonicalIds.length) hardFailures.push("duplicate_canonical_id");
  if (detailsWithoutFixture.length || fixturesWithoutDetail.length) hardFailures.push("details_fixtures_not_bijective");
  if (aliasDuplicatePairs.length) hardFailures.push("alias_duplicate_fixtures");
  if (Array.isArray(invariant?.blocked) && invariant.blocked.length) hardFailures.push("invariant_blocked");
  if (!invariantFresh) hardFailures.push("invariant_report_stale_or_missing");
  if (Number(manifest?.snapshotRescuedCount || 0) > 0) hardFailures.push("snapshot_rescue_present");
  if (buildReport && buildReport.clean === false) hardFailures.push("build_report_not_clean");

  const warnings = [];
  if (!valueAudit) warnings.push("production_value_audit_missing");
  if (!buildReport) warnings.push("build_report_missing");
  if (value && value.ok === false) warnings.push("value_artifact_not_ok");

  return {
    ok: hardFailures.length === 0,
    dayKey,
    checkedAt: new Date().toISOString(),
    counts: {
      fixtures: fixtures.length,
      uniqueFixtureIds: uniqueFixtureIds.length,
      details: detailIds.length,
      valuePicks: Array.isArray(value?.picks) ? value.picks.length : Number(value?.count || 0),
      snapshotRescuedCount: Number(manifest?.snapshotRescuedCount || 0)
    },
    hardFailures,
    warnings,
    detailsWithoutFixture,
    fixturesWithoutDetail,
    duplicateCanonicalIds,
    aliasDuplicatePairs: aliasDuplicatePairs.slice(0, 50),
    invariant: invariant ? {
      ok: invariant.ok !== false,
      checkedAt: invariant.checkedAt || null,
      manifestGeneratedAt: invariant.manifestGeneratedAt || manifest?.generatedAt || null,
      fresh: invariantFresh,
      blocked: Array.isArray(invariant.blocked) ? invariant.blocked.length : 0
    } : null,
    buildReport: buildReport ? {
      clean: buildReport.clean === true,
      cleanStrict: buildReport.cleanStrict === true,
      hardFailures: buildReport.hardFailures || [],
      warnings: buildReport.warnings || []
    } : null
  };
}

export function auditHistoricalIntegrityRange(options = {}) {
  const days = listSnapshotDays(options);
  const reports = days.map(day => auditHistoricalIntegrityDay(day));
  const summary = {
    ok: reports.every(r => r.ok),
    schema: "ai-matchlab.historical-integrity.v1",
    generatedAt: new Date().toISOString(),
    from: options.from || days[0] || null,
    to: options.to || days[days.length - 1] || null,
    dayCount: reports.length,
    cleanDays: reports.filter(r => r.ok).map(r => r.dayKey),
    repairRequiredDays: reports.filter(r => !r.ok).map(r => r.dayKey),
    warningDays: reports.filter(r => r.warnings.length > 0).map(r => r.dayKey),
    days: reports.map(r => ({
      dayKey: r.dayKey,
      ok: r.ok,
      counts: r.counts,
      hardFailures: r.hardFailures,
      warnings: r.warnings
    }))
  };

  if (options.write) {
    const outDir = resolveDataPath("historical-integrity");
    ensureDir(outDir);
    for (const report of reports) writeJson(path.join(outDir, `${report.dayKey}.json`), report);
    writeJson(path.join(outDir, "latest.json"), summary);
  }

  return { summary, reports };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  if ((args.from && !DAY_RE.test(args.from)) || (args.to && !DAY_RE.test(args.to))) {
    console.error(usage());
    process.exit(1);
  }
  const result = auditHistoricalIntegrityRange(args);
  console.log(JSON.stringify(result.summary, null, 2));
  process.exit(result.summary.ok ? 0 : 2);
}
