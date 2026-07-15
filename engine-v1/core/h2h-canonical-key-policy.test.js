import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalH2HTeamIdentity,
  canonicalH2HPairIdentity,
  compactRawIdentityKey,
  isDegradedH2HPairKey,
  legacyH2HPairIdentity
} from "./h2h-canonical-key-policy.js";

const noAliases = () => null;

test("generic-only AFC receives a non-empty raw identity fallback", () => {
  const id = canonicalH2HTeamIdentity("AFC", { resolveCanonical: noAliases });
  assert.equal(id.primaryKey, "");
  assert.equal(id.key, "afc");
  assert.equal(id.keyMode, "raw_identity_fallback");
  assert.equal(id.valid, true);
});

test("ordinary composite AFC name keeps the existing normalized key", () => {
  const id = canonicalH2HTeamIdentity("AFC Wimbledon", { resolveCanonical: noAliases });
  assert.equal(id.primaryKey, "wimbledon");
  assert.equal(id.key, "wimbledon");
  assert.equal(id.usedFallback, false);
});

test("raw fallback normalization is deterministic across punctuation and case", () => {
  assert.equal(compactRawIdentityKey(" A.F.C. "), "afc");
  assert.equal(compactRawIdentityKey("Á.F.C"), "afc");
});

test("pair policy repairs the legacy empty half without changing the other half", () => {
  const pair = canonicalH2HPairIdentity("AFC", "Eemdijk", {
    resolveCanonical: noAliases
  });
  assert.equal(pair.key, "afc~eemdijk");
  assert.equal(pair.fallbackHalfCount, 1);
  assert.equal(pair.valid, true);
  assert.equal(pair.degraded, false);
});

test("legacy pair policy exposes the same AFC degradation found in production", () => {
  const pair = legacyH2HPairIdentity("AFC", "NEC Nijmegen", {
    resolveCanonical: noAliases
  });
  assert.equal(pair.key, "~necnijmegen");
  assert.equal(pair.degraded, true);
  assert.equal(isDegradedH2HPairKey(pair.key), true);
});

test("distinct canonical names sharing a final key fail closed as a collision", () => {
  const pair = canonicalH2HPairIdentity("Alpha FC", "Alpha", {
    resolveCanonical: noAliases
  });
  assert.equal(pair.key, "alpha~alpha");
  assert.equal(pair.collision, true);
  assert.equal(pair.valid, false);
  assert.equal(pair.reasonCode, "h2h_team_key_collision_requires_review");
});
