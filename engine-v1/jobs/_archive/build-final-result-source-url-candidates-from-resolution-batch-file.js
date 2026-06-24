#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

function clean(value) {
  return String(value ?? '').trim();
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function deriveTeamsFromQuery(query) {
  const value = clean(query);
  if (!value) {
    return { homeTeam: '', awayTeam: '' };
  }

  const datedMatch = value.match(/^(.*?)\s+vs\s+(.*?)\s+\d{4}-\d{2}-\d{2}\s+final score/i);
  if (datedMatch) {
    return {
      homeTeam: clean(datedMatch[1]),
      awayTeam: clean(datedMatch[2])
    };
  }

  const finalScoreMatch = value.match(/^(.*?)\s+vs\s+(.*?)\s+final score/i);
  if (finalScoreMatch) {
    return {
      homeTeam: clean(finalScoreMatch[1]),
      awayTeam: clean(finalScoreMatch[2])
    };
  }

  const genericMatch = value.match(/^(.*?)\s+vs\s+(.+)$/i);
  if (genericMatch) {
    return {
      homeTeam: clean(genericMatch[1]),
      awayTeam: clean(genericMatch[2])
    };
  }

  return { homeTeam: '', awayTeam: '' };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: '',
    output: '',
    maxTasks: 0,
    intent: '',
    priority: '',
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--self-test') {
      args.selfTest = true;
    } else if (arg === '--input') {
      args.input = clean(argv[++i]);
    } else if (arg === '--output') {
      args.output = clean(argv[++i]);
    } else if (arg === '--max-tasks') {
      args.maxTasks = toInt(argv[++i], 0);
    } else if (arg === '--intent') {
      args.intent = clean(argv[++i]);
    } else if (arg === '--priority') {
      args.priority = clean(argv[++i]);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}

function taskValue(task, key) {
  return task?.[key] ?? task?.resolution?.[key] ?? task?.sourceSearch?.[key] ?? task?.task?.[key] ?? task?.task?.resolution?.[key];
}

function normalizeTask(task, batch = {}) {
  const nested = task?.task && typeof task.task === 'object' ? task.task : {};
  const nestedResolution = nested?.resolution && typeof nested.resolution === 'object' ? nested.resolution : {};

  const day = clean(task.day || task.date || nested.day || batch.day);
  const leagueSlug = clean(task.leagueSlug || nested.leagueSlug || batch.leagueSlug);
  const matchId = clean(task.matchId || nested.matchId || batch.matchId);

  const query = clean(
    task.query ||
    task.searchQuery ||
    taskValue(task, 'query') ||
    taskValue(task, 'searchQuery') ||
    nestedResolution.query
  );

  const queryTeams = deriveTeamsFromQuery(query);

  const homeTeam = clean(
    task.homeTeam ||
    task?.teams?.homeTeam ||
    nested.homeTeam ||
    nested?.teams?.homeTeam ||
    batch.homeTeam ||
    batch?.teams?.homeTeam ||
    queryTeams.homeTeam
  );

  const awayTeam = clean(
    task.awayTeam ||
    task?.teams?.awayTeam ||
    nested.awayTeam ||
    nested?.teams?.awayTeam ||
    batch.awayTeam ||
    batch?.teams?.awayTeam ||
    queryTeams.awayTeam
  );

  const intent = clean(taskValue(task, 'intent'));
  const priority = toInt(taskValue(task, 'priority'), 0);

  const taskId = clean(
    task.taskId ||
    task.sourceTaskId ||
    nested.taskId ||
    task.reviewTaskId ||
    [matchId, intent, priority || 'p'].filter(Boolean).join(':')
  );

  return {
    taskId,
    day,
    date: day,
    leagueSlug,
    matchId,
    homeTeam,
    awayTeam,
    teams: {
      homeTeam,
      awayTeam
    },
    intent,
    priority,
    query,
    sourceTask: task
  };
}

function extractTasks(input) {
  const tasks = [];

  for (const batch of asArray(input.batches)) {
    for (const task of asArray(batch.tasks)) {
      tasks.push(normalizeTask(task, batch));
    }
  }

  for (const task of asArray(input.tasks)) {
    tasks.push(normalizeTask(task));
  }

  for (const task of asArray(input.resolutionTasks)) {
    tasks.push(normalizeTask(task));
  }

  for (const row of asArray(input.rows)) {
    tasks.push(normalizeTask(row));
  }

  for (const itemCase of asArray(input.cases)) {
    for (const task of asArray(itemCase.resolutionTasks)) {
      tasks.push(normalizeTask(task, itemCase));
    }
  }

  const seen = new Set();
  return tasks.filter(task => {
    const key = [task.taskId, task.day, task.leagueSlug, task.matchId, task.intent, task.priority].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(task.matchId && task.intent && task.query);
  });
}

function buildCandidateSearchRow(task, index) {
  const preferredSourceHints = [
    'official club match report',
    'official competition match centre',
    'trusted scoreboard final result page',
    'league official fixture result'
  ];

  return {
    candidateSearchRowId: [
      task.matchId,
      task.intent,
      task.priority || 'p',
      index + 1
    ].join(':'),
    sourceTaskId: task.taskId,
    date: task.day,
    day: task.day,
    leagueSlug: task.leagueSlug,
    matchId: task.matchId,
    homeTeam: task.homeTeam,
    awayTeam: task.awayTeam,
    teams: task.teams,
    intent: task.intent,
    priority: task.priority,
    query: task.query,
    searchMode: 'blocked_by_default',
    blockedReason: 'search_not_performed_allow_search_required',
    preferredSourceHints,
    requiredEvidence: {
      finalStatus: true,
      finalScore: true,
      sourceUrl: true,
      independentFinalTruthEvidence: true
    }
  };
}

function buildReport(input, options = {}) {
  const intentFilter = clean(options.intent);
  const priorityFilter = clean(options.priority);
  const maxTasks = toInt(options.maxTasks, 0);

  let tasks = extractTasks(input);

  const totalInputTasks = tasks.length;

  if (intentFilter) {
    tasks = tasks.filter(task => task.intent === intentFilter);
  }

  if (priorityFilter) {
    tasks = tasks.filter(task => String(task.priority) === priorityFilter);
  }

  tasks.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return [a.day, a.leagueSlug, a.matchId, a.taskId].join('|')
      .localeCompare([b.day, b.leagueSlug, b.matchId, b.taskId].join('|'));
  });

  if (maxTasks > 0) {
    tasks = tasks.slice(0, maxTasks);
  }

  const candidateSearchRows = tasks.map(buildCandidateSearchRow);

  const byIntent = {};
  const byLeague = {};
  const byDay = {};

  for (const row of candidateSearchRows) {
    byIntent[row.intent] = (byIntent[row.intent] || 0) + 1;
    byLeague[row.leagueSlug] = (byLeague[row.leagueSlug] || 0) + 1;
    byDay[row.day] = (byDay[row.day] || 0) + 1;
  }

  return {
    ok: true,
    stage: 'final_result_source_url_candidates_from_resolution_batch_dry_run',
    generatedAt: new Date().toISOString(),
    input: {
      inputPath: clean(options.inputPath)
    },
    filters: {
      intent: intentFilter,
      priority: priorityFilter,
      maxTasks
    },
    summary: {
      totalInputTasks,
      selectedTasks: tasks.length,
      candidateSearchRows: candidateSearchRows.length,
      candidateUrlRows: 0,
      searchPerformed: false,
      fetchPerformed: false,
      byIntent,
      byLeague,
      byDay
    },
    guarantees: {
      canonicalWrites: 0,
      fixtureWrites: false,
      finalResultWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false,
      search: false,
      fetch: false,
      urlFetch: false,
      productionWrite: false,
      productionFinalTruthDecision: false,
      canonicalPromotion: false,
      dryRun: true
    },
    candidateSearchRows,
    candidateUrlRows: []
  };
}

function runSelfTest() {
  const input = {
    ok: true,
    batches: [
      {
        batchId: 'resolution_batch_0001',
        tasks: [
          {
            taskId: 'match-1:value_settlement_final_result_verification:1:resolve',
            day: '2099-01-01',
            leagueSlug: 'test.1',
            matchId: 'match-1',
            homeTeam: 'Alpha FC',
            awayTeam: 'Beta FC',
            intent: 'value_settlement_final_result_verification',
            priority: 1,
            query: 'Alpha FC vs Beta FC 2099-01-01 final score match result'
          },
          {
            taskId: 'match-2:existing_final_truth_verification:2:resolve',
            day: '2099-01-01',
            leagueSlug: 'test.1',
            matchId: 'match-2',
            homeTeam: 'Gamma FC',
            awayTeam: 'Delta FC',
            resolution: {
              intent: 'existing_final_truth_verification',
              priority: 2,
              query: 'Gamma FC vs Delta FC final score'
            }
          }
        ]
      }
    ]
  };

  const report = buildReport(input, {
    inputPath: 'self-test.json',
    intent: 'value_settlement_final_result_verification',
    priority: '1',
    maxTasks: 10
  });

  if (!report.ok) throw new Error('self-test report must be ok');
  if (report.summary.totalInputTasks !== 2) throw new Error('expected 2 input tasks');
  if (report.summary.selectedTasks !== 1) throw new Error('expected 1 selected value task');
  if (report.summary.candidateSearchRows !== 1) throw new Error('expected 1 candidate search row');
  if (report.summary.candidateUrlRows !== 0) throw new Error('candidate URLs must be zero in dry-run candidate builder');
  if (report.candidateSearchRows[0].homeTeam !== 'Alpha FC') {
    throw new Error('candidate row homeTeam should be preserved or derived');
  }
  if (report.candidateSearchRows[0].awayTeam !== 'Beta FC') {
    throw new Error('candidate row awayTeam should be preserved or derived');
  }
  if (report.guarantees.search !== false) throw new Error('search must be false by default');
  if (report.guarantees.fetch !== false) throw new Error('fetch must be false');
  if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites must be zero');
  if (report.guarantees.productionFinalTruthDecision !== false) {
    throw new Error('production final-truth decision must be false');
  }

  const tmpOut = path.join(
    os.tmpdir(),
    'aiml-build-final-result-source-url-candidates-from-resolution-batch-file.self-test.json'
  );
  writeJson(tmpOut, report);

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'build-final-result-source-url-candidates-from-resolution-batch-file',
    stage: report.stage,
    selectedTasks: report.summary.selectedTasks,
    candidateSearchRows: report.summary.candidateSearchRows,
    candidateUrlRows: report.summary.candidateUrlRows,
    search: report.guarantees.search,
    fetch: report.guarantees.fetch,
    canonicalWrites: report.guarantees.canonicalWrites,
    productionFinalTruthDecision: report.guarantees.productionFinalTruthDecision,
    output: tmpOut
  }, null, 2));
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.input) throw new Error('--input is required');
  if (!args.output) throw new Error('--output is required');

  const input = readJson(args.input);
  const report = buildReport(input, {
    inputPath: args.input,
    intent: args.intent,
    priority: args.priority,
    maxTasks: args.maxTasks
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    stage: report.stage,
    output: args.output,
    selectedTasks: report.summary.selectedTasks,
    candidateSearchRows: report.summary.candidateSearchRows,
    candidateUrlRows: report.summary.candidateUrlRows,
    search: report.guarantees.search,
    fetch: report.guarantees.fetch,
    canonicalWrites: report.guarantees.canonicalWrites
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      stage: 'final_result_source_url_candidates_from_resolution_batch_error',
      error: error.message
    }, null, 2));
    process.exitCode = 1;
  }
}

export {
  buildReport,
  extractTasks,
  normalizeTask
};