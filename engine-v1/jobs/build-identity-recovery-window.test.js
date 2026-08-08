import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildIdentityRecoveryWindow } from "./build-identity-recovery-window.js";

function fixture(id, source, homeTeam, awayTeam) {
  return {
    canonicalId: id,
    source,
    sourceId: `${source}-${id}`,
    dayKey: "2026-08-08",
    leagueSlug: "test.1",
    kickoffUtc: "2026-08-08T18:45:00.000Z",
    homeTeam,
    awayTeam,
  };
}

function runtime(bindings = {}) {
  return {
    schema: "test-runtime",
    hashes: { extensionLedger: "abc123" },
    effectiveCounts: { identityBindings: 1 },
    resolver: {
      resolveTeamReference({ alias }) {
        return bindings[alias]
          ? { ok: true, globalClubId: bindings[alias] }
          : { ok: false, status: "UNKNOWN" };
      },
      resolveFixtureId() {
        return { ok: false, status: "UNKNOWN" };
      },
    },
  };
}

test("window artifact persists raw pre-dedup recovery candidates deterministically", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-id-recovery-"));
  const canonicalRoot = path.join(root, "canonical");
  const outputRoot = path.join(root, "recovery");
  const dayDir = path.join(canonicalRoot, "2026-08-08");
  fs.mkdirSync(dayDir, { recursive: true });
  fs.writeFileSync(path.join(dayDir, "test.1.json"), JSON.stringify({
    leagueSlug: "test.1",
    updatedAt: "2026-08-08T19:00:00.000Z",
    fixtures: [
      fixture("fs-1", "flashscore", "Stable FC", "Short Away"),
      fixture("espn-1", "espn", "Stable FC", "Different Away"),
    ],
  }));

  const options = {
    daysBack: 0,
    daysForward: 0,
    canonicalRoot,
    outputRoot,
    resolverRuntime: runtime(),
  };
  const first = buildIdentityRecoveryWindow("2026-08-08", options);
  const before = fs.readFileSync(first.outputPath, "utf8");
  const second = buildIdentityRecoveryWindow("2026-08-08", options);
  const after = fs.readFileSync(second.outputPath, "utf8");

  assert.equal(first.artifact.status, "AUTO_PROMOTION_READY");
  assert.equal(first.artifact.summary.autoPromotable, 1);
  assert.equal(first.artifact.summary.inputRows, 2);
  assert.equal(first.artifact.source, "raw_canonical_fixtures_pre_dedup");
  assert.equal(first.artifact.promotionPolicy.broadFuzzyAllowed, false);
  assert.equal(before, after);
});

test("window artifact fails closed on malformed canonical fixture files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-id-recovery-bad-"));
  const canonicalRoot = path.join(root, "canonical");
  const dayDir = path.join(canonicalRoot, "2026-08-08");
  fs.mkdirSync(dayDir, { recursive: true });
  fs.writeFileSync(path.join(dayDir, "test.1.json"), "{not-json");

  assert.throws(() => buildIdentityRecoveryWindow("2026-08-08", {
    daysBack: 0,
    daysForward: 0,
    canonicalRoot,
    outputRoot: path.join(root, "recovery"),
    resolverRuntime: runtime(),
  }), /identity_recovery_invalid_fixture_file/u);
});
