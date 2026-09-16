import {
  createHash
} from "node:crypto";

export const AUTONOMOUS_REPAIR_POLICY_DECISION_SCHEMA =
  "ai-matchlab.autonomous-repair-policy-decision.v1";

export const AUTONOMOUS_REPAIR_POLICY_DECISION_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_POLICY_CLASSIFICATION =
  Object.freeze({
    OBSERVATION_ONLY:
      "OBSERVATION_ONLY",

    ELIGIBLE_REPAIR_CANDIDATE:
      "ELIGIBLE_REPAIR_CANDIDATE",

    QUARANTINE:
      "QUARANTINE",

    HARD_BLOCK:
      "HARD_BLOCK"
  });

export const AUTONOMOUS_REPAIR_CLASS =
  Object.freeze({
    ACQUIRE_VERIFIED_FINAL_EVIDENCE:
      "ACQUIRE_VERIFIED_FINAL_EVIDENCE",

    REBUILD_HISTORY_ELIGIBLE_ROW:
      "REBUILD_HISTORY_ELIGIBLE_ROW",

    REBUILD_PUBLICATION_CANONICAL_ROW:
      "REBUILD_PUBLICATION_CANONICAL_ROW"
  });

const C =
  AUTONOMOUS_REPAIR_POLICY_CLASSIFICATION;

const R =
  AUTONOMOUS_REPAIR_CLASS;

const OBSERVATION_ONLY_REASONS =
  new Set([
    "HISTORY_NOT_OBSERVED",
    "SETTLEMENT_NOT_OBSERVED",
    "PUBLICATION_NOT_OBSERVED",
    "SYSTEM_HEALTH_NOT_OBSERVED",
    "SYSTEM_HEALTH_WARNING_SIGNAL",
    "SYSTEM_HEALTH_ERROR_SIGNAL",
    "SYSTEM_HEALTH_UNKNOWN_SIGNAL"
  ]);

const QUARANTINE_REASONS =
  new Set([
    "FIXTURE_TRUTH_UNRESOLVED",
    "PLAYED_TERMINAL_PENDING_VERIFIED_FINAL",
    "VERIFIED_FINAL_MISSING_CANONICAL_ID",
    "ORPHAN_VERIFIED_FINAL",
    "LEDGER_INCOMPLETE_WITHOUT_DIAGNOSTIC",
    "HISTORY_INCOMPLETE",
    "SETTLEMENT_UNRESOLVED",
    "PUBLICATION_INCOMPLETE",
    "DOWNSTREAM_INCOMPLETE_WITHOUT_COMPONENT",

    "HISTORY_UNEXPECTED_FIXTURE",
    "SETTLEMENT_ORPHAN_FIXTURE",
    "SETTLEMENT_UNRESOLVED_COUNT_ONLY",
    "PUBLICATION_EXTRA_FIXTURE",

    "TRUTH_CONFLICT_OBSERVED_FIXTURE",
    "VERIFIED_FINAL_PENDING_OBSERVED_FIXTURE",
    "VERIFIED_FINAL_ORPHAN_OBSERVED_FIXTURE"
  ]);

const HARD_BLOCK_REASONS =
  new Set([
    "FIXTURE_TRUTH_CONFLICT",
    "DUPLICATE_VERIFIED_FINAL_EVIDENCE",
    "LEDGER_CONFLICT_WITHOUT_DIAGNOSTIC",
    "HISTORY_CONFLICT",
    "SETTLEMENT_CONFLICT",
    "PUBLICATION_CONFLICT",
    "DOWNSTREAM_CONFLICT_WITHOUT_COMPONENT",

    "HISTORY_DUPLICATE_FIXTURE",
    "HISTORY_INVALID_TRUTH_CONTRACT_FIXTURE",
    "HISTORY_STRUCTURAL_ISSUE",

    "SETTLEMENT_INCOMPATIBLE_TRUTH",
    "SETTLEMENT_STRUCTURALLY_INVALID_ROW",
    "SETTLEMENT_STRUCTURAL_ISSUE",

    "PUBLICATION_DUPLICATE_FIXTURE",

    "TRUTH_CONFLICT_CANONICAL_FIXTURE",
    "VERIFIED_FINAL_DUPLICATE_CANONICAL_FIXTURE",
    "VERIFIED_FINAL_DUPLICATE_OBSERVED_FIXTURE",
    "VERIFIED_FINAL_ORPHAN_CANONICAL_CONTRADICTION",
    "VERIFIED_FINAL_ORPHAN_MISSING_FIXTURE_ID"
  ]);

const CANDIDATE_REASON_TO_CLASS =
  new Map([
    [
      "VERIFIED_FINAL_PENDING_CANONICAL_FIXTURE",
      R.ACQUIRE_VERIFIED_FINAL_EVIDENCE
    ],

    [
      "HISTORY_MISSING_ELIGIBLE_FIXTURE",
      R.REBUILD_HISTORY_ELIGIBLE_ROW
    ],

    [
      "PUBLICATION_MISSING_CANONICAL_FIXTURE",
      R.REBUILD_PUBLICATION_CANONICAL_ROW
    ]
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
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      stableValue
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.keys(
        value
      )
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
        stableValue(
          value
        )
      )
    )
    .digest(
      "hex"
    );
}

