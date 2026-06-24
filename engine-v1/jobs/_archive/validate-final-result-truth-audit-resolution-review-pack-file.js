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

function nonEmpty(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function isScoreValue(value) {
  if (value === undefined || value === null || value === '') return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 99;
}

function looksLikeUrl(value) {
  if (!nonEmpty(value)) return false;
  return /^https?:\/\//i.test(String(value).trim());
}

function extractTasks(input) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];
  return asArray(input.tasks || input.rows || input.data);
}

function validateTask(task, index) {
  const errors = [];
  const warnings = [];

  const reviewed = task.reviewed === true;
  const acceptedForValidation = task.acceptedForValidation === true;
  const productionApproved = task.productionApproved === true;
  const hasUrl = nonEmpty(task.manualResolvedUrl);
  const hasNotes = nonEmpty(task.reviewerNotes);
  const hasSourceName = nonEmpty(task.manualSourceName);
  const hasHomeScore = isScoreValue(task.manualObservedHomeScore);
  const hasAwayScore = isScoreValue(task.manualObservedAwayScore);
  const hasAnyScore = task.manualObservedHomeScore !== null || task.manualObservedAwayScore !== null;
  const hasBothScores = hasHomeScore && hasAwayScore;
  const hasStatus = nonEmpty(task.manualObservedStatus);

  if (!nonEmpty(task.reviewTaskId)) errors.push('missing_reviewTaskId');
  if (!nonEmpty(task.sourceTaskId)) warnings.push('missing_sourceTaskId');
  if (!nonEmpty(task.matchId)) errors.push('missing_matchId');
  if (!nonEmpty(task.date)) errors.push('missing_date');
  if (!nonEmpty(task.intent)) errors.push('missing_intent');
  if (!nonEmpty(task.query)) errors.push('missing_query');

  if (productionApproved) {
    errors.push('productionApproved_must_remain_false_in_read_only_stage');
  }

  if (hasUrl && !looksLikeUrl(task.manualResolvedUrl)) {
    errors.push('manualResolvedUrl_must_start_with_http_or_https');
  }

  if (hasUrl && !hasSourceName) {
    errors.push('manualSourceName_required_when_manualResolvedUrl_is_set');
  }

  if (hasAnyScore && !hasBothScores) {
    errors.push('manualObservedHomeScore_and_manualObservedAwayScore_must_be_set_together');
  }

  if (reviewed && !hasUrl && !hasNotes) {
    errors.push('reviewed_true_requires_manualResolvedUrl_or_reviewerNotes');
  }

  if (reviewed && hasUrl && !hasSourceName) {
    errors.push('reviewed_url_row_requires_manualSourceName');
  }

  if (acceptedForValidation && !reviewed) {
    errors.push('acceptedForValidation_requires_reviewed_true');
  }

  if (acceptedForValidation && !hasUrl) {
    errors.push('acceptedForValidation_requires_manualResolvedUrl');
  }

  if (acceptedForValidation && !hasSourceName) {
    errors.push('acceptedForValidation_requires_manualSourceName');
  }

  if (acceptedForValidation && !hasBothScores) {
    errors.push('acceptedForValidation_requires_manualObservedHomeScore_and_manualObservedAwayScore');
  }

  if (acceptedForValidation && !hasStatus) {
    errors.push('acceptedForValidation_requires_manualObservedStatus');
  }

  if (!reviewed && (hasUrl || hasSourceName || hasBothScores || hasStatus)) {
    warnings.push('task_has_manual_fields_but_reviewed_is_false');
  }

  return {
    ok: errors.length === 0,
    rowIndex: index,
    reviewTaskId: String(task.reviewTaskId || ''),
    sourceTaskId: String(task.sourceTaskId || ''),
    matchId: String(task.matchId || ''),
    date: String(task.date || ''),
    leagueSlug: String(task.leagueSlug || ''),
    intent: String(task.intent || ''),
    reviewed,
    acceptedForValidation,
    productionApproved,
    manualResolvedUrl: String(task.manualResolvedUrl || ''),
    manualSourceName: String(task.manualSourceName || ''),
    manualObservedHomeScore: task.manualObservedHomeScore ?? null,
    manualObservedAwayScore: task.manualObservedAwayScore ?? null,
    manualObservedStatus: String(task.manualObservedStatus || ''),
    errors,
    warnings
  };
}

