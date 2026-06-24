#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_GATE_INPUT =
  "data/football-truth/_diagnostics/no-write-anchored-season-state-evidence-evaluator-quality-gate-2026-06-14/no-write-anchored-season-state-evidence-evaluator-quality-gate-2026-06-14.json";
const DEFAULT_EVALUATOR_INPUT =
  "data/football-truth/_diagnostics/no-write-anchored-season-state-evidence-evaluator-2026-06-14/no-write-anchored-season-state-evidence-evaluator-2026-06-14.json";
const DEFAULT_SNAPSHOT_INPUT =
  "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/no-write-structured-season-state-stats-extractor-2026-06-14/no-write-structured-season-state-stats-extractor-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const REQUIRED_ROUTE_KINDS = {
  "esp.1": ["official_results", "official_calendar", "official_standings"],
  "esp.2": ["official_results", "official_calendar", "official_standings"],
  "nor.1": ["official_schedule", "official_results", "official_standings"],
  "nor.2": ["official_schedule", "official_results", "official_standings"],
  "swe.1": ["official_source_page", "official_matches", "official_standings"],
  "swe.2": ["official_source_page", "official_matches", "official_standings"]
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    gateInput: DEFAULT_GATE_INPUT,
    evaluatorInput: DEFAULT_EVALUATOR_INPUT,
    snapshotInput: DEFAULT_SNAPSHOT_INPUT,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--gate-input") args.gateInput = argv[++i];
    else if (arg === "--evaluator-input") args.evaluatorInput = argv[++i];
    else if (arg === "--snapshot-input") args.snapshotInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function uniqueSorted(values) {
  return [...new Set(
    values
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
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

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
  }
}

function validateGate(gate) {
  const summary = gate.summary || {};

  assertSummary(summary, "anchoredEvidenceEvaluatorQualityGateCompetitionCount", 6);
  assertSummary(summary, "anchoredEvidenceEvaluatorQualityGatePassedCount", 6);
  assertSummary(summary, "anchoredEvidenceEvaluatorQualityGateBlockedCount", 0);
  assertSummary(summary, "qualityGateReadyForStructuredExtractorCount", 6);
  assertSummary(summary, "qualityGateReadyForClassifierCount", 0);
  assertSummary(summary, "qualityGateReadyForCanonicalWriteCount", 0);
  assertSummary(summary, "qualityGateReadyForTruthAssertionCount", 0);
  assertSummary(summary, "currentSeasonDataCandidateCount", 6);
  assertSummary(summary, "seasonEvidenceCandidateCompetitionCount", 6);
  assertSummary(summary, "fixtureResultEvidenceCandidateCompetitionCount", 6);
  assertSummary(summary, "standingsEvidenceCandidateCompetitionCount", 6);

  assertSummary(summary, "fetchExecutedNowCount", 0);
  assertSummary(summary, "searchExecutedNowCount", 0);
  assertSummary(summary, "broadSearchExecutedNowCount", 0);
  assertSummary(summary, "classifierExecutedNowCount", 0);
  assertSummary(summary, "canonicalWriteExecutedNowCount", 0);
  assertSummary(summary, "productionWriteExecutedNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "seasonStateTruthAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);
  assertSummary(summary, "userHintUsedCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(gate.qualityGateRows) ? gate.qualityGateRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 qualityGateRows, got " + rows.length);

  for (const row of rows) {
    if (row.evidenceEvaluatorQualityGateStatus !== "passed_no_write_anchored_evidence_evaluator_quality_gate") {
      throw new Error(row.competitionSlug + ": evaluator quality gate not passed");
    }
    if (row.qualityGateReadyForStructuredExtractor !== true) {
      throw new Error(row.competitionSlug + ": not ready for structured extractor");
    }
    if (row.qualityGateReadyForClassifier !== false || row.qualityGateReadyForCanonicalWrite !== false) {
      throw new Error(row.competitionSlug + ": classifier/write readiness must be false");
    }
  }

  return rows;
}

function validateEvaluator(evaluator) {
  const summary = evaluator.summary || {};

  assertSummary(summary, "anchoredSeasonStateEvidenceEvaluatorCompetitionCount", 6);
  assertSummary(summary, "anchoredSeasonStateEvidenceEvaluatorReadyCount", 6);
  assertSummary(summary, "anchoredSeasonStateEvidenceEvaluatorBlockedCount", 0);
  assertSummary(summary, "currentSeasonDataCandidateCount", 6);
  assertSummary(summary, "seasonEvidenceCandidateCompetitionCount", 6);
  assertSummary(summary, "fixtureResultEvidenceCandidateCompetitionCount", 6);
  assertSummary(summary, "standingsEvidenceCandidateCompetitionCount", 6);
  assertSummary(summary, "evaluatorMayClassifySeasonStateNowCount", 0);
  assertSummary(summary, "evaluatorMayAssertTruthNowCount", 0);
  assertSummary(summary, "evaluatorMayWriteCanonicalNowCount", 0);

  const rows = Array.isArray(evaluator.evaluatorRows) ? evaluator.evaluatorRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 evaluatorRows, got " + rows.length);

  return rows;
}

function validateSnapshots(run) {
  const summary = run.summary || {};

  assertSummary(summary, "finalScopedControlledRouteAcquisitionRunCompetitionCount", 6);
  assertSummary(summary, "finalScopedControlledRouteAcquisitionRunTargetCount", 18);
  assertSummary(summary, "fetchedSourceSnapshotCount", 18);
  assertSummary(summary, "fetchedOkSnapshotCount", 18);
  assertSummary(summary, "fetchedHttpNotOkSnapshotCount", 0);
  assertSummary(summary, "fetchErrorSnapshotCount", 0);
  assertSummary(summary, "searchExecutedCount", 0);
  assertSummary(summary, "broadSearchExecutedCount", 0);
  assertSummary(summary, "classifierExecutedCount", 0);
  assertSummary(summary, "canonicalWriteExecutedCount", 0);
  assertSummary(summary, "productionWriteExecutedCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "seasonStateTruthAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const snapshots = Array.isArray(run.fetchedSourceSnapshots) ? run.fetchedSourceSnapshots : [];
  if (snapshots.length !== 18) throw new Error("Expected 18 fetchedSourceSnapshots, got " + snapshots.length);

  const slugs = uniqueSorted(snapshots.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected snapshot slugs: " + slugs.join(", "));
  }

  for (const snapshot of snapshots) {
    if (snapshot.fetchStatus !== "fetched_ok" || snapshot.status !== 200 || snapshot.ok !== true) {
      throw new Error(snapshot.competitionSlug + " " + snapshot.routeKind + ": snapshot not fetched_ok HTTP 200");
    }
    if (snapshot.searchExecuted !== false || snapshot.broadSearchExecuted !== false) {
      throw new Error(snapshot.competitionSlug + ": search/broad search must be false");
    }
    if (snapshot.classifierExecuted !== false || snapshot.canonicalWriteExecuted !== false || snapshot.productionWriteExecuted !== false) {
      throw new Error(snapshot.competitionSlug + ": classifier/write flags must be false");
    }
  }

  return snapshots;
}

function stripText(raw) {
  return String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/&aring;/gi, "å")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Aring;/g, "Å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDates(text) {
  const candidates = [];
  const patterns = [
    /\b20[2-3][0-9][-/\.](?:0?[1-9]|1[0-2])[-/\.](?:0?[1-9]|[12][0-9]|3[01])\b/g,
    /\b(?:0?[1-9]|[12][0-9]|3[01])[-/\.](?:0?[1-9]|1[0-2])[-/\.]20[2-3][0-9]\b/g,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(?:0?[1-9]|[12][0-9]|3[01]),?\s+20[2-3][0-9]\b/gi,
    /\b(?:0?[1-9]|[12][0-9]|3[01])\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20[2-3][0-9]\b/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null && candidates.length < 120) {
      candidates.push(match[0]);
    }
  }

  return uniqueSorted(candidates).slice(0, 80);
}

