import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-ned2-start-date-evidence-${today}`, `football-truth-ned2-start-date-evidence-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-ned2-start-date-evidence-${today}`, `football-truth-ned2-start-date-evidence-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-ned2-start-date-evidence-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-ned2-start-date-evidence-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "football_truth_ned2_start_date_evidence") blocks.push("runner_mismatch");
if (report.summary?.targetCount !== 1) blocks.push("target_count_not_1");
if (report.summary?.attemptedFetchCount !== 11) blocks.push("attempted_fetch_count_not_11");
if (rows.length !== 11) blocks.push("rows_not_11");
if (!["start_date_candidate_needs_review", "weak_start_date_evidence_needs_review", "start_date_evidence_not_found"].includes(report.summary?.evidenceStatus)) blocks.push("invalid_evidence_status");

for (const row of rows) {
  if (row.slug !== "ned.2") blocks.push("unexpected_slug");
  if (row.acceptedNow !== false) blocks.push(`accepted_now_true_${row.url}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_true_${row.url}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${row.url}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${row.url}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${row.url}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_true_${row.url}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_true_${row.url}`);
}

const guardrails = report.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 11) blocks.push("fetch_executed_not_11");
if (guardrails.controlledOfficialStartDateFetchExecutedNowCount !== 11) blocks.push("controlled_fetch_not_11");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

const verification = {
  status: blocks.length ? "failed" : "passed",
  runner: "verify_football_truth_ned2_start_date_evidence",
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
  conclusion: "NED2 start-date evidence run is verified. It uses controlled official-host fetches only and performs no canonical/lifecycle/production/truth write.",
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
