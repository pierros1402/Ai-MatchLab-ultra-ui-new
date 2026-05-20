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
  const cleaned = clean(filePath);
  if (!cleaned) return '';
  return path.resolve(repoRoot, cleaned);
}

function isInsideRepo(filePath) {
  const relative = path.relative(repoRoot, filePath);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isAllowedWriteTarget(filePath, options = {}) {
  const relative = repoRelative(filePath);

  if (clean(options.sandboxOutputRoot)) {
    const sandboxRoot = clean(options.sandboxOutputRoot)
      .replaceAll('\\', '/')
      .replace(/\/+$/u, '');
    const escaped = sandboxRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}/\\d{4}-\\d{2}-\\d{2}/[^/]+\\.json$`).test(relative);
  }

  return /^data\/final-results\/\d{4}-\d{2}-\d{2}\/[^/]+\.json$/.test(relative);
}

function resolveWriteTarget(row, options = {}) {
  const writeTargetRaw = clean(row?.writeTarget);
  const date = clean(row?.date || row?.day);
  const matchId = clean(row?.matchId);

  if (clean(options.sandboxOutputRoot)) {
    const sandboxRoot = clean(options.sandboxOutputRoot)
      .replaceAll('\\', '/')
      .replace(/\/+$/u, '');
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !matchId) return '';
    return resolveRepoPath(`${sandboxRoot}/${date}/${matchId}.json`);
  }

  return writeTargetRaw ? resolveRepoPath(writeTargetRaw) : '';
}

function normalizeScore(score) {
  const homeScore = Number(score?.homeScore);
  const awayScore = Number(score?.awayScore);
  const scoreKey = clean(score?.scoreKey || `${homeScore}-${awayScore}`);

  return {
    homeScore,
    awayScore,
    scoreKey
  };
}

function validatePlanGuarantees(plan) {
  const errors = [];
  const guarantees = plan?.guarantees || {};

  if (plan?.ok !== true) errors.push('plan_not_ok');
  if (clean(plan?.stage) !== 'final_result_truth_promotion_plan_ready') {
    errors.push('unexpected_plan_stage');
  }
  if (Number(guarantees.canonicalWrites ?? plan?.canonicalWrites ?? 0) !== 0) {
    errors.push('input_plan_canonical_writes_not_zero');
  }
  if (Boolean(guarantees.productionWrite ?? plan?.productionWrite) !== false) {
    errors.push('input_plan_production_write_not_false');
  }
  if (Boolean(guarantees.dryRun ?? plan?.dryRun) !== true) {
    errors.push('input_plan_not_dry_run');
  }

  return errors;
}

function validateRow(row, index, options = {}) {
  const errors = [];
  const matchId = clean(row?.matchId);
  const date = clean(row?.date || row?.day);
  const leagueSlug = clean(row?.leagueSlug);
  const homeTeam = clean(row?.homeTeam || row?.teams?.homeTeam || row?.teams?.home);
  const awayTeam = clean(row?.awayTeam || row?.teams?.awayTeam || row?.teams?.away);
  const score = normalizeScore(row?.approvedFinalScore);
  const sourceUrls = asArray(row?.sourceUrls).map(clean).filter(Boolean);
  const sourceCount = Number(row?.sourceCount || sourceUrls.length || 0);
  const independentSourceCount = Number(row?.independentSourceCount || sourceCount || 0);
  const writeTarget = resolveWriteTarget(row, options);

  if (!matchId) errors.push('missing_match_id');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('invalid_or_missing_date');
  if (!leagueSlug) errors.push('missing_league_slug');
  if (!homeTeam) errors.push('missing_home_team');
  if (!awayTeam) errors.push('missing_away_team');
  if (!Number.isInteger(score.homeScore) || score.homeScore < 0) errors.push('invalid_home_score');
  if (!Number.isInteger(score.awayScore) || score.awayScore < 0) errors.push('invalid_away_score');
  if (!sourceUrls.length) errors.push('missing_source_urls');
  if (sourceCount < 2) errors.push('source_count_below_2');
  if (independentSourceCount < 2) errors.push('independent_source_count_below_2');
  if (row?.promotionReady !== true) errors.push('promotion_ready_not_true');
  if (clean(row?.blockedReason)) errors.push('blocked_reason_present');
  if (!writeTarget) errors.push('missing_write_target');
  if (writeTarget && !isInsideRepo(writeTarget)) errors.push('write_target_outside_repo');
  if (writeTarget && !isAllowedWriteTarget(writeTarget, options)) errors.push('write_target_not_allowed_final_results_path');

  return {
    index,
    matchId,
    date,
    leagueSlug,
    homeTeam,
    awayTeam,
    score,
    sourceUrls,
    sourceCount,
    independentSourceCount,
    writeTarget,
    writeTargetRepoRelative: writeTarget ? repoRelative(writeTarget) : '',
    errors
  };
}

function buildFinalResultRecord(row, validationRow, options) {
  return {
    ok: true,
    schema: 'ai-matchlab.final-result-truth.v1',
    matchId: validationRow.matchId,
    date: validationRow.date,
    leagueSlug: validationRow.leagueSlug,
    teams: {
      homeTeam: validationRow.homeTeam,
      awayTeam: validationRow.awayTeam
    },
    finalScore: {
      homeScore: validationRow.score.homeScore,
      awayScore: validationRow.score.awayScore,
      scoreKey: validationRow.score.scoreKey
    },
    status: 'FT',
    verifiedFinalTruth: true,
    verification: {
      state: 'verified_final_result_truth',
      evidenceVerdict: clean(row.evidenceVerdict),
      sourceCount: validationRow.sourceCount,
      independentSourceCount: validationRow.independentSourceCount,
      sourceUrls: validationRow.sourceUrls,
      reviewerDecision: clean(row.reviewerDecision),
      queueId: clean(row.queueId),
      promotionPlanRowIndex: row.planRowIndex ?? validationRow.index
    },
    settlement: {
      valueSettlementState: asArray(row.affectedValuePicks).length > 0
        ? 'pending_value_settlement'
        : 'no_value_picks_to_settle',
      affectedValuePicks: asArray(row.affectedValuePicks)
    },
    provenance: {
      generatedBy: 'write-final-result-truth-from-promotion-plan-file',
      inputPromotionPlan: options.inputPath ? repoRelative(options.inputPath) : null,
      generatedAt: new Date().toISOString()
    },
    writeGuards: {
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    }
  };
}

function buildWriteReport(plan, options = {}) {
  const rows = asArray(plan?.rows || plan?.planRows);
  const apply = options.apply === true;
  const allowProductionWrites = options.allowProductionWrites === true;
  const mayWrite = apply && allowProductionWrites;

  const planErrors = validatePlanGuarantees(plan);
  const rowResults = rows.map((row, index) => validateRow(row, index, options));
  const rowErrors = rowResults.reduce((acc, row) => acc + row.errors.length, 0);

  const wouldWriteRows = [];
  const writtenRows = [];
  const blockedRows = [];

  rows.forEach((row, index) => {
    const validation = rowResults[index];
    const hasErrors = validation.errors.length > 0 || planErrors.length > 0;

    if (hasErrors) {
      blockedRows.push({
        index,
        matchId: validation.matchId || clean(row?.matchId),
        writeTarget: validation.writeTargetRepoRelative || clean(row?.writeTarget),
        errors: validation.errors
      });
      return;
    }

    const record = buildFinalResultRecord(row, validation, options);
    const writeRow = {
      index,
      matchId: validation.matchId,
      date: validation.date,
      leagueSlug: validation.leagueSlug,
      homeTeam: validation.homeTeam,
      awayTeam: validation.awayTeam,
      finalScore: record.finalScore,
      writeTarget: validation.writeTargetRepoRelative,
      record
    };

    if (mayWrite) {
      writeJson(validation.writeTarget, record);
      writtenRows.push({
        index,
        matchId: validation.matchId,
        writeTarget: validation.writeTargetRepoRelative
      });
    } else {
      wouldWriteRows.push(writeRow);
    }
  });

  return {
    ok: planErrors.length === 0 && rowErrors === 0,
    stage: mayWrite
      ? 'final_result_truth_production_write_completed'
      : 'final_result_truth_production_write_dry_run_ready',
    generatedAt: new Date().toISOString(),
    input: options.inputPath ? repoRelative(options.inputPath) : null,
    mode: {
      apply,
      allowProductionWrites,
      dryRun: !mayWrite,
      sandboxOutputRoot: clean(options.sandboxOutputRoot) || null
    },
    summary: {
      planRows: rows.length,
      wouldWriteRows: wouldWriteRows.length,
      writtenRows: writtenRows.length,
      blockedRows: blockedRows.length,
      planErrors: planErrors.length,
      rowErrors
    },
    planErrors,
    blockedRows,
    wouldWriteRows,
    writtenRows,
    guarantees: {
      canonicalWrites: writtenRows.length,
      productionWrite: mayWrite,
      dryRun: !mayWrite,
      sandboxOutputRoot: clean(options.sandboxOutputRoot) || null,
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      fetch: false,
      urlResolutionSideEffects: false,
      productionFinalTruthDecision: mayWrite,
      canonicalPromotion: mayWrite,
      sandboxWrite: mayWrite && Boolean(clean(options.sandboxOutputRoot)),
      productionRepair: false,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    }
  };
}

function runSelfTest() {
  const plan = {
    ok: true,
    stage: 'final_result_truth_promotion_plan_ready',
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    rows: [
      {
        planRowIndex: 0,
        matchId: 'self-test-1',
        date: '2026-05-18',
        leagueSlug: 'eng.1',
        homeTeam: 'Alpha FC',
        awayTeam: 'Beta FC',
        approvedFinalScore: { homeScore: 2, awayScore: 1, scoreKey: '2-1' },
        sourceCount: 2,
        independentSourceCount: 2,
        sourceUrls: [
          'https://example.test/official',
          'https://example.test/trusted'
        ],
        evidenceVerdict: 'verified_final_result',
        reviewerDecision: 'accept_score_group_read_only',
        queueId: 'self-test-queue',
        promotionReady: true,
        blockedReason: '',
        affectedValuePicks: [],
        writeTarget: 'data/final-results/2026-05-18/self-test-1.json'
      }
    ]
  };

  const report = buildWriteReport(plan, {
    inputPath: 'self-test-promotion-plan.json',
    apply: false,
    allowProductionWrites: false,
    sandboxOutputRoot: 'data/football-truth/_sandbox-final-results'
  });

  if (report.ok !== true) throw new Error('expected dry-run write report ok');
  if (report.summary.wouldWriteRows !== 1) throw new Error('expected one would-write row');
  if (report.summary.writtenRows !== 0) throw new Error('self-test must not write');
  if (report.guarantees.canonicalWrites !== 0) throw new Error('dry-run canonicalWrites must be zero');
  if (report.guarantees.productionWrite !== false) throw new Error('dry-run productionWrite must be false');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'write-final-result-truth-from-promotion-plan-file',
    stage: report.stage,
    wouldWriteRows: report.summary.wouldWriteRows,
    writtenRows: report.summary.writtenRows,
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

  if (!args.input) {
    console.error('Usage: node engine-v1/jobs/write-final-result-truth-from-promotion-plan-file.js --input <promotion-plan.json> --output <write-report.json> [--apply --allow-production-writes]');
    process.exit(2);
  }

  const inputPath = path.resolve(String(args.input));
  const outputPath = args.output
    ? path.resolve(String(args.output))
    : path.resolve(repoRoot, 'data/football-truth/_promotion-writes/final-result-truth-write-report.json');

  const apply = args.apply === true;
  const allowProductionWrites = args['allow-production-writes'] === true;
  const sandboxOutputRoot = clean(args['sandbox-output-root']);

  if (apply && !allowProductionWrites) {
    const blocked = {
      ok: false,
      stage: 'final_result_truth_production_write_blocked',
      input: repoRelative(inputPath),
      output: repoRelative(outputPath),
      summary: {
        planRows: 0,
        wouldWriteRows: 0,
        writtenRows: 0,
        blockedRows: 0,
        planErrors: 1,
        rowErrors: 0
      },
      planErrors: ['apply_requires_allow_production_writes'],
      guarantees: {
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true,
        requiresApplyFlag: true,
        requiresAllowProductionWritesFlag: true,
        fetch: false,
        urlResolutionSideEffects: false,
        productionFinalTruthDecision: false,
        canonicalPromotion: false,
        productionRepair: false,
        fixtureWrites: false,
        historyWrites: false,
        valueWrites: false,
        detailsWrites: false
      }
    };
    writeJson(outputPath, blocked);
    console.log(JSON.stringify(blocked, null, 2));
    process.exit(2);
  }

  const plan = readJson(inputPath);
  const report = buildWriteReport(plan, {
    inputPath,
    apply,
    allowProductionWrites,
    sandboxOutputRoot
  });

  writeJson(outputPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    input: report.input,
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
  buildWriteReport,
  buildFinalResultRecord,
  validateRow,
  validatePlanGuarantees
};