#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { searchWeb } from "../source-discovery/web-search-provider.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeUrl(value) {
  const raw = asText(value);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  const args = {
    tasks: "",
    output: "",
    allowSearch: false,
    limit: 0,
    queriesPerTask: 2,
    timeoutMs: 12000,
    maxChars: 120000,
    selfTest: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--tasks") args.tasks = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else if (arg === "--allow-search") args.allowSearch = true;
    else if (arg === "--limit") args.limit = Number(argv[++index]);
    else if (arg === "--queries-per-task") args.queriesPerTask = Number(argv[++index]);
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++index]);
    else if (arg === "--max-chars") args.maxChars = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function pickTaskRows(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.taskRows)) return input.taskRows;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input?.items)) return input.items;
  return [];
}

function buildSearchTargets(tasks, options = {}) {
  const maxQueriesPerTask = Math.max(1, asNumber(options.queriesPerTask, 2));
  const rows = [];

  for (const task of pickTaskRows(tasks)) {
    const missingLeagueSlug = asText(task.missingLeagueSlug);
    const countryPrefix = asText(task.countryPrefix);
    const queries = Array.isArray(task.candidateSearchQueries)
      ? task.candidateSearchQueries.map(asText).filter(Boolean)
      : [];

    if (!missingLeagueSlug || !countryPrefix || queries.length === 0) continue;

    for (const query of queries.slice(0, maxQueriesPerTask)) {
      rows.push({
        searchTargetId: `${asText(task.taskId) || `same-prefix-standings-${missingLeagueSlug}`}-${rows.length + 1}`,
        taskId: asText(task.taskId),
        missingLeagueSlug,
        leagueSlug: missingLeagueSlug,
        countryPrefix,
        missingTier: task.missingTier ?? null,
        missingTierLabel: asText(task.missingTierLabel || task.missingTier),
        query,
        intent: "same_prefix_missing_standings_source_discovery",
        expectedSourceFamily: "standings_or_league_table",
        fullFixtureSearchAllowedNow: false,
        standingsWriteAllowedNow: false,
        sourceFetch: false,
        noFetch: true,
        canonicalWrites: 0,
        productionWrite: false
      });
    }
  }

  const limit = Math.max(0, asNumber(options.limit, 0));
  return limit > 0 ? rows.slice(0, limit) : rows;
}

