#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_ENGINE =
  "data/football-truth/_diagnostics/reusable-adapter-family-contract-validator-engine-2026-06-14/reusable-adapter-family-contract-validator-engine-2026-06-14.json";

const DEFAULT_APPLY =
  "data/football-truth/_diagnostics/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14.json";

const DEFAULT_ROW_PATCH =
  "data/football-truth/_diagnostics/safe-priority1-row-selector-patch-2026-06-14/safe-priority1-row-selector-patch-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/reusable-priority1-post-patch-comparison-board-2026-06-14/reusable-priority1-post-patch-comparison-board-2026-06-14.json";

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    engine: DEFAULT_ENGINE,
    apply: DEFAULT_APPLY,
    rowPatch: DEFAULT_ROW_PATCH,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--engine") args.engine = argv[++i];
    else if (arg === "--apply") args.apply = argv[++i];
    else if (arg === "--row-patch") args.rowPatch = argv[++i];
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

function selectorLengthsForFamily(engineRows, family) {
  const rows = engineRows.filter((row) => row.adapterFamily === family);

  return rows.map((row) => ({
    competitionSlug: row.competitionSlug,
    fixtureSelectorCount: row.selectors?.fixtureResultRows?.length || 0,
    standingsSelectorCount: row.selectors?.standingsRows?.length || 0,
    seasonStateSelectorCount: row.selectors?.seasonState?.length || 0,
    fixtureSelectors: row.selectors?.fixtureResultRows || [],
    standingsSelectors: row.selectors?.standingsRows || [],
    seasonStateSelectors: row.selectors?.seasonState || []
  }));
}

function buildComparisonRows({ engine, apply, rowPatch }) {
  const engineRows = Array.isArray(engine.engineRows) ? engine.engineRows : [];
  const validationRows = Array.isArray(apply.validationRows) ? apply.validationRows : [];
  const patchRows = Array.isArray(rowPatch.patchRows) ? rowPatch.patchRows : [];

  return validationRows.map((row, index) => {
    const familyPatch = patchRows.find((patchRow) => patchRow.family === row.adapterFamily);
    const familyEngineSelectors = selectorLengthsForFamily(engineRows, row.adapterFamily);

    let postPatchStatus = "still_blocked_needs_review";
    let nextReusableStep = "review_family_source_shape_or_adapter_normalized_output";

    if (row.structuredFixtureOrResultRowsPresent && row.structuredStandingsRowsPresent && row.structuredSeasonStateValidated) {
      postPatchStatus = "all_structured_inputs_present_but_contract_rule_review_required";
      nextReusableStep = "review_contract_rule_and_nextcheck_derivation";
    } else if (row.structuredFixtureOrResultRowsPresent && row.structuredStandingsRowsPresent && !row.structuredSeasonStateValidated) {
      postPatchStatus = "rows_present_season_state_missing";
      nextReusableStep = "seek_or_define_family_season_level_source_no_match_status";
    } else if (!row.structuredFixtureOrResultRowsPresent && !row.structuredStandingsRowsPresent && row.structuredSeasonStateValidated) {
      postPatchStatus = "season_state_present_rows_missing";
      nextReusableStep = "inspect_family_adapter_output_for_direct_rows_or_repair_normalizer";
    } else if (row.structuredFixtureOrResultRowsPresent && !row.structuredStandingsRowsPresent) {
      postPatchStatus = "fixture_present_standings_missing";
      nextReusableStep = "seek_or_repair_family_standings_source_selector";
    }

    return {
      comparisonRowId: `priority1_post_patch_comparison_${String(index + 1).padStart(3, "0")}`,
      competitionSlug: row.competitionSlug,
      adapterFamily: row.adapterFamily,
      structuredFixtureOrResultRowsPresent: row.structuredFixtureOrResultRowsPresent,
      structuredStandingsRowsPresent: row.structuredStandingsRowsPresent,
      structuredSeasonStateValidated: row.structuredSeasonStateValidated,
      contractState: row.contractState,
      stateConfidence: row.stateConfidence,
      fullContractSatisfied: row.fullContractSatisfied,
      missingReasons: row.missingReasons || [],
      familyPatchStatus: familyPatch?.patchStatus || "__missing_patch_row__",
      familyPatchFixtureSelectorCount: familyPatch?.fixtureSelectorCandidates?.length || 0,
      familyPatchStandingsSelectorCount: familyPatch?.standingsSelectorCandidates?.length || 0,
      familyPatchSeasonStateBlocked: Boolean(familyPatch?.seasonStatePatchBlocked),
      familyEngineSelectors,
      postPatchStatus,
      nextReusableStep,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      activeAsserted: false,
      inactiveAsserted: false,
      completedAsserted: false
    };
  });
}

