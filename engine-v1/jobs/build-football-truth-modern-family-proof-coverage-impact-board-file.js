import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/modern-family-proof-coverage-impact-board-${DATE}`;
const OUT = `${OUT_DIR}/modern-family-proof-coverage-impact-board-${DATE}.json`;

const MODERN_SPORTOMEDIA_SUMMARY = `data/football-truth/_diagnostics/modern-sportomedia-sef-current-or-new-proof-${DATE}/modern-sportomedia-sef-current-or-new-proof-${DATE}.json`;
const MODERN_SPORTOMEDIA_ROWS = `data/football-truth/_diagnostics/modern-sportomedia-sef-current-or-new-proof-${DATE}/modern-sportomedia-sef-current-or-new-proof-rows-${DATE}.jsonl`;

function abs(rel) {
  return path.join(ROOT, rel);
}

function readJson(rel) {
  if (!fs.existsSync(abs(rel))) return null;
  return JSON.parse(fs.readFileSync(abs(rel), "utf8"));
}

function readJsonl(rel) {
  if (!fs.existsSync(abs(rel))) return [];
  return fs.readFileSync(abs(rel), "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function writeJson(rel, value) {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, 2) + "\n");
}

function walk(rel, out = []) {
  const p = abs(rel);
  if (!fs.existsSync(p)) return out;
  for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
    if ([".git", "node_modules", ".next", "dist", "build", "coverage"].includes(ent.name)) continue;
    const child = path.join(rel, ent.name).replace(/\\/g, "/");
    if (ent.isDirectory()) walk(child, out);
    else if (/\.json$/i.test(ent.name)) out.push(child);
  }
  return out;
}

function latestMatchingJson(pattern) {
  const files = walk("data/football-truth/_diagnostics")
    .filter(rel => pattern.test(rel))
    .map(rel => ({ rel, mtime: fs.statSync(abs(rel)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.rel ?? null;
}

function arrayify(x) {
  return Array.isArray(x) ? x : [];
}

function slugSetFromAny(value, mode) {
  const out = new Set();

  function scan(x) {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) {
      for (const item of x) scan(item);
      return;
    }

    const slug = x.competitionSlug || x.leagueSlug || x.slug || x.normalizedCompetitionSlug;
    const seasonScope = x.seasonScope || x.scope || x.lane || x.seasonLane;
    const quality = x.qualityGateStatus || x.validationStatus || x.status;

    if (slug && typeof slug === "string") {
      const text = JSON.stringify(x);
      if (mode === "previous_completed") {
        if (
          seasonScope === "previous_completed" ||
          text.includes("previous_completed") ||
          text.includes("previousCompleted")
        ) out.add(slug);
      }
      if (mode === "current_or_new") {
        if (
          seasonScope === "current_or_new" ||
          text.includes("current_or_new") ||
          text.includes("currentOrNew")
        ) out.add(slug);
      }
      if (mode === "start_date") {
        if (
          text.includes("nextSeasonStartDate") ||
          text.includes("startDate") ||
          text.includes("nextSeasonStartDateSatisfied")
        ) out.add(slug);
      }
      if (quality === "verified" || quality === "passed") {
        if (mode === "any_verified") out.add(slug);
      }
    }

    for (const v of Object.values(x)) scan(v);
  }

  scan(value);
  return out;
}

const latestSeasonLedgerPath = latestMatchingJson(/season-lane-coverage-ledger.*\.json$/i);
const latestLifecyclePath = latestMatchingJson(/permanent-lifecycle.*planner.*\.json$/i);
const latestPrioritizedBoardPath = latestMatchingJson(/prioritized.*lifecycle.*board.*\.json$/i);

const seasonLedger = latestSeasonLedgerPath ? readJson(latestSeasonLedgerPath) : null;
const lifecycle = latestLifecyclePath ? readJson(latestLifecyclePath) : null;
const prioritizedBoard = latestPrioritizedBoardPath ? readJson(latestPrioritizedBoardPath) : null;

const sportSummary = readJson(MODERN_SPORTOMEDIA_SUMMARY);
const sportRows = readJsonl(MODERN_SPORTOMEDIA_ROWS);

if (!sportSummary || sportSummary.status !== "passed_verified_current_or_new_diagnostic_only") {
  throw new Error(`Modern Sportomedia proof summary missing or not passed: ${MODERN_SPORTOMEDIA_SUMMARY}`);
}
if (sportRows.length !== 32) {
  throw new Error(`Expected 32 modern Sportomedia rows, got ${sportRows.length}`);
}

const modernRowsBySlug = {};
for (const row of sportRows) {
  if (!modernRowsBySlug[row.competitionSlug]) modernRowsBySlug[row.competitionSlug] = [];
  modernRowsBySlug[row.competitionSlug].push(row);
}

const modernVerifiedCurrentOrNewSlugs = Object.keys(modernRowsBySlug).filter(slug => {
  const rows = modernRowsBySlug[slug];
  return rows.length === 16 &&
    rows.every(r => r.seasonScope === "current_or_new" && r.seasonLabel === "2026" && r.qualityGateStatus === "verified" && r.validationStatus === "passed");
});

const ledgerCurrentOrNewSet = seasonLedger ? slugSetFromAny(seasonLedger, "current_or_new") : new Set();
const ledgerPreviousCompletedSet = seasonLedger ? slugSetFromAny(seasonLedger, "previous_completed") : new Set();

const newCurrentOrNewSlugs = modernVerifiedCurrentOrNewSlugs.filter(slug => !ledgerCurrentOrNewSet.has(slug));
const alreadyCurrentOrNewSlugs = modernVerifiedCurrentOrNewSlugs.filter(slug => ledgerCurrentOrNewSet.has(slug));

const seasonLedgerSummary = seasonLedger?.summary ?? seasonLedger ?? {};
const lifecycleSummary = lifecycle?.summary ?? lifecycle ?? {};
const prioritizedSummary = prioritizedBoard?.summary ?? prioritizedBoard ?? {};

const beforeCurrentOrNewSatisfied =
  Number(seasonLedgerSummary.currentOrNewSeasonSatisfiedCount ?? seasonLedgerSummary.current_or_new_satisfied_count ?? ledgerCurrentOrNewSet.size ?? 0);

const beforePreviousCompletedSatisfied =
  Number(seasonLedgerSummary.previousCompletedSatisfiedCount ?? ledgerPreviousCompletedSet.size ?? 0);

const beforeCurrentOrNewVerifiedRows =
  Number(seasonLedgerSummary.currentOrNewSeasonVerifiedRowsCount ?? seasonLedgerSummary.currentOrNewVerifiedRowsCount ?? 0);

const impact = {
  wouldAddCurrentOrNewSatisfiedCount: newCurrentOrNewSlugs.length,
  wouldAddCurrentOrNewVerifiedRowsCount: newCurrentOrNewSlugs.reduce((sum, slug) => sum + modernRowsBySlug[slug].length, 0),
  projectedCurrentOrNewSatisfiedCount: beforeCurrentOrNewSatisfied + newCurrentOrNewSlugs.length,
  projectedCurrentOrNewVerifiedRowsCount: beforeCurrentOrNewVerifiedRows + newCurrentOrNewSlugs.reduce((sum, slug) => sum + modernRowsBySlug[slug].length, 0),
  previousCompletedSatisfiedCountUnchanged: beforePreviousCompletedSatisfied,
  nextSeasonStartDateSatisfiedCountUnchanged: Number(seasonLedgerSummary.nextSeasonStartDateSatisfiedCount ?? 0)
};

const board = {
  status: "passed",
  runner: "modern_family_proof_coverage_impact_board",
  contractVersion: 1,
  purpose: "measure diagnostic-only lifecycle impact of modern family proof rows without canonical writes, production writes, or truth assertions",
  generatedAtUtc: new Date().toISOString(),
  inputs: {
    modernSportomediaSummary: MODERN_SPORTOMEDIA_SUMMARY,
    modernSportomediaRows: MODERN_SPORTOMEDIA_ROWS,
    latestSeasonLedgerPath,
    latestLifecyclePath,
    latestPrioritizedBoardPath
  },
  modernProofs: [
    {
      familyId: "sportomedia_sef",
      seasonScope: "current_or_new",
      seasonLabel: "2026",
      status: sportSummary.status,
      verifiedGroupCount: sportSummary.summary?.verifiedGroupCount ?? sportSummary.verifiedGroupCount,
      acceptedRowCount: sportSummary.summary?.acceptedRowCount ?? sportSummary.acceptedRowCount,
      verifiedSlugs: modernVerifiedCurrentOrNewSlugs,
      rowsBySlug: Object.fromEntries(Object.entries(modernRowsBySlug).map(([slug, rows]) => [slug, rows.length])),
      newCurrentOrNewSlugs,
      alreadyCurrentOrNewSlugs
    }
  ],
  baseline: {
    seasonLedgerCurrentOrNewSatisfiedCount: beforeCurrentOrNewSatisfied,
    seasonLedgerPreviousCompletedSatisfiedCount: beforePreviousCompletedSatisfied,
    seasonLedgerNextSeasonStartDateSatisfiedCount: Number(seasonLedgerSummary.nextSeasonStartDateSatisfiedCount ?? 0),
    lifecyclePermanentDueTaskCount: Number(lifecycleSummary.permanentDueTaskCount ?? 0),
    prioritizedAcceptedExecutableTaskCount: Number(prioritizedSummary.acceptedExecutableTaskCount ?? 0)
  },
  impact,
  recommendation: newCurrentOrNewSlugs.length > 0
    ? "next_build_modern_proof_lane_materialization_gate_for_current_or_new_rows_without_truth_or_canonical_writes"
    : "no_new_current_or_new_coverage_from_modern_proof_rows",
  policy: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    proofOnly: true,
    canonicalOrTruthPromotionAllowedNow: false
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0
};

writeJson(OUT, board);

console.log(JSON.stringify({
  status: board.status,
  modernProofFamily: "sportomedia_sef",
  modernVerifiedCurrentOrNewSlugs,
  newCurrentOrNewSlugs,
  alreadyCurrentOrNewSlugs,
  impact,
  recommendation: board.recommendation,
  output: OUT,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0
}, null, 2));
