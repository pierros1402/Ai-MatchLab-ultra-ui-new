#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const JOB = "build-football-truth-season-state-easy-first-workset-file";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function asText(value) {
  return value === null || value === undefined ? "" : String(value);
}

function rowsFrom(input) {
  if (Array.isArray(input.rows)) return input.rows;
  if (Array.isArray(input.boardRows)) return input.boardRows;
  return [];
}

function boolValue(value) {
  return value === true || asText(value).toLowerCase() === "true";
}

function isCupLike(slug) {
  return /(^|\.)(cup|taca|copa)$|cup|taca|copa|league_cup|challenge|pokal|coupe|fa$|trophy|super_cup/i.test(asText(slug));
}

function isContinentalOrGlobal(slug) {
  return /^(uefa|conmebol|concacaf|afc|caf|ofc|fifa)\./i.test(asText(slug));
}

function isDomesticTopOrSecondTier(slug) {
  return /^[a-z]{3}\.[12]$/i.test(asText(slug));
}

function project(row, lane, nextBulkAction) {
  return {
    leagueSlug: asText(row.leagueSlug || row.competitionSlug),
    competitionSlug: asText(row.competitionSlug || row.leagueSlug),
    competitionName: asText(row.competitionName || row.name),
    statusBucket: asText(row.statusBucket),
    standingsFileExists: boolValue(row.standingsFileExists),
    selectedCalendarEvidenceCount: Number(row.selectedCalendarEvidenceCount || 0),
    selectedCalendarEvidenceTopUrl: asText(row.selectedCalendarEvidenceTopUrl),
    needsFTRepair: boolValue(row.needsFTRepair),
    lane,
    nextBulkAction,
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildReport(input, { inputPath = "" } = {}) {
  const boardRows = rowsFrom(input);

  const calendarEvidenceReadyRows = [];
  const localStandingsUnknownRows = [];
  const finishedOrOffseasonRows = [];
  const needsCalendarAuthorityRows = [];
  const priorityAcquisitionRows = [];
  const deferredAcquisitionRows = [];

  for (const row of boardRows) {
    const slug = asText(row.leagueSlug || row.competitionSlug);
    const statusBucket = asText(row.statusBucket);
    const standingsFileExists = boolValue(row.standingsFileExists);
    const selectedCalendarEvidenceCount = Number(row.selectedCalendarEvidenceCount || 0);

    if (selectedCalendarEvidenceCount > 0) {
      calendarEvidenceReadyRows.push(project(
        row,
        "calendar_evidence_ready",
        "classify_season_state_from_selected_official_calendar_evidence"
      ));
      continue;
    }

    if (statusBucket === "FINISHED_OR_OFFSEASON_CANDIDATE") {
      finishedOrOffseasonRows.push(project(
        row,
        "finished_or_offseason_candidate",
        "verify_finished_or_offseason_and_ft_repair_if_needed"
      ));
      continue;
    }

    if (statusBucket === "NEEDS_SEASON_CALENDAR") {
      needsCalendarAuthorityRows.push(project(
        row,
        "needs_calendar_authority_seed",
        "acquire_or_discover_official_authority_seed_then_run_calendar_evidence_pipeline"
      ));
      continue;
    }

    if (statusBucket === "UNKNOWN_NEEDS_DAY_ACTIVITY_DISCOVERY") {
      if (standingsFileExists) {
        localStandingsUnknownRows.push(project(
          row,
          "unknown_with_local_standings",
          "classify_from_local_standings_or_day_activity_probe"
        ));
        continue;
      }

      if (isContinentalOrGlobal(slug) || isDomesticTopOrSecondTier(slug) || isCupLike(slug)) {
        priorityAcquisitionRows.push(project(
          row,
          "priority_acquisition_candidate",
          "bulk_fixture_or_standings_acquisition_then_state_routing"
        ));
        continue;
      }

      deferredAcquisitionRows.push(project(
        row,
        "deferred_acquisition_candidate",
        "defer_until_priority_competitions_are_resolved"
      ));
      continue;
    }

    deferredAcquisitionRows.push(project(
      row,
      "unclassified_deferred",
      "inspect_unexpected_status_bucket"
    ));
  }

  const easyFirstRows = [
    ...calendarEvidenceReadyRows,
    ...localStandingsUnknownRows,
    ...finishedOrOffseasonRows,
    ...needsCalendarAuthorityRows
  ];

  const priorityRows = [
    ...easyFirstRows,
    ...priorityAcquisitionRows
  ];

  return {
    ok: true,
    job: JOB,
    mode: "read_only_easy_first_season_state_workset",
    inputPath,
    summary: {
      boardRowCount: boardRows.length,
      easyFirstCount: easyFirstRows.length,
      priorityFirstCount: priorityRows.length,
      calendarEvidenceReadyCount: calendarEvidenceReadyRows.length,
      localStandingsUnknownCount: localStandingsUnknownRows.length,
      finishedOrOffseasonCandidateCount: finishedOrOffseasonRows.length,
      needsCalendarAuthoritySeedCount: needsCalendarAuthorityRows.length,
      priorityAcquisitionCandidateCount: priorityAcquisitionRows.length,
      deferredAcquisitionCandidateCount: deferredAcquisitionRows.length,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noWebSearch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedBoardRows: true,
      noRegistryWrites: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    easyFirstRows,
    priorityRows,
    calendarEvidenceReadyRows,
    localStandingsUnknownRows,
    finishedOrOffseasonRows,
    needsCalendarAuthorityRows,
    priorityAcquisitionRows,
    deferredAcquisitionRows
  };
}

function runSelfTest() {
  const input = {
    rows: [
      {
        leagueSlug: "esp.1",
        statusBucket: "NEEDS_SEASON_CALENDAR",
        selectedCalendarEvidenceCount: 2,
        standingsFileExists: true
      },
      {
        leagueSlug: "uefa.champions",
        statusBucket: "UNKNOWN_NEEDS_DAY_ACTIVITY_DISCOVERY",
        standingsFileExists: true
      },
      {
        leagueSlug: "aut.2",
        statusBucket: "FINISHED_OR_OFFSEASON_CANDIDATE",
        standingsFileExists: true
      },
      {
        leagueSlug: "eng.1",
        statusBucket: "NEEDS_SEASON_CALENDAR",
        standingsFileExists: true
      },
      {
        leagueSlug: "alb.1",
        statusBucket: "UNKNOWN_NEEDS_DAY_ACTIVITY_DISCOVERY",
        standingsFileExists: false
      },
      {
        leagueSlug: "zzz.misc",
        statusBucket: "UNKNOWN_NEEDS_DAY_ACTIVITY_DISCOVERY",
        standingsFileExists: false
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test" });

  if (report.summary.boardRowCount !== 6) throw new Error("expected 6 board rows");
  if (report.summary.calendarEvidenceReadyCount !== 1) throw new Error("expected 1 calendar evidence ready row");
  if (report.summary.localStandingsUnknownCount !== 1) throw new Error("expected 1 local standings unknown row");
  if (report.summary.finishedOrOffseasonCandidateCount !== 1) throw new Error("expected 1 finished/offseason row");
  if (report.summary.needsCalendarAuthoritySeedCount !== 1) throw new Error("expected 1 needs calendar authority row");
  if (report.summary.priorityAcquisitionCandidateCount !== 1) throw new Error("expected 1 priority acquisition row");
  if (report.summary.deferredAcquisitionCandidateCount !== 1) throw new Error("expected 1 deferred acquisition row");
  if (report.summary.easyFirstCount !== 4) throw new Error("expected 4 easy-first rows");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: JOB,
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  if (hasFlag("--self-test")) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const inputPath = argValue("--board") || argValue("--input");
  const outputPath = argValue("--output");

  if (!inputPath) throw new Error("Missing --board or --input");
  if (!outputPath) throw new Error("Missing --output");

  const input = readJson(inputPath);
  const report = buildReport(input, { inputPath });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
