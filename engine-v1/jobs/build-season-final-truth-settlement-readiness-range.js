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

function parseDate(value) {
  if (!isDayKey(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || start > end) {
    throw new Error(`Invalid range: ${startDate} to ${endDate}`);
  }

  const days = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { exists: false, ok: false, data: null, error: 'missing_file' };
    return { exists: true, ok: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')), error: '' };
  } catch (error) {
    return { exists: true, ok: false, data: null, error: error?.message || String(error) };
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function repoRelative(filePath) {
  return path.relative(repoRoot, path.resolve(filePath)).replaceAll(path.sep, '/');
}

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.valuePicks)) return payload.valuePicks;
  if (Array.isArray(payload?.picks)) return payload.picks;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function pickMatchId(row) {
  return clean(row?.matchId || row?.id || row?.fixtureId || row?.eventId || row?.gameId || row?.sourceMatchId || row?.sourceId);
}

function pickLeagueSlug(row) {
  return clean(row?.leagueSlug || row?.league?.slug || row?.league?.id || row?.competition?.slug || row?.competition?.id);
}

function pickTeam(row, side) {
  const value = side === 'home'
    ? row?.homeTeam || row?.home?.name || row?.teams?.homeTeam || row?.teams?.home?.name
    : row?.awayTeam || row?.away?.name || row?.teams?.awayTeam || row?.teams?.away?.name;
  return clean(value);
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inc(map, key, amount = 1) {
  const safeKey = clean(key) || 'unknown';
  map[safeKey] = (map[safeKey] || 0) + amount;
}

function defaultOutputPath(startDate, endDate) {
  return path.resolve(
    repoRoot,
    'data',
    'football-truth',
    '_diagnostics',
    'season-readiness',
    `final-truth-settlement-readiness-${startDate}_to_${endDate}.json`
  );
}

function fixturesPathForDay(dayKey) {
  return path.resolve(repoRoot, 'data', 'deploy-snapshots', dayKey, 'fixtures.json');
}

function canonicalFixturesDirForDay(dayKey) {
  return path.resolve(repoRoot, 'data', 'canonical-fixtures', dayKey);
}

function valuePathForDay(dayKey) {
  return path.resolve(repoRoot, 'data', 'value', `${dayKey}.json`);
}

function finalResultsDirForDay(dayKey) {
  return path.resolve(repoRoot, 'data', 'final-results', dayKey);
}

function settlementSummaryPathForDay(dayKey) {
  return path.resolve(repoRoot, 'data', 'football-truth', '_settlement-summaries', `${dayKey}.value-settlement-summary.json`);
}

function settlementStatisticsPathForDay(dayKey) {
  return path.resolve(repoRoot, 'data', 'football-truth', '_settlement-statistics', `value-settlement-statistics-${dayKey}_to_${dayKey}.json`);
}

function officiatingCandidatesPathForDay(dayKey) {
  return path.resolve(repoRoot, 'data', 'football-truth', '_diagnostics', 'officiating-candidates', `${dayKey}.officiating-candidates.json`);
}

function readFinalResultsByMatch(dayKey) {
  const dir = finalResultsDirForDay(dayKey);
  const byMatch = new Map();

  if (!fs.existsSync(dir)) return byMatch;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const fullPath = path.join(dir, entry.name);
    const read = readJsonIfExists(fullPath);
    if (!read.ok) continue;
    const row = read.data;
    const matchId = clean(row?.matchId || path.basename(entry.name, '.json'));
    if (!matchId) continue;

    byMatch.set(matchId, {
      matchId,
      path: repoRelative(fullPath),
      verifiedFinalTruth: row?.verifiedFinalTruth === true,
      scoreKey: clean(row?.finalScore?.scoreKey || row?.scoreKey),
      status: clean(row?.status || row?.finalScore?.status || ''),
      sourceCount: numberOrZero(row?.verification?.sourceCount),
      independentSourceCount: numberOrZero(row?.verification?.independentSourceCount)
    });
  }

  return byMatch;
}

function summarizeCanonicalFixtureFiles(dayKey) {
  const dir = canonicalFixturesDirForDay(dayKey);
  if (!fs.existsSync(dir)) return { exists: false, files: 0, rows: 0 };

  let files = 0;
  let rows = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    files += 1;
    const read = readJsonIfExists(path.join(dir, entry.name));
    if (!read.ok) continue;
    rows += normalizeRows(read.data).length;
  }

  return { exists: true, files, rows };
}

