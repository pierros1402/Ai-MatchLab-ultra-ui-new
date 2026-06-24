#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { leagueName } from "../../workers/_shared/leagues-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function existsFile(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function normalizeDate(value) {
  const text = asText(value);
  const match = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return match ? match[0] : "";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    date: "",
    coverage: "",
    seasonRouting: "",
    competitionStateInventory: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--date") args.date = argv[++i] || "";
    else if (arg.startsWith("--date=")) args.date = arg.slice("--date=".length);
    else if (arg === "--coverage") args.coverage = argv[++i] || "";
    else if (arg.startsWith("--coverage=")) args.coverage = arg.slice("--coverage=".length);
    else if (arg === "--season-routing") args.seasonRouting = argv[++i] || "";
    else if (arg.startsWith("--season-routing=")) args.seasonRouting = arg.slice("--season-routing=".length);
    else if (arg === "--competition-state-inventory") args.competitionStateInventory = argv[++i] || "";
    else if (arg.startsWith("--competition-state-inventory=")) args.competitionStateInventory = arg.slice("--competition-state-inventory=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error("unknown argument: " + arg);
  }

  args.date = normalizeDate(args.date) || todayIsoDate();

  if (!args.output && !args.selfTest) {
    args.output = path.join(
      repoRoot,
      "data",
      "football-truth",
      "_diagnostics",
      "global-season-state",
      "global-season-state-inventory-" + args.date + ".json"
    );
  }

  return args;
}

