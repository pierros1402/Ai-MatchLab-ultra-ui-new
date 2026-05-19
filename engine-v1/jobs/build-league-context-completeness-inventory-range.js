#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import os from 'node:os';
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

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function dateRange(from, to) {
  const out = [];
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid --from/--to date');
  }
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value || '').trim();
}

function norm(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

function leagueOf(row) {
  return clean(
    row.leagueSlug ||
    row.league ||
    row.leagueId ||
    row.competitionSlug ||
    row.competition ||
    row.tournamentSlug
  );
}

function teamName(row, side) {
  const obj = row[side];
  if (obj && typeof obj === 'object') return clean(obj.name || obj.team || obj.displayName || obj.shortName);
  return clean(
    row[side + 'Team'] ||
    row[side + 'Name'] ||
    row[side + '_team'] ||
    row[side]
  );
}

function statusOf(row) {
  return clean(row.status || row.state || row.matchStatus || row.statusType || row.phase).toUpperCase();
}

function scoreValue(row, key) {
  const direct = row[key];
  if (direct !== undefined && direct !== null && direct !== '') return Number(direct);
  if (row.score && typeof row.score === 'object') {
    const v = row.score[key] ?? row.score[key.replace('Score', '')];
    if (v !== undefined && v !== null && v !== '') return Number(v);
  }
  return null;
}

function hasScore(row) {
  const h = scoreValue(row, 'homeScore');
  const a = scoreValue(row, 'awayScore');
  return Number.isFinite(h) && Number.isFinite(a);
}

function isFinalStatus(row) {
  const s = statusOf(row);
  return s === 'FT' || s === 'FULL_TIME' || s === 'FINAL' || s === 'FINISHED' || s === 'AET' || s === 'PEN';
}

function isLiveLikeStatus(row) {
  const s = statusOf(row);
  return s.includes('LIVE') || s.includes('FIRST') || s.includes('SECOND') || s.includes('HALF') || s === 'HT' || s === 'IN_PLAY';
}

function groupByLeague(rows) {
  const map = new Map();
  for (const row of rows) {
    const league = leagueOf(row) || 'unknown';
    if (!map.has(league)) map.set(league, []);
    map.get(league).push(row);
  }
  return map;
}

function readCanonicalFixturesForDate(root, day) {
  const dir = path.join(root, 'data', 'canonical-fixtures', day);
  const byLeague = new Map();
  if (!fs.existsSync(dir)) return byLeague;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    const leagueSlug = entry.replace(/\.json$/i, '');
    const payload = readJsonIfExists(path.join(dir, entry), []);
    byLeague.set(leagueSlug, extractFixtures(payload));
  }
  return byLeague;
}

function standingsTable(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.table)) return payload.table;
  if (payload.phaseTables && typeof payload.phaseTables === 'object') {
    const first = Object.values(payload.phaseTables).find(Array.isArray);
    if (Array.isArray(first)) return first;
  }
  if (payload.phases && typeof payload.phases === 'object') {
    const first = Object.values(payload.phases).find(Array.isArray);
    if (Array.isArray(first)) return first;
  }
  return [];
}

function readStandings(root, leagueSlug) {
  const filePath = path.join(root, 'data', 'standings', leagueSlug + '.json');
  const payload = readJsonIfExists(filePath, null);
  const table = standingsTable(payload);
  const teamSet = new Set(table.map((row) => norm(row.team || row.teamName || row.name)).filter(Boolean));
  return {
    available: !!payload && table.length > 0,
    filePath: fs.existsSync(filePath) ? filePath : '',
    confidence: payload && payload.confidence !== undefined ? Number(payload.confidence) : null,
    completeness: payload && payload.completeness !== undefined ? Number(payload.completeness) : null,
    teamCount: table.length,
    teamSet,
    tableSample: table.slice(0, 3).map((row) => ({
      position: row.position ?? row.rank ?? null,
      team: row.team || row.teamName || row.name || '',
      played: row.played ?? null,
      points: row.points ?? null,
      goalDiff: row.goalDiff ?? row.goalDifference ?? null
    }))
  };
}

function fixtureTeams(fixtures) {
  const teams = [];
  for (const f of fixtures) {
    const h = teamName(f, 'home');
    const a = teamName(f, 'away');
    if (h) teams.push(h);
    if (a) teams.push(a);
  }
  return teams;
}

