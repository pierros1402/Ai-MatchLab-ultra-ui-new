import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_AUTHORITY,
  AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_ROLE,
  AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_SCHEMA,
  AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_VERSION,
  buildAutonomousTruthReconciliationAudit,
  maximumAutonomousTruthReconciliationImpact
} from "./autonomous-truth-reconciliation-audit.js";

import {
  buildDayTruthLedgerDay
} from "../jobs/build-day-truth-ledger-day.js";

const HASH =
  "a".repeat(64);

function fixture({
  canonicalId =
    "cid_test_home_away_20260915",

  status =
    "CONVERGED_PLAYED_FINAL",

  reason =
    "played_terminal_verified_final",

  operationalState =
    "PLAYED_TERMINAL"
} = {}) {
  return {
    canonicalId,

    operationalState,

    verifiedFinal: {
      present:
        true,

      accepted:
        status ===
        "CONVERGED_PLAYED_FINAL",

      reason:
        status ===
        "CONVERGED_PLAYED_FINAL"
          ? "verified_final_result"
          : "verified_final_missing"
    },

    decision: {
      status,
      reason,

      repairAuthorized:
        false
    }
  };
}

function convergence(
  truthFingerprint = HASH
) {
  return {
    overallState:
      "CONVERGED",

    truthFingerprint,

    history: {
      observed: true,
      state:
        "PRESENT_CONVERGED"
    },

    settlement: {
      observed: true,
      state:
        "PRESENT_CONVERGED"
    },

    publication: {
      observed: true,
      state:
        "PRESENT_CONVERGED"
    },

    systemHealth: {
      observed: true,
      state:
        "OBSERVED_INFO",
      severity:
        "info",
      alert:
        false,
      activeIssueCount:
        0,
      actionableIssueCount:
        0
    },

    authority: {
      footballTruthMutable:
        false,

      downstreamMutationAuthorized:
        false,

      repairAuthorized:
        false,

      observationsAffectTruthFingerprint:
        false
    }
  };
}

function ledger(
  overrides = {}
) {
  const truthFingerprint =
    overrides.truthFingerprint ??
    HASH;

  return {
    schema:
      "ai-matchlab.day-truth-ledger.v1",

    ledgerVersion:
      "1.0.0",

    dayKey:
      "2026-09-15",

    generatedAt:
      "2026-09-15T20:00:00.000Z",

    role:
      "derived_control_plane",

    ledgerState:
      overrides.ledgerState ??
      "CLOSED",

    truthFingerprint,

    fixtures:
      overrides.fixtures ??
      [
        fixture()
      ],

    anomalies:
      overrides.anomalies ??
      {
        orphanVerifiedFinals: [],
        duplicateVerifiedFinalFixtureIds: [],
        conflictFixtureIds: [],
        pendingVerifiedFinalFixtureIds: []
      },

    downstream: {
      convergence:
        overrides.convergence ??
        convergence(
          truthFingerprint
        )
    },

    authorization: {
      canonicalWriteAuthorized:
        false,

      verifiedFinalWriteAuthorized:
        false,

      historyWriteAuthorized:
        false,

      valueSettlementWriteAuthorized:
        false,

      publicationWriteAuthorized:
        false,

      repairAuthorized:
        false
    }
  };
}

function build(
  input,
  generatedAt =
    "2026-09-15T21:00:00.000Z"
) {
  return buildAutonomousTruthReconciliationAudit({
    ledger:
      input,

    generatedAt
  });
}

test(
  "contract identifies a derived diagnosis-only control plane with zero mutation authority",
  () => {
    assert.equal(
      AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_SCHEMA,
      "ai-matchlab.autonomous-truth-reconciliation-audit.v1"
    );

    assert.equal(
      AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_VERSION,
      "1.0.0"
    );

    assert.equal(
      AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_ROLE,
      "derived_diagnostic_control_plane"
    );

    assert.deepEqual(
      AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_AUTHORITY,
      {
        sourceTruth:
          "day_truth_ledger_v1",

        diagnosisOnly:
          true,

        canonicalWriteAuthorized:
          false,

        verifiedFinalWriteAuthorized:
          false,

        historyWriteAuthorized:
          false,

        settlementWriteAuthorized:
          false,

        publicationWriteAuthorized:
          false,

        repairAuthorized:
          false,

        workflowMutationAuthorized:
          false
      }
    );
  }
);

