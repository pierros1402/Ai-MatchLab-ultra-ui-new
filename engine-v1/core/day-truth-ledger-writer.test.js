import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDayTruthLedgerDay
} from "../jobs/build-day-truth-ledger-day.js";

import {
  planDayTruthLedgerArtifactWrite,
  validateDayTruthLedgerArtifactForWrite
} from "./day-truth-ledger-writer.js";

function ledgerAt(
  generatedAt
) {
  return buildDayTruthLedgerDay({
    dayKey:
      "2026-09-11",

    generatedAt
  }).ledger;
}

test(
  "writer validation accepts the fully converged ledger contract without granting repair authority",
  () => {
    const ledger =
      ledgerAt(
        "2026-09-15T20:00:00.000Z"
      );

    assert.deepEqual(
      validateDayTruthLedgerArtifactForWrite(
        ledger
      ),
      {
        ok: true,
        dayKey:
          "2026-09-11"
      }
    );

    assert.equal(
      ledger.authorization
        .repairAuthorized,
      false
    );

    assert.equal(
      ledger.downstream
        .convergence
        .authority
        .repairAuthorized,
      false
    );
  }
);

test(
  "missing artifact requires a first write",
  () => {
    const ledger =
      ledgerAt(
        "2026-09-15T20:00:00.000Z"
      );

    const plan =
      planDayTruthLedgerArtifactWrite({
        ledger,
        existingText:
          null
      });

    assert.equal(
      plan.writeRequired,
      true
    );

    assert.equal(
      plan.unchanged,
      false
    );

    assert.equal(
      plan.reason,
      "artifact_missing"
    );
  }
);

test(
  "generatedAt alone never causes artifact churn",
  () => {
    const first =
      ledgerAt(
        "2026-09-15T20:00:00.000Z"
      );

    const second =
      ledgerAt(
        "2026-09-15T20:05:00.000Z"
      );

    assert.equal(
      first.truthFingerprint,
      second.truthFingerprint
    );

    const plan =
      planDayTruthLedgerArtifactWrite({
        ledger:
          second,

        existingText:
          JSON.stringify(
            first,
            null,
            2
          ) + "\n"
      });

    assert.equal(
      plan.writeRequired,
      false
    );

    assert.equal(
      plan.unchanged,
      true
    );

    assert.equal(
      plan.reason,
      "semantic_noop"
    );

    assert.equal(
      plan.artifact.generatedAt,
      first.generatedAt
    );
  }
);

test(
  "meaningful downstream convergence change requires a new artifact",
  () => {
    const first =
      ledgerAt(
        "2026-09-15T20:00:00.000Z"
      );

    const changed =
      structuredClone(
        first
      );

    changed.generatedAt =
      "2026-09-15T20:05:00.000Z";

    changed.downstream
      .convergence
      .systemHealth
      .state =
      "OBSERVED_SYNTHETIC_TEST_CHANGE";

    const plan =
      planDayTruthLedgerArtifactWrite({
        ledger:
          changed,

        existingText:
          JSON.stringify(
            first,
            null,
            2
          ) + "\n"
      });

    assert.equal(
      plan.writeRequired,
      true
    );

    assert.equal(
      plan.reason,
      "semantic_change"
    );
  }
);

test(
  "writer fails closed if any mutation or repair authority is enabled",
  () => {
    const ledger =
      ledgerAt(
        "2026-09-15T20:00:00.000Z"
      );

    const topLevel =
      structuredClone(
        ledger
      );

    topLevel.authorization
      .historyWriteAuthorized =
      true;

    assert.throws(
      () =>
        validateDayTruthLedgerArtifactForWrite(
          topLevel
        ),
      /day_truth_ledger_write_authorization_invalid/
    );

    const convergence =
      structuredClone(
        ledger
      );

    convergence.downstream
      .convergence
      .authority
      .repairAuthorized =
      true;

    assert.throws(
      () =>
        validateDayTruthLedgerArtifactForWrite(
          convergence
        ),
      /day_truth_ledger_write_convergence_authority_invalid/
    );
  }
);

test(
  "writer rejects a convergence artifact bound to another truth fingerprint",
  () => {
    const ledger =
      ledgerAt(
        "2026-09-15T20:00:00.000Z"
      );

    ledger.downstream
      .convergence
      .truthFingerprint =
      "0".repeat(64);

    assert.throws(
      () =>
        validateDayTruthLedgerArtifactForWrite(
          ledger
        ),
      /day_truth_ledger_write_convergence_fingerprint_mismatch/
    );
  }
);
