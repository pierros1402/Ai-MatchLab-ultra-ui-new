#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const args = {
    input: '',
    output: '',
    value: '',
    selfTest: false,
    pretty: true
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--self-test') {
      args.selfTest = true;
      continue;
    }

    if (arg === '--compact') {
      args.pretty = false;
      continue;
    }

    if (arg === '--pretty') {
      args.pretty = true;
      continue;
    }

    const readNext = (name) => {
      i += 1;
      if (i >= argv.length) throw new Error(`missing value for ${name}`);
      return String(argv[i] || '').trim();
    };

    if (arg === '--input') args.input = readNext('--input');
    else if (arg.startsWith('--input=')) args.input = arg.slice('--input='.length).trim();
    else if (arg === '--output') args.output = readNext('--output');
    else if (arg.startsWith('--output=')) args.output = arg.slice('--output='.length).trim();
    else if (arg === '--value') args.value = readNext('--value');
    else if (arg.startsWith('--value=')) args.value = arg.slice('--value='.length).trim();
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    'Usage:',
    '  node engine-v1/jobs/build-final-result-truth-promotion-plan-file.js --input <reviewed-decisions.json> [--value <value.json>] [--output <promotion-plan.json>]',
    '',
    'Input should be a reviewed decision template or compatible reviewed-decision rows.',
    '',
    'This job is dry-run only:',
    '  - canonicalWrites: 0',
    '  - productionWrite: false',
    '  - dryRun: true',
    '  - no fixture/history/value/details writes'
  ].join('\n');
}

function resolvePath(filePath) {
  if (!filePath) return '';
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath) {
  const abs = resolvePath(filePath);
  return JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, payload, pretty) {
  const abs = resolvePath(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(payload, null, pretty ? 2 : 0) + '\n', 'utf8');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  return String(value ?? '').trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = cleanString(value);
    if (text !== '') return text;
  }
  return '';
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseScoreKey(scoreKey) {
  const match = cleanString(scoreKey).match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!match) return { homeScore: null, awayScore: null };
  return { homeScore: Number(match[1]), awayScore: Number(match[2]) };
}

function extractRows(input) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];

  return asArray(
    input.rows ||
    input.decisions ||
    input.reviewDecisionRows ||
    input.queueRows ||
    input.readOnlyActionableRows ||
    input?.template?.rows ||
    input?.validation?.rows
  );
}

function extractTeams(row) {
  return {
    homeTeam: firstNonEmpty(row.homeTeam, row.home, row.homeName, row.home_team, row?.teams?.homeTeam, row?.teams?.home, row?.match?.homeTeam, row?.match?.home),
    awayTeam: firstNonEmpty(row.awayTeam, row.away, row.awayName, row.away_team, row?.teams?.awayTeam, row?.teams?.away, row?.match?.awayTeam, row?.match?.away)
  };
}

function normalizeSource(source) {
  if (typeof source === 'string') {
    return { sourceName: '', url: source };
  }

  return {
    sourceName: firstNonEmpty(source?.sourceName, source?.name, source?.provider, source?.domain, source?.sourceKey),
    url: firstNonEmpty(source?.url, source?.sourceUrl, source?.finalUrl, source?.resolvedUrl),
    evidenceType: firstNonEmpty(source?.evidenceType, source?.type, source?.sourceType)
  };
}

function normalizeScoreGroup(group, index) {
  const scoreKey = firstNonEmpty(group?.scoreKey, group?.key, group?.finalScoreKey);
  const parsed = parseScoreKey(scoreKey);
  const homeScore = numericOrNull(firstNonEmpty(group?.homeScore, group?.home, group?.homeGoals, group?.scoreHome, group?.score?.home, group?.finalScore?.home, parsed.homeScore));
  const awayScore = numericOrNull(firstNonEmpty(group?.awayScore, group?.away, group?.awayGoals, group?.scoreAway, group?.score?.away, group?.finalScore?.away, parsed.awayScore));
  const safeScoreKey = scoreKey || (homeScore !== null && awayScore !== null ? `${homeScore}-${awayScore}` : `score_group_${index + 1}`);
  const sources = asArray(group?.sources).map(normalizeSource).filter((source) => source.sourceName || source.url);

  return {
    scoreKey: safeScoreKey,
    homeScore,
    awayScore,
    sourceCount: Number(firstNonEmpty(group?.sourceCount, group?.sourcesCount, sources.length, 0)) || 0,
    independentSourceCount: Number(firstNonEmpty(group?.independentSourceCount, group?.independentSources, 0)) || 0,
    sources,
    rows: asArray(group?.rows)
  };
}

