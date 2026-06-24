import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/torneopal-strict-identity-review-board-${DATE}`;
const OUT = `${OUT_DIR}/torneopal-strict-identity-review-board-${DATE}.json`;

const INPUTS = {
  blockedDiscoveryBoard: `data/football-truth/_diagnostics/blocked-family-source-contract-discovery-board-${DATE}/blocked-family-source-contract-discovery-board-${DATE}.json`,
  sourceAgnosticDiscovery: "data/football-truth/_diagnostics/source-agnostic-standings-discovery-2026-06-17/source-agnostic-standings-discovery-2026-06-17.json",
  sourceAgnosticQualityGate: "data/football-truth/_diagnostics/source-agnostic-standings-quality-gate-2026-06-17/source-agnostic-standings-quality-gate-2026-06-17.json",
  officialDomainSeedFinland: "data/football-truth/_state/canonical-standings-candidates/official-domain-seed-finland-standings-candidates-2026-06-16.json"
};

const EXACT = {
  familyId: "torneopal",
  acceptedCompetitionSlugs: ["fin.1", "fin.2"],
  acceptedHosts: [
    "tulospalvelu.palloliitto.fi",
    "www.palloliitto.fi",
    "palloliitto.fi",
    "www.veikkausliiga.com",
    "veikkausliiga.com",
    "ykkosliiga.fi",
    "www.ykkosliiga.fi"
  ],
  acceptedTextSignals: [
    "veikkausliiga",
    "ykkösliiga",
    "ykkosliiga",
    "palloliitto",
    "torneopal",
    "tulospalvelu"
  ],
  requiredRouteIdentity: "candidate must have competitionSlug fin.1/fin.2 OR source/final/candidate URL host in accepted Finnish official/Torneopal hosts; generic Finland text alone is insufficient"
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
  const trimmed = pointer.replace(/^root\.?/, "");
  if (!trimmed) return cur;
  const parts = trimmed.split(".").filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^([^\[]+)(?:\[(\d+)\])?$/);
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

function flattenArrays(x, pointer = "root", out = [], depth = 0) {
  if (!x || typeof x !== "object" || depth > 9) return out;
  if (Array.isArray(x)) {
    if (x.length >= 8 && x[0] && typeof x[0] === "object") out.push({ pointer, length: x.length, keys: Object.keys(x[0]).slice(0, 80), sample: x[0] });
    x.slice(0, 4).forEach((v, i) => flattenArrays(v, `${pointer}[${i}]`, out, depth + 1));
    return out;
  }
  for (const [k, v] of Object.entries(x)) flattenArrays(v, `${pointer}.${k}`, out, depth + 1);
  return out;
}

function collectDeepValues(x, keysWanted, out = [], depth = 0) {
  if (!x || typeof x !== "object" || depth > 8) return out;
  if (Array.isArray(x)) {
    for (const v of x.slice(0, 60)) collectDeepValues(v, keysWanted, out, depth + 1);
    return out;
  }
  for (const [k, v] of Object.entries(x)) {
    if (keysWanted.includes(k) && (typeof v === "string" || typeof v === "number")) out.push({ key: k, value: String(v) });
    collectDeepValues(v, keysWanted, out, depth + 1);
  }
  return out;
}

function uniqueValues(values) {
  return [...new Set(values.filter(v => v !== null && v !== undefined && String(v).trim() !== "").map(v => String(v).trim()))].sort();
}

function hostFromUrl(value) {
  try { return new URL(String(value)).host.toLowerCase(); } catch { return ""; }
}

function lowerText(x, limit = 30000) {
  try { return JSON.stringify(x).slice(0, limit).toLowerCase(); } catch { return ""; }
}

function inferRowsShape(rows) {
  const keys = Object.keys(rows[0] ?? {});
  const lowerMap = Object.fromEntries(keys.map(k => [k.toLowerCase(), k]));
  const key = (...names) => {
    for (const name of names) if (lowerMap[name.toLowerCase()]) return lowerMap[name.toLowerCase()];
    return null;
  };
  const mapping = {
    competitionSlug: key("competitionSlug", "leagueSlug", "slug"),
    sourceUrl: key("sourceUrl", "finalUrl", "candidateUrl", "url"),
    teamName: key("teamName", "team", "name"),
    position: key("position", "rank", "pos"),
    played: key("played", "matchesPlayed", "mp", "p"),
    won: key("won", "wins", "w"),
    drawn: key("drawn", "draws", "d"),
    lost: key("lost", "losses", "l"),
    goalsFor: key("goalsFor", "gf"),
    goalsAgainst: key("goalsAgainst", "ga"),
    goalDifference: key("goalDifference", "goalDiff", "gd"),
    points: key("points", "pts")
  };
  return { keys, mapping, mappedCount: Object.values(mapping).filter(Boolean).length };
}

function validateRows(rows, mapping) {
  const blocks = [];
  let validRows = 0, arithmeticRows = 0, totalPlayed = 0, totalPoints = 0, maxPlayed = 0, maxPoints = 0;
  const teamSignals = [];

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
    if (teamSignals.length < 8) teamSignals.push(teamName);
    totalPlayed += played;
    totalPoints += points;
    maxPlayed = Math.max(maxPlayed, played);
    maxPoints = Math.max(maxPoints, points);

    if (won !== null && drawn !== null && lost !== null) {
      arithmeticRows += 1;
      if (played !== won + drawn + lost) blocks.push(`${teamName}_wdl_failed`);
      if (points !== won * 3 + drawn) blocks.push(`${teamName}_points_failed`);
    }
    if (goalsFor !== null && goalsAgainst !== null && goalDifference !== null && goalDifference !== goalsFor - goalsAgainst) blocks.push(`${teamName}_gd_failed`);
  }

  return { validRows, arithmeticRows, totalPlayed, totalPoints, maxPlayed, maxPoints, teamSignals, blocks: Array.from(new Set(blocks)).slice(0, 80) };
}

function routeIdentityFrom(rows, context, candidate) {
  const deep = collectDeepValues({ rows: rows.slice(0, 40), context, candidate }, [
    "competitionSlug", "leagueSlug", "slug", "sourceUrl", "finalUrl", "candidateUrl", "url", "host", "hostname", "sourceHost", "competition", "league", "leagueLabel"
  ]);
  const competitionSlugValues = uniqueValues(deep.filter(x => /competitionSlug|leagueSlug|slug/.test(x.key)).map(x => x.value));
  const urlValues = uniqueValues(deep.filter(x => /sourceUrl|finalUrl|candidateUrl|url/.test(x.key)).map(x => x.value)).slice(0, 30);
  const hostValues = uniqueValues([
    ...deep.filter(x => /host|hostname|sourceHost/.test(x.key)).map(x => x.value),
    ...urlValues.map(hostFromUrl).filter(Boolean)
  ]);
  const leagueValues = uniqueValues(deep.filter(x => /competition|league|leagueLabel/.test(x.key)).map(x => x.value));
  const exactSlugMatches = competitionSlugValues.filter(v => EXACT.acceptedCompetitionSlugs.includes(v));
  const exactHostMatches = hostValues.filter(v => EXACT.acceptedHosts.includes(v.toLowerCase()));
  const text = lowerText({ rows: rows.slice(0, 5), context, candidate });
  const exactTextSignals = EXACT.acceptedTextSignals.filter(sig => text.includes(sig.toLowerCase()));
  const contaminationSlugs = competitionSlugValues.filter(v => /^[a-z]{3}\.\d+$/.test(v) && !EXACT.acceptedCompetitionSlugs.includes(v));
  const contaminationHosts = hostValues.filter(v => {
    const h = v.toLowerCase();
    return h && !EXACT.acceptedHosts.includes(h) && /(eliteserien|obos-ligaen|jleague|superliga\.dk|laliga|bundesliga|eredivisie|hnl|spfl|dfb|allsvenskan|superettan|legab|erovnuliliga)/.test(h);
  });
  return {
    competitionSlugValues,
    urlValues,
    hostValues,
    leagueValues,
    exactSlugMatches,
    exactHostMatches,
    exactTextSignals,
    contaminationSlugs,
    contaminationHosts,
    exactIdentityPassed: exactSlugMatches.length > 0 || exactHostMatches.length > 0,
    finnishTextOnly: exactSlugMatches.length === 0 && exactHostMatches.length === 0 && exactTextSignals.length > 0
  };
}

const discovery = readJson(INPUTS.blockedDiscoveryBoard);
const familyDiscovery = (discovery.familyBoards ?? []).find(x => x.familyId === "torneopal");
if (!familyDiscovery) throw new Error("torneopal family missing from blocked discovery board");

const candidateFiles = [
  INPUTS.sourceAgnosticDiscovery,
  INPUTS.sourceAgnosticQualityGate,
  INPUTS.officialDomainSeedFinland
].filter(exists);

const candidates = [];

for (const file of candidateFiles) {
  const json = readJson(file);
  for (const arr of flattenArrays(json)) {
    const rows = getAtPointer(json, arr.pointer);
    if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== "object") continue;

    const context = getContext(json, arr.pointer);
    const identity = routeIdentityFrom(rows, context, { file, pointer: arr.pointer });
    const shape = inferRowsShape(rows);
    const validation = validateRows(rows, shape.mapping);

    const text = lowerText({ file, pointer: arr.pointer, rows: rows.slice(0, 4), context });
    let score = 0;
    if (identity.exactSlugMatches.length) score += 80;
    if (identity.exactHostMatches.length) score += 80;
    if (identity.exactTextSignals.length) score += identity.exactTextSignals.length * 15;
    if (validation.validRows >= 10) score += 30;
    if (validation.arithmeticRows >= 10 && validation.blocks.length === 0) score += 30;
    if (validation.totalPlayed > 0 && validation.totalPoints > 0) score += 20;
    if (text.includes("fin.1") || text.includes("fin.2")) score += 40;
    if (identity.contaminationSlugs.length || identity.contaminationHosts.length) score -= 100;

    let status = "rejected_missing_exact_torneopal_identity";
    const blocks = [];

    if (identity.contaminationSlugs.length || identity.contaminationHosts.length) {
      status = "rejected_route_contamination";
      blocks.push("route_contamination_detected");
    } else if (!identity.exactIdentityPassed) {
      blocks.push("missing_exact_fin_slug_or_accepted_finnish_official_host");
      if (identity.finnishTextOnly) blocks.push("finnish_text_only_not_identity");
    } else if (shape.mappedCount < 9) {
      status = "blocked_incomplete_row_mapping";
      blocks.push("incomplete_row_mapping");
    } else if (validation.blocks.length) {
      status = "blocked_arithmetic";
      blocks.push(...validation.blocks);
    } else if (validation.validRows < 10 || validation.totalPlayed <= 0 || validation.totalPoints <= 0) {
      status = "blocked_non_triviality";
      blocks.push("non_triviality_failed");
    } else {
      status = "strict_identity_candidate_ready_for_contract";
    }

    if (score >= 40 || identity.exactSlugMatches.length || identity.exactHostMatches.length || identity.exactTextSignals.length || status !== "rejected_missing_exact_torneopal_identity") {
      candidates.push({
        file,
        pointer: arr.pointer,
        length: arr.length,
        keys: arr.keys,
        score,
        strictStatus: status,
        identity,
        shape,
        validation,
        sampleRowsPreview: rows.slice(0, 3),
        contextPreview: JSON.stringify(context).slice(0, 1000),
        signature: sha256Text(JSON.stringify(rows.slice(0, 30))).slice(0, 24),
        blocks
      });
    }
  }
}

candidates.sort((a, b) => {
  const rank = s => ({
    strict_identity_candidate_ready_for_contract: 5,
    blocked_arithmetic: 4,
    blocked_incomplete_row_mapping: 3,
    blocked_non_triviality: 2,
    rejected_missing_exact_torneopal_identity: 1,
    rejected_route_contamination: 0
  }[s] ?? 0);
  return rank(b.strictStatus) - rank(a.strictStatus) || b.score - a.score || b.length - a.length;
});

const readyCandidates = candidates.filter(c => c.strictStatus === "strict_identity_candidate_ready_for_contract");
const reviewCandidates = candidates.filter(c => c.strictStatus.startsWith("blocked_"));
const rejectedContamination = candidates.filter(c => c.strictStatus === "rejected_route_contamination");
const rejectedMissingIdentity = candidates.filter(c => c.strictStatus === "rejected_missing_exact_torneopal_identity");

const blocks = [];
const warnings = [];

if (candidates.length === 0) blocks.push("no_torneopal_candidates_reviewed");
if (readyCandidates.length === 0) warnings.push("no_strict_ready_torneopal_candidate_found");

const board = {
  status: blocks.length ? "blocked" : "passed",
  runner: "torneopal_strict_identity_review_board",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "strict identity review for Torneopal/Finland blocked family; reject generic/global standings arrays unless exact fin.1/fin.2 or official Finnish host identity is present",
  exactIdentityPolicy: EXACT,
  inputs: INPUTS,
  discoverySummary: {
    matchedFileCount: familyDiscovery.matchedFileCount,
    standingArrayCandidateCount: familyDiscovery.standingArrayCandidateCount,
    sourceFileCandidateCount: familyDiscovery.sourceFileCandidateCount,
    exactRunnerCandidateCount: familyDiscovery.exactRunnerCandidateCount,
    hasModernSafeRunner: familyDiscovery.hasModernSafeRunner,
    recommendedStatus: familyDiscovery.recommendedStatus
  },
  strictCandidateCount: candidates.length,
  readyCandidateCount: readyCandidates.length,
  reviewCandidateCount: reviewCandidates.length,
  rejectedContaminationCount: rejectedContamination.length,
  rejectedMissingIdentityCount: rejectedMissingIdentity.length,
  readyCandidates: readyCandidates.slice(0, 8),
  reviewCandidates: reviewCandidates.slice(0, 12),
  rejectedContamination: rejectedContamination.slice(0, 12).map(c => ({
    file: c.file,
    pointer: c.pointer,
    length: c.length,
    score: c.score,
    strictStatus: c.strictStatus,
    identity: c.identity,
    validation: c.validation,
    blocks: c.blocks,
    signature: c.signature
  })),
  rejectedMissingIdentity: rejectedMissingIdentity.slice(0, 12).map(c => ({
    file: c.file,
    pointer: c.pointer,
    length: c.length,
    score: c.score,
    strictStatus: c.strictStatus,
    identity: c.identity,
    validation: c.validation,
    blocks: c.blocks,
    signature: c.signature
  })),
  decision: readyCandidates.length
    ? {
        torneopalModernProofAllowedNext: false,
        reason: "Strict identity candidate exists but still requires explicit source route, seasonScope, seasonLabel, expectedRowCount and expectedTeamSignals contract before proof.",
        nextLane: "build_torneopal_source_contract_from_ready_candidate"
      }
    : {
        torneopalModernProofAllowedNext: false,
        reason: "No existing candidate has enough strict exact identity and full standings gates for proof.",
        nextLane: "move_to_cfa_cyprus_html_or_run_fresh_official_finnish_source_discovery_later"
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
  familyId: EXACT.familyId,
  strictCandidateCount: board.strictCandidateCount,
  readyCandidateCount: board.readyCandidateCount,
  reviewCandidateCount: board.reviewCandidateCount,
  rejectedContaminationCount: board.rejectedContaminationCount,
  rejectedMissingIdentityCount: board.rejectedMissingIdentityCount,
  topReady: board.readyCandidates.slice(0, 3).map(c => ({ file: c.file, pointer: c.pointer, length: c.length, score: c.score, identity: c.identity, validation: c.validation, mapping: c.shape.mapping })),
  topReview: board.reviewCandidates.slice(0, 5).map(c => ({ file: c.file, pointer: c.pointer, length: c.length, score: c.score, status: c.strictStatus, identity: c.identity, validation: c.validation, mapping: c.shape.mapping, blocks: c.blocks })),
  topRejectedContamination: board.rejectedContamination.slice(0, 5),
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

if (board.status !== "passed") process.exit(1);
