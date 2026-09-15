import {
  createHash
} from "node:crypto";

export const AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_SCHEMA =
  "ai-matchlab.autonomous-truth-reconciliation-audit.v1";

export const AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_VERSION =
  "1.0.0";

export const AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_ROLE =
  "derived_diagnostic_control_plane";

export const AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_AUTHORITY =
  Object.freeze({
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
  });

export const AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_STATE =
  Object.freeze({
    CLEAR:
      "CLEAR",

    OBSERVATION_GAPS:
      "OBSERVATION_GAPS",

    RECONCILIATION_REQUIRED:
      "RECONCILIATION_REQUIRED",

    BLOCKED:
      "BLOCKED"
  });

export const AUTONOMOUS_TRUTH_RECONCILIATION_IMPACT =
  Object.freeze({
    DIAGNOSTIC_ONLY:
      "DIAGNOSTIC_ONLY",

    OBSERVATION_GAP:
      "OBSERVATION_GAP",

    RECONCILIATION_REQUIRED:
      "RECONCILIATION_REQUIRED",

    BLOCKING_CONFLICT:
      "BLOCKING_CONFLICT"
  });

const LEDGER_SCHEMA =
  "ai-matchlab.day-truth-ledger.v1";

const DAY_KEY_RE =
  /^20\d{2}-\d{2}-\d{2}$/u;

const HASH_RE =
  /^[0-9a-f]{64}$/u;

const IMPACT_ORDER =
  Object.freeze({
    DIAGNOSTIC_ONLY:
      0,

    OBSERVATION_GAP:
      1,

    RECONCILIATION_REQUIRED:
      2,

    BLOCKING_CONFLICT:
      3
  });

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function cloneJson(value) {
  if (
    value === undefined
  ) {
    return null;
  }

  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(
      stableValue
    );
  }

  if (
    value &&
    typeof value === "object"
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

function sha256(value) {
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

function assertGeneratedAt(value) {
  const raw =
    clean(value);

  if (
    !raw ||
    !Number.isFinite(
      Date.parse(raw)
    )
  ) {
    throw new Error(
      "autonomous_truth_audit_invalid_generated_at"
    );
  }

  return raw;
}

function assertDayKey(value) {
  const raw =
    clean(value);

  if (
    !DAY_KEY_RE.test(raw)
  ) {
    throw new Error(
      "autonomous_truth_audit_invalid_day_key"
    );
  }

  const [
    year,
    month,
    day
  ] =
    raw
      .split("-")
      .map(Number);

  const parsed =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    parsed.getUTCFullYear() !==
      year ||
    parsed.getUTCMonth() + 1 !==
      month ||
    parsed.getUTCDate() !==
      day
  ) {
    throw new Error(
      "autonomous_truth_audit_invalid_day_key"
    );
  }

  return raw;
}

function validateLedger(
  ledger
) {
  if (
    !ledger ||
    typeof ledger !==
      "object" ||
    Array.isArray(
      ledger
    )
  ) {
    throw new Error(
      "autonomous_truth_audit_day_truth_ledger_required"
    );
  }

  if (
    ledger.schema !==
    LEDGER_SCHEMA
  ) {
    throw new Error(
      "autonomous_truth_audit_ledger_schema_invalid"
    );
  }

  if (
    ledger.role !==
    "derived_control_plane"
  ) {
    throw new Error(
      "autonomous_truth_audit_ledger_role_invalid"
    );
  }

  const dayKey =
    assertDayKey(
      ledger.dayKey
    );

  const truthFingerprint =
    clean(
      ledger.truthFingerprint
    );

  if (
    !HASH_RE.test(
      truthFingerprint
    )
  ) {
    throw new Error(
      "autonomous_truth_audit_truth_fingerprint_invalid"
    );
  }

  if (
    !Array.isArray(
      ledger.fixtures
    ) ||
    !ledger.anomalies ||
    typeof ledger.anomalies !==
      "object"
  ) {
    throw new Error(
      "autonomous_truth_audit_ledger_structure_invalid"
    );
  }

  if (
    ledger
      ?.authorization
      ?.repairAuthorized !==
    false
  ) {
    throw new Error(
      "autonomous_truth_audit_input_repair_authority_invalid"
    );
  }

  const convergence =
    ledger
      ?.downstream
      ?.convergence;

  if (
    !convergence ||
    typeof convergence !==
      "object" ||
    Array.isArray(
      convergence
    )
  ) {
    throw new Error(
      "autonomous_truth_audit_downstream_convergence_required"
    );
  }

  if (
    convergence
      .truthFingerprint !==
    truthFingerprint
  ) {
    throw new Error(
      "autonomous_truth_audit_convergence_fingerprint_mismatch"
    );
  }

  const authority =
    convergence.authority;

  if (
    !authority ||
    authority
      .footballTruthMutable !==
      false ||
    authority
      .downstreamMutationAuthorized !==
      false ||
    authority
      .repairAuthorized !==
      false ||
    authority
      .observationsAffectTruthFingerprint !==
      false
  ) {
    throw new Error(
      "autonomous_truth_audit_convergence_authority_invalid"
    );
  }

  return {
    dayKey,
    truthFingerprint,
    convergence
  };
}

function fixtureId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.fixtureId ||
    row?.id
  );
}

