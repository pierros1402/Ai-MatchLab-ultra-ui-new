import {
  createHash
} from "node:crypto";

export const AUTONOMOUS_REPAIR_POLICY_VERIFICATION_SCHEMA =
  "ai-matchlab.autonomous-repair-policy-verification.v1";

export const AUTONOMOUS_REPAIR_POLICY_VERIFICATION_VERSION =
  "1.0.0";

const OBSERVATION_ONLY =
  new Set([
    "HISTORY_NOT_OBSERVED",
    "SETTLEMENT_NOT_OBSERVED",
    "PUBLICATION_NOT_OBSERVED",
    "SYSTEM_HEALTH_NOT_OBSERVED",
    "SYSTEM_HEALTH_WARNING_SIGNAL",
    "SYSTEM_HEALTH_ERROR_SIGNAL",
    "SYSTEM_HEALTH_UNKNOWN_SIGNAL"
  ]);

const QUARANTINE =
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

const HARD_BLOCK =
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

const CANDIDATES =
  new Map([
    [
      "VERIFIED_FINAL_PENDING_CANONICAL_FIXTURE",
      "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
    ],
    [
      "HISTORY_MISSING_ELIGIBLE_FIXTURE",
      "REBUILD_HISTORY_ELIGIBLE_ROW"
    ],
    [
      "PUBLICATION_MISSING_CANONICAL_FIXTURE",
      "REBUILD_PUBLICATION_CANONICAL_ROW"
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
  row
) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.fixtureId ||
    row?.id
  );
}

function semanticKey(
  row
) {
  return [
    row.sourceLayer,
    row.reasonCode,
    row.canonicalId ?? "",
    row.observedFixtureId ?? "",
    row.classification,
    row.repairClass ?? "",
    row.candidateEligible
      ? "1"
      : "0"
  ].join("\u0000");
}

function sortSemantic(
  rows
) {
  return [
    ...rows
  ].sort(
    (a, b) =>
      semanticKey(a)
        .localeCompare(
          semanticKey(b)
        )
  );
}

function genericFamily(
  reasonCode
) {
  switch (reasonCode) {
    case "FIXTURE_TRUTH_CONFLICT":
      return "TRUTH_CONFLICT";

    case "PLAYED_TERMINAL_PENDING_VERIFIED_FINAL":
      return "VERIFIED_FINAL_PENDING";

    case "DUPLICATE_VERIFIED_FINAL_EVIDENCE":
      return "VERIFIED_FINAL_DUPLICATE";

    case "ORPHAN_VERIFIED_FINAL":
    case "VERIFIED_FINAL_MISSING_CANONICAL_ID":
      return "VERIFIED_FINAL_ORPHAN";

    case "HISTORY_INCOMPLETE":
    case "HISTORY_CONFLICT":
      return "HISTORY";

    case "SETTLEMENT_UNRESOLVED":
    case "SETTLEMENT_CONFLICT":
      return "SETTLEMENT";

    case "PUBLICATION_INCOMPLETE":
    case "PUBLICATION_CONFLICT":
      return "PUBLICATION";

    default:
      return null;
  }
}

function exactFamilies(
  downstream,
  primary
) {
  const result =
    new Set();

  for (const row of primary) {
    const reason =
      clean(
        row?.reasonCode
      );

    if (
      reason.startsWith(
        "TRUTH_CONFLICT_"
      )
    ) {
      result.add(
        "TRUTH_CONFLICT"
      );
    }

    if (
      reason.startsWith(
        "VERIFIED_FINAL_PENDING_"
      )
    ) {
      result.add(
        "VERIFIED_FINAL_PENDING"
      );
    }

    if (
      reason.startsWith(
        "VERIFIED_FINAL_DUPLICATE_"
      )
    ) {
      result.add(
        "VERIFIED_FINAL_DUPLICATE"
      );
    }

    if (
      reason.startsWith(
        "VERIFIED_FINAL_ORPHAN_"
      )
    ) {
      result.add(
        "VERIFIED_FINAL_ORPHAN"
      );
    }
  }

  for (const row of downstream) {
    const reason =
      clean(
        row?.reasonCode
      );

    if (reason.startsWith("HISTORY_")) {
      result.add("HISTORY");
    }

    if (reason.startsWith("SETTLEMENT_")) {
      result.add("SETTLEMENT");
    }

    if (reason.startsWith("PUBLICATION_")) {
      result.add("PUBLICATION");
    }
  }

  return result;
}

