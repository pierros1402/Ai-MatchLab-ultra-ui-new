#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/configured-family-season-state-source-evidence-probe-plan-2026-06-14/configured-family-season-state-source-evidence-probe-plan-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/configured-family-season-state-source-evidence-probe-2026-06-14/configured-family-season-state-source-evidence-probe-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { date: DEFAULT_DATE, input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
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

function validateProbePlan(plan) {
  const summary = plan.summary || {};

  assertSummary(summary, "sourceEvidenceProbePlanCompetitionCount", 6);
  assertSummary(summary, "sourceEvidenceProbePlanReadyCompetitionCount", 6);
  assertSummary(summary, "sourceEvidenceProbePlanBlockedCompetitionCount", 0);
  assertSummary(summary, "laligaProbePlanCompetitionCount", 2);
  assertSummary(summary, "norwayNtfProbePlanCompetitionCount", 2);
  assertSummary(summary, "sportomediaProbePlanCompetitionCount", 2);
  assertSummary(summary, "existingLocalProbeInputFileCount", 18);
  assertSummary(summary, "existingLocalProbeMatchedObjectCount", 38);
  assertSummary(summary, "sourceEvidenceProbeCanRunLocalNoWriteNowCount", 6);
  assertSummary(summary, "sourceEvidenceProbeCanClassifySeasonStateNowCount", 0);
  assertSummary(summary, "userHintUsedCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideUsedCount", 0);
  assertSummary(summary, "validatorReadinessDoesNotImplyActiveCount", 6);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "controlledDiscoveryAllowedNowCount", 0);
  assertSummary(summary, "canonicalPromotionAllowedNowCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "truthAssertionsAllowedNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const rows = Array.isArray(plan.probeRows) ? plan.probeRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 probeRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Probe plan slug mismatch: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.sourceEvidenceProbePlanStatus !== "source_evidence_probe_plan_ready_from_existing_local_evidence") {
      throw new Error(row.competitionSlug + ": expected ready probe plan status");
    }
    if (row.sourceEvidenceProbeCanRunLocalNoWriteNow !== true) {
      throw new Error(row.competitionSlug + ": expected local no-write probe runnable");
    }
    if (row.sourceEvidenceProbeCanClassifySeasonStateNow !== false) {
      throw new Error(row.competitionSlug + ": probe plan must not classify season state");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": user hints / hardcoded overrides must be false");
    }
    if (row.fetchAllowedNow !== false || row.searchAllowedNow !== false || row.canonicalWriteEligibleNow !== false) {
      throw new Error(row.competitionSlug + ": unsafe probe plan flag");
    }
  }

  return rows;
}

function text(value) {
  return JSON.stringify(value || {}).toLowerCase().replace(/\s+/g, " ");
}

function shortSample(value) {
  const out = {};
  if (!value || typeof value !== "object") return out;

  const keys = [
    "competitionSlug",
    "slug",
    "competitionSlugs",
    "reusableFamily",
    "source",
    "sourceUrl",
    "route",
    "routeUrl",
    "status",
    "fixtureReady",
    "standingsReady",
    "seasonStateReady",
    "fixtureContract",
    "standingsContract",
    "seasonStateContract",
    "engineStatus",
    "compilerStatus",
    "workstreamStatus",
    "validationStatus",
    "matchedObjectCount",
    "sample"
  ];

  for (const key of keys) {
    if (key in value) out[key] = value[key];
  }

  if (Object.keys(out).length === 0) {
    for (const key of Object.keys(value).slice(0, 8)) {
      const v = value[key];
      if (v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[key] = v;
      } else if (Array.isArray(v)) {
        out[key] = "[array:" + v.length + "]";
      } else if (typeof v === "object") {
        out[key] = "[object]";
      }
    }
  }

  return out;
}

function objectMentionsSlug(value, slug) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.includes(slug);
  if (typeof value === "number" || typeof value === "boolean") return String(value) === slug;

  if (Array.isArray(value)) {
    return value.some((item) => objectMentionsSlug(item, slug));
  }

  if (typeof value === "object") {
    const directKeys = [
      "competitionSlug",
      "slug",
      "targetSlug",
      "leagueSlug",
      "sourceSlug",
      "competition",
      "competitionId",
      "id"
    ];

    for (const key of directKeys) {
      if (objectMentionsSlug(value[key], slug)) return true;
    }

    const arrayKeys = ["competitionSlugs", "targetSlugs", "slugs", "competitions"];
    for (const key of arrayKeys) {
      if (Array.isArray(value[key]) && value[key].some((item) => objectMentionsSlug(item, slug))) return true;
    }
  }

  return false;
}

