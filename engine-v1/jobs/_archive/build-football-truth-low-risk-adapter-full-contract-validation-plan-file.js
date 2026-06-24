#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_PARTIAL_PLAN =
  "data/football-truth/_diagnostics/partial-trusted-source-enrichment-plan-2026-06-14/partial-trusted-source-enrichment-plan-2026-06-14.json";

const ADAPTER_REQUIREMENTS = {
  torneopal: {
    competitions: ["fin.1", "fin.2"],
    requiredEvidence: [
      "fixture_or_results_rows_from_torneopal_payload",
      "standings_table_rows_from_torneopal_payload",
      "season_or_competition_phase_from_torneopal_payload_or_official_calendar",
      "next_season_restart_date_from_official_calendar_or_competition_page",
      "next_check_policy_from_active_or_completed_state"
    ],
    adapterValidationJob: "build_uefa_torneopal_normalized_rows_validation_board"
  },
  loi_ajax: {
    competitions: ["irl.1", "irl.2"],
    requiredEvidence: [
      "fixture_or_results_rows_from_loi_ajax_endpoint",
      "standings_table_rows_from_loi_ajax_or_official_table",
      "season_state_from_current_fixtures_results_and_table",
      "next_season_restart_date_from_loi_or_fai_calendar",
      "next_check_policy_from_active_or_completed_state"
    ],
    adapterValidationJob: "build_uefa_loi_ajax_normalized_rows_validation_board"
  },
  spfl_opta: {
    competitions: ["sco.1", "sco.2"],
    requiredEvidence: [
      "fixture_or_results_rows_from_spfl_opta_widget",
      "standings_table_rows_from_spfl_opta_widget",
      "season_state_from_current_fixtures_results_and_table",
      "next_season_restart_date_from_spfl_calendar_or_competition_page",
      "next_check_policy_from_active_or_completed_state"
    ],
    adapterValidationJob: "build_uefa_spfl_opta_widget_validation_board"
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    partialPlan: DEFAULT_PARTIAL_PLAN,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--partial-plan") args.partialPlan = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `low-risk-adapter-full-contract-validation-plan-${args.date}`,
      `low-risk-adapter-full-contract-validation-plan-${args.date}.json`
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

function inferAdapterFamily(row) {
  const families = Array.isArray(row.adapterFamilies) ? row.adapterFamilies : [];
  if (families.length === 1) return families[0];
  if (families.length > 1) return families.sort().join("+");
  return "__missing_adapter_family__";
}

function buildValidationRow(row, index) {
  const adapterFamily = inferAdapterFamily(row);
  const requirements = ADAPTER_REQUIREMENTS[adapterFamily] || null;

  const adapterKnown = Boolean(requirements);
  const competitionExpectedForAdapter = adapterKnown
    ? requirements.competitions.includes(row.competitionSlug)
    : false;

  const validationPlanStatus =
    adapterKnown && competitionExpectedForAdapter
      ? "ready_for_adapter_full_contract_validation_board"
      : adapterKnown
        ? "adapter_known_but_competition_not_in_expected_contract"
        : "adapter_family_missing_contract";

  const blockingReasons = [
    adapterKnown ? null : "adapter_family_missing_contract",
    competitionExpectedForAdapter ? null : "competition_not_in_expected_adapter_contract",
    "fixture_calendar_not_validated_yet",
    "standings_results_not_validated_yet",
    "season_state_not_validated_yet",
    "next_season_restart_date_not_validated_yet",
    "next_check_policy_not_derived_yet"
  ].filter(Boolean);

  return {
    validationRowId: `low_risk_adapter_contract_${String(index + 1).padStart(3, "0")}`,
    competitionSlug: row.competitionSlug,
    competitionName: row.competitionName || "",
    competitionType: row.competitionType || "",
    adapterFamily,
    providerHint: row.providerHint || "",
    knownSourceUrls: row.knownSourceUrls || [],
    trustedFetchRowCount: Number(row.trustedFetchRowCount || 0),
    fetchReviewRowCount: Number(row.fetchReviewRowCount || 0),
    adapterReviewInputRowCount: Number(row.adapterReviewInputRowCount || 0),
    lowRiskAdapterReviewRowCount: Number(row.lowRiskAdapterReviewRowCount || 0),
    lowRiskAdapterCandidateRowCount: Number(row.lowRiskAdapterCandidateRowCount || 0),

    validationPlanStatus,
    adapterValidationJob: requirements?.adapterValidationJob || "__missing_adapter_validation_job__",
    requiredEvidence: requirements?.requiredEvidence || [],
    blockingReasons,

    fixtureCalendarValidationRequired: true,
    standingsResultsValidationRequired: true,
    seasonStateValidationRequired: true,
    nextSeasonRestartDateValidationRequired: true,
    nextCheckPolicyDerivationRequired: true,

    canRunValidationBoardWithoutNewSourceDiscovery: adapterKnown && competitionExpectedForAdapter,
    canBecomeFullContractAfterValidation: adapterKnown && competitionExpectedForAdapter,
    fullContractSatisfiedNow: false,
    activeAsserted: false,
    inactiveAsserted: false,
    completedAsserted: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const partialPlan = readJson(args.partialPlan);
  const planRows = Array.isArray(partialPlan.planRows) ? partialPlan.planRows : [];

  const lowRiskRows = planRows.filter((row) =>
    row.enrichmentPlanStatus === "adapter_candidate_ready_for_extraction_validation_plan"
  );

  const validationRows = lowRiskRows.map(buildValidationRow);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-low-risk-adapter-full-contract-validation-plan-file",
    mode: "source_only_low_risk_adapter_full_contract_validation_plan_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      partialPlan: args.partialPlan,
      partialPlanRowCount: planRows.length,
      lowRiskAdapterCandidatePlanRowCount: lowRiskRows.length
    },
    summary: {
      validationRowCount: validationRows.length,
      readyForAdapterFullContractValidationBoardCount: validationRows.filter((row) => row.validationPlanStatus === "ready_for_adapter_full_contract_validation_board").length,
      canRunValidationBoardWithoutNewSourceDiscoveryCount: validationRows.filter((row) => row.canRunValidationBoardWithoutNewSourceDiscovery).length,
      canBecomeFullContractAfterValidationCount: validationRows.filter((row) => row.canBecomeFullContractAfterValidation).length,
      fixtureCalendarValidationRequiredCount: validationRows.filter((row) => row.fixtureCalendarValidationRequired).length,
      standingsResultsValidationRequiredCount: validationRows.filter((row) => row.standingsResultsValidationRequired).length,
      seasonStateValidationRequiredCount: validationRows.filter((row) => row.seasonStateValidationRequired).length,
      nextSeasonRestartDateValidationRequiredCount: validationRows.filter((row) => row.nextSeasonRestartDateValidationRequired).length,
      nextCheckPolicyDerivationRequiredCount: validationRows.filter((row) => row.nextCheckPolicyDerivationRequired).length,
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
      recommendedNextLane: "build_low_risk_adapter_validation_board_using_existing_adapter_outputs_no_canonical_write"
    },
    counts: {
      byAdapterFamily: countBy(validationRows, "adapterFamily"),
      byValidationPlanStatus: countBy(validationRows, "validationPlanStatus"),
      byAdapterValidationJob: countBy(validationRows, "adapterValidationJob")
    },
    guardrails: [
      "This plan only scopes the 6 low-risk adapter candidates.",
      "This plan does not fetch.",
      "This plan does not search.",
      "This plan does not write canonical files.",
      "This plan does not write production files.",
      "No row is active/inactive/completed truth in this output.",
      "A row can become full contract only after fixture/calendar, standings/results, season state, restart date, and nextCheck policy are validated."
    ],
    validationRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    validationRowCount: output.summary.validationRowCount,
    readyForAdapterFullContractValidationBoardCount: output.summary.readyForAdapterFullContractValidationBoardCount,
    canRunValidationBoardWithoutNewSourceDiscoveryCount: output.summary.canRunValidationBoardWithoutNewSourceDiscoveryCount,
    canBecomeFullContractAfterValidationCount: output.summary.canBecomeFullContractAfterValidationCount,
    fixtureCalendarValidationRequiredCount: output.summary.fixtureCalendarValidationRequiredCount,
    standingsResultsValidationRequiredCount: output.summary.standingsResultsValidationRequiredCount,
    seasonStateValidationRequiredCount: output.summary.seasonStateValidationRequiredCount,
    nextSeasonRestartDateValidationRequiredCount: output.summary.nextSeasonRestartDateValidationRequiredCount,
    nextCheckPolicyDerivationRequiredCount: output.summary.nextCheckPolicyDerivationRequiredCount,
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
