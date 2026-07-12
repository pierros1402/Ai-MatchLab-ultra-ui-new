/**
 * build-day-report.js
 *
 * One self-describing report per day: data/build-reports/<DAY>.json.
 * Pure aggregator — reads artifacts other jobs already wrote (coverage
 * report, expected-matches, canonical store, deploy snapshot, invariant
 * report, freshness report, value plans, settlement comparison) and rolls
 * them into a single verdict. Nothing is recomputed, nothing is mutated.
 *
 * This is the autonomy scoreboard: a day is `clean` when it has no hard
 * failures (stale snapshot, blocked invariants, missing value artifact,
 * missing details). The Definition-of-Done for the autonomous mechanism is
 * a streak of consecutive clean days — when something breaks, this file
 * says what, without digging through ten artifacts.
 *
 * Usage: node engine-v1/jobs/build-day-report.js --date=YYYY-MM-DD
 * Exit code is always 0 — reporting must never block a pipeline.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { buildAcquisitionSkippedSlugsWarning } from "../system-health/skipped-slug-policy.js";
import { verifyArtifactFreshnessDay } from "./verify-artifact-freshness-day.js";

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function countByLeague(rows, slugField) {
  const out = {};
  for (const row of rows || []) {
    const slug = String(row?.[slugField] || "").trim();
    if (!slug) continue;
    out[slug] = (out[slug] || 0) + 1;
  }
  return out;
}

function planSummary(plan) {
  const s = plan?.summary || {};
  return {
    picks: Number(s.picks || 0),
    settled: Number(s.settled || 0),
    wins: Number(s.wins || 0),
    losses: Number(s.losses || 0),
    unresolved: Number(s.unresolved || 0)
  };
}

export function buildDayReport(dayKey) {
  const report = {
    ok: true,
    schema: "ai-matchlab.day-build-report.v1",
    dayKey,
    generatedAt: new Date().toISOString(),
    universe: null,
    acquisition: null,
    freshness: null,
    invariant: null,
    value: null,
    settlement: null,
    hardFailures: [],
    warnings: [],
    clean: false,
    cleanStrict: false
  };

  // ── Universe: expected vs canonical vs published ──────────────────────────
  const expected = readJsonSafe(resolveDataPath("expected-matches", `${dayKey}.json`));
  const expectedByLeague = countByLeague(expected?.matches, "leagueSlug");

  const canonicalByLeague = {};
  const canonicalDir = resolveDataPath("canonical-fixtures", dayKey);
  if (fs.existsSync(canonicalDir)) {
    for (const name of fs.readdirSync(canonicalDir).filter(f => f.endsWith(".json"))) {
      const payload = readJsonSafe(path.join(canonicalDir, name));
      const slug = String(payload?.leagueSlug || name.replace(/\.json$/, ""));
      canonicalByLeague[slug] = (canonicalByLeague[slug] || 0)
        + (Array.isArray(payload?.fixtures) ? payload.fixtures.length : 0);
    }
  }

  const snapshotFixtures = readJsonSafe(resolveDataPath("deploy-snapshots", dayKey, "fixtures.json"));
  const publishedByLeague = countByLeague(snapshotFixtures?.fixtures, "leagueSlug");

  const manifest = readJsonSafe(resolveDataPath("deploy-snapshots", dayKey, "manifest.json"));
  const publishedCount = Number(manifest?.counts?.fixtures ?? snapshotFixtures?.count ?? 0);
  const detailsCount = Number(manifest?.counts?.details ?? 0);

  const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);
  const leaguesMissing = (fromMap, inMap) =>
    Object.keys(fromMap).filter(slug => !(slug in inMap)).sort();

  report.universe = {
    expected: expected ? Number(expected.matchCount ?? sum(expectedByLeague)) : null,
    canonical: sum(canonicalByLeague),
    published: publishedCount,
    details: detailsCount,
    byLeague: {
      expected: expectedByLeague,
      canonical: canonicalByLeague,
      published: publishedByLeague
    },
    canonicalLeaguesMissingFromPublished: leaguesMissing(canonicalByLeague, publishedByLeague),
    expectedLeaguesMissingFromPublished: leaguesMissing(expectedByLeague, publishedByLeague)
  };

  // ── Acquisition ───────────────────────────────────────────────────────────
  const coverage = readJsonSafe(resolveDataPath("coverage-reports", `${dayKey}.json`));
  if (coverage) {
    const supplemental = coverage?.summary?.supplementalAllScoreboard || {};
    report.acquisition = {
      finishedAt: coverage.finishedAt || null,
      accepted: Number(coverage?.summary?.accepted || 0),
      failedFetches: Number(coverage?.summary?.failedFetches || 0),
      skippedSlugSample: supplemental.skippedSlugSample || null,
      aliasedSlugSample: supplemental.aliasedSlugSample || null
    };
  }

  // ── Freshness (recomputed live so the report never trusts a stale report) ─
  const freshness = verifyArtifactFreshnessDay(dayKey);
  report.freshness = {
    ok: freshness.ok,
    manifestGeneratedAt: freshness.manifestGeneratedAt,
    reasons: freshness.reasons,
    staleInputs: freshness.staleInputs.map(i => i.artifact)
  };

  // ── Invariants ────────────────────────────────────────────────────────────
  const invariant = readJsonSafe(resolveDataPath("deploy-snapshots", dayKey, "invariant-report.json"));
  if (invariant) {
    report.invariant = {
      ok: invariant.ok === true,
      blocked: Array.isArray(invariant.blocked) ? invariant.blocked.length : 0,
      warnings: Array.isArray(invariant.warnings) ? invariant.warnings.length : 0,
      autoFixed: Array.isArray(invariant.autoFixed) ? invariant.autoFixed.length : 0,
      checkedAt: invariant.checkedAt || null
    };
  }

  // ── Value ─────────────────────────────────────────────────────────────────
  const value = readJsonSafe(resolveDataPath("deploy-snapshots", dayKey, "value.json"));
  const planB = readJsonSafe(resolveDataPath("value-plans", dayKey, "plan-b.json"));
  const planBAudit = readJsonSafe(resolveDataPath("value-plans", dayKey, "plan-b-audit.json"));
  report.value = {
    source: String(value?.source || "missing"),
    count: Number(value?.count || 0),
    gateOk: !(publishedCount > 0 && String(value?.source || "") === "missing_local_value_file"),
    planB: planB ? {
      count: Number(planB.count || 0),
      approved: Number(planBAudit?.approved ?? planBAudit?.summary?.approved ?? 0),
      rejected: Number(planBAudit?.rejected ?? planBAudit?.summary?.rejected ?? 0)
    } : null
  };

  // ── Settlement ────────────────────────────────────────────────────────────
  const comparison = readJsonSafe(resolveDataPath("value-comparison", `${dayKey}.json`));
  if (comparison?.plans) {
    report.settlement = {
      generatedAt: comparison.generatedAt || null,
      planA: planSummary(comparison.plans.A),
      planB: planSummary(comparison.plans.B)
    };
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  if (!manifest) report.hardFailures.push("manifest_missing");
  if (!freshness.ok) report.hardFailures.push("snapshot_stale");
  if (report.invariant && (!report.invariant.ok || report.invariant.blocked > 0)) {
    report.hardFailures.push("invariant_blocked");
  }
  if (!report.value.gateOk) report.hardFailures.push("value_artifact_missing");
  if (manifest && detailsCount < publishedCount) report.hardFailures.push("details_incomplete");

  // League-level parity stays a WARNING until the identity resolver lands:
  // alias mismatches between sources would otherwise produce false alarms
  // and a hard gate that cries wolf gets disabled, not fixed.
  if (report.universe.canonicalLeaguesMissingFromPublished.length > 0) {
    report.warnings.push("canonical_leagues_missing_from_published:"
      + report.universe.canonicalLeaguesMissingFromPublished.join(","));
  }
  if (report.universe.expectedLeaguesMissingFromPublished.length > 0) {
    report.warnings.push("expected_leagues_missing_from_published:"
      + report.universe.expectedLeaguesMissingFromPublished.join(","));
  }
  if (report.acquisition?.skippedSlugSample && Object.keys(report.acquisition.skippedSlugSample).length > 0) {
    const skippedSlugWarning = buildAcquisitionSkippedSlugsWarning(
      Object.keys(report.acquisition.skippedSlugSample)
    );
    if (skippedSlugWarning) {
      report.warnings.push(skippedSlugWarning);
    }
  }

  report.clean = report.hardFailures.length === 0;
  report.cleanStrict = report.clean && report.warnings.length === 0;
  report.ok = true;
  return report;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const dateArg = process.argv.find(a => a.startsWith("--date="))?.split("=")[1]
    || process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateArg || ""))) {
    console.error("Usage: node engine-v1/jobs/build-day-report.js --date=YYYY-MM-DD");
    process.exit(1);
  }

  const report = buildDayReport(dateArg);

  const outDir = resolveDataPath("build-reports");
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, `${dateArg}.json`), JSON.stringify(report, null, 2) + "\n");

  console.log(JSON.stringify({
    dayKey: report.dayKey,
    clean: report.clean,
    cleanStrict: report.cleanStrict,
    hardFailures: report.hardFailures,
    warnings: report.warnings,
    universe: {
      expected: report.universe.expected,
      canonical: report.universe.canonical,
      published: report.universe.published,
      details: report.universe.details
    }
  }, null, 2));

  process.exit(0);
}
