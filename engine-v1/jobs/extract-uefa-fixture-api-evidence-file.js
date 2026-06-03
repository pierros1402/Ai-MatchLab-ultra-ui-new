#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function snapshotsOf(input) {
  if (Array.isArray(input?.fetchedApiSnapshots)) return input.fetchedApiSnapshots;
  if (Array.isArray(input?.apiSnapshotRows)) return input.apiSnapshotRows;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input)) return input;
  return [];
}

function englishName(entity, fallback = "") {
  return asText(
    entity?.translations?.displayOfficialName?.EN ||
    entity?.translations?.displayName?.EN ||
    entity?.translations?.name?.EN ||
    entity?.translations?.shortName?.EN ||
    entity?.internationalName ||
    entity?.teamCode ||
    fallback
  );
}

function teamCode(team) {
  return asText(
    team?.teamCode ||
    team?.translations?.displayTeamCode?.EN ||
    ""
  );
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scorePart(match, side) {
  const total = match?.score?.total?.[side];
  const regular = match?.score?.regular?.[side];
  const status = asText(match?.status).toUpperCase();

  if (status === "SCHEDULED" || status === "PRE" || status === "UPCOMING") return null;
  if (Number.isFinite(Number(total))) return Number(total);
  if (Number.isFinite(Number(regular))) return Number(regular);
  return null;
}

function scorePair(match, key) {
  const value = match?.score?.[key];
  const home = numberOrNull(value?.home);
  const away = numberOrNull(value?.away);
  if (home == null && away == null) return null;
  return { home, away };
}

function winnerTeamId(match, key) {
  return asText(match?.winner?.[key]?.team?.id);
}

function winnerReason(match, key) {
  return asText(match?.winner?.[key]?.reason);
}

function decidedByFromMatch(match) {
  const matchReason = winnerReason(match, "match");
  const aggregateReason = winnerReason(match, "aggregate");
  const hasPenalty = Boolean(scorePair(match, "penalty") || scorePair(match, "penalties"));

  if (hasPenalty || matchReason === "WIN_ON_PENALTIES") return "penalties";
  if (matchReason === "WIN_AFTER_EXTRA_TIME") return "extra_time";
  if (aggregateReason === "WIN_ON_AGGREGATE") return "aggregate";
  if (matchReason === "WIN_REGULAR") return "regular";
  if (matchReason === "DRAW") return "draw";
  return "";
}

function evidenceStatusFromMatch(match) {
  const rawStatus = asText(match?.status).toUpperCase();
  const decidedBy = decidedByFromMatch(match);
  if (rawStatus === "FINISHED" && decidedBy === "penalties") return "PEN";
  if (rawStatus === "FINISHED" && decidedBy === "extra_time") return "AET";
  if (rawStatus === "FINISHED") return "FT";
  if (rawStatus === "SCHEDULED" || rawStatus === "PRE" || rawStatus === "UPCOMING") return "PRE";
  return rawStatus || "UNKNOWN";
}

function roundName(match) {
  return asText(
    match?.round?.translations?.name?.EN ||
    match?.round?.metaData?.name ||
    match?.matchday?.translations?.longName?.EN ||
    match?.matchday?.longName ||
    match?.matchday?.name ||
    ""
  );
}

function matchdayName(match) {
  return asText(
    match?.matchday?.translations?.name?.EN ||
    match?.matchday?.name ||
    ""
  );
}

function stadiumName(match) {
  return asText(
    match?.stadium?.translations?.officialName?.EN ||
    match?.stadium?.translations?.name?.EN ||
    match?.stadium?.translations?.mediaName?.EN ||
    ""
  );
}

function normalizeMatch(match, snapshot, index) {
  const leagueSlug = asText(snapshot.leagueSlug || "uefa.champions");
  const competition = match?.competition || {};
  const kickoff = match?.kickOffTime || {};
  const homeTeam = match?.homeTeam || {};
  const awayTeam = match?.awayTeam || {};

  return {
    evidenceRowId: `${leagueSlug}::uefa-api-match::${asText(match.id) || String(index + 1).padStart(3, "0")}`,
    sourceType: "uefa_fixture_api",
    leagueSlug,
    competitionSlug: leagueSlug,
    competitionId: asText(competition.id),
    competitionCode: asText(competition.code),
    competitionName: asText(competition?.translations?.name?.EN || competition?.metaData?.name),
    seasonYear: asText(match.seasonYear || match?.matchday?.seasonYear),
    matchId: asText(match.id),
    matchNumber: asText(match.matchNumber),
    status: asText(match.status),
    kickoffDate: asText(kickoff.date),
    kickoffUtc: asText(kickoff.dateTime),
    utcOffsetInHours: Number.isFinite(Number(kickoff.utcOffsetInHours)) ? Number(kickoff.utcOffsetInHours) : null,
    homeTeamId: asText(homeTeam.id),
    awayTeamId: asText(awayTeam.id),
    homeTeam: englishName(homeTeam),
    awayTeam: englishName(awayTeam),
    homeTeamCode: teamCode(homeTeam),
    awayTeamCode: teamCode(awayTeam),
    homeCountryCode: asText(homeTeam.countryCode),
    awayCountryCode: asText(awayTeam.countryCode),
    scoreHome: scorePart(match, "home"),
    scoreAway: scorePart(match, "away"),
    regularScore: scorePair(match, "regular"),
    halfTimeScore: scorePair(match, "halfTime") || scorePair(match, "firstHalf") || scorePair(match, "period1"),
    extraTimeScore: scorePair(match, "extraTime"),
    penaltyScore: scorePair(match, "penalty") || scorePair(match, "penalties"),
    aggregateScore: scorePair(match, "aggregate"),
    halfTimeScoreAvailable: Boolean(scorePair(match, "halfTime") || scorePair(match, "firstHalf") || scorePair(match, "period1")),
    halfTimeScoreSourceKey: scorePair(match, "halfTime") ? "halfTime" : (scorePair(match, "firstHalf") ? "firstHalf" : (scorePair(match, "period1") ? "period1" : "")),
    aggregateHome: numberOrNull(match?.score?.aggregate?.home),
    aggregateAway: numberOrNull(match?.score?.aggregate?.away),
    outcomeStatus: evidenceStatusFromMatch(match),
    decidedBy: decidedByFromMatch(match),
    matchWinnerReason: winnerReason(match, "match"),
    aggregateWinnerReason: winnerReason(match, "aggregate"),
    matchWinnerTeamId: winnerTeamId(match, "match"),
    aggregateWinnerTeamId: winnerTeamId(match, "aggregate"),
    roundId: asText(match?.round?.id),
    roundName: roundName(match),
    roundType: asText(match?.round?.metaData?.type),
    matchdayId: asText(match?.matchday?.id),
    matchdayName: matchdayName(match),
    matchdayType: asText(match?.matchday?.type),
    competitionPhase: asText(match.competitionPhase),
    legNumber: Number.isFinite(Number(match?.leg?.number)) ? Number(match.leg.number) : null,
    stadiumId: asText(match?.stadium?.id),
    stadiumName: stadiumName(match),
    stadiumCity: asText(match?.stadium?.city?.translations?.name?.EN),
    stadiumCountryCode: asText(match?.stadium?.countryCode),
    apiCandidateId: asText(snapshot.apiCandidateId),
    apiFamily: asText(snapshot.apiFamily),
    sourceUrl: asText(snapshot.finalUrl || snapshot.candidateUrl),
    fetchedAt: asText(snapshot.fetchedAt),
    acceptedForEvidence: Boolean(match.id && homeTeam && awayTeam && kickoff.dateTime),
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function parseRawText(snapshot) {
  const rawText = asText(snapshot.rawText);
  if (!rawText) return [];

  const parsed = JSON.parse(rawText);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.matches)) return parsed.matches;
  if (Array.isArray(parsed?.data)) return parsed.data;
  if (Array.isArray(parsed?.items)) return parsed.items;
  return [];
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function dateRange(rows) {
  const dates = rows.map((row) => row.kickoffDate).filter(Boolean).sort();
  return {
    firstDate: dates[0] || "",
    lastDate: dates[dates.length - 1] || "",
    uniqueDateCount: new Set(dates).size
  };
}

function buildReport(input, { inputPath = "" } = {}) {
  const snapshots = snapshotsOf(input);
  const rejectedSnapshotRows = [];
  const evidenceRows = [];

  snapshots.forEach((snapshot, snapshotIndex) => {
    if (snapshot.status !== 200 || snapshot.ok !== true) {
      rejectedSnapshotRows.push({
        apiCandidateId: asText(snapshot.apiCandidateId),
        reason: "snapshot_not_200_ok",
        status: snapshot.status,
        ok: snapshot.ok,
        canonicalWrites: 0,
        productionWrite: false
      });
      return;
    }

    let matches = [];
    try {
      matches = parseRawText(snapshot);
    } catch (error) {
      rejectedSnapshotRows.push({
        apiCandidateId: asText(snapshot.apiCandidateId),
        reason: "raw_text_json_parse_failed",
        error: asText(error?.message || error),
        canonicalWrites: 0,
        productionWrite: false
      });
      return;
    }

    matches.forEach((match, matchIndex) => {
      evidenceRows.push(normalizeMatch(match, snapshot, matchIndex + snapshotIndex * 100000));
    });
  });

  const acceptedRows = evidenceRows.filter((row) => row.acceptedForEvidence === true);
  const range = dateRange(acceptedRows);

  return {
    ok: true,
    job: "extract-uefa-fixture-api-evidence-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    summary: {
      inputApiSnapshotCount: snapshots.length,
      evidenceRowCount: evidenceRows.length,
      acceptedEvidenceRowCount: acceptedRows.length,
      rejectedSnapshotCount: rejectedSnapshotRows.length,
      ...range,
      byCompetitionCode: countBy(acceptedRows, "competitionCode"),
      byStatus: countBy(acceptedRows, "status"),
      byRound: countBy(acceptedRows, "roundName"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    evidenceRows,
    rejectedSnapshotRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      extractsOnlyFromProvidedApiSnapshots: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const input = {
    fetchedApiSnapshots: [
      {
        apiCandidateId: "uefa.champions::match-api-competition-season-matches::001",
        leagueSlug: "uefa.champions",
        apiFamily: "match-api-competition-season-matches",
        finalUrl: "https://match.uefa.com/v5/matches?competitionId=1&seasonYear=2026&offset=0&limit=100",
        status: 200,
        ok: true,
        rawText: JSON.stringify([
          {
            id: "2047742",
            seasonYear: "2026",
            status: "FINISHED",
            competition: { id: "1", code: "UCL", metaData: { name: "UEFA Champions League" } },
            kickOffTime: { date: "2026-05-30", dateTime: "2026-05-30T19:00:00Z", utcOffsetInHours: 2 },
            homeTeam: { id: "52747", internationalName: "Paris", teamCode: "PSG" },
            awayTeam: { id: "52280", internationalName: "Arsenal", teamCode: "ARS" },
            score: { total: { home: 1, away: 0 }, regular: { home: 1, away: 0 } },
            winner: { match: { reason: "WIN_REGULAR", team: { id: "52747" } } },
            round: { id: "2002115", metaData: { name: "Final", type: "FINAL" } },
            matchday: { id: "36271", name: "MD17", type: "SINGLE" }
          }
        ]),
        sourceFetch: true,
        canonicalWrites: 0,
        productionWrite: false
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test" });

  if (report.summary.inputApiSnapshotCount !== 1) throw new Error("expected 1 input snapshot");
  if (report.summary.evidenceRowCount !== 1) throw new Error("expected 1 evidence row");
  if (report.summary.acceptedEvidenceRowCount !== 1) throw new Error("expected 1 accepted evidence row");
  if (report.evidenceRows[0].matchId !== "2047742") throw new Error("expected match id");
  if (report.evidenceRows[0].homeTeam !== "Paris") throw new Error("expected home team");
  if (report.evidenceRows[0].awayTeam !== "Arsenal") throw new Error("expected away team");
  if (report.guarantees.sourceFetch !== false || report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "extract-uefa-fixture-api-evidence-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = buildReport(input, { inputPath: args.input });
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport };