#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runNodeScript(label, scriptPath, scriptArgs) {
  const result = spawnSync(process.execPath, [scriptPath].concat(scriptArgs), {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    throw new Error(label + ' failed with exit code ' + String(result.status));
  }

  return {
    label,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function safeRangeName(from, to) {
  return String(from) + '_to_' + String(to);
}

function buildPaths(outputDir, from, to) {
  const rangeName = safeRangeName(from, to);
  return {
    inventory: path.join(outputDir, 'inventory-' + rangeName + '.json'),
    workset: path.join(outputDir, 'truth-audit-workset-' + rangeName + '.json'),
    searchTargets: path.join(outputDir, 'truth-audit-search-targets-' + rangeName + '.json'),
    resolutionTasks: path.join(outputDir, 'truth-audit-resolution-tasks-' + rangeName + '.json'),
    summary: path.join(outputDir, 'truth-audit-range-summary-' + rangeName + '.json')
  };
}

function runPipeline(options) {
  ensureDir(options.outputDir);
  const paths = buildPaths(options.outputDir, options.from, options.to);

  const inventoryArgs = [
    '--from', options.from,
    '--to', options.to,
    '--output', paths.inventory
  ];

  if (options.snapshotsDir) {
    inventoryArgs.push('--snapshots-dir', options.snapshotsDir);
  }

  if (options.includeFinalVerificationCandidates) {
    inventoryArgs.push('--include-final-verification-candidates');
  }

  runNodeScript(
    'build-final-result-missing-ft-inventory-range',
    path.join('engine-v1', 'jobs', 'build-final-result-missing-ft-inventory-range.js'),
    inventoryArgs
  );

  runNodeScript(
    'build-final-result-truth-audit-workset-from-inventory-file',
    path.join('engine-v1', 'jobs', 'build-final-result-truth-audit-workset-from-inventory-file.js'),
    ['--input', paths.inventory, '--output', paths.workset]
  );

  runNodeScript(
    'materialize-final-result-source-search-targets-file',
    path.join('engine-v1', 'jobs', 'materialize-final-result-source-search-targets-file.js'),
    [
      '--input', paths.workset,
      '--output', paths.searchTargets,
      '--max-targets-per-match', String(options.maxTargetsPerMatch)
    ]
  );

  runNodeScript(
    'materialize-final-result-source-resolution-tasks-file',
    path.join('engine-v1', 'jobs', 'materialize-final-result-source-resolution-tasks-file.js'),
    ['--input', paths.searchTargets, '--output', paths.resolutionTasks]
  );

  const inventory = readJson(paths.inventory);
  const workset = readJson(paths.workset);
  const searchTargets = readJson(paths.searchTargets);
  const resolutionTasks = readJson(paths.resolutionTasks);

  const report = {
    ok: true,
    stage: 'final_result_truth_audit_workset_range_ready',
    generatedAt: new Date().toISOString(),
    from: options.from,
    to: options.to,
    outputDir: options.outputDir,
    paths,
    options: {
      includeFinalVerificationCandidates: options.includeFinalVerificationCandidates,
      maxTargetsPerMatch: options.maxTargetsPerMatch,
      snapshotsDir: options.snapshotsDir || null
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
      inventory: inventory.summary || {},
      workset: workset.summary || {},
      searchTargets: searchTargets.summary || {},
      resolutionTasks: resolutionTasks.summary || {}
    }
  };

  writeJson(paths.summary, report);
  return report;
}

function writeSelfTestSnapshot(rootDir) {
  const snapshotDir = path.join(rootDir, '2026-05-18');
  ensureDir(snapshotDir);

  writeJson(path.join(snapshotDir, 'fixtures.json'), {
    fixtures: [
      {
        id: 'self-test-match-1',
        league: 'test.1',
        homeTeam: 'Alpha FC',
        awayTeam: 'Beta FC',
        status: 'LIVE',
        startTime: '2026-05-18T12:00:00Z',
        homeScore: 1,
        awayScore: 0
      },
      {
        id: 'self-test-match-2',
        league: 'test.1',
        homeTeam: 'Gamma FC',
        awayTeam: 'Delta FC',
        status: 'FT',
        startTime: '2026-05-18T10:00:00Z',
        homeScore: 2,
        awayScore: 1
      }
    ]
  });

  writeJson(path.join(snapshotDir, 'value.json'), {
    picks: [
      {
        matchId: 'self-test-match-1',
        market: '1X2',
        selection: 'HOME',
        status: 'unset'
      }
    ]
  });
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiml-ft-audit-wrapper-'));
  const snapshotsDir = path.join(tempRoot, 'deploy-snapshots');
  const outputDir = path.join(tempRoot, 'out');

  try {
    writeSelfTestSnapshot(snapshotsDir);
    const report = runPipeline({
      from: '2026-05-18',
      to: '2026-05-18',
      outputDir,
      snapshotsDir,
      includeFinalVerificationCandidates: true,
      maxTargetsPerMatch: 4
    });

    const resolutionSummary = report.summary.resolutionTasks || {};
    const worksetSummary = report.summary.workset || {};

    if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
    if (report.guarantees.fetch !== false) throw new Error('fetch guarantee failed');
    if (report.guarantees.canonicalPromotion !== false) throw new Error('canonicalPromotion guarantee failed');
    if (!resolutionSummary.totalResolutionTasks || resolutionSummary.totalResolutionTasks <= 0) throw new Error('expected resolution tasks');
    if (!worksetSummary.verifyExistingFinalTruthRows || worksetSummary.verifyExistingFinalTruthRows <= 0) throw new Error('expected verification candidate rows');

    console.log(JSON.stringify({
      ok: true,
      selfTest: 'run-final-result-truth-audit-workset-range',
      totalRows: worksetSummary.totalRows,
      missingFinalTruthRows: worksetSummary.missingFinalTruthRows,
      verifyExistingFinalTruthRows: worksetSummary.verifyExistingFinalTruthRows,
      totalSearchTargets: (report.summary.searchTargets || {}).totalSearchTargets,
      totalResolutionTasks: resolutionSummary.totalResolutionTasks,
      canonicalWrites: report.guarantees.canonicalWrites,
      fetch: report.guarantees.fetch,
      canonicalPromotion: report.guarantees.canonicalPromotion
    }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  if (!args.from) throw new Error('Missing required --from YYYY-MM-DD');
  if (!args.to) throw new Error('Missing required --to YYYY-MM-DD');

  const outputDir = args.outputDir || args['output-dir'] || path.join(
    process.cwd(),
    'data',
    'football-truth',
    '_diagnostics',
    'truth-audit-range-' + safeRangeName(args.from, args.to)
  );

  const report = runPipeline({
    from: args.from,
    to: args.to,
    outputDir,
    snapshotsDir: args['snapshots-dir'] || null,
    includeFinalVerificationCandidates: args['missing-only'] === true ? false : true,
    maxTargetsPerMatch: Number(args['max-targets-per-match'] || 4)
  });

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    from: report.from,
    to: report.to,
    outputDir: report.outputDir,
    summary: report.summary,
    canonicalWrites: report.guarantees.canonicalWrites,
    fetch: report.guarantees.fetch,
    urlResolutionSideEffects: report.guarantees.urlResolutionSideEffects,
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
  runPipeline,
  buildPaths
};