function buildDayReadiness(dayKey, options = {}) {
  const valueBaselineDate = clean(options.valueBaselineDate || '');
  const valueInScope = !valueBaselineDate || dayKey >= valueBaselineDate;

  const fixturesPath = fixturesPathForDay(dayKey);
  const valuePath = valuePathForDay(dayKey);
  const settlementSummaryPath = settlementSummaryPathForDay(dayKey);
  const settlementStatisticsPath = settlementStatisticsPathForDay(dayKey);
  const officiatingCandidatesPath = officiatingCandidatesPathForDay(dayKey);

  const fixturesRead = readJsonIfExists(fixturesPath);
  const valueRead = readJsonIfExists(valuePath);
  const summaryRead = readJsonIfExists(settlementSummaryPath);
  const statisticsRead = readJsonIfExists(settlementStatisticsPath);
  const officiatingRead = readJsonIfExists(officiatingCandidatesPath);
  const finalResultsByMatch = readFinalResultsByMatch(dayKey);
  const canonicalFixtures = summarizeCanonicalFixtureFiles(dayKey);

  const fixtures = fixturesRead.ok ? normalizeRows(fixturesRead.data) : [];
  const rawValuePicks = valueRead.ok ? normalizeRows(valueRead.data) : [];
  const valuePicks = valueInScope ? rawValuePicks : [];
  const settlementRows = summaryRead.ok ? normalizeRows(summaryRead.data) : [];
  const statisticsRows = statisticsRead.ok ? normalizeRows(statisticsRead.data) : [];
  const officiatingRows = officiatingRead.ok ? normalizeRows(officiatingRead.data) : [];

  const fixtureMatchIds = new Set(fixtures.map(pickMatchId).filter(Boolean));
  const verifiedMatchIds = new Set(
    [...finalResultsByMatch.values()]
      .filter(row => row.verifiedFinalTruth)
      .map(row => row.matchId)
  );

  const valuePicksWithVerifiedFT = valuePicks.filter(row => verifiedMatchIds.has(pickMatchId(row))).length;
  const valuePicksMissingVerifiedFT = valuePicks.length - valuePicksWithVerifiedFT;
  const settledRows = settlementRows.filter(row => ['WIN', 'LOSS', 'VOID'].includes(clean(row?.result).toUpperCase())).length;

  const fixturesByLeague = {};
  for (const fixture of fixtures) inc(fixturesByLeague, pickLeagueSlug(fixture));

  const verifiedFinalTruthByLeague = {};
  for (const fixture of fixtures) {
    const matchId = pickMatchId(fixture);
    if (matchId && verifiedMatchIds.has(matchId)) {
      inc(verifiedFinalTruthByLeague, pickLeagueSlug(fixture));
    }
  }

  const valuePicksByLeague = {};
  const valuePicksWithVerifiedFTByLeague = {};
  const valuePicksMissingVerifiedFTByLeague = {};
  for (const valuePick of valuePicks) {
    const leagueSlug = pickLeagueSlug(valuePick);
    const matchId = pickMatchId(valuePick);
    inc(valuePicksByLeague, leagueSlug);
    if (matchId && verifiedMatchIds.has(matchId)) {
      inc(valuePicksWithVerifiedFTByLeague, leagueSlug);
    } else {
      inc(valuePicksMissingVerifiedFTByLeague, leagueSlug);
    }
  }

  const valuePicksMissingRows = valuePicks
    .filter(row => !verifiedMatchIds.has(pickMatchId(row)))
    .slice(0, 250)
    .map(row => ({
      date: dayKey,
      matchId: pickMatchId(row),
      leagueSlug: pickLeagueSlug(row),
      homeTeam: pickTeam(row, 'home'),
      awayTeam: pickTeam(row, 'away'),
      market: clean(row?.market || row?.marketName),
      pick: clean(row?.pick),
      reason: 'value_pick_missing_verified_final_truth'
    }));

  const verifiedButNotInFixturesRows = [...verifiedMatchIds]
    .filter(matchId => !fixtureMatchIds.has(matchId))
    .slice(0, 250)
    .map(matchId => ({
      date: dayKey,
      matchId,
      finalResultPath: finalResultsByMatch.get(matchId)?.path || '',
      reason: 'verified_final_truth_not_found_in_fixture_snapshot'
    }));

  const officiatingCandidateCoverage = {
    artifactExists: officiatingRead.exists,
    candidateRows: officiatingRows.length,
    rowsWithVerifiedFinalTruthContext: officiatingRows.filter(row => row?.finalResultTruthContext?.verifiedFinalTruth === true).length,
    refereeCandidateRows: officiatingRows.filter(row => clean(row?.refereeCandidate?.candidateState) && clean(row?.refereeCandidate?.candidateState) !== 'missing').length,
    disciplineCandidateRows: officiatingRows.filter(row => clean(row?.disciplineCandidate?.candidateState) && clean(row?.disciplineCandidate?.candidateState) !== 'missing').length
  };

  const coverageRiskReasons = [];
  if (!fixturesRead.exists) coverageRiskReasons.push('missing_deploy_snapshot_fixtures');
  if (fixturesRead.exists && !fixturesRead.ok) coverageRiskReasons.push('unreadable_deploy_snapshot_fixtures');
  if (fixturesRead.ok && fixtures.length === 0) coverageRiskReasons.push('empty_deploy_snapshot_fixtures');
  if (canonicalFixtures.exists && canonicalFixtures.rows > fixtures.length && fixtures.length > 0) {
    coverageRiskReasons.push('canonical_fixture_rows_exceed_deploy_snapshot_rows');
  }
  if (valuePicks.length > 0 && valuePicksMissingVerifiedFT > 0) {
    coverageRiskReasons.push('value_picks_missing_verified_final_truth');
  }
  if (summaryRead.exists && !summaryRead.ok) coverageRiskReasons.push('unreadable_settlement_summary');
  if (statisticsRead.exists && !statisticsRead.ok) coverageRiskReasons.push('unreadable_settlement_statistics');

  return {
    dayKey,
    inputs: {
      fixturesPath: repoRelative(fixturesPath),
      fixturesExists: fixturesRead.exists,
      valuePath: repoRelative(valuePath),
      valueExists: valueRead.exists,
      valueInScope,
      valueBaselineDate,
      ignoredHistoricalValuePicksBeforeBaseline: valueInScope ? 0 : rawValuePicks.length,
      finalResultsDir: repoRelative(finalResultsDirForDay(dayKey)),
      finalResultsExists: fs.existsSync(finalResultsDirForDay(dayKey)),
      settlementSummaryPath: repoRelative(settlementSummaryPath),
      settlementSummaryExists: summaryRead.exists,
      settlementStatisticsPath: repoRelative(settlementStatisticsPath),
      settlementStatisticsExists: statisticsRead.exists,
      officiatingCandidatesPath: repoRelative(officiatingCandidatesPath),
      officiatingCandidatesExists: officiatingRead.exists
    },
    counts: {
      fixtures: fixtures.length,
      canonicalFixtureFiles: canonicalFixtures.files,
      canonicalFixtureRows: canonicalFixtures.rows,
      finalResults: finalResultsByMatch.size,
      verifiedFinalTruthRows: verifiedMatchIds.size,
      missingVerifiedFinalTruthRows: Math.max(0, fixtures.length - [...fixtureMatchIds].filter(matchId => verifiedMatchIds.has(matchId)).length),
      rawValuePicks: rawValuePicks.length,
      valuePicks: valuePicks.length,
      ignoredHistoricalValuePicksBeforeBaseline: valueInScope ? 0 : rawValuePicks.length,
      valuePicksWithVerifiedFT,
      valuePicksMissingVerifiedFT,
      settlementRows,
      settledRows,
      statisticsRows: statisticsRows.length,
      backtestEligibleRows: valuePicksWithVerifiedFT,
      backtestBlockedRows: valuePicksMissingVerifiedFT
    },
    fixturesByLeague,
    verifiedFinalTruthByLeague,
    valuePicksByLeague,
    valuePicksWithVerifiedFTByLeague,
    valuePicksMissingVerifiedFTByLeague,
    officiatingCandidateCoverage,
    coverageRisk: coverageRiskReasons.length > 0,
    coverageRiskReasons,
    sampleRows: {
      valuePicksMissingVerifiedFT: valuePicksMissingRows,
      verifiedFinalTruthNotInFixtures: verifiedButNotInFixturesRows
    }
  };
}

