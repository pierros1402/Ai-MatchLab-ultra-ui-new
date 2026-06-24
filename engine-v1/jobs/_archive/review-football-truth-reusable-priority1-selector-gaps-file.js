#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_PRIORITY1_APPLY =
  "data/football-truth/_diagnostics/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/reusable-priority1-selector-gap-review-2026-06-14/reusable-priority1-selector-gap-review-2026-06-14.json";

const FAMILY_SELECTOR_REPAIR_TEMPLATES = {
  loi_ajax: {
    family: "loi_ajax",
    observedPattern: "season-level active state detected, but fixture/result and standings selectors are not locating structured rows",
    reusableRepairClass: "add_loi_ajax_structured_fixture_result_and_standings_selectors",
    sourceEvidenceNeeded: [
      "LOI AJAX payload or adapter-normalized output containing fixture/result rows",
      "LOI AJAX payload or adapter-normalized output containing standings/table rows"
    ],
    selectorWork: [
      "map LOI AJAX fixture/result array paths",
      "map LOI AJAX standings/table array paths",
      "keep season-level active selector but require rows before full active contract"
    ],
    expectedAfterRepair: "fixture/result + standings become detectable for irl.1/irl.2 while active season state remains season-level only"
  },
  spfl_opta: {
    family: "spfl_opta",
    observedPattern: "fixture/result and standings rows detected, but season-level state is missing",
    reusableRepairClass: "add_spfl_season_level_state_or_calendar_selector",
    sourceEvidenceNeeded: [
      "SPFL official season/calendar page or Opta competition metadata with season-level status",
      "Do not use fixtureRows.status",
      "Do not use future fixtures alone as full active state"
    ],
    selectorWork: [
      "map season-level SPFL current competition/season indicator",
      "derive active rolling nextCheck only after season-level active validation",
      "leave restart date pending unless completed/inactive state is validated"
    ],
    expectedAfterRepair: "sco.1/sco.2 remain blocked until real season-level state source is identified"
  },
  torneopal: {
    family: "torneopal",
    observedPattern: "fixture/result rows detected and future fixture signals present, but standings and season-level state are missing",
    reusableRepairClass: "add_torneopal_standings_and_season_state_selectors",
    sourceEvidenceNeeded: [
      "Torneopal/Palloliitto structured standings/table payload",
      "Torneopal/Palloliitto season-level status or official calendar/current-season metadata"
    ],
    selectorWork: [
      "map standings array paths",
      "map season-level active/current selector if published",
      "keep future fixtures as signal-only until season-level state is validated"
    ],
    expectedAfterRepair: "fin.1/fin.2 can progress from signal-only toward active contract only when standings + season-level state are found"
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    priority1Apply: DEFAULT_PRIORITY1_APPLY,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--priority1-apply") args.priority1Apply = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
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

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function summarizeFamily(family, validationRows, evidenceRows) {
  const template = FAMILY_SELECTOR_REPAIR_TEMPLATES[family] || {
    family,
    observedPattern: "unclassified reusable selector gap",
    reusableRepairClass: "define_family_selector_gap_repair_class",
    sourceEvidenceNeeded: [],
    selectorWork: [],
    expectedAfterRepair: "family requires explicit reusable selector repair template"
  };

  const familyRows = validationRows.filter((row) => row.adapterFamily === family);
  const familyEvidenceRows = evidenceRows.filter((row) => row.adapterFamily === family);

  const missingReasonCounts = {};
  for (const row of familyRows) {
    for (const reason of row.missingReasons || []) {
      missingReasonCounts[reason] = (missingReasonCounts[reason] || 0) + 1;
    }
  }

  const fixtureDetectedCount = familyRows.filter((row) => row.structuredFixtureOrResultRowsPresent).length;
  const standingsDetectedCount = familyRows.filter((row) => row.structuredStandingsRowsPresent).length;
  const seasonStateDetectedCount = familyRows.filter((row) => row.structuredSeasonStateValidated).length;
  const signalOnlyCount = familyRows.filter((row) => row.stateConfidence === "signal_only").length;

  let selectorRepairPriority = 3;
  if (fixtureDetectedCount > 0 && standingsDetectedCount > 0 && seasonStateDetectedCount === 0) selectorRepairPriority = 1;
  else if (seasonStateDetectedCount > 0 && fixtureDetectedCount === 0 && standingsDetectedCount === 0) selectorRepairPriority = 1;
  else if (fixtureDetectedCount > 0 && standingsDetectedCount === 0) selectorRepairPriority = 2;

  const sourceFileHints = unique(familyEvidenceRows.map((row) => row.filePath)).slice(0, 20);

  return {
    family,
    competitionCount: familyRows.length,
    competitions: familyRows.map((row) => row.competitionSlug).sort(),
    fixtureDetectedCount,
    standingsDetectedCount,
    seasonStateDetectedCount,
    signalOnlyCount,
    fullContractSatisfiedCount: familyRows.filter((row) => row.fullContractSatisfied).length,
    missingReasonCounts,
    selectorRepairPriority,
    observedPattern: template.observedPattern,
    reusableRepairClass: template.reusableRepairClass,
    sourceEvidenceNeeded: template.sourceEvidenceNeeded,
    selectorWork: template.selectorWork,
    expectedAfterRepair: template.expectedAfterRepair,
    sourceFileHints,
    nextReusableStep: "build_family_selector_config_patch_not_bespoke_league_patch",
    fetchAllowedNow: false,
    searchAllowedNow: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  };
}

function buildGapRows(validationRows) {
  return validationRows.map((row, index) => {
    const template = FAMILY_SELECTOR_REPAIR_TEMPLATES[row.adapterFamily] || {};

    let gapClass = "unknown_gap";
    if (!row.structuredFixtureOrResultRowsPresent && !row.structuredStandingsRowsPresent && row.structuredSeasonStateValidated) {
      gapClass = "rows_missing_but_season_state_present";
    } else if (row.structuredFixtureOrResultRowsPresent && row.structuredStandingsRowsPresent && !row.structuredSeasonStateValidated) {
      gapClass = "season_state_missing_but_rows_present";
    } else if (row.structuredFixtureOrResultRowsPresent && !row.structuredStandingsRowsPresent) {
      gapClass = "standings_and_season_state_missing_fixture_signal_present";
    } else if (!row.structuredFixtureOrResultRowsPresent && !row.structuredStandingsRowsPresent && !row.structuredSeasonStateValidated) {
      gapClass = "all_structured_selectors_missing";
    }

    return {
      selectorGapRowId: `priority1_selector_gap_${String(index + 1).padStart(3, "0")}`,
      competitionSlug: row.competitionSlug,
      adapterFamily: row.adapterFamily,
      contractState: row.contractState,
      stateConfidence: row.stateConfidence,
      structuredFixtureOrResultRowsPresent: row.structuredFixtureOrResultRowsPresent,
      structuredStandingsRowsPresent: row.structuredStandingsRowsPresent,
      structuredSeasonStateValidated: row.structuredSeasonStateValidated,
      fullContractSatisfied: row.fullContractSatisfied,
      gapClass,
      reusableRepairClass: template.reusableRepairClass || "define_family_selector_gap_repair_class",
      missingReasons: row.missingReasons || [],
      nextReusableStep: "repair_family_selector_config_then_rerun_priority1_apply",
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    };
  });
}

function main() {
  const args = parseArgs(process.argv);
  const priority1Apply = readJson(args.priority1Apply);

  const validationRows = Array.isArray(priority1Apply.validationRows)
    ? priority1Apply.validationRows
    : [];

  const evidenceRows = Array.isArray(priority1Apply.evidenceRows)
    ? priority1Apply.evidenceRows
    : [];

  const families = unique(validationRows.map((row) => row.adapterFamily));
  const familySummaries = families.map((family) =>
    summarizeFamily(family, validationRows, evidenceRows)
  ).sort((a, b) => {
    if (a.selectorRepairPriority !== b.selectorRepairPriority) return a.selectorRepairPriority - b.selectorRepairPriority;
    return a.family.localeCompare(b.family);
  });

  const selectorGapRows = buildGapRows(validationRows);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "review-football-truth-reusable-priority1-selector-gaps-file",
    mode: "source_only_priority1_reusable_selector_gap_review_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      priority1Apply: args.priority1Apply,
      validationRowCount: validationRows.length,
      evidenceRowCount: evidenceRows.length
    },
    summary: {
      selectorGapRowCount: selectorGapRows.length,
      familySummaryCount: familySummaries.length,
      reusableRepairClassCount: new Set(familySummaries.map((row) => row.reusableRepairClass)).size,
      priority1SelectorRepairFamilyCount: familySummaries.filter((row) => row.selectorRepairPriority === 1).length,
      priority2SelectorRepairFamilyCount: familySummaries.filter((row) => row.selectorRepairPriority === 2).length,
      fullContractSatisfiedNowCount: validationRows.filter((row) => row.fullContractSatisfied).length,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_priority1_family_selector_config_patch_for_reusable_validator"
    },
    counts: {
      byAdapterFamily: countBy(selectorGapRows, "adapterFamily"),
      byGapClass: countBy(selectorGapRows, "gapClass"),
      byReusableRepairClass: countBy(selectorGapRows, "reusableRepairClass"),
      byFamilySelectorRepairPriority: countBy(familySummaries, "selectorRepairPriority")
    },
    guardrails: [
      "This is selector-gap review only.",
      "This does not fetch.",
      "This does not search.",
      "This does not write canonical files.",
      "This does not write production files.",
      "No per-league bespoke repair is recommended.",
      "Every recommended action is family-level selector config repair."
    ],
    familySummaries,
    selectorGapRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    selectorGapRowCount: output.summary.selectorGapRowCount,
    familySummaryCount: output.summary.familySummaryCount,
    reusableRepairClassCount: output.summary.reusableRepairClassCount,
    priority1SelectorRepairFamilyCount: output.summary.priority1SelectorRepairFamilyCount,
    priority2SelectorRepairFamilyCount: output.summary.priority2SelectorRepairFamilyCount,
    fullContractSatisfiedNowCount: output.summary.fullContractSatisfiedNowCount,
    activeAssertedCount: 0,
    inactiveAssertedCount: 0,
    completedAssertedCount: 0,
    fetchAllowedNowCount: 0,
    searchAllowedNowCount: 0,
    canonicalWriteEligibleNowCount: 0,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main();