test(
  "fully converged truth and downstream state audits CLEAR",
  () => {
    const audit =
      build(
        ledger()
      );

    assert.equal(
      audit.auditState,
      "CLEAR"
    );

    assert.equal(
      audit.summary.anomalyCount,
      0
    );

    assert.equal(
      audit.summary.blockingCount,
      0
    );

    assert.equal(
      audit.authority.repairAuthorized,
      false
    );
  }
);

test(
  "valid OPEN fixture truth is not manufactured into an anomaly",
  () => {
    const input =
      ledger({
        ledgerState:
          "OPEN",

        fixtures: [
          fixture({
            status:
              "OPEN",

            reason:
              "scheduled_or_live_truth_open",

            operationalState:
              "SCHEDULED"
          })
        ]
      });

    const audit =
      build(
        input
      );

    assert.equal(
      audit.auditState,
      "CLEAR"
    );

    assert.equal(
      audit.summary.anomalyCount,
      0
    );
  }
);

test(
  "played-terminal fixture missing verified-final evidence requires reconciliation",
  () => {
    const input =
      ledger({
        ledgerState:
          "INCOMPLETE",

        fixtures: [
          fixture({
            status:
              "PENDING_VERIFIED_FINAL",

            reason:
              "played_terminal_requires_verified_final"
          })
        ]
      });

    const audit =
      build(
        input
      );

    assert.equal(
      audit.auditState,
      "RECONCILIATION_REQUIRED"
    );

    assert.equal(
      audit.summary.reconciliationRequiredCount,
      1
    );

    assert.equal(
      audit.anomalies[0].reasonCode,
      "PLAYED_TERMINAL_PENDING_VERIFIED_FINAL"
    );

    assert.equal(
      audit.anomalies[0].impact,
      "RECONCILIATION_REQUIRED"
    );
  }
);

test(
  "fixture truth conflict blocks autonomous reconciliation closure",
  () => {
    const input =
      ledger({
        ledgerState:
          "CONFLICT",

        fixtures: [
          fixture({
            status:
              "CONFLICT",

            reason:
              "played_terminal_score_mismatch"
          })
        ]
      });

    const audit =
      build(
        input
      );

    assert.equal(
      audit.auditState,
      "BLOCKED"
    );

    assert.equal(
      audit.summary.blockingCount,
      1
    );

    assert.equal(
      audit.anomalies[0].reasonCode,
      "FIXTURE_TRUTH_CONFLICT"
    );
  }
);

test(
  "orphan and duplicate verified-final evidence fail closed",
  () => {
    const input =
      ledger({
        ledgerState:
          "CONFLICT",

        anomalies: {
          orphanVerifiedFinals: [
            {
              canonicalId:
                "cid_orphan_20260915",

              reason:
                "verified_final_missing_canonical_membership"
            },
            {
              canonicalId:
                null,

              reason:
                "verified_final_missing_canonical_id"
            }
          ],

          duplicateVerifiedFinalFixtureIds: [
            "cid_duplicate_20260915"
          ],

          conflictFixtureIds: [],
          pendingVerifiedFinalFixtureIds: []
        }
      });

    const audit =
      build(
        input
      );

    const reasons =
      audit.anomalies
        .map(
          row =>
            row.reasonCode
        )
        .sort();

    assert.equal(
      audit.auditState,
      "BLOCKED"
    );

    assert.deepEqual(
      reasons,
      [
        "DUPLICATE_VERIFIED_FINAL_EVIDENCE",
        "ORPHAN_VERIFIED_FINAL",
        "VERIFIED_FINAL_MISSING_CANONICAL_ID"
      ]
    );
  }
);

test(
  "missing downstream observation is an observation gap rather than fabricated truth failure",
  () => {
    const downstream =
      convergence();

    downstream.overallState =
      "PARTIALLY_OBSERVED";

    downstream.settlement = {
      observed: false,
      state:
        "NOT_OBSERVED"
    };

    const audit =
      build(
        ledger({
          convergence:
            downstream
        })
      );

    assert.equal(
      audit.auditState,
      "OBSERVATION_GAPS"
    );

    assert.equal(
      audit.summary.observationGapCount,
      1
    );

    assert.equal(
      audit.anomalies[0].reasonCode,
      "SETTLEMENT_NOT_OBSERVED"
    );
  }
);

