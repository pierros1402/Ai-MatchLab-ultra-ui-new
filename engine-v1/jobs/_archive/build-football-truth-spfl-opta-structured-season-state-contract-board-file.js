#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_STATE_DEPENDENT_BOARD =
  "data/football-truth/_diagnostics/low-risk-adapter-state-dependent-contract-board-2026-06-14/low-risk-adapter-state-dependent-contract-board-2026-06-14.json";

const DEFAULT_DIAGNOSTICS_ROOT = "data/football-truth/_diagnostics";

const TARGET_COMPETITIONS = new Set(["sco.1", "sco.2"]);

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    stateDependentBoard: DEFAULT_STATE_DEPENDENT_BOARD,
    diagnosticsRoot: DEFAULT_DIAGNOSTICS_ROOT,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--state-dependent-board") args.stateDependentBoard = argv[++i];
    else if (arg === "--diagnostics-root") args.diagnosticsRoot = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `spfl-opta-structured-season-state-contract-board-${args.date}`,
      `spfl-opta-structured-season-state-contract-board-${args.date}.json`
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

function relevantSpflFiles(allFiles) {
  return allFiles.filter((filePath) => {
    const normalized = filePath.replaceAll("\\", "/").toLowerCase();

    const isDerivedBoard =
      normalized.includes("low-risk-adapter") ||
      normalized.includes("state-dependent-contract-board") ||
      normalized.includes("structured-season-state-contract-board") ||
      normalized.includes("validation-board") ||
      normalized.includes("validation-plan") ||
      normalized.includes("source-authority") ||
      normalized.includes("season-calendar-lanes") ||
      normalized.includes("partial-trusted-source-enrichment-plan");

    if (isDerivedBoard) return false;

    return (
      normalized.includes("spfl") ||
      normalized.includes("opta") ||
      normalized.includes("sco.1") ||
      normalized.includes("sco.2")
    );
  });
}

function collectValues(value, state = { keys: new Set(), arrays: [], scalarValues: [] }, currentPath = "") {
  if (value === null || value === undefined) return state;

  if (Array.isArray(value)) {
    state.arrays.push({ path: currentPath, length: value.length, sample: value.slice(0, 3) });
    for (const item of value.slice(0, 10)) collectValues(item, state, currentPath);
    return state;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const nestedPath = currentPath ? `${currentPath}.${key}` : key;
      state.keys.add(key);
      collectValues(nested, state, nestedPath);
    }
    return state;
  }

  if (["string", "number", "boolean"].includes(typeof value)) {
    state.scalarValues.push({ path: currentPath, value });
  }

  return state;
}

function looksLikeScoCompetition(value) {
  const text = JSON.stringify(value).toLowerCase();
  return (
    text.includes("sco.1") ||
    text.includes("sco.2") ||
    text.includes("premiership") ||
    text.includes("championship") ||
    text.includes("spfl")
  );
}

function classifyCompetitionFromText(text) {
  const lower = text.toLowerCase();

  if (lower.includes("sco.1") || lower.includes("premiership")) return "sco.1";
  if (lower.includes("sco.2") || lower.includes("championship")) return "sco.2";

  return null;
}

