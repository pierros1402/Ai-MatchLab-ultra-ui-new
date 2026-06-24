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

function exists(rel) {
  return fs.existsSync(abs(rel));
}

function readJson(rel) {
  if (!exists(rel)) return null;
  return JSON.parse(fs.readFileSync(abs(rel), "utf8"));
}

function readJsonl(rel) {
  if (!exists(rel)) return [];
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
    if (ent.isDirectory()) {
      walk(child, out);
    } else if (/\.json$/i.test(ent.name)) {
      out.push(child);
    }
  }
  return out;
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

    if (mode === "current_or_new") {
      addFromArrayKey(x, ["currentOrNewSeasonSatisfiedSlugs", "currentOrNewSatisfiedSlugs", "acceptedCurrentOrNewSeasonSlugs"]);
    }
    if (mode === "previous_completed") {
      addFromArrayKey(x, ["previousCompletedSatisfiedSlugs", "acceptedPreviousCompletedSlugs", "verifiedPreviousCompletedSlugs"]);
    }
    if (mode === "start_date") {
      addFromArrayKey(x, ["acceptedStartDateEvidenceStateSlugs", "nextSeasonStartDateSatisfiedSlugs", "acceptedStartDateSlugs"]);
    }

    const slug = x.competitionSlug || x.leagueSlug || x.slug || x.normalizedCompetitionSlug;
    const txt = JSON.stringify(x);
    if (typeof slug === "string" && /^[a-z]{3}\.\d+$/i.test(slug)) {
      if (mode === "current_or_new" && (x.seasonScope === "current_or_new" || txt.includes("current_or_new") || txt.includes("currentOrNew"))) out.add(slug);
      if (mode === "previous_completed" && (x.seasonScope === "previous_completed" || txt.includes("previous_completed") || txt.includes("previousCompleted"))) out.add(slug);
      if (mode === "start_date" && (txt.includes("nextSeasonStartDate") || txt.includes("startDateEvidence"))) out.add(slug);
    }

    for (const v of Object.values(x)) scan(v);
  }

  scan(value);
  return out;
}

