import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const planPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-volume-league-expansion-clean-plan-${today}`, `bulk-volume-league-expansion-clean-plan-${today}.json`);
const planRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-volume-league-expansion-clean-plan-${today}`, `bulk-volume-league-expansion-clean-plan-rows-${today}.jsonl`);
const hygienePath = path.join(root, "data", "football-truth", "_diagnostics", `diagnostic-cooccurrence-hygiene-policy-${today}`, `diagnostic-cooccurrence-hygiene-policy-${today}.json`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-volume-league-expansion-clean-plan-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-volume-league-expansion-clean-plan-verification-${today}.json`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const rows = parseJsonl(await fs.readFile(planRowsPath, "utf8"));
const hygiene = JSON.parse(await fs.readFile(hygienePath, "utf8"));

if (plan.status !== "passed") blocks.push("plan_status_not_passed");
if (plan.runner !== "bulk_volume_league_expansion_clean_plan") blocks.push("plan_runner_mismatch");
if (plan.contractVersion !== 2) blocks.push("plan_contract_version_not_2");
if (plan.inventory?.selectedBulkTargetCount !== 160) blocks.push("selected_bulk_target_count_not_160");
if (plan.inventory?.selectedBatchCount !== 4) blocks.push("selected_batch_count_not_4");
if (rows.length !== 160) blocks.push("rows_length_not_160");
if ((plan.batches || []).length !== 4) blocks.push("batch_length_not_4");
if (!(plan.batches || []).every(batch => batch.targetCount === 40)) blocks.push("not_all_batches_have_40_targets");

if (plan.policy?.reasonForReplacingPreviousPlan?.includes("co-occurrence polluted") !== true) blocks.push("missing_reason_for_replacing_polluted_plan");
if (plan.policy?.noFamilyClaimWithoutPerSlugRouteEvidence !== true) blocks.push("plan_missing_no_family_claim_rule");
if (plan.policy?.suppressTinyPlaceholderLeagues !== true) blocks.push("plan_missing_tiny_placeholder_suppression");
if (plan.policy?.noFetchInThisPlan !== true) blocks.push("plan_fetch_not_forbidden");
if (plan.policy?.noProductionWriteInThisPlan !== true) blocks.push("plan_production_not_forbidden");
if (plan.policy?.noTruthAssertionInThisPlan !== true) blocks.push("plan_truth_not_forbidden");

const badFamilyClaims = rows.filter(row => Array.isArray(row.candidateFamilies) && row.candidateFamilies.length > 0);
if (badFamilyClaims.length > 0) blocks.push("rows_contain_family_claims");

const badRouteClaims = rows.filter(row => row.officialRoute || row.sourceFamily || row.routeUrl);
if (badRouteClaims.length > 0) blocks.push("rows_contain_route_or_source_claims");

const blockedRows = rows.filter(row => row.blocked || row.alreadyCoveredOrCandidate);
if (blockedRows.length > 0) blocks.push("blocked_or_already_covered_rows_present");

const fetchAllowedRows = rows.filter(row => row.fetchAllowedByThisPlan !== false);
if (fetchAllowedRows.length > 0) blocks.push("some_rows_allow_fetch");

const productionAllowedRows = rows.filter(row => row.productionWriteAllowedByThisPlan !== false || row.truthAssertionAllowedByThisPlan !== false);
if (productionAllowedRows.length > 0) blocks.push("some_rows_allow_production_or_truth");

const batchSlugs = new Set((plan.batches || []).flatMap(batch => batch.slugs || []));
const rowSlugs = new Set(rows.map(row => row.slug));
if (batchSlugs.size !== rowSlugs.size) blocks.push("batch_slug_set_size_mismatch");
for (const slug of rowSlugs) {
  if (!batchSlugs.has(slug)) blocks.push(`row_slug_missing_from_batches_${slug}`);
}

if (hygiene.status !== "passed") blocks.push("hygiene_status_not_passed");
if (hygiene.ruleSet?.historicalDiagnosticsAreAuditOnly !== true) blocks.push("hygiene_missing_audit_only_rule");
if (hygiene.ruleSet?.aggregateDiagnosticsCannotAssignSourceFamily !== true) blocks.push("hygiene_missing_family_ban");
if (hygiene.ruleSet?.aggregateDiagnosticsCannotAssignOfficialRoute !== true) blocks.push("hygiene_missing_route_ban");
if (hygiene.ruleSet?.familyAssignmentRequiresPerSlugRouteEvidence !== true) blocks.push("hygiene_missing_per_slug_evidence_rule");
if (hygiene.ruleSet?.sourceFamilyMustBeExplicitFieldNotTextCooccurrence !== true) blocks.push("hygiene_missing_explicit_source_rule");
if (hygiene.ruleSet?.routeUrlMustBeExplicitFieldNotTextCooccurrence !== true) blocks.push("hygiene_missing_explicit_route_rule");
if (hygiene.ruleSet?.selfGeneratedPlannerFilesMustNotBeUsedAsEvidence !== true) blocks.push("hygiene_missing_self_generated_ban");
if (hygiene.requiredFuturePlannerAssertions?.cooccurrenceDiagnosticsExcludedFromFamilyAttribution !== true) blocks.push("hygiene_missing_future_assertion");
if (hygiene.requiredFuturePlannerAssertions?.oldDiagnosticsNotDeletedBecauseAuditTrail !== true) blocks.push("hygiene_missing_audit_trail_assertion");

const planGuardrails = plan.guardrails || {};
for (const key of ["searchExecutedNowCount","fetchExecutedNowCount","providerFetchExecutedNowCount","canonicalWriteExecutedNowCount","lifecycleWriteExecutedNowCount","productionWriteExecutedNowCount","truthAssertionExecutedNowCount"]) {
  if (planGuardrails[key] !== 0) blocks.push(`plan_guardrail_${key}_not_zero`);
}
if (planGuardrails.rawPayloadCommitted !== false) blocks.push("plan_raw_payload_committed_not_false");
if (planGuardrails.fullRawPayloadWritten !== false) blocks.push("plan_full_raw_payload_written_not_false");

const hygieneGuardrails = hygiene.guardrails || {};
for (const key of ["searchExecutedNowCount","fetchExecutedNowCount","canonicalWriteExecutedNowCount","lifecycleWriteExecutedNowCount","productionWriteExecutedNowCount","truthAssertionExecutedNowCount"]) {
  if (hygieneGuardrails[key] !== 0) blocks.push(`hygiene_guardrail_${key}_not_zero`);
}
if (hygieneGuardrails.rawPayloadCommitted !== false) blocks.push("hygiene_raw_payload_committed_not_false");
if (hygieneGuardrails.fullRawPayloadWritten !== false) blocks.push("hygiene_full_raw_payload_written_not_false");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_volume_league_expansion_clean_plan",
  contractVersion: 1,
  planPath: rel(planPath),
  planRowsPath: rel(planRowsPath),
  hygienePath: rel(hygienePath),
  verificationPath: rel(verificationPath),
  planSha256: await sha256(planPath),
  planRowsSha256: await sha256(planRowsPath),
  hygieneSha256: await sha256(hygienePath),
  verified: {
    selectedBulkTargetCount: plan.inventory.selectedBulkTargetCount,
    selectedBatchCount: plan.inventory.selectedBatchCount,
    batchSizeAll40: (plan.batches || []).every(batch => batch.targetCount === 40),
    cooccurrenceHygienePolicyPresent: true,
    historicalDiagnosticsAuditOnly: hygiene.ruleSet.historicalDiagnosticsAreAuditOnly,
    aggregateDiagnosticsCannotAssignSourceFamily: hygiene.ruleSet.aggregateDiagnosticsCannotAssignSourceFamily,
    noFamilyClaimsInRows: badFamilyClaims.length === 0,
    noRouteClaimsInRows: badRouteClaims.length === 0,
    noFetchInPlan: plan.policy.noFetchInThisPlan,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Clean bulk plan is verified and historical diagnostics are quarantined for attribution. Old diagnostics remain as audit trail but cannot assign source families/routes by co-occurrence.",
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(verification, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: verification.status,
  verificationPath: verification.verificationPath,
  verified: verification.verified,
  conclusion: verification.conclusion,
  blocks: verification.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
