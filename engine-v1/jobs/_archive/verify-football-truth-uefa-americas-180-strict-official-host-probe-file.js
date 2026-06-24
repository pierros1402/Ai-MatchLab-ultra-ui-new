import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-uefa-americas-180-strict-official-host-probe-${today}`, `football-truth-uefa-americas-180-strict-official-host-probe-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-uefa-americas-180-strict-official-host-probe-${today}`, `football-truth-uefa-americas-180-strict-official-host-probe-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-uefa-americas-180-strict-official-host-probe-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-uefa-americas-180-strict-official-host-probe-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "football_truth_uefa_americas_180_strict_official_host_probe") blocks.push("runner_mismatch");
if (report.summary?.selectedPriorityTargetCount < 150) blocks.push("selected_priority_target_count_below_150");
if (rows.length !== report.summary?.selectedPriorityTargetCount) blocks.push("rows_count_mismatch");
if ((report.summary?.attemptedStrictOfficialHostFetchCount || 0) < rows.length * 4) blocks.push("fetch_count_too_low");
if ((report.summary?.confederationCounts?.UEFA || 0) <= 100) blocks.push("uefa_target_count_too_low");
if ((report.summary?.confederationCounts?.AMERICAS || 0) <= 30) blocks.push("americas_target_count_too_low");

for (const row of rows) {
  if (!["UEFA","AMERICAS"].includes(row.confederation)) blocks.push(`bad_confederation_${row.slug}`);
  if (["uga","uzb"].includes(row.countryPrefix)) blocks.push(`forbidden_low_priority_prefix_${row.slug}`);
  if (!row.officialHosts || row.officialHosts.length === 0) blocks.push(`missing_official_hosts_${row.slug}`);
  if (row.selectedHost && row.selectedStrictHostOk !== true && row.strictOfficialFinalLane !== "strict_official_host_failed") blocks.push(`non_strict_host_selected_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_true_${row.slug}`);
  if (row.reviewOnlyCandidateWriteExecutedNow !== false) blocks.push(`review_only_write_true_${row.slug}`);
  if (row.canonicalCandidateWriteExecutedNow !== false) blocks.push(`canonical_candidate_write_true_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_true_${row.slug}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_true_${row.slug}`);
}

const guardrails = report.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.routeDiscoverySearchExecutedNowCount !== 0) blocks.push("route_discovery_search_not_zero");
if (guardrails.fetchExecutedNowCount !== report.summary?.attemptedStrictOfficialHostFetchCount) blocks.push("fetch_count_mismatch");
if (guardrails.controlledStrictOfficialHostFetchExecutedNowCount !== report.summary?.attemptedStrictOfficialHostFetchCount) blocks.push("strict_fetch_count_mismatch");
if (guardrails.browserRenderExecutedNowCount !== 0) blocks.push("browser_render_not_zero");
if (guardrails.reviewOnlyCandidateWriteExecutedNowCount !== 0) blocks.push("review_only_write_not_zero");
if (guardrails.canonicalCandidateWriteExecutedNowCount !== 0) blocks.push("canonical_candidate_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

const verification = {
  status: blocks.length ? "failed" : "passed",
  runner: "verify_football_truth_uefa_americas_180_strict_official_host_probe",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    summary: report.summary,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "UEFA/Americas 180-target strict official-host probe is verified. It excludes low-priority regions, uses only configured official hosts, and performs no search/candidate/canonical/lifecycle/production/truth write.",
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

if (blocks.length) process.exitCode = 1;
