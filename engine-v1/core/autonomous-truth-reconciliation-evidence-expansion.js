import {
  createHash
} from "node:crypto";

export const AUTONOMOUS_TRUTH_RECONCILIATION_EVIDENCE_SCHEMA =
  "ai-matchlab.autonomous-truth-reconciliation-evidence-expansion.v1";

export const AUTONOMOUS_TRUTH_RECONCILIATION_EVIDENCE_VERSION =
  "1.0.0";

export const AUTONOMOUS_TRUTH_RECONCILIATION_EVIDENCE_ROLE =
  "derived_diagnostic_evidence_expansion";

const LEDGER_SCHEMA =
  "ai-matchlab.day-truth-ledger.v1";

const AUDIT_SCHEMA =
  "ai-matchlab.autonomous-truth-reconciliation-audit.v1";

function clean(value) {
  return String(
    value ?? ""
  ).trim();
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

function fixtureId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.fixtureId ||
    row?.id
  );
}

function uniqueStrings(values) {
  return [
    ...new Set(
      (
        Array.isArray(values)
          ? values
          : []
      )
        .map(clean)
        .filter(Boolean)
    )
  ].sort();
}

function canonicalIdSet(ledger) {
  return new Set(
    (
      Array.isArray(
        ledger?.fixtures
      )
        ? ledger.fixtures
        : []
    )
      .map(
        fixtureId
      )
      .filter(Boolean)
  );
}

function classifyIdentity(
  rawId,
  canonicalIds
) {
  const id =
    clean(
      rawId
    );

  if (!id) {
    return {
      canonicalId:
        null,

      observedFixtureId:
        null
    };
  }

  if (
    canonicalIds.has(id)
  ) {
    return {
      canonicalId:
        id,

      observedFixtureId:
        null
    };
  }

  return {
    canonicalId:
      null,

    observedFixtureId:
      id
  };
}

function semanticSettlementRows(rows) {
  const map =
    new Map();

  for (
    const raw of
    Array.isArray(rows)
      ? rows
      : []
  ) {
    const canonicalId =
      clean(
        raw?.canonicalId
      ) ||
      null;

    const result =
      clean(
        raw?.result
      ) ||
      null;

    const reason =
      clean(
        raw?.reason
      ) ||
      null;

    const key =
      JSON.stringify([
        canonicalId,
        result,
        reason
      ]);

    const current =
      map.get(key) || {
        canonicalId,
        result,
        reason,
        occurrenceCount:
          0
      };

    current.occurrenceCount +=
      1;

    map.set(
      key,
      current
    );
  }

  return [
    ...map.values()
  ].sort(
    (left, right) =>
      clean(
        left.canonicalId
      ).localeCompare(
        clean(
          right.canonicalId
        )
      ) ||
      clean(
        left.result
      ).localeCompare(
        clean(
          right.result
        )
      ) ||
      clean(
        left.reason
      ).localeCompare(
        clean(
          right.reason
        )
      )
  );
}

function finding({
  dayKey,
  truthFingerprint,
  auditFingerprint,
  component,
  reasonCode,
  severity,
  impact,
  canonicalId = null,
  observedFixtureId = null,
  evidenceRefs,
  details = {}
}) {
  const normalizedCanonicalId =
    clean(
      canonicalId
    ) ||
    null;

  const normalizedObservedFixtureId =
    clean(
      observedFixtureId
    ) ||
    null;

  if (
    normalizedCanonicalId &&
    normalizedObservedFixtureId
  ) {
    throw new Error(
      "autonomous_truth_evidence_identity_classes_overlap"
    );
  }

  const refs =
    uniqueStrings(
      evidenceRefs
    );

  if (
    refs.length === 0
  ) {
    throw new Error(
      `autonomous_truth_evidence_ref_required:${reasonCode}`
    );
  }

  const identity = {
    dayKey,
    truthFingerprint,
    auditFingerprint,
    component,
    reasonCode,
    canonicalId:
      normalizedCanonicalId,
    observedFixtureId:
      normalizedObservedFixtureId,
    evidenceRefs:
      refs
  };

  return {
    findingId:
      `atre_v1_${sha256(identity).slice(0, 24)}`,

    component,

    reasonCode,

    severity,

    impact,

    canonicalId:
      normalizedCanonicalId,

    observedFixtureId:
      normalizedObservedFixtureId,

    evidenceRefs:
      refs,

    details:
      JSON.parse(
        JSON.stringify(
          details ?? {}
        )
      )
  };
}