function fixtureId(
  fixture
) {
  return clean(
    fixture?.canonicalId ||
    fixture?.matchId ||
    fixture?.fixtureId ||
    fixture?.id
  );
}

function normalizeDiagnosis(
  diagnosis
) {
  if (
    !diagnosis ||
    typeof diagnosis !==
      "object"
  ) {
    throw new Error(
      "autonomous_repair_policy_diagnosis_required"
    );
  }

  const sourceLayer =
    clean(
      diagnosis.sourceLayer
    );

  const sourceId =
    clean(
      diagnosis.sourceId
    );

  const reasonCode =
    clean(
      diagnosis.reasonCode
    );

  const canonicalId =
    clean(
      diagnosis.canonicalId
    ) ||
    null;

  const observedFixtureId =
    clean(
      diagnosis.observedFixtureId
    ) ||
    null;

  const impact =
    clean(
      diagnosis.impact
    ) ||
    null;

  if (
    ![
      "audit",
      "downstream",
      "primary"
    ].includes(
      sourceLayer
    )
  ) {
    throw new Error(
      "autonomous_repair_policy_source_layer_invalid"
    );
  }

  if (!sourceId) {
    throw new Error(
      "autonomous_repair_policy_source_id_required"
    );
  }

  if (!reasonCode) {
    throw new Error(
      "autonomous_repair_policy_reason_code_required"
    );
  }

  if (
    canonicalId &&
    observedFixtureId
  ) {
    throw new Error(
      "autonomous_repair_policy_identity_overlap"
    );
  }

  return {
    sourceLayer,
    sourceId,
    reasonCode,
    impact,
    canonicalId,
    observedFixtureId
  };
}

function inspectEvidence(
  diagnosis,
  fixture
) {
  const exactFixtureId =
    fixtureId(
      fixture
    );

  const canonicalMembershipVerified =
    Boolean(
      diagnosis.canonicalId &&
      exactFixtureId &&
      exactFixtureId ===
        diagnosis.canonicalId
    );

  const decisionStatus =
    clean(
      fixture?.decision?.status
    );

  const operationalState =
    clean(
      fixture?.operationalState
    );

  const verifiedFinalAccepted =
    fixture?.verifiedFinal?.accepted ===
    true;

  const historyEligible =
    fixture?.decision?.historyEligible ===
    true;

  const truthStateCompatible =
    Boolean(
      canonicalMembershipVerified &&
      decisionStatus !==
        "CONFLICT" &&
      decisionStatus !==
        "UNRESOLVED" &&
      operationalState !==
        "CONFLICT" &&
      operationalState !==
        "UNRESOLVED"
    );

  return {
    canonicalMembershipVerified,
    truthStateCompatible,
    verifiedFinalAccepted,
    historyEligible,
    decisionStatus,
    operationalState
  };
}

function candidateDecision({
  diagnosis,
  fixture,
  repairClass
}) {
  const evidence =
    inspectEvidence(
      diagnosis,
      fixture
    );

  if (
    diagnosis.observedFixtureId ||
    !diagnosis.canonicalId
  ) {
    return {
      classification:
        C.QUARANTINE,

      policyReason:
        "candidate_requires_exact_canonical_identity",

      repairClass:
        null,

      candidateEligible:
        false,

      evidence
    };
  }

  if (
    !evidence
      .canonicalMembershipVerified
  ) {
    return {
      classification:
        C.QUARANTINE,

      policyReason:
        "candidate_requires_verified_canonical_membership",

      repairClass:
        null,

      candidateEligible:
        false,

      evidence
    };
  }

  if (
    repairClass ===
    R.ACQUIRE_VERIFIED_FINAL_EVIDENCE
  ) {
    const eligible =
      evidence.operationalState ===
        "PLAYED_TERMINAL" &&
      evidence.decisionStatus ===
        "PENDING_VERIFIED_FINAL" &&
      evidence.verifiedFinalAccepted ===
        false;

    return eligible
      ? {
          classification:
            C.ELIGIBLE_REPAIR_CANDIDATE,

          policyReason:
            "played_terminal_requires_verified_final_evidence_acquisition",

          repairClass,

          candidateEligible:
            true,

          evidence
        }
      : {
          classification:
            C.QUARANTINE,

          policyReason:
            "pending_final_candidate_truth_preconditions_failed",

          repairClass:
            null,

          candidateEligible:
            false,

          evidence
        };
  }

  if (
    repairClass ===
    R.REBUILD_HISTORY_ELIGIBLE_ROW
  ) {
    const eligible =
      evidence.truthStateCompatible &&
      evidence.decisionStatus ===
        "CONVERGED_PLAYED_FINAL" &&
      evidence.verifiedFinalAccepted &&
      evidence.historyEligible;

    return eligible
      ? {
          classification:
            C.ELIGIBLE_REPAIR_CANDIDATE,

          policyReason:
            "verified_played_final_missing_eligible_history_projection",

          repairClass,

          candidateEligible:
            true,

          evidence
        }
      : {
          classification:
            C.QUARANTINE,

          policyReason:
            "history_candidate_truth_preconditions_failed",

          repairClass:
            null,

          candidateEligible:
            false,

          evidence
        };
  }

  if (
    repairClass ===
    R.REBUILD_PUBLICATION_CANONICAL_ROW
  ) {
    const eligible =
      evidence.truthStateCompatible;

    return eligible
      ? {
          classification:
            C.ELIGIBLE_REPAIR_CANDIDATE,

          policyReason:
            "canonical_fixture_missing_from_derived_publication",

          repairClass,

          candidateEligible:
            true,

          evidence
        }
      : {
          classification:
            C.QUARANTINE,

          policyReason:
            "publication_candidate_truth_preconditions_failed",

          repairClass:
            null,

          candidateEligible:
            false,

          evidence
        };
  }

  throw new Error(
    "autonomous_repair_policy_candidate_class_unhandled"
  );
}

