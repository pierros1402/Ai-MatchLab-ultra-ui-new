import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousRepairPolicyDay
} from "./autonomous-repair-policy-day.js";

const HASH =
  "a".repeat(64);

function fixture({
  canonicalId =
    "canonical-a",

  operationalState =
    "PLAYED_TERMINAL",

  decisionStatus =
    "CONVERGED_PLAYED_FINAL",

  verifiedFinalAccepted =
    true,

  historyEligible =
    true
} = {}) {
  return {
    canonicalId,

    operationalState,

    verifiedFinal: {
      accepted:
        verifiedFinalAccepted
    },

    decision: {
      status:
        decisionStatus,

      historyEligible,

      repairAuthorized:
        false
    }
  };
}

function sources({
  auditAnomalies = [],
  downstreamFindings = [],
  primaryFindings = [],
  fixtures = [
    fixture()
  ]
} = {}) {
  return {
    ledger: {
      dayKey:
        "2026-09-15",

      generatedAt:
        "2026-09-15T20:00:00.000Z",

      truthFingerprint:
        HASH,

      fixtures,

      authorization: {
        repairAuthorized:
          false
      }
    },

    audit: {
      generatedAt:
        "2026-09-15T21:00:00.000Z",

      auditFingerprint:
        "b".repeat(64),

      anomalies:
        auditAnomalies,

      provenance: {
        inputTruthFingerprint:
          HASH
      },

      authority: {
        repairAuthorized:
          false
      }
    },

    downstreamEvidence: {
      evidenceFingerprint:
        "c".repeat(64),

      findings:
        downstreamFindings,

      authority: {
        filesystemWriteAuthorized:
          false,

        repairAuthorized:
          false,

        workflowMutationAuthorized:
          false
      }
    },

    primaryEvidence: {
      evidenceFingerprint:
        "d".repeat(64),

      findings:
        primaryFindings,

      authority: {
        filesystemWriteAuthorized:
          false,

        repairAuthorized:
          false,

        workflowMutationAuthorized:
          false
      }
    }
  };
}

test(
  "day schema freezes zero execution write repair and workflow authority",
  () => {
    const schema =
      JSON.parse(
        fs.readFileSync(
          new URL(
            "../contracts/autonomous-repair-policy-day.schema.v1.json",
            import.meta.url
          ),
          "utf8"
        )
      );

    const authority =
      schema.properties
        .authority
        .properties;

    assert.equal(
      authority.filesystemWriteAuthorized.const,
      false
    );

    assert.equal(
      authority.repairAuthorized.const,
      false
    );

    assert.equal(
      authority.executionAuthorized.const,
      false
    );

    assert.equal(
      authority.workflowMutationAuthorized.const,
      false
    );
  }
);

test(
  "exact primary pending-final evidence refines generic audit anomaly into one candidate",
  () => {
    const input =
      sources({
        fixtures: [
          fixture({
            decisionStatus:
              "PENDING_VERIFIED_FINAL",

            verifiedFinalAccepted:
              false,

            historyEligible:
              false
          })
        ],

        auditAnomalies: [
          {
            anomalyId:
              "audit-pending",

            reasonCode:
              "PLAYED_TERMINAL_PENDING_VERIFIED_FINAL",

            impact:
              "RECONCILIATION_REQUIRED",

            canonicalId:
              "canonical-a"
          }
        ],

        primaryFindings: [
          {
            findingId:
              "primary-pending",

            reasonCode:
              "VERIFIED_FINAL_PENDING_CANONICAL_FIXTURE",

            impact:
              "RECONCILIATION_REQUIRED",

            canonicalId:
              "canonical-a",

            observedFixtureId:
              null
          }
        ]
      });

    const policy =
      buildAutonomousRepairPolicyDay(
        input
      );

    assert.equal(
      policy.policyState,
      "CANDIDATES_PRESENT"
    );

    assert.equal(
      policy.summary.decisionCount,
      1
    );

    assert.equal(
      policy.summary.candidateCount,
      1
    );

    assert.equal(
      policy.summary.quarantineCount,
      0
    );

    assert.equal(
      policy.summary.suppressedGenericAuditCount,
      1
    );

    assert.equal(
      policy.decisions[0].repairClass,
      "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
    );
  }
);