function extractScoreGroups(row) {
  const raw = asArray(
    row.scoreGroups ||
    row.finalScoreGroups ||
    row?.consensus?.scoreGroups ||
    row?.summary?.scoreGroups ||
    row?.evidenceSummary?.scoreGroups
  );

  if (raw.length > 0) return raw.map(normalizeScoreGroup);

  const directHome = firstNonEmpty(row.homeScore, row.scoreHome, row?.score?.home, row?.finalScore?.home, row?.verifiedFinalResult?.homeScore);
  const directAway = firstNonEmpty(row.awayScore, row.scoreAway, row?.score?.away, row?.finalScore?.away, row?.verifiedFinalResult?.awayScore);

  if (directHome !== '' && directAway !== '') {
    return [normalizeScoreGroup({
      homeScore: directHome,
      awayScore: directAway,
      sourceCount: firstNonEmpty(row.sourceCount, row.sourcesCount, asArray(row.sources).length, 0),
      independentSourceCount: firstNonEmpty(row.independentSourceCount, row.independentSources, 0),
      sources: asArray(row.sources)
    }, 0)];
  }

  return [];
}

function selectApprovedGroup(row, scoreGroups) {
  const reviewerDecision = cleanString(row.reviewerDecision || row?.manualReview?.reviewerDecision);
  const selectedScoreKey = cleanString(row.selectedScoreKey);

  if (reviewerDecision === 'accept_score_group_read_only') {
    return scoreGroups.find((group) => group.scoreKey === selectedScoreKey) || null;
  }

  if (reviewerDecision === 'approve_verified_read_only') {
    if (selectedScoreKey) {
      return scoreGroups.find((group) => group.scoreKey === selectedScoreKey) || null;
    }

    if (scoreGroups.length === 1) return scoreGroups[0];

    const verified = scoreGroups.find((group) => (
      group.independentSourceCount >= 2 ||
      group.sourceCount >= 2 ||
      asArray(group.rows).some((evidence) => /verified|final/i.test(cleanString(evidence?.verdict || evidence?.status)))
    ));
    return verified || null;
  }

  return null;
}

function extractValuePicks(valueInput) {
  if (!valueInput) return [];
  if (Array.isArray(valueInput)) return valueInput;

  return asArray(
    valueInput.valuePicks ||
    valueInput.picks ||
    valueInput.rows ||
    valueInput.matches ||
    valueInput.value ||
    valueInput?.data?.valuePicks ||
    valueInput?.data?.picks
  );
}

function pickMatchId(pick) {
  return firstNonEmpty(pick.matchId, pick.fixtureId, pick.eventId, pick.id, pick?.match?.id);
}

function normalizeMarket(pick) {
  return firstNonEmpty(pick.market, pick.marketKey, pick.type, pick.pickType, pick.selectionMarket).toUpperCase();
}

function normalizeSelection(pick) {
  return firstNonEmpty(pick.selection, pick.pick, pick.outcome, pick.side, pick.valuePick, pick.recommendation).toUpperCase();
}