test(
  "partial and unresolved downstream projections require reconciliation",
  () => {
    const downstream =
      convergence();

    downstream.overallState =
      "INCOMPLETE";

    downstream.history = {
      observed: true,
      state:
        "PRESENT_PARTIAL"
    };

    downstream.settlement = {
      observed: true,
      state:
        "PRESENT_UNRESOLVED"
    };

    const audit =
      build(
        ledger({
          convergence:
            downstream
        })
      );

    assert.equal(
      audit.auditState,
      "RECONCILIATION_REQUIRED"
    );

    assert.equal(
      audit.summary.reconciliationRequiredCount,
      2
    );

    assert.deepEqual(
      audit.anomalies
        .map(
          row =>
            row.reasonCode
        )
        .sort(),
      [
        "HISTORY_INCOMPLETE",
        "SETTLEMENT_UNRESOLVED"
      ]
    );
  }
);

test(
  "downstream conflict is blocking but cannot rewrite football truth",
  () => {
    const downstream =
      convergence();

    downstream.overallState =
      "CONFLICT";

    downstream.publication = {
      observed: true,
      state:
        "PRESENT_CONFLICT"
    };

    const input =
      ledger({
        convergence:
          downstream
      });

    const before =
      JSON.stringify(
        input
      );

    const audit =
      build(
        input
      );

    assert.equal(
      audit.auditState,
      "BLOCKED"
    );

    assert.equal(
      audit.anomalies[0].reasonCode,
      "PUBLICATION_CONFLICT"
    );

    assert.equal(
      audit.authority.repairAuthorized,
      false
    );

    assert.equal(
      JSON.stringify(
        input
      ),
      before
    );
  }
);

test(
  "System Health error remains diagnostic-only and does not manufacture truth conflict",
  () => {
    const downstream =
      convergence();

    downstream.systemHealth = {
      observed: true,
      state:
        "OBSERVED_ERROR",
      severity:
        "error",
      alert:
        true,
      activeIssueCount:
        4,
      actionableIssueCount:
        1
    };

    const audit =
      build(
        ledger({
          convergence:
            downstream
        })
      );

    assert.equal(
      audit.auditState,
      "CLEAR"
    );

    assert.equal(
      audit.summary.diagnosticOnlyCount,
      1
    );

    assert.equal(
      audit.summary.errorCount,
      1
    );

    assert.equal(
      audit.anomalies[0].reasonCode,
      "SYSTEM_HEALTH_ERROR_SIGNAL"
    );

    assert.equal(
      audit.anomalies[0].impact,
      "DIAGNOSTIC_ONLY"
    );
  }
);

test(
  "audit fingerprint and anomaly IDs ignore generatedAt-only churn",
  () => {
    const downstream =
      convergence();

    downstream.overallState =
      "PARTIALLY_OBSERVED";

    downstream.settlement = {
      observed: false,
      state:
        "NOT_OBSERVED"
    };

    const input =
      ledger({
        convergence:
          downstream
      });

    const first =
      build(
        input,
        "2026-09-15T21:00:00.000Z"
      );

    const second =
      build(
        {
          ...input,
          generatedAt:
            "2026-09-15T21:04:59.000Z"
        },
        "2026-09-15T21:05:00.000Z"
      );

    assert.notEqual(
      first.generatedAt,
      second.generatedAt
    );

    assert.equal(
      first.auditFingerprint,
      second.auditFingerprint
    );

    assert.deepEqual(
      first.anomalies
        .map(
          row =>
            row.anomalyId
        ),
      second.anomalies
        .map(
          row =>
            row.anomalyId
        )
    );
  }
);

test(
  "invalid ledger/convergence fingerprint binding fails closed",
  () => {
    const downstream =
      convergence(
        "b".repeat(64)
      );

    assert.throws(
      () =>
        build(
          ledger({
            convergence:
              downstream
          })
        ),
      /autonomous_truth_audit_convergence_fingerprint_mismatch/
    );
  }
);

