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

const HASH =
  "a".repeat(64);

function fixture({
  canonicalId =
    "canonical-a"
} = {}) {
  return {
    canonicalId,

    operationalState:
      "PLAYED_TERMINAL",

    verifiedFinal: {
      accepted:
        true
    },

    decision: {
      status:
        "CONVERGED_PLAYED_FINAL",

      historyEligible:
        true,

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

function candidateBundle({
  auditAnomalies = []
} = {}) {
  const input =
    sources({
      auditAnomalies,

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
    buildAutonomousRepairPolicyDay({
      ...input,

      generatedAt:
        "2026-09-15T22:00:00.000Z"
    });

  const verification =
    verifyAutonomousRepairPolicyIndependently({
      ...input,
      policy,

      generatedAt:
        "2026-09-15T23:00:00.000Z"
    });

  return {
    input,
    policy,
    verification
  };
}

test(
  "gate schema still grants zero authorization repair execution filesystem and workflow authority",
  () => {
    const schema =
      JSON.parse(
        fs.readFileSync(
          new URL(
            "../contracts/autonomous-repair-authorization-gate.schema.v1.json",
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
      authority.authorizationGranted.const,
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
      authority.filesystemWriteAuthorized.const,
      false
    );
  }
);

test(
  "candidate without verification artifact is denied",
  () => {
    const {
      policy
    } =
      candidateBundle();

    const gate =
      evaluateAutonomousRepairAuthorizationGate({
        policy
      });

    assert.equal(
      gate.gateState,
      "DENIED_VERIFICATION_REQUIRED"
    );
  }
);

test(
  "legacy self-asserted verification object cannot satisfy hardened gate",
  () => {
    const {
      policy
    } =
      candidateBundle();

    const fake = {
      verifierKind:
        "independent_repair_policy_verifier",

      verified:
        true,

      policyFingerprint:
        policy.policyFingerprint,

      candidateDecisionIds:
        policy.decisions.map(
          row =>
            row.policyDecisionId
        )
    };

    const gate =
      evaluateAutonomousRepairAuthorizationGate({
        policy,
        verification:
          fake
      });

    assert.equal(
      gate.gateState,
      "DENIED_VERIFICATION_MISMATCH"
    );

    assert.equal(
      gate.verification.artifactValid,
      false
    );
  }
);

test(
  "genuine independently reconstructed artifact makes request eligible but never authorized",
  () => {
    const {
      policy,
      verification
    } =
      candidateBundle();

    assert.equal(
      verification.verified,
      true
    );

    const gate =
      evaluateAutonomousRepairAuthorizationGate({
        policy,
        verification
      });

    assert.equal(
      gate.gateState,
      "REQUEST_ELIGIBLE"
    );

    assert.equal(
      gate.authority.authorizationRequestEligible,
      true
    );

    assert.equal(
      gate.authority.authorizationGranted,
      false
    );

    assert.equal(
      gate.authority.repairAuthorized,
      false
    );

    assert.equal(
      gate.authority.executionAuthorized,
      false
    );
  }
);

test(
  "tampered independent artifact fingerprint is rejected",
  () => {
    const {
      policy,
      verification
    } =
      candidateBundle();

    const gate =
      evaluateAutonomousRepairAuthorizationGate({
        policy,

        verification: {
          ...verification,

          verificationFingerprint:
            "f".repeat(64)
        }
      });

    assert.equal(
      gate.gateState,
      "DENIED_VERIFICATION_MISMATCH"
    );
  }
);

test(
  "artifact bound to another policy is rejected",
  () => {
    const {
      policy,
      verification
    } =
      candidateBundle();

    const alteredPolicy = {
      ...policy,

      policyFingerprint:
        "f".repeat(64)
    };

    const gate =
      evaluateAutonomousRepairAuthorizationGate({
        policy:
          alteredPolicy,

        verification
      });

    assert.equal(
      gate.gateState,
      "DENIED_VERIFICATION_MISMATCH"
    );
  }
);

test(
  "System Health error denies request even with genuine independent verification",
  () => {
    const {
      policy,
      verification
    } =
      candidateBundle({
        auditAnomalies: [
          {
            anomalyId:
              "health-error",

            reasonCode:
              "SYSTEM_HEALTH_ERROR_SIGNAL",

            impact:
              "DIAGNOSTIC_ONLY"
          }
        ]
      });

    const gate =
      evaluateAutonomousRepairAuthorizationGate({
        policy,
        verification
      });

    assert.equal(
      gate.gateState,
      "DENIED_DIAGNOSTIC_BLOCKER"
    );
  }
);

test(
  "System Health warning does not alone deny a genuine verified request",
  () => {
    const {
      policy,
      verification
    } =
      candidateBundle({
        auditAnomalies: [
          {
            anomalyId:
              "health-warning",

            reasonCode:
              "SYSTEM_HEALTH_WARNING_SIGNAL",

            impact:
              "DIAGNOSTIC_ONLY"
          }
        ]
      });

    const gate =
      evaluateAutonomousRepairAuthorizationGate({
        policy,
        verification
      });

    assert.equal(
      gate.gateState,
      "REQUEST_ELIGIBLE"
    );

    assert.equal(
      gate.authority.authorizationGranted,
      false
    );
  }
);

test(
  "no candidate policy remains not requestable without requiring verification",
  () => {
    const input =
      sources();

    const policy =
      buildAutonomousRepairPolicyDay({
        ...input,

        generatedAt:
          "2026-09-15T22:00:00.000Z"
      });

    const gate =
      evaluateAutonomousRepairAuthorizationGate({
        policy
      });

    assert.equal(
      gate.gateState,
      "NOT_REQUESTABLE_NO_CANDIDATES"
    );
  }
);

test(
  "gate fingerprint remains deterministic for same independently verified inputs",
  () => {
    const {
      policy,
      verification
    } =
      candidateBundle();

    const first =
      evaluateAutonomousRepairAuthorizationGate({
        policy,
        verification,

        generatedAt:
          "2026-09-15T23:10:00.000Z"
      });

    const second =
      evaluateAutonomousRepairAuthorizationGate({
        policy,
        verification,

        generatedAt:
          "2026-09-16T07:00:00.000Z"
      });

    assert.equal(
      first.gateFingerprint,
      second.gateFingerprint
    );

    assert.notEqual(
      first.generatedAt,
      second.generatedAt
    );
  }
);

test(
  "hard-block policy still dominates verification artifact",
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

    const policy =
      buildAutonomousRepairPolicyDay({
        ...input,

        generatedAt:
          "2026-09-15T22:00:00.000Z"
      });

    const verification =
      verifyAutonomousRepairPolicyIndependently({
        ...input,
        policy,

        generatedAt:
          "2026-09-15T23:00:00.000Z"
      });

    const gate =
      evaluateAutonomousRepairAuthorizationGate({
        policy,
        verification
      });

    assert.equal(
      gate.gateState,
      "DENIED_POLICY_BLOCKED"
    );

    assert.equal(
      gate.authority.authorizationRequestEligible,
      false
    );
  }
);

test(
  "quarantine policy still dominates verification artifact",
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
      buildAutonomousRepairPolicyDay({
        ...input,

        generatedAt:
          "2026-09-15T22:00:00.000Z"
      });

    const verification =
      verifyAutonomousRepairPolicyIndependently({
        ...input,
        policy,

        generatedAt:
          "2026-09-15T23:00:00.000Z"
      });

    const gate =
      evaluateAutonomousRepairAuthorizationGate({
        policy,
        verification
      });

    assert.equal(
      gate.gateState,
      "DENIED_POLICY_QUARANTINED"
    );
  }
);
