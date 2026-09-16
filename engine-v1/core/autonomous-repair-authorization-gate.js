import {
  createHash
} from "node:crypto";

import {
  validateAutonomousRepairPolicyVerificationArtifact
} from "./autonomous-repair-policy-independent-verifier.js";

export const AUTONOMOUS_REPAIR_AUTHORIZATION_GATE_SCHEMA =
  "ai-matchlab.autonomous-repair-authorization-gate.v1";

export const AUTONOMOUS_REPAIR_AUTHORIZATION_GATE_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_AUTHORIZATION_GATE_STATE =
  Object.freeze({
    NOT_REQUESTABLE_NO_CANDIDATES:
      "NOT_REQUESTABLE_NO_CANDIDATES",

    REQUEST_ELIGIBLE:
      "REQUEST_ELIGIBLE",

    DENIED_POLICY_QUARANTINED:
      "DENIED_POLICY_QUARANTINED",

    DENIED_POLICY_BLOCKED:
      "DENIED_POLICY_BLOCKED",

    DENIED_CANDIDATE_INTEGRITY:
      "DENIED_CANDIDATE_INTEGRITY",

    DENIED_DIAGNOSTIC_BLOCKER:
      "DENIED_DIAGNOSTIC_BLOCKER",

    DENIED_VERIFICATION_REQUIRED:
      "DENIED_VERIFICATION_REQUIRED",

    DENIED_VERIFICATION_MISMATCH:
      "DENIED_VERIFICATION_MISMATCH"
  });

const G =
  AUTONOMOUS_REPAIR_AUTHORIZATION_GATE_STATE;

const SUPPORTED_REPAIR_CLASSES =
  new Set([
    "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
    "REBUILD_HISTORY_ELIGIBLE_ROW",
    "REBUILD_PUBLICATION_CANONICAL_ROW"
  ]);

const DIAGNOSTIC_BLOCKING_REASONS =
  new Set([
    "SYSTEM_HEALTH_ERROR_SIGNAL",
    "SYSTEM_HEALTH_UNKNOWN_SIGNAL"
  ]);

function clean(
  value
) {
  return String(
    value ?? ""
  ).trim();
}

function stableValue(
  value
) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          key => [
            key,
            stableValue(
              value[key]
            )
          ]
        )
    );
  }

  return value;
}

function sha256(
  value
) {
  return createHash(
    "sha256"
  )
    .update(
      JSON.stringify(
        stableValue(value)
      )
    )
    .digest(
      "hex"
    );
}

function sortedUnique(
  values
) {
  return Array.from(
    new Set(
      values
        .map(clean)
        .filter(Boolean)
    )
  ).sort();
}

function assertPolicyZeroAuthority(
  policy
) {
  const authority =
    policy?.authority ??
    {};

  for (
    const field of [
      "filesystemWriteAuthorized",
      "repairAuthorized",
      "executionAuthorized",
      "workflowMutationAuthorized"
    ]
  ) {
    if (
      authority[field] ===
      true
    ) {
      throw new Error(
        `autonomous_repair_authorization_gate_policy_${field}_forbidden`
      );
    }
  }
}

function decisionAuthoritySafe(
  decision
) {
  const authority =
    decision?.authority ??
    {};

  return (
    authority.filesystemWriteAuthorized !==
      true &&
    authority.repairAuthorized !==
      true &&
    authority.executionAuthorized !==
      true &&
    authority.workflowMutationAuthorized !==
      true
  );
}