function collectSlugObjects(value, slug, filePath, out = [], location = "$") {
  if (out.length >= 200) return out;

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSlugObjects(item, slug, filePath, out, location + "[" + index + "]"));
    return out;
  }

  if (value && typeof value === "object") {
    if (objectMentionsSlug(value, slug)) {
      out.push({
        filePath,
        location,
        evidenceText: text(value),
        sample: shortSample(value)
      });
    }

    for (const [key, child] of Object.entries(value)) {
      collectSlugObjects(child, slug, filePath, out, location + "." + key);
      if (out.length >= 200) return out;
    }
  }

  return out;
}

function scoreSignals(evidenceText) {
  const activePatterns = [
    /\bactive_current_season\b/,
    /\bcurrent season\b/,
    /\bin progress\b/,
    /\bin_progress\b/,
    /\bongoing\b/,
    /\blive\b/,
    /\bfixture\b/,
    /\bfixtures\b/,
    /\bnext fixture\b/,
    /\bupcoming\b/,
    /\brecent result\b/,
    /\brecent results\b/,
    /\bstandings\b/,
    /\btable\b/,
    /\bround\b/,
    /\bmatchday\b/
  ];

  const completedPatterns = [
    /\bcompleted\b/,
    /\bfinished\b/,
    /\bfinal standings\b/,
    /\bfinal table\b/,
    /\bseason completed\b/,
    /\bseason finished\b/,
    /\binactive\b/,
    /\bclosed\b/,
    /\bchampion\b/,
    /\bwinner\b/,
    /\bnext season\b/,
    /\brestart\b/,
    /\bstart date\b/
  ];

  const seasonMarkerPatterns = [
    /\bseason\b/,
    /\b2025\b/,
    /\b2026\b/,
    /\b2025-26\b/,
    /\b2026-27\b/,
    /\bcalendar\b/,
    /\bschedule\b/,
    /\bcompetition\b/
  ];

  const contractOnlyPatterns = [
    /\bvalidator\b/,
    /\bcontract\b/,
    /\bready\b/,
    /\bsource_only\b/,
    /\bno_write\b/,
    /\bfamily\b/,
    /\broute\b/,
    /\bguardrail\b/
  ];

  const hit = (patterns) => patterns.filter((pattern) => pattern.test(evidenceText)).map(String);

  return {
    activeSignalHits: hit(activePatterns),
    completedOrInactiveSignalHits: hit(completedPatterns),
    seasonMarkerHits: hit(seasonMarkerPatterns),
    contractOnlyHits: hit(contractOnlyPatterns)
  };
}

function aggregateSignals(objects) {
  const joined = objects.map((item) => item.evidenceText).join(" ");
  const signals = scoreSignals(joined);

  const activeSignalScore = signals.activeSignalHits.length;
  const completedOrInactiveSignalScore = signals.completedOrInactiveSignalHits.length;
  const seasonMarkerScore = signals.seasonMarkerHits.length;
  const contractOnlyScore = signals.contractOnlyHits.length;

  let sourceEvidenceProbeStatus = "season_state_source_signal_absent_in_local_probe";
  let sourceEvidenceProbeFinding = "no_classifiable_season_state_signal";

  if (activeSignalScore >= 3 && seasonMarkerScore >= 1 && completedOrInactiveSignalScore < 2) {
    sourceEvidenceProbeStatus = "active_current_season_evidence_signal_detected_no_truth_assertion";
    sourceEvidenceProbeFinding = "active_signal_candidate_requires_quality_gate";
  } else if (completedOrInactiveSignalScore >= 3 && seasonMarkerScore >= 1 && activeSignalScore < 2) {
    sourceEvidenceProbeStatus = "completed_or_inactive_evidence_signal_detected_no_truth_assertion";
    sourceEvidenceProbeFinding = "completed_or_inactive_signal_candidate_requires_quality_gate";
  } else if (activeSignalScore >= 2 && completedOrInactiveSignalScore >= 2) {
    sourceEvidenceProbeStatus = "conflicting_season_state_evidence_signals_detected_no_truth_assertion";
    sourceEvidenceProbeFinding = "conflicting_signal_candidate_requires_review";
  } else if (activeSignalScore > 0 || completedOrInactiveSignalScore > 0 || seasonMarkerScore > 0) {
    sourceEvidenceProbeStatus = "weak_season_state_evidence_signal_detected_no_truth_assertion";
    sourceEvidenceProbeFinding = "weak_signal_requires_more_source_evidence";
  }

  return {
    sourceEvidenceProbeStatus,
    sourceEvidenceProbeFinding,
    activeSignalScore,
    completedOrInactiveSignalScore,
    seasonMarkerScore,
    contractOnlyScore,
    activeSignalHits: signals.activeSignalHits,
    completedOrInactiveSignalHits: signals.completedOrInactiveSignalHits,
    seasonMarkerHits: signals.seasonMarkerHits,
    contractOnlyHits: signals.contractOnlyHits
  };
}

