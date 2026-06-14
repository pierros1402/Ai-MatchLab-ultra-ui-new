#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_REUSABLE_PLAN =
  "data/football-truth/_diagnostics/reusable-state-dependent-contract-validator-plan-2026-06-14/reusable-state-dependent-contract-validator-plan-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/reusable-adapter-family-contract-validator-engine-2026-06-14/reusable-adapter-family-contract-validator-engine-2026-06-14.json";

const DERIVED_DIAGNOSTIC_BLOCKLIST_HINTS = [
  "low-risk-adapter",
  "validation-board",
  "validation-plan",
  "state-dependent-contract-board",
  "structured-season-state-contract-board",
  "source-authority",
  "season-calendar-lanes",
  "partial-trusted-source-enrichment-plan",
  "reusable-state-dependent-contract-validator-plan",
  "reusable-adapter-family-contract-validator-engine"
];

const UNIVERSAL_GUARDRAILS = [
  "Never read derived diagnostic boards as source evidence.",
  "Only raw source snapshots or adapter-normalized source outputs are eligible source evidence inputs.",
  "fixtureRows.status or match status must never be interpreted as season state.",
  "Future fixtures are activity signals, not full structured season-state validation by themselves.",
  "No match on a target date must never imply inactive.",
  "Active leagues do not require next-season restart/start date.",
  "Completed/inactive/near-end leagues require restart/start date when published before non-daily nextCheck policy.",
  "If structured season state is missing, restart-date requirement remains pending, not hard missing.",
  "No canonical write from signal-only evidence.",
  "No canonical write from diagnostic-derived evidence.",
  "No production write from this validator."
];

