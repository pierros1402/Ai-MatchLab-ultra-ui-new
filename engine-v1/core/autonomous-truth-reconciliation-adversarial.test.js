import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousTruthReconciliationAudit
} from "./autonomous-truth-reconciliation-audit.js";

import {
  buildAutonomousTruthReconciliationEvidenceExpansion
} from "./autonomous-truth-reconciliation-evidence-expansion.js";

import {
  buildAutonomousTruthReconciliationPrimaryEvidence
} from "./autonomous-truth-reconciliation-primary-evidence.js";

const HASH =
  "e".repeat(64);

function fixture(
  id
) {
  return {
    canonicalId:
      id,

    operationalState:
      "PLAYED_TERMINAL",

    verifiedFinal: {
      present:
        true,

      accepted:
        true,

      reason:
        "verified_final_result"
    },

    decision: {
      status:
        "CONVERGED_PLAYED_FINAL",

      reason:
        "played_terminal_verified_final",

      historyEligible:
        true,

      scoredSettlementEligible:
        true,

      voidSettlementEligible:
        false,

      repairAuthorized:
        false
    }
  };
}

function convergence() {
  return {
    overallState:
      "CONVERGED",

    truthFingerprint:
      HASH,

    history: {
      observed:
        true,

      state:
        "PRESENT_CONVERGED",

      missingEligibleFixtureIds:
        [],

      unexpectedFixtureIds:
        [],

      duplicateFixtureIds:
        [],

      invalidTruthContractFixtureIds:
        [],

      structuralIssues:
        []
    },

    settlement: {
      observed:
        true,

      state:
        "PRESENT_CONVERGED",

      unresolvedRows:
        0,

      orphanSettlementRows:
        [],

      incompatibleSettlementRows:
        [],

      structurallyInvalidRows:
        [],

      structuralIssues:
        []
    },

    publication: {
      observed:
        true,

      state:
        "PRESENT_CONVERGED",

      missingCanonicalFixtureIds:
        [],

      extraPublishedFixtureIds:
        [],

      duplicatePublishedFixtureIds:
        []
    },

    systemHealth: {
      observed:
        true,

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

function ledger({
  ledgerState =
    "CLOSED",

  fixtures = [
    fixture(
      "canonical-a"
    )
  ],

  anomalies = {},

  downstream = null
} = {}) {
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

    ledgerState,

    truthFingerprint:
      HASH,

    fixtures,

    anomalies: {
      orphanVerifiedFinals:
        [],

      duplicateVerifiedFinalFixtureIds:
        [],

      conflictFixtureIds:
        [],

      pendingVerifiedFinalFixtureIds:
        [],

      ...anomalies
    },

    downstream: {
      convergence:
        downstream ||
        convergence()
    },

    authorization: {
      repairAuthorized:
        false
    }
  };
}

function audit(
  value,
  generatedAt =
    "2026-09-15T21:00:00.000Z"
) {
  return buildAutonomousTruthReconciliationAudit({
    ledger:
      value,

    generatedAt
  });
}

function evaluate(
  value
) {
  const resultAudit =
    audit(
      value
    );

  return {
    audit:
      resultAudit,

    downstream:
      buildAutonomousTruthReconciliationEvidenceExpansion({
        ledger:
          value,

        audit:
          resultAudit
      }),

    primary:
      buildAutonomousTruthReconciliationPrimaryEvidence({
        ledger:
          value,

        audit:
          resultAudit
      })
  };
}

/*
 * 1. An upstream ledger says CONFLICT but omitted the expected
 * fixture-specific diagnostic. The autonomous auditor must still
 * fail closed rather than treating absence of evidence as safety.
 */
test(
  "ledger CONFLICT without component diagnostic remains blocking fail-closed evidence",
  () => {
    const value =
      ledger({
        ledgerState:
          "CONFLICT"
      });

    const result =
      audit(
        value
      );

    assert.equal(
      result.auditState,
      "BLOCKED"
    );

    assert.ok(
      result.anomalies.some(
        row =>
          row.reasonCode ===
          "LEDGER_CONFLICT_WITHOUT_DIAGNOSTIC"
      )
    );

    assert.equal(
      result.authority.repairAuthorized,
      false
    );
  }
);

/*
 * 2. Same invariant for an unexplained INCOMPLETE ledger.
 */
test(
  "ledger INCOMPLETE without component diagnostic cannot silently converge",
  () => {
    const value =
      ledger({
        ledgerState:
          "INCOMPLETE"
      });

    const result =
      audit(
        value
      );

    assert.equal(
      result.auditState,
      "RECONCILIATION_REQUIRED"
    );

    assert.ok(
      result.anomalies.some(
        row =>
          row.reasonCode ===
          "LEDGER_INCOMPLETE_WITHOUT_DIAGNOSTIC"
      )
    );

    assert.equal(
      result.authority.repairAuthorized,
      false
    );
  }
);

/*
 * 3. Overall downstream CONFLICT without a conflicting component
 * must be treated as malformed/conflicting evidence, not ignored.
 */
test(
  "overall downstream CONFLICT without component conflict fails closed",
  () => {
    const downstream =
      convergence();

    downstream.overallState =
      "CONFLICT";

    const result =
      audit(
        ledger({
          downstream
        })
      );

    assert.equal(
      result.auditState,
      "BLOCKED"
    );

    assert.ok(
      result.anomalies.some(
        row =>
          row.reasonCode ===
          "DOWNSTREAM_CONFLICT_WITHOUT_COMPONENT"
      )
    );
  }
);

/*
 * 4. Same for unexplained downstream INCOMPLETE.
 */
test(
  "overall downstream INCOMPLETE without component incomplete state requires reconciliation",
  () => {
    const downstream =
      convergence();

    downstream.overallState =
      "INCOMPLETE";

    const result =
      audit(
        ledger({
          downstream
        })
      );

    assert.equal(
      result.auditState,
      "RECONCILIATION_REQUIRED"
    );

    assert.ok(
      result.anomalies.some(
        row =>
          row.reasonCode ===
          "DOWNSTREAM_INCOMPLETE_WITHOUT_COMPONENT"
      )
    );
  }
);

/*
 * 5. Blocking football truth must dominate weaker observation-gap
 * and diagnostic-only signals.
 */
test(
  "blocking truth conflict dominates observation gaps and System Health diagnostics",
  () => {
    const downstream =
      convergence();

    downstream.overallState =
      "PARTIALLY_OBSERVED";

    downstream.history = {
      observed:
        false,

      state:
        "NOT_OBSERVED",

      missingEligibleFixtureIds:
        [],

      unexpectedFixtureIds:
        [],

      duplicateFixtureIds:
        [],

      invalidTruthContractFixtureIds:
        [],

      structuralIssues:
        []
    };

    downstream.systemHealth = {
      observed:
        true,

      state:
        "OBSERVED_ERROR",

      severity:
        "error",

      alert:
        true,

      activeIssueCount:
        2,

      actionableIssueCount:
        2
    };

    const value =
      ledger({
        ledgerState:
          "CONFLICT",

        fixtures: [
          {
            ...fixture(
              "canonical-a"
            ),

            decision: {
              status:
                "CONFLICT",

              reason:
                "adversarial_truth_conflict",

              historyEligible:
                false,

              scoredSettlementEligible:
                false,

              voidSettlementEligible:
                false,

              repairAuthorized:
                false
            }
          }
        ],

        anomalies: {
          conflictFixtureIds: [
            "canonical-a"
          ]
        },

        downstream
      });

    const result =
      evaluate(
        value
      );

    assert.equal(
      result.audit.auditState,
      "BLOCKED"
    );

    assert.ok(
      result.audit.anomalies.some(
        row =>
          row.reasonCode ===
          "FIXTURE_TRUTH_CONFLICT"
      )
    );

    assert.ok(
      result.audit.anomalies.some(
        row =>
          row.reasonCode ===
          "HISTORY_NOT_OBSERVED"
      )
    );

    assert.ok(
      result.audit.anomalies.some(
        row =>
          row.reasonCode ===
          "SYSTEM_HEALTH_ERROR_SIGNAL"
      )
    );

    assert.equal(
      result.primary.authority.repairAuthorized,
      false
    );
  }
);

/*
 * 6. A caller must not be able to tamper with an otherwise valid
 * audit object and enable repair authority before evidence expansion.
 */
test(
  "tampered audit repair authority is rejected by both exact-evidence layers",
  () => {
    const value =
      ledger();

    const validAudit =
      audit(
        value
      );

    const tampered = {
      ...validAudit,

      authority: {
        ...validAudit.authority,

        repairAuthorized:
          true
      }
    };

    assert.throws(
      () =>
        buildAutonomousTruthReconciliationEvidenceExpansion({
          ledger:
            value,

          audit:
            tampered
        }),
      /repair_authority|authority_invalid/i
    );

    assert.throws(
      () =>
        buildAutonomousTruthReconciliationPrimaryEvidence({
          ledger:
            value,

          audit:
            tampered
        }),
      /repair_authority|authority_invalid/i
    );
  }
);

/*
 * 7. Convergence evidence bound to another truth fingerprint must
 * never enter the audit/control plane.
 */
test(
  "foreign convergence truth fingerprint is rejected before diagnosis",
  () => {
    const downstream =
      convergence();

    downstream.truthFingerprint =
      "f".repeat(64);

    const value =
      ledger({
        downstream
      });

    assert.throws(
      () =>
        audit(
          value
        ),
      /fingerprint|binding/i
    );
  }
);

/*
 * 8. Even an impossible/malformed settlement orphan row whose
 * string equals a current canonical ID must remain external
 * observed evidence in the downstream evidence layer.
 *
 * It must not grant canonical repair authority.
 */
test(
  "settlement orphan canonical-string collision remains blocking observed evidence",
  () => {
    const downstream =
      convergence();

    downstream.overallState =
      "CONFLICT";

    downstream.settlement = {
      ...downstream.settlement,

      state:
        "PRESENT_CONFLICT",

      orphanSettlementRows: [
        {
          canonicalId:
            "canonical-a",

          result:
            "WIN",

          reason:
            "settlement_row_missing_canonical_membership"
        }
      ]
    };

    const result =
      evaluate(
        ledger({
          ledgerState:
            "CONFLICT",

          downstream
        })
      );

    const finding =
      result.downstream.findings.find(
        row =>
          row.reasonCode ===
          "SETTLEMENT_ORPHAN_FIXTURE"
      );

    assert.ok(finding);

    assert.equal(
      finding.canonicalId,
      null
    );

    assert.equal(
      finding.observedFixtureId,
      "canonical-a"
    );

    assert.equal(
      finding.impact,
      "BLOCKING_CONFLICT"
    );

    assert.equal(
      result.downstream.authority.repairAuthorized,
      false
    );
  }
);

/*
 * 9. Same identity-class boundary for malformed publication
 * evidence: "extra" is an observed projection claim, not proof
 * of canonical membership.
 */
test(
  "publication extra canonical-string collision stays observed and blocking",
  () => {
    const downstream =
      convergence();

    downstream.overallState =
      "CONFLICT";

    downstream.publication = {
      ...downstream.publication,

      state:
        "PRESENT_CONFLICT",

      extraPublishedFixtureIds: [
        "canonical-a"
      ]
    };

    const result =
      evaluate(
        ledger({
          ledgerState:
            "CONFLICT",

          downstream
        })
      );

    const finding =
      result.downstream.findings.find(
        row =>
          row.reasonCode ===
          "PUBLICATION_EXTRA_FIXTURE"
      );

    assert.ok(finding);

    assert.equal(
      finding.canonicalId,
      null
    );

    assert.equal(
      finding.observedFixtureId,
      "canonical-a"
    );

    assert.equal(
      finding.impact,
      "BLOCKING_CONFLICT"
    );
  }
);

/*
 * 10. Ordering of mixed adversarial evidence must never alter
 * audit or evidence identity.
 */
test(
  "mixed adversarial evidence is deterministic regardless of source array ordering",
  () => {
    function makeValue(
      reverse
    ) {
      const downstream =
        convergence();

      downstream.overallState =
        "CONFLICT";

      downstream.history = {
        ...downstream.history,

        state:
          "PRESENT_CONFLICT",

        unexpectedFixtureIds:
          reverse
            ? [
                "history-z",
                "history-a"
              ]
            : [
                "history-a",
                "history-z"
              ]
      };

      downstream.publication = {
        ...downstream.publication,

        state:
          "PRESENT_CONFLICT",

        extraPublishedFixtureIds:
          reverse
            ? [
                "publication-z",
                "publication-a"
              ]
            : [
                "publication-a",
                "publication-z"
              ]
      };

      downstream.settlement = {
        ...downstream.settlement,

        state:
          "PRESENT_CONFLICT",

        orphanSettlementRows:
          reverse
            ? [
                {
                  canonicalId:
                    "settlement-z",

                  result:
                    "WIN",

                  reason:
                    "missing_membership"
                },

                {
                  canonicalId:
                    "settlement-a",

                  result:
                    "LOSS",

                  reason:
                    "missing_membership"
                }
              ]
            : [
                {
                  canonicalId:
                    "settlement-a",

                  result:
                    "LOSS",

                  reason:
                    "missing_membership"
                },

                {
                  canonicalId:
                    "settlement-z",

                  result:
                    "WIN",

                  reason:
                    "missing_membership"
                }
              ]
      };

      return ledger({
        ledgerState:
          "CONFLICT",

        fixtures: [
          fixture(
            "canonical-a"
          ),
          fixture(
            "canonical-b"
          )
        ],

        anomalies: {
          duplicateVerifiedFinalFixtureIds:
            reverse
              ? [
                  "canonical-b",
                  "canonical-a"
                ]
              : [
                  "canonical-a",
                  "canonical-b"
                ]
        },

        downstream
      });
    }

    const first =
      evaluate(
        makeValue(
          false
        )
      );

    const second =
      evaluate(
        makeValue(
          true
        )
      );

    assert.equal(
      first.audit.auditFingerprint,
      second.audit.auditFingerprint
    );

    assert.equal(
      first.downstream.evidenceFingerprint,
      second.downstream.evidenceFingerprint
    );

    assert.equal(
      first.primary.evidenceFingerprint,
      second.primary.evidenceFingerprint
    );

    assert.deepEqual(
      first.downstream.findings,
      second.downstream.findings
    );

    assert.deepEqual(
      first.primary.findings,
      second.primary.findings
    );

    assert.equal(
      first.audit.auditState,
      "BLOCKED"
    );

    assert.equal(
      first.audit.authority.repairAuthorized,
      false
    );
  }
);
