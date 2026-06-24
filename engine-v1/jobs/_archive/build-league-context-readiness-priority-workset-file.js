#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import os from 'node:os';
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

function clean(value) {
  return String(value || '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberValue(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function boolValue(value) {
  return value === true;
}

function recommendedNextJob(actionType) {
  if (actionType === 'resolve_final_truth_risk') {
    return 'run-final-result-truth-audit-workset-range.js / final-result review-pack chain';
  }
  if (actionType === 'add_or_rebuild_standings') {
    return 'build-standings-day.js / collect-standings.js / standings source repair';
  }
  if (actionType === 'repair_fixture_coverage') {
    return 'run-fixture-acquisition-chunk.js / sync-canonical-fixtures-to-json-db-day.js / coverage contract audit';
  }
  if (actionType === 'review_context_data_warning') {
    return 'build-league-context-completeness-inventory-range.js + canonical/standings coverage inspection';
  }
  if (actionType === 'candidate_for_context_integration') {
    return 'details/value V2 integration design after final truth and context checks';
  }
  return 'manual inspection';
}

function classifyAction(row) {
  const status = clean(row.readinessStatus);
  const valuePicks = numberValue(row.totalValuePicks);
  const finalTruthRiskRows = numberValue(row.finalTruthRiskRows);
  const fixtureCoverageRiskRows = numberValue(row.fixtureCoverageRiskRows);
  const snapshotFixtures = numberValue(row.totalSnapshotFixtures);
  const standingsRows = numberValue(row.standingsRows);
  const contextWarnings = numberValue(row.contextDataWarningRows);

  if (status === 'blocked_final_truth_risk' || finalTruthRiskRows > 0) {
    return {
      actionType: 'resolve_final_truth_risk',
      reason: 'league has final-truth risk rows; value/statistics should not trust settlement until verified FT exists'
    };
  }

  if (status === 'blocked_missing_standings' || (snapshotFixtures > 0 && standingsRows === 0)) {
    return {
      actionType: 'add_or_rebuild_standings',
      reason: 'league has fixtures but no usable standings; motivation context cannot be trusted'
    };
  }

  if (status === 'blocked_fixture_coverage_risk' || fixtureCoverageRiskRows > 0) {
    return {
      actionType: 'repair_fixture_coverage',
      reason: 'league has snapshot/canonical fixture coverage mismatch where canonical reference exists'
    };
  }

  if (status === 'ready_with_context_warnings' || contextWarnings > 0) {
    return {
      actionType: 'review_context_data_warning',
      reason: 'league has usable motivation output but missing context references or warnings remain'
    };
  }

  if (status === 'ready_for_context_integration') {
    return {
      actionType: 'candidate_for_context_integration',
      reason: 'league is clean enough for later Details/Value V2 context integration review'
    };
  }

  return {
    actionType: 'manual_inspection',
    reason: 'readiness status needs manual inspection'
  };
}

function priorityScore(row, actionType) {
  const valuePicks = numberValue(row.totalValuePicks);
  const fixtures = numberValue(row.totalSnapshotFixtures);
  const finalTruthRiskRows = numberValue(row.finalTruthRiskRows);
  const fixtureCoverageRiskRows = numberValue(row.fixtureCoverageRiskRows);
  const contextWarnings = numberValue(row.contextDataWarningRows);

  let score = 0;

  if (actionType === 'resolve_final_truth_risk') score += 100000;
  if (actionType === 'add_or_rebuild_standings') score += 70000;
  if (actionType === 'repair_fixture_coverage') score += 60000;
  if (actionType === 'review_context_data_warning') score += 30000;
  if (actionType === 'candidate_for_context_integration') score += 10000;

  score += valuePicks * 1000;
  score += finalTruthRiskRows * 500;
  score += fixtureCoverageRiskRows * 350;
  score += fixtures * 20;
  score += contextWarnings * 5;

  return score;
}

function priorityBand(score) {
  if (score >= 100000) return 'high';
  if (score >= 70000) return 'medium_high';
  if (score >= 30000) return 'medium';
  return 'normal';
}

function buildWorkset(report, inputPath) {
  const rows = [];

  for (const row of asArray(report.rows)) {
    const leagueSlug = clean(row.leagueSlug);
    if (!leagueSlug) continue;

    const action = classifyAction(row);
    const score = priorityScore(row, action.actionType);

    rows.push({
      priorityScore: score,
      priorityBand: priorityBand(score),
      actionType: action.actionType,
      leagueSlug,
      readinessStatus: clean(row.readinessStatus),
      reason: action.reason,
      recommendedNextJob: recommendedNextJob(action.actionType),

      totalSnapshotFixtures: numberValue(row.totalSnapshotFixtures),
      totalCanonicalFixtures: numberValue(row.totalCanonicalFixtures),
      totalValuePicks: numberValue(row.totalValuePicks),

      finalTruthRiskRows: numberValue(row.finalTruthRiskRows),
      fixtureCoverageRiskRows: numberValue(row.fixtureCoverageRiskRows),
      contextDataWarningRows: numberValue(row.contextDataWarningRows),

      standingsRows: numberValue(row.standingsRows),
      motivationPossibleRows: numberValue(row.motivationPossibleRows),
      motivationOutputAvailable: boolValue(row.motivationOutputAvailable),
      motivationTeamCount: numberValue(row.motivationTeamCount),
      motivationSeasonPhase: clean(row.motivationSeasonPhase),
      motivationMotivatedTeams: numberValue(row.motivationMotivatedTeams),
      motivationHighMotivationTeams: numberValue(row.motivationHighMotivationTeams),

      profileType: clean(row.profileType),
      hasRelegationPressure: row.hasRelegationPressure,
      hasContinentalPressure: row.hasContinentalPressure,
      hasPlayoffPressure: row.hasPlayoffPressure,

      fixtureCoverageRiskReasons: asArray(row.fixtureCoverageRiskReasons),
      contextDataWarningReasons: asArray(row.contextDataWarningReasons),
      finalTruthRiskReasons: asArray(row.finalTruthRiskReasons)
    });
  }

  rows.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (b.totalValuePicks !== a.totalValuePicks) return b.totalValuePicks - a.totalValuePicks;
    return a.leagueSlug.localeCompare(b.leagueSlug);
  });

  rows.forEach((row, index) => {
    row.priorityRank = index + 1;
  });

  const byActionType = {};
  const byPriorityBand = {};
  const byReadinessStatus = {};

  for (const row of rows) {
    byActionType[row.actionType] = (byActionType[row.actionType] || 0) + 1;
    byPriorityBand[row.priorityBand] = (byPriorityBand[row.priorityBand] || 0) + 1;
    byReadinessStatus[row.readinessStatus] = (byReadinessStatus[row.readinessStatus] || 0) + 1;
  }

  return {
    ok: true,
    stage: 'league_context_readiness_priority_workset_ready',
    generatedAt: new Date().toISOString(),
    inputPath,
    sourceStage: clean(report.stage),
    from: clean(report.from),
    to: clean(report.to),
    guarantees: {
      canonicalWrites: 0,
      fetch: false,
      productionFinalTruthDecision: false,
      canonicalPromotion: false,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    },
    summary: {
      totalRows: rows.length,
      highPriorityRows: rows.filter((row) => row.priorityBand === 'high').length,
      mediumHighPriorityRows: rows.filter((row) => row.priorityBand === 'medium_high').length,
      mediumPriorityRows: rows.filter((row) => row.priorityBand === 'medium').length,
      normalPriorityRows: rows.filter((row) => row.priorityBand === 'normal').length,
      finalTruthActionRows: rows.filter((row) => row.actionType === 'resolve_final_truth_risk').length,
      standingsActionRows: rows.filter((row) => row.actionType === 'add_or_rebuild_standings').length,
      fixtureCoverageActionRows: rows.filter((row) => row.actionType === 'repair_fixture_coverage').length,
      contextWarningActionRows: rows.filter((row) => row.actionType === 'review_context_data_warning').length,
      integrationCandidateRows: rows.filter((row) => row.actionType === 'candidate_for_context_integration').length,
      totalValuePicksImpacted: rows.reduce((sum, row) => sum + row.totalValuePicks, 0),
      byActionType,
      byPriorityBand,
      byReadinessStatus
    },
    rows
  };
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiml-league-context-workset-'));

  try {
    const inputPath = path.join(tempRoot, 'readiness.json');

    writeJson(inputPath, {
      ok: true,
      stage: 'league_context_motivation_readiness_report_ready',
      from: '2026-05-18',
      to: '2026-05-18',
      rows: [
        {
          leagueSlug: 'truth.1',
          readinessStatus: 'blocked_final_truth_risk',
          totalSnapshotFixtures: 12,
          totalCanonicalFixtures: 12,
          totalValuePicks: 6,
          finalTruthRiskRows: 3,
          fixtureCoverageRiskRows: 0,
          contextDataWarningRows: 0,
          standingsRows: 1,
          motivationPossibleRows: 1,
          motivationOutputAvailable: true,
          finalTruthRiskReasons: ['score_present_without_final_status']
        },
        {
          leagueSlug: 'standings.1',
          readinessStatus: 'blocked_missing_standings',
          totalSnapshotFixtures: 8,
          totalCanonicalFixtures: 8,
          totalValuePicks: 3,
          finalTruthRiskRows: 0,
          fixtureCoverageRiskRows: 0,
          contextDataWarningRows: 1,
          standingsRows: 0,
          motivationPossibleRows: 0,
          motivationOutputAvailable: false,
          contextDataWarningReasons: ['standings_missing']
        },
        {
          leagueSlug: 'coverage.1',
          readinessStatus: 'blocked_fixture_coverage_risk',
          totalSnapshotFixtures: 0,
          totalCanonicalFixtures: 5,
          totalValuePicks: 0,
          finalTruthRiskRows: 0,
          fixtureCoverageRiskRows: 1,
          contextDataWarningRows: 0,
          standingsRows: 1,
          motivationPossibleRows: 0,
          motivationOutputAvailable: false,
          fixtureCoverageRiskReasons: ['snapshot_missing_but_canonical_has_fixtures']
        },
        {
          leagueSlug: 'warning.1',
          readinessStatus: 'ready_with_context_warnings',
          totalSnapshotFixtures: 10,
          totalCanonicalFixtures: 0,
          totalValuePicks: 2,
          finalTruthRiskRows: 0,
          fixtureCoverageRiskRows: 0,
          contextDataWarningRows: 1,
          standingsRows: 1,
          motivationPossibleRows: 1,
          motivationOutputAvailable: true,
          contextDataWarningReasons: ['canonical_reference_missing_for_snapshot_league']
        }
      ]
    });

    const report = buildWorkset(readJson(inputPath), inputPath);

    if (report.summary.totalRows !== 4) throw new Error('expected 4 workset rows');
    if (report.rows[0].actionType !== 'resolve_final_truth_risk') throw new Error('expected final truth first');
    if (report.summary.finalTruthActionRows !== 1) throw new Error('expected 1 final truth action row');
    if (report.summary.standingsActionRows !== 1) throw new Error('expected 1 standings action row');
    if (report.summary.fixtureCoverageActionRows !== 1) throw new Error('expected 1 fixture coverage action row');
    if (report.summary.contextWarningActionRows !== 1) throw new Error('expected 1 context warning action row');
    if (report.guarantees.canonicalWrites !== 0) throw new Error('canonicalWrites guarantee failed');
    if (report.guarantees.fetch !== false) throw new Error('fetch guarantee failed');

    console.log(JSON.stringify({
      ok: true,
      selfTest: 'build-league-context-readiness-priority-workset-file',
      totalRows: report.summary.totalRows,
      firstActionType: report.rows[0].actionType,
      finalTruthActionRows: report.summary.finalTruthActionRows,
      standingsActionRows: report.summary.standingsActionRows,
      fixtureCoverageActionRows: report.summary.fixtureCoverageActionRows,
      contextWarningActionRows: report.summary.contextWarningActionRows,
      canonicalWrites: report.guarantees.canonicalWrites,
      fetch: report.guarantees.fetch
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

  if (!args.input) throw new Error('Missing required --input <league-context-motivation-readiness-report.json>');

  const inputPath = args.input;
  const report = buildWorkset(readJson(inputPath), inputPath);
  const outputPath = args.output || path.join(path.dirname(inputPath), 'league-context-readiness-priority-workset.json');

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    input: inputPath,
    output: outputPath,
    summary: report.summary,
    canonicalWrites: report.guarantees.canonicalWrites,
    fetch: report.guarantees.fetch,
    productionFinalTruthDecision: report.guarantees.productionFinalTruthDecision,
    canonicalPromotion: report.guarantees.canonicalPromotion
  }, null, 2));
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
  main();
}

export {
  buildWorkset,
  classifyAction,
  priorityScore
};