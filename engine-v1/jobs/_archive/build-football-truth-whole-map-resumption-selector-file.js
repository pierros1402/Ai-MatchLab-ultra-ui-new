#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = {
  date: "2026-06-14",
  diagnosticsRoot: "data/football-truth/_diagnostics",
  pilotInput: "data/football-truth/_diagnostics/pilot-exit-whole-map-resumption-board-2026-06-14/pilot-exit-whole-map-resumption-board-2026-06-14.json",
  output: "data/football-truth/_diagnostics/whole-map-resumption-selector-2026-06-14/whole-map-resumption-selector-2026-06-14.json"
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--diagnostics-root") args.diagnosticsRoot = argv[++i];
    else if (arg === "--pilot-input") args.pilotInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }
  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function walkJsonFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full.replaceAll("\\", "/"));
    }
  }

  walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function safeReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === "" ? "__missing__" : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function validatePilotBoard(board) {
  const s = board.summary || {};
  const required = {
    pilotCompetitionCount: 6,
    reusableFamilyPatternRetainedCount: 4,
    providerFamilyRepairDeferredCount: 2,
    wholeMapResumptionBlockedCount: 0,
    mayResumeWholeMapExecutionPlanCount: 1,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    classifierExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    seasonStateTruthAssertedCount: 0,
    pilotExitTruthCount: 0,
    canonicalWrites: 0
  };

  for (const [key, expected] of Object.entries(required)) {
    if (s[key] !== expected) throw new Error(`Pilot board guardrail failed for ${key}: expected ${expected}, got ${s[key]}`);
  }

  if (s.productionWrite !== false) throw new Error("Pilot board productionWrite must be false.");
  if (!board.wholeMapResumptionPolicy?.resumeWholeMapNow) throw new Error("Pilot board must allow whole-map resumption.");
  if (board.wholeMapResumptionPolicy?.sportomediaBlocksWholeMap !== false) throw new Error("Sportomedia must not block whole-map resumption.");

  return Array.isArray(board.pilotRows) ? board.pilotRows : [];
}

function classifyDiagnosticCandidate(filePath, json) {
  const lowerPath = filePath.toLowerCase();
  const summaryText = JSON.stringify(json?.summary || {}).toLowerCase();
  const mode = String(json?.mode || "").toLowerCase();
  const job = String(json?.job || "").toLowerCase();
  const text = `${lowerPath} ${summaryText} ${mode} ${job}`;

  let candidateType = null;
  let candidateScore = 0;
  const reasons = [];

  if (/primary.*batch.*runner.*manifest|primary.*runner.*manifest|batch-runner-manifest/.test(text)) {
    candidateType = "primary_batch_runner_manifest_or_quality_gate";
    candidateScore += 100;
    reasons.push("primary batch runner manifest signal");
  }

  if (/followup|follow-up/.test(text) && /quality|gate|lane/.test(text)) {
    candidateType = candidateType || "followup_lane_quality_gated_pack";
    candidateScore += 90;
    reasons.push("follow-up lane quality gate signal");
  }

  if (/active.*execution.*wave|execution.*wave|active-workstream|workstream.*bundle|master.*workstream/.test(text)) {
    candidateType = candidateType || "whole_map_active_workstream_or_execution_wave";
    candidateScore += 80;
    reasons.push("whole-map active workstream / execution wave signal");
  }

  if (/whole.*map|full.*map/.test(text)) {
    candidateScore += 25;
    reasons.push("whole/full-map signal");
  }

  if (/quality.*gate|passed|ready/.test(text)) {
    candidateScore += 20;
    reasons.push("quality gate / ready signal");
  }

  if (/controlled|approval|sportomedia|graphql|pilot-exit|runtime-body-shape/.test(text)) {
    candidateScore -= 25;
    reasons.push("provider/pilot-specific signal deprioritized for whole-map resumption");
  }

  if (!candidateType || candidateScore < 35) return null;

  return {
    filePath,
    fileSha256: sha256(fs.readFileSync(filePath, "utf8")),
    candidateType,
    candidateScore,
    reasons,
    job: json?.job || null,
    mode: json?.mode || null,
    recommendedNextLane: json?.summary?.recommendedNextLane || null,
    summaryKeys: Object.keys(json?.summary || {}).sort().slice(0, 80),
    selected: false
  };
}

function selectTopByType(candidates) {
  const byType = new Map();

  for (const candidate of candidates) {
    const current = byType.get(candidate.candidateType);
    if (!current || candidate.candidateScore > current.candidateScore) byType.set(candidate.candidateType, candidate);
  }

  return [...byType.values()]
    .sort((a, b) => b.candidateScore - a.candidateScore || a.filePath.localeCompare(b.filePath))
    .map((row) => ({ ...row, selected: true }));
}

