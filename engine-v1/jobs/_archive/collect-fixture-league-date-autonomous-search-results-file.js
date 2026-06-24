#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { searchWeb } from "../source-discovery/web-search-provider.js";

const __filename = fileURLToPath(import.meta.url);

function asText(value) {
  return value == null ? "" : String(value).trim();
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
    targets: "",
    output: "",
    sourceIndex: "",
    selfTest: false,
    allowSearch: false,
    timeoutMs: 12000,
    maxChars: 120000,
    limit: 0
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--targets" && argv[i + 1]) {
      args.targets = argv[++i];
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = argv[++i];
      continue;
    }

    if (arg === "--source-index" && argv[i + 1]) {
      args.sourceIndex = argv[++i];
      continue;
    }

    if (arg === "--allow-search") {
      args.allowSearch = true;
      continue;
    }

    if (arg === "--timeout-ms" && argv[i + 1]) {
      args.timeoutMs = Number(argv[++i]);
      continue;
    }

    if (arg === "--max-chars" && argv[i + 1]) {
      args.maxChars = Number(argv[++i]);
      continue;
    }

    if (arg === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[++i]);
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function selectTargets(input) {
  if (Array.isArray(input)) return input;

  for (const key of ["searchTargetRows", "candidateTargetRows", "targets", "rows", "items"]) {
    if (Array.isArray(input?.[key])) return input[key];
  }

  return [];
}

function selectSourceIndexRows(input) {
  if (Array.isArray(input)) return input;

  for (const key of ["sourceIndexRows", "searchResultRows", "results", "rows", "items", "organicResults"]) {
    if (Array.isArray(input?.[key])) return input[key];
  }

  return [];
}

function normalizeUrl(value) {
  const raw = asText(value);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return raw;
  }
}

function candidateUrlFromIndexRow(row) {
  return normalizeUrl(
    row.url ||
    row.link ||
    row.href ||
    row.resultUrl ||
    row.sourceUrl ||
    row.candidateUrl
  );
}