function extractSpflStructuredEvidence(json, filePath) {
  const state = collectValues(json);
  const text = JSON.stringify(json).slice(0, 1000000);
  const lower = text.toLowerCase();

  const fixtureArrays = state.arrays.filter((entry) =>
    /fixture|fixtures|match|matches|result|results/i.test(entry.path) &&
    entry.length > 0 &&
    looksLikeScoCompetition(entry.sample)
  );

  const standingsArrays = state.arrays.filter((entry) =>
    /standing|standings|table|leagueTable/i.test(entry.path) &&
    entry.length > 0 &&
    looksLikeScoCompetition(entry.sample)
  );

  const explicitStateScalars = state.scalarValues.filter((entry) => {
    const path = String(entry.path);
    const value = String(entry.value);

    const isDerivedDiagnosticPath =
      /evidenceRows|contractRows|reviewRows|summary|counts|guardrails|inputs/i.test(path) ||
      /structuredSeasonStateCandidate|structuredSeasonState|seasonStateDerivationReason|contractStatus|reviewStatus/i.test(path);

    const isFixtureOrMatchStatus =
      /fixtureRows\.status|fixtures\.status|matchRows\.status|matches\.status|resultRows\.status|results\.status/i.test(path) ||
      (/fixture|match|result/i.test(path) && /\.status$/i.test(path));

    const isSeasonLevelStatePath =
      /seasonState|seasonStatus|competitionPhase|season\.state|season\.status|competition\.state|competition\.status/i.test(path);

    return !isDerivedDiagnosticPath &&
      !isFixtureOrMatchStatus &&
      isSeasonLevelStatePath &&
      /active|current|live|complete|completed|inactive|finished/i.test(value);
  });

  const dateScalars = state.scalarValues.filter((entry) =>
    /date|Date|start|Start|kickoff|Kickoff/i.test(entry.path) &&
    /^\d{4}-\d{2}-\d{2}/.test(String(entry.value))
  );

  const hasFutureDateSignal = dateScalars.some((entry) =>
    String(entry.value).slice(0, 10) >= "2026-06-14"
  );

  const hasPastOrCurrentResultDateSignal = dateScalars.some((entry) =>
    String(entry.value).slice(0, 10) <= "2026-06-14"
  );

  const competitionSlug =
    classifyCompetitionFromText(filePath) ||
    classifyCompetitionFromText(text);

  let structuredSeasonStateCandidate = null;
  let seasonStateDerivationReason = null;

  if (explicitStateScalars.length > 0) {
    const activeScalar = explicitStateScalars.find((entry) =>
      /active|current|live/i.test(String(entry.value))
    );

    const completedScalar = explicitStateScalars.find((entry) =>
      /complete|completed|inactive|finished/i.test(String(entry.value))
    );

    if (activeScalar && !completedScalar) {
      structuredSeasonStateCandidate = "active_in_season";
      seasonStateDerivationReason = `explicit_state_scalar:${activeScalar.path}=${activeScalar.value}`;
    } else if (completedScalar && !activeScalar) {
      structuredSeasonStateCandidate = "completed_or_inactive_needs_restart_date";
      seasonStateDerivationReason = `explicit_state_scalar:${completedScalar.path}=${completedScalar.value}`;
    }
  }

  if (!structuredSeasonStateCandidate && fixtureArrays.length > 0 && standingsArrays.length > 0 && hasFutureDateSignal) {
    structuredSeasonStateCandidate = "active_future_fixture_signal_needs_competition_scope_review";
    seasonStateDerivationReason = "structured_fixture_and_standings_rows_with_future_dates_not_season_state";
  }

  if (!structuredSeasonStateCandidate && fixtureArrays.length > 0 && standingsArrays.length > 0 && hasPastOrCurrentResultDateSignal) {
    structuredSeasonStateCandidate = "active_or_recent_season_needs_future_window_confirmation";
    seasonStateDerivationReason = "structured_fixture_and_standings_rows_with_past_or_current_dates_only_not_season_state";
  }

  return {
    filePath,
    competitionSlug,
    fixtureArrayFound: fixtureArrays.length > 0,
    standingsArrayFound: standingsArrays.length > 0,
    fixtureArrayPaths: fixtureArrays.map((entry) => `${entry.path}:${entry.length}`).sort(),
    standingsArrayPaths: standingsArrays.map((entry) => `${entry.path}:${entry.length}`).sort(),
    explicitStateScalars: explicitStateScalars.slice(0, 10),
    dateScalars: dateScalars.slice(0, 20),
    hasFutureDateSignal,
    hasPastOrCurrentResultDateSignal,
    structuredSeasonStateCandidate,
    seasonStateDerivationReason
  };
}

