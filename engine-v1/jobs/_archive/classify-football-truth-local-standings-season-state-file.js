#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const JOB = "classify-football-truth-local-standings-season-state-file";

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

function asBool(value) {
  return value === true || asText(value).toLowerCase() === "true";
}

function rowsFrom(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.usableLocalStandingRows)) return input.usableLocalStandingRows;
  if (Array.isArray(input.rows)) return input.rows;
  return [];
}

function inventoryRowsFrom(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.inventoryRows)) return input.inventoryRows;
  if (Array.isArray(input.footballTruthStateInventoryRows)) return input.footballTruthStateInventoryRows;
  if (Array.isArray(input.rows)) return input.rows;
  return [];
}

function inventoryMap(input) {
  const out = new Map();
  for (const row of inventoryRowsFrom(input)) {
    const slug = asText(row.leagueSlug || row.competitionSlug);
    if (slug && !out.has(slug)) out.set(slug, row);
  }
  return out;
}

function isDomesticLeague(slug) {
  return /^[a-z]{3}\.[12345]$/i.test(asText(slug));
}

function classify(row, inv = {}) {
  const slug = asText(row.leagueSlug || row.competitionSlug);
  const hasReadableStandings = Number(row.totalReadableStandingRows || 0) > 0;
  const historyFinalRows = Number(inv.historyFinalRowsCount || 0);
  const todayFixtures = Number(inv.canonicalFixtureCountToday || 0);
  const nextWindowFixtures = Number(inv.canonicalFixtureCountNextWindow || 0);
  const next7Fixtures = Number(inv.canonicalFixtureCountNext7Days || 0);
  const needsFTRepair = asBool(inv.needsFTRepair);

  if (!hasReadableStandings) {
    return {
      seasonStateCandidate: "needs_standings_repair",
      confidence: "high",
      decisionReasons: ["no_readable_standings_rows"],
      nextAction: "repair_standings_materialization"
    };
  }

  if (needsFTRepair) {
    return {
      seasonStateCandidate: "needs_ft_repair_before_state",
      confidence: "medium",
      decisionReasons: ["inventory_needs_ft_repair"],
      nextAction: "run_ft_repair_or_final_result_verification"
    };
  }

  if (todayFixtures > 0 || nextWindowFixtures > 0 || next7Fixtures > 0) {
    return {
      seasonStateCandidate: "active_or_upcoming_known",
      confidence: "medium",
      decisionReasons: ["canonical_fixture_window_has_rows"],
      nextAction: "use_fixture_window_to_confirm_active_state"
    };
  }

  if (isDomesticLeague(slug) && historyFinalRows > 0) {
    return {
      seasonStateCandidate: "standings_context_available_needs_next_fixture_probe",
      confidence: "medium",
      decisionReasons: ["domestic_league", "readable_standings", "history_final_rows_available", "no_canonical_upcoming_window"],
      nextAction: "probe_next_fixture_or_calendar_for_active_finished_offseason"
    };
  }

  if (isDomesticLeague(slug)) {
    return {
      seasonStateCandidate: "standings_context_available_needs_history_or_fixture_probe",
      confidence: "low",
      decisionReasons: ["domestic_league", "readable_standings", "no_history_final_rows", "no_canonical_upcoming_window"],
      nextAction: "probe_history_and_next_fixture_calendar"
    };
  }

  return {
    seasonStateCandidate: "cup_or_continental_context_available_needs_competition_state_probe",
    confidence: "medium",
    decisionReasons: ["cup_or_continental", "readable_standings_or_phase_rows"],
    nextAction: "probe_competition_calendar_or_winner_final"
  };
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport(standingsInput, inventoryInput, { standingsPath = "", inventoryPath = "" } = {}) {
  const invMap = inventoryMap(inventoryInput);
  const inputRows = rowsFrom(standingsInput);

  const classifiedRows = inputRows.map((row) => {
    const slug = asText(row.leagueSlug || row.competitionSlug);
    const inv = invMap.get(slug) || {};
    const c = classify(row, inv);

    return {
      leagueSlug: slug,
      competitionSlug: asText(row.competitionSlug || slug),
      competitionName: asText(row.competitionName || row.name),
      seasonStateCandidate: c.seasonStateCandidate,
      confidence: c.confidence,
      decisionReasons: c.decisionReasons,
      totalReadableStandingRows: Number(row.totalReadableStandingRows || 0),
      tableRowCount: Number(row.tableRowCount || 0),
      phaseRowCount: Number(row.phaseRowCount || 0),
      topTeam: asText(row.topTeam),
      bottomTeam: asText(row.bottomTeam),
      historyRowsCount: Number(inv.historyRowsCount || 0),
      historyFinalRowsCount: Number(inv.historyFinalRowsCount || 0),
      lastHistoryDate: asText(inv.lastHistoryDate),
      canonicalFixtureCountToday: Number(inv.canonicalFixtureCountToday || 0),
      canonicalFixtureCountNextWindow: Number(inv.canonicalFixtureCountNextWindow || 0),
      canonicalFixtureCountNext7Days: Number(inv.canonicalFixtureCountNext7Days || 0),
      needsFTRepair: asBool(inv.needsFTRepair),
      nextAction: c.nextAction,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  });

  return {
    ok: true,
    job: JOB,
    mode: "read_only_local_standings_season_state_classification",
    standingsPath,
    inventoryPath,
    summary: {
      inputUsableStandingCount: inputRows.length,
      classifiedRowCount: classifiedRows.length,
      bySeasonStateCandidate: countBy(classifiedRows, "seasonStateCandidate"),
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
      usesOnlyProvidedStandingsAndInventoryRows: true,
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
    rows: classifiedRows
  };
}

function runSelfTest() {
  const standingsInput = {
    usableLocalStandingRows: [
      {
        leagueSlug: "ger.1",
        totalReadableStandingRows: 18,
        tableRowCount: 18,
        phaseRowCount: 18
      },
      {
        leagueSlug: "aut.2",
        totalReadableStandingRows: 15,
        tableRowCount: 15,
        phaseRowCount: 15
      },
      {
        leagueSlug: "uefa.champions",
        totalReadableStandingRows: 38,
        phaseRowCount: 38
      }
    ]
  };

  const inventoryInput = {
    inventoryRows: [
      {
        leagueSlug: "ger.1",
        historyRowsCount: 100,
        historyFinalRowsCount: 50,
        canonicalFixtureCountNext7Days: 0
      },
      {
        leagueSlug: "aut.2",
        historyRowsCount: 0,
        historyFinalRowsCount: 0,
        canonicalFixtureCountNext7Days: 0
      },
      {
        leagueSlug: "uefa.champions",
        historyRowsCount: 40,
        historyFinalRowsCount: 20,
        canonicalFixtureCountNext7Days: 0
      }
    ]
  };

  const report = buildReport(standingsInput, inventoryInput, {
    standingsPath: "self-test-standings",
    inventoryPath: "self-test-inventory"
  });

  if (report.summary.inputUsableStandingCount !== 3) throw new Error("expected 3 input rows");
  if (report.summary.classifiedRowCount !== 3) throw new Error("expected 3 classified rows");
  if (report.summary.bySeasonStateCandidate.standings_context_available_needs_next_fixture_probe !== 1) {
    throw new Error("expected one domestic next fixture probe row");
  }
  if (report.summary.bySeasonStateCandidate.standings_context_available_needs_history_or_fixture_probe !== 1) {
    throw new Error("expected one domestic history/fixture probe row");
  }
  if (report.summary.bySeasonStateCandidate.cup_or_continental_context_available_needs_competition_state_probe !== 1) {
    throw new Error("expected one cup/continental probe row");
  }
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

  const standingsPath = argValue("--standings") || argValue("--input");
  const inventoryPath = argValue("--inventory");
  const outputPath = argValue("--output");

  if (!standingsPath) throw new Error("Missing --standings or --input");
  if (!inventoryPath) throw new Error("Missing --inventory");
  if (!outputPath) throw new Error("Missing --output");

  const standingsInput = readJson(standingsPath);
  const inventoryInput = readJson(inventoryPath);
  const report = buildReport(standingsInput, inventoryInput, { standingsPath, inventoryPath });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
