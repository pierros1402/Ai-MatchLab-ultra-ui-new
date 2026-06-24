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

function extractTasks(input) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];
  const direct = input.resolutionTasks || input.tasks || input.rows;
  if (Array.isArray(direct)) return direct;

  const out = [];
  for (const item of asArray(input.cases)) {
    for (const task of asArray(item.resolutionTasks)) {
      out.push(task);
    }
  }
  return out;
}

function taskIntent(task) {
  return String((task.resolution && task.resolution.intent) || (task.sourceSearch && task.sourceSearch.intent) || task.intent || '').trim();
}

function taskQuery(task) {
  return String((task.resolution && task.resolution.query) || (task.sourceSearch && task.sourceSearch.query) || task.query || '').trim();
}

function taskPriority(task) {
  const raw = (task.resolution && task.resolution.priority) || (task.sourceSearch && task.sourceSearch.priority) || task.priority || 99;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 99;
}

function taskMatchId(task) {
  return String(task.matchId || task.id || '').trim();
}

function taskDay(task) {
  return String(task.day || task.date || '').trim();
}

function taskLeague(task) {
  return String(task.leagueSlug || task.league || '').trim();
}

function normalizeTask(task, index) {
  return {
    taskIndex: index,
    taskId: String(task.taskId || task.id || 'resolution_task_' + String(index + 1)),
    matchId: taskMatchId(task),
    day: taskDay(task),
    leagueSlug: taskLeague(task),
    intent: taskIntent(task),
    query: taskQuery(task),
    priority: taskPriority(task),
    raw: task
  };
}

function parseList(value) {
  if (!value) return [];
  return String(value).split(',').map((x) => x.trim()).filter(Boolean);
}

function matchesFilter(task, filters) {
  if (filters.intentSet.size > 0 && !filters.intentSet.has(task.intent)) return false;
  if (filters.leagueSet.size > 0 && !filters.leagueSet.has(task.leagueSlug)) return false;
  if (filters.daySet.size > 0 && !filters.daySet.has(task.day)) return false;
  if (filters.priority !== null && task.priority !== filters.priority) return false;
  if (filters.matchIdSet.size > 0 && !filters.matchIdSet.has(task.matchId)) return false;
  return true;
}

function bucketName(task) {
  if (task.intent === 'value_settlement_final_result_verification') return 'value_settlement_verification';
  if (task.intent.includes('score_crosscheck')) return 'score_crosscheck';
  if (task.intent === 'missing_final_truth') return 'missing_final_truth';
  if (task.intent === 'verify_existing_final_truth') return 'verify_existing_final_truth';
  if (task.intent === 'official_or_trusted_final_result') return 'official_or_trusted_final_result';
  return task.intent || 'unknown_intent';
}

function compareTasks(a, b) {
  const bucketOrder = {
    value_settlement_verification: 0,
    missing_final_truth: 1,
    score_crosscheck: 2,
    verify_existing_final_truth: 3,
    official_or_trusted_final_result: 4,
    unknown_intent: 9
  };
  const ba = bucketOrder[bucketName(a)] ?? 8;
  const bb = bucketOrder[bucketName(b)] ?? 8;
  if (ba !== bb) return ba - bb;
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.day !== b.day) return a.day.localeCompare(b.day);
  if (a.leagueSlug !== b.leagueSlug) return a.leagueSlug.localeCompare(b.leagueSlug);
  if (a.matchId !== b.matchId) return a.matchId.localeCompare(b.matchId);
  return a.taskId.localeCompare(b.taskId);
}

function makeBatches(tasks, batchSize) {
  const batches = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const slice = tasks.slice(i, i + batchSize);
    const byIntent = {};
    const byLeague = {};
    const byDay = {};

    for (const task of slice) {
      byIntent[task.intent || 'unknown'] = (byIntent[task.intent || 'unknown'] || 0) + 1;
      byLeague[task.leagueSlug || 'unknown'] = (byLeague[task.leagueSlug || 'unknown'] || 0) + 1;
      byDay[task.day || 'unknown'] = (byDay[task.day || 'unknown'] || 0) + 1;
    }

    batches.push({
      batchId: 'resolution_batch_' + String(batches.length + 1).padStart(4, '0'),
      batchIndex: batches.length,
      taskCount: slice.length,
      firstTaskIndex: slice[0] ? slice[0].taskIndex : null,
      lastTaskIndex: slice[slice.length - 1] ? slice[slice.length - 1].taskIndex : null,
      byIntent,
      byLeague,
      byDay,
      tasks: slice.map((task) => ({
        taskId: task.taskId,
        matchId: task.matchId,
        day: task.day,
        leagueSlug: task.leagueSlug,
        intent: task.intent,
        query: task.query,
        priority: task.priority,
        raw: task.raw
      }))
    });
  }
  return batches;
}