function aggregateDays(days) {
  const summary = {
    days: days.length,
    daysWithFixtures: 0,
    daysMissingFixtures: 0,
    fixturesTotal: 0,
    canonicalFixtureRowsTotal: 0,
    verifiedFinalTruthRows: 0,
    missingVerifiedFinalTruthRows: 0,
    rawValuePicksTotal: 0,
    valuePicksTotal: 0,
    ignoredHistoricalValuePicksBeforeBaseline: 0,
    valuePicksWithVerifiedFT: 0,
    valuePicksMissingVerifiedFT: 0,
    settlementImpactedRows: 0,
    settledRows: 0,
    backtestEligibleRows: 0,
    backtestBlockedRows: 0,
    officiatingCandidateRows: 0,
    refereeCandidateRows: 0,
    disciplineCandidateRows: 0,
    datesWithCoverageRisk: 0
  };

  const byLeague = {};
  const datesWithCoverageRisk = [];
  const valuePicksMissingVerifiedFT = [];
  const verifiedFinalTruthNotInFixtures = [];

  for (const day of days) {
    if (day.counts.fixtures > 0) summary.daysWithFixtures += 1;
    if (!day.inputs.fixturesExists) summary.daysMissingFixtures += 1;

    summary.fixturesTotal += day.counts.fixtures;
    summary.canonicalFixtureRowsTotal += day.counts.canonicalFixtureRows;
    summary.verifiedFinalTruthRows += day.counts.verifiedFinalTruthRows;
    summary.missingVerifiedFinalTruthRows += day.counts.missingVerifiedFinalTruthRows;
    summary.rawValuePicksTotal += day.counts.rawValuePicks;
    summary.valuePicksTotal += day.counts.valuePicks;
    summary.ignoredHistoricalValuePicksBeforeBaseline += day.counts.ignoredHistoricalValuePicksBeforeBaseline;
    summary.valuePicksWithVerifiedFT += day.counts.valuePicksWithVerifiedFT;
    summary.valuePicksMissingVerifiedFT += day.counts.valuePicksMissingVerifiedFT;
    summary.settlementImpactedRows += day.counts.valuePicksMissingVerifiedFT;
    summary.settledRows += day.counts.settledRows;
    summary.backtestEligibleRows += day.counts.backtestEligibleRows;
    summary.backtestBlockedRows += day.counts.backtestBlockedRows;
    summary.officiatingCandidateRows += day.officiatingCandidateCoverage.candidateRows;
    summary.refereeCandidateRows += day.officiatingCandidateCoverage.refereeCandidateRows;
    summary.disciplineCandidateRows += day.officiatingCandidateCoverage.disciplineCandidateRows;

    if (day.coverageRisk) {
      summary.datesWithCoverageRisk += 1;
      datesWithCoverageRisk.push({
        dayKey: day.dayKey,
        reasons: day.coverageRiskReasons,
        counts: day.counts
      });
    }

    const ensureLeague = (leagueSlug) => {
      const safeLeague = clean(leagueSlug) || 'unknown';
      if (!byLeague[safeLeague]) {
        byLeague[safeLeague] = {
          fixtures: 0,
          verifiedFinalTruthRows: 0,
          valuePicks: 0,
          valuePicksWithVerifiedFT: 0,
          valuePicksMissingVerifiedFT: 0
        };
      }
      return byLeague[safeLeague];
    };

    for (const [leagueSlug, count] of Object.entries(day.fixturesByLeague || {})) {
      ensureLeague(leagueSlug).fixtures += count;
    }

    for (const [leagueSlug, count] of Object.entries(day.verifiedFinalTruthByLeague || {})) {
      ensureLeague(leagueSlug).verifiedFinalTruthRows += count;
    }

    for (const [leagueSlug, count] of Object.entries(day.valuePicksByLeague || {})) {
      ensureLeague(leagueSlug).valuePicks += count;
    }

    for (const [leagueSlug, count] of Object.entries(day.valuePicksWithVerifiedFTByLeague || {})) {
      ensureLeague(leagueSlug).valuePicksWithVerifiedFT += count;
    }

    for (const [leagueSlug, count] of Object.entries(day.valuePicksMissingVerifiedFTByLeague || {})) {
      ensureLeague(leagueSlug).valuePicksMissingVerifiedFT += count;
    }

    for (const row of day.sampleRows.valuePicksMissingVerifiedFT || []) {
      if (valuePicksMissingVerifiedFT.length < 500) valuePicksMissingVerifiedFT.push(row);
    }

    for (const row of day.sampleRows.verifiedFinalTruthNotInFixtures || []) {
      if (verifiedFinalTruthNotInFixtures.length < 500) verifiedFinalTruthNotInFixtures.push(row);
    }
  }

  return {
    summary,
    byLeague,
    datesWithCoverageRisk,
    sampleRows: {
      valuePicksMissingVerifiedFT,
      verifiedFinalTruthNotInFixtures
    }
  };
}

