import test from "node:test";
import assert from "node:assert/strict";

import {
  readHistoryObservationForDay,
  readSettlementObservationForDay
} from "./day-truth-ledger-downstream-filesystem.js";

const HISTORY_EXPECTED = {
  "2026-09-09":
    76,

  "2026-09-10":
    86,

  "2026-09-11":
    185
};

test(
  "real history observations preserve exact 09-11 verified truth rows",
  () => {
    for (
      const [
        dayKey,
        expectedRows
      ] of Object.entries(
        HISTORY_EXPECTED
      )
    ) {
      const observation =
        readHistoryObservationForDay(
          dayKey
        );

      assert.equal(
        observation.observed,
        true,
        dayKey
      );

      assert.equal(
        observation.sourceExists,
        true,
        dayKey
      );

      assert.equal(
        observation.dayEntryCount,
        1,
        dayKey
      );

      assert.equal(
        observation.rowCount,
        expectedRows,
        dayKey
      );

      assert.equal(
        new Set(
          observation.fixtureIds
        ).size,
        expectedRows,
        dayKey
      );

      assert.deepEqual(
        observation
          .duplicateFixtureIds,
        [],
        dayKey
      );

      assert.deepEqual(
        observation
          .invalidTruthContractFixtureIds,
        [],
        dayKey
      );

      assert.deepEqual(
        observation
          .structuralIssues,
        [],
        dayKey
      );
    }
  }
);

test(
  "09-11 settlement artifacts are explicitly not observed and never fabricated",
  () => {
    for (
      const dayKey of
      Object.keys(
        HISTORY_EXPECTED
      )
    ) {
      const observation =
        readSettlementObservationForDay(
          dayKey
        );

      assert.equal(
        observation.observed,
        false,
        dayKey
      );

      assert.equal(
        observation.bundleExists,
        false,
        dayKey
      );

      assert.equal(
        observation
          .aggregateSummaryExists,
        false,
        dayKey
      );

      assert.deepEqual(
        observation.rows,
        [],
        dayKey
      );

      assert.deepEqual(
        observation
          .structuralIssues,
        [],
        dayKey
      );
    }
  }
);
