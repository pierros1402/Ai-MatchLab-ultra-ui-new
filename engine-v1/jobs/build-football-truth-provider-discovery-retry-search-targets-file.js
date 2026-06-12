#!/usr/bin/env node

import fs from "fs";
import path from "path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    input: "",
    output: "",
    limitCompetitions: 0,
    queriesPerCompetition: 3
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else if (arg === "--limit-competitions") args.limitCompetitions = Number(argv[++index]);
    else if (arg === "--queries-per-competition") args.queriesPerCompetition = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.limitCompetitions) || args.limitCompetitions < 0) {
    throw new Error(`Invalid --limit-competitions: ${args.limitCompetitions}`);
  }

  if (!Number.isInteger(args.queriesPerCompetition) || args.queriesPerCompetition <= 0) {
    throw new Error(`Invalid --queries-per-competition: ${args.queriesPerCompetition}`);
  }

  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = asText(keyFn(row)) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function unique(values) {
  return Array.from(new Set(values.map(asText).filter(Boolean)));
}

function retryRowsFrom(input) {
  const rows = asArray(input.retryRows);
  if (rows.length > 0) return rows;

  const candidates = asArray(input.rows);
  if (candidates.length > 0) return candidates;

  return [];
}

function rowQueryList(row) {
  return unique(asArray(row.retryQueries));
}

function buildRetrySearchTarget(row, query, queryIndex) {
  const leagueSlug = asText(row.leagueSlug);
  const searchName = asText(row.searchName);
  const searchTargetId = [
    "provider-discovery-retry",
    leagueSlug,
    asText(row.retryClass) || "retry",
    String(queryIndex + 1).padStart(3, "0")
  ].join(":");

  return {
    searchTargetId,
    sourceRetrySearchTargetId: asText(row.searchTargetId),
    targetType: "provider_discovery_retry_search",
    searchMode: "official_provider_discovery_retry",
    leagueSlug,
    competitionSlug: leagueSlug,
    competitionName: searchName,
    name: searchName,
    searchName,
    nameSource: asText(row.nameSource),
    nameConfidence: asText(row.nameConfidence),
    country: asText(row.country),
    region: asText(row.region),
    coverageTier: row.tier ?? null,
    competitionType: "league",
    seasonState: asText(row.seasonState || "unknown"),
    priorityBand: asText(row.priorityBand || "retry"),
    retryClass: asText(row.retryClass),
    retryReason: asText(row.retryReason),
    retryQueryIndex: queryIndex,
    query,
    queries: [query],
    intent: "official_standings_provider_discovery_retry",
    queryIntent: "official_standings_provider_discovery_retry",
    expectedSourceFamily: "official_football_competition_or_federation",
    expectedEvidence: [
      "official source identity",
      "standings/table page or structured endpoint",
      "competition/country identity match",
      "season/current-state marker where available"
    ],
    rejectIf: [
      "aggregator-only evidence without official source",
      "advertising/login/commerce/noisy provider domain",
      "fixture-only page with no standings/table evidence",
      "stale season page without season marker",
      "wrong country/competition identity"
    ],
    officialHintHosts: asText(row.officialHintHosts)
      .split(";")
      .map(asText)
      .filter(Boolean),
    sourceFetch: false,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    metadata: {
      originatingJob: "build-football-truth-provider-discovery-retry-strategy-plan-file",
      fallbackNamesAreSearchHintsNotTruthValues: true,
      retryRowsAreSearchHints: true,
      originalQuery: asText(row.originalQuery),
      providerBlockedAttemptCount: Number(row.providerBlockedAttemptCount || 0),
      providerZeroResultAttemptCount: Number(row.providerZeroResultAttemptCount || 0)
    }
  };
}

