import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isHistoricalSnapshotComparisonOptional,
  shouldSyncRollingOddsForRelease,
  stageRuntimeReleaseArtifacts
} from "./sync-deploy-snapshot-from-github.js";

test("historical omission requires a strictly newer immutable latest day", () => {
  assert.equal(isHistoricalSnapshotComparisonOptional("2026-10-27", { date: "2026-10-29" }), true);
  assert.equal(isHistoricalSnapshotComparisonOptional("2026-10-29", { date: "2026-10-29" }), false);
  assert.equal(isHistoricalSnapshotComparisonOptional("2026-10-30", { date: "2026-10-29" }), false);
  assert.equal(isHistoricalSnapshotComparisonOptional("2026-10-27", null), false);
  assert.equal(isHistoricalSnapshotComparisonOptional("2026-10-27", { date: "2026-10-xx" }), false);
  assert.equal(isHistoricalSnapshotComparisonOptional("invalid", { date: "2026-10-29" }), false);
});

async function withStage(t, fn) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "aiml-historical-comparison-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const stats = { filesDownloaded: 0, bytesDownloaded: 0 };
  return fn({ root, stats });
}

const example = (root, stats, fetchArtifact, allowMissingHistoricalComparison) => ({
  repo: "example/repo",
  ref: "a".repeat(40),
  day: "2026-10-27",
  stageDayDir: root,
  stats,
  requireDiagnostics: false,
  fetchArtifact,
  allowMissingHistoricalComparison
});

test("historical snapshot stage accepts only an actual absent comparison (404)", async t => {
  await withStage(t, async ({root, stats}) => {
    const calls = [];
    const fetchArtifact = async (url, options = {}) => {
      calls.push({url, optional: options.optional});
      return null; // simulated 404 for optional artifacts
    };
    const result = await stageRuntimeReleaseArtifacts(
      example(root, stats, fetchArtifact, true)
    );
    assert.equal(result.comparisonPresent, false);
    assert.equal(result.comparisonBuffer, null);
    assert.equal(stats.filesDownloaded, 0);
    assert.equal(fs.existsSync(path.join(root, "runtime", "value-comparison.json")), false);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].optional, true);
  });
});

test("current/latest day does not accept a missing comparison", async t => {
  await withStage(t, async ({root, stats}) => {
    const fetchArtifact = async () => null;
    await assert.rejects(
      stageRuntimeReleaseArtifacts(example(root, stats, fetchArtifact, false)),
      /value_comparison_required_for_current_release/
    );
  });
});

test("historical comparison present but invalid remains fail-closed", async t => {
  await withStage(t, async ({root, stats}) => {
    const fetchArtifact = async (url) =>
      url.includes("/value-comparison/")
        ? Buffer.from(JSON.stringify({ok: true, date: "2026-10-27", plans: {}}))
        : null;
    await assert.rejects(
      stageRuntimeReleaseArtifacts(example(root, stats, fetchArtifact, true)),
      /value_comparison_four_plan_contract_failed/
    );
  });
});

test("historical comparison present and complete is retained byte-exact", async t => {
  await withStage(t, async ({root, stats}) => {
    const comparison = Buffer.from(JSON.stringify({
      ok: true, date: "2026-10-27",
      plans: {A:{}, A2:{}, B:{}, B2:{}}
    }));
    const fetchArtifact = async url => url.includes("/value-comparison/") ? comparison : null;
    const result = await stageRuntimeReleaseArtifacts(example(root, stats, fetchArtifact, true));
    assert.equal(result.comparisonPresent, true);
    assert.equal(stats.filesDownloaded, 1);
    assert.deepEqual(
      await fsp.readFile(path.join(root, "runtime", "value-comparison.json")),
      comparison
    );
  });
});

test("historical release never overwrites rolling odds for newer days", () => {
  assert.equal(shouldSyncRollingOddsForRelease(false), false);
  assert.equal(shouldSyncRollingOddsForRelease(true), true);
  assert.equal(shouldSyncRollingOddsForRelease(undefined), false);
  assert.equal(shouldSyncRollingOddsForRelease("true"), false);
});
