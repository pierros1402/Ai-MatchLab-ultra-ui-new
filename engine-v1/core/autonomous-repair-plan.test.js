import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousRepairPolicyDay
} from "./autonomous-repair-policy-day.js";

import {
  verifyAutonomousRepairPolicyIndependently
} from "./autonomous-repair-policy-independent-verifier.js";

import {
  evaluateAutonomousRepairAuthorizationGate
} from "./autonomous-repair-authorization-gate.js";

import {
  buildAutonomousRepairPlan
} from "./autonomous-repair-plan.js";

const HASH =
  "a".repeat(64);

function fixture({
  canonicalId =
    "canonical-a",

  decisionStatus =
    "CONVERGED_PLAYED_FINAL",

  operationalState =
    "PLAYED_TERMINAL",

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
  downstreamFindings = [],
  primaryFindings = [],
  auditAnomalies = [],
  fixtures = [
    fixture()
  ]
} = {}) {
  return {
    ledger: {
      dayKey:
        "2026-09-16",

      generatedAt:
        "2026-09-16T06:00:00.000Z",

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
        "2026-09-16T06:01:00.000Z",

      auditFingerprint:
        "b".repeat(64),

      anomalies:
        auditAnomalies,

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

function bundle(
  input
) {
  const policy =
    buildAutonomousRepairPolicyDay({
      ...input,

      generatedAt:
        "2026-09-16T06:02:00.000Z"
    });

  const verification =
    verifyAutonomousRepairPolicyIndependently({
      ...input,
      policy,

      generatedAt:
        "2026-09-16T06:03:00.000Z"
    });

  const gate =
    evaluateAutonomousRepairAuthorizationGate({
      policy,
      verification,

      generatedAt:
        "2026-09-16T06:04:00.000Z"
    });

  return {
    policy,
    verification,
    gate
  };
}

function historyCandidateBundle() {
  return bundle(
    sources({
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
    })
  );
}

function publicationCandidateBundle() {
  return bundle(
    sources({
      downstreamFindings: [
        {
          findingId:
            "publication-missing",

          reasonCode:
            "PUBLICATION_MISSING_CANONICAL_FIXTURE",

          impact:
            "RECONCILIATION_REQUIRED",

          canonicalId:
            "canonical-a",

          observedFixtureId:
            null
        }
      ]
    })
  );
}

function candidateId(
  policy
) {
  return policy.decisions.find(
    row =>
      row.classification ===
      "ELIGIBLE_REPAIR_CANDIDATE"
  ).policyDecisionId;
}

function descriptor({
  targetPath,
  targetExists = false,
  currentSha256 = null,
  plannedContentSha256 =
    "1".repeat(64),
  plannedContentBytes =
    123
}) {
  return {
    targetPath,
    targetExists,
    currentSha256,
    plannedContentSha256,
    plannedContentBytes
  };
}

test(
  "repair plan schema freezes dry-run only and zero execution authority",
  () => {
    const schema =
      JSON.parse(
        fs.readFileSync(
          new URL(
            "../contracts/autonomous-repair-plan.schema.v1.json",
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
      authority.dryRunOnly.const,
      true
    );

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
      authority.rollbackExecutionAuthorized.const,
      false
    );
  }
);

test(
  "non-requestable no-candidate gate produces deterministic no-action plan",
  () => {
    const input =
      sources();

    const {
      policy,
      verification,
      gate
    } =
      bundle(
        input
      );

    assert.equal(
      gate.gateState,
      "NOT_REQUESTABLE_NO_CANDIDATES"
    );

    const plan =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,
        targetsByDecisionId:
          {}
      });

    assert.equal(
      plan.planState,
      "NO_ACTION_NOT_REQUESTABLE"
    );

    assert.equal(
      plan.summary.operationCount,
      0
    );

    assert.equal(
      plan.authority.executionAuthorized,
      false
    );
  }
);

test(
  "exact history candidate plus absent target produces CREATE with delete rollback",
  () => {
    const {
      policy,
      verification,
      gate
    } =
      historyCandidateBundle();

    assert.equal(
      gate.gateState,
      "REQUEST_ELIGIBLE"
    );

    const id =
      candidateId(
        policy
      );

    const plan =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,

        targetsByDecisionId: {
          [id]: [
            descriptor({
              targetPath:
                "data/history/2026-2027.json"
            })
          ]
        }
      });

    assert.equal(
      plan.planState,
      "DRY_RUN_READY"
    );

    assert.equal(
      plan.summary.operationCount,
      1
    );

    assert.equal(
      plan.operations[0].mutationMode,
      "CREATE"
    );

    assert.equal(
      plan.operations[0].rollback.strategy,
      "DELETE_CREATED_TARGET"
    );

    assert.equal(
      plan.operations[0].rollback.preimageRequired,
      false
    );

    assert.equal(
      plan.authority.filesystemWriteAuthorized,
      false
    );
  }
);

