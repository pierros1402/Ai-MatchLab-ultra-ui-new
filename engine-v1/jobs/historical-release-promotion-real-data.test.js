import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { resolveDataPath } from "../storage/data-root.js";
import { stageHistoricalStatusRelease }
  from "./stage-historical-status-release.js";
import {
  inspectHistoricalPromotionSandbox,
  promoteHistoricalReleaseGuardedSandbox as underlyingPromote,
  recoverHistoricalReleaseGuardedSandbox
} from "./historical-release-promotion-adapter.js";
import { validateStagedRelease }
  from "./sync-deploy-snapshot-from-github.js";

function promoteHistoricalReleaseGuardedSandbox(options) {
  if (!options?.simulateCrashAt) {
    return underlyingPromote(options);
  }

  const parentDir = options.parentDir;
  const crash = options.simulateCrashAt;
  const moduleUrl = new URL(
    "./historical-release-promotion-adapter.js",
    import.meta.url
  ).href;

  const childCode = [
    'import { inspectHistoricalPromotionSandbox,',
    'promoteHistoricalReleaseGuardedSandbox } from ' +
      JSON.stringify(moduleUrl) + ';',
    'const parentDir = process.argv[1];',
    'const crash = process.argv[2];',
    'const baseline = inspectHistoricalPromotionSandbox({ parentDir });',
    'const result = promoteHistoricalReleaseGuardedSandbox({',
    '  parentDir, expectedTargetInventory: baseline.before,',
    '  simulateCrashAt: crash',
    '});',
    'if (result.recoveryRequired !== true) process.exit(71);',
    'process.kill(process.pid, "SIGKILL");',
    'process.exit(72);'
  ].join("\n");

  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", childCode, parentDir, crash],
    { encoding: "utf8", timeout: 15000, windowsHide: true }
  );

  if (child.error) throw child.error;
  if (child.status === 0 ||
      (!fs.existsSync(
        path.join(parentDir, ".historical-promotion-journal.json")
      ))) {
    throw Error("TEST_CHILD_TERMINATION_NOT_ESTABLISHED:" +
      (child.stderr || ""));
  }

  return {
    ok: false,
    simulatedCrash: true,
    recoveryRequired: true
  };
}

const DAY = "2026-11-08";

const EXPECTED_MANIFEST =
  "0f9f3ab7518cac7fddcd171bb806f2628b98b6376f6644144145f2034b8a2865";

const original = resolveDataPath("deploy-snapshots", DAY);
const latest = resolveDataPath("deploy-snapshots", "latest.json");

const hash = file => crypto.createHash("sha256")
  .update(fs.readFileSync(file)).digest("hex");

const read = file => JSON.parse(fs.readFileSync(file, "utf8"));

const protectedFiles = [
  "value.json",
  "value-audit.json",
  "plan-c-shadow.json",
  "plan-c-shadow-audit.json"
];

function makeScenario(root, label, stagedSource) {
  const parentDir = path.join(root, label);
  const target = path.join(parentDir, "target");
  const stage = path.join(parentDir, "stage");

  fs.mkdirSync(parentDir);
  fs.cpSync(original, target, { recursive: true });
  fs.cpSync(stagedSource, stage, { recursive: true });

  return { parentDir, target, stage };
}

function verifyFrozen(target) {
  for (const name of protectedFiles) {
    assert.equal(
      hash(path.join(target, name)),
      hash(path.join(original, name)),
      "FROZEN_ARTIFACT_CHANGED:" + name
    );
  }
}

async function verifyPublished(target) {
  const manifest = read(path.join(target, "manifest.json"));
  const validation = await validateStagedRelease(target, manifest);

  assert.equal(validation.fixtureCount, 397);
  assert.equal(validation.detailCount, 397);
  assert.equal(manifest.hash, EXPECTED_MANIFEST);

  const fixtures = read(path.join(target, "fixtures.json")).fixtures;
  const originalFixtures =
    read(path.join(original, "fixtures.json")).fixtures;

  assert.deepEqual(
    fixtures.map(row => row.canonicalId || row.matchId),
    originalFixtures.map(row => row.canonicalId || row.matchId)
  );

  verifyFrozen(target);
}

