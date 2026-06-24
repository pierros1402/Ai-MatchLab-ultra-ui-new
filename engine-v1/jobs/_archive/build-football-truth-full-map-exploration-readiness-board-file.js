#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INVENTORY =
  "data/football-truth/_diagnostics/full-competition-map-inventory-2026-06-11/full-competition-map-inventory-2026-06-11.json";

const DEFAULT_ENGINE =
  "data/football-truth/_diagnostics/reusable-adapter-family-contract-validator-engine-2026-06-14/reusable-adapter-family-contract-validator-engine-2026-06-14.json";

const DEFAULT_PRIORITY1_APPLY =
  "data/football-truth/_diagnostics/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14/reusable-adapter-family-contract-validator-priority1-apply-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/full-map-exploration-readiness-board-2026-06-14/full-map-exploration-readiness-board-2026-06-14.json";

const SUPPRESSED_SLUGS = new Set([
  "afg.1",
  "afg.2",
  "afg.cup",
  "pak.1",
  "pak.2",
  "pak.cup"
]);

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    inventory: DEFAULT_INVENTORY,
    engine: DEFAULT_ENGINE,
    priority1Apply: DEFAULT_PRIORITY1_APPLY,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--inventory") args.inventory = argv[++i];
    else if (arg === "--engine") args.engine = argv[++i];
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

function getSlug(row) {
  return String(
    row.competitionSlug ||
    row.slug ||
    row.normalizedCompetitionSlug ||
    row.competition ||
    row.id ||
    ""
  ).trim();
}

function getCompetitionType(row) {
  return String(
    row.competitionType ||
    row.type ||
    row.normalizedType ||
    row.kind ||
    "unknown"
  ).trim();
}

function getInventoryBucket(row) {
  return String(
    row.inventoryBucket ||
    row.bucket ||
    row.executionBucket ||
    row.workBucket ||
    row.statusBucket ||
    "__missing__"
  ).trim();
}

function scoreObjectArrayForInventory(arrayValue) {
  if (!Array.isArray(arrayValue)) return 0;

  let score = 0;
  for (const row of arrayValue.slice(0, 80)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const slug = getSlug(row);
    if (/^[a-z]{2,3}\.(1|2|3|4|5|cup)$/i.test(slug) || /^[a-z]{2,3}\./i.test(slug)) score += 4;
    if (row.inventoryBucket || row.executionBucket || row.competitionType || row.type) score += 2;
    if (row.country || row.countryCode || row.region || row.confederation) score += 1;
  }

  return score + Math.min(arrayValue.length, 1000) / 1000;
}

function findInventoryRows(json) {
  const directKeys = [
    "inventoryRows",
    "rows",
    "competitions",
    "normalizedRows",
    "mapRows",
    "allRows",
    "workRows"
  ];

  for (const key of directKeys) {
    if (Array.isArray(json[key]) && scoreObjectArrayForInventory(json[key]) > 0) {
      return json[key];
    }
  }

  const candidates = [];

  function walk(value, currentPath = "", depth = 0) {
    if (depth > 5) return;

    if (Array.isArray(value)) {
      const score = scoreObjectArrayForInventory(value);
      if (score > 0) candidates.push({ path: currentPath || "__root__", score, value });
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        walk(child, currentPath ? `${currentPath}.${key}` : key, depth + 1);
      }
    }
  }

  walk(json);

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.value.length - a.value.length;
  });

  if (!candidates.length) throw new Error("Could not locate inventory rows in full-map inventory input");

  return candidates[0].value;
}