function evidenceRefForFixture(
  canonicalId,
  suffix
) {
  return [
    "fixtures",
    encodeURIComponent(
      canonicalId
    ),
    suffix
  ].join("/");
}

function makeAnomaly({
  dayKey,
  truthFingerprint,
  scope,
  canonicalId = null,
  category,
  reasonCode,
  severity,
  impact,
  message,
  evidenceRefs,
  details = {}
}) {
  const refs =
    [...new Set(
      (
        Array.isArray(
          evidenceRefs
        )
          ? evidenceRefs
          : []
      )
        .map(clean)
        .filter(Boolean)
    )]
      .sort();

  if (
    refs.length === 0
  ) {
    throw new Error(
      `autonomous_truth_audit_evidence_required:${reasonCode}`
    );
  }

  const normalizedCanonicalId =
    clean(canonicalId) ||
    null;

  const idMaterial = {
    schema:
      AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_SCHEMA,

    dayKey,

    truthFingerprint,

    scope,

    canonicalId:
      normalizedCanonicalId,

    category,

    reasonCode,

    evidenceRefs:
      refs
  };

  return {
    anomalyId:
      `atra_v1_${sha256(idMaterial).slice(0, 24)}`,

    scope,

    canonicalId:
      normalizedCanonicalId,

    category,

    reasonCode,

    severity,

    impact,

    message,

    evidence: {
      truthFingerprint,

      refs
    },

    details:
      cloneJson(
        details
      ) || {}
  };
}

function anomalySort(
  left,
  right
) {
  return (
    clean(
      left.canonicalId
    ).localeCompare(
      clean(
        right.canonicalId
      )
    ) ||
    left.scope.localeCompare(
      right.scope
    ) ||
    left.category.localeCompare(
      right.category
    ) ||
    left.reasonCode.localeCompare(
      right.reasonCode
    ) ||
    left.anomalyId.localeCompare(
      right.anomalyId
    )
  );
}

