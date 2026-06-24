#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_SELECTOR_GAP_REVIEW =
  "data/football-truth/_diagnostics/reusable-priority1-selector-gap-review-2026-06-14/reusable-priority1-selector-gap-review-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/priority1-family-selector-config-patch-2026-06-14/priority1-family-selector-config-patch-2026-06-14.json";

const PATCH_TEMPLATES = {
  loi_ajax: {
    patchPriority: 1,
    patchClass: "family_selector_config_patch",
    targetEngineFamily: "loi_ajax",
    selectorConfigPatch: {
      fixtureResultRows: {
        action: "add_candidate_selector_paths",
        candidatePaths: [
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
        requiredValidation: [
          "array length > 0",
          "row contains home/away/team fields",
          "row contains date/time/kickoff or status/score fields"
        ]
      },
      standingsRows: {
        action: "add_candidate_selector_paths",
        candidatePaths: [
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
        requiredValidation: [
          "array length > 0",
          "row contains team field",
          "row contains position/rank and points/played fields"
        ]
      },
      seasonState: {
        action: "keep_existing_season_level_selector_only",
        candidatePaths: [
          "seasonState",
          "seasonStatus",
          "competitionPhase",
          "season.state",
          "season.status",
          "competition.state",
          "competition.status"
        ],
        forbiddenPaths: [
          "fixtures.status",
          "fixtureRows.status",
          "matches.status",
          "matchRows.status",
          "results.status",
          "resultRows.status"
        ]
      }
    },
    expectedEffect: "LOI active season state remains detected, while fixture/result and standings rows can be detected from family-level AJAX payloads if present."
  },
  spfl_opta: {
    patchPriority: 1,
    patchClass: "family_selector_config_patch",
    targetEngineFamily: "spfl_opta",
    selectorConfigPatch: {
      fixtureResultRows: {
        action: "keep_existing_rows_detected",
        candidatePaths: [
          "fixtureRows",
          "resultRows",
          "matches",
          "fixtures",
          "data.matches",
          "data.fixtures"
        ]
      },
      standingsRows: {
        action: "keep_existing_rows_detected",
        candidatePaths: [
          "standingsRows",
          "tableRows",
          "leagueTable",
          "standings",
          "tables"
        ]
      },
      seasonState: {
        action: "add_calendar_or_competition_metadata_selector_candidates",
        candidatePaths: [
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
        requiredValidation: [
          "path must be season/competition/calendar-level",
          "path must not be match/fixture/result-level",
          "active/current/live value can validate active season",
          "completed/finished/inactive/closed value can validate completed_or_inactive only with restart rule"
        ],
        forbiddenPaths: [
          "fixtures.status",
          "fixtureRows.status",
          "matches.status",
          "matchRows.status",
          "results.status",
          "resultRows.status"
        ]
      }
    },
    expectedEffect: "SPFL rows and standings stay detected; season state remains blocked until a real season-level SPFL/Opta source path is found."
  },
  torneopal: {
    patchPriority: 2,
    patchClass: "family_selector_config_patch",
    targetEngineFamily: "torneopal",
    selectorConfigPatch: {
      fixtureResultRows: {
        action: "keep_existing_fixture_signal_detected",
        candidatePaths: [
          "fixtureRows",
          "resultRows",
          "matches",
          "fixtures",
          "games",
          "data.matches",
          "data.fixtures"
        ]
      },
      standingsRows: {
        action: "add_candidate_selector_paths",
        candidatePaths: [
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
        requiredValidation: [
          "array length > 0",
          "row contains team field",
          "row contains rank/position and points/played fields"
        ]
      },
      seasonState: {
        action: "add_season_level_selector_candidates_but_keep_future_fixtures_signal_only",
        candidatePaths: [
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
        forbiddenPaths: [
          "fixtures.status",
          "fixtureRows.status",
          "matches.status",
          "matchRows.status",
          "results.status",
          "resultRows.status"
        ]
      }
    },
    expectedEffect: "Torneopal can progress only if standings and season-level state are found; future fixture rows remain signal-only."
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    selectorGapReview: DEFAULT_SELECTOR_GAP_REVIEW,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--selector-gap-review") args.selectorGapReview = argv[++i];
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

function buildPatchRows(familySummaries) {
  return familySummaries.map((familySummary, index) => {
    const template = PATCH_TEMPLATES[familySummary.family];

    if (!template) {
      return {
        patchRowId: `priority1_family_selector_patch_${String(index + 1).padStart(3, "0")}`,
        family: familySummary.family,
        competitions: familySummary.competitions,
        patchStatus: "blocked_missing_patch_template",
        patchPriority: 99,
        reusableRepairClass: familySummary.reusableRepairClass,
        selectorConfigPatch: null,
        expectedEffect: "Missing patch template; do not perform bespoke league repair.",
        applyAllowedNow: false,
        fetchAllowedNow: false,
        searchAllowedNow: false,
        canonicalWriteEligibleNow: false,
        productionWrite: false
      };
    }

    return {
      patchRowId: `priority1_family_selector_patch_${String(index + 1).padStart(3, "0")}`,
      family: familySummary.family,
      competitions: familySummary.competitions,
      observedPattern: familySummary.observedPattern,
      reusableRepairClass: familySummary.reusableRepairClass,
      patchStatus: "selector_config_patch_ready_for_engine_source_update",
      patchPriority: template.patchPriority,
      patchClass: template.patchClass,
      targetEngineFamily: template.targetEngineFamily,
      selectorConfigPatch: template.selectorConfigPatch,
      expectedEffect: template.expectedEffect,
      selectorRepairPriorityFromReview: familySummary.selectorRepairPriority,
      sourceEvidenceNeeded: familySummary.sourceEvidenceNeeded,
      sourceFileHints: familySummary.sourceFileHints,
      applyAllowedNow: false,
      applyRequiresExplicitSourceUpdate: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    };
  }).sort((a, b) => {
    if (a.patchPriority !== b.patchPriority) return a.patchPriority - b.patchPriority;
    return a.family.localeCompare(b.family);
  }).map((row, index) => ({
    ...row,
    patchRowId: `priority1_family_selector_patch_${String(index + 1).padStart(3, "0")}`,
    patchSequence: index + 1
  }));
}

function main() {
  const args = parseArgs(process.argv);
  const selectorGapReview = readJson(args.selectorGapReview);

  const familySummaries = Array.isArray(selectorGapReview.familySummaries)
    ? selectorGapReview.familySummaries
    : [];

  const patchRows = buildPatchRows(familySummaries);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-priority1-family-selector-config-patch-file",
    mode: "source_only_priority1_family_selector_config_patch_plan_no_engine_mutation_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      selectorGapReview: args.selectorGapReview,
      familySummaryCount: familySummaries.length
    },
    summary: {
      patchRowCount: patchRows.length,
      patchReadyCount: patchRows.filter((row) => row.patchStatus === "selector_config_patch_ready_for_engine_source_update").length,
      blockedMissingPatchTemplateCount: patchRows.filter((row) => row.patchStatus === "blocked_missing_patch_template").length,
      priority1PatchCount: patchRows.filter((row) => row.patchPriority === 1).length,
      priority2PatchCount: patchRows.filter((row) => row.patchPriority === 2).length,
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
      recommendedNextLane: "apply_priority1_family_selector_config_patch_to_reusable_engine_source"
    },
    counts: {
      byFamily: countBy(patchRows, "family"),
      byPatchStatus: countBy(patchRows, "patchStatus"),
      byPatchPriority: countBy(patchRows, "patchPriority"),
      byReusableRepairClass: countBy(patchRows, "reusableRepairClass")
    },
    guardrails: [
      "This builds a patch plan only.",
      "This does not mutate the reusable engine source.",
      "This does not fetch.",
      "This does not search.",
      "This does not write canonical files.",
      "This does not write production files.",
      "Patch rows target adapter-family selector config, not per-league bespoke logic."
    ],
    patchRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    patchRowCount: output.summary.patchRowCount,
    patchReadyCount: output.summary.patchReadyCount,
    blockedMissingPatchTemplateCount: output.summary.blockedMissingPatchTemplateCount,
    priority1PatchCount: output.summary.priority1PatchCount,
    priority2PatchCount: output.summary.priority2PatchCount,
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
