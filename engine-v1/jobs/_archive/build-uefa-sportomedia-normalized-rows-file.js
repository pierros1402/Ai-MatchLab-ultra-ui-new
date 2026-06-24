#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE =
  "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09";

const DEFAULT_INPUT = path.join(
  DEFAULT_BASE,
  "sportomedia-graphql-controlled-fetch-2026-06-09.json"
);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input") {
      args.input = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--output") {
      args.output = argv[index + 1] || "";
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.input) throw new Error("Missing required --input");
  if (!args.output) throw new Error("Missing required --output");

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
}

function unique(values) {
  return [...new Set(values.map(asText).filter(Boolean))].sort();
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireTrue(value, label) {
  if (value !== true) {
    throw new Error(`${label}: expected true, got ${JSON.stringify(value)}`);
  }
}

function requireFalse(value, label) {
  if (value !== false) {
    throw new Error(`${label}: expected false, got ${JSON.stringify(value)}`);
  }
}

function requireZero(value, label) {
  if (value !== 0) {
    throw new Error(`${label}: expected 0, got ${JSON.stringify(value)}`);
  }
}

function isoOrRaw(value) {
  const text = asText(value);
  if (!text) return "";

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return text;
}

function isFutureKickoff(value) {
  const parsed = new Date(asText(value));
  if (Number.isNaN(parsed.getTime())) return false;

  return parsed.getTime() > Date.now() + 2 * 60 * 60 * 1000;
}

function hasMeaningfulScore(match) {
  return normalizeScore(match.homeTeamScore) !== null && normalizeScore(match.visitingTeamScore) !== null;
}

function hasMeaningfulMatchMinute(match) {
  const minute = Number(asText(match.matchMinute));
  return Number.isFinite(minute) && minute > 0;
}

function normalizedStatus(match) {
  const status = asText(match.status).toUpperCase();
  const extendedStatus = asText(match.extendedStatus).toUpperCase();

  if (status === "FINISHED" || extendedStatus === "FINISHED") return "finished";
  if (status === "PLAYED" || extendedStatus === "PLAYED") return "finished";
  if (status === "POSTPONED" || extendedStatus === "POSTPONED") return "postponed";
  if (status === "CANCELLED" || extendedStatus === "CANCELLED") return "cancelled";

  if (!hasMeaningfulScore(match) && isFutureKickoff(match.startDate)) {
    return "scheduled";
  }

  if (status === "ONGOING" || extendedStatus === "ONGOING" || hasMeaningfulMatchMinute(match)) {
    return "live";
  }

  return "scheduled";
}

function normalizeScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function deriveOutcome(match) {
  const homeScore = normalizeScore(match.homeTeamScore);
  const awayScore = normalizeScore(match.visitingTeamScore);

  if (homeScore === null || awayScore === null) {
    return "";
  }

  if (homeScore > awayScore) return "home_win";
  if (homeScore < awayScore) return "away_win";
  return "draw";
}

function normalizeMatch(leagueSlug, match) {
  const status = normalizedStatus(match);

  return {
    competitionSlug: leagueSlug,
    sourceFamily: "sportomedia_graphql_widget",
    sourceProvider: "sportomedia",
    sourceKind: "official_graphql_matchesForLeague",
    matchId: asText(match.id),
    round: asText(match.round),
    startDateRaw: asText(match.startDate),
    startDateIso: isoOrRaw(match.startDate),
    homeTeamName: asText(match.homeTeamName),
    awayTeamName: asText(match.visitingTeamName),
    homeTeamAbbrv: asText(match.homeTeamAbbrv),
    awayTeamAbbrv: asText(match.visitingTeamAbbrv),
    homeTeamScore: normalizeScore(match.homeTeamScore),
    awayTeamScore: normalizeScore(match.visitingTeamScore),
    statusRaw: asText(match.status),
    extendedStatusRaw: asText(match.extendedStatus),
    normalizedStatus: status,
    outcome: status === "finished" ? deriveOutcome(match) : "",
    arenaName: asText(match.arenaName),
    configLeagueName: asText(match.configLeagueName),
    leagueName: asText(match.leagueName),
    cacheVersion: asText(match.cacheVersion),
    everySportId: asText(match.everySportId),
    fogisId: asText(match.fogisId),
    homeTeamEverySportId: asText(match.homeTeamEverySportId),
    homeTeamFogisId: asText(match.homeTeamFogisId),
    awayTeamEverySportId: asText(match.visitingTeamEverySportId),
    awayTeamFogisId: asText(match.visitingTeamFogisId),
  };
}

function statMap(stats) {
  const out = {};

  for (const stat of asArray(stats)) {
    const name = asText(stat.name);
    if (!name) continue;
    out[name] = stat.value;
  }

  return out;
}

function normalizeStanding(leagueSlug, row) {
  return {
    competitionSlug: leagueSlug,
    sourceFamily: "sportomedia_graphql_widget",
    sourceProvider: "sportomedia",
    sourceKind: "official_graphql_StandingsForLeague",
    position: Number(row.position),
    previousPosition: row.previousPosition === null || row.previousPosition === undefined ? null : Number(row.previousPosition),
    teamName: asText(row.teamName),
    teamAbbrv: asText(row.teamAbbrv),
    teamId: asText(row.teamId),
    borderType: asText(row.borderType),
    stats: statMap(row.stats),
    recentFormCount: asArray(row.form).length,
    form: asArray(row.form).map((match) => ({
      id: asText(match.id),
      round: asText(match.round),
      startDateRaw: asText(match.startDate),
      startDateIso: isoOrRaw(match.startDate),
      homeTeamName: asText(match.homeTeamName),
      awayTeamName: asText(match.visitingTeamName),
      homeTeamScore: normalizeScore(match.homeTeamScore),
      awayTeamScore: normalizeScore(match.visitingTeamScore),
      matchResult: asText(match.matchResult),
    })),
  };
}

function validateInput(input) {
  requireTrue(input.ok, "input ok");
  requireEqual(input.summary?.requestRowCount, 4, "input requestRowCount");
  requireEqual(input.summary?.responseRowCount, 4, "input responseRowCount");
  requireEqual(input.summary?.okResponseCount, 4, "input okResponseCount");
  requireEqual(input.summary?.errorResponseCount, 0, "input errorResponseCount");
  requireEqual(input.summary?.matchCounts?.["swe.1"], 240, "input swe.1 match count");
  requireEqual(input.summary?.matchCounts?.["swe.2"], 240, "input swe.2 match count");
  requireEqual(input.summary?.standingsCounts?.["swe.1"], 16, "input swe.1 standings count");
  requireEqual(input.summary?.standingsCounts?.["swe.2"], 16, "input swe.2 standings count");
  requireTrue(input.guarantees?.controlledFetch, "input controlledFetch");
  requireTrue(input.guarantees?.noSearch, "input noSearch");
  requireFalse(input.guarantees?.inventedUrls, "input inventedUrls");
  requireZero(input.guarantees?.canonicalWrites, "input canonicalWrites");
  requireFalse(input.guarantees?.productionWrite, "input productionWrite");
}

function buildOutput(input) {
  validateInput(input);

  const responseRows = asArray(input.responseRows);
  const matchRows = [];
  const standingsRows = [];

  for (const responseRow of responseRows) {
    const leagueSlug = asText(responseRow.leagueSlug);
    const operationName = asText(responseRow.operationName);
    const json = responseRow.response?.json;

    if (operationName === "matchesForLeague") {
      const matches = asArray(json?.data?.matchesForLeague?.matches);
      for (const match of matches) {
        matchRows.push(normalizeMatch(leagueSlug, match));
      }
      continue;
    }

    if (operationName === "StandingsForLeague") {
      const standings = asArray(json?.data?.standingsForLeague?.standings);
      for (const standing of standings) {
        standingsRows.push(normalizeStanding(leagueSlug, standing));
      }
      continue;
    }
  }

  const allSlugs = unique([...matchRows.map((row) => row.competitionSlug), ...standingsRows.map((row) => row.competitionSlug)]);
  requireEqual(JSON.stringify(allSlugs), JSON.stringify(["swe.1", "swe.2"]), "normalized slugs");
  requireEqual(matchRows.length, 480, "normalized match row count");
  requireEqual(standingsRows.length, 32, "normalized standings row count");

  const finishedRows = matchRows.filter((row) => row.normalizedStatus === "finished");
  const scheduledRows = matchRows.filter((row) => row.normalizedStatus === "scheduled");
  const resultRows = finishedRows.filter((row) => row.homeTeamScore !== null && row.awayTeamScore !== null);

  const byCompetition = allSlugs.reduce((acc, slug) => {
    const leagueMatches = matchRows.filter((row) => row.competitionSlug === slug);
    const leagueStandings = standingsRows.filter((row) => row.competitionSlug === slug);

    acc[slug] = {
      matchRowCount: leagueMatches.length,
      resultRowCount: leagueMatches.filter((row) => row.normalizedStatus === "finished").length,
      scheduledRowCount: leagueMatches.filter((row) => row.normalizedStatus === "scheduled").length,
      standingsRowCount: leagueStandings.length,
      byStatus: countBy(leagueMatches, "normalizedStatus"),
      firstStartDateIso: unique(leagueMatches.map((row) => row.startDateIso))[0] || "",
      lastStartDateIso: unique(leagueMatches.map((row) => row.startDateIso)).at(-1) || "",
      seasonState:
        leagueMatches.some((row) => row.normalizedStatus === "scheduled" || row.normalizedStatus === "live")
          ? "active_current_season"
          : "completed_current_season",
      officialStandingsAvailable: leagueStandings.length > 0,
      fixturesAvailable: leagueMatches.length > 0,
    };

    return acc;
  }, {});

  return {
    ok: true,
    job: "build-uefa-sportomedia-normalized-rows-file",
    mode: "read_only_sportomedia_graphql_normalization",
    generatedAt: new Date().toISOString(),
    schema: {
      name: "uefa_sportomedia_normalized_rows",
      version: 1,
    },
    summary: {
      inputResponseRowCount: responseRows.length,
      normalizedMatchRowCount: matchRows.length,
      normalizedResultRowCount: resultRows.length,
      normalizedScheduledRowCount: scheduledRows.length,
      normalizedStandingsRowCount: standingsRows.length,
      normalizedSlugCount: allSlugs.length,
      normalizedSlugs: allSlugs,
      byCompetition,
      byStatus: countBy(matchRows, "normalizedStatus"),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
    },
    normalizedMatchRows: matchRows,
    normalizedResultRows: resultRows,
    normalizedFixtureRows: matchRows,
    normalizedStandingsRows: standingsRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyExistingSportomediaGraphqlDiagnostic: true,
      inventedUrls: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true,
    },
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const output = buildOutput(input);

  writeJson(args.output, output);

  console.log(
    JSON.stringify(
      {
        ok: output.ok,
        output: args.output,
        summary: output.summary,
        guarantees: output.guarantees,
      },
      null,
      2
    )
  );
}

main();