function settlePick(pick, homeScore, awayScore) {
  const market = normalizeMarket(pick);
  const selection = normalizeSelection(pick);
  const total = homeScore + awayScore;
  const homeWin = homeScore > awayScore;
  const awayWin = awayScore > homeScore;
  const draw = homeScore === awayScore;

  if (/1X2|MATCH_RESULT|RESULT/.test(market)) {
    if ((selection === 'HOME' || selection === '1') && homeWin) return 'WIN';
    if ((selection === 'AWAY' || selection === '2') && awayWin) return 'WIN';
    if ((selection === 'DRAW' || selection === 'X') && draw) return 'WIN';
    if (selection === '1X' && (homeWin || draw)) return 'WIN';
    if (selection === 'X2' && (awayWin || draw)) return 'WIN';
    if (selection === '12' && !draw) return 'WIN';
    return 'LOSS';
  }

  const overUnderMatch = `${market} ${selection}`.match(/\b(OVER|UNDER|O|U)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (overUnderMatch) {
    const direction = overUnderMatch[1].toUpperCase();
    const line = Number(overUnderMatch[2]);
    if (direction === 'OVER' || direction === 'O') return total > line ? 'WIN' : 'LOSS';
    return total < line ? 'WIN' : 'LOSS';
  }

  if (/BTTS|BOTH_TEAMS_TO_SCORE/.test(market)) {
    const yes = homeScore > 0 && awayScore > 0;
    if (selection === 'YES' || selection === 'BTTS_YES') return yes ? 'WIN' : 'LOSS';
    if (selection === 'NO' || selection === 'BTTS_NO') return yes ? 'LOSS' : 'WIN';
  }

  return 'UNKNOWN';
}

function affectedValuePicksFor(matchId, approvedScore, valuePicks) {
  if (!matchId || approvedScore.homeScore === null || approvedScore.awayScore === null) return [];
  return valuePicks
    .filter((pick) => pickMatchId(pick) === matchId)
    .map((pick) => ({
      matchId,
      market: firstNonEmpty(pick.market, pick.marketKey, pick.type, pick.pickType),
      selection: firstNonEmpty(pick.selection, pick.pick, pick.outcome, pick.side, pick.valuePick, pick.recommendation),
      currentSettlement: firstNonEmpty(pick.result, pick.settlement, pick.status, pick.outcomeStatus),
      proposedSettlement: settlePick(pick, approvedScore.homeScore, approvedScore.awayScore),
      scoreUsed: `${approvedScore.homeScore}-${approvedScore.awayScore}`
    }));
}

function buildPlanRow(row, index, valuePicks) {
  const reviewed = row.reviewed === true;
  const reviewerDecision = cleanString(row.reviewerDecision || row?.manualReview?.reviewerDecision);
  const scoreGroups = extractScoreGroups(row);
  const selectedGroup = selectApprovedGroup(row, scoreGroups);
  const teams = extractTeams(row);
  const matchId = firstNonEmpty(row.matchId, row.fixtureId, row.eventId, row?.match?.id);
  const date = firstNonEmpty(row.date, row.day, row.matchDate, row?.match?.date);
  const leagueSlug = firstNonEmpty(row.leagueSlug, row.league, row.competitionSlug, row?.match?.leagueSlug);

  const blockedReasons = [];
  if (!reviewed) blockedReasons.push('not_reviewed');
  if (!['approve_verified_read_only', 'accept_score_group_read_only'].includes(reviewerDecision)) blockedReasons.push('reviewer_decision_not_promotable');
  if (!matchId) blockedReasons.push('missing_matchId');
  if (!selectedGroup) blockedReasons.push('missing_approved_score_group');
  if (selectedGroup && (selectedGroup.homeScore === null || selectedGroup.awayScore === null)) blockedReasons.push('approved_score_group_missing_score');

  const sourceUrls = selectedGroup ? selectedGroup.sources.map((source) => source.url).filter(Boolean) : [];
  const approvedFinalScore = selectedGroup && selectedGroup.homeScore !== null && selectedGroup.awayScore !== null
    ? {
      homeScore: selectedGroup.homeScore,
      awayScore: selectedGroup.awayScore,
      scoreKey: `${selectedGroup.homeScore}-${selectedGroup.awayScore}`
    }
    : null;

  const affectedValuePicks = approvedFinalScore ? affectedValuePicksFor(matchId, approvedFinalScore, valuePicks) : [];

  return {
    planRowIndex: index,
    queueId: firstNonEmpty(row.queueId, row.reviewQueueId, `promotion_plan_row_${index + 1}`),
    matchId,
    date,
    leagueSlug,
    homeTeam: teams.homeTeam,
    awayTeam: teams.awayTeam,
    reviewerDecision,
    selectedScoreKey: cleanString(row.selectedScoreKey),
    approvedFinalScore,
    sourceCount: selectedGroup ? selectedGroup.sourceCount : 0,
    independentSourceCount: selectedGroup ? selectedGroup.independentSourceCount : 0,
    sourceUrls,
    evidenceVerdict: firstNonEmpty(row.currentVerdict, row.verdict, row.finalTruthVerdict, row?.consensus?.verdict, row?.summary?.verdict),
    affectedValuePicks,
    proposedSettlement: affectedValuePicks.length > 0 ? 'settle_affected_value_picks_after_verified_final_truth_write' : 'no_value_picks_matched_or_value_input_not_provided',
    writeTarget: matchId && date ? `data/final-results/${date}/${matchId}.json` : '',
    promotionReady: blockedReasons.length === 0,
    blockedReason: blockedReasons.join('|')
  };
}

function buildPromotionPlan(input, inputPath, valueInput, valuePath) {
  const rows = extractRows(input);
  const valuePicks = extractValuePicks(valueInput);

  const planRows = rows.map((row, index) => buildPlanRow(row, index, valuePicks));
  const promotableRows = planRows.filter((row) => row.promotionReady);
  const blockedRows = planRows.filter((row) => !row.promotionReady);

  return {
    ok: blockedRows.length === 0 && promotableRows.length > 0,
    stage: blockedRows.length === 0 && promotableRows.length > 0
      ? 'final_result_truth_promotion_plan_ready'
      : 'final_result_truth_promotion_plan_has_blocks',
    generatedAt: new Date().toISOString(),
    inputPath,
    valuePath: valuePath || '',
    dryRun: true,
    productionWrite: false,
    canonicalWrites: 0,
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      fetch: false,
      productionFinalTruthDecision: false,
      canonicalPromotion: false,
      productionRepair: false,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    },
    summary: {
      totalRows: planRows.length,
      promotableRows: promotableRows.length,
      blockedRows: blockedRows.length,
      affectedValuePicks: planRows.reduce((sum, row) => sum + row.affectedValuePicks.length, 0)
    },
    planRows,
    blockedRows: blockedRows.map((row) => ({
      planRowIndex: row.planRowIndex,
      queueId: row.queueId,
      matchId: row.matchId,
      blockedReason: row.blockedReason
    }))
  };
}

