import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const inventoryPath = path.join(root, "data", "football-truth", "_diagnostics", `strict-existing-family-contract-inventory-${today}`, `strict-existing-family-contract-inventory-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `strict-existing-family-contract-inventory-${today}`, `strict-existing-family-contract-inventory-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `strict-existing-family-contract-inventory-verification-${today}`);
const verificationPath = path.join(verificationDir, `strict-existing-family-contract-inventory-verification-${today}.json`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];
const inventory = JSON.parse(await fs.readFile(inventoryPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (inventory.status !== "passed") blocks.push("inventory_status_not_passed");
if (inventory.contractVersion !== 2) blocks.push("inventory_contract_version_not_2");
if (inventory.scannedFileCount !== 857) blocks.push("scanned_file_count_not_857");
if (inventory.summary?.familyCount !== 9) blocks.push("family_count_not_9");
if (rows.length !== 9) blocks.push("rows_count_not_9");

if (inventory.summary?.strictExecutableFamilyWithVerifierCount !== 8) blocks.push("strict_executable_with_verifier_count_not_8");
if (inventory.summary?.strictExecutableFamilyMissingVerifierCount !== 1) blocks.push("strict_executable_missing_verifier_count_not_1");
if (inventory.summary?.configuredFamilyNeedsStrictProofCount !== 0) blocks.push("configured_needs_proof_not_zero");
if (inventory.summary?.strictReferencesOnlyCount !== 0) blocks.push("strict_references_only_not_zero");
if (inventory.summary?.noStrictFamilyContractFoundCount !== 0) blocks.push("no_contract_found_not_zero");
if (inventory.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

const expectedFamilies = new Map([
  ["sportomedia_sef", "strict_executable_family_with_verifier"],
  ["norway_ntf", "strict_executable_family_with_verifier"],
  ["laliga_official", "strict_executable_family_with_verifier"],
  ["torneopal_veikkausliiga", "strict_executable_family_with_verifier"],
  ["bundesliga_dfb_rendered", "strict_executable_family_with_verifier"],
  ["spfl_official_rendered", "strict_executable_family_with_verifier"],
  ["ksi_iceland", "strict_executable_family_with_verifier"],
  ["cfa_cyprus_html", "strict_executable_family_with_verifier"],
  ["loi_ajax", "strict_executable_family_missing_verifier"]
]);

for (const [familyKey, readiness] of expectedFamilies.entries()) {
  const row = rows.find(item => item.familyKey === familyKey);
  if (!row) {
    blocks.push(`missing_family_${familyKey}`);
    continue;
  }

  if (row.readiness !== readiness) blocks.push(`readiness_mismatch_${familyKey}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`acceptance_allowed_${familyKey}`);
  if (row.reviewOnly !== true) blocks.push(`not_review_only_${familyKey}`);
  if (row.executableRunnerMatchCount < 1) blocks.push(`no_executable_runner_${familyKey}`);

  const topFiles = (row.topFiles || []).map(file => file.rel || "");
  for (const rel of topFiles) {
    if (rel.includes("strict-existing-family-contract-inventory") || rel.includes("existing-family-contract-inventory")) {
      blocks.push(`self_inventory_leaked_${familyKey}_${rel}`);
    }
    if (rel.includes("official-host-proof") || rel.includes("official-host-extraction") || rel.includes("hard-pivot")) {
      blocks.push(`generic_pivot_or_probe_leaked_${familyKey}_${rel}`);
    }
  }
}

const guardrails = inventory.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_strict_existing_family_contract_inventory",
  contractVersion: 1,
  inventoryPath: path.relative(root, inventoryPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  inventorySha256: await sha256(inventoryPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    scannedFileCount: inventory.scannedFileCount,
    familyCount: inventory.summary.familyCount,
    strictExecutableFamilyWithVerifierCount: inventory.summary.strictExecutableFamilyWithVerifierCount,
    strictExecutableFamilyMissingVerifierCount: inventory.summary.strictExecutableFamilyMissingVerifierCount,
    firstStrictExecutionCandidates: inventory.summary.firstStrictExecutionCandidates,
    acceptedNowCount: inventory.summary.acceptedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 0 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Strict inventory found family-specific execution assets for 9 known families: 8 with verifier coverage and loi_ajax missing verifier. This is inventory only, not standings coverage.",
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: report.status,
  verificationPath: path.relative(root, verificationPath).replaceAll("\\", "/"),
  verified: report.verified,
  conclusion: report.conclusion,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
