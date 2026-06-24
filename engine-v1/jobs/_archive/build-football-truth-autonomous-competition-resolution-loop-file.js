#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_INVENTORY =
  "data/football-truth/_diagnostics/full-competition-map-inventory-2026-06-11/full-competition-map-inventory-2026-06-11.json";

const DEFAULT_OFFICIAL_HOST_RECOVERY =
  "data/football-truth/_diagnostics/provider-discovery-official-host-recovery-plan-2026-06-12/provider-discovery-official-host-recovery-plan-2026-06-12.json";

const DEFAULT_SEARCH_HEALTH =
  "data/football-truth/_diagnostics/provider-discovery-official-host-search-health-gated-offset30-live-2026-06-12/provider-discovery-official-host-search-health-gated-offset30-live-2026-06-12.json";

const LOW_VALUE_SUPPRESSED_SLUGS = new Set([
  "afg.1",
  "afg.2",
  "afg.cup",
  "pak.1",
  "pak.2",
  "pak.cup"
]);

const MEMORY_BLOCKED_SLUGS = new Set([
  "fin.1",
  "fin.2",
  "por.taca.portugal",
  "sco.1",
  "sco.2"
]);

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    inventory: DEFAULT_INVENTORY,
    officialHostRecovery: DEFAULT_OFFICIAL_HOST_RECOVERY,
    searchHealth: DEFAULT_SEARCH_HEALTH,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--inventory") args.inventory = argv[++i];
    else if (arg === "--official-host-recovery") args.officialHostRecovery = argv[++i];
    else if (arg === "--search-health") args.searchHealth = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `autonomous-competition-resolution-loop-${args.date}`,
      `autonomous-competition-resolution-loop-${args.date}.json`
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

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstString(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstNumber(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return null;
}

function unique(values) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim() !== "")));
}

function countBy(rows, key) {
  const counts = {};

  for (const row of rows) {
    const rawValue = row[key];
    const value =
      rawValue === null || rawValue === undefined || String(rawValue).trim() === ""
        ? "__missing__"
        : String(rawValue).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function normalizeInventoryRows(inventory) {
  if (!Array.isArray(inventory?.rows)) {
    throw new Error("Expected inventory.rows array. Refusing heuristic scan.");
  }

  return inventory.rows
    .filter((row) => row && typeof row === "object" && typeof row.competitionSlug === "string")
    .map((row) => {
      const slug = row.competitionSlug;
      const slugCountryKey = slug.includes(".") ? slug.split(".")[0] : "";

      return {
        competitionSlug: slug,
        countryKey: slugCountryKey,
        competitionType: row.competitionType || "",
        providers: Array.isArray(row.providers) ? row.providers : [],
        providerCount: Number(row.providerCount || 0),
        fixtureSignals: Number(row.fixtureSignals || 0),
        standingSignals: Number(row.standingSignals || 0),
        cupWinnerSignals: Number(row.cupWinnerSignals || 0),
        canonicalFixtureRows: Number(row.canonicalFixtureRows || 0),
        canonicalStandingRows: Number(row.canonicalStandingRows || 0),
        cupWinnerState: row.cupWinnerState === true,
        promoted: Array.isArray(row.promoted) ? row.promoted : [],
        blocked: Array.isArray(row.blocked) ? row.blocked : [],
        sourceFiles: Array.isArray(row.sourceFiles) ? row.sourceFiles : [],
        inventoryBucket: row.inventoryBucket || "",
        missingData: Array.isArray(row.missingData) ? row.missingData : [],
        currentCoverageOverlay: row.currentCoverageOverlay || null,
        currentProviderContract: row.currentProviderContract || null,
        currentPromotionOverlay: row.currentPromotionOverlay || null
      };
    })
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));
}

