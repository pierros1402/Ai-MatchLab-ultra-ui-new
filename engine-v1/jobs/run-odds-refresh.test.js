import test from "node:test";
import assert from "node:assert/strict";

import {
  runOddsRefresh,
  assertPersistedAssessmentPostcondition,
  persistedAssessmentSummary
} from "./run-odds-refresh.js";

test("new canonical assessments are persisted even between scheduled odds scrapes", async () => {
  let snapshot = { generatedAt: "2026-10-01T00:00:00Z", matches: [{ canonicalId: "old", aiAssessment: { markets: { OU25: {} } } }] };
  let supplemented = false;
  const result = await runOddsRefresh("2026-10-01", {
    readSnapshot: () => snapshot,
    fixtureIdResolver: value => value,
    readCanonical: () => [{ canonicalId: "old" }, { canonicalId: "new" }],
    updateDecision: () => ({ due: false, reason: "not_due" }),
    opening: async () => { throw new Error("network scrape should not run"); },
    exportFixtures: async () => ({ changed: false }),
    supplement: () => { supplemented = true; return { canonicalFixtures: 2, modelEvidenceEligibleFixtureIds: ["new"] }; },
    exportOdds: () => { snapshot.matches.push({ canonicalId: "new", aiAssessment: { markets: { OU25: {} } } }); return { count: 2, changed: true }; }
  });
  assert.equal(supplemented, true);
  assert.equal(result.due, false);
  assert.equal(result.changed, true);
  assert.equal(result.assessmentRows, 2);
});

test("persisted assessment summary counts only non-empty model markets", () => {
  const summary = persistedAssessmentSummary({
    matches: [
      { matchId: "a", aiAssessment: null },
      { matchId: "b", aiAssessment: { markets: {} } },
      { matchId: "c", aiAssessment: { markets: { OU25: { probs: { over: 0.6, under: 0.4 } } } } }
    ]
  });
  assert.deepEqual(summary, { matchRows: 3, assessmentRows: 1 });
});

test("refresh postcondition does not invent an assessment requirement without eligible fixture ids", () => {
  assert.deepEqual(
    assertPersistedAssessmentPostcondition(
      { matches: [{ matchId: "a", aiAssessment: null }] },
      "2026-08-14"
    ),
    { matchRows: 1, assessmentRows: 0 }
  );
});

test("canonical fixture count alone does not invent an assessment requirement", () => {
  assert.deepEqual(
    assertPersistedAssessmentPostcondition(
      { matches: [] },
      "2026-08-14",
      { canonicalFixtureCount: 143 }
    ),
    { matchRows: 0, assessmentRows: 0 }
  );
});

test("refresh postcondition allows a genuinely empty canonical day", () => {
  assert.deepEqual(
    assertPersistedAssessmentPostcondition(
      { matches: [] },
      "2026-08-14",
      { canonicalFixtureCount: 0 }
    ),
    { matchRows: 0, assessmentRows: 0 }
  );
});

test("refresh postcondition allows persisted assessments", () => {
  assert.deepEqual(
    assertPersistedAssessmentPostcondition({
      matches: [{
        matchId: "a",
        aiAssessment: { markets: { BTTS: { probs: { yes: 0.5, no: 0.5 } } } }
      }]
    }, "2026-08-14", { canonicalFixtureCount: 143 }),
    { matchRows: 1, assessmentRows: 1 }
  );
});
test("persisted coverage fails when required eligible assessments are completely absent", () => {
  assert.throws(
    () => assertPersistedAssessmentPostcondition(
      {
        matches: [
          { matchId: "required-a", aiAssessment: null }
        ]
      },
      "2026-08-14",
      {
        canonicalFixtureCount: 1,
        canonicalFixtureIds: ["required-a"],
        requiredAssessmentFixtureIds: ["required-a"]
      }
    ),
    error =>
      error?.code === "persisted_model_assessments_missing" &&
      error?.canonicalFixtureCount === 1
  );
});

test("persisted coverage fails when one required eligible fixture is missing", () => {
  assert.throws(
    () => assertPersistedAssessmentPostcondition(
      {
        matches: [
          {
            matchId: "required-a",
            aiAssessment: {
              markets: {
                OU25: {
                  probs: {
                    over: 0.6,
                    under: 0.4
                  }
                }
              }
            }
          },
          {
            matchId: "required-b",
            aiAssessment: null
          }
        ]
      },
      "2026-08-14",
      {
        canonicalFixtureCount: 2,
        canonicalFixtureIds: [
          "required-a",
          "required-b"
        ],
        requiredAssessmentFixtureIds: [
          "required-a",
          "required-b"
        ]
      }
    ),
    error =>
      error?.code ===
        "persisted_model_assessment_coverage_incomplete" &&
      error?.requiredAssessmentRows === 2 &&
      error?.missingRequiredAssessmentRows === 1 &&
      error?.missingRequiredAssessmentFixtureIds?.[0] ===
        "required-b"
  );
});

