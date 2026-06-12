#!/usr/bin/env node

import fs from "fs";
import path from "path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    input: "",
    output: "",
    limitCountries: 0,
    countryStartIndex: 0,
    queriesPerCountry: 4,
    includeRowsWithExistingHints: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else if (arg === "--limit-countries") args.limitCountries = Number(argv[++index]);
    else if (arg === "--country-start-index") args.countryStartIndex = Number(argv[++index]);
    else if (arg === "--queries-per-country") args.queriesPerCountry = Number(argv[++index]);
    else if (arg === "--include-rows-with-existing-hints") args.includeRowsWithExistingHints = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.limitCountries) || args.limitCountries < 0) {
    throw new Error(`Invalid --limit-countries: ${args.limitCountries}`);
  }

  if (!Number.isInteger(args.countryStartIndex) || args.countryStartIndex < 0) {
    throw new Error(`Invalid --country-start-index: ${args.countryStartIndex}`);
  }

  if (!Number.isInteger(args.queriesPerCountry) || args.queriesPerCountry <= 0) {
    throw new Error(`Invalid --queries-per-country: ${args.queriesPerCountry}`);
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

function unique(values) {
  return Array.from(new Set(values.map(asText).filter(Boolean)));
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = asText(keyFn(row)) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function slugKey(value) {
  return asText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function retryRowsFrom(input) {
  const rows = asArray(input.retryRows);
  if (rows.length > 0) return rows;

  const genericRows = asArray(input.rows);
  if (genericRows.length > 0) return genericRows;

  return [];
}

function officialHintHosts(row) {
  return asText(row.officialHintHosts)
    .split(";")
    .map(asText)
    .filter(Boolean);
}

function hasOfficialHintHost(row) {
  return officialHintHosts(row).length > 0;
}

function countryDiscoveryQueries(country, examples) {
  const sampleNames = unique(examples.map((row) => row.searchName)).slice(0, 3);
  const sampleName = sampleNames[0] || `${country} football league`;

  return unique([
    `${country} football federation official website`,
    `${country} football association official website`,
    `${country} football federation competitions`,
    `${country} football federation league standings`,
    `${country} premier league official website`,
    `${country} national football league official website`,
    `"${sampleName}" official website`,
    `"${sampleName}" official standings`
  ]);
}

function representativeCompetitionSlug(rows) {
  const sorted = [...rows].sort((a, b) => {
    const aSlug = asText(a.leagueSlug);
    const bSlug = asText(b.leagueSlug);

    const aTier = Number(a.tier || 99);
    const bTier = Number(b.tier || 99);

    return aTier - bTier || aSlug.localeCompare(bSlug);
  });

  return asText(sorted[0]?.leagueSlug);
}

function buildCountryGroups(retryRows, options = {}) {
  const groups = new Map();

  for (const row of retryRows) {
    const country = asText(row.country);
    if (!country) continue;

    if (options.includeRowsWithExistingHints !== true && hasOfficialHintHost(row)) {
      continue;
    }

    const key = slugKey(country);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        countryKey: key,
        country,
        region: asText(row.region),
        retryRows: []
      });
    }

    const group = groups.get(key);
    group.retryRows.push(row);

    if (!group.region && row.region) {
      group.region = asText(row.region);
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    return asText(a.region).localeCompare(asText(b.region)) ||
      a.country.localeCompare(b.country);
  });
}

function buildOfficialHostSearchTarget(group, query, queryIndex) {
  const representativeSlug = representativeCompetitionSlug(group.retryRows);

  return {
    searchTargetId: [
      "provider-discovery-official-host",
      group.countryKey,
      String(queryIndex + 1).padStart(3, "0")
    ].join(":"),
    targetType: "provider_discovery_official_host_search",
    searchMode: "official_football_host_discovery",
    leagueSlug: representativeSlug || `country:${group.countryKey}`,
    competitionSlug: representativeSlug || `country:${group.countryKey}`,
    countryKey: group.countryKey,
    country: group.country,
    region: group.region,
    name: `${group.country} football official host discovery`,
    searchName: `${group.country} football official host discovery`,
    competitionType: "country_official_host_discovery",
    query,
    queries: [query],
    intent: "official_football_host_discovery",
    queryIntent: "official_football_host_discovery",
    expectedSourceFamily: "official_football_federation_or_league",
    expectedEvidence: [
      "official federation or league website",
      "competitions/leagues/standings navigation",
      "country identity match",
      "not aggregator-only"
    ],
    rejectIf: [
      "aggregator-only evidence",
      "FIFA/CAF/AFC association profile only",
      "national team page only",
      "social media only",
      "commerce/login/advertising domain",
      "wrong country identity"
    ],
    retryCompetitionCount: group.retryRows.length,
    retryCompetitionExamples: group.retryRows.slice(0, 8).map((row) => ({
      leagueSlug: asText(row.leagueSlug),
      searchName: asText(row.searchName),
      nameSource: asText(row.nameSource),
      retryClass: asText(row.retryClass)
    })),
    sourceFetch: false,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    metadata: {
      originatingJob: "build-football-truth-provider-discovery-retry-strategy-plan-file",
      lane: "country_level_official_host_discovery",
      standingsSearchBlockedUntilOfficialHostCandidateExists: true
    }
  };
}