function normalizeOfficialHostRecovery(recovery) {
  const rows = asArray(recovery?.recoveryRows);
  const bySlug = new Map();

  for (const row of rows) {
    const host = firstString(row, ["candidateHost", "host", "officialHost"]);
    const country = firstString(row, ["country"]);
    const countryKey = firstString(row, ["countryKey"]);
    const region = firstString(row, ["region"]);
    const maxConfidence = firstNumber(row, ["maxConfidence", "confidence", "score"]);

    const slugs = unique([
      ...asArray(row?.representativeSlugs).map(String),
      ...asArray(row?.retryCompetitionExamples).map(String)
    ]);

    for (const slug of slugs) {
      if (!slug || !slug.includes(".")) continue;

      bySlug.set(slug, {
        competitionSlug: slug,
        candidateHost: host,
        country,
        countryKey,
        region,
        maxConfidence,
        source: "official_host_recovery_plan"
      });
    }
  }

  return bySlug;
}

function inferSearchHealthState(searchHealth) {
  const summary = searchHealth?.summary || {};
  const health = summary.searchHealth || summary || {};

  return {
    searchProviderBulkStateTrusted:
      health.searchProviderBulkStateTrusted === true ||
      summary.searchProviderBulkStateTrusted === true,
    zeroResultDoesNotImplyAbsence:
      health.zeroResultDoesNotImplyAbsence === true ||
      summary.zeroResultDoesNotImplyAbsence === true,
    state:
      health.searchProviderBulkStateTrusted === true || summary.searchProviderBulkStateTrusted === true
        ? "trusted_or_not_marked_untrusted"
        : "untrusted_or_not_proven_trusted"
  };
}

function classify(row, officialHostBySlug, searchHealthState) {
  const slug = row.competitionSlug;
  const bucket = row.inventoryBucket;
  const overlay = row.currentCoverageOverlay || {};
  const officialHostRecovery = officialHostBySlug.get(slug);

  if (LOW_VALUE_SUPPRESSED_SLUGS.has(slug)) {
    return {
      lane: "suppressed_low_value_no_active_work",
      priority: 900,
      status: "suppressed",
      nextAction: "no_active_work_unless_user_reopens_low_value_scope",
      blockedReason: "low_value_policy_suppression",
      canonicalWriteEligible: false
    };
  }

  if (MEMORY_BLOCKED_SLUGS.has(slug)) {
    return {
      lane: "blocked_memory_or_provider_contract",
      priority: 700,
      status: "blocked",
      nextAction: "repair_existing_provider_contract_or_adapter_before_truth_promotion",
      blockedReason: "known_provider_contract_or_adapter_block",
      canonicalWriteEligible: false
    };
  }

  if (officialHostRecovery) {
    return {
      lane: "official_host_recovery_host_scoped_targets",
      priority: 100,
      status: "actionable_source_scoped",
      nextAction: "build_host_scoped_standings_or_competition_source_targets_from_trusted_partial_host_only",
      blockedReason: "",
      canonicalWriteEligible: false,
      candidateHost: officialHostRecovery.candidateHost,
      hostConfidence: officialHostRecovery.maxConfidence,
      country: officialHostRecovery.country,
      region: officialHostRecovery.region
    };
  }

  if (bucket === "current_intelligence_overlay_available") {
    const nextAllowedAction = overlay.nextAllowedAction || "";

    if (nextAllowedAction === "no_action_covered") {
      return {
        lane: "current_overlay_no_action_covered",
        priority: 750,
        status: "covered",
        nextAction: "no_action_current_overlay_marks_covered",
        blockedReason: "",
        canonicalWriteEligible: false
      };
    }

    return {
      lane: "current_overlay_review",
      priority: 220,
      status: "needs_overlay_review",
      nextAction: nextAllowedAction || "review_current_overlay_before_more_work",
      blockedReason: "",
      canonicalWriteEligible: false
    };
  }

  if (bucket === "signals_available_needs_truth_review") {
    return {
      lane: "truth_review_batch",
      priority: 250,
      status: "needs_truth_review",
      nextAction: "review_existing_signals_for_truth_gate_before_any_new_discovery",
      blockedReason: "",
      canonicalWriteEligible: false
    };
  }

  if (bucket === "discovered_no_actionable_signal") {
    return {
      lane: "blocked_discovered_no_actionable_signal",
      priority: 640,
      status: "blocked",
      nextAction: "do_not_treat_discovery_noise_as_truth_build_better_source_index_or_trusted_host_strategy",
      blockedReason: "discovered_no_actionable_signal",
      canonicalWriteEligible: false
    };
  }

  if (bucket === "full_map_missing_required_data") {
    if (!searchHealthState.searchProviderBulkStateTrusted || searchHealthState.zeroResultDoesNotImplyAbsence) {
      return {
        lane: "blocked_provider_discovery_untrusted_search",
        priority: 650,
        status: "blocked",
        nextAction: "do_not_run_broad_search_build_source_index_or_host_scoped_strategy_first",
        blockedReason: "search_provider_untrusted_zero_result_does_not_imply_absence",
        canonicalWriteEligible: false
      };
    }

    return {
      lane: "provider_discovery_batch",
      priority: 400,
      status: "needs_discovery",
      nextAction: "run_controlled_provider_discovery_only_if_search_health_gate_is_trusted",
      blockedReason: "",
      canonicalWriteEligible: false
    };
  }

  return {
    lane: "unknown_needs_classification",
    priority: 600,
    status: "blocked",
    nextAction: "inspect_inventory_bucket_and_assign_lane",
    blockedReason: "unknown_inventory_bucket",
    canonicalWriteEligible: false
  };
}

