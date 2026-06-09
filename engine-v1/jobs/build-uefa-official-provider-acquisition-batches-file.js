#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseList(value) {
  return asText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    priorityTier: 0,
    maxCountryCount: 0,
    includeTypes: [],
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--input" && argv[index + 1]) {
      args.input = argv[++index];
    } else if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length);
    } else if (arg === "--output" && argv[index + 1]) {
      args.output = argv[++index];
    } else if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
    } else if (arg === "--priority-tier" && argv[index + 1]) {
      args.priorityTier = Number(argv[++index] || 0);
    } else if (arg.startsWith("--priority-tier=")) {
      args.priorityTier = Number(arg.slice("--priority-tier=".length) || 0);
    } else if (arg === "--max-country-count" && argv[index + 1]) {
      args.maxCountryCount = Number(argv[++index] || 0);
    } else if (arg.startsWith("--max-country-count=")) {
      args.maxCountryCount = Number(arg.slice("--max-country-count=".length) || 0);
    } else if (arg === "--include-types" && argv[index + 1]) {
      args.includeTypes = parseList(argv[++index]);
    } else if (arg.startsWith("--include-types=")) {
      args.includeTypes = parseList(arg.slice("--include-types=".length));
    }
  }

  return args;
}

function rowsOf(input) {
  if (Array.isArray(input)) return input;
  for (const key of ["actionableRows", "rows", "items"]) {
    if (Array.isArray(input && input[key])) return input[key];
  }
  return [];
}

function countBy(rows, keyOrFn) {
  const out = {};
  for (const row of rows) {
    const key = typeof keyOrFn === "function" ? keyOrFn(row) : row[keyOrFn];
    const text = asText(key) || "unknown";
    out[text] = (out[text] || 0) + 1;
  }
  return out;
}

function acquisitionModeFor(row) {
  const type = asText(row.competitionType);
  if (type === "league") return "official_league_calendar_and_standings_route";
  if (type === "cup") return "official_cup_phase_calendar_final_winner_route";
  if (type === "continental") return "official_uefa_calendar_phase_route";
  return "official_route_required";
}

function routeSurfaceHints(row) {
  const type = asText(row.competitionType);
  if (type === "league") {
    return [
      "official league/federation competition page",
      "fixtures/calendar page",
      "standings/table page",
      "results page",
      "season marker or current round marker"
    ];
  }
  if (type === "cup") {
    return [
      "official federation cup page",
      "round/calendar page",
      "final result page",
      "winner or completed marker"
    ];
  }
  if (type === "continental") {
    return [
      "official UEFA competition page",
      "matches/calendar page",
      "qualifying/group phase dates",
      "season marker"
    ];
  }
  return ["official competition route"];
}

