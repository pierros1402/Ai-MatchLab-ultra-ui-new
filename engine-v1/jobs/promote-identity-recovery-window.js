/**
 * Single-writer promotion checkpoint for durable identity-recovery evidence.
 *
 * Only AUTO_PROMOTABLE_* rows are considered. Every row is rediscovered from
 * the current raw canonical fixture store before the versioned extension
 * ledger is changed. The core promoter performs final immutable-base validation
 * plus a compare-and-swap hash check and atomic rename.
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { promoteIdentityRecoveryArtifact } from "../core/identity-extension-promoter.js";
import { getProductionIdentityResolverRuntime } from "../core/production-identity-resolver-runtime.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";

function persistPromotionDisposition(runDayKey, result) {
  const root = ensureDir(resolveDataPath("identity-recovery"));
  const outputPath = path.join(root, `${runDayKey}.promotion.json`);
  const payload = {
    schema: result.schema,
    runDayKey: result.runDayKey,
    changed: result.changed,
    initialLedgerSha256: result.initialLedgerSha256,
    finalLedgerSha256: result.finalLedgerSha256,
    promoted: result.promoted,
    alreadyApplied: result.alreadyApplied,
    blocked: result.blocked,
    refusedRecoveryStates: result.refusedRecoveryStates,
    validationStatus: result.validation.status,
    validationCounts: result.validation.counts,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, serialized, "utf8");
  fs.renameSync(tempPath, outputPath);
  return outputPath;
}

export function promoteIdentityRecoveryWindow(runDayKey, { write = true } = {}) {
  const safeDay = String(runDayKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(safeDay)) {
    throw new Error(`identity_promoter_invalid_day:${safeDay}`);
  }
  const runtime = getProductionIdentityResolverRuntime();
  const result = promoteIdentityRecoveryArtifact({
    runDayKey: safeDay,
    recoveryArtifactPath: resolveDataPath("identity-recovery", `${safeDay}.json`),
    extensionLedgerPath: runtime.paths.extensionLedger,
    canonicalRoot: resolveDataPath("canonical-fixtures"),
    baseResolver: runtime.baseResolver,
    write,
  });
  const dispositionPath = write
    ? persistPromotionDisposition(safeDay, result)
    : null;
  return { ...result, dispositionPath };
}

const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  try {
    const runDayKey = process.argv.slice(2).find(arg => !arg.startsWith("--"));
    const dryRun = process.argv.includes("--dry-run");
    const result = promoteIdentityRecoveryWindow(runDayKey, { write: !dryRun });
    console.log(JSON.stringify({
      schema: result.schema,
      runDayKey: result.runDayKey,
      changed: result.changed,
      promoted: result.promoted,
      alreadyApplied: result.alreadyApplied,
      blocked: result.blocked,
      refusedRecoveryStates: result.refusedRecoveryStates,
      validationStatus: result.validation.status,
      validationCounts: result.validation.counts,
      finalLedgerSha256: result.finalLedgerSha256,
      dispositionPath: result.dispositionPath,
    }, null, 2));
  } catch (error) {
    console.error("[identity-recovery-promoter] failed", error);
    process.exitCode = 1;
  }
}
