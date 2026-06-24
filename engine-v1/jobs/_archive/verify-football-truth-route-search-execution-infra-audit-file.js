import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const auditPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `route-search-execution-infra-audit-${today}`,
  `route-search-execution-infra-audit-${today}.json`
);

const rowsPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `route-search-execution-infra-audit-${today}`,
  `route-search-execution-infra-audit-rows-${today}.jsonl`
);

const verificationDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `route-search-execution-infra-audit-verification-${today}`
);

const verificationPath = path.join(
  verificationDir,
  `route-search-execution-infra-audit-verification-${today}.json`
);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];
const audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (audit.status !== "passed") blocks.push("audit_status_not_passed");
if (!Number.isInteger(audit.summary?.scannedFileCount) || audit.summary.scannedFileCount < 1) blocks.push("invalid_scanned_file_count");
if (!Number.isInteger(audit.summary?.matchingFileCount) || audit.summary.matchingFileCount < 1) blocks.push("invalid_matching_file_count");
if (rows.length !== audit.summary.matchingFileCount) blocks.push("rows_count_mismatch_matching_file_count");
if (!Number.isInteger(audit.summary?.allowSearchGateFileCount) || audit.summary.allowSearchGateFileCount < 1) blocks.push("missing_allow_search_gate_files");
if (!Number.isInteger(audit.summary?.nodeFetchPatternFileCount) || audit.summary.nodeFetchPatternFileCount < 1) blocks.push("missing_node_fetch_pattern_files");
if (!Number.isInteger(audit.summary?.rssPatternFileCount) || audit.summary.rssPatternFileCount < 1) blocks.push("missing_rss_pattern_files");

const guardrails = audit.guardrails || {};
for (const key of [
  "searchExecutedNowCount",
  "fetchExecutedNowCount",
  "canonicalWriteExecutedNowCount",
  "productionWriteExecutedNowCount",
  "truthAssertionExecutedNowCount"
]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");

const recommended = audit.summary?.recommendedReuseFiles || [];
if (recommended.length < 3) blocks.push("too_few_recommended_reuse_files");
if (recommended.includes("engine-v1/jobs/build-football-truth-route-search-execution-infra-audit-file.js")) blocks.push("self_audit_job_recommended_for_reuse");

const expectedTop = [
  "engine-v1/jobs/run-football-truth-enriched-start-date-evidence-rss-search-batch-file.js",
  "engine-v1/jobs/run-football-truth-bulk-high-value-source-discovery-wave-file.js",
  "engine-v1/jobs/run-football-truth-prioritized-start-date-evidence-rss-search-batch-file.js"
];

if (!expectedTop.some(file => recommended.includes(file))) {
  blocks.push("expected_gated_search_runner_pattern_not_recommended");
}

for (const row of rows) {
  if (row.path === "engine-v1/jobs/build-football-truth-route-search-execution-infra-audit-file.js") blocks.push("self_audit_job_present_in_rows");
  if (!Array.isArray(row.roles)) blocks.push(`row_roles_missing_${row.path}`);
  if (!Number.isInteger(row.hitCount) || row.hitCount < 1) blocks.push(`row_hit_count_invalid_${row.path}`);
  if (!Array.isArray(row.topHits) || row.topHits.length < 1) blocks.push(`row_top_hits_missing_${row.path}`);
}

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_route_search_execution_infra_audit",
  contractVersion: 1,
  auditPath: path.relative(root, auditPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  auditSha256: await sha256(auditPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    matchingFileCount: rows.length,
    allowSearchGateFileCount: audit.summary.allowSearchGateFileCount,
    nodeFetchPatternFileCount: audit.summary.nodeFetchPatternFileCount,
    rssPatternFileCount: audit.summary.rssPatternFileCount,
    selfAuditJobExcluded: !recommended.includes("engine-v1/jobs/build-football-truth-route-search-execution-infra-audit-file.js") &&
      rows.every(row => row.path !== "engine-v1/jobs/build-football-truth-route-search-execution-infra-audit-file.js"),
    guardrailsZero: blocks.filter(block => block.startsWith("guardrail_")).length === 0
  },
  recommendedReuseFiles: recommended,
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: report.status,
  verificationPath: path.relative(root, verificationPath).replaceAll("\\", "/"),
  verified: report.verified,
  recommendedReuseFiles: report.recommendedReuseFiles,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) {
  process.exitCode = 1;
}
