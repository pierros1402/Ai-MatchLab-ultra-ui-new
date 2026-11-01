import test from "node:test";
import assert from "node:assert/strict";
import { planPublishedFinalRefresh } from "./refresh-published-final-status-day.js";
const day = "2026-10-30";
const pre = { canonicalId: "cid_one", homeTeam: "Home", awayTeam: "Away", status: "SECOND_HALF", scoreHome: 0, scoreAway: 0 };
const ft = { ...pre, status: "FT", scoreHome: 2, scoreAway: 1 };
const result = { ...ft, matchId: "cid_one", date: day, verifiedFinalTruth: true };
const plan = (overrides = {}) => planPublishedFinalRefresh({ day, published: [pre], canonical: [ft], results: new Map([["cid_one", result]]), ...overrides });
test("verified final closes a published live row without admitting late fixtures", () => {
  const p = plan({ canonical: [ft, { ...ft, canonicalId: "late" }] });
  assert.deepEqual(p.upgrades, ["cid_one"]);
  assert.deepEqual(p.fixtureIds, ["cid_one"]);
  assert.equal(pre.status, "SECOND_HALF");
});
test("existing final is immutable and an unchanged release is idempotent", () => {
  assert.deepEqual(plan({ published: [ft] }).upgrades, []);
  assert.throws(() => plan({ published: [ft], canonical: [{ ...ft, scoreAway: 2 }] }), /terminal_revision_forbidden/);
  assert.throws(() => plan({ published: [ft], canonical: [pre] }), /terminal_revision_forbidden/);
});
test("wrong-day, wrong-team, unverified and conflicting scores cannot publish FT", () => {
  for (const mutation of [{ date: "2026-10-31" }, { awayTeam: "Other" }, { matchId: "other" }, { verifiedFinalTruth: false }, { scoreHome: 9 }]) {
    assert.throws(() => plan({ results: new Map([["cid_one", { ...result, ...mutation }]]) }), /verified_binding_required/);
  }
  assert.throws(() => plan({ results: new Map() }), /verified_binding_required/);
});
test("missing and duplicate identities fail closed; time alone never makes a final", () => {
  assert.throws(() => plan({ canonical: [] }), /missing_canonical/);
  assert.throws(() => plan({ canonical: [ft, ft] }), /duplicate_identity/);
  assert.throws(() => plan({ published: [pre, pre] }), /duplicate_identity/);
  assert.deepEqual(plan({ canonical: [pre], results: new Map() }).upgrades, []);
});
