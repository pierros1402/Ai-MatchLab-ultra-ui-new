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
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstNonEmpty() {
  for (const value of arguments) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function scoreKey(row) {
  if (row.homeScore === null || row.homeScore === undefined || row.awayScore === null || row.awayScore === undefined) return '';
  return String(row.homeScore) + '-' + String(row.awayScore);
}

function hasReason(row, reason) {
  return asArray(row.reasons).map(String).includes(reason);
}

function classifyAuditType(row, valueRowsForMatch) {
  if (hasReason(row, 'verify_existing_final_truth')) return 'verify_existing_final_truth';
  if (valueRowsForMatch.some((valueRow) => valueRow.reason === 'settled_value_pick_requires_final_truth_verification')) return 'verify_value_settlement';
  return 'missing_final_truth';
}

function classifyPriority(row, valueRowsForMatch, auditType) {
  if (valueRowsForMatch.length > 0) return 'high';
  if (auditType === 'verify_value_settlement') return 'high';
  if (hasReason(row, 'score_present_without_final_status')) return 'high';
  if (hasReason(row, 'stale_live_after_threshold') && scoreKey(row)) return 'high';
  if (auditType === 'verify_existing_final_truth') return 'medium';
  if (hasReason(row, 'pre_status_after_start_threshold')) return 'medium';
  if (hasReason(row, 'unknown_status_after_start_threshold')) return 'medium';
  return 'normal';
}

function normalizeFixtureWorksetRow(row, day, valueRowsForMatch) {
  const auditType = classifyAuditType(row, valueRowsForMatch);
  const priority = classifyPriority(row, valueRowsForMatch, auditType);
  const finalScoreKey = scoreKey(row);

  return {
    worksetId: [row.date || day.date, row.matchId || 'unknown', auditType].join('::'),
    date: row.date || day.date,
    matchId: String(row.matchId || ''),
    league: String(row.league || ''),
    homeTeam: String(row.homeTeam || ''),
    awayTeam: String(row.awayTeam || ''),
    status: String(row.status || ''),
    startTime: String(row.startTime || ''),
    ageHours: row.ageHours === undefined ? null : row.ageHours,
    homeScore: row.homeScore === undefined ? null : row.homeScore,
    awayScore: row.awayScore === undefined ? null : row.awayScore,
    scoreKey: finalScoreKey,
    reasons: asArray(row.reasons).map(String),
    auditType,
    priority,
    needsValueSettlement: valueRowsForMatch.some((valueRow) => valueRow.reason === 'final_fixture_value_pick_unsettled'),
    needsSettlementVerification: valueRowsForMatch.some((valueRow) => valueRow.reason === 'settled_value_pick_requires_final_truth_verification'),
    valuePickRefs: valueRowsForMatch.map((valueRow) => ({
      market: String(valueRow.market || ''),
      selection: String(valueRow.selection || ''),
      fixtureStatus: String(valueRow.fixtureStatus || ''),
      pickStatus: String(valueRow.pickStatus || ''),
      reason: String(valueRow.reason || '')
    })),
    sourceSearchNeeded: true,
    reviewRequired: true,
    productionApproved: false
  };
}

function normalizeValueOnlyWorksetRow(valueRow, day) {
  const auditType = valueRow.reason === 'settled_value_pick_requires_final_truth_verification'
    ? 'verify_value_settlement'
    : 'missing_final_truth';

  return {
    worksetId: [valueRow.date || day.date, valueRow.matchId || 'unknown', auditType].join('::'),
    date: valueRow.date || day.date,
    matchId: String(valueRow.matchId || ''),
    league: '',
    homeTeam: '',
    awayTeam: '',
    status: String(valueRow.fixtureStatus || ''),
    startTime: '',
    ageHours: null,
    homeScore: null,
    awayScore: null,
    scoreKey: '',
    reasons: [String(valueRow.reason || '')].filter(Boolean),
    auditType,
    priority: 'high',
    needsValueSettlement: valueRow.reason === 'final_fixture_value_pick_unsettled',
    needsSettlementVerification: valueRow.reason === 'settled_value_pick_requires_final_truth_verification',
    valuePickRefs: [{
      market: String(valueRow.market || ''),
      selection: String(valueRow.selection || ''),
      fixtureStatus: String(valueRow.fixtureStatus || ''),
      pickStatus: String(valueRow.pickStatus || ''),
      reason: String(valueRow.reason || '')
    }],
    sourceSearchNeeded: true,
    reviewRequired: true,
    productionApproved: false
  };
}

function buildWorkset(inventory, inputPath) {
  const days = asArray(inventory.days);
  const rows = [];
  const seen = new Set();

  for (const day of days) {
    const valueRowsByMatch = new Map();
    for (const valueRow of asArray(day.unsettledValuePicks)) {
      const matchId = String(valueRow.matchId || '');
      if (!valueRowsByMatch.has(matchId)) valueRowsByMatch.set(matchId, []);
      valueRowsByMatch.get(matchId).push(valueRow);
    }

    for (const fixtureRow of asArray(day.suspectFixtures)) {
      const matchId = String(fixtureRow.matchId || '');
      const valueRowsForMatch = valueRowsByMatch.get(matchId) || [];
      const worksetRow = normalizeFixtureWorksetRow(fixtureRow, day, valueRowsForMatch);
      if (!seen.has(worksetRow.worksetId)) {
        seen.add(worksetRow.worksetId);
        rows.push(worksetRow);
      }
    }

    for (const valueRow of asArray(day.unsettledValuePicks)) {
      const matchId = String(valueRow.matchId || '');
      const alreadyCovered = rows.some((row) => row.date === (valueRow.date || day.date) && row.matchId === matchId);
      if (alreadyCovered) continue;
      const worksetRow = normalizeValueOnlyWorksetRow(valueRow, day);
      if (!seen.has(worksetRow.worksetId)) {
        seen.add(worksetRow.worksetId);
        rows.push(worksetRow);
      }
    }
  }

  rows.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, normal: 2 };
    const pa = priorityOrder[a.priority] ?? 9;
    const pb = priorityOrder[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
    return String(a.matchId).localeCompare(String(b.matchId));
  });

  const summary = {
    totalRows: rows.length,
    highPriorityRows: rows.filter((row) => row.priority === 'high').length,
    mediumPriorityRows: rows.filter((row) => row.priority === 'medium').length,
    normalPriorityRows: rows.filter((row) => row.priority === 'normal').length,
    missingFinalTruthRows: rows.filter((row) => row.auditType === 'missing_final_truth').length,
    verifyExistingFinalTruthRows: rows.filter((row) => row.auditType === 'verify_existing_final_truth').length,
    verifyValueSettlementRows: rows.filter((row) => row.auditType === 'verify_value_settlement').length,
    needsValueSettlementRows: rows.filter((row) => row.needsValueSettlement).length,
    needsSettlementVerificationRows: rows.filter((row) => row.needsSettlementVerification).length
  };

  return {
    ok: true,
    stage: 'final_result_truth_audit_workset_ready',
    generatedAt: new Date().toISOString(),
    inputPath,
    sourceInventoryStage: String(inventory.stage || ''),
    sourceInventorySummary: inventory.summary || {},
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
    rows
  };
}