function buildSeasonFinalTruthSettlementReadinessRange(startDate, endDate, options = {}) {
  const valueBaselineDate = clean(options.valueBaselineDate || '');
  if (valueBaselineDate && !isDayKey(valueBaselineDate)) {
    throw new Error(`Invalid value baseline date: ${valueBaselineDate}`);
  }

  const dayKeys = dateRange(startDate, endDate);
  const days = dayKeys.map(dayKey => buildDayReadiness(dayKey, { valueBaselineDate }));
  const aggregate = aggregateDays(days);

  return {
    ok: true,
    stage: 'season_final_truth_settlement_readiness_range_ready',
    schema: 'ai-matchlab.season-final-truth-settlement-readiness-range.v1',
    generatedAt: new Date().toISOString(),
    range: {
      startDate,
      endDate,
      days: dayKeys.length,
      valueBaselineDate,
      valueScope: valueBaselineDate ? `value_rows_on_or_after_${valueBaselineDate}` : 'all_value_rows'
    },
    summary: aggregate.summary,
    byLeague: aggregate.byLeague,
    datesWithCoverageRisk: aggregate.datesWithCoverageRisk,
    sampleRows: aggregate.sampleRows,
    days,
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      finalResultWrites: false,
      valueWrites: false,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false,
      officiatingWrites: false,
      sourceFetch: false,
      backtestRun: false,
      readOnlyReadinessAudit: true,
      supportsValueBaselineDate: true
    }
  };
}

