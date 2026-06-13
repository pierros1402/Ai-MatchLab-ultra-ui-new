#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";
const DEFAULT_TIMEZONE = "Europe/Athens";

const DEFAULT_REFRESH_INPUT =
  "data/football-truth/_diagnostics/scoped-active-today-fixture-refresh-input-2026-06-13/scoped-active-today-fixture-refresh-input-2026-06-13.json";

const PROVIDER_ROUTE_TEMPLATES = {
  "world.cup": {
    routeClass: "global_competition_fifa_fixture_lane",
    fetchUrlCandidates: [
      "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures",
      "https://inside.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026"
    ],
    adapterHint: "fifa_global_competition_fixture_lane_required"
  },

  "palloliitto_torneopal_official": {
    routeClass: "known_adapter_provider_contract",
    fetchUrlCandidates: [
      "https://tulospalvelu.palloliitto.fi/"
    ],
    adapterHint: "palloliitto_torneopal_official"
  },

  "loi_ajax_official": {
    routeClass: "known_adapter_provider_contract",
    fetchUrlCandidates: [
      "https://www.leagueofireland.ie/"
    ],
    adapterHint: "loi_ajax_official"
  },

  "sportomedia_sweden_official": {
    routeClass: "known_adapter_provider_contract",
    fetchUrlCandidates: [
      "https://www.svenskfotboll.se/",
      "https://www.allsvenskan.se/",
      "https://www.superettan.se/"
    ],
    adapterHint: "sportomedia_graphql_widget"
  },

  "spfl_opta_official": {
    routeClass: "known_adapter_provider_contract",
    fetchUrlCandidates: [
      "https://spfl.co.uk/"
    ],
    adapterHint: "spfl_opta_widget"
  },

  "bundesliga_official": {
    routeClass: "known_adapter_provider_contract",
    fetchUrlCandidates: [
      "https://www.bundesliga.com/",
      "https://www.bundesliga.de/"
    ],
    adapterHint: "bundesliga_official"
  },

  "laliga_official": {
    routeClass: "known_adapter_provider_contract",
    fetchUrlCandidates: [
      "https://www.laliga.com/en-GB/laliga-easports/results",
      "https://www.laliga.com/en-GB/laliga-hypermotion/results"
    ],
    adapterHint: "laliga_official"
  },

  "norway_ntf_official": {
    routeClass: "known_adapter_provider_contract",
    fetchUrlCandidates: [
      "https://www.eliteserien.no/",
      "https://www.obos-ligaen.no/"
    ],
    adapterHint: "norway_ntf_official"
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    timezone: DEFAULT_TIMEZONE,
    refreshInput: DEFAULT_REFRESH_INPUT,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--timezone") args.timezone = argv[++i];
    else if (arg === "--refresh-input") args.refreshInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `scoped-active-today-trusted-fixture-fetch-input-${args.date}`,
      `scoped-active-today-trusted-fixture-fetch-input-${args.date}.json`
    );
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function normalizeProviderUrl(providerHint) {
  const value = String(providerHint || "").trim();
  if (!value) return "";

  if (value.startsWith("http://") || value.startsWith("https://")) return value;

  if (
    value.includes(".") &&
    !value.includes(" ") &&
    !value.includes("/") &&
    !value.includes("_")
  ) {
    return `https://${value}/`;
  }

  return "";
}

function buildFetchCandidates(row) {
  const providerHint = row.providerHint || "";
  const providerTemplate =
    PROVIDER_ROUTE_TEMPLATES[row.competitionSlug] ||
    PROVIDER_ROUTE_TEMPLATES[providerHint] ||
    null;

  if (providerTemplate) {
    return providerTemplate.fetchUrlCandidates.map((url, index) => ({
      candidateId: `${row.competitionSlug}::${providerHint || row.competitionSlug}::template::${index + 1}`,
      fetchUrl: url,
      routeClass: providerTemplate.routeClass,
      adapterHint: providerTemplate.adapterHint,
      candidateSource: "trusted_provider_route_template",
      requiresAdapter: providerTemplate.routeClass === "known_adapter_provider_contract",
      fetchAllowedNow: false
    }));
  }

  const normalizedUrl = normalizeProviderUrl(providerHint);
  if (normalizedUrl) {
    return [
      {
        candidateId: `${row.competitionSlug}::${providerHint}::provider-homepage::1`,
        fetchUrl: normalizedUrl,
        routeClass: "trusted_provider_homepage_seed",
        adapterHint: "",
        candidateSource: "trusted_provider_hint_normalized_url",
        requiresAdapter: false,
        fetchAllowedNow: false
      }
    ];
  }

  return [];
}

function main() {
  const args = parseArgs(process.argv);

  if (args.timezone !== "Europe/Athens") {
    throw new Error("This fetch input is intentionally scoped to Europe/Athens local date.");
  }

  const refreshInput = readJson(args.refreshInput);
  const refreshRows = Array.isArray(refreshInput.refreshRows) ? refreshInput.refreshRows : [];

  const trustedRows = refreshRows.filter((row) => row.providerHintTrust === "trusted_provider_hint");
  const excludedRows = refreshRows.filter((row) => row.providerHintTrust !== "trusted_provider_hint");

  const fetchInputRows = trustedRows.map((row) => {
    const fetchCandidates = buildFetchCandidates(row);

    return {
      competitionSlug: row.competitionSlug,
      competitionName: row.competitionName || "",
      date: args.date,
      timezone: args.timezone,
      localDayRule: row.localDayRule,
      refreshClass: row.refreshClass,
      priority: row.priority,
      requiredLane: row.requiredLane,
      providerHint: row.providerHint,
      providerHintTrust: row.providerHintTrust,
      providerHintEvidence: row.providerHintEvidence,
      oracleExpectedActiveToday: Boolean(row.oracleExpectedActiveToday),
      presentInAthensOracle: Boolean(row.presentInAthensOracle),
      fetchCandidateCount: fetchCandidates.length,
      fetchCandidates,
      fetchInputStatus:
        fetchCandidates.length > 0
          ? "fetch_candidates_built_requires_explicit_approval"
          : "trusted_provider_hint_but_no_fetch_candidate_template",
      fetchAllowedNow: false,
      requiresExplicitFetchApproval: true,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      nextAction:
        fetchCandidates.length > 0
          ? "await_explicit_fetch_approval_for_this_scoped_input"
          : "add_provider_route_template_or_adapter_before_fetch"
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    timezone: args.timezone,
    job: "build-football-truth-scoped-active-today-trusted-fixture-fetch-input-file",
    mode: "source_only_scoped_fetch_input_from_trusted_provider_discovery_universe_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    requiresExplicitFetchApproval: true,
    inputs: {
      refreshInput: args.refreshInput,
      refreshRowCount: refreshRows.length,
      trustedProviderDiscoveryUniverseCount: trustedRows.length,
      excludedNonTrustedRowCount: excludedRows.length
    },
    summary: {
      fetchInputRowCount: fetchInputRows.length,
      trustedProviderDiscoveryUniverseCount: trustedRows.length,
      excludedWeakProviderRowsCount: excludedRows.filter((row) => row.providerHintTrust === "weak_provider_hint_needs_review").length,
      excludedMissingProviderRowsCount: excludedRows.filter((row) => row.providerHintTrust === "provider_hint_missing").length,
      athensOracleFetchInputRowCount: fetchInputRows.filter((row) => row.presentInAthensOracle).length,
      fetchCandidatesBuiltRowCount: fetchInputRows.filter((row) => row.fetchCandidateCount > 0).length,
      noFetchCandidateTemplateCount: fetchInputRows.filter((row) => row.fetchCandidateCount === 0).length,
      totalFetchCandidateCount: fetchInputRows.reduce((sum, row) => sum + row.fetchCandidateCount, 0),
      fetchAllowedNowCount: 0,
      requiresExplicitFetchApprovalCount: fetchInputRows.length,
      searchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "review_scoped_fetch_input_then_explicitly_approve_fetch_run_if_acceptable"
    },
    counts: {
      byRefreshClass: countBy(fetchInputRows, "refreshClass"),
      byProviderHint: countBy(fetchInputRows, "providerHint"),
      byFetchInputStatus: countBy(fetchInputRows, "fetchInputStatus"),
      byRequiredLane: countBy(fetchInputRows, "requiredLane")
    },
    guardrails: [
      "This is scoped fetch input only; it does not fetch.",
      "Only trusted_provider_hint rows from the full discovery universe are included.",
      "Weak provider hints and missing provider hints are explicitly excluded from fetch input.",
      "The six Athens oracle rows remain acceptance sample rows, not the full active-today set.",
      "Fetch requires explicit approval after reviewing this generated input.",
      "fetchAllowedNow remains false for every row.",
      "canonicalWriteEligibleNow remains false for every row."
    ],
    excludedRows: excludedRows.map((row) => ({
      competitionSlug: row.competitionSlug,
      refreshClass: row.refreshClass,
      providerHint: row.providerHint,
      providerHintTrust: row.providerHintTrust,
      exclusionReason:
        row.providerHintTrust === "weak_provider_hint_needs_review"
          ? "weak_provider_hint_requires_review_before_fetch"
          : "provider_hint_missing_requires_source_resolution_before_fetch"
    })),
    fetchInputRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    fetchInputRowCount: output.summary.fetchInputRowCount,
    trustedProviderDiscoveryUniverseCount: output.summary.trustedProviderDiscoveryUniverseCount,
    excludedWeakProviderRowsCount: output.summary.excludedWeakProviderRowsCount,
    excludedMissingProviderRowsCount: output.summary.excludedMissingProviderRowsCount,
    athensOracleFetchInputRowCount: output.summary.athensOracleFetchInputRowCount,
    fetchCandidatesBuiltRowCount: output.summary.fetchCandidatesBuiltRowCount,
    noFetchCandidateTemplateCount: output.summary.noFetchCandidateTemplateCount,
    totalFetchCandidateCount: output.summary.totalFetchCandidateCount,
    fetchAllowedNowCount: 0,
    requiresExplicitFetchApproval: true,
    searchAllowedNowCount: 0,
    canonicalWriteEligibleNowCount: 0,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();