function extractScorePatterns(text) {
  const out = [];
  const patterns = [
    /\b\d{1,2}\s*[-–]\s*\d{1,2}\b/g,
    /\b\d{1,2}\s*:\s*\d{1,2}\b/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null && out.length < 120) {
      out.push(match[0].replace(/\s+/g, ""));
    }
  }

  return uniqueSorted(out).slice(0, 80);
}

function extractRoundPatterns(text) {
  const out = [];
  const patterns = [
    /\bround\s+\d{1,2}\b/gi,
    /\bmatchday\s+\d{1,2}\b/gi,
    /\bjornada\s+\d{1,2}\b/gi,
    /\bomgång\s+\d{1,2}\b/gi,
    /\bomg[aå]ng\s+\d{1,2}\b/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null && out.length < 80) {
      out.push(match[0]);
    }
  }

  return uniqueSorted(out).slice(0, 50);
}

function extractJsonScriptText(raw) {
  const scripts = [];
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(String(raw || ""))) !== null && scripts.length < 80) {
    const body = String(match[1] || "").trim();
    if (!body) continue;
    if (body.includes("__NEXT_DATA__") || body.startsWith("{") || body.startsWith("[") || body.includes("application/ld+json")) {
      scripts.push(body.slice(0, 200000));
    }
  }

  return scripts;
}

function looksLikeFootballObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;

  const keys = Object.keys(obj).map((key) => key.toLowerCase());
  const joined = keys.join(" ");

  const hasTeamKey = /(team|club|squad|home|away|competitor|participant|name)/i.test(joined);
  const hasStandingKey = /(position|rank|points|pts|played|wins|draws|losses|goals|table|standing)/i.test(joined);
  const hasFixtureKey = /(date|kickoff|match|fixture|score|result|home|away|status|round|matchday)/i.test(joined);

  return hasTeamKey && (hasStandingKey || hasFixtureKey);
}

function collectFootballObjects(value, out = [], depth = 0) {
  if (out.length >= 200 || depth > 12 || value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFootballObjects(item, out, depth + 1);
      if (out.length >= 200) break;
    }
    return out;
  }

  if (typeof value === "object") {
    if (looksLikeFootballObject(value)) {
      const shallow = {};
      for (const [key, val] of Object.entries(value)) {
        if (val === null || val === undefined) shallow[key] = val;
        else if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") shallow[key] = val;
        else if (typeof val === "object" && !Array.isArray(val)) {
          const nameLike = val.name || val.fullName || val.shortName || val.displayName || val.teamName;
          if (nameLike) shallow[key] = String(nameLike);
        }
      }
      out.push(shallow);
    }

    for (const val of Object.values(value)) {
      collectFootballObjects(val, out, depth + 1);
      if (out.length >= 200) break;
    }
  }

  return out;
}

function parseJsonCandidates(raw) {
  const objects = [];
  const scripts = extractJsonScriptText(raw);

  for (const script of scripts) {
    let body = script;

    const nextDataStart = body.indexOf("{");
    const nextDataEnd = body.lastIndexOf("}");
    if (nextDataStart >= 0 && nextDataEnd > nextDataStart) {
      body = body.slice(nextDataStart, nextDataEnd + 1);
    }

    try {
      const parsed = JSON.parse(body);
      collectFootballObjects(parsed, objects);
    } catch {
      // Keep parser conservative: unreadable hydration scripts are not absence.
    }

    if (objects.length >= 200) break;
  }

  return objects.slice(0, 200);
}

function groupBySlug(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.competitionSlug)) map.set(row.competitionSlug, []);
    map.get(row.competitionSlug).push(row);
  }
  return map;
}

function routeRole(routeKind) {
  if (routeKind.includes("standing")) return "standings";
  if (routeKind.includes("result")) return "results";
  if (routeKind.includes("calendar") || routeKind.includes("schedule") || routeKind.includes("matches")) return "fixtures";
  return "source";
}

