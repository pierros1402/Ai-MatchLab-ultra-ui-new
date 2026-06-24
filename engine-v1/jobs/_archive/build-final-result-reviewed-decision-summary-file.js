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

function extractDecisionRows(input) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];

  const directRows = input.rows || input.decisions || input.reviewDecisionRows;
  if (Array.isArray(directRows)) return directRows;

  if (input.template && Array.isArray(input.template.rows)) return input.template.rows;
  if (input.validation && Array.isArray(input.validation.rows)) return input.validation.rows;

  return [];
}

function normalizeDecisionRow(row, index) {
  const errors = asArray(row.errors).map(String);
  const warnings = asArray(row.warnings).map(String);
  const reviewerDecision = typeof row.reviewerDecision === 'string' ? row.reviewerDecision.trim() : '';
  const selectedScoreKey = typeof row.selectedScoreKey === 'string' ? row.selectedScoreKey.trim() : '';
  const reviewed = row.reviewed === true;
  const productionApproved = row.productionApproved === true;

  return {
    rowIndex: Number.isInteger(row.rowIndex) ? row.rowIndex : index,
    queueId: typeof row.queueId === 'string' ? row.queueId.trim() : '',
    matchId: typeof row.matchId === 'string' ? row.matchId.trim() : '',
    currentVerdict: typeof row.currentVerdict === 'string' ? row.currentVerdict.trim() : '',
    priority: typeof row.priority === 'string' ? row.priority.trim() : 'normal',
    reviewed,
    reviewerDecision,
    selectedScoreKey,
    productionApproved,
    ok: row.ok === false ? false : errors.length === 0,
    errors,
    warnings
  };
}

function increment(map, key) {
  const safeKey = key || 'unknown';
  map[safeKey] = (map[safeKey] || 0) + 1;
}

function buildReviewedDecisionSummary(input, inputPath) {
  const rows = extractDecisionRows(input).map(normalizeDecisionRow);

  const summary = {
    totalRows: rows.length,
    validRows: 0,
    invalidRows: 0,
    reviewedRows: 0,
    unreviewedRows: 0,
    approvedVerifiedReadOnlyRows: 0,
    acceptedScoreGroupReadOnlyRows: 0,
    addSourceRequiredRows: 0,
    rejectedRows: 0,
    deferredRows: 0,
    productionApprovedViolations: 0,
    byReviewerDecision: {},
    byPriority: {},
    byCurrentVerdict: {}
  };

  const invalidRows = [];
  const productionApprovedViolations = [];
  const actionableRows = [];

  for (const row of rows) {
    if (row.ok) summary.validRows += 1;
    else {
      summary.invalidRows += 1;
      invalidRows.push(row);
    }

    if (row.reviewed) summary.reviewedRows += 1;
    else summary.unreviewedRows += 1;

    if (row.productionApproved) {
      summary.productionApprovedViolations += 1;
      productionApprovedViolations.push(row);
    }

    increment(summary.byReviewerDecision, row.reviewerDecision || 'unset');
    increment(summary.byPriority, row.priority);
    increment(summary.byCurrentVerdict, row.currentVerdict || 'unknown');

    if (row.reviewerDecision === 'approve_verified_read_only') {
      summary.approvedVerifiedReadOnlyRows += 1;
      actionableRows.push(row);
    } else if (row.reviewerDecision === 'accept_score_group_read_only') {
      summary.acceptedScoreGroupReadOnlyRows += 1;
      actionableRows.push(row);
    } else if (row.reviewerDecision === 'add_source_required') {
      summary.addSourceRequiredRows += 1;
    } else if (row.reviewerDecision === 'reject_all') {
      summary.rejectedRows += 1;
    } else if (row.reviewerDecision === 'defer') {
      summary.deferredRows += 1;
    }
  }

  const ok = summary.invalidRows === 0 && summary.productionApprovedViolations === 0;

  return {
    ok,
    stage: ok ? 'final_result_reviewed_decision_summary_ready' : 'final_result_reviewed_decision_summary_blocked',
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
      detailsWrites: false
    },
    summary,
    blockedReasons: {
      invalidRows: invalidRows.map((row) => ({
        rowIndex: row.rowIndex,
        queueId: row.queueId,
        errors: row.errors
      })),
      productionApprovedViolations: productionApprovedViolations.map((row) => ({
        rowIndex: row.rowIndex,
        queueId: row.queueId,
        reviewerDecision: row.reviewerDecision
      }))
    },
    readOnlyActionableRows: actionableRows.map((row) => ({
      rowIndex: row.rowIndex,
      queueId: row.queueId,
      matchId: row.matchId,
      reviewerDecision: row.reviewerDecision,
      selectedScoreKey: row.selectedScoreKey
    }))
  };
}

