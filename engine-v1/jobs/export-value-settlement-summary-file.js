#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), '../..');

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

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function repoRelative(filePath) {
  const absolute = path.resolve(repoRoot, filePath);
  return path.relative(repoRoot, absolute).replaceAll(path.sep, '/');
}

function defaultOutputPath(dayKey) {
  return path.resolve(repoRoot, 'data', 'football-truth', '_settlement-summaries', `${dayKey}.value-settlement-summary.json`);
}

function validateInputReport(report) {
  const errors = [];

  if (report?.ok !== true) errors.push('settlement_report_not_ok');

  const allowedStages = new Set([
    'value_settlement_from_verified_final_results_dry_run',
    'value_settlement_from_verified_final_results_write_dry_run_ready',
    'value_settlement_from_verified_final_results_write_completed'
  ]);

  if (!allowedStages.has(clean(report?.stage))) {
    errors.push('unexpected_settlement_report_stage');
  }

  const dayKey = clean(report?.dayKey || report?.draftValueData?.settlementDraft?.dayKey);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    errors.push('missing_or_invalid_day_key');
  }

  if (!Array.isArray(report?.settledRows)) {
    errors.push('missing_settled_rows_array');
  }

  if (report?.guarantees?.fixtureWrites !== false) errors.push('input_fixture_writes_not_false');
  if (report?.guarantees?.historyWrites !== false) errors.push('input_history_writes_not_false');
  if (report?.guarantees?.detailsWrites !== false) errors.push('input_details_writes_not_false');

  return errors;
}

function normalizeSettledRows(report) {
  return (Array.isArray(report?.settledRows) ? report.settledRows : [])
    .map((row, index) => ({
      rowIndex: index,
      matchId: clean(row?.matchId),
      leagueSlug: clean(row?.leagueSlug),
      homeTeam: clean(row?.homeTeam),
      awayTeam: clean(row?.awayTeam),
      scoreKey: clean(row?.scoreKey),
      market: clean(row?.market),
      pick: clean(row?.pick),
      result: clean(row?.result).toUpperCase(),
      finalResultPath: clean(row?.finalResultPath)
    }))
    .filter(row => row.matchId || row.market || row.pick || row.result);
}

function buildSummary(report, options = {}) {
  const errors = validateInputReport(report);
  const dayKey = clean(report?.dayKey || report?.draftValueData?.settlementDraft?.dayKey);
  const rows = normalizeSettledRows(report);

  const winRows = rows.filter(row => row.result === 'WIN').length;
  const lossRows = rows.filter(row => row.result === 'LOSS').length;
  const voidRows = rows.filter(row => row.result === 'VOID').length;
  const unknownRows = rows.filter(row => !['WIN', 'LOSS', 'VOID'].includes(row.result)).length;

  return {
    ok: errors.length === 0,
    stage: errors.length === 0 ? 'value_settlement_summary_export_ready' : 'value_settlement_summary_export_blocked',
    schema: 'ai-matchlab.value-settlement-summary.v1',
    dayKey,
    generatedAt: new Date().toISOString(),
    input: options.inputPath ? repoRelative(options.inputPath) : null,
    source: {
      settlementReportStage: clean(report?.stage),
      requiresVerifiedFinalTruth: Boolean(report?.guarantees?.requiresVerifiedFinalTruth),
      valuePath: clean(report?.inputs?.valuePath),
      finalResultsDir: clean(report?.inputs?.finalResultsDir)
    },
    summary: {
      valuePicks: Number(report?.summary?.valuePicks || 0),
      verifiedFinalResults: Number(report?.summary?.verifiedFinalResults || 0),
      settledRows: rows.length,
      unresolvedRows: Number(report?.summary?.unresolvedRows || 0),
      winRows,
      lossRows,
      voidRows,
      unknownRows
    },
    rows,
    errors,
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      valueWrites: false,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false,
      finalResultWrites: false,
      trackedSummaryArtifact: true
    }
  };
}

function runSelfTest() {
  const report = {
    ok: true,
    stage: 'value_settlement_from_verified_final_results_dry_run',
    dayKey: '2099-01-01',
    inputs: {
      valuePath: 'data/value/2099-01-01.json',
      finalResultsDir: 'data/final-results/2099-01-01'
    },
    summary: {
      valuePicks: 1,
      verifiedFinalResults: 1,
      settledRows: 1,
      unresolvedRows: 0
    },
    settledRows: [
      {
        matchId: 'self-test-1',
        leagueSlug: 'test.1',
        homeTeam: 'Home',
        awayTeam: 'Away',
        scoreKey: '2-0',
        market: '1X2',
        pick: 'AWAY',
        result: 'LOSS',
        finalResultPath: 'data/final-results/2099-01-01/self-test-1.json'
      }
    ],
    guarantees: {
      requiresVerifiedFinalTruth: true,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    }
  };

  const summary = buildSummary(report, { inputPath: 'self-test-settlement-report.json' });

  if (summary.ok !== true) throw new Error('expected self-test summary ok');
  if (summary.summary.settledRows !== 1) throw new Error('expected one settled row');
  if (summary.summary.lossRows !== 1) throw new Error('expected one loss row');
  if (summary.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites must be zero');
  if (summary.guarantees.valueWrites !== false) throw new Error('valueWrites must be false');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'export-value-settlement-summary-file',
    stage: summary.stage,
    settledRows: summary.summary.settledRows,
    winRows: summary.summary.winRows,
    lossRows: summary.summary.lossRows,
    canonicalWrites: summary.guarantees.canonicalWrites,
    productionWrite: summary.guarantees.productionWrite,
    valueWrites: summary.guarantees.valueWrites
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  if (!args.input) {
    console.error('Usage: node engine-v1/jobs/export-value-settlement-summary-file.js --input <settlement-report.json> [--output <summary.json>]');
    process.exit(2);
  }

  const inputPath = path.resolve(String(args.input));
  const report = readJson(inputPath);
  const dayKey = clean(report?.dayKey || report?.draftValueData?.settlementDraft?.dayKey);

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    console.error('Input settlement report is missing valid dayKey');
    process.exit(2);
  }

  const outputPath = args.output ? path.resolve(String(args.output)) : defaultOutputPath(dayKey);
  const summary = buildSummary(report, { inputPath });
  writeJson(outputPath, summary);

  console.log(JSON.stringify({
    ok: summary.ok,
    stage: summary.stage,
    output: repoRelative(outputPath),
    dayKey: summary.dayKey,
    summary: summary.summary,
    canonicalWrites: summary.guarantees.canonicalWrites,
    productionWrite: summary.guarantees.productionWrite,
    valueWrites: summary.guarantees.valueWrites
  }, null, 2));

  if (!summary.ok) process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}

export {
  buildSummary,
  normalizeSettledRows,
  validateInputReport
};