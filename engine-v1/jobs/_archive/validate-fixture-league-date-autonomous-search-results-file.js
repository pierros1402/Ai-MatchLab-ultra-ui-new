#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
    input: "",
    output: "",
    selfTest: false,
    strict: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--strict") {
      args.strict = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = argv[++i];
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = argv[++i];
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function selectRows(input) {
  if (Array.isArray(input)) return input;

  for (const key of ["searchResultRows", "results", "rows", "items", "organicResults", "sourceIndexRows"]) {
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

function hostnameFromUrl(value) {
  const url = normalizeUrl(value);
  if (!url) return "";

  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function candidateUrlFromRow(row) {
  return normalizeUrl(
    row.url ||
    row.link ||
    row.href ||
    row.resultUrl ||
    row.sourceUrl ||
    row.candidateUrl
  );
}

function hasTargetBinding(row) {
  return Boolean(
    asText(row.searchTargetId || row.targetId) ||
    asText(row.query || row.searchQuery || row.targetQuery) ||
    (asText(row.leagueSlug) && asText(row.dayKey))
  );
}

function detectManualSeedRisk(row) {
  const source = asText(row.resultSource || row.provider || row.source).toLowerCase();
  const mode = asText(row.mode || row.inputMode || row.origin).toLowerCase();

  return (
    source.includes("manual") ||
    mode.includes("manual") ||
    row.manualCandidateUrlUsed === true ||
    row.manualSeed === true ||
    row.fromManualSeed === true
  );
}

function normalizeSearchText(value) {
  return asText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\//g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function targetEvidenceTokens(row) {
  const raw = [
    row.query,
    row.searchQuery,
    row.targetQuery,
    row.name,
    row.competitionName
  ].map(asText).filter(Boolean).join(" ");

  const text = normalizeSearchText(raw).replace(/\b20\d{2}[ -]?\d{2}[ -]?\d{2}\b/g, " ");

  const stop = new Set([
    "what", "which", "who", "where", "when", "any", "exist", "exists",
    "for", "from", "with", "and", "the", "on", "in", "of", "to",
    "fixture", "fixtures", "match", "matches", "schedule", "calendar",
    "official", "source", "sources", "football", "soccer", "club", "clubs",
    "league", "division", "season", "date", "day", "round", "game", "games",
    "if", "are", "is"
  ]);

  return [...new Set(
    text
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
      .filter((token) => !/^20\d{2}$/.test(token))
      .filter((token) => !/^\d+$/.test(token))
      .filter((token) => !stop.has(token))
  )];
}

function quotedCompetitionPhrases(row) {
  const raw = [
    row.query,
    row.searchQuery,
    row.targetQuery,
    row.name,
    row.competitionName
  ].map(asText).filter(Boolean).join(" ");

  const phrases = [];
  for (const match of raw.matchAll(/"([^"]{4,120})"/g)) {
    const phrase = normalizeSearchText(match[1]);
    if (phrase) phrases.push(phrase);
  }

  const named = normalizeSearchText(row.name || row.competitionName);
  if (named) phrases.push(named);

  return [...new Set(phrases.filter((phrase) => phrase.split(" ").length >= 2))];
}

function competitionAliasPhrases(row) {
  const aliasesByLeagueSlug = {
    "bel.1": [
      "jupiler pro league",
      "jupiler league",
      "belgian first division a",
      "first division a",
      "belgian pro league"
    ],
    "esp.2": [
      "laliga hypermotion",
      "la liga hypermotion",
      "segunda division",
      "segunda división",
      "spanish second division"
    ],
    "swe.1": [
      "allsvenskan",
      "swedish allsvenskan"
    ],
    "fin.1": [
      "veikkausliiga",
      "finnish veikkausliiga"
    ],
    "bra.1": [
      "brasileirao serie a",
      "brasileirão série a",
      "campeonato brasileiro serie a",
      "campeonato brasileiro série a",
      "brazilian serie a"
    ]
  };

  const aliasesByCompetitionPhrase = {
    "belgian pro league": [
      "jupiler pro league",
      "jupiler league",
      "belgian first division a",
      "first division a"
    ],
    "laliga hypermotion": [
      "la liga hypermotion",
      "segunda division",
      "segunda división",
      "spanish second division"
    ],
    "veikkausliiga": [
      "finnish veikkausliiga"
    ],
    "brasileirão série a": [
      "brasileirao serie a",
      "campeonato brasileiro serie a",
      "campeonato brasileiro série a",
      "brazilian serie a"
    ]
  };

  const phrases = new Set();
  const leagueSlug = asText(row.leagueSlug).toLowerCase();
  for (const alias of aliasesByLeagueSlug[leagueSlug] || []) {
    const normalized = normalizeSearchText(alias);
    if (normalized) phrases.add(normalized);
  }

  const rawTargetText = normalizeSearchText([
    row.query,
    row.searchQuery,
    row.targetQuery,
    row.name,
    row.competitionName
  ].map(asText).filter(Boolean).join(" "));

  for (const [phrase, aliases] of Object.entries(aliasesByCompetitionPhrase)) {
    if (!rawTargetText.includes(normalizeSearchText(phrase))) continue;
    for (const alias of aliases) {
      const normalized = normalizeSearchText(alias);
      if (normalized) phrases.add(normalized);
    }
  }

  return [...phrases];
}

function hasTargetTextEvidence(row, candidateUrl, hostname) {
  const tokens = targetEvidenceTokens(row);
  if (tokens.length === 0) return true;

  const evidence = normalizeSearchText([
    row.title,
    row.snippet,
    row.description,
    row.summary,
    candidateUrl,
    hostname
  ].map(asText).filter(Boolean).join(" "));

  if (!evidence) return false;

  const phrases = [
    ...quotedCompetitionPhrases(row),
    ...competitionAliasPhrases(row)
  ];

  if (phrases.some((phrase) => evidence.includes(phrase))) {
    return true;
  }

  const matchedTokens = tokens.filter((token) => evidence.includes(token));
  const requiredTokenCount = Math.min(2, tokens.length);
  return matchedTokens.length >= requiredTokenCount;
}

function hasFixtureDiscoveryEvidence(row, candidateUrl, hostname) {
  const evidence = normalizeSearchText([
    row.title,
    row.snippet,
    row.description,
    row.summary,
    candidateUrl,
    hostname
  ].map(asText).filter(Boolean).join(" "));

  if (!evidence) return false;

  const fixtureSignals = [
    "fixture",
    "fixtures",
    "schedule",
    "schedules",
    "match",
    "matches",
    "calendar",
    "results",
    "score",
    "scores",
    "livescore",
    "live score",
    "round",
    "game",
    "games",
    "calendar",
    "calendrier",
    "kalender",
    "programma",
    "program",
    "programme",
    "spielplan",
    "calendario",
    "calendário",
    "calendario partite",
    "calendrier des matchs",
    "wedstrijden",
    "matchen",
    "matcher",
    "spelschema",
    "spelprogram",
    "tabell",
    "ottelut",
    "otteluohjelma",
    "sarjataulukko",
    "jogos",
    "partidas",
    "rodada",
    "tabela"
  ];

  return fixtureSignals.some((signal) => evidence.includes(normalizeSearchText(signal)));
}

function isGenericCountryOrEncyclopediaResult(row, candidateUrl, hostname) {
  const host = asText(hostname).toLowerCase();
  const url = asText(candidateUrl).toLowerCase();
  const title = normalizeSearchText(row.title);
  const snippet = normalizeSearchText(row.snippet || row.description || row.summary);

  const genericHosts = [
    "wikipedia.org",
    "britannica.com",
    "countryreports.org",
    "nationsonline.org",
    "everyculture.com",
    "eupedia.com",
    "hellobelgium.com",
    "visitbelgium.net"
  ];

  if (genericHosts.some((genericHost) => host === genericHost || host.endsWith(`.${genericHost}`))) {
    return true;
  }

  if (host === "bbc.com" && url.includes("/news/world-")) {
    return true;
  }

  if (host === "belgium.be" && !hasFixtureDiscoveryEvidence(row, candidateUrl, hostname)) {
    return true;
  }

  const genericCountrySignals = [
    "about belgium",
    "belgium facts",
    "country belgium",
    "belgium country profile",
    "belgian population",
    "belgian government",
    "belgian culture",
    "belgian cuisine",
    "visit belgium",
    "tourism"
  ];

  return genericCountrySignals.some((signal) => {
    const normalized = normalizeSearchText(signal);
    return title.includes(normalized) || snippet.includes(normalized) || url.includes(normalized.replace(/\s+/g, "-"));
  });
}


function isNonFootballIntentMismatchResult(row, candidateUrl, hostname) {
  const host = asText(hostname).toLowerCase();
  const title = normalizeSearchText(row.title);
  const snippet = normalizeSearchText(row.snippet || row.description || row.summary);
  const url = normalizeSearchText(candidateUrl);
  const evidence = [host, title, snippet, url].join(" ");

  if (host === "flightconnections.com" || host === "denmark.dk") {
    return true;
  }

  const nonFootballSignals = [
    "flight", "flights", "airline", "airlines", "airport", "airports",
    "route map", "routes", "destinations", "book your flight",
    "language", "culture", "people and culture", "tourism", "travel",
    "visa", "population", "government"
  ];

  const footballFixtureSignals = [
    "football", "soccer", "fixture", "fixtures", "match", "matches",
    "results", "scores", "league", "cup"
  ];

  const hasNonFootballSignal = nonFootballSignals.some((signal) => evidence.includes(normalizeSearchText(signal)));
  const hasFootballFixtureSignal = footballFixtureSignals.some((signal) => evidence.includes(normalizeSearchText(signal)));

  return hasNonFootballSignal && !hasFootballFixtureSignal;
}

function validateOne(row, index, options = {}) {
  const errors = [];
  const warnings = [];

  const candidateUrl = candidateUrlFromRow(row);
  const hostname = hostnameFromUrl(candidateUrl);

  if (!candidateUrl) {
    errors.push("missing_url");
  } else if (!hostname) {
    errors.push("invalid_url_or_missing_hostname");
  }

  if (!hasTargetBinding(row)) {
    errors.push("missing_target_binding");
  }

  if (!asText(row.title) && !asText(row.snippet) && !asText(row.description)) {
    warnings.push("missing_title_or_snippet_context");
    if (options.strict) {
      errors.push("strict_missing_title_or_snippet_context");
    }
  }

  if (detectManualSeedRisk(row)) {
    errors.push("manual_seed_like_row_rejected");
  }

  if (!hasTargetTextEvidence(row, candidateUrl, hostname)) {
    errors.push("target_competition_not_confirmed");
  }

  if (!hasFixtureDiscoveryEvidence(row, candidateUrl, hostname)) {
    errors.push("fixture_source_signal_missing");
  }

  if (isGenericCountryOrEncyclopediaResult(row, candidateUrl, hostname)) {
    errors.push("generic_country_or_encyclopedia_result");
  }

  if (isNonFootballIntentMismatchResult(row, candidateUrl, hostname)) {
    errors.push("non_football_intent_mismatch_result");
  }

  const rank = Number(row.rank || row.position || row.resultRank);
  if (asText(row.rank || row.position || row.resultRank) && !Number.isFinite(rank)) {
    warnings.push("non_numeric_rank");
  }

  return {
    ok: errors.length === 0,
    sourceIndex: index,
    candidateUrl,
    hostname,
    searchTargetId: asText(row.searchTargetId || row.targetId),
    leagueSlug: asText(row.leagueSlug),
    dayKey: asText(row.dayKey),
    query: asText(row.query || row.searchQuery || row.targetQuery),
    title: asText(row.title),
    snippet: asText(row.snippet || row.description),
    provider: asText(row.provider || row.resultSource || row.source || "search_result_input"),
    rank: Number.isFinite(rank) ? rank : null,
    errors,
    warnings
  };
}

function buildReport(input, options = {}) {
  const rows = selectRows(input);
  const validated = rows.map((row, index) => validateOne(row, index, options));

  const validRows = validated
    .filter((row) => row.ok)
    .map((row) => ({
      searchTargetId: row.searchTargetId,
      leagueSlug: row.leagueSlug,
      dayKey: row.dayKey,
      query: row.query,
      rank: row.rank,
      title: row.title,
      snippet: row.snippet,
      url: row.candidateUrl,
      hostname: row.hostname,
      provider: row.provider,
      validationState: "valid_autonomous_search_result_row",
      manualCandidateUrlUsed: false,
      fetchState: "not_fetched",
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }));

  const rejectedRows = validated.filter((row) => !row.ok);
  const warningRows = validated.filter((row) => row.warnings.length > 0);

  return {
    ok: rejectedRows.length === 0,
    job: "validate-fixture-league-date-autonomous-search-results-file",
    mode: "read_only_autonomous_search_result_input_contract_validator",
    generatedAt: new Date().toISOString(),
    summary: {
      inputRowCount: rows.length,
      validRowCount: validRows.length,
      rejectedRowCount: rejectedRows.length,
      warningRowCount: warningRows.length,
      strict: Boolean(options.strict),
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      validatesOnlyProvidedSearchResults: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    contract: {
      acceptedContainers: ["searchResultRows", "results", "rows", "items", "organicResults", "sourceIndexRows"],
      requiredPerRow: [
        "url/link/href/resultUrl/sourceUrl/candidateUrl",
        "searchTargetId OR query/searchQuery/targetQuery OR leagueSlug+dayKey"
      ],
      recommendedPerRow: ["title", "snippet/description", "rank/position/resultRank", "provider/resultSource/source"],
      rejectedSignals: [
        "manual provider/source/mode",
        "manualCandidateUrlUsed=true",
        "manualSeed=true",
        "fromManualSeed=true",
        "target competition not confirmed in title/snippet/hostname/url",
        "missing fixture/schedule/match/result evidence in title/snippet/hostname/url",
        "generic country/encyclopedia/government/tourism page"
      ]
    },
    searchResultRows: validRows,
    validSearchResultRows: validRows,
    rejectedRows,
    warningRows
  };
}

function runSelfTest() {
  const sample = {
    searchResultRows: [
      {
        searchTargetId: "2026-05-22:gre.1:official_league_fixture_calendar:official_league:0",
        rank: 1,
        title: "Super League Greece fixtures",
        snippet: "Official fixture schedule.",
        url: "https://www.slgr.gr/en/schedule/",
        provider: "example_search_provider"
      },
      {
        searchTargetId: "2026-05-22:gre.1:official_league_fixture_calendar:official_league:0",
        title: "Missing URL",
        snippet: "This row is invalid.",
        provider: "example_search_provider"
      },
      {
        leagueSlug: "por.1",
        dayKey: "2026-05-22",
        title: "Manual row must be rejected",
        snippet: "Manual candidate.",
        url: "https://manual.example/fixtures",
        provider: "manual_seed"
      },
      {
        searchTargetId: "2026-05-22:bel.1:official_league_fixture_calendar:official_league:0",
        leagueSlug: "bel.1",
        dayKey: "2026-05-22",
        query: "What fixtures, if any, exist for Belgian Pro League on 2026-05-22?",
        rank: 1,
        title: "2025 Paraguayan Primera División season",
        snippet: "The Paraguayan Primera División season table and results.",
        url: "https://profilbaru.com/article/2025_Paraguayan_Primera_Divisi%C3%B3n_season",
        provider: "duckduckgo_html"
      },
      {
        searchTargetId: "2026-05-22:bel.1:official_league_fixture_calendar:official_league:0",
        leagueSlug: "bel.1",
        dayKey: "2026-05-22",
        query: "\"Belgian Pro League\" official fixtures schedule 2026-05-22",
        rank: 2,
        title: "Belgium - Encyclopedia entry",
        snippet: "Belgian population, geography and country profile.",
        url: "https://www.britannica.com/place/Belgium",
        provider: "duckduckgo_html"
      },
      {
        searchTargetId: "2026-05-22:bel.1:official_league_fixture_calendar:official_league:0",
        leagueSlug: "bel.1",
        dayKey: "2026-05-22",
        query: "\"Belgian Pro League\" official fixtures schedule 2026-05-22",
        rank: 3,
        title: "Belgian Pro League official fixtures",
        snippet: "Fixtures, match schedule and results for Belgian Pro League.",
        url: "https://www.proleague.be/en/jpl/calendar",
        provider: "duckduckgo_html"
      },
      {
        searchTargetId: "2026-05-22:bel.1:official_league_fixture_calendar:official_league:0",
        leagueSlug: "bel.1",
        dayKey: "2026-05-22",
        query: "Belgium football Belgian Pro League federation competition fixtures 2026-05-22",
        rank: 4,
        title: "Jupiler Pro League 2025/2026 Calendrier",
        snippet: "",
        url: "https://www.proleague.be/fr/jupliler-pro-league-20252026-kalender",
        provider: "duckduckgo_html"
      }
    ]
  };

  const report = buildReport(sample);

  if (report.summary.inputRowCount !== 7) throw new Error("expected 7 input rows");
  if (report.summary.validRowCount !== 3) throw new Error(`expected 3 valid rows, got ${report.summary.validRowCount}`);
  if (report.summary.rejectedRowCount !== 4) throw new Error(`expected 4 rejected rows, got ${report.summary.rejectedRowCount}`);
  if (!report.rejectedRows.some((row) => row.errors.includes("target_competition_not_confirmed"))) {
    throw new Error("expected off-target autonomous search row to be rejected");
  }
  if (!report.rejectedRows.some((row) => row.errors.includes("fixture_source_signal_missing"))) {
    throw new Error("expected non-fixture autonomous search row to be rejected");
  }
  if (!report.rejectedRows.some((row) => row.errors.includes("generic_country_or_encyclopedia_result"))) {
    throw new Error("expected generic country/encyclopedia row to be rejected");
  }
  if (report.guarantees.noWebSearch !== true) throw new Error("must not web search");
  if (report.guarantees.validatesOnlyProvidedSearchResults !== true) throw new Error("must only validate provided rows");
  if (report.guarantees.inventedUrls !== false) throw new Error("must not invent URLs");
  if (report.summary.manualCandidateUrlsUsed !== false) throw new Error("manual URLs must not be used");
  if (report.ok !== false) throw new Error("self-test report should be non-ok because invalid rows are present");

  return {
    ok: true,
    selfTest: "validate-fixture-league-date-autonomous-search-results-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required unless --self-test is used");
  if (!args.output) throw new Error("--output is required unless --self-test is used");

  const input = readJson(args.input);
  const report = buildReport(input, { strict: args.strict });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    reportOk: report.ok,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main();
}
