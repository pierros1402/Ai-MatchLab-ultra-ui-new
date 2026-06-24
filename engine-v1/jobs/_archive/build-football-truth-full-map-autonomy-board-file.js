#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    input: "",
    output: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hasPromotedCoverage(row) {
  const promoted = row.promoted && typeof row.promoted === "object" ? row.promoted : {};
  return Object.values(promoted).some((value) => value === true);
}

function hasBlockedState(row) {
  const blocked = row.blocked && typeof row.blocked === "object" ? row.blocked : {};
  return Object.keys(blocked).length > 0;
}

function normalizeProviderHost(providerId) {
  const raw = String(providerId || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");

  return raw.split("/")[0].split("?")[0].split("#")[0];
}

function providerLooksTrusted(providerId) {
  if (!providerId || providerId === "unknown") return false;

  const value = String(providerId).trim().toLowerCase();
  const host = normalizeProviderHost(providerId);

  if (value === "official_league") return true;

  const explicitlyBlockedHosts = [
    "account.microsoft.com",
    "amazon.co.uk",
    "ads.tiktok.com",
    "about.instagram.com",
    "facebook.com",
    "x.com",
    "twitter.com",
    "linkedin.com",
    "youtube.com",
    "wikipedia.org",
    "thefreedictionary.com",
    "abbreviations.com",
    "leagueofgraphs.com",
    "flashscore.com",
    "flashscore.co.uk",
    "flashscore.pt",
    "flashscore.ro",
    "flashscore.sk",
    "scorebar.com",
    "soccerway.com",
    "transfermarkt.com",
    "cav.receita.fazenda.gov.br",
    "servicos.receita.fazenda.gov.br",
    "lithuania.mfa.gov.by",
    "in.mfa.lt",
    "myinfo.premierenergy.ro",
    "official_route_probe_fetch",
    "autonomous_official_route_search",
    "bing_html"
  ];

  if (explicitlyBlockedHosts.includes(host)) return false;
  if (host.includes(".mfa.")) return false;
  if (host.endsWith(".mfa.lt")) return false;
  if (host.includes("receita.fazenda.gov.br")) return false;
  if (host.includes("flashscore.")) return false;
  if (host.includes("leagueofgraphs.")) return false;
  if (host.includes("thefreedictionary.")) return false;
  if (host.includes("acronyms.")) return false;
  if (host.includes("abbreviations.")) return false;

  const trustedOfficialHosts = [
    "uefa.com",
    "fifa.com",
    "the-afc.com",
    "cafonline.com",
    "concacaf.com",
    "conmebol.com",
    "ofcfootball.com",
    "aleagues.com.au",
    "thecfa.cn",
    "jleague.co",
    "jleague.jp",
    "kleague.com",
    "nzfootball.co.nz",
    "league1canada.ca",
    "hns.family",
    "leagueofireland.ie",
    "indiansuperleague.com",
    "bulgarian-football.com"
  ];

  return trustedOfficialHosts.some((trustedHost) => {
    return host === trustedHost || host.endsWith(`.${trustedHost}`);
  });
}
function buildSourceSignalProfile(row) {
  const rawProviderSignals = Array.isArray(row.providers)
    ? row.providers.filter(Boolean).map(String)
    : [];

  if (row.currentProviderContract?.providerId) {
    rawProviderSignals.unshift(String(row.currentProviderContract.providerId));
  }

  const uniqueRawProviderSignals = unique(rawProviderSignals);
  const trustedProviderIds = uniqueRawProviderSignals.filter(providerLooksTrusted);
  const noisyProviderSignals = uniqueRawProviderSignals.filter((providerId) => !providerLooksTrusted(providerId));

  return {
    primaryTrustedProviderId: trustedProviderIds[0] || "unknown_untrusted_provider_signal",
    trustedProviderIds,
    noisyProviderSignals,
    rawProviderSignals: uniqueRawProviderSignals,
    trustedProviderCount: trustedProviderIds.length,
    rawSignalCount: uniqueRawProviderSignals.length,
    hasTrustedProvider: trustedProviderIds.length > 0,
    hasOnlyNoisyProviderSignals: trustedProviderIds.length === 0 && uniqueRawProviderSignals.length > 0
  };
}

function inferSeasonState(row) {
  return row.currentCoverageOverlay?.seasonState || "unknown";
}

function confidenceForRow({ row, actionBucket }) {
  if (actionBucket === "blocked_no_action") return 0.95;
  if (actionBucket === "no_action_covered") return 0.9;

  if (row.currentCoverageOverlay?.hasCurrentOverlay) return 0.8;
  if (Array.isArray(row.providers) && row.providers.length > 0 && row.missingData?.length > 0) return 0.7;
  if ((row.standingSignals || 0) > 0 || (row.fixtureSignals || 0) > 0 || (row.cupWinnerSignals || 0) > 0) return 0.65;

  return 0.45;
}

function classifyAutonomy(row) {
  const missingData = Array.isArray(row.missingData) ? row.missingData : [];
  const seasonState = inferSeasonState(row);
  const nextAllowedAction = row.currentCoverageOverlay?.nextAllowedAction || "";
  const sourceSignalProfile = buildSourceSignalProfile(row);
  const trustedProviderCount = sourceSignalProfile.trustedProviderCount;
  const rawProviderSignalCount = sourceSignalProfile.rawSignalCount;
  const hasSignals = Number(row.fixtureSignals || 0) > 0 ||
    Number(row.standingSignals || 0) > 0 ||
    Number(row.cupWinnerSignals || 0) > 0 ||
    rawProviderSignalCount > 0;

  let actionBucket = "unknown_needs_truth_review";
  let intentNeed = "classify_truth_state";
  let priority = 40;
  let allowedNow = true;
  let reason = "Competition needs full-map Truth/Memory classification before acquisition.";
  let requiredData = missingData;

  if (hasBlockedState(row) || nextAllowedAction === "blocked_no_action" || row.inventoryBucket === "blocked_carry_forward_or_contract_gap") {
    actionBucket = "blocked_no_action";
    intentNeed = "blocked_memory_or_provider_contract";
    priority = 0;
    allowedNow = false;
    reason = "Competition/provider has blocked carry-forward or contract state; do not retry without a repair strategy.";
  } else if (missingData.includes("canonicalStandings")) {
    actionBucket = trustedProviderCount > 0
      ? "standings_provider_batch_needed"
      : "standings_discovery_or_provider_validation_needed";
    intentNeed = "official_standings";
    priority = seasonState === "active"
      ? 90
      : trustedProviderCount > 0
        ? 75
        : rawProviderSignalCount > 0
          ? 60
          : 55;
    allowedNow = true;
    reason = trustedProviderCount > 0
      ? "Canonical standings are missing and at least one trusted provider/source signal exists; plan standings provider/parser repair as a full-map batch."
      : rawProviderSignalCount > 0
        ? "Canonical standings are missing but current provider signals are untrusted/noisy; validate or discover official providers before provider repair planning."
        : "Canonical standings are missing with no normalized provider signal; include in full-map standings discovery/registry repair batch.";
  } else if (missingData.includes("canonicalFixtures")) {
    actionBucket = "fixture_or_result_fifa.comatch_needed";
    intentNeed = "official_fixtures_or_results";
    priority = seasonState === "active" ? 85 : 60;
    allowedNow = true;
    reason = "Canonical fixture/result data is missing; plan provider/parser/registry repair as a full-map batch.";
  } else if (missingData.includes("cupWinnerFinalState")) {
    actionBucket = "cup_winner_final_state_needed";
    intentNeed = "cup_winner_final_state";
    priority = 80;
    allowedNow = true;
    reason = "Cup has winner/final-state evidence gap; plan cup final/winner truth review or provider repair batch.";
  } else if (hasPromotedCoverage(row) || row.inventoryBucket === "promoted_or_partially_promoted") {
    actionBucket = "no_action_covered";
    intentNeed = "none";
    priority = 0;
    allowedNow = false;
    reason = "Competition has promoted or partially promoted coverage and no required missing data in this inventory pass.";
  } else if (row.inventoryBucket === "current_intelligence_overlay_available" && missingData.length === 0) {
    actionBucket = "no_action_covered";
    intentNeed = "none";
    priority = 0;
    allowedNow = false;
    reason = "Current intelligence overlay exists and this inventory pass shows no required missing data.";
  } else if (row.competitionType === "registry_gap") {
    actionBucket = "registry_gap_review_needed";
    intentNeed = "registry_gap_resolution";
    priority = hasSignals ? 55 : 35;
    allowedNow = hasSignals;
    reason = hasSignals
      ? "Registry-gap row has signals and needs full-map registry resolution."
      : "Registry-gap row has no actionable signal in this pass; keep below provider repair batches.";
    requiredData = ["registryResolution"];
  } else if (hasSignals || row.inventoryBucket === "signals_available_needs_truth_review") {
    actionBucket = "truth_review_signal_batch_needed";
    intentNeed = "truth_review";
    priority = 50;
    allowedNow = true;
    reason = "Signals exist but no required canonical gap was classified; queue for Truth review before acquisition.";
    requiredData = ["truthReview"];
  } else {
    actionBucket = "discovered_no_actionable_signal";
    intentNeed = "none";
    priority = 0;
    allowedNow = false;
    reason = "Competition is discovered in the full map but has no actionable signal or required data gap in this pass.";
    requiredData = [];
  }

  return {
    actionBucket,
    intentNeed,
    priority,
    allowedNow,
    reason,
    requiredData: unique(requiredData).sort()
  };
}

function buildAutonomyRow(row) {
  const decision = classifyAutonomy(row);
  const sourceSignalProfile = buildSourceSignalProfile(row);
  const providerId = sourceSignalProfile.primaryTrustedProviderId;

  return {
    competitionSlug: row.competitionSlug,
    competitionType: row.competitionType,
    providerId,
    trustedProviderIds: sourceSignalProfile.trustedProviderIds,
    noisyProviderSignals: sourceSignalProfile.noisyProviderSignals,
    rawProviderSignals: sourceSignalProfile.rawProviderSignals,
    providers: sourceSignalProfile.trustedProviderIds,
    providerCount: sourceSignalProfile.trustedProviderCount,
    seasonState: inferSeasonState(row),
    intentNeed: decision.intentNeed,
    actionBucket: decision.actionBucket,
    priority: decision.priority,
    allowedNow: decision.allowedNow,
    confidence: confidenceForRow({ row, actionBucket: decision.actionBucket }),
    reason: decision.reason,
    requiredData: decision.requiredData,
    sourceBasis: {
      inventoryBucket: row.inventoryBucket,
      missingData: Array.isArray(row.missingData) ? row.missingData : [],
      fixtureSignals: Number(row.fixtureSignals || 0),
      standingSignals: Number(row.standingSignals || 0),
      cupWinnerSignals: Number(row.cupWinnerSignals || 0),
      canonicalFixtureRows: Number(row.canonicalFixtureRows || 0),
      canonicalStandingRows: Number(row.canonicalStandingRows || 0),
      cupWinnerState: row.cupWinnerState === true,
      currentCoverageOverlay: row.currentCoverageOverlay || {},
      currentProviderContract: row.currentProviderContract || null,
      currentPromotionOverlay: row.currentPromotionOverlay || null,
      sourceSignalProfile,
      promoted: row.promoted || {},
      blocked: row.blocked || {}
    },
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildFullMapAutonomyBoard(inventory) {
  if (!Array.isArray(inventory.rows)) {
    throw new Error("Input inventory must contain rows array");
  }

  const rows = inventory.rows
    .map(buildAutonomyRow)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.competitionSlug.localeCompare(b.competitionSlug);
    });

  const actionBuckets = rows.reduce((acc, row) => {
    acc[row.actionBucket] ||= [];
    acc[row.actionBucket].push(row.competitionSlug);
    return acc;
  }, {});

  const intentNeeds = rows.reduce((acc, row) => {
    acc[row.intentNeed] ||= [];
    acc[row.intentNeed].push(row.competitionSlug);
    return acc;
  }, {});

  const byCompetitionType = rows.reduce((acc, row) => {
    acc[row.competitionType] ||= 0;
    acc[row.competitionType] += 1;
    return acc;
  }, {});

  const actionableRows = rows.filter((row) => row.allowedNow === true);
  const blockedRows = rows.filter((row) => row.actionBucket === "blocked_no_action");
  const coveredRows = rows.filter((row) => row.actionBucket === "no_action_covered");

  const topActionableRows = actionableRows.slice(0, 50);

  return {
    ok: true,
    job: "build-football-truth-full-map-autonomy-board",
    generatedAt: new Date().toISOString(),
    inputSummary: inventory.summary || {},
    summary: {
      competitionCount: rows.length,
      actionBucketCount: Object.keys(actionBuckets).length,
      intentNeedCount: Object.keys(intentNeeds).length,
      actionableNowCount: actionableRows.length,
      blockedNoActionCount: blockedRows.length,
      coveredNoActionCount: coveredRows.length,
      topActionableCount: topActionableRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byCompetitionType,
    actionBuckets,
    intentNeeds,
    topActionableRows,
    rows,
    nextRecommendedAction: topActionableRows.length > 0
      ? {
          type: "memory_aware_full_map_refinement",
          reason: "Apply memory overlays before selecting provider/action batches across the full map.",
          firstActionBucket: topActionableRows[0].actionBucket,
          firstCompetitionSlug: topActionableRows[0].competitionSlug
        }
      : {
          type: "none",
          reason: "No actionable rows remain in the full-map autonomy board."
        },
    policy: {
      purpose: "Classify the full competition inventory into autonomy action buckets before memory-aware refinement and provider repair planning.",
      inputContract: "Consumes full competition map inventory rows only.",
      noFetch: true,
      noSearch: true,
      noActualWrites: true,
      noCanonicalWrites: true,
      noPromotionWrites: true,
      noEndpointChasing: true,
      noSingleLeagueDrift: true,
      fullMapScope: true
    },
    guarantees: {
      noFetch: true,
      noSearch: true,
      noActualWrites: true,
      actualWrites: 0,
      noCanonicalWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false
    }
  };
}

function runSelfTest() {
  const inventory = {
    summary: { normalizedCompetitionCount: 7 },
    rows: [
      {
        competitionSlug: "aaa.1",
        competitionType: "league",
        providers: ["uefa.com"],
        providerCount: 1,
        inventoryBucket: "current_intelligence_overlay_available",
        missingData: ["canonicalStandings"],
        standingSignals: 3,
        currentCoverageOverlay: { hasCurrentOverlay: true, seasonState: "active" }
      },
      {
        competitionSlug: "bbb.cup",
        competitionType: "cup",
        providers: ["fifa.com"],
        providerCount: 1,
        inventoryBucket: "full_map_missing_required_data",
        missingData: ["cupWinnerFinalState"],
        cupWinnerSignals: 2
      },
      {
        competitionSlug: "ccc.2",
        competitionType: "league",
        providers: [],
        providerCount: 0,
        inventoryBucket: "full_map_missing_required_data",
        missingData: ["canonicalStandings"]
      },
      {
        competitionSlug: "ddd.1",
        competitionType: "league",
        providers: ["aleagues.com.au"],
        providerCount: 1,
        inventoryBucket: "blocked_carry_forward_or_contract_gap",
        missingData: ["canonicalStandings"],
        blocked: { official: true }
      },
      {
        competitionSlug: "eee.1",
        competitionType: "league",
        providers: ["jleague.jp"],
        providerCount: 1,
        inventoryBucket: "promoted_or_partially_promoted",
        missingData: [],
        promoted: { official: true }
      },
      {
        competitionSlug: "fff.cup",
        competitionType: "cup",
        providers: ["kleague.com"],
        providerCount: 1,
        inventoryBucket: "signals_available_needs_truth_review",
        missingData: [],
        cupWinnerSignals: 1
      },
      {
        competitionSlug: "ggg.gap",
        competitionType: "registry_gap",
        providers: [],
        providerCount: 0,
        inventoryBucket: "discovered_no_actionable_signal",
        missingData: []
      }
    ]
  };

  const board = buildFullMapAutonomyBoard(inventory);
  const bySlug = Object.fromEntries(board.rows.map((row) => [row.competitionSlug, row]));

  if (board.summary.competitionCount !== 7) {
    throw new Error(`expected 7 rows, got ${board.summary.competitionCount}`);
  }

  if (bySlug["aaa.1"].actionBucket !== "standings_provider_batch_needed") {
    throw new Error("aaa.1 should need standings provider batch");
  }

  if (bySlug["bbb.cup"].actionBucket !== "cup_winner_final_state_needed") {
    throw new Error("bbb.cup should need cup winner final state");
  }

  if (bySlug["ccc.2"].actionBucket !== "standings_discovery_or_provider_validation_needed") {
    throw new Error("ccc.2 should move to standings discovery/provider validation without trusted provider");
  }

  if (bySlug["ddd.1"].actionBucket !== "blocked_no_action") {
    throw new Error("ddd.1 should be blocked");
  }

  if (bySlug["eee.1"].actionBucket !== "no_action_covered") {
    throw new Error("eee.1 should be covered");
  }

  if (bySlug["fff.cup"].actionBucket !== "truth_review_signal_batch_needed") {
    throw new Error("fff.cup should need truth review signal batch");
  }

  if (bySlug["ggg.gap"].actionBucket !== "registry_gap_review_needed") {
    throw new Error("ggg.gap should need registry-gap review");
  }

  if (board.guarantees.actualWrites !== 0 || board.guarantees.canonicalWrites !== 0) {
    throw new Error("read-only guarantees failed");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "passed",
    summary: board.summary,
    actionBuckets: board.actionBuckets,
    nextRecommendedAction: board.nextRecommendedAction,
    guarantees: board.guarantees
  }, null, 2));
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.input) throw new Error("Missing required --input");
  if (!args.output) throw new Error("Missing required --output");

  const inventory = readJson(args.input);
  const board = buildFullMapAutonomyBoard(inventory);

  writeJson(args.output, board);

  console.log(JSON.stringify({
    output: args.output,
    summary: board.summary,
    actionBuckets: Object.fromEntries(
      Object.entries(board.actionBuckets).map(([key, values]) => [key, values.length])
    ),
    intentNeeds: Object.fromEntries(
      Object.entries(board.intentNeeds).map(([key, values]) => [key, values.length])
    ),
    nextRecommendedAction: board.nextRecommendedAction,
    guarantees: board.guarantees
  }, null, 2));
}

main();
