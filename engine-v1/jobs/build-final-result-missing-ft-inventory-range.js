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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function dateRange(from, to) {
  const out = [];
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  if (Number.isNaN(start.getTime())) throw new Error('Invalid --from date: ' + from);
  if (Number.isNaN(end.getTime())) throw new Error('Invalid --to date: ' + to);
  if (start > end) throw new Error('--from must be before or equal to --to');

  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function firstNonEmpty() {
  for (const value of arguments) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractFixtures(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return asArray(payload.fixtures || payload.matches || payload.events || payload.data);
}

function extractValuePicks(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return asArray(payload.picks || payload.valuePicks || payload.rows || payload.data);
}

function fixtureId(fixture) {
  return String(firstNonEmpty(fixture.id, fixture.matchId, fixture.fixtureId, fixture.eventId, fixture.gameId));
}

function teamName(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    return String(firstNonEmpty(value.name, value.displayName, value.shortName, value.teamName)).trim();
  }
  return '';
}

function extractHomeTeam(fixture) {
  return teamName(firstNonEmpty(fixture.homeTeam, fixture.home, fixture.home_team, fixture.homeName, fixture.competitors && fixture.competitors.home));
}

function extractAwayTeam(fixture) {
  return teamName(firstNonEmpty(fixture.awayTeam, fixture.away, fixture.away_team, fixture.awayName, fixture.competitors && fixture.competitors.away));
}

function extractScore(fixture) {
  const homeScore = toNumberOrNull(firstNonEmpty(
    fixture.homeScore,
    fixture.scoreHome,
    fixture.homeGoals,
    fixture.home_score,
    fixture.score && fixture.score.home,
    fixture.finalScore && fixture.finalScore.home
  ));

  const awayScore = toNumberOrNull(firstNonEmpty(
    fixture.awayScore,
    fixture.scoreAway,
    fixture.awayGoals,
    fixture.away_score,
    fixture.score && fixture.score.away,
    fixture.finalScore && fixture.finalScore.away
  ));

  return { homeScore, awayScore };
}

function extractStartTime(fixture) {
  return String(firstNonEmpty(fixture.startTime, fixture.start_time, fixture.date, fixture.utcDate, fixture.kickoff, fixture.kickoffUtc, fixture.timestamp));
}

function isFinalStatus(status) {
  return ['FT', 'AET', 'PEN', 'FULL_TIME', 'FINAL', 'COMPLETED', 'STATUS_FINAL'].includes(status);
}

function isLiveStatus(status) {
  return ['LIVE', 'IN_PLAY', 'FIRST_HALF', 'SECOND_HALF', 'HALF_TIME', 'HT', 'ET', 'BREAK'].includes(status);
}

function isPreStatus(status) {
  return status === '' || ['PRE', 'NS', 'SCHEDULED', 'TIMED', 'NOT_STARTED', 'STATUS_SCHEDULED'].includes(status);
}

function hoursSinceStart(startTime, nowMs) {
  if (!startTime) return null;
  const ms = Date.parse(startTime);
  if (!Number.isFinite(ms)) return null;
  return (nowMs - ms) / 3600000;
}

function classifyFixture(fixture, context) {
  const status = normalizeStatus(firstNonEmpty(fixture.status, fixture.shortStatus, fixture.statusType, fixture.state));
  const id = fixtureId(fixture);
  const startTime = extractStartTime(fixture);
  const ageHours = hoursSinceStart(startTime, context.nowMs);
  const score = extractScore(fixture);
  const hasScore = score.homeScore !== null && score.awayScore !== null;
  const reasons = [];

  if (isFinalStatus(status)) {
    if (!hasScore) reasons.push('final_status_without_score');
  } else if (isLiveStatus(status)) {
    if (ageHours !== null && ageHours >= context.staleLiveHours) reasons.push('stale_live_after_threshold');
  } else if (isPreStatus(status)) {
    if (ageHours !== null && ageHours >= context.preAfterStartHours) reasons.push('pre_status_after_start_threshold');
  } else {
    if (ageHours !== null && ageHours >= context.unknownAfterStartHours) reasons.push('unknown_status_after_start_threshold');
  }

  if (!isFinalStatus(status) && hasScore && ageHours !== null && ageHours >= context.scoreWithoutFinalHours) {
    reasons.push('score_present_without_final_status');
  }

  return {
    suspect: reasons.length > 0,
    row: {
      date: context.dayKey,
      matchId: id,
      league: String(firstNonEmpty(fixture.league, fixture.leagueSlug, fixture.competition, fixture.competitionId)),
      homeTeam: extractHomeTeam(fixture),
      awayTeam: extractAwayTeam(fixture),
      status,
      startTime,
      ageHours: ageHours === null ? null : Number(ageHours.toFixed(2)),
      homeScore: score.homeScore,
      awayScore: score.awayScore,
      reasons
    }
  };
}

function valuePickKey(pick) {
  return String(firstNonEmpty(pick.matchId, pick.fixtureId, pick.eventId, pick.id));
}

function classifyValuePick(pick, fixturesById, context) {
  const id = valuePickKey(pick);
  const fixture = fixturesById.get(id);
  const status = fixture ? normalizeStatus(firstNonEmpty(fixture.status, fixture.shortStatus, fixture.statusType, fixture.state)) : '';
  const pickStatus = normalizeStatus(firstNonEmpty(pick.result, pick.outcome, pick.settlement, pick.status));
  const settled = ['WIN', 'LOSS', 'VOID', 'PUSH', 'HALF_WIN', 'HALF_LOSS'].includes(pickStatus);

  if (fixture && isFinalStatus(status) && !settled) {
    return {
      suspect: true,
      row: {
        date: context.dayKey,
        matchId: id,
        market: String(firstNonEmpty(pick.market, pick.type, pick.pickType)),
        selection: String(firstNonEmpty(pick.selection, pick.side, pick.pick)),
        fixtureStatus: status,
        pickStatus: pickStatus || 'unset',
        reason: 'final_fixture_value_pick_unsettled'
      }
    };
  }

  return { suspect: false, row: null };
}

function scanDay(dayKey, options) {
  const snapshotDir = path.join(options.snapshotsDir, dayKey);
  const fixturesPath = path.join(snapshotDir, 'fixtures.json');
  const valuePath = path.join(snapshotDir, 'value.json');
  const fixturesPayload = readJsonIfExists(fixturesPath);
  const valuePayload = readJsonIfExists(valuePath);
  const fixtures = extractFixtures(fixturesPayload);
  const valuePicks = extractValuePicks(valuePayload);

  const context = {
    dayKey,
    nowMs: options.nowMs,
    staleLiveHours: options.staleLiveHours,
    preAfterStartHours: options.preAfterStartHours,
    unknownAfterStartHours: options.unknownAfterStartHours,
    scoreWithoutFinalHours: options.scoreWithoutFinalHours
  };

  const fixturesById = new Map();
  for (const fixture of fixtures) {
    const id = fixtureId(fixture);
    if (id) fixturesById.set(id, fixture);
  }

  const suspectFixtures = [];
  for (const fixture of fixtures) {
    const result = classifyFixture(fixture, context);
    if (result.suspect) suspectFixtures.push(result.row);
  }

  const unsettledValuePicks = [];
  for (const pick of valuePicks) {
    const result = classifyValuePick(pick, fixturesById, context);
    if (result.suspect) unsettledValuePicks.push(result.row);
  }

  return {
    date: dayKey,
    snapshotExists: fs.existsSync(snapshotDir),
    fixturesPath: fs.existsSync(fixturesPath) ? fixturesPath : null,
    valuePath: fs.existsSync(valuePath) ? valuePath : null,
    fixtureCount: fixtures.length,
    valuePickCount: valuePicks.length,
    suspectFixtureCount: suspectFixtures.length,
    unsettledValuePickCount: unsettledValuePicks.length,
    suspectFixtures,
    unsettledValuePicks
  };
}

function buildInventory(options) {
  const days = dateRange(options.from, options.to);
  const dayReports = days.map((dayKey) => scanDay(dayKey, options));

  const summary = {
    from: options.from,
    to: options.to,
    totalDays: dayReports.length,
    daysWithSnapshots: dayReports.filter((day) => day.snapshotExists).length,
    totalFixtures: dayReports.reduce((sum, day) => sum + day.fixtureCount, 0),
    totalValuePicks: dayReports.reduce((sum, day) => sum + day.valuePickCount, 0),
    suspectFixtures: dayReports.reduce((sum, day) => sum + day.suspectFixtureCount, 0),
    unsettledValuePicks: dayReports.reduce((sum, day) => sum + day.unsettledValuePickCount, 0),
    datesWithSuspects: dayReports.filter((day) => day.suspectFixtureCount > 0 || day.unsettledValuePickCount > 0).map((day) => day.date)
  };

  return {
    ok: true,
    stage: 'final_result_missing_ft_inventory_range_ready',
    generatedAt: new Date().toISOString(),
    root: options.root,
    snapshotsDir: options.snapshotsDir,
    thresholds: {
      staleLiveHours: options.staleLiveHours,
      preAfterStartHours: options.preAfterStartHours,
      unknownAfterStartHours: options.unknownAfterStartHours,
      scoreWithoutFinalHours: options.scoreWithoutFinalHours
    },
    guarantees: {
      canonicalWrites: 0,
      promotion: false,
      productionFinalTruthDecision: false,
      productionRepair: false,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    },
    summary,
    days: dayReports
  };
}

function runSelfTest() {
  const fixture = {
    id: 'm1',
    homeTeam: 'Alpha FC',
    awayTeam: 'Beta FC',
    status: 'LIVE',
    startTime: '2026-05-01T12:00:00Z',
    homeScore: 1,
    awayScore: 0
  };
  const context = {
    dayKey: '2026-05-01',
    nowMs: Date.parse('2026-05-01T16:00:00Z'),
    staleLiveHours: 2.25,
    preAfterStartHours: 4,
    unknownAfterStartHours: 4,
    scoreWithoutFinalHours: 2.5
  };
  const result = classifyFixture(fixture, context);
  if (!result.suspect) throw new Error('expected stale live suspect');
  if (!result.row.reasons.includes('stale_live_after_threshold')) throw new Error('missing stale live reason');
  if (!result.row.reasons.includes('score_present_without_final_status')) throw new Error('missing score without final reason');

  const report = buildInventory({
    from: '2026-05-01',
    to: '2026-05-01',
    root: process.cwd(),
    snapshotsDir: path.join(process.cwd(), 'data', 'deploy-snapshots', '__self_test_missing_dir__'),
    nowMs: Date.parse('2026-05-02T00:00:00Z'),
    staleLiveHours: 2.25,
    preAfterStartHours: 4,
    unknownAfterStartHours: 4,
    scoreWithoutFinalHours: 2.5
  });
  if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
  if (report.guarantees.promotion !== false) throw new Error('promotion guarantee failed');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'build-final-result-missing-ft-inventory-range',
    staleLiveSuspect: result.suspect,
    reasons: result.row.reasons,
    totalDays: report.summary.totalDays,
    canonicalWrites: report.guarantees.canonicalWrites,
    promotion: report.guarantees.promotion
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  if (!args.from) throw new Error('Missing required --from YYYY-MM-DD');
  if (!args.to) throw new Error('Missing required --to YYYY-MM-DD');

  const root = process.cwd();
  const snapshotsDir = args['snapshots-dir'] || path.join(root, 'data', 'deploy-snapshots');
  const options = {
    from: args.from,
    to: args.to,
    root,
    snapshotsDir,
    nowMs: Date.now(),
    staleLiveHours: Number(args['stale-live-hours'] || 2.25),
    preAfterStartHours: Number(args['pre-after-start-hours'] || 4),
    unknownAfterStartHours: Number(args['unknown-after-start-hours'] || 4),
    scoreWithoutFinalHours: Number(args['score-without-final-hours'] || 2.5)
  };

  const report = buildInventory(options);
  const outputPath = args.output || path.join(root, 'data', 'football-truth', '_diagnostics', 'final-result-missing-ft-inventory-' + args.from + '_to_' + args.to + '.json');
  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    output: outputPath,
    summary: report.summary,
    canonicalWrites: report.guarantees.canonicalWrites,
    promotion: report.guarantees.promotion,
    productionFinalTruthDecision: report.guarantees.productionFinalTruthDecision
  }, null, 2));
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
  main();
}

export {
  buildInventory,
  scanDay,
  classifyFixture,
  classifyValuePick
};
