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
    limit: 0
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

function buildQueryIntents(row) {
  const leagueSlug = asText(row.leagueSlug);
  const name = inferName(row);
  const country = inferCountry(row);
  const dayKey = inferDayKey(row);
  const quotedName = name ? `"${name}"` : "";
  const countryFootball = country ? `${country} football` : "football";

  return [
    {
      intent: "official_league_fixture_calendar",
      priority: 100,
      query: unique([quotedName, "official", "fixtures", "schedule", dayKey]).join(" "),
      expectedSourceFamilies: ["official_league", "competition_operator"]
    },
    {
      intent: "federation_competition_calendar",
      priority: 90,
      query: unique([countryFootball, name, "federation", "competition", "fixtures", dayKey]).join(" "),
      expectedSourceFamilies: ["national_federation", "competition_operator"]
    },
    {
      intent: "official_club_fixture_crosscheck",
      priority: 80,
      query: unique([quotedName, "club fixtures", dayKey, "official"]).join(" "),
      expectedSourceFamilies: ["official_club"]
    },
    {
      intent: "trusted_independent_fixture_listing",
      priority: 60,
      query: unique([quotedName, "fixtures", dayKey, "soccer schedule"]).join(" "),
      expectedSourceFamilies: ["trusted_independent_fixture_listing"]
    },
    {
      intent: "no_fixture_adjacent_matchday_confirmation",
      priority: 55,
      query: unique([quotedName, "fixtures", "matchday", "round", dayKey]).join(" "),
      expectedSourceFamilies: ["official_league", "national_federation", "trusted_independent_fixture_listing"]
    },
    {
      intent: "slug_disambiguation",
      priority: 40,
      query: unique([leagueSlug, name, country, "fixtures", dayKey]).join(" "),
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
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : rawRows.length;
  const selectedRows = rawRows.slice(0, limit);

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
  if (report.summary.manualUrlInputCount !== 1) throw new Error("expected 1 ignored manual URL input");
  if (report.workRows.some((row) => row.leagueSlug === "should.not.use")) {
    throw new Error("lower priority inventoryRows container should not be selected when planner rows exist");
  }
  if (report.guarantees.manualCandidateUrlsUsed !== false) throw new Error("manual URLs must not be used");

  for (const row of report.workRows) {
    if (row.queryIntents.length < 4) {
      throw new Error(`missing autonomous query intents for ${row.leagueSlug}`);
    }

    const joinedQueries = row.queryIntents.map((item) => item.query).join(" ");
    if (joinedQueries.includes("manual.example")) {
      throw new Error("manual URL leaked into query intents");
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
  const report = buildReport(input, { limit: args.limit });
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
