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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value || '').trim();
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function standingsTable(payload) {
  if (Array.isArray(payload)) return payload;
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

function normalizeRow(row, index) {
  return {
    team: clean(row.team || row.teamName || row.name || row.club),
    position: numberOrNull(row.position ?? row.rank ?? row.pos) ?? index + 1,
    played: numberOrNull(row.played ?? row.gamesPlayed ?? row.matchesPlayed ?? row.pld),
    points: numberOrNull(row.points ?? row.pts),
    goalDiff: numberOrNull(row.goalDiff ?? row.goalDifference ?? row.gd),
    wins: numberOrNull(row.wins ?? row.w),
    draws: numberOrNull(row.draws ?? row.d),
    losses: numberOrNull(row.losses ?? row.l),
    raw: row
  };
}

function seasonPhaseFromPlayed(maxPlayed) {
  if (!Number.isFinite(maxPlayed) || maxPlayed <= 0) return 'unknown';
  if (maxPlayed <= 8) return 'early';
  if (maxPlayed <= 20) return 'middle';
  if (maxPlayed <= 30) return 'late';
  return 'run_in';
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function proximityScore(pointsGap, window) {
  if (!Number.isFinite(pointsGap)) return 0;
  if (pointsGap < 0) return 0;
  if (pointsGap > window) return 0;
  return clamp01(1 - (pointsGap / window));
}

function toBool(value) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return null;
}

function inferLeagueProfile(payload, options = {}) {
  const league = clean(options.league || payload.league || payload.leagueSlug || '').toLowerCase();

  const noRelegationOverride = toBool(options.noRelegation);
  const continentalOverride = toBool(options.enableContinentalPressure);
  const playoffOverride = toBool(options.enablePlayoffPressure);

  const noRelegationLeague = /^usa\./.test(league);
  const continentalOrCupCompetition =
    /^(uefa|conmebol|concacaf|afc|caf)\./.test(league) ||
    /\.(cup|copa|trophy|supercup)$/.test(league) ||
    /(champions|libertadores|sudamericana|europa|conference|cup|copa)/.test(league);

  return {
    league,
    profileType: continentalOrCupCompetition ? 'continental_or_cup_competition' : 'domestic_league',
    hasRelegationPressure: noRelegationOverride !== null
      ? !noRelegationOverride
      : (!noRelegationLeague && !continentalOrCupCompetition),
    hasContinentalPressure: continentalOverride !== null
      ? continentalOverride
      : (!/^usa\./.test(league) && !continentalOrCupCompetition),
    hasPlayoffPressure: playoffOverride === true
  };
}

function buildThresholds(teamCount, options = {}) {
  const n = Math.max(1, Number(teamCount || 1));

  return {
    titleRacePlaces: Number(options.titleRacePlaces || Math.min(4, n)),
    titleRacePointsWindow: Number(options.titleRacePointsWindow || 6),
    continentalPlaces: Number(options.continentalPlaces || Math.min(6, Math.max(1, Math.ceil(n * 0.33)))),
    continentalPointsWindow: Number(options.continentalPointsWindow || 4),
    playoffPlaces: Number(options.playoffPlaces || 0),
    playoffPointsWindow: Number(options.playoffPointsWindow || 4),
    relegationPlaces: Number(options.relegationPlaces || Math.min(3, Math.max(1, Math.floor(n * 0.18)))),
    relegationPointsWindow: Number(options.relegationPointsWindow || 6)
  };
}

function buildMotivationForRow(row, table, thresholds, seasonPhase, leagueProfile = {}) {
  const sorted = [...table].sort((a, b) => a.position - b.position);
  const teamCount = sorted.length;
  const top = sorted[0];
  const continentalCut = leagueProfile.hasContinentalPressure
    ? sorted[Math.min(thresholds.continentalPlaces, teamCount) - 1]
    : null;
  const playoffCut = leagueProfile.hasPlayoffPressure && thresholds.playoffPlaces > 0
    ? sorted[Math.min(thresholds.playoffPlaces, teamCount) - 1]
    : null;
  const relegationStartIndex = leagueProfile.hasRelegationPressure
    ? Math.max(0, teamCount - thresholds.relegationPlaces)
    : teamCount;
  const relegationCut = leagueProfile.hasRelegationPressure ? sorted[relegationStartIndex] : null;

  const points = Number(row.points);
  const tags = [];
  const notes = [];

  const titleGap = Number.isFinite(points) && top ? Number(top.points) - points : null;
  const continentalGap = Number.isFinite(points) && continentalCut ? Number(continentalCut.points) - points : null;
  const playoffGap = Number.isFinite(points) && playoffCut ? Number(playoffCut.points) - points : null;
  const relegationGap = Number.isFinite(points) && relegationCut ? points - Number(relegationCut.points) : null;

  let titlePressure = 0;
  let continentalPressure = 0;
  let promotionOrPlayoffPressure = 0;
  let relegationPressure = 0;

  if (row.position === 1) {
    tags.push('leader');
    titlePressure = 1;
  } else if (row.position <= thresholds.titleRacePlaces && titleGap !== null && titleGap <= thresholds.titleRacePointsWindow) {
    tags.push('title_race');
    titlePressure = proximityScore(titleGap, thresholds.titleRacePointsWindow);
  }

  if (leagueProfile.hasContinentalPressure && row.position <= thresholds.continentalPlaces) {
    tags.push('continental_position');
    continentalPressure = Math.max(continentalPressure, 0.75);
  } else if (leagueProfile.hasContinentalPressure && continentalGap !== null && continentalGap <= thresholds.continentalPointsWindow) {
    tags.push('continental_chase');
    continentalPressure = proximityScore(continentalGap, thresholds.continentalPointsWindow);
  }

  if (leagueProfile.hasPlayoffPressure && thresholds.playoffPlaces > 0 && row.position <= thresholds.playoffPlaces) {
    tags.push('playoff_or_promotion_zone');
    promotionOrPlayoffPressure = Math.max(promotionOrPlayoffPressure, 0.65);
  } else if (leagueProfile.hasPlayoffPressure && playoffGap !== null && playoffGap <= thresholds.playoffPointsWindow) {
    tags.push('playoff_or_promotion_chase');
    promotionOrPlayoffPressure = proximityScore(playoffGap, thresholds.playoffPointsWindow);
  }

  if (leagueProfile.hasRelegationPressure && row.position >= relegationStartIndex + 1) {
    tags.push('relegation_zone');
    relegationPressure = 1;
  } else if (leagueProfile.hasRelegationPressure && relegationGap !== null && relegationGap <= thresholds.relegationPointsWindow) {
    tags.push('relegation_pressure');
    relegationPressure = proximityScore(relegationGap, thresholds.relegationPointsWindow);
  }

  if (tags.length === 0) {
    tags.push('midtable');
  }

  const highPressureTags = tags.filter((tag) => tag !== 'midtable');
  const midtableRisk = tags.includes('midtable') ? 1 : 0;

  if (seasonPhase === 'late' || seasonPhase === 'run_in') {
    notes.push('late_season_context');
  }

  const motivationScore = clamp01(
    Math.max(titlePressure, continentalPressure, promotionOrPlayoffPressure, relegationPressure) *
    (seasonPhase === 'early' ? 0.75 : seasonPhase === 'middle' ? 0.9 : 1)
  );

  return {
    team: row.team,
    position: row.position,
    played: row.played,
    points: row.points,
    goalDiff: row.goalDiff,
    seasonPhase,
    motivationTags: tags,
    primaryMotivation: highPressureTags[0] || 'midtable',
    motivationScore,
    titlePressure,
    continentalPressure,
    promotionOrPlayoffPressure,
    relegationPressure,
    midtableRisk,
    gaps: {
      titleGap,
      continentalGap,
      playoffGap,
      relegationSafetyGap: relegationGap
    },
    notes
  };
}

function buildMotivationContext(payload, inputPath, options = {}) {
  const rawTable = standingsTable(payload);
  const table = rawTable
    .map(normalizeRow)
    .filter((row) => row.team && Number.isFinite(row.position) && Number.isFinite(row.points))
    .sort((a, b) => a.position - b.position);

  const maxPlayed = Math.max(...table.map((row) => Number(row.played || 0)), 0);
  const seasonPhase = clean(options.seasonPhase) || seasonPhaseFromPlayed(maxPlayed);
  const thresholds = buildThresholds(table.length, options);
  const leagueProfile = inferLeagueProfile(payload, options);

  const rows = table.map((row) => buildMotivationForRow(row, table, thresholds, seasonPhase, leagueProfile));

  const byPrimaryMotivation = {};
  for (const row of rows) {
    byPrimaryMotivation[row.primaryMotivation] = (byPrimaryMotivation[row.primaryMotivation] || 0) + 1;
  }

  return {
    ok: true,
    stage: 'team_motivation_context_from_standings_ready',
    generatedAt: new Date().toISOString(),
    inputPath,
    league: clean(payload.league || payload.leagueSlug || options.league || ''),
    standingsConfidence: payload.confidence ?? null,
    standingsCompleteness: payload.completeness ?? null,
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
    thresholds,
    leagueProfile,
    summary: {
      teamCount: rows.length,
      maxPlayed,
      seasonPhase,
      motivatedTeams: rows.filter((row) => row.primaryMotivation !== 'midtable').length,
      midtableTeams: rows.filter((row) => row.primaryMotivation === 'midtable').length,
      highMotivationTeams: rows.filter((row) => row.motivationScore >= 0.7).length,
      byPrimaryMotivation
    },
    rows
  };
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiml-team-motivation-'));
  try {
    const inputPath = path.join(tempRoot, 'standings.json');
    const outputPath = path.join(tempRoot, 'motivation.json');

    writeJson(inputPath, {
      league: 'test.1',
      confidence: 0.9,
      completeness: 1,
      table: [
        { position: 1, team: 'Alpha FC', played: 32, points: 70, goalDiff: 31 },
        { position: 2, team: 'Beta FC', played: 32, points: 67, goalDiff: 25 },
        { position: 3, team: 'Gamma FC', played: 32, points: 61, goalDiff: 17 },
        { position: 4, team: 'Delta FC', played: 32, points: 56, goalDiff: 12 },
        { position: 5, team: 'Epsilon FC', played: 32, points: 52, goalDiff: 8 },
        { position: 6, team: 'Zeta FC', played: 32, points: 49, goalDiff: 3 },
        { position: 7, team: 'Eta FC', played: 32, points: 45, goalDiff: 1 },
        { position: 8, team: 'Theta FC', played: 32, points: 44, goalDiff: -1 },
        { position: 9, team: 'Iota FC', played: 32, points: 37, goalDiff: -7 },
        { position: 10, team: 'Kappa FC', played: 32, points: 35, goalDiff: -9 },
        { position: 11, team: 'Lambda FC', played: 32, points: 31, goalDiff: -14 },
        { position: 12, team: 'Mu FC', played: 32, points: 29, goalDiff: -18 }
      ]
    });

    const report = buildMotivationContext(readJson(inputPath), inputPath, {});
    writeJson(outputPath, report);

    const alpha = report.rows.find((row) => row.team === 'Alpha FC');
    const beta = report.rows.find((row) => row.team === 'Beta FC');
    const mu = report.rows.find((row) => row.team === 'Mu FC');

    if (report.summary.teamCount !== 12) throw new Error('expected 12 teams');
    if (report.summary.seasonPhase !== 'run_in') throw new Error('expected run_in season phase');
    if (!alpha.motivationTags.includes('leader')) throw new Error('expected leader tag');
    if (!beta.motivationTags.includes('title_race')) throw new Error('expected title race tag');
    if (!mu.motivationTags.includes('relegation_zone')) throw new Error('expected relegation zone tag');
    if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');

    console.log(JSON.stringify({
      ok: true,
      selfTest: 'build-team-motivation-context-from-standings-file',
      teamCount: report.summary.teamCount,
      seasonPhase: report.summary.seasonPhase,
      motivatedTeams: report.summary.motivatedTeams,
      highMotivationTeams: report.summary.highMotivationTeams,
      alphaPrimary: alpha.primaryMotivation,
      betaPrimary: beta.primaryMotivation,
      muPrimary: mu.primaryMotivation,
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

  if (!args.input) throw new Error('Missing required --input <standings.json>');

  const inputPath = args.input;
  const payload = readJson(inputPath);
  const report = buildMotivationContext(payload, inputPath, {
    league: args.league || '',
    seasonPhase: args['season-phase'] || args.seasonPhase || '',
    titleRacePlaces: args['title-race-places'],
    titleRacePointsWindow: args['title-race-points-window'],
    continentalPlaces: args['continental-places'],
    continentalPointsWindow: args['continental-points-window'],
    playoffPlaces: args['playoff-places'],
    playoffPointsWindow: args['playoff-points-window'],
    relegationPlaces: args['relegation-places'],
    relegationPointsWindow: args['relegation-points-window'],
    noRelegation: args['no-relegation'],
    enableContinentalPressure: args['enable-continental-pressure'],
    enablePlayoffPressure: args['enable-playoff-pressure']
  });

  const defaultOutput = path.join(
    path.dirname(inputPath),
    '_motivation',
    path.basename(inputPath).replace(/\.json$/i, '') + '.motivation.json'
  );
  const outputPath = args.output || defaultOutput;

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    input: inputPath,
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
  buildMotivationContext,
  buildMotivationForRow,
  buildThresholds,
  inferLeagueProfile
};