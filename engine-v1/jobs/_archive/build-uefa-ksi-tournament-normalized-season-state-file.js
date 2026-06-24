#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE =
  "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09";

const DEFAULT_REPAIRED_INPUT = path.join(
  DEFAULT_BASE,
  "uefa-tier1-isl1-ksi-main-tournament-local-standings-fixtures-extract-repaired-2026-06-09.json"
);

const DEFAULT_SNAPSHOT_INPUT = path.join(
  DEFAULT_BASE,
  "uefa-tier1-isl1-ksi-main-tournament-fetched-snapshot-2026-06-09.json"
);

function parseArgs(argv) {
  const args = {
    repairedInput: DEFAULT_REPAIRED_INPUT,
    snapshotInput: DEFAULT_SNAPSHOT_INPUT,
    output: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repaired-input") {
      args.repairedInput = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--snapshot-input") {
      args.snapshotInput = argv[index + 1] || "";
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

  if (!args.repairedInput) {
    throw new Error("Missing required --repaired-input");
  }

  if (!args.snapshotInput) {
    throw new Error("Missing required --snapshot-input");
  }

  if (!args.output) {
    throw new Error("Missing required --output");
  }

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

function unique(values) {
  return [...new Set(values.map(asText).filter(Boolean))];
}

function sortText(values) {
  return [...values].sort((a, b) => a.localeCompare(b, "en"));
}

function validateInputs(repaired, snapshot) {
  const summary = repaired?.summary || {};
  const guarantees = repaired?.guarantees || {};
  const standingsRows = asArray(repaired?.standingsRows);
  const fixtureRows = asArray(repaired?.fixtureRows);
  const fetchedSnapshots = asArray(snapshot?.fetchedSourceSnapshots);
  const fetched = fetchedSnapshots[0] || {};

  requireEqual(summary.sourceUrl, "https://www.ksi.is/oll-mot/mot?id=7025510", "repaired summary.sourceUrl");
  requireEqual(summary.standingsRowCount, 12, "repaired summary.standingsRowCount");
  requireTrue(summary.standingsUsable, "repaired summary.standingsUsable");
  requireEqual(summary.fixtureRowCount, 5, "repaired summary.fixtureRowCount");
  requireTrue(summary.fixturesUsable, "repaired summary.fixturesUsable");
  requireEqual(summary.firstFixtureDate, "2026-06-14", "repaired summary.firstFixtureDate");
  requireEqual(summary.lastFixtureDate, "2026-06-16", "repaired summary.lastFixtureDate");
  requireEqual(summary.seasonStateCandidate, "active_current_season", "repaired summary.seasonStateCandidate");
  requireEqual(summary.fixtureTruthStateCandidate, "fixtures_available", "repaired summary.fixtureTruthStateCandidate");
  requireEqual(summary.standingsStateCandidate, "official_standings_available", "repaired summary.standingsStateCandidate");
  requireTrue(summary.repairedFixtureExtraction, "repaired summary.repairedFixtureExtraction");
  requireFalse(summary.sourceFetch, "repaired summary.sourceFetch");
  requireTrue(summary.noSearch, "repaired summary.noSearch");
  requireTrue(summary.noFetch, "repaired summary.noFetch");
  requireZero(summary.canonicalWrites, "repaired summary.canonicalWrites");
  requireFalse(summary.productionWrite, "repaired summary.productionWrite");
  requireTrue(summary.dryRun, "repaired summary.dryRun");

  requireFalse(guarantees.sourceFetch, "repaired guarantees.sourceFetch");
  requireTrue(guarantees.noSearch, "repaired guarantees.noSearch");
  requireTrue(guarantees.noFetch, "repaired guarantees.noFetch");
  requireTrue(guarantees.noUrlFetch, "repaired guarantees.noUrlFetch");
  requireTrue(guarantees.usesOnlyExistingLocalDiagnostics, "repaired guarantees.usesOnlyExistingLocalDiagnostics");
  requireZero(guarantees.canonicalWrites, "repaired guarantees.canonicalWrites");
  requireFalse(guarantees.productionWrite, "repaired guarantees.productionWrite");
  requireTrue(guarantees.dryRun, "repaired guarantees.dryRun");
  requireTrue(guarantees.diagnosticOnly, "repaired guarantees.diagnosticOnly");

  requireEqual(standingsRows.length, 12, "standingsRows.length");
  requireEqual(fixtureRows.length, 5, "fixtureRows.length");

  const competitionSlugs = unique([
    ...standingsRows.map((row) => row.competitionSlug),
    ...fixtureRows.map((row) => row.competitionSlug),
  ]);
  requireEqual(competitionSlugs.length, 1, "unique competition slug count");
  requireEqual(competitionSlugs[0], "isl.1", "competition slug");

  const tournamentIds = unique([
    ...standingsRows.map((row) => row.tournamentId),
    ...fixtureRows.map((row) => row.tournamentId),
  ]);
  requireEqual(tournamentIds.length, 1, "unique tournament id count");
  requireEqual(tournamentIds[0], "7025510", "tournament id");

  const expectedTeams = [
    "Breiðablik",
    "FH",
    "Fram",
    "ÍA",
    "KA",
    "KR",
    "Keflavík",
    "Stjarnan",
    "Valur",
    "Víkingur R.",
    "ÍBV",
    "Þór",
  ];
  requireEqual(
    JSON.stringify(sortText(standingsRows.map((row) => row.teamName))),
    JSON.stringify(sortText(expectedTeams)),
    "standing team names"
  );

  const expectedMatchIds = ["7041382", "7041383", "7041384", "7041385", "7041386"];
  requireEqual(
    JSON.stringify(sortText(fixtureRows.map((row) => row.matchId))),
    JSON.stringify(sortText(expectedMatchIds)),
    "fixture match ids"
  );

  const sortedDates = sortText(fixtureRows.map((row) => row.date));
  requireEqual(sortedDates[0], "2026-06-14", "first sorted fixture date");
  requireEqual(sortedDates[sortedDates.length - 1], "2026-06-16", "last sorted fixture date");

  requireEqual(fetchedSnapshots.length, 1, "fetchedSourceSnapshots.length");
  requireEqual(fetched.leagueSlug, "isl.1", "snapshot leagueSlug");
  requireEqual(fetched.candidateUrl, "https://www.ksi.is/oll-mot/mot?id=7025510", "snapshot candidateUrl");
  requireEqual(fetched.finalUrl, "https://www.ksi.is/oll-mot/mot?id=7025510", "snapshot finalUrl");
  requireEqual(fetched.resolvedUrl, "https://www.ksi.is/oll-mot/mot?id=7025510", "snapshot resolvedUrl");
  requireEqual(fetched.status, 200, "snapshot status");
  requireTrue(fetched.ok, "snapshot ok");
  requireEqual(fetched.contentType, "text/html", "snapshot contentType");
  requireZero(fetched.canonicalWrites, "snapshot canonicalWrites");
  requireFalse(fetched.productionWrite, "snapshot productionWrite");

  if (!asText(fetched.rawText)) {
    throw new Error("snapshot rawText is empty");
  }

  if (!asText(fetched.plainText)) {
    throw new Error("snapshot plainText is empty");
  }

  if (!asText(fetched.rawText).includes("7025510")) {
    throw new Error("snapshot rawText does not include tournament id 7025510");
  }

  return {
    summary,
    guarantees,
    standingsRows,
    fixtureRows,
    fetched,
  };
}

function normalizeStanding(row) {
  return {
    competitionSlug: "isl.1",
    source: "ksi",
    sourceFamily: "ksi_tournament_route",
    sourceUrl: "https://www.ksi.is/oll-mot/mot?id=7025510",
    tournamentId: "7025510",
    teamId: asText(row.teamId),
    teamUrl: asText(row.teamUrl),
    teamName: asText(row.teamName),
    rank: Number(row.rank),
    rawCells: asArray(row.rawCells).map(asText),
    numericValues: asArray(row.numericValues),
    rowPlain: asText(row.rowPlain),
  };
}

function normalizeFixture(row) {
  return {
    competitionSlug: "isl.1",
    source: "ksi",
    sourceFamily: "ksi_tournament_route",
    sourceUrl: "https://www.ksi.is/oll-mot/mot?id=7025510",
    tournamentId: "7025510",
    matchId: asText(row.matchId),
    matchUrl: asText(row.matchUrl),
    homeTeam: asText(row.homeTeam),
    awayTeam: asText(row.awayTeam),
    date: asText(row.date),
    kickOffLocal: asText(row.kickOffLocal),
    status: asText(row.status),
    extractionMethod: asText(row.extractionMethod),
  };
}

function buildOutput(repaired, snapshot) {
  const validated = validateInputs(repaired, snapshot);
  const standingsRows = validated.standingsRows.map(normalizeStanding);
  const fixtureRows = validated.fixtureRows.map(normalizeFixture);

  const fixtureDates = sortText(fixtureRows.map((row) => row.date));
  const standingsTeamNames = standingsRows.map((row) => row.teamName);
  const fixtureMatchIds = fixtureRows.map((row) => row.matchId);

  return {
    ok: true,
    job: "build-uefa-ksi-tournament-normalized-season-state-file",
    mode: "read_only_local_diagnostic_normalization",
    generatedAt: new Date().toISOString(),
    schema: {
      name: "uefa_ksi_tournament_normalized_season_state",
      version: 1,
    },
    summary: {
      competitionSlug: "isl.1",
      country: "isl",
      tier: 1,
      source: "ksi",
      sourceFamily: "ksi_tournament_route",
      sourceUrl: "https://www.ksi.is/oll-mot/mot?id=7025510",
      tournamentId: "7025510",
      season: "2026",
      seasonStateCandidate: "active_current_season",
      fixtureTruthStateCandidate: "fixtures_available",
      standingsStateCandidate: "official_standings_available",
      standingsRowCount: standingsRows.length,
      fixtureRowCount: fixtureRows.length,
      firstFixtureDate: fixtureDates[0],
      lastFixtureDate: fixtureDates[fixtureDates.length - 1],
      standingsUsable: true,
      fixturesUsable: true,
      officialStandingsAvailable: true,
      officialFixturesAvailable: true,
      normalizedSeasonStateRowCount: 1,
      normalizedStandingRowCount: standingsRows.length,
      normalizedFixtureRowCount: fixtureRows.length,
      sourceSnapshotCount: 1,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
    },
    normalizedSeasonStateRows: [
      {
        competitionSlug: "isl.1",
        country: "isl",
        tier: 1,
        competitionName: "Icelandic Besta deild karla",
        source: "ksi",
        sourceFamily: "ksi_tournament_route",
        sourceUrl: "https://www.ksi.is/oll-mot/mot?id=7025510",
        tournamentId: "7025510",
        season: "2026",
        seasonStateCandidate: "active_current_season",
        fixtureTruthStateCandidate: "fixtures_available",
        standingsStateCandidate: "official_standings_available",
        firstFixtureDate: fixtureDates[0],
        lastFixtureDate: fixtureDates[fixtureDates.length - 1],
        standingsRowCount: standingsRows.length,
        fixtureRowCount: fixtureRows.length,
        evidence: {
          standingsTeamNames,
          fixtureMatchIds,
          fetchedAt: asText(validated.fetched.fetchedAt),
          finalUrl: asText(validated.fetched.finalUrl),
          contentType: asText(validated.fetched.contentType),
          rawTextLength: asText(validated.fetched.rawText).length,
          plainTextLength: asText(validated.fetched.plainText).length,
        },
      },
    ],
    normalizedStandingRows: standingsRows,
    normalizedFixtureRows: fixtureRows,
    sourceSnapshots: [
      {
        leagueSlug: asText(validated.fetched.leagueSlug),
        sourceFamily: asText(validated.fetched.sourceFamily),
        sourceCandidateType: asText(validated.fetched.sourceCandidateType),
        trustTier: asText(validated.fetched.trustTier),
        candidateUrl: asText(validated.fetched.candidateUrl),
        finalUrl: asText(validated.fetched.finalUrl),
        resolvedUrl: asText(validated.fetched.resolvedUrl),
        status: validated.fetched.status,
        ok: validated.fetched.ok,
        fetchedAt: asText(validated.fetched.fetchedAt),
        contentType: asText(validated.fetched.contentType),
        rawTextLength: asText(validated.fetched.rawText).length,
        plainTextLength: asText(validated.fetched.plainText).length,
        canonicalWrites: validated.fetched.canonicalWrites,
        productionWrite: validated.fetched.productionWrite,
      },
    ],
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyExistingLocalDiagnostics: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true,
    },
  };
}

function main() {
  const args = parseArgs(process.argv);
  const repaired = readJson(args.repairedInput);
  const snapshot = readJson(args.snapshotInput);
  const output = buildOutput(repaired, snapshot);

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
