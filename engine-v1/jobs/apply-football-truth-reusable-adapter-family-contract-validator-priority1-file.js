#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_ENGINE =
  "data/football-truth/_diagnostics/reusable-adapter-family-contract-validator-engine-2026-06-14/reusable-adapter-family-contract-validator-engine-2026-06-14.json";

const DEFAULT_DIAGNOSTICS_ROOT = "data/football-truth/_diagnostics";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14.json";

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
  "reusable-adapter-family-contract-validator-engine",
  "reusable-adapter-family-contract-validator-priority1-apply"
];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    engine: DEFAULT_ENGINE,
    diagnosticsRoot: DEFAULT_DIAGNOSTICS_ROOT,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--engine") args.engine = argv[++i];
    else if (arg === "--diagnostics-root") args.diagnosticsRoot = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfPossible(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function walkJsonFiles(rootDir) {
  const out = [];

  function walk(current) {
    if (!fs.existsSync(current)) return;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
        out.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return out.sort();
}

function normalizedPath(filePath) {
  return filePath.replaceAll("\\", "/").toLowerCase();
}

function isDerivedDiagnosticFile(filePath) {
  const normalized = normalizedPath(filePath);
  return DERIVED_DIAGNOSTIC_BLOCKLIST_HINTS.some((hint) => normalized.includes(hint.toLowerCase()));
}

function fileMatchesAllowlist(filePath, hints) {
  const normalized = normalizedPath(filePath);
  return hints.some((hint) => normalized.includes(String(hint).toLowerCase()));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectArraysAndScalars(root) {
  const arrays = [];
  const scalars = [];

  function visit(value, currentPath) {
    if (Array.isArray(value)) {
      arrays.push({
        path: currentPath,
        length: value.length,
        sample: value.slice(0, 3)
      });

      value.slice(0, 20).forEach((item, index) => {
        visit(item, `${currentPath}[${index}]`);
      });
      return;
    }

    if (isObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        visit(child, currentPath ? `${currentPath}.${key}` : key);
      }
      return;
    }

    if (value !== null && value !== undefined) {
      scalars.push({
        path: currentPath,
        value
      });
    }
  }

  visit(root, "");
  return { arrays, scalars };
}

function selectorPathMatches(arrayPath, selectorPaths = []) {
  const normalizedArrayPath = String(arrayPath).toLowerCase();

  return selectorPaths.some((selectorPath) => {
    const normalizedSelector = String(selectorPath).toLowerCase();
    return (
      normalizedArrayPath === normalizedSelector ||
      normalizedArrayPath.endsWith(`.${normalizedSelector}`) ||
      normalizedArrayPath.includes(`.${normalizedSelector}.`) ||
      normalizedArrayPath.includes(`${normalizedSelector}[`) ||
      normalizedArrayPath.endsWith(`.${normalizedSelector.replaceAll(".", ".")}`)
    );
  });
}

function arrayLooksLikeFixtureOrResult(arrayEntry, selectorPaths = []) {
  const p = arrayEntry.path.toLowerCase();
  const selectorMatched = selectorPathMatches(arrayEntry.path, selectorPaths);

  if (!selectorMatched && !/(fixture|fixtures|match|matches|result|results|games)/i.test(p)) return false;
  if (arrayEntry.length === 0) return false;

  const text = JSON.stringify(arrayEntry.sample).toLowerCase();
  return /date|time|kickoff|home|away|team|score|status|fixture|match|result|game/.test(text);
}

function arrayLooksLikeStandings(arrayEntry, selectorPaths = []) {
  const p = arrayEntry.path.toLowerCase();
  const selectorMatched = selectorPathMatches(arrayEntry.path, selectorPaths);

  if (!selectorMatched && !/(standing|standings|table|rank|leaguetable|classification|sarjataulukko|seriestable)/i.test(p)) return false;
  if (arrayEntry.length === 0) return false;

  const text = JSON.stringify(arrayEntry.sample).toLowerCase();
  return /rank|position|team|played|points|pts|won|draw|lost|goaldifference|goal|club|name/.test(text);
}

function extractDateCandidatesFromValue(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return [];

  const matches = text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) || [];
  return matches;
}

function dateCmp(a, b) {
  return String(a).localeCompare(String(b));
}

function collectDateSignals(arrays, scalars, targetDate, fixtureSelectorPaths = []) {
  const dates = new Set();

  for (const arrayEntry of arrays) {
    if (!arrayLooksLikeFixtureOrResult(arrayEntry, fixtureSelectorPaths)) continue;
    for (const date of extractDateCandidatesFromValue(arrayEntry.sample)) dates.add(date);
  }

  for (const scalar of scalars) {
    if (!/(date|time|kickoff|fixture|match|result)/i.test(scalar.path)) continue;
    for (const date of extractDateCandidatesFromValue(scalar.value)) dates.add(date);
  }

  const sortedDates = [...dates].sort();
  const pastOrCurrent = sortedDates.filter((date) => dateCmp(date, targetDate) <= 0);
  const future = sortedDates.filter((date) => dateCmp(date, targetDate) > 0);

  return {
    dateCount: sortedDates.length,
    firstDate: sortedDates[0] || null,
    lastDate: sortedDates[sortedDates.length - 1] || null,
    pastOrCurrentDateCount: pastOrCurrent.length,
    futureDateCount: future.length,
    hasPastOrCurrentDateSignal: pastOrCurrent.length > 0,
    hasFutureDateSignal: future.length > 0
  };
}

function extractSeasonStateCandidate(scalars, seasonStateSelectorPaths = []) {
  const candidates = [];

  for (const scalar of scalars) {
    const p = String(scalar.path);
    const v = String(scalar.value);

    const isDerivedPath =
      /evidenceRows|contractRows|engineRows|reviewRows|summary|counts|guardrails|inputs/i.test(p) ||
      /structuredSeasonStateCandidate|structuredSeasonState|seasonStateDerivationReason|contractStatus|reviewStatus/i.test(p);

    const isFixtureOrMatchStatus =
      /fixtureRows\.status|fixtures\.status|matchRows\.status|matches\.status|resultRows\.status|results\.status/i.test(p) ||
      ((/fixture|match|result/i.test(p)) && /\.status$/i.test(p));

    const isSeasonLevelStatePath =
      selectorPathMatches(p, seasonStateSelectorPaths) ||
      /seasonState|seasonStatus|competitionPhase|season\.state|season\.status|competition\.state|competition\.status/i.test(p);

    const valueLooksLikeState =
      /active|current|live|complete|completed|inactive|finished|closed|ended/i.test(v);

    if (
      !isDerivedPath &&
      !isFixtureOrMatchStatus &&
      isSeasonLevelStatePath &&
      valueLooksLikeState
    ) {
      let normalizedState = "unknown_season_state_signal";

      if (/active|current|live/i.test(v)) normalizedState = "active_in_season";
      else if (/complete|completed|inactive|finished|closed|ended/i.test(v)) {
        normalizedState = "completed_or_inactive_needs_restart_date";
      }

      candidates.push({
        path: p,
        value: scalar.value,
        normalizedState
      });
    }
  }

  return candidates[0] || null;
}

function validateCompetitionFromFiles({ row, allFiles, targetDate }) {
  const allowlist = row.rawSourceAllowlistHints || [];
  const candidateFiles = allFiles.filter((filePath) =>
    !isDerivedDiagnosticFile(filePath) &&
    fileMatchesAllowlist(filePath, allowlist)
  );

  const evidenceRows = [];
  let structuredFixtureOrResultRowsPresent = false;
  let structuredStandingsRowsPresent = false;
  let structuredSeasonStateValidated = false;
  let structuredSeasonState = null;
  let structuredSeasonStateEvidence = null;
  let activeFutureFixtureSignal = false;
  let activeOrRecentNeedsFutureConfirmation = false;
  let dateSignalSummary = {
    dateCount: 0,
    firstDate: null,
    lastDate: null,
    pastOrCurrentDateCount: 0,
    futureDateCount: 0,
    hasPastOrCurrentDateSignal: false,
    hasFutureDateSignal: false
  };

  const fixtureSelectorPaths = row.selectors?.fixtureResultRows || [];
  const standingsSelectorPaths = row.selectors?.standingsRows || [];
  const seasonStateSelectorPaths = row.selectors?.seasonState || [];

  for (const filePath of candidateFiles) {
    const json = readJsonIfPossible(filePath);
    if (!json) continue;

    const { arrays, scalars } = collectArraysAndScalars(json);

    const fixtureArrays = arrays.filter((arrayEntry) =>
      arrayLooksLikeFixtureOrResult(arrayEntry, fixtureSelectorPaths)
    );
    const standingsArrays = arrays.filter((arrayEntry) =>
      arrayLooksLikeStandings(arrayEntry, standingsSelectorPaths)
    );
    const dateSignals = collectDateSignals(arrays, scalars, targetDate, fixtureSelectorPaths);
    const seasonStateCandidate = extractSeasonStateCandidate(scalars, seasonStateSelectorPaths);

    if (fixtureArrays.length > 0) structuredFixtureOrResultRowsPresent = true;
    if (standingsArrays.length > 0) structuredStandingsRowsPresent = true;

    if (
      seasonStateCandidate &&
      !structuredSeasonStateValidated
    ) {
      structuredSeasonStateValidated = true;
      structuredSeasonState = seasonStateCandidate.normalizedState;
      structuredSeasonStateEvidence = {
        filePath,
        path: seasonStateCandidate.path,
        value: seasonStateCandidate.value
      };
    }

    if (dateSignals.hasFutureDateSignal) activeFutureFixtureSignal = true;
    if (dateSignals.hasPastOrCurrentDateSignal && !dateSignals.hasFutureDateSignal) {
      activeOrRecentNeedsFutureConfirmation = true;
    }

    dateSignalSummary = {
      dateCount: dateSignalSummary.dateCount + dateSignals.dateCount,
      firstDate: [dateSignalSummary.firstDate, dateSignals.firstDate].filter(Boolean).sort()[0] || null,
      lastDate: [dateSignalSummary.lastDate, dateSignals.lastDate].filter(Boolean).sort().at(-1) || null,
      pastOrCurrentDateCount: dateSignalSummary.pastOrCurrentDateCount + dateSignals.pastOrCurrentDateCount,
      futureDateCount: dateSignalSummary.futureDateCount + dateSignals.futureDateCount,
      hasPastOrCurrentDateSignal: dateSignalSummary.hasPastOrCurrentDateSignal || dateSignals.hasPastOrCurrentDateSignal,
      hasFutureDateSignal: dateSignalSummary.hasFutureDateSignal || dateSignals.hasFutureDateSignal
    };

    if (
      fixtureArrays.length > 0 ||
      standingsArrays.length > 0 ||
      dateSignals.dateCount > 0 ||
      seasonStateCandidate
    ) {
      evidenceRows.push({
        competitionSlug: row.competitionSlug,
        adapterFamily: row.adapterFamily,
        filePath,
        fixtureArrayCount: fixtureArrays.length,
        standingsArrayCount: standingsArrays.length,
        dateSignals,
        seasonStateCandidate
      });
    }
  }

  let contractState = "__missing__";
  let stateConfidence = "none";
  const missingReasons = [];

  if (structuredSeasonStateValidated) {
    contractState = structuredSeasonState;
    stateConfidence = "structured_season_level_candidate";
  } else if (activeFutureFixtureSignal) {
    contractState = "active_future_fixture_signal_needs_season_state_validation";
    stateConfidence = "signal_only";
  } else if (activeOrRecentNeedsFutureConfirmation) {
    contractState = "active_or_recent_season_needs_future_window_confirmation";
    stateConfidence = "signal_only";
  }

  if (!structuredFixtureOrResultRowsPresent) missingReasons.push("structured_fixture_or_result_rows_missing");
  if (!structuredStandingsRowsPresent) missingReasons.push("structured_standings_rows_missing");
  if (!structuredSeasonStateValidated) missingReasons.push("structured_active_or_completed_season_state_not_validated");

  const activeContractSatisfied =
    structuredFixtureOrResultRowsPresent &&
    structuredStandingsRowsPresent &&
    structuredSeasonStateValidated &&
    structuredSeasonState === "active_in_season";

  const completedOrInactiveContractSatisfied =
    structuredFixtureOrResultRowsPresent &&
    structuredStandingsRowsPresent &&
    structuredSeasonStateValidated &&
    structuredSeasonState === "completed_or_inactive_needs_restart_date" &&
    false;

  const nextCheckPolicyDerivable = activeContractSatisfied;

  if (!nextCheckPolicyDerivable) missingReasons.push("next_check_policy_not_derivable");

  const fullContractSatisfied = activeContractSatisfied || completedOrInactiveContractSatisfied;

  return {
    validationRow: {
      competitionSlug: row.competitionSlug,
      competitionName: row.competitionName,
      adapterFamily: row.adapterFamily,
      familyPriority: row.familyPriority,
      candidateFileCount: candidateFiles.length,
      evidenceFileCount: evidenceRows.length,
      structuredFixtureOrResultRowsPresent,
      structuredStandingsRowsPresent,
      structuredSeasonStateValidated,
      contractState,
      stateConfidence,
      structuredSeasonStateEvidence,
      activeFutureFixtureSignal,
      activeOrRecentNeedsFutureConfirmation,
      dateSignalSummary,
      activeContractSatisfied,
      completedOrInactiveContractSatisfied,
      nextCheckPolicyDerivable,
      fullContractSatisfied,
      fullContractCandidateNoCanonicalWrite: fullContractSatisfied,
      missingReasons: [...new Set(missingReasons)],
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      activeAsserted: false,
      inactiveAsserted: false,
      completedAsserted: false
    },
    evidenceRows
  };
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

function main() {
  const args = parseArgs(process.argv);

  const engine = readJson(args.engine);
  const allFiles = walkJsonFiles(args.diagnosticsRoot);

  const targetRows = (Array.isArray(engine.engineRows) ? engine.engineRows : [])
    .filter((row) =>
      row.engineAction === "ready_for_reusable_family_validator" &&
      row.familyPriority === 1
    );

  const validationRows = [];
  const evidenceRows = [];

  for (const row of targetRows) {
    const result = validateCompetitionFromFiles({
      row,
      allFiles,
      targetDate: args.date
    });

    validationRows.push(result.validationRow);
    evidenceRows.push(...result.evidenceRows);
  }

  validationRows.sort((a, b) => {
    if (a.adapterFamily !== b.adapterFamily) return a.adapterFamily.localeCompare(b.adapterFamily);
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  validationRows.forEach((row, index) => {
    row.validationRowId = `priority1_reusable_validation_${String(index + 1).padStart(3, "0")}`;
    row.validationSequence = index + 1;
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "apply-football-truth-reusable-adapter-family-contract-validator-priority1-file",
    mode: "source_only_apply_reusable_adapter_family_contract_validator_priority1_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      engine: args.engine,
      diagnosticsRoot: args.diagnosticsRoot,
      engineRowCount: Array.isArray(engine.engineRows) ? engine.engineRows.length : 0,
      priority1TargetRowCount: targetRows.length,
      scannedJsonFileCount: allFiles.length
    },
    summary: {
      validationRowCount: validationRows.length,
      evidenceRowCount: evidenceRows.length,
      configuredPriority1FamilyCount: new Set(validationRows.map((row) => row.adapterFamily)).size,
      structuredFixtureOrResultRowsPresentCount: validationRows.filter((row) => row.structuredFixtureOrResultRowsPresent).length,
      structuredStandingsRowsPresentCount: validationRows.filter((row) => row.structuredStandingsRowsPresent).length,
      structuredSeasonStateValidatedCount: validationRows.filter((row) => row.structuredSeasonStateValidated).length,
      signalOnlyStateCount: validationRows.filter((row) => row.stateConfidence === "signal_only").length,
      activeFutureFixtureSignalCount: validationRows.filter((row) => row.activeFutureFixtureSignal).length,
      activeOrRecentNeedsFutureConfirmationCount: validationRows.filter((row) => row.activeOrRecentNeedsFutureConfirmation).length,
      activeContractSatisfiedCount: validationRows.filter((row) => row.activeContractSatisfied).length,
      completedOrInactiveContractSatisfiedCount: validationRows.filter((row) => row.completedOrInactiveContractSatisfied).length,
      nextCheckPolicyDerivableCount: validationRows.filter((row) => row.nextCheckPolicyDerivable).length,
      fullContractSatisfiedCount: validationRows.filter((row) => row.fullContractSatisfied).length,
      fullContractCandidateNoCanonicalWriteCount: validationRows.filter((row) => row.fullContractCandidateNoCanonicalWrite).length,
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
      recommendedNextLane: "review_priority1_reusable_validator_output_then_generalize_or_tighten_selectors"
    },
    counts: {
      byAdapterFamily: countBy(validationRows, "adapterFamily"),
      byContractState: countBy(validationRows, "contractState"),
      byStateConfidence: countBy(validationRows, "stateConfidence")
    },
    guardrails: [
      "This applies the reusable validator to priority-1 adapter families only.",
      "This does not fetch.",
      "This does not search.",
      "This does not write canonical files.",
      "This does not write production files.",
      "Derived diagnostic boards are blocked as source evidence.",
      "Fixture/match status is not accepted as season state.",
      "Future fixtures are signal-only unless season-level state is also validated."
    ],
    validationRows,
    evidenceRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    validationRowCount: output.summary.validationRowCount,
    evidenceRowCount: output.summary.evidenceRowCount,
    configuredPriority1FamilyCount: output.summary.configuredPriority1FamilyCount,
    structuredFixtureOrResultRowsPresentCount: output.summary.structuredFixtureOrResultRowsPresentCount,
    structuredStandingsRowsPresentCount: output.summary.structuredStandingsRowsPresentCount,
    structuredSeasonStateValidatedCount: output.summary.structuredSeasonStateValidatedCount,
    signalOnlyStateCount: output.summary.signalOnlyStateCount,
    activeFutureFixtureSignalCount: output.summary.activeFutureFixtureSignalCount,
    activeOrRecentNeedsFutureConfirmationCount: output.summary.activeOrRecentNeedsFutureConfirmationCount,
    activeContractSatisfiedCount: output.summary.activeContractSatisfiedCount,
    completedOrInactiveContractSatisfiedCount: output.summary.completedOrInactiveContractSatisfiedCount,
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
