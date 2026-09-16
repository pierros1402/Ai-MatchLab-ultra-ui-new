import {
  createHash
} from "node:crypto";

import {
  classifyAutonomousRepairPolicyDecision
} from "./autonomous-repair-policy.js";

export const AUTONOMOUS_REPAIR_POLICY_DAY_SCHEMA =
  "ai-matchlab.autonomous-repair-policy-day.v1";

export const AUTONOMOUS_REPAIR_POLICY_DAY_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_POLICY_DAY_STATE =
  Object.freeze({
    CLEAR:
      "CLEAR",

    OBSERVATION_ONLY:
      "OBSERVATION_ONLY",

    CANDIDATES_PRESENT:
      "CANDIDATES_PRESENT",

    QUARANTINED:
      "QUARANTINED",

    BLOCKED:
      "BLOCKED"
  });

const S =
  AUTONOMOUS_REPAIR_POLICY_DAY_STATE;

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
  row
) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.fixtureId ||
    row?.id
  );
}

function sourceIdFor(
  sourceLayer,
  item
) {
  const direct =
    clean(
      item?.anomalyId ||
      item?.findingId ||
      item?.evidenceId ||
      item?.id
    );

  if (direct) {
    return direct;
  }

  const fallbackIdentity = {
    sourceLayer,

    reasonCode:
      clean(
        item?.reasonCode
      ),

    impact:
      clean(
        item?.impact
      ) ||
      null,

    canonicalId:
      clean(
        item?.canonicalId
      ) ||
      null,

    observedFixtureId:
      clean(
        item?.observedFixtureId
      ) ||
      null,

    details:
      item?.details ??
      null
  };

  return `${sourceLayer}_diagnosis_v1_${sha256(fallbackIdentity).slice(0, 24)}`;
}

function normalizeDiagnosis(
  sourceLayer,
  item
) {
  if (
    !item ||
    typeof item !==
      "object"
  ) {
    throw new Error(
      `autonomous_repair_policy_${sourceLayer}_diagnosis_invalid`
    );
  }

  const reasonCode =
    clean(
      item.reasonCode
    );

  if (!reasonCode) {
    throw new Error(
      `autonomous_repair_policy_${sourceLayer}_reason_code_missing`
    );
  }

  return {
    sourceLayer,

    sourceId:
      sourceIdFor(
        sourceLayer,
        item
      ),

    reasonCode,

    impact:
      clean(
        item.impact
      ) ||
      null,

    canonicalId:
      clean(
        item.canonicalId
      ) ||
      null,

    observedFixtureId:
      clean(
        item.observedFixtureId
      ) ||
      null
  };
}

function assertZeroAuthority(
  label,
  source
) {
  const authority =
    source?.authority ??
    {};

  for (
    const field of [
      "filesystemWriteAuthorized",
      "repairAuthorized",
      "executionAuthorized",
      "workflowMutationAuthorized",
      "downstreamMutationAuthorized",
      "footballTruthMutable"
    ]
  ) {
    if (
      authority[field] ===
      true
    ) {
      throw new Error(
        `autonomous_repair_policy_${label}_${field}_forbidden`
      );
    }
  }
}

function exactRefinementFamilies({
  downstreamFindings,
  primaryFindings
}) {
  const families =
    new Set();

  for (
    const finding of
    primaryFindings
  ) {
    const reasonCode =
      clean(
        finding?.reasonCode
      );

    if (
      reasonCode.startsWith(
        "TRUTH_CONFLICT_"
      )
    ) {
      families.add(
        "TRUTH_CONFLICT"
      );
    }

    if (
      reasonCode.startsWith(
        "VERIFIED_FINAL_PENDING_"
      )
    ) {
      families.add(
        "VERIFIED_FINAL_PENDING"
      );
    }

    if (
      reasonCode.startsWith(
        "VERIFIED_FINAL_DUPLICATE_"
      )
    ) {
      families.add(
        "VERIFIED_FINAL_DUPLICATE"
      );
    }

    if (
      reasonCode.startsWith(
        "VERIFIED_FINAL_ORPHAN_"
      )
    ) {
      families.add(
        "VERIFIED_FINAL_ORPHAN"
      );
    }
  }

  for (
    const finding of
    downstreamFindings
  ) {
    const reasonCode =
      clean(
        finding?.reasonCode
      );

    if (
      reasonCode.startsWith(
        "HISTORY_"
      )
    ) {
      families.add(
        "HISTORY"
      );
    }

    if (
      reasonCode.startsWith(
        "SETTLEMENT_"
      )
    ) {
      families.add(
        "SETTLEMENT"
      );
    }

    if (
      reasonCode.startsWith(
        "PUBLICATION_"
      )
    ) {
      families.add(
        "PUBLICATION"
      );
    }
  }

  return families;
}