export function classifyAutonomousRepairPolicyDecision({
  diagnosis,
  fixture = null
} = {}) {
  const normalized =
    normalizeDiagnosis(
      diagnosis
    );

  const candidateClass =
    CANDIDATE_REASON_TO_CLASS.get(
      normalized.reasonCode
    );

  let result;

  if (candidateClass) {
    result =
      candidateDecision({
        diagnosis:
          normalized,

        fixture,

        repairClass:
          candidateClass
      });
  }
  else if (
    OBSERVATION_ONLY_REASONS.has(
      normalized.reasonCode
    )
  ) {
    result = {
      classification:
        C.OBSERVATION_ONLY,

      policyReason:
        "diagnostic_or_missing_observation_only",

      repairClass:
        null,

      candidateEligible:
        false,

      evidence:
        inspectEvidence(
          normalized,
          fixture
        )
    };
  }
  else if (
    QUARANTINE_REASONS.has(
      normalized.reasonCode
    )
  ) {
    result = {
      classification:
        C.QUARANTINE,

      policyReason:
        "insufficient_or_unsafe_evidence_for_autonomous_repair",

      repairClass:
        null,

      candidateEligible:
        false,

      evidence:
        inspectEvidence(
          normalized,
          fixture
        )
    };
  }
  else if (
    HARD_BLOCK_REASONS.has(
      normalized.reasonCode
    )
  ) {
    result = {
      classification:
        C.HARD_BLOCK,

      policyReason:
        "conflicting_or_structurally_unsafe_evidence",

      repairClass:
        null,

      candidateEligible:
        false,

      evidence:
        inspectEvidence(
          normalized,
          fixture
        )
    };
  }
  else {
    result = {
      classification:
        C.HARD_BLOCK,

      policyReason:
        "unknown_reason_code_fail_closed",

      repairClass:
        null,

      candidateEligible:
        false,

      evidence:
        inspectEvidence(
          normalized,
          fixture
        )
    };
  }

  const evidence = {
    canonicalMembershipVerified:
      result.evidence
        .canonicalMembershipVerified,

    truthStateCompatible:
      result.evidence
        .truthStateCompatible,

    verifiedFinalAccepted:
      result.evidence
        .verifiedFinalAccepted,

    historyEligible:
      result.evidence
        .historyEligible,

    requiresIndependentVerification:
      true,

    destructiveMutationRequired:
      false
  };

  const authority = {
    candidateSelectionOnly:
      true,

    filesystemWriteAuthorized:
      false,

    repairAuthorized:
      false,

    executionAuthorized:
      false,

    workflowMutationAuthorized:
      false
  };

  const identity = {
    sourceLayer:
      normalized.sourceLayer,

    sourceId:
      normalized.sourceId,

    reasonCode:
      normalized.reasonCode,

    canonicalId:
      normalized.canonicalId,

    observedFixtureId:
      normalized.observedFixtureId,

    classification:
      result.classification,

    repairClass:
      result.repairClass,

    policyReason:
      result.policyReason,

    evidence
  };

  return {
    schema:
      AUTONOMOUS_REPAIR_POLICY_DECISION_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_POLICY_DECISION_VERSION,

    policyDecisionId:
      `arpd_v1_${sha256(identity).slice(0, 24)}`,

    role:
      "derived_repair_policy_decision",

    classification:
      result.classification,

    policyReason:
      result.policyReason,

    repairClass:
      result.repairClass,

    candidateEligible:
      result.candidateEligible,

    diagnosis:
      normalized,

    evidence,

    authority
  };
}