function runSelfTest() {
  const validInput = {
    rows: [
      {
        rowIndex: 0,
        queueId: 'arsenal-burnley',
        matchId: 'm1',
        currentVerdict: 'verified_final_result',
        priority: 'normal',
        reviewed: true,
        reviewerDecision: 'approve_verified_read_only',
        selectedScoreKey: '',
        productionApproved: false,
        errors: [],
        warnings: []
      },
      {
        rowIndex: 1,
        queueId: 'bogota-real-cartagena',
        matchId: 'm2',
        currentVerdict: 'manual_conflict_review_required',
        priority: 'high',
        reviewed: true,
        reviewerDecision: 'accept_score_group_read_only',
        selectedScoreKey: '2-1',
        productionApproved: false,
        errors: [],
        warnings: []
      },
      {
        rowIndex: 2,
        queueId: 'leganes-huesca',
        matchId: 'm3',
        currentVerdict: 'needs_more_evidence',
        priority: 'medium',
        reviewed: false,
        reviewerDecision: '',
        selectedScoreKey: '',
        productionApproved: false,
        errors: [],
        warnings: ['not_reviewed_yet']
      }
    ]
  };

  const blockedInput = {
    rows: [
      {
        rowIndex: 0,
        queueId: 'bad-row',
        reviewed: true,
        reviewerDecision: 'approve_verified_read_only',
        productionApproved: true,
        errors: ['productionApproved_must_remain_false_in_read_only_stage'],
        warnings: []
      }
    ]
  };

  const validSummary = buildReviewedDecisionSummary(validInput, 'self-test-valid');
  const blockedSummary = buildReviewedDecisionSummary(blockedInput, 'self-test-blocked');

  if (!validSummary.ok) throw new Error('expected valid summary');
  if (blockedSummary.ok) throw new Error('expected blocked summary');
  if (validSummary.summary.reviewedRows !== 2) throw new Error('expected 2 reviewed rows');
  if (validSummary.summary.unreviewedRows !== 1) throw new Error('expected 1 unreviewed row');
  if (validSummary.summary.approvedVerifiedReadOnlyRows !== 1) throw new Error('expected 1 approved verified read-only row');
  if (validSummary.summary.acceptedScoreGroupReadOnlyRows !== 1) throw new Error('expected 1 accepted score group row');
  if (validSummary.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
  if (validSummary.guarantees.promotion !== false) throw new Error('promotion guarantee failed');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'build-final-result-reviewed-decision-summary-file',
    reviewedRows: validSummary.summary.reviewedRows,
    unreviewedRows: validSummary.summary.unreviewedRows,
    actionableRows: validSummary.readOnlyActionableRows.length,
    blockedStage: blockedSummary.stage,
    canonicalWrites: validSummary.guarantees.canonicalWrites,
    promotion: validSummary.guarantees.promotion
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  if (!args.input) {
    throw new Error('Missing required --input <final-result-review-decisions-validation.json|decisions-template.json>');
  }

  const input = readJson(args.input);
  const report = buildReviewedDecisionSummary(input, args.input);
  const outputPath = args.output || path.join(path.dirname(args.input), 'final-result-reviewed-decision-summary.json');
  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    input: args.input,
    output: outputPath,
    summary: report.summary,
    canonicalWrites: report.guarantees.canonicalWrites,
    promotion: report.guarantees.promotion,
    productionFinalTruthDecision: report.guarantees.productionFinalTruthDecision
  }, null, 2));

  if (!report.ok) {
    process.exitCode = 2;
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
  main();
}

export {
  buildReviewedDecisionSummary,
  normalizeDecisionRow,
  extractDecisionRows
};
