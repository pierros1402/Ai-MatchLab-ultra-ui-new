#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_PARTIAL_PLAN =
  "data/football-truth/_diagnostics/partial-trusted-source-enrichment-plan-2026-06-14/partial-trusted-source-enrichment-plan-2026-06-14.json";

const DEFAULT_LOW_RISK_STATE_BOARD =
  "data/football-truth/_diagnostics/low-risk-adapter-state-dependent-contract-board-2026-06-14/low-risk-adapter-state-dependent-contract-board-2026-06-14.json";

const DEFAULT_SPFL_BOARD =
  "data/football-truth/_diagnostics/spfl-opta-structured-season-state-contract-board-2026-06-14/spfl-opta-structured-season-state-contract-board-2026-06-14.json";

const ADAPTER_FAMILY_CONFIGS = {
  torneopal: {
    currentRows: ["fin.1", "fin.2"],
    familyBatchPriority: 1,
    reusableContractStatus: "needs_family_config",
    rawSourceAllowlistHints: ["torneopal", "palloliitto", "fin.1", "fin.2"],
    fixtureResultSelectorsRequired: true,
    standingsSelectorsRequired: true,
    seasonStateSelectorsRequired: true,
    restartDateSelectorsRequiredOnlyForCompletedInactive: true,
    notes: [
      "Do not require restart date for active season.",
      "Validate standings/results from structured Torneopal/Palloliitto payloads, not keyword hits."
    ]
  },
  loi_ajax: {
    currentRows: ["irl.1", "irl.2"],
    familyBatchPriority: 1,
    reusableContractStatus: "needs_family_config",
    rawSourceAllowlistHints: ["loi", "ajax", "league-of-ireland", "irl.1", "irl.2"],
    fixtureResultSelectorsRequired: true,
    standingsSelectorsRequired: true,
    seasonStateSelectorsRequired: true,
    restartDateSelectorsRequiredOnlyForCompletedInactive: true,
    notes: [
      "Do not read derived low-risk boards as evidence.",
      "Active in-season can use rolling-window nextCheck without next-season restart date."
    ]
  },
  spfl_opta: {
    currentRows: ["sco.1", "sco.2"],
    familyBatchPriority: 1,
    reusableContractStatus: "pattern_lessons_available_needs_generalized_config",
    rawSourceAllowlistHints: ["spfl", "opta", "sco.1", "sco.2"],
    fixtureResultSelectorsRequired: true,
    standingsSelectorsRequired: true,
    seasonStateSelectorsRequired: true,
    restartDateSelectorsRequiredOnlyForCompletedInactive: true,
    learnedGuardrails: [
      "Derived diagnostic boards must be excluded from source evidence.",
      "fixtureRows.status/finished is match status, not season state.",
      "Future fixtures are activity signals, not full active season-state validation by themselves.",
      "Restart date must be pending until structured completed/inactive state is validated."
    ]
  },
  laliga: {
    currentRows: ["esp.1", "esp.2"],
    familyBatchPriority: 2,
    reusableContractStatus: "needs_family_config",
    rawSourceAllowlistHints: ["laliga", "esp.1", "esp.2"],
    fixtureResultSelectorsRequired: true,
    standingsSelectorsRequired: true,
    seasonStateSelectorsRequired: true,
    restartDateSelectorsRequiredOnlyForCompletedInactive: true
  },
  bundesliga: {
    currentRows: ["ger.1", "ger.2"],
    familyBatchPriority: 2,
    reusableContractStatus: "needs_family_config",
    rawSourceAllowlistHints: ["bundesliga", "ger.1", "ger.2"],
    fixtureResultSelectorsRequired: true,
    standingsSelectorsRequired: true,
    seasonStateSelectorsRequired: true,
    restartDateSelectorsRequiredOnlyForCompletedInactive: true
  },
  norway_ntf: {
    currentRows: ["nor.1", "nor.2"],
    familyBatchPriority: 2,
    reusableContractStatus: "needs_family_config",
    rawSourceAllowlistHints: ["ntf", "fotball", "nor.1", "nor.2"],
    fixtureResultSelectorsRequired: true,
    standingsSelectorsRequired: true,
    seasonStateSelectorsRequired: true,
    restartDateSelectorsRequiredOnlyForCompletedInactive: true
  },
  sportomedia: {
    currentRows: ["swe.1", "swe.2"],
    familyBatchPriority: 2,
    reusableContractStatus: "needs_family_config",
    rawSourceAllowlistHints: ["sportomedia", "swe.1", "swe.2"],
    fixtureResultSelectorsRequired: true,
    standingsSelectorsRequired: true,
    seasonStateSelectorsRequired: true,
    restartDateSelectorsRequiredOnlyForCompletedInactive: true
  },
  trusted_fetch_review_route: {
    currentRows: [],
    familyBatchPriority: 3,
    reusableContractStatus: "needs_route_classification_before_family_config",
    rawSourceAllowlistHints: [],
    fixtureResultSelectorsRequired: true,
    standingsSelectorsRequired: true,
    seasonStateSelectorsRequired: true,
    restartDateSelectorsRequiredOnlyForCompletedInactive: true
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    partialPlan: DEFAULT_PARTIAL_PLAN,
    lowRiskStateBoard: DEFAULT_LOW_RISK_STATE_BOARD,
    spflBoard: DEFAULT_SPFL_BOARD,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--partial-plan") args.partialPlan = argv[++i];
    else if (arg === "--low-risk-state-board") args.lowRiskStateBoard = argv[++i];
    else if (arg === "--spfl-board") args.spflBoard = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `reusable-state-dependent-contract-validator-plan-${args.date}`,
      `reusable-state-dependent-contract-validator-plan-${args.date}.json`
    );
  }

  return args;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
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
  const families = Array.isArray(row.adapterFamilies) ? row.adapterFamilies.filter(Boolean) : [];
  if (families.length === 1) return families[0];
  if (families.length > 1) return families.sort().join("+");

  if (row.enrichmentPlanStatus === "trusted_fetch_review_ready_needs_extraction_route") {
    return "trusted_fetch_review_route";
  }

  return "__missing_adapter_family__";
}