test(
  "exact downstream history evidence refines generic history incomplete anomaly",
  () => {
    const input =
      sources({
        auditAnomalies: [
          {
            anomalyId:
              "audit-history",

            reasonCode:
              "HISTORY_INCOMPLETE",

            impact:
              "RECONCILIATION_REQUIRED"
          }
        ],

        downstreamFindings: [
          {
            findingId:
              "history-missing",

            reasonCode:
              "HISTORY_MISSING_ELIGIBLE_FIXTURE",

            impact:
              "RECONCILIATION_REQUIRED",

            canonicalId:
              "canonical-a",

            observedFixtureId:
              null
          }
        ]
      });

    const policy =
      buildAutonomousRepairPolicyDay(
        input
      );

    assert.equal(
      policy.policyState,
      "CANDIDATES_PRESENT"
    );

    assert.equal(
      policy.summary.candidateCount,
      1
    );

    assert.equal(
      policy.summary.suppressedGenericAuditCount,
      1
    );

    assert.equal(
      policy.decisions[0].repairClass,
      "REBUILD_HISTORY_ELIGIBLE_ROW"
    );
  }
);

test(
  "generic incomplete anomaly remains quarantine when exact refinement does not exist",
  () => {
    const policy =
      buildAutonomousRepairPolicyDay(
        sources({
          auditAnomalies: [
            {
              anomalyId:
                "audit-history-incomplete",

              reasonCode:
                "HISTORY_INCOMPLETE",

              impact:
                "RECONCILIATION_REQUIRED"
            }
          ]
        })
      );

    assert.equal(
      policy.policyState,
      "QUARANTINED"
    );

    assert.equal(
      policy.summary.quarantineCount,
      1
    );

    assert.equal(
      policy.summary.suppressedGenericAuditCount,
      0
    );
  }
);

test(
  "missing observations remain observation-only at day policy level",
  () => {
    const policy =
      buildAutonomousRepairPolicyDay(
        sources({
          auditAnomalies: [
            {
              anomalyId:
                "settlement-not-observed",

              reasonCode:
                "SETTLEMENT_NOT_OBSERVED",

              impact:
                "OBSERVATION_GAP"
            },

            {
              anomalyId:
                "health-warning",

              reasonCode:
                "SYSTEM_HEALTH_WARNING_SIGNAL",

              impact:
                "DIAGNOSTIC_ONLY"
            }
          ]
        })
      );

    assert.equal(
      policy.policyState,
      "OBSERVATION_ONLY"
    );

    assert.equal(
      policy.summary.decisionCount,
      2
    );

    assert.equal(
      policy.summary.observationOnlyCount,
      2
    );

    assert.equal(
      policy.summary.candidateCount,
      0
    );
  }
);

test(
  "hard block dominates simultaneous otherwise eligible candidate",
  () => {
    const input =
      sources({
        fixtures: [
          fixture({
            canonicalId:
              "candidate-a"
          }),

          fixture({
            canonicalId:
              "blocked-b"
          })
        ],

        downstreamFindings: [
          {
            findingId:
              "candidate-history",

            reasonCode:
              "HISTORY_MISSING_ELIGIBLE_FIXTURE",

            impact:
              "RECONCILIATION_REQUIRED",

            canonicalId:
              "candidate-a",

            observedFixtureId:
              null
          }
        ],

        primaryFindings: [
          {
            findingId:
              "blocked-duplicate",

            reasonCode:
              "VERIFIED_FINAL_DUPLICATE_CANONICAL_FIXTURE",

            impact:
              "BLOCKING_CONFLICT",

            canonicalId:
              "blocked-b",

            observedFixtureId:
              null
          }
        ]
      });

    const policy =
      buildAutonomousRepairPolicyDay(
        input
      );

    assert.equal(
      policy.summary.candidateCount,
      1
    );

    assert.equal(
      policy.summary.hardBlockCount,
      1
    );

    assert.equal(
      policy.policyState,
      "BLOCKED"
    );

    assert.equal(
      policy.authority.executionAuthorized,
      false
    );
  }
);

