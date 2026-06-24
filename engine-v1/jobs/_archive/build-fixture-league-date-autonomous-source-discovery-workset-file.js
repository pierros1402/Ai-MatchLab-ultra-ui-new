#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function unique(values) {
  return Array.from(new Set(values.map(asText).filter(Boolean)));
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
    limit: 0,
    leagueSlugs: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
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

    if (arg === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[++i]);
      continue;
    }

    if (arg === "--league-slugs" && argv[i + 1]) {
      args.leagueSlugs = unique(String(argv[++i]).split(","));
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function selectRows(input) {
  if (Array.isArray(input)) return input;

  const containers = [
    input.nextStages?.autonomousDiscoveryInputRows,
    input.autonomousDiscoveryInputRows,
    input.inventoryRows,
    input.reviewRows,
    input.rows,
    input.items,
    input.leagues,
    input.discoveryRows,
    input.unresolvedRows,
    input.confirmationTasks
  ];

  for (const value of containers) {
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }

  return [];
}

function inferDayKey(row) {
  return (
    asText(row.targetDate) ||
    asText(row.dayKey) ||
    asText(row.date) ||
    asText(row.localDate) ||
    asText(row.fixtureDate)
  );
}

function inferName(row) {
  return (
    asText(row.name) ||
    asText(row.leagueName) ||
    asText(row.competitionName) ||
    asText(row.competition) ||
    asText(row.label)
  );
}

function inferCountry(row) {
  return (
    asText(row.country) ||
    asText(row.countryName) ||
    asText(row.region) ||
    asText(row.nation)
  );
}

function hasManualUrl(row) {
  return [
    row.candidateUrl,
    row.sourceUrl,
    row.resolvedUrl,
    row.finalUrl,
    row.checkedSource?.url,
    row.sourceEvidence?.url
  ].some((value) => asText(value));
}

const KNOWN_COMPETITION_SEARCH_PHRASES = new Map([
  ["usa.1", {
    searchName: "Major League Soccer",
    context: "MLS football soccer",
    officialHostHint: "site:mlssoccer.com"
  }],
  ["eng.1", {
    searchName: "Premier League",
    context: "English Premier League football",
    officialHostHint: "site:premierleague.com"
  }],
  ["eng.2", {
    searchName: "EFL Championship",
    context: "English Football League Championship football",
    officialHostHint: "site:efl.com"
  }],
  ["eng.3", {
    searchName: "EFL League One",
    context: "English Football League One EFL football",
    officialHostHint: "site:efl.com"
  }],
  ["eng.4", {
    searchName: "EFL League Two",
    context: "English Football League Two EFL football",
    officialHostHint: "site:efl.com"
  }],
  ["eng.5", {
    searchName: "National League",
    context: "English National League football",
    officialHostHint: "site:thenationalleague.org.uk"
  }],
  ["eng.fa", {
    searchName: "FA Cup",
    context: "English FA Cup football",
    officialHostHint: "site:thefa.com"
  }],
  ["eng.league_cup", {
    searchName: "EFL Cup",
    context: "English League Cup Carabao Cup EFL football",
    officialHostHint: "site:efl.com"
  }],
  ["eng.trophy", {
    searchName: "EFL Trophy",
    context: "English Football League Trophy EFL football",
    officialHostHint: "site:efl.com"
  }],
  ["esp.1", {
    searchName: "LaLiga",
    context: "Spanish LaLiga football",
    officialHostHint: "site:laliga.com"
  }],
  ["esp.2", {
    searchName: "LaLiga Hypermotion",
    context: "Spanish second division football LaLiga Hypermotion Segunda División",
    officialHostHint: "site:laliga.com"
  }],
  ["esp.copa_del_rey", {
    searchName: "Copa del Rey",
    context: "Spanish Copa del Rey football",
    officialHostHint: "site:rfef.es"
  }],
  ["esp.super_cup", {
    searchName: "Supercopa de España",
    context: "Spanish Super Cup Supercopa de España football",
    officialHostHint: "site:rfef.es"
  }],
  ["ger.1", {
    searchName: "Bundesliga",
    context: "German Bundesliga football",
    officialHostHint: "site:bundesliga.com"
  }],
  ["ger.2", {
    searchName: "2. Bundesliga",
    context: "German 2. Bundesliga football",
    officialHostHint: "site:bundesliga.com"
  }],
  ["ger.3", {
    searchName: "3. Liga",
    context: "German 3. Liga football",
    officialHostHint: "site:dfb.de"
  }],
  ["ger.dfb_pokal", {
    searchName: "DFB Pokal",
    context: "German DFB Pokal football",
    officialHostHint: "site:dfb.de"
  }],
  ["ita.1", {
    searchName: "Serie A",
    context: "Italian Serie A football",
    officialHostHint: "site:legaseriea.it"
  }],
  ["ita.2", {
    searchName: "Serie B",
    context: "Italian Serie B football",
    officialHostHint: "site:legab.it"
  }],
  ["ita.coppa_italia", {
    searchName: "Coppa Italia",
    context: "Italian Coppa Italia football",
    officialHostHint: "site:legaseriea.it"
  }],
  ["fra.1", {
    searchName: "Ligue 1",
    context: "French Ligue 1 football",
    officialHostHint: "site:ligue1.com"
  }],
  ["ned.1", {
    searchName: "Eredivisie",
    context: "Dutch Eredivisie football",
    officialHostHint: "site:eredivisie.nl"
  }],
  ["bel.1", {
    searchName: "Jupiler Pro League",
    context: "Belgian Pro League Jupiler Pro League football",
    officialHostHint: "site:proleague.be"
  }],
  ["swe.1", {
    searchName: "Allsvenskan",
    context: "Swedish Allsvenskan football",
    officialHostHint: "site:allsvenskan.se"
  }],
  ["fin.1", {
    searchName: "Veikkausliiga",
    context: "Finnish Veikkausliiga football",
    officialHostHint: "site:veikkausliiga.com"
  }],
  ["bra.1", {
    searchName: "Brasileirão Série A",
    context: "Brazilian Serie A Brasileirão football",
    officialHostHint: "site:cbf.com.br"
  }],
  ["afc.champions", {
    searchName: "AFC Champions League Elite",
    context: "Asian Football Confederation football",
    officialHostHint: "site:the-afc.com"
  }],
  ["afc.cup", {
    searchName: "AFC Cup AFC Champions League Two",
    context: "Asian Football Confederation football",
    officialHostHint: "site:the-afc.com"
  }],
  ["conmebol.libertadores", {
    searchName: "Copa Libertadores",
    context: "CONMEBOL football",
    officialHostHint: "site:conmebol.com"
  }],
  ["conmebol.sudamericana", {
    searchName: "Copa Sudamericana",
    context: "CONMEBOL football",
    officialHostHint: "site:conmebol.com"
  }],
  ["uefa.champions", {
    searchName: "UEFA Champions League",
    context: "UEFA football",
    officialHostHint: "site:uefa.com"
  }],
  ["uefa.europa", {
    searchName: "UEFA Europa League",
    context: "UEFA football",
    officialHostHint: "site:uefa.com"
  }],
  ["uefa.conference", {
    searchName: "UEFA Conference League",
    context: "UEFA football",
    officialHostHint: "site:uefa.com"
  }]
]);

function looksLikePlaceholderCompetitionName(name) {
  const value = asText(name);
  return /^[A-Z][a-z]{2}(?:\s+(?:1|2|Cup))?$/.test(value);
}

function titleCaseCountryName(value) {
  return asText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part ? `${part.slice(0, 1).toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}

function buildCountryAwareSearchName(row, name, country) {
  const leagueSlug = asText(row.leagueSlug).toLowerCase();
  const known = KNOWN_COMPETITION_SEARCH_PHRASES.get(leagueSlug);
  if (known?.searchName) return known.searchName;

  if (!looksLikePlaceholderCompetitionName(name)) return name;

  const countryName = titleCaseCountryName(country);
  if (!countryName) return name;

  if (leagueSlug.endsWith(".cup") || /\bCup\b/i.test(name)) {
    return `${countryName} Cup`;
  }

  if (leagueSlug.endsWith(".2") || /\b2\b/.test(name)) {
    return `${countryName} second division`;
  }

  if (leagueSlug.endsWith(".1") || /\b1\b/.test(name)) {
    return `${countryName} top division`;
  }

  return `${countryName} football competition`;
}

function buildSearchContext(row, country) {
  const leagueSlug = asText(row.leagueSlug).toLowerCase();
  const known = KNOWN_COMPETITION_SEARCH_PHRASES.get(leagueSlug);
  if (known?.context) return known.context;

  return country ? `${country} football soccer` : "football soccer";
}

function buildOfficialHostHint(row) {
  const leagueSlug = asText(row.leagueSlug).toLowerCase();
  const known = KNOWN_COMPETITION_SEARCH_PHRASES.get(leagueSlug);
  return asText(known?.officialHostHint);
}

function buildSearchDatePhrase(dayKey) {
  const match = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
    return "";
  }

  const date = new Date(Date.UTC(year, monthIndex, day));
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function buildQueryIntents(row) {
  const leagueSlug = asText(row.leagueSlug);
  const name = inferName(row);
  const country = inferCountry(row);
  const dayKey = inferDayKey(row);
  const searchName = buildCountryAwareSearchName(row, name, country);
  const quotedName = searchName ? `"${searchName}"` : "";
  const searchContext = buildSearchContext(row, country);
  const officialHostHint = buildOfficialHostHint(row);
  const searchDatePhrase = buildSearchDatePhrase(dayKey);

  return [
    {
      intent: "official_league_fixture_calendar",
      priority: 100,
      query: unique([quotedName, searchContext, "official", "fixtures", "schedule", officialHostHint, dayKey]).join(" "),
      expectedSourceFamilies: ["official_league", "competition_operator"]
    },
    {
      intent: "official_fixture_url_surface",
      priority: 98,
      query: unique([quotedName, searchContext, "official", "fixtures", "schedule", "matches", officialHostHint]).join(" "),
      expectedSourceFamilies: ["official_league", "competition_operator"]
    },
    {
      intent: "official_date_fixture_page",
      priority: 96,
      query: unique([quotedName, searchContext, "official", "fixtures", "schedule", "matches", dayKey, searchDatePhrase, officialHostHint]).join(" "),
      expectedSourceFamilies: ["official_league", "competition_operator"]
    },
    {
      intent: "federation_competition_calendar",
      priority: 90,
      query: unique([searchContext, searchName, "federation", "competition", "fixtures", dayKey]).join(" "),
      expectedSourceFamilies: ["national_federation", "competition_operator"]
    },
    {
      intent: "official_club_fixture_crosscheck",
      priority: 80,
      query: unique([quotedName, searchContext, "club fixtures", dayKey, "official"]).join(" "),
      expectedSourceFamilies: ["official_club"]
    },
    {
      intent: "trusted_independent_fixture_listing",
      priority: 60,
      query: unique([quotedName, searchContext, "fixtures", dayKey, "soccer schedule"]).join(" "),
      expectedSourceFamilies: ["trusted_independent_fixture_listing"]
    },
    {
      intent: "trusted_sports_fixture_crosscheck",
      priority: 58,
      query: unique([
        quotedName,
        searchContext,
        "football",
        "soccer",
        "fixtures",
        "matches",
        "schedule",
        "results",
        dayKey,
        searchDatePhrase,
        "-betting",
        "-odds",
        "-prediction",
        "-tips",
        "-casino"
      ]).join(" "),
      expectedSourceFamilies: ["trusted_independent_fixture_listing", "supplemental_scoreboard_or_media"]
    },
    {
      intent: "no_fixture_adjacent_matchday_confirmation",
      priority: 55,
      query: unique([quotedName, searchContext, "fixtures", "matchday", "round", dayKey]).join(" "),
      expectedSourceFamilies: ["official_league", "national_federation", "trusted_independent_fixture_listing"]
    },
    {
      intent: "slug_disambiguation",
      priority: 40,
      query: unique([leagueSlug, searchName, country, searchContext, "fixtures", dayKey]).join(" "),
      expectedSourceFamilies: ["any_relevant"]
    }
  ].filter((item) => item.query);
}

function buildSourcePolicy() {
  return {
    sourceRanking: [
      { family: "official_league", score: 100 },
      { family: "competition_operator", score: 95 },
      { family: "national_federation", score: 90 },
      { family: "official_club", score: 75 },
      { family: "trusted_independent_fixture_listing", score: 55 },
      { family: "generic_search_result", score: 20 }
    ],
    rejectSignals: [
      "wrong country",
      "wrong competition",
      "women/reserve/youth/U19 when scope is senior",
      "cup-only page when requested scope is league",
      "betting odds page without independent fixture evidence",
      "blocked or empty content",
      "homepage noise only",
      "SVG/path/numeric asset noise",
      "no target date and no adjacent matchday context",
      "article/team-news page without fixture rows"
    ],
    requiredEvidenceForPromotion: [
      "senior target competition identity",
      "target date or unambiguous kickoff date",
      "home and away team names",
      "source URL and source family",
      "cross-source support unless official source is high-confidence"
    ],
    noFixtureEvidenceRequirements: [
      "same senior competition context",
      "target date checked",
      "adjacent matchdays or round schedule visible",
      "no youth/reserve/cup rows mistaken as league fixtures"
    ]
  };
}

function normalizeWorkRow(row, index) {
  const leagueSlug = asText(row.leagueSlug);
  const dayKey = inferDayKey(row);
  const name = inferName(row);
  const country = inferCountry(row);

  if (!leagueSlug || !dayKey || !name) {
    return {
      ok: false,
      rejectedReason: "missing_required_league_slug_day_key_or_name",
      sourceIndex: index,
      originalKeys: Object.keys(row || {})
    };
  }

  const manualUrlPresent = hasManualUrl(row);

  return {
    ok: true,
    discoveryTaskId: `${dayKey}:${leagueSlug}:autonomous-source-discovery`,
    leagueSlug,
    name,
    country,
    dayKey,
    coverageState: asText(row.coverageState) || "coverage_state_unset",
    sourceDiscoveryMode: asText(row.sourceDiscoveryMode) || "enabled",
    activityState: asText(row.activityState) || "needs_day_activity_discovery",
    dayActivityEvidenceState: asText(row.dayActivityEvidenceState) || "unverified_for_day",
    dayFixtureAcquisitionMode: asText(row.dayFixtureAcquisitionMode) || "discovery_only",
    activeForDay: row.activeForDay === true,
    noExpectedFixturesForDay: row.noExpectedFixturesForDay === true,
    outOfSeasonForDay: row.outOfSeasonForDay === true,
    nextKnownFixtureDate: asText(row.nextKnownFixtureDate) || null,
    activityReason: asText(row.activityReason) || "coverage_row_requires_day_activity_verification",
    scope: asText(row.scope) || asText(row.competitionScope) || "senior_top_division",
    previousStatus: asText(row.previousAnalystStatus) || asText(row.status) || asText(row.recommendedAction),
    manualUrlPresent,
    manualUrlPolicy: manualUrlPresent ? "ignored_for_autonomous_discovery_input" : "no_manual_url_input",
    queryIntents: buildQueryIntents(row),
    sourcePolicy: buildSourcePolicy(),
    nextStage: "search_provider_or_existing_source_index_resolution",
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildReport(input, options = {}) {
  const rawRows = selectRows(input);
  const requestedLeagueSlugs = unique(options.leagueSlugs || []).map((value) => value.toLowerCase());
  const requestedLeagueSlugSet = new Set(requestedLeagueSlugs);

  const filteredRows = requestedLeagueSlugSet.size > 0
    ? rawRows.filter((row) => requestedLeagueSlugSet.has(asText(row.leagueSlug).toLowerCase()))
    : rawRows;

  const foundLeagueSlugSet = new Set(
    filteredRows.map((row) => asText(row.leagueSlug).toLowerCase()).filter(Boolean)
  );
  const missingRequestedLeagueSlugs = requestedLeagueSlugs.filter((slug) => !foundLeagueSlugSet.has(slug));

  if (missingRequestedLeagueSlugs.length > 0) {
    throw new Error(`requested league slugs not found in input rows: ${missingRequestedLeagueSlugs.join(",")}`);
  }

  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : filteredRows.length;
  const selectedRows = filteredRows.slice(0, limit);

  const normalized = selectedRows.map((row, index) => normalizeWorkRow(row, index));
  const workRows = normalized.filter((row) => row.ok).map(({ ok, ...row }) => row);
  const rejectedRows = normalized.filter((row) => !row.ok);

  return {
    ok: true,
    job: "build-fixture-league-date-autonomous-source-discovery-workset-file",
    mode: "read_only_autonomous_fixture_source_discovery_workset",
    generatedAt: new Date().toISOString(),
    summary: {
      inputRowCount: rawRows.length,
      leagueSlugFilterCount: requestedLeagueSlugs.length,
      filteredRowCount: filteredRows.length,
      selectedRowCount: selectedRows.length,
      workRowCount: workRows.length,
      rejectedRowCount: rejectedRows.length,
      manualUrlInputCount: workRows.filter((row) => row.manualUrlPresent).length,
      queryIntentCount: workRows.reduce((sum, row) => sum + row.queryIntents.length, 0),
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    notes: [
      "This job does not accept or require hand-picked candidate URLs.",
      "Any URL fields present in source rows are ignored for autonomous discovery input.",
      "The next stage must resolve query intents through search/provider/index, then rank and fetch candidates under controlled limits."
    ],
    workRows,
    rejectedRows
  };
}

function runSelfTest() {
  const sample = {
    nextStages: {
      autonomousDiscoveryInputRows: [
        {
          leagueSlug: "gre.1",
          leagueName: "Super League Greece",
          country: "Greece",
          targetDate: "2026-05-22",
          acquisitionRoute: "autonomous_search_required",
          espnRole: "not_available",
          candidateUrl: "https://manual.example/should-not-be-used"
        },
        {
          leagueSlug: "por.1",
          name: "Primeira Liga",
          countryName: "Portugal",
          dayKey: "2026-05-22",
          acquisitionRoute: "autonomous_search_with_supplemental_crosscheck",
          espnRole: "supplemental_crosscheck_only"
        },
        {
          leagueSlug: "",
          name: "Broken League",
          targetDate: "2026-05-22"
        }
      ]
    },
    inventoryRows: [
      {
        leagueSlug: "should.not.use",
        name: "Lower priority container should not be selected",
        targetDate: "2026-05-22"
      }
    ]
  };

  const report = buildReport(sample);

  if (report.summary.inputRowCount !== 3) throw new Error("expected planner autonomous input rows to be selected first");
  if (report.summary.workRowCount !== 2) throw new Error("expected 2 work rows");
  if (report.summary.rejectedRowCount !== 1) throw new Error("expected 1 rejected row");

  const filteredReport = buildReport(sample, { leagueSlugs: ["por.1"] });
  if (filteredReport.summary.inputRowCount !== 3) throw new Error("filtered report should keep original input count");
  if (filteredReport.summary.leagueSlugFilterCount !== 1) throw new Error("expected one requested league slug");
  if (filteredReport.summary.filteredRowCount !== 1) throw new Error("expected one filtered row");
  if (filteredReport.summary.workRowCount !== 1) throw new Error("expected one filtered work row");
  if (filteredReport.workRows[0].leagueSlug !== "por.1") throw new Error("expected filtered por.1 work row");

  let missingSlugFailed = false;
  try {
    buildReport(sample, { leagueSlugs: ["missing.1"] });
  } catch (error) {
    missingSlugFailed = String(error.message || error).includes("requested league slugs not found");
  }
  if (!missingSlugFailed) throw new Error("expected missing requested league slug to fail");

  if (report.summary.manualUrlInputCount !== 1) throw new Error("expected 1 ignored manual URL input");
  if (report.workRows.some((row) => row.leagueSlug === "should.not.use")) {
    throw new Error("lower priority inventoryRows container should not be selected when planner rows exist");
  }
  if (report.guarantees.manualCandidateUrlsUsed !== false) throw new Error("manual URLs must not be used");

  for (const row of report.workRows) {
    if (row.queryIntents.length < 4) {
      throw new Error(`missing autonomous query intents for ${row.leagueSlug}`);
    }

    const intentNames = row.queryIntents.map((item) => item.intent);
    if (!intentNames.includes("official_fixture_url_surface")) {
      throw new Error(`missing official fixture URL surface intent for ${row.leagueSlug}`);
    }
    if (!intentNames.includes("official_date_fixture_page")) {
      throw new Error(`missing official date fixture page intent for ${row.leagueSlug}`);
    }

    const joinedQueries = row.queryIntents.map((item) => item.query).join(" ");
    if (joinedQueries.includes("manual.example")) {
      throw new Error("manual URL leaked into query intents");
    }
    if (!joinedQueries.includes("schedule") || !joinedQueries.includes("matches")) {
      throw new Error(`missing schedule/matches query surface terms for ${row.leagueSlug}`);
    }

    if (!intentNames.includes("trusted_sports_fixture_crosscheck")) {
      throw new Error(`missing trusted sports fixture crosscheck intent for ${row.leagueSlug}`);
    }

    const trustedSportsQuery = row.queryIntents.find((item) => item.intent === "trusted_sports_fixture_crosscheck")?.query || "";
    if (!trustedSportsQuery.includes("-betting") || !trustedSportsQuery.includes("-odds") || !trustedSportsQuery.includes("-prediction")) {
      throw new Error(`trusted sports fixture crosscheck query is missing betting/odds/prediction exclusions for ${row.leagueSlug}`);
    }
    if (/https?:\/\//i.test(trustedSportsQuery)) {
      throw new Error(`trusted sports fixture crosscheck query must not contain manual URL for ${row.leagueSlug}`);
    }
    if (/site:/i.test(trustedSportsQuery)) {
      throw new Error(`trusted sports fixture crosscheck query must not pin a supplemental site for ${row.leagueSlug}`);
    }
  }

  return {
    ok: true,
    selfTest: "build-fixture-league-date-autonomous-source-discovery-workset-file",
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
  const report = buildReport(input, { limit: args.limit, leagueSlugs: args.leagueSlugs });
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