function buildOfficialHostSearchTargets(input, options = {}) {
  const retryRows = retryRowsFrom(input);
  const allGroups = buildCountryGroups(retryRows, {
    includeRowsWithExistingHints: options.includeRowsWithExistingHints === true
  });

  const countryStartIndex = options.countryStartIndex || 0;
  const remainingGroups = allGroups.slice(countryStartIndex);
  const selectedGroups = options.limitCountries > 0
    ? remainingGroups.slice(0, options.limitCountries)
    : remainingGroups;

  const queriesPerCountry = options.queriesPerCountry || 4;
  const searchTargetRows = [];

  for (const group of selectedGroups) {
    const queries = countryDiscoveryQueries(group.country, group.retryRows).slice(0, queriesPerCountry);

    for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
      searchTargetRows.push(buildOfficialHostSearchTarget(group, queries[queryIndex], queryIndex));
    }
  }

  return {
    ok: true,
    job: "build-football-truth-provider-discovery-official-host-search-targets-file",
    mode: "read_only_provider_discovery_official_host_search_target_derivation",
    generatedAt: new Date().toISOString(),
    inputSummary: input.summary || {},
    selection: {
      requestedLimitCountries: options.limitCountries || 0,
      countryStartIndex: options.countryStartIndex || 0,
      queriesPerCountry,
      includeRowsWithExistingHints: options.includeRowsWithExistingHints === true,
      selectedCountryCount: selectedGroups.length,
      expandedSearchTargetCount: searchTargetRows.length
    },
    summary: {
      inputRetryRowCount: retryRows.length,
      countryGroupCount: allGroups.length,
      selectedCountryCount: selectedGroups.length,
      searchTargetCount: searchTargetRows.length,
      rowsWithOfficialHintHosts: retryRows.filter(hasOfficialHintHost).length,
      rowsWithoutOfficialHintHosts: retryRows.filter((row) => !hasOfficialHintHost(row)).length,
      byRegion: countBy(searchTargetRows, (row) => row.region),
      totalQueryCount: searchTargetRows.length,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    countryGroups: selectedGroups.map((group) => ({
      countryKey: group.countryKey,
      country: group.country,
      region: group.region,
      retryCompetitionCount: group.retryRows.length,
      examples: group.retryRows.slice(0, 8).map((row) => asText(row.leagueSlug)),
      nameSources: unique(group.retryRows.map((row) => row.nameSource))
    })),
    searchTargetRows,
    candidateTargetRows: searchTargetRows,
    policy: {
      purpose: "Build country-level official host discovery search targets before more standings provider retry search.",
      inputContract: "Consumes provider discovery retry strategy plan output.",
      runnerContract: "Compatible with run-fixture-league-date-autonomous-search-batches-file via searchTargetRows.",
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
      searchRequiresExplicitAllowSearch: true,
      batchBased: true
    }
  };
}

function runSelfTest() {
  const input = {
    summary: {
      retryAttemptCount: 4
    },
    retryRows: [
      {
        leagueSlug: "ang.1",
        country: "Angola",
        region: "africa",
        searchName: "Angola top division",
        nameSource: "country_tier_fallback",
        retryClass: "parser_zero_results_needs_retry",
        tier: 1,
        officialHintHosts: ""
      },
      {
        leagueSlug: "ang.2",
        country: "Angola",
        region: "africa",
        searchName: "Angola second division",
        nameSource: "country_tier_fallback",
        retryClass: "parser_zero_results_needs_retry",
        tier: 2,
        officialHintHosts: ""
      },
      {
        leagueSlug: "alb.2",
        country: "Albania",
        region: "europe",
        searchName: "Albanian First Division",
        nameSource: "registryName",
        retryClass: "provider_blocked_or_zero_results_needs_retry",
        tier: 2,
        officialHintHosts: "fshf.org"
      },
      {
        leagueSlug: "ben.1",
        country: "Benin",
        region: "africa",
        searchName: "Benin top division",
        nameSource: "country_tier_fallback",
        retryClass: "parser_zero_results_needs_retry",
        tier: 1,
        officialHintHosts: ""
      }
    ]
  };

  const report = buildOfficialHostSearchTargets(input, {
    limitCountries: 2,
    countryStartIndex: 1,
    queriesPerCountry: 3
  });

  if (report.summary.inputRetryRowCount !== 4) {
    throw new Error("Self-test expected 4 retry rows");
  }

  if (report.summary.rowsWithOfficialHintHosts !== 1) {
    throw new Error("Self-test expected 1 row with official hint host");
  }

  if (report.summary.rowsWithoutOfficialHintHosts !== 3) {
    throw new Error("Self-test expected 3 rows without official hint host");
  }

  if (report.summary.countryGroupCount !== 2) {
    throw new Error(`Self-test expected 2 country groups without hints, got ${report.summary.countryGroupCount}`);
  }

  if (report.summary.searchTargetCount !== 3) {
    throw new Error(`Self-test expected 3 search targets after countryStartIndex offset, got ${report.summary.searchTargetCount}`);
  }

  const first = report.searchTargetRows[0];
  if (!first.query.includes("football federation official website")) {
    throw new Error(`Self-test expected federation official website query, got: ${first.query}`);
  }

  if (first.targetType !== "provider_discovery_official_host_search") {
    throw new Error("Self-test expected official host target type");
  }

  if (first.retryCompetitionExamples.length === 0) {
    throw new Error("Self-test expected retry competition examples");
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
  const report = buildOfficialHostSearchTargets(input, {
    limitCountries: args.limitCountries,
    countryStartIndex: args.countryStartIndex,
    queriesPerCountry: args.queriesPerCountry,
    includeRowsWithExistingHints: args.includeRowsWithExistingHints
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
