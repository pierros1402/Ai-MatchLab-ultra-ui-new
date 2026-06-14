#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_VALIDATION_PLAN =
  "data/football-truth/_diagnostics/low-risk-adapter-full-contract-validation-plan-2026-06-14/low-risk-adapter-full-contract-validation-plan-2026-06-14.json";

const DEFAULT_DIAGNOSTICS_ROOT = "data/football-truth/_diagnostics";

const ADAPTER_FILE_HINTS = {
  torneopal: ["torneopal", "palloliitto", "fin.1", "fin.2"],
  loi_ajax: ["loi", "ajax", "league-of-ireland", "irl.1", "irl.2"],
  spfl_opta: ["spfl", "opta", "sco.1", "sco.2"]
};

const EVIDENCE_PATTERNS = {
  fixtureCalendar: [
    "fixtureRows",
    "fixtureRowCount",
    "fixtures",
    "matches",
    "matchRows",
    "firstFixtureDate",
    "lastFixtureDate",
    "upcomingFixtures",
    "resultsRows",
    "resultRows"
  ],
  standingsResults: [
    "standingsRows",
    "standingsRowCount",
    "tableRows",
    "leagueTable",
    "position",
    "points",
    "played",
    "wins",
    "draws",
    "losses"
  ],
  seasonState: [
    "seasonState",
    "seasonStateCandidate",
    "active_current_season",
    "completed_season",
    "currentSeason",
    "seasonStatus",
    "competitionPhase"
  ],
  restartDate: [
    "restartDate",
    "nextSeasonStartDate",
    "nextSeasonRestartDate",
    "seasonStartDate",
    "startDate",
    "calendarStart",
    "newSeason"
  ]
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    validationPlan: DEFAULT_VALIDATION_PLAN,
    diagnosticsRoot: DEFAULT_DIAGNOSTICS_ROOT,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--validation-plan") args.validationPlan = argv[++i];
    else if (arg === "--diagnostics-root") args.diagnosticsRoot = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `low-risk-adapter-validation-board-${args.date}`,
      `low-risk-adapter-validation-board-${args.date}.json`
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

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  }

  walk(root);
  return files.sort();
}

function compactString(value) {
  return JSON.stringify(value).slice(0, 600000);
}

function containsAny(text, patterns) {
  const lower = text.toLowerCase();
  return patterns.some((pattern) => lower.includes(String(pattern).toLowerCase()));
}

function relevantFilesForRow(row, allFiles) {
  const hints = [
    row.competitionSlug,
    row.adapterFamily,
    ...(ADAPTER_FILE_HINTS[row.adapterFamily] || [])
  ].filter(Boolean).map((value) => String(value).toLowerCase());

  return allFiles.filter((filePath) => {
    const normalized = filePath.replaceAll("\\", "/").toLowerCase();
    return hints.some((hint) => normalized.includes(hint));
  });
}

function extractEvidenceFromJson(json) {
  const text = compactString(json);

  return {
    fixtureCalendarEvidenceFound: containsAny(text, EVIDENCE_PATTERNS.fixtureCalendar),
    standingsResultsEvidenceFound: containsAny(text, EVIDENCE_PATTERNS.standingsResults),
    seasonStateEvidenceFound: containsAny(text, EVIDENCE_PATTERNS.seasonState),
    restartDateEvidenceFound: containsAny(text, EVIDENCE_PATTERNS.restartDate),
    detectedFixtureLikeTerms: EVIDENCE_PATTERNS.fixtureCalendar.filter((pattern) => containsAny(text, [pattern])),
    detectedStandingsLikeTerms: EVIDENCE_PATTERNS.standingsResults.filter((pattern) => containsAny(text, [pattern])),
    detectedSeasonStateLikeTerms: EVIDENCE_PATTERNS.seasonState.filter((pattern) => containsAny(text, [pattern])),
    detectedRestartDateLikeTerms: EVIDENCE_PATTERNS.restartDate.filter((pattern) => containsAny(text, [pattern]))
  };
}

