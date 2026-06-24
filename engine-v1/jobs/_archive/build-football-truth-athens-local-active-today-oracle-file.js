#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";
const DEFAULT_TIMEZONE = "Europe/Athens";

const DEFAULT_WORKPLAN =
  "data/football-truth/_diagnostics/global-league-activity-fixture-workplan-2026-06-13/global-league-activity-fixture-workplan-2026-06-13.json";

const DEFAULT_FRESHNESS =
  "data/football-truth/_diagnostics/global-fixture-freshness-validator-2026-06-13/global-fixture-freshness-validator-2026-06-13.json";

const DEFAULT_FIXTURES = "data/fixtures.json";

const EXPECTED_EXTERNAL_ACTIVE_TODAY = [
  {
    competitionSlug: "world.cup",
    competitionName: "FIFA World Cup",
    expectedReason: "external_fixture_recon_world_cup_games_on_athens_local_date",
    expectedMatchesMinimum: 1,
    notes: [
      "Competition is not a domestic league but must be included in active-today coverage checks.",
      "The program must not miss World Cup fixtures when building local-day activity."
    ]
  },
  {
    competitionSlug: "fin.1",
    competitionName: "Finnish Veikkausliiga",
    expectedReason: "external_fixture_recon_domestic_league_games_on_athens_local_date",
    expectedMatchesMinimum: 1,
    notes: [
      "Known stale/missing in current canonical fixture view; expected to be recovered by scoped official refresh."
    ]
  },
  {
    competitionSlug: "blr.1",
    competitionName: "Belarus Vysshaya Liga",
    expectedReason: "external_fixture_recon_domestic_league_games_on_athens_local_date",
    expectedMatchesMinimum: 1,
    notes: [
      "Expected active-today fixture evidence for Athens local date."
    ]
  },
  {
    competitionSlug: "irl.2",
    competitionName: "League of Ireland First Division",
    expectedReason: "external_fixture_recon_domestic_league_games_on_athens_local_date",
    expectedMatchesMinimum: 1,
    notes: [
      "Known fixture source mismatch in current canonical fixture file; should be recovered by official/current refresh."
    ]
  },
  {
    competitionSlug: "chi.1",
    competitionName: "Chile Primera",
    expectedReason: "external_fixture_recon_domestic_league_games_on_athens_local_date",
    expectedMatchesMinimum: 1,
    notes: [
      "Requires Athens-local day interpretation because South America fixtures can cross UTC/local-day boundaries."
    ]
  },
  {
    competitionSlug: "arg.2",
    competitionName: "Argentina Primera Nacional",
    expectedReason: "external_fixture_recon_domestic_league_games_on_athens_local_date",
    expectedMatchesMinimum: 1,
    notes: [
      "Requires Athens-local day interpretation because Argentina fixtures can cross UTC/local-day boundaries."
    ]
  }
];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    timezone: DEFAULT_TIMEZONE,
    workplan: DEFAULT_WORKPLAN,
    freshness: DEFAULT_FRESHNESS,
    fixtures: DEFAULT_FIXTURES,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--timezone") args.timezone = argv[++i];
    else if (arg === "--workplan") args.workplan = argv[++i];
    else if (arg === "--freshness") args.freshness = argv[++i];
    else if (arg === "--fixtures") args.fixtures = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `athens-local-active-today-oracle-${args.date}`,
      `athens-local-active-today-oracle-${args.date}.json`
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

function getFixtures(fixturesJson) {
  if (!fixturesJson || !Array.isArray(fixturesJson.fixtures)) return [];
  return fixturesJson.fixtures.filter((row) => row && typeof row === "object" && row.leagueSlug);
}

function localDateForUtc(value, timezone) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function getCompetitionRows(workplan, freshness) {
  const rows = new Map();

  for (const row of Array.isArray(workplan.workRows) ? workplan.workRows : []) {
    if (!row?.competitionSlug) continue;
    rows.set(row.competitionSlug, {
      competitionSlug: row.competitionSlug,
      workplanRow: row,
      freshnessRow: null
    });
  }

  for (const row of Array.isArray(freshness.validationRows) ? freshness.validationRows : []) {
    if (!row?.competitionSlug) continue;
    if (!rows.has(row.competitionSlug)) {
      rows.set(row.competitionSlug, {
        competitionSlug: row.competitionSlug,
        workplanRow: null,
        freshnessRow: row
      });
    } else {
      rows.get(row.competitionSlug).freshnessRow = row;
    }
  }

  return rows;
}

