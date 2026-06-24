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

function firstNonEmpty() {
  for (const value of arguments) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function extractBatches(input) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];
  return asArray(input.batches || input.rows || input.data);
}

function selectBatch(input, batchId, batchIndex) {
  const batches = extractBatches(input);
  if (batchId) {
    const found = batches.find((batch) => String(batch.batchId || '') === String(batchId));
    if (!found) throw new Error('Batch not found by --batch-id: ' + batchId);
    return found;
  }

  const index = Number(batchIndex || 0);
  if (!Number.isInteger(index) || index < 0 || index >= batches.length) {
    throw new Error('Batch not found by --batch-index: ' + String(batchIndex || 0));
  }
  return batches[index];
}

function getRaw(task) {
  return task && typeof task.raw === 'object' && task.raw !== null ? task.raw : task;
}

function getResolution(task) {
  const raw = getRaw(task);
  return raw && typeof raw.resolution === 'object' && raw.resolution !== null ? raw.resolution : {};
}

function getTeams(task) {
  const raw = getRaw(task);
  const sourceTarget = raw && typeof raw.sourceTarget === 'object' && raw.sourceTarget !== null ? raw.sourceTarget : {};
  const watchRow = sourceTarget && typeof sourceTarget.watchRow === 'object' && sourceTarget.watchRow !== null ? sourceTarget.watchRow : {};
  const teams = raw && typeof raw.teams === 'object' && raw.teams !== null ? raw.teams : {};

  return {
    homeTeam: String(firstNonEmpty(watchRow.homeTeam, teams.home, teams.homeTeam, raw.homeTeam)),
    awayTeam: String(firstNonEmpty(watchRow.awayTeam, teams.away, teams.awayTeam, raw.awayTeam))
  };
}

function getExpectedScoreKey(task) {
  const raw = getRaw(task);
  const sourceTarget = raw && typeof raw.sourceTarget === 'object' && raw.sourceTarget !== null ? raw.sourceTarget : {};
  const watchRow = sourceTarget && typeof sourceTarget.watchRow === 'object' && sourceTarget.watchRow !== null ? sourceTarget.watchRow : {};
  return String(firstNonEmpty(watchRow.expectedScoreKey, raw.expectedScoreKey, task.scoreKey));
}

function normalizeReviewTask(task, index) {
  const raw = getRaw(task);
  const resolution = getResolution(task);
  const teams = getTeams(task);

  return {
    reviewTaskId: String(firstNonEmpty(task.taskId, raw.taskId, raw.id, 'review_task_' + String(index + 1))),
    sourceTaskId: String(firstNonEmpty(task.taskId, raw.taskId, raw.id)),
    matchId: String(firstNonEmpty(task.matchId, raw.matchId)),
    date: String(firstNonEmpty(task.day, raw.day, raw.date)),
    leagueSlug: String(firstNonEmpty(task.leagueSlug, raw.leagueSlug, raw.league)),
    homeTeam: teams.homeTeam,
    awayTeam: teams.awayTeam,
    intent: String(firstNonEmpty(task.intent, resolution.intent, raw.intent)),
    priority: Number(firstNonEmpty(task.priority, resolution.priority, raw.priority, 99)),
    query: String(firstNonEmpty(task.query, resolution.query, raw.query)),
    expectedScoreKey: getExpectedScoreKey(task),
    resolutionMode: String(firstNonEmpty(resolution.mode, raw.resolutionMode)),
    resolutionState: String(firstNonEmpty(resolution.resolutionState, raw.resolutionState)),
    manualResolvedUrl: '',
    manualSourceName: '',
    manualSourceType: '',
    manualObservedHomeScore: null,
    manualObservedAwayScore: null,
    manualObservedStatus: '',
    manualEvidenceText: '',
    reviewerNotes: '',
    reviewed: false,
    acceptedForValidation: false,
    productionApproved: false
  };
}

