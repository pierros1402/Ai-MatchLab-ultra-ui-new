#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_VALIDATION_PLAN =
  "data/football-truth/_diagnostics/low-risk-adapter-full-contract-validation-plan-2026-06-14/low-risk-adapter-full-contract-validation-plan-2026-06-14.json";

const DEFAULT_SIGNAL_BOARD =
  "data/football-truth/_diagnostics/low-risk-adapter-validation-board-2026-06-14/low-risk-adapter-validation-board-2026-06-14.json";

const DEFAULT_DIAGNOSTICS_ROOT = "data/football-truth/_diagnostics";

const ADAPTER_HINTS = {
  torneopal: ["torneopal", "palloliitto", "fin.1", "fin.2"],
  loi_ajax: ["loi", "ajax", "league-of-ireland", "irl.1", "irl.2"],
  spfl_opta: ["spfl", "opta", "sco.1", "sco.2"]
};

const ACTIVE_TERMS = [
  "active_current_season",
  "active",
  "current",
  "upcoming",
  "fixtureRows",
  "upcomingFixtures",
  "firstFixtureDate",
  "lastFixtureDate"
];

const COMPLETED_OR_INACTIVE_TERMS = [
  "completed_season",
  "completed",
  "inactive_between_seasons",
  "final",
  "winner",
  "champion",
  "seasonEnd",
  "season_end"
];

const RESTART_DATE_TERMS = [
  "nextSeasonStartDate",
  "nextSeasonRestartDate",
  "restartDate",
  "seasonStartDate",
  "calendarStart",
  "newSeason"
];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    validationPlan: DEFAULT_VALIDATION_PLAN,
    signalBoard: DEFAULT_SIGNAL_BOARD,
    diagnosticsRoot: DEFAULT_DIAGNOSTICS_ROOT,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--validation-plan") args.validationPlan = argv[++i];
    else if (arg === "--signal-board") args.signalBoard = argv[++i];
    else if (arg === "--diagnostics-root") args.diagnosticsRoot = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `low-risk-adapter-state-dependent-contract-board-${args.date}`,
      `low-risk-adapter-state-dependent-contract-board-${args.date}.json`
    );
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfSmall(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > 20 * 1024 * 1024) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
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

function walkJsonFiles(root) {
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(fullPath);
    }
  }

  walk(root);
  return files.sort();
}

function relevantFilesForRow(row, allFiles) {
  const hints = [
    row.competitionSlug,
    row.adapterFamily,
    ...(ADAPTER_HINTS[row.adapterFamily] || [])
  ].filter(Boolean).map((value) => String(value).toLowerCase());

  return allFiles.filter((filePath) => {
    const normalized = filePath.replaceAll("\\", "/").toLowerCase();
    return hints.some((hint) => normalized.includes(hint));
  });
}

function textContainsAny(text, terms) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(String(term).toLowerCase()));
}

function collectStructuredShape(value, state = { keys: new Set(), arrays: [] }, currentPath = "") {
  if (!value || typeof value !== "object") return state;

  if (Array.isArray(value)) {
    state.arrays.push({ path: currentPath, length: value.length });
    for (const item of value.slice(0, 5)) collectStructuredShape(item, state, currentPath);
    return state;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = currentPath ? `${currentPath}.${key}` : key;
    state.keys.add(key);

    if (Array.isArray(nested)) {
      state.arrays.push({ path: nestedPath, length: nested.length });
      for (const item of nested.slice(0, 5)) collectStructuredShape(item, state, nestedPath);
    } else if (nested && typeof nested === "object") {
      collectStructuredShape(nested, state, nestedPath);
    }
  }

  return state;
}

