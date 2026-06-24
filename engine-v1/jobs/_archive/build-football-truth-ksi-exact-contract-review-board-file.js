import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/ksi-exact-contract-review-board-${DATE}`;
const OUT = `${OUT_DIR}/ksi-exact-contract-review-board-${DATE}.json`;

const INPUTS = {
  blockedDiscoveryBoard: `data/football-truth/_diagnostics/blocked-family-source-contract-discovery-board-${DATE}/blocked-family-source-contract-discovery-board-${DATE}.json`,
  concurrentTableSchemaReview: "data/football-truth/_diagnostics/concurrent-table-schema-review-2026-06-18/concurrent-table-schema-review-2026-06-18.json",
  tableSeasonScopeAdjudication: "data/football-truth/_diagnostics/table-season-scope-adjudication-2026-06-18/table-season-scope-adjudication-2026-06-18.json"
};

const FAMILY = {
  familyId: "ksi",
  competitionSlugs: ["isl.1", "isl.2"],
  acceptedHosts: ["ksi.is", "www.ksi.is"],
  routeSignals: ["ksi.is", "besta", "deild", "deildin", "úrvalsdeild", "1. deild", "pepsideild", "standings", "tables", "mót", "tafla"],
  requiredBeforeProof: [
    "exact_source_url_per_slug",
    "route_identity_gate",
    "seasonScope_and_seasonLabel",
    "expectedRowCount",
    "expectedTeamSignals",
    "w_d_l_points_arithmetic_gate",
    "non_trivial_current_or_new_or_previous_completed_gate",
    "duplicate_signature_gate",
    "no_canonical_or_truth_writes"
  ]
};

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

function writeJson(relPath, value) {
  fs.mkdirSync(path.dirname(abs(relPath)), { recursive: true });
  fs.writeFileSync(abs(relPath), JSON.stringify(value, null, 2) + "\n");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function n(v) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}

function getAtPointer(root, pointer) {
  let cur = root;
  const parts = pointer.replace(/^root\.?/, "").split(".").filter(Boolean);
  for (const part of parts) {
    const re = /^([^\[]+)(?:\[(\d+)\])?$/;
    const m = part.match(re);
    if (!m) return undefined;
    cur = cur?.[m[1]];
    if (m[2] !== undefined) cur = cur?.[Number(m[2])];
  }
  return cur;
}

function findContextForArray(root, pointer) {
  const base = pointer.split(".").slice(0, -1).join(".");
  const ctx = getAtPointer(root, base);
  return ctx && typeof ctx === "object" ? ctx : {};
}

function flattenArrays(x, pointer = "root", out = [], depth = 0) {
  if (!x || typeof x !== "object" || depth > 9) return out;
  if (Array.isArray(x)) {
    if (x.length >= 8 && x[0] && typeof x[0] === "object") {
      out.push({ pointer, length: x.length, keys: Object.keys(x[0]).slice(0, 80), sample: x[0] });
    }
    x.slice(0, 4).forEach((v, i) => flattenArrays(v, `${pointer}[${i}]`, out, depth + 1));
    return out;
  }
  for (const [k, v] of Object.entries(x)) flattenArrays(v, `${pointer}.${k}`, out, depth + 1);
  return out;
}

function extractText(x, limit = 20000) {
  try {
    return JSON.stringify(x).slice(0, limit);
  } catch {
    return "";
  }
}

function textHasKsiIdentity(text) {
  const lower = text.toLowerCase();
  return FAMILY.competitionSlugs.some(slug => lower.includes(slug)) ||
    lower.includes("ksi.is") ||
    lower.includes("ksí") ||
    lower.includes("iceland") ||
    lower.includes("besta") ||
    lower.includes("deild");
}

function rowStandingScore(row, keys = Object.keys(row ?? {})) {
  const lowerKeys = keys.map(k => String(k).toLowerCase());
  const text = extractText(row, 4000).toLowerCase();
  let score = 0;

  for (const key of ["competitionslug", "leagueslug", "slug", "sourceurl", "url"]) {
    if (lowerKeys.includes(key)) score += 10;
  }
  for (const key of ["teamname", "team", "name"]) {
    if (lowerKeys.includes(key)) score += 12;
  }
  for (const key of ["position", "rank", "pos"]) {
    if (lowerKeys.includes(key)) score += 12;
  }
  for (const key of ["played", "matchesplayed", "p", "mp"]) {
    if (lowerKeys.includes(key)) score += 12;
  }
  for (const key of ["won", "wins", "w"]) {
    if (lowerKeys.includes(key)) score += 8;
  }
  for (const key of ["drawn", "draws", "d"]) {
    if (lowerKeys.includes(key)) score += 8;
  }
  for (const key of ["lost", "losses", "l"]) {
    if (lowerKeys.includes(key)) score += 8;
  }
  for (const key of ["points", "pts", "stig"]) {
    if (lowerKeys.includes(key)) score += 12;
  }
  if (text.includes("isl.1") || text.includes("isl.2")) score += 25;
  if (text.includes("ksi.is")) score += 25;
  if (text.includes("besta") || text.includes("deild")) score += 15;
  return score;
}

function candidateScore(array, context, file) {
  const sampleScore = rowStandingScore(array.sample, array.keys);
  const text = `${file}\n${array.pointer}\n${extractText(context, 10000)}\n${extractText(array.sample, 5000)}`.toLowerCase();
  let score = sampleScore;
  if (text.includes("isl.1") || text.includes("isl.2")) score += 40;
  if (text.includes("ksi.is")) score += 40;
  if (text.includes("besta") || text.includes("deild")) score += 20;
  if (text.includes("jpn.") || text.includes("denmark") || text.includes("superliga.dk") || text.includes("laliga") || text.includes("bundesliga")) score -= 80;
  if (!textHasKsiIdentity(text)) score -= 60;
  return score;
}

function inferRowsShape(rows) {
  const keys = Object.keys(rows[0] ?? {});
  const lowerMap = Object.fromEntries(keys.map(k => [k.toLowerCase(), k]));

  function key(...names) {
    for (const name of names) {
      if (lowerMap[name.toLowerCase()]) return lowerMap[name.toLowerCase()];
    }
    return null;
  }

  const mapping = {
    competitionSlug: key("competitionSlug", "leagueSlug", "slug"),
    sourceUrl: key("sourceUrl", "url", "finalUrl", "candidateUrl"),
    teamName: key("teamName", "team", "name"),
    position: key("position", "rank", "pos"),
    played: key("played", "matchesPlayed", "mp", "p"),
    won: key("won", "wins", "w"),
    drawn: key("drawn", "draws", "d"),
    lost: key("lost", "losses", "l"),
    goalsFor: key("goalsFor", "gf"),
    goalsAgainst: key("goalsAgainst", "ga"),
    goalDifference: key("goalDifference", "goalDiff", "gd"),
    points: key("points", "pts", "stig")
  };

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  return { keys, mapping, mappedCount };
}

function normalizeWithMapping(rows, mapping) {
  return rows.map(row => ({
    competitionSlug: mapping.competitionSlug ? row[mapping.competitionSlug] : null,
    sourceUrl: mapping.sourceUrl ? row[mapping.sourceUrl] : null,
    teamName: mapping.teamName ? String(row[mapping.teamName] ?? "").trim() : null,
    position: mapping.position ? n(row[mapping.position]) : null,
    played: mapping.played ? n(row[mapping.played]) : null,
    won: mapping.won ? n(row[mapping.won]) : null,
    drawn: mapping.drawn ? n(row[mapping.drawn]) : null,
    lost: mapping.lost ? n(row[mapping.lost]) : null,
    goalsFor: mapping.goalsFor ? n(row[mapping.goalsFor]) : null,
    goalsAgainst: mapping.goalsAgainst ? n(row[mapping.goalsAgainst]) : null,
    goalDifference: mapping.goalDifference ? n(row[mapping.goalDifference]) : null,
    points: mapping.points ? n(row[mapping.points]) : null,
    raw: row
  }));
}

function validateArithmetic(normalizedRows) {
  const blocks = [];
  let validRows = 0;
  let arithmeticRows = 0;
  let totalPlayed = 0;
  let totalPoints = 0;

  for (const row of normalizedRows) {
    if (!row.teamName || row.position === null || row.played === null || row.points === null) continue;
    validRows += 1;
    totalPlayed += row.played;
    totalPoints += row.points;

    if (row.won !== null && row.drawn !== null && row.lost !== null) {
      if (row.played !== row.won + row.drawn + row.lost) blocks.push(`${row.teamName}_wdl_failed`);
      if (row.points !== row.won * 3 + row.drawn) blocks.push(`${row.teamName}_points_failed`);
      arithmeticRows += 1;
    }
    if (row.goalsFor !== null && row.goalsAgainst !== null && row.goalDifference !== null) {
      if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`${row.teamName}_gd_failed`);
    }
  }

  return {
    validRows,
    arithmeticRows,
    totalPlayed,
    totalPoints,
    blocks: Array.from(new Set(blocks)).slice(0, 40)
  };
}

const discovery = readJson(INPUTS.blockedDiscoveryBoard);
const ksiDiscovery = (discovery.familyBoards ?? []).find(x => x.familyId === "ksi");
if (!ksiDiscovery) throw new Error("KSI family missing from blocked discovery board");

const sourceFiles = [
  INPUTS.concurrentTableSchemaReview,
  INPUTS.tableSeasonScopeAdjudication
].filter(exists);

const reviewedCandidates = [];

for (const file of sourceFiles) {
  const json = readJson(file);
  for (const arr of flattenArrays(json)) {
    const rows = getAtPointer(json, arr.pointer);
    if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== "object") continue;
    const context = findContextForArray(json, arr.pointer);
    const score = candidateScore(arr, context, file);
    if (score < 80) continue;

    const shape = inferRowsShape(rows);
    const normalized = normalizeWithMapping(rows, shape.mapping);
    const arithmetic = validateArithmetic(normalized);
    const contextText = extractText(context, 12000);
    const rowText = extractText(rows.slice(0, 3), 12000);
    const allText = `${file}\n${arr.pointer}\n${contextText}\n${rowText}`;

    const routeIdentitySignals = {
      hasKsiHost: /ksi\.is/i.test(allText),
      hasIsl1: /isl\.1/i.test(allText),
      hasIsl2: /isl\.2/i.test(allText),
      hasIcelandSignal: /iceland|ísland|besta|deild|ksí/i.test(allText),
      hasOtherLeagueContamination: /jpn\.|den\.1|superliga\.dk|laliga|bundesliga|eredivisie/i.test(allText)
    };

    const candidateStatus =
      routeIdentitySignals.hasOtherLeagueContamination ? "rejected_route_contamination" :
      !routeIdentitySignals.hasKsiHost && !routeIdentitySignals.hasIsl1 && !routeIdentitySignals.hasIsl2 ? "review_missing_exact_route_identity" :
      shape.mappedCount < 8 ? "review_incomplete_row_mapping" :
      arithmetic.blocks.length ? "review_arithmetic_blocks" :
      arithmetic.validRows >= 10 && arithmetic.totalPlayed > 0 && arithmetic.totalPoints > 0 ? "candidate_exact_contract_review" :
      "review_non_triviality_or_row_count";

    reviewedCandidates.push({
      file,
      pointer: arr.pointer,
      length: arr.length,
      score,
      keys: arr.keys,
      shape,
      arithmetic,
      routeIdentitySignals,
      candidateStatus,
      contextPreview: contextText.slice(0, 800),
      sampleRowsPreview: rows.slice(0, 3),
      signature: sha256Text(JSON.stringify(rows.slice(0, 30))).slice(0, 24)
    });
  }
}

reviewedCandidates.sort((a, b) => {
  const rank = s => ({
    candidate_exact_contract_review: 5,
    review_arithmetic_blocks: 4,
    review_incomplete_row_mapping: 3,
    review_missing_exact_route_identity: 2,
    review_non_triviality_or_row_count: 1,
    rejected_route_contamination: 0
  }[s] ?? 0);
  return rank(b.candidateStatus) - rank(a.candidateStatus) || b.score - a.score || b.length - a.length;
});

const acceptedCandidates = reviewedCandidates.filter(c => c.candidateStatus === "candidate_exact_contract_review");
const reviewCandidates = reviewedCandidates.filter(c => c.candidateStatus.startsWith("review_"));
const rejectedCandidates = reviewedCandidates.filter(c => c.candidateStatus.startsWith("rejected_"));

const blocks = [];
const warnings = [];

if (ksiDiscovery.recommendedStatus !== "contract_discovery_candidate_from_existing_artifacts") {
  warnings.push(`discovery_status_${ksiDiscovery.recommendedStatus}`);
}
if (acceptedCandidates.length === 0) {
  warnings.push("no_fully_accepted_ksi_contract_candidate_from_existing_review_artifacts");
}
if (reviewedCandidates.length === 0) {
  blocks.push("no_ksi_candidates_reviewed");
}

const board = {
  status: blocks.length ? "blocked" : "passed",
  runner: "ksi_exact_contract_review_board",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "family-specific review of KSI/Iceland existing standings-shaped artifacts; identify whether a modern proof contract can be built without borrowed runners or direct promotion",
  family: FAMILY,
  inputs: INPUTS,
  discoverySummary: {
    matchedFileCount: ksiDiscovery.matchedFileCount,
    standingArrayCandidateCount: ksiDiscovery.standingArrayCandidateCount,
    sourceFileCandidateCount: ksiDiscovery.sourceFileCandidateCount,
    exactRunnerCandidateCount: ksiDiscovery.exactRunnerCandidateCount,
    hasModernSafeRunner: ksiDiscovery.hasModernSafeRunner,
    recommendedStatus: ksiDiscovery.recommendedStatus
  },
  reviewedCandidateCount: reviewedCandidates.length,
  acceptedCandidateCount: acceptedCandidates.length,
  reviewCandidateCount: reviewCandidates.length,
  rejectedCandidateCount: rejectedCandidates.length,
  acceptedCandidates: acceptedCandidates.slice(0, 10),
  reviewCandidates: reviewCandidates.slice(0, 15),
  rejectedCandidates: rejectedCandidates.slice(0, 10).map(c => ({
    file: c.file,
    pointer: c.pointer,
    length: c.length,
    score: c.score,
    candidateStatus: c.candidateStatus,
    routeIdentitySignals: c.routeIdentitySignals,
    signature: c.signature
  })),
  nextRecommendedLane: acceptedCandidates.length
    ? {
        lane: "build_ksi_modern_proof_contract_from_accepted_candidate",
        candidateFile: acceptedCandidates[0].file,
        candidatePointer: acceptedCandidates[0].pointer,
        requiredManualGuard: "verify exact sourceUrl/seasonScope/seasonLabel and expected team signals before proof runner"
      }
    : {
        lane: "route_identity_repair_before_ksi_modern_proof",
        reason: "Existing arrays are standings-shaped but no candidate has full exact KSI route identity plus complete row mapping and arithmetic acceptance.",
        nextStep: "inspect top review candidates and source context, then build route identity discovery if still ambiguous"
      },
  policy: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0,
    proofOnly: true
  },
  blocks,
  warnings,
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
  familyId: FAMILY.familyId,
  reviewedCandidateCount: board.reviewedCandidateCount,
  acceptedCandidateCount: board.acceptedCandidateCount,
  reviewCandidateCount: board.reviewCandidateCount,
  rejectedCandidateCount: board.rejectedCandidateCount,
  topAccepted: board.acceptedCandidates.slice(0, 3).map(c => ({
    file: c.file,
    pointer: c.pointer,
    length: c.length,
    score: c.score,
    status: c.candidateStatus,
    routeIdentitySignals: c.routeIdentitySignals,
    arithmetic: c.arithmetic,
    mapping: c.shape.mapping
  })),
  topReview: board.reviewCandidates.slice(0, 5).map(c => ({
    file: c.file,
    pointer: c.pointer,
    length: c.length,
    score: c.score,
    status: c.candidateStatus,
    routeIdentitySignals: c.routeIdentitySignals,
    arithmetic: c.arithmetic,
    mapping: c.shape.mapping
  })),
  nextRecommendedLane: board.nextRecommendedLane,
  blocks,
  warnings,
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