function normalizeToken(value) {
  return asText(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function targetMatchesIndexRow(target, row) {
  const targetQuery = normalizeToken(target.query);
  const targetLeague = normalizeToken(target.leagueSlug);
  const targetDay = normalizeToken(target.dayKey);
  const haystack = normalizeToken([
    row.query,
    row.searchQuery,
    row.targetQuery,
    row.title,
    row.snippet,
    row.description,
    row.text,
    row.leagueSlug,
    row.dayKey,
    row.url,
    row.link
  ].map(asText).join(" "));

  if (asText(row.searchTargetId || row.targetId) === asText(target.searchTargetId)) return true;
  if (targetQuery && normalizeToken(row.query || row.searchQuery || row.targetQuery) === targetQuery) return true;
  if (targetLeague && targetDay && normalizeToken(row.leagueSlug) === targetLeague && normalizeToken(row.dayKey) === targetDay) return true;

  return targetQuery && haystack.includes(targetQuery.slice(0, Math.min(24, targetQuery.length)));
}

function rowToSearchResult(target, row, index) {
  const url = candidateUrlFromIndexRow(row);

  if (!url) {
    return null;
  }

  return {
    searchTargetId: asText(target.searchTargetId),
    leagueSlug: asText(target.leagueSlug),
    dayKey: asText(target.dayKey),
    query: asText(target.query),
    rank: Number(row.rank || row.position || row.resultRank || index + 1),
    title: asText(row.title),
    snippet: asText(row.snippet || row.description || row.text),
    url,
    provider: asText(row.provider || row.resultSource || row.source || "source_index_input"),
    collectorState: "collected_from_provided_source_index",
    manualCandidateUrlUsed: false,
    fetchState: "not_fetched",
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function configuredProviderState() {
  const providers = [];

  if (asText(process.env.BRAVE_SEARCH_API_KEY)) providers.push("brave_search");
  if (asText(process.env.BING_SEARCH_API_KEY)) providers.push("bing_search");
  if (asText(process.env.GOOGLE_CUSTOM_SEARCH_API_KEY) && asText(process.env.GOOGLE_CUSTOM_SEARCH_CX)) providers.push("google_custom_search");
  if (asText(process.env.TAVILY_API_KEY)) providers.push("tavily");
  if (asText(process.env.EXA_API_KEY)) providers.push("exa");

  return providers;
}

function buildProviderMissingReport(targets, options = {}) {
  const selectedTargets = Number.isFinite(options.limit) && options.limit > 0
    ? targets.slice(0, options.limit)
    : targets;

  return {
    ok: false,
    job: "collect-fixture-league-date-autonomous-search-results-file",
    mode: "read_only_fail_closed_autonomous_search_result_collector",
    generatedAt: new Date().toISOString(),
    status: "provider_missing",
    summary: {
      searchTargetCount: targets.length,
      selectedSearchTargetCount: selectedTargets.length,
      searchResultRowCount: 0,
      providerConfigured: false,
      providerMissing: true,
      sourceIndexProvided: false,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      webSearchExecuted: false,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noFakeSearch: true,
      noWebSearchWithoutProvider: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    missingProvider: {
      acceptedFutureProviderEnv: [
        "BRAVE_SEARCH_API_KEY",
        "BING_SEARCH_API_KEY",
        "GOOGLE_CUSTOM_SEARCH_API_KEY + GOOGLE_CUSTOM_SEARCH_CX",
        "TAVILY_API_KEY",
        "EXA_API_KEY"
      ],
      acceptedAlternativeInput: "--source-index <json file with sourceIndexRows/searchResultRows/results/rows/items/organicResults>",
      reason: "No configured search provider or source index was provided. Collector is fail-closed and will not invent URLs."
    },
    searchResultRows: [],
    selectedSearchTargets: selectedTargets.map((target) => ({
      searchTargetId: asText(target.searchTargetId),
      leagueSlug: asText(target.leagueSlug),
      name: asText(target.name),
      dayKey: asText(target.dayKey),
      query: asText(target.query),
      intent: asText(target.intent),
      expectedSourceFamily: asText(target.expectedSourceFamily)
    }))
  };
}

function buildSourceIndexReport(targets, sourceIndexRows, options = {}) {
  const selectedTargets = Number.isFinite(options.limit) && options.limit > 0
    ? targets.slice(0, options.limit)
    : targets;

  const searchResultRows = [];

  for (const target of selectedTargets) {
    let localRank = 1;

    for (const row of sourceIndexRows) {
      if (!targetMatchesIndexRow(target, row)) continue;

      const converted = rowToSearchResult(target, row, localRank);
      if (!converted) continue;

      searchResultRows.push(converted);
      localRank += 1;
    }
  }

  return {
    ok: true,
    job: "collect-fixture-league-date-autonomous-search-results-file",
    mode: "read_only_source_index_to_autonomous_search_results_collector",
    generatedAt: new Date().toISOString(),
    status: "source_index_collected",
    summary: {
      searchTargetCount: targets.length,
      selectedSearchTargetCount: selectedTargets.length,
      sourceIndexInputRowCount: sourceIndexRows.length,
      searchResultRowCount: searchResultRows.length,
      providerConfigured: false,
      providerMissing: false,
      sourceIndexProvided: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      webSearchExecuted: false,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noFakeSearch: true,
      noWebSearchWithoutProvider: true,
      usesOnlyProvidedSourceIndexRows: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    searchResultRows
  };
}


const PROVIDER_DISCOVERY_NON_OFFICIAL_OR_NOISE_HOST_HINTS = [
  "facebook.com",
  "inside.fifa.com",
  "fifa.com",
  "wikipedia.org",
  "footystats.",
  "betimate.",
  "bbc.",
  "soccerstats.",
  "sofascore.",
  "flashscore.",
  "aiscore.",
  "livesport.",
  "soccerway."
];

const PROVIDER_DISCOVERY_STANDINGS_SURFACE_TERMS = [
  "standings",
  "standing",
  "table",
  "league table",
  "points",
  "ranking",
  "rankings",
  "tabellen",
  "tabelle",
  "classement",
  "classification",
  "ladder"
];

function lowerText(value) {
  return asText(value).toLowerCase();
}

function hostnameWithoutWww(value) {
  return lowerText(value).replace(/^www\./, "");
}

function hostnameOfSearchRow(row) {
  const explicit = hostnameWithoutWww(row?.hostname || row?.host);
  if (explicit) return explicit;

  const rawUrl = asText(row?.url || row?.link || row?.href || row?.sourceUrl || row?.resultUrl);
  if (!rawUrl) return "";

  try {
    return hostnameWithoutWww(new URL(rawUrl).hostname);
  } catch {
    return "";
  }
}

function textHasAny(text, terms) {
  const haystack = lowerText(text);
  return terms.some((term) => haystack.includes(lowerText(term)));
}

function hostHasAnyHint(host, hints) {
  const normalizedHost = hostnameWithoutWww(host);
  return hints.some((hint) => {
    const normalizedHint = hostnameWithoutWww(hint);
    return normalizedHint && (
      normalizedHost === normalizedHint ||
      normalizedHost.endsWith(`.${normalizedHint}`) ||
      normalizedHost.includes(normalizedHint)
    );
  });
}

function targetOfficialHintHosts(target) {
  const raw = [
    ...(Array.isArray(target?.officialHintHosts) ? target.officialHintHosts : []),
    ...(Array.isArray(target?.officialRegistryHostnames) ? target.officialRegistryHostnames : []),
    target?.officialHintHost,
    target?.officialHost,
    target?.officialProviderHost,
    target?.hostname
  ];

  return raw.map(hostnameWithoutWww).filter(Boolean);
}

function searchRowSurfaceText(row) {
  return [
    row?.title,
    row?.snippet,
    row?.description,
    row?.text,
    row?.url
  ].map(asText).join(" ");
}

function isProviderDiscoveryNoiseHost(row) {
  return hostHasAnyHint(
    hostnameOfSearchRow(row),
    PROVIDER_DISCOVERY_NON_OFFICIAL_OR_NOISE_HOST_HINTS
  );
}

function hasProviderDiscoveryStandingsSurface(row) {
  return textHasAny(searchRowSurfaceText(row), PROVIDER_DISCOVERY_STANDINGS_SURFACE_TERMS);
}

function isUsableProviderDiscoverySearchResult(row, target = null) {
  const host = hostnameOfSearchRow(row);
  if (!host) return false;
  if (isProviderDiscoveryNoiseHost(row)) return false;

  const officialHints = targetOfficialHintHosts(target);
  const officialHostSignal = officialHints.length > 0 && hostHasAnyHint(host, officialHints);
  const standingsSurfaceSignal = hasProviderDiscoveryStandingsSurface(row);

  return officialHostSignal && standingsSurfaceSignal;
}

function providerAttemptFailureProfile(result) {
  const providerAttempts = Array.isArray(result?.attempts) ? result.attempts : [];
  let providerBlockedAttemptCount = 0;
  let providerZeroResultAttemptCount = 0;

  for (const attempt of providerAttempts) {
    const status = Number(attempt?.status);
    const failureReason = lowerText(attempt?.failureReason);
    const resultCount = Number(attempt?.resultCount || 0);

    if (
      status === 403 ||
      status === 429 ||
      status === 503 ||
      failureReason.includes("403") ||
      failureReason.includes("429") ||
      failureReason.includes("blocked") ||
      failureReason.includes("captcha")
    ) {
      providerBlockedAttemptCount += 1;
    }

    if ((status === 200 || status === 202) && resultCount === 0) {
      providerZeroResultAttemptCount += 1;
    }
  }

  return {
    providerAttemptCount: providerAttempts.length,
    providerBlockedAttemptCount,
    providerZeroResultAttemptCount
  };
}

function classifyProviderDiscoverySearchBatchQuality(result, target = null) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const usableResultCount = rows.filter((row) => isUsableProviderDiscoverySearchResult(row, target)).length;
  const profile = providerAttemptFailureProfile(result);

  if (rows.length === 0) {
    if (profile.providerBlockedAttemptCount > 0) {
      return {
        status: "provider_blocked_or_zero_results_needs_retry",
        providerStatus: asText(result?.status || "unknown"),
        usableResultCount,
        lowQualitySearchBatch: false,
        retryNeeded: true,
        ...profile
      };
    }

    if (profile.providerZeroResultAttemptCount > 0) {
      return {
        status: "parser_zero_results_needs_retry",
        providerStatus: asText(result?.status || "unknown"),
        usableResultCount,
        lowQualitySearchBatch: false,
        retryNeeded: true,
        ...profile
      };
    }

    return {
      status: asText(result?.status || "no_results"),
      providerStatus: asText(result?.status || "unknown"),
      usableResultCount,
      lowQualitySearchBatch: false,
      retryNeeded: false,
      ...profile
    };
  }

  const lowQualitySearchBatch = result?.ok === true && usableResultCount === 0;

  return {
    status: lowQualitySearchBatch
      ? "low_quality_search_batch_needs_review"
      : asText(result?.status || "unknown"),
    providerStatus: asText(result?.status || "unknown"),
    usableResultCount,
    lowQualitySearchBatch,
    retryNeeded: lowQualitySearchBatch,
    ...profile
  };
}
function rowToSearchResultFromWeb(target, row) {
  return {
    searchTargetId: asText(target.searchTargetId),
    leagueSlug: asText(target.leagueSlug),
    name: asText(target.name),
    dayKey: asText(target.dayKey),
    query: asText(target.query),
    intent: asText(target.intent),
    expectedSourceFamily: asText(target.expectedSourceFamily),
    rank: Number(row.rank || 0),
    title: asText(row.title),
    snippet: asText(row.snippet),
    url: normalizeUrl(row.url),
    hostname: asText(row.hostname),
    provider: asText(row.provider || row.resultSource || "autonomous_web_search"),
    resultSource: asText(row.provider || row.resultSource || "autonomous_web_search"),
    collectorState: "collected_from_autonomous_web_search",
    manualCandidateUrlUsed: false,
    inventedUrl: false,
    fetchState: "not_fetched",
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

async function buildWebSearchReport(targets, options = {}) {
  const selectedTargets = Number.isFinite(options.limit) && options.limit > 0
    ? targets.slice(0, options.limit)
    : targets;

  const searchResultRows = [];
  const searchAttempts = [];
  const byStatus = {};
  let usableSearchBatchCount = 0;
  let lowQualitySearchBatchCount = 0;
  let lowQualityRetryAttemptCount = 0;
  let providerBlockedAttemptCount = 0;
  let parserZeroResultAttemptCount = 0;
  let realNoResultAttemptCount = 0;

  for (const target of selectedTargets) {
    const query = asText(target.query);

    const result = await searchWeb(query, {
      allowSearch: options.allowSearch === true,
      timeoutMs: options.timeoutMs,
      maxChars: options.maxChars
    });

    const quality = classifyProviderDiscoverySearchBatchQuality(result, target);
    const status = quality.status;

    byStatus[status] = (byStatus[status] || 0) + 1;

    if (quality.usableResultCount > 0) usableSearchBatchCount += 1;
    if (quality.lowQualitySearchBatch) lowQualitySearchBatchCount += 1;
    if (quality.retryNeeded) lowQualityRetryAttemptCount += 1;
    if (quality.providerBlockedAttemptCount > 0) providerBlockedAttemptCount += 1;
    if (status === "parser_zero_results_needs_retry") parserZeroResultAttemptCount += 1;
    if (
      Array.isArray(result.rows) &&
      result.rows.length === 0 &&
      quality.retryNeeded !== true &&
      quality.providerBlockedAttemptCount === 0 &&
      quality.providerZeroResultAttemptCount === 0
    ) {
      realNoResultAttemptCount += 1;
    }

    searchAttempts.push({
      searchTargetId: asText(target.searchTargetId),
      leagueSlug: asText(target.leagueSlug),
      dayKey: asText(target.dayKey),
      query,
      ok: result.ok === true && quality.lowQualitySearchBatch !== true && quality.retryNeeded !== true,
      providerStatus: quality.providerStatus,
      status,
      resultCount: Array.isArray(result.rows) ? result.rows.length : 0,
      usableResultCount: quality.usableResultCount,
      lowQualitySearchBatch: quality.lowQualitySearchBatch,
      retryNeeded: quality.retryNeeded,
      providerAttemptCount: quality.providerAttemptCount,
      providerBlockedAttemptCount: quality.providerBlockedAttemptCount,
      providerZeroResultAttemptCount: quality.providerZeroResultAttemptCount,
      attempts: result.attempts || []
    });

    for (const row of result.rows || []) {
      const converted = rowToSearchResultFromWeb(target, row);
      if (!converted.url) continue;
      searchResultRows.push(converted);
    }
  }

  return {
    ok: searchResultRows.length > 0,
    job: "collect-fixture-league-date-autonomous-search-results-file",
    mode: "read_only_autonomous_web_search_results_collector",
    generatedAt: new Date().toISOString(),
    status: searchResultRows.length > 0 ? "web_search_collected" : "web_search_no_results_or_blocked",
    summary: {
      searchTargetCount: targets.length,
      selectedSearchTargetCount: selectedTargets.length,
      searchResultRowCount: searchResultRows.length,
      searchAttemptCount: searchAttempts.length,
      usableSearchBatchCount,
      lowQualitySearchBatchCount,
      lowQualityRetryAttemptCount,
      providerBlockedAttemptCount,
      parserZeroResultAttemptCount,
      realNoResultAttemptCount,
      providerConfigured: true,
      providerMissing: false,
      sourceIndexProvided: false,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      webSearchExecuted: true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byStatus
    },
    guarantees: {
      noFakeSearch: true,
      noWebSearchWithoutProvider: true,
      searchRequiresExplicitAllowSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    searchAttempts,
    searchResultRows
  };
}

async function buildReport(targetInput, options = {}) {
  const targets = selectTargets(targetInput);
  const providers = configuredProviderState();

  if (options.sourceIndexInput) {
    const sourceIndexRows = selectSourceIndexRows(options.sourceIndexInput);
    return buildSourceIndexReport(targets, sourceIndexRows, options);
  }

  if (options.allowSearch === true) {
    return buildWebSearchReport(targets, options);
  }

  if (providers.length === 0) {
    return buildProviderMissingReport(targets, options);
  }

  return {
    ok: false,
    job: "collect-fixture-league-date-autonomous-search-results-file",
    mode: "read_only_provider_configured_but_not_implemented",
    generatedAt: new Date().toISOString(),
    status: "provider_adapter_not_implemented",
    summary: {
      searchTargetCount: targets.length,
      searchResultRowCount: 0,
      providerConfigured: true,
      configuredProviders: providers,
      providerAdapterImplemented: false,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      webSearchExecuted: false,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noFakeSearch: true,
      noWebSearchWithoutProvider: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    searchResultRows: []
  };
}

async function runSelfTest() {
  const targets = {
    searchTargetRows: [
      {
        searchTargetId: "2026-05-22:gre.1:official_league_fixture_calendar:official_league:0",
        leagueSlug: "gre.1",
        name: "Super League Greece",
        dayKey: "2026-05-22",
        query: "\"Super League Greece\" official fixtures schedule 2026-05-22",
        intent: "official_league_fixture_calendar",
        expectedSourceFamily: "official_league"
      }
    ]
  };

  const missingReport = await buildReport(targets);
  if (missingReport.ok !== false) throw new Error("provider-missing report must be non-ok");
  if (missingReport.status !== "provider_missing") throw new Error("expected provider_missing");
  if (missingReport.summary.searchResultRowCount !== 0) throw new Error("provider-missing must return 0 rows");
  if (missingReport.guarantees.inventedUrls !== false) throw new Error("must not invent URLs");

  const sourceIndex = {
    sourceIndexRows: [
      {
        searchTargetId: "2026-05-22:gre.1:official_league_fixture_calendar:official_league:0",
        title: "Super League Greece official fixtures",
        snippet: "Official fixture schedule.",
        url: "https://www.slgr.gr/en/schedule/",
        provider: "self_test_source_index"
      }
    ]
  };

  const indexReport = await buildReport(targets, { sourceIndexInput: sourceIndex });
  if (indexReport.ok !== true) throw new Error("source-index report must be ok");
  if (indexReport.status !== "source_index_collected") throw new Error("expected source_index_collected");
  if (indexReport.summary.searchResultRowCount !== 1) throw new Error("expected 1 source-index row");
  if (indexReport.searchResultRows[0].url !== "https://www.slgr.gr/en/schedule/") throw new Error("unexpected collected URL");
  if (indexReport.guarantees.usesOnlyProvidedSourceIndexRows !== true) throw new Error("must use only source index rows");
  const qualityOfficial = classifyProviderDiscoverySearchBatchQuality({
    ok: true,
    status: "ok",
    rows: [
      {
        title: "OBOS-ligaen 2025 - Norges Fotballforbund",
        url: "https://www.fotball.no/fotballdata/turnering/hjem/?fiksId=199422&underside=tabellen",
        hostname: "fotball.no"
      }
    ],
    attempts: [{ provider: "self_test", status: 200, resultCount: 1 }]
  }, { officialHintHosts: ["fotball.no"] });

  if (qualityOfficial.status !== "ok" || qualityOfficial.usableResultCount !== 1) {
    throw new Error("expected official standings search result to be usable");
  }

  const qualityNoise = classifyProviderDiscoverySearchBatchQuality({
    ok: true,
    status: "ok",
    rows: [
      {
        title: "League table by aggregator",
        url: "https://www.sofascore.com/football/tournament/test",
        hostname: "sofascore.com"
      }
    ],
    attempts: [{ provider: "self_test", status: 200, resultCount: 1 }]
  }, { officialHintHosts: ["official.example"] });

  if (qualityNoise.status !== "low_quality_search_batch_needs_review") {
    throw new Error("expected non-official aggregator result to require review");
  }

  const qualityZero = classifyProviderDiscoverySearchBatchQuality({
    ok: false,
    status: "no_results_or_blocked",
    rows: [],
    attempts: [
      { provider: "duckduckgo_html", status: 202, resultCount: 0 },
      { provider: "bing_html", status: 200, resultCount: 0 }
    ]
  }, { officialHintHosts: ["official.example"] });

  if (qualityZero.status !== "parser_zero_results_needs_retry" || qualityZero.retryNeeded !== true) {
    throw new Error("expected provider 200/202 zero-result batch to need retry");
  }

  const qualityBlocked = classifyProviderDiscoverySearchBatchQuality({
    ok: false,
    status: "no_results_or_blocked",
    rows: [],
    attempts: [
      { provider: "duckduckgo_html", status: 403, resultCount: 0, failureReason: "http_403" }
    ]
  }, { officialHintHosts: ["official.example"] });

  if (qualityBlocked.status !== "provider_blocked_or_zero_results_needs_retry" || qualityBlocked.retryNeeded !== true) {
    throw new Error("expected blocked provider batch to need retry");
  }

  return {
    ok: true,
    selfTest: "collect-fixture-league-date-autonomous-search-results-file",
    providerMissingSummary: missingReport.summary,
    sourceIndexSummary: indexReport.summary,
    guarantees: indexReport.guarantees
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(await runSelfTest(), null, 2));
    return;
  }

  if (!args.targets) throw new Error("--targets is required unless --self-test is used");
  if (!args.output) throw new Error("--output is required unless --self-test is used");

  const targetInput = readJson(args.targets);
  const sourceIndexInput = args.sourceIndex ? readJson(args.sourceIndex) : null;
  const report = await buildReport(targetInput, {
    sourceIndexInput,
    allowSearch: args.allowSearch,
    timeoutMs: args.timeoutMs,
    maxChars: args.maxChars,
    limit: args.limit
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    reportOk: report.ok,
    status: report.status,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