test("397-fixture guarded adapter: promotion and both crash recoveries", async () => {
  const originalFixtureHash =
    hash(path.join(original, "fixtures.json"));

  const originalManifestHash =
    hash(path.join(original, "manifest.json"));

  const originalLatestHash = hash(latest);

  let observerExecuted = false;

  const result = await stageHistoricalStatusRelease({
    day: DAY,

    onValidatedSandboxStage: async ({
      stageDir,
      manifestHash,
      fixtureCount,
      upgradeCount
    }) => {
      observerExecuted = true;

      assert.equal(manifestHash, EXPECTED_MANIFEST);
      assert.equal(fixtureCount, 397);
      assert.equal(upgradeCount, 22);

      const temporary = fs.mkdtempSync(
        path.join(os.tmpdir(), "aiml-v35-real-adapter-")
      );

      try {
        console.log("=== REAL DATA: SUCCESSFUL PROMOTION ===");

        const success = makeScenario(
          temporary, "successful", stageDir
        );

        const inspected = inspectHistoricalPromotionSandbox({
          parentDir: success.parentDir
        });

        assert.equal(inspected.changed.length, 24);

        const promoted = promoteHistoricalReleaseGuardedSandbox({
          parentDir: success.parentDir,
          expectedTargetInventory: inspected.before
        });

        assert.equal(promoted.ok, true);
        assert.equal(promoted.sandboxOnly, true);
        assert.equal(promoted.changedFiles.length, 24);

        await verifyPublished(success.target);

        console.log("REAL_DATA_PROMOTION=PASS");
        console.log("PROMOTED_CHANGED_FILES=24");
        console.log("PROMOTED_FIXTURES=397");
        console.log("PROMOTED_DETAILS=397");

        for (const crash of [
          "after_backup",
          "after_promote"
        ]) {
          console.log(
            "=== REAL DATA: CRASH " + crash + " ==="
          );

          const s = makeScenario(
            temporary, crash, stageDir
          );

          const baseline = inspectHistoricalPromotionSandbox({
            parentDir: s.parentDir
          });

          const interrupted =
            promoteHistoricalReleaseGuardedSandbox({
              parentDir: s.parentDir,
              expectedTargetInventory: baseline.before,
              simulateCrashAt: crash
            });

          assert.equal(interrupted.simulatedCrash, true);
          assert.equal(interrupted.recoveryRequired, true);

          assert.throws(
            () => promoteHistoricalReleaseGuardedSandbox({
              parentDir: s.parentDir,
              expectedTargetInventory: baseline.before
            }),
            /promotion_existing_transaction_requires_recovery/
          );

          const recovered =
            recoverHistoricalReleaseGuardedSandbox({
              parentDir: s.parentDir
            });

          assert.equal(recovered.ok, true);
          assert.equal(recovered.restoredPreimage, true);

          const restored = inspectHistoricalPromotionSandbox({
            parentDir: s.parentDir
          });

          assert.deepEqual(restored.before, baseline.before);

          assert.equal(
            hash(path.join(s.target, "fixtures.json")),
            originalFixtureHash
          );

          assert.equal(
            hash(path.join(s.target, "manifest.json")),
            originalManifestHash
          );

          verifyFrozen(s.target);

          console.log(
            "REAL_DATA_RECOVERY_" +
            crash.toUpperCase() +
            "=PASS"
          );
        }

        console.log("REAL_DATA_ROLLBACK_PREIMAGE=BYTE_IDENTICAL");
        console.log("REAL_DATA_ADAPTER_SANDBOX_ONLY=TRUE");

        return {
          ok: true,
          sandboxOnly: true
        };
      } finally {
        fs.rmSync(temporary, {
          recursive: true,
          force: true
        });

        console.log("REAL_DATA_TEMPORARY_FILES_REMOVED=TRUE");
      }
    }
  });

  assert.equal(observerExecuted, true);
  assert.equal(result.ok, true);
  assert.equal(result.fixtureCount, 397);
  assert.equal(result.detailCount, 397);
  assert.equal(result.carriedCount, 10);
  assert.equal(result.upgradeCount, 22);
  assert.equal(result.modifiedDetailCount, 22);
  assert.equal(result.publicationAuthorized, false);

  assert.equal(
    hash(path.join(original, "fixtures.json")),
    originalFixtureHash
  );

  assert.equal(
    hash(path.join(original, "manifest.json")),
    originalManifestHash
  );

  assert.equal(hash(latest), originalLatestHash);

  console.log("REAL_REPOSITORY_SNAPSHOT_UNCHANGED=TRUE");
  console.log("REAL_LATEST_POINTER_UNCHANGED=TRUE");
  console.log("PRODUCTION_PROMOTION=FORBIDDEN");
  console.log("RESULT=V35_REAL_DATA_ADAPTER_PASS");
});