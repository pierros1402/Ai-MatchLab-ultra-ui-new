import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-fetch")) throw new Error("Refusing live official API fetch without --allow-fetch");

const CONFIG_PATH = path.join(ROOT, "engine-v1", "config", "football-truth-official-api-route-families.json");
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const OUT_DIR = path.join(DATA_ROOT, "_diagnostics", `official-api-standings-adapter-${DATE}`);

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }
function normalizeText(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function readPath(obj, selector) { return String(selector || "").split(".").reduce((cursor, key) => cursor == null ? undefined : cursor[key], obj); }
function toInt(value) { if (value == null) return null; if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value); const cleaned = String(value).replace(/[^\d-]/g, ""); if (!cleaned || cleaned === "-") return null; const parsed = Number.parseInt(cleaned, 10); return Number.isFinite(parsed) ? parsed : null; }

function flattenTargets(config) {
  const targets = [];
  for (const family of config.families || []) {
    for (const competition of family.competitions || []) {
      targets.push({
        ...competition,
        familyId: family.familyId,
        adapter: competition.adapter || family.adapter,
        sourceHost: competition.sourceHost || family.sourceHost,
        routeType: competition.routeType || family.routeType || "official_api",
        seasonScope: competition.seasonScope || family.seasonScope || "unknown_needs_evidence",
        seasonLabel: competition.seasonLabel || family.seasonLabel || null,
        seasonStartDate: competition.seasonStartDate ?? family.seasonStartDate ?? null
      });
    }
  }
  return targets;
}

function findStandingArray(json) {
  if (Array.isArray(json)) return json;
  const candidates = [];
  function visit(node, pathBits) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      const score = node.filter((item) => item && typeof item === "object" && ("rank" in item || "position" in item) && ("teamName" in item || "team" in item || "name" in item) && ("matchesPlayed" in item || "played" in item) && ("points" in item)).length;
      if (score > 0) candidates.push({ path: pathBits.join("."), score, rows: node });
      for (let i = 0; i < Math.min(node.length, 20); i++) visit(node[i], pathBits.concat(String(i)));
      return;
    }
    for (const [key, value] of Object.entries(node)) visit(value, pathBits.concat(key));
  }
  visit(json, []);
  candidates.sort((a, b) => b.score - a.score || b.rows.length - a.rows.length);
  return candidates[0]?.rows || [];
}

function arithmetic(rows) {
  let tested = 0;
  let failed = 0;
  const failures = [];
  for (const row of rows) {
    const values = [row.played, row.won, row.drawn, row.lost, row.points];
    if (values.some((value) => value == null || !Number.isFinite(Number(value)))) {
      failed++;
      failures.push({ position: row.position, teamName: row.teamName, reason: "missing_numeric_value" });
      continue;
    }
    tested++;
    const playedExpected = Number(row.won) + Number(row.drawn) + Number(row.lost);
    const pointsExpected = Number(row.won) * 3 + Number(row.drawn);
    if (Number(row.played) !== playedExpected || Number(row.points) !== pointsExpected) {
      failed++;
      failures.push({ position: row.position, teamName: row.teamName, played: row.played, playedExpected, points: row.points, pointsExpected });
    }
  }
  return { status: tested > 0 && failed === 0 ? "passed" : "failed", tested, failed, failures: failures.slice(0, 20) };
}

