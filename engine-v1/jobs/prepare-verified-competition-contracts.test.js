import test from "node:test";
import assert from "node:assert/strict";
import { verifiedIsraelContract } from "./prepare-verified-competition-contracts.js";
test("primary team-count evidence is season bound and never overrides conflicting authority", () => {
  const old = { competition: { slug: "isr.2" }, season: { reference: "2025-2026" }, authority: { status: "UNVERIFIED", scopes: [] }, rules: { promotion: { status: "UNVERIFIED" } } };
  const now = Date.parse("2026-10-01T00:00:00Z");
  const candidate = verifiedIsraelContract(old, now);
  assert.deepEqual(candidate.authority.scopes, ["TEAM_COUNT"]);
  assert.equal(candidate.teamCount.rule.value, 16);
  assert.deepEqual(candidate.rules, old.rules);
  assert.equal(old.season.reference, "2025-2026");
  assert.equal(verifiedIsraelContract(candidate, now), null);
  assert.throws(() => verifiedIsraelContract(old, Date.parse("2027-10-01T00:00:00Z")), /season_expired/);
  assert.throws(() => verifiedIsraelContract({ ...candidate, teamCount: { rule: { mode: "EXACT", value: 17 } } }, now), /authority_conflict/);
});
