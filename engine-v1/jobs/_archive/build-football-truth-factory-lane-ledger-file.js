import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-factory-lane-ledger-${today}`);
const ledgerPath = path.join(outDir, `football-truth-factory-lane-ledger-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-factory-lane-ledger-rows-${today}.jsonl`);
const groupsPath = path.join(outDir, `football-truth-factory-lane-ledger-groups-${today}.json`);

const paths = {
  batch3RouteDiscoveryVerification: path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-controlled-official-route-discovery-verification-${today}`, `bulk-batch3-controlled-official-route-discovery-verification-${today}.json`),
  batch3IdentitySurfaceVerification: path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-route-candidate-identity-surface-probe-verification-${today}`, `bulk-batch3-route-candidate-identity-surface-probe-verification-${today}.json`),
  batch3IdentitySurfaceRows: path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-route-candidate-identity-surface-probe-${today}`, `bulk-batch3-route-candidate-identity-surface-probe-rows-${today}.jsonl`),
  batch3ExtractionVerification: path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-html-table-extraction-probe-verification-${today}`, `bulk-batch3-html-table-extraction-probe-verification-${today}.json`),
  batch3ExtractionRows: path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-html-table-extraction-probe-${today}`, `bulk-batch3-html-table-extraction-probe-rows-${today}.jsonl`),
  zeroPlayedStartDateVerification: path.join(root, "data", "football-truth", "_diagnostics", `zero-played-start-date-evidence-diagnostic-verification-${today}`, `zero-played-start-date-evidence-diagnostic-verification-${today}.json`)
};

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}

