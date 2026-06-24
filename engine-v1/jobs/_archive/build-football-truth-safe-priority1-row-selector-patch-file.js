#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INSPECTION =
  "data/football-truth/_diagnostics/priority1-reusable-source-shape-selector-inspection-2026-06-14/priority1-reusable-source-shape-selector-inspection-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/safe-priority1-row-selector-patch-2026-06-14/safe-priority1-row-selector-patch-2026-06-14.json";

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    inspection: DEFAULT_INSPECTION,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--inspection") args.inspection = argv[++i];
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

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
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

function isUnsafeSeasonStateCandidatePath(candidatePath) {
  const p = String(candidatePath).toLowerCase();

  return (
    /fixture|fixtures|match|matches|result|results|game|games|futurelikefinishedrows|normalizedresultrows|normalizedfixturerows/.test(p) ||
    /normalizedstatus/.test(p) ||
    /\.status$/.test(p)
  );
}

function filterSafeFixtureCandidates(candidates, maxCount) {
  return unique(
    candidates
      .filter((candidate) => {
        const p = String(candidate?.path || "").toLowerCase();
        if (!candidate?.path || Number(candidate.score || 0) < 4) return false;
        if (/standings|table|rank|leaguetable|classification|sarjataulukko|seriestable/.test(p)) return false;

        const isSampleOrNestedDiagnostic =
          /inspectionrows|sampleonlyrows|nestedmatchsamples|parseDiagnostics|auditRows|expectedRows/.test(p);

        const isEventOrTeamSubArray =
          /events$|\.events|teams$|\.teams|groups\[\d+\]\.teams/.test(p);

        if (isSampleOrNestedDiagnostic || isEventOrTeamSubArray) return false;

        const isDirectFixtureRowPath =
          /(^|\.)(fixtureRows|resultRows|matches|fixtures|games|normalizedFixtureRows|normalizedResultRows|normalizedScheduledRows)$/.test(String(candidate.path));

        return isDirectFixtureRowPath;
      })
      .map((candidate) => candidate.path)
  ).slice(0, maxCount);
}

function filterSafeStandingsCandidates(candidates, maxCount) {
  return unique(
    candidates
      .filter((candidate) => {
        const p = String(candidate?.path || "").toLowerCase();
        const keys = Array.isArray(candidate?.sampleKeys)
          ? candidate.sampleKeys.map((key) => String(key).toLowerCase())
          : [];

        if (!candidate?.path || Number(candidate.score || 0) < 4) return false;

        const pathLooksLikeStandings =
          /standings|standing|table|rank|leaguetable|classification|sarjataulukko|seriestable|phasetables/.test(p);

        const keyLooksLikeStandings =
          keys.some((key) => /rank|position|pos|place|points|pts|played|won|draw|lost|goaldifference/.test(key)) &&
          keys.some((key) => /team|club|name/.test(key));

        const pathLooksLikeMatchOnly =
          /fixture|fixtures|match|matches|result|results|game|games|futurelikefinishedrows|nestedmatchsamples|events|teams|inspectionrows|sampleonlyrows/.test(p) &&
          !pathLooksLikeStandings;

        if (pathLooksLikeMatchOnly) return false;

        return pathLooksLikeStandings || keyLooksLikeStandings;
      })
      .map((candidate) => candidate.path)
  ).slice(0, maxCount);
}

