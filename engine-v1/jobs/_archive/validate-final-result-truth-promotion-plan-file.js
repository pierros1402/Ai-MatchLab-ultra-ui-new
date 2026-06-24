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
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    'Usage:',
    '  node engine-v1/jobs/validate-final-result-truth-promotion-plan-file.js --input <promotion-plan.json> [--output <validation-report.json>]',
    '',
    'This validator is read-only:',
    '  - canonicalWrites: 0',
    '  - productionWrite: false',
    '  - dryRunValidation: true',
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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function addIssue(issues, level, code, message, rowIndex = null) {
  issues.push({ level, code, message, rowIndex });
}

function validateGuarantees(plan, issues) {
  if (plan.dryRun !== true) addIssue(issues, 'error', 'plan_not_dry_run', 'plan.dryRun must be true');
  if (plan.productionWrite !== false) addIssue(issues, 'error', 'production_write_not_false', 'plan.productionWrite must be false');
  if (plan.canonicalWrites !== 0) addIssue(issues, 'error', 'canonical_writes_not_zero', 'plan.canonicalWrites must be 0');

  const guarantees = isObject(plan.guarantees) ? plan.guarantees : {};
  if (!isObject(plan.guarantees)) addIssue(issues, 'error', 'missing_guarantees', 'plan.guarantees object is required');

  const exact = {
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
  };

  for (const [key, expected] of Object.entries(exact)) {
    if (guarantees[key] !== expected) {
      addIssue(issues, 'error', `guarantee_${key}_invalid`, `guarantees.${key} must be ${JSON.stringify(expected)}`);
    }
  }
}

function validateSummary(plan, rows, issues) {
  const summary = isObject(plan.summary) ? plan.summary : {};
  if (!isObject(plan.summary)) {
    addIssue(issues, 'error', 'missing_summary', 'plan.summary object is required');
    return;
  }

  const promotableRows = rows.filter((row) => row && row.promotionReady === true).length;
  const blockedRows = rows.filter((row) => !row || row.promotionReady !== true).length;
  const affectedValuePicks = rows.reduce((sum, row) => sum + asArray(row?.affectedValuePicks).length, 0);

  if (Number(summary.totalRows) !== rows.length) addIssue(issues, 'error', 'summary_total_rows_mismatch', `summary.totalRows must equal planRows.length (${rows.length})`);
  if (Number(summary.promotableRows) !== promotableRows) addIssue(issues, 'error', 'summary_promotable_rows_mismatch', `summary.promotableRows must equal computed promotable rows (${promotableRows})`);
  if (Number(summary.blockedRows) !== blockedRows) addIssue(issues, 'error', 'summary_blocked_rows_mismatch', `summary.blockedRows must equal computed blocked rows (${blockedRows})`);
  if (Number(summary.affectedValuePicks) !== affectedValuePicks) addIssue(issues, 'error', 'summary_affected_value_picks_mismatch', `summary.affectedValuePicks must equal computed affected picks (${affectedValuePicks})`);
}

function validateApprovedScore(row, issues, rowIndex) {
  if (!isObject(row.approvedFinalScore)) {
    addIssue(issues, 'error', 'promotion_ready_missing_approved_score', 'promotion-ready row must include approvedFinalScore', rowIndex);
    return;
  }

  const homeScore = numberOrNull(row.approvedFinalScore.homeScore);
  const awayScore = numberOrNull(row.approvedFinalScore.awayScore);
  if (homeScore === null || awayScore === null) addIssue(issues, 'error', 'promotion_ready_invalid_score', 'approvedFinalScore must include numeric homeScore and awayScore', rowIndex);
  if (homeScore !== null && homeScore < 0) addIssue(issues, 'error', 'promotion_ready_negative_home_score', 'homeScore cannot be negative', rowIndex);
  if (awayScore !== null && awayScore < 0) addIssue(issues, 'error', 'promotion_ready_negative_away_score', 'awayScore cannot be negative', rowIndex);

  const scoreKey = cleanString(row.approvedFinalScore.scoreKey);
  const expectedScoreKey = homeScore !== null && awayScore !== null ? `${homeScore}-${awayScore}` : '';
  if (expectedScoreKey && scoreKey && scoreKey !== expectedScoreKey) {
    addIssue(issues, 'error', 'promotion_ready_score_key_mismatch', `scoreKey must match approved score ${expectedScoreKey}`, rowIndex);
  }
}

