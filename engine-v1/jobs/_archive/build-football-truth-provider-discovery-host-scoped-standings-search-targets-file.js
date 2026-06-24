#!/usr/bin/env node

import fs from "fs";
import path from "path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    input: "",
    output: "",
    limitHosts: 0,
    queriesPerCompetition: 4
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else if (arg === "--limit-hosts") args.limitHosts = Number(argv[++index]);
    else if (arg === "--queries-per-competition") args.queriesPerCompetition = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.limitHosts) || args.limitHosts < 0) {
    throw new Error(`Invalid --limit-hosts: ${args.limitHosts}`);
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

function candidateHostsFrom(input) {
  return asArray(input.candidateHostBoard)
    .filter((row) => asText(row.candidateHost))
    .sort((a, b) => {
      return Number(b.maxConfidence || 0) - Number(a.maxConfidence || 0) ||
        Number(b.candidateRowCount || 0) - Number(a.candidateRowCount || 0) ||
        asText(a.country).localeCompare(asText(b.country)) ||
        asText(a.candidateHost).localeCompare(asText(b.candidateHost));
    });
}

function inferTierFromSlug(slug) {
  const match = asText(slug).match(/\.(\d+)$/u);
  return match ? Number(match[1]) : null;
}

function competitionSearchName(country, slug) {
  const tier = inferTierFromSlug(slug);
  if (tier === 1) return `${country} top division`;
  if (tier === 2) return `${country} second division`;
  return `${country} football league`;
}

function hostScopedQueries(host, country, slug) {
  const searchName = competitionSearchName(country, slug);

  return unique([
    `site:${host} standings`,
    `site:${host} classement`,
    `site:${host} "${searchName}" standings`,
    `site:${host} "${searchName}" classement`,
    `site:${host} championnat classement`,
    `site:${host} competitions classement`,
    `site:${host} league table`,
    `site:${host} fixtures standings`
  ]);
}

function buildHostScopedTarget(candidate, slug, query, queryIndex) {
  const host = asText(candidate.candidateHost);
  const country = asText(candidate.country);
  const countryKey = asText(candidate.countryKey);
  const region = asText(candidate.region);
  const searchName = competitionSearchName(country, slug);

  return {
    searchTargetId: [
      "provider-discovery-host-scoped-standings",
      countryKey || country.toLowerCase().replace(/[^a-z0-9]+/gu, "-"),
      host.replace(/[^a-z0-9.]+/giu, "-").toLowerCase(),
      slug,
      String(queryIndex + 1).padStart(3, "0")
    ].join(":"),
    targetType: "provider_discovery_host_scoped_standings_search",
    searchMode: "official_host_scoped_standings_discovery",
    leagueSlug: slug,
    competitionSlug: slug,
    competitionName: searchName,
    name: searchName,
    searchName,
    country,
    countryKey,
    region,
    candidateHost: host,
    hostConfidence: Number(candidate.maxConfidence || 0),
    hostCandidateRowCount: Number(candidate.candidateRowCount || 0),
    competitionType: "league",
    query,
    queries: [query],
    intent: "official_host_scoped_standings_discovery",
    queryIntent: "official_host_scoped_standings_discovery",
    expectedSourceFamily: "accepted_official_football_host",
    expectedEvidence: [
      "accepted official host in URL",
      "standings/table/classement/competition page",
      "competition/country identity match",
      "season/current-state marker where available"
    ],
    rejectIf: [
      "accepted host identity only without standings/table evidence",
      "news article only",
      "national team page only",
      "fixture-only page with no table/standings evidence",
      "wrong country/competition identity"
    ],
    sourceFetch: false,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    metadata: {
      originatingJob: "classify-football-truth-provider-discovery-official-host-search-results-file",
      hostScopedFromCandidateBoard: true,
      hostUrls: asArray(candidate.urls).map(asText).filter(Boolean),
      hostTitles: asArray(candidate.titles).map(asText).filter(Boolean)
    }
  };
}

function buildHostScopedStandingsTargets(input, options = {}) {
  const allCandidates = candidateHostsFrom(input);
  const selectedCandidates = options.limitHosts > 0
    ? allCandidates.slice(0, options.limitHosts)
    : allCandidates;

  const queriesPerCompetition = options.queriesPerCompetition || 4;
  const searchTargetRows = [];

  for (const candidate of selectedCandidates) {
    const slugs = unique(asArray(candidate.retryCompetitionExamples));

    for (const slug of slugs) {
      const queries = hostScopedQueries(
        asText(candidate.candidateHost),
        asText(candidate.country),
        slug
      ).slice(0, queriesPerCompetition);

      for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
        searchTargetRows.push(buildHostScopedTarget(candidate, slug, queries[queryIndex], queryIndex));
      }
    }
  }

  return {
    ok: true,
    job: "build-football-truth-provider-discovery-host-scoped-standings-search-targets-file",
    mode: "read_only_host_scoped_standings_search_target_derivation",
    generatedAt: new Date().toISOString(),
    inputSummary: input.summary || {},
    selection: {
      requestedLimitHosts: options.limitHosts || 0,
      queriesPerCompetition,
      selectedHostCount: selectedCandidates.length,
      expandedSearchTargetCount: searchTargetRows.length
    },
    summary: {
      inputCandidateHostCount: allCandidates.length,
      selectedHostCount: selectedCandidates.length,
      competitionCount: unique(searchTargetRows.map((row) => row.leagueSlug)).length,
      searchTargetCount: searchTargetRows.length,
      byHost: countBy(searchTargetRows, (row) => row.candidateHost),
      byCountry: countBy(searchTargetRows, (row) => row.country),
      byRegion: countBy(searchTargetRows, (row) => row.region),
      totalQueryCount: searchTargetRows.length,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    selectedCandidateHosts: selectedCandidates,
    searchTargetRows,
    candidateTargetRows: searchTargetRows,
    policy: {
      purpose: "Build site:<accepted-official-host> standings search targets after official-host evidence classification.",
      inputContract: "Consumes classify-football-truth-provider-discovery-official-host-search-results-file output.",
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
      batchBased: true,
      hostScopedOnly: true
    }
  };
}

function runSelfTest() {
  const input = {
    summary: {
      candidateHostCount: 1
    },
    candidateHostBoard: [
      {
        country: "Benin",
        countryKey: "benin",
        region: "africa",
        candidateHost: "febefoot.org",
        candidateRowCount: 4,
        maxConfidence: 0.78,
        retryCompetitionExamples: ["ben.1", "ben.2"],
        titles: ["Homepage - Site Officiel de la Fédération Béninoise de Football (FBF)"],
        urls: ["https://febefoot.org/"]
      }
    ]
  };

  const report = buildHostScopedStandingsTargets(input, {
    limitHosts: 1,
    queriesPerCompetition: 3
  });

  if (report.summary.inputCandidateHostCount !== 1) {
    throw new Error("Self-test expected 1 input candidate host");
  }

  if (report.summary.selectedHostCount !== 1) {
    throw new Error("Self-test expected 1 selected host");
  }

  if (report.summary.competitionCount !== 2) {
    throw new Error(`Self-test expected 2 competitions, got ${report.summary.competitionCount}`);
  }

  if (report.summary.searchTargetCount !== 6) {
    throw new Error(`Self-test expected 6 search targets, got ${report.summary.searchTargetCount}`);
  }

  const first = report.searchTargetRows[0];
  if (first.candidateHost !== "febefoot.org") {
    throw new Error(`Self-test expected candidate host febefoot.org, got ${first.candidateHost}`);
  }

  if (!first.query.startsWith("site:febefoot.org ")) {
    throw new Error(`Self-test expected site:febefoot.org query, got ${first.query}`);
  }

  if (first.leagueSlug !== "ben.1") {
    throw new Error(`Self-test expected ben.1 first target, got ${first.leagueSlug}`);
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
  const report = buildHostScopedStandingsTargets(input, {
    limitHosts: args.limitHosts,
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
