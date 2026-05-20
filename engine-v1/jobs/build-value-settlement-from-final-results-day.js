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

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function resolveRepoPath(...parts) {
  return path.resolve(repoRoot, ...parts);
}

function normalizeValueRows(valueData) {
  if (Array.isArray(valueData)) return valueData;
  if (Array.isArray(valueData?.picks)) return valueData.picks;
  if (Array.isArray(valueData?.valuePicks)) return valueData.valuePicks;
  if (Array.isArray(valueData?.rows)) return valueData.rows;
  return [];
}

function loadValueData(dayKey, explicitValuePath = '') {
  const candidates = [];

  if (explicitValuePath) {
    candidates.push(path.resolve(explicitValuePath));
  }

  candidates.push(resolveRepoPath('data', 'value', `${dayKey}.json`));
  candidates.push(resolveRepoPath('data', 'deploy-snapshots', dayKey, 'value.json'));

  for (const candidate of candidates) {
    const data = readJsonSafe(candidate, null);
    const rows = normalizeValueRows(data);

    if (data && rows.length) {
      return {
        ok: true,
        path: candidate,
        source: candidate.includes('/deploy-snapshots/') || candidate.includes('\\deploy-snapshots\\')
          ? 'deploy_snapshot_value'
          : candidate.includes('/data/value/') || candidate.includes('\\data\\value\\')
            ? 'local_value'
            : 'explicit_value',
        data,
        rows
      };
    }
  }

  return {
    ok: false,
    path: null,
    source: null,
    data: null,
    rows: []
  };
}

function normalizeFinalResultFile(filePath) {
  const data = readJsonSafe(filePath, null);
  if (!data || data.verifiedFinalTruth !== true) return null;

  const matchId = clean(data.matchId);
  const date = clean(data.date);
  const homeScore = Number(data?.finalScore?.homeScore);
  const awayScore = Number(data?.finalScore?.awayScore);

  if (!matchId || !date) return null;
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) return null;

  return {
    matchId,
    date,
    leagueSlug: clean(data.leagueSlug),
    homeTeam: clean(data?.teams?.homeTeam || data.homeTeam),
    awayTeam: clean(data?.teams?.awayTeam || data.awayTeam),
    homeScore,
    awayScore,
    scoreKey: clean(data?.finalScore?.scoreKey || `${homeScore}-${awayScore}`),
    sourceCount: Number(data?.verification?.sourceCount || 0),
    independentSourceCount: Number(data?.verification?.independentSourceCount || 0),
    path: filePath
  };
}

function loadFinalResults(dayKey) {
  const dir = resolveRepoPath('data', 'final-results', dayKey);
  if (!fs.existsSync(dir)) {
    return {
      dir,
      rows: []
    };
  }

  const rows = fs.readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => normalizeFinalResultFile(path.join(dir, name)))
    .filter(Boolean)
    .sort((a, b) => a.matchId.localeCompare(b.matchId));

  return { dir, rows };
}

function pickMatchKeys(pick) {
  return [
    pick?.matchId,
    pick?.id,
    pick?.fixtureId,
    pick?.eventId
  ]
    .filter(Boolean)
    .map(value => clean(value))
    .filter(Boolean);
}

function normalizeMarket(value) {
  return clean(value).toUpperCase().replace(/\s+/g, ' ');
}

function normalizeSelection(pick) {
  return clean(
    pick?.pick ??
    pick?.selection ??
    pick?.prediction ??
    pick?.side ??
    pick?.recommendedPick ??
    ''
  ).toUpperCase();
}

function evaluatePickResult(pick, finalResult) {
  const home = Number(finalResult.homeScore);
  const away = Number(finalResult.awayScore);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;

  const market = normalizeMarket(pick?.market || pick?.marketName || pick?.type);
  const selection = normalizeSelection(pick);
  const total = home + away;

  if (market.includes('OVER') || market.includes('UNDER')) {
    const lineMatch = market.match(/([0-9]+(?:\.[0-9]+)?)/u) || selection.match(/([0-9]+(?:\.[0-9]+)?)/u);
    const line = lineMatch ? Number(lineMatch[1]) : null;

    if (!Number.isFinite(line)) return null;
    if (market.includes('OVER') || selection.includes('OVER')) return total > line;
    if (market.includes('UNDER') || selection.includes('UNDER')) return total < line;
  }

  if (market === 'BTTS' || market.includes('BOTH TEAMS')) {
    if (selection === 'YES' || selection === 'Y' || selection.includes('YES')) {
      return home > 0 && away > 0;
    }
    if (selection === 'NO' || selection === 'N' || selection.includes('NO')) {
      return !(home > 0 && away > 0);
    }
    return null;
  }

  if (market === '1X2' || market.includes('MATCH WINNER') || market.includes('FULL TIME RESULT')) {
    if (selection === 'HOME' || selection === '1') return home > away;
    if (selection === 'AWAY' || selection === '2') return away > home;
    if (selection === 'DRAW' || selection === 'X') return home === away;
    return null;
  }

  return null;
}