test("persisted coverage rejects required ids outside the canonical universe", () => {
  assert.throws(
    () => assertPersistedAssessmentPostcondition(
      {
        matches: [{
          matchId: "required-b",
          aiAssessment: {
            markets: {
              BTTS: {
                probs: {
                  yes: 0.5,
                  no: 0.5
                }
              }
            }
          }
        }]
      },
      "2026-08-14",
      {
        canonicalFixtureCount: 1,
        canonicalFixtureIds: ["required-a"],
        requiredAssessmentFixtureIds: ["required-b"]
      }
    ),
    error =>
      error?.code ===
        "required_assessment_outside_canonical_universe" &&
      error?.requiredOutsideCanonical?.[0] ===
        "required-b"
  );
});

test("persisted coverage fails closed when required ids exist without a canonical universe", () => {
  assert.throws(
    () => assertPersistedAssessmentPostcondition(
      {
        matches: [{
          matchId: "required-a",
          aiAssessment: {
            markets: {
              OU25: {
                probs: {
                  over: 0.55,
                  under: 0.45
                }
              }
            }
          }
        }]
      },
      "2026-08-14",
      {
        canonicalFixtureCount: 1,
        canonicalFixtureIds: [],
        requiredAssessmentFixtureIds: ["required-a"]
      }
    ),
    error =>
      error?.code ===
        "required_assessment_canonical_universe_missing" &&
      error?.requiredAssessmentRows === 1
  );
});

test("persisted coverage reports one hundred percent only when every required eligible fixture is present", () => {
  const result =
    assertPersistedAssessmentPostcondition(
      {
        matches: [
          {
            matchId: "required-a",
            aiAssessment: {
              markets: {
                OU25: {
                  probs: {
                    over: 0.6,
                    under: 0.4
                  }
                }
              }
            }
          },
          {
            matchId: "required-b",
            aiAssessment: {
              markets: {
                BTTS: {
                  probs: {
                    yes: 0.52,
                    no: 0.48
                  }
                }
              }
            }
          }
        ]
      },
      "2026-08-14",
      {
        canonicalFixtureCount: 2,
        canonicalFixtureIds: [
          "required-a",
          "required-b"
        ],
        requiredAssessmentFixtureIds: [
          "required-a",
          "required-b"
        ]
      }
    );

  assert.equal(
    result.canonicalJoinedAssessmentRows,
    2
  );
  assert.equal(
    result.canonicalOrphanAssessmentRows,
    0
  );
  assert.equal(
    result.requiredAssessmentRows,
    2
  );
  assert.equal(
    result.requiredAssessmentRowsPresent,
    2
  );
  assert.equal(
    result.missingRequiredAssessmentRows,
    0
  );
  assert.equal(
    result.assessmentCoverageOfRequiredPct,
    100
  );
});


test("persisted coverage normalizes source fixture ids before required-coverage comparison", () => {
  const aliases = new Map([
    ["source-required-a", "required-a"],
    ["required-a", "required-a"]
  ]);

  const result = assertPersistedAssessmentPostcondition(
    {
      matches: [{
        matchId: "source-required-a",
        aiAssessment: {
          markets: {
            OU25: {
              probs: { over: 0.61, under: 0.39 }
            }
          }
        }
      }]
    },
    "2026-09-20",
    {
      canonicalFixtureCount: 1,
      canonicalFixtureIds: ["required-a"],
      requiredAssessmentFixtureIds: ["required-a"],
      fixtureIdResolver: value => ({
        ok: true,
        resolvedFixtureId: aliases.get(value) || value
      })
    }
  );

  assert.equal(result.requiredAssessmentRows, 1);
  assert.equal(result.requiredAssessmentRowsPresent, 1);
  assert.equal(result.missingRequiredAssessmentRows, 0);
  assert.equal(result.assessmentCoverageOfRequiredPct, 100);
});

test("persisted coverage normalizes required source ids into canonical universe", () => {
  const aliases = new Map([
    ["source-required-a", "required-a"],
    ["required-a", "required-a"]
  ]);

  const result = assertPersistedAssessmentPostcondition(
    {
      matches: [{
        canonicalId: "required-a",
        aiAssessment: {
          markets: {
            BTTS: {
              probs: { yes: 0.54, no: 0.46 }
            }
          }
        }
      }]
    },
    "2026-09-20",
    {
      canonicalFixtureCount: 1,
      canonicalFixtureIds: ["required-a"],
      requiredAssessmentFixtureIds: ["source-required-a"],
      fixtureIdResolver: value => ({
        ok: true,
        resolvedFixtureId: aliases.get(value) || value
      })
    }
  );

  assert.equal(result.requiredAssessmentRows, 1);
  assert.equal(result.missingRequiredAssessmentRows, 0);
});