function countMatchedTeams(teams, standingsTeamSet) {
  let matched = 0;
  for (const team of teams) {
    if (standingsTeamSet.has(norm(team))) matched += 1;
  }
  return matched;
}

function buildRow(root, day, leagueSlug, snapshotFixtures, canonicalFixtures, valuePicks) {
  const standings = readStandings(root, leagueSlug);
  const teams = fixtureTeams(snapshotFixtures);
  const matchedTeams = countMatchedTeams(teams, standings.teamSet);

  const suspectFixtures = snapshotFixtures.filter((f) => {
    if (isLiveLikeStatus(f)) return true;
    if (hasScore(f) && !isFinalStatus(f)) return true;
    return false;
  });

  const fixtureCoverageReasons = [];
  const contextDataWarnings = [];

  if (snapshotFixtures.length === 0 && canonicalFixtures.length > 0) {
    fixtureCoverageReasons.push('snapshot_missing_but_canonical_has_fixtures');
  }

  if (canonicalFixtures.length > 0 && snapshotFixtures.length > 0 && snapshotFixtures.length < canonicalFixtures.length) {
    fixtureCoverageReasons.push('snapshot_below_canonical_fixture_count');
  }

  if (canonicalFixtures.length === 0 && snapshotFixtures.length > 0) {
    contextDataWarnings.push('canonical_reference_missing_for_snapshot_league');
  }

  if (!standings.available) {
    contextDataWarnings.push('standings_missing');
  }

  const finalTruthReasons = [];
  if (suspectFixtures.length > 0) finalTruthReasons.push('suspect_final_status_or_score_rows');

  const motivationContextPossible = standings.available && teams.length > 0 && matchedTeams > 0;

  return {
    date: day,
    leagueSlug,
    snapshotFixtureCount: snapshotFixtures.length,
    canonicalFixtureCount: canonicalFixtures.length,
    valuePickCount: valuePicks.length,
    standingsAvailable: standings.available,
    standingsTeamCount: standings.teamCount,
    standingsConfidence: standings.confidence,
    standingsCompleteness: standings.completeness,
    snapshotTeamNameCount: teams.length,
    snapshotTeamsMatchedInStandings: matchedTeams,
    motivationContextPossible,
    fixtureCoverageRisk: fixtureCoverageReasons.length > 0,
    fixtureCoverageRiskReasons: fixtureCoverageReasons,
    contextDataWarning: contextDataWarnings.length > 0,
    contextDataWarningReasons: contextDataWarnings,
    finalTruthRisk: finalTruthReasons.length > 0,
    finalTruthRiskReasons: finalTruthReasons,
    suspectFixtureCount: suspectFixtures.length,
    sampleTeams: teams.slice(0, 8),
    standingsSample: standings.tableSample
  };
}