function mergeForCompetition(competitionSlug, evidenceRows) {
  const rows = evidenceRows.filter((row) =>
    !row.competitionSlug || row.competitionSlug === competitionSlug
  );

  const fixtureRows = rows.filter((row) => row.fixtureArrayFound);
  const standingsRows = rows.filter((row) => row.standingsArrayFound);
  const stateRows = rows.filter((row) => row.structuredSeasonStateCandidate);

  const activeCandidate = stateRows.find((row) =>
    row.structuredSeasonStateCandidate === "active_in_season"
  );

  const activeFutureFixtureSignal = stateRows.find((row) =>
    row.structuredSeasonStateCandidate === "active_future_fixture_signal_needs_competition_scope_review"
  );

  const recentNeedsFutureConfirmation = stateRows.find((row) =>
    row.structuredSeasonStateCandidate === "active_or_recent_season_needs_future_window_confirmation"
  );

  const completedCandidate = stateRows.find((row) =>
    row.structuredSeasonStateCandidate === "completed_or_inactive_needs_restart_date"
  );

  let structuredSeasonState = null;
  let structuredSeasonStateConfidence = "none";
  let seasonStateEvidenceFile = null;
  let seasonStateDerivationReason = null;

  if (activeCandidate) {
    structuredSeasonState = "active_in_season";
    structuredSeasonStateConfidence = "structured_candidate";
    seasonStateEvidenceFile = activeCandidate.filePath;
    seasonStateDerivationReason = activeCandidate.seasonStateDerivationReason;
  } else if (completedCandidate) {
    structuredSeasonState = "completed_or_inactive_needs_restart_date";
    structuredSeasonStateConfidence = "structured_candidate";
    seasonStateEvidenceFile = completedCandidate.filePath;
    seasonStateDerivationReason = completedCandidate.seasonStateDerivationReason;
  } else if (activeFutureFixtureSignal) {
    structuredSeasonState = "active_future_fixture_signal_needs_competition_scope_review";
    structuredSeasonStateConfidence = "signal_only_not_validated_season_state";
    seasonStateEvidenceFile = activeFutureFixtureSignal.filePath;
    seasonStateDerivationReason = activeFutureFixtureSignal.seasonStateDerivationReason;
  } else if (recentNeedsFutureConfirmation) {
    structuredSeasonState = "active_or_recent_season_needs_future_window_confirmation";
    structuredSeasonStateConfidence = "partial_structured_candidate";
    seasonStateEvidenceFile = recentNeedsFutureConfirmation.filePath;
    seasonStateDerivationReason = recentNeedsFutureConfirmation.seasonStateDerivationReason;
  }

  return {
    competitionSlug,
    inspectedEvidenceFileCount: rows.length,
    structuredFixtureOrResultRowsPresent: fixtureRows.length > 0,
    structuredStandingsRowsPresent: standingsRows.length > 0,
    structuredSeasonState,
    structuredSeasonStateConfidence,
    seasonStateEvidenceFile,
    seasonStateDerivationReason,
    fixtureEvidenceFiles: [...new Set(fixtureRows.map((row) => row.filePath))].sort(),
    standingsEvidenceFiles: [...new Set(standingsRows.map((row) => row.filePath))].sort(),
    fixtureArrayPaths: [...new Set(fixtureRows.flatMap((row) => row.fixtureArrayPaths))].sort(),
    standingsArrayPaths: [...new Set(standingsRows.flatMap((row) => row.standingsArrayPaths))].sort()
  };
}

