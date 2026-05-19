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

  return result;
}

function groupInventoryByLeague(inventory) {
  const grouped = new Map();

  for (const row of asArray(inventory.rows)) {
    const leagueSlug = clean(row.leagueSlug);
    if (!leagueSlug) continue;

    if (!grouped.has(leagueSlug)) {
      grouped.set(leagueSlug, {
        leagueSlug,
        rowCount: 0,
        days: new Set(),
        snapshotFixtureRows: 0,
        canonicalFixtureRows: 0,
        valuePickRows: 0,
        standingsRows: 0,
        motivationPossibleRows: 0,
        fixtureCoverageRiskRows: 0,
        contextDataWarningRows: 0,
        finalTruthRiskRows: 0,
        totalSnapshotFixtures: 0,
        totalCanonicalFixtures: 0,
        totalValuePicks: 0,
        sampleFixtureCoverageReasons: new Set(),
        sampleContextWarningReasons: new Set(),
        sampleFinalTruthReasons: new Set()
      });
    }

    const out = grouped.get(leagueSlug);
    out.rowCount += 1;
    if (row.date) out.days.add(row.date);

    if (Number(row.snapshotFixtureCount || 0) > 0) out.snapshotFixtureRows += 1;
    if (Number(row.canonicalFixtureCount || 0) > 0) out.canonicalFixtureRows += 1;
    if (Number(row.valuePickCount || 0) > 0) out.valuePickRows += 1;
    if (row.standingsAvailable === true) out.standingsRows += 1;
    if (row.motivationContextPossible === true) out.motivationPossibleRows += 1;
    if (row.fixtureCoverageRisk === true) out.fixtureCoverageRiskRows += 1;
    if (row.contextDataWarning === true) out.contextDataWarningRows += 1;
    if (row.finalTruthRisk === true) out.finalTruthRiskRows += 1;

    out.totalSnapshotFixtures += Number(row.snapshotFixtureCount || 0);
    out.totalCanonicalFixtures += Number(row.canonicalFixtureCount || 0);
    out.totalValuePicks += Number(row.valuePickCount || 0);

    for (const reason of asArray(row.fixtureCoverageRiskReasons)) out.sampleFixtureCoverageReasons.add(reason);
    for (const reason of asArray(row.contextDataWarningReasons)) out.sampleContextWarningReasons.add(reason);
    for (const reason of asArray(row.finalTruthRiskReasons)) out.sampleFinalTruthReasons.add(reason);
  }

  return grouped;
}

function motivationOutputMap(motivationSummary) {
  const map = new Map();
  for (const row of asArray(motivationSummary.outputs)) {
    const leagueSlug = clean(row.leagueSlug);
    if (leagueSlug) map.set(leagueSlug, row);
  }
  return map;
}

function readinessStatus(leagueRow, motivationOutput) {
  if (leagueRow.snapshotFixtureRows > 0 && leagueRow.standingsRows === 0) {
    return 'blocked_missing_standings';
  }

  if (leagueRow.fixtureCoverageRiskRows > 0) {
    return 'blocked_fixture_coverage_risk';
  }

  if (leagueRow.finalTruthRiskRows > 0) {
    return 'blocked_final_truth_risk';
  }

  if (leagueRow.motivationPossibleRows === 0) {
    return 'blocked_motivation_context_unavailable';
  }

  if (!motivationOutput) {
    return 'blocked_motivation_output_missing';
  }

  if (leagueRow.contextDataWarningRows > 0) {
    return 'ready_with_context_warnings';
  }

  return 'ready_for_context_integration';
}

function statusSeverity(status) {
  if (status === 'ready_for_context_integration') return 0;
  if (status === 'ready_with_context_warnings') return 1;
  if (status === 'blocked_final_truth_risk') return 2;
  if (status === 'blocked_fixture_coverage_risk') return 3;
  if (status === 'blocked_missing_standings') return 4;
  if (status === 'blocked_motivation_output_missing') return 5;
  return 6;
}