function buildFamilySummaryRows(comparisonRows) {
  const families = [...new Set(comparisonRows.map((row) => row.adapterFamily))].sort();

  return families.map((family, index) => {
    const rows = comparisonRows.filter((row) => row.adapterFamily === family);
    const statuses = [...new Set(rows.map((row) => row.postPatchStatus))].sort();

    let familyNextStep = "review_family_source_shape_or_adapter_normalized_output";
    if (statuses.length === 1 && statuses[0] === "rows_present_season_state_missing") {
      familyNextStep = "seek_or_define_family_season_level_source_no_match_status";
    } else if (statuses.length === 1 && statuses[0] === "season_state_present_rows_missing") {
      familyNextStep = "inspect_family_adapter_output_for_direct_rows_or_repair_normalizer";
    } else if (statuses.length === 1 && statuses[0] === "fixture_present_standings_missing") {
      familyNextStep = "seek_or_repair_family_standings_source_selector";
    }

    return {
      familySummaryRowId: `priority1_family_post_patch_${String(index + 1).padStart(3, "0")}`,
      adapterFamily: family,
      competitionCount: rows.length,
      competitions: rows.map((row) => row.competitionSlug).sort(),
      postPatchStatuses: statuses,
      structuredFixtureOrResultRowsPresentCount: rows.filter((row) => row.structuredFixtureOrResultRowsPresent).length,
      structuredStandingsRowsPresentCount: rows.filter((row) => row.structuredStandingsRowsPresent).length,
      structuredSeasonStateValidatedCount: rows.filter((row) => row.structuredSeasonStateValidated).length,
      fullContractSatisfiedCount: rows.filter((row) => row.fullContractSatisfied).length,
      familyNextStep,
      recommendedMode: "family_level_repair_only_no_bespoke_league_patch",
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    };
  });
}

function main() {
  const args = parseArgs(process.argv);

  const engine = readJson(args.engine);
  const apply = readJson(args.apply);
  const rowPatch = readJson(args.rowPatch);

  const comparisonRows = buildComparisonRows({ engine, apply, rowPatch });
  const familySummaryRows = buildFamilySummaryRows(comparisonRows);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-reusable-priority1-post-patch-comparison-board-file",
    mode: "source_only_reusable_priority1_post_patch_comparison_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      engine: args.engine,
      apply: args.apply,
      rowPatch: args.rowPatch,
      engineRowCount: Array.isArray(engine.engineRows) ? engine.engineRows.length : 0,
      validationRowCount: Array.isArray(apply.validationRows) ? apply.validationRows.length : 0,
      rowPatchCount: Array.isArray(rowPatch.patchRows) ? rowPatch.patchRows.length : 0
    },
    summary: {
      comparisonRowCount: comparisonRows.length,
      familySummaryRowCount: familySummaryRows.length,
      rowsPresentSeasonStateMissingCount: comparisonRows.filter((row) => row.postPatchStatus === "rows_present_season_state_missing").length,
      seasonStatePresentRowsMissingCount: comparisonRows.filter((row) => row.postPatchStatus === "season_state_present_rows_missing").length,
      fixturePresentStandingsMissingCount: comparisonRows.filter((row) => row.postPatchStatus === "fixture_present_standings_missing").length,
      stillBlockedNeedsReviewCount: comparisonRows.filter((row) => row.postPatchStatus === "still_blocked_needs_review").length,
      fullContractSatisfiedNowCount: comparisonRows.filter((row) => row.fullContractSatisfied).length,
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
      recommendedNextLane: "build_family_level_repair_plan_from_post_patch_statuses"
    },
    counts: {
      byAdapterFamily: countBy(comparisonRows, "adapterFamily"),
      byPostPatchStatus: countBy(comparisonRows, "postPatchStatus"),
      byNextReusableStep: countBy(comparisonRows, "nextReusableStep"),
      byFamilyNextStep: countBy(familySummaryRows, "familyNextStep")
    },
    guardrails: [
      "This is a comparison board only.",
      "This does not fetch.",
      "This does not search.",
      "This does not write canonical files.",
      "This does not write production files.",
      "No active/inactive/completed truth is asserted.",
      "Recommended next steps remain family-level, not per-league bespoke patches."
    ],
    familySummaryRows,
    comparisonRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    comparisonRowCount: output.summary.comparisonRowCount,
    familySummaryRowCount: output.summary.familySummaryRowCount,
    rowsPresentSeasonStateMissingCount: output.summary.rowsPresentSeasonStateMissingCount,
    seasonStatePresentRowsMissingCount: output.summary.seasonStatePresentRowsMissingCount,
    fixturePresentStandingsMissingCount: output.summary.fixturePresentStandingsMissingCount,
    stillBlockedNeedsReviewCount: output.summary.stillBlockedNeedsReviewCount,
    fullContractSatisfiedNowCount: 0,
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