function buildContractRow(baseRow, index, merged) {
  const activeValidated = merged.structuredSeasonState === "active_in_season";
  const completedOrInactiveValidated =
    merged.structuredSeasonState === "completed_or_inactive_needs_restart_date";

  const structuredSeasonStateValidated =
    activeValidated || completedOrInactiveValidated;

  const restartDateRequiredNow = completedOrInactiveValidated;
  const restartDateNotRequiredReason = activeValidated
    ? "active_in_season_contract_does_not_require_next_season_restart_date"
    : null;

  const nextCheckPolicy =
    activeValidated
      ? {
          type: "rolling_window_active_check",
          nextCheckAtPolicy: "daily_or_matchday_window_until_state_changes",
          requiresRestartDate: false
        }
      : null;

  const nextCheckPolicyDerivable = Boolean(nextCheckPolicy);

  const activeContractSatisfied =
    merged.structuredFixtureOrResultRowsPresent &&
    merged.structuredStandingsRowsPresent &&
    activeValidated &&
    nextCheckPolicyDerivable;

  const completedOrInactiveContractSatisfied =
    merged.structuredStandingsRowsPresent &&
    completedOrInactiveValidated &&
    false;

  const fullContractSatisfied = activeContractSatisfied || completedOrInactiveContractSatisfied;

  const missingReasons = [
    merged.structuredFixtureOrResultRowsPresent ? null : "structured_fixture_or_result_rows_missing",
    merged.structuredStandingsRowsPresent ? null : "structured_standings_rows_missing",
    structuredSeasonStateValidated ? null : "structured_active_or_completed_season_state_not_validated",
    restartDateRequiredNow ? "restart_date_required_for_completed_or_inactive_state_not_validated" : null,
    nextCheckPolicyDerivable ? null : "next_check_policy_not_derivable"
  ].filter(Boolean);

  return {
    contractRowId: `spfl_opta_structured_contract_${String(index + 1).padStart(3, "0")}`,
    competitionSlug: baseRow.competitionSlug,
    adapterFamily: "spfl_opta",

    inspectedEvidenceFileCount: merged.inspectedEvidenceFileCount,
    fixtureEvidenceFiles: merged.fixtureEvidenceFiles,
    standingsEvidenceFiles: merged.standingsEvidenceFiles,
    seasonStateEvidenceFile: merged.seasonStateEvidenceFile,

    structuredFixtureOrResultRowsPresent: merged.structuredFixtureOrResultRowsPresent,
    structuredStandingsRowsPresent: merged.structuredStandingsRowsPresent,
    structuredSeasonStateValidated,
    structuredSeasonState: merged.structuredSeasonState,
    structuredSeasonStateConfidence: merged.structuredSeasonStateConfidence,
    seasonStateDerivationReason: merged.seasonStateDerivationReason,

    restartDateRequiredNow,
    restartDateNotRequiredReason,
    nextCheckPolicy,
    nextCheckPolicyDerivable,

    activeContractSatisfied,
    completedOrInactiveContractSatisfied,
    fullContractSatisfied,
    missingReasons,

    fixtureArrayPaths: merged.fixtureArrayPaths,
    standingsArrayPaths: merged.standingsArrayPaths,

    contractStatus: fullContractSatisfied
      ? "accepted_state_dependent_full_contract_candidate_no_canonical_write"
      : "incomplete_structured_spfl_contract",

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

  const stateDependentBoard = readJson(args.stateDependentBoard);
  const allRows = Array.isArray(stateDependentBoard.contractRows)
    ? stateDependentBoard.contractRows
    : [];

  const targetRows = allRows.filter((row) =>
    row.adapterFamily === "spfl_opta" && TARGET_COMPETITIONS.has(row.competitionSlug)
  );

  const allFiles = walkJsonFiles(args.diagnosticsRoot);
  const spflFiles = relevantSpflFiles(allFiles);

  const evidenceRows = [];
  for (const filePath of spflFiles) {
    const json = readJsonIfSmall(filePath);
    if (!json) continue;
    evidenceRows.push(extractSpflStructuredEvidence(json, filePath));
  }

  const contractRows = targetRows.map((row, index) =>
    buildContractRow(row, index, mergeForCompetition(row.competitionSlug, evidenceRows))
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-spfl-opta-structured-season-state-contract-board-file",
    mode: "source_only_spfl_opta_structured_state_dependent_contract_board_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      stateDependentBoard: args.stateDependentBoard,
      diagnosticsRoot: args.diagnosticsRoot,
      targetRowCount: targetRows.length,
      scannedDiagnosticsJsonFileCount: allFiles.length,
      relevantSpflJsonFileCount: spflFiles.length,
      evidenceRowCount: evidenceRows.length
    },
    summary: {
      contractRowCount: contractRows.length,
      structuredFixtureOrResultRowsPresentCount: contractRows.filter((row) => row.structuredFixtureOrResultRowsPresent).length,
      structuredStandingsRowsPresentCount: contractRows.filter((row) => row.structuredStandingsRowsPresent).length,
      structuredSeasonStateValidatedCount: contractRows.filter((row) => row.structuredSeasonStateValidated).length,
      activeContractSatisfiedCount: contractRows.filter((row) => row.activeContractSatisfied).length,
      completedOrInactiveContractSatisfiedCount: contractRows.filter((row) => row.completedOrInactiveContractSatisfied).length,
      restartDateRequiredNowCount: contractRows.filter((row) => row.restartDateRequiredNow).length,
      restartDateNotRequiredActiveCount: contractRows.filter((row) => row.restartDateNotRequiredReason).length,
      nextCheckPolicyDerivableCount: contractRows.filter((row) => row.nextCheckPolicyDerivable).length,
      fullContractSatisfiedCount: contractRows.filter((row) => row.fullContractSatisfied).length,
      fullContractCandidateNoCanonicalWriteCount: contractRows.filter((row) => row.contractStatus === "accepted_state_dependent_full_contract_candidate_no_canonical_write").length,
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
      recommendedNextLane: "review_spfl_structured_contract_candidates_before_any_canonical_plan"
    },
    counts: {
      byStructuredSeasonState: countBy(contractRows, "structuredSeasonState"),
      byContractStatus: countBy(contractRows, "contractStatus")
    },
    guardrails: [
      "This board only inspects existing local diagnostic JSON outputs.",
      "This board is adapter-specific for SPFL Opta rows only.",
      "This board does not fetch.",
      "This board does not search.",
      "This board does not write canonical files.",
      "This board does not write production files.",
      "Active full contract does not require next-season restart date.",
      "Completed/inactive full contract would require restart date before non-daily nextCheck policy.",
      "No active/inactive/completed canonical assertion is made by this board."
    ],
    evidenceRows,
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
    activeContractSatisfiedCount: output.summary.activeContractSatisfiedCount,
    completedOrInactiveContractSatisfiedCount: output.summary.completedOrInactiveContractSatisfiedCount,
    restartDateRequiredNowCount: output.summary.restartDateRequiredNowCount,
    restartDateNotRequiredActiveCount: output.summary.restartDateNotRequiredActiveCount,
    nextCheckPolicyDerivableCount: output.summary.nextCheckPolicyDerivableCount,
    fullContractSatisfiedCount: output.summary.fullContractSatisfiedCount,
    fullContractCandidateNoCanonicalWriteCount: output.summary.fullContractCandidateNoCanonicalWriteCount,
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