function candidateIntegrity(
  candidates
) {
  if (candidates.length === 0) {
    return {
      ok:
        false,

      reason:
        "candidate_set_empty"
    };
  }

  const decisionIds =
    new Set();

  const targetKeys =
    new Set();

  for (const candidate of candidates) {
    const decisionId =
      clean(
        candidate.policyDecisionId
      );

    const canonicalId =
      clean(
        candidate?.diagnosis
          ?.canonicalId
      );

    const observedFixtureId =
      clean(
        candidate?.diagnosis
          ?.observedFixtureId
      );

    const repairClass =
      clean(
        candidate.repairClass
      );

    if (
      !/^arpd_v1_[0-9a-f]{24}$/u.test(
        decisionId
      )
    ) {
      return {
        ok:
          false,

        reason:
          "candidate_decision_id_invalid"
      };
    }

    if (decisionIds.has(decisionId)) {
      return {
        ok:
          false,

        reason:
          "candidate_decision_id_duplicate"
      };
    }

    decisionIds.add(decisionId);

    if (
      candidate.classification !==
        "ELIGIBLE_REPAIR_CANDIDATE" ||
      candidate.candidateEligible !==
        true
    ) {
      return {
        ok:
          false,

        reason:
          "candidate_classification_invalid"
      };
    }

    if (
      !SUPPORTED_REPAIR_CLASSES.has(
        repairClass
      )
    ) {
      return {
        ok:
          false,

        reason:
          "candidate_repair_class_unsupported"
      };
    }

    if (
      !canonicalId ||
      observedFixtureId
    ) {
      return {
        ok:
          false,

        reason:
          "candidate_identity_not_exact_canonical"
      };
    }

    if (
      candidate?.evidence
        ?.canonicalMembershipVerified !==
        true ||
      candidate?.evidence
        ?.truthStateCompatible !==
        true ||
      candidate?.evidence
        ?.requiresIndependentVerification !==
        true
    ) {
      return {
        ok:
          false,

        reason:
          "candidate_evidence_preconditions_failed"
      };
    }

    if (
      !decisionAuthoritySafe(
        candidate
      )
    ) {
      return {
        ok:
          false,

        reason:
          "candidate_embedded_authority_forbidden"
      };
    }

    const targetKey =
      `${repairClass}|${canonicalId}`;

    if (targetKeys.has(targetKey)) {
      return {
        ok:
          false,

        reason:
          "candidate_target_duplicate"
      };
    }

    targetKeys.add(targetKey);
  }

  return {
    ok:
      true,

    reason:
      "candidate_integrity_verified"
  };
}

function authorityFor(
  requestEligible
) {
  return {
    authorizationRequestEligible:
      requestEligible,

    authorizationGranted:
      false,

    filesystemWriteAuthorized:
      false,

    repairAuthorized:
      false,

    executionAuthorized:
      false,

    workflowMutationAuthorized:
      false
  };
}