function rawDiagnosis(
  sourceLayer,
  row
) {
  return {
    sourceLayer,

    reasonCode:
      clean(
        row?.reasonCode
      ),

    canonicalId:
      clean(
        row?.canonicalId
      ) ||
      null,

    observedFixtureId:
      clean(
        row?.observedFixtureId
      ) ||
      null
  };
}

function fixtureFor(
  ledger,
  canonicalId
) {
  if (!canonicalId) {
    return null;
  }

  return (
    ledger.fixtures.find(
      row =>
        fixtureId(row) ===
        canonicalId
    ) ??
    null
  );
}

function classifyCandidate(
  diagnosis,
  fixture,
  repairClass
) {
  const exactId =
    fixtureId(
      fixture
    );

  const membership =
    Boolean(
      diagnosis.canonicalId &&
      exactId ===
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

  const truthCompatible =
    Boolean(
      membership &&
      decisionStatus !==
        "CONFLICT" &&
      decisionStatus !==
        "UNRESOLVED" &&
      operationalState !==
        "CONFLICT" &&
      operationalState !==
        "UNRESOLVED"
    );

  let eligible =
    false;

  if (
    !diagnosis.observedFixtureId &&
    diagnosis.canonicalId &&
    membership
  ) {
    if (
      repairClass ===
      "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
    ) {
      eligible =
        operationalState ===
          "PLAYED_TERMINAL" &&
        decisionStatus ===
          "PENDING_VERIFIED_FINAL" &&
        !verifiedFinalAccepted;
    }
    else if (
      repairClass ===
      "REBUILD_HISTORY_ELIGIBLE_ROW"
    ) {
      eligible =
        truthCompatible &&
        decisionStatus ===
          "CONVERGED_PLAYED_FINAL" &&
        verifiedFinalAccepted &&
        historyEligible;
    }
    else if (
      repairClass ===
      "REBUILD_PUBLICATION_CANONICAL_ROW"
    ) {
      eligible =
        truthCompatible;
    }
  }

  return {
    ...diagnosis,

    classification:
      eligible
        ? "ELIGIBLE_REPAIR_CANDIDATE"
        : "QUARANTINE",

    repairClass:
      eligible
        ? repairClass
        : null,

    candidateEligible:
      eligible
  };
}

function classify(
  ledger,
  diagnosis
) {
  const candidateClass =
    CANDIDATES.get(
      diagnosis.reasonCode
    );

  if (candidateClass) {
    return classifyCandidate(
      diagnosis,
      fixtureFor(
        ledger,
        diagnosis.canonicalId
      ),
      candidateClass
    );
  }

  if (
    OBSERVATION_ONLY.has(
      diagnosis.reasonCode
    )
  ) {
    return {
      ...diagnosis,
      classification:
        "OBSERVATION_ONLY",
      repairClass:
        null,
      candidateEligible:
        false
    };
  }

  if (
    QUARANTINE.has(
      diagnosis.reasonCode
    )
  ) {
    return {
      ...diagnosis,
      classification:
        "QUARANTINE",
      repairClass:
        null,
      candidateEligible:
        false
    };
  }

  if (
    HARD_BLOCK.has(
      diagnosis.reasonCode
    )
  ) {
    return {
      ...diagnosis,
      classification:
        "HARD_BLOCK",
      repairClass:
        null,
      candidateEligible:
        false
    };
  }

  return {
    ...diagnosis,
    classification:
      "HARD_BLOCK",
    repairClass:
      null,
    candidateEligible:
      false
  };
}

function expectedSemanticDecisions({
  ledger,
  audit,
  downstreamEvidence,
  primaryEvidence
}) {
  const auditRows =
    Array.isArray(
      audit?.anomalies
    )
      ? audit.anomalies
      : [];

  const downstreamRows =
    Array.isArray(
      downstreamEvidence?.findings
    )
      ? downstreamEvidence.findings
      : [];

  const primaryRows =
    Array.isArray(
      primaryEvidence?.findings
    )
      ? primaryEvidence.findings
      : [];

  const refinements =
    exactFamilies(
      downstreamRows,
      primaryRows
    );

  const diagnoses =
    [];

  for (const row of auditRows) {
    const diagnosis =
      rawDiagnosis(
        "audit",
        row
      );

    const family =
      genericFamily(
        diagnosis.reasonCode
      );

    if (
      family &&
      refinements.has(
        family
      )
    ) {
      continue;
    }

    diagnoses.push(
      diagnosis
    );
  }

  for (const row of downstreamRows) {
    diagnoses.push(
      rawDiagnosis(
        "downstream",
        row
      )
    );
  }

  for (const row of primaryRows) {
    diagnoses.push(
      rawDiagnosis(
        "primary",
        row
      )
    );
  }

  return sortSemantic(
    diagnoses.map(
      diagnosis =>
        classify(
          ledger,
          diagnosis
        )
    )
  );
}

function actualSemanticDecisions(
  policy
) {
  const decisions =
    Array.isArray(
      policy?.decisions
    )
      ? policy.decisions
      : [];

  return sortSemantic(
    decisions.map(
      row => ({
        sourceLayer:
          clean(
            row?.diagnosis
              ?.sourceLayer
          ),

        reasonCode:
          clean(
            row?.diagnosis
              ?.reasonCode
          ),

        canonicalId:
          clean(
            row?.diagnosis
              ?.canonicalId
          ) ||
          null,

        observedFixtureId:
          clean(
            row?.diagnosis
              ?.observedFixtureId
          ) ||
          null,

        classification:
          clean(
            row?.classification
          ),

        repairClass:
          clean(
            row?.repairClass
          ) ||
          null,

        candidateEligible:
          row?.candidateEligible ===
          true
      }))
  );
}

function stateFor(
  rows
) {
  if (
    rows.some(
      row =>
        row.classification ===
        "HARD_BLOCK"
    )
  ) {
    return "BLOCKED";
  }

  if (
    rows.some(
      row =>
        row.classification ===
        "QUARANTINE"
    )
  ) {
    return "QUARANTINED";
  }

  if (
    rows.some(
      row =>
        row.classification ===
        "ELIGIBLE_REPAIR_CANDIDATE"
    )
  ) {
    return "CANDIDATES_PRESENT";
  }

  if (
    rows.some(
      row =>
        row.classification ===
        "OBSERVATION_ONLY"
    )
  ) {
    return "OBSERVATION_ONLY";
  }

  return "CLEAR";
}

function assertZeroAuthority(
  label,
  authority
) {
  for (
    const field of [
      "filesystemWriteAuthorized",
      "repairAuthorized",
      "executionAuthorized",
      "workflowMutationAuthorized",
      "authorizationGranted"
    ]
  ) {
    if (
      authority?.[field] ===
      true
    ) {
      throw new Error(
        `autonomous_repair_policy_verifier_${label}_${field}_forbidden`
      );
    }
  }
}

function candidateDecisionIds(
  policy
) {
  return Array.from(
    new Set(
      (
        Array.isArray(
          policy?.decisions
        )
          ? policy.decisions
          : []
      )
        .filter(
          row =>
            row?.classification ===
            "ELIGIBLE_REPAIR_CANDIDATE"
        )
        .map(
          row =>
            clean(
              row?.policyDecisionId
            )
        )
        .filter(
          value =>
            /^arpd_v1_[0-9a-f]{24}$/u.test(
              value
            )
        )
    )
  ).sort();
}

export function verifyAutonomousRepairPolicyIndependently({
  ledger,
  audit,
  downstreamEvidence,
  primaryEvidence,
  policy,
  generatedAt
} = {}) {
  for (
    const [
      label,
      value
    ] of [
      ["ledger", ledger],
      ["audit", audit],
      [
        "downstream_evidence",
        downstreamEvidence
      ],
      [
        "primary_evidence",
        primaryEvidence
      ],
      ["policy", policy]
    ]
  ) {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      throw new Error(
        `autonomous_repair_policy_verifier_${label}_required`
      );
    }
  }

  assertZeroAuthority(
    "audit",
    audit.authority
  );

  assertZeroAuthority(
    "downstream",
    downstreamEvidence.authority
  );

  assertZeroAuthority(
    "primary",
    primaryEvidence.authority
  );

  assertZeroAuthority(
    "policy",
    policy.authority
  );

  const dayKey =
    clean(
      ledger.dayKey
    );

  const generated =
    clean(
      generatedAt
    ) ||
    clean(
      policy.generatedAt
    );

  const bindings = {
    truthFingerprint:
      clean(
        ledger.truthFingerprint
      ),

    auditFingerprint:
      clean(
        audit.auditFingerprint
      ),

    downstreamEvidenceFingerprint:
      clean(
        downstreamEvidence.evidenceFingerprint
      ),

    primaryEvidenceFingerprint:
      clean(
        primaryEvidence.evidenceFingerprint
      ),

    policyFingerprint:
      clean(
        policy.policyFingerprint
      )
  };

  if (
    !dayKey ||
    !generated ||
    Object.values(
      bindings
    ).some(
      value =>
        !/^[0-9a-f]{64}$/u.test(
          value
        )
    )
  ) {
    throw new Error(
      "autonomous_repair_policy_verifier_binding_invalid"
    );
  }

  const mismatchReasons =
    [];

  if (
    clean(
      policy.dayKey
    ) !==
    dayKey
  ) {
    mismatchReasons.push(
      "POLICY_DAY_MISMATCH"
    );
  }

  if (
    clean(
      policy.truthFingerprint
    ) !==
    bindings.truthFingerprint
  ) {
    mismatchReasons.push(
      "POLICY_TRUTH_FINGERPRINT_MISMATCH"
    );
  }

  if (
    clean(
      policy.auditFingerprint
    ) !==
    bindings.auditFingerprint
  ) {
    mismatchReasons.push(
      "POLICY_AUDIT_FINGERPRINT_MISMATCH"
    );
  }

  if (
    clean(
      policy.downstreamEvidenceFingerprint
    ) !==
    bindings.downstreamEvidenceFingerprint
  ) {
    mismatchReasons.push(
      "POLICY_DOWNSTREAM_EVIDENCE_FINGERPRINT_MISMATCH"
    );
  }

  if (
    clean(
      policy.primaryEvidenceFingerprint
    ) !==
    bindings.primaryEvidenceFingerprint
  ) {
    mismatchReasons.push(
      "POLICY_PRIMARY_EVIDENCE_FINGERPRINT_MISMATCH"
    );
  }

  const expected =
    expectedSemanticDecisions({
      ledger,
      audit,
      downstreamEvidence,
      primaryEvidence
    });

  const actual =
    actualSemanticDecisions(
      policy
    );

  if (
    JSON.stringify(
      expected
    ) !==
    JSON.stringify(
      actual
    )
  ) {
    mismatchReasons.push(
      "SEMANTIC_POLICY_DECISIONS_MISMATCH"
    );
  }

  const expectedPolicyState =
    stateFor(
      expected
    );

  const actualPolicyState =
    clean(
      policy.policyState
    );

  if (
    expectedPolicyState !==
    actualPolicyState
  ) {
    mismatchReasons.push(
      "POLICY_STATE_MISMATCH"
    );
  }

  const ids =
    candidateDecisionIds(
      policy
    );

  const expectedCandidateCount =
    expected.filter(
      row =>
        row.classification ===
        "ELIGIBLE_REPAIR_CANDIDATE"
    ).length;

  if (
    ids.length !==
    expectedCandidateCount
  ) {
    mismatchReasons.push(
      "CANDIDATE_DECISION_ID_SET_INVALID"
    );
  }

  const uniqueMismatches =
    Array.from(
      new Set(
        mismatchReasons
      )
    ).sort();

  const verified =
    uniqueMismatches.length ===
    0;

  const authority = {
    filesystemWriteAuthorized:
      false,

    repairAuthorized:
      false,

    executionAuthorized:
      false,

    workflowMutationAuthorized:
      false,

    authorizationGranted:
      false
  };

  const fingerprintInput = {
    schema:
      AUTONOMOUS_REPAIR_POLICY_VERIFICATION_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_POLICY_VERIFICATION_VERSION,

    dayKey,
    bindings,
    expectedPolicyState,
    actualPolicyState,
    semanticDecisionCount:
      expected.length,

    candidateDecisionIds:
      ids,

    mismatchReasons:
      uniqueMismatches,

    verified,
    authority
  };

  return {
    schema:
      AUTONOMOUS_REPAIR_POLICY_VERIFICATION_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_POLICY_VERIFICATION_VERSION,

    dayKey,

    generatedAt:
      generated,

    role:
      "independent_repair_policy_verification",

    verifierKind:
      "independent_repair_policy_verifier",

    bindings,

    verificationFingerprint:
      sha256(
        fingerprintInput
      ),

    expectedPolicyState,
    actualPolicyState,

    semanticDecisionCount:
      expected.length,

    candidateDecisionIds:
      ids,

    mismatchReasons:
      uniqueMismatches,

    verified,

    authority
  };
}