function inferProgramCurrentStatus({ expected, competitionData, currentFixtures, localDate, timezone }) {
  const currentRows = currentFixtures.filter((fixture) =>
    fixture.leagueSlug === expected.competitionSlug &&
    localDateForUtc(fixture.kickoffUtc || fixture.dayKey, timezone) === localDate
  );

  const workplanRow = competitionData?.workplanRow || null;
  const freshnessRow = competitionData?.freshnessRow || null;

  if (currentRows.length >= expected.expectedMatchesMinimum) {
    return {
      programStatusNow: "program_current_fixture_file_detects_expected_active_today",
      gapReason: "",
      requiredProgramBehavior:
        "fixture_current_window_truth_gate_must_validate_source_shape_dates_and_local_day",
      currentFixtureRowsOnAthensDate: currentRows
    };
  }

  if (freshnessRow?.freshnessStatus === "dated_fixtures_but_no_current_window") {
    return {
      programStatusNow: "program_has_only_stale_fixture_window_for_expected_active_today",
      gapReason: "stale_fixture_window",
      requiredProgramBehavior:
        "scoped official fixture refresh must recover Athens-local active-today fixtures without manual canonical injection",
      currentFixtureRowsOnAthensDate: []
    };
  }

  if (freshnessRow?.freshnessStatus === "no_observed_fixture_rows_in_current_fixtures_file") {
    return {
      programStatusNow: "program_has_fixture_count_signal_but_no_current_fixture_rows",
      gapReason: "fixture_count_source_mismatch_or_current_fixture_file_gap",
      requiredProgramBehavior:
        "resolve fixture count source mismatch and run scoped official/current fixture refresh",
      currentFixtureRowsOnAthensDate: []
    };
  }

  if (workplanRow?.fixtureLane === "official_provider_fixture_fetch_input_needed") {
    return {
      programStatusNow: "program_knows_official_provider_lane_but_has_no_current_fixture_rows",
      gapReason: "official_provider_refresh_not_yet_built_or_run",
      requiredProgramBehavior:
        "build scoped official fixture refresh input and validate current local-day fixtures",
      currentFixtureRowsOnAthensDate: []
    };
  }

  if (workplanRow?.fixtureLane === "trusted_partial_host_fixture_targets_needed") {
    return {
      programStatusNow: "program_requires_trusted_partial_host_recovery",
      gapReason: "trusted_partial_host_refresh_not_yet_built_or_run",
      requiredProgramBehavior:
        "build host-scoped fixture recovery targets and validate current local-day fixtures",
      currentFixtureRowsOnAthensDate: []
    };
  }

  if (!workplanRow && expected.competitionSlug === "world.cup") {
    return {
      programStatusNow: "program_inventory_gap_for_expected_active_today_global_competition",
      gapReason: "world_cup_not_present_in_league_activity_workplan",
      requiredProgramBehavior:
        "global/continental competition lane must be included in active-today coverage, not only domestic leagues",
      currentFixtureRowsOnAthensDate: []
    };
  }

  return {
    programStatusNow: "program_current_detection_gap",
    gapReason: "no_current_fixture_rows_or_refresh_lane_detected",
    requiredProgramBehavior:
      "competition must be covered by active-today discovery or explicit blocked lane with reason",
    currentFixtureRowsOnAthensDate: []
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.timezone !== "Europe/Athens") {
    throw new Error("This oracle is intentionally scoped to timezone Europe/Athens.");
  }

  const workplan = readJson(args.workplan);
  const freshness = readJson(args.freshness);
  const fixturesJson = readJson(args.fixtures);

  const currentFixtures = getFixtures(fixturesJson);
  const competitionRows = getCompetitionRows(workplan, freshness);

  const oracleRows = EXPECTED_EXTERNAL_ACTIVE_TODAY.map((expected) => {
    const competitionData = competitionRows.get(expected.competitionSlug) || null;
    const inferred = inferProgramCurrentStatus({
      expected,
      competitionData,
      currentFixtures,
      localDate: args.date,
      timezone: args.timezone
    });

    const workplanRow = competitionData?.workplanRow || null;
    const freshnessRow = competitionData?.freshnessRow || null;

    return {
      competitionSlug: expected.competitionSlug,
      competitionName: expected.competitionName,
      expectedActiveTodayLocalDate: args.date,
      timezone: args.timezone,
      localDayRule: "Europe/Athens local date of kickoffUtc must equal expectedActiveTodayLocalDate",
      expectedMatchesMinimum: expected.expectedMatchesMinimum,
      expectedReason: expected.expectedReason,
      expectedNotes: expected.notes,
      presentInWorkplan: Boolean(workplanRow),
      workplanActivityLane: workplanRow?.activityLane || "",
      workplanFixtureLane: workplanRow?.fixtureLane || "",
      workplanCanonicalFixtureRows: Number(workplanRow?.canonicalFixtureRows || 0),
      presentInFreshnessValidator: Boolean(freshnessRow),
      freshnessStatus: freshnessRow?.freshnessStatus || "",
      freshnessFirstFixtureDate: freshnessRow?.firstFixtureDate || "",
      freshnessLastFixtureDate: freshnessRow?.lastFixtureDate || "",
      freshnessObservedFixtureRows: Number(freshnessRow?.observedFixtureRows || 0),
      currentFixtureRowsOnAthensDateCount: inferred.currentFixtureRowsOnAthensDate.length,
      programStatusNow: inferred.programStatusNow,
      gapReason: inferred.gapReason,
      requiredProgramBehavior: inferred.requiredProgramBehavior,
      programCurrentlyPassesOracle: inferred.currentFixtureRowsOnAthensDate.length >= expected.expectedMatchesMinimum,
      currentFixtureRowsOnAthensDate: inferred.currentFixtureRowsOnAthensDate,
      canonicalWriteEligibleNow: false
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    timezone: args.timezone,
    job: "build-football-truth-athens-local-active-today-oracle-file",
    mode: "source_only_athens_local_expected_active_today_acceptance_oracle_no_search_no_fetch_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    localDayWindow: {
      localStartInclusive: "2026-06-13T00:00:00+03:00",
      localEndExclusive: "2026-06-14T00:00:00+03:00",
      utcStartInclusive: "2026-06-12T21:00:00Z",
      utcEndExclusive: "2026-06-13T21:00:00Z",
      rule: "A fixture belongs to active today only if Europe/Athens local date(kickoffUtc) equals 2026-06-13."
    },
    inputs: {
      workplan: args.workplan,
      freshness: args.freshness,
      fixtures: args.fixtures,
      currentFixtureRowsScanned: currentFixtures.length,
      expectedExternalActiveTodayCount: EXPECTED_EXTERNAL_ACTIVE_TODAY.length
    },
    summary: {
      expectedExternalActiveTodayCount: oracleRows.length,
      programCurrentlyPassesOracleCount: oracleRows.filter((row) => row.programCurrentlyPassesOracle).length,
      programCurrentlyFailsOracleCount: oracleRows.filter((row) => !row.programCurrentlyPassesOracle).length,
      expectedWorldOrGlobalCompetitionCount: oracleRows.filter((row) => row.competitionSlug === "world.cup").length,
      expectedDomesticLeagueCount: oracleRows.filter((row) => row.competitionSlug !== "world.cup").length,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_scoped_official_fixture_refresh_input_and_include_global_competition_active_today_lane"
    },
    counts: {
      byProgramStatusNow: countBy(oracleRows, "programStatusNow"),
      byGapReason: countBy(oracleRows.filter((row) => row.gapReason), "gapReason"),
      byWorkplanFixtureLane: countBy(oracleRows, "workplanFixtureLane"),
      byFreshnessStatus: countBy(oracleRows, "freshnessStatus")
    },
    guardrails: [
      "This is an acceptance oracle, not canonical truth.",
      "Do not manually inject these rows into canonical fixture data.",
      "The program must recover expected active-today competitions through scoped official/current fixture refresh.",
      "All active-today classification is based on Europe/Athens local date, not UTC calendar date.",
      "World Cup/global competitions must be covered by active-today logic, not excluded because the league workplan is domestic-league focused.",
      "canonicalWriteEligibleNow remains false for every row."
    ],
    oracleRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    expectedExternalActiveTodayCount: output.summary.expectedExternalActiveTodayCount,
    programCurrentlyPassesOracleCount: output.summary.programCurrentlyPassesOracleCount,
    programCurrentlyFailsOracleCount: output.summary.programCurrentlyFailsOracleCount,
    expectedWorldOrGlobalCompetitionCount: output.summary.expectedWorldOrGlobalCompetitionCount,
    expectedDomesticLeagueCount: output.summary.expectedDomesticLeagueCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();