function addFixtureDecisionAnomalies({
  ledger,
  dayKey,
  truthFingerprint,
  anomalies
}) {
  const fixtures =
    [...ledger.fixtures]
      .sort(
        (left, right) =>
          fixtureId(left)
            .localeCompare(
              fixtureId(right)
            )
      );

  for (
    const row of fixtures
  ) {
    const canonicalId =
      fixtureId(row);

    if (!canonicalId) {
      throw new Error(
        "autonomous_truth_audit_fixture_missing_canonical_id"
      );
    }

    const status =
      clean(
        row
          ?.decision
          ?.status
      );

    const reason =
      clean(
        row
          ?.decision
          ?.reason
      ) ||
      null;

    if (
      status ===
      "CONFLICT"
    ) {
      anomalies.push(
        makeAnomaly({
          dayKey,
          truthFingerprint,
          scope:
            "fixture",
          canonicalId,
          category:
            "TRUTH",
          reasonCode:
            "FIXTURE_TRUTH_CONFLICT",
          severity:
            "error",
          impact:
            "BLOCKING_CONFLICT",
          message:
            "Fixture truth contract is internally conflicting and must remain fail-closed.",
          evidenceRefs: [
            evidenceRefForFixture(
              canonicalId,
              "decision/status"
            ),
            evidenceRefForFixture(
              canonicalId,
              "decision/reason"
            )
          ],
          details: {
            decisionStatus:
              status,
            decisionReason:
              reason,
            operationalState:
              row
                ?.operationalState ??
              null
          }
        })
      );

      continue;
    }

    if (
      status ===
      "UNRESOLVED"
    ) {
      anomalies.push(
        makeAnomaly({
          dayKey,
          truthFingerprint,
          scope:
            "fixture",
          canonicalId,
          category:
            "TRUTH",
          reasonCode:
            "FIXTURE_TRUTH_UNRESOLVED",
          severity:
            "warning",
          impact:
            "RECONCILIATION_REQUIRED",
          message:
            "Fixture truth cannot yet be resolved under the unified match-state contract.",
          evidenceRefs: [
            evidenceRefForFixture(
              canonicalId,
              "decision/status"
            ),
            evidenceRefForFixture(
              canonicalId,
              "operationalState"
            )
          ],
          details: {
            decisionStatus:
              status,
            decisionReason:
              reason,
            operationalState:
              row
                ?.operationalState ??
              null
          }
        })
      );

      continue;
    }

    if (
      status ===
      "PENDING_VERIFIED_FINAL"
    ) {
      anomalies.push(
        makeAnomaly({
          dayKey,
          truthFingerprint,
          scope:
            "fixture",
          canonicalId,
          category:
            "EVIDENCE",
          reasonCode:
            "PLAYED_TERMINAL_PENDING_VERIFIED_FINAL",
          severity:
            "warning",
          impact:
            "RECONCILIATION_REQUIRED",
          message:
            "Canonical state is played-terminal but strict verified-final evidence is still pending.",
          evidenceRefs: [
            evidenceRefForFixture(
              canonicalId,
              "decision/status"
            ),
            evidenceRefForFixture(
              canonicalId,
              "verifiedFinal/accepted"
            )
          ],
          details: {
            operationalState:
              row
                ?.operationalState ??
              null,
            verifiedFinalPresent:
              row
                ?.verifiedFinal
                ?.present ??
              null,
            verifiedFinalAccepted:
              row
                ?.verifiedFinal
                ?.accepted ??
              null,
            verifiedFinalReason:
              row
                ?.verifiedFinal
                ?.reason ??
              null
          }
        })
      );
    }

    /*
     * OPEN is intentionally not an anomaly.
     * SCHEDULED/LIVE/DELAYED/INTERRUPTED are valid open truth.
     */
  }
}

function addEvidenceAnomalies({
  ledger,
  dayKey,
  truthFingerprint,
  anomalies
}) {
  const orphanRows =
    Array.isArray(
      ledger
        ?.anomalies
        ?.orphanVerifiedFinals
    )
      ? ledger
          .anomalies
          .orphanVerifiedFinals
      : [];

  const sortedOrphans =
    [...orphanRows]
      .sort(
        (left, right) =>
          clean(
            left?.canonicalId
          ).localeCompare(
            clean(
              right?.canonicalId
            )
          ) ||
          clean(
            left?.reason
          ).localeCompare(
            clean(
              right?.reason
            )
          )
      );

  for (
    const row of sortedOrphans
  ) {
    const canonicalId =
      clean(
        row?.canonicalId
      ) ||
      null;

    const rawReason =
      clean(
        row?.reason
      );

    const missingId =
      rawReason ===
      "verified_final_missing_canonical_id";

    anomalies.push(
      makeAnomaly({
        dayKey,
        truthFingerprint,
        scope:
          "day",
        canonicalId,
        category:
          "EVIDENCE",
        reasonCode:
          missingId
            ? "VERIFIED_FINAL_MISSING_CANONICAL_ID"
            : "ORPHAN_VERIFIED_FINAL",
        severity:
          "error",
        impact:
          "BLOCKING_CONFLICT",
        message:
          missingId
            ? "Verified-final evidence has no canonical fixture identity."
            : "Verified-final evidence references no canonical member of the day universe.",
        evidenceRefs: [
          `anomalies/orphanVerifiedFinals/${encodeURIComponent(canonicalId || "<missing>")}/${encodeURIComponent(rawReason || "<unknown>")}`
        ],
        details: {
          sourceReason:
            rawReason ||
            null
        }
      })
    );
  }

  const duplicates =
    Array.isArray(
      ledger
        ?.anomalies
        ?.duplicateVerifiedFinalFixtureIds
    )
      ? [
          ...new Set(
            ledger
              .anomalies
              .duplicateVerifiedFinalFixtureIds
              .map(clean)
              .filter(Boolean)
          )
        ].sort()
      : [];

  for (
    const canonicalId of duplicates
  ) {
    anomalies.push(
      makeAnomaly({
        dayKey,
        truthFingerprint,
        scope:
          "fixture",
        canonicalId,
        category:
          "EVIDENCE",
        reasonCode:
          "DUPLICATE_VERIFIED_FINAL_EVIDENCE",
        severity:
          "error",
        impact:
          "BLOCKING_CONFLICT",
        message:
          "Multiple verified-final artifacts compete for the same canonical fixture identity.",
        evidenceRefs: [
          `anomalies/duplicateVerifiedFinalFixtureIds/${encodeURIComponent(canonicalId)}`
        ],
        details: {}
      })
    );
  }
}

