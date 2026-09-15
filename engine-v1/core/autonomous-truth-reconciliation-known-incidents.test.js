import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDayTruthLedgerDay
} from "../jobs/build-day-truth-ledger-day.js";

import {
  buildAutonomousTruthReconciliationAudit
} from "./autonomous-truth-reconciliation-audit.js";

import {
  buildAutonomousTruthReconciliationEvidenceExpansion
} from "./autonomous-truth-reconciliation-evidence-expansion.js";

import {
  buildAutonomousTruthReconciliationPrimaryEvidence
} from "./autonomous-truth-reconciliation-primary-evidence.js";

const HASH =
  "e".repeat(64);

function canonicalFixture({
  id,
  decisionStatus =
    "CONVERGED_PLAYED_FINAL",
  operationalState =
    "PLAYED_TERMINAL",
  verifiedFinalPresent =
    true,
  verifiedFinalAccepted =
    true
}) {
  return {
    canonicalId:
      id,

    operationalState,

    verifiedFinal: {
      present:
        verifiedFinalPresent,

      accepted:
        verifiedFinalAccepted,

      reason:
        verifiedFinalAccepted
          ? "verified_final_result"
          : "verified_final_missing"
    },

    decision: {
      status:
        decisionStatus,

      reason:
        decisionStatus,

      historyEligible:
        decisionStatus ===
        "CONVERGED_PLAYED_FINAL",

      scoredSettlementEligible:
        decisionStatus ===
        "CONVERGED_PLAYED_FINAL",

      voidSettlementEligible:
        decisionStatus ===
        "CONVERGED_NON_PLAYED_TERMINAL",

      repairAuthorized:
        false
    }
  };
}

function convergedDownstream(
  overrides = {}
) {
  return {
    overallState:
      "CONVERGED",

    truthFingerprint:
      HASH,

    history: {
      observed:
        true,

      state:
        "PRESENT_CONVERGED",

      missingEligibleFixtureIds:
        [],

      unexpectedFixtureIds:
        [],

      duplicateFixtureIds:
        [],

      invalidTruthContractFixtureIds:
        [],

      structuralIssues:
        []
    },

    settlement: {
      observed:
        true,

      state:
        "PRESENT_CONVERGED",

      unresolvedRows:
        0,

      orphanSettlementRows:
        [],

      incompatibleSettlementRows:
        [],

      structurallyInvalidRows:
        [],

      structuralIssues:
        []
    },

    publication: {
      observed:
        true,

      state:
        "PRESENT_CONVERGED",

      missingCanonicalFixtureIds:
        [],

      extraPublishedFixtureIds:
        [],

      duplicatePublishedFixtureIds:
        []
    },

    systemHealth: {
      observed:
        true,

      state:
        "OBSERVED_INFO",

      severity:
        "info",

      alert:
        false,

      activeIssueCount:
        0,

      actionableIssueCount:
        0
    },

    authority: {
      footballTruthMutable:
        false,

      downstreamMutationAuthorized:
        false,

      repairAuthorized:
        false,

      observationsAffectTruthFingerprint:
        false
    },

    ...overrides
  };
}

function syntheticLedger({
  fixtures,
  ledgerState =
    "CLOSED",
  anomalies = {},
  convergence = null
}) {
  return {
    schema:
      "ai-matchlab.day-truth-ledger.v1",

    ledgerVersion:
      "1.0.0",

    dayKey:
      "2026-09-10",

    generatedAt:
      "2026-09-15T20:00:00.000Z",

    role:
      "derived_control_plane",

    ledgerState,

    truthFingerprint:
      HASH,

    fixtures,

    anomalies: {
      orphanVerifiedFinals:
        [],

      duplicateVerifiedFinalFixtureIds:
        [],

      conflictFixtureIds:
        [],

      pendingVerifiedFinalFixtureIds:
        [],

      ...anomalies
    },

    downstream: {
      convergence:
        convergence ||
        convergedDownstream()
    },

    authorization: {
      repairAuthorized:
        false
    }
  };
}

