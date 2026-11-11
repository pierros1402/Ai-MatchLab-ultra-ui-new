import { readFile } from "node:fs/promises";
import { reconcileRegisteredSeason } from "../core/season-closure-contract.js";

try {
  const [inputPath, registryPath, registryFingerprint, ...extra] = process.argv.slice(2);
  if (!inputPath || !registryPath || !registryFingerprint || extra.length) throw new Error("Usage: node engine-v1/jobs/audit-season-closure.js INPUT.json REGISTRY.json PINNED_REGISTRY_FINGERPRINT");
  const result = reconcileRegisteredSeason(JSON.parse(await readFile(inputPath, "utf8")),
    JSON.parse(await readFile(registryPath, "utf8")), registryFingerprint);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (result.verdict === "HOLD") process.exitCode = 2;
} catch (error) {
  process.stdout.write(JSON.stringify({ verdict: "HOLD", issues: [{ code: "INVALID_AUDIT_INPUT", message: error.message }] }) + "\n");
  process.exitCode = 2;
}