function validateReviewPack(input, inputPath) {
  const tasks = extractTasks(input);
  const rows = tasks.map(validateTask);
  const invalidRows = rows.filter((row) => !row.ok);
  const warningRows = rows.filter((row) => row.warnings.length > 0);
  const productionApprovedViolations = rows.filter((row) => row.productionApproved === true);

  const byIntent = {};
  const byDate = {};
  for (const row of rows) {
    byIntent[row.intent || 'unknown'] = (byIntent[row.intent || 'unknown'] || 0) + 1;
    byDate[row.date || 'unknown'] = (byDate[row.date || 'unknown'] || 0) + 1;
  }

  const ok = invalidRows.length === 0 && productionApprovedViolations.length === 0;

  return {
    ok,
    stage: ok ? 'final_result_truth_audit_resolution_review_pack_valid' : 'final_result_truth_audit_resolution_review_pack_invalid',
    generatedAt: new Date().toISOString(),
    inputPath,
    sourceStage: String(input.stage || ''),
    sourceBatchId: String(input.sourceBatchId || ''),
    guarantees: {
      canonicalWrites: 0,
      fetch: false,
      urlResolutionSideEffects: false,
      productionFinalTruthDecision: false,
      canonicalPromotion: false,
      productionRepair: false,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    },
    summary: {
      totalTasks: rows.length,
      validRows: rows.filter((row) => row.ok).length,
      invalidRows: invalidRows.length,
      warningRows: warningRows.length,
      reviewedRows: rows.filter((row) => row.reviewed).length,
      unreviewedRows: rows.filter((row) => !row.reviewed).length,
      acceptedForValidationRows: rows.filter((row) => row.acceptedForValidation).length,
      productionApprovedViolations: productionApprovedViolations.length,
      byIntent,
      byDate
    },
    invalidRows: invalidRows.map((row) => ({
      rowIndex: row.rowIndex,
      reviewTaskId: row.reviewTaskId,
      matchId: row.matchId,
      errors: row.errors
    })),
    warningRows: warningRows.map((row) => ({
      rowIndex: row.rowIndex,
      reviewTaskId: row.reviewTaskId,
      matchId: row.matchId,
      warnings: row.warnings
    })),
    rows
  };
}

function runSelfTest() {
  const input = {
    stage: 'final_result_truth_audit_resolution_review_pack_ready',
    sourceBatchId: 'resolution_batch_0001',
    tasks: [
      {
        reviewTaskId: 'r1',
        sourceTaskId: 't1',
        matchId: 'm1',
        date: '2026-05-18',
        leagueSlug: 'eng.1',
        intent: 'value_settlement_final_result_verification',
        query: 'Alpha FC vs Beta FC final score',
        manualResolvedUrl: 'https://example.com/match-report',
        manualSourceName: 'Example Sports',
        manualObservedHomeScore: 2,
        manualObservedAwayScore: 1,
        manualObservedStatus: 'FT',
        reviewerNotes: '',
        reviewed: true,
        acceptedForValidation: true,
        productionApproved: false
      },
      {
        reviewTaskId: 'r2',
        sourceTaskId: 't2',
        matchId: 'm2',
        date: '2026-05-18',
        leagueSlug: 'eng.1',
        intent: 'missing_final_truth',
        query: 'Gamma FC vs Delta FC final score',
        manualResolvedUrl: '',
        manualSourceName: '',
        manualObservedHomeScore: null,
        manualObservedAwayScore: null,
        manualObservedStatus: '',
        reviewerNotes: 'No source found yet.',
        reviewed: true,
        acceptedForValidation: false,
        productionApproved: false
      },
      {
        reviewTaskId: 'r3',
        sourceTaskId: 't3',
        matchId: 'm3',
        date: '2026-05-18',
        leagueSlug: 'eng.1',
        intent: 'missing_final_truth',
        query: 'Bad FC vs Worse FC final score',
        manualResolvedUrl: 'https://example.com/bad',
        manualSourceName: '',
        manualObservedHomeScore: 1,
        manualObservedAwayScore: null,
        manualObservedStatus: 'FT',
        reviewerNotes: '',
        reviewed: true,
        acceptedForValidation: true,
        productionApproved: true
      }
    ]
  };

  const report = validateReviewPack(input, 'self-test');
  if (report.ok) throw new Error('expected invalid report because row 3 is intentionally bad');
  if (report.summary.totalTasks !== 3) throw new Error('expected 3 tasks');
  if (report.summary.validRows !== 2) throw new Error('expected 2 valid rows');
  if (report.summary.invalidRows !== 1) throw new Error('expected 1 invalid row');
  if (report.summary.acceptedForValidationRows !== 2) throw new Error('expected 2 accepted rows including invalid one');
  if (report.summary.productionApprovedViolations !== 1) throw new Error('expected 1 productionApproved violation');
  if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
  if (report.guarantees.fetch !== false) throw new Error('fetch guarantee failed');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'validate-final-result-truth-audit-resolution-review-pack-file',
    reportOk: report.ok,
    totalTasks: report.summary.totalTasks,
    validRows: report.summary.validRows,
    invalidRows: report.summary.invalidRows,
    productionApprovedViolations: report.summary.productionApprovedViolations,
    canonicalWrites: report.guarantees.canonicalWrites,
    fetch: report.guarantees.fetch
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  if (!args.input) {
    throw new Error('Missing required --input <truth-audit-resolution-review-pack.json>');
  }

  const input = readJson(args.input);
  const report = validateReviewPack(input, args.input);
  const outputPath = args.output || path.join(path.dirname(args.input), 'truth-audit-resolution-review-pack-validation.json');
  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    input: args.input,
    output: outputPath,
    summary: report.summary,
    canonicalWrites: report.guarantees.canonicalWrites,
    fetch: report.guarantees.fetch,
    productionFinalTruthDecision: report.guarantees.productionFinalTruthDecision,
    canonicalPromotion: report.guarantees.canonicalPromotion
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
  validateReviewPack,
  validateTask
};
