import { readFile } from "node:fs/promises";
import { reconcileRegisteredSeason } from "../core/season-closure-contract.js";

function auditBatch(inputs, registry, registryFingerprint) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error("Nonempty season batch required");
  const scopes = new Set();
  return inputs.map(input => {
    const competitionId = input?.contract?.competitionId;
    const seasonId = input?.contract?.seasonId;
    if (!competitionId || !seasonId) throw new Error("Competition and season required");
    const key = JSON.stringify([competitionId, seasonId]);
    if (scopes.has(key)) throw new Error("Duplicate competition season");
    scopes.add(key);
    const result = reconcileRegisteredSeason(input, registry, registryFingerprint);
    return { competitionId, seasonId, ...result,
      missingCanonicalCandidates: result.issues.filter(issue =>
        issue.code === "MISSING_REQUIRED_STAGE" && issue.stage === "canonical") };
  });
}

try {
  const batch = process.argv[2] === "--batch";
  const [inputPath, registryPath, registryFingerprint, ...extra] = process.argv.slice(batch ? 3 : 2);
  if (!inputPath || !registryPath || !registryFingerprint || extra.length) throw new Error("Usage: node engine-v1/jobs/audit-season-closure.js [--batch] INPUT.json REGISTRY.json PINNED_REGISTRY_FINGERPRINT");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  let result;
  if (batch) {
    const seasons = auditBatch(input, registry, registryFingerprint);
    result = { verdict: seasons.some(season => season.verdict === "HOLD") ? "HOLD" : "VERIFIED_INPUTS", seasons };
  } else {
    result = reconcileRegisteredSeason(input, registry, registryFingerprint);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (result.verdict === "HOLD") process.exitCode = 2;
} catch (error) {
  process.stdout.write(JSON.stringify({ verdict: "HOLD", issues: [{ code: "INVALID_AUDIT_INPUT", message: error.message }] }) + "\n");
  process.exitCode = 2;
}