const FAMILY_CONFIGS = {
  torneopal: {
    priority: 1,
    competitions: ["fin.1", "fin.2"],
    rawSourceAllowlistHints: ["torneopal", "palloliitto", "fin.1", "fin.2"],
    selectors: {
      fixtureResultRows: [
        "fixtureRows",
        "resultRows",
        "matches",
        "fixtures",
        "games",
        "data.matches",
        "data.fixtures"
      ],
      standingsRows: [
        "standings",
        "standingsRows",
        "tableRows",
        "leagueTable",
        "seriesTable",
        "sarjataulukko",
        "data.standings",
        "data.table",
        "payload.standings",
        "payload.table"
      ],
      seasonState: [
        "seasonState",
        "seasonStatus",
        "competitionPhase",
        "season.state",
        "season.status",
        "competition.state",
        "competition.status",
        "series.status",
        "tournament.status",
        "metadata.seasonStatus"
      ],
      restartDate: ["nextSeasonStartDate", "nextSeasonRestartDate", "restartDate", "seasonStartDate"]
    },
    stateLevelOnlySelectorHints: ["seasonState", "seasonStatus", "competitionPhase"],
    forbiddenSeasonStateSelectorHints: [
      "fixtures.status",
      "fixtureRows.status",
      "matches.status",
      "matchRows.status",
      "results.status",
      "resultRows.status"
    ]
  },
  loi_ajax: {
    priority: 1,
    competitions: ["irl.1", "irl.2"],
    rawSourceAllowlistHints: ["loi", "ajax", "league-of-ireland", "irl.1", "irl.2"],
    selectors: {
      fixtureResultRows: [
        "fixtures",
        "fixtureRows",
        "resultRows",
        "matches",
        "data.fixtures",
        "data.matches",
        "payload.fixtures",
        "payload.matches",
        "response.fixtures",
        "response.matches"
      ],
      standingsRows: [
        "standings",
        "standingsRows",
        "tableRows",
        "leagueTable",
        "data.standings",
        "data.table",
        "payload.standings",
        "payload.table",
        "response.standings",
        "response.table"
      ],
      seasonState: [
        "seasonState",
        "seasonStatus",
        "competitionPhase",
        "season.state",
        "season.status",
        "competition.state",
        "competition.status"
      ],
      restartDate: ["nextSeasonStartDate", "nextSeasonRestartDate", "restartDate", "seasonStartDate"]
    },
    stateLevelOnlySelectorHints: ["seasonState", "seasonStatus", "competitionPhase"],
    forbiddenSeasonStateSelectorHints: [
      "fixtures.status",
      "fixtureRows.status",
      "matches.status",
      "matchRows.status",
      "results.status",
      "resultRows.status"
    ]
  },
  spfl_opta: {
    priority: 1,
    competitions: ["sco.1", "sco.2"],
    rawSourceAllowlistHints: ["spfl", "opta", "sco.1", "sco.2"],
    selectors: {
      fixtureResultRows: ["fixtureRows", "resultRows", "matches", "fixtures"],
      standingsRows: ["standingsRows", "tableRows", "leagueTable"],
      seasonState: [
        "seasonState",
        "seasonStatus",
        "competitionPhase",
        "competition.currentSeasonStatus",
        "competition.seasonStatus",
        "competition.status",
        "season.status",
        "season.state",
        "calendar.currentSeason",
        "calendar.seasonStatus",
        "metadata.seasonStatus",
        "metadata.competitionStatus"
      ],
      restartDate: ["nextSeasonStartDate", "nextSeasonRestartDate", "restartDate", "seasonStartDate"]
    },
    stateLevelOnlySelectorHints: ["seasonState", "seasonStatus", "competitionPhase"],
    forbiddenSeasonStateSelectorHints: [
      "fixtures.status",
      "fixtureRows.status",
      "matches.status",
      "matchRows.status",
      "results.status",
      "resultRows.status"
    ],
    learnedGuardrails: [
      "SPFL debugging proved derived diagnostics can self-contaminate validation.",
      "SPFL debugging proved fixtureRows.status=finished is match state, not season state.",
      "SPFL debugging proved future fixture rows should remain activity signals unless a season-level state selector validates active season."
    ]
  },
  laliga: {
    priority: 2,
    competitions: ["esp.1", "esp.2"],
    rawSourceAllowlistHints: ["laliga", "esp.1", "esp.2"],
    selectors: {
      fixtureResultRows: ["fixtureRows", "resultRows", "matches", "fixtures"],
      standingsRows: ["standingsRows", "tableRows", "leagueTable"],
      seasonState: ["seasonState", "seasonStatus", "competitionPhase"],
      restartDate: ["nextSeasonStartDate", "nextSeasonRestartDate", "restartDate", "seasonStartDate"]
    },
    stateLevelOnlySelectorHints: ["seasonState", "seasonStatus", "competitionPhase"],
    forbiddenSeasonStateSelectorHints: ["fixtureRows.status", "matches.status", "resultRows.status"]
  },
  bundesliga: {
    priority: 2,
    competitions: ["ger.1", "ger.2"],
    rawSourceAllowlistHints: ["bundesliga", "ger.1", "ger.2"],
    selectors: {
      fixtureResultRows: ["fixtureRows", "resultRows", "matches", "fixtures"],
      standingsRows: ["standingsRows", "tableRows", "leagueTable"],
      seasonState: ["seasonState", "seasonStatus", "competitionPhase"],
      restartDate: ["nextSeasonStartDate", "nextSeasonRestartDate", "restartDate", "seasonStartDate"]
    },
    stateLevelOnlySelectorHints: ["seasonState", "seasonStatus", "competitionPhase"],
    forbiddenSeasonStateSelectorHints: ["fixtureRows.status", "matches.status", "resultRows.status"]
  },
  norway_ntf: {
    priority: 2,
    competitions: ["nor.1", "nor.2"],
    rawSourceAllowlistHints: ["ntf", "fotball", "nor.1", "nor.2"],
    selectors: {
      fixtureResultRows: ["fixtureRows", "resultRows", "matches", "fixtures"],
      standingsRows: ["standingsRows", "tableRows", "leagueTable"],
      seasonState: ["seasonState", "seasonStatus", "competitionPhase"],
      restartDate: ["nextSeasonStartDate", "nextSeasonRestartDate", "restartDate", "seasonStartDate"]
    },
    stateLevelOnlySelectorHints: ["seasonState", "seasonStatus", "competitionPhase"],
    forbiddenSeasonStateSelectorHints: ["fixtureRows.status", "matches.status", "resultRows.status"]
  },
  sportomedia: {
    priority: 2,
    competitions: ["swe.1", "swe.2"],
    rawSourceAllowlistHints: ["sportomedia", "swe.1", "swe.2"],
    selectors: {
      fixtureResultRows: ["fixtureRows", "resultRows", "matches", "fixtures"],
      standingsRows: ["standingsRows", "tableRows", "leagueTable"],
      seasonState: ["seasonState", "seasonStatus", "competitionPhase"],
      restartDate: ["nextSeasonStartDate", "nextSeasonRestartDate", "restartDate", "seasonStartDate"]
    },
    stateLevelOnlySelectorHints: ["seasonState", "seasonStatus", "competitionPhase"],
    forbiddenSeasonStateSelectorHints: ["fixtureRows.status", "matches.status", "resultRows.status"]
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    reusablePlan: DEFAULT_REUSABLE_PLAN,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--reusable-plan") args.reusablePlan = argv[++i];
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

function buildEngineRow(planRow, index) {
  const config = FAMILY_CONFIGS[planRow.adapterFamily] || null;
  const isConfiguredFamily = Boolean(config);
  const isRouteClassification = planRow.adapterFamily === "trusted_fetch_review_route";

  let engineAction = "blocked_missing_family_config";
  if (isConfiguredFamily) engineAction = "ready_for_reusable_family_validator";
  if (isRouteClassification) engineAction = "requires_provider_family_route_classification_before_validator";

  return {
    engineRowId: `reusable_engine_row_${String(index + 1).padStart(3, "0")}`,
    competitionSlug: planRow.competitionSlug,
    competitionName: planRow.competitionName || "",
    adapterFamily: planRow.adapterFamily,
    familyPriority: config?.priority || planRow.familyBatchPriority || 99,
    engineAction,
    isConfiguredFamily,
    isRouteClassification,
    rawSourceAllowlistHints: config?.rawSourceAllowlistHints || planRow.rawSourceAllowlistHints || [],
    derivedDiagnosticBlocklistHints: DERIVED_DIAGNOSTIC_BLOCKLIST_HINTS,
    selectors: config?.selectors || null,
    stateLevelOnlySelectorHints: config?.stateLevelOnlySelectorHints || [],
    forbiddenSeasonStateSelectorHints: config?.forbiddenSeasonStateSelectorHints || [],
    learnedGuardrails: config?.learnedGuardrails || [],
    contractRules: {
      activeInSeason: {
        requires: [
          "trusted raw or adapter-normalized source evidence",
          "structured fixture/result rows or rolling fixture/result window",
          "structured standings rows",
          "structured season-level active state value",
          "rolling-window nextCheck policy"
        ],
        doesNotRequire: ["next season restart/start date"]
      },
      completedOrInactive: {
        requires: [
          "trusted raw or adapter-normalized source evidence",
          "structured final standings/results",
          "structured season-level completed/inactive state value",
          "restart/start date when published",
          "non-daily nextCheck policy"
        ]
      },
      unknownOrUnstructured: {
        requires: [
          "remain unresolved",
          "no active/inactive/completed assertion",
          "no canonical write"
        ]
      }
    },
    outputStatusNow: "engine_config_only_no_validation_run",
    fetchAllowedNow: false,
    searchAllowedNow: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false,
    activeAsserted: false,
    inactiveAsserted: false,
    completedAsserted: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const reusablePlan = readJson(args.reusablePlan);
  const planRows = Array.isArray(reusablePlan.reusablePlanRows)
    ? reusablePlan.reusablePlanRows
    : [];

  const engineRows = planRows.map(buildEngineRow).sort((a, b) => {
    if (a.familyPriority !== b.familyPriority) return a.familyPriority - b.familyPriority;
    if (a.adapterFamily !== b.adapterFamily) return a.adapterFamily.localeCompare(b.adapterFamily);
    return a.competitionSlug.localeCompare(b.competitionSlug);
  }).map((row, index) => ({
    ...row,
    engineRowId: `reusable_engine_row_${String(index + 1).padStart(3, "0")}`,
    engineSequence: index + 1
  }));

  const configuredFamilyNames = Object.keys(FAMILY_CONFIGS).sort();
  const configuredRows = engineRows.filter((row) => row.isConfiguredFamily);
  const routeRows = engineRows.filter((row) => row.isRouteClassification);
  const blockedRows = engineRows.filter((row) => row.engineAction === "blocked_missing_family_config");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-reusable-adapter-family-contract-validator-engine-file",
    mode: "source_only_reusable_adapter_family_contract_validator_engine_config_no_validation_run_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      reusablePlan: args.reusablePlan,
      reusablePlanRowCount: planRows.length
    },
    engineDefinition: {
      configuredFamilyNames,
      universalGuardrails: UNIVERSAL_GUARDRAILS,
      derivedDiagnosticBlocklistHints: DERIVED_DIAGNOSTIC_BLOCKLIST_HINTS,
      familyConfigs: FAMILY_CONFIGS,
      validatorPhases: [
        "phase_1_select_allowed_raw_or_adapter_normalized_source_files",
        "phase_2_reject_derived_diagnostic_inputs",
        "phase_3_extract_structured_fixture_result_rows",
        "phase_4_extract_structured_standings_rows",
        "phase_5_extract_season_level_state_only",
        "phase_6_apply_state_dependent_restart_date_rule",
        "phase_7_derive_next_check_policy",
        "phase_8_emit_candidate_or_gap_without_canonical_write"
      ]
    },
    summary: {
      engineRowCount: engineRows.length,
      configuredFamilyCount: configuredFamilyNames.length,
      configuredFamilyRowCount: configuredRows.length,
      routeClassificationRequiredRowCount: routeRows.length,
      blockedMissingFamilyConfigRowCount: blockedRows.length,
      priority1ConfiguredRowCount: configuredRows.filter((row) => row.familyPriority === 1).length,
      priority2ConfiguredRowCount: configuredRows.filter((row) => row.familyPriority === 2).length,
      fullContractSatisfiedNowCount: 0,
      validationRunPerformed: false,
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
      recommendedNextLane: "apply_reusable_validator_to_priority1_configured_families_source_only"
    },
    counts: {
      byAdapterFamily: countBy(engineRows, "adapterFamily"),
      byEngineAction: countBy(engineRows, "engineAction"),
      byFamilyPriority: countBy(engineRows, "familyPriority")
    },
    guardrails: [
      "This job creates the reusable validator engine/config only.",
      "This job does not run validation.",
      "This job does not fetch.",
      "This job does not search.",
      "This job does not write canonical files.",
      "This job does not write production files.",
      "No row is active/inactive/completed truth in this output.",
      "The purpose is to avoid one-off per-league boards and move to adapter-family batches."
    ],
    engineRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    engineRowCount: output.summary.engineRowCount,
    configuredFamilyCount: output.summary.configuredFamilyCount,
    configuredFamilyRowCount: output.summary.configuredFamilyRowCount,
    routeClassificationRequiredRowCount: output.summary.routeClassificationRequiredRowCount,
    blockedMissingFamilyConfigRowCount: output.summary.blockedMissingFamilyConfigRowCount,
    priority1ConfiguredRowCount: output.summary.priority1ConfiguredRowCount,
    priority2ConfiguredRowCount: output.summary.priority2ConfiguredRowCount,
    fullContractSatisfiedNowCount: 0,
    validationRunPerformed: false,
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