function evaluate(
  ledger
) {
  const audit =
    buildAutonomousTruthReconciliationAudit({
      ledger,

      generatedAt:
        "2026-09-15T21:00:00.000Z"
    });

  const downstreamEvidence =
    buildAutonomousTruthReconciliationEvidenceExpansion({
      ledger,
      audit
    });

  const primaryEvidence =
    buildAutonomousTruthReconciliationPrimaryEvidence({
      ledger,
      audit
    });

  return {
    audit,
    downstreamEvidence,
    primaryEvidence
  };
}

function realLedger(
  dayKey
) {
  return buildDayTruthLedgerDay({
    dayKey,

    generatedAt:
      "2026-09-15T20:00:00.000Z"
  }).ledger;
}

/*
 * KNOWN INCIDENT 1
 *
 * 2026-09-09:
 * San Felipe vs San Luis remained an operationally open fixture.
 * OPEN must never become an anomaly merely because the day contains
 * a fixture that is not played-terminal.
 */
test(
  "known incident 09-09 open San Felipe fixture remains valid OPEN rather than fabricated conflict",
  () => {
    const ledger =
      realLedger(
        "2026-09-09"
      );

    const canonicalId =
      "cid_chi2_sanfelipe_sanluis_20260909";

    const fixture =
      ledger.fixtures.find(
        row =>
          row.canonicalId ===
          canonicalId
      );

    assert.ok(
      fixture,
      "known 09-09 fixture must remain in canonical day membership"
    );

    assert.equal(
      fixture.decision.status,
      "OPEN"
    );

    assert.equal(
      fixture.decision.historyEligible,
      false
    );

    const {
      audit
    } =
      evaluate(
        ledger
      );

    assert.equal(
      audit.anomalies.some(
        row =>
          row.canonicalId ===
          canonicalId
      ),
      false
    );

    assert.equal(
      audit.authority.repairAuthorized,
      false
    );
  }
);

/*
 * KNOWN INCIDENT 2
 *
 * 2026-09-11 cross-day supersession/postponement cases.
 * They are closed non-played truth, never played-final/history truth.
 */
test(
  "known 11-09 Ferizaj and AB Argir postponed incidents remain non-played and never history eligible",
  () => {
    const ledger =
      realLedger(
        "2026-09-11"
      );

    const ids = [
      "cid_kos2_ferizaj_istogu_20260911",
      "cid_fro1_abargir_toftir_20260911"
    ];

    for (
      const canonicalId of
      ids
    ) {
      const fixture =
        ledger.fixtures.find(
          row =>
            row.canonicalId ===
            canonicalId
        );

      assert.ok(
        fixture,
        canonicalId
      );

      assert.equal(
        fixture.decision.status,
        "CONVERGED_NON_PLAYED_TERMINAL",
        canonicalId
      );

      assert.equal(
        fixture.decision.historyEligible,
        false,
        canonicalId
      );

      assert.equal(
        fixture.decision.scoredSettlementEligible,
        false,
        canonicalId
      );

      assert.equal(
        fixture.decision.voidSettlementEligible,
        true,
        canonicalId
      );
    }
  }
);

/*
 * KNOWN INCIDENT 3
 *
 * Azerbaijan identity anomaly:
 *
 * canonical:
 * cid_aze2_gancabasar_khankendi_20260910
 *
 * stale/orphan identity:
 * cid_aze2_cebrayil_khankendi_20260910
 *
 * The auditor must NEVER promote the stale identity into canonical
 * membership merely because verified-final evidence references it.
 */
test(
  "known Azerbaijan stale verified-final identity is observed orphan evidence and not canonical membership",
  () => {
    const canonicalId =
      "cid_aze2_gancabasar_khankendi_20260910";

    const staleId =
      "cid_aze2_cebrayil_khankendi_20260910";

    const ledger =
      syntheticLedger({
        ledgerState:
          "CONFLICT",

        fixtures: [
          canonicalFixture({
            id:
              canonicalId
          })
        ],

        anomalies: {
          orphanVerifiedFinals: [
            {
              canonicalId:
                staleId,

              reason:
                "verified_final_missing_canonical_membership"
            }
          ]
        }
      });

    const {
      audit,
      primaryEvidence
    } =
      evaluate(
        ledger
      );

    assert.equal(
      audit.auditState,
      "BLOCKED"
    );

    const row =
      primaryEvidence.findings.find(
        item =>
          item.reasonCode ===
          "VERIFIED_FINAL_ORPHAN_OBSERVED_FIXTURE"
      );

    assert.ok(row);

    assert.equal(
      row.canonicalId,
      null
    );

    assert.equal(
      row.observedFixtureId,
      staleId
    );

    assert.equal(
      primaryEvidence.summary.canonicalIdentityCount,
      0
    );

    assert.equal(
      primaryEvidence.summary.observedIdentityCount,
      1
    );

    assert.equal(
      primaryEvidence.authority.repairAuthorized,
      false
    );
  }
);