function genericAuditFamily(
  reasonCode
) {
  switch (
    reasonCode
  ) {
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

function fixtureForDiagnosis(
  ledger,
  diagnosis
) {
  if (
    !diagnosis.canonicalId
  ) {
    return null;
  }

  return (
    ledger.fixtures.find(
      row =>
        fixtureId(
          row
        ) ===
        diagnosis.canonicalId
    ) ??
    null
  );
}

function compareDecisions(
  a,
  b
) {
  return [
    a.classification,
    a.repairClass ?? "",
    a.diagnosis.sourceLayer,
    a.diagnosis.reasonCode,
    a.diagnosis.canonicalId ?? "",
    a.diagnosis.observedFixtureId ?? "",
    a.diagnosis.sourceId,
    a.policyDecisionId
  ]
    .join("\u0000")
    .localeCompare(
      [
        b.classification,
        b.repairClass ?? "",
        b.diagnosis.sourceLayer,
        b.diagnosis.reasonCode,
        b.diagnosis.canonicalId ?? "",
        b.diagnosis.observedFixtureId ?? "",
        b.diagnosis.sourceId,
        b.policyDecisionId
      ].join("\u0000")
    );
}

function policyStateFor(
  summary
) {
  if (
    summary.hardBlockCount >
    0
  ) {
    return S.BLOCKED;
  }

  if (
    summary.quarantineCount >
    0
  ) {
    return S.QUARANTINED;
  }

  if (
    summary.candidateCount >
    0
  ) {
    return S.CANDIDATES_PRESENT;
  }

  if (
    summary.observationOnlyCount >
    0
  ) {
    return S.OBSERVATION_ONLY;
  }

  return S.CLEAR;
}

export function buildAutonomousRepairPolicyDay({
  ledger,
  audit,
  downstreamEvidence,
  primaryEvidence,
  generatedAt
} = {}) {
  if (
    !ledger ||
    typeof ledger !==
      "object"
  ) {
    throw new Error(
      "autonomous_repair_policy_day_ledger_required"
    );
  }

  if (
    !audit ||
    typeof audit !==
      "object"
  ) {
    throw new Error(
      "autonomous_repair_policy_day_audit_required"
    );
  }

  if (
    !downstreamEvidence ||
    typeof downstreamEvidence !==
      "object"
  ) {
    throw new Error(
      "autonomous_repair_policy_day_downstream_evidence_required"
    );
  }

  if (
    !primaryEvidence ||
    typeof primaryEvidence !==
      "object"
  ) {
    throw new Error(
      "autonomous_repair_policy_day_primary_evidence_required"
    );
  }

  if (
    ledger.authorization
      ?.repairAuthorized ===
    true
  ) {
    throw new Error(
      "autonomous_repair_policy_day_ledger_repair_authority_forbidden"
    );
  }

  assertZeroAuthority(
    "audit",
    audit
  );

  assertZeroAuthority(
    "downstream",
    downstreamEvidence
  );

  assertZeroAuthority(
    "primary",
    primaryEvidence
  );

  const dayKey =
    clean(
      ledger.dayKey
    );

  const truthFingerprint =
    clean(
      ledger.truthFingerprint
    );

  const auditFingerprint =
    clean(
      audit.auditFingerprint
    );

  const downstreamEvidenceFingerprint =
    clean(
      downstreamEvidence.evidenceFingerprint
    );

  const primaryEvidenceFingerprint =
    clean(
      primaryEvidence.evidenceFingerprint
    );

  if (
    !dayKey ||
    !truthFingerprint ||
    !auditFingerprint ||
    !downstreamEvidenceFingerprint ||
    !primaryEvidenceFingerprint
  ) {
    throw new Error(
      "autonomous_repair_policy_day_binding_fields_missing"
    );
  }

  const auditTruthBinding =
    clean(
      audit?.provenance
        ?.inputTruthFingerprint ||
      audit?.input
        ?.truthFingerprint
    );

  if (
    auditTruthBinding &&
    auditTruthBinding !==
      truthFingerprint
  ) {
    throw new Error(
      "autonomous_repair_policy_day_audit_truth_binding_mismatch"
    );
  }

  const timestamp =
    clean(
      generatedAt
    ) ||
    clean(
      audit.generatedAt
    ) ||
    clean(
      ledger.generatedAt
    );

  if (!timestamp) {
    throw new Error(
      "autonomous_repair_policy_day_generated_at_required"
    );
  }

  const auditAnomalies =
    Array.isArray(
      audit.anomalies
    )
      ? audit.anomalies
      : [];

  const downstreamFindings =
    Array.isArray(
      downstreamEvidence.findings
    )
      ? downstreamEvidence.findings
      : [];

  const primaryFindings =
    Array.isArray(
      primaryEvidence.findings
    )
      ? primaryEvidence.findings
      : [];

  const exactFamilies =
    exactRefinementFamilies({
      downstreamFindings,
      primaryFindings
    });

  const diagnoses =
    [];

  let suppressedGenericAuditCount =
    0;

  for (
    const anomaly of
    auditAnomalies
  ) {
    const family =
      genericAuditFamily(
        clean(
          anomaly?.reasonCode
        )
      );

    if (
      family &&
      exactFamilies.has(
        family
      )
    ) {
      suppressedGenericAuditCount +=
        1;

      continue;
    }

    diagnoses.push(
      normalizeDiagnosis(
        "audit",
        anomaly
      )
    );
  }

  for (
    const finding of
    downstreamFindings
  ) {
    diagnoses.push(
      normalizeDiagnosis(
        "downstream",
        finding
      )
    );
  }

  for (
    const finding of
    primaryFindings
  ) {
    diagnoses.push(
      normalizeDiagnosis(
        "primary",
        finding
      )
    );
  }

  const decisions =
    diagnoses
      .map(
        diagnosis =>
          classifyAutonomousRepairPolicyDecision({
            diagnosis,

            fixture:
              fixtureForDiagnosis(
                ledger,
                diagnosis
              )
          })
      )
      .sort(
        compareDecisions
      );

  const summary = {
    decisionCount:
      decisions.length,

    observationOnlyCount:
      decisions.filter(
        row =>
          row.classification ===
          "OBSERVATION_ONLY"
      ).length,

    candidateCount:
      decisions.filter(
        row =>
          row.classification ===
          "ELIGIBLE_REPAIR_CANDIDATE"
      ).length,

    quarantineCount:
      decisions.filter(
        row =>
          row.classification ===
          "QUARANTINE"
      ).length,

    hardBlockCount:
      decisions.filter(
        row =>
          row.classification ===
          "HARD_BLOCK"
      ).length,

    suppressedGenericAuditCount,

    repairClassCounts: {
      ACQUIRE_VERIFIED_FINAL_EVIDENCE:
        decisions.filter(
          row =>
            row.repairClass ===
            "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
        ).length,

      REBUILD_HISTORY_ELIGIBLE_ROW:
        decisions.filter(
          row =>
            row.repairClass ===
            "REBUILD_HISTORY_ELIGIBLE_ROW"
        ).length,

      REBUILD_PUBLICATION_CANONICAL_ROW:
        decisions.filter(
          row =>
            row.repairClass ===
            "REBUILD_PUBLICATION_CANONICAL_ROW"
        ).length
    }
  };

  const policyState =
    policyStateFor(
      summary
    );

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

  const fingerprintInput = {
    schema:
      AUTONOMOUS_REPAIR_POLICY_DAY_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_POLICY_DAY_VERSION,

    dayKey,
    truthFingerprint,
    auditFingerprint,
    downstreamEvidenceFingerprint,
    primaryEvidenceFingerprint,
    policyState,
    summary,
    decisions,
    authority
  };

  return {
    schema:
      AUTONOMOUS_REPAIR_POLICY_DAY_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_POLICY_DAY_VERSION,

    dayKey,
    generatedAt:
      timestamp,

    role:
      "derived_daily_repair_policy",

    truthFingerprint,
    auditFingerprint,
    downstreamEvidenceFingerprint,
    primaryEvidenceFingerprint,

    policyFingerprint:
      sha256(
        fingerprintInput
      ),

    policyState,
    summary,
    decisions,
    authority
  };
}
