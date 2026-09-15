import test from "node:test";
import assert from "node:assert/strict";

import {
  DAY_TRUTH_DOWNSTREAM_STATE,
  DAY_TRUTH_DOWNSTREAM_OVERALL_STATE,
  buildDayTruthLedgerDownstreamConvergence
} from "./day-truth-ledger-convergence.js";

function fixture({
  id,
  historyEligible = false,
  scoredSettlementEligible = false,
  voidSettlementEligible = false
}) {
  return {
    canonicalId: id,

    decision: {
      historyEligible,
      scoredSettlementEligible,
      voidSettlementEligible
    }
  };
}

function ledger(fixtures) {
  return {
    truthFingerprint:
      "abc123",

    fixtures
  };
}

test(
  "history exact membership converges",
  () => {
    const result =
      buildDayTruthLedgerDownstreamConvergence({
        ledger:
          ledger([
            fixture({
              id: "played-1",
              historyEligible: true
            }),

            fixture({
              id: "open-1"
            })
          ]),

        historyObservation: {
          observed: true,
          sourceExists: true,
          file:
            "data/history/2026-2027.json",
          rowCount: 1,
          fixtureIds: [
            "played-1"
          ],
          duplicateFixtureIds: [],
          invalidTruthContractFixtureIds: [],
          structuralIssues: []
        }
      });

    assert.equal(
      result.history.state,
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_CONVERGED
    );

    assert.deepEqual(
      result.history
        .missingEligibleFixtureIds,
      []
    );

    assert.deepEqual(
      result.history
        .unexpectedFixtureIds,
      []
    );

    assert.equal(
      result.overallState,
      DAY_TRUTH_DOWNSTREAM_OVERALL_STATE
        .PARTIALLY_OBSERVED
    );
  }
);

test(
  "history missing eligible row is partial while unexpected persisted truth is conflict",
  () => {
    const sourceLedger =
      ledger([
        fixture({
          id: "played-1",
          historyEligible: true
        }),

        fixture({
          id: "played-2",
          historyEligible: true
        })
      ]);

    const partial =
      buildDayTruthLedgerDownstreamConvergence({
        ledger:
          sourceLedger,

        historyObservation: {
          observed: true,
          sourceExists: true,
          fixtureIds: [
            "played-1"
          ],
          rowCount: 1
        }
      });

    assert.equal(
      partial.history.state,
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_PARTIAL
    );

    assert.deepEqual(
      partial.history
        .missingEligibleFixtureIds,
      [
        "played-2"
      ]
    );

    assert.equal(
      partial.overallState,
      DAY_TRUTH_DOWNSTREAM_OVERALL_STATE
        .INCOMPLETE
    );

    const conflict =
      buildDayTruthLedgerDownstreamConvergence({
        ledger:
          sourceLedger,

        historyObservation: {
          observed: true,
          sourceExists: true,
          fixtureIds: [
            "played-1",
            "played-2",
            "wrong-1"
          ],
          rowCount: 3
        }
      });

    assert.equal(
      conflict.history.state,
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_CONFLICT
    );

    assert.deepEqual(
      conflict.history
        .unexpectedFixtureIds,
      [
        "wrong-1"
      ]
    );

    assert.equal(
      conflict.overallState,
      DAY_TRUTH_DOWNSTREAM_OVERALL_STATE
        .CONFLICT
    );
  }
);

test(
  "WIN LOSS and VOID settlements require corresponding ledger eligibility",
  () => {
    const sourceLedger =
      ledger([
        fixture({
          id: "played-1",
          scoredSettlementEligible:
            true
        }),

        fixture({
          id: "void-1",
          voidSettlementEligible:
            true
        })
      ]);

    const valid =
      buildDayTruthLedgerDownstreamConvergence({
        ledger:
          sourceLedger,

        settlementObservation: {
          observed: true,

          rows: [
            {
              canonicalId:
                "played-1",
              result:
                "WIN"
            },
            {
              canonicalId:
                "played-1",
              result:
                "LOSS"
            },
            {
              canonicalId:
                "void-1",
              result:
                "VOID"
            }
          ],

          structuralIssues:
            []
        }
      });

    assert.equal(
      valid.settlement.state,
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_CONVERGED
    );

    assert.equal(
      valid.settlement.settledRows,
      3
    );

    assert.equal(
      valid.settlement
        .incompatibleSettlementRows
        .length,
      0
    );

    const invalid =
      buildDayTruthLedgerDownstreamConvergence({
        ledger:
          sourceLedger,

        settlementObservation: {
          observed: true,

          rows: [
            {
              canonicalId:
                "void-1",
              result:
                "WIN"
            },
            {
              canonicalId:
                "played-1",
              result:
                "VOID"
            }
          ],

          structuralIssues:
            []
        }
      });

    assert.equal(
      invalid.settlement.state,
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_CONFLICT
    );

    assert.equal(
      invalid.settlement
        .incompatibleSettlementRows
        .length,
      2
    );
  }
);

