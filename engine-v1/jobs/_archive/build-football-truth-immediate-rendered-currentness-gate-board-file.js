import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/immediate-rendered-currentness-gate-board-${DATE}`;
const OUT = `${OUT_DIR}/immediate-rendered-currentness-gate-board-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/immediate-rendered-currentness-gate-rows-${DATE}.jsonl`;

function abs(p) { return path.join(ROOT, p); }
function readJsonl(p) { if (!p || !fs.existsSync(abs(p))) return []; return fs.readFileSync(abs(p), "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function writeJsonl(p, rows) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), rows.map(r => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "")); }
function sha256Text(t) { return crypto.createHash("sha256").update(String(t ?? "")).digest("hex"); }

function walk(dir, predicate, out = []) {
  const full = abs(dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.posix.join(dir.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) walk(rel, predicate, out);
    else if (predicate(rel)) out.push(rel);
  }
  return out;
}

function latestExact(fileRegex) {
  const files = walk("data/football-truth/_diagnostics", p => fileRegex.test(path.basename(p)));
  if (!files.length) return null;
  return files.map(p => ({ p, mtimeMs: fs.statSync(abs(p)).mtimeMs })).sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;
}

function n(v) {
  const x = Number(String(v ?? "").trim());
  return Number.isFinite(x) ? x : null;
}

function normalizeTeamName(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const words = s.split(/\s+/);
  const half = words.length / 2;
  if (Number.isInteger(half)) {
    const a = words.slice(0, half).join(" ");
    const b = words.slice(half).join(" ");
    if (a === b) return a;
  }
  return s;
}

function parsePositionTeam(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d+)\s+(.+)$/);
  if (!m) return { position: n(s), teamName: "" };
  return { position: n(m[1]), teamName: normalizeTeamName(m[2]) };
}

function parseCandidateRows(candidate) {
  const familyId = candidate.familyId;
  const table = candidate.bestTableShape;
  const body = table?.firstRows?.slice(1) ?? [];
  const rows = [];

  for (const cells of body) {
    if (familyId === "premierleague_official_rendered") {
      const posCell = String(cells[0] ?? "");
      const position = n(posCell.match(/^(\d+)/)?.[1]);
      const teamName = normalizeTeamName(cells[1]);
      const played = n(cells[2]);
      const won = n(cells[3]);
      const drawn = n(cells[4]);
      const lost = n(cells[5]);
      const goalsFor = n(cells[6]);
      const goalsAgainst = n(cells[7]);
      const goalDifference = n(cells[8]);
      const points = n(cells[9]);
      if (position && teamName) rows.push({ position, teamName, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points });
    } else if (familyId === "serie_a_official_rendered") {
      const pt = parsePositionTeam(cells[0]);
      const points = n(cells[1]);
      const played = n(cells[2]);
      const won = n(cells[3]);
      const drawn = n(cells[4]);
      const lost = n(cells[5]);
      const goalsFor = n(cells[6]);
      const goalsAgainst = n(cells[7]);
      const goalDifference = n(cells[8]);
      if (pt.position && pt.teamName) rows.push({ position: pt.position, teamName: pt.teamName, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points });
    }
  }

  return rows;
}

function validateCandidate(candidate, rows) {
  const blocks = [];
  const warnings = [];
  const expectedRows = 20;

  if (candidate.bestTableShape?.rowCount !== 21) warnings.push(`rendered_table_row_count_${candidate.bestTableShape?.rowCount}_including_header`);
  if (rows.length < 8) blocks.push(`parsed_preview_rows_${rows.length}_below_8`);
  if (candidate.familyId === "premierleague_official_rendered" && !/2026\/27|2026-27|2026/i.test(candidate.title ?? "")) warnings.push("premierleague_title_does_not_explicitly_show_2026_27");
  if (candidate.familyId === "serie_a_official_rendered" && !/serie\s*a/i.test(`${candidate.title} ${candidate.url}`)) blocks.push("serie_a_identity_signal_missing");

  let totalPlayed = 0;
  let totalPoints = 0;
  let maxPlayed = 0;
  let maxPoints = 0;

  for (const row of rows) {
    totalPlayed += row.played ?? 0;
    totalPoints += row.points ?? 0;
    maxPlayed = Math.max(maxPlayed, row.played ?? 0);
    maxPoints = Math.max(maxPoints, row.points ?? 0);
    if (row.played !== row.won + row.drawn + row.lost) blocks.push(`${row.teamName}_wdl_failed`);
    if (row.points !== row.won * 3 + row.drawn) blocks.push(`${row.teamName}_points_failed`);
    if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`${row.teamName}_gd_failed`);
  }

  const allZero = rows.length > 0 && rows.every(row =>
    row.played === 0 &&
    row.won === 0 &&
    row.drawn === 0 &&
    row.lost === 0 &&
    row.goalsFor === 0 &&
    row.goalsAgainst === 0 &&
    row.goalDifference === 0 &&
    row.points === 0
  );

  if (allZero) blocks.push("all_zero_new_season_table_rejected_for_previous_completed");
  if (totalPlayed <= 0 || totalPoints <= 0 || maxPlayed <= 0 || maxPoints <= 0) blocks.push("non_trivial_previous_completed_gate_failed");

  return {
    passed: blocks.length === 0,
    blocks: [...new Set(blocks)],
    warnings: [...new Set(warnings)],
    parsedPreviewRowCount: rows.length,
    expectedFullRowCount: expectedRows,
    totalPlayed,
    totalPoints,
    maxPlayed,
    maxPoints,
    allZero,
    teamSignals: rows.slice(0, 8).map(r => r.teamName),
    duplicateGuardHash: sha256Text(rows.map(r => `${r.position}|${r.teamName}|${r.played}|${r.points}`).join("\n")).slice(0, 24)
  };
}

const resolverRowsPath = latestExact(/^immediate-official-rendered-route-seed-resolver-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!resolverRowsPath) throw new Error("No resolver candidates rows found");

const candidates = readJsonl(resolverRowsPath);
const reviewRows = [];

for (const candidate of candidates) {
  const rows = parseCandidateRows(candidate);
  const validation = validateCandidate(candidate, rows);
  const uniqueRouteKey = `${candidate.familyId}|${candidate.competitionSlug}|${candidate.bestTableShape?.rowSignature}`;

  reviewRows.push({
    familyId: candidate.familyId,
    competitionSlug: candidate.competitionSlug,
    taskType: "acquire_previous_completed_standings",
    sourceUrl: candidate.url,
    sourceHost: candidate.host,
    title: candidate.title,
    h1: candidate.h1,
    bestTableSignature: candidate.bestTableShape?.rowSignature ?? null,
    uniqueRouteKey,
    status: validation.passed ? "accepted_schema_candidate" : "rejected_currentness_or_previous_completed_gate",
    validation,
    rowsPreview: rows,
    decision: validation.passed
      ? "schema_probe_ready_for_previous_completed_adapter"
      : "do_not_use_rendered_current_table_for_previous_completed"
  });
}

const accepted = reviewRows.filter(r => r.status === "accepted_schema_candidate");
const rejected = reviewRows.filter(r => r.status !== "accepted_schema_candidate");
const rejectedAllZero = rejected.filter(r => r.validation.blocks.includes("all_zero_new_season_table_rejected_for_previous_completed"));
const uniqueRejectedRouteKeys = [...new Set(rejected.map(r => r.uniqueRouteKey))];

writeJsonl(ROWS_OUT, reviewRows);

const output = {
  status: "passed",
  runner: "immediate_rendered_currentness_gate_board",
  generatedAtUtc: new Date().toISOString(),
  purpose: "exact schema/currentness gate for immediate rendered official tables; reject all-zero current/new tables for previous_completed tasks",
  resolverRowsPath,
  candidateCount: candidates.length,
  acceptedCandidateCount: accepted.length,
  rejectedCandidateCount: rejected.length,
  rejectedAllZeroNewSeasonCandidateCount: rejectedAllZero.length,
  uniqueRejectedRouteKeyCount: uniqueRejectedRouteKeys.length,
  uniqueRejectedRouteKeys,
  accepted,
  rejected,
  rowsOutput: ROWS_OUT,
  nextRecommendedLane: accepted.length
    ? {
        lane: "build_previous_completed_adapter_from_accepted_rendered_schema",
        readyCompetitionSlugs: [...new Set(accepted.map(r => r.competitionSlug))].sort()
      }
    : {
        lane: "official_asset_api_route_mining_for_previous_completed_eng1_ita1",
        reason: "rendered official table routes are all-zero current/new season tables and cannot satisfy previous_completed",
        blockedRenderedRoutes: uniqueRejectedRouteKeys,
        targetFamilies: ["premierleague_official_rendered", "serie_a_official_rendered"]
      },
  policy: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserRenderExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  resolverRowsPath,
  candidateCount: output.candidateCount,
  acceptedCandidateCount: output.acceptedCandidateCount,
  rejectedCandidateCount: output.rejectedCandidateCount,
  rejectedAllZeroNewSeasonCandidateCount: output.rejectedAllZeroNewSeasonCandidateCount,
  uniqueRejectedRouteKeyCount: output.uniqueRejectedRouteKeyCount,
  uniqueRejectedRouteKeys,
  nextRecommendedLane: output.nextRecommendedLane,
  output: OUT,
  rowsOutput: ROWS_OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (accepted.length > 0) process.exit(1);