function normalizeRow(row) {
  const countryKey = asText(row.countryKey || asText(row.competitionSlug).split(".")[0]);
  const competitionType = asText(row.competitionType);

  return {
    competitionSlug: asText(row.competitionSlug),
    competitionName: asText(row.competitionName),
    competitionType,
    countryKey,
    priorityTier: Number(row.priorityTier || 0),
    acquisitionMode: acquisitionModeFor(row),
    routeSurfaceHints: routeSurfaceHints(row),
    requiredEvidence: asArray(row.requiredEvidence),
    currentKnownState: asText(row.currentKnownState),
    nextAction: asText(row.nextAction),
    needsFixtureAcquisition: row.needsFixtureAcquisition === true,
    needsStandingsRefresh: row.needsStandingsRefresh === true,
    needsSeasonStatus: row.needsSeasonStatus === true,
    needsFTRepair: row.needsFTRepair === true,
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildBatches(input, options = {}) {
  const includeTypes = new Set(asArray(options.includeTypes).map(asText).filter(Boolean));
  const priorityTier = Number(options.priorityTier || 0);
  const maxCountryCount = Number(options.maxCountryCount || 0);

  let actionableRows = rowsOf(input)
    .filter((row) => asText(row.competitionSlug))
    .filter((row) => row.closedOrAlreadyHandled !== true)
    .filter((row) => ![
      "already_validated_do_not_search_again",
      "winner_final_done_do_not_search_again",
      "blocked_hold_do_not_retry_aggressively"
    ].includes(asText(row.nextAction)))
    .map(normalizeRow);

  if (priorityTier > 0) {
    actionableRows = actionableRows.filter((row) => Number(row.priorityTier || 0) === priorityTier);
  }

  if (includeTypes.size > 0) {
    actionableRows = actionableRows.filter((row) => includeTypes.has(asText(row.competitionType)));
  }

  actionableRows.sort((a, b) =>
    Number(a.priorityTier || 0) - Number(b.priorityTier || 0) ||
    asText(a.countryKey).localeCompare(asText(b.countryKey)) ||
    asText(a.competitionType).localeCompare(asText(b.competitionType)) ||
    asText(a.competitionSlug).localeCompare(asText(b.competitionSlug))
  );

  const countryKeys = [...new Set(actionableRows.map((row) => row.countryKey))]
    .sort((a, b) => {
      if (a === "uefa") return -1;
      if (b === "uefa") return 1;
      return a.localeCompare(b);
    });

  const selectedCountryKeys = maxCountryCount > 0
    ? countryKeys.slice(0, maxCountryCount)
    : countryKeys;

  const selectedRows = actionableRows.filter((row) => selectedCountryKeys.includes(row.countryKey));

  const batches = selectedCountryKeys.map((countryKey, index) => {
    const rows = selectedRows.filter((row) => row.countryKey === countryKey);
    const minTier = Math.min(...rows.map((row) => Number(row.priorityTier || 99)));

    return {
      batchId: [
        "uefa-official-provider-acquisition",
        `tier${priorityTier || minTier}`,
        String(index + 1).padStart(3, "0"),
        countryKey
      ].join("::"),
      countryKey,
      priorityTier: priorityTier || minTier,
      competitionCount: rows.length,
      byCompetitionType: countBy(rows, "competitionType"),
      acquisitionRows: rows,
      guarantees: {
        sourceFetch: false,
        noSearch: true,
        noGenericSearch: true,
        noFetch: true,
        canonicalWrites: 0,
        productionWrite: false,
        diagnosticOnly: true
      }
    };
  });

  return {
    ok: true,
    job: "build-uefa-official-provider-acquisition-batches-file",
    generatedAt: new Date().toISOString(),
    scope: "uefa_europe_only",
    options: {
      priorityTier,
      maxCountryCount,
      includeTypes: [...includeTypes]
    },
    summary: {
      sourceActionableRowCount: actionableRows.length,
      selectedCountryCount: selectedCountryKeys.length,
      selectedAcquisitionRowCount: selectedRows.length,
      batchCount: batches.length,
      byCompetitionType: countBy(selectedRows, "competitionType"),
      byPriorityTier: countBy(selectedRows, (row) => String(row.priorityTier || "unknown")),
      byCountry: countBy(selectedRows, "countryKey"),
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false,
      noGenericSearch: true,
      dryRun: true
    },
    batches,
    acquisitionRows: selectedRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noGenericSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function runSelfTest() {
  const report = buildBatches({
    actionableRows: [
      {
        competitionSlug: "aut.1",
        competitionName: "Austrian Bundesliga",
        competitionType: "league",
        countryKey: "aut",
        priorityTier: 1,
        nextAction: "acquire_official_league_calendar_and_standings_route"
      },
      {
        competitionSlug: "aut.cup",
        competitionName: "Austrian Cup",
        competitionType: "cup",
        countryKey: "aut",
        priorityTier: 3,
        nextAction: "acquire_official_cup_phase_calendar_final_winner_route"
      },
      {
        competitionSlug: "uefa.champions",
        competitionName: "UEFA Champions League",
        competitionType: "continental",
        countryKey: "uefa",
        priorityTier: 1,
        nextAction: "acquire_official_uefa_calendar_phase_route"
      },
      {
        competitionSlug: "bel.cup",
        competitionName: "Bel Cup",
        competitionType: "cup",
        countryKey: "bel",
        priorityTier: 9,
        nextAction: "winner_final_done_do_not_search_again",
        closedOrAlreadyHandled: true
      }
    ]
  }, {
    priorityTier: 1,
    includeTypes: ["league", "continental"]
  });

  if (report.summary.selectedAcquisitionRowCount !== 2) {
    throw new Error(`expected 2 selected rows, got ${report.summary.selectedAcquisitionRowCount}`);
  }
  if (report.summary.batchCount !== 2) {
    throw new Error(`expected 2 batches, got ${report.summary.batchCount}`);
  }
  if (report.acquisitionRows.some((row) => row.competitionSlug === "bel.cup")) {
    throw new Error("closed rows must be excluded");
  }
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("must remain read-only");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "build-uefa-official-provider-acquisition-batches-file",
    summary: report.summary
  }, null, 2));
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const input = readJson(args.input);
  const report = buildBatches(input, args);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    job: report.job,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
}
