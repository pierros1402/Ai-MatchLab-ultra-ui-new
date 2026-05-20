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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function repoRelative(filePath) {
  return path.relative(repoRoot, path.resolve(filePath)).replaceAll(path.sep, '/');
}

function defaultFixturesPath(dayKey) {
  return path.resolve(repoRoot, 'data', 'deploy-snapshots', dayKey, 'fixtures.json');
}

function defaultFinalResultsDir(dayKey) {
  return path.resolve(repoRoot, 'data', 'final-results', dayKey);
}

function defaultOutputPath(dayKey) {
  return path.resolve(
    repoRoot,
    'data',
    'football-truth',
    '_diagnostics',
    'officiating-candidates',
    `${dayKey}.officiating-candidates.json`
  );
}

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function pickMatchId(row) {
  return clean(
    row?.matchId ||
    row?.id ||
    row?.fixtureId ||
    row?.eventId ||
    row?.gameId ||
    row?.espnEventId
  );
}

function pickLeagueSlug(row) {
  return clean(
    row?.leagueSlug ||
    row?.league?.slug ||
    row?.league?.id ||
    row?.competition?.slug ||
    row?.competition?.id
  );
}

function pickTeam(row, side) {
  const direct = side === 'home'
    ? row?.homeTeam || row?.home?.name || row?.teams?.homeTeam || row?.teams?.home?.name
    : row?.awayTeam || row?.away?.name || row?.teams?.awayTeam || row?.teams?.away?.name;

  return clean(direct);
}

function readVerifiedFinalResultsByMatch(finalResultsDir) {
  const byMatch = new Map();

  if (!fs.existsSync(finalResultsDir)) return byMatch;

  for (const entry of fs.readdirSync(finalResultsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

    const fullPath = path.join(finalResultsDir, entry.name);
    try {
      const record = readJson(fullPath);
      const matchId = clean(record?.matchId || path.basename(entry.name, '.json'));
      if (!matchId) continue;

      byMatch.set(matchId, {
        path: repoRelative(fullPath),
        ok: record?.ok === true,
        verifiedFinalTruth: record?.verifiedFinalTruth === true,
        scoreKey: clean(record?.finalScore?.scoreKey || record?.scoreKey),
        status: clean(record?.status || record?.finalScore?.status || 'FT'),
        sourceCount: Number(record?.verification?.sourceCount || 0),
        independentSourceCount: Number(record?.verification?.independentSourceCount || 0)
      });
    } catch {
      // Ignore unreadable final-result files in this candidate template builder.
    }
  }

  return byMatch;
}

function buildCandidateRow(row, options) {
  const matchId = pickMatchId(row);
  const finalResult = options.finalResultsByMatch.get(matchId) || null;

  return {
    matchId,
    date: options.dayKey,
    leagueSlug: pickLeagueSlug(row),
    homeTeam: pickTeam(row, 'home'),
    awayTeam: pickTeam(row, 'away'),
    finalResultTruthContext: {
      verifiedFinalTruth: finalResult?.verifiedFinalTruth === true,
      finalResultPath: finalResult?.path || '',
      scoreKey: finalResult?.scoreKey || '',
      status: finalResult?.status || '',
      sourceCount: finalResult?.sourceCount || 0,
      independentSourceCount: finalResult?.independentSourceCount || 0
    },
    refereeCandidate: {
      name: null,
      role: 'referee',
      sourceUrls: [],
      sourceTypes: [],
      confidence: 'none',
      candidateState: 'missing',
      reviewed: false,
      productionReady: false,
      notes: []
    },
    disciplineCandidate: {
      yellowCardsHome: null,
      yellowCardsAway: null,
      redCardsHome: null,
      redCardsAway: null,
      penaltiesAwarded: null,
      penaltiesScored: null,
      penaltiesMissed: null,
      sourceUrls: [],
      sourceTypes: [],
      confidence: 'none',
      candidateState: 'missing',
      reviewed: false,
      productionReady: false,
      notes: []
    },
    sourcePolicy: {
      finalResultSourceMayDifferFromOfficiatingSource: true,
      refereeMissingDoesNotBlockFinalTruth: true,
      disciplineMissingDoesNotBlockFinalTruth: true,
      productionOfficiatingWriteBlocked: true,
      requiresReviewBeforeProduction: true
    }
  };
}

function buildOfficiatingCandidateTemplateDay(dayKey, options = {}) {
  if (!isDayKey(dayKey)) throw new Error(`Invalid dayKey: ${dayKey}`);

  const fixturesPath = path.resolve(options.fixturesPath || defaultFixturesPath(dayKey));
  const finalResultsDir = path.resolve(options.finalResultsDir || defaultFinalResultsDir(dayKey));

  if (!fs.existsSync(fixturesPath)) {
    throw new Error(`Missing fixtures file: ${repoRelative(fixturesPath)}`);
  }

  const fixturesPayload = readJson(fixturesPath);
  const fixtureRows = normalizeRows(fixturesPayload);
  const finalResultsByMatch = readVerifiedFinalResultsByMatch(finalResultsDir);

  const rows = fixtureRows
    .map(row => buildCandidateRow(row, { dayKey, finalResultsByMatch }))
    .filter(row => row.matchId);

  const verifiedFinalTruthRows = rows.filter(row => row.finalResultTruthContext.verifiedFinalTruth).length;

  return {
    ok: true,
    stage: 'officiating_candidate_template_day_ready',
    schema: 'ai-matchlab.officiating-candidates-day.v1',
    dayKey,
    generatedAt: new Date().toISOString(),
    inputs: {
      fixturesPath: repoRelative(fixturesPath),
      finalResultsDir: repoRelative(finalResultsDir),
      fixtureRows: fixtureRows.length
    },
    summary: {
      candidateRows: rows.length,
      verifiedFinalTruthRows,
      refereeCandidateRows: 0,
      disciplineCandidateRows: 0,
      productionReadyRows: 0,
      reviewNeededRows: 0
    },
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
      sourceFetch: false
    },
    rows
  };
}

