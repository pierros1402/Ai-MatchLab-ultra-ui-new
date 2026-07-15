import test from "node:test";
import assert from "node:assert/strict";
import { canonPairKey } from "../storage/h2h-memory-db.js";
import { orientedPair } from "./migrate-h2h-canonical-keys.js";
import { auditH2HPayload as auditSemanticH2H } from "./audit-history-semantic-integrity.js";
import { auditH2HPayload as auditCanonicalH2H } from "./audit-h2h-canonical-key-integrity.js";

const payload = {
  teamA: "AFC",
  teamB: "Eemdijk",
  matches: [{ matchId: "759210", date: "2025-10-30", homeTeam: "Eemdijk", awayTeam: "AFC", scoreHome: 1, scoreAway: 2, leagueSlug: "ned.cup" }]
};

test("H2H storage consumer uses the non-empty AFC fallback", () => {
  assert.equal(canonPairKey("AFC", "Eemdijk"), "afc~eemdijk");
});

test("migration consumer produces the same canonical pair", () => {
  const pair = orientedPair("AFC", "Eemdijk");
  assert.equal(pair.key, "afc~eemdijk");
  assert.equal(pair.teamA, "AFC");
});

test("semantic history audit expects the canonical AFC filename", () => {
  const report = auditSemanticH2H("afc~eemdijk.json", payload);
  assert.equal(report.expectedFileName, "afc~eemdijk.json");
  assert.equal(report.nonCanonicalFileName, false);
  assert.equal(report.degradedPairKey, false);
});

test("dedicated H2H audit treats canonical AFC filename as repaired", () => {
  const report = auditCanonicalH2H("afc~eemdijk.json", payload, { resolveCanonical: () => null });
  assert.equal(report.legacyPolicyWouldDegrade, true);
  assert.equal(report.legacyDegradedPairKey, false);
  assert.equal(report.policyDegradedPairKey, false);
  assert.equal(report.nonCanonicalFileName, false);
});