function buildReviewPack(input, inputPath, options) {
  const batch = selectBatch(input, options.batchId, options.batchIndex);
  const tasks = asArray(batch.tasks).map(normalizeReviewTask);

  const byIntent = {};
  const byLeague = {};
  const byDate = {};

  for (const task of tasks) {
    byIntent[task.intent || 'unknown'] = (byIntent[task.intent || 'unknown'] || 0) + 1;
    byLeague[task.leagueSlug || 'unknown'] = (byLeague[task.leagueSlug || 'unknown'] || 0) + 1;
    byDate[task.date || 'unknown'] = (byDate[task.date || 'unknown'] || 0) + 1;
  }

  return {
    ok: true,
    stage: 'final_result_truth_audit_resolution_review_pack_ready',
    generatedAt: new Date().toISOString(),
    inputPath,
    sourceBatchId: String(batch.batchId || ''),
    sourceBatchIndex: batch.batchIndex === undefined ? null : batch.batchIndex,
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
    reviewerInstructions: {
      purpose: 'Resolve or document candidate final-result sources for later validation. Do not mark productionApproved true in this read-only stage.',
      requiredFieldsForReviewedTask: [
        'manualResolvedUrl or reviewerNotes explaining why no source was found',
        'manualSourceName when URL/source is known',
        'manualObservedHomeScore/manualObservedAwayScore when score is visible',
        'manualObservedStatus when status is visible',
        'reviewed:true only after human review'
      ],
      blockedFields: [
        'productionApproved must remain false'
      ]
    },
    summary: {
      taskCount: tasks.length,
      reviewedTasks: tasks.filter((task) => task.reviewed === true).length,
      acceptedForValidationTasks: tasks.filter((task) => task.acceptedForValidation === true).length,
      productionApprovedViolations: tasks.filter((task) => task.productionApproved !== false).length,
      byIntent,
      byLeague,
      byDate
    },
    tasks
  };
}

function runSelfTest() {
  const input = {
    batches: [
      {
        batchId: 'resolution_batch_0001',
        batchIndex: 0,
        tasks: [
          {
            taskId: 't1',
            matchId: 'm1',
            day: '2026-05-18',
            leagueSlug: 'eng.1',
            intent: 'value_settlement_final_result_verification',
            query: 'Alpha FC vs Beta FC final score',
            priority: 1,
            raw: {
              taskId: 't1',
              matchId: 'm1',
              day: '2026-05-18',
              leagueSlug: 'eng.1',
              resolution: {
                intent: 'value_settlement_final_result_verification',
                query: 'Alpha FC vs Beta FC final score',
                priority: 1,
                mode: 'manual_or_external_search_generic',
                resolutionState: 'manual_or_external_search_needed'
              },
              sourceTarget: {
                watchRow: {
                  homeTeam: 'Alpha FC',
                  awayTeam: 'Beta FC',
                  expectedScoreKey: '2-1'
                }
              }
            }
          }
        ]
      }
    ]
  };

  const pack = buildReviewPack(input, 'self-test', { batchId: 'resolution_batch_0001' });

  if (pack.summary.taskCount !== 1) throw new Error('expected 1 review task');
  if (pack.tasks[0].homeTeam !== 'Alpha FC') throw new Error('expected home team propagation');
  if (pack.tasks[0].expectedScoreKey !== '2-1') throw new Error('expected score key propagation');
  if (pack.tasks[0].reviewed !== false) throw new Error('reviewed must default false');
  if (pack.tasks[0].productionApproved !== false) throw new Error('productionApproved must default false');
  if (pack.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
  if (pack.guarantees.fetch !== false) throw new Error('fetch guarantee failed');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'build-final-result-truth-audit-resolution-review-pack-file',
    taskCount: pack.summary.taskCount,
    firstIntent: pack.tasks[0].intent,
    firstHomeTeam: pack.tasks[0].homeTeam,
    firstExpectedScoreKey: pack.tasks[0].expectedScoreKey,
    reviewedDefault: pack.tasks[0].reviewed,
    productionApprovedDefault: pack.tasks[0].productionApproved,
    canonicalWrites: pack.guarantees.canonicalWrites,
    fetch: pack.guarantees.fetch
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  if (!args.input) {
    throw new Error('Missing required --input <truth-audit-resolution-batches.json>');
  }

  const input = readJson(args.input);
  const pack = buildReviewPack(input, args.input, {
    batchId: args['batch-id'] || args.batchId || '',
    batchIndex: args['batch-index'] || args.batchIndex || 0
  });

  const outputPath = args.output || path.join(path.dirname(args.input), 'truth-audit-resolution-review-pack.json');
  writeJson(outputPath, pack);

  console.log(JSON.stringify({
    ok: pack.ok,
    stage: pack.stage,
    input: args.input,
    output: outputPath,
    sourceBatchId: pack.sourceBatchId,
    summary: pack.summary,
    canonicalWrites: pack.guarantees.canonicalWrites,
    fetch: pack.guarantees.fetch,
    productionFinalTruthDecision: pack.guarantees.productionFinalTruthDecision,
    canonicalPromotion: pack.guarantees.canonicalPromotion
  }, null, 2));
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
  main();
}

export {
  buildReviewPack,
  normalizeReviewTask,
  selectBatch
};
