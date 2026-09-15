import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  parseDayTruthLedgerCliArgs,
  buildDayTruthLedgerDay
} from "./build-day-truth-ledger-day.js";

const GENERATED_AT =
  "2026-09-15T12:00:00.000Z";

const EXPECTED = {
  "2026-09-09": {
    state: "OPEN",
    canonical: 77,
    played: 76,
    nonPlayed: 0,
    scheduled: 1,
    verified: 76,
    voidEligible: 0,
    fingerprint:
      "d818b6fff1f5bd2a9e4ab075a8700a3be2ce0ec7a8ca754c4a06e385d68306f0"
  },

  "2026-09-10": {
    state: "CLOSED",
    canonical: 88,
    played: 86,
    nonPlayed: 2,
    scheduled: 0,
    verified: 86,
    voidEligible: 2,
    fingerprint:
      "216a8b6e1347391f4ee5ebe97f7bd683a334d6ea3b4eab13a60a9af8dcecf8ae"
  },

  "2026-09-11": {
    state: "CLOSED",
    canonical: 189,
    played: 185,
    nonPlayed: 4,
    scheduled: 0,
    verified: 185,
    voidEligible: 4,
    fingerprint:
      "1ec406a60e4ddf2ef3f4bf6e988b7b42868f2b4c2ddbd354494f0a080611858f"
  }
};

test(
  "CLI defaults to dry-run and permits only explicit fixed-path write mode",
  () => {
    const dryRun =
      parseDayTruthLedgerCliArgs([
        "--date=2026-09-11"
      ]);

    assert.equal(
      dryRun.dayKey,
      "2026-09-11"
    );

    assert.equal(
      dryRun.dryRun,
      true
    );

    assert.equal(
      dryRun.write,
      false
    );

    const write =
      parseDayTruthLedgerCliArgs([
        "--date=2026-09-11",
        "--write"
      ]);

    assert.equal(
      write.dryRun,
      false
    );

    assert.equal(
      write.write,
      true
    );

    assert.throws(
      () =>
        parseDayTruthLedgerCliArgs([
          "--date=2026-09-11",
          "--write",
          "--dry-run"
        ]),
      /day_truth_ledger_conflicting_write_mode/
    );

    assert.throws(
      () =>
        parseDayTruthLedgerCliArgs([
          "--date=2026-09-11",
          "--output=x.json"
        ]),
      /day_truth_ledger_output_override_forbidden/
    );
  }
);

test(
  "real source-bound dry-run builder reproduces exact 09-11 truth contracts and fingerprints",
  () => {
    for (
      const [
        dayKey,
        expected
      ] of Object.entries(
        EXPECTED
      )
    ) {
      const result =
        buildDayTruthLedgerDay({
          dayKey,
          generatedAt:
            GENERATED_AT
        });

      const ledger =
        result.ledger;

      const summary =
        ledger.summary;

      assert.equal(
        result.ok,
        true,
        dayKey
      );

      assert.equal(
        result.dryRun,
        true,
        dayKey
      );

      assert.equal(
        result.writeAuthorized,
        false,
        dayKey
      );

      assert.equal(
        result.artifactWritten,
        false,
        dayKey
      );

      assert.equal(
        ledger.ledgerState,
        expected.state,
        dayKey
      );

      assert.equal(
        summary.canonicalRows,
        expected.canonical,
        dayKey
      );

      assert.equal(
        summary.playedTerminal,
        expected.played,
        dayKey
      );

      assert.equal(
        summary.nonPlayedTerminal,
        expected.nonPlayed,
        dayKey
      );

      assert.equal(
        summary.scheduled,
        expected.scheduled,
        dayKey
      );

      assert.equal(
        summary
          .acceptedVerifiedFinalArtifacts,
        expected.verified,
        dayKey
      );

      assert.equal(
        summary
          .convergedPlayedFinal,
        expected.played,
        dayKey
      );

      assert.equal(
        summary
          .convergedNonPlayedTerminal,
        expected.nonPlayed,
        dayKey
      );

      assert.equal(
        summary.historyEligible,
        expected.played,
        dayKey
      );

      assert.equal(
        summary
          .scoredSettlementEligible,
        expected.played,
        dayKey
      );

      assert.equal(
        summary
          .voidSettlementEligible,
        expected.voidEligible,
        dayKey
      );

      assert.equal(
        summary.pendingVerifiedFinal,
        0,
        dayKey
      );

      assert.equal(
        summary.unresolvedRows,
        0,
        dayKey
      );

      assert.equal(
        summary.conflictRows,
        0,
        dayKey
      );

      assert.equal(
        summary.orphanVerifiedFinals,
        0,
        dayKey
      );

      assert.equal(
        summary
          .duplicateVerifiedFinalFixtureIds,
        0,
        dayKey
      );

      assert.equal(
        ledger.truthFingerprint,
        expected.fingerprint,
        dayKey
      );

      assert.equal(
        ledger.downstream
          .publicationObserved,
        true,
        dayKey
      );

      assert.equal(
        ledger.downstream
          .systemHealthObserved,
        true,
        dayKey
      );

      assert.equal(
        ledger.downstream
          .historyObserved,
        true,
        dayKey
      );

      assert.equal(
        ledger.downstream
          .settlementObserved,
        false,
        dayKey
      );

      const convergence =
        ledger.downstream
          .convergence;

      assert.ok(
        convergence,
        dayKey
      );

      assert.equal(
        convergence
          .truthFingerprint,
        expected.fingerprint,
        dayKey
      );

      assert.equal(
        convergence
          .history
          .state,
        "PRESENT_CONVERGED",
        dayKey
      );

      assert.equal(
        convergence
          .history
          .persistedRows,
        expected.played,
        dayKey
      );

      assert.equal(
        convergence
          .settlement
          .state,
        "NOT_OBSERVED",
        dayKey
      );

      assert.equal(
        convergence
          .publication
          .state,
        "PRESENT_CONVERGED",
        dayKey
      );

      assert.equal(
        convergence
          .overallState,
        "PARTIALLY_OBSERVED",
        dayKey
      );

      assert.equal(
        convergence
          .authority
          .footballTruthMutable,
        false,
        dayKey
      );

      assert.equal(
        convergence
          .authority
          .downstreamMutationAuthorized,
        false,
        dayKey
      );

      assert.equal(
        convergence
          .authority
          .repairAuthorized,
        false,
        dayKey
      );

      assert.equal(
        convergence
          .authority
          .observationsAffectTruthFingerprint,
        false,
        dayKey
      );
    }
  }
);

test(
  "dry-run builder never creates production day-truth-ledger storage",
  () => {
    assert.equal(
      fs.existsSync(
        "data/day-truth-ledger"
      ),
      false
    );

    buildDayTruthLedgerDay({
      dayKey:
        "2026-09-11",
      generatedAt:
        GENERATED_AT
    });

    assert.equal(
      fs.existsSync(
        "data/day-truth-ledger"
      ),
      false
    );
  }
);