function runProbeRow(planRow) {
  const fileRefs = Array.isArray(planRow.existingLocalProbeInputFiles) ? planRow.existingLocalProbeInputFiles : [];
  const readableFiles = [];

  for (const ref of fileRefs) {
    if (!ref.filePath || !fs.existsSync(ref.filePath)) continue;
    const json = readJson(ref.filePath);
    const objects = collectSlugObjects(json, planRow.competitionSlug, ref.filePath);

    readableFiles.push({
      filePath: ref.filePath,
      configuredMatchedObjectCount: ref.matchedObjectCount || 0,
      probeMatchedObjectCount: objects.length,
      matchedObjects: objects.slice(0, 20)
    });
  }

  const allObjects = readableFiles.flatMap((file) => file.matchedObjects || []);
  const aggregate = aggregateSignals(allObjects);

  return {
    competitionSlug: planRow.competitionSlug,
    reusableFamily: planRow.reusableFamily,
    probeFamily: planRow.probeFamily,
    probeMode: planRow.probeMode,

    sourceEvidenceProbeStatus: aggregate.sourceEvidenceProbeStatus,
    sourceEvidenceProbeFinding: aggregate.sourceEvidenceProbeFinding,

    readableLocalProbeInputFileCount: readableFiles.length,
    probeMatchedObjectCount: readableFiles.reduce((sum, file) => sum + file.probeMatchedObjectCount, 0),
    configuredPlanMatchedObjectCount: fileRefs.reduce((sum, ref) => sum + (ref.matchedObjectCount || 0), 0),

    activeSignalScore: aggregate.activeSignalScore,
    completedOrInactiveSignalScore: aggregate.completedOrInactiveSignalScore,
    seasonMarkerScore: aggregate.seasonMarkerScore,
    contractOnlyScore: aggregate.contractOnlyScore,
    activeSignalHits: aggregate.activeSignalHits,
    completedOrInactiveSignalHits: aggregate.completedOrInactiveSignalHits,
    seasonMarkerHits: aggregate.seasonMarkerHits,
    contractOnlyHits: aggregate.contractOnlyHits,

    evidenceCanClassifySeasonStateNow: false,
    evidenceSignalRequiresQualityGate: aggregate.sourceEvidenceProbeStatus !== "season_state_source_signal_absent_in_local_probe",

    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,
    validatorReadinessDoesNotImplyActive: true,
    noMatchTodayDoesNotImplyInactive: true,
    matchStatusIsNotSeasonStateTruth: true,

    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
    canonicalPromotionAllowedNow: false,
    canonicalWriteEligibleNow: false,
    truthAssertionsAllowedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    canonicalWrites: 0,
    productionWrite: false,

    readableFiles
  };
}

