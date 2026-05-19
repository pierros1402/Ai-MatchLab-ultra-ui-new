#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

function runNodeScript(label, scriptPath, scriptArgs, options = {}) {
  const result = spawnSync(process.execPath, [scriptPath].concat(scriptArgs), {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const allowedExitCodes = Array.isArray(options.allowedExitCodes) ? options.allowedExitCodes : [0];
  if (!allowedExitCodes.includes(result.status)) {
    throw new Error(label + ' failed with exit code ' + String(result.status));
  }

  return {
    label,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function buildPaths(outputDir) {
  return {
    reviewPackValidation: path.join(outputDir, 'review-pack-validation.json'),
    urlResolutionsInput: path.join(outputDir, 'source-url-resolutions-input.json'),
    urlResolutionsValidation: path.join(outputDir, 'source-url-resolutions-validation.json'),
    summary: path.join(outputDir, 'review-pack-url-validation-summary.json')
  };
}

function runPipeline(options) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const paths = buildPaths(options.outputDir);

  runNodeScript(
    'validate-final-result-truth-audit-resolution-review-pack-file',
    path.join('engine-v1', 'jobs', 'validate-final-result-truth-audit-resolution-review-pack-file.js'),
    ['--input', options.input, '--output', paths.reviewPackValidation],
    { allowedExitCodes: options.allowInvalidReviewPack ? [0, 2] : [0] }
  );

  const reviewPackValidation = readJson(paths.reviewPackValidation);
  if (!reviewPackValidation.ok && !options.allowInvalidReviewPack) {
    throw new Error('review pack validation failed');
  }

  runNodeScript(
    'build-final-result-source-url-resolutions-from-review-pack-file',
    path.join('engine-v1', 'jobs', 'build-final-result-source-url-resolutions-from-review-pack-file.js'),
    ['--input', options.input, '--output', paths.urlResolutionsInput]
  );

  runNodeScript(
    'validate-final-result-source-url-resolutions-file',
    path.join('engine-v1', 'jobs', 'validate-final-result-source-url-resolutions-file.js'),
    ['--input', paths.urlResolutionsInput, '--output', paths.urlResolutionsValidation],
    { allowedExitCodes: [0, 2] }
  );

  const urlResolutionsInput = readJson(paths.urlResolutionsInput);
  const urlResolutionsValidation = readJson(paths.urlResolutionsValidation);

  const ok = reviewPackValidation.ok === true && urlResolutionsValidation.ok === true;
  const report = {
    ok,
    stage: ok ? 'final_result_review_pack_url_validation_ready' : 'final_result_review_pack_url_validation_blocked',
    generatedAt: new Date().toISOString(),
    inputPath: options.input,
    outputDir: options.outputDir,
    paths,
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
      reviewPackValidation: reviewPackValidation.summary || {},
      urlResolutionsInput: urlResolutionsInput.summary || {},
      urlResolutionsValidation: urlResolutionsValidation.summary || {}
    }
  };

  writeJson(paths.summary, report);
  return report;
}

function writeSelfTestReviewPack(filePath) {
  writeJson(filePath, {
    ok: true,
    stage: 'final_result_truth_audit_resolution_review_pack_ready',
    sourceBatchId: 'resolution_batch_self_test',
    tasks: [
      {
        reviewTaskId: 'review-self-test-1',
        sourceTaskId: 'task-self-test-1',
        matchId: 'match-self-test-1',
        date: '2026-05-18',
        leagueSlug: 'test.1',
        homeTeam: 'Alpha FC',
        awayTeam: 'Beta FC',
        intent: 'value_settlement_final_result_verification',
        priority: 1,
        query: 'Alpha FC vs Beta FC 2026-05-18 final score',
        expectedScoreKey: '2-1',
        resolutionMode: 'manual_or_external_search_generic',
        resolutionState: 'manual_or_external_search_needed',
        manualResolvedUrl: 'https://example.com/alpha-beta-final',
        manualSourceName: 'Example Sports',
        manualSourceType: 'trusted',
        manualObservedHomeScore: 2,
        manualObservedAwayScore: 1,
        manualObservedStatus: 'FT',
        manualEvidenceText: 'Alpha FC 2-1 Beta FC FT',
        reviewerNotes: 'Synthetic wrapper self-test.',
        reviewed: true,
        acceptedForValidation: true,
        productionApproved: false
      }
    ]
  });
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiml-ft-review-pack-url-validation-'));
  const inputPath = path.join(tempRoot, 'filled-review-pack.json');
  const outputDir = path.join(tempRoot, 'out');

  try {
    writeSelfTestReviewPack(inputPath);
    const report = runPipeline({
      input: inputPath,
      outputDir,
      allowInvalidReviewPack: false
    });

    const reviewSummary = report.summary.reviewPackValidation || {};
    const adapterSummary = report.summary.urlResolutionsInput || {};
    const urlValidationSummary = report.summary.urlResolutionsValidation || {};

    if (!report.ok) throw new Error('expected wrapper report ok');
    if (reviewSummary.validRows !== 1) throw new Error('expected 1 valid review row');
    if (adapterSummary.acceptedRows !== 1) throw new Error('expected 1 accepted adapter row');
    if (urlValidationSummary.validatedCount !== 1) throw new Error('expected 1 validated URL resolution');
    if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
    if (report.guarantees.fetch !== false) throw new Error('fetch guarantee failed');

    console.log(JSON.stringify({
      ok: true,
      selfTest: 'run-final-result-review-pack-url-validation-file',
      reviewValidRows: reviewSummary.validRows,
      acceptedRows: adapterSummary.acceptedRows,
      urlValidatedCount: urlValidationSummary.validatedCount,
      canonicalWrites: report.guarantees.canonicalWrites,
      fetch: report.guarantees.fetch,
      canonicalPromotion: report.guarantees.canonicalPromotion
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

  if (!args.input) {
    throw new Error('Missing required --input <filled-review-pack.json>');
  }

  const outputDir = args.outputDir || args['output-dir'] || path.join(path.dirname(args.input), 'review-pack-url-validation');
  const report = runPipeline({
    input: args.input,
    outputDir,
    allowInvalidReviewPack: args['allow-invalid-review-pack'] === true
  });

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    input: report.inputPath,
    outputDir: report.outputDir,
    summary: report.summary,
    canonicalWrites: report.guarantees.canonicalWrites,
    fetch: report.guarantees.fetch,
    urlResolutionSideEffects: report.guarantees.urlResolutionSideEffects,
    productionFinalTruthDecision: report.guarantees.productionFinalTruthDecision,
    canonicalPromotion: report.guarantees.canonicalPromotion
  }, null, 2));

  if (!report.ok) process.exitCode = 2;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
  main();
}

export {
  runPipeline,
  buildPaths
};