test(
  "observed stale identity yields quarantine and cannot become repair candidate",
  () => {
    const policy =
      buildAutonomousRepairPolicyDay(
        sources({
          downstreamFindings: [
            {
              findingId:
                "stale-publication",

              reasonCode:
                "PUBLICATION_EXTRA_FIXTURE",

              impact:
                "BLOCKING_CONFLICT",

              canonicalId:
                null,

              observedFixtureId:
                "stale-id"
            }
          ]
        })
      );

    assert.equal(
      policy.policyState,
      "QUARANTINED"
    );

    assert.equal(
      policy.summary.quarantineCount,
      1
    );

    assert.equal(
      policy.summary.candidateCount,
      0
    );
  }
);

test(
  "unknown reason hard-blocks the entire daily policy",
  () => {
    const policy =
      buildAutonomousRepairPolicyDay(
        sources({
          auditAnomalies: [
            {
              anomalyId:
                "future-reason",

              reasonCode:
                "FUTURE_UNKNOWN_REASON",

              impact:
                "UNKNOWN"
            }
          ]
        })
      );

    assert.equal(
      policy.policyState,
      "BLOCKED"
    );

    assert.equal(
      policy.summary.hardBlockCount,
      1
    );
  }
);

test(
  "no diagnoses produces CLEAR while retaining zero authority",
  () => {
    const policy =
      buildAutonomousRepairPolicyDay(
        sources()
      );

    assert.equal(
      policy.policyState,
      "CLEAR"
    );

    assert.equal(
      policy.summary.decisionCount,
      0
    );

    assert.equal(
      policy.authority.repairAuthorized,
      false
    );

    assert.equal(
      policy.authority.executionAuthorized,
      false
    );
  }
);

test(
  "daily policy fingerprint and decisions are deterministic under diagnosis reordering and generatedAt churn",
  () => {
    const findingA = {
      findingId:
        "history-a",

      reasonCode:
        "HISTORY_MISSING_ELIGIBLE_FIXTURE",

      impact:
        "RECONCILIATION_REQUIRED",

      canonicalId:
        "canonical-a",

      observedFixtureId:
        null
    };

    const findingB = {
      findingId:
        "publication-b",

      reasonCode:
        "PUBLICATION_MISSING_CANONICAL_FIXTURE",

      impact:
        "RECONCILIATION_REQUIRED",

      canonicalId:
        "canonical-b",

      observedFixtureId:
        null
    };

    const fixtures = [
      fixture({
        canonicalId:
          "canonical-a"
      }),

      fixture({
        canonicalId:
          "canonical-b"
      })
    ];

    const first =
      buildAutonomousRepairPolicyDay({
        ...sources({
          fixtures,

          downstreamFindings: [
            findingA,
            findingB
          ]
        }),

        generatedAt:
          "2026-09-15T21:00:00.000Z"
      });

    const second =
      buildAutonomousRepairPolicyDay({
        ...sources({
          fixtures: [
            fixtures[1],
            fixtures[0]
          ],

          downstreamFindings: [
            findingB,
            findingA
          ]
        }),

        generatedAt:
          "2026-09-16T01:00:00.000Z"
      });

    assert.equal(
      first.policyFingerprint,
      second.policyFingerprint
    );

    assert.deepEqual(
      first.decisions,
      second.decisions
    );

    assert.notEqual(
      first.generatedAt,
      second.generatedAt
    );
  }
);
