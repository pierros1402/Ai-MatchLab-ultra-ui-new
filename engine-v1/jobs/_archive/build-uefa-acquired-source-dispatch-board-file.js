#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    plan: "",
    normalized: [],
    output: "",
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--plan") {
      args.plan = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--plan=")) {
      args.plan = arg.slice("--plan=".length);
      continue;
    }

    if (arg === "--normalized") {
      args.normalized.push(argv[++index] || "");
      continue;
    }

    if (arg.startsWith("--normalized=")) {
      args.normalized.push(arg.slice("--normalized=".length));
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.plan) {
    throw new Error("Missing required --plan");
  }

  if (!args.selfTest && !args.output) {
    throw new Error("Missing required --output");
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function planRowsOf(json) {
  if (Array.isArray(json)) return json;

  for (const key of ["planRows", "normalizationPlanRows", "buildableRows", "readinessRows", "rows", "items"]) {
    if (Array.isArray(json?.[key])) return json[key];
  }

  return [];
}

function normalizedFixtureRowsOf(json) {
  if (Array.isArray(json)) return json;

  for (const key of ["normalizedFixtureRows", "fixtureRows", "rows", "items"]) {
    if (Array.isArray(json?.[key])) return json[key];
  }

  return [];
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function isCupSlug(slug) {
  return /(^|\.)(cup|taca|pokal|beker|coupe)($|\.)/i.test(slug);
}

function finalLikeRowsOf(rows) {
  return rows.filter((row) => {
    const text = [
      row.roundName,
      row.stageName,
      row.groupName,
      row.phaseName,
      row.matchLabel
    ].map(asText).join(" ");

    return /final|finaali|loppu|loppuottelu|finale|finał/i.test(text);
  });
}

function teamCountOf(rows) {
  const teams = new Set();
  for (const row of rows) {
    const home = asText(row.homeTeamName);
    const away = asText(row.awayTeamName);
    if (home) teams.add(home);
    if (away) teams.add(away);
  }
  return teams.size;
}

function inferDispatch({ planRow, normalizedRows }) {
  const competitionSlug = asText(planRow.competitionSlug || planRow.leagueSlug);
  const competitionKind = asText(planRow.competitionKind) || (isCupSlug(competitionSlug) ? "cup" : "league");
  const readinessStatus = asText(planRow.readinessStatus);
  const expectedNormalizer = asText(planRow.expectedNormalizer);
  const canBuildNormalizer = planRow.canBuildNormalizer === true;
  const needsStandings = planRow.needsStandings === true;
  const needsWinnerEvidence = planRow.needsWinnerEvidence === true;
  const canonicalReady = planRow.canonicalReady === true;
  const recommended = planRow.recommendedImplementation && typeof planRow.recommendedImplementation === "object"
    ? planRow.recommendedImplementation
    : {};

  const finalLikeRows = finalLikeRowsOf(normalizedRows);
  const normalizedFixtureRowCount = normalizedRows.length;
  const normalizedResultRowCount = normalizedRows.filter((row) => row.normalizedStatus === "finished" || row.rawHasResult === true).length;
  const normalizedScheduledRowCount = normalizedRows.filter((row) => row.normalizedStatus === "scheduled").length;

  let dispatchBucket = "needs_batch_normalization";
  let nextAutomatedJob = asText(recommended.nextAction) || "provider_specific_read_only_normalizer";
  let priority = 50;

  if (canonicalReady) {
    dispatchBucket = "already_canonical_ready";
    nextAutomatedJob = "none";
    priority = 100;
  } else if (normalizedFixtureRowCount > 0 && competitionKind === "cup" && finalLikeRows.length > 0) {
    dispatchBucket = "cup_final_winner_first_source_ready_needs_second_source";
    nextAutomatedJob = "materialize_coverage_competition_state_second_source_tasks";
    priority = 10;
  } else if (normalizedFixtureRowCount > 0 && competitionKind === "cup") {
    dispatchBucket = "cup_rows_normalized_needs_final_winner_detection";
    nextAutomatedJob = "detect_cup_final_winner_from_normalized_rows";
    priority = 20;
  } else if (normalizedFixtureRowCount > 0 && competitionKind === "league" && needsStandings) {
    dispatchBucket = "league_schedule_shape_available_needs_current_standings";
    nextAutomatedJob = "standings_readiness_or_second_source_standings_tasks";
    priority = 15;
  } else if (normalizedFixtureRowCount > 0 && competitionKind === "league") {
    dispatchBucket = "league_rows_normalized_needs_season_state_validation";
    nextAutomatedJob = "season_state_readiness_validation";
    priority = 25;
  } else if (canBuildNormalizer && /PARSER_REFINEMENT_REQUIRED/i.test(readinessStatus)) {
    dispatchBucket = "source_ready_parser_refinement_required";
    nextAutomatedJob = asText(recommended.nextAction) || "refine_provider_parser_then_normalize";
    priority = 30;
  } else if (canBuildNormalizer && /VALIDATE_NON_NULL_PAYLOAD/i.test(readinessStatus)) {
    dispatchBucket = "source_ready_validate_payload_then_normalize";
    nextAutomatedJob = asText(recommended.nextAction) || "validate_payload_then_normalize";
    priority = 35;
  } else if (canBuildNormalizer) {
    dispatchBucket = "source_ready_needs_read_only_normalizer";
    nextAutomatedJob = asText(recommended.nextAction) || "provider_specific_read_only_normalizer";
    priority = 40;
  } else {
    dispatchBucket = "blocked_needs_source_or_parser_recovery";
    nextAutomatedJob = "recovery_or_source_search";
    priority = 90;
  }

  return {
    competitionSlug,
    competitionKind,
    officialSource: asText(planRow.officialSource),
    endpoint: asText(planRow.endpoint),
    sourceUrl: asText(planRow.sourceUrl),
    competitionId: asText(planRow.competitionId),
    categoryId: asText(planRow.categoryId),
    seasonId: asText(planRow.seasonId),
    readinessStatus,
    expectedNormalizer,
    requiredNormalizedOutputs: asArray(planRow.requiredNormalizedOutputs).map(asText).filter(Boolean),
    needsStandings,
    needsWinnerEvidence,
    canBuildNormalizer,
    canonicalReady,
    officialMatchCount: Number(planRow.officialMatchCount || 0),
    discoveredMatchIdCount: Number(planRow.discoveredMatchIdCount || 0),
    fixtureLikeRowCount: Number(planRow.fixtureLikeRowCount || 0),
    resultLikeRowCount: Number(planRow.resultLikeRowCount || 0),
    standingLikeRowCount: Number(planRow.standingLikeRowCount || 0),
    winnerLikeRowCount: Number(planRow.winnerLikeRowCount || 0),
    structuredRowCount: Number(planRow.structuredRowCount || 0),
    normalizedFixtureRowCount,
    normalizedResultRowCount,
    normalizedScheduledRowCount,
    normalizedTeamCount: teamCountOf(normalizedRows),
    normalizedFinalLikeRowCount: finalLikeRows.length,
    dispatchBucket,
    nextAutomatedJob,
    priority,
    recommendedImplementation: recommended,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      diagnosticOnly: true
    }
  };
}

function buildReport({ planInput, normalizedInputs = [] }, inputPaths = {}) {
  const planRows = planRowsOf(planInput);
  const normalizedRows = normalizedInputs.flatMap(normalizedFixtureRowsOf);

  const normalizedBySlug = new Map();
  for (const row of normalizedRows) {
    const slug = asText(row.competitionSlug || row.leagueSlug);
    if (!slug) continue;
    if (!normalizedBySlug.has(slug)) normalizedBySlug.set(slug, []);
    normalizedBySlug.get(slug).push(row);
  }

  const dispatchRows = planRows.map((planRow) => {
    const slug = asText(planRow.competitionSlug || planRow.leagueSlug);
    return inferDispatch({
      planRow,
      normalizedRows: normalizedBySlug.get(slug) || []
    });
  }).sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  return {
    ok: true,
    job: "build-uefa-acquired-source-dispatch-board-file",
    generatedAt: new Date().toISOString(),
    inputPaths,
    summary: {
      planRowCount: planRows.length,
      normalizedInputRowCount: normalizedRows.length,
      dispatchRowCount: dispatchRows.length,
      byDispatchBucket: countBy(dispatchRows, "dispatchBucket"),
      byCompetitionKind: countBy(dispatchRows, "competitionKind"),
      sourceReadyCount: dispatchRows.filter((row) => row.canBuildNormalizer === true).length,
      alreadyNormalizedCompetitionCount: dispatchRows.filter((row) => row.normalizedFixtureRowCount > 0).length,
      needsStandingsCount: dispatchRows.filter((row) => row.needsStandings === true).length,
      needsWinnerEvidenceCount: dispatchRows.filter((row) => row.needsWinnerEvidence === true).length,
      canonicalReadyCount: dispatchRows.filter((row) => row.canonicalReady === true).length,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    dispatchRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function runSelfTest() {
  const report = buildReport({
    planInput: {
      planRows: [
        {
          competitionSlug: "fin.2",
          competitionKind: "league",
          officialSource: "Palloliitto Tulospalvelu / Torneopal API",
          endpoint: "https://palloliitto.torneopal.fi/taso/rest",
          sourceUrl: "https://tulospalvelu.palloliitto.fi/category/M1L!spljp26/results",
          officialMatchCount: 135,
          needsStandings: true,
          needsWinnerEvidence: false,
          canBuildNormalizer: true,
          canonicalReady: false,
          readinessStatus: "SOURCE_READY_NORMALIZER_REQUIRED",
          expectedNormalizer: "Palloliitto/Torneopal getMatches normalizer"
        },
        {
          competitionSlug: "cro.cup",
          competitionKind: "cup",
          needsWinnerEvidence: true,
          canBuildNormalizer: true,
          canonicalReady: false,
          readinessStatus: "SOURCE_READY_PARSER_REFINEMENT_REQUIRED"
        }
      ]
    },
    normalizedInputs: [
      {
        normalizedFixtureRows: [
          { competitionSlug: "fin.2", homeTeamName: "A", awayTeamName: "B", normalizedStatus: "scheduled" }
        ]
      }
    ]
  }, {
    plan: "self-test-plan",
    normalized: ["self-test-normalized"]
  });

  if (report.summary.planRowCount !== 2) throw new Error("expected two plan rows");
  if (report.summary.normalizedInputRowCount !== 1) throw new Error("expected one normalized input row");
  if (report.dispatchRows[0].competitionSlug !== "fin.2") throw new Error("expected fin.2 priority first");
  if (report.dispatchRows[0].dispatchBucket !== "league_schedule_shape_available_needs_current_standings") {
    throw new Error("expected standings bucket for fin.2");
  }
  if (report.dispatchRows[1].dispatchBucket !== "source_ready_parser_refinement_required") {
    throw new Error("expected parser refinement bucket for cro.cup");
  }
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "build-uefa-acquired-source-dispatch-board-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const planInput = readJson(args.plan);
  const normalizedInputs = args.normalized.filter(Boolean).map(readJson);
  const report = buildReport({
    planInput,
    normalizedInputs
  }, {
    plan: args.plan,
    normalized: args.normalized
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export {
  buildReport,
  inferDispatch,
  planRowsOf,
  normalizedFixtureRowsOf
};
