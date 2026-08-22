import test from "node:test";
import assert from "node:assert/strict";

import {
  modelAssessmentCoverageVerdict
} from "../jobs/refresh-model-assessment-coverage-day.js";

function assessedRow(id) {
  return {
    canonicalId: id,
    aiAssessment: {
      markets: {
        OU25: {
          probs: { over: 0.7, under: 0.3 }
        }
      }
    }
  };
}

test("coverage passes when every future fixture is assessed or explicitly evidence-limited", () => {
  const result = modelAssessmentCoverageVerdict(
    {
      eligibleUpcomingFixtures: 10,
      assessmentRowsWritten: 7,
      skippedInsufficientTeamEvidence: 3,
      skippedEmptyAssessment: 0
    },
    { ok: true },
    Array.from({ length: 7 }, (_, index) => assessedRow(`cid-${index}`))
  );

  assert.equal(result.ok, true);
  assert.equal(result.unexplainedUpcomingFixtures, 0);
  assert.equal(result.persistenceGap, 0);
  assert.equal(result.assessableCoverageRatio, 0.7);
  assert.equal(result.explicitUnassessableRatio, 0.3);
});

test("coverage fails on unexplained future-fixture gaps", () => {
  const result = modelAssessmentCoverageVerdict(
    {
      eligibleUpcomingFixtures: 10,
      assessmentRowsWritten: 5,
      skippedInsufficientTeamEvidence: 2,
      skippedEmptyAssessment: 0
    },
    { ok: true },
    Array.from({ length: 5 }, (_, index) => assessedRow(`cid-${index}`))
  );

  assert.equal(result.ok, false);
  assert.equal(result.unexplainedUpcomingFixtures, 3);
});

test("coverage fails when an assessment builder returns an unexplained empty assessment", () => {
  const result = modelAssessmentCoverageVerdict(
    {
      eligibleUpcomingFixtures: 4,
      assessmentRowsWritten: 3,
      skippedInsufficientTeamEvidence: 0,
      skippedEmptyAssessment: 1
    },
    { ok: true },
    Array.from({ length: 3 }, (_, index) => assessedRow(`cid-${index}`))
  );

  assert.equal(result.ok, false);
  assert.equal(result.emptyAssessment, 1);
});

test("coverage fails if successfully built assessments are not persisted", () => {
  const result = modelAssessmentCoverageVerdict(
    {
      eligibleUpcomingFixtures: 5,
      assessmentRowsWritten: 5,
      skippedInsufficientTeamEvidence: 0,
      skippedEmptyAssessment: 0
    },
    { ok: true },
    Array.from({ length: 3 }, (_, index) => assessedRow(`cid-${index}`))
  );

  assert.equal(result.ok, false);
  assert.equal(result.persistenceGap, 2);
});
