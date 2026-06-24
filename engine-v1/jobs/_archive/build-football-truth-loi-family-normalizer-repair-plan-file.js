#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_APPLY =
  "data/football-truth/_diagnostics/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14.json";

const DEFAULT_COMPARISON =
  "data/football-truth/_diagnostics/reusable-priority1-post-patch-comparison-board-2026-06-14/reusable-priority1-post-patch-comparison-board-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/loi-family-normalizer-repair-plan-2026-06-14/loi-family-normalizer-repair-plan-2026-06-14.json";

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    apply: DEFAULT_APPLY,
    comparison: DEFAULT_COMPARISON,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--apply") args.apply = argv[++i];
    else if (arg === "--comparison") args.comparison = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
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

function collectEvidenceFilePaths(apply) {
  const evidenceRows = Array.isArray(apply.evidenceRows) ? apply.evidenceRows : [];

  return unique(
    evidenceRows
      .filter((row) => row.adapterFamily === "loi_ajax" || row.family === "loi_ajax")
      .map((row) => row.filePath || row.path || row.sourceFile || row.evidenceFile)
      .filter((filePath) => filePath && !String(filePath).includes("reusable-adapter-family-contract-validator"))
      .filter((filePath) => filePath && !String(filePath).includes("state-dependent-contract-board"))
      .filter((filePath) => filePath && !String(filePath).includes("low-risk-adapter"))
  );
}