/*
 * KNOWN INCIDENT CLASS 4
 * Played-terminal fixture with no accepted verified final.
 */
test(
  "played-terminal pending verified-final incident requires reconciliation but grants no repair authority",
  () => {
    const canonicalId =
      "incident_pending_final";

    const ledger =
      syntheticLedger({
        ledgerState:
          "INCOMPLETE",

        fixtures: [
          canonicalFixture({
            id:
              canonicalId,

            decisionStatus:
              "PENDING_VERIFIED_FINAL",

            operationalState:
              "PLAYED_TERMINAL",

            verifiedFinalPresent:
              false,

            verifiedFinalAccepted:
              false
          })
        ],

        anomalies: {
          pendingVerifiedFinalFixtureIds: [
            canonicalId
          ]
        }
      });

    const {
      audit,
      primaryEvidence
    } =
      evaluate(
        ledger
      );

    assert.equal(
      audit.auditState,
      "RECONCILIATION_REQUIRED"
    );

    const finding =
      primaryEvidence.findings.find(
        row =>
          row.reasonCode ===
          "VERIFIED_FINAL_PENDING_CANONICAL_FIXTURE"
      );

    assert.ok(finding);

    assert.equal(
      finding.canonicalId,
      canonicalId
    );

    assert.equal(
      finding.impact,
      "RECONCILIATION_REQUIRED"
    );

    assert.equal(
      primaryEvidence.authority.repairAuthorized,
      false
    );
  }
);

/*
 * KNOWN INCIDENT CLASS 5
 * Duplicate verified-final evidence.
 */
test(
  "duplicate verified-final evidence blocks closure and preserves canonical identity",
  () => {
    const canonicalId =
      "incident_duplicate_final";

    const ledger =
      syntheticLedger({
        ledgerState:
          "CONFLICT",

        fixtures: [
          canonicalFixture({
            id:
              canonicalId
          })
        ],

        anomalies: {
          duplicateVerifiedFinalFixtureIds: [
            canonicalId
          ]
        }
      });

    const {
      audit,
      primaryEvidence
    } =
      evaluate(
        ledger
      );

    assert.equal(
      audit.auditState,
      "BLOCKED"
    );

    const finding =
      primaryEvidence.findings.find(
        row =>
          row.reasonCode ===
          "VERIFIED_FINAL_DUPLICATE_CANONICAL_FIXTURE"
      );

    assert.ok(finding);

    assert.equal(
      finding.canonicalId,
      canonicalId
    );

    assert.equal(
      finding.impact,
      "BLOCKING_CONFLICT"
    );
  }
);

/*
 * KNOWN INCIDENT CLASS 6
 * History is missing an eligible canonical fixture.
 */
test(
  "missing eligible history row is exact canonical reconciliation evidence",
  () => {
    const canonicalId =
      "incident_history_missing";

    const convergence =
      convergedDownstream();

    convergence.overallState =
      "INCOMPLETE";

    convergence.history = {
      ...convergence.history,

      state:
        "PRESENT_PARTIAL",

      missingEligibleFixtureIds: [
        canonicalId
      ]
    };

    const ledger =
      syntheticLedger({
        fixtures: [
          canonicalFixture({
            id:
              canonicalId
          })
        ],

        convergence
      });

    const {
      downstreamEvidence
    } =
      evaluate(
        ledger
      );

    const finding =
      downstreamEvidence.findings.find(
        row =>
          row.reasonCode ===
          "HISTORY_MISSING_ELIGIBLE_FIXTURE"
      );

    assert.ok(finding);

    assert.equal(
      finding.canonicalId,
      canonicalId
    );

    assert.equal(
      finding.observedFixtureId,
      null
    );

    assert.equal(
      finding.impact,
      "RECONCILIATION_REQUIRED"
    );
  }
);

