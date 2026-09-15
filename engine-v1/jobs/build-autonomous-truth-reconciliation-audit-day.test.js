import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousTruthReconciliationAuditDay,
  parseAutonomousTruthReconciliationAuditCliArgs
} from "./build-autonomous-truth-reconciliation-audit-day.js";

test(
  "CLI is dry-run only and rejects write output and repair modes",
  () => {
    const args =
      parseAutonomousTruthReconciliationAuditCliArgs([
        "--date=2026-09-11",
        "--generated-at=2026-09-15T21:00:00.000Z",
        "--ledger-generated-at=2026-09-15T20:00:00.000Z",
        "--json"
      ]);

    assert.equal(
      args.dayKey,
      "2026-09-11"
    );

    assert.equal(
      args.json,
      true
    );

    for (
      const forbidden of [
        "--write",
        "--output=x.json",
        "--repair",
        "--repair=auto"
      ]
    ) {
      assert.throws(
        () =>
          parseAutonomousTruthReconciliationAuditCliArgs([
            "--date=2026-09-11",
            forbidden
          ]),
        /autonomous_truth_reconciliation_audit_mutation_not_authorized/
      );
    }
  }
);

test(
  "source-bound daily job reproduces exact 11 September audit",
  () => {
    const result =
      buildAutonomousTruthReconciliationAuditDay({
        dayKey:
          "2026-09-11",

        ledgerGeneratedAt:
          "2026-09-15T20:00:00.000Z",

        generatedAt:
          "2026-09-15T21:00:00.000Z"
      });

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.dryRun,
      true
    );

    assert.equal(
      result.sourceBound,
      true
    );

    assert.equal(
      result.writeAuthorized,
      false
    );

    assert.equal(
      result.artifactWritten,
      false
    );

    assert.equal(
      result.repairAuthorized,
      false
    );

    assert.equal(
      result.ledger.truthFingerprint,
      "1ec406a60e4ddf2ef3f4bf6e988b7b42868f2b4c2ddbd354494f0a080611858f"
    );

    assert.equal(
      result.audit.auditFingerprint,
      "e3a8602b4425026b784a27d5093c9814f3071ed8dfae323d6599e4f7899e5164"
    );

    assert.deepEqual(
      result.evidenceIndex.reasonCodes,
      [
        "SETTLEMENT_NOT_OBSERVED",
        "SYSTEM_HEALTH_WARNING_SIGNAL"
      ]
    );
  }
);

test(
  "disabling observations changes diagnosis only and never grants mutation authority",
  () => {
    const result =
      buildAutonomousTruthReconciliationAuditDay({
        dayKey:
          "2026-09-10",

        ledgerGeneratedAt:
          "2026-09-15T20:00:00.000Z",

        generatedAt:
          "2026-09-15T21:00:00.000Z",

        includePublication:
          false,

        includeSystemHealth:
          false
      });

    assert.equal(
      result.authority
        .repairAuthorized,
      false
    );

    assert.equal(
      result.authority
        .filesystemWriteAuthorized,
      false
    );

    assert.equal(
      result.writeAuthorized,
      false
    );

    assert.equal(
      result.artifactWritten,
      false
    );
  }
);
