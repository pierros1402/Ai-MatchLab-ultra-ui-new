import {
  createHash
} from "node:crypto";

export const PRIMARY_EVIDENCE_SCHEMA =
  "ai-matchlab.autonomous-truth-reconciliation-primary-evidence.v1";

export const PRIMARY_EVIDENCE_VERSION =
  "1.0.0";

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
    .digest("hex");
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
      .map(fixtureId)
      .filter(Boolean)
  );
}

function classify(
  rawId,
  canonicalIds
) {
  const id =
    clean(rawId);

  if (!id) {
    return {
      canonicalId: null,
      observedFixtureId: null
    };
  }

  if (
    canonicalIds.has(id)
  ) {
    return {
      canonicalId: id,
      observedFixtureId: null
    };
  }

  return {
    canonicalId: null,
    observedFixtureId: id
  };
}

function makeFinding({
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
  const canonical =
    clean(canonicalId) ||
    null;

  const observed =
    clean(observedFixtureId) ||
    null;

  if (
    canonical &&
    observed
  ) {
    throw new Error(
      "primary_evidence_identity_classes_overlap"
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
      `primary_evidence_ref_required:${reasonCode}`
    );
  }

  const identity = {
    dayKey,
    truthFingerprint,
    auditFingerprint,
    component,
    reasonCode,
    canonicalId:
      canonical,
    observedFixtureId:
      observed,
    evidenceRefs:
      refs
  };

  return {
    findingId:
      `atrp_v1_${sha256(identity).slice(0,24)}`,

    component,
    reasonCode,
    severity,
    impact,

    canonicalId:
      canonical,

    observedFixtureId:
      observed,

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

export function buildAutonomousTruthReconciliationPrimaryEvidence({
  ledger,
  audit
} = {}) {
  if (
    !ledger ||
    ledger.schema !==
      "ai-matchlab.day-truth-ledger.v1" ||
    !Array.isArray(
      ledger.fixtures
    ) ||
    !ledger.anomalies
  ) {
    throw new Error(
      "primary_evidence_ledger_invalid"
    );
  }

  if (
    !audit ||
    audit.schema !==
      "ai-matchlab.autonomous-truth-reconciliation-audit.v1"
  ) {
    throw new Error(
      "primary_evidence_audit_invalid"
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
      "primary_evidence_truth_binding_mismatch"
    );
  }

  if (
    ledger.authorization
      ?.repairAuthorized !==
      false ||
    audit.authority
      ?.repairAuthorized !==
      false
  ) {
    throw new Error(
      "primary_evidence_repair_authority_invalid"
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
        makeFinding({
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

  for (
    const rawId of
    uniqueStrings(
      ledger
        .anomalies
        .conflictFixtureIds
    )
  ) {
    const identity =
      classify(
        rawId,
        canonicalIds
      );

    add({
      component:
        "truth",

      reasonCode:
        identity.canonicalId
          ? "TRUTH_CONFLICT_CANONICAL_FIXTURE"
          : "TRUTH_CONFLICT_OBSERVED_FIXTURE",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      ...identity,

      evidenceRefs: [
        `anomalies/conflictFixtureIds/${encodeURIComponent(rawId)}`
      ],

      details: {}
    });
  }

  for (
    const rawId of
    uniqueStrings(
      ledger
        .anomalies
        .pendingVerifiedFinalFixtureIds
    )
  ) {
    const identity =
      classify(
        rawId,
        canonicalIds
      );

    add({
      component:
        "verified_final",

      reasonCode:
        identity.canonicalId
          ? "VERIFIED_FINAL_PENDING_CANONICAL_FIXTURE"
          : "VERIFIED_FINAL_PENDING_OBSERVED_FIXTURE",

      severity:
        "warning",

      impact:
        "RECONCILIATION_REQUIRED",

      ...identity,

      evidenceRefs: [
        `anomalies/pendingVerifiedFinalFixtureIds/${encodeURIComponent(rawId)}`
      ],

      details: {}
    });
  }

  for (
    const rawId of
    uniqueStrings(
      ledger
        .anomalies
        .duplicateVerifiedFinalFixtureIds
    )
  ) {
    const identity =
      classify(
        rawId,
        canonicalIds
      );

    add({
      component:
        "verified_final",

      reasonCode:
        identity.canonicalId
          ? "VERIFIED_FINAL_DUPLICATE_CANONICAL_FIXTURE"
          : "VERIFIED_FINAL_DUPLICATE_OBSERVED_FIXTURE",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      ...identity,

      evidenceRefs: [
        `anomalies/duplicateVerifiedFinalFixtureIds/${encodeURIComponent(rawId)}`
      ],

      details: {}
    });
  }

  const orphanRows =
    Array.isArray(
      ledger
        .anomalies
        .orphanVerifiedFinals
    )
      ? ledger
          .anomalies
          .orphanVerifiedFinals
      : [];

  const normalizedOrphans =
    orphanRows
      .map(
        row => ({
          rawId:
            clean(
              row?.canonicalId
            ) ||
            null,

          reason:
            clean(
              row?.reason
            ) ||
            null
        })
      )
      .sort(
        (left, right) =>
          clean(
            left.rawId
          ).localeCompare(
            clean(
              right.rawId
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

  for (
    const row of
    normalizedOrphans
  ) {
    if (!row.rawId) {
      add({
        component:
          "verified_final",

        reasonCode:
          "VERIFIED_FINAL_ORPHAN_MISSING_FIXTURE_ID",

        severity:
          "error",

        impact:
          "BLOCKING_CONFLICT",

        canonicalId:
          null,

        observedFixtureId:
          null,

        evidenceRefs: [
          `anomalies/orphanVerifiedFinals/<missing>/${encodeURIComponent(row.reason || "<unknown>")}`
        ],

        details: {
          sourceReason:
            row.reason
        }
      });

      continue;
    }

    if (
      canonicalIds.has(
        row.rawId
      )
    ) {
      add({
        component:
          "verified_final",

        reasonCode:
          "VERIFIED_FINAL_ORPHAN_CANONICAL_CONTRADICTION",

        severity:
          "error",

        impact:
          "BLOCKING_CONFLICT",

        canonicalId:
          row.rawId,

        evidenceRefs: [
          `anomalies/orphanVerifiedFinals/${encodeURIComponent(row.rawId)}/${encodeURIComponent(row.reason || "<unknown>")}`
        ],

        details: {
          sourceReason:
            row.reason
        }
      });

      continue;
    }

    add({
      component:
        "verified_final",

      reasonCode:
        "VERIFIED_FINAL_ORPHAN_OBSERVED_FIXTURE",

      severity:
        "error",

      impact:
        "BLOCKING_CONFLICT",

      observedFixtureId:
        row.rawId,

      evidenceRefs: [
        `anomalies/orphanVerifiedFinals/${encodeURIComponent(row.rawId)}/${encodeURIComponent(row.reason || "<unknown>")}`
      ],

      details: {
        sourceReason:
          row.reason
      }
    });
  }

  findings.sort(
    sortFindings
  );

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

    canonicalIdentityCount:
      new Set(
        findings
          .map(
            row =>
              row.canonicalId
          )
          .filter(Boolean)
      ).size,

    observedIdentityCount:
      new Set(
        findings
          .map(
            row =>
              row.observedFixtureId
          )
          .filter(Boolean)
      ).size,

    identitylessFindingCount:
      findings.filter(
        row =>
          row.canonicalId ===
            null &&
          row.observedFixtureId ===
            null
      ).length
  };

  const authority = {
    diagnosisOnly:
      true,

    filesystemWriteAuthorized:
      false,

    repairAuthorized:
      false,

    workflowMutationAuthorized:
      false
  };

  const evidenceFingerprint =
    sha256({
      schema:
        PRIMARY_EVIDENCE_SCHEMA,

      version:
        PRIMARY_EVIDENCE_VERSION,

      dayKey:
        ledger.dayKey,

      truthFingerprint:
        ledger.truthFingerprint,

      auditFingerprint:
        audit.auditFingerprint,

      authority,
      summary,
      findings
    });

  return {
    schema:
      PRIMARY_EVIDENCE_SCHEMA,

    version:
      PRIMARY_EVIDENCE_VERSION,

    dayKey:
      ledger.dayKey,

    role:
      "derived_primary_truth_evidence",

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

    authority,

    summary,

    findings,

    evidenceFingerprint
  };
}
