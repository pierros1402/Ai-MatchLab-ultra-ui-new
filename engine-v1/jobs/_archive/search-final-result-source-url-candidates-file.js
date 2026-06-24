#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { searchWeb } from "../source-discovery/web-search-provider.js";

const __filename = fileURLToPath(import.meta.url);

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
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
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function hostnameOf(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sourceTypeForHost(hostname) {
  const host = asText(hostname).toLowerCase();
  if (!host) return "other";

  const officialNeedles = [
    "fifa.com",
    "uefa.com",
    "conmebol.com",
    "the-afc.com",
    "cafonline.com",
    "concacaf.com",
    "premierleague.com",
    "laliga.com",
    "bundesliga.com",
    "legaseriea.it",
    "ligue1.com",
    "slgr.gr",
    "proleague.be",
    "superliga.dk",
    "eliteserien.no"
  ];

  const trustedNeedles = [
    "espn.",
    "flashscore.",
    "soccerway.",
    "worldfootball.net",
    "11v11.com",
    "footballdatabase.eu",
    "aiscore.",
    "sofascore.",
    "livescore.",
    "fotmob."
  ];

  if (officialNeedles.some((needle) => host.includes(needle))) return "official";
  if (trustedNeedles.some((needle) => host.includes(needle))) return "trusted";
  return "other";
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    allowSearch: false,
    limit: 0,
    timeoutMs: 12000,
    maxChars: 120000,
    maxResultsPerCandidate: 5,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--allow-search") {
      args.allowSearch = true;
    } else if (arg === "--input" && argv[i + 1]) {
      args.input = argv[++i];
    } else if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length);
    } else if (arg === "--output" && argv[i + 1]) {
      args.output = argv[++i];
    } else if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
    } else if (arg === "--limit" && argv[i + 1]) {
      args.limit = toInt(argv[++i], 0);
    } else if (arg.startsWith("--limit=")) {
      args.limit = toInt(arg.slice("--limit=".length), 0);
    } else if (arg === "--timeout-ms" && argv[i + 1]) {
      args.timeoutMs = toInt(argv[++i], 12000);
    } else if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = toInt(arg.slice("--timeout-ms=".length), 12000);
    } else if (arg === "--max-chars" && argv[i + 1]) {
      args.maxChars = toInt(argv[++i], 120000);
    } else if (arg.startsWith("--max-chars=")) {
      args.maxChars = toInt(arg.slice("--max-chars=".length), 120000);
    } else if (arg === "--max-results-per-candidate" && argv[i + 1]) {
      args.maxResultsPerCandidate = toInt(argv[++i], 5);
    } else if (arg.startsWith("--max-results-per-candidate=")) {
      args.maxResultsPerCandidate = toInt(arg.slice("--max-results-per-candidate=".length), 5);
    } else {
      throw new Error(`unknown or incomplete argument: ${arg}`);
    }
  }

  return args;
}

function selectCandidateSearchRows(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.candidateSearchRows)) return input.candidateSearchRows;
  if (Array.isArray(input?.rows)) return input.rows;
  return [];
}

function buildBlockedReport(input, options = {}) {
  const allRows = selectCandidateSearchRows(input);
  const selectedRows = options.limit > 0 ? allRows.slice(0, options.limit) : allRows;

  return {
    ok: false,
    job: "search-final-result-source-url-candidates-file",
    mode: "read_only_final_result_source_url_search_blocked",
    generatedAt: new Date().toISOString(),
    input: { inputPath: asText(options.inputPath) },
    summary: {
      inputCandidateSearchRows: allRows.length,
      selectedCandidateSearchRows: selectedRows.length,
      searchPerformed: false,
      candidateUrlRows: 0,
      urlResolutions: 0,
      blockedReason: "allow_search_required",
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false
    },
    guarantees: {
      searchRequiresExplicitAllowSearch: true,
      search: false,
      sourceFetch: false,
      fetch: false,
      noUrlFetch: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false,
      dryRun: true
    },
    searchAttempts: [],
    candidateUrlRows: [],
    urlResolutions: []
  };
}

