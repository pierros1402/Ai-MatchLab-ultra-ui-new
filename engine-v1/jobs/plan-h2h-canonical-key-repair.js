/**
 * plan-h2h-canonical-key-repair.js
 *
 * Converts the read-only H2H canonical-key audit into a deterministic repair
 * plan. It never modifies data/h2h. Later execution must hash-lock this plan and
 * the complete H2H inventory.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import {
  buildH2HCanonicalKeyAudit,
  computeH2HInventoryHash,
  assertReportOutputOutsideH2H
} from "./audit-h2h-canonical-key-integrity.js";

const __filename = fileURLToPath(import.meta.url);
const POLICY_VERSION = "h2h-canonical-key-repair-plan-policy-v1";

function unique(values) {
  return [...new Set(values)];
}

function actionForGroup(targetFileName, rows, h2hDir) {
  const targetPath = path.join(h2hDir, targetFileName);
  const sourceNames = rows.map(row => row.actualFileName).sort();
  const targetExists = fs.existsSync(targetPath);
  const invalid = rows.some(row =>
    row.invalidJson
    || row.policyDegradedPairKey
    || row.keyCollision
    || row.invalidMatchCount > 0
    || row.storedPairMismatchCount > 0
    || row.conflictingDuplicateMatchIdCount > 0
  );

  const allMatchIds = unique(rows.flatMap(row => row.matchIds || [])).sort();
  const sourceMatchCount = rows.reduce((sum, row) => sum + Number(row.matchCount || 0), 0);
  const uniqueMatchCount = allMatchIds.length;
  const duplicateMatchIdsAcrossSources = sourceMatchCount - uniqueMatchCount;

  if (invalid) {
    return {
      blocked: true,
      reasonCode: "h2h_source_group_failed_integrity_gate",
      targetFileName,
      sourceFileNames: sourceNames
    };
  }

  if (rows.length > 1 || (targetExists && !sourceNames.includes(targetFileName))) {
    return {
      blocked: true,
      reasonCode: "h2h_target_collision_requires_separate_merge_review",
      targetFileName,
      sourceFileNames: sourceNames,
      targetExists,
      sourceMatchCount,
      uniqueMatchCount,
      duplicateMatchIdsAcrossSources
    };
  }

  const source = rows[0];
  if (source.actualFileName === targetFileName) return null;

  return {
    blocked: false,
    actionId: null,
    actionType: "rename_h2h_file_to_canonical_key",
    status: "planned_not_applied",
    confidence: "deterministic",
    sourceFileName: source.actualFileName,
    targetFileName,
    sourcePath: source.sourcePath,
    targetPath,
    sourceSha256: source.sourceSha256,
    sourceBytes: source.sourceBytes,
    teamA: source.payloadTeamA,
    teamB: source.payloadTeamB,
    legacyPairKey: source.legacyExpectedPairKey,
    canonicalPairKey: source.policyExpectedPairKey,
    fallbackTeamIdentityCount: Number(source.keyPolicy?.left?.usedFallback)
      + Number(source.keyPolicy?.right?.usedFallback),
    matchCount: source.matchCount,
    matchIds: source.matchIds,
    targetExists,
    payloadRewriteRequired: false,
    automaticApplyAllowed: false,
    truthWrites: 0,
    reasonCodes: [
      "legacy_pair_key_contains_empty_half",
      "h2h_specific_nonempty_fallback_is_deterministic",
      "target_does_not_exist",
      "payload_pair_and_matches_pass_integrity_gates"
    ]
  };
}

export function buildH2HCanonicalKeyRepairPlan(options = {}) {
  const h2hDir = path.resolve(options.h2hDir || resolveDataPath("h2h"));
  const expectedInventorySha256 = options.expectedInventorySha256
    ? String(options.expectedInventorySha256).toLowerCase()
    : null;
  const audit = buildH2HCanonicalKeyAudit(options);

  if (
    expectedInventorySha256
    && audit.inventory.sha256.toLowerCase() !== expectedInventorySha256
  ) {
    throw new Error(
      `H2H inventory SHA-256 mismatch: expected ${expectedInventorySha256}, actual ${audit.inventory.sha256}`
    );
  }

  const groups = new Map();
  for (const row of audit.fileReports.filter(item => !item.invalidJson)) {
    const target = row.expectedFileName || `__invalid__/${row.actualFileName}`;
    if (!groups.has(target)) groups.set(target, []);
    groups.get(target).push(row);
  }

  const actions = [];
  const blocked = [];
  for (const [target, rows] of groups) {
    const result = actionForGroup(target, rows, h2hDir);
    if (!result) continue;
    if (result.blocked) blocked.push(result);
    else actions.push(result);
  }

  actions.sort((a, b) => a.sourceFileName.localeCompare(b.sourceFileName));
  actions.forEach((action, index) => {
    action.actionId = `h2h-canonical-key-repair-${String(index + 1).padStart(4, "0")}`;
  });
  blocked.sort((a, b) => a.targetFileName.localeCompare(b.targetFileName));

  const projectedFileCount = audit.summary.fileCount;
  const projectedMatchCount = audit.summary.matchCount;
  const readyToApply = blocked.length === 0 && actions.length > 0;
  const status = blocked.length > 0
    ? "blocked"
    : actions.length > 0
      ? "ready_for_separate_hash_verified_executor"
      : "clean_no_actions";

  const after = computeH2HInventoryHash(h2hDir);
  if (after.sha256 !== audit.inventory.sha256) {
    throw new Error("H2H inventory changed during repair planning.");
  }

  return {
    ok: blocked.length === 0,
    readyToApply,
    status,
    schema: "ai-matchlab.h2h-canonical-key-repair-plan.v1",
    policyVersion: POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    sourceContract: {
      h2hReadOnly: true,
      planArtifactOnly: true,
      automaticApply: false,
      truthWrites: 0,
      truthFilesChanged: 0
    },
    sourceAudit: {
      schema: audit.schema,
      status: audit.status,
      policyVersion: audit.policyVersion,
      inventory: audit.inventory,
      summary: audit.summary
    },
    summary: {
      deterministicActions: actions.length,
      blockedActions: blocked.length,
      legacyDegradedPairKeys: audit.summary.legacyDegradedPairKeyCount,
      policyDegradedPairKeys: audit.summary.policyDegradedPairKeyCount,
      sourceFilesAffected: unique(actions.map(row => row.sourceFileName)).length,
      targetFiles: unique(actions.map(row => row.targetFileName)).length,
      matchesPreserved: actions.reduce((sum, row) => sum + row.matchCount, 0),
      payloadRewritesRequired: actions.filter(row => row.payloadRewriteRequired).length,
      targetCollisions: audit.summary.targetCollisionCount
    },
    actions,
    blocked,
    expectedPostRepair: {
      fileCount: projectedFileCount,
      matchCount: projectedMatchCount,
      legacyDegradedPairKeyCount: 0,
      policyDegradedPairKeyCount: 0,
      nonCanonicalFileNameCount: Math.max(
        0,
        audit.summary.nonCanonicalFileNameCount - actions.length
      ),
      storedPairMismatchCount: audit.summary.storedPairMismatchCount,
      invalidMatchCount: audit.summary.invalidMatchCount,
      duplicateMatchIdCount: audit.summary.duplicateMatchIdCount,
      conflictingDuplicateMatchIdCount:
        audit.summary.conflictingDuplicateMatchIdCount
    },
    implementationRequirements: {
      policyConsumersToUpdateBeforeWrite: [
        "engine-v1/storage/h2h-memory-db.js",
        "engine-v1/jobs/migrate-h2h-canonical-keys.js",
        "engine-v1/jobs/audit-history-semantic-integrity.js"
      ],
      executorRequirements: [
        "dry_run_default",
        "inventory_hash_required",
        "plan_hash_required",
        "per_file_source_hash_required",
        "external_backup_before_write",
        "atomic_rename_or_copy_delete",
        "post_audit_required",
        "rollback_on_post_audit_failure"
      ]
    },
    guarantees: {
      h2hWrites: 0,
      historyWrites: 0,
      archiveWrites: 0,
      resultsMemoryWrites: 0,
      automaticRepair: 0
    }
  };
}

export function writeRepairPlan(outputPath, plan, h2hDir) {
  const out = assertReportOutputOutsideH2H(outputPath, h2hDir);
  ensureDir(path.dirname(out));
  fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return out;
}

function parseArgs(argv) {
  const out = {
    h2hDir: null,
    output: null,
    expectedInventorySha256: null,
    maxExamples: 30
  };
  for (const arg of argv) {
    if (arg.startsWith("--h2h-dir=")) out.h2hDir = arg.slice(10);
    else if (arg.startsWith("--output=")) out.output = arg.slice(9);
    else if (arg.startsWith("--expected-inventory-sha256=")) {
      out.expectedInventorySha256 = arg.slice(28);
    } else if (arg.startsWith("--max-examples=")) {
      out.maxExamples = Number(arg.slice(15));
    } else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || !args.output) {
      console.log("Usage: node engine-v1/jobs/plan-h2h-canonical-key-repair.js --output=<plan.json> [--h2h-dir=<dir>] [--expected-inventory-sha256=<hash>]");
      process.exit(args.help ? 0 : 1);
    }
    const plan = buildH2HCanonicalKeyRepairPlan(args);
    const h2hDir = path.resolve(args.h2hDir || resolveDataPath("h2h"));
    const outputPath = writeRepairPlan(args.output, plan, h2hDir);
    console.log(JSON.stringify({
      ok: plan.ok,
      readyToApply: plan.readyToApply,
      status: plan.status,
      schema: plan.schema,
      policyVersion: plan.policyVersion,
      generatedAt: plan.generatedAt,
      outputPath,
      sourceInventory: plan.sourceAudit.inventory,
      summary: plan.summary,
      expectedPostRepair: plan.expectedPostRepair,
      guarantees: plan.guarantees
    }, null, 2));
    process.exit(plan.ok ? 0 : 2);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
    process.exit(1);
  }
}