async function readJsonl(file) {
  try {
    const text = await fs.readFile(file, "utf8");
    return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function sorted(values) {
  return uniq(values).sort((a, b) => a.localeCompare(b));
}

await fs.mkdir(outDir, { recursive: true });

const acceptanceContract = {
  contractVersion: 1,
  purpose: "single factory ledger for mass league classification, rejections, precision controls, and next lanes",
  hardGuardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    routeClaimMadeNowCount: 0,
    familyClaimMadeNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  countableCoverageRules: {
    previousCompletedVerifiedProof: "countable only after source identity, season scope, row count, arithmetic, duplicate, and table-shape proof have passed",
    currentRestartSchedulerCandidate: "not production truth; useful scheduler candidate only after explicit lifecycle review",
    routeCandidate: "never count as coverage",
    identitySurfacePassed: "never count as coverage",
    extractionProofShapePassed: "not countable until season identity/lifecycle review and explicit candidate-write approval",
    zeroPlayedTable: "not countable as active/current coverage until governed start date is found",
    renderedOrApiRequired: "not countable until rendered/API extraction proof passes",
    reviewOrNotFound: "not countable"
  },
  precisionThresholds: {
    officialHostRequired: true,
    noChallengePageRequired: true,
    htmlTableNonzeroProof: {
      minStandingRows: 8,
      duplicateTeamNameCount: 0,
      minArithmeticPassRate: 0.70,
      maxPlayedMustBeGreaterThanZero: true,
      seasonIdentityReviewStillRequired: true
    },
    htmlTableZeroPlayedProof: {
      minStandingRows: 8,
      duplicateTeamNameCount: 0,
      allRowsZeroPlayed: true,
      startDateGovernanceStillRequired: true
    },
    immediateRejectionOrReviewReasons: [
      "wrong host",
      "challenge/access page",
      "fixture-only table",
      "same source/table collision across different target slugs",
      "arithmetic failure",
      "duplicate teams",
      "no season label or lifecycle context",
      "not enough rows",
      "rendered/API-only surface",
      "identity too weak"
    ]
  }
};

const previousCompletedVerifiedProof = [
  "esp.1", "esp.2", "ger.1", "ger.2", "ger.3", "cro.1", "sco.1", "sco.2", "ned.1", "den.1", "jpn.1", "eng.1",
  "swe.1", "swe.2"
];

const currentRestartSchedulerCandidate = ["swe.1", "swe.2"];
const reviewOnlyCandidateEligibleAfterExplicitApproval = ["ksa.1"];
const knownBlockedOrAvoidBlindRetry = ["ita.1", "nor.2", "cyp.2"];

const batch3RouteDiscoveryVerification = await readJson(paths.batch3RouteDiscoveryVerification, {});
const batch3IdentitySurfaceVerification = await readJson(paths.batch3IdentitySurfaceVerification, {});
const batch3IdentitySurfaceRows = await readJsonl(paths.batch3IdentitySurfaceRows);
const batch3ExtractionVerification = await readJson(paths.batch3ExtractionVerification, {});
const batch3ExtractionRows = await readJsonl(paths.batch3ExtractionRows);
const zeroPlayedStartDateVerification = await readJson(paths.zeroPlayedStartDateVerification, {});

const blocks = [];
for (const [key, file] of Object.entries(paths)) {
  if (!(await fs.stat(file).catch(() => null))) blocks.push(`missing_input_${key}`);
}
if (batch3RouteDiscoveryVerification.status !== "passed") blocks.push("batch3_route_discovery_verification_not_passed");
if (batch3IdentitySurfaceVerification.status !== "passed") blocks.push("batch3_identity_surface_verification_not_passed");
if (batch3ExtractionVerification.status !== "passed") blocks.push("batch3_extraction_verification_not_passed");
if (zeroPlayedStartDateVerification.status !== "passed") blocks.push("zero_played_start_date_verification_not_passed");

const extractionBySlug = new Map(batch3ExtractionRows.map(row => [row.slug, row]));
const identityBySlug = new Map(batch3IdentitySurfaceRows.map(row => [row.slug, row]));

const collisionBuckets = new Map();
for (const row of batch3ExtractionRows) {
  const standingKey = shaText(JSON.stringify((row.standingsRows || []).map(item => ({
    teamName: item.teamName,
    played: item.played,
    wins: item.wins,
    draws: item.draws,
    losses: item.losses,
    points: item.points
  }))));
  const key = `${row.finalUrl || row.sourceFinalUrl || ""}|${standingKey}`;
  if (!collisionBuckets.has(key)) collisionBuckets.set(key, []);
  collisionBuckets.get(key).push(row.slug);
}
const sameSourceSameRowsCollisionGroups = [...collisionBuckets.values()].filter(group => group.length > 1).map(group => sorted(group));
const collisionSlugs = new Set(sameSourceSameRowsCollisionGroups.flat());

const verified = {
  previousCompletedVerifiedProofSlugs: previousCompletedVerifiedProof,
  currentRestartSchedulerCandidateSlugs: currentRestartSchedulerCandidate,
  reviewOnlyCandidateEligibleAfterExplicitApprovalSlugs: reviewOnlyCandidateEligibleAfterExplicitApproval,
  zeroPlayedStartDateMissingSlugs: sorted(zeroPlayedStartDateVerification.verified?.noCandidateSlugs || []),
  batch3RoutePassedCandidateSlugs: sorted(batch3RouteDiscoveryVerification.verified?.passedSlugs || []),
  batch3RouteNeedsReviewSlugs: sorted(batch3RouteDiscoveryVerification.verified?.needsReviewSlugs || []),
  batch3RouteNotFoundSlugs: sorted(batch3RouteDiscoveryVerification.verified?.notFoundSlugs || []),
  batch3HtmlTableExtractionProbeReadySlugs: sorted(batch3IdentitySurfaceVerification.verified?.htmlTableExtractionProbeReadySlugs || []),
  batch3RenderedOrApiRequiredSlugs: sorted(batch3IdentitySurfaceVerification.verified?.renderedOrApiRequiredSlugs || []),
  batch3HtmlTableReviewRequiredSlugs: sorted(batch3IdentitySurfaceVerification.verified?.htmlTableReviewRequiredSlugs || []),
  batch3IdentityReviewRequiredSlugs: sorted(batch3IdentitySurfaceVerification.verified?.identityReviewRequiredSlugs || []),
  batch3ProofShapePassedNonzeroNeedsSeasonReviewSlugs: sorted(batch3ExtractionVerification.verified?.proofShapePassedNonzeroSlugs || []),
  batch3ProofShapePassedZeroPlayedSlugs: sorted(batch3ExtractionVerification.verified?.proofShapePassedZeroPlayedSlugs || []),
  batch3ExtractionReviewRequiredSlugs: sorted(batch3ExtractionVerification.verified?.extractionReviewRequiredSlugs || []),
  batch3NoExtractableTableSlugs: sorted(batch3ExtractionVerification.verified?.noExtractableTableSlugs || []),
  sameSourceSameRowsCollisionGroups,
  sameSourceSameRowsCollisionSlugs: sorted([...collisionSlugs]),
  knownBlockedOrAvoidBlindRetrySlugs: knownBlockedOrAvoidBlindRetry
};

const laneRows = [];
const bySlug = new Map();

function addLane(slug, laneGroup, completionLevel, countableCoverageNow, nextAction, evidence = {}, riskFlags = []) {
  const existing = bySlug.get(slug);
  const row = existing || {
    slug,
    laneGroups: [],
    completionLevel,
    countableCoverageNow: false,
    nextActions: [],
    evidence: {},
    riskFlags: [],
    precisionStatus: "not_evaluated"
  };

  row.laneGroups = uniq([...row.laneGroups, laneGroup]);
  row.countableCoverageNow = row.countableCoverageNow || Boolean(countableCoverageNow);
  row.nextActions = uniq([...row.nextActions, nextAction]);
  row.evidence = { ...row.evidence, ...evidence };
  row.riskFlags = uniq([...row.riskFlags, ...riskFlags]);

  if (countableCoverageNow) row.precisionStatus = "countable_verified_proof";
  else if (riskFlags.length > 0) row.precisionStatus = "blocked_or_review_required";
  else if (laneGroup.includes("proof_shape")) row.precisionStatus = "proof_shape_only_needs_review";
  else if (laneGroup.includes("rendered_or_api")) row.precisionStatus = "needs_rendered_or_api_extraction";
  else if (laneGroup.includes("review")) row.precisionStatus = "review_required";
  else if (laneGroup.includes("not_found") || laneGroup.includes("blocked")) row.precisionStatus = "park_or_discover_later";

  if (!existing) {
    bySlug.set(slug, row);
    laneRows.push(row);
  }
}

for (const slug of previousCompletedVerifiedProof) {
  addLane(slug, "previous_completed_verified_proof", "complete_proof", true, "no immediate action; keep in coverage ledger", {
    source: slug.startsWith("swe.") ? "sportomedia_sef_previous_completed_verified" : "prior_verified_browser_or_official_standings_baseline"
  });
}

for (const slug of currentRestartSchedulerCandidate) {
  addLane(slug, "current_restart_scheduler_candidate", "scheduler_candidate", false, "review-only lifecycle/scheduler candidate, not production truth", {
    source: "sportomedia_current_active_restart_candidate"
  });
}

for (const slug of reviewOnlyCandidateEligibleAfterExplicitApproval) {
  addLane(slug, "review_only_candidate_eligible_after_explicit_approval", "proof_shape_complete_needs_approval", false, "season/lifecycle approval then explicit review-only candidate write approval", {
    source: "generic_standings_extraction_proof_and_approval_board",
    knownStartDate: "2026-08-13"
  });
}

for (const slug of verified.zeroPlayedStartDateMissingSlugs) {
  addLane(slug, "zero_played_table_start_date_missing", "zero_played_proof_needs_lifecycle", false, "bounded official start-date evidence refresh only", {
    source: "zero_played_start_date_evidence_diagnostic_verified"
  }, ["not_countable_until_governed_start_date"]);
}

for (const slug of verified.batch3ProofShapePassedNonzeroNeedsSeasonReviewSlugs) {
  const row = extractionBySlug.get(slug);
  addLane(slug, "batch3_proof_shape_passed_nonzero_needs_season_review", "proof_shape_nonzero_needs_review", false, "season identity + league identity + lifecycle review before any candidate write", {
    source: "batch3_html_table_extraction_probe",
    extractedStandingRowCount: row?.extractedStandingRowCount,
    arithmeticPassedRowCount: row?.arithmeticPassedRowCount,
    arithmeticFailedRowCount: row?.arithmeticFailedRowCount,
    duplicateTeamNameCount: row?.duplicateTeamNameCount,
    minPlayed: row?.minPlayed,
    maxPlayed: row?.maxPlayed,
    title: row?.title,
    finalUrl: row?.finalUrl
  }, collisionSlugs.has(slug) ? ["same_source_same_extracted_rows_collision", "league_identity_must_be_resolved"] : ["season_identity_required"]);
}

for (const slug of verified.batch3ExtractionReviewRequiredSlugs) {
  const row = extractionBySlug.get(slug);
  const flags = [];
  if (collisionSlugs.has(slug)) flags.push("same_source_same_extracted_rows_collision");
  if ((row?.arithmeticFailedRowCount || 0) > 0) flags.push("arithmetic_or_fixture_table_failure");
  if ((row?.maxPlayed ?? 1) === 0) flags.push("zero_played_or_incomplete_table_review");
  if ((row?.extractedStandingRowCount || 0) < 8) flags.push("too_few_rows_for_generic_acceptance");
  addLane(slug, "batch3_html_extraction_review_required", "extraction_review_required", false, "custom parser or manual table identity review; do not count", {
    source: "batch3_html_table_extraction_probe",
    extractedStandingRowCount: row?.extractedStandingRowCount,
    arithmeticPassedRowCount: row?.arithmeticPassedRowCount,
    arithmeticFailedRowCount: row?.arithmeticFailedRowCount,
    duplicateTeamNameCount: row?.duplicateTeamNameCount,
    minPlayed: row?.minPlayed,
    maxPlayed: row?.maxPlayed,
    title: row?.title,
    finalUrl: row?.finalUrl
  }, flags);
}

for (const slug of verified.batch3NoExtractableTableSlugs) {
  addLane(slug, "batch3_no_extractable_table_found", "no_extractable_table", false, "park from generic HTML table lane; try rendered/API only if high value", {
    source: "batch3_html_table_extraction_probe"
  }, ["no_generic_html_standings_rows"]);
}

for (const slug of verified.batch3RenderedOrApiRequiredSlugs) {
  if (bySlug.has(slug)) continue;
  const row = identityBySlug.get(slug);
  addLane(slug, "batch3_rendered_or_api_required", "surface_found_needs_rendered_or_api", false, "bulk rendered/API planning by host family; do not hand-probe league by league", {
    source: "batch3_identity_surface_probe",
    identitySurfaceStatus: row?.identitySurfaceStatus,
    finalUrl: row?.finalUrl,
    title: row?.title,
    standingHintCount: row?.standingHintCount,
    tableCount: row?.tableCount,
    trCount: row?.trCount
  }, ["not_countable_until_rendered_or_api_extraction"]);
}

for (const slug of verified.batch3HtmlTableReviewRequiredSlugs) {
  if (bySlug.has(slug)) continue;
  const row = identityBySlug.get(slug);
  addLane(slug, "batch3_html_table_surface_review_required", "surface_review_required", false, "table exists but generic extraction not yet allowed; review/custom parser lane", {
    source: "batch3_identity_surface_probe",
    identitySurfaceStatus: row?.identitySurfaceStatus,
    finalUrl: row?.finalUrl,
    title: row?.title,
    tableCount: row?.tableCount,
    trCount: row?.trCount
  }, ["html_table_shape_not_yet_generic_ready"]);
}

for (const slug of verified.batch3IdentityReviewRequiredSlugs) {
  addLane(slug, "batch3_identity_surface_review_required", "identity_review_required", false, "identity/surface review before further work", {
    source: "batch3_identity_surface_probe"
  }, ["identity_too_weak"]);
}

for (const slug of verified.batch3RouteNeedsReviewSlugs) {
  if (bySlug.has(slug)) continue;
  addLane(slug, "batch3_route_candidate_needs_review", "route_review_required", false, "route candidate review; do not fetch repeatedly without better route spec", {
    source: "batch3_controlled_route_discovery"
  }, ["route_discovery_not_precise_enough"]);
}

for (const slug of verified.batch3RouteNotFoundSlugs) {
  addLane(slug, "batch3_route_not_found_or_blocked", "not_found_in_controlled_lane", false, "park unless high value; use bounded search only by approval", {
    source: "batch3_controlled_route_discovery"
  }, ["not_found_or_challenge_in_controlled_lane"]);
}

for (const slug of knownBlockedOrAvoidBlindRetry) {
  addLane(slug, "known_blocked_or_avoid_blind_retry", "blocked", false, "do not blind retry; only targeted lane with new evidence", {
    source: "known_blocker_register"
  }, ["avoid_blind_retry"]);
}

const groups = {
  counts: {
    previousCompletedVerifiedProof: previousCompletedVerifiedProof.length,
    countableCoverageNow: laneRows.filter(row => row.countableCoverageNow).length,
    reviewOnlyCandidateEligibleAfterExplicitApproval: reviewOnlyCandidateEligibleAfterExplicitApproval.length,
    zeroPlayedStartDateMissing: verified.zeroPlayedStartDateMissingSlugs.length,
    batch3ProofShapePassedNonzeroNeedsSeasonReview: verified.batch3ProofShapePassedNonzeroNeedsSeasonReviewSlugs.length,
    batch3ExtractionReviewRequired: verified.batch3ExtractionReviewRequiredSlugs.length,
    batch3NoExtractableTable: verified.batch3NoExtractableTableSlugs.length,
    batch3RenderedOrApiRequired: verified.batch3RenderedOrApiRequiredSlugs.length,
    batch3HtmlTableSurfaceReviewRequired: verified.batch3HtmlTableReviewRequiredSlugs.length,
    batch3IdentityReviewRequired: verified.batch3IdentityReviewRequiredSlugs.length,
    batch3RouteNeedsReview: verified.batch3RouteNeedsReviewSlugs.length,
    batch3RouteNotFound: verified.batch3RouteNotFoundSlugs.length,
    sameSourceSameRowsCollisionGroups: sameSourceSameRowsCollisionGroups.length
  },
  lanes: verified,
  priorityOrder: [
    {
      bucket: "candidate_after_explicit_approval",
      slugs: reviewOnlyCandidateEligibleAfterExplicitApproval,
      action: "only after explicit approval; still no production write"
    },
    {
      bucket: "proof_shape_nonzero_needs_season_and_league_review",
      slugs: verified.batch3ProofShapePassedNonzeroNeedsSeasonReviewSlugs,
      action: "resolve season/league identity and collision flags before candidate write"
    },
    {
      bucket: "html_extraction_review_required",
      slugs: sorted([...verified.batch3ExtractionReviewRequiredSlugs, ...verified.batch3HtmlTableReviewRequiredSlugs]),
      action: "custom parser/review only if enough value"
    },
    {
      bucket: "rendered_or_api_factory_planning",
      slugs: verified.batch3RenderedOrApiRequiredSlugs,
      action: "group by host family and build rendered/API adapters, not one-off probes"
    },
    {
      bucket: "zero_played_start_date_missing",
      slugs: verified.zeroPlayedStartDateMissingSlugs,
      action: "bounded start-date evidence refresh only"
    },
    {
      bucket: "park_or_low_priority",
      slugs: sorted([...verified.batch3RouteNeedsReviewSlugs, ...verified.batch3RouteNotFoundSlugs, ...knownBlockedOrAvoidBlindRetry]),
      action: "park unless high value or new official route evidence exists"
    }
  ]
};

const ledger = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "football_truth_factory_lane_ledger",
  contractVersion: 1,
  output: rel(ledgerPath),
  rowsOutput: rel(rowsPath),
  groupsOutput: rel(groupsPath),
  generatedAt: new Date().toISOString(),
  inputPaths: Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, rel(file)])),
  guardrails: acceptanceContract.hardGuardrails,
  acceptanceContract,
  groups,
  summary: {
    countableCoverageNow: groups.counts.countableCoverageNow,
    previousCompletedVerifiedProofCount: groups.counts.previousCompletedVerifiedProof,
    immediateFactoryCandidatesNotCountableYet: {
      reviewOnlyCandidateEligibleAfterExplicitApproval: groups.counts.reviewOnlyCandidateEligibleAfterExplicitApproval,
      proofShapePassedNonzeroNeedsSeasonReview: groups.counts.batch3ProofShapePassedNonzeroNeedsSeasonReview,
      extractionReviewRequired: groups.counts.batch3ExtractionReviewRequired,
      renderedOrApiRequired: groups.counts.batch3RenderedOrApiRequired,
      zeroPlayedStartDateMissing: groups.counts.zeroPlayedStartDateMissing
    },
    rejectionsAndParks: {
      noExtractableTable: groups.counts.batch3NoExtractableTable,
      identityReviewRequired: groups.counts.batch3IdentityReviewRequired,
      routeNeedsReview: groups.counts.batch3RouteNeedsReview,
      routeNotFound: groups.counts.batch3RouteNotFound,
      knownBlockedOrAvoidBlindRetry: knownBlockedOrAvoidBlindRetry.length
    },
    collisionGroups: sameSourceSameRowsCollisionGroups
  },
  rows: laneRows.sort((a, b) => a.slug.localeCompare(b.slug)),
  blocks
};

await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
await fs.writeFile(groupsPath, `${JSON.stringify(groups, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, ledger.rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: ledger.status,
  output: ledger.output,
  rowsOutput: ledger.rowsOutput,
  groupsOutput: ledger.groupsOutput,
  summary: ledger.summary,
  priorityOrder: groups.priorityOrder,
  blocks: ledger.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