/*
 * KNOWN INCIDENT CLASS 7
 * Unexpected persisted history identity.
 */
test(
  "unexpected history identity is observed evidence and never canonicalized",
  () => {
    const canonicalId =
      "incident_history_canonical";

    const staleId =
      "incident_history_stale";

    const convergence =
      convergedDownstream();

    convergence.overallState =
      "CONFLICT";

    convergence.history = {
      ...convergence.history,

      state:
        "PRESENT_CONFLICT",

      unexpectedFixtureIds: [
        staleId
      ]
    };

    const ledger =
      syntheticLedger({
        ledgerState:
          "CONFLICT",

        fixtures: [
          canonicalFixture({
            id:
              canonicalId
          })
        ],

        convergence
      });

    const {
      downstreamEvidence
    } =
      evaluate(
        ledger
      );

    const finding =
      downstreamEvidence.findings.find(
        row =>
          row.reasonCode ===
          "HISTORY_UNEXPECTED_FIXTURE"
      );

    assert.ok(finding);

    assert.equal(
      finding.canonicalId,
      null
    );

    assert.equal(
      finding.observedFixtureId,
      staleId
    );

    assert.equal(
      finding.impact,
      "BLOCKING_CONFLICT"
    );
  }
);

/*
 * KNOWN INCIDENT CLASS 8
 * Publication missing canonical plus extra stale identity.
 */
test(
  "publication mismatch separates missing canonical fixture from extra observed fixture",
  () => {
    const canonicalId =
      "incident_publication_missing";

    const staleId =
      "incident_publication_extra";

    const convergence =
      convergedDownstream();

    convergence.overallState =
      "CONFLICT";

    convergence.publication = {
      ...convergence.publication,

      state:
        "PRESENT_CONFLICT",

      missingCanonicalFixtureIds: [
        canonicalId
      ],

      extraPublishedFixtureIds: [
        staleId
      ]
    };

    const ledger =
      syntheticLedger({
        ledgerState:
          "CONFLICT",

        fixtures: [
          canonicalFixture({
            id:
              canonicalId
          })
        ],

        convergence
      });

    const {
      downstreamEvidence
    } =
      evaluate(
        ledger
      );

    const missing =
      downstreamEvidence.findings.find(
        row =>
          row.reasonCode ===
          "PUBLICATION_MISSING_CANONICAL_FIXTURE"
      );

    const extra =
      downstreamEvidence.findings.find(
        row =>
          row.reasonCode ===
          "PUBLICATION_EXTRA_FIXTURE"
      );

    assert.equal(
      missing.canonicalId,
      canonicalId
    );

    assert.equal(
      missing.observedFixtureId,
      null
    );

    assert.equal(
      extra.canonicalId,
      null
    );

    assert.equal(
      extra.observedFixtureId,
      staleId
    );
  }
);

/*
 * KNOWN INCIDENT CLASS 9
 * Settlement orphan identity and incompatible canonical truth.
 */
test(
  "settlement conflict preserves orphan observed identity and incompatible canonical identity separately",
  () => {
    const canonicalId =
      "incident_settlement_canonical";

    const orphanId =
      "incident_settlement_orphan";

    const convergence =
      convergedDownstream();

    convergence.overallState =
      "CONFLICT";

    convergence.settlement = {
      ...convergence.settlement,

      state:
        "PRESENT_CONFLICT",

      orphanSettlementRows: [
        {
          canonicalId:
            orphanId,

          result:
            "WIN",

          reason:
            "settlement_row_missing_canonical_membership"
        }
      ],

      incompatibleSettlementRows: [
        {
          canonicalId,

          result:
            "VOID",

          reason:
            "settlement_result_not_authorized"
        }
      ]
    };

    const ledger =
      syntheticLedger({
        ledgerState:
          "CONFLICT",

        fixtures: [
          canonicalFixture({
            id:
              canonicalId
          })
        ],

        convergence
      });

    const {
      downstreamEvidence
    } =
      evaluate(
        ledger
      );

    const orphan =
      downstreamEvidence.findings.find(
        row =>
          row.reasonCode ===
          "SETTLEMENT_ORPHAN_FIXTURE"
      );

    const incompatible =
      downstreamEvidence.findings.find(
        row =>
          row.reasonCode ===
          "SETTLEMENT_INCOMPATIBLE_TRUTH"
      );

    assert.equal(
      orphan.canonicalId,
      null
    );

    assert.equal(
      orphan.observedFixtureId,
      orphanId
    );

    assert.equal(
      incompatible.canonicalId,
      canonicalId
    );

    assert.equal(
      incompatible.observedFixtureId,
      null
    );
  }
);

