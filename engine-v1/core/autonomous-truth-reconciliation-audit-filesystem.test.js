import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousTruthReconciliationEvidenceIndex,
  readAutonomousTruthReconciliationAuditDay
} from "./autonomous-truth-reconciliation-audit-filesystem.js";

function realDay(
  dayKey,
  generatedAt =
    "2026-09-15T21:00:00.000Z"
) {
  return readAutonomousTruthReconciliationAuditDay({
    dayKey,
    generatedAt,

    ledgerGeneratedAt:
      "2026-09-15T20:00:00.000Z"
  });
}

test(
  "source-bound adapter reproduces exact 09 September audit contract",
  () => {
    const result =
      realDay(
        "2026-09-09"
      );

    assert.equal(
      result.sourceBound,
      true
    );

    assert.equal(
      result.readOnly,
      true
    );

    assert.equal(
      result.ledger.ledgerState,
      "OPEN"
    );

    assert.equal(
      result.ledger.truthFingerprint,
      "d818b6fff1f5bd2a9e4ab075a8700a3be2ce0ec7a8ca754c4a06e385d68306f0"
    );

    assert.equal(
      result.ledger.fixtureCount,
      77
    );

    assert.equal(
      result.audit.auditState,
      "OBSERVATION_GAPS"
    );

    assert.equal(
      result.audit.auditFingerprint,
      "836de7e753bc40409b82997038ab6a53b9a18c4395b302d5489b1030306fec35"
    );

    assert.equal(
      result.audit.summary.blockingCount,
      0
    );

    assert.equal(
      result.audit.summary.reconciliationRequiredCount,
      0
    );

    assert.equal(
      result.audit.summary.observationGapCount,
      1
    );
  }
);

test(
  "source-bound adapter reproduces exact 10 and 11 September contracts",
  () => {
    const expected = {
      "2026-09-10": {
        fixtureCount:
          88,

        truthFingerprint:
          "216a8b6e1347391f4ee5ebe97f7bd683a334d6ea3b4eab13a60a9af8dcecf8ae",

        auditFingerprint:
          "fbde8834c25205b4c143836345d120cd96c09e16b12e4ac6c39ae99a154427d2"
      },

      "2026-09-11": {
        fixtureCount:
          189,

        truthFingerprint:
          "1ec406a60e4ddf2ef3f4bf6e988b7b42868f2b4c2ddbd354494f0a080611858f",

        auditFingerprint:
          "e3a8602b4425026b784a27d5093c9814f3071ed8dfae323d6599e4f7899e5164"
      }
    };

    for (
      const [
        dayKey,
        contract
      ] of Object.entries(
        expected
      )
    ) {
      const result =
        realDay(
          dayKey
        );

      assert.equal(
        result.ledger.ledgerState,
        "CLOSED",
        dayKey
      );

      assert.equal(
        result.ledger.fixtureCount,
        contract.fixtureCount,
        dayKey
      );

      assert.equal(
        result.ledger.truthFingerprint,
        contract.truthFingerprint,
        dayKey
      );

      assert.equal(
        result.audit.auditFingerprint,
        contract.auditFingerprint,
        dayKey
      );

      assert.equal(
        result.audit.auditState,
        "OBSERVATION_GAPS",
        dayKey
      );
    }
  }
);

test(
  "evidence index exposes only observed audit evidence and never invents fixture IDs",
  () => {
    const result =
      realDay(
        "2026-09-11"
      );

    assert.deepEqual(
      result.evidenceIndex
        .canonicalIds,
      []
    );

    assert.deepEqual(
      result.evidenceIndex
        .fixtureScopedCanonicalIds,
      []
    );

    assert.deepEqual(
      result.evidenceIndex
        .reasonCodes,
      [
        "SETTLEMENT_NOT_OBSERVED",
        "SYSTEM_HEALTH_WARNING_SIGNAL"
      ]
    );

    assert.deepEqual(
      result.evidenceIndex
        .reasonCodeCounts,
      [
        {
          reasonCode:
            "SETTLEMENT_NOT_OBSERVED",
          count:
            1
        },
        {
          reasonCode:
            "SYSTEM_HEALTH_WARNING_SIGNAL",
          count:
            1
        }
      ]
    );

    assert.ok(
      result.evidenceIndex
        .evidenceRefs
        .includes(
          "downstream/convergence/settlement/state"
        )
    );

    assert.ok(
      result.evidenceIndex
        .evidenceRefs
        .includes(
          "downstream/convergence/systemHealth/state"
        )
    );
  }
);

test(
  "evidence index remains deterministic regardless of anomaly input order",
  () => {
    const result =
      realDay(
        "2026-09-09"
      );

    const first =
      buildAutonomousTruthReconciliationEvidenceIndex(
        result.audit
      );

    const reversedAudit = {
      ...result.audit,

      anomalies:
        [
          ...result.audit
            .anomalies
        ].reverse()
    };

    const second =
      buildAutonomousTruthReconciliationEvidenceIndex(
        reversedAudit
      );

    assert.deepEqual(
      second,
      first
    );
  }
);

test(
  "source-bound adapter freezes all mutation and repair authority",
  () => {
    const result =
      realDay(
        "2026-09-10"
      );

    assert.deepEqual(
      result.authority,
      {
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
    );

    assert.equal(
      result.audit.authority
        .repairAuthorized,
      false
    );
  }
);

test(
  "generatedAt-only changes do not change audit or evidence identity",
  () => {
    const first =
      realDay(
        "2026-09-10",
        "2026-09-15T21:00:00.000Z"
      );

    const second =
      realDay(
        "2026-09-10",
        "2026-09-15T21:05:00.000Z"
      );

    assert.notEqual(
      first.audit.generatedAt,
      second.audit.generatedAt
    );

    assert.equal(
      first.audit.auditFingerprint,
      second.audit.auditFingerprint
    );

    assert.deepEqual(
      first.evidenceIndex,
      second.evidenceIndex
    );
  }
);
