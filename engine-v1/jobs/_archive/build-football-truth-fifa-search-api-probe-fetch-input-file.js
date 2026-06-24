#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg === "--date") args.date = argv[++i] || "";
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(asText).filter(Boolean))];
}

function extractSearchApiBase(input) {
  const rows = Array.isArray(input.stringRows) ? input.stringRows : [];
  const contexts = rows.map((row) => asText(row.context)).join("\n");

  const matches = [
    ...contexts.matchAll(/SEARCH_API:\\"([^"]+)\\"/g),
    ...contexts.matchAll(/SEARCH_API:"([^"]+)"/g),
    ...contexts.matchAll(/"SEARCH_API"\s*:\s*"([^"]+)"/g)
  ];

  const urls = unique(matches.map((match) => match[1]));
  return urls[0] || "https://cxm-api.fifa.com/fifacxmsearch/api";
}

function buildSearchQueries() {
  return [
    {
      competitionSlug: "fifa.club_world_cup",
      query: "FIFA Club World Cup 2025 matches",
      expectedRouteToken: "club-world-cup",
      expectedSeasonToken: "usa-2025",
      probePurpose: "club_world_cup_matches_search_discovery"
    },
    {
      competitionSlug: "fifa.club_world_cup",
      query: "FIFA Club World Cup 2025 standings groups",
      expectedRouteToken: "club-world-cup",
      expectedSeasonToken: "usa-2025",
      probePurpose: "club_world_cup_groups_standings_search_discovery"
    },
    {
      competitionSlug: "fifa.world_cup",
      query: "FIFA World Cup 2026 matches",
      expectedRouteToken: "worldcup",
      expectedSeasonToken: "canadamexicousa2026",
      probePurpose: "world_cup_2026_matches_search_discovery"
    },
    {
      competitionSlug: "fifa.world_cup",
      query: "FIFA World Cup 2026 qualifiers schedule",
      expectedRouteToken: "worldcup",
      expectedSeasonToken: "canadamexicousa2026",
      probePurpose: "world_cup_2026_qualifiers_schedule_search_discovery"
    },
    {
      competitionSlug: "fifa.world_cup",
      query: "FIFA World Cup 2026 groups standings",
      expectedRouteToken: "worldcup",
      expectedSeasonToken: "canadamexicousa2026",
      probePurpose: "world_cup_2026_groups_standings_search_discovery"
    }
  ];
}

function buildCandidateUrl(baseUrl, query) {
  const url = new URL(baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("locale", "en");
  return url.toString();
}

function buildPlan(input, options = {}) {
  const searchApiBase = extractSearchApiBase(input);
  const queryRows = buildSearchQueries();

  const fetchInputRows = queryRows.map((row, index) => ({
    fetchInputId: `fifa-search-api:${String(index + 1).padStart(3, "0")}`,
    competitionSlug: row.competitionSlug,
    leagueSlug: row.competitionSlug,
    sourceFamily: "fifa_search_api_discovery",
    searchApiBase,
    query: row.query,
    candidateUrl: buildCandidateUrl(searchApiBase, row.query),
    expectedHost: "cxm-api.fifa.com",
    fetchPurpose: row.probePurpose,
    expectedRouteToken: row.expectedRouteToken,
    expectedSeasonToken: row.expectedSeasonToken,
    probePolicy: {
      explicitAllowFetchRequired: true,
      fifaSearchApiDiscoveryOnly: true,
      searchApiResultDoesNotEqualTruth: true,
      routeCandidateRequiresOfficialRouteOrApiPayloadValidation: true,
      noCanonicalWriteFromProbeInput: true
    },
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  }));

  const byCompetition = {};
  const byPurpose = {};
  for (const row of fetchInputRows) {
    byCompetition[row.competitionSlug] = (byCompetition[row.competitionSlug] || 0) + 1;
    byPurpose[row.fetchPurpose] = (byPurpose[row.fetchPurpose] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-fifa-search-api-probe-fetch-input-file",
    mode: "read_only_fifa_search_api_probe_fetch_input",
    generatedAt: new Date().toISOString(),
    date: asText(options.date),
    sourceStringMinerJob: asText(input.job),
    summary: {
      fetchInputRowCount: fetchInputRows.length,
      searchApiBase,
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byCompetition,
      byPurpose
    },
    fetchInputRows,
    nextStagePlan: {
      gatedFetch: "run scoped metadata-preserving fetch with --allow-fetch",
      review: "inspect FIFA search API response shape and route candidates",
      truthExtraction: "do not promote activity/restart state from search API results alone"
    },
    policy: {
      noSearchProvider: true,
      noFetchInThisJob: true,
      noUrlFetch: true,
      fifaSearchApiDiscoveryOnly: true,
      searchApiResultDoesNotEqualTruth: true,
      explicitAllowFetchRequiredForNextProbe: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noResultWrites: true,
      noStandingWrites: true,
      noSourceReliabilityMutation: true,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noSearchProvider: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const report = buildPlan({
    job: "self",
    stringRows: [
      {
        context: 'SEARCH_API:"https://cxm-api.fifa.com/fifacxmsearch/api",SERVICE_API:"https://cxm-api.fifa.com/fifaplusweb/api"'
      }
    ]
  }, { date: "2026-06-12" });

  if (report.summary.fetchInputRowCount !== 5) throw new Error("expected 5 search API probe rows");
  if (report.summary.searchApiBase !== "https://cxm-api.fifa.com/fifacxmsearch/api") throw new Error("search API base extraction failed");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-fifa-search-api-probe-fetch-input-file",
      summary: report.summary,
      fetchInputRows: report.fetchInputRows,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildPlan(readJson(args.input), { date: args.date });
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-fifa-search-api-probe-fetch-input-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}