function main() {
  const args = parseArgs(process.argv);
  const plan = readJson(args.input);
  const planRows = validateProbePlan(plan);

  const probeRows = planRows
    .map(runProbeRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-configured-family-season-state-source-evidence-probe-file",
    mode: "no_write_local_season_state_source_evidence_probe_from_existing_files_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      sourceEvidenceProbePlan: args.input
    },
    summary: {
      sourceEvidenceProbeCompetitionCount: probeRows.length,
      sourceEvidenceProbeRowsEmitted: probeRows.length,

      activeSignalDetectedCount: probeRows.filter((row) =>
        row.sourceEvidenceProbeStatus === "active_current_season_evidence_signal_detected_no_truth_assertion"
      ).length,
      completedOrInactiveSignalDetectedCount: probeRows.filter((row) =>
        row.sourceEvidenceProbeStatus === "completed_or_inactive_evidence_signal_detected_no_truth_assertion"
      ).length,
      conflictingSignalDetectedCount: probeRows.filter((row) =>
        row.sourceEvidenceProbeStatus === "conflicting_season_state_evidence_signals_detected_no_truth_assertion"
      ).length,
      weakSignalDetectedCount: probeRows.filter((row) =>
        row.sourceEvidenceProbeStatus === "weak_season_state_evidence_signal_detected_no_truth_assertion"
      ).length,
      absentSignalCount: probeRows.filter((row) =>
        row.sourceEvidenceProbeStatus === "season_state_source_signal_absent_in_local_probe"
      ).length,

      laligaProbeCompetitionCount: probeRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfProbeCompetitionCount: probeRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaProbeCompetitionCount: probeRows.filter((row) => row.reusableFamily === "sportomedia").length,

      readableLocalProbeInputFileCount: probeRows.reduce((sum, row) => sum + row.readableLocalProbeInputFileCount, 0),
      probeMatchedObjectCount: probeRows.reduce((sum, row) => sum + row.probeMatchedObjectCount, 0),
      configuredPlanMatchedObjectCount: probeRows.reduce((sum, row) => sum + row.configuredPlanMatchedObjectCount, 0),

      evidenceCanClassifySeasonStateNowCount: 0,
      evidenceSignalRequiresQualityGateCount: probeRows.filter((row) => row.evidenceSignalRequiresQualityGate).length,

      userHintUsedCount: probeRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: probeRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: probeRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      controlledDiscoveryAllowedNowCount: 0,
      canonicalPromotionAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      truthAssertionsAllowedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane:
        probeRows.some((row) => row.evidenceSignalRequiresQualityGate)
          ? "run_no_write_season_state_source_evidence_probe_quality_gate"
          : "build_controlled_configured_route_season_state_evidence_acquisition_plan_no_broad_search"
    },
    counts: {
      byReusableFamily: countBy(probeRows, "reusableFamily"),
      byProbeMode: countBy(probeRows, "probeMode"),
      bySourceEvidenceProbeStatus: countBy(probeRows, "sourceEvidenceProbeStatus"),
      bySourceEvidenceProbeFinding: countBy(probeRows, "sourceEvidenceProbeFinding")
    },
    guardrails: [
      "This job probes existing local files only.",
      "It does not fetch.",
      "It does not search.",
      "It does not write canonical data.",
      "It does not assert active/inactive/completed truth.",
      "It does not classify season state as truth.",
      "It uses no user-provided season-state hints.",
      "It uses no hardcoded season-state overrides.",
      "Validator readiness must not imply active season state.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "Any detected signal requires a later quality gate before dry-run classification."
    ],
    probeRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    sourceEvidenceProbeCompetitionCount: output.summary.sourceEvidenceProbeCompetitionCount,
    sourceEvidenceProbeRowsEmitted: output.summary.sourceEvidenceProbeRowsEmitted,
    activeSignalDetectedCount: output.summary.activeSignalDetectedCount,
    completedOrInactiveSignalDetectedCount: output.summary.completedOrInactiveSignalDetectedCount,
    conflictingSignalDetectedCount: output.summary.conflictingSignalDetectedCount,
    weakSignalDetectedCount: output.summary.weakSignalDetectedCount,
    absentSignalCount: output.summary.absentSignalCount,
    laligaProbeCompetitionCount: output.summary.laligaProbeCompetitionCount,
    norwayNtfProbeCompetitionCount: output.summary.norwayNtfProbeCompetitionCount,
    sportomediaProbeCompetitionCount: output.summary.sportomediaProbeCompetitionCount,
    readableLocalProbeInputFileCount: output.summary.readableLocalProbeInputFileCount,
    probeMatchedObjectCount: output.summary.probeMatchedObjectCount,
    configuredPlanMatchedObjectCount: output.summary.configuredPlanMatchedObjectCount,
    evidenceCanClassifySeasonStateNowCount: output.summary.evidenceCanClassifySeasonStateNowCount,
    evidenceSignalRequiresQualityGateCount: output.summary.evidenceSignalRequiresQualityGateCount,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    validatorReadinessDoesNotImplyActiveCount: output.summary.validatorReadinessDoesNotImplyActiveCount,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    controlledDiscoveryAllowedNowCount: output.summary.controlledDiscoveryAllowedNowCount,
    canonicalPromotionAllowedNowCount: output.summary.canonicalPromotionAllowedNowCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    truthAssertionsAllowedNowCount: output.summary.truthAssertionsAllowedNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