function convertSearchResult(target, row) {
  const url = normalizeUrl(row.url);
  if (!url) return null;

  return {
    searchTargetId: asText(target.searchTargetId),
    taskId: asText(target.taskId),
    missingLeagueSlug: asText(target.missingLeagueSlug),
    leagueSlug: asText(target.leagueSlug),
    countryPrefix: asText(target.countryPrefix),
    missingTier: target.missingTier ?? null,
    missingTierLabel: asText(target.missingTierLabel),
    query: asText(target.query),
    intent: asText(target.intent),
    expectedSourceFamily: asText(target.expectedSourceFamily),
    rank: asNumber(row.rank, 0),
    title: asText(row.title),
    snippet: asText(row.snippet),
    url,
    hostname: asText(row.hostname),
    provider: asText(row.provider || row.resultSource || "web_search"),
    resultSource: asText(row.provider || row.resultSource || "web_search"),
    collectorState: "collected_from_controlled_standings_web_search",
    fetchState: "not_fetched",
    manualCandidateUrlUsed: false,
    inventedUrl: false,
    fullFixtureSearchAllowedNow: false,
    standingsWriteAllowedNow: false,
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

async function buildReport(tasks, options = {}) {
  const searchTargets = buildSearchTargets(tasks, options);
  const searchResultRows = [];
  const searchAttemptRows = [];
  const bySearchStatus = {};

  for (const target of searchTargets) {
    const result = await searchWeb(target.query, {
      allowSearch: options.allowSearch === true,
      timeoutMs: options.timeoutMs,
      maxChars: options.maxChars
    });

    const status = asText(result.status || "unknown");
    bySearchStatus[status] = (bySearchStatus[status] || 0) + 1;

    searchAttemptRows.push({
      searchTargetId: target.searchTargetId,
      taskId: target.taskId,
      missingLeagueSlug: target.missingLeagueSlug,
      countryPrefix: target.countryPrefix,
      query: target.query,
      ok: result.ok === true,
      status,
      resultCount: Array.isArray(result.rows) ? result.rows.length : 0,
      searchExecuted: result.guarantees?.searchExecuted === true,
      attempts: result.attempts || []
    });

    for (const row of result.rows || []) {
      const converted = convertSearchResult(target, row);
      if (converted) searchResultRows.push(converted);
    }
  }

  const searchExecutedCount = searchAttemptRows.filter((row) => row.searchExecuted === true).length;

  return {
    ok: options.allowSearch === true ? searchResultRows.length > 0 : false,
    job: "collect-same-prefix-missing-standings-search-results-file",
    mode: "read_only_controlled_same_prefix_standings_search_results_collector",
    generatedAt: new Date().toISOString(),
    status: options.allowSearch === true
      ? (searchResultRows.length > 0 ? "web_search_collected" : "web_search_no_results_or_blocked")
      : "search_not_allowed",
    summary: {
      taskRowCount: pickTaskRows(tasks).length,
      searchTargetCount: searchTargets.length,
      selectedSearchTargetCount: searchTargets.length,
      searchAttemptCount: searchAttemptRows.length,
      searchExecutedCount,
      searchResultRowCount: searchResultRows.length,
      blockedBecauseSearchNotAllowed: options.allowSearch !== true,
      fullFixtureSearchAllowedNowCount: searchTargets.filter((row) => row.fullFixtureSearchAllowedNow === true).length,
      standingsWriteAllowedNowCount: searchTargets.filter((row) => row.standingsWriteAllowedNow === true).length,
      bySearchStatus,
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    searchTargets,
    searchAttemptRows,
    searchResultRows,
    guarantees: {
      failClosedWithoutAllowSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetchBeyondSearchProvider: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      fullFixtureSearchAllowedNow: false,
      standingsWriteAllowedNow: false
    }
  };
}

async function runSelfTest() {
  const tasks = {
    targetDate: "2026-06-02",
    taskRows: [
      {
        taskId: "same-prefix-standings-source-discovery-eng.2",
        missingLeagueSlug: "eng.2",
        countryPrefix: "eng",
        missingTier: 2,
        missingTierLabel: "2",
        candidateSearchQueries: [
          "Championship standings official table",
          "England Championship league table standings"
        ],
        fullFixtureSearchAllowedNow: false,
        standingsWriteAllowedNow: false
      }
    ]
  };

  const report = await buildReport(tasks, {
    allowSearch: false,
    limit: 1,
    queriesPerTask: 1,
    timeoutMs: 1000,
    maxChars: 1000
  });

  if (report.status !== "search_not_allowed") throw new Error("expected search_not_allowed status");
  if (report.summary.searchTargetCount !== 1) throw new Error("expected one search target");
  if (report.summary.searchExecutedCount !== 0) throw new Error("expected no executed search");
  if (report.summary.searchResultRowCount !== 0) throw new Error("expected no search results");
  if (report.summary.fullFixtureSearchAllowedNowCount !== 0) throw new Error("expected full fixture search blocked");
  if (report.summary.standingsWriteAllowedNowCount !== 0) throw new Error("expected no standings writes");
  if (report.summary.sourceFetch !== false || report.summary.noFetch !== true) throw new Error("fetch guarantees changed");
  if (report.summary.canonicalWrites !== 0 || report.summary.productionWrite !== false) throw new Error("write guarantees changed");

  return {
    ok: true,
    selfTest: "collect-same-prefix-missing-standings-search-results",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(await runSelfTest(), null, 2));
    return;
  }

  if (!args.tasks) throw new Error("--tasks is required");

  const tasksPath = path.resolve(args.tasks);
  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(path.dirname(tasksPath), "same-prefix-missing-standings-search-results.json");

  const report = await buildReport(readJson(tasksPath), args);
  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    status: report.status,
    output: path.relative(repoRoot, outputPath).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}