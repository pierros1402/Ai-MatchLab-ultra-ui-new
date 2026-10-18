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

test('all 417 affected fixtures are planned from 834 defects; a truncated report cannot drive repair',()=>{
 const fixtures=Array.from({length:417},(_,i)=>({canonicalId:'cid_audit_'+i}));
 const issues=fixtures.flatMap(f=>['DETAIL_HISTORY_INDEX_FINGERPRINT_STALE','DETAIL_H2H_FINGERPRINT_STALE'].map(code=>({id:f.canonicalId,code})));
 const full=planValueDataRecovery({ok:false,summary:{issueCount:834},issues},fixtures);
 assert.equal(full.status,'REPAIRABLE');assert.equal(full.fixtureIds.length,417);
 const partial=planValueDataRecovery({ok:false,summary:{issueCount:834},issues:issues.slice(0,500)},fixtures);
 assert.equal(partial.status,'BLOCKED');assert.ok(partial.reasons.includes('incomplete_audit_issues'));
});