function nonTrivialPreviousCompletedGate(rows) {
  const totalPlayed = rows.reduce((sum, row) => sum + Number(row.played || 0), 0);
  const totalPoints = rows.reduce((sum, row) => sum + Number(row.points || 0), 0);
  const maxPoints = rows.reduce((max, row) => Math.max(max, Number(row.points || 0)), 0);
  const rowWithPlayedCount = rows.filter((row) => Number(row.played || 0) > 0).length;
  const allZeroStats = rows.every((row) => ["played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "points"].every((key) => Number(row[key] || 0) === 0));
  return { status: totalPlayed > 0 && totalPoints > 0 && maxPoints > 0 && rowWithPlayedCount > 0 && !allZeroStats ? "passed" : "failed", totalPlayed, totalPoints, maxPoints, rowWithPlayedCount, allZeroStats };
}

function parseRows(target, standingArray) {
  const fields = target.fields || {};
  const rows = [];
  for (const item of standingArray) {
    const position = toInt(readPath(item, fields.position || "rank"));
    const teamName = String(readPath(item, fields.teamName || "teamName") ?? "").trim();
    if (!position || !teamName) continue;
    const goalsFor = toInt(readPath(item, fields.goalsFor || "goalsScored"));
    const goalsAgainst = toInt(readPath(item, fields.goalsAgainst || "goalsConceded"));
    rows.push({
      competitionSlug: target.competitionSlug,
      seasonScope: target.seasonScope,
      seasonLabel: target.seasonLabel,
      seasonStartDate: target.seasonStartDate || null,
      position,
      teamName,
      played: toInt(readPath(item, fields.played || "matchesPlayed")),
      won: toInt(readPath(item, fields.won || "matchesWon")),
      drawn: toInt(readPath(item, fields.drawn || "matchesDraw")),
      lost: toInt(readPath(item, fields.lost || "matchesLost")),
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor !== null && goalsAgainst !== null ? goalsFor - goalsAgainst : null,
      points: toInt(readPath(item, fields.points || "points")),
      stageId: readPath(item, fields.stageId || "tournamentStageId") ?? null,
      stageName: readPath(item, fields.stageName || "tournamentStageName") ?? null,
      sourceUrl: target.sourceUrl || target.endpointUrl,
      sourceHost: target.sourceHost,
      extractionAdapter: target.adapter,
      familyId: target.familyId,
      routeType: target.routeType
    });
  }
  const byPosition = new Map();
  for (const row of rows) if (!byPosition.has(row.position)) byPosition.set(row.position, row);
  return [...byPosition.values()].sort((a, b) => a.position - b.position);
}

function expectedTeamSignalCount(target, rows) {
  const teamText = normalizeText(rows.map((row) => row.teamName).join(" | "));
  return (target.expectedTeamSignals || []).filter((signal) => teamText.includes(normalizeText(signal))).length;
}

async function runTarget(target) {
  const response = await fetch(target.endpointUrl || target.sourceUrl, { headers: { accept: "application/json,text/plain,*/*", "user-agent": "AI-MatchLab-FootballTruth/1.0" } });
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  let json = null;
  let jsonParseStatus = "not_attempted";
  try { json = JSON.parse(body); jsonParseStatus = "passed"; } catch { jsonParseStatus = "failed"; }
  const standingArray = json ? findStandingArray(json) : [];
  const rows = parseRows(target, standingArray);
  const ar = arithmetic(rows);
  const nonTrivial = target.requiredNonTrivialPreviousCompleted || target.seasonScope === "previous_completed" ? nonTrivialPreviousCompletedGate(rows) : { status: "not_required" };
  const expectedRows = Number(target.expectedRows || target.expectedRowCount || 0);
  const expectedRowsMatch = expectedRows > 0 && rows.length === expectedRows;
  const signalCount = expectedTeamSignalCount(target, rows);
  const minimumSignalCount = Number(target.minimumExpectedTeamSignalCount || Math.min(3, (target.expectedTeamSignals || []).length) || 0);
  const expectedTeamSignalsPassed = signalCount >= minimumSignalCount;
  const httpPassed = response.status >= 200 && response.status < 300;
  const qualityGateStatus = httpPassed && jsonParseStatus === "passed" && expectedRowsMatch && expectedTeamSignalsPassed && ar.status === "passed" && nonTrivial.status === "passed" ? "verified" : "review";
  const sourceObservedAt = new Date().toISOString();
  const validationStatus = qualityGateStatus === "verified" ? "passed" : "failed";
  return {
    competition: {
      competitionSlug: target.competitionSlug,
      competitionName: target.competitionName || target.competitionSlug,
      country: target.country || null,
      familyId: target.familyId,
      adapter: target.adapter,
      sourceHost: target.sourceHost,
      sourceUrl: target.sourceUrl || target.endpointUrl,
      httpStatus: response.status,
      contentType,
      jsonParseStatus,
      standingArrayLength: standingArray.length,
      parsedRowCount: rows.length,
      expectedRows,
      expectedRowsMatch,
      expectedTeamSignalCount: signalCount,
      minimumExpectedTeamSignalCount: minimumSignalCount,
      expectedTeamSignalsPassed,
      arithmetic: ar,
      nonTrivialPreviousCompletedGate: nonTrivial,
      qualityGateStatus,
      validationStatus,
      stageIds: [...new Set(rows.map((row) => row.stageId).filter(Boolean))],
      stageNames: [...new Set(rows.map((row) => row.stageName).filter(Boolean))]
    },
    rows: rows.map((row) => ({ ...row, qualityGateStatus, validationStatus, sourceObservedAt }))
  };
}

async function main() {
  const config = readJson(CONFIG_PATH);
  const targets = flattenTargets(config);
  ensureDir(OUT_DIR);
  const results = [];
  for (const target of targets) results.push(await runTarget(target));
  const competitions = results.map((result) => result.competition);
  const allRows = results.flatMap((result) => result.competition.qualityGateStatus === "verified" ? result.rows : []);
  const verifiedCompetitions = competitions.filter((competition) => competition.qualityGateStatus === "verified");
  const summary = {
    status: verifiedCompetitions.length === targets.length && allRows.length > 0 ? "passed" : "failed",
    runner: "official_api_standings_adapter",
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: targets.length,
    browserRenderExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    targetCount: targets.length,
    verifiedCompetitionCount: verifiedCompetitions.length,
    reviewCompetitionCount: competitions.filter((competition) => competition.qualityGateStatus === "review").length,
    acceptedRowsCount: allRows.length,
    seasonScopedRowsContractVersion: 1,
    officialApiRowsContractVersion: 1,
    nonTrivialPreviousCompletedGateVersion: 1,
    verifiedCompetitionSlugs: verifiedCompetitions.map((competition) => competition.competitionSlug),
    recommendedNextLane: "integrate_official_api_rows_into_season_lanes"
  };
  const report = { summary, targets, competitions, rows: allRows };
  const outPath = path.join(OUT_DIR, `official-api-standings-adapter-${DATE}.json`);
  const summaryPath = path.join(OUT_DIR, `official-api-standings-adapter-summary-${DATE}.json`);
  const rowsPath = path.join(OUT_DIR, `official-api-standings-adapter-rows-${DATE}.jsonl`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  fs.writeFileSync(summaryPath, JSON.stringify({ summary, competitions }, null, 2) + "\n", "utf8");
  fs.writeFileSync(rowsPath, allRows.map((row) => JSON.stringify(row)).join("\n") + (allRows.length ? "\n" : ""), "utf8");
  console.log(JSON.stringify({ ...summary, output: path.relative(ROOT, outPath), summaryOutput: path.relative(ROOT, summaryPath), rowsOutput: path.relative(ROOT, rowsPath) }, null, 2));
  if (summary.status !== "passed") process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