function buildWorkBatches(rows) {
  const activeRows = rows
    .filter((row) => !["covered", "suppressed"].includes(row.status))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.competitionSlug.localeCompare(b.competitionSlug);
    });

  const byLane = new Map();

  for (const row of activeRows) {
    if (!byLane.has(row.lane)) byLane.set(row.lane, []);
    byLane.get(row.lane).push(row);
  }

  const batches = [];

  for (const [lane, laneRows] of byLane.entries()) {
    const chunkSize =
      lane === "official_host_recovery_host_scoped_targets" ? 25 :
      lane === "current_overlay_review" ? 25 :
      lane === "truth_review_batch" ? 50 :
      100;

    for (let i = 0; i < laneRows.length; i += chunkSize) {
      const chunk = laneRows.slice(i, i + chunkSize);

      batches.push({
        batchId: `${lane}__${String(Math.floor(i / chunkSize) + 1).padStart(3, "0")}`,
        lane,
        rowCount: chunk.length,
        priority: chunk[0]?.priority ?? 999,
        status:
          chunk.some((row) => row.status === "actionable_source_scoped") ? "actionable" :
          chunk.some((row) => row.status.includes("review")) ? "review" :
          "blocked_or_waiting",
        nextAction: chunk[0]?.nextAction || "",
        slugs: chunk.map((row) => row.competitionSlug),
        sampleRows: chunk.slice(0, 20)
      });
    }
  }

  return batches.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.batchId.localeCompare(b.batchId);
  });
}

