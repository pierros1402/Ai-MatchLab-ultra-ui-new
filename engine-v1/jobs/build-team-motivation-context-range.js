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

function clean(value) {
  return String(value || '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function uniqueEligibleLeagues(inventory) {
  const rows = asArray(inventory.rows);
  const set = new Set();

  for (const row of rows) {
    if (row && row.standingsAvailable === true && row.motivationContextPossible === true) {
      const leagueSlug = clean(row.leagueSlug);
      if (leagueSlug) set.add(leagueSlug);
    }
  }

  return [...set].sort();
}

function buildRangeMotivation(options) {
  const root = path.resolve(options.root || '.');
  const outputDir = options.outputDir || path.join(root, 'data', 'league-context', '_diagnostics', 'motivation-range-' + options.from + '_to_' + options.to);
  fs.mkdirSync(outputDir, { recursive: true });

  const inventoryPath = options.inventory || path.join(outputDir, 'league-context-completeness-' + options.from + '_to_' + options.to + '.json');

  if (!options.inventory) {
    runNodeScript(
      'build-league-context-completeness-inventory-range',
      path.join('engine-v1', 'jobs', 'build-league-context-completeness-inventory-range.js'),
      ['--from', options.from, '--to', options.to, '--output', inventoryPath]
    );
  }

  const inventory = readJson(inventoryPath);
  const eligibleLeagues = uniqueEligibleLeagues(inventory);
  const maxLeagues = Number(options.maxLeagues || eligibleLeagues.length);
  const selectedLeagues = eligibleLeagues.slice(0, Math.max(0, maxLeagues));

  const outputs = [];
  const skipped = [];

  for (const leagueSlug of selectedLeagues) {
    const standingsPath = path.join(root, 'data', 'standings', leagueSlug + '.json');
    if (!fs.existsSync(standingsPath)) {
      skipped.push({ leagueSlug, reason: 'standings_file_missing' });
      continue;
    }

    const outPath = path.join(outputDir, leagueSlug + '.motivation.json');

    const args = [
      '--input', standingsPath,
      '--output', outPath,
      '--league', leagueSlug
    ];

    runNodeScript(
      'build-team-motivation-context-from-standings-file',
      path.join('engine-v1', 'jobs', 'build-team-motivation-context-from-standings-file.js'),
      args
    );

    const payload = readJson(outPath);
    outputs.push({
      leagueSlug,
      output: outPath,
      teamCount: payload.summary?.teamCount ?? 0,
      seasonPhase: payload.summary?.seasonPhase || '',
      motivatedTeams: payload.summary?.motivatedTeams ?? 0,
      midtableTeams: payload.summary?.midtableTeams ?? 0,
      highMotivationTeams: payload.summary?.highMotivationTeams ?? 0,
      leagueProfile: payload.leagueProfile || {}
    });
  }

  const report = {
    ok: true,
    stage: 'team_motivation_context_range_ready',
    generatedAt: new Date().toISOString(),
    root,
    from: options.from,
    to: options.to,
    outputDir,
    inventoryPath,
    guarantees: {
      canonicalWrites: 0,
      fetch: false,
      productionFinalTruthDecision: false,
      canonicalPromotion: false,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    },
    summary: {
      eligibleLeagueCount: eligibleLeagues.length,
      selectedLeagueCount: selectedLeagues.length,
      outputCount: outputs.length,
      skippedCount: skipped.length,
      totalTeams: outputs.reduce((sum, row) => sum + Number(row.teamCount || 0), 0),
      totalMotivatedTeams: outputs.reduce((sum, row) => sum + Number(row.motivatedTeams || 0), 0),
      totalHighMotivationTeams: outputs.reduce((sum, row) => sum + Number(row.highMotivationTeams || 0), 0)
    },
    outputs,
    skipped
  };

  const summaryPath = path.join(outputDir, 'team-motivation-context-range-summary.json');
  writeJson(summaryPath, report);

  return report;
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiml-team-motivation-range-'));

  try {
    fs.mkdirSync(path.join(tempRoot, 'data', 'standings'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'data', 'league-context', '_diagnostics'), { recursive: true });

    writeJson(path.join(tempRoot, 'data', 'standings', 'test.1.json'), {
      league: 'test.1',
      confidence: 0.9,
      completeness: 1,
      table: [
        { position: 1, team: 'Alpha FC', played: 32, points: 70, goalDiff: 31 },
        { position: 2, team: 'Beta FC', played: 32, points: 67, goalDiff: 25 },
        { position: 3, team: 'Gamma FC', played: 32, points: 56, goalDiff: 12 },
        { position: 4, team: 'Delta FC', played: 32, points: 42, goalDiff: 1 },
        { position: 5, team: 'Epsilon FC', played: 32, points: 31, goalDiff: -10 },
        { position: 6, team: 'Zeta FC', played: 32, points: 29, goalDiff: -18 }
      ]
    });

    const inventoryPath = path.join(tempRoot, 'inventory.json');
    writeJson(inventoryPath, {
      ok: true,
      rows: [
        {
          date: '2026-05-18',
          leagueSlug: 'test.1',
          standingsAvailable: true,
          motivationContextPossible: true
        },
        {
          date: '2026-05-18',
          leagueSlug: 'missing.1',
          standingsAvailable: false,
          motivationContextPossible: false
        }
      ]
    });

    const outputDir = path.join(tempRoot, 'out');
    const report = buildRangeMotivation({
      root: tempRoot,
      from: '2026-05-18',
      to: '2026-05-18',
      inventory: inventoryPath,
      outputDir
    });

    if (report.summary.eligibleLeagueCount !== 1) throw new Error('expected 1 eligible league');
    if (report.summary.outputCount !== 1) throw new Error('expected 1 output');
    if (report.outputs[0].leagueSlug !== 'test.1') throw new Error('expected test.1 output');
    if (report.outputs[0].teamCount !== 6) throw new Error('expected 6 teams');
    if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
    if (report.guarantees.fetch !== false) throw new Error('fetch guarantee failed');

    console.log(JSON.stringify({
      ok: true,
      selfTest: 'build-team-motivation-context-range',
      eligibleLeagueCount: report.summary.eligibleLeagueCount,
      outputCount: report.summary.outputCount,
      totalTeams: report.summary.totalTeams,
      totalMotivatedTeams: report.summary.totalMotivatedTeams,
      canonicalWrites: report.guarantees.canonicalWrites,
      fetch: report.guarantees.fetch
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

  const report = buildRangeMotivation({
    root: args.root || '.',
    from: args.from,
    to: args.to || args.from,
    inventory: args.inventory || '',
    outputDir: args.outputDir || args['output-dir'] || '',
    maxLeagues: args.maxLeagues || args['max-leagues'] || ''
  });

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    outputDir: report.outputDir,
    inventoryPath: report.inventoryPath,
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
  buildRangeMotivation,
  uniqueEligibleLeagues
};