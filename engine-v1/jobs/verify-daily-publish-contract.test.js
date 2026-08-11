import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { computeDeploySnapshotManifestHash } from "../core/deploy-snapshot-release-contract.js";
import { verifyDailyPublishContract } from "./verify-daily-publish-contract.js";

const DAY = "2026-08-11";

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildManifest(valueGate) {
  const manifest = {
    ok: true,
    version: "deploy-snapshot-v2",
    date: DAY,
    generatedAt: "2026-08-11T05:00:00.000Z",
    counts: { fixtures: 0, valuePicks: 0, details: 0 },
    fixturesSource: "canonical",
    staticMinTargetFixtures: 0,
    minTargetFixtures: 0,
    minTargetFixtureSource: "test",
    canonicalCoverageFixtureCount: 0,
    coverage: { ok: true },
    sizes: {},
    fileHashes: {
      "fixtures.json": "a".repeat(64),
      "value.json": "b".repeat(64)
    },
    details: [],
    valueGate
  };
  manifest.hash = computeDeploySnapshotManifestHash(manifest);
  return manifest;
}

function withPublishTree(valueGate, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-publish-contract-"));
  const dataPath = (...parts) => path.join(root, ...parts);
  const snapshot = dataPath("deploy-snapshots", DAY);
  const manifest = buildManifest(valueGate);

  writeJson(path.join(snapshot, "fixtures.json"), { date: DAY, fixtures: [] });
  writeJson(path.join(snapshot, "manifest.json"), manifest);
  writeJson(path.join(snapshot, "invariant-report.json"), {
    ok: true,
    valueSafe: true,
    manifestGeneratedAt: manifest.generatedAt
  });
  writeJson(path.join(snapshot, "value.json"), {
    count: 0,
    picks: [],
    source: "local_value_file"
  });
  writeJson(path.join(snapshot, "freshness-report.json"), { ok: true });
  writeJson(path.join(snapshot, "value-audit.json"), { ok: true });
  writeJson(dataPath("build-reports", `${DAY}.json`), {
    ok: true,
    clean: true,
    hardFailures: []
  });
  writeJson(dataPath("foundation-integrity", `${DAY}.json`), {
    dayKey: DAY,
    modelReady: true,
    publicationReady: true
  });
  writeJson(dataPath("system-health", `${DAY}.json`), {
    dayKey: DAY,
    severity: "ok",
    issueCounts: { error: 0 }
  });
  writeJson(dataPath("deploy-snapshots", "latest.json"), {
    date: DAY,
    hash: manifest.hash
  });

  try {
    return fn({ dataPath, manifest });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("daily publish contract accepts a release-valid green Value gate", () => {
  withPublishTree(
    {
      fixtures: 0,
      valuePicks: 0,
      valueFreshAgainstCanonical: true,
      ok: true
    },
    ({ dataPath }) => {
      const report = verifyDailyPublishContract(DAY, { resolveDataPath: dataPath });
      assert.equal(report.ok, true, JSON.stringify(report.blocked));
      assert.deepEqual(report.blocked, []);
    }
  );
});

test("daily publish contract blocks top-level ok manifest with red Value gate", () => {
  withPublishTree(
    {
      fixtures: 80,
      valuePicks: 5,
      valueFreshAgainstCanonical: false,
      ok: false
    },
    ({ dataPath }) => {
      const report = verifyDailyPublishContract(DAY, { resolveDataPath: dataPath });
      assert.equal(report.ok, false);
      const blocked = report.blocked.find(row => row.code === "manifest_release_contract_failed");
      assert.ok(blocked);
      assert.ok(blocked.errors.includes("manifest_value_gate_not_ok"));
    }
  );
});
