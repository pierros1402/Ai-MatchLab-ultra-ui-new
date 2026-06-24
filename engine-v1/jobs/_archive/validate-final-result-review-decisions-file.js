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

function extractRows(input) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];
  return asArray(input.rows || input.decisions || input.reviewDecisionRows || (input.template && input.template.rows));
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateDecisionRow(row, index) {
  const errors = [];
  const warnings = [];
  const queueId = nonEmptyString(row.queueId) ? row.queueId.trim() : '';
  const rowLabel = queueId || 'row_' + String(index + 1);

  if (!queueId) {
    errors.push('missing_queueId');
  }

  const allowedDecisions = asArray(row.allowedDecisions).map(String);
  if (allowedDecisions.length === 0) {
    errors.push('missing_allowedDecisions');
  }

  const reviewerDecision = typeof row.reviewerDecision === 'string' ? row.reviewerDecision.trim() : '';
  const reviewed = row.reviewed === true;

  if (!reviewed && reviewerDecision === '') {
    warnings.push('not_reviewed_yet');
  }

  if (reviewed && reviewerDecision === '') {
    errors.push('reviewed_true_but_missing_reviewerDecision');
  }

  if (reviewerDecision !== '' && !allowedDecisions.includes(reviewerDecision)) {
    errors.push('reviewerDecision_not_allowed:' + reviewerDecision);
  }

  const scoreGroups = asArray(row.scoreGroups);
  const selectedScoreKey = typeof row.selectedScoreKey === 'string' ? row.selectedScoreKey.trim() : '';

  if (reviewerDecision === 'accept_score_group_read_only') {
    if (selectedScoreKey === '') {
      errors.push('accept_score_group_requires_selectedScoreKey');
    } else {
      const scoreKeys = new Set(scoreGroups.map((group) => String(group.scoreKey || '').trim()).filter(Boolean));
      if (!scoreKeys.has(selectedScoreKey)) {
        errors.push('selectedScoreKey_not_found:' + selectedScoreKey);
      }
    }
  }

  if (reviewerDecision !== 'accept_score_group_read_only' && selectedScoreKey !== '') {
    warnings.push('selectedScoreKey_set_for_non_score_group_decision');
  }

  if (row.productionApproved !== false) {
    errors.push('productionApproved_must_remain_false_in_read_only_stage');
  }

  return {
    ok: errors.length === 0,
    rowIndex: index,
    queueId,
    rowLabel,
    reviewed,
    reviewerDecision,
    selectedScoreKey,
    errors,
    warnings
  };
}

function validateDecisions(input, inputPath) {
  const rows = extractRows(input);
  const rowResults = rows.map(validateDecisionRow);
  const errorRows = rowResults.filter((row) => row.errors.length > 0);
  const warningRows = rowResults.filter((row) => row.warnings.length > 0);

  const summary = {
    totalRows: rows.length,
    validRows: rowResults.filter((row) => row.ok).length,
    errorRows: errorRows.length,
    warningRows: warningRows.length,
    reviewedRows: rowResults.filter((row) => row.reviewed).length
  };

  return {
    ok: errorRows.length === 0,
    stage: errorRows.length === 0 ? 'final_result_review_decisions_valid' : 'final_result_review_decisions_invalid',
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
    rows: rowResults
  };
}

function runSelfTest() {
  const validInput = {
    rows: [
      {
        queueId: 'arsenal-burnley',
        allowedDecisions: ['approve_verified_read_only', 'defer'],
        reviewerDecision: 'approve_verified_read_only',
        reviewed: true,
        productionApproved: false,
        scoreGroups: [{ scoreKey: '1-0', homeScore: 1, awayScore: 0 }]
      },
      {
        queueId: 'bogota-real-cartagena',
        allowedDecisions: ['accept_score_group_read_only', 'defer'],
        reviewerDecision: 'accept_score_group_read_only',
        selectedScoreKey: '2-1',
        reviewed: true,
        productionApproved: false,
        scoreGroups: [{ scoreKey: '1-2' }, { scoreKey: '2-1' }]
      }
    ]
  };

  const invalidInput = {
    rows: [
      {
        queueId: '',
        allowedDecisions: ['defer'],
        reviewerDecision: 'accept_score_group_read_only',
        selectedScoreKey: '9-9',
        reviewed: true,
        productionApproved: true,
        scoreGroups: [{ scoreKey: '1-0' }]
      }
    ]
  };

  const validReport = validateDecisions(validInput, 'self-test-valid');
  const invalidReport = validateDecisions(invalidInput, 'self-test-invalid');

  if (!validReport.ok) throw new Error('expected valid self-test report');
  if (invalidReport.ok) throw new Error('expected invalid self-test report');
  if (validReport.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
  if (validReport.guarantees.promotion !== false) throw new Error('promotion guarantee failed');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'validate-final-result-review-decisions-file',
    validRows: validReport.summary.validRows,
    invalidErrorRows: invalidReport.summary.errorRows,
    canonicalWrites: validReport.guarantees.canonicalWrites,
    promotion: validReport.guarantees.promotion
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  if (!args.input) {
    throw new Error('Missing required --input <final-result-review-decisions-template.json>');
  }

  const input = readJson(args.input);
  const report = validateDecisions(input, args.input);
  const outputPath = args.output || path.join(path.dirname(args.input), 'final-result-review-decisions-validation.json');
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
  validateDecisions,
  validateDecisionRow,
  extractRows
};
