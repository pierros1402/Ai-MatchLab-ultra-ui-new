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

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
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

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(clean(value));
}

function addDays(dayKey, days) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function listDayKeys(startDate, endDate) {
  const days = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
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

function defaultOutputPath(startDate, endDate) {
  return path.resolve(
    repoRoot,
    'data',
    'football-truth',
    '_settlement-statistics',
    `value-settlement-statistics-${startDate}_to_${endDate}.json`
  );
}

function blankBucket() {
  return {
    settledRows: 0,
    winRows: 0,
    lossRows: 0,
    voidRows: 0,
    unknownRows: 0,
    winRate: null
  };
}

function updateBucket(bucket, row) {
  bucket.settledRows += 1;
  if (row.result === 'WIN') bucket.winRows += 1;
  else if (row.result === 'LOSS') bucket.lossRows += 1;
  else if (row.result === 'VOID') bucket.voidRows += 1;
  else bucket.unknownRows += 1;

  const denominator = bucket.winRows + bucket.lossRows;
  bucket.winRate = denominator > 0
    ? Number((bucket.winRows / denominator).toFixed(6))
    : null;
}

function validateSummaryArtifact(summary, dayKey) {
  const errors = [];

  if (summary?.ok !== true) errors.push('summary_not_ok');
  if (clean(summary?.schema) !== 'ai-matchlab.value-settlement-summary.v1') {
    errors.push('unexpected_summary_schema');
  }
  if (clean(summary?.dayKey) !== dayKey) errors.push('day_key_mismatch');
  if (summary?.guarantees?.trackedSummaryArtifact !== true) {
    errors.push('summary_not_marked_tracked_artifact');
  }
  if (summary?.guarantees?.valueWrites !== false) errors.push('summary_value_writes_not_false');
  if (summary?.guarantees?.fixtureWrites !== false) errors.push('summary_fixture_writes_not_false');
  if (summary?.guarantees?.historyWrites !== false) errors.push('summary_history_writes_not_false');
  if (summary?.guarantees?.detailsWrites !== false) errors.push('summary_details_writes_not_false');
  if (!Array.isArray(summary?.rows)) errors.push('summary_rows_not_array');

  return errors;
}

function normalizeSummaryRows(summary) {
  return (Array.isArray(summary?.rows) ? summary.rows : [])
    .map((row, index) => ({
      rowIndex: index,
      date: clean(summary?.dayKey),
      matchId: clean(row?.matchId),
      leagueSlug: clean(row?.leagueSlug),
      homeTeam: clean(row?.homeTeam),
      awayTeam: clean(row?.awayTeam),
      scoreKey: clean(row?.scoreKey),
      market: clean(row?.market),
      pick: clean(row?.pick),
      result: clean(row?.result).toUpperCase(),
      finalResultPath: clean(row?.finalResultPath),
      summaryPath: null
    }))
    .filter(row => row.matchId || row.market || row.pick || row.result);
}

function buildStatisticsRange(startDate, endDate, options = {}) {
  const days = listDayKeys(startDate, endDate);
  const foundSummaries = [];
  const missingSummaries = [];
  const rejectedSummaries = [];
  const rows = [];

  for (const dayKey of days) {
    const summaryPath = defaultSummaryPath(dayKey);
    const summary = readJsonSafe(summaryPath, null);

    if (!summary) {
      missingSummaries.push({
        dayKey,
        path: repoRelative(summaryPath),
        reason: 'missing_summary_artifact'
      });
      continue;
    }

    const errors = validateSummaryArtifact(summary, dayKey);
    if (errors.length) {
      rejectedSummaries.push({
        dayKey,
        path: repoRelative(summaryPath),
        errors
      });
      continue;
    }

    foundSummaries.push({
      dayKey,
      path: repoRelative(summaryPath),
      settledRows: Number(summary?.summary?.settledRows || 0),
      winRows: Number(summary?.summary?.winRows || 0),
      lossRows: Number(summary?.summary?.lossRows || 0)
    });

    for (const row of normalizeSummaryRows(summary)) {
      rows.push({
        ...row,
        summaryPath: repoRelative(summaryPath)
      });
    }
  }

  const total = blankBucket();
  const byDate = {};
  const byMarket = {};
  const byLeague = {};

  for (const row of rows) {
    updateBucket(total, row);

    const dateKey = row.date || 'unknown_date';
    const marketKey = row.market || 'unknown_market';
    const leagueKey = row.leagueSlug || 'unknown_league';

    byDate[dateKey] = byDate[dateKey] || blankBucket();
    byMarket[marketKey] = byMarket[marketKey] || blankBucket();
    byLeague[leagueKey] = byLeague[leagueKey] || blankBucket();

    updateBucket(byDate[dateKey], row);
    updateBucket(byMarket[marketKey], row);
    updateBucket(byLeague[leagueKey], row);
  }

  return {
    ok: rejectedSummaries.length === 0,
    stage: rejectedSummaries.length === 0
      ? 'value_settlement_statistics_range_ready'
      : 'value_settlement_statistics_range_has_rejected_summaries',
    schema: 'ai-matchlab.value-settlement-statistics-range.v1',
    generatedAt: new Date().toISOString(),
    range: {
      startDate,
      endDate,
      days: days.length
    },
    inputs: {
      sourceDir: 'data/football-truth/_settlement-summaries',
      foundSummaries,
      missingSummaries,
      rejectedSummaries
    },
    summary: {
      summaryArtifactsFound: foundSummaries.length,
      summaryArtifactsMissing: missingSummaries.length,
      summaryArtifactsRejected: rejectedSummaries.length,
      settledRows: total.settledRows,
      winRows: total.winRows,
      lossRows: total.lossRows,
      voidRows: total.voidRows,
      unknownRows: total.unknownRows,
      winRate: total.winRate
    },
    byDate,
    byMarket,
    byLeague,
    rows,
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      readsTrackedSettlementSummariesOnly: true,
      requiresVerifiedFinalTruthSummaryArtifacts: true,
      valueWrites: false,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false,
      finalResultWrites: false
    }
  };
}