test(
  "existing history target produces REPLACE with exact preimage rollback hash",
  () => {
    const {
      policy,
      verification,
      gate
    } =
      historyCandidateBundle();

    const id =
      candidateId(
        policy
      );

    const preimage =
      "2".repeat(64);

    const plan =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,

        targetsByDecisionId: {
          [id]: [
            descriptor({
              targetPath:
                "data/history/2026-2027.json",

              targetExists:
                true,

              currentSha256:
                preimage
            })
          ]
        }
      });

    assert.equal(
      plan.planState,
      "DRY_RUN_READY"
    );

    assert.equal(
      plan.operations[0].mutationMode,
      "REPLACE"
    );

    assert.equal(
      plan.operations[0].precondition.expectedSha256,
      preimage
    );

    assert.equal(
      plan.operations[0].rollback.strategy,
      "RESTORE_PREIMAGE"
    );

    assert.equal(
      plan.operations[0].rollback.preimageSha256,
      preimage
    );
  }
);

test(
  "request-eligible candidate without exact targets blocks entire repair plan",
  () => {
    const {
      policy,
      verification,
      gate
    } =
      historyCandidateBundle();

    const plan =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,
        targetsByDecisionId:
          {}
      });

    assert.equal(
      plan.planState,
      "BLOCKED_TARGET_CONTRACT"
    );

    assert.equal(
      plan.summary.operationCount,
      0
    );

    assert.ok(
      plan.blockers.some(
        row =>
          row.code ===
          "CANDIDATE_TARGET_SET_MISSING"
      )
    );
  }
);

test(
  "unexpected target catalog entry blocks atomic plan",
  () => {
    const {
      policy,
      verification,
      gate
    } =
      historyCandidateBundle();

    const id =
      candidateId(
        policy
      );

    const plan =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,

        targetsByDecisionId: {
          [id]: [
            descriptor({
              targetPath:
                "data/history/2026-2027.json"
            })
          ],

          "arpd_v1_ffffffffffffffffffffffff": [
            descriptor({
              targetPath:
                "data/history/other.json"
            })
          ]
        }
      });

    assert.equal(
      plan.planState,
      "BLOCKED_TARGET_CONTRACT"
    );

    assert.equal(
      plan.operations.length,
      0
    );

    assert.ok(
      plan.blockers.some(
        row =>
          row.code ===
          "UNEXPECTED_TARGET_CATALOG_ENTRY"
      )
    );
  }
);

test(
  "duplicate target path blocks entire repair plan",
  () => {
    const input =
      sources({
        fixtures: [
          fixture({
            canonicalId:
              "canonical-a"
          }),

          fixture({
            canonicalId:
              "canonical-b"
          })
        ],

        downstreamFindings: [
          {
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
          },

          {
            findingId:
              "history-b",

            reasonCode:
              "HISTORY_MISSING_ELIGIBLE_FIXTURE",

            impact:
              "RECONCILIATION_REQUIRED",

            canonicalId:
              "canonical-b",

            observedFixtureId:
              null
          }
        ]
      });

    const {
      policy,
      verification,
      gate
    } =
      bundle(
        input
      );

    const ids =
      policy.decisions
        .filter(
          row =>
            row.classification ===
            "ELIGIBLE_REPAIR_CANDIDATE"
        )
        .map(
          row =>
            row.policyDecisionId
        );

    const target =
      "data/history/2026-2027.json";

    const plan =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,

        targetsByDecisionId: {
          [ids[0]]: [
            descriptor({
              targetPath:
                target
            })
          ],

          [ids[1]]: [
            descriptor({
              targetPath:
                target
            })
          ]
        }
      });

    assert.equal(
      plan.planState,
      "BLOCKED_TARGET_CONTRACT"
    );

    assert.equal(
      plan.operations.length,
      0
    );

    assert.ok(
      plan.blockers.some(
        row =>
          row.code ===
          "DUPLICATE_TARGET_PATH"
      )
    );
  }
);

test(
  "protected frozen Value publication target is rejected",
  () => {
    const {
      policy,
      verification,
      gate
    } =
      publicationCandidateBundle();

    const id =
      candidateId(
        policy
      );

    const plan =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,

        targetsByDecisionId: {
          [id]: [
            descriptor({
              targetPath:
                "data/deploy-snapshots/2026-09-16/value.json"
            })
          ]
        }
      });

    assert.equal(
      plan.planState,
      "BLOCKED_TARGET_CONTRACT"
    );

    assert.ok(
      plan.blockers.some(
        row =>
          row.code ===
          "PROTECTED_TARGET_PATH"
      )
    );
  }
);