function sampleKeysFromArray(value) {
  if (!Array.isArray(value)) return [];

  const objectSample = value.find((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
  if (!objectSample) return [];

  return Object.keys(objectSample).sort();
}

function walkArrays(value, currentPath = "", out = []) {
  if (Array.isArray(value)) {
    out.push({
      path: currentPath || "__root__",
      length: value.length,
      sampleKeys: sampleKeysFromArray(value)
    });

    value.slice(0, 3).forEach((entry, index) => {
      if (entry && typeof entry === "object") {
        walkArrays(entry, `${currentPath}[${index}]`, out);
      }
    });

    return out;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      walkArrays(child, nextPath, out);
    }
  }

  return out;
}

function scoreLoiFixtureCandidate(arrayInfo) {
  const p = String(arrayInfo.path).toLowerCase();
  const keys = arrayInfo.sampleKeys.map((key) => String(key).toLowerCase());

  if (arrayInfo.length <= 0) return 0;
  if (/diagnostic|audit|sample|summary|pagination|request|task|error/.test(p)) return 0;

  let score = 0;

  if (/fixture|fixtures|match|matches|result|results|game|games/.test(p)) score += 4;
  if (keys.some((key) => /home|hometeam|teamhome|host/.test(key))) score += 2;
  if (keys.some((key) => /away|awayteam|teamaway|guest/.test(key))) score += 2;
  if (keys.some((key) => /date|kickoff|time|start/.test(key))) score += 2;
  if (keys.some((key) => /score|goals|status|result/.test(key))) score += 1;

  return score;
}

function scoreLoiStandingsCandidate(arrayInfo) {
  const p = String(arrayInfo.path).toLowerCase();
  const keys = arrayInfo.sampleKeys.map((key) => String(key).toLowerCase());

  if (arrayInfo.length <= 0) return 0;
  if (/diagnostic|audit|sample|summary|pagination|request|task|error/.test(p)) return 0;
  if (/fixture|fixtures|match|matches|result|results|game|games/.test(p) && !/table|standing|rank/.test(p)) return 0;

  let score = 0;

  if (/standing|standings|table|leagueTable|rank|classification/i.test(arrayInfo.path)) score += 4;
  if (keys.some((key) => /rank|position|pos|place/.test(key))) score += 2;
  if (keys.some((key) => /team|club|name/.test(key))) score += 2;
  if (keys.some((key) => /points|pts|played|won|draw|lost|goaldifference|gd/.test(key))) score += 2;

  return score;
}

function topCandidates(arrays, scorer, maxCount = 8) {
  return arrays
    .map((arrayInfo) => ({
      ...arrayInfo,
      score: scorer(arrayInfo)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.length !== a.length) return b.length - a.length;
      return a.path.localeCompare(b.path);
    })
    .slice(0, maxCount);
}

function buildEvidenceInspectionRows(filePaths) {
  return filePaths.map((filePath, index) => {
    const json = tryReadJson(filePath);
    const exists = Boolean(json);
    const arrays = exists ? walkArrays(json) : [];

    const fixtureCandidates = topCandidates(arrays, scoreLoiFixtureCandidate);
    const standingsCandidates = topCandidates(arrays, scoreLoiStandingsCandidate);

    let repairFinding = "no_readable_evidence_file";
    if (exists && fixtureCandidates.length > 0 && standingsCandidates.length > 0) {
      repairFinding = "direct_fixture_and_standings_candidates_found";
    } else if (exists && fixtureCandidates.length > 0) {
      repairFinding = "direct_fixture_candidates_found_standings_missing";
    } else if (exists && standingsCandidates.length > 0) {
      repairFinding = "direct_standings_candidates_found_fixture_missing";
    } else if (exists) {
      repairFinding = "no_safe_direct_row_candidates_found";
    }

    return {
      evidenceInspectionRowId: `loi_evidence_shape_${String(index + 1).padStart(3, "0")}`,
      filePath,
      exists,
      arrayCount: arrays.length,
      fixtureCandidateCount: fixtureCandidates.length,
      standingsCandidateCount: standingsCandidates.length,
      repairFinding,
      topFixtureCandidates: fixtureCandidates,
      topStandingsCandidates: standingsCandidates
    };
  });
}

function buildCompetitionRows(comparison) {
  const rows = Array.isArray(comparison.comparisonRows) ? comparison.comparisonRows : [];

  return rows
    .filter((row) => row.adapterFamily === "loi_ajax")
    .map((row, index) => ({
      competitionRepairRowId: `loi_competition_repair_${String(index + 1).padStart(3, "0")}`,
      competitionSlug: row.competitionSlug,
      adapterFamily: row.adapterFamily,
      postPatchStatus: row.postPatchStatus,
      structuredFixtureOrResultRowsPresent: row.structuredFixtureOrResultRowsPresent,
      structuredStandingsRowsPresent: row.structuredStandingsRowsPresent,
      structuredSeasonStateValidated: row.structuredSeasonStateValidated,
      contractState: row.contractState,
      stateConfidence: row.stateConfidence,
      missingReasons: row.missingReasons || [],
      repairScope: "family_normalizer_or_family_selector_only",
      canonicalWriteEligibleNow: false,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      productionWrite: false
    }));
}

function main() {
  const args = parseArgs(process.argv);

  const apply = readJson(args.apply);
  const comparison = readJson(args.comparison);

  const evidenceFilePaths = collectEvidenceFilePaths(apply);
  const evidenceInspectionRows = buildEvidenceInspectionRows(evidenceFilePaths);
  const competitionRows = buildCompetitionRows(comparison);

  const anyFixtureCandidate = evidenceInspectionRows.some((row) => row.fixtureCandidateCount > 0);
  const anyStandingsCandidate = evidenceInspectionRows.some((row) => row.standingsCandidateCount > 0);

  let recommendedRepair = "repair_loi_ajax_normalizer_to_emit_direct_fixture_and_standings_rows_from_existing_source_payload";
  if (anyFixtureCandidate && anyStandingsCandidate) {
    recommendedRepair = "patch_loi_ajax_family_selectors_or_normalizer_from_safe_direct_row_candidates";
  } else if (anyFixtureCandidate && !anyStandingsCandidate) {
    recommendedRepair = "patch_loi_ajax_fixture_rows_then_seek_family_standings_source_or_normalizer";
  } else if (!anyFixtureCandidate && anyStandingsCandidate) {
    recommendedRepair = "patch_loi_ajax_standings_rows_then_repair_family_fixture_normalizer";
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-loi-family-normalizer-repair-plan-file",
    mode: "source_only_loi_family_normalizer_repair_plan_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      apply: args.apply,
      comparison: args.comparison,
      evidenceFileCount: evidenceFilePaths.length
    },
    summary: {
      competitionRepairRowCount: competitionRows.length,
      evidenceInspectionRowCount: evidenceInspectionRows.length,
      evidenceFilesWithFixtureCandidatesCount: evidenceInspectionRows.filter((row) => row.fixtureCandidateCount > 0).length,
      evidenceFilesWithStandingsCandidatesCount: evidenceInspectionRows.filter((row) => row.standingsCandidateCount > 0).length,
      evidenceFilesWithNoSafeDirectRowCandidatesCount: evidenceInspectionRows.filter((row) => row.repairFinding === "no_safe_direct_row_candidates_found").length,
      loiSeasonStateAlreadyValidatedCount: competitionRows.filter((row) => row.structuredSeasonStateValidated).length,
      loiRowsStillMissingCount: competitionRows.filter((row) => !row.structuredFixtureOrResultRowsPresent || !row.structuredStandingsRowsPresent).length,
      normalizerRepairRequired: true,
      selectorOnlyRepairSafeNow: anyFixtureCandidate && anyStandingsCandidate,
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
      recommendedRepair,
      recommendedNextLane: "repair_loi_ajax_family_normalizer_or_selectors_source_only_then_rerun_priority1_apply"
    },
    counts: {
      byCompetitionPostPatchStatus: countBy(competitionRows, "postPatchStatus"),
      byEvidenceRepairFinding: countBy(evidenceInspectionRows, "repairFinding")
    },
    guardrails: [
      "This is a LOI family-level repair plan only.",
      "This does not fetch.",
      "This does not search.",
      "This does not write canonical files.",
      "This does not write production files.",
      "This does not assert active/inactive/completed truth.",
      "This does not create per-league bespoke repair instructions.",
      "LOI season-state presence is treated as validator state only; rows remain required before any full contract."
    ],
    competitionRows,
    evidenceInspectionRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    competitionRepairRowCount: output.summary.competitionRepairRowCount,
    evidenceInspectionRowCount: output.summary.evidenceInspectionRowCount,
    evidenceFilesWithFixtureCandidatesCount: output.summary.evidenceFilesWithFixtureCandidatesCount,
    evidenceFilesWithStandingsCandidatesCount: output.summary.evidenceFilesWithStandingsCandidatesCount,
    evidenceFilesWithNoSafeDirectRowCandidatesCount: output.summary.evidenceFilesWithNoSafeDirectRowCandidatesCount,
    loiSeasonStateAlreadyValidatedCount: output.summary.loiSeasonStateAlreadyValidatedCount,
    loiRowsStillMissingCount: output.summary.loiRowsStillMissingCount,
    normalizerRepairRequired: output.summary.normalizerRepairRequired,
    selectorOnlyRepairSafeNow: output.summary.selectorOnlyRepairSafeNow,
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
    recommendedRepair: output.summary.recommendedRepair,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main();
