#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";
const CURRENT_DATE = "2026-06-13";

const DEFAULT_WORKPLAN =
  "data/football-truth/_diagnostics/global-league-activity-fixture-workplan-2026-06-13/global-league-activity-fixture-workplan-2026-06-13.json";

const DEFAULT_FIXTURES = "data/fixtures.json";

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    currentDate: CURRENT_DATE,
    workplan: DEFAULT_WORKPLAN,
    fixtures: DEFAULT_FIXTURES,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--current-date") args.currentDate = argv[++i];
    else if (arg === "--workplan") args.workplan = argv[++i];
    else if (arg === "--fixtures") args.fixtures = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `global-fixture-freshness-validator-${args.date}`,
      `global-fixture-freshness-validator-${args.date}.json`
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

function parseDateOnly(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString().slice(0, 10);
}

function dayDiff(aDate, bDate) {
  const a = new Date(`${aDate}T00:00:00Z`);
  const b = new Date(`${bDate}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function sourceCount(row) {
  if (row?.sourceParticipation?.sourceCount !== undefined) {
    return Number(row.sourceParticipation.sourceCount || 0);
  }

  if (row?.sources && typeof row.sources === "object" && !Array.isArray(row.sources)) {
    return Object.keys(row.sources).length;
  }

  if (row?.source) return 1;

  return 0;
}

function hasTeamShape(row) {
  return Boolean(row?.homeTeam && row?.awayTeam);
}

function hasStatusShape(row) {
  return Boolean(row?.status || row?.rawStatus || row?.operationalState);
}

function hasScoreOrScheduledShape(row) {
  if (row?.status === "PRE" || row?.operationalState === "PRE") return true;
  if (row?.scoreHome !== undefined && row?.scoreAway !== undefined) return true;
  return Boolean(row?.minute || row?.rawStatus);
}

function getFixtureRows(fixturesJson) {
  if (!fixturesJson || !Array.isArray(fixturesJson.fixtures)) {
    throw new Error("Expected data/fixtures.json shape: { fixtures: [...] }");
  }

  return fixturesJson.fixtures.filter((row) =>
    row &&
    typeof row === "object" &&
    !Array.isArray(row) &&
    row.leagueSlug
  );
}

function inferFreshness(rows, currentDate) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      freshnessStatus: "no_observed_fixture_rows_in_current_fixtures_file",
      activityCandidate: "unknown_current_canonical_fixture_gap",
      validationPriority: 85,
      blockedReason: "workplan_or_diagnostic_fixture_count_but_no_rows_in_current_fixtures_json",
      nextAction: "resolve_fixture_count_source_mismatch_then_build_scoped_official_fixture_refresh_input",
      datedRows: [],
      recentRows: [],
      upcomingRows: [],
      liveRows: [],
      preRows: [],
      finalRows: [],
      firstFixtureDate: "",
      lastFixtureDate: "",
      sourceBackedRows: [],
      teamShapeRows: [],
      statusShapeRows: [],
      scoreOrScheduledRows: []
    };
  }

  const datedRows = rows
    .map((fixture) => {
      const date = parseDateOnly(fixture.kickoffUtc || fixture.dayKey);
      return {
        fixture,
        date,
        sourceCount: sourceCount(fixture),
        hasTeams: hasTeamShape(fixture),
        hasStatus: hasStatusShape(fixture),
        hasScoreOrScheduled: hasScoreOrScheduledShape(fixture),
        isLive: fixture.isDisplayLive === true || fixture.operationalState === "LIVE",
        isPre: fixture.isDisplayPre === true || fixture.operationalState === "PRE",
        isFinal: fixture.isDisplayFinal === true || fixture.finalized === 1 || fixture.operationalState === "TERMINAL_CONFIRMED"
      };
    })
    .filter((item) => item.date);

  const recentRows = datedRows.filter((item) => {
    const diff = dayDiff(item.date, currentDate);
    return diff !== null && diff >= -21 && diff <= 0;
  });

  const upcomingRows = datedRows.filter((item) => {
    const diff = dayDiff(item.date, currentDate);
    return diff !== null && diff >= 0 && diff <= 45;
  });

  const liveRows = datedRows.filter((item) => item.isLive);
  const preRows = datedRows.filter((item) => item.isPre);
  const finalRows = datedRows.filter((item) => item.isFinal);

  const sourceBackedRows = datedRows.filter((item) => item.sourceCount > 0);
  const teamShapeRows = datedRows.filter((item) => item.hasTeams);
  const statusShapeRows = datedRows.filter((item) => item.hasStatus);
  const scoreOrScheduledRows = datedRows.filter((item) => item.hasScoreOrScheduled);

  const sortedDates = datedRows.map((item) => item.date).sort();
  const firstFixtureDate = sortedDates[0] || "";
  const lastFixtureDate = sortedDates.at(-1) || "";

  const hasCurrentWindow = recentRows.length > 0 || upcomingRows.length > 0;
  const hasValidShape =
    datedRows.length > 0 &&
    sourceBackedRows.length > 0 &&
    teamShapeRows.length > 0 &&
    statusShapeRows.length > 0 &&
    scoreOrScheduledRows.length > 0;

  if (hasCurrentWindow && hasValidShape) {
    return {
      freshnessStatus: "current_window_fixture_evidence_present",
      activityCandidate: "possibly_active_current_season",
      validationPriority: 10,
      blockedReason: "",
      nextAction: "build_fixture_current_window_truth_gate_for_source_dates_and_shape",
      datedRows,
      recentRows,
      upcomingRows,
      liveRows,
      preRows,
      finalRows,
      firstFixtureDate,
      lastFixtureDate,
      sourceBackedRows,
      teamShapeRows,
      statusShapeRows,
      scoreOrScheduledRows
    };
  }

  if (hasCurrentWindow && !hasValidShape) {
    return {
      freshnessStatus: "current_window_dates_but_incomplete_fixture_shape",
      activityCandidate: "needs_shape_or_source_validation",
      validationPriority: 30,
      blockedReason: "fixture_rows_lack_source_team_status_or_score_shape",
      nextAction: "inspect_fixture_rows_shape_before_activity_truth",
      datedRows,
      recentRows,
      upcomingRows,
      liveRows,
      preRows,
      finalRows,
      firstFixtureDate,
      lastFixtureDate,
      sourceBackedRows,
      teamShapeRows,
      statusShapeRows,
      scoreOrScheduledRows
    };
  }

  if (datedRows.length > 0) {
    return {
      freshnessStatus: "dated_fixtures_but_no_current_window",
      activityCandidate: "unknown_or_stale_fixture_window",
      validationPriority: 60,
      blockedReason: "no_recent_or_upcoming_fixture_window_relative_to_current_date",
      nextAction: "needs_scoped_official_fixture_refresh_or_season_metadata",
      datedRows,
      recentRows,
      upcomingRows,
      liveRows,
      preRows,
      finalRows,
      firstFixtureDate,
      lastFixtureDate,
      sourceBackedRows,
      teamShapeRows,
      statusShapeRows,
      scoreOrScheduledRows
    };
  }

  return {
    freshnessStatus: "fixture_rows_not_date_parseable",
    activityCandidate: "unknown",
    validationPriority: 90,
    blockedReason: "no_parseable_fixture_dates",
    nextAction: "repair_fixture_row_date_schema_or_fetch_official_fixture_source",
    datedRows,
    recentRows,
    upcomingRows,
    liveRows,
    preRows,
    finalRows,
    firstFixtureDate,
    lastFixtureDate,
    sourceBackedRows,
    teamShapeRows,
    statusShapeRows,
    scoreOrScheduledRows
  };
}

function main() {
  const args = parseArgs(process.argv);

  const workplan = readJson(args.workplan);
  const fixturesJson = readJson(args.fixtures);

  if (!Array.isArray(workplan.workRows)) throw new Error("Expected workplan.workRows array.");

  const fixtureRows = getFixtureRows(fixturesJson);
  const fixtureRowsBySlug = new Map();

  for (const fixture of fixtureRows) {
    const slug = fixture.leagueSlug;
    if (!fixtureRowsBySlug.has(slug)) fixtureRowsBySlug.set(slug, []);
    fixtureRowsBySlug.get(slug).push(fixture);
  }

  const sourceRows = workplan.workRows.filter((row) =>
    row &&
    row.fixtureLane === "fixture_rows_present_needs_current_window_validation" &&
    Number(row.canonicalFixtureRows || 0) > 0
  );

  const validationRows = sourceRows.map((row) => {
    const rows = fixtureRowsBySlug.get(row.competitionSlug) || [];
    const freshness = inferFreshness(rows, args.currentDate);

    return {
      competitionSlug: row.competitionSlug,
      canonicalFixtureRows: Number(row.canonicalFixtureRows || 0),
      observedFixtureRows: rows.length,
      parseableDateRows: freshness.datedRows.length,
      sourceBackedRows: freshness.sourceBackedRows.length,
      teamShapeRows: freshness.teamShapeRows.length,
      statusShapeRows: freshness.statusShapeRows.length,
      scoreOrScheduledShapeRows: freshness.scoreOrScheduledRows.length,
      recentRowsWithin21Days: freshness.recentRows.length,
      upcomingRowsWithin45Days: freshness.upcomingRows.length,
      liveRows: freshness.liveRows.length,
      preRows: freshness.preRows.length,
      finalRows: freshness.finalRows.length,
      firstFixtureDate: freshness.firstFixtureDate,
      lastFixtureDate: freshness.lastFixtureDate,
      freshnessStatus: freshness.freshnessStatus,
      activityCandidate: freshness.activityCandidate,
      validationPriority: freshness.validationPriority,
      blockedReason: freshness.blockedReason,
      nextAction: freshness.nextAction,
      activeTruthKnownNow: false,
      fixtureTruthKnownNow: false,
      canonicalWriteEligibleNow: false,
      sampleRecentFixtures: freshness.recentRows.slice(0, 5).map((item) => item.fixture),
      sampleUpcomingFixtures: freshness.upcomingRows.slice(0, 5).map((item) => item.fixture),
      sampleFixtures: rows.slice(0, 5)
    };
  }).sort((a, b) => {
    if (a.validationPriority !== b.validationPriority) return a.validationPriority - b.validationPriority;
    if (b.upcomingRowsWithin45Days !== a.upcomingRowsWithin45Days) return b.upcomingRowsWithin45Days - a.upcomingRowsWithin45Days;
    if (b.recentRowsWithin21Days !== a.recentRowsWithin21Days) return b.recentRowsWithin21Days - a.recentRowsWithin21Days;
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    currentDate: args.currentDate,
    job: "build-football-truth-global-fixture-freshness-validator-file",
    mode: "source_only_fixture_freshness_validator_real_fixtures_schema_no_search_no_fetch_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      workplan: args.workplan,
      fixtures: args.fixtures,
      fixtureRowsScanned: fixtureRows.length,
      sourceFixtureWorkRows: sourceRows.length
    },
    summary: {
      sourceFixtureWorkRows: sourceRows.length,
      validationRowCount: validationRows.length,
      currentWindowFixtureEvidencePresentCount: validationRows.filter((row) => row.freshnessStatus === "current_window_fixture_evidence_present").length,
      currentWindowDatesButIncompleteShapeCount: validationRows.filter((row) => row.freshnessStatus === "current_window_dates_but_incomplete_fixture_shape").length,
      datedFixturesButNoCurrentWindowCount: validationRows.filter((row) => row.freshnessStatus === "dated_fixtures_but_no_current_window").length,
      noObservedFixtureRowsInCurrentFixturesFileCount: validationRows.filter((row) => row.freshnessStatus === "no_observed_fixture_rows_in_current_fixtures_file").length,
      fixtureRowsNotDateParseableCount: validationRows.filter((row) => row.freshnessStatus === "fixture_rows_not_date_parseable").length,
      activeTruthKnownNowCount: 0,
      fixtureTruthKnownNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane:
        validationRows.some((row) => row.freshnessStatus === "current_window_fixture_evidence_present")
          ? "build_fixture_current_window_truth_gate_for_current_window_candidates"
          : validationRows.some((row) => row.freshnessStatus === "no_observed_fixture_rows_in_current_fixtures_file")
            ? "resolve_fixture_count_source_mismatch_and_build_scoped_official_fixture_refresh_input"
            : "build_scoped_official_fixture_refresh_input_for_stale_fixture_windows"
    },
    counts: {
      byFreshnessStatus: countBy(validationRows, "freshnessStatus"),
      byActivityCandidate: countBy(validationRows, "activityCandidate"),
      byBlockedReason: countBy(validationRows.filter((row) => row.blockedReason), "blockedReason")
    },
    guardrails: [
      "This validator is bound to the real data/fixtures.json fixtures[] schema.",
      "It does not fetch or search.",
      "Current-window fixture evidence is not final truth until source and fixture shape are validated.",
      "Stale fixture windows do not prove inactive; they require scoped official refresh or season metadata.",
      "A diagnostic fixture count without rows in current data/fixtures.json is treated as a source-count mismatch, not as non-parseable dates.",
      "activeTruthKnownNow remains false for every row.",
      "fixtureTruthKnownNow remains false for every row.",
      "canonicalWriteEligibleNow remains false for every row."
    ],
    validationRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    fixtureRowsScanned: output.inputs.fixtureRowsScanned,
    sourceFixtureWorkRows: output.summary.sourceFixtureWorkRows,
    validationRowCount: output.summary.validationRowCount,
    currentWindowFixtureEvidencePresentCount: output.summary.currentWindowFixtureEvidencePresentCount,
    currentWindowDatesButIncompleteShapeCount: output.summary.currentWindowDatesButIncompleteShapeCount,
    datedFixturesButNoCurrentWindowCount: output.summary.datedFixturesButNoCurrentWindowCount,
    noObservedFixtureRowsInCurrentFixturesFileCount: output.summary.noObservedFixtureRowsInCurrentFixturesFileCount,
    fixtureRowsNotDateParseableCount: output.summary.fixtureRowsNotDateParseableCount,
    activeTruthKnownNowCount: output.summary.activeTruthKnownNowCount,
    fixtureTruthKnownNowCount: output.summary.fixtureTruthKnownNowCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();

