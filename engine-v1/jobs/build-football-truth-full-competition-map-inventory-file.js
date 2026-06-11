#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    input: "",
    currentBoard: "",
    output: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--current-board") args.currentBoard = argv[++i];
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

function normalizeProviders(providers) {
  if (Array.isArray(providers)) {
    return unique(providers.map((provider) => String(provider).trim()).filter(Boolean)).sort();
  }

  if (providers && typeof providers === "object") {
    return unique(Object.keys(providers).map((provider) => String(provider).trim()).filter(Boolean)).sort();
  }

  return [];
}

function isLikelyCompetitionSlug(slug) {
  return typeof slug === "string" &&
    (/^[a-z]{2,3}(\.[a-z0-9-]+)+$/.test(slug) || /^[a-z]{2,3}\.[0-9]+$/.test(slug) || /^[a-z]{2,3}\.cup$/.test(slug));
}

function inferCompetitionType(slug) {
  if (slug.endsWith(".cup")) return "cup";
  if (slug.includes(".champions") || slug.includes(".confed") || slug.includes(".nations")) return "continental_or_international";
  if (/\.[0-9]+$/.test(slug)) return "league";
  if (slug.endsWith(".gap")) return "registry_gap";
  return "unknown";
}

function buildCurrentBoardIndexes(currentBoard) {
  const indexes = {
    providerContractByCompetition: new Map(),
    competitionStateBySlug: new Map(),
    missingDataBySlug: new Map(),
    promotionReadinessBySlug: new Map()
  };

  for (const row of currentBoard.providerContractBoardRows || currentBoard.providerContractBoard || []) {
    for (const slug of row.competitions || row.competitionSlugs || []) {
      indexes.providerContractByCompetition.set(slug, row);
    }
  }

  for (const row of currentBoard.competitionStateBoardRows || currentBoard.competitionStateBoard || currentBoard.rows || []) {
    const slug = row.competitionSlug || row.slug;
    if (slug) indexes.competitionStateBySlug.set(slug, row);
  }

  for (const row of currentBoard.missingDataBoardRows || currentBoard.missingDataBoard || []) {
    const slug = row.competitionSlug || row.slug;
    if (slug) indexes.missingDataBySlug.set(slug, row);
  }

  for (const row of currentBoard.promotionReadinessBoardRows || currentBoard.promotionReadinessBoard || []) {
    const slug = row.competitionSlug || row.slug;
    if (slug) indexes.promotionReadinessBySlug.set(slug, row);
  }

  return indexes;
}

