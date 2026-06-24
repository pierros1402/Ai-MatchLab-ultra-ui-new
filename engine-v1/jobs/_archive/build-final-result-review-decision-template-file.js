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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractRows(input) {
  if (Array.isArray(input)) return input;
  return asArray(
    input.rows ||
    input.items ||
    input.reviewRows ||
    input.reviewQueueRows ||
    input?.reviewQueue?.rows ||
    input?.reviewQueue?.items ||
    input?.queue?.rows
  );
}

function normalizeTeamName(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    return firstNonEmpty(value.name, value.displayName, value.teamName, value.shortName);
  }
  return '';
}

function extractTeams(row) {
  const homeTeam = normalizeTeamName(firstNonEmpty(
    row.homeTeam,
    row.home,
    row.homeName,
    row.home_team,
    row?.teams?.home,
    row?.match?.homeTeam,
    row?.match?.home
  ));

  const awayTeam = normalizeTeamName(firstNonEmpty(
    row.awayTeam,
    row.away,
    row.awayName,
    row.away_team,
    row?.teams?.away,
    row?.match?.awayTeam,
    row?.match?.away
  ));

  return { homeTeam, awayTeam };
}

function normalizeScoreGroup(group, index) {
  const homeScore = firstNonEmpty(
    group.homeScore,
    group.home,
    group.homeGoals,
    group.scoreHome,
    group?.score?.home,
    group?.finalScore?.home
  );

  const awayScore = firstNonEmpty(
    group.awayScore,
    group.away,
    group.awayGoals,
    group.scoreAway,
    group?.score?.away,
    group?.finalScore?.away
  );

  const scoreKey = firstNonEmpty(
    group.scoreKey,
    group.key,
    group.finalScoreKey,
    homeScore !== '' && awayScore !== '' ? `${homeScore}-${awayScore}` : `score_group_${index + 1}`
  );

  return {
    scoreKey: String(scoreKey),
    homeScore: homeScore === '' ? null : Number(homeScore),
    awayScore: awayScore === '' ? null : Number(awayScore),
    sourceCount: Number(firstNonEmpty(group.sourceCount, group.sourcesCount, asArray(group.sources).length, 0)),
    independentSourceCount: Number(firstNonEmpty(group.independentSourceCount, group.independentSources, 0)),
    sources: asArray(group.sources).map((source) => ({
      sourceName: firstNonEmpty(source.sourceName, source.name, source.provider, source.domain),
      url: firstNonEmpty(source.url, source.sourceUrl),
      evidenceType: firstNonEmpty(source.evidenceType, source.type),
    })),
  };
}

function extractScoreGroups(row) {
  const rawGroups = asArray(
    row.scoreGroups ||
    row.finalScoreGroups ||
    row?.consensus?.scoreGroups ||
    row?.summary?.scoreGroups ||
    row?.evidenceSummary?.scoreGroups
  );

  if (rawGroups.length > 0) {
    return rawGroups.map(normalizeScoreGroup);
  }

  const homeScore = firstNonEmpty(
    row.homeScore,
    row.scoreHome,
    row?.score?.home,
    row?.finalScore?.home,
    row?.verifiedFinalResult?.homeScore
  );

  const awayScore = firstNonEmpty(
    row.awayScore,
    row.scoreAway,
    row?.score?.away,
    row?.finalScore?.away,
    row?.verifiedFinalResult?.awayScore
  );

  if (homeScore !== '' && awayScore !== '') {
    return [normalizeScoreGroup({
      homeScore,
      awayScore,
      sourceCount: firstNonEmpty(row.sourceCount, row.sourcesCount, asArray(row.sources).length, 0),
      independentSourceCount: firstNonEmpty(row.independentSourceCount, row.independentSources, 0),
      sources: asArray(row.sources),
    }, 0)];
  }

  return [];
}

function extractVerdict(row) {
  return String(firstNonEmpty(
    row.verdict,
    row.currentVerdict,
    row.finalTruthVerdict,
    row?.consensus?.verdict,
    row?.summary?.verdict,
    row?.review?.verdict,
    'unknown'
  ));
}

function allowedDecisionsFor(verdict, scoreGroups) {
  const decisions = [
    'defer',
    'add_source_required',
    'reject_all'
  ];

  if (/verified_final_result|ready_for_read_only_review/i.test(verdict)) {
    decisions.unshift('approve_verified_read_only');
  }

  if (scoreGroups.length > 0) {
    decisions.unshift('accept_score_group_read_only');
  }

  return Array.from(new Set(decisions));
}