function runSelfTest() {
  const input = {
    rows: [
      {
        queueId: '2026-05-01::m1::ready_for_review',
        matchId: 'm1',
        day: '2026-05-01',
        leagueSlug: 'eng.1',
        teams: { homeTeam: 'Alpha FC', awayTeam: 'Beta FC' },
        currentVerdict: 'verified_final_result',
        reviewed: true,
        reviewerDecision: 'approve_verified_read_only',
        selectedScoreKey: '',
        scoreGroups: [
          {
            scoreKey: '2-1',
            homeScore: 2,
            awayScore: 1,
            sourceCount: 2,
            independentSourceCount: 2,
            sources: [
              { sourceName: 'official', url: 'https://example.test/a' },
              { sourceName: 'trusted', url: 'https://example.test/b' }
            ]
          }
        ],
        productionApproved: false
      },
      {
        queueId: '2026-05-01::m2::manual_conflict_review_required',
        matchId: 'm2',
        day: '2026-05-01',
        teams: { homeTeam: 'Gamma FC', awayTeam: 'Delta FC' },
        reviewed: false,
        reviewerDecision: '',
        scoreGroups: []
      }
    ]
  };

  const value = {
    valuePicks: [
      { matchId: 'm1', market: '1X2', selection: 'HOME' },
      { matchId: 'm1', market: 'OVER 2.5', selection: 'OVER 2.5' }
    ]
  };

  const report = buildPromotionPlan(input, 'self-test-input', value, 'self-test-value');
  if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
  if (report.productionWrite !== false) throw new Error('productionWrite guarantee failed');
  if (report.dryRun !== true) throw new Error('dryRun guarantee failed');
  if (report.summary.promotableRows !== 1) throw new Error('expected 1 promotable row');
  if (report.summary.blockedRows !== 1) throw new Error('expected 1 blocked row');
  if (report.summary.affectedValuePicks !== 2) throw new Error('expected 2 affected value picks');
  const settlements = report.planRows[0].affectedValuePicks.map((pick) => pick.proposedSettlement).join(',');
  if (settlements !== 'WIN,WIN') throw new Error(`unexpected settlements: ${settlements}`);

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'build-final-result-truth-promotion-plan-file',
    stage: report.stage,
    promotableRows: report.summary.promotableRows,
    blockedRows: report.summary.blockedRows,
    affectedValuePicks: report.summary.affectedValuePicks,
    canonicalWrites: report.guarantees.canonicalWrites,
    productionWrite: report.guarantees.productionWrite,
    dryRun: report.guarantees.dryRun
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(usage());
    return;
  }

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.input) {
    throw new Error('Missing required --input <reviewed-decisions.json>');
  }

  const input = readJson(args.input);
  const valueInput = args.value ? readJson(args.value) : null;
  const output = args.output || path.join('data', 'football-truth', '_promotion-plans', `final-result-truth-promotion-plan-${new Date().toISOString().slice(0, 10)}.json`);
  const report = buildPromotionPlan(input, args.input, valueInput, args.value);
  writeJson(output, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    input: args.input,
    value: args.value || '',
    output,
    summary: report.summary,
    canonicalWrites: report.guarantees.canonicalWrites,
    productionWrite: report.guarantees.productionWrite,
    dryRun: report.guarantees.dryRun
  }, null, 2));

  if (!report.ok) {
    process.exitCode = 2;
  }
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile === __filename) {
  main();
}

export {
  buildPromotionPlan,
  buildPlanRow,
  extractRows,
  extractScoreGroups,
  settlePick
};