export function evaluateAutonomousRepairAuthorizationGate({
  policy,
  verification = null,
  generatedAt
} = {}) {
  if (
    !policy ||
    typeof policy !==
      "object"
  ) {
    throw new Error(
      "autonomous_repair_authorization_gate_policy_required"
    );
  }

  assertPolicyZeroAuthority(policy);

  const dayKey =
    clean(policy.dayKey);

  const policyFingerprint =
    clean(
      policy.policyFingerprint
    );

  const policyState =
    clean(
      policy.policyState
    );

  const timestamp =
    clean(generatedAt) ||
    clean(policy.generatedAt);

  if (
    !dayKey ||
    !policyFingerprint ||
    !policyState ||
    !timestamp
  ) {
    throw new Error(
      "autonomous_repair_authorization_gate_policy_binding_missing"
    );
  }

  if (
    !/^[0-9a-f]{64}$/u.test(
      policyFingerprint
    )
  ) {
    throw new Error(
      "autonomous_repair_authorization_gate_policy_fingerprint_invalid"
    );
  }

  const decisions =
    Array.isArray(
      policy.decisions
    )
      ? policy.decisions
      : [];

  const candidates =
    decisions.filter(
      row =>
        row?.classification ===
        "ELIGIBLE_REPAIR_CANDIDATE"
    );

  const quarantine =
    decisions.filter(
      row =>
        row?.classification ===
        "QUARANTINE"
    );

  const hardBlocks =
    decisions.filter(
      row =>
        row?.classification ===
        "HARD_BLOCK"
    );

  const candidateDecisionIds =
    sortedUnique(
      candidates.map(
        row =>
          row.policyDecisionId
      )
    );

  const diagnosticBlockers =
    sortedUnique(
      decisions
        .filter(
          row =>
            row?.classification ===
              "OBSERVATION_ONLY" &&
            DIAGNOSTIC_BLOCKING_REASONS.has(
              clean(
                row?.diagnosis
                  ?.reasonCode
              )
            )
        )
        .map(
          row =>
            row.diagnosis.reasonCode
        )
    );

  let verificationProvided =
    false;

  let verificationValid =
    false;

  let verificationReason =
    "verification_artifact_missing";

  let verificationFingerprint =
    null;

  let verifiedCandidateDecisionIds =
    [];

  if (
    verification &&
    typeof verification ===
      "object"
  ) {
    verificationProvided =
      true;

    verificationFingerprint =
      clean(
        verification.verificationFingerprint
      ) ||
      null;

    const validation =
      validateAutonomousRepairPolicyVerificationArtifact({
        verification,
        policy
      });

    verificationValid =
      validation.valid;

    verificationReason =
      validation.reason;

    verifiedCandidateDecisionIds =
      sortedUnique(
        Array.isArray(
          verification.candidateDecisionIds
        )
          ? verification.candidateDecisionIds
          : []
      );
  }

  const candidateSetMatches =
    JSON.stringify(
      candidateDecisionIds
    ) ===
    JSON.stringify(
      verifiedCandidateDecisionIds
    );

  let gateState;
  let gateReason;

  if (
    hardBlocks.length > 0 ||
    policyState ===
      "BLOCKED"
  ) {
    gateState =
      G.DENIED_POLICY_BLOCKED;

    gateReason =
      "daily_policy_contains_hard_block";
  }
  else if (
    quarantine.length > 0 ||
    policyState ===
      "QUARANTINED"
  ) {
    gateState =
      G.DENIED_POLICY_QUARANTINED;

    gateReason =
      "daily_policy_contains_quarantine";
  }
  else if (
    candidates.length ===
    0
  ) {
    gateState =
      G.NOT_REQUESTABLE_NO_CANDIDATES;

    gateReason =
      "daily_policy_contains_no_repair_candidates";
  }
  else {
    const integrity =
      candidateIntegrity(
        candidates
      );

    if (!integrity.ok) {
      gateState =
        G.DENIED_CANDIDATE_INTEGRITY;

      gateReason =
        integrity.reason;
    }
    else if (
      diagnosticBlockers.length >
      0
    ) {
      gateState =
        G.DENIED_DIAGNOSTIC_BLOCKER;

      gateReason =
        "diagnostic_health_blocker_present";
    }
    else if (
      !verificationProvided
    ) {
      gateState =
        G.DENIED_VERIFICATION_REQUIRED;

      gateReason =
        "independent_candidate_verification_required";
    }
    else if (
      !verificationValid ||
      !candidateSetMatches
    ) {
      gateState =
        G.DENIED_VERIFICATION_MISMATCH;

      gateReason =
        verificationValid
          ? "independent_verification_candidate_set_mismatch"
          : verificationReason;
    }
    else {
      gateState =
        G.REQUEST_ELIGIBLE;

      gateReason =
        "verified_candidate_set_may_request_authorization";
    }
  }

  const requestEligible =
    gateState ===
    G.REQUEST_ELIGIBLE;

  const authority =
    authorityFor(
      requestEligible
    );

  const verificationSummary = {
    provided:
      verificationProvided,

    artifactValid:
      verificationValid,

    verifierKind:
      verificationValid
        ? "independent_repair_policy_verifier"
        : null,

    verificationFingerprint,

    policyFingerprintMatches:
      verificationValid,

    candidateSetMatches
  };

  const fingerprintInput = {
    schema:
      AUTONOMOUS_REPAIR_AUTHORIZATION_GATE_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_AUTHORIZATION_GATE_VERSION,

    dayKey,
    policyFingerprint,
    gateState,
    gateReason,
    candidateDecisionIds,
    diagnosticBlockers,
    verification:
      verificationSummary,

    authority
  };

  return {
    schema:
      AUTONOMOUS_REPAIR_AUTHORIZATION_GATE_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_AUTHORIZATION_GATE_VERSION,

    dayKey,
    generatedAt:
      timestamp,

    role:
      "derived_repair_authorization_request_gate",

    policyFingerprint,

    gateFingerprint:
      sha256(
        fingerprintInput
      ),

    gateState,
    gateReason,
    candidateDecisionIds,
    diagnosticBlockers,

    verification:
      verificationSummary,

    authority
  };
}