function buildFamilyRows(partialRows) {
  return partialRows.map((row, index) => {
    const adapterFamily = inferAdapterFamily(row);
    const config = ADAPTER_FAMILY_CONFIGS[adapterFamily] || null;

    const reusableLaneStatus = config
      ? config.reusableContractStatus
      : "missing_reusable_family_config";

    const blocksBespokeWork = true;

    return {
      reusablePlanRowId: `reusable_contract_plan_${String(index + 1).padStart(3, "0")}`,
      competitionSlug: row.competitionSlug,
      competitionName: row.competitionName || "",
      competitionType: row.competitionType || "",
      adapterFamily,
      enrichmentPlanStatus: row.enrichmentPlanStatus,
      recommendedPreviousNextJob: row.recommendedNextJob,
      reusableLaneStatus,
      familyBatchPriority: config?.familyBatchPriority || 99,
      rawSourceAllowlistHints: config?.rawSourceAllowlistHints || [],
      requiredSelectors: {
        fixtureResultSelectorsRequired: Boolean(config?.fixtureResultSelectorsRequired),
        standingsSelectorsRequired: Boolean(config?.standingsSelectorsRequired),
        seasonStateSelectorsRequired: Boolean(config?.seasonStateSelectorsRequired),
        restartDateSelectorsRequiredOnlyForCompletedInactive: Boolean(config?.restartDateSelectorsRequiredOnlyForCompletedInactive)
      },
      learnedGuardrails: config?.learnedGuardrails || [],
      blocksBespokeWork,
      nextReusableStep:
        reusableLaneStatus === "needs_route_classification_before_family_config"
          ? "classify_trusted_fetch_review_rows_into_provider_families"
          : reusableLaneStatus === "missing_reusable_family_config"
            ? "define_adapter_family_contract_config"
            : "build_or_apply_reusable_adapter_family_contract_validator",
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    };
  }).sort((a, b) => {
    if (a.familyBatchPriority !== b.familyBatchPriority) return a.familyBatchPriority - b.familyBatchPriority;
    if (a.adapterFamily !== b.adapterFamily) return a.adapterFamily.localeCompare(b.adapterFamily);
    return a.competitionSlug.localeCompare(b.competitionSlug);
  }).map((row, index) => ({
    ...row,
    reusablePlanRowId: `reusable_contract_plan_${String(index + 1).padStart(3, "0")}`,
    reusablePlanSequence: index + 1
  }));
}

function buildFamilySummaries(rows) {
  const families = [...new Set(rows.map((row) => row.adapterFamily))].sort();

  return Object.fromEntries(families.map((family) => {
    const familyRows = rows.filter((row) => row.adapterFamily === family);
    const config = ADAPTER_FAMILY_CONFIGS[family] || null;

    return [family, {
      adapterFamily: family,
      rowCount: familyRows.length,
      competitions: familyRows.map((row) => row.competitionSlug).sort(),
      reusableLaneStatus: config?.reusableContractStatus || "missing_reusable_family_config",
      familyBatchPriority: config?.familyBatchPriority || 99,
      rawSourceAllowlistHints: config?.rawSourceAllowlistHints || [],
      learnedGuardrails: config?.learnedGuardrails || [],
      nextReusableStep: familyRows[0]?.nextReusableStep || "none",
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false
    }];
  }));
}