function runSelfTest() {
  const finalResultsByMatch = new Map([
    ['m1', {
      path: 'data/final-results/2099-01-01/m1.json',
      ok: true,
      verifiedFinalTruth: true,
      scoreKey: '2-1',
      status: 'FT',
      sourceCount: 2,
      independentSourceCount: 2
    }]
  ]);

  const rows = [
    buildCandidateRow({
      matchId: 'm1',
      leagueSlug: 'test.1',
      homeTeam: 'Alpha FC',
      awayTeam: 'Beta FC'
    }, { dayKey: '2099-01-01', finalResultsByMatch })
  ];

  if (rows.length !== 1) throw new Error('expected one self-test row');
  if (rows[0].finalResultTruthContext.verifiedFinalTruth !== true) {
    throw new Error('expected verified final truth context');
  }
  if (rows[0].refereeCandidate.productionReady !== false) {
    throw new Error('referee candidate must not be production ready by default');
  }
  if (rows[0].sourcePolicy.finalResultSourceMayDifferFromOfficiatingSource !== true) {
    throw new Error('source policy must allow independent officiating source');
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'build-officiating-candidate-template-day',
    rows: rows.length,
    verifiedFinalTruthRows: 1,
    officiatingWrites: false,
    sourceFetch: false,
    productionWrite: false
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
    console.error('Usage: node engine-v1/jobs/build-officiating-candidate-template-day.js --date YYYY-MM-DD [--fixtures <file>] [--final-results-dir <dir>] [--output <file>]');
    process.exit(2);
  }

  const outputPath = path.resolve(args.output ? String(args.output) : defaultOutputPath(dayKey));

  try {
    const report = buildOfficiatingCandidateTemplateDay(dayKey, {
      fixturesPath: args.fixtures,
      finalResultsDir: args['final-results-dir']
    });

    writeJson(outputPath, report);

    console.log(JSON.stringify({
      ok: report.ok,
      stage: report.stage,
      output: repoRelative(outputPath),
      dayKey,
      summary: report.summary,
      canonicalWrites: report.guarantees.canonicalWrites,
      productionWrite: report.guarantees.productionWrite,
      officiatingWrites: report.guarantees.officiatingWrites,
      sourceFetch: report.guarantees.sourceFetch
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      stage: 'officiating_candidate_template_day_failed',
      dayKey,
      error: error?.message || String(error),
      canonicalWrites: 0,
      productionWrite: false,
      officiatingWrites: false,
      sourceFetch: false
    }, null, 2));
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}

export {
  buildOfficiatingCandidateTemplateDay,
  buildCandidateRow
};