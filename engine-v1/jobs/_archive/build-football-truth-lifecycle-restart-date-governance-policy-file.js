import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const sportomediaPlanPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-proof-plan-${today}`, `sportomedia-sef-current-active-restart-proof-plan-${today}.json`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `lifecycle-restart-date-governance-policy-${today}`);
const outputPath = path.join(outputDir, `lifecycle-restart-date-governance-policy-${today}.json`);
const rowsOutputPath = path.join(outputDir, `lifecycle-restart-date-governance-policy-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

await fs.mkdir(outputDir, { recursive: true });

const blocks = [];

const sportomediaPlan = JSON.parse(await fs.readFile(sportomediaPlanPath, "utf8"));
if (sportomediaPlan.status !== "passed") blocks.push("sportomedia_current_active_restart_plan_not_passed");
if (sportomediaPlan.summary?.currentActiveFollowupRequired !== true) blocks.push("sportomedia_plan_missing_current_active_followup");
if (sportomediaPlan.summary?.restartDateRequired !== true) blocks.push("sportomedia_plan_missing_restart_date_required");

const requiredSportomediaLanes = [
  "current_active_season_standings",
  "current_active_season_fixtures_or_matchdays",
  "restart_date_after_world_cup_break"
];

for (const lane of requiredSportomediaLanes) {
  if (!(sportomediaPlan.summary?.requiredProofLanes || []).includes(lane)) blocks.push(`sportomedia_plan_missing_lane_${lane}`);
}

const lifecyclePolicyRows = [
  {
    lifecycleState: "previous_completed_or_offseason",
    appliesTo: "all_competitions_all_source_families",
    requiredDateField: "nextSeasonStartDate",
    requiredEvidenceLane: "next_season_start_date",
    fixturePollingMode: "suppress_daily_fixture_search_until_not_before_date",
    notBeforeDatePolicy: "nextSeasonStartDate_minus_lookaheadDays",
    lookaheadDays: 7,
    allowedBeforeNotBeforeDate: [
      "bounded_start_date_evidence_refresh_if_start_date_unknown_or_stale",
      "no_general_daily_fixture_search"
    ],
    reason: "When a league has completed its season, daily fixture scraping is wasteful until the next season start window."
  },
  {
    lifecycleState: "current_active_in_scheduled_break",
    appliesTo: "all_competitions_all_source_families",
    requiredDateField: "restartDate",
    requiredEvidenceLane: "restart_date_after_break",
    fixturePollingMode: "suppress_daily_fixture_search_until_not_before_date",
    notBeforeDatePolicy: "restartDate_minus_lookaheadDays",
    lookaheadDays: 7,
    allowedBeforeNotBeforeDate: [
      "bounded_restart_date_evidence_refresh_if_restart_date_unknown_or_stale",
      "no_general_daily_fixture_search"
    ],
    reason: "When a league is active but paused, the system must know the resumption date and avoid daily fixture searches during the break."
  },
  {
    lifecycleState: "current_active_suspended_or_postponed",
    appliesTo: "all_competitions_all_source_families",
    requiredDateField: "restartDate_or_rescheduledFixtureDate",
    requiredEvidenceLane: "restart_or_reschedule_date",
    fixturePollingMode: "suppress_daily_fixture_search_until_not_before_date",
    notBeforeDatePolicy: "restartDate_or_rescheduledFixtureDate_minus_lookaheadDays",
    lookaheadDays: 7,
    allowedBeforeNotBeforeDate: [
      "bounded_official_resumption_evidence_refresh",
      "no_general_daily_fixture_search"
    ],
    reason: "Suspensions and postponements need resumption evidence, not repeated broad fixture probing."
  },
  {
    lifecycleState: "current_active_playing",
    appliesTo: "all_competitions_all_source_families",
    requiredDateField: "nextFixtureDate_or_currentMatchdayWindow",
    requiredEvidenceLane: "current_fixture_or_matchday_evidence",
    fixturePollingMode: "allow_scheduled_fixture_refresh_inside_active_window",
    notBeforeDatePolicy: "daily_or_matchday_refresh_allowed_only_when_competition_is_not_in_break",
    lookaheadDays: 0,
    allowedBeforeNotBeforeDate: [
      "standings_refresh",
      "fixture_refresh",
      "result_refresh"
    ],
    reason: "Daily fixture/result refresh is only justified while the competition is actually active or inside a matchday window."
  },
  {
    lifecycleState: "season_completed",
    appliesTo: "all_competitions_all_source_families",
    requiredDateField: "nextSeasonStartDate",
    requiredEvidenceLane: "next_season_start_date",
    fixturePollingMode: "transition_to_previous_completed_or_offseason_and_suppress_daily_fixture_search",
    notBeforeDatePolicy: "nextSeasonStartDate_minus_lookaheadDays",
    lookaheadDays: 7,
    allowedBeforeNotBeforeDate: [
      "previous_completed_standings_proof",
      "next_season_start_date_evidence"
    ],
    reason: "A completed season should move to historical proof plus next-start scheduling, not daily fixture discovery."
  },
  {
    lifecycleState: "unknown_or_unclassified",
    appliesTo: "all_competitions_all_source_families",
    requiredDateField: "lifecycleStateEvidenceDate",
    requiredEvidenceLane: "lifecycle_classification",
    fixturePollingMode: "block_general_daily_fixture_search_until_lifecycle_classified",
    notBeforeDatePolicy: "classification_required_before_fixture_polling",
    lookaheadDays: null,
    allowedBeforeNotBeforeDate: [
      "bounded_lifecycle_classification",
      "bounded_start_or_restart_date_evidence_search"
    ],
    reason: "Unknown lifecycle state must be classified before the scheduler is allowed to spend daily fixture budget."
  }
];

