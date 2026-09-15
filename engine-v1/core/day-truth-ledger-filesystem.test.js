import test from "node:test";
import assert from "node:assert/strict";

import {
  readDayTruthLedgerInputs,
  readVerifiedFinalRowsForDay,
  readPublicationObservationForDay,
  readSystemHealthObservationForDay
} from "./day-truth-ledger-filesystem.js";

const EXPECTED = {
  "2026-09-09": {
    canonical: 77,
    verified: 76,
    publication: 77
  },

  "2026-09-10": {
    canonical: 88,
    verified: 86,
    publication: 88
  },

  "2026-09-11": {
    canonical: 189,
    verified: 185,
    publication: 189
  }
};

test(
  "filesystem adapter uses production day-fixture universe as canonical membership boundary",
  () => {
    for (
      const [
        dayKey,
        expected
      ] of Object.entries(
        EXPECTED
      )
    ) {
      const input =
        readDayTruthLedgerInputs(
          dayKey
        );

      assert.equal(
        input.canonicalRows.length,
        expected.canonical,
        dayKey
      );

      assert.equal(
        input.sourceSummary
          .canonicalLoader,
        "canonicalFixturesForDay",
        dayKey
      );

      assert.equal(
        input.provenance
          .canonical
          .authorityBoundary,
        "day-fixture-universe",
        dayKey
      );

      assert.equal(
        input.sourceSummary
          .canonicalAuthorityPresent,
        true,
        dayKey
      );
    }
  }
);

test(
  "verified-final filesystem evidence reproduces adjudicated row counts",
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
        readVerifiedFinalRowsForDay(
          dayKey
        );

      assert.equal(
        result.directoryExists,
        true,
        dayKey
      );

      assert.equal(
        result.rows.length,
        expected.verified,
        dayKey
      );
    }
  }
);

test(
  "publication and system health are optional downstream observations",
  () => {
    for (
      const [
        dayKey,
        expected
      ] of Object.entries(
        EXPECTED
      )
    ) {
      const publication =
        readPublicationObservationForDay(
          dayKey
        );

      const health =
        readSystemHealthObservationForDay(
          dayKey
        );

      assert.equal(
        publication.observed,
        true,
        dayKey
      );

      assert.equal(
        publication.fixtureRows,
        expected.publication,
        dayKey
      );

      assert.equal(
        new Set(
          publication.fixtureIds
        ).size,
        expected.publication,
        dayKey
      );

      assert.equal(
        health.observed,
        true,
        dayKey
      );

      assert.equal(
        typeof health.payload,
        "object",
        dayKey
      );
    }
  }
);