function mergeEvidence(evidenceRows) {
  const merged = {
    fixtureCalendarEvidenceFound: false,
    standingsResultsEvidenceFound: false,
    seasonStateEvidenceFound: false,
    restartDateEvidenceFound: false,
    detectedFixtureLikeTerms: [],
    detectedStandingsLikeTerms: [],
    detectedSeasonStateLikeTerms: [],
    detectedRestartDateLikeTerms: []
  };

  for (const evidence of evidenceRows) {
    merged.fixtureCalendarEvidenceFound ||= evidence.fixtureCalendarEvidenceFound;
    merged.standingsResultsEvidenceFound ||= evidence.standingsResultsEvidenceFound;
    merged.seasonStateEvidenceFound ||= evidence.seasonStateEvidenceFound;
    merged.restartDateEvidenceFound ||= evidence.restartDateEvidenceFound;

    merged.detectedFixtureLikeTerms.push(...evidence.detectedFixtureLikeTerms);
    merged.detectedStandingsLikeTerms.push(...evidence.detectedStandingsLikeTerms);
    merged.detectedSeasonStateLikeTerms.push(...evidence.detectedSeasonStateLikeTerms);
    merged.detectedRestartDateLikeTerms.push(...evidence.detectedRestartDateLikeTerms);
  }

  for (const key of [
    "detectedFixtureLikeTerms",
    "detectedStandingsLikeTerms",
    "detectedSeasonStateLikeTerms",
    "detectedRestartDateLikeTerms"
  ]) {
    merged[key] = [...new Set(merged[key])].sort();
  }

  return merged;
}

