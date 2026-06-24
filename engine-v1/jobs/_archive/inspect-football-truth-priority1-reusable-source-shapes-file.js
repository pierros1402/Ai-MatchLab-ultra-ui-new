#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_PRIORITY1_APPLY =
  "data/football-truth/_diagnostics/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/priority1-reusable-source-shape-selector-inspection-2026-06-14/priority1-reusable-source-shape-selector-inspection-2026-06-14.json";

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
  "reusable-adapter-family-contract-validator-priority1-apply",
  "reusable-priority1-selector-gap-review",
  "priority1-family-selector-config-patch",
  "priority1-reusable-source-shape-selector-inspection"
];

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

function normalizedPath(filePath) {
  return String(filePath).replaceAll("\\", "/").toLowerCase();
}

function isDerivedDiagnosticFile(filePath) {
  const normalized = normalizedPath(filePath);
  return DERIVED_DIAGNOSTIC_BLOCKLIST_HINTS.some((hint) => normalized.includes(hint.toLowerCase()));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectArrays(root) {
  const arrays = [];

  function visit(value, currentPath) {
    if (Array.isArray(value)) {
      const sample = value.slice(0, 5);
      arrays.push({
        path: currentPath,
        length: value.length,
        sample,
        sampleKeys: unique(sample.flatMap((item) => isObject(item) ? Object.keys(item) : [])),
        sampleText: JSON.stringify(sample).slice(0, 500)
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
    }
  }

  visit(root, "");
  return arrays;
}

function collectScalars(root) {
  const scalars = [];

  function visit(value, currentPath) {
    if (Array.isArray(value)) {
      value.slice(0, 20).forEach((item, index) => visit(item, `${currentPath}[${index}]`));
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
        value: String(value).slice(0, 200)
      });
    }
  }

  visit(root, "");
  return scalars;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function scoreFixtureArray(arrayEntry) {
  const pathText = arrayEntry.path.toLowerCase();
  const sampleText = String(arrayEntry.sampleText).toLowerCase();
  const keys = arrayEntry.sampleKeys.map((key) => key.toLowerCase());

  let score = 0;
  if (/fixture|fixtures|match|matches|result|results|game|games/.test(pathText)) score += 3;
  if (keys.some((key) => /home|away|team|club|opponent/.test(key))) score += 2;
  if (keys.some((key) => /date|time|kickoff|start/.test(key))) score += 2;
  if (keys.some((key) => /score|goal|status/.test(key))) score += 1;
  if (/home|away|team|club|date|kickoff|score|status/.test(sampleText)) score += 1;
  if (arrayEntry.length > 0) score += 1;

  return score;
}

function scoreStandingsArray(arrayEntry) {
  const pathText = arrayEntry.path.toLowerCase();
  const sampleText = String(arrayEntry.sampleText).toLowerCase();
  const keys = arrayEntry.sampleKeys.map((key) => key.toLowerCase());

  let score = 0;
  if (/standing|standings|table|rank|leaguetable|classification|sarjataulukko|seriestable/.test(pathText)) score += 3;
  if (keys.some((key) => /team|club|name/.test(key))) score += 2;
  if (keys.some((key) => /rank|position|pos|place/.test(key))) score += 2;
  if (keys.some((key) => /points|pts|played|won|draw|lost|goaldifference/.test(key))) score += 2;
  if (/team|club|rank|position|points|played|pts/.test(sampleText)) score += 1;
  if (arrayEntry.length > 0) score += 1;

  return score;
}

function scoreSeasonStateScalar(scalarEntry, familyCompetitions = []) {
  const pathText = scalarEntry.path.toLowerCase();
  const valueText = String(scalarEntry.value).toLowerCase();

  const isForbiddenMatchLevel =
    /(fixture|fixtures|match|matches|result|results|game|games|futurelikefinishedrows|normalizedresultrows|normalizedfixturerows).*status/i.test(pathText) ||
    (/\.status$/i.test(pathText) && /(fixture|match|result|game|row)/i.test(pathText)) ||
    /normalizedstatus/i.test(pathText);

  if (isForbiddenMatchLevel) return 0;

  const referencesDifferentCompetition = /\b[a-z]{3}\.\d\b/i.test(pathText) &&
    !familyCompetitions.some((slug) => pathText.includes(String(slug).toLowerCase()));

  if (referencesDifferentCompetition) return 0;

  const isStrictSeasonLevelPath =
    /seasonstate|seasonstatus|competitionphase|season\.state|season\.status|competition\.state|competition\.status|calendar\.season|metadata\.season/i.test(pathText);

  if (!isStrictSeasonLevelPath) return 0;

  let score = 0;
  if (isStrictSeasonLevelPath) score += 4;
  if (/active|current|live|complete|completed|inactive|finished|closed|ended/i.test(valueText)) score += 3;
  if (/season|competition|calendar|metadata|tournament|series/i.test(pathText)) score += 1;

  return score;
}

function selectTop(entries, scoreFn, limit = 8) {
  return entries
    .map((entry) => ({ ...entry, score: scoreFn(entry) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.length !== a.length) return (b.length || 0) - (a.length || 0);
      return a.path.localeCompare(b.path);
    })
    .slice(0, limit);
}

function buildFamilyInspectionRows(priority1Apply) {
  const validationRows = Array.isArray(priority1Apply.validationRows) ? priority1Apply.validationRows : [];
  const evidenceRows = Array.isArray(priority1Apply.evidenceRows) ? priority1Apply.evidenceRows : [];
  const families = unique(validationRows.map((row) => row.adapterFamily));
  const inspectionRows = [];

  for (const family of families) {
    const familyValidationRows = validationRows.filter((row) => row.adapterFamily === family);
    const evidenceFiles = unique(
      evidenceRows
        .filter((row) => row.adapterFamily === family)
        .map((row) => row.filePath)
        .filter((filePath) => !isDerivedDiagnosticFile(filePath))
    );

    const fixtureCandidates = [];
    const standingsCandidates = [];
    const seasonStateCandidates = [];

    for (const filePath of evidenceFiles) {
      const json = readJsonIfPossible(filePath);
      if (!json) continue;

      const arrays = collectArrays(json);
      const scalars = collectScalars(json);

      for (const candidate of selectTop(arrays, scoreFixtureArray, 5)) {
        fixtureCandidates.push({
          filePath,
          path: candidate.path,
          length: candidate.length,
          score: candidate.score,
          sampleKeys: candidate.sampleKeys
        });
      }

      for (const candidate of selectTop(arrays, scoreStandingsArray, 5)) {
        standingsCandidates.push({
          filePath,
          path: candidate.path,
          length: candidate.length,
          score: candidate.score,
          sampleKeys: candidate.sampleKeys
        });
      }

      for (const candidate of selectTop(scalars, (entry) => scoreSeasonStateScalar(entry, familyValidationRows.map((row) => row.competitionSlug)), 5)) {
        seasonStateCandidates.push({
          filePath,
          path: candidate.path,
          value: candidate.value,
          score: candidate.score
        });
      }
    }

    const familyCompetitionSlugs = familyValidationRows.map((row) => row.competitionSlug);

    const topFixtureCandidates = selectUniquePathCandidates(fixtureCandidates, 10);
    const topStandingsCandidates = selectUniquePathCandidates(standingsCandidates, 10);
    const topSeasonStateCandidates = selectUniquePathCandidates(
      seasonStateCandidates.filter((candidate) => {
        const p = String(candidate.path).toLowerCase();
        return !(/\b[a-z]{3}\.\d\b/i.test(p) && !familyCompetitionSlugs.some((slug) => p.includes(String(slug).toLowerCase())));
      }),
      10
    );

    const missingFixture = familyValidationRows.some((row) => !row.structuredFixtureOrResultRowsPresent);
    const missingStandings = familyValidationRows.some((row) => !row.structuredStandingsRowsPresent);
    const missingSeasonState = familyValidationRows.some((row) => !row.structuredSeasonStateValidated);

    inspectionRows.push({
      family,
      competitions: familyValidationRows.map((row) => row.competitionSlug).sort(),
      evidenceFileCount: evidenceFiles.length,
      validationCurrentState: {
        missingFixture,
        missingStandings,
        missingSeasonState,
        fullContractSatisfiedCount: familyValidationRows.filter((row) => row.fullContractSatisfied).length
      },
      topFixtureCandidates,
      topStandingsCandidates,
      topSeasonStateCandidates,
      recommendedSelectorPatch: {
        fixtureResultRows: missingFixture ? topFixtureCandidates.map((row) => row.path) : [],
        standingsRows: missingStandings ? topStandingsCandidates.map((row) => row.path) : [],
        seasonState: missingSeasonState ? topSeasonStateCandidates.map((row) => row.path) : []
      },
      selectorPatchConfidence: classifyConfidence({
        missingFixture,
        missingStandings,
        missingSeasonState,
        topFixtureCandidates,
        topStandingsCandidates,
        topSeasonStateCandidates
      }),
      nextReusableStep: "review_source_shape_candidates_then_patch_family_selectors",
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    });
  }

  return inspectionRows;
}

function selectUniquePathCandidates(candidates, limit) {
  const byPath = new Map();

  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (!byPath.has(candidate.path)) byPath.set(candidate.path, candidate);
  }

  return [...byPath.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.length || 0) !== (a.length || 0)) return (b.length || 0) - (a.length || 0);
      return a.path.localeCompare(b.path);
    })
    .slice(0, limit);
}