const invariantRows = [
  {
    invariant: "no_daily_fixture_search_when_known_future_start_or_restart_is_outside_lookahead_window",
    appliesTo: "all_competitions_all_source_families",
    severity: "hard_block",
    requiredSchedulerFields: [
      "lifecycleState",
      "dateFieldType",
      "dateFieldValue",
      "nextFixturePollNotBefore",
      "evidenceSource",
      "evidenceFetchedAt",
      "stalenessPolicy"
    ],
    schedulerEffect: "fixture_polling_suppressed_until_nextFixturePollNotBefore",
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false
  },
  {
    invariant: "if_restart_or_start_date_unknown_do_not_run_general_daily_fixture_search",
    appliesTo: "all_competitions_all_source_families",
    severity: "hard_block",
    requiredSchedulerFields: [
      "lifecycleState",
      "missingDateReason",
      "nextBoundedEvidenceRefreshAt"
    ],
    schedulerEffect: "run_only_bounded_start_or_restart_date_evidence_lane",
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false
  },
  {
    invariant: "current_active_break_requires_restart_date_even_if_previous_completed_candidate_exists",
    appliesTo: "all_competitions_all_source_families",
    severity: "hard_block",
    requiredSchedulerFields: [
      "currentSeasonLabel",
      "breakType",
      "restartDate",
      "restartDateEvidence"
    ],
    schedulerEffect: "do_not_mark_current_active_lane_satisfied_without_restart_date",
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false
  }
];

const sportomediaExampleRows = (sportomediaPlan.rows || []).map(row => ({
  slug: row.slug,
  league: row.league,
  sourceFamily: row.sourceFamily,
  currentSeasonScope: row.currentSeasonScope,
  currentSeasonLabel: row.currentSeasonLabel,
  requiredProofLanes: row.requiredProofLanes,
  restartDateRequired: row.restartDateRequired,
  plannedGraphqlOperations: row.plannedGraphqlOperations,
  globalPolicyMapping: {
    lifecycleState: "current_active_in_scheduled_break",
    requiredDateField: "restartDate",
    fixturePollingMode: "suppress_daily_fixture_search_until_not_before_date",
    nextFixturePollNotBeforePolicy: "restartDate_minus_lookaheadDays"
  }
}));

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "lifecycle_restart_date_governance_policy",
  contractVersion: 1,
  scope: "global_all_competitions_all_source_families",
  purpose: "Global scheduler governance policy: competitions that are completed, off-season, paused, suspended, postponed, or in a scheduled break must carry next start/restart evidence so daily fixture searches are suppressed until a justified not-before date.",
  output: rel(outputPath),
  rowsOutput: rel(rowsOutputPath),
  inputs: {
    sportomediaCurrentActiveRestartPlanPath: rel(sportomediaPlanPath),
    sportomediaCurrentActiveRestartPlanSha256: await sha256(sportomediaPlanPath)
  },
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: 0,
    fixtureFetchExecutedNowCount: 0,
    restartDateFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    schedulerWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    appliesToAllLeagues: true,
    appliesToAllSourceFamilies: true,
    lifecyclePolicyRowCount: lifecyclePolicyRows.length,
    invariantRowCount: invariantRows.length,
    defaultLookaheadDaysBeforeStartOrRestart: 7,
    dailyFixtureSearchSuppressionRequired: true,
    knownFutureStartOrRestartSuppressesDailyFixtureSearch: true,
    unknownStartOrRestartAllowsOnlyBoundedEvidenceRefresh: true,
    currentActiveBreakRequiresRestartDate: true,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    acceptedNowCount: 0,
    sportomediaExampleTargetSlugs: sportomediaExampleRows.map(row => row.slug),
    recommendedNextLane: "build scheduler/lifecycle candidate fields so every league stores nextSeasonStartDate or restartDate and nextFixturePollNotBefore"
  },
  lifecyclePolicyRows,
  invariantRows,
  sportomediaExampleRows,
  blocks
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const rows = [
  ...lifecyclePolicyRows.map(row => ({ rowType: "lifecycle_policy", ...row })),
  ...invariantRows.map(row => ({ rowType: "invariant", ...row })),
  ...sportomediaExampleRows.map(row => ({ rowType: "sportomedia_current_active_example", ...row }))
];

await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  lifecycleStates: lifecyclePolicyRows.map(row => ({
    lifecycleState: row.lifecycleState,
    requiredDateField: row.requiredDateField,
    fixturePollingMode: row.fixturePollingMode,
    notBeforeDatePolicy: row.notBeforeDatePolicy,
    lookaheadDays: row.lookaheadDays
  })),
  invariants: invariantRows.map(row => ({
    invariant: row.invariant,
    severity: row.severity,
    schedulerEffect: row.schedulerEffect
  })),
  sportomediaExampleRows,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
