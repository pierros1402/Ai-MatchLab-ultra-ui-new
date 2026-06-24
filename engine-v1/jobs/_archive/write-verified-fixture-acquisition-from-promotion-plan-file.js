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
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function repoRelative(filePath) {
  const absolute = path.resolve(filePath);
  return path.relative(repoRoot, absolute).replaceAll(path.sep, '/');
}

function resolveRepoPath(relativePath) {
  const cleaned = clean(relativePath);
  if (!cleaned) return '';
  return path.resolve(repoRoot, cleaned);
}

function isInsideRepo(filePath) {
  const relative = path.relative(repoRoot, filePath);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function safeSlug(value) {
  return clean(value).replace(/[^a-zA-Z0-9._-]/g, '');
}

function expectedCanonicalTarget(dayKey, leagueSlug) {
  return `data/canonical-fixtures/${dayKey}/${leagueSlug}.json`;
}

function normalizeSandboxRoot(value) {
  const root = clean(value).replaceAll('\\', '/').replace(/\/+$/u, '');
  if (!root) return '';
  return root;
}

function resolveWriteTarget(planRow, options) {
  const fixture = planRow?.proposedCanonicalFixture || {};
  const dayKey = clean(fixture.date || fixture.localDate || options.dayKey);
  const leagueSlug = safeSlug(fixture.leagueSlug);

  if (!dayKey || !leagueSlug) return '';

  const sandboxRoot = normalizeSandboxRoot(options.sandboxOutputRoot);
  if (sandboxRoot) {
    return resolveRepoPath(`${sandboxRoot}/${dayKey}/${leagueSlug}.json`);
  }

  return resolveRepoPath(expectedCanonicalTarget(dayKey, leagueSlug));
}

function allowedWriteTarget(filePath, options) {
  if (!filePath || !isInsideRepo(filePath)) return false;

  const relative = repoRelative(filePath);
  const sandboxRoot = normalizeSandboxRoot(options.sandboxOutputRoot);

  if (sandboxRoot) {
    const escaped = sandboxRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}/\\d{4}-\\d{2}-\\d{2}/[a-zA-Z0-9._-]+\\.json$`).test(relative);
  }

  return /^data\/canonical-fixtures\/\d{4}-\d{2}-\d{2}\/[a-zA-Z0-9._-]+\.json$/.test(relative);
}

function validatePlanGuarantees(plan) {
  const errors = [];
  const summary = plan?.summary || {};
  const guarantees = plan?.guarantees || {};

  if (plan?.ok !== true) errors.push('plan_not_ok');
  if (clean(plan?.mode) !== 'read_only_verified_fixture_acquisition_promotion_plan') {
    errors.push('unexpected_plan_mode');
  }
  if (plan?.dryRun !== true) errors.push('input_plan_not_dry_run');
  if (Number(summary.canonicalWrites ?? guarantees.canonicalWrites ?? 0) !== 0) {
    errors.push('input_plan_canonical_writes_not_zero');
  }
  if (Boolean(summary.productionWrite ?? guarantees.productionWrite) !== false) {
    errors.push('input_plan_production_write_not_false');
  }
  if (Boolean(summary.dryRun ?? guarantees.dryRun) !== true) {
    errors.push('input_plan_summary_not_dry_run');
  }
  if (Boolean(guarantees.noFetch) !== true) errors.push('input_plan_no_fetch_not_true');
  if (Boolean(guarantees.noUrlFetch) !== true) errors.push('input_plan_no_url_fetch_not_true');
  if (Boolean(guarantees.noCanonicalPromotion) !== true) {
    errors.push('input_plan_no_canonical_promotion_not_true');
  }

  return errors;
}

function validatePlanRow(row, index, options = {}) {
  const errors = [];
  const fixture = row?.proposedCanonicalFixture || {};
  const dayKey = clean(fixture.date);
  const localDate = clean(fixture.localDate);
  const leagueSlug = safeSlug(fixture.leagueSlug);
  const homeTeam = clean(fixture.homeTeam);
  const awayTeam = clean(fixture.awayTeam);
  const localTime = clean(fixture.localTime);
  const status = clean(fixture.status);
  const sourceUrl = clean(fixture.sourceUrl || row?.sourceEvidence?.sourceUrl);
  const writeTarget = resolveWriteTarget(row, options);
  const expectedTarget = dayKey && leagueSlug ? expectedCanonicalTarget(dayKey, leagueSlug) : '';

  if (!clean(row?.planRowId)) errors.push('missing_plan_row_id');
  if (row?.canonicalWrites !== 0) errors.push('plan_row_canonical_writes_not_zero');
  if (row?.productionWrite !== false) errors.push('plan_row_production_write_not_false');
  if (row?.dryRun !== true) errors.push('plan_row_not_dry_run');

  if (!isDate(dayKey)) errors.push('invalid_or_missing_fixture_date');
  if (!isDate(localDate)) errors.push('invalid_or_missing_local_date');
  if (dayKey && localDate && dayKey !== localDate) errors.push('fixture_date_local_date_mismatch');
  if (!leagueSlug) errors.push('missing_league_slug');
  if (safeSlug(clean(fixture.leagueSlug)) !== clean(fixture.leagueSlug)) errors.push('unsafe_league_slug');
  if (!homeTeam) errors.push('missing_home_team');
  if (!awayTeam) errors.push('missing_away_team');
  if (homeTeam && awayTeam && homeTeam === awayTeam) errors.push('same_home_away_team');
  if (status !== 'PRE') errors.push('status_not_pre');
  if (!sourceUrl) errors.push('missing_source_url');
  if (!writeTarget) errors.push('missing_write_target');
  if (writeTarget && !isInsideRepo(writeTarget)) errors.push('write_target_outside_repo');
  if (writeTarget && !allowedWriteTarget(writeTarget, options)) errors.push('write_target_not_allowed');
  if (!normalizeSandboxRoot(options.sandboxOutputRoot) && clean(row?.writeTarget) !== expectedTarget) {
    errors.push('plan_write_target_does_not_match_expected_canonical_path');
  }
  if (
    writeTarget &&
    options.apply === true &&
    options.allowOverwriteCanonicalFixture !== true &&
    fs.existsSync(writeTarget)
  ) {
    errors.push('write_target_exists_requires_allow_overwrite_canonical_fixture');
  }

  return {
    index,
    planRowId: clean(row?.planRowId),
    dayKey,
    localDate,
    leagueSlug,
    homeTeam,
    awayTeam,
    localTime,
    status,
    sourceUrl,
    writeTarget,
    writeTargetRepoRelative: writeTarget ? repoRelative(writeTarget) : '',
    errors
  };
}

function canonicalFixtureFromPlanRow(row, validationRow, options) {
  const fixture = row.proposedCanonicalFixture || {};
  const sourceEvidence = row.sourceEvidence || {};

  const matchId = clean(fixture.matchId || fixture.id);
  const id = matchId || clean(fixture.id);

  return {
    id,
    matchId: matchId || id,
    date: validationRow.dayKey,
    dayKey: validationRow.dayKey,
    leagueSlug: validationRow.leagueSlug,
    leagueName: clean(fixture.leagueName),
    country: clean(fixture.country),
    homeTeam: validationRow.homeTeam,
    awayTeam: validationRow.awayTeam,
    localDate: validationRow.localDate,
    localTime: validationRow.localTime,
    kickoffUtc: clean(fixture.kickoffUtc),
    status: 'PRE',
    state: 'staging',
    source: 'verified-fixture-acquisition-promotion-plan',
    sourceProvider: clean(fixture.sourceProvider),
    sourceMatchId: clean(fixture.sourceMatchId),
    sourceUrl: validationRow.sourceUrl,
    sourceSnapshotId: clean(fixture.sourceSnapshotId),
    acquisitionState: 'verified_fixture_identity_canonicalized',
    extractionMethod: clean(fixture.extractionMethod),
    dateConfidence: clean(fixture.dateConfidence),
    sources: {
      verifiedFixtureAcquisition: {
        sourceProvider: clean(fixture.sourceProvider || sourceEvidence.provider),
        sourceUrl: validationRow.sourceUrl,
        sourceSnapshotId: clean(fixture.sourceSnapshotId || sourceEvidence.sourceSnapshotId),
        sourceMatchId: clean(fixture.sourceMatchId || sourceEvidence.sourceMatchId),
        validationInput: clean(sourceEvidence.validationInput),
        proposalInput: clean(sourceEvidence.proposalInput),
        promotionPlanRowId: validationRow.planRowId
      }
    },
    meta: {
      verifiedFixtureAcquisition: true,
      generatedBy: 'write-verified-fixture-acquisition-from-promotion-plan-file',
      inputPromotionPlan: options.inputPath ? repoRelative(options.inputPath) : null,
      sandboxWrite: Boolean(normalizeSandboxRoot(options.sandboxOutputRoot)),
      generatedAt: new Date().toISOString()
    },
    writeGuards: {
      fetch: false,
      urlFetch: false,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      finalResultWrites: false
    }
  };
}

function groupWritableRows(rows, validationRows, planErrors, options) {
  const groups = new Map();
  const blockedRows = [];

  rows.forEach((row, index) => {
    const validation = validationRows[index];
    const errors = [...validation.errors];

    if (planErrors.length) {
      errors.push(...planErrors.map((code) => `plan_error:${code}`));
    }

    if (errors.length) {
      blockedRows.push({
        index,
        planRowId: validation.planRowId || clean(row?.planRowId),
        leagueSlug: validation.leagueSlug || clean(row?.proposedCanonicalFixture?.leagueSlug),
        writeTarget: validation.writeTargetRepoRelative || clean(row?.writeTarget),
        errors
      });
      return;
    }

    const key = validation.writeTargetRepoRelative;
    if (!groups.has(key)) {
      groups.set(key, {
        writeTarget: validation.writeTarget,
        writeTargetRepoRelative: validation.writeTargetRepoRelative,
        dayKey: validation.dayKey,
        leagueSlug: validation.leagueSlug,
        rows: []
      });
    }

    groups.get(key).rows.push({
      index,
      planRowId: validation.planRowId,
      validation,
      sourceRow: row,
      fixture: canonicalFixtureFromPlanRow(row, validation, options)
    });
  });

  return {
    groups: [...groups.values()],
    blockedRows
  };
}

function buildCanonicalFixtureFile(group, options) {
  return {
    ok: true,
    schema: 'ai-matchlab.canonical-fixtures.v1',
    dayKey: group.dayKey,
    date: group.dayKey,
    leagueSlug: group.leagueSlug,
    source: 'verified-fixture-acquisition-promotion-plan',
    generatedAt: new Date().toISOString(),
    fixtures: group.rows.map((row) => row.fixture),
    meta: {
      generatedBy: 'write-verified-fixture-acquisition-from-promotion-plan-file',
      inputPromotionPlan: options.inputPath ? repoRelative(options.inputPath) : null,
      fixtureCount: group.rows.length,
      sandboxWrite: Boolean(normalizeSandboxRoot(options.sandboxOutputRoot))
    },
    guarantees: {
      fetch: false,
      urlFetch: false,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      finalResultWrites: false
    }
  };
}

function buildWriteReport(plan, options = {}) {
  const proposedRows = asArray(plan?.proposedCanonicalFixtureRows);
  const apply = options.apply === true;
  const allowProductionWrites = options.allowProductionWrites === true;
  const sandboxOutputRoot = normalizeSandboxRoot(options.sandboxOutputRoot);
  const mayWrite = apply && allowProductionWrites;

  const planErrors = validatePlanGuarantees(plan);
  const validationRows = proposedRows.map((row, index) => validatePlanRow(row, index, options));
  const grouped = groupWritableRows(proposedRows, validationRows, planErrors, options);

  const wouldWriteFiles = [];
  const writtenFiles = [];

  for (const group of grouped.groups) {
    const payload = buildCanonicalFixtureFile(group, options);
    const fileRow = {
      dayKey: group.dayKey,
      leagueSlug: group.leagueSlug,
      fixtureCount: group.rows.length,
      writeTarget: group.writeTargetRepoRelative,
      planRowIds: group.rows.map((row) => row.planRowId),
      fixtures: payload.fixtures
    };

    if (mayWrite) {
      writeJson(group.writeTarget, payload);
      writtenFiles.push({
        ...fileRow,
        fixtures: undefined
      });
    } else {
      wouldWriteFiles.push(fileRow);
    }
  }

  const productionCanonicalWrite = mayWrite && !sandboxOutputRoot;

  return {
    ok: planErrors.length === 0 && grouped.blockedRows.length === 0,
    stage: mayWrite
      ? 'verified_fixture_acquisition_write_completed'
      : 'verified_fixture_acquisition_write_dry_run_ready',
    generatedAt: new Date().toISOString(),
    input: options.inputPath ? repoRelative(options.inputPath) : null,
    mode: {
      apply,
      allowProductionWrites,
      dryRun: !mayWrite,
      sandboxOutputRoot: sandboxOutputRoot || null,
      allowOverwriteCanonicalFixture: options.allowOverwriteCanonicalFixture === true
    },
    summary: {
      proposedPlanRows: proposedRows.length,
      wouldWriteFiles: wouldWriteFiles.length,
      writtenFiles: writtenFiles.length,
      blockedRows: grouped.blockedRows.length,
      planErrors: planErrors.length,
      productionCanonicalWrites: productionCanonicalWrite ? writtenFiles.length : 0,
      sandboxWrites: mayWrite && sandboxOutputRoot ? writtenFiles.length : 0,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultWrites: 0
    },
    planErrors,
    blockedRows: grouped.blockedRows,
    wouldWriteFiles,
    writtenFiles,
    guarantees: {
      canonicalWrites: productionCanonicalWrite ? writtenFiles.length : 0,
      productionWrite: productionCanonicalWrite,
      dryRun: !mayWrite,
      sandboxWrite: mayWrite && Boolean(sandboxOutputRoot),
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      fetch: false,
      sourceFetch: false,
      urlFetch: false,
      noFetch: true,
      noUrlFetch: true,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultWrites: 0,
      productionRepair: false,
      allowOverwriteCanonicalFixture: options.allowOverwriteCanonicalFixture === true
    }
  };
}

function blockedApplyReport(inputPath, outputPath) {
  return {
    ok: false,
    stage: 'verified_fixture_acquisition_write_blocked',
    input: inputPath ? repoRelative(inputPath) : null,
    output: outputPath ? repoRelative(outputPath) : null,
    summary: {
      proposedPlanRows: 0,
      wouldWriteFiles: 0,
      writtenFiles: 0,
      blockedRows: 0,
      planErrors: 1,
      productionCanonicalWrites: 0,
      sandboxWrites: 0,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultWrites: 0
    },
    planErrors: ['apply_requires_allow_production_writes'],
    blockedRows: [],
    wouldWriteFiles: [],
    writtenFiles: [],
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      sandboxWrite: false,
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      fetch: false,
      sourceFetch: false,
      urlFetch: false,
      noFetch: true,
      noUrlFetch: true,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultWrites: 0,
      productionRepair: false
    }
  };
}

function runSelfTest() {
  const plan = {
    ok: true,
    mode: 'read_only_verified_fixture_acquisition_promotion_plan',
    dryRun: true,
    summary: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    proposedCanonicalFixtureRows: [
      {
        planRowId: '2026-05-22:test.1:1',
        dryRun: true,
        productionWrite: false,
        canonicalWrites: 0,
        writeTarget: 'data/canonical-fixtures/2026-05-22/test.1.json',
        proposedCanonicalFixture: {
          id: 'verified-test-1',
          matchId: 'verified-test-1',
          date: '2026-05-22',
          leagueSlug: 'test.1',
          leagueName: 'Test League',
          country: 'Testland',
          homeTeam: 'Alpha FC',
          awayTeam: 'Beta FC',
          localDate: '2026-05-22',
          localTime: '19:00',
          kickoffUtc: '2026-05-22T16:00:00.000Z',
          status: 'PRE',
          sourceProvider: 'self-test',
          sourceUrl: 'https://example.test/fixture',
          sourceSnapshotId: 'self-test-snapshot',
          sourceMatchId: 'self-test-match'
        },
        sourceEvidence: {
          provider: 'self-test',
          sourceUrl: 'https://example.test/fixture',
          sourceSnapshotId: 'self-test-snapshot',
          sourceMatchId: 'self-test-match'
        }
      }
    ]
  };

  const report = buildWriteReport(plan, {
    inputPath: 'self-test-promotion-plan.json',
    apply: false,
    allowProductionWrites: false,
    sandboxOutputRoot: 'data/canonical-fixtures/_sandbox-verified-fixture-acquisition',
    allowOverwriteCanonicalFixture: false
  });

  if (report.ok !== true) throw new Error('expected self-test report ok');
  if (report.summary.wouldWriteFiles !== 1) throw new Error('expected one would-write file');
  if (report.summary.writtenFiles !== 0) throw new Error('self-test must not write');
  if (report.guarantees.canonicalWrites !== 0) throw new Error('dry-run canonicalWrites must be zero');
  if (report.guarantees.productionWrite !== false) throw new Error('dry-run productionWrite must be false');

  console.log(JSON.stringify({
    ok: true,
    selfTest: 'write-verified-fixture-acquisition-from-promotion-plan-file',
    stage: report.stage,
    wouldWriteFiles: report.summary.wouldWriteFiles,
    writtenFiles: report.summary.writtenFiles,
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
    console.error('Usage: node engine-v1/jobs/write-verified-fixture-acquisition-from-promotion-plan-file.js --input <promotion-plan.json> --output <write-report.json> [--sandbox-output-root <repo-relative-root>] [--apply --allow-production-writes]');
    process.exit(2);
  }

  const inputPath = path.resolve(String(args.input));
  const outputPath = args.output
    ? path.resolve(String(args.output))
    : path.resolve(repoRoot, 'data/fixture-acquisition/_promotion-writes/verified-fixture-acquisition-write-report.json');

  const apply = args.apply === true;
  const allowProductionWrites = args['allow-production-writes'] === true;
  const sandboxOutputRoot = clean(args['sandbox-output-root']);
  const allowOverwriteCanonicalFixture = args['allow-overwrite-canonical-fixture'] === true;

  if (apply && !allowProductionWrites) {
    const blocked = blockedApplyReport(inputPath, outputPath);
    writeJson(outputPath, blocked);
    console.log(JSON.stringify(blocked, null, 2));
    process.exit(2);
  }

  const plan = readJson(inputPath);
  const report = buildWriteReport(plan, {
    inputPath,
    apply,
    allowProductionWrites,
    sandboxOutputRoot,
    allowOverwriteCanonicalFixture
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
    dryRun: report.guarantees.dryRun,
    sandboxWrite: report.guarantees.sandboxWrite
  }, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();