function buildProviderDiscoveryRetrySearchTargets(input, options = {}) {
  const allRetryRows = retryRowsFrom(input);
  const selectedRetryRows = options.limitCompetitions > 0
    ? allRetryRows.slice(0, options.limitCompetitions)
    : allRetryRows;

  const queriesPerCompetition = options.queriesPerCompetition || 3;
  const searchTargetRows = [];

  for (const row of selectedRetryRows) {
    const queries = rowQueryList(row).slice(0, queriesPerCompetition);

    for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
      searchTargetRows.push(buildRetrySearchTarget(row, queries[queryIndex], queryIndex));
    }
  }

  return {
    ok: true,
    job: "build-football-truth-provider-discovery-retry-search-targets-file",
    mode: "read_only_provider_discovery_retry_search_target_derivation",
    generatedAt: new Date().toISOString(),
    inputSummary: input.summary || {},
    selection: {
      requestedLimitCompetitions: options.limitCompetitions || 0,
      selectedCompetitionCount: selectedRetryRows.length,
      queriesPerCompetition,
      expandedSearchTargetCount: searchTargetRows.length
    },
    summary: {
      inputRetryRowCount: allRetryRows.length,
      selectedRetryRowCount: selectedRetryRows.length,
      searchTargetCount: searchTargetRows.length,
      byRetryClass: countBy(searchTargetRows, (row) => row.retryClass),
      byNameSource: countBy(searchTargetRows, (row) => row.nameSource),
      byNameConfidence: countBy(searchTargetRows, (row) => row.nameConfidence),
      byRegion: countBy(searchTargetRows, (row) => row.region),
      totalQueryCount: searchTargetRows.length,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    searchTargetRows,
    candidateTargetRows: searchTargetRows,
    policy: {
      purpose: "Expand provider-discovery retry strategy rows into runner-compatible one-query-per-target search rows.",
      inputContract: "Consumes build-football-truth-provider-discovery-retry-strategy-plan-file output.",
      runnerContract: "Compatible with run-fixture-league-date-autonomous-search-batches-file via searchTargetRows.",
      fallbackNamesAreSearchHintsNotTruthValues: true,
      noSearch: true,
      noFetch: true,
      noCanonicalWrite: true,
      noProductionWrite: true,
      noSingleLeagueDrift: true
    },
    guarantees: {
      noSearch: true,
      noFetch: true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      fallbackNamesAreSearchHintsNotTruthValues: true,
      searchRequiresExplicitAllowSearch: true,
      batchBased: true
    }
  };
}

function runSelfTest() {
  const input = {
    summary: {
      retryAttemptCount: 2
    },
    retryRows: [
      {
        searchTargetId: "source:ang.1",
        leagueSlug: "ang.1",
        searchName: "Angola top division",
        nameSource: "country_tier_fallback",
        nameConfidence: "low",
        country: "Angola",
        region: "africa",
        tier: 1,
        retryClass: "parser_zero_results_needs_retry",
        retryReason: "retry parser zero result",
        originalQuery: "Angola football federation official standings",
        retryQueries: [
          "Angola football federation official standings",
          "\"Angola top division\" official standings",
          "\"Angola top division\" official table"
        ],
        officialHintHosts: "",
        providerZeroResultAttemptCount: 2
      },
      {
        searchTargetId: "source:alb.2",
        leagueSlug: "alb.2",
        searchName: "Albanian First Division",
        nameSource: "registryName",
        nameConfidence: "medium",
        country: "Albania",
        region: "europe",
        tier: 2,
        retryClass: "provider_blocked_or_zero_results_needs_retry",
        retryReason: "retry blocked provider",
        originalQuery: "Albanian First Division official standings",
        retryQueries: [
          "Albanian First Division official standings",
          "\"Albanian First Division\" official table"
        ],
        officialHintHosts: "fshf.org",
        providerBlockedAttemptCount: 1
      }
    ]
  };

  const report = buildProviderDiscoveryRetrySearchTargets(input, {
    limitCompetitions: 1,
    queriesPerCompetition: 2
  });

  if (report.summary.inputRetryRowCount !== 2) {
    throw new Error("Self-test expected 2 input retry rows");
  }

  if (report.summary.selectedRetryRowCount !== 1) {
    throw new Error("Self-test expected 1 selected retry row");
  }

  if (report.summary.searchTargetCount !== 2) {
    throw new Error("Self-test expected 2 expanded search targets");
  }

  const first = report.searchTargetRows[0];
  if (first.leagueSlug !== "ang.1") {
    throw new Error("Self-test expected ang.1 first target");
  }

  if (first.query !== "Angola football federation official standings") {
    throw new Error(`Self-test unexpected first query: ${first.query}`);
  }

  if (first.queries.length !== 1) {
    throw new Error("Self-test expected one query per runner target");
  }

  if (first.nameSource !== "country_tier_fallback" || first.nameConfidence !== "low") {
    throw new Error("Self-test expected fallback metadata preserved");
  }

  if (report.guarantees.noSearch !== true || report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0) {
    throw new Error("Self-test read-only guarantees failed");
  }

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = runSelfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: true,
      summary: report.summary,
      firstTarget: report.searchTargetRows[0] || null,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("Missing required --input");
  if (!args.output) throw new Error("Missing required --output");

  const input = readJson(args.input);
  const report = buildProviderDiscoveryRetrySearchTargets(input, {
    limitCompetitions: args.limitCompetitions,
    queriesPerCompetition: args.queriesPerCompetition
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    selection: report.selection,
    summary: report.summary,
    firstTarget: report.searchTargetRows[0] || null,
    guarantees: report.guarantees
  }, null, 2));
}

main();