export function validateAutonomousRepairPolicyVerificationArtifact({
  verification,
  policy
} = {}) {
  if (
    !verification ||
    typeof verification !==
      "object" ||
    !policy ||
    typeof policy !==
      "object"
  ) {
    return {
      valid:
        false,

      reason:
        "verification_artifact_missing"
    };
  }

  if (
    verification.schema !==
      AUTONOMOUS_REPAIR_POLICY_VERIFICATION_SCHEMA ||
    verification.version !==
      AUTONOMOUS_REPAIR_POLICY_VERIFICATION_VERSION ||
    verification.role !==
      "independent_repair_policy_verification" ||
    verification.verifierKind !==
      "independent_repair_policy_verifier"
  ) {
    return {
      valid:
        false,

      reason:
        "verification_artifact_contract_invalid"
    };
  }

  assertZeroAuthority(
    "verification_artifact",
    verification.authority
  );

  const bindings =
    verification.bindings ??
    {};

  if (
    bindings.policyFingerprint !==
      clean(
        policy.policyFingerprint
      ) ||
    bindings.truthFingerprint !==
      clean(
        policy.truthFingerprint
      ) ||
    bindings.auditFingerprint !==
      clean(
        policy.auditFingerprint
      ) ||
    bindings.downstreamEvidenceFingerprint !==
      clean(
        policy.downstreamEvidenceFingerprint
      ) ||
    bindings.primaryEvidenceFingerprint !==
      clean(
        policy.primaryEvidenceFingerprint
      )
  ) {
    return {
      valid:
        false,

      reason:
        "verification_artifact_source_binding_mismatch"
    };
  }

  const fingerprintInput = {
    schema:
      verification.schema,

    version:
      verification.version,

    dayKey:
      verification.dayKey,

    bindings:
      verification.bindings,

    expectedPolicyState:
      verification.expectedPolicyState,

    actualPolicyState:
      verification.actualPolicyState,

    semanticDecisionCount:
      verification.semanticDecisionCount,

    candidateDecisionIds:
      verification.candidateDecisionIds,

    mismatchReasons:
      verification.mismatchReasons,

    verified:
      verification.verified,

    authority:
      verification.authority
  };

  const expectedFingerprint =
    sha256(
      fingerprintInput
    );

  if (
    expectedFingerprint !==
    verification.verificationFingerprint
  ) {
    return {
      valid:
        false,

      reason:
        "verification_artifact_fingerprint_mismatch"
    };
  }

  if (
    verification.verified !==
      true ||
    !Array.isArray(
      verification.mismatchReasons
    ) ||
    verification.mismatchReasons.length !==
      0
  ) {
    return {
      valid:
        false,

      reason:
        "verification_artifact_not_verified"
    };
  }

  return {
    valid:
      true,

    reason:
      "verification_artifact_valid"
  };
}
