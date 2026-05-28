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
    targets: "",
    searchResults: "",
    output: "",
    selfTest: false,
    perTargetLimit: 5,
    perLeagueLimit: 20
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

    if (arg === "--search-results" && argv[i + 1]) {
      args.searchResults = argv[++i];
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = argv[++i];
      continue;
    }

    if (arg === "--per-target-limit" && argv[i + 1]) {
      args.perTargetLimit = Number(argv[++i]);
      continue;
    }

    if (arg === "--per-league-limit" && argv[i + 1]) {
      args.perLeagueLimit = Number(argv[++i]);
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

function selectSearchResults(input) {
  if (Array.isArray(input)) return input;

  for (const key of ["searchResultRows", "results", "rows", "items", "organicResults", "sourceIndexRows"]) {
    if (Array.isArray(input?.[key])) return input[key];
  }

  return [];
}

function normalizeWhitespace(value) {
  return asText(value).replace(/\s+/g, " ");
}

function normalizeToken(value) {
  return asText(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
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

function candidateUrlFromResult(row) {
  return normalizeUrl(
    row.url ||
    row.link ||
    row.href ||
    row.candidateUrl ||
    row.resultUrl ||
    row.sourceUrl
  );
}

function textHaystack(row) {
  return normalizeToken([
    row.title,
    row.snippet,
    row.description,
    row.text,
    row.displayedUrl,
    row.url,
    row.link,
    row.hostname
  ].map(asText).join(" "));
}

function targetTokens(target) {
  return [
    normalizeToken(target.name),
    normalizeToken(target.country),
    normalizeToken(target.dayKey),
    normalizeToken(target.scope),
    normalizeToken(target.expectedSourceFamily),
    normalizeToken(target.intent)
  ].filter(Boolean);
}

function hostEndsWith(host, suffixes) {
  return suffixes.some((suffix) => host === suffix || host.endsWith("." + suffix));
}

function hostIncludesAny(host, tokens) {
  return tokens.some((token) => host.includes(token));
}

function sourcePolicyForHost(hostname) {
  const host = normalizeToken(hostname);

  const officialGoverningHosts = [
    "premierleague.com",
    "efl.com",
    "thefa.com",
    "bundesliga.com",
    "dfb.de",
    "laliga.com",
    "rfef.es",
    "legaseriea.it",
    "figc.it",
    "ligue1.com",
    "fff.fr",
    "uefa.com",
    "fifa.com",
    "cafonline.com",
    "concacaf.com",
    "conmebol.com",
    "the-afc.com",
    "slgr.gr"
  ];

  const trustedListingHosts = [
    "flashscore.com",
    "flashscore.co.uk",
    "flashscore.co.za",
    "soccerway.com",
    "worldfootball.net",
    "aiscore.com",
    "365scores.com"
  ];

  const supplementalHosts = [
    "espn.com",
    "espn.co.uk",
    "espn.in",
    "espn.com.au"
  ];

  const lowQualityHosts = [
    "msn.com",
    "tribuna.com",
    "statmuse.com",
    "statarea.com",
    "myfootballfacts.com",
    "eplsoccertours.com",
    "the-premier-league.com",
    "fifaworldcupnews.com",
    "wikipedia.org",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "youtube.com"
  ];

  if (!host) {
    return {
      sourceClass: "unknown_host",
      truthRole: "not_truth_ready",
      scoreAdjustment: -18,
      sourceSignals: [],
      riskReasons: ["risk_missing_hostname"]
    };
  }

  if (hostEndsWith(host, officialGoverningHosts)) {
    return {
      sourceClass: "official_governing_or_competition_operator",
      truthRole: "primary_candidate_after_fetch_evidence",
      scoreAdjustment: 24,
      sourceSignals: ["official_governing_or_competition_operator_host"],
      riskReasons: []
    };
  }

  if (hostEndsWith(host, trustedListingHosts)) {
    return {
      sourceClass: "trusted_independent_fixture_listing",
      truthRole: "supplemental_crosscheck_only",
      scoreAdjustment: 0,
      sourceSignals: ["trusted_independent_fixture_listing_host"],
      riskReasons: ["supplemental_listing_not_truth_source"]
    };
  }

  if (hostEndsWith(host, supplementalHosts)) {
    return {
      sourceClass: "supplemental_scoreboard_or_media",
      truthRole: "supplemental_crosscheck_only",
      scoreAdjustment: -12,
      sourceSignals: ["supplemental_scoreboard_or_media_host"],
      riskReasons: ["supplemental_provider_not_truth_source"]
    };
  }

  if (hostEndsWith(host, lowQualityHosts) || hostIncludesAny(host, ["bet", "odds", "casino", "tip", "prediction"])) {
    return {
      sourceClass: "low_priority_or_non_truth_surface",
      truthRole: "not_truth_ready",
      scoreAdjustment: -42,
      sourceSignals: ["low_priority_or_non_truth_surface_host"],
      riskReasons: ["low_priority_or_non_truth_surface"]
    };
  }

  if (
    host.includes("federation") ||
    host.includes("federacao") ||
    host.includes("federatia") ||
    host.includes("footballassociation")
  ) {
    return {
      sourceClass: "national_federation_candidate",
      truthRole: "primary_candidate_after_fetch_evidence",
      scoreAdjustment: 14,
      sourceSignals: ["national_federation_candidate_host"],
      riskReasons: []
    };
  }

  return {
    sourceClass: "unclassified_candidate_host",
    truthRole: "not_truth_ready",
    scoreAdjustment: -10,
    sourceSignals: ["unclassified_candidate_host"],
    riskReasons: ["unclassified_host_requires_fetch_and_second_source_review"]
  };
}

function hostFamilySignals(hostname) {
  const host = normalizeToken(hostname);
  const signals = [];
  const policy = sourcePolicyForHost(hostname);

  if (!host) return signals;

  signals.push(...policy.sourceSignals);

  if (policy.sourceClass === "official_governing_or_competition_operator") {
    signals.push("official_source_hostname_verified");
  }

  if (
    host.includes("league") ||
    host.includes("liga") ||
    host.includes("superliga") ||
    host.includes("premier") ||
    host.includes("eredivisie") ||
    host.includes("ekstraklasa") ||
    host.includes("football-league")
  ) {
    if (policy.sourceClass === "official_governing_or_competition_operator") {
      signals.push("league_like_hostname_verified_official");
    } else {
      signals.push("league_like_hostname_unverified");
    }
  }

  if (
    host.includes("bet") ||
    host.includes("odds") ||
    host.includes("casino") ||
    host.includes("tip") ||
    host.includes("prediction")
  ) {
    signals.push("betting_or_prediction_risk");
  }

  return [...new Set(signals)];
}

function expectedFamilyScore(expectedFamily, hostname, haystack) {
  const family = normalizeToken(expectedFamily);
  const text = normalizeToken(haystack);
  const policy = sourcePolicyForHost(hostname);

  let score = policy.scoreAdjustment;
  const reasons = ["source_policy_" + policy.sourceClass];

  if (family.includes("official_league") || family.includes("competition_operator")) {
    if (
      policy.sourceClass === "official_governing_or_competition_operator" ||
      policy.sourceClass === "national_federation_candidate"
    ) {
      score += 30;
      reasons.push("official_family_matches_verified_governing_or_operator_host");
    } else {
      score -= 26;
      reasons.push("official_family_rejected_for_unverified_or_supplemental_host");
    }

    if (text.includes("official") && policy.truthRole === "primary_candidate_after_fetch_evidence") {
      score += 8;
      reasons.push("result_mentions_official_on_primary_candidate_host");
    }
  }

  if (family.includes("national_federation")) {
    if (
      policy.sourceClass === "national_federation_candidate" ||
      policy.sourceClass === "official_governing_or_competition_operator"
    ) {
      score += 24;
      reasons.push("federation_family_matches_governing_host");
    } else {
      score -= 18;
      reasons.push("federation_family_rejected_for_non_governing_host");
    }
  }

  if (family.includes("official_club")) {
    if (text.includes("club") || text.includes("official site") || text.includes("fixtures")) {
      score += policy.truthRole === "primary_candidate_after_fetch_evidence" ? 8 : 1;
      reasons.push("club_family_can_support_crosscheck_only");
    }
  }

  if (family.includes("trusted_independent")) {
    if (policy.sourceClass === "trusted_independent_fixture_listing") {
      score += 12;
      reasons.push("trusted_independent_fixture_index_signal");
    } else if (policy.truthRole === "primary_candidate_after_fetch_evidence") {
      score += 4;
      reasons.push("trusted_family_primary_host_can_still_support_candidate");
    }
  }

  if (family.includes("any_relevant")) {
    score += policy.sourceClass === "low_priority_or_non_truth_surface" ? -10 : 1;
    reasons.push("generic_relevance_family_not_truth_evidence");
  }

  return { score, reasons };
}

function queryMatchScore(target, result) {
  const targetQuery = normalizeToken(target.query);
  const haystack = textHaystack(result);
  const name = normalizeToken(target.name);
  const dayKey = normalizeToken(target.dayKey);

  let score = 0;
  const reasons = [];

  if (name && haystack.includes(name)) {
    score += 18;
    reasons.push("competition_name_visible");
  }

  if (dayKey && haystack.includes(dayKey)) {
    score += 12;
    reasons.push("target_date_visible");
  }

  for (const token of ["fixture", "fixtures", "schedule", "calendar", "match", "matches", "results"]) {
    if (haystack.includes(token)) {
      score += 3;
      reasons.push(`fixture_language_${token}`);
      break;
    }
  }

  const queryTokens = targetQuery.split(/\s+/).filter((token) => token.length >= 4);
  const matchedTokens = queryTokens.filter((token) => haystack.includes(token));
  const tokenRatio = queryTokens.length > 0 ? matchedTokens.length / queryTokens.length : 0;

  score += Math.round(tokenRatio * 18);
  if (matchedTokens.length > 0) {
    reasons.push(`query_token_overlap_${matchedTokens.length}_of_${queryTokens.length}`);
  }

  return { score, reasons };
}

function riskPenalty(result, hostname) {
  const haystack = textHaystack(result);
  const host = normalizeToken(hostname);
  const policy = sourcePolicyForHost(hostname);

  let penalty = 0;
  const reasons = [];

  const badSignals = [
    ["betting", 25],
    ["odds", 25],
    ["prediction", 18],
    ["casino", 30],
    ["tips", 15],
    ["u19", 12],
    ["women", 12],
    ["youth", 12],
    ["reserve", 12],
    ["wikipedia", 10],
    ["facebook", 14],
    ["instagram", 14],
    ["youtube", 10]
  ];

  for (const [signal, value] of badSignals) {
    if (host.includes(signal) || haystack.includes(signal)) {
      penalty += value;
      reasons.push("risk_" + signal);
    }
  }

  if (policy.truthRole !== "primary_candidate_after_fetch_evidence") {
    penalty += Math.abs(Math.min(0, policy.scoreAdjustment));
    reasons.push(...policy.riskReasons);
  }

  return { penalty, reasons: [...new Set(reasons)] };
}

function resultMatchesTarget(target, result) {
  const resultQuery = normalizeWhitespace(result.query || result.searchQuery || result.targetQuery);
  const resultTargetId = asText(result.searchTargetId || result.targetId);
  const resultLeagueSlug = asText(result.leagueSlug);
  const resultDayKey = asText(result.dayKey);

  if (resultTargetId && resultTargetId === asText(target.searchTargetId)) return true;

  if (resultQuery && normalizeToken(resultQuery) === normalizeToken(target.query)) return true;

  if (resultLeagueSlug && resultDayKey) {
    return resultLeagueSlug === asText(target.leagueSlug) && resultDayKey === asText(target.dayKey);
  }

  return false;
}

function rankOne(target, result, index) {
  const candidateUrl = candidateUrlFromResult(result);
  const hostname = hostnameFromUrl(candidateUrl) || asText(result.hostname).toLowerCase().replace(/^www\./, "");

  if (!candidateUrl) {
    return {
      ok: false,
      rejectedReason: "missing_result_url",
      targetId: asText(target.searchTargetId),
      resultIndex: index
    };
  }

  const haystack = textHaystack(result);
  const queryScore = queryMatchScore(target, result);
  const familyScore = expectedFamilyScore(target.expectedSourceFamily, hostname, haystack);
  const penalty = riskPenalty(result, hostname);
  const baseScore = Number(target.compositeScore) || 0;
  const resultRank = Number(result.rank || result.position || result.resultRank || index + 1);
  const rankBoost = Math.max(0, 12 - Math.min(12, resultRank));

  const compositeScore = Math.max(
    0,
    Math.min(
      100,
      Math.round((baseScore * 0.35) + queryScore.score + familyScore.score + rankBoost - penalty.penalty)
    )
  );

  return {
    ok: true,
    candidateUrl,
    hostname,
    sourceClass: sourcePolicyForHost(hostname).sourceClass,
    truthRole: sourcePolicyForHost(hostname).truthRole,
    title: asText(result.title),
    snippet: asText(result.snippet || result.description),
    leagueSlug: asText(target.leagueSlug),
    name: asText(target.name),
    country: asText(target.country),
    dayKey: asText(target.dayKey),
    scope: asText(target.scope),
    searchTargetId: asText(target.searchTargetId),
    query: asText(target.query),
    intent: asText(target.intent),
    expectedSourceFamily: asText(target.expectedSourceFamily),
    targetCompositeScore: baseScore,
    resultRank,
    compositeScore,
    sourceSignals: hostFamilySignals(hostname),
    scoreReasons: [
      ...queryScore.reasons,
      ...familyScore.reasons,
      `result_rank_boost_${rankBoost}`
    ],
    riskReasons: penalty.reasons,
    manualCandidateUrlUsed: false,
    resultSource: asText(result.resultSource || result.provider || result.source || "search_result_input"),
    fetchState: "not_fetched",
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    dedupeKey: [
      asText(target.dayKey),
      asText(target.leagueSlug).toLowerCase(),
      normalizeUrl(candidateUrl).toLowerCase()
    ].join("|")
  };
}

function dedupeAndSort(rows) {
  const byKey = new Map();

  for (const row of rows) {
    const current = byKey.get(row.dedupeKey);
    if (!current || row.compositeScore > current.compositeScore) {
      byKey.set(row.dedupeKey, row);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
    if (a.leagueSlug !== b.leagueSlug) return a.leagueSlug.localeCompare(b.leagueSlug);
    return a.candidateUrl.localeCompare(b.candidateUrl);
  });
}

function applyLimits(rows, options) {
  const perTargetLimit = Number.isFinite(options.perTargetLimit) && options.perTargetLimit > 0 ? options.perTargetLimit : 5;
  const perLeagueLimit = Number.isFinite(options.perLeagueLimit) && options.perLeagueLimit > 0 ? options.perLeagueLimit : 20;

  const targetCounts = new Map();
  const leagueCounts = new Map();

  return rows.filter((row) => {
    const targetKey = row.searchTargetId;
    const leagueKey = row.leagueSlug;
    const targetCount = targetCounts.get(targetKey) || 0;
    const leagueCount = leagueCounts.get(leagueKey) || 0;

    if (targetCount >= perTargetLimit) return false;
    if (leagueCount >= perLeagueLimit) return false;

    targetCounts.set(targetKey, targetCount + 1);
    leagueCounts.set(leagueKey, leagueCount + 1);

    return true;
  });
}

function buildReport(targetInput, resultInput, options = {}) {
  const targets = selectTargets(targetInput);
  const results = selectSearchResults(resultInput);

  const rankedRows = [];
  const rejectedRows = [];

  for (const target of targets) {
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];

      if (!resultMatchesTarget(target, result)) continue;

      const ranked = rankOne(target, result, i);

      if (ranked.ok) {
        const { ok, ...row } = ranked;
        rankedRows.push(row);
      } else {
        rejectedRows.push(ranked);
      }
    }
  }

  const dedupedRows = dedupeAndSort(rankedRows);
  const limitedRows = applyLimits(dedupedRows, options);

  const byLeague = {};
  for (const row of limitedRows) {
    if (!byLeague[row.leagueSlug]) {
      byLeague[row.leagueSlug] = {
        name: row.name,
        dayKey: row.dayKey,
        candidateUrlCount: 0,
        topCompositeScore: row.compositeScore,
        hostnames: []
      };
    }

    byLeague[row.leagueSlug].candidateUrlCount += 1;
    if (!byLeague[row.leagueSlug].hostnames.includes(row.hostname)) {
      byLeague[row.leagueSlug].hostnames.push(row.hostname);
    }
  }

  return {
    ok: true,
    job: "rank-fixture-league-date-autonomous-search-results-file",
    mode: "read_only_autonomous_search_result_url_ranking",
    generatedAt: new Date().toISOString(),
    summary: {
      searchTargetCount: targets.length,
      searchResultInputCount: results.length,
      rawRankedCandidateUrlCount: rankedRows.length,
      dedupedCandidateUrlCount: dedupedRows.length,
      candidateUrlCount: limitedRows.length,
      rejectedResultCount: rejectedRows.length,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byLeague
    },
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      usesOnlyProvidedSearchResults: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    notes: [
      "This job does not perform web search.",
      "It does not invent URLs.",
      "It ranks only URL rows supplied by a real search provider or maintained source index input.",
      "The next stage may fetch top ranked candidate URLs under controlled fetch limits."
    ],
    rankedCandidateUrlRows: limitedRows,
    rejectedRows
  };
}

function runSelfTest() {
  const targetInput = {
    searchTargetRows: [
      {
        searchTargetId: "2026-05-22:gre.1:official_league_fixture_calendar:official_league:0",
        leagueSlug: "gre.1",
        name: "Super League Greece",
        country: "Greece",
        dayKey: "2026-05-22",
        scope: "senior_top_division",
        query: "\"Super League Greece\" official fixtures schedule 2026-05-22",
        intent: "official_league_fixture_calendar",
        expectedSourceFamily: "official_league",
        compositeScore: 100
      }
    ]
  };

  const resultInput = {
    searchResultRows: [
      {
        searchTargetId: "2026-05-22:gre.1:official_league_fixture_calendar:official_league:0",
        rank: 1,
        title: "Super League Greece - Fixtures",
        snippet: "Official fixtures and match schedule for Super League Greece.",
        url: "https://www.slgr.gr/en/schedule/"
      },
      {
        searchTargetId: "2026-05-22:gre.1:official_league_fixture_calendar:official_league:0",
        rank: 2,
        title: "Super League Greece betting odds",
        snippet: "Odds, predictions and betting tips.",
        url: "https://example-betting.test/super-league-greece"
      },
      {
        searchTargetId: "2026-05-22:gre.1:official_league_fixture_calendar:official_league:0",
        rank: 3,
        title: "Missing URL result",
        snippet: "No usable URL."
      }
    ]
  };

  const report = buildReport(targetInput, resultInput);

  if (report.summary.searchTargetCount !== 1) throw new Error("expected 1 target");
  if (report.summary.searchResultInputCount !== 3) throw new Error("expected 3 input results");
  if (report.summary.rawRankedCandidateUrlCount !== 2) throw new Error("expected 2 ranked URL rows");
  if (report.summary.rejectedResultCount !== 1) throw new Error("expected 1 rejected missing-url row");
  if (report.guarantees.inventedUrls !== false) throw new Error("must not invent URLs");
  if (report.guarantees.usesOnlyProvidedSearchResults !== true) throw new Error("must use only provided search results");
  if (report.rankedCandidateUrlRows[0].candidateUrl !== "https://www.slgr.gr/en/schedule/") {
    throw new Error("official fixture result should rank first");
  }

  return {
    ok: true,
    selfTest: "rank-fixture-league-date-autonomous-search-results-file",
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

  if (!args.targets) throw new Error("--targets is required unless --self-test is used");
  if (!args.searchResults) throw new Error("--search-results is required unless --self-test is used");
  if (!args.output) throw new Error("--output is required unless --self-test is used");

  const targetInput = readJson(args.targets);
  const resultInput = readJson(args.searchResults);

  const report = buildReport(targetInput, resultInput, {
    perTargetLimit: args.perTargetLimit,
    perLeagueLimit: args.perLeagueLimit
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main();
}
