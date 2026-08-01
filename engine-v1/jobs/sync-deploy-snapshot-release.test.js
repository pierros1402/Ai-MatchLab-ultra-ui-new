import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalBufferSha256,
  computeDeploySnapshotManifestHash
} from "../core/deploy-snapshot-release-contract.js";
import {
  promoteDirectory,
  validateStagedRelease
} from "./sync-deploy-snapshot-from-github.js";

function jsonBuffer(value) {
  return Buffer.from(JSON.stringify(value, null, 2));
}

async function makeRelease(root) {
  const fixtures = { ok: true, fixtures: [{ matchId: "m1" }] };
  const value = { ok: true, picks: [] };
  const detail = { ok: true, basic: { matchId: "m1" } };
  const fixturesBuffer = jsonBuffer(fixtures);
  const valueBuffer = jsonBuffer(value);
  const detailBuffer = jsonBuffer(detail);

  await fs.promises.mkdir(path.join(root, "details"), { recursive: true });
  await fs.promises.writeFile(path.join(root, "fixtures.json"), fixturesBuffer);
  await fs.promises.writeFile(path.join(root, "value.json"), valueBuffer);
  await fs.promises.writeFile(path.join(root, "details", "m1.json"), detailBuffer);

  const manifest = {
    ok: true,
    version: "deploy-snapshot-v2",
    date: "2026-08-01",
    counts: { fixtures: 1, valuePicks: 0, details: 1 },
    files: { fixtures: "fixtures.json", value: "value.json", detailsDir: "details" },
    fileHashes: {
      "fixtures.json": canonicalBufferSha256(fixturesBuffer),
      "value.json": canonicalBufferSha256(valueBuffer)
    },
    details: [{
      file: "m1.json",
      bytes: detailBuffer.length,
      sha256: canonicalBufferSha256(detailBuffer),
      hasTravel: false,
      hasPlayerUsage: false,
      hasTeamNews: false,
      hasValue: false
    }]
  };
  manifest.hash = computeDeploySnapshotManifestHash(manifest);
  await fs.promises.writeFile(path.join(root, "manifest.json"), jsonBuffer(manifest));
  return manifest;
}

test("staged v2 release validates file, count and detail integrity", async t => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "aiml-release-"));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const manifest = await makeRelease(root);
  assert.deepEqual(await validateStagedRelease(root, manifest), {
    fixtureCount: 1,
    valueCount: 0,
    detailCount: 1
  });
});

test("directory promotion removes stale target files", async t => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "aiml-promote-"));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const stage = path.join(root, "stage");
  const target = path.join(root, "target");
  const backup = path.join(root, "backup");
  await fs.promises.mkdir(stage, { recursive: true });
  await fs.promises.mkdir(target, { recursive: true });
  await fs.promises.writeFile(path.join(stage, "new.json"), "new");
  await fs.promises.writeFile(path.join(target, "stale.json"), "stale");

  await promoteDirectory(stage, target, backup);

  assert.equal(fs.existsSync(path.join(target, "new.json")), true);
  assert.equal(fs.existsSync(path.join(target, "stale.json")), false);
  assert.equal(fs.existsSync(backup), false);
});