function classifyLane({ row, slug, configuredFamiliesBySlug, priority1BySlug }) {
  const bucket = getInventoryBucket(row).toLowerCase();
  const type = getCompetitionType(row).toLowerCase();

  if (SUPPRESSED_SLUGS.has(slug) || bucket.includes("suppressed_low_value")) {
    return {
      explorationLane: "suppressed_low_value_no_active_work",
      laneReason: "currently suppressed by explicit low-value policy",
      recommendedNextStep: "none_keep_suppressed_until_policy_changes"
    };
  }

  if (priority1BySlug.has(slug)) {
    const priority = priority1BySlug.get(slug);
    if (priority.fullContractSatisfied) {
      return {
        explorationLane: "priority1_full_contract_candidate_no_canonical_write",
        laneReason: "priority1 reusable validator now has full contract candidate but canonical writes remain blocked",
        recommendedNextStep: "review_full_contract_candidates_before_any_scoped_canonical_gate"
      };
    }

    return {
      explorationLane: "priority1_reusable_repair_lane",
      laneReason: `priority1 reusable family still missing contract parts: ${(priority.missingReasons || []).join(",") || "__missing_reasons__"}`,
      recommendedNextStep: "continue_family_level_repair_not_per_league_patch"
    };
  }

  if (configuredFamiliesBySlug.has(slug)) {
    return {
      explorationLane: "reusable_family_configured_validation_lane",
      laneReason: `competition already mapped to reusable family ${configuredFamiliesBySlug.get(slug)}`,
      recommendedNextStep: "include_in_next_reusable_family_apply_batch"
    };
  }

  if (bucket.includes("covered_no_action")) {
    return {
      explorationLane: "covered_no_action",
      laneReason: "inventory says covered/no action",
      recommendedNextStep: "periodic contract audit_only"
    };
  }

  if (bucket.includes("provider_repair")) {
    return {
      explorationLane: "provider_repair_lane",
      laneReason: "inventory bucket indicates provider repair candidate",
      recommendedNextStep: "build_family_or_provider_repair_plan_source_only"
    };
  }

  if (bucket.includes("truth_review") || bucket.includes("signals_available")) {
    return {
      explorationLane: "truth_review_lane",
      laneReason: "inventory bucket indicates existing signals need truth review",
      recommendedNextStep: "build_truth_review_family_grouping_board"
    };
  }

  if (bucket.includes("registry_gap") || type.includes("registry_gap")) {
    return {
      explorationLane: "registry_gap_review_lane",
      laneReason: "inventory bucket or competition type indicates registry/type gap",
      recommendedNextStep: "build_registry_gap_resolution_board_no_fetch"
    };
  }

  if (
    bucket.includes("provider_discovery") ||
    bucket.includes("full_map_missing_required_data") ||
    bucket.includes("missing_required_data") ||
    bucket.includes("source_discovery")
  ) {
    return {
      explorationLane: "source_discovery_planning_lane",
      laneReason: "inventory bucket indicates missing required data or provider discovery candidate",
      recommendedNextStep: "build_controlled_source_discovery_plan_no_broad_untrusted_search"
    };
  }

  if (bucket.includes("cup_final_winner") || bucket.includes("winner_evidence")) {
    return {
      explorationLane: "cup_winner_or_cup_state_review_lane",
      laneReason: "inventory bucket indicates cup winner/final-state evidence review",
      recommendedNextStep: "build_cup_state_family_grouping_board"
    };
  }

  if (type.includes("cup")) {
    return {
      explorationLane: "cup_winner_or_cup_state_review_lane",
      laneReason: "cup competition needs winner/final-state workflow",
      recommendedNextStep: "build_cup_state_family_grouping_board"
    };
  }

  if (type.includes("league")) {
    return {
      explorationLane: "league_full_contract_exploration_lane",
      laneReason: "league requires standings, fixture/result, season-state and nextCheck contract",
      recommendedNextStep: "group_by_provider_family_or_source_authority"
    };
  }

  return {
    explorationLane: "full_map_manual_classification_avoid_bespoke_execution",
    laneReason: "competition needs source/type classification before action",
    recommendedNextStep: "classify_into_reusable_family_or_source_authority_template"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const inventory = readJson(args.inventory);
  const engine = readJson(args.engine);
  const priority1Apply = readJson(args.priority1Apply);

  const rawInventoryRows = findInventoryRows(inventory);
  const inventoryRows = rawInventoryRows
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({ ...row, competitionSlug: getSlug(row) }))
    .filter((row) => row.competitionSlug);

  const dedupedBySlug = new Map();
  for (const row of inventoryRows) {
    if (!dedupedBySlug.has(row.competitionSlug)) dedupedBySlug.set(row.competitionSlug, row);
  }

  const engineRows = Array.isArray(engine.engineRows) ? engine.engineRows : [];
  const configuredFamiliesBySlug = new Map(
    engineRows
      .filter((row) => row.competitionSlug && row.adapterFamily && row.familyConfigStatus !== "route_classification_required")
      .map((row) => [String(row.competitionSlug), String(row.adapterFamily)])
  );

  const priority1Rows = Array.isArray(priority1Apply.validationRows) ? priority1Apply.validationRows : [];
  const priority1BySlug = new Map(priority1Rows.map((row) => [String(row.competitionSlug), row]));

  const explorationRows = [...dedupedBySlug.values()]
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug))
    .map((row, index) => {
      const slug = row.competitionSlug;
      const classification = classifyLane({ row, slug, configuredFamiliesBySlug, priority1BySlug });

      return {
        explorationRowId: `full_map_exploration_${String(index + 1).padStart(4, "0")}`,
        competitionSlug: slug,
        competitionName: row.competitionName || row.name || row.displayName || null,
        country: row.country || row.countryName || row.countryCode || null,
        region: row.region || row.confederation || null,
        competitionType: getCompetitionType(row),
        inventoryBucket: getInventoryBucket(row),
        reusableFamily: configuredFamiliesBySlug.get(slug) || null,
        priority1ReusableStatus: priority1BySlug.has(slug) ? priority1BySlug.get(slug).contractState : null,
        priority1FullContractSatisfied: priority1BySlug.has(slug) ? Boolean(priority1BySlug.get(slug).fullContractSatisfied) : false,
        ...classification,
        fetchAllowedNow: false,
        searchAllowedNow: false,
        broadSearchAllowedNow: false,
        zeroResultMayImplyAbsence: false,
        canonicalWriteEligibleNow: false,
        productionWrite: false
      };
    });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-full-map-exploration-readiness-board-file",
    mode: "source_only_full_map_exploration_readiness_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      inventory: args.inventory,
      engine: args.engine,
      priority1Apply: args.priority1Apply,
      rawInventoryRowsCount: rawInventoryRows.length,
      dedupedCompetitionCount: explorationRows.length,
      engineRowCount: engineRows.length,
      priority1ValidationRowCount: priority1Rows.length
    },
    summary: {
      retainedRawMapCompetitionCount: explorationRows.length,
      competitionCount: explorationRows.length,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      currentEffectiveMapQualitativeState: "above_600_expected_to_shrink_after_policy_reductions",
      currentExplicitSuppressedCompetitionCount: explorationRows.filter((row) => row.explorationLane === "suppressed_low_value_no_active_work").length,
      noActionSignalCompetitionCount: explorationRows.filter((row) => row.explorationLane === "covered_no_action").length,
      futurePolicyReductionCandidateCount: explorationRows.filter((row) =>
        row.explorationLane === "source_discovery_planning_lane" ||
        row.explorationLane === "full_map_manual_classification_avoid_bespoke_execution"
      ).length,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,
      reusableConfiguredCompetitionCount: explorationRows.filter((row) => row.reusableFamily).length,
      priority1CompetitionCount: explorationRows.filter((row) => row.priority1ReusableStatus).length,
      priority1FullContractCandidateNoCanonicalWriteCount: explorationRows.filter((row) => row.priority1FullContractSatisfied).length,
      suppressedCompetitionCount: explorationRows.filter((row) => row.explorationLane === "suppressed_low_value_no_active_work").length,
      sourceDiscoveryPlanningLaneCount: explorationRows.filter((row) => row.explorationLane === "source_discovery_planning_lane").length,
      sourceDiscoveryRawCandidateCount: explorationRows.filter((row) => row.explorationLane === "source_discovery_planning_lane").length,
      providerRepairLaneCount: explorationRows.filter((row) => row.explorationLane === "provider_repair_lane").length,
      truthReviewLaneCount: explorationRows.filter((row) => row.explorationLane === "truth_review_lane").length,
      registryGapReviewLaneCount: explorationRows.filter((row) => row.explorationLane === "registry_gap_review_lane").length,
      leagueFullContractExplorationLaneCount: explorationRows.filter((row) => row.explorationLane === "league_full_contract_exploration_lane").length,
      cupStateReviewLaneCount: explorationRows.filter((row) => row.explorationLane === "cup_winner_or_cup_state_review_lane").length,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      broadSearchUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_full_map_reusable_family_expansion_plan_no_broad_search"
    },
    counts: {
      byCompetitionType: countBy(explorationRows, "competitionType"),
      byInventoryBucket: countBy(explorationRows, "inventoryBucket"),
      byExplorationLane: countBy(explorationRows, "explorationLane"),
      byRecommendedNextStep: countBy(explorationRows, "recommendedNextStep"),
      byReusableFamily: countBy(explorationRows, "reusableFamily")
    },
    guardrails: [
      "This is the start of full-map exploration.",
      "The retained raw map count is not the confirmed actionable league count.",
      "This board must not assert an exact current effective/actionable map count.",
      "Legacy global coverage contracts and worker seed snapshots are not authoritative for current effective scope.",
      "The current effective map is qualitatively above 600 and expected to shrink after additional policy reductions.",
      "Many non-existent, irrelevant, low-value, or betting-market-unlikely competitions have already been or will be excluded by policy.",
      "Raw source-discovery candidates must not be presented as leagues we must cover.",
      "Future policy reductions are expected as evidence and product priorities justify.",
      "This does not run broad live search.",
      "This does not fetch.",
      "This does not treat search zero results as absence.",
      "This does not write canonical files.",
      "This does not write production files.",
      "This does not assert active/inactive/completed truth.",
      "Next work must expand reusable families and controlled source-authority templates, not one-off league patches."
    ],
    explorationRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    currentEffectiveMapQualitativeState: output.summary.currentEffectiveMapQualitativeState,
    currentExplicitSuppressedCompetitionCount: output.summary.currentExplicitSuppressedCompetitionCount,
    noActionSignalCompetitionCount: output.summary.noActionSignalCompetitionCount,
    futurePolicyReductionCandidateCount: output.summary.futurePolicyReductionCandidateCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    reusableConfiguredCompetitionCount: output.summary.reusableConfiguredCompetitionCount,
    priority1CompetitionCount: output.summary.priority1CompetitionCount,
    priority1FullContractCandidateNoCanonicalWriteCount: output.summary.priority1FullContractCandidateNoCanonicalWriteCount,
    suppressedCompetitionCount: output.summary.suppressedCompetitionCount,
    sourceDiscoveryPlanningLaneCount: output.summary.sourceDiscoveryPlanningLaneCount,
    sourceDiscoveryRawCandidateCount: output.summary.sourceDiscoveryRawCandidateCount,
    providerRepairLaneCount: output.summary.providerRepairLaneCount,
    truthReviewLaneCount: output.summary.truthReviewLaneCount,
    registryGapReviewLaneCount: output.summary.registryGapReviewLaneCount,
    leagueFullContractExplorationLaneCount: output.summary.leagueFullContractExplorationLaneCount,
    cupStateReviewLaneCount: output.summary.cupStateReviewLaneCount,
    fetchAllowedNowCount: 0,
    searchAllowedNowCount: 0,
    broadSearchAllowedNowCount: 0,
    zeroResultMayImplyAbsenceCount: 0,
    canonicalWriteEligibleNowCount: 0,
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main();