function sortFindings(
  left,
  right
) {
  return (
    left.component.localeCompare(
      right.component
    ) ||
    left.reasonCode.localeCompare(
      right.reasonCode
    ) ||
    clean(
      left.canonicalId
    ).localeCompare(
      clean(
        right.canonicalId
      )
    ) ||
    clean(
      left.observedFixtureId
    ).localeCompare(
      clean(
        right.observedFixtureId
      )
    ) ||
    left.findingId.localeCompare(
      right.findingId
    )
  );
}

function addHistoryFindings(
  context
) {
  const {
    convergence,
    canonicalIds,
    add
  } =
    context;

  const history =
    convergence?.history ||
    {};

  for (
    const canonicalId of
    uniqueStrings(
      history
        .missingEligibleFixtureIds
    )
  ) {
    add({
      component:
        "history",

      reasonCode:
        "HISTORY_MISSING_ELIGIBLE_FIXTURE",

      severity:
        "warning",

      impact:
        "RECONCILIATION_REQUIRED",

      canonicalId,

      evidenceRefs: [
        `downstream/convergence/history/missingEligibleFixtureIds/${encodeURIComponent(canonicalId)}`
      ],

      details: {
        historyState:
          history.state ??
          null
      }
    });
  }

  for (
    const observedFixtureId of
    uniqueStrings(
      history
        .unexpectedFixtureIds
    )
  ) {
    add({
      component:
        "history",

      reasonCode:
        "HISTORY_UNEXPECTED_FIXTURE",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      observedFixtureId,

      evidenceRefs: [
        `downstream/convergence/history/unexpectedFixtureIds/${encodeURIComponent(observedFixtureId)}`
      ],

      details: {
        historyState:
          history.state ??
          null
      }
    });
  }

  for (
    const rawId of
    uniqueStrings(
      history
        .duplicateFixtureIds
    )
  ) {
    add({
      component:
        "history",

      reasonCode:
        "HISTORY_DUPLICATE_FIXTURE",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      ...classifyIdentity(
        rawId,
        canonicalIds
      ),

      evidenceRefs: [
        `downstream/convergence/history/duplicateFixtureIds/${encodeURIComponent(rawId)}`
      ],

      details: {
        historyState:
          history.state ??
          null
      }
    });
  }

  for (
    const rawId of
    uniqueStrings(
      history
        .invalidTruthContractFixtureIds
    )
  ) {
    add({
      component:
        "history",

      reasonCode:
        "HISTORY_INVALID_TRUTH_CONTRACT_FIXTURE",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      ...classifyIdentity(
        rawId,
        canonicalIds
      ),

      evidenceRefs: [
        `downstream/convergence/history/invalidTruthContractFixtureIds/${encodeURIComponent(rawId)}`
      ],

      details: {
        historyState:
          history.state ??
          null
      }
    });
  }

  for (
    const issue of
    uniqueStrings(
      history
        .structuralIssues
    )
  ) {
    add({
      component:
        "history",

      reasonCode:
        "HISTORY_STRUCTURAL_ISSUE",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      evidenceRefs: [
        `downstream/convergence/history/structuralIssues/${encodeURIComponent(issue)}`
      ],

      details: {
        issue,
        historyState:
          history.state ??
          null
      }
    });
  }
}

function addPublicationFindings(
  context
) {
  const {
    convergence,
    canonicalIds,
    add
  } =
    context;

  const publication =
    convergence?.publication ||
    {};

  for (
    const canonicalId of
    uniqueStrings(
      publication
        .missingCanonicalFixtureIds
    )
  ) {
    add({
      component:
        "publication",

      reasonCode:
        "PUBLICATION_MISSING_CANONICAL_FIXTURE",

      severity:
        "warning",

      impact:
        "RECONCILIATION_REQUIRED",

      canonicalId,

      evidenceRefs: [
        `downstream/convergence/publication/missingCanonicalFixtureIds/${encodeURIComponent(canonicalId)}`
      ],

      details: {
        publicationState:
          publication.state ??
          null
      }
    });
  }

  for (
    const observedFixtureId of
    uniqueStrings(
      publication
        .extraPublishedFixtureIds
    )
  ) {
    add({
      component:
        "publication",

      reasonCode:
        "PUBLICATION_EXTRA_FIXTURE",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      observedFixtureId,

      evidenceRefs: [
        `downstream/convergence/publication/extraPublishedFixtureIds/${encodeURIComponent(observedFixtureId)}`
      ],

      details: {
        publicationState:
          publication.state ??
          null
      }
    });
  }

  for (
    const rawId of
    uniqueStrings(
      publication
        .duplicatePublishedFixtureIds
    )
  ) {
    add({
      component:
        "publication",

      reasonCode:
        "PUBLICATION_DUPLICATE_FIXTURE",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      ...classifyIdentity(
        rawId,
        canonicalIds
      ),

      evidenceRefs: [
        `downstream/convergence/publication/duplicatePublishedFixtureIds/${encodeURIComponent(rawId)}`
      ],

      details: {
        publicationState:
          publication.state ??
          null
      }
    });
  }
}

