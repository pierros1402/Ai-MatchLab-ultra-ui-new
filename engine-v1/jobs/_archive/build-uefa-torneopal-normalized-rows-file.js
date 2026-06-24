#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    input: "",
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

  if (!args.input) {
    throw new Error("Missing required --input");
  }

  if (!args.output) {
    throw new Error("Missing required --output");
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildStartTime(match) {
  const date = stringValue(match.date);
  const time = stringValue(match.time);

  if (!date) {
    return "";
  }

  if (!time) {
    return date;
  }

  return `${date}T${time}`;
}

function isMeaningfulText(value) {
  const text = stringValue(value).trim();
  return text !== "" && text !== "0" && text.toLowerCase() !== "null";
}

function inferStatus(match) {
  const status = stringValue(match.status).toLowerCase();
  const reportResult = stringValue(match.report_result);
  const fsA = numberOrNull(match.fs_A);
  const fsB = numberOrNull(match.fs_B);
  const winner = stringValue(match.winner).trim();
  const winnerId = stringValue(match.winner_id).trim();

  if (status.includes("fixture") || status.includes("planned") || status.includes("scheduled")) {
    return "scheduled";
  }

  if (status.includes("live")) {
    return "live";
  }

  if (status.includes("played") || status.includes("finished") || status.includes("forfeited")) {
    return "finished";
  }

  if (reportResult === "1") {
    return "finished";
  }

  if (isMeaningfulText(winner) || isMeaningfulText(winnerId)) {
    return "finished";
  }

  if (fsA !== null && fsB !== null) {
    return "finished";
  }

  if (status.includes("published")) {
    return "scheduled";
  }

  return status || "unknown";
}

function normalizeMatch(match, competitionSlug, sourceRow) {
  const normalizedStatus = inferStatus(match);
  const homeScore = numberOrNull(match.fs_A);
  const awayScore = numberOrNull(match.fs_B);

  return {
    competitionSlug,
    sourceProvider: "palloliitto_torneopal",
    sourceKind: "Palloliitto/Torneopal getMatches",
    sourceKeyName: stringValue(sourceRow.keyName),
    sourceMatchId: stringValue(match.match_id),
    sourceMatchNumber: stringValue(match.match_number),
    seasonId: stringValue(match.season_id),
    competitionId: stringValue(match.competition_id),
    categoryId: stringValue(match.category_id),
    categoryName: stringValue(match.category_name),
    competitionName: stringValue(match.competition_name),
    phaseId: stringValue(match.phase_id),
    phaseName: stringValue(match.phase_name),
    groupId: stringValue(match.group_id),
    groupName: stringValue(match.group_name),
    roundId: stringValue(match.round_id),
    roundName: stringValue(match.round_name),
    date: stringValue(match.date),
    time: stringValue(match.time),
    startTime: buildStartTime(match),
    venueName: stringValue(match.venue_name),
    venueCityName: stringValue(match.venue_city_name),
    homeTeamId: stringValue(match.team_A_id),
    homeTeamName: stringValue(match.team_A_name),
    awayTeamId: stringValue(match.team_B_id),
    awayTeamName: stringValue(match.team_B_name),
    homeScore,
    awayScore,
    halfTimeHomeScore: numberOrNull(match.hts_A),
    halfTimeAwayScore: numberOrNull(match.hts_B),
    penaltyHomeScore: numberOrNull(match.ps_A),
    penaltyAwayScore: numberOrNull(match.ps_B),
    winner: isMeaningfulText(match.winner) ? stringValue(match.winner) : "",
    winnerId: isMeaningfulText(match.winner_id) ? stringValue(match.winner_id) : "",
    status: stringValue(match.status),
    normalizedStatus,
    officiality: stringValue(match.competition_officiality),
    competitionStatus: stringValue(match.competition_status),
    lastModified: stringValue(match.last_modified),
    rawHasResult: homeScore !== null && awayScore !== null,
    rawPayloadPath: stringValue(sourceRow.rawPayloadPath),
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const selectedRows = asArray(input.selectedRows);

  if (selectedRows.length === 0) {
    throw new Error("Input has no selectedRows");
  }

  const normalizedRows = [];

  for (const selectedRow of selectedRows) {
    const competitionSlug = stringValue(selectedRow.competitionSlug);
    const rawPayloadPath = stringValue(selectedRow.rawPayloadPath);

    if (!competitionSlug) {
      throw new Error("Selected row is missing competitionSlug");
    }

    if (!rawPayloadPath) {
      throw new Error(`Selected row for ${competitionSlug} is missing rawPayloadPath`);
    }

    if (!fs.existsSync(rawPayloadPath)) {
      throw new Error(`Raw payload path does not exist for ${competitionSlug}: ${rawPayloadPath}`);
    }

    const rawPayload = readJson(rawPayloadPath);
    const matches = asArray(rawPayload.matches);

    if (matches.length === 0) {
      throw new Error(`Raw payload has no matches for ${competitionSlug}`);
    }

    for (const match of matches) {
      normalizedRows.push(normalizeMatch(match, competitionSlug, selectedRow));
    }
  }

  const fixtureRows = normalizedRows;
  const resultRows = normalizedRows.filter((row) => row.normalizedStatus === "finished" || row.rawHasResult);
  const scheduledRows = normalizedRows.filter((row) => row.normalizedStatus === "scheduled");

  const invalidRows = normalizedRows.filter((row) => {
    return (
      !row.competitionSlug ||
      !row.sourceMatchId ||
      !row.homeTeamName ||
      !row.awayTeamName ||
      !row.date
    );
  });

  const slugCounts = {};
  for (const row of normalizedRows) {
    slugCounts[row.competitionSlug] = (slugCounts[row.competitionSlug] || 0) + 1;
  }

  const summary = {
    ok: invalidRows.length === 0,
    generatedAt: new Date().toISOString(),
    selectedInputRowCount: selectedRows.length,
    normalizedFixtureRowCount: fixtureRows.length,
    normalizedResultRowCount: resultRows.length,
    normalizedScheduledRowCount: scheduledRows.length,
    invalidRowCount: invalidRows.length,
    finCupRowCount: slugCounts["fin.cup"] || 0,
    fin2RowCount: slugCounts["fin.2"] || 0,
    conclusion:
      invalidRows.length === 0
        ? "Torneopal full payloads normalized into read-only fixture/result rows. These are not canonical rows."
        : "Some Torneopal rows failed minimal normalization validation.",
    sourceFetch: false,
    noSearch: true,
    noFetch: true,
    noPost: true,
    noPatch: true,
    noCanonicalPromotion: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
  };

  const output = {
    ok: summary.ok,
    generatedAt: summary.generatedAt,
    summary,
    normalizedFixtureRows: fixtureRows,
    normalizedResultRows: resultRows,
    normalizedScheduledRows: scheduledRows,
    invalidRows,
    guarantees: {
      sourceFetch: false,
      searchUsed: false,
      noSearch: true,
      noFetch: true,
      noPost: true,
      noPatch: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true,
    },
  };

  writeJson(args.output, output);
}

main();
