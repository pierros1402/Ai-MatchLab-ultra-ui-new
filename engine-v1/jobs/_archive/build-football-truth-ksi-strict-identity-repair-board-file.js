import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/ksi-strict-identity-repair-board-${DATE}`;
const OUT = `${OUT_DIR}/ksi-strict-identity-repair-board-${DATE}.json`;

const INPUTS = {
  ksiExactReview: `data/football-truth/_diagnostics/ksi-exact-contract-review-board-${DATE}/ksi-exact-contract-review-board-${DATE}.json`,
  tableSeasonScopeAdjudication: "data/football-truth/_diagnostics/table-season-scope-adjudication-2026-06-18/table-season-scope-adjudication-2026-06-18.json",
  concurrentTableSchemaReview: "data/football-truth/_diagnostics/concurrent-table-schema-review-2026-06-18/concurrent-table-schema-review-2026-06-18.json"
};

const EXACT = {
  familyId: "ksi",
  acceptedCompetitionSlugs: ["isl.1", "isl.2"],
  acceptedHosts: ["ksi.is", "www.ksi.is"],
  requiredRouteIdentity: "candidate must have row/context competitionSlug in isl.1/isl.2 OR sourceUrl/finalUrl host ksi.is/www.ksi.is; Iceland text alone is insufficient"
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

function getAtPointer(root, pointer) {
  let cur = root;
  const trimmed = pointer.replace(/^root\.?/, "");
  if (!trimmed) return cur;
  const parts = trimmed.split(".").filter(Boolean);
  for (const part of parts) {
    const re = /^([^\[]+)(?:\[(\d+)\])?$/;
    const m = part.match(re);
    if (!m) return undefined;
    cur = cur?.[m[1]];
    if (m[2] !== undefined) cur = cur?.[Number(m[2])];
  }
  return cur;
}

function getContext(root, pointer) {
  const parentPointer = pointer.split(".").slice(0, -1).join(".");
  const ctx = getAtPointer(root, parentPointer);
  return ctx && typeof ctx === "object" ? ctx : {};
}

function hostFromUrl(value) {
  try {
    return new URL(String(value)).host.toLowerCase();
  } catch {
    return "";
  }
}

function collectDeepValues(x, keysWanted, out = [], depth = 0) {
  if (!x || typeof x !== "object" || depth > 8) return out;
  if (Array.isArray(x)) {
    for (const v of x.slice(0, 40)) collectDeepValues(v, keysWanted, out, depth + 1);
    return out;
  }
  for (const [k, v] of Object.entries(x)) {
    if (keysWanted.includes(k) && (typeof v === "string" || typeof v === "number")) {
      out.push({ key: k, value: String(v) });
    }
    collectDeepValues(v, keysWanted, out, depth + 1);
  }
  return out;
}

function uniqueValues(values) {
  return [...new Set(values.filter(v => v !== null && v !== undefined && String(v).trim() !== "").map(v => String(v).trim()))].sort();
}

function routeIdentityFrom(rows, context, candidate) {
  const sampleRows = rows.slice(0, 25);
  const deep = collectDeepValues({ sampleRows, context }, [
    "competitionSlug", "leagueSlug", "slug", "sourceUrl", "finalUrl", "candidateUrl", "url", "host", "hostname", "competition", "league", "leagueLabel", "sourceHost"
  ]);

  const competitionSlugValues = uniqueValues(deep.filter(x => /competitionSlug|leagueSlug|slug/.test(x.key)).map(x => x.value));
  const urlValues = uniqueValues(deep.filter(x => /sourceUrl|finalUrl|candidateUrl|url/.test(x.key)).map(x => x.value));
  const hostValues = uniqueValues([
    ...deep.filter(x => /host|hostname|sourceHost/.test(x.key)).map(x => x.value),
    ...urlValues.map(hostFromUrl).filter(Boolean)
  ]);
  const leagueValues = uniqueValues(deep.filter(x => /competition|league|leagueLabel/.test(x.key)).map(x => x.value));

  const exactSlugMatches = competitionSlugValues.filter(v => EXACT.acceptedCompetitionSlugs.includes(v));
  const exactHostMatches = hostValues.filter(v => EXACT.acceptedHosts.includes(v.toLowerCase()));
  const text = JSON.stringify({ sampleRows, context, candidate }).toLowerCase();

  const contaminationSlugs = competitionSlugValues.filter(v => /^[a-z]{3}\.\d+$/.test(v) && !EXACT.acceptedCompetitionSlugs.includes(v));
  const contaminationHosts = hostValues.filter(v => {
    const h = v.toLowerCase();
    return h && !EXACT.acceptedHosts.includes(h) && /(eliteserien|obos-ligaen|jleague|superliga\.dk|laliga|bundesliga|eredivisie|hnl|spfl|dfb|allsvenskan|superettan)/.test(h);
  });

  return {
    competitionSlugValues,
    urlValues: urlValues.slice(0, 20),
    hostValues,
    leagueValues,
    exactSlugMatches,
    exactHostMatches,
    contaminationSlugs,
    contaminationHosts,
    hasIcelandTextOnly: /iceland|ísland|besta|deild|ksí|ksi/i.test(text) && exactSlugMatches.length === 0 && exactHostMatches.length === 0,
    exactIdentityPassed: exactSlugMatches.length > 0 || exactHostMatches.length > 0
  };
}

function n(v) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}

function validateCandidateRows(rows, mapping) {
  const blocks = [];
  let validRows = 0;
  let arithmeticRows = 0;
  let totalPlayed = 0;
  let totalPoints = 0;
  let maxPlayed = 0;
  let maxPoints = 0;

  const teamNames = [];

  for (const raw of rows) {
    const teamName = mapping.teamName ? String(raw[mapping.teamName] ?? "").trim() : "";
    const position = mapping.position ? n(raw[mapping.position]) : null;
    const played = mapping.played ? n(raw[mapping.played]) : null;
    const won = mapping.won ? n(raw[mapping.won]) : null;
    const drawn = mapping.drawn ? n(raw[mapping.drawn]) : null;
    const lost = mapping.lost ? n(raw[mapping.lost]) : null;
    const goalsFor = mapping.goalsFor ? n(raw[mapping.goalsFor]) : null;
    const goalsAgainst = mapping.goalsAgainst ? n(raw[mapping.goalsAgainst]) : null;
    const goalDifference = mapping.goalDifference ? n(raw[mapping.goalDifference]) : null;
    const points = mapping.points ? n(raw[mapping.points]) : null;

    if (!teamName || position === null || played === null || points === null) continue;

    validRows += 1;
    teamNames.push(teamName);
    totalPlayed += played;
    totalPoints += points;
    maxPlayed = Math.max(maxPlayed, played);
    maxPoints = Math.max(maxPoints, points);

    if (won !== null && drawn !== null && lost !== null) {
      arithmeticRows += 1;
      if (played !== won + drawn + lost) blocks.push(`${teamName}_wdl_failed`);
      if (points !== won * 3 + drawn) blocks.push(`${teamName}_points_failed`);
    }
    if (goalsFor !== null && goalsAgainst !== null && goalDifference !== null && goalDifference !== goalsFor - goalsAgainst) {
      blocks.push(`${teamName}_gd_failed`);
    }
  }

  return {
    validRows,
    arithmeticRows,
    totalPlayed,
    totalPoints,
    maxPlayed,
    maxPoints,
    teamSignals: teamNames.slice(0, 8),
    blocks: Array.from(new Set(blocks)).slice(0, 60)
  };
}

const review = readJson(INPUTS.ksiExactReview);
const sourceCache = new Map();

function sourceJson(file) {
  if (!sourceCache.has(file)) sourceCache.set(file, readJson(file));
  return sourceCache.get(file);
}

const allReviewCandidates = [
  ...(review.acceptedCandidates ?? []),
  ...(review.reviewCandidates ?? [])
];

const strictCandidates = [];

for (const candidate of allReviewCandidates) {
  const json = sourceJson(candidate.file);
  const rows = getAtPointer(json, candidate.pointer);
  if (!Array.isArray(rows)) continue;

  const context = getContext(json, candidate.pointer);
  const identity = routeIdentityFrom(rows, context, candidate);
  const validation = validateCandidateRows(rows, candidate.shape?.mapping ?? candidate.mapping ?? {});

  let strictStatus = "rejected_missing_exact_ksi_identity";
  const strictBlocks = [];

  if (identity.contaminationSlugs.length || identity.contaminationHosts.length) {
    strictStatus = "rejected_route_contamination";
    strictBlocks.push("route_contamination_detected");
  } else if (!identity.exactIdentityPassed) {
    strictBlocks.push("missing_exact_ksi_host_or_isl_slug");
    if (identity.hasIcelandTextOnly) strictBlocks.push("iceland_text_only_not_identity");
  } else if ((candidate.shape?.mappedCount ?? Object.values(candidate.mapping ?? {}).filter(Boolean).length) < 9) {
    strictStatus = "blocked_incomplete_row_mapping";
    strictBlocks.push("incomplete_row_mapping");
  } else if (validation.blocks.length) {
    strictStatus = "blocked_arithmetic";
    strictBlocks.push(...validation.blocks);
  } else if (validation.validRows < 10 || validation.totalPlayed <= 0 || validation.totalPoints <= 0) {
    strictStatus = "blocked_non_triviality";
    strictBlocks.push("non_triviality_failed");
  } else {
    strictStatus = "strict_identity_candidate_ready_for_contract";
  }

  strictCandidates.push({
    file: candidate.file,
    pointer: candidate.pointer,
    length: candidate.length,
    originalStatus: candidate.candidateStatus,
    originalScore: candidate.score,
    strictStatus,
    identity,
    validation,
    mapping: candidate.shape?.mapping ?? candidate.mapping ?? {},
    sampleRowsPreview: rows.slice(0, 3),
    contextPreview: JSON.stringify(context).slice(0, 1200),
    signature: sha256Text(JSON.stringify(rows.slice(0, 30))).slice(0, 24),
    blocks: strictBlocks
  });
}

strictCandidates.sort((a, b) => {
  const rank = s => ({
    strict_identity_candidate_ready_for_contract: 5,
    blocked_arithmetic: 4,
    blocked_incomplete_row_mapping: 3,
    blocked_non_triviality: 2,
    rejected_missing_exact_ksi_identity: 1,
    rejected_route_contamination: 0
  }[s] ?? 0);
  return rank(b.strictStatus) - rank(a.strictStatus) || b.originalScore - a.originalScore;
});

const readyCandidates = strictCandidates.filter(c => c.strictStatus === "strict_identity_candidate_ready_for_contract");
const rejectedMissingIdentity = strictCandidates.filter(c => c.strictStatus === "rejected_missing_exact_ksi_identity");
const rejectedContamination = strictCandidates.filter(c => c.strictStatus === "rejected_route_contamination");
const blockedOther = strictCandidates.filter(c => c.strictStatus.startsWith("blocked_"));

const blocks = [];
const warnings = [];

if (readyCandidates.length > 0) {
  warnings.push("strict_ready_ksi_candidate_found_requires_manual_source_url_and_season_review_before_proof");
}

if (strictCandidates.length === 0) blocks.push("no_ksi_strict_candidates_to_review");

const status = blocks.length ? "blocked" : "passed";

const board = {
  status,
  runner: "ksi_strict_identity_repair_board",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "apply strict route identity to KSI standings-shaped review candidates; reject Iceland-text-only and non-KSI contamination before any modern proof runner",
  exactIdentityPolicy: EXACT,
  inputs: INPUTS,
  sourceReviewStatus: review.status,
  sourceReviewedCandidateCount: review.reviewedCandidateCount,
  strictCandidateCount: strictCandidates.length,
  readyCandidateCount: readyCandidates.length,
  rejectedMissingIdentityCount: rejectedMissingIdentity.length,
  rejectedContaminationCount: rejectedContamination.length,
  blockedOtherCount: blockedOther.length,
  readyCandidates,
  rejectedMissingIdentity: rejectedMissingIdentity.map(c => ({
    file: c.file,
    pointer: c.pointer,
    length: c.length,
    originalStatus: c.originalStatus,
    strictStatus: c.strictStatus,
    identity: c.identity,
    validation: c.validation,
    blocks: c.blocks,
    signature: c.signature
  })),
  rejectedContamination: rejectedContamination.map(c => ({
    file: c.file,
    pointer: c.pointer,
    length: c.length,
    originalStatus: c.originalStatus,
    strictStatus: c.strictStatus,
    identity: c.identity,
    validation: c.validation,
    blocks: c.blocks,
    signature: c.signature
  })),
  blockedOther,
  decision: readyCandidates.length
    ? {
        ksiModernProofAllowedNext: false,
        reason: "A strict identity candidate exists but must still get explicit source URL, seasonScope, seasonLabel, expectedRowCount and expectedTeamSignals before proof.",
        nextLane: "build_ksi_source_contract_from_ready_candidate"
      }
    : {
        ksiModernProofAllowedNext: false,
        reason: "No KSI candidate has exact route identity. Existing standings-shaped candidates are not safe for KSI proof.",
        nextLane: "do_not_build_ksi_modern_proof_from_existing_review_candidates; move_to_next_blocked_family_or_run_fresh_official_ksi_source_discovery_later"
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
  status,
  strictCandidateCount: board.strictCandidateCount,
  readyCandidateCount: board.readyCandidateCount,
  rejectedMissingIdentityCount: board.rejectedMissingIdentityCount,
  rejectedContaminationCount: board.rejectedContaminationCount,
  blockedOtherCount: board.blockedOtherCount,
  readyCandidates: board.readyCandidates.map(c => ({ file: c.file, pointer: c.pointer, length: c.length, identity: c.identity, validation: c.validation })),
  rejectedMissingIdentity: board.rejectedMissingIdentity.slice(0, 5).map(c => ({ file: c.file, pointer: c.pointer, length: c.length, identity: c.identity, validation: c.validation, blocks: c.blocks })),
  rejectedContamination: board.rejectedContamination.slice(0, 5).map(c => ({ file: c.file, pointer: c.pointer, length: c.length, identity: c.identity, validation: c.validation, blocks: c.blocks })),
  decision: board.decision,
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

if (status !== "passed") {
  process.exit(1);
}
