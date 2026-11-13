import test from "node:test";
import assert from "node:assert/strict";

import {
  assessHistoricalPublicationAdmission
} from "./historical-publication-admission.js";

const valid = () => ({
  day: "2026-11-08",
  latestDay: "2026-11-12",
  apply: false,
  observation: {
    ok: true,
    day: "2026-11-08",
    observationOnly: true,
    publicationAuthorized: false,
    originalUnchanged: true,
    latestUnchanged: true,
    changed: false,
    fixtureCount: 397,
    detailCount: 397,
    carriedCount: 10,
    upgradeCount: 22,
    modifiedDetailCount: 22,
    manifestHash: "a".repeat(64)
  }
});

test("valid historical observation is review-ready, never publishable", () => {
  const result = assessHistoricalPublicationAdmission(valid());

  assert.equal(result.observationEvidenceAcceptable, true);
  assert.equal(result.localReadinessOnly, true);
  assert.equal(result.publicationAuthorized, false);
  assert.equal(result.productionPromotionAllowed, false);
  assert.equal(result.workflowMutationAllowed, false);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.pendingReleaseControls.length, 5);
});

test("apply cannot acquire publication authority", () => {
  const input = valid();
  input.apply = true;

  const result = assessHistoricalPublicationAdmission(input);

  assert.equal(result.observationEvidenceAcceptable, false);
  assert.equal(result.publicationAuthorized, false);
  assert.ok(result.blockers.includes(
    "apply_not_permitted_by_admission_v1"
  ));
});

test("latest-day and future-day requests are rejected", () => {
  for (const day of ["2026-11-12", "2026-11-13", "bad"]) {
    const input = valid();
    input.day = day;
    input.observation.day = day;

    const result = assessHistoricalPublicationAdmission(input);

    assert.equal(result.observationEvidenceAcceptable, false);
    assert.equal(result.productionPromotionAllowed, false);
    assert.ok(result.blockers.includes(
      "closed_historical_day_not_established"
    ));
  }
});

test("malformed observation and count inconsistencies fail closed", () => {
  const cases = [
    { fixtureCount: 398 },
    { modifiedDetailCount: 23 },
    { carriedCount: 390 },
    { observationOnly: false },
    { publicationAuthorized: true },
    { originalUnchanged: false },
    { latestUnchanged: false },
    { changed: true },
    { manifestHash: "invalid" }
  ];

  for (const patch of cases) {
    const input = valid();
    Object.assign(input.observation, patch);

    const result = assessHistoricalPublicationAdmission(input);

    assert.equal(result.observationEvidenceAcceptable, false);
    assert.equal(result.publicationAuthorized, false);
    assert.ok(result.blockers.length > 0);
  }
});

test("self-declared authorization flags cannot override denial", () => {
  const input = valid();

  input.observation.productionAuthorized = true;
  input.observation.externalGrant = "APPROVED";
  input.observation.releaseApproved = true;

  const result = assessHistoricalPublicationAdmission(input);

  assert.equal(result.observationEvidenceAcceptable, true);
  assert.equal(result.publicationAuthorized, false);
  assert.equal(result.productionPromotionAllowed, false);
  assert.equal(result.workflowMutationAllowed, false);
});

test("unknown and empty inputs never authorize publication", () => {
  for (const input of [
    {},
    { day: "2026-11-08" },
    { observation: null },
    { day: "2026-11-08", latestDay: "2026-11-12" }
  ]) {
    const result = assessHistoricalPublicationAdmission(input);

    assert.equal(result.publicationAuthorized, false);
    assert.equal(result.productionPromotionAllowed, false);
    assert.equal(result.workflowMutationAllowed, false);
    assert.equal(result.observationEvidenceAcceptable, false);
  }
});