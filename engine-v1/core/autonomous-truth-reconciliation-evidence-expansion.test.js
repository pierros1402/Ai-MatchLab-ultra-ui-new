import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousTruthReconciliationAudit
} from "./autonomous-truth-reconciliation-audit.js";

import {
  buildAutonomousTruthReconciliationEvidenceExpansion
} from "./autonomous-truth-reconciliation-evidence-expansion.js";

import {
  buildDayTruthLedgerDay
} from "../jobs/build-day-truth-ledger-day.js";

const HASH =
  "c".repeat(64);

function fixture(
  id
) {
  return {
    canonicalId:
      id,

    operationalState:
      "PLAYED_TERMINAL",

    verifiedFinal: {
      present:
        true,

      accepted:
        true,

      reason:
        "verified_final_result"
    },

    decision: {
      status:
        "CONVERGED_PLAYED_FINAL",

      reason:
        "played_terminal_verified_final",

      repairAuthorized:
        false
    }
  };
}

function convergence({
  history = {},
  settlement = {},
  publication = {}
} = {}) {
  return {
    overallState:
      "CONFLICT",

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
        [],

      ...history
    },

    settlement: {
      observed:
        true,

      state:
        "PRESENT_CONVERGED",

      orphanSettlementRows:
        [],

      incompatibleSettlementRows:
        [],

      structurallyInvalidRows:
        [],

      structuralIssues:
        [],

      unresolvedRows:
        0,

      ...settlement
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
        [],

      ...publication
    },

    systemHealth: {
      observed:
        true,

      state:
        "OBSERVED_INFO",

      severity:
        "info",

      alert:
        false
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
    }
  };
}

function makeLedger(
  convergenceValue,
  fixtures = [
    fixture(
      "canonical-a"
    ),
    fixture(
      "canonical-b"
    )
  ]
) {
  return {
    schema:
      "ai-matchlab.day-truth-ledger.v1",

    ledgerVersion:
      "1.0.0",

    dayKey:
      "2026-09-15",

    generatedAt:
      "2026-09-15T20:00:00.000Z",

    role:
      "derived_control_plane",

    ledgerState:
      "CLOSED",

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
        []
    },

    downstream: {
      convergence:
        convergenceValue
    },

    authorization: {
      repairAuthorized:
        false
    }
  };
}

function expand(
  ledger
) {
  const audit =
    buildAutonomousTruthReconciliationAudit({
      ledger,

      generatedAt:
        "2026-09-15T21:00:00.000Z"
    });

  return buildAutonomousTruthReconciliationEvidenceExpansion({
    ledger,
    audit
  });
}

test(
  "schema freezes diagnosis-only zero-repair authority",
  () => {
    const schema =
      JSON.parse(
        fs.readFileSync(
          new URL(
            "../contracts/autonomous-truth-reconciliation-evidence-expansion.schema.v1.json",
            import.meta.url
          ),
          "utf8"
        )
      );

    assert.equal(
      schema.properties
        .authority
        .properties
        .repairAuthorized
        .const,
      false
    );

    assert.equal(
      schema.properties
        .authority
        .properties
        .filesystemWriteAuthorized
        .const,
      false
    );
  }
);

test(
  "history evidence separates canonical missing from observed unexpected identity",
  () => {
    const ledger =
      makeLedger(
        convergence({
          history: {
            state:
              "PRESENT_CONFLICT",

            missingEligibleFixtureIds: [
              "canonical-b"
            ],

            unexpectedFixtureIds: [
              "wrong-id"
            ],

            duplicateFixtureIds: [
              "canonical-a"
            ],

            invalidTruthContractFixtureIds: [
              "canonical-b"
            ],

            structuralIssues: [
              "history_shape_error"
            ]
          }
        })
      );

    const result =
      expand(
        ledger
      );

    const missing =
      result.findings.find(
        row =>
          row.reasonCode ===
          "HISTORY_MISSING_ELIGIBLE_FIXTURE"
      );

    const unexpected =
      result.findings.find(
        row =>
          row.reasonCode ===
          "HISTORY_UNEXPECTED_FIXTURE"
      );

    assert.equal(
      missing.canonicalId,
      "canonical-b"
    );

    assert.equal(
      missing.observedFixtureId,
      null
    );

    assert.equal(
      unexpected.canonicalId,
      null
    );

    assert.equal(
      unexpected.observedFixtureId,
      "wrong-id"
    );

    assert.equal(
      result.summary.blockingCount,
      4
    );

    assert.equal(
      result.summary.reconciliationRequiredCount,
      1
    );
  }
);

test(
  "publication preserves missing canonical extra observed and duplicate canonical identity",
  () => {
    const ledger =
      makeLedger(
        convergence({
          publication: {
            state:
              "PRESENT_CONFLICT",

            missingCanonicalFixtureIds: [
              "canonical-b"
            ],

            extraPublishedFixtureIds: [
              "extra"
            ],

            duplicatePublishedFixtureIds: [
              "canonical-a"
            ]
          }
        })
      );

    const result =
      expand(
        ledger
      );

    const missing =
      result.findings.find(
        row =>
          row.reasonCode ===
          "PUBLICATION_MISSING_CANONICAL_FIXTURE"
      );

    const extra =
      result.findings.find(
        row =>
          row.reasonCode ===
          "PUBLICATION_EXTRA_FIXTURE"
      );

    const duplicate =
      result.findings.find(
        row =>
          row.reasonCode ===
          "PUBLICATION_DUPLICATE_FIXTURE"
      );

    assert.equal(
      missing.canonicalId,
      "canonical-b"
    );

    assert.equal(
      extra.canonicalId,
      null
    );

    assert.equal(
      extra.observedFixtureId,
      "extra"
    );

    assert.equal(
      duplicate.canonicalId,
      "canonical-a"
    );

    assert.equal(
      duplicate.observedFixtureId,
      null
    );
  }
);