function addDownstreamStateAnomaly({
  anomalies,
  dayKey,
  truthFingerprint,
  component,
  state,
  notObservedReason,
  partialReason,
  unresolvedReason = null,
  conflictReason
}) {
  const normalized =
    clean(state);

  if (
    normalized ===
    "NOT_OBSERVED"
  ) {
    anomalies.push(
      makeAnomaly({
        dayKey,
        truthFingerprint,
        scope:
          "downstream",
        category:
          "OBSERVABILITY",
        reasonCode:
          notObservedReason,
        severity:
          "info",
        impact:
          "OBSERVATION_GAP",
        message:
          `${component} downstream evidence was not observed for this day.`,
        evidenceRefs: [
          `downstream/convergence/${component}/state`
        ],
        details: {
          state:
            normalized
        }
      })
    );

    return;
  }

  if (
    normalized ===
    "PRESENT_PARTIAL"
  ) {
    anomalies.push(
      makeAnomaly({
        dayKey,
        truthFingerprint,
        scope:
          "downstream",
        category:
          "DOWNSTREAM",
        reasonCode:
          partialReason,
        severity:
          "warning",
        impact:
          "RECONCILIATION_REQUIRED",
        message:
          `${component} downstream projection is incomplete relative to ledger truth.`,
        evidenceRefs: [
          `downstream/convergence/${component}/state`
        ],
        details: {
          state:
            normalized
        }
      })
    );

    return;
  }

  if (
    normalized ===
      "PRESENT_UNRESOLVED" &&
    unresolvedReason
  ) {
    anomalies.push(
      makeAnomaly({
        dayKey,
        truthFingerprint,
        scope:
          "downstream",
        category:
          "DOWNSTREAM",
        reasonCode:
          unresolvedReason,
        severity:
          "warning",
        impact:
          "RECONCILIATION_REQUIRED",
        message:
          `${component} contains unresolved downstream rows and cannot yet converge.`,
        evidenceRefs: [
          `downstream/convergence/${component}/state`
        ],
        details: {
          state:
            normalized
        }
      })
    );

    return;
  }

  if (
    normalized ===
    "PRESENT_CONFLICT"
  ) {
    anomalies.push(
      makeAnomaly({
        dayKey,
        truthFingerprint,
        scope:
          "downstream",
        category:
          "DOWNSTREAM",
        reasonCode:
          conflictReason,
        severity:
          "error",
        impact:
          "BLOCKING_CONFLICT",
        message:
          `${component} downstream projection conflicts with ledger-bound truth.`,
        evidenceRefs: [
          `downstream/convergence/${component}/state`
        ],
        details: {
          state:
            normalized
        }
      })
    );
  }
}