function buildStructuredRow({ gateRow, evaluatorRow, snapshots }) {
  const requiredKinds = REQUIRED_ROUTE_KINDS[gateRow.competitionSlug] || [];
  const presentKinds = uniqueSorted(snapshots.map((row) => row.routeKind));
  const missingKinds = requiredKinds.filter((kind) => !presentKinds.includes(kind));

  const routeSummaries = snapshots.map((snapshot) => {
    const text = stripText(snapshot.rawText || snapshot.textPreview || "");
    const dateCandidates = extractDates(text);
    const scoreCandidates = extractScorePatterns(text);
    const roundCandidates = extractRoundPatterns(text);
    const objectCandidates = parseJsonCandidates(snapshot.rawText || "");

    const role = routeRole(snapshot.routeKind);
    const standingObjectCandidates = role === "standings" ? objectCandidates : [];
    const fixtureObjectCandidates = role === "fixtures" || role === "results" ? objectCandidates : [];

    return {
      competitionSlug: snapshot.competitionSlug,
      reusableFamily: snapshot.reusableFamily,
      routeKind: snapshot.routeKind,
      routeRole: role,
      sourceUrl: snapshot.sourceUrl,
      finalUrl: snapshot.finalUrl,
      fetchStatus: snapshot.fetchStatus,
      status: snapshot.status,
      rawTextLength: snapshot.rawTextLength,
      storedTextLength: snapshot.storedTextLength,
      storedTextSha256: snapshot.storedTextSha256,

      dateCandidateCount: dateCandidates.length,
      scorePatternCandidateCount: scoreCandidates.length,
      roundCandidateCount: roundCandidates.length,
      footballObjectCandidateCount: objectCandidates.length,
      standingObjectCandidateCount: standingObjectCandidates.length,
      fixtureObjectCandidateCount: fixtureObjectCandidates.length,

      dateCandidates: dateCandidates.slice(0, 20),
      scorePatternCandidates: scoreCandidates.slice(0, 20),
      roundCandidates: roundCandidates.slice(0, 20),
      footballObjectCandidateSamples: objectCandidates.slice(0, 8)
    };
  });

  const standingsRoutes = routeSummaries.filter((row) => row.routeRole === "standings");
  const fixtureOrResultRoutes = routeSummaries.filter((row) => row.routeRole === "fixtures" || row.routeRole === "results");

  const dateCandidateCount = routeSummaries.reduce((sum, row) => sum + row.dateCandidateCount, 0);
  const scorePatternCandidateCount = routeSummaries.reduce((sum, row) => sum + row.scorePatternCandidateCount, 0);
  const roundCandidateCount = routeSummaries.reduce((sum, row) => sum + row.roundCandidateCount, 0);
  const footballObjectCandidateCount = routeSummaries.reduce((sum, row) => sum + row.footballObjectCandidateCount, 0);
  const standingObjectCandidateCount = routeSummaries.reduce((sum, row) => sum + row.standingObjectCandidateCount, 0);
  const fixtureObjectCandidateCount = routeSummaries.reduce((sum, row) => sum + row.fixtureObjectCandidateCount, 0);

  const hasRequiredRouteCoverage = missingKinds.length === 0;
  const hasStructuredSeasonCandidate = gateRow.currentSeasonDataCandidate === true && evaluatorRow.currentSeasonDataCandidate === true;
  const hasStructuredStandingsCandidate =
    standingsRoutes.length > 0 &&
    gateRow.standingsEvidenceCandidateCount > 0 &&
    evaluatorRow.standingsEvidenceCandidateCount > 0;
  const hasStructuredFixtureResultCandidate =
    fixtureOrResultRoutes.length > 0 &&
    gateRow.fixtureResultEvidenceCandidateCount > 0 &&
    evaluatorRow.fixtureResultEvidenceCandidateCount > 0;

  const structuredExtractorStatus =
    hasRequiredRouteCoverage &&
    hasStructuredSeasonCandidate &&
    hasStructuredStandingsCandidate &&
    hasStructuredFixtureResultCandidate
      ? "ready_for_no_write_structured_extractor_quality_gate"
      : "blocked_structured_extraction_needs_family_parser_repair";

  const blockingReasons = [];
  if (!hasRequiredRouteCoverage) blockingReasons.push("missing_required_route_coverage");
  if (!hasStructuredSeasonCandidate) blockingReasons.push("missing_structured_season_candidate");
  if (!hasStructuredStandingsCandidate) blockingReasons.push("missing_structured_standings_candidate");
  if (!hasStructuredFixtureResultCandidate) blockingReasons.push("missing_structured_fixture_result_candidate");

  return {
    competitionSlug: gateRow.competitionSlug,
    reusableFamily: gateRow.reusableFamily,
    routeAcquisitionType: gateRow.routeAcquisitionType,
    routeScope: gateRow.routeScope,

    structuredExtractorStatus,
    blockingReasons,
    requiredRouteKinds: requiredKinds,
    presentRouteKinds: presentKinds,
    missingRouteKinds: missingKinds,
    hasRequiredRouteCoverage,

    structuredSeasonStateCandidate: "current_season_data_candidate_needs_no_write_classifier_later",
    structuredSeasonStateCandidateIsTruth: false,
    currentSeasonDataCandidate: gateRow.currentSeasonDataCandidate,
    currentSeasonDataCandidateIsActiveTruth: false,

    hasStructuredSeasonCandidate,
    hasStructuredStandingsCandidate,
    hasStructuredFixtureResultCandidate,
    hasCompletedOrInactiveStructuredCandidate: gateRow.completedOrInactiveEvidenceCandidateCount > 0,
    hasRestartDateStructuredCandidate: gateRow.restartDateEvidenceCandidateCount > 0,

    seasonEvidenceCandidateCount: gateRow.seasonEvidenceCandidateCount,
    fixtureResultEvidenceCandidateCount: gateRow.fixtureResultEvidenceCandidateCount,
    standingsEvidenceCandidateCount: gateRow.standingsEvidenceCandidateCount,
    completedOrInactiveEvidenceCandidateCount: gateRow.completedOrInactiveEvidenceCandidateCount,
    restartDateEvidenceCandidateCount: gateRow.restartDateEvidenceCandidateCount,

    standingsRouteCount: standingsRoutes.length,
    fixtureOrResultRouteCount: fixtureOrResultRoutes.length,
    dateCandidateCount,
    scorePatternCandidateCount,
    roundCandidateCount,
    footballObjectCandidateCount,
    standingObjectCandidateCount,
    fixtureObjectCandidateCount,

    routeSummaries,

    structuredExtractorMayProceedToQualityGate: structuredExtractorStatus === "ready_for_no_write_structured_extractor_quality_gate",
    structuredExtractorMayClassifySeasonStateNow: false,
    structuredExtractorMayAssertTruthNow: false,
    structuredExtractorMayWriteCanonicalNow: false,

    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    seasonStateTruthAssertedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    noMatchTodayDoesNotImplyInactive: true,
    zeroResultDoesNotImplyAbsence: true,
    missingCompletedInactiveCandidateDoesNotProveActive: true,
    missingRestartDateCandidateDoesNotProveAbsence: true,

    nextAllowedStep:
      structuredExtractorStatus === "ready_for_no_write_structured_extractor_quality_gate"
        ? "run_no_write_structured_season_state_stats_extractor_quality_gate"
        : "repair_family_structured_extractor_before_quality_gate",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const gate = readJson(args.gateInput);
  const gateRows = validateGate(gate);

  const evaluator = readJson(args.evaluatorInput);
  const evaluatorRows = validateEvaluator(evaluator);
  const evaluatorRowsBySlug = new Map(evaluatorRows.map((row) => [row.competitionSlug, row]));

  const snapshotRun = readJson(args.snapshotInput);
  const snapshots = validateSnapshots(snapshotRun);
  const snapshotsBySlug = groupBySlug(snapshots);

  const structuredRows = gateRows
    .map((gateRow) => buildStructuredRow({
      gateRow,
      evaluatorRow: evaluatorRowsBySlug.get(gateRow.competitionSlug),
      snapshots: snapshotsBySlug.get(gateRow.competitionSlug) || []
    }))
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = structuredRows.filter((row) => row.structuredExtractorStatus === "ready_for_no_write_structured_extractor_quality_gate");
  const blockedRows = structuredRows.filter((row) => row.structuredExtractorStatus !== "ready_for_no_write_structured_extractor_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-structured-season-state-stats-extractor-file",
    mode: "build_no_write_structured_season_state_stats_extractor_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      noWriteAnchoredSeasonStateEvidenceEvaluatorQualityGate: args.gateInput,
      noWriteAnchoredSeasonStateEvidenceEvaluator: args.evaluatorInput,
      finalExplicitScopedControlledRouteAcquisitionRun: args.snapshotInput
    },
    summary: {
      structuredSeasonStateStatsExtractorCompetitionCount: structuredRows.length,
      structuredSeasonStateStatsExtractorReadyCount: readyRows.length,
      structuredSeasonStateStatsExtractorBlockedCount: blockedRows.length,

      structuredSeasonCandidateCompetitionCount: structuredRows.filter((row) => row.hasStructuredSeasonCandidate).length,
      structuredStandingsCandidateCompetitionCount: structuredRows.filter((row) => row.hasStructuredStandingsCandidate).length,
      structuredFixtureResultCandidateCompetitionCount: structuredRows.filter((row) => row.hasStructuredFixtureResultCandidate).length,
      completedOrInactiveStructuredCandidateCompetitionCount: structuredRows.filter((row) => row.hasCompletedOrInactiveStructuredCandidate).length,
      restartDateStructuredCandidateCompetitionCount: structuredRows.filter((row) => row.hasRestartDateStructuredCandidate).length,

      requiredRouteCoverageCompetitionCount: structuredRows.filter((row) => row.hasRequiredRouteCoverage).length,
      standingsRouteCompetitionCount: structuredRows.filter((row) => row.standingsRouteCount > 0).length,
      fixtureOrResultRouteCompetitionCount: structuredRows.filter((row) => row.fixtureOrResultRouteCount > 0).length,

      totalStandingsRouteCount: structuredRows.reduce((sum, row) => sum + row.standingsRouteCount, 0),
      totalFixtureOrResultRouteCount: structuredRows.reduce((sum, row) => sum + row.fixtureOrResultRouteCount, 0),
      totalDateCandidateCount: structuredRows.reduce((sum, row) => sum + row.dateCandidateCount, 0),
      totalScorePatternCandidateCount: structuredRows.reduce((sum, row) => sum + row.scorePatternCandidateCount, 0),
      totalRoundCandidateCount: structuredRows.reduce((sum, row) => sum + row.roundCandidateCount, 0),
      totalFootballObjectCandidateCount: structuredRows.reduce((sum, row) => sum + row.footballObjectCandidateCount, 0),
      totalStandingObjectCandidateCount: structuredRows.reduce((sum, row) => sum + row.standingObjectCandidateCount, 0),
      totalFixtureObjectCandidateCount: structuredRows.reduce((sum, row) => sum + row.fixtureObjectCandidateCount, 0),

      structuredExtractorMayProceedToQualityGateCount: structuredRows.filter((row) => row.structuredExtractorMayProceedToQualityGate).length,
      structuredExtractorMayClassifySeasonStateNowCount: structuredRows.filter((row) => row.structuredExtractorMayClassifySeasonStateNow).length,
      structuredExtractorMayAssertTruthNowCount: structuredRows.filter((row) => row.structuredExtractorMayAssertTruthNow).length,
      structuredExtractorMayWriteCanonicalNowCount: structuredRows.filter((row) => row.structuredExtractorMayWriteCanonicalNow).length,

      laligaStructuredExtractorCompetitionCount: structuredRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfStructuredExtractorCompetitionCount: structuredRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaStructuredExtractorCompetitionCount: structuredRows.filter((row) => row.reusableFamily === "sportomedia").length,

      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      classifierExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      seasonStateTruthAssertedCount: 0,
      structuredSeasonStateCandidateTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_no_write_structured_season_state_stats_extractor_quality_gate"
          : "repair_family_structured_extractor_before_quality_gate"
    },
    counts: {
      byReusableFamily: countBy(structuredRows, "reusableFamily"),
      byStructuredExtractorStatus: countBy(structuredRows, "structuredExtractorStatus"),
      byNextAllowedStep: countBy(structuredRows, "nextAllowedStep")
    },
    guardrails: [
      "This structured extractor reads already-acquired snapshots and no-write evidence candidates only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Structured candidates are not truth assertions.",
      "Current-season data candidates are not active-season truth.",
      "Missing completed/inactive candidates does not prove active.",
      "Missing restart date candidates does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    structuredRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    structuredSeasonStateStatsExtractorCompetitionCount: output.summary.structuredSeasonStateStatsExtractorCompetitionCount,
    structuredSeasonStateStatsExtractorReadyCount: output.summary.structuredSeasonStateStatsExtractorReadyCount,
    structuredSeasonStateStatsExtractorBlockedCount: output.summary.structuredSeasonStateStatsExtractorBlockedCount,
    structuredSeasonCandidateCompetitionCount: output.summary.structuredSeasonCandidateCompetitionCount,
    structuredStandingsCandidateCompetitionCount: output.summary.structuredStandingsCandidateCompetitionCount,
    structuredFixtureResultCandidateCompetitionCount: output.summary.structuredFixtureResultCandidateCompetitionCount,
    completedOrInactiveStructuredCandidateCompetitionCount: output.summary.completedOrInactiveStructuredCandidateCompetitionCount,
    restartDateStructuredCandidateCompetitionCount: output.summary.restartDateStructuredCandidateCompetitionCount,
    requiredRouteCoverageCompetitionCount: output.summary.requiredRouteCoverageCompetitionCount,
    standingsRouteCompetitionCount: output.summary.standingsRouteCompetitionCount,
    fixtureOrResultRouteCompetitionCount: output.summary.fixtureOrResultRouteCompetitionCount,
    totalStandingsRouteCount: output.summary.totalStandingsRouteCount,
    totalFixtureOrResultRouteCount: output.summary.totalFixtureOrResultRouteCount,
    totalDateCandidateCount: output.summary.totalDateCandidateCount,
    totalScorePatternCandidateCount: output.summary.totalScorePatternCandidateCount,
    totalRoundCandidateCount: output.summary.totalRoundCandidateCount,
    totalFootballObjectCandidateCount: output.summary.totalFootballObjectCandidateCount,
    totalStandingObjectCandidateCount: output.summary.totalStandingObjectCandidateCount,
    totalFixtureObjectCandidateCount: output.summary.totalFixtureObjectCandidateCount,
    structuredExtractorMayProceedToQualityGateCount: output.summary.structuredExtractorMayProceedToQualityGateCount,
    structuredExtractorMayClassifySeasonStateNowCount: output.summary.structuredExtractorMayClassifySeasonStateNowCount,
    structuredExtractorMayAssertTruthNowCount: output.summary.structuredExtractorMayAssertTruthNowCount,
    structuredExtractorMayWriteCanonicalNowCount: output.summary.structuredExtractorMayWriteCanonicalNowCount,
    laligaStructuredExtractorCompetitionCount: output.summary.laligaStructuredExtractorCompetitionCount,
    norwayNtfStructuredExtractorCompetitionCount: output.summary.norwayNtfStructuredExtractorCompetitionCount,
    sportomediaStructuredExtractorCompetitionCount: output.summary.sportomediaStructuredExtractorCompetitionCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
    structuredSeasonStateCandidateTruthCount: output.summary.structuredSeasonStateCandidateTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
