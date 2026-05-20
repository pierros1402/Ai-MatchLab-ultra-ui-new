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

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(clean(value));
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        ok: false,
        exists: false,
        data: null,
        error: 'missing_file'
      };
    }

    return {
      ok: true,
      exists: true,
      data: JSON.parse(fs.readFileSync(filePath, 'utf8')),
      error: ''
    };
  } catch (error) {
    return {
      ok: false,
      exists: fs.existsSync(filePath),
      data: null,
      error: error?.message || String(error)
    };
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function repoRelative(filePath) {
  const absolute = path.resolve(repoRoot, filePath);
  return path.relative(repoRoot, absolute).replaceAll(path.sep, '/');
}

function defaultSummaryPath(dayKey) {
  return path.resolve(
    repoRoot,
    'data',
    'football-truth',
    '_settlement-summaries',
    `${dayKey}.value-settlement-summary.json`
  );
}

function defaultStatisticsPath(dayKey) {
  return path.resolve(
    repoRoot,
    'data',
    'football-truth',
    '_settlement-statistics',
    `value-settlement-statistics-${dayKey}_to_${dayKey}.json`
  );
}

function defaultOutputPath(dayKey) {
  return path.resolve(
    repoRoot,
    'data',
    'football-truth',
    '_diagnostics',
    'value-settlement-daily-cycle',
    `${dayKey}.value-settlement-output-validation.json`
  );
}

function pushError(errors, code, details = {}) {
  errors.push({
    code,
    ...details
  });
}

function pushWarning(warnings, code, details = {}) {
  warnings.push({
    code,
    ...details
  });
}

function validateSummaryArtifact(summary, dayKey, errors, warnings) {
  if (!summary || typeof summary !== 'object') {
    pushError(errors, 'summary_not_object');
    return;
  }

  if (summary.ok !== true) pushError(errors, 'summary_not_ok');
  if (clean(summary.schema) !== 'ai-matchlab.value-settlement-summary.v1') {
    pushError(errors, 'summary_schema_mismatch', { schema: clean(summary.schema) });
  }
  if (clean(summary.dayKey) !== dayKey) {
    pushError(errors, 'summary_day_key_mismatch', { expected: dayKey, actual: clean(summary.dayKey) });
  }

  const guarantees = summary.guarantees || {};
  if (guarantees.trackedSummaryArtifact !== true) pushError(errors, 'summary_not_tracked_artifact');
  if (guarantees.valueWrites !== false) pushError(errors, 'summary_value_writes_not_false');
  if (guarantees.fixtureWrites !== false) pushError(errors, 'summary_fixture_writes_not_false');
  if (guarantees.historyWrites !== false) pushError(errors, 'summary_history_writes_not_false');
  if (guarantees.detailsWrites !== false) pushError(errors, 'summary_details_writes_not_false');
  if (guarantees.finalResultWrites !== false) pushError(errors, 'summary_final_result_writes_not_false');

  if (!Array.isArray(summary.rows)) pushError(errors, 'summary_rows_not_array');

  const settledRows = Number(summary.summary?.settledRows || 0);
  const rowCount = Array.isArray(summary.rows) ? summary.rows.length : 0;
  if (settledRows !== rowCount) {
    pushError(errors, 'summary_settled_rows_count_mismatch', { settledRows, rowCount });
  }

  const winRows = Array.isArray(summary.rows)
    ? summary.rows.filter(row => clean(row?.result).toUpperCase() === 'WIN').length
    : 0;
  const lossRows = Array.isArray(summary.rows)
    ? summary.rows.filter(row => clean(row?.result).toUpperCase() === 'LOSS').length
    : 0;

  if (Number(summary.summary?.winRows || 0) !== winRows) {
    pushError(errors, 'summary_win_rows_count_mismatch', {
      summaryWinRows: Number(summary.summary?.winRows || 0),
      rowWinRows: winRows
    });
  }

  if (Number(summary.summary?.lossRows || 0) !== lossRows) {
    pushError(errors, 'summary_loss_rows_count_mismatch', {
      summaryLossRows: Number(summary.summary?.lossRows || 0),
      rowLossRows: lossRows
    });
  }

  for (const [index, row] of (Array.isArray(summary.rows) ? summary.rows : []).entries()) {
    if (!clean(row?.matchId)) pushError(errors, 'summary_row_missing_match_id', { index });
    if (!clean(row?.market)) pushError(errors, 'summary_row_missing_market', { index, matchId: clean(row?.matchId) });
    if (!clean(row?.pick)) pushError(errors, 'summary_row_missing_pick', { index, matchId: clean(row?.matchId) });
    if (!['WIN', 'LOSS', 'VOID'].includes(clean(row?.result).toUpperCase())) {
      pushWarning(warnings, 'summary_row_unknown_result', {
        index,
        matchId: clean(row?.matchId),
        result: clean(row?.result)
      });
    }
    if (!clean(row?.finalResultPath)) {
      pushError(errors, 'summary_row_missing_final_result_path', { index, matchId: clean(row?.matchId) });
    }
  }
}

function validateStatisticsArtifact(statistics, dayKey, summary, errors) {
  if (!statistics || typeof statistics !== 'object') {
    pushError(errors, 'statistics_not_object');
    return;
  }

  if (statistics.ok !== true) pushError(errors, 'statistics_not_ok');
  if (clean(statistics.schema) !== 'ai-matchlab.value-settlement-statistics-range.v1') {
    pushError(errors, 'statistics_schema_mismatch', { schema: clean(statistics.schema) });
  }

  if (clean(statistics.range?.startDate) !== dayKey || clean(statistics.range?.endDate) !== dayKey) {
    pushError(errors, 'statistics_range_day_key_mismatch', {
      expected: dayKey,
      actualStart: clean(statistics.range?.startDate),
      actualEnd: clean(statistics.range?.endDate)
    });
  }

  const guarantees = statistics.guarantees || {};
  if (guarantees.readsTrackedSettlementSummariesOnly !== true) {
    pushError(errors, 'statistics_not_marked_tracked_summary_only');
  }
  if (guarantees.requiresVerifiedFinalTruthSummaryArtifacts !== true) {
    pushError(errors, 'statistics_not_marked_verified_final_truth_required');
  }
  if (guarantees.valueWrites !== false) pushError(errors, 'statistics_value_writes_not_false');
  if (guarantees.fixtureWrites !== false) pushError(errors, 'statistics_fixture_writes_not_false');
  if (guarantees.historyWrites !== false) pushError(errors, 'statistics_history_writes_not_false');
  if (guarantees.detailsWrites !== false) pushError(errors, 'statistics_details_writes_not_false');
  if (guarantees.finalResultWrites !== false) pushError(errors, 'statistics_final_result_writes_not_false');

  const summarySettledRows = Number(summary?.summary?.settledRows || 0);
  const summaryWinRows = Number(summary?.summary?.winRows || 0);
  const summaryLossRows = Number(summary?.summary?.lossRows || 0);
  const statisticsSettledRows = Number(statistics.summary?.settledRows || 0);
  const statisticsWinRows = Number(statistics.summary?.winRows || 0);
  const statisticsLossRows = Number(statistics.summary?.lossRows || 0);

  if (statisticsSettledRows !== summarySettledRows) {
    pushError(errors, 'statistics_settled_rows_mismatch_summary', {
      statisticsSettledRows,
      summarySettledRows
    });
  }

  if (statisticsWinRows !== summaryWinRows) {
    pushError(errors, 'statistics_win_rows_mismatch_summary', {
      statisticsWinRows,
      summaryWinRows
    });
  }

  if (statisticsLossRows !== summaryLossRows) {
    pushError(errors, 'statistics_loss_rows_mismatch_summary', {
      statisticsLossRows,
      summaryLossRows
    });
  }

  if (!Array.isArray(statistics.rows)) pushError(errors, 'statistics_rows_not_array');
  if (Array.isArray(statistics.rows) && statistics.rows.length !== summarySettledRows) {
    pushError(errors, 'statistics_rows_count_mismatch_summary', {
      statisticsRows: statistics.rows.length,
      summarySettledRows
    });
  }
}

function buildValidationReport(dayKey, options = {}) {
  const summaryPath = path.resolve(options.summaryPath || defaultSummaryPath(dayKey));
  const statisticsPath = path.resolve(options.statisticsPath || defaultStatisticsPath(dayKey));

  const summaryRead = readJsonFile(summaryPath);
  const statisticsRead = readJsonFile(statisticsPath);
  const errors = [];
  const warnings = [];

  if (!summaryRead.exists) {
    pushError(errors, 'summary_file_missing', { path: repoRelative(summaryPath) });
  } else if (!summaryRead.ok) {
    pushError(errors, 'summary_file_unreadable', { path: repoRelative(summaryPath), error: summaryRead.error });
  }

  if (!statisticsRead.exists) {
    pushError(errors, 'statistics_file_missing', { path: repoRelative(statisticsPath) });
  } else if (!statisticsRead.ok) {
    pushError(errors, 'statistics_file_unreadable', { path: repoRelative(statisticsPath), error: statisticsRead.error });
  }

  if (summaryRead.ok) {
    validateSummaryArtifact(summaryRead.data, dayKey, errors, warnings);
  }

  if (statisticsRead.ok) {
    validateStatisticsArtifact(statisticsRead.data, dayKey, summaryRead.data, errors);
  }

  const summary = summaryRead.data?.summary || {};
  const statistics = statisticsRead.data?.summary || {};

  return {
    ok: errors.length === 0,
    stage: errors.length === 0
      ? 'value_settlement_daily_cycle_output_valid'
      : 'value_settlement_daily_cycle_output_invalid',
    schema: 'ai-matchlab.value-settlement-daily-cycle-output-validation.v1',
    dayKey,
    generatedAt: new Date().toISOString(),
    inputs: {
      summaryPath: repoRelative(summaryPath),
      statisticsPath: repoRelative(statisticsPath),
      summaryExists: summaryRead.exists,
      statisticsExists: statisticsRead.exists
    },
    summary: {
      settledRows: Number(summary.settledRows || 0),
      winRows: Number(summary.winRows || 0),
      lossRows: Number(summary.lossRows || 0),
      unresolvedRows: Number(summary.unresolvedRows || 0),
      statisticsSettledRows: Number(statistics.settledRows || 0),
      statisticsWinRows: Number(statistics.winRows || 0),
      statisticsLossRows: Number(statistics.lossRows || 0),
      statisticsWinRate: statistics.winRate ?? null
    },
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      valueWrites: false,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false,
      finalResultWrites: false,
      validatesTrackedSettlementSummariesOnly: true,
      requiresVerifiedFinalTruthSummaryArtifacts: true
    },
    errors,
    warnings
  };
}

