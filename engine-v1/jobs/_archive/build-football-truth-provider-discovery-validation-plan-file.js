import fs from "fs";
import path from "path";

function parseArgs(argv) {
  const args = {
    selfTest: false,
    input: "",
    output: "",
    batchSize: 50
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else if (arg === "--batch-size") args.batchSize = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.batchSize) || args.batchSize <= 0) {
    throw new Error(`Invalid --batch-size: ${args.batchSize}`);
  }

  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function objectKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value);
}

function countBy(rows, getKey) {
  return rows.reduce((acc, row) => {
    const key = getKey(row) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function groupValues(rows, getKey, getValue = (row) => row.competitionSlug) {
  return rows.reduce((acc, row) => {
    const key = getKey(row) || "unknown";
    acc[key] ||= [];
    acc[key].push(getValue(row));
    return acc;
  }, {});
}

function priorityBand(row) {
  const priority = Number(row.priority ?? 999);

  if (row.seasonState === "active") return "p0_active_now";
  if (priority <= 1) return "p1_high";
  if (priority <= 3) return "p2_medium";
  return "p3_broad_map";
}

function providerSignalClass(row) {
  const trusted = asArray(row.trustedProviderIds);
  const noisy = asArray(row.noisyProviderSignals);
  const raw = asArray(row.rawProviderSignals);
  const providers = asArray(row.providers);

  if (trusted.length > 0) return "has_trusted_provider_signal";
  if (noisy.length > 0) return "has_noisy_provider_signal";
  if (raw.length > 0 || providers.length > 0) return "has_untrusted_provider_signal";
  if (row.providerId && row.providerId !== "unknown_untrusted_provider_signal") return "has_provider_id_but_untrusted";
  return "no_provider_signal";
}

function discoveryLane(row) {
  if (row.intentNeed === "official_standings") return "official_standings_provider_discovery";
  if (row.intentNeed === "official_fixtures") return "official_fixture_provider_discovery";
  return "official_competition_provider_discovery";
}

function buildSearchIntent(row) {
  const slug = row.competitionSlug;
  const type = row.competitionType || "competition";
  const state = row.seasonState || "unknown";

  return {
    queryTemplates: [
      `${slug} official ${type} standings table`,
      `${slug} federation official standings`,
      `${slug} league official table ${state === "active" ? "current season" : "season"}`
    ],
    mustFind: [
      "official competition/federation/league source",
      "standings/table page or structured endpoint",
      "season-specific evidence",
      "source date or current-season marker where available"
    ],
    rejectIf: [
      "aggregator-only evidence without official source",
      "advertising/login/commerce/noisy provider domain",
      "fixture-only page with no standings/table evidence",
      "stale season page without season marker"
    ]
  };
}

function buildEvidenceContract(row) {
  return {
    requiredValue: "official_standings_provider_candidate",
    minimumEvidenceCount: 2,
    requiredConvergence: [
      "official source identity",
      "competition slug/name match",
      "season/current-state match",
      "standings/table availability or explicit no-standings official state"
    ],
    confidenceFloorForPromotion: 0.8,
    promotionBlockedUntil: [
      "official URL/provider route is validated",
      "source is not in noisy/untrusted category",
      "season and competition identity are reconciled",
      "canonical standings write contract exists"
    ],
    outputMustCarry: [
      "value",
      "confidence",
      "source convergence",
      "metadata",
      "provider/source route",
      "rejection reason if no valid source found"
    ]
  };
}

function buildDiscoveryRow(row, index) {
  const sourceBasis = row.sourceBasis || {};
  const signalClass = providerSignalClass(row);
  const lane = discoveryLane(row);

  return {
    index,
    competitionSlug: row.competitionSlug,
    competitionType: row.competitionType || "unknown",
    seasonState: row.seasonState || "unknown",
    priority: row.priority ?? null,
    priorityBand: priorityBand(row),
    confidence: row.confidence ?? null,
    intentNeed: row.intentNeed || "unknown",
    actionBucket: row.actionBucket || row.memoryAwareActionBucket || "unknown",
    executionBucket: row.executionBucket,
    actionableNow: row.actionableNow === true,
    lane,
    providerId: row.providerId || "unknown",
    providerSignalClass: signalClass,
    providers: asArray(row.providers),
    trustedProviderIds: asArray(row.trustedProviderIds),
    noisyProviderSignals: asArray(row.noisyProviderSignals),
    rawProviderSignals: asArray(row.rawProviderSignals),
    missingData: asArray(sourceBasis.missingData),
    sourceBasisKeys: objectKeys(sourceBasis),
    currentProviderContract: sourceBasis.currentProviderContract ?? null,
    currentPromotionOverlay: sourceBasis.currentPromotionOverlay ?? null,
    blocked: sourceBasis.blocked ?? false,
    promoted: sourceBasis.promoted ?? false,
    requiredData: asArray(row.requiredData),
    memoryOverlayStatus: row.memoryOverlayStatus || "unknown",
    memoryRecordsCount: asArray(row.memoryRecords).length,
    discoveryIntent: buildSearchIntent(row),
    evidenceContract: buildEvidenceContract(row),
    nextSafeJobType: "provider_discovery_validation_search_target_plan",
    reason: row.executionReason || "Provider discovery/validation candidate from memory-aware refinement.",
    canonicalWrites: 0,
    productionWrite: false
  };
}

function chunkRows(rows, size) {
  const chunks = [];

  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    chunks.push({
      batchId: `provider-discovery-validation-${String(chunks.length + 1).padStart(4, "0")}`,
      indexStart: i,
      indexEnd: i + chunk.length - 1,
      count: chunk.length,
      priorityBands: countBy(chunk, (row) => row.priorityBand),
      competitionTypes: countBy(chunk, (row) => row.competitionType),
      seasonStates: countBy(chunk, (row) => row.seasonState),
      providerSignalClasses: countBy(chunk, (row) => row.providerSignalClass),
      competitions: chunk.map((row) => row.competitionSlug),
      nextSafeJobType: "provider_discovery_validation_search_target_plan"
    });
  }

  return chunks;
}

function buildProviderDiscoveryValidationPlan(refinementBoard, options = {}) {
  const rows = asArray(refinementBoard.rows);
  const batchSize = options.batchSize || 50;

  const candidateRows = rows
    .filter((row) => {
      return row.executionBucket === "provider_discovery_validation_batch_candidate" &&
        row.actionableNow === true;
    })
    .map(buildDiscoveryRow);

  const sortedRows = candidateRows.sort((a, b) => {
    const band = String(a.priorityBand).localeCompare(String(b.priorityBand));
    if (band !== 0) return band;

    const priorityA = Number(a.priority ?? 999);
    const priorityB = Number(b.priority ?? 999);
    if (priorityA !== priorityB) return priorityA - priorityB;

    return String(a.competitionSlug).localeCompare(String(b.competitionSlug));
  });

  const byPriorityBand = groupValues(sortedRows, (row) => row.priorityBand);
  const byCompetitionType = groupValues(sortedRows, (row) => row.competitionType);
  const bySeasonState = groupValues(sortedRows, (row) => row.seasonState);
  const byProviderSignalClass = groupValues(sortedRows, (row) => row.providerSignalClass);
  const byLane = groupValues(sortedRows, (row) => row.lane);
  const batchGroups = chunkRows(sortedRows, batchSize);

  const nonCandidateBuckets = countBy(rows, (row) => row.executionBucket || "unknown");

  return {
    ok: true,
    job: "build-football-truth-provider-discovery-validation-plan-file",
    generatedAt: new Date().toISOString(),
    inputSummary: refinementBoard.summary || {},
    summary: {
      inputCompetitionCount: rows.length,
      discoveryValidationCandidateCount: sortedRows.length,
      batchSize,
      batchCount: batchGroups.length,
      priorityBandCount: Object.keys(byPriorityBand).length,
      competitionTypeCount: Object.keys(byCompetitionType).length,
      seasonStateCount: Object.keys(bySeasonState).length,
      providerSignalClassCount: Object.keys(byProviderSignalClass).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byPriorityBand,
    byCompetitionType,
    bySeasonState,
    byProviderSignalClass,
    byLane,
    nonCandidateBucketCounts: nonCandidateBuckets,
    batchGroups,
    discoveryValidationRows: sortedRows,
    nextRecommendedAction: sortedRows.length > 0
      ? {
          type: "provider_discovery_validation_search_target_plan",
          reason: "Convert provider discovery/validation rows into controlled search targets in full-map batches before any fetch or canonical write.",
          firstBatchId: batchGroups[0]?.batchId || null,
          firstBatchCount: batchGroups[0]?.count || 0,
          firstCompetitions: batchGroups[0]?.competitions || []
        }
      : {
          type: "none",
          reason: "No actionable provider discovery/validation candidates found."
        },
    policy: {
      purpose: "Plan full-map official provider discovery/validation for competitions whose canonical standings are missing and current provider signals are absent, noisy, or untrusted.",
      inputContract: "Consumes memory-aware bucket refinement rows and selects only provider_discovery_validation_batch_candidate rows.",
      noFetch: true,
      noSearch: true,
      noCanonicalWrite: true,
      noProductionWrite: true,
      noSingleLeagueDrift: true,
      requiredOutputPerRow: [
        "competitionSlug",
        "priorityBand",
        "intentNeed",
        "providerSignalClass",
        "discoveryIntent",
        "evidenceContract",
        "nextSafeJobType",
        "metadata"
      ]
    },
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      noFetch: true,
      noSearch: true,
      sourceConvergenceRequired: true,
      batchBased: true,
      fullMapLane: "provider_discovery_validation_batch_candidate"
    }
  };
}

function runSelfTest() {
  const input = {
    summary: { competitionCount: 6 },
    rows: [
      {
        competitionSlug: "nor.2",
        competitionType: "league",
        providerId: "unknown_untrusted_provider_signal",
        providers: [],
        trustedProviderIds: [],
        noisyProviderSignals: [],
        rawProviderSignals: [],
        seasonState: "active",
        priority: 1,
        confidence: 0.8,
        executionBucket: "provider_discovery_validation_batch_candidate",
        actionableNow: true,
        intentNeed: "official_standings",
        actionBucket: "standings_discovery_or_provider_validation_needed",
        sourceBasis: { missingData: ["canonicalStandings"], blocked: false, promoted: false },
        requiredData: ["official_standings"]
      },
      {
        competitionSlug: "afg.1",
        competitionType: "league",
        providerId: "unknown_untrusted_provider_signal",
        providers: ["example_untrusted"],
        trustedProviderIds: [],
        noisyProviderSignals: ["ads.example"],
        rawProviderSignals: ["ads.example"],
        seasonState: "unknown",
        priority: 4,
        confidence: 0.7,
        executionBucket: "provider_discovery_validation_batch_candidate",
        actionableNow: true,
        intentNeed: "official_standings",
        sourceBasis: { missingData: ["canonicalStandings"] },
        requiredData: ["official_standings"]
      },
      {
        competitionSlug: "alb.1",
        competitionType: "league",
        executionBucket: "provider_repair_batch_candidate",
        actionableNow: true
      },
      {
        competitionSlug: "bel.cup",
        competitionType: "cup",
        executionBucket: "covered_no_action",
        actionableNow: false
      }
    ]
  };

  const report = buildProviderDiscoveryValidationPlan(input, { batchSize: 1 });

  if (report.summary.discoveryValidationCandidateCount !== 2) {
    throw new Error("Self-test expected 2 discovery validation candidates");
  }

  if (report.summary.batchCount !== 2) {
    throw new Error("Self-test expected 2 batch groups");
  }

  if (report.byPriorityBand.p0_active_now[0] !== "nor.2") {
    throw new Error("Self-test expected nor.2 in active priority band");
  }

  if (!report.byProviderSignalClass.no_provider_signal.includes("nor.2")) {
    throw new Error("Self-test expected nor.2 as no provider signal");
  }

  if (!report.byProviderSignalClass.has_noisy_provider_signal.includes("afg.1")) {
    throw new Error("Self-test expected afg.1 as noisy provider signal");
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("Self-test expected read-only guarantees");
  }

  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    const report = runSelfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: true,
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("Missing required --input");
  if (!args.output) throw new Error("Missing required --output");

  const refinementBoard = readJson(args.input);
  const report = buildProviderDiscoveryValidationPlan(refinementBoard, {
    batchSize: args.batchSize
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    nextRecommendedAction: report.nextRecommendedAction,
    guarantees: report.guarantees
  }, null, 2));
}

main();