test(
  "settlement conflict rows preserve exact semantic identity classes",
  () => {
    const ledger =
      makeLedger(
        convergence({
          settlement: {
            state:
              "PRESENT_CONFLICT",

            orphanSettlementRows: [
              {
                canonicalId:
                  "orphan-1",

                result:
                  "WIN",

                reason:
                  "settlement_row_missing_canonical_membership"
              }
            ],

            incompatibleSettlementRows: [
              {
                canonicalId:
                  "canonical-a",

                result:
                  "VOID",

                reason:
                  "settlement_result_not_authorized"
              }
            ],

            structurallyInvalidRows: [
              {
                canonicalId:
                  "canonical-b",

                result:
                  "MAYBE",

                reason:
                  "settlement_row_result_invalid"
              },

              {
                canonicalId:
                  null,

                result:
                  "LOSS",

                reason:
                  "settlement_row_missing_fixture_id"
              }
            ],

            structuralIssues: [
              "settlement_shape_error"
            ]
          }
        })
      );

    const result =
      expand(
        ledger
      );

    const orphan =
      result.findings.find(
        row =>
          row.reasonCode ===
          "SETTLEMENT_ORPHAN_FIXTURE"
      );

    const incompatible =
      result.findings.find(
        row =>
          row.reasonCode ===
          "SETTLEMENT_INCOMPATIBLE_TRUTH"
      );

    const invalid =
      result.findings.filter(
        row =>
          row.reasonCode ===
          "SETTLEMENT_STRUCTURALLY_INVALID_ROW"
      );

    assert.equal(
      orphan.canonicalId,
      null
    );

    assert.equal(
      orphan.observedFixtureId,
      "orphan-1"
    );

    assert.equal(
      incompatible.canonicalId,
      "canonical-a"
    );

    assert.equal(
      incompatible.observedFixtureId,
      null
    );

    assert.equal(
      invalid.length,
      2
    );

    assert.ok(
      invalid.some(
        row =>
          row.canonicalId ===
          "canonical-b"
      )
    );

    assert.ok(
      invalid.some(
        row =>
          row.canonicalId ===
            null &&
          row.observedFixtureId ===
            null
      )
    );
  }
);

test(
  "unresolved settlement remains explicitly count-only without fabricated fixture identity",
  () => {
    const ledger =
      makeLedger(
        convergence({
          settlement: {
            state:
              "PRESENT_UNRESOLVED",

            unresolvedRows:
              3
          }
        })
      );

    const result =
      expand(
        ledger
      );

    const row =
      result.findings.find(
        item =>
          item.reasonCode ===
          "SETTLEMENT_UNRESOLVED_COUNT_ONLY"
      );

    assert.ok(row);

    assert.equal(
      row.canonicalId,
      null
    );

    assert.equal(
      row.observedFixtureId,
      null
    );

    assert.equal(
      row.details.unresolvedRows,
      3
    );

    assert.equal(
      row.details.fixtureIdEvidenceAvailable,
      false
    );

    assert.equal(
      result.summary.countOnlyFindingCount,
      1
    );
  }
);

test(
  "evidence fingerprint is deterministic under input array ordering",
  () => {
    const firstLedger =
      makeLedger(
        convergence({
          publication: {
            state:
              "PRESENT_CONFLICT",

            extraPublishedFixtureIds: [
              "z-extra",
              "a-extra"
            ]
          }
        })
      );

    const secondLedger =
      makeLedger(
        convergence({
          publication: {
            state:
              "PRESENT_CONFLICT",

            extraPublishedFixtureIds: [
              "a-extra",
              "z-extra"
            ]
          }
        })
      );

    const first =
      expand(
        firstLedger
      );

    const second =
      expand(
        secondLedger
      );

    assert.equal(
      first.evidenceFingerprint,
      second.evidenceFingerprint
    );

    assert.deepEqual(
      first.findings,
      second.findings
    );
  }
);

test(
  "real 09-11 produce zero exact identity findings and preserve certified audit fingerprints",
  () => {
    const expected = {
      "2026-09-09":
        "836de7e753bc40409b82997038ab6a53b9a18c4395b302d5489b1030306fec35",

      "2026-09-10":
        "fbde8834c25205b4c143836345d120cd96c09e16b12e4ac6c39ae99a154427d2",

      "2026-09-11":
        "e3a8602b4425026b784a27d5093c9814f3071ed8dfae323d6599e4f7899e5164"
    };

    for (
      const [
        dayKey,
        auditFingerprint
      ] of Object.entries(
        expected
      )
    ) {
      const ledger =
        buildDayTruthLedgerDay({
          dayKey,

          generatedAt:
            "2026-09-15T20:00:00.000Z"
        }).ledger;

      const audit =
        buildAutonomousTruthReconciliationAudit({
          ledger,

          generatedAt:
            "2026-09-15T21:00:00.000Z"
        });

      assert.equal(
        audit.auditFingerprint,
        auditFingerprint,
        dayKey
      );

      const evidence =
        buildAutonomousTruthReconciliationEvidenceExpansion({
          ledger,
          audit
        });

      assert.equal(
        evidence.summary.findingCount,
        0,
        dayKey
      );

      assert.equal(
        evidence.summary.canonicalIdentityCount,
        0,
        dayKey
      );

      assert.equal(
        evidence.summary.observedIdentityCount,
        0,
        dayKey
      );

      assert.equal(
        evidence.authority.repairAuthorized,
        false,
        dayKey
      );
    }
  }
);