function classifyConfidence({
  missingFixture,
  missingStandings,
  missingSeasonState,
  topFixtureCandidates,
  topStandingsCandidates,
  topSeasonStateCandidates
}) {
  const required = [];
  if (missingFixture) required.push(topFixtureCandidates.length > 0);
  if (missingStandings) required.push(topStandingsCandidates.length > 0);
  if (missingSeasonState) required.push(topSeasonStateCandidates.length > 0);

  if (required.length === 0) return "no_selector_patch_needed";
  if (required.every(Boolean)) return "candidate_paths_available_for_all_missing_selector_types";
  if (required.some(Boolean)) return "partial_candidate_paths_available_needs_family_source_review";
  return "no_candidate_paths_found_needs_raw_source_or_adapter_review";
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
  const priority1Apply = readJson(args.priority1Apply);
  const inspectionRows = buildFamilyInspectionRows(priority1Apply);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "inspect-football-truth-priority1-reusable-source-shapes-file",
    mode: "source_only_priority1_source_shape_selector_inspection_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      priority1Apply: args.priority1Apply,
      validationRowCount: Array.isArray(priority1Apply.validationRows) ? priority1Apply.validationRows.length : 0,
      evidenceRowCount: Array.isArray(priority1Apply.evidenceRows) ? priority1Apply.evidenceRows.length : 0
    },
    summary: {
      inspectionFamilyCount: inspectionRows.length,
      familiesWithFixtureCandidatesCount: inspectionRows.filter((row) => row.topFixtureCandidates.length > 0).length,
      familiesWithStandingsCandidatesCount: inspectionRows.filter((row) => row.topStandingsCandidates.length > 0).length,
      familiesWithSeasonStateCandidatesCount: inspectionRows.filter((row) => row.topSeasonStateCandidates.length > 0).length,
      familiesWithAllMissingSelectorCandidatesCount: inspectionRows.filter((row) => row.selectorPatchConfidence === "candidate_paths_available_for_all_missing_selector_types").length,
      familiesWithPartialSelectorCandidatesCount: inspectionRows.filter((row) => row.selectorPatchConfidence === "partial_candidate_paths_available_needs_family_source_review").length,
      familiesWithNoSelectorCandidatesCount: inspectionRows.filter((row) => row.selectorPatchConfidence === "no_candidate_paths_found_needs_raw_source_or_adapter_review").length,
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
      recommendedNextLane: "patch_priority1_family_selectors_from_source_shape_candidates_if_confident"
    },
    counts: {
      byFamily: countBy(inspectionRows, "family"),
      bySelectorPatchConfidence: countBy(inspectionRows, "selectorPatchConfidence")
    },
    guardrails: [
      "This inspects existing evidence source shapes only.",
      "This does not fetch.",
      "This does not search.",
      "This does not write canonical files.",
      "This does not write production files.",
      "Derived diagnostic files are blocked from source-shape evidence.",
      "Recommended selector patches are family-level, not league-specific."
    ],
    inspectionRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    inspectionFamilyCount: output.summary.inspectionFamilyCount,
    familiesWithFixtureCandidatesCount: output.summary.familiesWithFixtureCandidatesCount,
    familiesWithStandingsCandidatesCount: output.summary.familiesWithStandingsCandidatesCount,
    familiesWithSeasonStateCandidatesCount: output.summary.familiesWithSeasonStateCandidatesCount,
    familiesWithAllMissingSelectorCandidatesCount: output.summary.familiesWithAllMissingSelectorCandidatesCount,
    familiesWithPartialSelectorCandidatesCount: output.summary.familiesWithPartialSelectorCandidatesCount,
    familiesWithNoSelectorCandidatesCount: output.summary.familiesWithNoSelectorCandidatesCount,
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