function runSelfTest() {
  const day = buildDayReadiness('2099-01-01');
  if (day.dayKey !== '2099-01-01') throw new Error('dayKey mismatch');
  if (!Array.isArray(day.coverageRiskReasons)) throw new Error('coverageRiskReasons missing');
  const report = {
    ok: true,
    stage: 'self_test_readiness_shape_ok',
    dayKey: day.dayKey,
    valueInScope: day.inputs.valueInScope,
    fixtures: day.counts.fixtures,
    valuePicks: day.counts.valuePicks,
    canonicalWrites: 0,
    productionWrite: false,
    sourceFetch: false
  };
  console.log(JSON.stringify(report, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  const startDate = clean(args.start || args.startDate);
  const endDate = clean(args.end || args.endDate || startDate);
  const valueBaselineDate = clean(args['value-baseline-date'] || args.valueBaselineDate || '');

  if (!isDayKey(startDate) || !isDayKey(endDate)) {
    console.error('Usage: node engine-v1/jobs/build-season-final-truth-settlement-readiness-range.js --start YYYY-MM-DD --end YYYY-MM-DD [--output <file>]');
    process.exit(2);
  }

  const outputPath = path.resolve(args.output ? String(args.output) : defaultOutputPath(startDate, endDate));

  try {
    const report = buildSeasonFinalTruthSettlementReadinessRange(startDate, endDate, { valueBaselineDate });
    writeJson(outputPath, report);

    console.log(JSON.stringify({
      ok: report.ok,
      stage: report.stage,
      output: repoRelative(outputPath),
      range: report.range,
      summary: report.summary,
      coverageRiskDates: report.datesWithCoverageRisk.length,
      canonicalWrites: report.guarantees.canonicalWrites,
      productionWrite: report.guarantees.productionWrite,
      valueWrites: report.guarantees.valueWrites,
      sourceFetch: report.guarantees.sourceFetch,
      backtestRun: report.guarantees.backtestRun
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      stage: 'season_final_truth_settlement_readiness_range_failed',
      error: error?.message || String(error),
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false,
      backtestRun: false
    }, null, 2));
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}

export {
  buildSeasonFinalTruthSettlementReadinessRange,
  buildDayReadiness
};