#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input") {
      args.input = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--output") {
      args.output = argv[index + 1] || "";
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.input) {
    throw new Error("Missing required --input");
  }

  if (!args.output) {
    throw new Error("Missing required --output");
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function numberValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildPlanRow(row) {
  const competitionSlug = stringValue(row.competitionSlug);
  const competitionKind = stringValue(row.competitionKind);
  const readinessStatus = stringValue(row.readinessStatus);
  const expectedNormalizer = stringValue(row.expectedNormalizer);

  const needsStandings = Boolean(row.needsStandings);
  const needsWinnerEvidence = Boolean(row.needsWinnerEvidence);

  const officialMatchCount = numberValue(row.officialMatchCount);
  const discoveredMatchIdCount = numberValue(row.discoveredMatchIdCount);
  const evidenceRowCount = numberValue(row.evidenceRowCount);
  const fixtureLikeRowCount = numberValue(row.fixtureLikeRowCount);
  const resultLikeRowCount = numberValue(row.resultLikeRowCount);
  const standingLikeRowCount = numberValue(row.standingLikeRowCount);
  const winnerLikeRowCount = numberValue(row.winnerLikeRowCount);
  const structuredRowCount = numberValue(row.structuredRowCount);

  const sourceEvidenceStrength =
    officialMatchCount > 0 ||
    discoveredMatchIdCount > 0 ||
    evidenceRowCount > 0 ||
    fixtureLikeRowCount > 0 ||
    resultLikeRowCount > 0 ||
    structuredRowCount > 0;

  let requiredNormalizedOutputs = [];

  if (competitionKind === "league") {
    requiredNormalizedOutputs = [
      "normalizedFixtureRows",
      "normalizedResultRows",
      "normalizedStandingsRows",
      "seasonStateEvidenceRows",
      "readinessValidationRows",
    ];
  } else if (competitionKind === "cup") {
    requiredNormalizedOutputs = [
      "normalizedFixtureRows",
      "normalizedResultRows",
      "cupFinalEvidenceRows",
      "cupWinnerEvidenceRows",
      "readinessValidationRows",
    ];
  } else {
    requiredNormalizedOutputs = [
      "normalizedEvidenceRows",
      "readinessValidationRows",
    ];
  }

  const normalizationBlockedReasons = [];

  if (!sourceEvidenceStrength) {
    normalizationBlockedReasons.push("no_source_evidence_strength_detected");
  }

  if (!expectedNormalizer) {
    normalizationBlockedReasons.push("missing_expected_normalizer");
  }

  if (competitionKind === "league" && !needsStandings) {
    normalizationBlockedReasons.push("league_missing_needs_standings_flag");
  }

  if (competitionKind === "cup" && !needsWinnerEvidence) {
    normalizationBlockedReasons.push("cup_missing_needs_winner_evidence_flag");
  }

  if (readinessStatus.startsWith("FAIL")) {
    normalizationBlockedReasons.push("readiness_status_failed");
  }

  const canBuildNormalizer = normalizationBlockedReasons.length === 0;
  const canonicalReady = false;

  return {
    competitionSlug,
    competitionKind,
    readinessStatus,
    officialSource: stringValue(row.officialSource),
    endpoint: stringValue(row.endpoint),
    sourceUrl: stringValue(row.sourceUrl),
    competitionId: stringValue(row.competitionId),
    categoryId: stringValue(row.categoryId),
    seasonId: stringValue(row.seasonId),
    officialMatchCount,
    discoveredMatchIdCount,
    evidenceRowCount,
    fixtureLikeRowCount,
    resultLikeRowCount,
    standingLikeRowCount,
    winnerLikeRowCount,
    structuredRowCount,
    needsStandings,
    needsWinnerEvidence,
    expectedNormalizer,
    requiredNormalizedOutputs,
    canBuildNormalizer,
    canonicalReady,
    normalizationBlockedReasons,
    recommendedImplementation: {
      mode: "new_read_only_normalizer_adapter",
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      outputOnly: true,
      nextAction: stringValue(row.nextAction) || "build_read_only_normalizer_then_validate",
    },
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const readinessRows = asArray(input.readinessRows);

  if (readinessRows.length === 0) {
    throw new Error("Input has no readinessRows");
  }

  const planRows = readinessRows.map(buildPlanRow);
  const blockedRows = planRows.filter((row) => row.normalizationBlockedReasons.length > 0);
  const buildableRows = planRows.filter((row) => row.canBuildNormalizer);
  const leagueRows = planRows.filter((row) => row.competitionKind === "league");
  const cupRows = planRows.filter((row) => row.competitionKind === "cup");

  const summary = {
    ok: blockedRows.length === 0,
    generatedAt: new Date().toISOString(),
    inputReadinessRowCount: readinessRows.length,
    planRowCount: planRows.length,
    buildableNormalizerCount: buildableRows.length,
    blockedNormalizerCount: blockedRows.length,
    canonicalReadyCount: planRows.filter((row) => row.canonicalReady).length,
    leagueRowCount: leagueRows.length,
    cupRowCount: cupRows.length,
    conclusion:
      blockedRows.length === 0
        ? "All acquired UEFA source rows can proceed to read-only normalizer implementation. None are canonical-ready."
        : "At least one acquired UEFA source row is blocked before normalizer implementation.",
    sourceFetch: false,
    noSearch: true,
    noFetch: true,
    noPost: true,
    noPatch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
  };

  const output = {
    ok: summary.ok,
    generatedAt: summary.generatedAt,
    summary,
    planRows,
    buildableRows,
    blockedRows,
    leagueRows,
    cupRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noPost: true,
      noUrlFetch: true,
      noPatch: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true,
    },
  };

  writeJson(args.output, output);
}

main();