function buildSettlementReport(dayKey, options = {}) {
  const valueSource = loadValueData(dayKey, clean(options.valuePath));
  const finalSource = loadFinalResults(dayKey);
  const finalMap = new Map();

  for (const row of finalSource.rows) {
    finalMap.set(row.matchId, row);
  }

  const settledRows = [];
  const unresolvedRows = [];
  const settledPicks = [];

  for (const pick of valueSource.rows) {
    const keys = pickMatchKeys(pick);
    const finalResult = keys.map(key => finalMap.get(key)).find(Boolean);

    if (!finalResult) {
      unresolvedRows.push({
        reason: 'missing_verified_final_result',
        matchKeys: keys,
        market: pick?.market || pick?.marketName || '',
        pick: pick?.pick || pick?.selection || pick?.prediction || ''
      });
      settledPicks.push({ ...pick });
      continue;
    }

    const win = evaluatePickResult(pick, finalResult);

    if (win === null) {
      unresolvedRows.push({
        reason: 'unsupported_market_or_selection',
        matchId: finalResult.matchId,
        market: pick?.market || pick?.marketName || '',
        pick: pick?.pick || pick?.selection || pick?.prediction || ''
      });
      settledPicks.push({ ...pick });
      continue;
    }

    const result = win ? 'WIN' : 'LOSS';
    const settledPick = {
      ...pick,
      result,
      settlement: {
        source: 'verified_final_result_truth',
        finalResultPath: repoRelative(finalResult.path),
        scoreKey: finalResult.scoreKey,
        settledBy: 'build-value-settlement-from-final-results-day',
        dryRun: true
      }
    };

    settledPicks.push(settledPick);
    settledRows.push({
      matchId: finalResult.matchId,
      leagueSlug: finalResult.leagueSlug,
      homeTeam: finalResult.homeTeam,
      awayTeam: finalResult.awayTeam,
      scoreKey: finalResult.scoreKey,
      market: pick?.market || pick?.marketName || '',
      pick: pick?.pick || pick?.selection || pick?.prediction || '',
      result,
      finalResultPath: repoRelative(finalResult.path)
    });
  }

  const draftValueData = valueSource.data && typeof valueSource.data === 'object' && !Array.isArray(valueSource.data)
    ? {
        ...valueSource.data,
        picks: settledPicks,
        settlementDraft: {
          dayKey,
          source: 'verified_final_result_truth',
          settledRows: settledRows.length,
          unresolvedRows: unresolvedRows.length,
          generatedAt: new Date().toISOString(),
          dryRun: true
        }
      }
    : {
        dayKey,
        picks: settledPicks,
        settlementDraft: {
          dayKey,
          source: 'verified_final_result_truth',
          settledRows: settledRows.length,
          unresolvedRows: unresolvedRows.length,
          generatedAt: new Date().toISOString(),
          dryRun: true
        }
      };

  return {
    ok: valueSource.ok,
    stage: 'value_settlement_from_verified_final_results_dry_run',
    dayKey,
    generatedAt: new Date().toISOString(),
    inputs: {
      valuePath: valueSource.path ? repoRelative(valueSource.path) : null,
      valueSource: valueSource.source,
      finalResultsDir: repoRelative(finalSource.dir)
    },
    summary: {
      valuePicks: valueSource.rows.length,
      verifiedFinalResults: finalSource.rows.length,
      settledRows: settledRows.length,
      unresolvedRows: unresolvedRows.length,
      winRows: settledRows.filter(row => row.result === 'WIN').length,
      lossRows: settledRows.filter(row => row.result === 'LOSS').length
    },
    settledRows,
    unresolvedRows,
    draftValueData,
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      requiresVerifiedFinalTruth: true,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    }
  };
}

function runSelfTest() {
  const report = buildSettlementReport('2099-01-01', {
    valuePath: resolveRepoPath('data', 'does-not-exist', 'value.json')
  });

  if (report.ok !== false) throw new Error('expected self-test missing value to be ok false');
  if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites must be zero');
  if (report.guarantees.productionWrite !== false) throw new Error('productionWrite must be false');
  if (report.guarantees.dryRun !== true) throw new Error('dryRun must be true');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'build-value-settlement-from-final-results-day',
    stage: report.stage,
    canonicalWrites: report.guarantees.canonicalWrites,
    productionWrite: report.guarantees.productionWrite,
    dryRun: report.guarantees.dryRun
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  const dayKey = clean(args.date || args.day || args.dayKey);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    console.error('Usage: node engine-v1/jobs/build-value-settlement-from-final-results-day.js --date YYYY-MM-DD --output <report.json> [--value <value.json>]');
    process.exit(2);
  }

  const outputPath = args.output
    ? path.resolve(String(args.output))
    : resolveRepoPath('data', 'value', '_settlement-reports', `${dayKey}.verified-final-results.dry-run.json`);

  const report = buildSettlementReport(dayKey, {
    valuePath: args.value ? String(args.value) : ''
  });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    dayKey,
    output: repoRelative(outputPath),
    summary: report.summary,
    canonicalWrites: report.guarantees.canonicalWrites,
    productionWrite: report.guarantees.productionWrite,
    dryRun: report.guarantees.dryRun
  }, null, 2));

  if (!report.ok) process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}

export {
  buildSettlementReport,
  evaluatePickResult,
  loadFinalResults,
  loadValueData
};