function buildReviewRow(row, index, allFiles) {
  const files = relevantFilesForRow(row, allFiles);

  const inspected = [];
  for (const filePath of files) {
    const json = readJsonIfSmall(filePath);
    if (!json) continue;

    inspected.push({
      filePath,
      ...extractEvidenceFromJson(json)
    });
  }

  const merged = mergeEvidence(inspected);

  const fixtureCalendarSignalFound = merged.fixtureCalendarEvidenceFound;
  const standingsResultsSignalFound = merged.standingsResultsEvidenceFound;
  const seasonStateSignalFound = merged.seasonStateEvidenceFound;
  const restartDateSignalFound = merged.restartDateEvidenceFound;

  const structuredFixtureCalendarValidated = false;
  const structuredStandingsResultsValidated = false;
  const structuredSeasonStateValidated = false;
  const structuredRestartDateValidated = false;
  const nextCheckPolicyDerivable = false;
  const fullContractSatisfied = false;

  const rejectionReasons = [
    fixtureCalendarSignalFound ? "fixture_calendar_signal_found_but_not_structured_validated" : "fixture_calendar_evidence_not_found_in_existing_outputs",
    standingsResultsSignalFound ? "standings_results_signal_found_but_not_structured_validated" : "standings_results_evidence_not_found_in_existing_outputs",
    seasonStateSignalFound ? "season_state_signal_found_but_not_structured_validated" : "season_state_evidence_not_found_in_existing_outputs",
    restartDateSignalFound ? "restart_date_signal_found_but_not_structured_validated" : "next_season_restart_date_evidence_not_found_in_existing_outputs",
    "next_check_policy_not_derivable_without_structured_season_state_and_restart_date"
  ].filter(Boolean);

  let reviewStatus = "rejected_missing_full_contract_evidence";
  if (fixtureCalendarSignalFound || standingsResultsSignalFound || seasonStateSignalFound || restartDateSignalFound) {
    reviewStatus = "signal_found_requires_structured_validation";
  }

  return {
    reviewRowId: `low_risk_adapter_validation_${String(index + 1).padStart(3, "0")}`,
    competitionSlug: row.competitionSlug,
    adapterFamily: row.adapterFamily,
    adapterValidationJob: row.adapterValidationJob,
    validationPlanStatus: row.validationPlanStatus,

    inspectedFileCount: inspected.length,
    inspectedFiles: inspected.map((item) => item.filePath),

    fixtureCalendarSignalFound,
    standingsResultsSignalFound,
    seasonStateSignalFound,
    restartDateSignalFound,
    structuredFixtureCalendarValidated,
    structuredStandingsResultsValidated,
    structuredSeasonStateValidated,
    structuredRestartDateValidated,
    nextCheckPolicyDerivable,
    fullContractSatisfied,
    reviewStatus,
    rejectionReasons,

    detectedFixtureLikeTerms: merged.detectedFixtureLikeTerms,
    detectedStandingsLikeTerms: merged.detectedStandingsLikeTerms,
    detectedSeasonStateLikeTerms: merged.detectedSeasonStateLikeTerms,
    detectedRestartDateLikeTerms: merged.detectedRestartDateLikeTerms,

    activeAsserted: false,
    inactiveAsserted: false,
    completedAsserted: false,
    canonicalWriteEligibleNow: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const validationPlan = readJson(args.validationPlan);
  const validationRows = Array.isArray(validationPlan.validationRows) ? validationPlan.validationRows : [];
  const allFiles = walkJsonFiles(args.diagnosticsRoot);

  const reviewRows = validationRows.map((row, index) => buildReviewRow(row, index, allFiles));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-low-risk-adapter-validation-board-file",
    mode: "source_only_existing_diagnostic_adapter_output_validation_board_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      validationPlan: args.validationPlan,
      diagnosticsRoot: args.diagnosticsRoot,
      validationRowCount: validationRows.length,
      scannedDiagnosticsJsonFileCount: allFiles.length
    },
    summary: {
      reviewRowCount: reviewRows.length,
      acceptedFullContractCandidateCount: 0,
      signalFoundRequiresStructuredValidationCount: reviewRows.filter((row) => row.reviewStatus === "signal_found_requires_structured_validation").length,
      rejectedMissingFullContractEvidenceCount: reviewRows.filter((row) => row.reviewStatus === "rejected_missing_full_contract_evidence").length,
      fixtureCalendarSignalFoundCount: reviewRows.filter((row) => row.fixtureCalendarSignalFound).length,
      standingsResultsSignalFoundCount: reviewRows.filter((row) => row.standingsResultsSignalFound).length,
      seasonStateSignalFoundCount: reviewRows.filter((row) => row.seasonStateSignalFound).length,
      restartDateSignalFoundCount: reviewRows.filter((row) => row.restartDateSignalFound).length,
      structuredFixtureCalendarValidatedCount: 0,
      structuredStandingsResultsValidatedCount: 0,
      structuredSeasonStateValidatedCount: 0,
      structuredRestartDateValidatedCount: 0,
      nextCheckPolicyDerivableCount: reviewRows.filter((row) => row.nextCheckPolicyDerivable).length,
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
      recommendedNextLane: "inspect_low_risk_adapter_validation_gaps_then_build_targeted_restart_date_source_lane"
    },
    counts: {
      byAdapterFamily: countBy(reviewRows, "adapterFamily"),
      byReviewStatus: countBy(reviewRows, "reviewStatus")
    },
    guardrails: [
      "This board only inspects existing local diagnostic JSON files.",
      "This board does not fetch.",
      "This board does not search.",
      "This board does not write canonical files.",
      "This board does not write production files.",
      "This board records local diagnostic evidence signals only; signals are not structured validation.",
      "Full contract requires structured fixture/calendar, standings/results, season state, restart date, and nextCheck policy values.",
      "No active/inactive/completed state is asserted by this board.",
      "Restart-date evidence is required before inactive/completed nextCheck policy can be derived."
    ],
    reviewRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    reviewRowCount: output.summary.reviewRowCount,
    acceptedFullContractCandidateCount: output.summary.acceptedFullContractCandidateCount,
    signalFoundRequiresStructuredValidationCount: output.summary.signalFoundRequiresStructuredValidationCount,
    rejectedMissingFullContractEvidenceCount: output.summary.rejectedMissingFullContractEvidenceCount,
    fixtureCalendarSignalFoundCount: output.summary.fixtureCalendarSignalFoundCount,
    standingsResultsSignalFoundCount: output.summary.standingsResultsSignalFoundCount,
    seasonStateSignalFoundCount: output.summary.seasonStateSignalFoundCount,
    restartDateSignalFoundCount: output.summary.restartDateSignalFoundCount,
    structuredFixtureCalendarValidatedCount: output.summary.structuredFixtureCalendarValidatedCount,
    structuredStandingsResultsValidatedCount: output.summary.structuredStandingsResultsValidatedCount,
    structuredSeasonStateValidatedCount: output.summary.structuredSeasonStateValidatedCount,
    structuredRestartDateValidatedCount: output.summary.structuredRestartDateValidatedCount,
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