function addSettlementFindings(
  context
) {
  const {
    convergence,
    canonicalIds,
    add
  } =
    context;

  const settlement =
    convergence?.settlement ||
    {};

  for (
    const row of
    semanticSettlementRows(
      settlement
        .orphanSettlementRows
    )
  ) {
    add({
      component:
        "settlement",

      reasonCode:
        "SETTLEMENT_ORPHAN_FIXTURE",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      observedFixtureId:
        row.canonicalId,

      evidenceRefs: [
        [
          "downstream/convergence/settlement/orphanSettlementRows",
          encodeURIComponent(
            row.canonicalId ||
            "<missing>"
          ),
          encodeURIComponent(
            row.result ||
            "<missing>"
          ),
          encodeURIComponent(
            row.reason ||
            "<unknown>"
          )
        ].join("/")
      ],

      details: {
        result:
          row.result,
        sourceReason:
          row.reason,
        occurrenceCount:
          row.occurrenceCount
      }
    });
  }

  for (
    const row of
    semanticSettlementRows(
      settlement
        .incompatibleSettlementRows
    )
  ) {
    add({
      component:
        "settlement",

      reasonCode:
        "SETTLEMENT_INCOMPATIBLE_TRUTH",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      ...classifyIdentity(
        row.canonicalId,
        canonicalIds
      ),

      evidenceRefs: [
        [
          "downstream/convergence/settlement/incompatibleSettlementRows",
          encodeURIComponent(
            row.canonicalId ||
            "<missing>"
          ),
          encodeURIComponent(
            row.result ||
            "<missing>"
          ),
          encodeURIComponent(
            row.reason ||
            "<unknown>"
          )
        ].join("/")
      ],

      details: {
        result:
          row.result,
        sourceReason:
          row.reason,
        occurrenceCount:
          row.occurrenceCount
      }
    });
  }

  for (
    const row of
    semanticSettlementRows(
      settlement
        .structurallyInvalidRows
    )
  ) {
    add({
      component:
        "settlement",

      reasonCode:
        "SETTLEMENT_STRUCTURALLY_INVALID_ROW",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      ...classifyIdentity(
        row.canonicalId,
        canonicalIds
      ),

      evidenceRefs: [
        [
          "downstream/convergence/settlement/structurallyInvalidRows",
          encodeURIComponent(
            row.canonicalId ||
            "<missing>"
          ),
          encodeURIComponent(
            row.result ||
            "<missing>"
          ),
          encodeURIComponent(
            row.reason ||
            "<unknown>"
          )
        ].join("/")
      ],

      details: {
        result:
          row.result,
        sourceReason:
          row.reason,
        occurrenceCount:
          row.occurrenceCount
      }
    });
  }

  for (
    const issue of
    uniqueStrings(
      settlement
        .structuralIssues
    )
  ) {
    add({
      component:
        "settlement",

      reasonCode:
        "SETTLEMENT_STRUCTURAL_ISSUE",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      evidenceRefs: [
        `downstream/convergence/settlement/structuralIssues/${encodeURIComponent(issue)}`
      ],

      details: {
        issue,
        settlementState:
          settlement.state ??
          null
      }
    });
  }

  if (
    settlement.state ===
      "PRESENT_UNRESOLVED" &&
    Number(
      settlement.unresolvedRows ??
      0
    ) > 0
  ) {
    add({
      component:
        "settlement",

      reasonCode:
        "SETTLEMENT_UNRESOLVED_COUNT_ONLY",

      severity:
        "warning",

      impact:
        "RECONCILIATION_REQUIRED",

      evidenceRefs: [
        "downstream/convergence/settlement/unresolvedRows"
      ],

      details: {
        unresolvedRows:
          Number(
            settlement.unresolvedRows
          ),

        fixtureIdEvidenceAvailable:
          false
      }
    });
  }
}

