import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/modern-current-or-new-proof-coverage-board-${DATE}`;
const OUT = `${OUT_DIR}/modern-current-or-new-proof-coverage-board-${DATE}.json`;

const PROOF_SUMMARIES = [
  `data/football-truth/_diagnostics/modern-sportomedia-sef-current-or-new-proof-${DATE}/modern-sportomedia-sef-current-or-new-proof-${DATE}.json`,
  `data/football-truth/_diagnostics/modern-norway-ntf-current-or-new-proof-${DATE}/modern-norway-ntf-current-or-new-proof-${DATE}.json`
];

const SEASON_LEDGER = "data/football-truth/_diagnostics/season-lane-coverage-ledger-2026-06-18/season-lane-coverage-ledger-2026-06-18.json";
const PRIORITIZED_BOARD = "data/football-truth/_diagnostics/prioritized-lifecycle-execution-board-2026-06-18/prioritized-lifecycle-execution-board-2026-06-18.json";

function abs(rel) {
  return path.join(ROOT, rel);
}

function exists(rel) {
  return fs.existsSync(abs(rel));
}

function readJson(rel) {
  if (!exists(rel)) throw new Error(`Missing required input: ${rel}`);
  return JSON.parse(fs.readFileSync(abs(rel), "utf8"));
}

function readJsonl(rel) {
  if (!rel || !exists(rel)) return [];
  return fs.readFileSync(abs(rel), "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function writeJson(rel, value) {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, 2) + "\n");
}

function getAllNumbersByKey(x, key, out = []) {
  if (!x || typeof x !== "object") return out;
  if (Array.isArray(x)) {
    for (const item of x) getAllNumbersByKey(item, key, out);
    return out;
  }
  if (Object.prototype.hasOwnProperty.call(x, key)) {
    const n = Number(x[key]);
    if (Number.isFinite(n)) out.push(n);
  }
  for (const v of Object.values(x)) getAllNumbersByKey(v, key, out);
  return out;
}

function getMaxNumber(x, keys, fallback = 0) {
  const vals = [];
  for (const key of keys) vals.push(...getAllNumbersByKey(x, key));
  return vals.length ? Math.max(...vals) : fallback;
}

function slugSetFromAny(value, mode) {
  const out = new Set();

  function addFromArrayKey(obj, keys) {
    for (const key of keys) {
      const val = obj?.[key];
      if (Array.isArray(val)) {
        for (const slug of val) {
          if (typeof slug === "string" && /^[a-z]{3}\.\d+$/i.test(slug)) out.add(slug);
        }
      }
    }
  }

  function scan(x) {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) {
      for (const item of x) scan(item);
      return;
    }

    if (mode === "current_or_new") addFromArrayKey(x, ["currentOrNewSeasonSatisfiedSlugs", "currentOrNewSatisfiedSlugs", "acceptedCurrentOrNewSeasonSlugs"]);
    if (mode === "previous_completed") addFromArrayKey(x, ["previousCompletedSatisfiedSlugs", "acceptedPreviousCompletedSlugs", "verifiedPreviousCompletedSlugs"]);
    if (mode === "start_date") addFromArrayKey(x, ["acceptedStartDateEvidenceStateSlugs", "nextSeasonStartDateSatisfiedSlugs", "acceptedStartDateSlugs"]);

    const slug = x.competitionSlug || x.leagueSlug || x.slug || x.normalizedCompetitionSlug;
    const text = JSON.stringify(x);
    if (typeof slug === "string" && /^[a-z]{3}\.\d+$/i.test(slug)) {
      if (mode === "current_or_new" && (x.seasonScope === "current_or_new" || text.includes("current_or_new") || text.includes("currentOrNew"))) out.add(slug);
      if (mode === "previous_completed" && (x.seasonScope === "previous_completed" || text.includes("previous_completed") || text.includes("previousCompleted"))) out.add(slug);
      if (mode === "start_date" && (text.includes("nextSeasonStartDate") || text.includes("startDateEvidence"))) out.add(slug);
    }

    for (const v of Object.values(x)) scan(v);
  }

  scan(value);
  return out;
}

function groupBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const k = row[key];
    if (!out[k]) out[k] = [];
    out[k].push(row);
  }
  return out;
}

function rowsPathFromSummary(summary) {
  return summary.outputs?.rows ?? summary.rowsOutput ?? summary.outputRows ?? null;
}

const seasonLedger = readJson(SEASON_LEDGER);
const prioritized = exists(PRIORITIZED_BOARD) ? readJson(PRIORITIZED_BOARD) : null;

const baselineCurrentOrNewSlugs = slugSetFromAny(seasonLedger, "current_or_new");
const baselinePreviousCompletedSlugs = slugSetFromAny(seasonLedger, "previous_completed");
const baselineStartDateSlugs = slugSetFromAny(seasonLedger, "start_date");

const proofInputs = [];
const verifiedRows = [];
const blockedGroups = [];

for (const summaryPath of PROOF_SUMMARIES) {
  const summary = readJson(summaryPath);
  const rowsPath = rowsPathFromSummary(summary);
  const rows = readJsonl(rowsPath);
  const acceptedRowsBySlug = groupBy(rows, "competitionSlug");

  const validations = Array.isArray(summary.validations) ? summary.validations : [];
  const verifiedGroups = validations.filter(v => v.passed === true);
  const blocked = validations.filter(v => v.passed !== true);

  for (const group of blocked) {
    blockedGroups.push({
      familyId: summary.familyId ?? summary.runner ?? "unknown",
      competitionSlug: group.competitionSlug,
      seasonScope: group.seasonScope ?? "current_or_new",
      seasonLabel: group.seasonLabel ?? "2026",
      status: group.status,
      rowCount: group.rowCount,
      blocks: group.blocks ?? [],
      teamSignals: group.teamSignals ?? []
    });
  }

  const rowSlugs = Object.keys(acceptedRowsBySlug);
  for (const slug of rowSlugs) {
    const slugRows = acceptedRowsBySlug[slug];
    if (!slugRows.every(row => row.seasonScope === "current_or_new" && row.qualityGateStatus === "verified" && row.validationStatus === "passed")) {
      throw new Error(`Rows failed modern current_or_new verification contract for ${slug} in ${rowsPath}`);
    }
    verifiedRows.push(...slugRows);
  }

  proofInputs.push({
    summaryPath,
    rowsPath,
    familyId: summary.familyId ?? summary.runner ?? "unknown",
    status: summary.status,
    verifiedGroupCount: summary.summary?.verifiedGroupCount ?? summary.verifiedGroupCount ?? verifiedGroups.length,
    acceptedRowCount: summary.summary?.acceptedRowCount ?? summary.acceptedRowCount ?? rows.length,
    acceptedRowsByCompetition: summary.summary?.acceptedRowsByCompetition ?? summary.acceptedRowsByCompetition ?? Object.fromEntries(Object.entries(acceptedRowsBySlug).map(([slug, rs]) => [slug, rs.length])),
    verifiedSlugs: rowSlugs,
    blockedSlugs: blocked.map(v => v.competitionSlug)
  });
}

const verifiedBySlug = groupBy(verifiedRows, "competitionSlug");
const verifiedCurrentOrNewSlugs = Object.keys(verifiedBySlug).sort();
const newCurrentOrNewSlugs = verifiedCurrentOrNewSlugs.filter(slug => !baselineCurrentOrNewSlugs.has(slug));
const alreadyCurrentOrNewSlugs = verifiedCurrentOrNewSlugs.filter(slug => baselineCurrentOrNewSlugs.has(slug));

const expectedNewSlugs = ["nor.1", "swe.1", "swe.2"];
const blocks = [];

if (JSON.stringify(newCurrentOrNewSlugs) !== JSON.stringify(expectedNewSlugs)) {
  blocks.push(`new_current_or_new_slugs_${JSON.stringify(newCurrentOrNewSlugs)}_expected_${JSON.stringify(expectedNewSlugs)}`);
}

const rowsByCompetition = Object.fromEntries(Object.entries(verifiedBySlug).map(([slug, rows]) => [slug, rows.length]));
if (rowsByCompetition["swe.1"] !== 16) blocks.push("swe.1_rows_not_16");
if (rowsByCompetition["swe.2"] !== 16) blocks.push("swe.2_rows_not_16");
if (rowsByCompetition["nor.1"] !== 16) blocks.push("nor.1_rows_not_16");
if (rowsByCompetition["nor.2"]) blocks.push("nor.2_must_not_be_accepted_without_point_deduction_evidence");

const baseline = {
  currentOrNewSatisfiedCount: getMaxNumber(seasonLedger, ["currentOrNewSeasonSatisfiedCount", "currentOrNewSatisfiedCount"], baselineCurrentOrNewSlugs.size),
  currentOrNewVerifiedRowsCount: getMaxNumber(seasonLedger, ["currentOrNewSeasonVerifiedRowsCount", "currentOrNewVerifiedRowsCount"], 0),
  previousCompletedSatisfiedCount: getMaxNumber(seasonLedger, ["previousCompletedSatisfiedCount"], baselinePreviousCompletedSlugs.size),
  previousCompletedVerifiedRowsCount: getMaxNumber(seasonLedger, ["previousCompletedVerifiedRowsCount"], 0),
  nextSeasonStartDateSatisfiedCount: getMaxNumber(seasonLedger, ["nextSeasonStartDateSatisfiedCount"], baselineStartDateSlugs.size),
  prioritizedAcceptedExecutableTaskCount: getMaxNumber(prioritized, ["acceptedExecutableTaskCount"], 0),
  prioritizedStandingsExpansionTargetCount: getMaxNumber(prioritized, ["standingsExpansionTargetCount"], 0),
  prioritizedStartDateEvidenceTargetCount: getMaxNumber(prioritized, ["startDateEvidenceTargetCount"], 0)
};

if (baseline.previousCompletedSatisfiedCount !== 11) blocks.push(`baseline_previous_completed_${baseline.previousCompletedSatisfiedCount}_expected_11`);
if (baseline.previousCompletedVerifiedRowsCount !== 180) blocks.push(`baseline_previous_completed_rows_${baseline.previousCompletedVerifiedRowsCount}_expected_180`);
if (baseline.nextSeasonStartDateSatisfiedCount !== 2) blocks.push(`baseline_start_dates_${baseline.nextSeasonStartDateSatisfiedCount}_expected_2`);

const addedRows = newCurrentOrNewSlugs.reduce((sum, slug) => sum + (verifiedBySlug[slug]?.length ?? 0), 0);

const impact = {
  wouldAddCurrentOrNewSatisfiedCount: newCurrentOrNewSlugs.length,
  wouldAddCurrentOrNewVerifiedRowsCount: addedRows,
  projectedCurrentOrNewSatisfiedCount: baseline.currentOrNewSatisfiedCount + newCurrentOrNewSlugs.length,
  projectedCurrentOrNewVerifiedRowsCount: baseline.currentOrNewVerifiedRowsCount + addedRows,
  previousCompletedSatisfiedCountUnchanged: baseline.previousCompletedSatisfiedCount,
  previousCompletedVerifiedRowsCountUnchanged: baseline.previousCompletedVerifiedRowsCount,
  nextSeasonStartDateSatisfiedCountUnchanged: baseline.nextSeasonStartDateSatisfiedCount
};

const board = {
  status: blocks.length ? "blocked" : "passed",
  runner: "modern_current_or_new_proof_coverage_board",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "aggregate all modern current_or_new proof rows and measure lifecycle impact without canonical writes, production writes, truth assertions, or state-lane materialization",
  inputs: {
    proofSummaries: PROOF_SUMMARIES,
    seasonLedger: SEASON_LEDGER,
    prioritizedBoard: PRIORITIZED_BOARD
  },
  proofInputs,
  baseline,
  verifiedCurrentOrNewSlugs,
  newCurrentOrNewSlugs,
  alreadyCurrentOrNewSlugs,
  rowsByCompetition,
  blockedGroups,
  impact,
  recommendation: blocks.length
    ? "repair_modern_current_or_new_proofs_before_materialization_gate"
    : "build_aggregate_current_or_new_materialization_approval_gate_for_new_verified_modern_rows",
  policy: {
    proofOnly: true,
    canonicalOrTruthPromotionAllowedNow: false,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  blocks,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, board);

console.log(JSON.stringify({
  status: board.status,
  verifiedCurrentOrNewSlugs,
  newCurrentOrNewSlugs,
  alreadyCurrentOrNewSlugs,
  rowsByCompetition,
  blockedGroups,
  baseline,
  impact,
  recommendation: board.recommendation,
  output: OUT,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (board.status !== "passed") {
  process.exit(1);
}