function main() {
  const args = parseArgs(process.argv);
  const pilotBoard = readJson(args.pilotInput);
  const pilotRows = validatePilotBoard(pilotBoard);

  const jsonFiles = walkJsonFiles(args.diagnosticsRoot);
  const candidates = [];

  for (const filePath of jsonFiles) {
    if (filePath === args.output) continue;
    const json = safeReadJson(filePath);
    if (!json) continue;

    const candidate = classifyDiagnosticCandidate(filePath, json);
    if (candidate) candidates.push(candidate);
  }

  const selectedRows = selectTopByType(candidates);

  const requiredTypes = [
    "primary_batch_runner_manifest_or_quality_gate",
    "followup_lane_quality_gated_pack",
    "whole_map_active_workstream_or_execution_wave"
  ];

  const foundTypes = new Set(selectedRows.map((row) => row.candidateType));
  const missingTypes = requiredTypes.filter((type) => !foundTypes.has(type));

  const resumptionStatus =
    selectedRows.length > 0 && pilotBoard.wholeMapResumptionPolicy?.resumeWholeMapNow === true
      ? "ready_to_build_whole_map_resumption_action_bundle"
      : "blocked_whole_map_resumption_selector_missing_inputs";

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-whole-map-resumption-selector-file",
    mode: "no_write_whole_map_resumption_selector_from_pilot_exit_and_existing_diagnostics",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      pilotExitWholeMapResumptionBoard: args.pilotInput,
      diagnosticsRoot: args.diagnosticsRoot
    },
    summary: {
      pilotBoardReadCount: 1,
      pilotCompetitionCount: pilotRows.length,
      retainedReusableFamilyPatternCount:
        pilotRows.filter((row) => row.pilotStatus === "exit_ready_reusable_family_pattern_retained").length,
      deferredProviderFamilyRepairCount:
        pilotRows.filter((row) => row.pilotStatus === "exit_deferred_provider_family_repair_lane").length,
      sportomediaDeferredRepairLaneCount:
        pilotRows.filter((row) => row.reusableFamily === "sportomedia" && row.pilotStatus === "exit_deferred_provider_family_repair_lane").length,
      wholeMapResumptionBlockedByPilotCount:
        pilotRows.filter((row) => row.blocksWholeMapResumption).length,

      diagnosticJsonScannedCount: jsonFiles.length,
      resumptionInputCandidateCount: candidates.length,
      selectedResumptionInputCount: selectedRows.length,
      selectedPrimaryBatchRunnerManifestOrQualityGateCount:
        selectedRows.filter((row) => row.candidateType === "primary_batch_runner_manifest_or_quality_gate").length,
      selectedFollowupLaneQualityGatedPackCount:
        selectedRows.filter((row) => row.candidateType === "followup_lane_quality_gated_pack").length,
      selectedWholeMapActiveWorkstreamOrExecutionWaveCount:
        selectedRows.filter((row) => row.candidateType === "whole_map_active_workstream_or_execution_wave").length,
      missingPreferredResumptionInputTypeCount: missingTypes.length,

      wholeMapResumptionSelectorReadyCount:
        resumptionStatus === "ready_to_build_whole_map_resumption_action_bundle" ? 1 : 0,
      wholeMapResumptionSelectorBlockedCount:
        resumptionStatus === "ready_to_build_whole_map_resumption_action_bundle" ? 0 : 1,

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
      wholeMapResumptionSelectorTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        resumptionStatus === "ready_to_build_whole_map_resumption_action_bundle"
          ? "build_whole_map_resumption_action_bundle"
          : "repair_whole_map_resumption_selector_inputs"
    },
    counts: {
      byPilotStatus: countBy(pilotRows, "pilotStatus"),
      byReusableFamily: countBy(pilotRows, "reusableFamily"),
      byWholeMapDisposition: countBy(pilotRows, "wholeMapDisposition"),
      byCandidateType: countBy(candidates, "candidateType"),
      bySelectedCandidateType: countBy(selectedRows, "candidateType")
    },
    resumptionStatus,
    missingPreferredResumptionInputTypes: missingTypes,
    wholeMapResumptionPolicy: {
      resumeWholeMapNow: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      nextAction: "build_whole_map_resumption_action_bundle",
      nextActionMustRemainNoWriteUntilFurtherApproval: true
    },
    guardrails: [
      "This selector reads pilot-exit diagnostics and existing local diagnostics only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "It does not mutate diagnostics other than this output artifact.",
      "Selected resumption inputs are workflow candidates, not truth assertions.",
      "Sportomedia is kept as provider-family repair backlog and does not block whole-map resumption."
    ],
    selectedRows,
    candidateRows: candidates.sort((a, b) => b.candidateScore - a.candidateScore || a.filePath.localeCompare(b.filePath)).slice(0, 50),
    pilotRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    pilotBoardReadCount: output.summary.pilotBoardReadCount,
    pilotCompetitionCount: output.summary.pilotCompetitionCount,
    retainedReusableFamilyPatternCount: output.summary.retainedReusableFamilyPatternCount,
    deferredProviderFamilyRepairCount: output.summary.deferredProviderFamilyRepairCount,
    sportomediaDeferredRepairLaneCount: output.summary.sportomediaDeferredRepairLaneCount,
    wholeMapResumptionBlockedByPilotCount: output.summary.wholeMapResumptionBlockedByPilotCount,
    diagnosticJsonScannedCount: output.summary.diagnosticJsonScannedCount,
    resumptionInputCandidateCount: output.summary.resumptionInputCandidateCount,
    selectedResumptionInputCount: output.summary.selectedResumptionInputCount,
    selectedPrimaryBatchRunnerManifestOrQualityGateCount: output.summary.selectedPrimaryBatchRunnerManifestOrQualityGateCount,
    selectedFollowupLaneQualityGatedPackCount: output.summary.selectedFollowupLaneQualityGatedPackCount,
    selectedWholeMapActiveWorkstreamOrExecutionWaveCount: output.summary.selectedWholeMapActiveWorkstreamOrExecutionWaveCount,
    missingPreferredResumptionInputTypeCount: output.summary.missingPreferredResumptionInputTypeCount,
    wholeMapResumptionSelectorReadyCount: output.summary.wholeMapResumptionSelectorReadyCount,
    wholeMapResumptionSelectorBlockedCount: output.summary.wholeMapResumptionSelectorBlockedCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
    wholeMapResumptionSelectorTruthCount: output.summary.wholeMapResumptionSelectorTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    resumptionStatus: output.resumptionStatus,
    counts: output.counts
  }, null, 2));
}

main();