function normalizeFullMapRow(row, currentIndexes) {
  const slug = row.slug || row.competitionSlug;
  const providers = normalizeProviders(row.providers);

  const currentState = currentIndexes.competitionStateBySlug.get(slug) || null;
  const currentMissing = currentIndexes.missingDataBySlug.get(slug) || null;
  const currentProviderContract = currentIndexes.providerContractByCompetition.get(slug) || null;
  const currentPromotion = currentIndexes.promotionReadinessBySlug.get(slug) || null;

  const promoted = row.promoted && typeof row.promoted === "object" ? row.promoted : {};
  const blocked = row.blocked && typeof row.blocked === "object" ? row.blocked : {};

  const canonicalFixtureRows = Number(row.canonicalFixtureRows || 0);
  const canonicalStandingRows = Number(row.canonicalStandingRows || 0);
  const fixtureSignals = Number(row.fixtureSignals || 0);
  const standingSignals = Number(row.standingSignals || 0);
  const cupWinnerSignals = Number(row.cupWinnerSignals || 0);

  const competitionType = inferCompetitionType(slug);

  const currentCoverageOverlay = currentState ? {
    hasCurrentOverlay: true,
    seasonState: currentState.seasonState || "unknown",
    canonicalFixtureRows: currentState.canonicalFixtureRows ?? null,
    canonicalStandingRows: currentState.canonicalStandingRows ?? null,
    cupWinnerFinalState: currentState.cupWinnerFinalState ?? null,
    canonicalCoverageStatus: currentState.canonicalCoverageStatus || null,
    nextAllowedAction: currentState.nextAllowedAction || null
  } : {
    hasCurrentOverlay: false
  };

  const missingData = unique([
    ...(Array.isArray(currentMissing?.missingData) ? currentMissing.missingData : []),
    ...(competitionType === "league" && canonicalStandingRows === 0 ? ["canonicalStandings"] : []),
    ...(competitionType === "league" && canonicalFixtureRows === 0 && fixtureSignals > 0 ? ["canonicalFixtures"] : []),
    ...(competitionType === "cup" && !row.cupWinnerState && cupWinnerSignals > 0 ? ["cupWinnerFinalState"] : [])
  ]).sort();

  const inventoryBucket = (() => {
    if (currentCoverageOverlay.hasCurrentOverlay) return "current_intelligence_overlay_available";
    if (Object.keys(blocked).length > 0) return "blocked_carry_forward_or_contract_gap";
    if (Object.keys(promoted).some((key) => promoted[key] === true)) return "promoted_or_partially_promoted";
    if (missingData.length > 0) return "full_map_missing_required_data";
    if (fixtureSignals > 0 || standingSignals > 0 || cupWinnerSignals > 0) return "signals_available_needs_truth_review";
    return "discovered_no_actionable_signal";
  })();

  return {
    competitionSlug: slug,
    competitionType,
    providers,
    providerCount: providers.length,
    fixtureSignals,
    standingSignals,
    cupWinnerSignals,
    canonicalFixtureRows,
    canonicalStandingRows,
    cupWinnerState: row.cupWinnerState === true,
    promoted,
    blocked,
    sourceFiles: Array.isArray(row.sourceFiles) ? row.sourceFiles.slice(0, 20) : [],
    inventoryBucket,
    missingData,
    currentCoverageOverlay,
    currentProviderContract: currentProviderContract ? {
      providerId: currentProviderContract.providerId || currentProviderContract.provider || "unknown",
      status: currentProviderContract.status || currentProviderContract.contractStatus || null,
      sourceType: currentProviderContract.sourceType || null
    } : null,
    currentPromotionOverlay: currentPromotion ? {
      promotionStatus: currentPromotion.promotionStatus || currentPromotion.status || null,
      readyForPromotion: currentPromotion.readyForPromotion ?? null
    } : null,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildFullCompetitionMapInventory(fullMapBoard, currentBoard = {}) {
  if (!Array.isArray(fullMapBoard.allRows)) {
    throw new Error("Input full-map board must contain allRows array");
  }

  const currentIndexes = buildCurrentBoardIndexes(currentBoard);

  const rows = [];
  const duplicateSlugs = [];
  const seen = new Set();

  for (const rawRow of fullMapBoard.allRows) {
    const slug = rawRow.slug || rawRow.competitionSlug;

    if (!isLikelyCompetitionSlug(slug)) continue;

    if (seen.has(slug)) {
      duplicateSlugs.push(slug);
      continue;
    }

    seen.add(slug);
    rows.push(normalizeFullMapRow(rawRow, currentIndexes));
  }

  rows.sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const byInventoryBucket = rows.reduce((acc, row) => {
    acc[row.inventoryBucket] ||= [];
    acc[row.inventoryBucket].push(row.competitionSlug);
    return acc;
  }, {});

  const byCompetitionType = rows.reduce((acc, row) => {
    acc[row.competitionType] ||= 0;
    acc[row.competitionType] += 1;
    return acc;
  }, {});

  const byMissingData = rows.reduce((acc, row) => {
    for (const missing of row.missingData) {
      acc[missing] ||= [];
      acc[missing].push(row.competitionSlug);
    }
    return acc;
  }, {});

  const currentOverlaySlugs = rows
    .filter((row) => row.currentCoverageOverlay.hasCurrentOverlay)
    .map((row) => row.competitionSlug);

  return {
    ok: true,
    job: "build-football-truth-full-competition-map-inventory",
    generatedAt: new Date().toISOString(),
    inputSummary: fullMapBoard.summary || {},
    summary: {
      rawAllRowsCount: fullMapBoard.allRows.length,
      normalizedCompetitionCount: rows.length,
      duplicateSlugCount: duplicateSlugs.length,
      currentOverlayCompetitionCount: currentOverlaySlugs.length,
      inventoryBucketCount: Object.keys(byInventoryBucket).length,
      competitionTypeCount: Object.keys(byCompetitionType).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byCompetitionType,
    byInventoryBucket,
    byMissingData,
    currentOverlaySlugs,
    duplicateSlugs,
    rows,
    policy: {
      purpose: "Normalize the full discovered competition map into inventory rows before autonomy/provider repair planning.",
      inputContract: "Consumes full-map allRows plus optional current intelligence board overlay.",
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
  const fullMapBoard = {
    summary: { discoveredCompetitionSlugs: 4 },
    allRows: [
      {
        slug: "aaa.1",
        providers: ["official.example"],
        promoted: {},
        blocked: {},
        fixtureSignals: 3,
        standingSignals: 1,
        cupWinnerSignals: 0,
        canonicalFixtureRows: 0,
        canonicalStandingRows: 0,
        cupWinnerState: false,
        sourceFiles: ["a.json"]
      },
      {
        slug: "bbb.cup",
        providers: ["cup.example"],
        promoted: {},
        blocked: {},
        fixtureSignals: 0,
        standingSignals: 0,
        cupWinnerSignals: 2,
        canonicalFixtureRows: 0,
        canonicalStandingRows: 0,
        cupWinnerState: false,
        sourceFiles: ["b.json"]
      },
      {
        slug: "ccc.2",
        providers: [],
        promoted: { fixtures: true },
        blocked: {},
        fixtureSignals: 0,
        standingSignals: 0,
        cupWinnerSignals: 0,
        canonicalFixtureRows: 10,
        canonicalStandingRows: 0,
        cupWinnerState: false
      },
      {
        slug: "ddd.1",
        providers: ["blocked.example"],
        promoted: {},
        blocked: { providerContract: true },
        fixtureSignals: 0,
        standingSignals: 0,
        cupWinnerSignals: 0,
        canonicalFixtureRows: 0,
        canonicalStandingRows: 0,
        cupWinnerState: false
      }
    ]
  };

  const currentBoard = {
    competitionStateBoardRows: [
      {
        competitionSlug: "aaa.1",
        seasonState: "active",
        canonicalCoverageStatus: "partial"
      }
    ]
  };

  const report = buildFullCompetitionMapInventory(fullMapBoard, currentBoard);
  const bySlug = Object.fromEntries(report.rows.map((row) => [row.competitionSlug, row]));

  if (report.summary.normalizedCompetitionCount !== 4) {
    throw new Error("expected 4 normalized rows");
  }
  if (!bySlug["aaa.1"].currentCoverageOverlay.hasCurrentOverlay) {
    throw new Error("current overlay failed");
  }
  if (!bySlug["bbb.cup"].missingData.includes("cupWinnerFinalState")) {
    throw new Error("cup winner missing data inference failed");
  }
  if (bySlug["ddd.1"].inventoryBucket !== "blocked_carry_forward_or_contract_gap") {
    throw new Error("blocked bucket failed");
  }
  if (report.guarantees.actualWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("read-only guarantees failed");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "passed",
    summary: report.summary,
    byCompetitionType: report.byCompetitionType,
    byInventoryBucket: report.byInventoryBucket,
    byMissingData: report.byMissingData,
    guarantees: report.guarantees
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

  const fullMapBoard = readJson(args.input);
  const currentBoard = args.currentBoard ? readJson(args.currentBoard) : {};

  const report = buildFullCompetitionMapInventory(fullMapBoard, currentBoard);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    byCompetitionType: report.byCompetitionType,
    byInventoryBucket: report.byInventoryBucket,
    byMissingDataCounts: Object.fromEntries(Object.entries(report.byMissingData).map(([key, value]) => [key, value.length])),
    currentOverlaySlugs: report.currentOverlaySlugs,
    guarantees: report.guarantees
  }, null, 2));
}

main();