function main() {
  const args = parseArgs(process.argv);

  const partialPlan = readJsonIfExists(args.partialPlan);
  if (!partialPlan) throw new Error(`Missing partial trusted plan: ${args.partialPlan}`);

  const lowRiskStateBoard = readJsonIfExists(args.lowRiskStateBoard);
  const spflBoard = readJsonIfExists(args.spflBoard);

  const partialRows = Array.isArray(partialPlan.planRows) ? partialPlan.planRows : [];
  const reusablePlanRows = buildFamilyRows(partialRows);
  const familySummaries = buildFamilySummaries(reusablePlanRows);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-reusable-state-dependent-contract-validator-plan-file",
    mode: "source_only_reusable_state_dependent_contract_validator_plan_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      partialPlan: args.partialPlan,
      lowRiskStateBoard: args.lowRiskStateBoard,
      spflBoard: args.spflBoard,
      partialPlanRowCount: partialRows.length,
      lowRiskStateBoardContractRowCount: Array.isArray(lowRiskStateBoard?.contractRows) ? lowRiskStateBoard.contractRows.length : 0,
      spflBoardContractRowCount: Array.isArray(spflBoard?.contractRows) ? spflBoard.contractRows.length : 0
    },
    reusableValidatorContract: {
      purpose: "Prevent per-league handcrafting by validating competitions through reusable adapter/provider-family contracts.",
      universalGuardrails: [
        "Never read derived diagnostic boards as source evidence.",
        "Only raw source snapshots or adapter-normalized source outputs are eligible evidence inputs.",
        "fixtureRows.status or match status must never be interpreted as season state.",
        "Future fixtures are activity signals, not full structured season-state validation by themselves.",
        "No-match on a target date must never imply inactive.",
        "Active leagues do not require next-season restart date.",
        "Completed/inactive leagues require restart/start date when published before non-daily nextCheck policy.",
        "If structured season state is missing, restart-date requirement remains pending, not hard missing.",
        "No canonical write from signal-only or diagnostic-derived evidence."
      ],
      adapterFamilyConfigSchema: {
        adapterFamily: "string",
        rawSourceAllowlistHints: ["string"],
        derivedDiagnosticBlocklistHints: [
          "low-risk-adapter",
          "validation-board",
          "state-dependent-contract-board",
          "source-authority",
          "season-calendar-lanes",
          "partial-trusted-source-enrichment-plan"
        ],
        selectors: {
          fixtureResultRows: "required selector or adapter-normalized field",
          standingsRows: "required selector or adapter-normalized field",
          seasonState: "season-level selector only; match status forbidden",
          restartDate: "required only if structured state is completed/inactive/near_end and source publishes it"
        },
        contractRules: {
          activeInSeason: [
            "trusted source",
            "structured fixture/result rows or rolling future/past window",
            "structured standings rows",
            "structured active season state",
            "rolling-window nextCheck policy",
            "restart date not required"
          ],
          completedOrInactive: [
            "trusted source",
            "structured final standings/results",
            "structured completed/inactive season state",
            "restart/start date when published",
            "non-daily nextCheck policy"
          ]
        }
      }
    },
    summary: {
      reusablePlanRowCount: reusablePlanRows.length,
      adapterFamilyCount: Object.keys(familySummaries).length,
      priority1FamilyRowCount: reusablePlanRows.filter((row) => row.familyBatchPriority === 1).length,
      priority2FamilyRowCount: reusablePlanRows.filter((row) => row.familyBatchPriority === 2).length,
      trustedFetchReviewRouteRowCount: reusablePlanRows.filter((row) => row.adapterFamily === "trusted_fetch_review_route").length,
      missingReusableFamilyConfigCount: reusablePlanRows.filter((row) => row.reusableLaneStatus === "missing_reusable_family_config").length,
      bespokePerLeagueWorkBlockedCount: reusablePlanRows.filter((row) => row.blocksBespokeWork).length,
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
      recommendedNextLane: "build_reusable_adapter_family_contract_validator_engine_then_apply_priority1_families"
    },
    counts: {
      byAdapterFamily: countBy(reusablePlanRows, "adapterFamily"),
      byReusableLaneStatus: countBy(reusablePlanRows, "reusableLaneStatus"),
      byFamilyBatchPriority: countBy(reusablePlanRows, "familyBatchPriority"),
      byNextReusableStep: countBy(reusablePlanRows, "nextReusableStep")
    },
    familySummaries,
    guardrails: [
      "This plan prevents scaling by one-off per-league boards.",
      "This plan does not fetch.",
      "This plan does not search.",
      "This plan does not write canonical files.",
      "This plan does not write production files.",
      "No row is active/inactive/completed truth in this output.",
      "SPFL debugging lessons are promoted to reusable validator rules."
    ],
    reusablePlanRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    reusablePlanRowCount: output.summary.reusablePlanRowCount,
    adapterFamilyCount: output.summary.adapterFamilyCount,
    priority1FamilyRowCount: output.summary.priority1FamilyRowCount,
    priority2FamilyRowCount: output.summary.priority2FamilyRowCount,
    trustedFetchReviewRouteRowCount: output.summary.trustedFetchReviewRouteRowCount,
    missingReusableFamilyConfigCount: output.summary.missingReusableFamilyConfigCount,
    bespokePerLeagueWorkBlockedCount: output.summary.bespokePerLeagueWorkBlockedCount,
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
