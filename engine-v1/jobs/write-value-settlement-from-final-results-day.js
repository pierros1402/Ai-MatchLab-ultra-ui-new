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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function repoRelative(filePath) {
  const absolute = path.resolve(repoRoot, filePath);
  return path.relative(repoRoot, absolute).replaceAll(path.sep, '/');
}

function resolveRepoPath(filePath) {
  const raw = clean(filePath);
  if (!raw) return '';
  return path.resolve(repoRoot, raw);
}

function isInsideRepo(filePath) {
  const relative = path.relative(repoRoot, filePath);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizeDayKey(report) {
  return clean(report?.dayKey || report?.settlementDraft?.dayKey || report?.draftValueData?.settlementDraft?.dayKey);
}

function defaultProductionTarget(report) {
  const inputValuePath = clean(report?.inputs?.valuePath);
  if (inputValuePath) return resolveRepoPath(inputValuePath);

  const dayKey = normalizeDayKey(report);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) return '';
  return path.resolve(repoRoot, 'data', 'value', `${dayKey}.json`);
}

function sandboxTarget(report, sandboxOutputRoot) {
  const dayKey = normalizeDayKey(report);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) return '';

  const normalizedRoot = clean(sandboxOutputRoot)
    .replaceAll('\\', '/')
    .replace(/\/+$/u, '');

  return resolveRepoPath(`${normalizedRoot}/${dayKey}.json`);
}

function isAllowedProductionValueTarget(filePath) {
  const relative = repoRelative(filePath);
  return /^data\/value\/\d{4}-\d{2}-\d{2}\.json$/u.test(relative);
}