function extractStructuredSignals(json) {
  const shape = collectStructuredShape(json);
  const keys = [...shape.keys];
  const paths = shape.arrays.map((entry) => entry.path);
  const text = JSON.stringify(json).slice(0, 750000);

  const fixtureArrays = shape.arrays.filter((entry) =>
    /fixture|fixtures|match|matches|result|results/i.test(entry.path) && entry.length > 0
  );

  const standingsArrays = shape.arrays.filter((entry) =>
    /standing|standings|table|leagueTable/i.test(entry.path) && entry.length > 0
  );

  const hasExplicitSeasonStateKey = keys.some((key) =>
    /seasonState|seasonStatus|competitionPhase|state/i.test(key)
  );

  const hasRestartDateKey = keys.some((key) =>
    /nextSeasonStartDate|nextSeasonRestartDate|restartDate|seasonStartDate|calendarStart/i.test(key)
  );

  const activeSignal = textContainsAny(text, ACTIVE_TERMS);
  const completedOrInactiveSignal = textContainsAny(text, COMPLETED_OR_INACTIVE_TERMS);
  const restartSignal = textContainsAny(text, RESTART_DATE_TERMS);

  return {
    fixtureArrayFound: fixtureArrays.length > 0,
    standingsArrayFound: standingsArrays.length > 0,
    fixtureArrayPaths: fixtureArrays.map((entry) => `${entry.path}:${entry.length}`).sort(),
    standingsArrayPaths: standingsArrays.map((entry) => `${entry.path}:${entry.length}`).sort(),
    hasExplicitSeasonStateKey,
    hasRestartDateKey,
    activeSignal,
    completedOrInactiveSignal,
    restartSignal,
    relevantArrayPaths: paths.sort()
  };
}

function mergeSignals(signals) {
  const merged = {
    fixtureArrayFound: false,
    standingsArrayFound: false,
    fixtureArrayPaths: [],
    standingsArrayPaths: [],
    hasExplicitSeasonStateKey: false,
    hasRestartDateKey: false,
    activeSignal: false,
    completedOrInactiveSignal: false,
    restartSignal: false,
    relevantArrayPaths: []
  };

  for (const signal of signals) {
    merged.fixtureArrayFound ||= signal.fixtureArrayFound;
    merged.standingsArrayFound ||= signal.standingsArrayFound;
    merged.hasExplicitSeasonStateKey ||= signal.hasExplicitSeasonStateKey;
    merged.hasRestartDateKey ||= signal.hasRestartDateKey;
    merged.activeSignal ||= signal.activeSignal;
    merged.completedOrInactiveSignal ||= signal.completedOrInactiveSignal;
    merged.restartSignal ||= signal.restartSignal;

    merged.fixtureArrayPaths.push(...signal.fixtureArrayPaths);
    merged.standingsArrayPaths.push(...signal.standingsArrayPaths);
    merged.relevantArrayPaths.push(...signal.relevantArrayPaths);
  }

  merged.fixtureArrayPaths = [...new Set(merged.fixtureArrayPaths)].sort();
  merged.standingsArrayPaths = [...new Set(merged.standingsArrayPaths)].sort();
  merged.relevantArrayPaths = [...new Set(merged.relevantArrayPaths)].sort();

  return merged;
}

function deriveSeasonStateClass(signals) {
  if (signals.hasExplicitSeasonStateKey && signals.activeSignal && !signals.completedOrInactiveSignal) {
    return "active_in_season_candidate_needs_structured_value_review";
  }

  if (signals.hasExplicitSeasonStateKey && signals.completedOrInactiveSignal) {
    return "completed_or_inactive_candidate_needs_structured_value_review";
  }

  if (signals.activeSignal && !signals.completedOrInactiveSignal) {
    return "active_signal_only_needs_structured_season_state";
  }

  if (signals.completedOrInactiveSignal) {
    return "completed_or_inactive_signal_only_needs_structured_season_state";
  }

  return "season_state_missing_or_unstructured";
}

