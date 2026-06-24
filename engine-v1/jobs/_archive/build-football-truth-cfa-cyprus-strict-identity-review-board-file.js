import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/cfa-cyprus-strict-identity-review-board-${DATE}`;
const OUT = `${OUT_DIR}/cfa-cyprus-strict-identity-review-board-${DATE}.json`;

const INPUTS = {
  blockedDiscoveryBoard: `data/football-truth/_diagnostics/blocked-family-source-contract-discovery-board-${DATE}/blocked-family-source-contract-discovery-board-${DATE}.json`,
  sourceAgnosticDiscovery: "data/football-truth/_diagnostics/source-agnostic-standings-discovery-2026-06-17/source-agnostic-standings-discovery-2026-06-17.json",
  sourceAgnosticQualityGate: "data/football-truth/_diagnostics/source-agnostic-standings-quality-gate-2026-06-17/source-agnostic-standings-quality-gate-2026-06-17.json",
  controlledSeasonStateExtraction: "data/football-truth/_diagnostics/controlled-standings-season-state-extraction-runner-2026-06-15/controlled-standings-season-state-extraction-runner-2026-06-15.json",
  tableSeasonScopeAdjudication: "data/football-truth/_diagnostics/table-season-scope-adjudication-2026-06-18/table-season-scope-adjudication-2026-06-18.json",
  concurrentTableSchemaReview: "data/football-truth/_diagnostics/concurrent-table-schema-review-2026-06-18/concurrent-table-schema-review-2026-06-18.json"
};

const EXACT = {
  familyId: "cfa_cyprus_html",
  acceptedCompetitionSlugs: ["cyp.1", "cyp.2"],
  acceptedHosts: ["cfa.com.cy", "www.cfa.com.cy", "cfa.org.cy", "www.cfa.org.cy"],
  acceptedTextSignals: ["cyprus", "cypriot", "cfa", "κοπ", "cyta championship", "first division", "second division"],
  requiredRouteIdentity: "candidate must have competitionSlug cyp.1/cyp.2 OR source/final/candidate URL host in official CFA Cyprus hosts; Cyprus text alone is insufficient"
};

function abs(p) { return path.join(ROOT, p); }
function exists(p) { return fs.existsSync(abs(p)); }
function readJson(p) { if (!exists(p)) throw new Error(`Missing ${p}`); return JSON.parse(fs.readFileSync(abs(p), "utf8")); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function sha256Text(t) { return crypto.createHash("sha256").update(t).digest("hex"); }
function n(v) { if (v === null || v === undefined || v === "") return null; const x = Number(String(v).replace(",", ".")); return Number.isFinite(x) ? x : null; }

function getAtPointer(root, pointer) {
  let cur = root;
  const trimmed = pointer.replace(/^root\.?/, "");
  if (!trimmed) return cur;
  for (const part of trimmed.split(".").filter(Boolean)) {
    const m = part.match(/^([^\[]+)(?:\[(\d+)\])?$/);
    if (!m) return undefined;
    cur = cur?.[m[1]];
    if (m[2] !== undefined) cur = cur?.[Number(m[2])];
  }
  return cur;
}

function context(root, pointer) {
  const parent = pointer.split(".").slice(0, -1).join(".");
  const ctx = getAtPointer(root, parent);
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

function collect(x, wanted, out = [], depth = 0) {
  if (!x || typeof x !== "object" || depth > 8) return out;
  if (Array.isArray(x)) { for (const v of x.slice(0, 60)) collect(v, wanted, out, depth + 1); return out; }
  for (const [k, v] of Object.entries(x)) {
    if (wanted.includes(k) && (typeof v === "string" || typeof v === "number")) out.push({ key: k, value: String(v) });
    collect(v, wanted, out, depth + 1);
  }
  return out;
}

function uniq(a) { return [...new Set(a.filter(v => v !== null && v !== undefined && String(v).trim() !== "").map(v => String(v).trim()))].sort(); }
function host(v) { try { return new URL(String(v)).host.toLowerCase(); } catch { return ""; } }
function txt(x, limit = 30000) { try { return JSON.stringify(x).slice(0, limit).toLowerCase(); } catch { return ""; } }

function shape(rows) {
  const keys = Object.keys(rows[0] ?? {});
  const m = Object.fromEntries(keys.map(k => [k.toLowerCase(), k]));
  const key = (...names) => names.map(x => m[x.toLowerCase()]).find(Boolean) ?? null;
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

function validate(rows, mapping) {
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
    const gf = mapping.goalsFor ? n(raw[mapping.goalsFor]) : null;
    const ga = mapping.goalsAgainst ? n(raw[mapping.goalsAgainst]) : null;
    const gd = mapping.goalDifference ? n(raw[mapping.goalDifference]) : null;
    const points = mapping.points ? n(raw[mapping.points]) : null;
    if (!teamName || position === null || played === null || points === null) continue;
    validRows++; if (teamSignals.length < 8) teamSignals.push(teamName);
    totalPlayed += played; totalPoints += points; maxPlayed = Math.max(maxPlayed, played); maxPoints = Math.max(maxPoints, points);
    if (won !== null && drawn !== null && lost !== null) { arithmeticRows++; if (played !== won + drawn + lost) blocks.push(`${teamName}_wdl_failed`); if (points !== won * 3 + drawn) blocks.push(`${teamName}_points_failed`); }
    if (gf !== null && ga !== null && gd !== null && gd !== gf - ga) blocks.push(`${teamName}_gd_failed`);
  }
  return { validRows, arithmeticRows, totalPlayed, totalPoints, maxPlayed, maxPoints, teamSignals, blocks: [...new Set(blocks)].slice(0, 80) };
}

function identity(rows, ctx, candidate) {
  const deep = collect({ rows: rows.slice(0, 40), ctx, candidate }, ["competitionSlug", "leagueSlug", "slug", "sourceUrl", "finalUrl", "candidateUrl", "url", "host", "hostname", "sourceHost", "competition", "league", "leagueLabel"]);
  const competitionSlugValues = uniq(deep.filter(x => /competitionSlug|leagueSlug|slug/.test(x.key)).map(x => x.value));
  const urlValues = uniq(deep.filter(x => /sourceUrl|finalUrl|candidateUrl|url/.test(x.key)).map(x => x.value)).slice(0, 30);
  const hostValues = uniq([...deep.filter(x => /host|hostname|sourceHost/.test(x.key)).map(x => x.value), ...urlValues.map(host).filter(Boolean)]);
  const leagueValues = uniq(deep.filter(x => /competition|league|leagueLabel/.test(x.key)).map(x => x.value));
  const exactSlugMatches = competitionSlugValues.filter(v => EXACT.acceptedCompetitionSlugs.includes(v));
  const exactHostMatches = hostValues.filter(v => EXACT.acceptedHosts.includes(v.toLowerCase()));
  const text = txt({ rows: rows.slice(0, 5), ctx, candidate });
  const exactTextSignals = EXACT.acceptedTextSignals.filter(sig => text.includes(sig.toLowerCase()));
  const contaminationSlugs = competitionSlugValues.filter(v => /^[a-z]{3}\.\d+$/.test(v) && !EXACT.acceptedCompetitionSlugs.includes(v));
  const contaminationHosts = hostValues.filter(v => {
    const h = v.toLowerCase();
    return h && !EXACT.acceptedHosts.includes(h) && /(eliteserien|obos-ligaen|jleague|superliga\.dk|laliga|bundesliga|eredivisie|hnl|spfl|dfb|allsvenskan|superettan|legab|erovnuliliga|veikkausliiga)/.test(h);
  });
  return { competitionSlugValues, urlValues, hostValues, leagueValues, exactSlugMatches, exactHostMatches, exactTextSignals, contaminationSlugs, contaminationHosts, exactIdentityPassed: exactSlugMatches.length > 0 || exactHostMatches.length > 0, cyprusTextOnly: exactSlugMatches.length === 0 && exactHostMatches.length === 0 && exactTextSignals.length > 0 };
}

const discovery = readJson(INPUTS.blockedDiscoveryBoard);
const fam = (discovery.familyBoards ?? []).find(x => x.familyId === "cfa_cyprus_html");
if (!fam) throw new Error("cfa_cyprus_html missing from blocked discovery board");

const files = Object.values(INPUTS).filter(p => p !== INPUTS.blockedDiscoveryBoard && exists(p));
const candidates = [];

for (const file of files) {
  const json = readJson(file);
  for (const arr of flattenArrays(json)) {
    const rows = getAtPointer(json, arr.pointer);
    if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== "object") continue;
    const ctx = context(json, arr.pointer);
    const id = identity(rows, ctx, { file, pointer: arr.pointer });
    const sh = shape(rows);
    const val = validate(rows, sh.mapping);
    let score = 0;
    if (id.exactSlugMatches.length) score += 80;
    if (id.exactHostMatches.length) score += 80;
    if (id.exactTextSignals.length) score += id.exactTextSignals.length * 12;
    if (val.validRows >= 10) score += 30;
    if (val.arithmeticRows >= 10 && val.blocks.length === 0) score += 30;
    if (val.totalPlayed > 0 && val.totalPoints > 0) score += 20;
    if (id.contaminationSlugs.length || id.contaminationHosts.length) score -= 100;
    let status = "rejected_missing_exact_cfa_identity";
    const blocks = [];
    if (id.contaminationSlugs.length || id.contaminationHosts.length) { status = "rejected_route_contamination"; blocks.push("route_contamination_detected"); }
    else if (!id.exactIdentityPassed) { blocks.push("missing_exact_cyp_slug_or_official_cfa_host"); if (id.cyprusTextOnly) blocks.push("cyprus_text_only_not_identity"); }
    else if (sh.mappedCount < 9) { status = "blocked_incomplete_row_mapping"; blocks.push("incomplete_row_mapping"); }
    else if (val.blocks.length) { status = "blocked_arithmetic"; blocks.push(...val.blocks); }
    else if (val.validRows < 10 || val.totalPlayed <= 0 || val.totalPoints <= 0) { status = "blocked_non_triviality"; blocks.push("non_triviality_failed"); }
    else status = "strict_identity_candidate_ready_for_contract";
    if (score >= 40 || id.exactSlugMatches.length || id.exactHostMatches.length || id.exactTextSignals.length || status !== "rejected_missing_exact_cfa_identity") {
      candidates.push({ file, pointer: arr.pointer, length: arr.length, keys: arr.keys, score, strictStatus: status, identity: id, shape: sh, validation: val, sampleRowsPreview: rows.slice(0, 3), contextPreview: JSON.stringify(ctx).slice(0, 1000), signature: sha256Text(JSON.stringify(rows.slice(0, 30))).slice(0, 24), blocks });
    }
  }
}

candidates.sort((a, b) => {
  const rank = s => ({ strict_identity_candidate_ready_for_contract: 5, blocked_arithmetic: 4, blocked_incomplete_row_mapping: 3, blocked_non_triviality: 2, rejected_missing_exact_cfa_identity: 1, rejected_route_contamination: 0 }[s] ?? 0);
  return rank(b.strictStatus) - rank(a.strictStatus) || b.score - a.score || b.length - a.length;
});

const ready = candidates.filter(c => c.strictStatus === "strict_identity_candidate_ready_for_contract");
const review = candidates.filter(c => c.strictStatus.startsWith("blocked_"));
const contamination = candidates.filter(c => c.strictStatus === "rejected_route_contamination");
const missing = candidates.filter(c => c.strictStatus === "rejected_missing_exact_cfa_identity");
const warnings = [];
if (!ready.length) warnings.push("no_strict_ready_cfa_cyprus_candidate_found");

const board = {
  status: "passed",
  runner: "cfa_cyprus_strict_identity_review_board",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "strict identity review for CFA Cyprus blocked family; reject generic/global standings arrays unless exact cyp.1/cyp.2 or official CFA host identity is present",
  exactIdentityPolicy: EXACT,
  inputs: INPUTS,
  discoverySummary: { matchedFileCount: fam.matchedFileCount, standingArrayCandidateCount: fam.standingArrayCandidateCount, sourceFileCandidateCount: fam.sourceFileCandidateCount, exactRunnerCandidateCount: fam.exactRunnerCandidateCount, hasModernSafeRunner: fam.hasModernSafeRunner, recommendedStatus: fam.recommendedStatus },
  strictCandidateCount: candidates.length,
  readyCandidateCount: ready.length,
  reviewCandidateCount: review.length,
  rejectedContaminationCount: contamination.length,
  rejectedMissingIdentityCount: missing.length,
  readyCandidates: ready.slice(0, 8),
  reviewCandidates: review.slice(0, 12),
  rejectedContamination: contamination.slice(0, 12).map(c => ({ file: c.file, pointer: c.pointer, length: c.length, score: c.score, strictStatus: c.strictStatus, identity: c.identity, validation: c.validation, blocks: c.blocks, signature: c.signature })),
  rejectedMissingIdentity: missing.slice(0, 12).map(c => ({ file: c.file, pointer: c.pointer, length: c.length, score: c.score, strictStatus: c.strictStatus, identity: c.identity, validation: c.validation, blocks: c.blocks, signature: c.signature })),
  decision: ready.length ? { cfaCyprusModernProofAllowedNext: false, reason: "Strict identity candidate exists but still requires explicit route/season/expected-team contract before proof.", nextLane: "build_cfa_cyprus_source_contract_from_ready_candidate" } : { cfaCyprusModernProofAllowedNext: false, reason: "No existing candidate has enough strict exact identity and full standings gates for proof.", nextLane: "fresh_official_source_discovery_for_cfa_or_return_to_bulk_high_value_source_families" },
  policy: { searchExecutedNowCount: 0, fetchExecutedNowCount: 0, browserExecutedNowCount: 0, canonicalWriteExecutedNowCount: 0, productionWriteExecutedNowCount: 0, truthAssertionExecutedNowCount: 0, stateLaneWriteExecutedNowCount: 0, proofOnly: true },
  blocks: [],
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
console.log(JSON.stringify({ status: board.status, familyId: EXACT.familyId, strictCandidateCount: board.strictCandidateCount, readyCandidateCount: board.readyCandidateCount, reviewCandidateCount: board.reviewCandidateCount, rejectedContaminationCount: board.rejectedContaminationCount, rejectedMissingIdentityCount: board.rejectedMissingIdentityCount, topReady: board.readyCandidates.slice(0, 3).map(c => ({ file: c.file, pointer: c.pointer, length: c.length, score: c.score, identity: c.identity, validation: c.validation, mapping: c.shape.mapping })), topReview: board.reviewCandidates.slice(0, 5).map(c => ({ file: c.file, pointer: c.pointer, length: c.length, score: c.score, status: c.strictStatus, identity: c.identity, validation: c.validation, mapping: c.shape.mapping, blocks: c.blocks })), decision: board.decision, warnings, output: OUT, searchExecutedNowCount: 0, fetchExecutedNowCount: 0, browserExecutedNowCount: 0, canonicalWriteExecutedNowCount: 0, productionWriteExecutedNowCount: 0, truthAssertionExecutedNowCount: 0, stateLaneWriteExecutedNowCount: 0 }, null, 2));
