import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousTruthReconciliationAudit
} from "./autonomous-truth-reconciliation-audit.js";

import {
  buildAutonomousTruthReconciliationPrimaryEvidence
} from "./autonomous-truth-reconciliation-primary-evidence.js";

import {
  buildDayTruthLedgerDay
} from "../jobs/build-day-truth-ledger-day.js";

const HASH =
  "d".repeat(64);

function fixture({
  id,
  status =
    "CONVERGED_PLAYED_FINAL"
}) {
  return {
    canonicalId:
      id,

    operationalState:
      status ===
        "PENDING_VERIFIED_FINAL"
        ? "PLAYED_TERMINAL"
        : "PLAYED_TERMINAL",

    verifiedFinal: {
      present:
        status !==
        "PENDING_VERIFIED_FINAL",

      accepted:
        status ===
        "CONVERGED_PLAYED_FINAL",

      reason:
        status ===
        "PENDING_VERIFIED_FINAL"
          ? "verified_final_missing"
          : "verified_final_result"
    },

    decision: {
      status,

      reason:
        status,

      repairAuthorized:
        false
    }
  };
}

function baseConvergence() {
  return {
    overallState:
      "CONVERGED",

    truthFingerprint:
      HASH,

    history: {
      observed:
        true,
      state:
        "PRESENT_CONVERGED"
    },

    settlement: {
      observed:
        true,
      state:
        "PRESENT_CONVERGED"
    },

    publication: {
      observed:
        true,
      state:
        "PRESENT_CONVERGED"
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

function ledger({
  fixtures = [
    fixture({
      id:
        "canonical-a"
    })
  ],

  anomalies = {},

  ledgerState =
    "CLOSED"
} = {}) {
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

    ledgerState,

    truthFingerprint:
      HASH,

    fixtures,

    anomalies: {
      conflictFixtureIds:
        [],

      pendingVerifiedFinalFixtureIds:
        [],

      duplicateVerifiedFinalFixtureIds:
        [],

      orphanVerifiedFinals:
        [],

      ...anomalies
    },

    downstream: {
      convergence:
        baseConvergence()
    },

    authorization: {
      repairAuthorized:
        false
    }
  };
}

function expand(input) {
  const audit =
    buildAutonomousTruthReconciliationAudit({
      ledger:
        input,

      generatedAt:
        "2026-09-15T21:00:00.000Z"
    });

  return buildAutonomousTruthReconciliationPrimaryEvidence({
    ledger:
      input,

    audit
  });
}

test(
  "schema freezes diagnosis-only and zero-repair authority",
  () => {
    const schema =
      JSON.parse(
        fs.readFileSync(
          new URL(
            "../contracts/autonomous-truth-reconciliation-primary-evidence.schema.v1.json",
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
  "pending verified-final evidence preserves canonical identity",
  () => {
    const input =
      ledger({
        ledgerState:
          "INCOMPLETE",

        fixtures: [
          fixture({
            id:
              "canonical-a",

            status:
              "PENDING_VERIFIED_FINAL"
          })
        ],

        anomalies: {
          pendingVerifiedFinalFixtureIds: [
            "canonical-a"
          ]
        }
      });

    const result =
      expand(
        input
      );

    assert.equal(
      result.findings.length,
      1
    );

    assert.equal(
      result.findings[0].reasonCode,
      "VERIFIED_FINAL_PENDING_CANONICAL_FIXTURE"
    );

    assert.equal(
      result.findings[0].canonicalId,
      "canonical-a"
    );

    assert.equal(
      result.findings[0].observedFixtureId,
      null
    );

    assert.equal(
      result.findings[0].impact,
      "RECONCILIATION_REQUIRED"
    );
  }
);

test(
  "truth conflict identity is canonical only when it belongs to day membership",
  () => {
    const result =
      expand(
        ledger({
          anomalies: {
            conflictFixtureIds: [
              "canonical-a",
              "outside-conflict"
            ]
          }
        })
      );

    const canonical =
      result.findings.find(
        row =>
          row.reasonCode ===
          "TRUTH_CONFLICT_CANONICAL_FIXTURE"
      );

    const observed =
      result.findings.find(
        row =>
          row.reasonCode ===
          "TRUTH_CONFLICT_OBSERVED_FIXTURE"
      );

    assert.equal(
      canonical.canonicalId,
      "canonical-a"
    );

    assert.equal(
      observed.canonicalId,
      null
    );

    assert.equal(
      observed.observedFixtureId,
      "outside-conflict"
    );
  }
);

test(
  "orphan verified-final ID is observed identity rather than canonical membership",
  () => {
    const result =
      expand(
        ledger({
          ledgerState:
            "CONFLICT",

          anomalies: {
            orphanVerifiedFinals: [
              {
                canonicalId:
                  "outside-final",

                reason:
                  "verified_final_missing_canonical_membership"
              },

              {
                canonicalId:
                  null,

                reason:
                  "verified_final_missing_canonical_id"
              }
            ]
          }
        })
      );

    const orphan =
      result.findings.find(
        row =>
          row.reasonCode ===
          "VERIFIED_FINAL_ORPHAN_OBSERVED_FIXTURE"
      );

    const missing =
      result.findings.find(
        row =>
          row.reasonCode ===
          "VERIFIED_FINAL_ORPHAN_MISSING_FIXTURE_ID"
      );

    assert.equal(
      orphan.canonicalId,
      null
    );

    assert.equal(
      orphan.observedFixtureId,
      "outside-final"
    );

    assert.equal(
      missing.canonicalId,
      null
    );

    assert.equal(
      missing.observedFixtureId,
      null
    );
  }
);

test(
  "orphan row pointing at canonical membership is classified as contradiction",
  () => {
    const result =
      expand(
        ledger({
          ledgerState:
            "CONFLICT",

          anomalies: {
            orphanVerifiedFinals: [
              {
                canonicalId:
                  "canonical-a",

                reason:
                  "unexpected_orphan_classification"
              }
            ]
          }
        })
      );

    assert.equal(
      result.findings[0].reasonCode,
      "VERIFIED_FINAL_ORPHAN_CANONICAL_CONTRADICTION"
    );

    assert.equal(
      result.findings[0].canonicalId,
      "canonical-a"
    );

    assert.equal(
      result.findings[0].observedFixtureId,
      null
    );
  }
);

test(
  "duplicate verified-final IDs retain canonical versus observed identity distinction",
  () => {
    const result =
      expand(
        ledger({
          ledgerState:
            "CONFLICT",

          anomalies: {
            duplicateVerifiedFinalFixtureIds: [
              "canonical-a",
              "outside-duplicate"
            ]
          }
        })
      );

    const canonical =
      result.findings.find(
        row =>
          row.reasonCode ===
          "VERIFIED_FINAL_DUPLICATE_CANONICAL_FIXTURE"
      );

    const observed =
      result.findings.find(
        row =>
          row.reasonCode ===
          "VERIFIED_FINAL_DUPLICATE_OBSERVED_FIXTURE"
      );

    assert.equal(
      canonical.canonicalId,
      "canonical-a"
    );

    assert.equal(
      observed.canonicalId,
      null
    );

    assert.equal(
      observed.observedFixtureId,
      "outside-duplicate"
    );
  }
);

test(
  "real 09-11 have zero primary evidence findings and retain certified audit fingerprints",
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
        expectedAuditFingerprint
      ] of Object.entries(
        expected
      )
    ) {
      const realLedger =
        buildDayTruthLedgerDay({
          dayKey,

          generatedAt:
            "2026-09-15T20:00:00.000Z"
        }).ledger;

      const audit =
        buildAutonomousTruthReconciliationAudit({
          ledger:
            realLedger,

          generatedAt:
            "2026-09-15T21:00:00.000Z"
        });

      assert.equal(
        audit.auditFingerprint,
        expectedAuditFingerprint,
        dayKey
      );

      const result =
        buildAutonomousTruthReconciliationPrimaryEvidence({
          ledger:
            realLedger,

          audit
        });

      assert.equal(
        result.summary.findingCount,
        0,
        dayKey
      );

      assert.equal(
        result.authority.repairAuthorized,
        false,
        dayKey
      );
    }
  }
);