function validateAffectedValuePicks(row, issues, rowIndex) {
  for (const [pickIndex, pick] of asArray(row.affectedValuePicks).entries()) {
    if (!isObject(pick)) {
      addIssue(issues, 'error', 'affected_pick_not_object', `affectedValuePicks[${pickIndex}] must be an object`, rowIndex);
      continue;
    }

    if (cleanString(pick.matchId) !== cleanString(row.matchId)) {
      addIssue(issues, 'error', 'affected_pick_match_id_mismatch', `affectedValuePicks[${pickIndex}].matchId must match row.matchId`, rowIndex);
    }

    const proposedSettlement = cleanString(pick.proposedSettlement);
    if (!['WIN', 'LOSS', 'PUSH', 'VOID', 'UNKNOWN'].includes(proposedSettlement)) {
      addIssue(issues, 'error', 'affected_pick_invalid_proposed_settlement', `affectedValuePicks[${pickIndex}].proposedSettlement is invalid`, rowIndex);
    }

    if (proposedSettlement === 'UNKNOWN') {
      addIssue(issues, 'warning', 'affected_pick_unknown_settlement', `affectedValuePicks[${pickIndex}] could not be dry-run settled`, rowIndex);
    }
  }
}

function validatePlanRow(row, issues, rowIndex) {
  if (!isObject(row)) {
    addIssue(issues, 'error', 'plan_row_not_object', 'planRows entry must be an object', rowIndex);
    return;
  }

  if (row.productionWrite === true || row.canonicalWrites > 0 || row.apply === true) {
    addIssue(issues, 'error', 'row_contains_write_intent', 'plan row must not contain write/apply intent', rowIndex);
  }

  const promotionReady = row.promotionReady === true;
  const blockedReason = cleanString(row.blockedReason);

  if (promotionReady) {
    const requiredStrings = ['matchId', 'date', 'leagueSlug', 'homeTeam', 'awayTeam', 'reviewerDecision', 'writeTarget'];
    for (const key of requiredStrings) {
      if (!cleanString(row[key])) addIssue(issues, 'error', `promotion_ready_missing_${key}`, `promotion-ready row is missing ${key}`, rowIndex);
    }

    if (blockedReason) addIssue(issues, 'error', 'promotion_ready_has_blocked_reason', 'promotion-ready row must not have blockedReason', rowIndex);
    if (!['approve_verified_read_only', 'accept_score_group_read_only'].includes(cleanString(row.reviewerDecision))) {
      addIssue(issues, 'error', 'promotion_ready_invalid_reviewer_decision', 'promotion-ready row must have an approved read-only reviewerDecision', rowIndex);
    }

    validateApprovedScore(row, issues, rowIndex);

    if (Number(row.sourceCount) < 2 && Number(row.independentSourceCount) < 2) {
      addIssue(issues, 'error', 'promotion_ready_insufficient_source_count', 'promotion-ready row needs sourceCount >= 2 or independentSourceCount >= 2', rowIndex);
    }

    if (asArray(row.sourceUrls).length < 1) {
      addIssue(issues, 'error', 'promotion_ready_missing_source_urls', 'promotion-ready row needs at least one source URL', rowIndex);
    }
  } else if (!blockedReason) {
    addIssue(issues, 'error', 'blocked_row_missing_blocked_reason', 'blocked row must include blockedReason', rowIndex);
  }

  validateAffectedValuePicks(row, issues, rowIndex);
}

function validateBlockedRowsIndex(plan, rows, issues) {
  const blockedRows = asArray(plan.blockedRows);
  const computedBlockedIndexes = new Set(rows.map((row, index) => (row?.promotionReady === true ? null : index)).filter((index) => index !== null));
  const listedBlockedIndexes = new Set(blockedRows.map((row) => Number(row?.planRowIndex)).filter((index) => Number.isInteger(index)));

  if (blockedRows.length !== computedBlockedIndexes.size) {
    addIssue(issues, 'error', 'blocked_rows_length_mismatch', 'blockedRows length must match computed blocked plan rows');
  }

  for (const index of computedBlockedIndexes) {
    if (!listedBlockedIndexes.has(index)) addIssue(issues, 'error', 'blocked_rows_missing_index', `blockedRows is missing planRowIndex ${index}`);
  }
}

function validatePromotionPlan(plan, inputPath = '') {
  const issues = [];
  if (!isObject(plan)) {
    addIssue(issues, 'error', 'plan_not_object', 'promotion plan must be a JSON object');
    return buildReport(inputPath, [], issues);
  }

  const rows = asArray(plan.planRows);
  if (!Array.isArray(plan.planRows)) addIssue(issues, 'error', 'missing_plan_rows', 'plan.planRows array is required');

  validateGuarantees(plan, issues);
  validateSummary(plan, rows, issues);
  rows.forEach((row, index) => validatePlanRow(row, issues, index));
  validateBlockedRowsIndex(plan, rows, issues);

  return buildReport(inputPath, rows, issues);
}