export function buildAutonomousTruthReconciliationEvidenceExpansion({
  ledger,
  audit
} = {}) {
  if (
    !ledger ||
    ledger.schema !==
      LEDGER_SCHEMA ||
    !Array.isArray(
      ledger.fixtures
    )
  ) {
    throw new Error(
      "autonomous_truth_evidence_ledger_invalid"
    );
  }

  if (
    !audit ||
    audit.schema !==
      AUDIT_SCHEMA ||
    !Array.isArray(
      audit.anomalies
    )
  ) {
    throw new Error(
      "autonomous_truth_evidence_audit_invalid"
    );
  }

  if (
    audit.input
      ?.truthFingerprint !==
      ledger.truthFingerprint ||
    audit.provenance
      ?.inputTruthFingerprint !==
      ledger.truthFingerprint
  ) {
    throw new Error(
      "autonomous_truth_evidence_truth_binding_mismatch"
    );
  }

  if (
    audit.authority
      ?.repairAuthorized !==
      false ||
    ledger.authorization
      ?.repairAuthorized !==
      false
  ) {
    throw new Error(
      "autonomous_truth_evidence_repair_authority_invalid"
    );
  }

  const convergence =
    ledger
      ?.downstream
      ?.convergence;

  if (
    !convergence ||
    convergence
      .truthFingerprint !==
      ledger.truthFingerprint
  ) {
    throw new Error(
      "autonomous_truth_evidence_convergence_binding_invalid"
    );
  }

  const canonicalIds =
    canonicalIdSet(
      ledger
    );

  const findings = [];

  const add =
    payload => {
      findings.push(
        finding({
          dayKey:
            ledger.dayKey,

          truthFingerprint:
            ledger.truthFingerprint,

          auditFingerprint:
            audit.auditFingerprint,

          ...payload
        })
      );
    };

  const context = {
    convergence,
    canonicalIds,
    add
  };

  addHistoryFindings(
    context
  );

  addSettlementFindings(
    context
  );

  addPublicationFindings(
    context
  );

  findings.sort(
    sortFindings
  );

  const canonicalIdentityCount =
    new Set(
      findings
        .map(
          row =>
            row.canonicalId
        )
        .filter(Boolean)
    ).size;

  const observedIdentityCount =
    new Set(
      findings
        .map(
          row =>
            row.observedFixtureId
        )
        .filter(Boolean)
    ).size;

  const summary = {
    findingCount:
      findings.length,

    blockingCount:
      findings.filter(
        row =>
          row.impact ===
          "BLOCKING_CONFLICT"
      ).length,

    reconciliationRequiredCount:
      findings.filter(
        row =>
          row.impact ===
          "RECONCILIATION_REQUIRED"
      ).length,

    canonicalIdentityCount,

    observedIdentityCount,

    countOnlyFindingCount:
      findings.filter(
        row =>
          row.canonicalId ===
            null &&
          row.observedFixtureId ===
            null
      ).length
  };

  const evidenceFingerprint =
    sha256({
      schema:
        AUTONOMOUS_TRUTH_RECONCILIATION_EVIDENCE_SCHEMA,

      version:
        AUTONOMOUS_TRUTH_RECONCILIATION_EVIDENCE_VERSION,

      dayKey:
        ledger.dayKey,

      truthFingerprint:
        ledger.truthFingerprint,

      auditFingerprint:
        audit.auditFingerprint,

      authority: {
        diagnosisOnly:
          true,

        filesystemWriteAuthorized:
          false,

        repairAuthorized:
          false,

        workflowMutationAuthorized:
          false
      },

      summary,

      findings
    });

  return {
    schema:
      AUTONOMOUS_TRUTH_RECONCILIATION_EVIDENCE_SCHEMA,

    version:
      AUTONOMOUS_TRUTH_RECONCILIATION_EVIDENCE_VERSION,

    dayKey:
      ledger.dayKey,

    role:
      AUTONOMOUS_TRUTH_RECONCILIATION_EVIDENCE_ROLE,

    source: {
      ledgerSchema:
        ledger.schema,

      auditSchema:
        audit.schema,

      truthFingerprint:
        ledger.truthFingerprint,

      auditFingerprint:
        audit.auditFingerprint
    },

    authority: {
      diagnosisOnly:
        true,

      filesystemWriteAuthorized:
        false,

      repairAuthorized:
        false,

      workflowMutationAuthorized:
        false
    },

    summary,

    findings,

    evidenceFingerprint
  };
}