function buildContractRow(row, index, signalIndexBySlug, allFiles) {
  const relevantFiles = relevantFilesForRow(row, allFiles);
  const extractedSignals = [];

  for (const filePath of relevantFiles) {
    const json = readJsonIfSmall(filePath);
    if (!json) continue;
    extractedSignals.push({
      filePath,
      ...extractStructuredSignals(json)
    });
  }

  const merged = mergeSignals(extractedSignals);
  const signalBoardRow = signalIndexBySlug.get(row.competitionSlug) || null;
  const seasonStateClass = deriveSeasonStateClass(merged);

  const structuredFixtureOrResultRowsPresent = merged.fixtureArrayFound;
  const structuredStandingsRowsPresent = merged.standingsArrayFound;

  const structuredSeasonStateValidated = false;
  const seasonStateValue = null;

  const activeContractEligible =
    structuredFixtureOrResultRowsPresent &&
    structuredStandingsRowsPresent &&
    structuredSeasonStateValidated &&
    seasonStateValue === "active_in_season";

  const completedOrInactiveContractEligible =
    structuredStandingsRowsPresent &&
    structuredSeasonStateValidated &&
    ["completed_season", "inactive_between_seasons"].includes(seasonStateValue) &&
    merged.hasRestartDateKey;

  const activeSeasonStateCandidate =
    seasonStateClass.startsWith("active_");

  const completedOrInactiveSeasonStateCandidate =
    seasonStateClass.startsWith("completed_or_inactive_");

  const restartDateRequiredIfCompletedOrInactiveValidated =
    completedOrInactiveSeasonStateCandidate;

  const restartDateRequiredNow =
    structuredSeasonStateValidated &&
    ["completed_season", "inactive_between_seasons"].includes(seasonStateValue);

  const restartDateRequirementPendingStructuredSeasonState =
    !structuredSeasonStateValidated && restartDateRequiredIfCompletedOrInactiveValidated;

  const restartDateNotRequiredReason =
    activeSeasonStateCandidate
      ? "active_or_active_candidate_does_not_require_next_season_restart_date"
      : null;

  const nextCheckPolicyDerivable = false;
  const fullContractSatisfied = false;

  const missingReasons = [
    structuredFixtureOrResultRowsPresent ? null : "structured_fixture_or_result_rows_missing",
    structuredStandingsRowsPresent ? null : "structured_standings_rows_missing",
    structuredSeasonStateValidated ? null : "structured_season_state_not_validated",
    restartDateRequiredNow && !merged.hasRestartDateKey ? "restart_date_required_for_completed_or_inactive_but_missing" : null,
    restartDateRequirementPendingStructuredSeasonState ? "restart_date_requirement_pending_structured_season_state_validation" : null,
    nextCheckPolicyDerivable ? null : "next_check_policy_not_derivable_without_structured_state"
  ].filter(Boolean);

  return {
    contractRowId: `state_dependent_contract_${String(index + 1).padStart(3, "0")}`,
    competitionSlug: row.competitionSlug,
    adapterFamily: row.adapterFamily,
    adapterValidationJob: row.adapterValidationJob,

    inspectedFileCount: extractedSignals.length,
    inspectedFiles: extractedSignals.map((item) => item.filePath),

    signalBoardReviewStatus: signalBoardRow?.reviewStatus || "__missing_signal_board_row__",

    structuredFixtureOrResultRowsPresent,
    structuredStandingsRowsPresent,
    structuredSeasonStateValidated,
    seasonStateValue,
    seasonStateClass,

    restartDateSignalFound: merged.restartSignal || Boolean(signalBoardRow?.restartDateSignalFound),
    structuredRestartDatePresent: merged.hasRestartDateKey,
    activeSeasonStateCandidate,
    completedOrInactiveSeasonStateCandidate,
    restartDateRequiredIfCompletedOrInactiveValidated,
    restartDateRequiredNow,
    restartDateRequirementPendingStructuredSeasonState,
    restartDateNotRequiredReason,

    activeContractEligible,
    completedOrInactiveContractEligible,
    nextCheckPolicyDerivable,
    fullContractSatisfied,
    missingReasons,

    fixtureArrayPaths: merged.fixtureArrayPaths,
    standingsArrayPaths: merged.standingsArrayPaths,
    activeSignal: merged.activeSignal,
    completedOrInactiveSignal: merged.completedOrInactiveSignal,
    hasExplicitSeasonStateKey: merged.hasExplicitSeasonStateKey,
    hasRestartDateKey: merged.hasRestartDateKey,

    contractStatus: fullContractSatisfied
      ? "accepted_state_dependent_full_contract_candidate_no_canonical_write"
      : "state_dependent_contract_incomplete_requires_structured_state_review",

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

  const validationPlan = readJson(args.validationPlan);
  const signalBoard = readJson(args.signalBoard);
  const validationRows = Array.isArray(validationPlan.validationRows) ? validationPlan.validationRows : [];
  const signalRows = Array.isArray(signalBoard.reviewRows) ? signalBoard.reviewRows : [];

  const signalIndexBySlug = new Map(signalRows.map((row) => [row.competitionSlug, row]));
  const allFiles = walkJsonFiles(args.diagnosticsRoot);

  const contractRows = validationRows.map((row, index) =>
    buildContractRow(row, index, signalIndexBySlug, allFiles)
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-low-risk-adapter-state-dependent-contract-board-file",
    mode: "source_only_state_dependent_structured_contract_board_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    contractRules: {
      activeInSeasonRequires: [
        "trusted source",
        "structured fixture/result rows",
        "structured standings rows",
        "structured active season state",
        "active rolling-window nextCheck policy"
      ],
      activeInSeasonDoesNotRequire: [
        "next season restart date"
      ],
      completedOrInactiveRequires: [
        "trusted source",
        "structured final standings/results",
        "structured completed/inactive season state",
        "next season restart/start date when published",
        "non-daily nextCheck policy"
      ],
      nearEndRequires: [
        "trusted source",
        "current structured fixtures/results/standings",
        "near-end state",
        "calendar monitoring for restart date"
      ]
    },
    inputs: {
      validationPlan: args.validationPlan,
      signalBoard: args.signalBoard,
      diagnosticsRoot: args.diagnosticsRoot,
      validationRowCount: validationRows.length,
      signalBoardRowCount: signalRows.length,
      scannedDiagnosticsJsonFileCount: allFiles.length
    },
    summary: {
      contractRowCount: contractRows.length,
      structuredFixtureOrResultRowsPresentCount: contractRows.filter((row) => row.structuredFixtureOrResultRowsPresent).length,
      structuredStandingsRowsPresentCount: contractRows.filter((row) => row.structuredStandingsRowsPresent).length,
      structuredSeasonStateValidatedCount: 0,
      activeContractEligibleCount: contractRows.filter((row) => row.activeContractEligible).length,
      completedOrInactiveContractEligibleCount: contractRows.filter((row) => row.completedOrInactiveContractEligible).length,
      restartDateRequiredIfCompletedOrInactiveValidatedCount: contractRows.filter((row) => row.restartDateRequiredIfCompletedOrInactiveValidated).length,
      restartDateRequiredNowCount: contractRows.filter((row) => row.restartDateRequiredNow).length,
      restartDateRequirementPendingStructuredSeasonStateCount: contractRows.filter((row) => row.restartDateRequirementPendingStructuredSeasonState).length,
      restartDateNotRequiredActiveCandidateCount: contractRows.filter((row) => row.restartDateNotRequiredReason).length,
      structuredRestartDatePresentCount: contractRows.filter((row) => row.structuredRestartDatePresent).length,
      nextCheckPolicyDerivableCount: 0,
      fullContractSatisfiedCount: 0,
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
      recommendedNextLane: "build_adapter_specific_structured_season_state_extractors_for_low_risk_rows"
    },
    counts: {
      byAdapterFamily: countBy(contractRows, "adapterFamily"),
      bySeasonStateClass: countBy(contractRows, "seasonStateClass"),
      byContractStatus: countBy(contractRows, "contractStatus")
    },
    guardrails: [
      "This board uses state-dependent contract semantics.",
      "Active leagues do not require next-season restart date.",
      "Completed or inactive leagues require restart/start date when published before non-daily nextCheck can be derived.",
      "This board does not fetch.",
      "This board does not search.",
      "This board does not write canonical files.",
      "This board does not write production files.",
      "No row is active/inactive/completed truth in this output.",
      "No full contract is accepted without structured season-state value and nextCheck policy."
    ],
    contractRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    contractRowCount: output.summary.contractRowCount,
    structuredFixtureOrResultRowsPresentCount: output.summary.structuredFixtureOrResultRowsPresentCount,
    structuredStandingsRowsPresentCount: output.summary.structuredStandingsRowsPresentCount,
    structuredSeasonStateValidatedCount: output.summary.structuredSeasonStateValidatedCount,
    activeContractEligibleCount: output.summary.activeContractEligibleCount,
    completedOrInactiveContractEligibleCount: output.summary.completedOrInactiveContractEligibleCount,
    restartDateRequiredIfCompletedOrInactiveValidatedCount: output.summary.restartDateRequiredIfCompletedOrInactiveValidatedCount,
    restartDateRequiredNowCount: output.summary.restartDateRequiredNowCount,
    restartDateRequirementPendingStructuredSeasonStateCount: output.summary.restartDateRequirementPendingStructuredSeasonStateCount,
    restartDateNotRequiredActiveCandidateCount: output.summary.restartDateNotRequiredActiveCandidateCount,
    structuredRestartDatePresentCount: output.summary.structuredRestartDatePresentCount,
    nextCheckPolicyDerivableCount: output.summary.nextCheckPolicyDerivableCount,
    fullContractSatisfiedCount: output.summary.fullContractSatisfiedCount,
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