function isAllowedSandboxValueTarget(filePath, sandboxOutputRoot) {
  const relative = repoRelative(filePath);
  const normalizedRoot = clean(sandboxOutputRoot)
    .replaceAll('\\', '/')
    .replace(/\/+$/u, '');
  if (!normalizedRoot) return false;

  const escaped = normalizedRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}/\\d{4}-\\d{2}-\\d{2}\\.json$`, 'u').test(relative);
}

function validateSettlementReport(report) {
  const errors = [];

  if (report?.ok !== true) errors.push('settlement_report_not_ok');
  if (clean(report?.stage) !== 'value_settlement_from_verified_final_results_dry_run') {
    errors.push('unexpected_settlement_report_stage');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalizeDayKey(report))) {
    errors.push('missing_or_invalid_day_key');
  }

  if (!report?.draftValueData || typeof report.draftValueData !== 'object') {
    errors.push('missing_draft_value_data');
  }

  if (Number(report?.guarantees?.canonicalWrites ?? 0) !== 0) {
    errors.push('input_report_canonical_writes_not_zero');
  }
  if (Boolean(report?.guarantees?.productionWrite) !== false) {
    errors.push('input_report_production_write_not_false');
  }
  if (Boolean(report?.guarantees?.dryRun) !== true) {
    errors.push('input_report_not_dry_run');
  }
  if (Boolean(report?.guarantees?.requiresVerifiedFinalTruth) !== true) {
    errors.push('input_report_does_not_require_verified_final_truth');
  }

  return errors;
}

function validateTarget(targetPath, options = {}) {
  const errors = [];
  const sandboxOutputRoot = clean(options.sandboxOutputRoot);

  if (!targetPath) errors.push('missing_target_path');
  if (targetPath && !isInsideRepo(targetPath)) errors.push('target_outside_repo');

  if (targetPath && sandboxOutputRoot) {
    if (!isAllowedSandboxValueTarget(targetPath, sandboxOutputRoot)) {
      errors.push('target_not_allowed_sandbox_value_path');
    }
  } else if (targetPath && !isAllowedProductionValueTarget(targetPath)) {
    errors.push('target_not_allowed_production_value_path');
  }

  if (
    targetPath &&
    options.apply === true &&
    fs.existsSync(targetPath) &&
    options.allowOverwriteValue !== true
  ) {
    errors.push('target_exists_requires_allow_overwrite_value');
  }

  return errors;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function materializeValueDataForWrite(valueData, options = {}) {
  const cloned = cloneJson(valueData);
  const dryRun = options.dryRun !== false;

  if (cloned && typeof cloned === 'object' && !Array.isArray(cloned)) {
    cloned.settlementDraft = {
      ...(cloned.settlementDraft || {}),
      dryRun,
      valueWrites: !dryRun,
      writtenBy: dryRun ? null : 'write-value-settlement-from-final-results-day',
      writtenAt: dryRun ? null : new Date().toISOString()
    };
  }

  const rows = Array.isArray(cloned)
    ? cloned
    : (Array.isArray(cloned?.picks)
      ? cloned.picks
      : (Array.isArray(cloned?.valuePicks)
        ? cloned.valuePicks
        : (Array.isArray(cloned?.rows) ? cloned.rows : [])));

  for (const row of rows) {
    if (row && typeof row === 'object' && row.settlement && typeof row.settlement === 'object') {
      row.settlement = {
        ...row.settlement,
        dryRun,
        valueWrites: !dryRun,
        writtenBy: dryRun ? row.settlement.writtenBy : 'write-value-settlement-from-final-results-day',
        writtenAt: dryRun ? row.settlement.writtenAt : new Date().toISOString()
      };
    }
  }

  return cloned;
}

function buildWriteReport(settlementReport, options = {}) {
  const apply = options.apply === true;
  const allowValueWrites = options.allowValueWrites === true;
  const allowOverwriteValue = options.allowOverwriteValue === true;
  const sandboxOutputRoot = clean(options.sandboxOutputRoot);

  const mayWrite = apply && allowValueWrites;
  const targetPath = sandboxOutputRoot
    ? sandboxTarget(settlementReport, sandboxOutputRoot)
    : defaultProductionTarget(settlementReport);

  const reportErrors = validateSettlementReport(settlementReport);
  const targetErrors = validateTarget(targetPath, {
    apply,
    sandboxOutputRoot,
    allowOverwriteValue
  });

  const errors = [...reportErrors, ...targetErrors];

  const writeTarget = targetPath ? repoRelative(targetPath) : '';
  const rawDraftValueData = settlementReport?.draftValueData || null;

  let written = false;
  const willWrite = errors.length === 0 && mayWrite;
  const draftValueData = rawDraftValueData
    ? materializeValueDataForWrite(rawDraftValueData, { dryRun: !willWrite })
    : null;

  if (willWrite) {
    writeJson(targetPath, draftValueData);
    written = true;
  }

  return {
    ok: errors.length === 0,
    stage: written
      ? 'value_settlement_from_verified_final_results_write_completed'
      : errors.length === 0
        ? 'value_settlement_from_verified_final_results_write_dry_run_ready'
        : 'value_settlement_from_verified_final_results_write_blocked',
    generatedAt: new Date().toISOString(),
    input: options.inputPath ? repoRelative(options.inputPath) : null,
    target: writeTarget,
    mode: {
      apply,
      allowValueWrites,
      allowOverwriteValue,
      sandboxOutputRoot: sandboxOutputRoot || null,
      dryRun: !written
    },
    summary: {
      valuePicks: Number(settlementReport?.summary?.valuePicks || 0),
      verifiedFinalResults: Number(settlementReport?.summary?.verifiedFinalResults || 0),
      settledRows: Number(settlementReport?.summary?.settledRows || 0),
      unresolvedRows: Number(settlementReport?.summary?.unresolvedRows || 0),
      winRows: Number(settlementReport?.summary?.winRows || 0),
      lossRows: Number(settlementReport?.summary?.lossRows || 0),
      wouldWriteRows: errors.length === 0 && !written ? 1 : 0,
      writtenRows: written ? 1 : 0,
      errors: errors.length
    },
    errors,
    settledRows: Array.isArray(settlementReport?.settledRows) ? settlementReport.settledRows : [],
    guarantees: {
      canonicalWrites: written ? 1 : 0,
      productionWrite: written && !sandboxOutputRoot,
      sandboxWrite: written && Boolean(sandboxOutputRoot),
      dryRun: !written,
      requiresApplyFlag: true,
      requiresAllowValueWritesFlag: true,
      requiresAllowOverwriteValueFlagWhenTargetExists: true,
      requiresVerifiedFinalTruth: true,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: written,
      detailsWrites: false
    }
  };
}

function runSelfTest() {
  const report = {
    ok: true,
    stage: 'value_settlement_from_verified_final_results_dry_run',
    dayKey: '2099-01-01',
    inputs: {
      valuePath: 'data/value/2099-01-01.json'
    },
    summary: {
      valuePicks: 1,
      verifiedFinalResults: 1,
      settledRows: 1,
      unresolvedRows: 0,
      winRows: 1,
      lossRows: 0
    },
    settledRows: [
      {
        matchId: 'self-test-1',
        result: 'WIN'
      }
    ],
    draftValueData: {
      ok: true,
      picks: [
        {
          matchId: 'self-test-1',
          result: 'WIN'
        }
      ]
    },
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      requiresVerifiedFinalTruth: true,
      valueWrites: false,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false
    }
  };

  const dryRun = buildWriteReport(report, {
    inputPath: 'self-test-settlement-report.json',
    apply: false,
    allowValueWrites: false,
    allowOverwriteValue: false,
    sandboxOutputRoot: 'data/football-truth/_sandbox-value-settlement'
  });

  if (dryRun.ok !== true) throw new Error('expected self-test dry-run ok');
  if (dryRun.summary.wouldWriteRows !== 1) throw new Error('expected one would-write row');
  if (dryRun.summary.writtenRows !== 0) throw new Error('expected zero written rows');
  if (dryRun.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites must be zero in dry-run');
  if (dryRun.guarantees.valueWrites !== false) throw new Error('valueWrites must be false in dry-run');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'write-value-settlement-from-final-results-day',
    stage: dryRun.stage,
    wouldWriteRows: dryRun.summary.wouldWriteRows,
    writtenRows: dryRun.summary.writtenRows,
    canonicalWrites: dryRun.guarantees.canonicalWrites,
    productionWrite: dryRun.guarantees.productionWrite,
    dryRun: dryRun.guarantees.dryRun,
    valueWrites: dryRun.guarantees.valueWrites
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  if (!args.input) {
    console.error('Usage: node engine-v1/jobs/write-value-settlement-from-final-results-day.js --input <settlement-report.json> --output <write-report.json> [--apply --allow-value-writes --allow-overwrite-value] [--sandbox-output-root <dir>]');
    process.exit(2);
  }

  const inputPath = path.resolve(String(args.input));
  const outputPath = args.output
    ? path.resolve(String(args.output))
    : path.resolve(repoRoot, 'data/value/_settlement-reports/value-settlement-write-report.json');

  const settlementReport = readJson(inputPath);
  const writeReport = buildWriteReport(settlementReport, {
    inputPath,
    apply: args.apply === true,
    allowValueWrites: args['allow-value-writes'] === true,
    allowOverwriteValue: args['allow-overwrite-value'] === true,
    sandboxOutputRoot: clean(args['sandbox-output-root'])
  });

  writeJson(outputPath, writeReport);

  console.log(JSON.stringify({
    ok: writeReport.ok,
    stage: writeReport.stage,
    input: writeReport.input,
    output: repoRelative(outputPath),
    target: writeReport.target,
    summary: writeReport.summary,
    canonicalWrites: writeReport.guarantees.canonicalWrites,
    productionWrite: writeReport.guarantees.productionWrite,
    sandboxWrite: writeReport.guarantees.sandboxWrite,
    dryRun: writeReport.guarantees.dryRun,
    valueWrites: writeReport.guarantees.valueWrites
  }, null, 2));

  if (!writeReport.ok) process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}

export {
  buildWriteReport,
  validateSettlementReport,
  validateTarget,
  materializeValueDataForWrite
};