test(
  "input with repair authority enabled is rejected",
  () => {
    const input =
      ledger();

    input.authorization
      .repairAuthorized =
      true;

    assert.throws(
      () =>
        build(
          input
        ),
      /autonomous_truth_audit_input_repair_authority_invalid/
    );
  }
);

test(
  "maximum impact helper is deterministic",
  () => {
    assert.equal(
      maximumAutonomousTruthReconciliationImpact([
        {
          impact:
            "DIAGNOSTIC_ONLY"
        },
        {
          impact:
            "OBSERVATION_GAP"
        },
        {
          impact:
            "RECONCILIATION_REQUIRED"
        }
      ]),
      "RECONCILIATION_REQUIRED"
    );

    assert.equal(
      maximumAutonomousTruthReconciliationImpact([
        {
          impact:
            "BLOCKING_CONFLICT"
        },
        {
          impact:
            "OBSERVATION_GAP"
        }
      ]),
      "BLOCKING_CONFLICT"
    );
  }
);

test(
  "schema freezes diagnosis-only and zero-repair authority",
  () => {
    const schema =
      JSON.parse(
        fs.readFileSync(
          new URL(
            "../contracts/autonomous-truth-reconciliation-audit.schema.v1.json",
            import.meta.url
          ),
          "utf8"
        )
      );

    assert.equal(
      schema.$id,
      AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_SCHEMA
    );

    assert.equal(
      schema.properties
        .authority
        .properties
        .diagnosisOnly
        .const,
      true
    );

    assert.equal(
      schema.properties
        .authority
        .properties
        .repairAuthorized
        .const,
      false
    );

    assert.equal(
      schema.properties
        .authority
        .properties
        .workflowMutationAuthorized
        .const,
      false
    );
  }
);

test(
  "real 09-11 ledger truth produces observation gaps only and no fabricated truth anomaly",
  () => {
    const expected = {
      "2026-09-09": {
        fingerprint:
          "d818b6fff1f5bd2a9e4ab075a8700a3be2ce0ec7a8ca754c4a06e385d68306f0",
        ledgerState:
          "OPEN"
      },

      "2026-09-10": {
        fingerprint:
          "216a8b6e1347391f4ee5ebe97f7bd683a334d6ea3b4eab13a60a9af8dcecf8ae",
        ledgerState:
          "CLOSED"
      },

      "2026-09-11": {
        fingerprint:
          "1ec406a60e4ddf2ef3f4bf6e988b7b42868f2b4c2ddbd354494f0a080611858f",
        ledgerState:
          "CLOSED"
      }
    };

    for (
      const [
        dayKey,
        contract
      ] of Object.entries(
        expected
      )
    ) {
      const ledgerResult =
        buildDayTruthLedgerDay({
          dayKey,

          generatedAt:
            "2026-09-15T20:00:00.000Z"
        }).ledger;

      assert.equal(
        ledgerResult.truthFingerprint,
        contract.fingerprint,
        dayKey
      );

      assert.equal(
        ledgerResult.ledgerState,
        contract.ledgerState,
        dayKey
      );

      const audit =
        buildAutonomousTruthReconciliationAudit({
          ledger:
            ledgerResult,

          generatedAt:
            "2026-09-15T21:00:00.000Z"
        });

      assert.equal(
        audit.auditState,
        "OBSERVATION_GAPS",
        dayKey
      );

      assert.equal(
        audit.summary.blockingCount,
        0,
        dayKey
      );

      assert.equal(
        audit.summary.reconciliationRequiredCount,
        0,
        dayKey
      );

      assert.equal(
        audit.summary.observationGapCount,
        1,
        dayKey
      );

      assert.ok(
        audit.anomalies.some(
          row =>
            row.reasonCode ===
            "SETTLEMENT_NOT_OBSERVED"
        ),
        dayKey
      );

      assert.equal(
        audit.anomalies.some(
          row =>
            row.category ===
              "TRUTH" ||
            row.category ===
              "EVIDENCE"
        ),
        false,
        dayKey
      );

      assert.equal(
        audit.authority.repairAuthorized,
        false,
        dayKey
      );
    }
  }
);
