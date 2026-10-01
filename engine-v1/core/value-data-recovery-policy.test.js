import test from "node:test";
import assert from "node:assert/strict";
import { planValueDataRecovery, missingUpcomingAssessmentFixtures } from "./value-data-recovery-policy.js";
const fixtures = [{ canonicalId: "cid_one", kickoffUtc: "2026-10-01T20:00Z" }];
test("only known stale-detail defects inside the published universe are repairable", () => {
  const audit = { ok: false, issues: [{ code: "DETAIL_H2H_FINGERPRINT_STALE", id: "cid_one" }] };
  assert.equal(planValueDataRecovery(audit, fixtures).status, "REPAIRABLE");
  assert.equal(planValueDataRecovery({ ok: false, issues: [{ code: "CURRENT_DERIVED_FOUNDATION_NOT_READY", id: "cid_one" }] }, fixtures).status, "BLOCKED");
  assert.equal(planValueDataRecovery(audit, fixtures, { maxFixtures: 0 }).status, "BLOCKED");
  assert.equal(planValueDataRecovery(audit, []).status, "BLOCKED");
  assert.equal(planValueDataRecovery(null, fixtures).status, "BLOCKED");
});
test("missing assessments are only regenerated before kickoff, never for ambiguous identities", () => {
  const join = { joinedMatches: [], ambiguousCanonicalMatches: [] };
  assert.equal(missingUpcomingAssessmentFixtures(fixtures, join, Date.parse("2026-10-01T19:00Z")).length, 1);
  assert.equal(missingUpcomingAssessmentFixtures(fixtures, join, Date.parse("2026-10-01T20:00Z")).length, 0);
  assert.equal(missingUpcomingAssessmentFixtures(fixtures, { ...join, ambiguousCanonicalMatches: [{ canonicalId: "cid_one" }] }, 0).length, 0);
});