function chooseBestJsonFile(kind) {
  const files = walk("data/football-truth/_diagnostics")
    .filter(rel => {
      const name = rel.toLowerCase();
      if (kind === "season") return name.includes("season-lane-coverage-ledger");
      if (kind === "lifecycle") return name.includes("permanent-lifecycle");
      if (kind === "prioritized") return name.includes("prioritized") && name.includes("lifecycle");
      return false;
    })
    .map(rel => {
      try {
        const stat = fs.statSync(abs(rel));
        if (stat.size > 4_000_000) return null;
        const json = readJson(rel);
        if (!json) return null;
        let score = 0;
        if (kind === "season") {
          score += getAllNumbersByKey(json, "previousCompletedSatisfiedCount").length ? 50 : 0;
          score += getAllNumbersByKey(json, "currentOrNewSeasonSatisfiedCount").length ? 50 : 0;
          score += getAllNumbersByKey(json, "nextSeasonStartDateSatisfiedCount").length ? 50 : 0;
        }
        if (kind === "lifecycle") {
          score += getAllNumbersByKey(json, "permanentDueTaskCount").length ? 50 : 0;
          score += getAllNumbersByKey(json, "duePreviousCompletedStandingsCount").length ? 50 : 0;
        }
        if (kind === "prioritized") {
          score += getAllNumbersByKey(json, "acceptedExecutableTaskCount").length ? 50 : 0;
          score += getAllNumbersByKey(json, "standingsExpansionTargetCount").length ? 50 : 0;
        }
        return { rel, json, score, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || b.mtime - a.mtime);

  return files[0] ?? null;
}

const sportSummary = readJson(MODERN_SPORTOMEDIA_SUMMARY);
const sportRows = readJsonl(MODERN_SPORTOMEDIA_ROWS);

if (!sportSummary || sportSummary.status !== "passed_verified_current_or_new_diagnostic_only") {
  throw new Error(`Modern Sportomedia proof summary missing or not passed: ${MODERN_SPORTOMEDIA_SUMMARY}`);
}
if (sportRows.length !== 32) {
  throw new Error(`Expected 32 modern Sportomedia rows, got ${sportRows.length}`);
}

const seasonCandidate = chooseBestJsonFile("season");
const lifecycleCandidate = chooseBestJsonFile("lifecycle");
const prioritizedCandidate = chooseBestJsonFile("prioritized");

const seasonLedger = seasonCandidate?.json ?? null;
const lifecycle = lifecycleCandidate?.json ?? null;
const prioritizedBoard = prioritizedCandidate?.json ?? null;

const currentOrNewSet = seasonLedger ? slugSetFromAny(seasonLedger, "current_or_new") : new Set();
const previousCompletedSet = seasonLedger ? slugSetFromAny(seasonLedger, "previous_completed") : new Set();
const startDateSet = seasonLedger ? slugSetFromAny(seasonLedger, "start_date") : new Set();

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

const newCurrentOrNewSlugs = modernVerifiedCurrentOrNewSlugs.filter(slug => !currentOrNewSet.has(slug));
const alreadyCurrentOrNewSlugs = modernVerifiedCurrentOrNewSlugs.filter(slug => currentOrNewSet.has(slug));

const baseline = {
  seasonLedgerCurrentOrNewSatisfiedCount: getMaxNumber(seasonLedger, ["currentOrNewSeasonSatisfiedCount", "currentOrNewSatisfiedCount"], currentOrNewSet.size),
  seasonLedgerCurrentOrNewVerifiedRowsCount: getMaxNumber(seasonLedger, ["currentOrNewSeasonVerifiedRowsCount", "currentOrNewVerifiedRowsCount"], 0),
  seasonLedgerPreviousCompletedSatisfiedCount: getMaxNumber(seasonLedger, ["previousCompletedSatisfiedCount"], previousCompletedSet.size),
  seasonLedgerPreviousCompletedVerifiedRowsCount: getMaxNumber(seasonLedger, ["previousCompletedVerifiedRowsCount"], 0),
  seasonLedgerNextSeasonStartDateSatisfiedCount: getMaxNumber(seasonLedger, ["nextSeasonStartDateSatisfiedCount"], startDateSet.size),
  lifecyclePermanentDueTaskCount: getMaxNumber(lifecycle, ["permanentDueTaskCount"], 0),
  lifecycleDuePreviousCompletedStandingsCount: getMaxNumber(lifecycle, ["duePreviousCompletedStandingsCount"], 0),
  lifecycleDueNextSeasonStartDateCount: getMaxNumber(lifecycle, ["dueNextSeasonStartDateCount"], 0),
  prioritizedAcceptedExecutableTaskCount: getMaxNumber(prioritizedBoard, ["acceptedExecutableTaskCount"], 0),
  prioritizedStandingsExpansionTargetCount: getMaxNumber(prioritizedBoard, ["standingsExpansionTargetCount"], 0),
  prioritizedStartDateEvidenceTargetCount: getMaxNumber(prioritizedBoard, ["startDateEvidenceTargetCount"], 0)
};

const wouldAddRows = newCurrentOrNewSlugs.reduce((sum, slug) => sum + modernRowsBySlug[slug].length, 0);

const impact = {
  wouldAddCurrentOrNewSatisfiedCount: newCurrentOrNewSlugs.length,
  wouldAddCurrentOrNewVerifiedRowsCount: wouldAddRows,
  projectedCurrentOrNewSatisfiedCount: baseline.seasonLedgerCurrentOrNewSatisfiedCount + newCurrentOrNewSlugs.length,
  projectedCurrentOrNewVerifiedRowsCount: baseline.seasonLedgerCurrentOrNewVerifiedRowsCount + wouldAddRows,
  previousCompletedSatisfiedCountUnchanged: baseline.seasonLedgerPreviousCompletedSatisfiedCount,
  previousCompletedVerifiedRowsCountUnchanged: baseline.seasonLedgerPreviousCompletedVerifiedRowsCount,
  nextSeasonStartDateSatisfiedCountUnchanged: baseline.seasonLedgerNextSeasonStartDateSatisfiedCount
};

const board = {
  status: "passed",
  runner: "modern_family_proof_coverage_impact_board",
  contractVersion: 2,
  purpose: "measure diagnostic-only lifecycle impact of modern family proof rows with robust baseline discovery; no canonical writes, production writes, or truth assertions",
  generatedAtUtc: new Date().toISOString(),
  inputs: {
    modernSportomediaSummary: MODERN_SPORTOMEDIA_SUMMARY,
    modernSportomediaRows: MODERN_SPORTOMEDIA_ROWS,
    latestSeasonLedgerPath: seasonCandidate?.rel ?? null,
    latestLifecyclePath: lifecycleCandidate?.rel ?? null,
    latestPrioritizedBoardPath: prioritizedCandidate?.rel ?? null
  },
  baselineDiscovery: {
    seasonCandidateScore: seasonCandidate?.score ?? 0,
    lifecycleCandidateScore: lifecycleCandidate?.score ?? 0,
    prioritizedCandidateScore: prioritizedCandidate?.score ?? 0,
    currentOrNewSlugSetSize: currentOrNewSet.size,
    previousCompletedSlugSetSize: previousCompletedSet.size,
    startDateSlugSetSize: startDateSet.size
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
  baseline,
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

if (baseline.seasonLedgerPreviousCompletedSatisfiedCount < 11) {
  board.status = "blocked_baseline_discovery_failed";
  board.recommendation = "repair_baseline_discovery_before_materialization_gate";
}

writeJson(OUT, board);

console.log(JSON.stringify({
  status: board.status,
  inputs: board.inputs,
  baseline,
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

if (board.status !== "passed") {
  process.exit(1);
}