function buildPatchRows(inspectionRows) {
  return inspectionRows.map((row, index) => {
    const fixtureSelectorCandidates = filterSafeFixtureCandidates(row.topFixtureCandidates || [], 10);
    const standingsSelectorCandidates = filterSafeStandingsCandidates(row.topStandingsCandidates || [], 10);

    const seasonStateCandidates = row.topSeasonStateCandidates || [];
    const unsafeSeasonStateCandidateCount = seasonStateCandidates.filter((candidate) =>
      isUnsafeSeasonStateCandidatePath(candidate.path)
    ).length;

    const safeSeasonStateCandidateCount = seasonStateCandidates.filter((candidate) =>
      !isUnsafeSeasonStateCandidatePath(candidate.path)
    ).length;

    const patchStatus =
      fixtureSelectorCandidates.length > 0 || standingsSelectorCandidates.length > 0
        ? "safe_row_selector_patch_ready"
        : "blocked_no_safe_row_selector_candidates";

    return {
      patchRowId: `safe_priority1_row_selector_patch_${String(index + 1).padStart(3, "0")}`,
      family: row.family,
      competitions: row.competitions,
      evidenceFileCount: row.evidenceFileCount,
      patchStatus,
      fixtureSelectorCandidates,
      standingsSelectorCandidates,
      seasonStateSelectorCandidates: [],
      seasonStatePatchBlocked: true,
      seasonStatePatchBlockedReason:
        "season_state_candidates_are_absent_or_not_safe_after_competition_scope_and_match_status_filters",
      unsafeSeasonStateCandidateCount,
      safeSeasonStateCandidateCount,
      expectedEffect:
        "Improve reusable row detection only. Do not promote active/completed/inactive state and do not alter canonical data.",
      applyAllowedNow: false,
      applyRequiresSeparateEngineSourcePatch: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    };
  }).sort((a, b) => {
    if (a.patchStatus !== b.patchStatus) return a.patchStatus.localeCompare(b.patchStatus);
    return a.family.localeCompare(b.family);
  }).map((row, index) => ({
    ...row,
    patchRowId: `safe_priority1_row_selector_patch_${String(index + 1).padStart(3, "0")}`,
    patchSequence: index + 1
  }));
}

function main() {
  const args = parseArgs(process.argv);
  const inspection = readJson(args.inspection);

  const inspectionRows = Array.isArray(inspection.inspectionRows)
    ? inspection.inspectionRows
    : [];

  const patchRows = buildPatchRows(inspectionRows);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-safe-priority1-row-selector-patch-file",
    mode: "source_only_safe_priority1_row_selector_patch_plan_no_season_state_patch_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      inspection: args.inspection,
      inspectionFamilyCount: inspectionRows.length
    },
    summary: {
      patchRowCount: patchRows.length,
      safeRowSelectorPatchReadyCount: patchRows.filter((row) => row.patchStatus === "safe_row_selector_patch_ready").length,
      blockedNoSafeRowSelectorCandidateCount: patchRows.filter((row) => row.patchStatus === "blocked_no_safe_row_selector_candidates").length,
      familiesWithFixtureSelectorCandidatesCount: patchRows.filter((row) => row.fixtureSelectorCandidates.length > 0).length,
      familiesWithStandingsSelectorCandidatesCount: patchRows.filter((row) => row.standingsSelectorCandidates.length > 0).length,
      seasonStatePatchBlockedCount: patchRows.filter((row) => row.seasonStatePatchBlocked).length,
      safeSeasonStatePatchReadyCount: 0,
      engineMutationPerformed: false,
      validationRunPerformed: false,
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
      recommendedNextLane: "apply_safe_priority1_row_selectors_to_reusable_engine_source"
    },
    counts: {
      byFamily: countBy(patchRows, "family"),
      byPatchStatus: countBy(patchRows, "patchStatus")
    },
    guardrails: [
      "This builds a safe row-selector patch plan only.",
      "This deliberately blocks season-state selector patching.",
      "This does not fetch.",
      "This does not search.",
      "This does not write canonical files.",
      "This does not write production files.",
      "This does not assert active, inactive, or completed states.",
      "Patch rows target adapter-family row selectors, not per-league bespoke selectors."
    ],
    patchRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    patchRowCount: output.summary.patchRowCount,
    safeRowSelectorPatchReadyCount: output.summary.safeRowSelectorPatchReadyCount,
    blockedNoSafeRowSelectorCandidateCount: output.summary.blockedNoSafeRowSelectorCandidateCount,
    familiesWithFixtureSelectorCandidatesCount: output.summary.familiesWithFixtureSelectorCandidatesCount,
    familiesWithStandingsSelectorCandidatesCount: output.summary.familiesWithStandingsSelectorCandidatesCount,
    seasonStatePatchBlockedCount: output.summary.seasonStatePatchBlockedCount,
    safeSeasonStatePatchReadyCount: 0,
    engineMutationPerformed: false,
    validationRunPerformed: false,
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