function runSelfTest() {
  const dayKey = '2099-01-01';
  const report = buildValidationReport(dayKey, {
    summaryPath: path.resolve(repoRoot, 'data', 'football-truth', '_missing-self-test-summary.json'),
    statisticsPath: path.resolve(repoRoot, 'data', 'football-truth', '_missing-self-test-statistics.json')
  });

  if (report.ok !== false) throw new Error('missing self-test files must be invalid');
  if (report.errors.length !== 2) throw new Error('expected two missing file errors');
  if (report.guarantees.valueWrites !== false) throw new Error('valueWrites must be false');
  if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites must be zero');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'validate-value-settlement-daily-cycle-output-day',
    invalidReportOk: report.ok,
    errorCount: report.errors.length,
    canonicalWrites: report.guarantees.canonicalWrites,
    productionWrite: report.guarantees.productionWrite,
    valueWrites: report.guarantees.valueWrites
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  const dayKey = clean(args.date || args.day || args.dayKey);
  if (!isDayKey(dayKey)) {
    console.error('Usage: node engine-v1/jobs/validate-value-settlement-daily-cycle-output-day.js --date YYYY-MM-DD [--summary <file>] [--statistics <file>] [--output <file>]');
    process.exit(2);
  }

  const outputPath = args.output
    ? path.resolve(String(args.output))
    : defaultOutputPath(dayKey);

  const report = buildValidationReport(dayKey, {
    summaryPath: args.summary ? path.resolve(String(args.summary)) : defaultSummaryPath(dayKey),
    statisticsPath: args.statistics ? path.resolve(String(args.statistics)) : defaultStatisticsPath(dayKey)
  });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    output: repoRelative(outputPath),
    dayKey: report.dayKey,
    summary: report.summary,
    errors: report.errors.length,
    warnings: report.warnings.length,
    canonicalWrites: report.guarantees.canonicalWrites,
    productionWrite: report.guarantees.productionWrite,
    valueWrites: report.guarantees.valueWrites
  }, null, 2));

  if (!report.ok) process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}

export {
  buildValidationReport,
  validateSummaryArtifact,
  validateStatisticsArtifact
};