function buildInventory(root, from, to) {
  const rows = [];
  const days = dateRange(from, to);

  for (const day of days) {
    const snapshotFixturesPath = path.join(root, 'data', 'deploy-snapshots', day, 'fixtures.json');
    const snapshotValuePath = path.join(root, 'data', 'deploy-snapshots', day, 'value.json');

    const snapshotFixtures = extractFixtures(readJsonIfExists(snapshotFixturesPath, []));
    const valuePicks = extractValuePicks(readJsonIfExists(snapshotValuePath, []));

    const snapshotByLeague = groupByLeague(snapshotFixtures);
    const valueByLeague = groupByLeague(valuePicks);
    const canonicalByLeague = readCanonicalFixturesForDate(root, day);

    const leagues = new Set([
      ...snapshotByLeague.keys(),
      ...canonicalByLeague.keys(),
      ...valueByLeague.keys()
    ]);

    for (const leagueSlug of [...leagues].sort()) {
      rows.push(buildRow(
        root,
        day,
        leagueSlug,
        snapshotByLeague.get(leagueSlug) || [],
        canonicalByLeague.get(leagueSlug) || [],
        valueByLeague.get(leagueSlug) || []
      ));
    }
  }

  const summary = {
    from,
    to,
    totalDays: days.length,
    totalLeagueRows: rows.length,
    rowsWithSnapshotFixtures: rows.filter((r) => r.snapshotFixtureCount > 0).length,
    rowsWithCanonicalFixtures: rows.filter((r) => r.canonicalFixtureCount > 0).length,
    rowsWithValuePicks: rows.filter((r) => r.valuePickCount > 0).length,
    rowsWithStandings: rows.filter((r) => r.standingsAvailable).length,
    rowsWithFixtureCoverageRisk: rows.filter((r) => r.fixtureCoverageRisk).length,
    rowsWithContextDataWarnings: rows.filter((r) => r.contextDataWarning).length,
    rowsWithFinalTruthRisk: rows.filter((r) => r.finalTruthRisk).length,
    rowsWithMotivationContextPossible: rows.filter((r) => r.motivationContextPossible).length
  };

  return {
    ok: true,
    stage: 'league_context_completeness_inventory_ready',
    generatedAt: new Date().toISOString(),
    root,
    from,
    to,
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
    summary,
    rows
  };
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiml-league-context-inventory-'));
  try {
    const day = '2026-05-18';
    fs.mkdirSync(path.join(tempRoot, 'data', 'deploy-snapshots', day), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'data', 'canonical-fixtures', day), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'data', 'standings'), { recursive: true });

    writeJson(path.join(tempRoot, 'data', 'deploy-snapshots', day, 'fixtures.json'), [
      { matchId: 'm1', leagueSlug: 'test.1', homeTeam: 'Alpha FC', awayTeam: 'Beta FC', status: 'FT', homeScore: 2, awayScore: 1 },
      { matchId: 'm2', leagueSlug: 'test.1', homeTeam: 'Gamma FC', awayTeam: 'Delta FC', status: 'LIVE', homeScore: 1, awayScore: 1 }
    ]);
    writeJson(path.join(tempRoot, 'data', 'deploy-snapshots', day, 'value.json'), [
      { matchId: 'm1', leagueSlug: 'test.1', market: '1X2' }
    ]);
    writeJson(path.join(tempRoot, 'data', 'canonical-fixtures', day, 'test.1.json'), [
      { matchId: 'm1', leagueSlug: 'test.1' },
      { matchId: 'm2', leagueSlug: 'test.1' },
      { matchId: 'm3', leagueSlug: 'test.1' }
    ]);
    writeJson(path.join(tempRoot, 'data', 'standings', 'test.1.json'), {
      league: 'test.1',
      confidence: 0.9,
      completeness: 1,
      table: [
        { position: 1, team: 'Alpha FC', played: 10, points: 24, goalDiff: 10 },
        { position: 2, team: 'Beta FC', played: 10, points: 21, goalDiff: 6 },
        { position: 3, team: 'Gamma FC', played: 10, points: 18, goalDiff: 3 },
        { position: 4, team: 'Delta FC', played: 10, points: 10, goalDiff: -8 }
      ]
    });

    const report = buildInventory(tempRoot, day, day);
    const row = report.rows[0];

    if (report.summary.totalLeagueRows !== 1) throw new Error('expected 1 league row');
    if (row.snapshotFixtureCount !== 2) throw new Error('expected 2 snapshot fixtures');
    if (row.canonicalFixtureCount !== 3) throw new Error('expected 3 canonical fixtures');
    if (row.valuePickCount !== 1) throw new Error('expected 1 value pick');
    if (!row.standingsAvailable) throw new Error('expected standings available');
    if (!row.motivationContextPossible) throw new Error('expected motivation context possible');
    if (!row.fixtureCoverageRisk) throw new Error('expected fixture coverage risk');
    if (row.contextDataWarning !== false) throw new Error('expected no context warning for complete self-test data');
    if (!row.finalTruthRisk) throw new Error('expected final truth risk');
    if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');

    console.log(JSON.stringify({
      ok: true,
      selfTest: 'build-league-context-completeness-inventory-range',
      totalLeagueRows: report.summary.totalLeagueRows,
      snapshotFixtureCount: row.snapshotFixtureCount,
      canonicalFixtureCount: row.canonicalFixtureCount,
      standingsAvailable: row.standingsAvailable,
      motivationContextPossible: row.motivationContextPossible,
      fixtureCoverageRisk: row.fixtureCoverageRisk,
      finalTruthRisk: row.finalTruthRisk,
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

  const from = args.from;
  const to = args.to || args.from;
  if (!from) throw new Error('Missing required --from YYYY-MM-DD');

  const root = path.resolve(args.root || '.');
  const report = buildInventory(root, from, to);
  const outputPath = args.output || path.join(root, 'data', 'league-context', '_diagnostics', 'league-context-completeness-' + from + '_to_' + to + '.json');

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
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
  buildInventory,
  buildRow,
  readStandings
};