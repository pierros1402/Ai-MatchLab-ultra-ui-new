import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalTextBuffer,
  canonicalBufferSha256,
  computeDeploySnapshotManifestHash,
  validateDeploySnapshotManifest
} from "./deploy-snapshot-release-contract.js";

function baseManifest() {
  const manifest = {
    ok: true,
    version: "deploy-snapshot-v2",
    date: "2026-08-01",
    counts: { fixtures: 1, valuePicks: 0, details: 1 },
    fixturesSource: "canonical",
    staticMinTargetFixtures: 1,
    minTargetFixtures: 1,
    minTargetFixtureSource: "test",
    canonicalCoverageFixtureCount: 1,
    coverage: { ok: true },
    sizes: { fixtures: 1 },
    fileHashes: {
      "fixtures.json": "a".repeat(64),
      "value.json": "b".repeat(64)
    },
    details: [{
      file: "match.json",
      bytes: 3,
      sha256: "c".repeat(64),
      hasTravel: false,
      hasPlayerUsage: false,
      hasTeamNews: false,
      hasValue: false
    }]
  };
  manifest.hash = computeDeploySnapshotManifestHash(manifest);
  return manifest;
}

test("canonical text hashes are checkout-newline invariant", () => {
  assert.deepEqual(canonicalTextBuffer(Buffer.from("a\r\nb\r\n")), Buffer.from("a\nb\n"));
  assert.equal(
    canonicalBufferSha256(Buffer.from("a\r\nb\r\n")),
    canonicalBufferSha256(Buffer.from("a\nb\n"))
  );
});

test("v2 manifest validates exact file and detail binding", () => {
  const manifest = baseManifest();
  assert.deepEqual(validateDeploySnapshotManifest(manifest, manifest.date).errors, []);
});

test("manifest hash rejects detail or file-hash drift", () => {
  const manifest = baseManifest();
  manifest.details[0].bytes = 4;
  assert.match(validateDeploySnapshotManifest(manifest, manifest.date).errors.join(","), /manifest_hash_mismatch/);
});

test("present red Value gate cannot be masked by top-level manifest ok", () => {
  const manifest = baseManifest();
  manifest.valueGate = {
    fixtures: 1,
    valuePicks: 0,
    valueFreshAgainstCanonical: false,
    ok: false
  };
  // v2 hash semantics remain unchanged in this repair; release validation is
  // the fail-closed publication gate for the new field.
  manifest.hash = computeDeploySnapshotManifestHash(manifest);

  const result = validateDeploySnapshotManifest(manifest, manifest.date);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(","), /manifest_value_gate_not_ok/);
});

test("present green Value gate validates without changing v2 hash semantics", () => {
  const manifest = baseManifest();
  manifest.valueGate = {
    fixtures: 1,
    valuePicks: 0,
    valueFreshAgainstCanonical: true,
    ok: true
  };
  manifest.hash = computeDeploySnapshotManifestHash(manifest);
  assert.equal(validateDeploySnapshotManifest(manifest, manifest.date).ok, true);
});

test("legacy manifest remains hash-compatible when v2 fields are absent", () => {
  const manifest = baseManifest();
  delete manifest.fileHashes;
  delete manifest.details[0].sha256;
  manifest.version = "deploy-snapshot-v1";
  manifest.hash = computeDeploySnapshotManifestHash(manifest);
  assert.equal(validateDeploySnapshotManifest(manifest, manifest.date).ok, true);
});