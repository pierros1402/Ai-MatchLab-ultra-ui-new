#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value || '').trim();
}

function isAccepted(row) {
  return row && row.reviewed === true && row.acceptedForValidation === true && row.productionApproved !== true;
}

function buildResolutionTask(row) {
  const taskId = clean(row.sourceTaskId || row.reviewTaskId);
  return {
    taskId,
    matchId: clean(row.matchId),
    day: clean(row.date),
    date: clean(row.date),
    leagueSlug: clean(row.leagueSlug),
    intent: clean(row.intent),
    query: clean(row.query),
    priority: Number(row.priority || 99),
    teams: {
      home: clean(row.homeTeam),
      away: clean(row.awayTeam)
    },
    expectedScoreKey: clean(row.expectedScoreKey),
    resolution: {
      mode: clean(row.resolutionMode || 'manual_review_pack'),
      query: clean(row.query),
      intent: clean(row.intent),
      priority: Number(row.priority || 99),
      sourceType: 'manual_review_pack',
      urlResolved: true,
      resolvedUrl: clean(row.manualResolvedUrl),
      resolutionState: 'manual_review_pack_resolved'
    }
  };
}

function buildUrlResolution(row) {
  return {
    taskId: clean(row.sourceTaskId || row.reviewTaskId),
    resolvedUrl: clean(row.manualResolvedUrl),
    sourceName: clean(row.manualSourceName),
    sourceType: clean(row.manualSourceType || 'trusted'),
    resolvedBy: 'manual',
    notes: clean(row.reviewerNotes || row.manualEvidenceText),
    observed: {
      homeScore: row.manualObservedHomeScore ?? null,
      awayScore: row.manualObservedAwayScore ?? null,
      status: clean(row.manualObservedStatus),
      evidenceText: clean(row.manualEvidenceText)
    }
  };
}

function buildAdapterInput(reviewPack, inputPath) {
  const tasks = asArray(reviewPack.tasks);
  const acceptedRows = tasks.filter(isAccepted);
  const skippedRows = tasks.filter((row) => !isAccepted(row));

  const resolutionTasks = acceptedRows.map(buildResolutionTask);
  const urlResolutions = acceptedRows.map(buildUrlResolution);

  const byIntent = {};
  const byDate = {};
  for (const row of acceptedRows) {
    const intent = clean(row.intent) || 'unknown';
    const date = clean(row.date) || 'unknown';
    byIntent[intent] = (byIntent[intent] || 0) + 1;
    byDate[date] = (byDate[date] || 0) + 1;
  }

  return {
    ok: true,
    stage: 'final_result_source_url_resolutions_from_review_pack_ready',
    generatedAt: new Date().toISOString(),
    inputPath,
    sourceStage: clean(reviewPack.stage),
    sourceBatchId: clean(reviewPack.sourceBatchId),
    guarantees: {
      canonicalWrites: 0,
      fetch: false,
      urlResolutionSideEffects: false,
      productionFinalTruthDecision: false,
      canonicalPromotion: false,
      productionRepair: false,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    },
    summary: {
      inputTasks: tasks.length,
      acceptedRows: acceptedRows.length,
      skippedRows: skippedRows.length,
      resolutionTaskCount: resolutionTasks.length,
      urlResolutionCount: urlResolutions.length,
      byIntent,
      byDate
    },
    cases: [
      {
        matchId: 'review-pack-adapter',
        day: clean(acceptedRows[0]?.date),
        leagueSlug: 'mixed',
        resolutionTasks
      }
    ],
    urlResolutions,
    skippedRows: skippedRows.map((row, index) => ({
      rowIndex: index,
      reviewTaskId: clean(row.reviewTaskId),
      sourceTaskId: clean(row.sourceTaskId),
      matchId: clean(row.matchId),
      reviewed: row.reviewed === true,
      acceptedForValidation: row.acceptedForValidation === true,
      productionApproved: row.productionApproved === true
    }))
  };
}

function runSelfTest() {
  const reviewPack = {
    stage: 'final_result_truth_audit_resolution_review_pack_ready',
    sourceBatchId: 'resolution_batch_0001',
    tasks: [
      {
        reviewTaskId: 'r1',
        sourceTaskId: 'task-1',
        matchId: 'm1',
        date: '2026-05-18',
        leagueSlug: 'eng.1',
        homeTeam: 'Alpha FC',
        awayTeam: 'Beta FC',
        intent: 'value_settlement_final_result_verification',
        priority: 1,
        query: 'Alpha FC vs Beta FC final score',
        expectedScoreKey: '2-1',
        manualResolvedUrl: 'https://example.com/match-report',
        manualSourceName: 'Example Sports',
        manualSourceType: 'trusted',
        manualObservedHomeScore: 2,
        manualObservedAwayScore: 1,
        manualObservedStatus: 'FT',
        manualEvidenceText: 'Alpha FC 2-1 Beta FC FT',
        reviewerNotes: 'manual self-test row',
        reviewed: true,
        acceptedForValidation: true,
        productionApproved: false
      },
      {
        reviewTaskId: 'r2',
        sourceTaskId: 'task-2',
        matchId: 'm2',
        date: '2026-05-18',
        leagueSlug: 'eng.1',
        intent: 'missing_final_truth',
        priority: 1,
        query: 'Gamma FC vs Delta FC final score',
        manualResolvedUrl: '',
        manualSourceName: '',
        reviewed: false,
        acceptedForValidation: false,
        productionApproved: false
      }
    ]
  };

  const output = buildAdapterInput(reviewPack, 'self-test');
  if (output.summary.inputTasks !== 2) throw new Error('expected 2 input tasks');
  if (output.summary.acceptedRows !== 1) throw new Error('expected 1 accepted row');
  if (output.cases[0].resolutionTasks.length !== 1) throw new Error('expected 1 resolution task');
  if (output.urlResolutions.length !== 1) throw new Error('expected 1 url resolution');
  if (output.urlResolutions[0].taskId !== 'task-1') throw new Error('expected task id propagation');
  if (output.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
  if (output.guarantees.fetch !== false) throw new Error('fetch guarantee failed');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'build-final-result-source-url-resolutions-from-review-pack-file',
    inputTasks: output.summary.inputTasks,
    acceptedRows: output.summary.acceptedRows,
    skippedRows: output.summary.skippedRows,
    resolutionTaskCount: output.summary.resolutionTaskCount,
    urlResolutionCount: output.summary.urlResolutionCount,
    firstTaskId: output.urlResolutions[0].taskId,
    canonicalWrites: output.guarantees.canonicalWrites,
    fetch: output.guarantees.fetch
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  if (!args.input) {
    throw new Error('Missing required --input <truth-audit-resolution-review-pack.json>');
  }

  const reviewPack = readJson(args.input);
  const output = buildAdapterInput(reviewPack, args.input);
  const outputPath = args.output || path.join(path.dirname(args.input), 'final-result-source-url-resolutions-input.json');
  writeJson(outputPath, output);

  console.log(JSON.stringify({
    ok: output.ok,
    stage: output.stage,
    input: args.input,
    output: outputPath,
    summary: output.summary,
    canonicalWrites: output.guarantees.canonicalWrites,
    fetch: output.guarantees.fetch,
    productionFinalTruthDecision: output.guarantees.productionFinalTruthDecision,
    canonicalPromotion: output.guarantees.canonicalPromotion
  }, null, 2));
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
  main();
}

export {
  buildAdapterInput,
  buildResolutionTask,
  buildUrlResolution
};