function candidateUrlRowFromResult(candidate, result, resultIndex) {
  const resolvedUrl = normalizeUrl(result.url);
  const host = hostnameOf(resolvedUrl);

  return {
    candidateUrlRowId: [
      asText(candidate.candidateSearchRowId || candidate.sourceTaskId || candidate.matchId),
      "url",
      resultIndex + 1
    ].join(":"),
    candidateSearchRowId: asText(candidate.candidateSearchRowId),
    taskId: asText(candidate.sourceTaskId),
    sourceTaskId: asText(candidate.sourceTaskId),
    date: asText(candidate.date || candidate.day),
    day: asText(candidate.day || candidate.date),
    leagueSlug: asText(candidate.leagueSlug),
    matchId: asText(candidate.matchId),
    homeTeam: asText(candidate.homeTeam || candidate.teams?.homeTeam),
    awayTeam: asText(candidate.awayTeam || candidate.teams?.awayTeam),
    intent: asText(candidate.intent),
    priority: candidate.priority,
    query: asText(candidate.query),
    rank: toInt(result.rank, resultIndex + 1),
    sourceName: asText(result.title || host || "Search result"),
    sourceType: sourceTypeForHost(host),
    resolvedBy: "external_search",
    resolvedUrl,
    url: resolvedUrl,
    host,
    title: asText(result.title),
    snippet: asText(result.snippet),
    provider: asText(result.provider || result.resultSource || "autonomous_web_search"),
    resultSource: asText(result.provider || result.resultSource || "autonomous_web_search"),
    validationState: "candidate_resolved_source_url_unvalidated",
    fetchState: "not_fetched",
    finalTruthDecisionState: "not_decided",
    canonicalPromotionState: "blocked",
    canonicalWrites: 0
  };
}

function urlResolutionFromCandidateUrl(row) {
  return {
    taskId: row.taskId,
    matchId: row.matchId,
    day: row.day,
    leagueSlug: row.leagueSlug,
    resolvedUrl: row.resolvedUrl,
    sourceName: row.sourceName,
    sourceType: row.sourceType,
    resolvedBy: row.resolvedBy,
    notes: [
      "autonomous external search candidate",
      `query=${row.query}`,
      `provider=${row.provider}`,
      `rank=${row.rank}`
    ].join("; ")
  };
}

async function buildReport(input, options = {}, searchFn = searchWeb) {
  const allRows = selectCandidateSearchRows(input);
  const selectedRows = options.limit > 0 ? allRows.slice(0, options.limit) : allRows;

  if (options.allowSearch !== true) {
    return buildBlockedReport(input, options);
  }

  const candidateUrlRows = [];
  const urlResolutions = [];
  const searchAttempts = [];
  const byStatus = {};
  const byLeague = {};

  for (const candidate of selectedRows) {
    const query = asText(candidate.query);
    const result = await searchFn(query, {
      allowSearch: true,
      timeoutMs: options.timeoutMs,
      maxChars: options.maxChars
    });

    const status = asText(result.status || "unknown");
    byStatus[status] = (byStatus[status] || 0) + 1;

    const league = asText(candidate.leagueSlug) || "unknown";
    byLeague[league] = (byLeague[league] || 0) + 1;

    const resultRows = asArray(result.rows).slice(0, options.maxResultsPerCandidate || 5);

    searchAttempts.push({
      candidateSearchRowId: asText(candidate.candidateSearchRowId),
      taskId: asText(candidate.sourceTaskId),
      day: asText(candidate.day || candidate.date),
      leagueSlug: league,
      matchId: asText(candidate.matchId),
      query,
      ok: result.ok === true,
      status,
      resultCount: resultRows.length,
      attempts: asArray(result.attempts)
    });

    resultRows.forEach((row, index) => {
      const candidateUrlRow = candidateUrlRowFromResult(candidate, row, index);
      if (!candidateUrlRow.resolvedUrl) return;
      candidateUrlRows.push(candidateUrlRow);
      urlResolutions.push(urlResolutionFromCandidateUrl(candidateUrlRow));
    });
  }

  return {
    ok: true,
    job: "search-final-result-source-url-candidates-file",
    mode: "read_only_final_result_source_url_search",
    generatedAt: new Date().toISOString(),
    input: { inputPath: asText(options.inputPath) },
    summary: {
      inputCandidateSearchRows: allRows.length,
      selectedCandidateSearchRows: selectedRows.length,
      searchPerformed: true,
      searchAttemptCount: searchAttempts.length,
      candidateUrlRows: candidateUrlRows.length,
      urlResolutions: urlResolutions.length,
      sourceFetch: false,
      fetchPerformed: false,
      canonicalWrites: 0,
      productionWrite: false,
      byStatus,
      byLeague
    },
    guarantees: {
      searchRequiresExplicitAllowSearch: true,
      search: true,
      sourceFetch: false,
      fetch: false,
      noUrlFetch: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false,
      dryRun: true
    },
    searchAttempts,
    candidateUrlRows,
    urlResolutions
  };
}