function cleanCoverageRows(rows = LEAGUES_COVERAGE) {
  const seen = new Set();
  const out = [];

  for (const row of rows || []) {
    const slug = asText(row && row.slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    out.push({
      competitionSlug: slug,
      competitionName: asText(row.name) || leagueName(slug),
      competitionType: asText(row.type) || inferCompetitionType(slug),
      region: asText(row.region),
      country: asText(row.country),
      tier: Number(row.tier || 0),
      trust: Number(row.trust || 0)
    });
  }

  return out;
}

function inferCompetitionType(slug) {
  const text = asText(slug).toLowerCase();
  if (/^(uefa|caf|afc|concacaf|conmebol|ofc|fifa)\./.test(text)) return "continental";
  if (/(cup|copa|pokal|trophy|supercup|shield)/i.test(text)) return "cup";
  if (/\.\d+$/.test(text)) return "league";
  return "unknown";
}

function familyOf(row) {
  const type = asText(row.competitionType).toLowerCase();
  const slug = asText(row.competitionSlug).toLowerCase();

  if (type.includes("cup") || /(cup|copa|pokal|trophy|supercup|shield)/i.test(slug)) return "cup_or_knockout";
  if (type.includes("continental") || /^(uefa|caf|afc|concacaf|conmebol|ofc|fifa)\./i.test(slug)) return "continental_or_global";
  if (type.includes("league") || /\.\d+$/.test(slug)) return "domestic_league";
  return "other_competition";
}

function pickRows(input) {
  if (Array.isArray(input)) return input;
  for (const key of [
    "rows",
    "items",
    "normalizedLeagueDayActivityRows",
    "leagueSeasonStatusRows",
    "competitionStateInventoryRows",
    "inventoryRows",
    "routingRows"
  ]) {
    if (Array.isArray(input && input[key])) return input[key];
  }
  return [];
}

function bySlug(rows) {
  const map = new Map();

  for (const row of rows || []) {
    const slug = asText(row.competitionSlug || row.leagueSlug || row.slug);
    if (slug && !map.has(slug)) map.set(slug, row);
  }

  return map;
}

function stateFromSeasonRouting(row, family) {
  if (!row) {
    if (family === "domestic_league") {
      return {
        seasonState: "needs_standings_or_calendar_evidence",
        seasonStateConfidence: "none",
        needsFixtures: false,
        needsStandings: true,
        needsHistoricalResults: true,
        needsWinnerFinal: false,
        needsStartDate: true,
        nextAction: "discover_standings_and_competition_calendar"
      };
    }

    return {
      seasonState: "needs_calendar_or_competition_state_evidence",
      seasonStateConfidence: "none",
      needsFixtures: false,
      needsStandings: false,
      needsHistoricalResults: true,
      needsWinnerFinal: family !== "domestic_league",
      needsStartDate: true,
      nextAction: "discover_competition_calendar_or_winner_final_state"
    };
  }

  const activityState = asText(row.activityState);
  const seasonStatusState = asText(row.seasonStatusState);
  const standingsEvidenceState = asText(row.standingsEvidenceState);
  const continueAutonomousSearch = row.continueAutonomousSearch === true;

  if (activityState === "season_finished_or_out_of_season_candidate" || row.seasonFinishedCandidate === true) {
    return {
      seasonState: "finished_or_out_of_season_candidate",
      seasonStateConfidence: "medium",
      needsFixtures: false,
      needsStandings: family === "domestic_league",
      needsHistoricalResults: true,
      needsWinnerFinal: family !== "domestic_league",
      needsStartDate: true,
      nextAction: "verify_final_table_or_next_season_restart"
    };
  }

  if (activityState === "season_active_needs_day_fixture_discovery" || continueAutonomousSearch) {
    return {
      seasonState: "active_or_day_activity_unknown_needs_fixture_discovery",
      seasonStateConfidence: "low",
      needsFixtures: true,
      needsStandings: family === "domestic_league" && standingsEvidenceState === "missing_standings_evidence",
      needsHistoricalResults: true,
      needsWinnerFinal: false,
      needsStartDate: false,
      nextAction: "discover_target_date_fixtures_or_next_fixture_date"
    };
  }

  if (activityState === "season_calendar_evidence_required" || /needs_calendar_evidence/i.test(seasonStatusState)) {
    return {
      seasonState: "calendar_evidence_required",
      seasonStateConfidence: "low",
      needsFixtures: false,
      needsStandings: family === "domestic_league" && !standingsEvidenceState,
      needsHistoricalResults: true,
      needsWinnerFinal: family !== "domestic_league",
      needsStartDate: true,
      nextAction: asText(row.nextRequiredAction || row.seasonStatusNextRequiredAction) || "discover_competition_calendar_or_next_fixture_date"
    };
  }

  if (seasonStatusState === "unknown_needs_evidence") {
    return {
      seasonState: "unknown_needs_evidence",
      seasonStateConfidence: "none",
      needsFixtures: false,
      needsStandings: family === "domestic_league",
      needsHistoricalResults: true,
      needsWinnerFinal: family !== "domestic_league",
      needsStartDate: true,
      nextAction: "discover_standings_or_competition_calendar"
    };
  }

  return {
    seasonState: "needs_review",
    seasonStateConfidence: "none",
    needsFixtures: false,
    needsStandings: family === "domestic_league",
    needsHistoricalResults: true,
    needsWinnerFinal: family !== "domestic_league",
    needsStartDate: true,
    nextAction: "review_season_state_inputs"
  };
}

function competitionStateOverlay(row) {
  if (!row) {
    return {
      competitionStateEvidenceStatus: "missing_competition_state_inventory",
      winnerFinalKnown: false,
      upcomingKnown: false,
      competitionStateNextAction: "discover_competition_state_evidence"
    };
  }

  const state = asText(row.validationState || row.confirmationState || row.competitionState || row.state);
  const evidenceStatus = asText(row.evidenceStatus || row.validationState || row.confirmationState || row.state);

  const winnerFinalKnown =
    /confirmed_winner_final|winner_final_confirmed|official_result_candidate|candidate_needs_promotion_plan/i.test(state) ||
    /confirmed_winner_final|winner_final_confirmed/i.test(evidenceStatus);

  const upcomingKnown = /qualifier_calendar_validated|calendar_validated|upcoming|start_date/i.test(state + " " + evidenceStatus);

  return {
    competitionStateEvidenceStatus: evidenceStatus || "competition_state_inventory_available",
    winnerFinalKnown,
    upcomingKnown,
    competitionStateNextAction: winnerFinalKnown
      ? "build_or_run_winner_final_promotion_plan"
      : upcomingKnown
        ? "materialize_calendar_or_start_date_state"
        : "discover_or_validate_competition_state_evidence"
  };
}

function dateText(value) {
  const text = asText(value);
  if (!text) return "";
  const match = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match ? match[1] : "";
}

function firstDateCandidate(row, keys) {
  if (!row) return "";
  for (const key of keys) {
    const direct = dateText(row[key]);
    if (direct) return direct;
  }

  const evidence = row.sourceEvidence || row.evidence || row.calendarEvidence || row.restartEvidence;
  if (evidence && typeof evidence === "object") {
    for (const key of keys) {
      const nested = dateText(evidence[key]);
      if (nested) return nested;
    }
  }

  return "";
}

function calendarEvidenceNeedFor({ family, season, overlay, nextAction }) {
  const action = asText(nextAction || season?.nextAction);
  const state = asText(season?.seasonState);

  if (/restart/i.test(action) || /finished|out_of_season/i.test(state)) return "next_season_restart";
  if (/next_fixture/i.test(action) || state === "active_or_day_activity_unknown_needs_fixture_discovery") return "next_fixture_date";
  if (family === "domestic_league" && season?.needsStandings) return "standings_and_competition_calendar";
  if (overlay?.upcomingKnown) return "materialize_known_calendar_or_start_date";
  if (family === "cup_or_knockout") return "competition_calendar_or_winner_final";
  if (family === "continental_or_global") return "continental_calendar_or_start_date";
  return "competition_calendar";
}

function restartEvidenceFor({ restartDate, startDate, nextKnownFixtureDate, seasonRow, competitionStateRow, calendarEvidenceNeed }) {
  const date = restartDate || startDate || nextKnownFixtureDate;
  if (!date) return null;

  const source = competitionStateRow || seasonRow || {};
  return {
    date,
    evidenceNeed: calendarEvidenceNeed,
    sourceUrl: asText(source.sourceUrl || source.finalUrl || source.url),
    sourceHost: asText(source.sourceHost || source.hostname || source.host),
    evidenceType: asText(source.evidenceType || source.validationState || source.confirmationState || source.state),
    confidence: source.confidence == null ? null : Number(source.confidence)
  };
}

function mergeRow({ coverageRow, seasonRow, competitionStateRow, targetDate }) {
  const family = familyOf(coverageRow);
  const season = stateFromSeasonRouting(seasonRow, family);
  const overlay = competitionStateOverlay(competitionStateRow);

  let needsWinnerFinal = season.needsWinnerFinal;
  if (overlay.winnerFinalKnown) needsWinnerFinal = false;

  let nextAction = season.nextAction;
  if (family !== "domestic_league" && !overlay.winnerFinalKnown && season.seasonState !== "active_or_day_activity_unknown_needs_fixture_discovery") {
    nextAction = overlay.competitionStateNextAction;
  }

  const nextKnownFixtureDate =
    firstDateCandidate(seasonRow, ["nextKnownFixtureDate", "nextFixtureDate", "fixtureDate", "date"]) ||
    firstDateCandidate(competitionStateRow, ["nextKnownFixtureDate", "nextFixtureDate", "fixtureDate", "date"]);

  const startDate =
    firstDateCandidate(competitionStateRow, ["startDate", "seasonStartDate", "nextSeasonStartDate"]) ||
    firstDateCandidate(seasonRow, ["startDate", "seasonStartDate", "nextSeasonStartDate"]);

  const restartDate =
    firstDateCandidate(competitionStateRow, ["restartDate", "nextSeasonRestartDate", "seasonRestartDate"]) ||
    firstDateCandidate(seasonRow, ["restartDate", "nextSeasonRestartDate", "seasonRestartDate"]);

  const hasKnownCalendarDate = Boolean(nextKnownFixtureDate || startDate || restartDate);
  const calendarEvidenceNeed = calendarEvidenceNeedFor({ family, season, overlay, nextAction });
  const restartEvidence = restartEvidenceFor({
    restartDate,
    startDate,
    nextKnownFixtureDate,
    seasonRow,
    competitionStateRow,
    calendarEvidenceNeed
  });

  return {
    competitionSlug: coverageRow.competitionSlug,
    competitionName: coverageRow.competitionName,
    competitionType: coverageRow.competitionType,
    competitionFamily: family,
    region: coverageRow.region,
    country: coverageRow.country,
    tier: coverageRow.tier,
    trust: coverageRow.trust,
    targetDate,

    seasonState: season.seasonState,
    seasonStateConfidence: season.seasonStateConfidence,
    evidenceStatus: overlay.competitionStateEvidenceStatus,

    needsFixtures: season.needsFixtures,
    needsStandings: season.needsStandings,
    needsHistoricalResults: season.needsHistoricalResults,
    needsWinnerFinal,
    needsStartDate: season.needsStartDate && !hasKnownCalendarDate,

    nextKnownFixtureDate,
    startDate,
    restartDate,
    calendarEvidenceNeed,
    restartEvidence,

    hasSeasonRoutingEvidence: Boolean(seasonRow),
    hasCompetitionStateEvidence: Boolean(competitionStateRow),
    winnerFinalKnown: overlay.winnerFinalKnown,
    upcomingKnown: overlay.upcomingKnown,

    nextAction,

    sourceInputs: {
      seasonRoutingActivityState: asText(seasonRow && seasonRow.activityState),
      seasonStatusState: asText(seasonRow && seasonRow.seasonStatusState),
      standingsEvidenceState: asText(seasonRow && seasonRow.standingsEvidenceState),
      continueAutonomousSearch: seasonRow ? seasonRow.continueAutonomousSearch === true : false,
      competitionStateEvidenceStatus: overlay.competitionStateEvidenceStatus
    },

    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport({
  coverageRows = cleanCoverageRows(),
  seasonRoutingRows = [],
  competitionStateRows = [],
  targetDate = todayIsoDate(),
  seasonRoutingPath = "",
  competitionStateInventoryPath = ""
} = {}) {
  const seasonMap = bySlug(seasonRoutingRows);
  const competitionStateMap = bySlug(competitionStateRows);

  const rows = coverageRows.map((coverageRow) =>
    mergeRow({
      coverageRow,
      seasonRow: seasonMap.get(coverageRow.competitionSlug),
      competitionStateRow: competitionStateMap.get(coverageRow.competitionSlug),
      targetDate
    })
  );

  return {
    ok: true,
    job: "build-global-season-state-inventory-file",
    generatedAt: new Date().toISOString(),
    targetDate,
    inputs: {
      coverageSource: "LEAGUES_COVERAGE",
      seasonRoutingPath,
      competitionStateInventoryPath
    },
    summary: {
      coverageRowCount: coverageRows.length,
      globalSeasonStateRowCount: rows.length,
      withSeasonRoutingEvidenceCount: rows.filter((row) => row.hasSeasonRoutingEvidence).length,
      withoutSeasonRoutingEvidenceCount: rows.filter((row) => !row.hasSeasonRoutingEvidence).length,
      withCompetitionStateEvidenceCount: rows.filter((row) => row.hasCompetitionStateEvidence).length,
      withoutCompetitionStateEvidenceCount: rows.filter((row) => !row.hasCompetitionStateEvidence).length,
      needsFixturesCount: rows.filter((row) => row.needsFixtures).length,
      needsStandingsCount: rows.filter((row) => row.needsStandings).length,
      needsHistoricalResultsCount: rows.filter((row) => row.needsHistoricalResults).length,
      needsWinnerFinalCount: rows.filter((row) => row.needsWinnerFinal).length,
      needsStartDateCount: rows.filter((row) => row.needsStartDate).length,
      restartDateKnownCount: rows.filter((row) => row.restartDate).length,
      startDateKnownCount: rows.filter((row) => row.startDate).length,
      nextKnownFixtureDateCount: rows.filter((row) => row.nextKnownFixtureDate).length,
      winnerFinalKnownCount: rows.filter((row) => row.winnerFinalKnown).length,
      upcomingKnownCount: rows.filter((row) => row.upcomingKnown).length,
      byCalendarEvidenceNeed: countBy(rows, "calendarEvidenceNeed"),
      byCompetitionFamily: countBy(rows, "competitionFamily"),
      bySeasonState: countBy(rows, "seasonState"),
      byNextAction: countBy(rows, "nextAction"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    globalSeasonStateRows: rows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedDiagnosticsAndCoverageMap: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const coverageRows = [
    {
      competitionSlug: "eng.1",
      competitionName: "Premier League",
      competitionType: "league",
      country: "England",
      tier: 1,
      trust: 1
    },
    {
      competitionSlug: "afc.champions",
      competitionName: "AFC Champions League Elite",
      competitionType: "continental",
      region: "AFC",
      tier: 1,
      trust: 1
    },
    {
      competitionSlug: "test.cup",
      competitionName: "Test Cup",
      competitionType: "cup",
      country: "Testland",
      tier: 1,
      trust: 1
    }
  ];

  const seasonRoutingRows = [
    {
      leagueSlug: "eng.1",
      activityState: "season_calendar_evidence_required",
      seasonStatusState: "standings_available_needs_calendar_evidence",
      standingsEvidenceState: "standings_available_with_played_matches",
      nextRequiredAction: "discover_competition_calendar_or_next_fixture_date"
    },
    {
      leagueSlug: "afc.champions",
      activityState: "missing_day_activity_state_needs_autonomous_discovery",
      seasonStatusState: "unknown_needs_evidence",
      standingsEvidenceState: "no_standings_table_available",
      continueAutonomousSearch: true
    }
  ];

  const competitionStateRows = [
    {
      competitionSlug: "afc.champions",
      confirmationState: "confirmed_winner_final_candidate_needs_promotion_plan",
      evidenceStatus: "confirmed_from_official_and_independent_reference"
    }
  ];

  const report = buildReport({
    coverageRows,
    seasonRoutingRows,
    competitionStateRows,
    targetDate: "2026-06-03"
  });

  if (report.summary.coverageRowCount !== 3) throw new Error("expected 3 coverage rows");
  if (report.summary.globalSeasonStateRowCount !== 3) throw new Error("expected 3 inventory rows");
  if (report.summary.withSeasonRoutingEvidenceCount !== 2) throw new Error("expected 2 season routing rows");
  if (report.summary.withCompetitionStateEvidenceCount !== 1) throw new Error("expected 1 competition-state row");
  if (report.summary.winnerFinalKnownCount !== 1) throw new Error("expected 1 known winner/final");
  if (report.summary.needsWinnerFinalCount !== 1) throw new Error("expected 1 cup still needing winner/final");
  if (!report.summary.byCalendarEvidenceNeed) throw new Error("expected calendar evidence need summary");
  if (report.globalSeasonStateRows.some((row) => !row.calendarEvidenceNeed)) throw new Error("expected calendarEvidenceNeed on every inventory row");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "build-global-season-state-inventory-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const seasonRouting = args.seasonRouting && existsFile(args.seasonRouting)
    ? readJson(args.seasonRouting)
    : { rows: [] };

  const competitionStateInventory = args.competitionStateInventory && existsFile(args.competitionStateInventory)
    ? readJson(args.competitionStateInventory)
    : { rows: [] };

  const coverageRows = args.coverage && existsFile(args.coverage)
    ? cleanCoverageRows(pickRows(readJson(args.coverage)))
    : cleanCoverageRows();

  const report = buildReport({
    coverageRows,
    seasonRoutingRows: pickRows(seasonRouting),
    competitionStateRows: pickRows(competitionStateInventory),
    targetDate: args.date,
    seasonRoutingPath: args.seasonRouting,
    competitionStateInventoryPath: args.competitionStateInventory
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport, mergeRow };