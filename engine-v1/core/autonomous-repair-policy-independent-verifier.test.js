import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousRepairPolicyDay
} from "./autonomous-repair-policy-day.js";

import {
  verifyAutonomousRepairPolicyIndependently,
  validateAutonomousRepairPolicyVerificationArtifact
} from "./autonomous-repair-policy-independent-verifier.js";

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
        repairAuthorized:
          false,

        filesystemWriteAuthorized:
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
        repairAuthorized:
          false,

        filesystemWriteAuthorized:
          false,

        workflowMutationAuthorized:
          false
      }
    }
  };
}

function policyFor(
  input
) {
  return buildAutonomousRepairPolicyDay({
    ...input,

    generatedAt:
      "2026-09-15T22:00:00.000Z"
  });
}

function verify(
  input,
  policy
) {
  return verifyAutonomousRepairPolicyIndependently({
    ...input,
    policy,

    generatedAt:
      "2026-09-15T23:00:00.000Z"
  });
}

test(
  "verification schema freezes zero repair execution filesystem workflow and authorization authority",
  () => {
    const schema =
      JSON.parse(
        fs.readFileSync(
          new URL(
            "../contracts/autonomous-repair-policy-verification.schema.v1.json",
            import.meta.url
          ),
          "utf8"
        )
      );

    const authority =
      schema.properties
        .authority
        .properties;

    for (
      const field of [
        "filesystemWriteAuthorized",
        "repairAuthorized",
        "executionAuthorized",
        "workflowMutationAuthorized",
        "authorizationGranted"
      ]
    ) {
      assert.equal(
        authority[field].const,
        false,
        field
      );
    }
  }
);

test(
  "independent verifier accepts exact candidate policy reconstructed from raw evidence",
  () => {
    const input =
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
      });

    const policy =
      policyFor(
        input
      );

    const verification =
      verify(
        input,
        policy
      );

    assert.equal(
      verification.verified,
      true
    );

    assert.deepEqual(
      verification.mismatchReasons,
      []
    );

    assert.equal(
      verification.expectedPolicyState,
      "CANDIDATES_PRESENT"
    );

    assert.equal(
      verification.candidateDecisionIds.length,
      1
    );
  }
);

test(
  "independent verifier catches candidate omitted from policy",
  () => {
    const input =
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
      });

    const policy =
      policyFor(
        input
      );

    const tampered = {
      ...policy,

      policyState:
        "CLEAR",

      decisions:
        []
    };

    const verification =
      verify(
        input,
        tampered
      );

    assert.equal(
      verification.verified,
      false
    );

    assert.ok(
      verification.mismatchReasons.includes(
        "SEMANTIC_POLICY_DECISIONS_MISMATCH"
      )
    );

    assert.ok(
      verification.mismatchReasons.includes(
        "POLICY_STATE_MISMATCH"
      )
    );
  }
);

test(
  "independent verifier catches hidden hard block omitted from policy",
  () => {
    const input =
      sources({
        primaryFindings: [
          {
            findingId:
              "duplicate",

            reasonCode:
              "VERIFIED_FINAL_DUPLICATE_CANONICAL_FIXTURE",

            impact:
              "BLOCKING_CONFLICT",

            canonicalId:
              "canonical-a",

            observedFixtureId:
              null
          }
        ]
      });

    const correct =
      policyFor(
        input
      );

    const tampered = {
      ...correct,

      policyState:
        "CLEAR",

      decisions:
        []
    };

    const verification =
      verify(
        input,
        tampered
      );

    assert.equal(
      verification.verified,
      false
    );

    assert.equal(
      verification.expectedPolicyState,
      "BLOCKED"
    );
  }
);

test(
  "independent verifier catches stale source fingerprint binding",
  () => {
    const input =
      sources();

    const policy =
      policyFor(
        input
      );

    const tampered = {
      ...policy,

      truthFingerprint:
        "f".repeat(64)
    };

    const verification =
      verify(
        input,
        tampered
      );

    assert.equal(
      verification.verified,
      false
    );

    assert.ok(
      verification.mismatchReasons.includes(
        "POLICY_TRUTH_FINGERPRINT_MISMATCH"
      )
    );
  }
);

test(
  "pending-final candidate is independently reconstructed from fixture truth rather than policy claim",
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
              "generic-pending",

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
              "exact-pending",

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
      policyFor(
        input
      );

    const verification =
      verify(
        input,
        policy
      );

    assert.equal(
      verification.verified,
      true
    );

    assert.equal(
      verification.semanticDecisionCount,
      1
    );
  }
);

test(
  "observed stale identity is independently reconstructed as quarantine",
  () => {
    const input =
      sources({
        downstreamFindings: [
          {
            findingId:
              "stale",

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
      });

    const policy =
      policyFor(
        input
      );

    const verification =
      verify(
        input,
        policy
      );

    assert.equal(
      verification.verified,
      true
    );

    assert.equal(
      verification.expectedPolicyState,
      "QUARANTINED"
    );

    assert.deepEqual(
      verification.candidateDecisionIds,
      []
    );
  }
);

test(
  "verification fingerprint ignores generatedAt-only churn",
  () => {
    const input =
      sources();

    const policy =
      policyFor(
        input
      );

    const first =
      verifyAutonomousRepairPolicyIndependently({
        ...input,
        policy,

        generatedAt:
          "2026-09-15T23:00:00.000Z"
      });

    const second =
      verifyAutonomousRepairPolicyIndependently({
        ...input,
        policy,

        generatedAt:
          "2026-09-16T06:00:00.000Z"
      });

    assert.equal(
      first.verificationFingerprint,
      second.verificationFingerprint
    );

    assert.notEqual(
      first.generatedAt,
      second.generatedAt
    );
  }
);

test(
  "artifact validator accepts genuine independent artifact and rejects tampered fingerprint",
  () => {
    const input =
      sources();

    const policy =
      policyFor(
        input
      );

    const verification =
      verify(
        input,
        policy
      );

    assert.equal(
      validateAutonomousRepairPolicyVerificationArtifact({
        verification,
        policy
      }).valid,
      true
    );

    const tampered = {
      ...verification,

      verificationFingerprint:
        "f".repeat(64)
    };

    assert.equal(
      validateAutonomousRepairPolicyVerificationArtifact({
        verification:
          tampered,

        policy
      }).valid,
      false
    );
  }
);

test(
  "artifact validator rejects verification bound to another policy source chain",
  () => {
    const input =
      sources();

    const policy =
      policyFor(
        input
      );

    const verification =
      verify(
        input,
        policy
      );

    const anotherPolicy = {
      ...policy,

      policyFingerprint:
        "f".repeat(64)
    };

    const validation =
      validateAutonomousRepairPolicyVerificationArtifact({
        verification,
        policy:
          anotherPolicy
      });

    assert.equal(
      validation.valid,
      false
    );

    assert.equal(
      validation.reason,
      "verification_artifact_source_binding_mismatch"
    );
  }
);
