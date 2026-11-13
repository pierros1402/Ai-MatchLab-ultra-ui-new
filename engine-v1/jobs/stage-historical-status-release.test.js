import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { resolveDataPath } from "../storage/data-root.js";
import {
  promoteHistoricalReleaseSandbox,
  snapshotSandboxInventory
} from "./historical-release-transaction-sandbox.js";
import { validateStagedRelease }
  from "./sync-deploy-snapshot-from-github.js";
import { stageHistoricalStatusRelease }
  from "./stage-historical-status-release.js";

const hash = file => crypto.createHash("sha256")
  .update(fs.readFileSync(file)).digest("hex");

test("real November 8 historical staging is valid and nonpublishing", async () => {
  const day = "2026-11-08";
  const fixtureFile = resolveDataPath(
    "deploy-snapshots", day, "fixtures.json"
  );
  const latestFile = resolveDataPath(
    "deploy-snapshots", "latest.json"
  );

  const beforeFixture = hash(fixtureFile);
  const beforeLatest = hash(latestFile);

  const result = await stageHistoricalStatusRelease({ day });

  assert.equal(result.ok, true);
  assert.equal(result.fixtureCount, 397);
  assert.equal(result.detailCount, 397);
  assert.equal(result.carriedCount, 10);
  assert.equal(result.upgradeCount, 22);
  assert.equal(result.modifiedDetailCount, 22);
  assert.equal(result.originalUnchanged, true);
  assert.equal(result.latestUnchanged, true);
  assert.equal(result.publicationAuthorized, false);
  assert.equal(hash(fixtureFile), beforeFixture);
  assert.equal(hash(latestFile), beforeLatest);
});

test("invalid date fails before staging", async () => {
  await assert.rejects(
    stageHistoricalStatusRelease({
      day: "../2026-11-08"
    }),
    /historical_stage_invalid_day/
  );
});

test("invalid patch timestamp fails before staging", async () => {
  await assert.rejects(
    stageHistoricalStatusRelease({
      day: "2026-11-08",
      patchedAt: "not-a-timestamp"
    }),
    /historical_stage_invalid_patch_time/
  );
});

test("staging module contains no production promotion operation", () => {
  const source = fs.readFileSync(
    new URL("./stage-historical-status-release.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(
    source,
    /renameSync|rename\(|copyFileSync|updateLatest\s*:\s*true/
  );
});
test("real staged release promotes and rolls back in sandbox", async () => {
  const day = "2026-11-08";
  const original = resolveDataPath("deploy-snapshots", day);
  const latest = resolveDataPath("deploy-snapshots", "latest.json");
  const originalFixtureHash = hash(
    path.join(original, "fixtures.json")
  );
  const originalLatestHash = hash(latest);

  let observerCalled = false;

  const result = await stageHistoricalStatusRelease({
    day,
    onValidatedSandboxStage: async ({
      stageDir,
      manifestHash,
      fixtureCount,
      upgradeCount
    }) => {
      observerCalled = true;

      assert.equal(fixtureCount, 397);
      assert.equal(upgradeCount, 22);
      assert.equal(
        manifestHash,
        "0f9f3ab7518cac7fddcd171bb806f2628b98b6376f6644144145f2034b8a2865"
      );

      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "aiml-v35-integrated-tx-")
      );

      try {
        const successRoot = path.join(root, "success");
        const successTarget = path.join(successRoot, "target");
        const successStage = path.join(successRoot, "stage");

        fs.mkdirSync(successRoot);
        fs.cpSync(original, successTarget, { recursive: true });
        fs.cpSync(stageDir, successStage, { recursive: true });

        const beforeSuccess = snapshotSandboxInventory(successTarget);
        const promoted = promoteHistoricalReleaseSandbox({
          targetDir: successTarget,
          stageDir: successStage,
          expectedTargetInventory: beforeSuccess
        });

        assert.equal(promoted.ok, true);
        assert.equal(promoted.sandboxOnly, true);
        assert.equal(promoted.changedFiles.length, 24);

        const promotedManifest = JSON.parse(
          fs.readFileSync(
            path.join(successTarget, "manifest.json"), "utf8"
          )
        );

        const validated = await validateStagedRelease(
          successTarget, promotedManifest
        );

        assert.equal(validated.fixtureCount, 397);
        assert.equal(validated.detailCount, 397);
        assert.equal(promotedManifest.hash, manifestHash);

        const failureRoot = path.join(root, "failure");
        const failureTarget = path.join(failureRoot, "target");
        const failureStage = path.join(failureRoot, "stage");

        fs.mkdirSync(failureRoot);
        fs.cpSync(original, failureTarget, { recursive: true });
        fs.cpSync(stageDir, failureStage, { recursive: true });

        const beforeFailure = snapshotSandboxInventory(failureTarget);

        assert.throws(
          () => promoteHistoricalReleaseSandbox({
            targetDir: failureTarget,
            stageDir: failureStage,
            expectedTargetInventory: beforeFailure,
            injectFailureAt: "after_promote"
          }),
          /injected_after_promote/
        );

        assert.deepEqual(
          snapshotSandboxInventory(failureTarget),
          beforeFailure
        );

        console.log("INTEGRATED_PROMOTION=PASS");
        console.log("INTEGRATED_CHANGED_FILES=24");
        console.log("INTEGRATED_ROLLBACK=PASS");
        console.log("INTEGRATED_RELEASE_VALIDATION=PASS");

        return { ok: true, sandboxOnly: true };
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  assert.equal(observerCalled, true);
  assert.equal(result.ok, true);
  assert.equal(result.publicationAuthorized, false);
  assert.equal(result.originalUnchanged, true);
  assert.equal(result.latestUnchanged, true);
  assert.equal(hash(path.join(original, "fixtures.json")), originalFixtureHash);
  assert.equal(hash(latest), originalLatestHash);
});

test("sandbox observer cannot grant publication authority", async () => {
  await assert.rejects(
    stageHistoricalStatusRelease({
      day: "2026-11-08",
      onValidatedSandboxStage: async () => ({
        ok: true,
        sandboxOnly: false
      })
    }),
    /historical_stage_sandbox_proof_invalid/
  );
});

test("invalid sandbox observer fails closed", async () => {
  await assert.rejects(
    stageHistoricalStatusRelease({
      day: "2026-11-08",
      onValidatedSandboxStage: true
    }),
    /historical_stage_observer_invalid/
  );
});