function normalizeQueueRow(row, index) {
  const verdict = extractVerdict(row);
  const scoreGroups = extractScoreGroups(row);
  const teams = extractTeams(row);

  return {
    queueId: String(firstNonEmpty(row.queueId, row.id, row.reviewQueueId, `queue_row_${index + 1}`)),
    matchId: String(firstNonEmpty(row.matchId, row.fixtureId, row.eventId, row?.match?.id, '')),
    teams,
    currentVerdict: verdict,
    priority: String(firstNonEmpty(row.priority, row.reviewPriority, 'normal')),
    reason: String(firstNonEmpty(row.reason, row.reviewReason, row.statusReason, '')),
    scoreGroups,
    allowedDecisions: allowedDecisionsFor(verdict, scoreGroups),
    reviewerDecision: '',
    selectedScoreKey: '',
    reviewerNotes: '',
    reviewed: false,
    productionApproved: false,
  };
}

function buildTemplate(input, inputPath) {
  const sourceRows = extractRows(input);
  const rows = sourceRows.map(normalizeQueueRow);

  const summary = rows.reduce((acc, row) => {
    acc.totalRows += 1;
    acc.byVerdict[row.currentVerdict] = (acc.byVerdict[row.currentVerdict] || 0) + 1;
    acc.byPriority[row.priority] = (acc.byPriority[row.priority] || 0) + 1;
    return acc;
  }, {
    totalRows: 0,
    byVerdict: {},
    byPriority: {},
  });

  return {
    ok: true,
    stage: 'final_result_review_decision_template_ready',
    generatedAt: new Date().toISOString(),
    inputPath,
    guarantees: {
      canonicalWrites: 0,
      promotion: false,
      productionFinalTruthDecision: false,
      productionRepair: false,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false,
    },
    instructions: {
      reviewerDecision: [
        'approve_verified_read_only',
        'accept_score_group_read_only',
        'add_source_required',
        'reject_all',
        'defer'
      ],
      selectedScoreKey: 'Required only when reviewerDecision is accept_score_group_read_only.',
      reviewed: 'Set true only after manual review.',
      productionApproved: 'Must remain false at this stage. This template is read-only and not a promotion input yet.',
    },
    summary,
    rows,
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    const synthetic = {
      reviewQueue: {
        rows: [
          {
            queueId: 'arsenal-burnley',
            matchId: 'm1',
            homeTeam: 'Arsenal',
            awayTeam: 'Burnley',
            verdict: 'verified_final_result',
            priority: 'normal',
            scoreGroups: [
              {
                homeScore: 1,
                awayScore: 0,
                sourceCount: 2,
                independentSourceCount: 2,
                sources: [
                  { sourceName: 'ESPN', url: 'https://example.com/espn' },
                  { sourceName: 'FotMob', url: 'https://example.com/fotmob' }
                ]
              }
            ]
          },
          {
            queueId: 'bogota-real-cartagena',
            matchId: 'm2',
            homeTeam: 'Bogotá FC',
            awayTeam: 'Real Cartagena',
            verdict: 'manual_conflict_review_required',
            priority: 'high',
            scoreGroups: [
              { homeScore: 1, awayScore: 2, sourceCount: 1 },
              { homeScore: 2, awayScore: 1, sourceCount: 1 }
            ]
          }
        ]
      }
    };

    const template = buildTemplate(synthetic, 'self-test');
    if (template.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
    if (template.rows.length !== 2) throw new Error(`expected 2 rows, got ${template.rows.length}`);
    if (!template.rows[0].allowedDecisions.includes('approve_verified_read_only')) {
      throw new Error('verified row missing approve_verified_read_only decision');
    }
    if (!template.rows[1].allowedDecisions.includes('accept_score_group_read_only')) {
      throw new Error('conflict row missing accept_score_group_read_only decision');
    }

    console.log(JSON.stringify({
      ok: true,
      selfTest: 'build-final-result-review-decision-template-file',
      rows: template.rows.length,
      canonicalWrites: template.guarantees.canonicalWrites,
      productionApprovedDefaults: template.rows.map((row) => row.productionApproved),
    }, null, 2));
    return;
  }

  const inputPath = args.input;
  if (!inputPath) {
    throw new Error('Missing required --input <final-result-review-queue.json>');
  }

  const outputPath = args.output || path.join(
    path.dirname(inputPath),
    'final-result-review-decisions-template.json'
  );

  const input = readJson(inputPath);
  const template = buildTemplate(input, inputPath);
  writeJson(outputPath, template);

  console.log(JSON.stringify({
    ok: true,
    stage: template.stage,
    input: inputPath,
    output: outputPath,
    rows: template.rows.length,
    canonicalWrites: template.guarantees.canonicalWrites,
    promotion: template.guarantees.promotion,
    productionFinalTruthDecision: template.guarantees.productionFinalTruthDecision,
  }, null, 2));
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
  main();
}

export {
  buildTemplate,
  extractRows,
  normalizeQueueRow,
  allowedDecisionsFor
};