function runSelfTest() {
  const stats = buildStatisticsRange('2099-01-01', '2099-01-01');

  if (stats.ok !== true) throw new Error('missing summaries should not make self-test fail');
  if (stats.summary.summaryArtifactsFound !== 0) throw new Error('expected zero found summaries');
  if (stats.summary.summaryArtifactsMissing !== 1) throw new Error('expected one missing summary');
  if (stats.guarantees.valueWrites !== false) throw new Error('valueWrites must be false');
  if (stats.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites must be zero');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'build-value-settlement-statistics-range',
    stage: stats.stage,
    summaryArtifactsFound: stats.summary.summaryArtifactsFound,
    summaryArtifactsMissing: stats.summary.summaryArtifactsMissing,
    settledRows: stats.summary.settledRows,
    canonicalWrites: stats.guarantees.canonicalWrites,
    productionWrite: stats.guarantees.productionWrite,
    valueWrites: stats.guarantees.valueWrites
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  const startDate = clean(args.start || args.from || args.startDate);
  const endDate = clean(args.end || args.to || args.endDate || startDate);

  if (!isDayKey(startDate) || !isDayKey(endDate)) {
    console.error('Usage: node engine-v1/jobs/build-value-settlement-statistics-range.js --start YYYY-MM-DD --end YYYY-MM-DD [--output <report.json>]');
    process.exit(2);
  }

  if (startDate > endDate) {
    console.error(`Invalid range: start date ${startDate} is after end date ${endDate}`);
    process.exit(2);
  }

  const outputPath = args.output
    ? path.resolve(String(args.output))
    : defaultOutputPath(startDate, endDate);

  const stats = buildStatisticsRange(startDate, endDate);
  writeJson(outputPath, stats);

  console.log(JSON.stringify({
    ok: stats.ok,
    stage: stats.stage,
    output: repoRelative(outputPath),
    range: stats.range,
    summary: stats.summary,
    canonicalWrites: stats.guarantees.canonicalWrites,
    productionWrite: stats.guarantees.productionWrite,
    valueWrites: stats.guarantees.valueWrites
  }, null, 2));

  if (!stats.ok) process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}

export {
  buildStatisticsRange,
  normalizeSummaryRows,
  validateSummaryArtifact
};