function runSelfTest() {
  const inventory = {
    stage: 'final_result_missing_ft_inventory_range_ready',
    summary: { from: '2026-05-18', to: '2026-05-18' },
    days: [
      {
        date: '2026-05-18',
        suspectFixtures: [
          {
            date: '2026-05-18',
            matchId: 'm1',
            league: 'eng.1',
            homeTeam: 'Arsenal',
            awayTeam: 'Burnley',
            status: 'FT',
            homeScore: 1,
            awayScore: 0,
            reasons: ['verify_existing_final_truth']
          },
          {
            date: '2026-05-18',
            matchId: 'm2',
            league: 'col.2',
            homeTeam: 'Bogotá FC',
            awayTeam: 'Real Cartagena',
            status: 'PRE',
            homeScore: null,
            awayScore: null,
            reasons: ['pre_status_after_start_threshold']
          },
          {
            date: '2026-05-18',
            matchId: 'm3',
            league: 'usa.1',
            homeTeam: 'Alpha FC',
            awayTeam: 'Beta FC',
            status: 'FIRST_HALF',
            homeScore: 0,
            awayScore: 0,
            reasons: ['stale_live_after_threshold', 'score_present_without_final_status']
          }
        ],
        unsettledValuePicks: [
          {
            date: '2026-05-18',
            matchId: 'm3',
            market: '1X2',
            selection: 'HOME',
            fixtureStatus: 'FIRST_HALF',
            pickStatus: 'unset',
            reason: 'final_fixture_value_pick_unsettled'
          },
          {
            date: '2026-05-18',
            matchId: 'm4',
            market: 'Over / Under 2.5',
            selection: 'Over 2.5',
            fixtureStatus: 'FT',
            pickStatus: 'WIN',
            reason: 'settled_value_pick_requires_final_truth_verification'
          }
        ]
      }
    ]
  };

  const workset = buildWorkset(inventory, 'self-test');
  if (workset.summary.totalRows !== 4) throw new Error('expected 4 workset rows');
  if (workset.summary.verifyExistingFinalTruthRows !== 1) throw new Error('expected 1 verify existing final truth row');
  if (workset.summary.missingFinalTruthRows !== 2) throw new Error('expected 2 missing final truth rows');
  if (workset.summary.verifyValueSettlementRows !== 1) throw new Error('expected 1 verify value settlement row');
  if (workset.summary.highPriorityRows !== 2) throw new Error('expected 2 high priority rows');
  if (workset.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
  if (workset.guarantees.promotion !== false) throw new Error('promotion guarantee failed');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'build-final-result-truth-audit-workset-from-inventory-file',
    totalRows: workset.summary.totalRows,
    highPriorityRows: workset.summary.highPriorityRows,
    missingFinalTruthRows: workset.summary.missingFinalTruthRows,
    verifyExistingFinalTruthRows: workset.summary.verifyExistingFinalTruthRows,
    verifyValueSettlementRows: workset.summary.verifyValueSettlementRows,
    canonicalWrites: workset.guarantees.canonicalWrites,
    promotion: workset.guarantees.promotion
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  if (!args.input) {
    throw new Error('Missing required --input <final-result-inventory.json>');
  }

  const inventory = readJson(args.input);
  const workset = buildWorkset(inventory, args.input);
  const outputPath = args.output || path.join(path.dirname(args.input), 'final-result-truth-audit-workset.json');
  writeJson(outputPath, workset);

  console.log(JSON.stringify({
    ok: workset.ok,
    stage: workset.stage,
    input: args.input,
    output: outputPath,
    summary: workset.summary,
    canonicalWrites: workset.guarantees.canonicalWrites,
    promotion: workset.guarantees.promotion,
    productionFinalTruthDecision: workset.guarantees.productionFinalTruthDecision
  }, null, 2));
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
  main();
}

export {
  buildWorkset,
  normalizeFixtureWorksetRow,
  normalizeValueOnlyWorksetRow,
  classifyAuditType,
  classifyPriority
};
