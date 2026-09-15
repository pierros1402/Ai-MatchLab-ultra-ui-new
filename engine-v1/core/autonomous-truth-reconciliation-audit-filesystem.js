import {
  buildDayTruthLedgerDay
} from "../jobs/build-day-truth-ledger-day.js";

import {
  AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_SCHEMA,
  buildAutonomousTruthReconciliationAudit
} from "./autonomous-truth-reconciliation-audit.js";

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

function uniqueSorted(values) {
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

function assertAudit(audit) {
  if (
    !audit ||
    typeof audit !==
      "object" ||
    Array.isArray(audit) ||
    audit.schema !==
      AUTONOMOUS_TRUTH_RECONCILIATION_AUDIT_SCHEMA ||
    !Array.isArray(
      audit.anomalies
    )
  ) {
    throw new Error(
      "autonomous_truth_audit_evidence_index_invalid_audit"
    );
  }
}

export function buildAutonomousTruthReconciliationEvidenceIndex(
  audit
) {
  assertAudit(
    audit
  );

  const anomalyIds =
    uniqueSorted(
      audit.anomalies.map(
        row =>
          row?.anomalyId
      )
    );

  const canonicalIds =
    uniqueSorted(
      audit.anomalies.map(
        row =>
          row?.canonicalId
      )
    );

  const fixtureScopedCanonicalIds =
    uniqueSorted(
      audit.anomalies
        .filter(
          row =>
            row?.scope ===
            "fixture"
        )
        .map(
          row =>
            row?.canonicalId
        )
    );

  const reasonCodes =
    uniqueSorted(
      audit.anomalies.map(
        row =>
          row?.reasonCode
      )
    );

  const evidenceRefs =
    uniqueSorted(
      audit.anomalies.flatMap(
        row =>
          Array.isArray(
            row
              ?.evidence
              ?.refs
          )
            ? row
                .evidence
                .refs
            : []
      )
    );

  const reasonCodeCounts =
    reasonCodes.map(
      reasonCode => ({
        reasonCode,

        count:
          audit.anomalies.filter(
            row =>
              row?.reasonCode ===
              reasonCode
          ).length
      })
    );

  const byCanonicalId =
    canonicalIds.map(
      canonicalId => {
        const rows =
          audit.anomalies.filter(
            row =>
              clean(
                row?.canonicalId
              ) ===
              canonicalId
          );

        return {
          canonicalId,

          anomalyIds:
            uniqueSorted(
              rows.map(
                row =>
                  row?.anomalyId
              )
            ),

          reasonCodes:
            uniqueSorted(
              rows.map(
                row =>
                  row?.reasonCode
              )
            ),

          evidenceRefs:
            uniqueSorted(
              rows.flatMap(
                row =>
                  Array.isArray(
                    row
                      ?.evidence
                      ?.refs
                  )
                    ? row
                        .evidence
                        .refs
                    : []
              )
            )
        };
      }
    );

  return {
    anomalyIds,
    canonicalIds,
    fixtureScopedCanonicalIds,
    reasonCodes,
    reasonCodeCounts,
    evidenceRefs,
    byCanonicalId
  };
}

export function readAutonomousTruthReconciliationAuditDay({
  dayKey,
  generatedAt =
    new Date().toISOString(),
  ledgerGeneratedAt =
    generatedAt,
  includePublication =
    true,
  includeSystemHealth =
    true
} = {}) {
  const ledgerResult =
    buildDayTruthLedgerDay({
      dayKey,
      generatedAt:
        ledgerGeneratedAt,
      includePublication,
      includeSystemHealth
    });

  const ledger =
    ledgerResult.ledger;

  const audit =
    buildAutonomousTruthReconciliationAudit({
      ledger,
      generatedAt
    });

  if (
    audit.input
      .truthFingerprint !==
    ledger.truthFingerprint
  ) {
    throw new Error(
      "autonomous_truth_audit_source_binding_fingerprint_mismatch"
    );
  }

  const evidenceIndex =
    buildAutonomousTruthReconciliationEvidenceIndex(
      audit
    );

  return {
    dayKey:
      ledger.dayKey,

    sourceBound:
      true,

    readOnly:
      true,

    ledger: {
      schema:
        ledger.schema,

      ledgerVersion:
        ledger.ledgerVersion,

      ledgerState:
        ledger.ledgerState,

      truthFingerprint:
        ledger.truthFingerprint,

      fixtureCount:
        Array.isArray(
          ledger.fixtures
        )
          ? ledger.fixtures.length
          : 0,

      provenance:
        cloneJson(
          ledger.provenance
        )
    },

    sourceSummary:
      cloneJson(
        ledgerResult
          .sourceSummary
      ),

    audit,

    evidenceIndex,

    authority: {
      filesystemWriteAuthorized:
        false,

      auditArtifactWriteAuthorized:
        false,

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
    }
  };
}