function addDownstreamAnomalies({
  convergence,
  dayKey,
  truthFingerprint,
  anomalies
}) {
  addDownstreamStateAnomaly({
    anomalies,
    dayKey,
    truthFingerprint,
    component:
      "history",
    state:
      convergence
        ?.history
        ?.state,
    notObservedReason:
      "HISTORY_NOT_OBSERVED",
    partialReason:
      "HISTORY_INCOMPLETE",
    conflictReason:
      "HISTORY_CONFLICT"
  });

  addDownstreamStateAnomaly({
    anomalies,
    dayKey,
    truthFingerprint,
    component:
      "settlement",
    state:
      convergence
        ?.settlement
        ?.state,
    notObservedReason:
      "SETTLEMENT_NOT_OBSERVED",
    partialReason:
      "SETTLEMENT_UNRESOLVED",
    unresolvedReason:
      "SETTLEMENT_UNRESOLVED",
    conflictReason:
      "SETTLEMENT_CONFLICT"
  });

  addDownstreamStateAnomaly({
    anomalies,
    dayKey,
    truthFingerprint,
    component:
      "publication",
    state:
      convergence
        ?.publication
        ?.state,
    notObservedReason:
      "PUBLICATION_NOT_OBSERVED",
    partialReason:
      "PUBLICATION_INCOMPLETE",
    conflictReason:
      "PUBLICATION_CONFLICT"
  });

  const componentStates = [
    clean(
      convergence
        ?.history
        ?.state
    ),
    clean(
      convergence
        ?.settlement
        ?.state
    ),
    clean(
      convergence
        ?.publication
        ?.state
    )
  ];

  if (
    convergence
      ?.overallState ===
      "CONFLICT" &&
    !componentStates.includes(
      "PRESENT_CONFLICT"
    )
  ) {
    anomalies.push(
      makeAnomaly({
        dayKey,
        truthFingerprint,
        scope:
          "downstream",
        category:
          "DOWNSTREAM",
        reasonCode:
          "DOWNSTREAM_CONFLICT_WITHOUT_COMPONENT",
        severity:
          "error",
        impact:
          "BLOCKING_CONFLICT",
        message:
          "Overall downstream convergence is conflicting without a component-level conflict diagnosis.",
        evidenceRefs: [
          "downstream/convergence/overallState"
        ],
        details: {
          overallState:
            convergence
              ?.overallState ??
            null,
          componentStates
        }
      })
    );
  }

  if (
    convergence
      ?.overallState ===
      "INCOMPLETE" &&
    !componentStates.some(
      state =>
        state ===
          "PRESENT_PARTIAL" ||
        state ===
          "PRESENT_UNRESOLVED"
    )
  ) {
    anomalies.push(
      makeAnomaly({
        dayKey,
        truthFingerprint,
        scope:
          "downstream",
        category:
          "DOWNSTREAM",
        reasonCode:
          "DOWNSTREAM_INCOMPLETE_WITHOUT_COMPONENT",
        severity:
          "warning",
        impact:
          "RECONCILIATION_REQUIRED",
        message:
          "Overall downstream convergence is incomplete without a component-level incomplete diagnosis.",
        evidenceRefs: [
          "downstream/convergence/overallState"
        ],
        details: {
          overallState:
            convergence
              ?.overallState ??
            null,
          componentStates
        }
      })
    );
  }
}