function buildReadinessReport(options) {
  const root = path.resolve(options.root || '.');
  const from = options.from;
  const to = options.to || from;
  const outputDir = options.outputDir || path.join(root, 'data', 'league-context', '_diagnostics', 'readiness-' + from + '_to_' + to);

  fs.mkdirSync(outputDir, { recursive: true });

  const inventoryPath = options.inventory || path.join(outputDir, 'league-context-completeness-' + from + '_to_' + to + '.json');
  const motivationDir = options.motivationDir || path.join(outputDir, 'motivation-range');
  const motivationSummaryPath = path.join(motivationDir, 'team-motivation-context-range-summary.json');

  if (!options.inventory) {
    runNodeScript(
      'build-league-context-completeness-inventory-range',
      path.join('engine-v1', 'jobs', 'build-league-context-completeness-inventory-range.js'),
      ['--from', from, '--to', to, '--output', inventoryPath]
    );
  }

  if (!options.motivationDir) {
    const motivationArgs = [
      '--from', from,
      '--to', to,
      '--inventory', inventoryPath,
      '--output-dir', motivationDir
    ];

    if (options.maxLeagues) {
      motivationArgs.push('--max-leagues', String(options.maxLeagues));
    }

    runNodeScript(
      'build-team-motivation-context-range',
      path.join('engine-v1', 'jobs', 'build-team-motivation-context-range.js'),
      motivationArgs
    );
  }

  const inventory = readJson(inventoryPath);
  const motivationSummary = fs.existsSync(motivationSummaryPath)
    ? readJson(motivationSummaryPath)
    : { outputs: [] };

  const grouped = groupInventoryByLeague(inventory);
  const motivationByLeague = motivationOutputMap(motivationSummary);

  const rows = [];

  for (const [leagueSlug, g] of grouped.entries()) {
    const motivationOutput = motivationByLeague.get(leagueSlug) || null;
    const status = readinessStatus(g, motivationOutput);

    rows.push({
      leagueSlug,
      readinessStatus: status,
      readinessSeverity: statusSeverity(status),
      dayCount: g.days.size,
      inventoryRowCount: g.rowCount,
      snapshotFixtureRows: g.snapshotFixtureRows,
      canonicalFixtureRows: g.canonicalFixtureRows,
      valuePickRows: g.valuePickRows,
      standingsRows: g.standingsRows,
      motivationPossibleRows: g.motivationPossibleRows,
      fixtureCoverageRiskRows: g.fixtureCoverageRiskRows,
      contextDataWarningRows: g.contextDataWarningRows,
      finalTruthRiskRows: g.finalTruthRiskRows,
      totalSnapshotFixtures: g.totalSnapshotFixtures,
      totalCanonicalFixtures: g.totalCanonicalFixtures,
      totalValuePicks: g.totalValuePicks,
      motivationOutputAvailable: !!motivationOutput,
      motivationTeamCount: motivationOutput ? Number(motivationOutput.teamCount || 0) : 0,
      motivationSeasonPhase: motivationOutput ? clean(motivationOutput.seasonPhase) : '',
      motivationMotivatedTeams: motivationOutput ? Number(motivationOutput.motivatedTeams || 0) : 0,
      motivationMidtableTeams: motivationOutput ? Number(motivationOutput.midtableTeams || 0) : 0,
      motivationHighMotivationTeams: motivationOutput ? Number(motivationOutput.highMotivationTeams || 0) : 0,
      profileType: motivationOutput ? clean(motivationOutput.leagueProfile?.profileType) : '',
      hasRelegationPressure: motivationOutput ? motivationOutput.leagueProfile?.hasRelegationPressure === true : null,
      hasContinentalPressure: motivationOutput ? motivationOutput.leagueProfile?.hasContinentalPressure === true : null,
      hasPlayoffPressure: motivationOutput ? motivationOutput.leagueProfile?.hasPlayoffPressure === true : null,
      fixtureCoverageRiskReasons: [...g.sampleFixtureCoverageReasons].sort(),
      contextDataWarningReasons: [...g.sampleContextWarningReasons].sort(),
      finalTruthRiskReasons: [...g.sampleFinalTruthReasons].sort()
    });
  }

  rows.sort((a, b) => {
    if (a.readinessSeverity !== b.readinessSeverity) return a.readinessSeverity - b.readinessSeverity;
    return a.leagueSlug.localeCompare(b.leagueSlug);
  });

  const byStatus = {};
  for (const row of rows) {
    byStatus[row.readinessStatus] = (byStatus[row.readinessStatus] || 0) + 1;
  }

  const report = {
    ok: true,
    stage: 'league_context_motivation_readiness_report_ready',
    generatedAt: new Date().toISOString(),
    root,
    from,
    to,
    outputDir,
    paths: {
      inventoryPath,
      motivationDir,
      motivationSummaryPath
    },
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
      leagueCount: rows.length,
      readyForContextIntegration: rows.filter((r) => r.readinessStatus === 'ready_for_context_integration').length,
      readyWithContextWarnings: rows.filter((r) => r.readinessStatus === 'ready_with_context_warnings').length,
      blockedLeagues: rows.filter((r) => r.readinessStatus.startsWith('blocked_')).length,
      leaguesWithFinalTruthRisk: rows.filter((r) => r.finalTruthRiskRows > 0).length,
      leaguesWithFixtureCoverageRisk: rows.filter((r) => r.fixtureCoverageRiskRows > 0).length,
      leaguesMissingStandings: rows.filter((r) => r.readinessStatus === 'blocked_missing_standings').length,
      motivationOutputLeagues: rows.filter((r) => r.motivationOutputAvailable).length,
      byStatus
    },
    rows
  };

  const outputPath = options.output || path.join(outputDir, 'league-context-motivation-readiness-report.json');
  writeJson(outputPath, report);

  return report;
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiml-league-context-readiness-'));

  try {
    const outputDir = path.join(tempRoot, 'out');
    fs.mkdirSync(outputDir, { recursive: true });

    const inventoryPath = path.join(outputDir, 'inventory.json');
    const motivationDir = path.join(outputDir, 'motivation');

    writeJson(inventoryPath, {
      ok: true,
      rows: [
        {
          date: '2026-05-18',
          leagueSlug: 'ready.1',
          snapshotFixtureCount: 2,
          canonicalFixtureCount: 2,
          valuePickCount: 1,
          standingsAvailable: true,
          motivationContextPossible: true,
          fixtureCoverageRisk: false,
          contextDataWarning: false,
          finalTruthRisk: false
        },
        {
          date: '2026-05-18',
          leagueSlug: 'truthrisk.1',
          snapshotFixtureCount: 1,
          canonicalFixtureCount: 1,
          valuePickCount: 1,
          standingsAvailable: true,
          motivationContextPossible: true,
          fixtureCoverageRisk: false,
          contextDataWarning: false,
          finalTruthRisk: true,
          finalTruthRiskReasons: ['score_present_without_final_status']
        },
        {
          date: '2026-05-18',
          leagueSlug: 'nostandings.1',
          snapshotFixtureCount: 1,
          canonicalFixtureCount: 1,
          valuePickCount: 0,
          standingsAvailable: false,
          motivationContextPossible: false,
          fixtureCoverageRisk: false,
          contextDataWarning: true,
          contextDataWarningReasons: ['standings_missing'],
          finalTruthRisk: false
        }
      ]
    });

    writeJson(path.join(motivationDir, 'team-motivation-context-range-summary.json'), {
      ok: true,
      outputs: [
        {
          leagueSlug: 'ready.1',
          teamCount: 12,
          seasonPhase: 'run_in',
          motivatedTeams: 6,
          midtableTeams: 6,
          highMotivationTeams: 3,
          leagueProfile: {
            profileType: 'domestic_league',
            hasRelegationPressure: true,
            hasContinentalPressure: true,
            hasPlayoffPressure: false
          }
        },
        {
          leagueSlug: 'truthrisk.1',
          teamCount: 10,
          seasonPhase: 'middle',
          motivatedTeams: 4,
          midtableTeams: 6,
          highMotivationTeams: 1,
          leagueProfile: {
            profileType: 'domestic_league',
            hasRelegationPressure: true,
            hasContinentalPressure: true,
            hasPlayoffPressure: false
          }
        }
      ]
    });

    const report = buildReadinessReport({
      root: tempRoot,
      from: '2026-05-18',
      to: '2026-05-18',
      inventory: inventoryPath,
      motivationDir,
      outputDir
    });

    if (report.summary.leagueCount !== 3) throw new Error('expected 3 leagues');
    if (report.summary.readyForContextIntegration !== 1) throw new Error('expected 1 ready league');
    if (report.summary.leaguesWithFinalTruthRisk !== 1) throw new Error('expected 1 final truth risk league');
    if (report.summary.leaguesMissingStandings !== 1) throw new Error('expected 1 missing standings league');
    if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
    if (report.guarantees.fetch !== false) throw new Error('fetch guarantee failed');

    console.log(JSON.stringify({
      ok: true,
      selfTest: 'build-league-context-motivation-readiness-report-range',
      leagueCount: report.summary.leagueCount,
      readyForContextIntegration: report.summary.readyForContextIntegration,
      blockedLeagues: report.summary.blockedLeagues,
      leaguesWithFinalTruthRisk: report.summary.leaguesWithFinalTruthRisk,
      leaguesMissingStandings: report.summary.leaguesMissingStandings,
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

  const report = buildReadinessReport({
    root: args.root || '.',
    from: args.from,
    to: args.to || args.from,
    inventory: args.inventory || '',
    motivationDir: args.motivationDir || args['motivation-dir'] || '',
    outputDir: args.outputDir || args['output-dir'] || '',
    output: args.output || '',
    maxLeagues: args.maxLeagues || args['max-leagues'] || ''
  });

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    outputDir: report.outputDir,
    paths: report.paths,
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
  buildReadinessReport,
  readinessStatus,
  groupInventoryByLeague
};