/*
 * KNOWN INCIDENT CLASS 10
 * Settlement unresolved rows currently preserve count only.
 * Never fabricate a fixture identity that the source contract lacks.
 */
test(
  "unresolved settlement incident remains count-only and does not fabricate fixture identity",
  () => {
    const convergence =
      convergedDownstream();

    convergence.overallState =
      "INCOMPLETE";

    convergence.settlement = {
      ...convergence.settlement,

      state:
        "PRESENT_UNRESOLVED",

      unresolvedRows:
        2
    };

    const ledger =
      syntheticLedger({
        ledgerState:
          "INCOMPLETE",

        fixtures: [
          canonicalFixture({
            id:
              "incident_unresolved_settlement"
          })
        ],

        convergence
      });

    const {
      downstreamEvidence
    } =
      evaluate(
        ledger
      );

    const finding =
      downstreamEvidence.findings.find(
        row =>
          row.reasonCode ===
          "SETTLEMENT_UNRESOLVED_COUNT_ONLY"
      );

    assert.ok(finding);

    assert.equal(
      finding.canonicalId,
      null
    );

    assert.equal(
      finding.observedFixtureId,
      null
    );

    assert.equal(
      finding.details.unresolvedRows,
      2
    );

    assert.equal(
      finding.details.fixtureIdEvidenceAvailable,
      false
    );
  }
);

/*
 * KNOWN INCIDENT CLASS 11
 * System Health is diagnostic-only and cannot manufacture football truth.
 */
test(
  "System Health error remains diagnostic-only and never creates primary or downstream truth evidence",
  () => {
    const convergence =
      convergedDownstream();

    convergence.systemHealth = {
      observed:
        true,

      state:
        "OBSERVED_ERROR",

      severity:
        "error",

      alert:
        true,

      activeIssueCount:
        3,

      actionableIssueCount:
        2
    };

    const ledger =
      syntheticLedger({
        fixtures: [
          canonicalFixture({
            id:
              "incident_health_only"
          })
        ],

        convergence
      });

    const {
      audit,
      downstreamEvidence,
      primaryEvidence
    } =
      evaluate(
        ledger
      );

    assert.equal(
      audit.auditState,
      "CLEAR"
    );

    const health =
      audit.anomalies.find(
        row =>
          row.reasonCode ===
          "SYSTEM_HEALTH_ERROR_SIGNAL"
      );

    assert.ok(health);

    assert.equal(
      health.impact,
      "DIAGNOSTIC_ONLY"
    );

    assert.equal(
      downstreamEvidence.summary.findingCount,
      0
    );

    assert.equal(
      primaryEvidence.summary.findingCount,
      0
    );

    assert.equal(
      audit.authority.repairAuthorized,
      false
    );
  }
);

/*
 * Matrix-level authority invariant.
 */
test(
  "known-incident validation matrix never grants filesystem workflow or repair authority",
  () => {
    const ledger =
      syntheticLedger({
        fixtures: [
          canonicalFixture({
            id:
              "authority_probe"
          })
        ]
      });

    const {
      audit,
      downstreamEvidence,
      primaryEvidence
    } =
      evaluate(
        ledger
      );

    assert.equal(
      audit.authority.repairAuthorized,
      false
    );

    assert.equal(
      downstreamEvidence.authority.filesystemWriteAuthorized,
      false
    );

    assert.equal(
      downstreamEvidence.authority.repairAuthorized,
      false
    );

    assert.equal(
      downstreamEvidence.authority.workflowMutationAuthorized,
      false
    );

    assert.equal(
      primaryEvidence.authority.filesystemWriteAuthorized,
      false
    );

    assert.equal(
      primaryEvidence.authority.repairAuthorized,
      false
    );

    assert.equal(
      primaryEvidence.authority.workflowMutationAuthorized,
      false
    );
  }
);
