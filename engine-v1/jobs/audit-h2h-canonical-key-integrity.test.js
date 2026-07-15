import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auditH2HPayload,
  buildH2HCanonicalKeyAudit,
  computeH2HInventoryHash,
  assertReportOutputOutsideH2H
} from "./audit-h2h-canonical-key-integrity.js";

const noAliases = () => null;

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aiml-h2h-audit-"));
}

function payload(teamA = "AFC", teamB = "Eemdijk") {
  return {
    teamA,
    teamB,
    matches: [{
      matchId: "759210",
      date: "2025-10-30",
      homeTeam: "Eemdijk",
      awayTeam: "AFC",
      scoreHome: 1,
      scoreAway: 2,
      leagueSlug: "ned.cup"
    }]
  };
}

test("payload audit identifies a legacy degraded key and its safe target", () => {
  const report = auditH2HPayload("~eemdijk.json", payload(), {
    resolveCanonical: noAliases
  });
  assert.equal(report.legacyDegradedPairKey, true);
  assert.equal(report.policyDegradedPairKey, false);
  assert.equal(report.expectedFileName, "afc~eemdijk.json");
  assert.equal(report.nonCanonicalFileName, true);
});


test("canonical AFC filename clears the legacy degraded-file count", () => {
  const report = auditH2HPayload("afc~eemdijk.json", payload(), {
    resolveCanonical: noAliases
  });
  assert.equal(report.legacyPolicyWouldDegrade, true);
  assert.equal(report.sourceDegradedPairKey, false);
  assert.equal(report.legacyDegradedPairKey, false);
  assert.equal(report.nonCanonicalFileName, false);
});

test("stored match from another pair fails closed", () => {
  const p = payload();
  p.matches[0].awayTeam = "NEC Nijmegen";
  const report = auditH2HPayload("~eemdijk.json", p, {
    resolveCanonical: noAliases
  });
  assert.equal(report.storedPairMismatchCount, 1);
});

test("malformed match row is counted as invalid", () => {
  const p = payload();
  delete p.matches[0].scoreAway;
  const report = auditH2HPayload("~eemdijk.json", p, {
    resolveCanonical: noAliases
  });
  assert.equal(report.invalidMatchCount, 1);
});

test("directory audit is deterministic and byte-preserving", () => {
  const dir = tempDir();
  const file = path.join(dir, "~eemdijk.json");
  fs.writeFileSync(file, JSON.stringify(payload(), null, 2), "utf8");
  const before = computeH2HInventoryHash(dir);
  const report = buildH2HCanonicalKeyAudit({ h2hDir: dir, resolveCanonical: noAliases });
  const after = computeH2HInventoryHash(dir);
  assert.deepEqual(after, before);
  assert.equal(report.inventory.byteIdenticalAfterAudit, true);
  assert.equal(report.summary.nonCanonicalFileNameCount, 1);
});

test("two source files resolving to one target are surfaced as a collision group", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "~eemdijk.json"), JSON.stringify(payload(), null, 2), "utf8");
  fs.writeFileSync(path.join(dir, "afc~eemdijk.json"), JSON.stringify(payload(), null, 2), "utf8");
  const report = buildH2HCanonicalKeyAudit({ h2hDir: dir, resolveCanonical: noAliases });
  assert.equal(report.summary.targetCollisionCount, 1);
});

test("report output guard rejects the H2H truth directory", () => {
  const dir = tempDir();
  assert.throws(
    () => assertReportOutputOutsideH2H(path.join(dir, "audit.json"), dir),
    /outside the H2H truth directory/
  );
});
