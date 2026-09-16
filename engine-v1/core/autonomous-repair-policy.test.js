import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyAutonomousRepairPolicyDecision
} from "./autonomous-repair-policy.js";

function diagnosis({
  sourceLayer =
    "primary",

  sourceId =
    "source-1",

  reasonCode,

  canonicalId =
    null,

  observedFixtureId =
    null,

  impact =
    null
}) {
  return {
    sourceLayer,
    sourceId,
    reasonCode,
    canonicalId,
    observedFixtureId,
    impact
  };
}

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

test(
  "schema freezes candidate selection without repair execution or filesystem authority",
  () => {
    const schema =
      JSON.parse(
        fs.readFileSync(
          new URL(
            "../contracts/autonomous-repair-policy-decision.schema.v1.json",
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
  "pending verified-final canonical fixture is candidate only when played-terminal truth prerequisites match",
  () => {
    const result =
      classifyAutonomousRepairPolicyDecision({
        diagnosis:
          diagnosis({
            reasonCode:
              "VERIFIED_FINAL_PENDING_CANONICAL_FIXTURE",

            canonicalId:
              "canonical-a"
          }),

        fixture:
          fixture({
            operationalState:
              "PLAYED_TERMINAL",

            decisionStatus:
              "PENDING_VERIFIED_FINAL",

            verifiedFinalAccepted:
              false,

            historyEligible:
              false
          })
      });

    assert.equal(
      result.classification,
      "ELIGIBLE_REPAIR_CANDIDATE"
    );

    assert.equal(
      result.repairClass,
      "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
    );

    assert.equal(
      result.candidateEligible,
      true
    );

    assert.equal(
      result.authority.repairAuthorized,
      false
    );

    assert.equal(
      result.authority.executionAuthorized,
      false
    );
  }
);

test(
  "pending final without exact canonical membership is quarantined",
  () => {
    const result =
      classifyAutonomousRepairPolicyDecision({
        diagnosis:
          diagnosis({
            reasonCode:
              "VERIFIED_FINAL_PENDING_CANONICAL_FIXTURE",

            canonicalId:
              "canonical-a"
          }),

        fixture:
          fixture({
            canonicalId:
              "different-canonical",

            decisionStatus:
              "PENDING_VERIFIED_FINAL",

            verifiedFinalAccepted:
              false
          })
      });

    assert.equal(
      result.classification,
      "QUARANTINE"
    );

    assert.equal(
      result.candidateEligible,
      false
    );
  }
);

test(
  "missing eligible history projection becomes candidate only from accepted played-final truth",
  () => {
    const result =
      classifyAutonomousRepairPolicyDecision({
        diagnosis:
          diagnosis({
            sourceLayer:
              "downstream",

            reasonCode:
              "HISTORY_MISSING_ELIGIBLE_FIXTURE",

            canonicalId:
              "canonical-a"
          }),

        fixture:
          fixture()
      });

    assert.equal(
      result.classification,
      "ELIGIBLE_REPAIR_CANDIDATE"
    );

    assert.equal(
      result.repairClass,
      "REBUILD_HISTORY_ELIGIBLE_ROW"
    );

    assert.equal(
      result.evidence.verifiedFinalAccepted,
      true
    );

    assert.equal(
      result.evidence.historyEligible,
      true
    );
  }
);

test(
  "history projection repair candidate is rejected when verified-final truth is absent",
  () => {
    const result =
      classifyAutonomousRepairPolicyDecision({
        diagnosis:
          diagnosis({
            sourceLayer:
              "downstream",

            reasonCode:
              "HISTORY_MISSING_ELIGIBLE_FIXTURE",

            canonicalId:
              "canonical-a"
          }),

        fixture:
          fixture({
            verifiedFinalAccepted:
              false
          })
      });

    assert.equal(
      result.classification,
      "QUARANTINE"
    );

    assert.equal(
      result.candidateEligible,
      false
    );
  }
);

test(
  "missing canonical publication row is a derived projection repair candidate",
  () => {
    const result =
      classifyAutonomousRepairPolicyDecision({
        diagnosis:
          diagnosis({
            sourceLayer:
              "downstream",

            reasonCode:
              "PUBLICATION_MISSING_CANONICAL_FIXTURE",

            canonicalId:
              "canonical-a"
          }),

        fixture:
          fixture()
      });

    assert.equal(
      result.classification,
      "ELIGIBLE_REPAIR_CANDIDATE"
    );

    assert.equal(
      result.repairClass,
      "REBUILD_PUBLICATION_CANONICAL_ROW"
    );

    assert.equal(
      result.authority.filesystemWriteAuthorized,
      false
    );
  }
);

test(
  "publication candidate is quarantined when canonical truth itself is conflicting",
  () => {
    const result =
      classifyAutonomousRepairPolicyDecision({
        diagnosis:
          diagnosis({
            sourceLayer:
              "downstream",

            reasonCode:
              "PUBLICATION_MISSING_CANONICAL_FIXTURE",

            canonicalId:
              "canonical-a"
          }),

        fixture:
          fixture({
            operationalState:
              "CONFLICT",

            decisionStatus:
              "CONFLICT"
          })
      });

    assert.equal(
      result.classification,
      "QUARANTINE"
    );
  }
);

test(
  "missing observations and System Health signals remain observation-only",
  () => {
    for (
      const reasonCode of [
        "HISTORY_NOT_OBSERVED",
        "SETTLEMENT_NOT_OBSERVED",
        "PUBLICATION_NOT_OBSERVED",
        "SYSTEM_HEALTH_WARNING_SIGNAL",
        "SYSTEM_HEALTH_ERROR_SIGNAL"
      ]
    ) {
      const result =
        classifyAutonomousRepairPolicyDecision({
          diagnosis:
            diagnosis({
              sourceLayer:
                "audit",

              sourceId:
                reasonCode,

              reasonCode
            })
        });

      assert.equal(
        result.classification,
        "OBSERVATION_ONLY",
        reasonCode
      );

      assert.equal(
        result.candidateEligible,
        false,
        reasonCode
      );
    }
  }
);

test(
  "count-only settlement unresolved evidence is quarantined because no fixture identity exists",
  () => {
    const result =
      classifyAutonomousRepairPolicyDecision({
        diagnosis:
          diagnosis({
            sourceLayer:
              "downstream",

            reasonCode:
              "SETTLEMENT_UNRESOLVED_COUNT_ONLY"
          })
      });

    assert.equal(
      result.classification,
      "QUARANTINE"
    );

    assert.equal(
      result.diagnosis.canonicalId,
      null
    );

    assert.equal(
      result.diagnosis.observedFixtureId,
      null
    );
  }
);

test(
  "orphan and extra observed identities are quarantined and never repair candidates",
  () => {
    for (
      const reasonCode of [
        "HISTORY_UNEXPECTED_FIXTURE",
        "SETTLEMENT_ORPHAN_FIXTURE",
        "PUBLICATION_EXTRA_FIXTURE",
        "VERIFIED_FINAL_ORPHAN_OBSERVED_FIXTURE"
      ]
    ) {
      const result =
        classifyAutonomousRepairPolicyDecision({
          diagnosis:
            diagnosis({
              sourceLayer:
                "downstream",

              sourceId:
                reasonCode,

              reasonCode,

              observedFixtureId:
                "stale-observed-id"
            })
        });

      assert.equal(
        result.classification,
        "QUARANTINE",
        reasonCode
      );

      assert.equal(
        result.candidateEligible,
        false,
        reasonCode
      );

      assert.equal(
        result.repairClass,
        null,
        reasonCode
      );
    }
  }
);

test(
  "truth duplicate structural and incompatible evidence hard-blocks autonomous repair",
  () => {
    for (
      const reasonCode of [
        "FIXTURE_TRUTH_CONFLICT",
        "DUPLICATE_VERIFIED_FINAL_EVIDENCE",
        "LEDGER_CONFLICT_WITHOUT_DIAGNOSTIC",
        "HISTORY_DUPLICATE_FIXTURE",
        "HISTORY_INVALID_TRUTH_CONTRACT_FIXTURE",
        "HISTORY_STRUCTURAL_ISSUE",
        "SETTLEMENT_INCOMPATIBLE_TRUTH",
        "SETTLEMENT_STRUCTURALLY_INVALID_ROW",
        "SETTLEMENT_STRUCTURAL_ISSUE",
        "PUBLICATION_DUPLICATE_FIXTURE",
        "TRUTH_CONFLICT_CANONICAL_FIXTURE",
        "VERIFIED_FINAL_DUPLICATE_CANONICAL_FIXTURE",
        "VERIFIED_FINAL_ORPHAN_CANONICAL_CONTRADICTION",
        "VERIFIED_FINAL_ORPHAN_MISSING_FIXTURE_ID"
      ]
    ) {
      const result =
        classifyAutonomousRepairPolicyDecision({
          diagnosis:
            diagnosis({
              sourceLayer:
                "primary",

              sourceId:
                reasonCode,

              reasonCode,

              canonicalId:
                reasonCode ===
                  "VERIFIED_FINAL_ORPHAN_MISSING_FIXTURE_ID"
                  ? null
                  : "canonical-a"
            }),

          fixture:
            fixture()
        });

      assert.equal(
        result.classification,
        "HARD_BLOCK",
        reasonCode
      );

      assert.equal(
        result.authority.repairAuthorized,
        false,
        reasonCode
      );
    }
  }
);

test(
  "generic incomplete evidence remains quarantine rather than being promoted to a candidate",
  () => {
    for (
      const reasonCode of [
        "PLAYED_TERMINAL_PENDING_VERIFIED_FINAL",
        "HISTORY_INCOMPLETE",
        "SETTLEMENT_UNRESOLVED",
        "PUBLICATION_INCOMPLETE",
        "DOWNSTREAM_INCOMPLETE_WITHOUT_COMPONENT"
      ]
    ) {
      const result =
        classifyAutonomousRepairPolicyDecision({
          diagnosis:
            diagnosis({
              sourceLayer:
                "audit",

              sourceId:
                reasonCode,

              reasonCode,

              canonicalId:
                "canonical-a"
            }),

          fixture:
            fixture()
        });

      assert.equal(
        result.classification,
        "QUARANTINE",
        reasonCode
      );

      assert.equal(
        result.candidateEligible,
        false,
        reasonCode
      );
    }
  }
);

test(
  "unknown future reason code hard-blocks fail-closed",
  () => {
    const result =
      classifyAutonomousRepairPolicyDecision({
        diagnosis:
          diagnosis({
            reasonCode:
              "FUTURE_REASON_NOT_IN_POLICY"
          })
      });

    assert.equal(
      result.classification,
      "HARD_BLOCK"
    );

    assert.equal(
      result.policyReason,
      "unknown_reason_code_fail_closed"
    );

    assert.equal(
      result.candidateEligible,
      false
    );
  }
);

test(
  "canonical and observed identity overlap is rejected structurally",
  () => {
    assert.throws(
      () =>
        classifyAutonomousRepairPolicyDecision({
          diagnosis:
            diagnosis({
              reasonCode:
                "PUBLICATION_EXTRA_FIXTURE",

              canonicalId:
                "same",

              observedFixtureId:
                "same"
            })
        }),
      /identity_overlap/
    );
  }
);

test(
  "policy decision identity is deterministic and ignores irrelevant object key ordering",
  () => {
    const first =
      classifyAutonomousRepairPolicyDecision({
        diagnosis: {
          sourceLayer:
            "downstream",

          sourceId:
            "finding-1",

          reasonCode:
            "HISTORY_MISSING_ELIGIBLE_FIXTURE",

          impact:
            "RECONCILIATION_REQUIRED",

          canonicalId:
            "canonical-a",

          observedFixtureId:
            null
        },

        fixture:
          fixture()
      });

    const second =
      classifyAutonomousRepairPolicyDecision({
        fixture: {
          decision: {
            repairAuthorized:
              false,

            historyEligible:
              true,

            status:
              "CONVERGED_PLAYED_FINAL"
          },

          verifiedFinal: {
            accepted:
              true
          },

          operationalState:
            "PLAYED_TERMINAL",

          canonicalId:
            "canonical-a"
        },

        diagnosis: {
          observedFixtureId:
            null,

          canonicalId:
            "canonical-a",

          impact:
            "RECONCILIATION_REQUIRED",

          reasonCode:
            "HISTORY_MISSING_ELIGIBLE_FIXTURE",

          sourceId:
            "finding-1",

          sourceLayer:
            "downstream"
        }
      });

    assert.deepEqual(
      first,
      second
    );

    assert.equal(
      first.candidateEligible,
      true
    );
  }
);