function addSystemHealthDiagnostic({
  convergence,
  dayKey,
  truthFingerprint,
  anomalies
}) {
  const health =
    convergence
      ?.systemHealth ||
    {};

  const state =
    clean(
      health.state
    );

  let reasonCode = null;
  let severity = null;
  let message = null;

  if (
    state ===
    "NOT_OBSERVED"
  ) {
    reasonCode =
      "SYSTEM_HEALTH_NOT_OBSERVED";

    severity =
      "info";

    message =
      "System Health was not observed; this does not alter football truth.";
  }
  else if (
    state ===
    "OBSERVED_WARNING"
  ) {
    reasonCode =
      "SYSTEM_HEALTH_WARNING_SIGNAL";

    severity =
      "warning";

    message =
      "System Health reports a warning diagnostic signal.";
  }
  else if (
    state ===
    "OBSERVED_ERROR"
  ) {
    reasonCode =
      "SYSTEM_HEALTH_ERROR_SIGNAL";

    severity =
      "error";

    message =
      "System Health reports an error diagnostic signal.";
  }
  else if (
    state ===
      "OBSERVED_UNKNOWN"
  ) {
    reasonCode =
      "SYSTEM_HEALTH_UNKNOWN_SIGNAL";

    severity =
      "warning";

    message =
      "System Health was observed with an unknown severity contract.";
  }

  /*
   * OBSERVED_INFO is healthy diagnostic context and emits no anomaly.
   */
  if (!reasonCode) {
    return;
  }

  anomalies.push(
    makeAnomaly({
      dayKey,
      truthFingerprint,
      scope:
        "downstream",
      category:
        "DIAGNOSTIC",
      reasonCode,
      severity,
      impact:
        "DIAGNOSTIC_ONLY",
      message,
      evidenceRefs: [
        "downstream/convergence/systemHealth/state"
      ],
      details: {
        state:
          state ||
          null,
        severity:
          health
            ?.severity ??
          null,
        alert:
          health
            ?.alert ??
          null,
        activeIssueCount:
          health
            ?.activeIssueCount ??
          null,
        actionableIssueCount:
          health
            ?.actionableIssueCount ??
          null
      }
    })
  );
}

function addStructuralFallbacks({
  ledger,
  convergence,
  dayKey,
  truthFingerprint,
  anomalies
}) {
  const hasTruthConflict =
    anomalies.some(
      row =>
        row.category ===
          "TRUTH" &&
        row.impact ===
          "BLOCKING_CONFLICT"
    );

  const hasTruthReconciliation =
    anomalies.some(
      row =>
        row.category ===
          "TRUTH" &&
        row.impact ===
          "RECONCILIATION_REQUIRED"
    );

  const hasEvidenceBlocking =
    anomalies.some(
      row =>
        row.category ===
          "EVIDENCE" &&
        row.impact ===
          "BLOCKING_CONFLICT"
    );

  if (
    ledger.ledgerState ===
      "CONFLICT" &&
    !hasTruthConflict &&
    !hasEvidenceBlocking
  ) {
    anomalies.push(
      makeAnomaly({
        dayKey,
        truthFingerprint,
        scope:
          "day",
        category:
          "TRUTH",
        reasonCode:
          "LEDGER_CONFLICT_WITHOUT_DIAGNOSTIC",
        severity:
          "error",
        impact:
          "BLOCKING_CONFLICT",
        message:
          "Day Truth Ledger is conflicting but exposes no fixture/evidence conflict diagnosis.",
        evidenceRefs: [
          "ledgerState"
        ],
        details: {
          ledgerState:
            ledger.ledgerState
        }
      })
    );
  }

  if (
    ledger.ledgerState ===
      "INCOMPLETE" &&
    !hasTruthReconciliation &&
    !anomalies.some(
      row =>
        row.reasonCode ===
          "PLAYED_TERMINAL_PENDING_VERIFIED_FINAL"
    )
  ) {
    anomalies.push(
      makeAnomaly({
        dayKey,
        truthFingerprint,
        scope:
          "day",
        category:
          "TRUTH",
        reasonCode:
          "LEDGER_INCOMPLETE_WITHOUT_DIAGNOSTIC",
        severity:
          "warning",
        impact:
          "RECONCILIATION_REQUIRED",
        message:
          "Day Truth Ledger is incomplete but exposes no fixture-level incomplete diagnosis.",
        evidenceRefs: [
          "ledgerState"
        ],
        details: {
          ledgerState:
            ledger.ledgerState
        }
      })
    );
  }

  /*
   * Explicitly consume the convergence argument here so this function
   * remains contract-bound if later structural fallbacks expand.
   */
  void convergence;
}