test(
  "repair-class target root mismatch is rejected",
  () => {
    const {
      policy,
      verification,
      gate
    } =
      historyCandidateBundle();

    const id =
      candidateId(
        policy
      );

    const plan =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,

        targetsByDecisionId: {
          [id]: [
            descriptor({
              targetPath:
                "data/deploy-snapshots/2026-09-16/fixtures.json"
            })
          ]
        }
      });

    assert.equal(
      plan.planState,
      "BLOCKED_TARGET_CONTRACT"
    );

    assert.ok(
      plan.blockers.some(
        row =>
          row.code ===
          "TARGET_REPAIR_CLASS_MISMATCH"
      )
    );
  }
);

test(
  "pending verified-final candidate requires exact day and canonical target path",
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

        primaryFindings: [
          {
            findingId:
              "pending",

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

    const {
      policy,
      verification,
      gate
    } =
      bundle(
        input
      );

    const id =
      candidateId(
        policy
      );

    const good =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,

        targetsByDecisionId: {
          [id]: [
            descriptor({
              targetPath:
                "data/final-results/2026-09-16/canonical-a.json"
            })
          ]
        }
      });

    assert.equal(
      good.planState,
      "DRY_RUN_READY"
    );

    const wrongDay =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,

        targetsByDecisionId: {
          [id]: [
            descriptor({
              targetPath:
                "data/final-results/2026-09-15/canonical-a.json"
            })
          ]
        }
      });

    assert.equal(
      wrongDay.planState,
      "BLOCKED_TARGET_CONTRACT"
    );
  }
);

test(
  "self-asserted or stale verification cannot enter repair planning",
  () => {
    const {
      policy,
      verification,
      gate
    } =
      historyCandidateBundle();

    const fake = {
      ...verification,

      verificationFingerprint:
        "f".repeat(64)
    };

    assert.throws(
      () =>
        buildAutonomousRepairPlan({
          policy,
          verification:
            fake,
          gate,
          targetsByDecisionId:
            {}
        }),
      /verification_invalid/
    );
  }
);

test(
  "repair plan fingerprint and operation ordering ignore generatedAt and catalog order",
  () => {
    const input =
      sources({
        fixtures: [
          fixture({
            canonicalId:
              "canonical-a"
          }),

          fixture({
            canonicalId:
              "canonical-b"
          })
        ],

        downstreamFindings: [
          {
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
          },

          {
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
          }
        ]
      });

    const {
      policy,
      verification,
      gate
    } =
      bundle(
        input
      );

    const history =
      policy.decisions.find(
        row =>
          row.repairClass ===
          "REBUILD_HISTORY_ELIGIBLE_ROW"
      );

    const publication =
      policy.decisions.find(
        row =>
          row.repairClass ===
          "REBUILD_PUBLICATION_CANONICAL_ROW"
      );

    const first =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,

        generatedAt:
          "2026-09-16T06:10:00.000Z",

        targetsByDecisionId: {
          [history.policyDecisionId]: [
            descriptor({
              targetPath:
                "data/history/2026-2027.json"
            })
          ],

          [publication.policyDecisionId]: [
            descriptor({
              targetPath:
                "data/deploy-snapshots/2026-09-16/fixtures.json"
            })
          ]
        }
      });

    const second =
      buildAutonomousRepairPlan({
        policy,
        verification,
        gate,

        generatedAt:
          "2026-09-16T09:00:00.000Z",

        targetsByDecisionId: {
          [publication.policyDecisionId]: [
            descriptor({
              targetPath:
                "data/deploy-snapshots/2026-09-16/fixtures.json"
            })
          ],

          [history.policyDecisionId]: [
            descriptor({
              targetPath:
                "data/history/2026-2027.json"
            })
          ]
        }
      });

    assert.equal(
      first.planFingerprint,
      second.planFingerprint
    );

    assert.deepEqual(
      first.operations,
      second.operations
    );

    assert.notEqual(
      first.generatedAt,
      second.generatedAt
    );
  }
);

test(
  "upstream authority escape is rejected before repair planning",
  () => {
    const {
      policy,
      verification,
      gate
    } =
      historyCandidateBundle();

    const tamperedGate = {
      ...gate,

      authority: {
        ...gate.authority,

        repairAuthorized:
          true
      }
    };

    assert.throws(
      () =>
        buildAutonomousRepairPlan({
          policy,
          verification,
          gate:
            tamperedGate,
          targetsByDecisionId:
            {}
        }),
      /repairAuthorized_forbidden/
    );
  }
);