async function runSelfTest() {
  const input = {
    candidateSearchRows: [
      {
        candidateSearchRowId: "match-1:missing_final_truth:1:1",
        sourceTaskId: "task-1",
        day: "2099-01-01",
        leagueSlug: "test.1",
        matchId: "match-1",
        homeTeam: "Alpha FC",
        awayTeam: "Beta FC",
        intent: "missing_final_truth",
        priority: 1,
        query: "Alpha FC vs Beta FC 2099-01-01 final score"
      }
    ]
  };

  const blocked = await buildReport(input, { allowSearch: false, inputPath: "self-test" });
  if (blocked.summary.searchPerformed !== false) throw new Error("blocked self-test must not perform search");

  const fakeSearch = async (query, options = {}) => {
    if (options.allowSearch !== true) throw new Error("fake search called without allowSearch");
    return {
      ok: true,
      status: "ok",
      query,
      rows: [
        {
          rank: 1,
          title: "Alpha FC 2-1 Beta FC final score",
          snippet: "Full-time result Alpha FC 2-1 Beta FC.",
          url: "https://example.com/match-report",
          provider: "self_test_search"
        }
      ],
      attempts: [{ provider: "self_test_search", ok: true, resultCount: 1 }]
    };
  };

  const searched = await buildReport(input, { allowSearch: true, inputPath: "self-test" }, fakeSearch);
  if (searched.summary.candidateUrlRows !== 1) throw new Error("expected one candidate URL row");
  if (searched.urlResolutions[0].taskId !== "task-1") throw new Error("lost taskId provenance");

  return {
    ok: true,
    selfTest: "search-final-result-source-url-candidates-file",
    blockedSummary: blocked.summary,
    searchedSummary: searched.summary,
    guarantees: searched.guarantees
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(await runSelfTest(), null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required unless --self-test is used");
  if (!args.output) throw new Error("--output is required unless --self-test is used");

  const input = readJson(args.input);
  const report = await buildReport(input, {
    inputPath: args.input,
    allowSearch: args.allowSearch,
    limit: args.limit,
    timeoutMs: args.timeoutMs,
    maxChars: args.maxChars,
    maxResultsPerCandidate: args.maxResultsPerCandidate
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: report.ok,
    job: report.job,
    output: args.output,
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      job: "search-final-result-source-url-candidates-file",
      error: error?.message || String(error),
      canonicalWrites: 0,
      fetch: false,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true
    }, null, 2));
    process.exitCode = 1;
  });
}

export {
  buildReport,
  buildBlockedReport,
  candidateUrlRowFromResult,
  urlResolutionFromCandidateUrl,
  selectCandidateSearchRows
};