test(
  "UNRESOLVED settlement is incomplete rather than fabricated truth",
  () => {
    const result =
      buildDayTruthLedgerDownstreamConvergence({
        ledger:
          ledger([
            fixture({
              id: "played-1",
              scoredSettlementEligible:
                true
            })
          ]),

        settlementObservation: {
          observed: true,

          rows: [
            {
              canonicalId:
                "played-1",
              result:
                "UNRESOLVED"
            }
          ],

          structuralIssues:
            []
        }
      });

    assert.equal(
      result.settlement.state,
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_UNRESOLVED
    );

    assert.equal(
      result.settlement
        .unresolvedRows,
      1
    );

    assert.equal(
      result.overallState,
      DAY_TRUTH_DOWNSTREAM_OVERALL_STATE
        .INCOMPLETE
    );
  }
);

test(
  "orphan and structurally invalid settlement rows fail closed",
  () => {
    const result =
      buildDayTruthLedgerDownstreamConvergence({
        ledger:
          ledger([
            fixture({
              id: "played-1",
              scoredSettlementEligible:
                true
            })
          ]),

        settlementObservation: {
          observed: true,

          rows: [
            {
              canonicalId:
                "orphan-1",
              result:
                "WIN"
            },
            {
              canonicalId:
                "played-1",
              result:
                "MAYBE"
            },
            {
              result:
                "LOSS"
            }
          ],

          structuralIssues:
            []
        }
      });

    assert.equal(
      result.settlement.state,
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_CONFLICT
    );

    assert.equal(
      result.settlement
        .orphanSettlementRows
        .length,
      1
    );

    assert.equal(
      result.settlement
        .structurallyInvalidRows
        .length,
      2
    );
  }
);

test(
  "publication must preserve exact canonical membership",
  () => {
    const sourceLedger =
      ledger([
        fixture({
          id: "a"
        }),
        fixture({
          id: "b"
        })
      ]);

    const exact =
      buildDayTruthLedgerDownstreamConvergence({
        ledger:
          sourceLedger,

        publicationObservation: {
          observed: true,
          file:
            "data/deploy-snapshots/2026-09-15/fixtures.json",
          fixtureRows: 2,
          fixtureIds: [
            "a",
            "b"
          ]
        }
      });

    assert.equal(
      exact.publication.state,
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_CONVERGED
    );

    const partial =
      buildDayTruthLedgerDownstreamConvergence({
        ledger:
          sourceLedger,

        publicationObservation: {
          observed: true,
          fixtureRows: 1,
          fixtureIds: [
            "a"
          ]
        }
      });

    assert.equal(
      partial.publication.state,
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_PARTIAL
    );

    assert.deepEqual(
      partial.publication
        .missingCanonicalFixtureIds,
      [
        "b"
      ]
    );

    const conflict =
      buildDayTruthLedgerDownstreamConvergence({
        ledger:
          sourceLedger,

        publicationObservation: {
          observed: true,
          fixtureRows: 3,
          fixtureIds: [
            "a",
            "b",
            "extra"
          ]
        }
      });

    assert.equal(
      conflict.publication.state,
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_CONFLICT
    );
  }
);

test(
  "system health remains diagnostic and cannot mutate football truth authority",
  () => {
    const result =
      buildDayTruthLedgerDownstreamConvergence({
        ledger:
          ledger([
            fixture({
              id: "a"
            })
          ]),

        systemHealthObservation: {
          observed: true,
          file:
            "data/system-health/2026-09-15.json",

          payload: {
            severity:
              "error",

            alert:
              true,

            activeIssueCount:
              3,

            actionableIssueCount:
              2
          }
        }
      });

    assert.equal(
      result.systemHealth.state,
      "OBSERVED_ERROR"
    );

    assert.equal(
      result.truthFingerprint,
      "abc123"
    );

    assert.deepEqual(
      result.authority,
      {
        footballTruthMutable:
          false,

        downstreamMutationAuthorized:
          false,

        repairAuthorized:
          false,

        observationsAffectTruthFingerprint:
          false
      }
    );
  }
);