test("persisted coverage fails closed when fixture identity normalization has no resolved id", () => {
  assert.throws(
    () => assertPersistedAssessmentPostcondition(
      {
        matches: [{
          matchId: "source-required-a",
          aiAssessment: {
            markets: {
              OU25: {
                probs: { over: 0.6, under: 0.4 }
              }
            }
          }
        }]
      },
      "2026-09-20",
      {
        canonicalFixtureCount: 1,
        canonicalFixtureIds: ["required-a"],
        requiredAssessmentFixtureIds: ["required-a"],
        fixtureIdResolver: () => ({
          ok: false,
          resolvedFixtureId: null
        })
      }
    ),
    error =>
      error?.code ===
        "persisted_assessment_fixture_identity_resolution_failed" &&
      error?.sourceFixtureId === "required-a"
  );
});

test("refresh fails closed on an explicit odds exporter identity hold", async () => {
  let persistenceRead = false;
  await assert.rejects(
    runOddsRefresh("2026-11-20", {
      readSnapshot: () => { persistenceRead = true; return { matches: [] }; },
      readCanonical: () => [],
      opening: async () => {},
      exportFixtures: async () => ({ changed: false }),
      supplement: () => ({ canonicalFixtures: 0, modelEvidenceEligibleFixtureIds: [] }),
      exportOdds: () => ({ ok: false, changed: false, reason: "ambiguous_canonical_ownership_publication_hold", ownershipIssues: { strictIdentityHolds: ["conflict"] } }),
      updateDecision: () => ({ due: false, reason: "not_due" })
    }),
    error => error?.code === "odds_snapshot_export_failed" &&
      error?.exportFailure?.reason === "ambiguous_canonical_ownership_publication_hold"
  );
  assert.equal(persistenceRead, true);
});

test("refresh repairs freshly computed authentic assessments lost across the exporter boundary", async () => {
  const date = "2026-11-20";
  const model = p => ({ markets: { OU25: { probs: { over: p, under: 1 - p } } } });
  let snapshot = {
    matches: [{ canonicalId: "old", aiAssessment: model(0.55) }]
  };
  let writtenToMemory = 0;
  let reconciled = 0;
  const result = await runOddsRefresh(date, {
    fixtureIdResolver: value => value,
    readSnapshot: () => snapshot,
    readCanonical: () => [{ canonicalId: "old" }, { canonicalId: "new" }],
    updateDecision: () => ({ due: false, reason: "not_due" }),
    opening: async () => { throw new Error("network capture not permitted in this test"); },
    exportFixtures: async () => ({ changed: false }),
    recordOdds: () => { writtenToMemory++; return {}; },
    supplement: (_date, options) => {
      options.recordFn("new", {
        canonicalId: "new", aiAssessment: model(0.61)
      }, { markets: {} });
      return { canonicalFixtures: 2, modelEvidenceEligibleFixtureIds: ["old", "new"] };
    },
    exportOdds: () => ({ ok: true, count: 1, changed: false, preservedExisting: true,
      reason: "assessment_coverage_regression" }),
    reconcile: (_date, options) => {
      reconciled++;
      assert.deepEqual(options.requiredIds, ["old", "new"]);
      assert.equal(options.currentRunAssessments.length, 1);
      assert.equal(options.currentRunAssessments[0].canonicalId, "new");
      snapshot = { matches: [...snapshot.matches, {
        canonicalId: "new", aiAssessment: model(0.61)
      }] };
      return { ok: true, changed: true, restored: 1 };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.assessmentRows, 2);
  assert.equal(result.changed, true);
  assert.equal(writtenToMemory, 1);
  assert.equal(reconciled, 1);
});

test("refresh never invents or backfills a missing model without current-run evidence", async () => {
  await assert.rejects(runOddsRefresh("2026-11-20", {
    fixtureIdResolver: value => value,
    readSnapshot: () => ({ matches: [{
      canonicalId: "old",
      aiAssessment: { markets: { OU25: { probs: { over: 0.55, under: 0.45 } } } }
    }] }),
    readCanonical: () => [{ canonicalId: "old" }, { canonicalId: "new" }],
    updateDecision: () => ({ due: false, reason: "not_due" }),
    opening: async () => {},
    exportFixtures: async () => ({ changed: false }),
    supplement: () => ({ canonicalFixtures: 2, modelEvidenceEligibleFixtureIds: ["old", "new"] }),
    exportOdds: () => ({ ok: true, changed: false }),
    reconcile: () => { throw new Error("recovery must not be invoked without evidence"); }
  }), error => error?.code === "persisted_model_assessment_coverage_incomplete");
});