function buildReport(inputPath, rows, issues) {
  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');
  const promotableRows = rows.filter((row) => row && row.promotionReady === true).length;
  const blockedRows = rows.filter((row) => !row || row.promotionReady !== true).length;

  return {
    ok: errors.length === 0,
    stage: errors.length === 0 ? 'final_result_truth_promotion_plan_valid' : 'final_result_truth_promotion_plan_invalid',
    generatedAt: new Date().toISOString(),
    inputPath,
    dryRunValidation: true,
    productionWrite: false,
    canonicalWrites: 0,
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRunValidation: true,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    },
    summary: {
      planRows: rows.length,
      promotableRows,
      blockedRows,
      errors: errors.length,
      warnings: warnings.length
    },
    issues
  };
}

function runSelfTest() {
  const plan = {
    ok: false,
    stage: 'final_result_truth_promotion_plan_has_blocks',
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
      totalRows: 2,
      promotableRows: 1,
      blockedRows: 1,
      affectedValuePicks: 2
    },
    planRows: [
      {
        planRowIndex: 0,
        queueId: '2026-05-01::m1::ready',
        matchId: 'm1',
        date: '2026-05-01',
        leagueSlug: 'eng.1',
        homeTeam: 'Alpha FC',
        awayTeam: 'Beta FC',
        reviewerDecision: 'approve_verified_read_only',
        approvedFinalScore: { homeScore: 2, awayScore: 1, scoreKey: '2-1' },
        sourceCount: 2,
        independentSourceCount: 2,
        sourceUrls: ['https://example.test/a', 'https://example.test/b'],
        evidenceVerdict: 'verified_final_result',
        affectedValuePicks: [
          { matchId: 'm1', market: '1X2', selection: 'HOME', proposedSettlement: 'WIN', scoreUsed: '2-1' },
          { matchId: 'm1', market: 'OVER 2.5', selection: 'OVER 2.5', proposedSettlement: 'WIN', scoreUsed: '2-1' }
        ],
        proposedSettlement: 'settle_affected_value_picks_after_verified_final_truth_write',
        writeTarget: 'data/final-results/2026-05-01/m1.json',
        promotionReady: true,
        blockedReason: ''
      },
      {
        planRowIndex: 1,
        queueId: '2026-05-01::m2::blocked',
        matchId: 'm2',
        date: '2026-05-01',
        leagueSlug: 'eng.1',
        homeTeam: 'Gamma FC',
        awayTeam: 'Delta FC',
        reviewerDecision: '',
        approvedFinalScore: null,
        sourceCount: 0,
        independentSourceCount: 0,
        sourceUrls: [],
        affectedValuePicks: [],
        proposedSettlement: 'no_value_picks_matched_or_value_input_not_provided',
        writeTarget: '',
        promotionReady: false,
        blockedReason: 'not_reviewed|reviewer_decision_not_promotable|missing_approved_score_group'
      }
    ],
    blockedRows: [
      { planRowIndex: 1, queueId: '2026-05-01::m2::blocked', matchId: 'm2', blockedReason: 'not_reviewed' }
    ]
  };

  const report = validatePromotionPlan(plan, 'self-test-plan');
  if (!report.ok) throw new Error(`self-test validation failed: ${JSON.stringify(report.issues)}`);
  if (report.summary.promotableRows !== 1) throw new Error('expected 1 promotable row');
  if (report.summary.blockedRows !== 1) throw new Error('expected 1 blocked row');
  if (report.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
  if (report.productionWrite !== false) throw new Error('productionWrite guarantee failed');
  if (report.dryRunValidation !== true) throw new Error('dryRunValidation guarantee failed');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'validate-final-result-truth-promotion-plan-file',
    stage: report.stage,
    promotableRows: report.summary.promotableRows,
    blockedRows: report.summary.blockedRows,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    canonicalWrites: report.canonicalWrites,
    productionWrite: report.productionWrite,
    dryRunValidation: report.dryRunValidation
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

  if (!args.input) throw new Error('Missing required --input <promotion-plan.json>');

  const plan = readJson(args.input);
  const report = validatePromotionPlan(plan, args.input);
  if (args.output) writeJson(args.output, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    input: args.input,
    output: args.output || '',
    summary: report.summary,
    canonicalWrites: report.canonicalWrites,
    productionWrite: report.productionWrite,
    dryRunValidation: report.dryRunValidation
  }, null, 2));

  if (!report.ok) process.exitCode = 2;
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile === __filename) {
  main();
}

export {
  validatePromotionPlan,
  validatePlanRow
};