function buildBatches(input, inputPath, options) {
  const normalized = extractTasks(input).map(normalizeTask);
  const filters = {
    intentSet: new Set(parseList(options.intent)),
    leagueSet: new Set(parseList(options.league)),
    daySet: new Set(parseList(options.day)),
    matchIdSet: new Set(parseList(options.matchId)),
    priority: options.priority === undefined || options.priority === null || options.priority === '' ? null : Number(options.priority)
  };

  const filtered = normalized.filter((task) => matchesFilter(task, filters)).sort(compareTasks);
  const limit = Number(options.maxTasks || 0);
  const limited = limit > 0 ? filtered.slice(0, limit) : filtered;
  const batchSize = Math.max(1, Number(options.batchSize || 100));
  const batches = makeBatches(limited, batchSize);

  const byIntent = {};
  const byLeague = {};
  const byDay = {};
  for (const task of limited) {
    byIntent[task.intent || 'unknown'] = (byIntent[task.intent || 'unknown'] || 0) + 1;
    byLeague[task.leagueSlug || 'unknown'] = (byLeague[task.leagueSlug || 'unknown'] || 0) + 1;
    byDay[task.day || 'unknown'] = (byDay[task.day || 'unknown'] || 0) + 1;
  }

  return {
    ok: true,
    stage: 'final_result_truth_audit_resolution_batches_ready',
    generatedAt: new Date().toISOString(),
    inputPath,
    filters: {
      intent: parseList(options.intent),
      league: parseList(options.league),
      day: parseList(options.day),
      matchId: parseList(options.matchId),
      priority: filters.priority,
      maxTasks: limit,
      batchSize
    },
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
      totalInputTasks: normalized.length,
      filteredTasks: filtered.length,
      selectedTasks: limited.length,
      batchCount: batches.length,
      batchSize,
      byIntent,
      byLeague,
      byDay
    },
    batches
  };
}

function runSelfTest() {
  const input = {
    cases: [
      {
        resolutionTasks: [
          { taskId: 't1', matchId: 'm1', day: '2026-05-18', leagueSlug: 'eng.1', resolution: { intent: 'missing_final_truth', query: 'A vs B final score', priority: 1 } },
          { taskId: 't2', matchId: 'm1', day: '2026-05-18', leagueSlug: 'eng.1', resolution: { intent: 'missing_final_truth_score_crosscheck', query: 'A vs B final score 1-0', priority: 1 } },
          { taskId: 't3', matchId: 'm2', day: '2026-05-18', leagueSlug: 'eng.1', resolution: { intent: 'verify_existing_final_truth', query: 'C vs D final score', priority: 2 } },
          { taskId: 't4', matchId: 'm3', day: '2026-05-18', leagueSlug: 'col.2', resolution: { intent: 'value_settlement_final_result_verification', query: 'E vs F result', priority: 1 } }
        ]
      }
    ]
  };

  const report = buildBatches(input, 'self-test', {
    maxTasks: 3,
    batchSize: 2,
    intent: '',
    league: '',
    day: '',
    matchId: '',
    priority: ''
  });

  if (report.summary.totalInputTasks !== 4) throw new Error('expected 4 input tasks');
  if (report.summary.selectedTasks !== 3) throw new Error('expected 3 selected tasks');
  if (report.summary.batchCount !== 2) throw new Error('expected 2 batches');
  if (report.batches[0].tasks[0].intent !== 'value_settlement_final_result_verification') throw new Error('expected value settlement task first');
  if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
  if (report.guarantees.fetch !== false) throw new Error('fetch guarantee failed');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'build-final-result-truth-audit-resolution-batches-file',
    totalInputTasks: report.summary.totalInputTasks,
    selectedTasks: report.summary.selectedTasks,
    batchCount: report.summary.batchCount,
    firstIntent: report.batches[0].tasks[0].intent,
    canonicalWrites: report.guarantees.canonicalWrites,
    fetch: report.guarantees.fetch
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  if (!args.input) {
    throw new Error('Missing required --input <truth-audit-resolution-tasks.json>');
  }

  const input = readJson(args.input);
  const report = buildBatches(input, args.input, {
    maxTasks: args['max-tasks'] || args.maxTasks || 0,
    batchSize: args['batch-size'] || args.batchSize || 100,
    intent: args.intent || '',
    league: args.league || '',
    day: args.day || '',
    matchId: args['match-id'] || args.matchId || '',
    priority: args.priority || ''
  });

  const outputPath = args.output || path.join(path.dirname(args.input), 'truth-audit-resolution-batches.json');
  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    input: args.input,
    output: outputPath,
    summary: report.summary,
    canonicalWrites: report.guarantees.canonicalWrites,
    fetch: report.guarantees.fetch,
    productionFinalTruthDecision: report.guarantees.productionFinalTruthDecision,
    canonicalPromotion: report.guarantees.canonicalPromotion
  }, null, 2));
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
  main();
}

export {
  buildBatches,
  extractTasks,
  normalizeTask
};
