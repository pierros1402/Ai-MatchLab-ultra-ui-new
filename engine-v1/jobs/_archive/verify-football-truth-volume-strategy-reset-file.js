import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-volume-strategy-reset-${today}`, `football-truth-volume-strategy-reset-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-volume-strategy-reset-${today}`, `football-truth-volume-strategy-reset-rows-${today}.jsonl`);
const quarantinePath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-volume-strategy-reset-${today}`, `football-truth-low-trust-bulk-probes-quarantine-${today}.json`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-volume-strategy-reset-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-volume-strategy-reset-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));
const quarantine = JSON.parse(await fs.readFile(quarantinePath, "utf8"));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "football_truth_volume_strategy_reset") blocks.push("runner_mismatch");
if (report.summary?.lowTrustRunsQuarantined !== 2) blocks.push("low_trust_runs_not_2");
if (report.summary?.badDiscoveryFetchPlanAllowed !== false) blocks.push("bad_discovery_fetch_plan_not_disabled");
if (report.summary?.strictProbePromotionAllowed !== false) blocks.push("strict_probe_promotion_not_disabled");
if (quarantine.status !== "active") blocks.push("quarantine_not_active");
if (rows.length !== 5) blocks.push("rows_not_5");

const guardrails = report.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
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
  runner: "verify_football_truth_volume_strategy_reset",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  quarantinePath: rel(quarantinePath),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  quarantineSha256: await sha256(quarantinePath),
  verified: {
    summary: report.summary,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Volume strategy reset is verified. Low-trust bulk probes are quarantined and must not feed promotion. Next work must inventory proven official family adapters or use explicitly approved provider fallback with official cross-check.",
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