function main() {
  const args = parseArgs(process.argv);

  const inventory = readJsonIfExists(args.inventory);
  if (!inventory) throw new Error(`Missing inventory JSON: ${args.inventory}`);

  const officialHostRecovery = readJsonIfExists(args.officialHostRecovery);
  const searchHealth = readJsonIfExists(args.searchHealth);

  const inventoryRows = normalizeInventoryRows(inventory);
  const officialHostBySlug = normalizeOfficialHostRecovery(officialHostRecovery);
  const searchHealthState = inferSearchHealthState(searchHealth);

  const resolutionRows = inventoryRows.map((row) => {
    const decision = classify(row, officialHostBySlug, searchHealthState);

    return {
      competitionSlug: row.competitionSlug,
      country: decision.country || "",
      countryKey: row.countryKey || decision.countryKey || "",
      region: decision.region || "",
      competitionType: row.competitionType,
      inventoryBucket: row.inventoryBucket,
      providerCount: row.providerCount,
      fixtureSignals: row.fixtureSignals,
      standingSignals: row.standingSignals,
      cupWinnerSignals: row.cupWinnerSignals,
      canonicalFixtureRows: row.canonicalFixtureRows,
      canonicalStandingRows: row.canonicalStandingRows,
      cupWinnerState: row.cupWinnerState,
      promoted: row.promoted,
      missingData: row.missingData,
      currentOverlayNextAllowedAction: row.currentCoverageOverlay?.nextAllowedAction || "",
      currentOverlaySeasonState: row.currentCoverageOverlay?.seasonState || "",
      currentProviderId: row.currentProviderContract?.providerId || "",
      officialHost: decision.candidateHost || "",
      lane: decision.lane,
      priority: decision.priority,
      status: decision.status,
      nextAction: decision.nextAction,
      blockedReason: decision.blockedReason,
      canonicalWriteEligible: decision.canonicalWriteEligible,
      evidenceState: "not_write_eligible_from_this_loop",
      hostConfidence: decision.hostConfidence ?? null
    };
  }).sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const workBatches = buildWorkBatches(resolutionRows);

  const actionableRows = resolutionRows.filter((row) =>
    ["actionable_source_scoped", "needs_overlay_review", "needs_truth_review"].includes(row.status)
  );

  const blockedRows = resolutionRows.filter((row) => row.status === "blocked");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-autonomous-competition-resolution-loop-file",
    mode: "source_only_schema_bound_autonomous_resolution_loop_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      inventory: args.inventory,
      officialHostRecovery: args.officialHostRecovery,
      searchHealth: args.searchHealth,
      inventoryRowsBinding: "inventory.rows",
      inventoryRowCount: inventoryRows.length,
      inventorySummary: inventory.summary || null
    },
    searchHealthState,
    summary: {
      inventoryCompetitionCount: inventoryRows.length,
      resolutionRowCount: resolutionRows.length,
      actionableRowCount: actionableRows.length,
      blockedRowCount: blockedRows.length,
      workBatchCount: workBatches.length,
      canonicalWriteEligibleCount: resolutionRows.filter((row) => row.canonicalWriteEligible).length,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane:
        workBatches.some((batch) => batch.lane === "official_host_recovery_host_scoped_targets")
          ? "build_host_scoped_recovery_targets_for_trusted_partial_hosts_first"
          : "start_highest_priority_actionable_batch_from_resolution_loop"
    },
    counts: {
      byInventoryBucket: countBy(resolutionRows, "inventoryBucket"),
      byLane: countBy(resolutionRows, "lane"),
      byStatus: countBy(resolutionRows, "status"),
      byCompetitionType: countBy(resolutionRows, "competitionType"),
      byBlockedReason: countBy(blockedRows, "blockedReason")
    },
    guardrailConclusions: [
      "This loop is schema-bound to full-competition-map-inventory.rows.",
      "discovered_no_actionable_signal is blocked/noise, not covered.",
      "current_intelligence_overlay_available requires overlay review unless nextAllowedAction is no_action_covered.",
      "Untrusted broad search remains blocked.",
      "Canonical write eligibility remains false until a dedicated truth gate validates concrete evidence."
    ],
    workBatches,
    resolutionRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    inventoryCompetitionCount: output.summary.inventoryCompetitionCount,
    resolutionRowCount: output.summary.resolutionRowCount,
    actionableRowCount: output.summary.actionableRowCount,
    blockedRowCount: output.summary.blockedRowCount,
    workBatchCount: output.summary.workBatchCount,
    canonicalWriteEligibleCount: output.summary.canonicalWriteEligibleCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();