function buildSummary(
  anomalies
) {
  const count =
    predicate =>
      anomalies.filter(
        predicate
      ).length;

  return {
    anomalyCount:
      anomalies.length,

    blockingCount:
      count(
        row =>
          row.impact ===
          "BLOCKING_CONFLICT"
      ),

    reconciliationRequiredCount:
      count(
        row =>
          row.impact ===
          "RECONCILIATION_REQUIRED"
      ),

    observationGapCount:
      count(
        row =>
          row.impact ===
          "OBSERVATION_GAP"
      ),

    diagnosticOnlyCount:
      count(
        row =>
          row.impact ===
          "DIAGNOSTIC_ONLY"
      ),

    errorCount:
      count(
        row =>
          row.severity ===
          "error"
      ),

    warningCount:
      count(
        row =>
          row.severity ===
          "warning"
      ),

    infoCount:
      count(
        row =>
          row.severity ===
          "info"
      ),

    fixtureScopedCount:
      count(
        row =>
          row.scope ===
          "fixture"
      ),

    dayScopedCount:
      count(
        row =>
          row.scope ===
          "day"
      ),

    downstreamScopedCount:
      count(
        row =>
          row.scope ===
          "downstream"
      )
  };
}

function auditStateFromSummary(
  summary
) {
  if (
    summary.blockingCount >
    0
  ) {
    return AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_STATE
      .BLOCKED;
  }

  if (
    summary
      .reconciliationRequiredCount >
    0
  ) {
    return AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_STATE
      .RECONCILIATION_REQUIRED;
  }

  if (
    summary
      .observationGapCount >
    0
  ) {
    return AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_STATE
      .OBSERVATION_GAPS;
  }

  return AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_STATE
    .CLEAR;
}

export function buildAutonomousTruthReconciliationAudit({
  ledger,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const inputBefore =
    JSON.stringify(
      ledger
    );

  const {
    dayKey,
    truthFingerprint,
    convergence
  } =
    validateLedger(
      ledger
    );

  const exactGeneratedAt =
    assertGeneratedAt(
      generatedAt
    );

  const anomalies = [];

  addFixtureDecisionAnomalies({
    ledger,
    dayKey,
    truthFingerprint,
    anomalies
  });

  addEvidenceAnomalies({
    ledger,
    dayKey,
    truthFingerprint,
    anomalies
  });

  addDownstreamAnomalies({
    convergence,
    dayKey,
    truthFingerprint,
    anomalies
  });

  addSystemHealthDiagnostic({
    convergence,
    dayKey,
    truthFingerprint,
    anomalies
  });

  addStructuralFallbacks({
    ledger,
    convergence,
    dayKey,
    truthFingerprint,
    anomalies
  });

  anomalies.sort(
    anomalySort
  );

  const summary =
    buildSummary(
      anomalies
    );

  const auditState =
    auditStateFromSummary(
      summary
    );

  const auditFingerprint =
    sha256({
      schema:
        AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_SCHEMA,

      auditVersion:
        AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_VERSION,

      dayKey,

      inputTruthFingerprint:
        truthFingerprint,

      auditState,

      authority:
        AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_AUTHORITY,

      summary,

      anomalies
    });

  const audit = {
    schema:
      AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_SCHEMA,

    auditVersion:
      AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_VERSION,

    dayKey,

    generatedAt:
      exactGeneratedAt,

    role:
      AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_ROLE,

    auditState,

    input: {
      ledgerSchema:
        ledger.schema,

      ledgerVersion:
        clean(
          ledger.ledgerVersion
        ),

      ledgerState:
        clean(
          ledger.ledgerState
        ),

      truthFingerprint,

      downstreamOverallState:
        clean(
          convergence
            .overallState
        )
    },

    authority: {
      ...AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_AUTHORITY
    },

    summary,

    anomalies,

    auditFingerprint,

    provenance: {
      inputSchema:
        ledger.schema,

      inputTruthFingerprint:
        truthFingerprint,

      diagnosticContract:
        "ledger_bound_deterministic_read_only_audit"
    }
  };

  if (
    JSON.stringify(
      ledger
    ) !==
    inputBefore
  ) {
    throw new Error(
      "autonomous_truth_audit_mutated_input"
    );
  }

  return audit;
}

export function maximumAutonomousTruthReconciliationImpact(
  anomalies
) {
  let maximum =
    "DIAGNOSTIC_ONLY";

  for (
    const row of
    Array.isArray(anomalies)
      ? anomalies
      : []
  ) {
    if (
      (
        IMPACT_ORDER[
          row?.impact
        ] ??
        -1
      ) >
      IMPACT_ORDER[maximum]
    ) {
      maximum =
        row.impact;
    }
  }

  return maximum;
}
