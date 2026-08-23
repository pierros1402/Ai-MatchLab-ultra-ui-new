import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildValueComparisonCumulative
} from "./build-value-comparison-cumulative.js";

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );

function tempDir() {
  return fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "aiml-historical-exclusion-"
    )
  );
}

function summarize(rows) {
  const settled =
    rows.filter(
      row =>
        row.result === "WIN" ||
        row.result === "LOSS"
    );

  const wins =
    rows.filter(
      row => row.result === "WIN"
    ).length;

  const losses =
    rows.filter(
      row => row.result === "LOSS"
    ).length;

  const oddsRows =
    settled.filter(
      row =>
        Number.isFinite(
          row.oddsDecimal
        ) &&
        row.oddsDecimal > 1
    );

  const stake =
    oddsRows.length;

  const totalReturn =
    oddsRows.reduce(
      (sum, row) =>
        sum +
        (
          row.result === "WIN"
            ? row.oddsDecimal
            : 0
        ),
      0
    );

  const profit =
    stake
      ? totalReturn - stake
      : null;

  return {
    picks:
      rows.length,

    uniqueMatches:
      new Set(
        rows
          .map(row => row.matchId)
          .filter(Boolean)
      ).size,

    settled:
      settled.length,

    wins,
    losses,

    voids:
      rows.filter(
        row => row.result === "VOID"
      ).length,

    unresolved:
      rows.filter(
        row =>
          row.result ===
          "UNRESOLVED"
      ).length,

    unsupported:
      rows.filter(
        row =>
          row.result ===
          "UNSUPPORTED"
      ).length,

    hitRate:
      settled.length
        ? Number(
            (
              wins /
              settled.length
            ).toFixed(4)
          )
        : null,

    oddsAvailable:
      oddsRows.length,

    averageOdds:
      oddsRows.length
        ? Number(
            (
              oddsRows.reduce(
                (sum, row) =>
                  sum +
                  row.oddsDecimal,
                0
              ) /
              oddsRows.length
            ).toFixed(4)
          )
        : null,

    totalStake:
      stake || null,

    totalReturn:
      stake
        ? Number(
            totalReturn.toFixed(4)
          )
        : null,

    profit:
      profit === null
        ? null
        : Number(
            profit.toFixed(4)
          ),

    roi:
      profit === null
        ? null
        : Number(
            (
              profit /
              stake
            ).toFixed(4)
          )
  };
}

function pickRow(
  id,
  result,
  odds = 2
) {
  return {
    matchId: id,
    canonicalMatchId: id,
    market:
      "Over / Under 2.5",
    pick:
      "Over 2.5",
    result,
    oddsDecimal:
      odds
  };
}

function fingerprint(
  day,
  plan,
  row
) {
  return [
    day,
    plan,
    row.canonicalMatchId ||
      row.matchId,
    row.market,
    row.pick
  ].join("|");
}

function writeComparison(
  dir,
  day,
  A,
  A2,
  B
) {
  const payload = {
    ok: true,
    date: day,

    sourceContract: {
      planAImmutable: true
    },

    plans: {
      A: {
        id: "plan-a",
        label:
          "Plan A",
        immutable: true,
        summary:
          summarize(A),
        picks: A
      },

      A2: {
        id: "plan-a2",
        label:
          "Plan A2",
        summary:
          summarize(A2),
        picks: A2
      },

      B: {
        id: "plan-b",
        label:
          "Plan B",
        summary:
          summarize(B),
        picks: B
      }
    }
  };

  const file =
    path.join(
      dir,
      `${day}.json`
    );

  fs.writeFileSync(
    file,
    JSON.stringify(
      payload,
      null,
      2
    ) + "\n",
    "utf8"
  );

  return file;
}

function exclusionEntry(
  id,
  day,
  plan,
  index,
  row
) {
  return {
    exclusionId: id,
    day,
    plan,

    source: {
      file:
        `data/value-plans/${day}/${plan === "A" ? "plan-a" : "plan-a2"}.json`,

      pickIndex: index,
      matchId:
        row.matchId,

      fingerprint:
        fingerprint(
          day,
          plan,
          row
        )
    },

    comparison: {
      file:
        `data/value-comparison/${day}.json`,

      pickIndex: index,

      matchId:
        row.matchId,

      canonicalMatchId:
        row.canonicalMatchId,

      identityKey:
        row.canonicalMatchId,

      market:
        row.market,

      pick:
        row.pick
    },

    eligibilityEvidence: {
      source:
        "current_season_raw",

      homeSample: 2,
      awaySample: 4,

      formUsed: true,

      minimumRequired: 3
    },

    exclusion: {
      reason:
        "minimum_recent_sample",

      statisticalOnly: true,

      frozenObservationMutated:
        false
    }
  };
}

function writeLedger(
  dir,
  entries
) {
  const affectedDays =
    [
      ...new Set(
        entries.map(
          row => row.day
        )
      )
    ].sort();

  const payload = {
    ok: true,

    schema:
      "ai-matchlab.historical-value-statistics-exclusions.v1",

    status: "active",

    contract: {
      minimumRequiredRecentMatches:
        3,

      affectedPlans:
        ["A", "A2"],

      unaffectedPlans:
        ["B", "B2"],

      applicationLayer:
        "derived_statistics_only",

      frozenObservationArtifactsImmutable:
        true,

      retrospectiveValueRebuild:
        false,

      exactIdentityOnly:
        true,

      fuzzyMatching:
        false,

      teamNameMatching:
        false,

      kickoffHeuristic:
        false,

      exclusionReason:
        "minimum_recent_sample"
    },

    provenance: {
      correctedStatisticalPopulation:
        999
    },

    counts: {
      entries:
        entries.length,

      planA:
        entries.filter(
          row => row.plan === "A"
        ).length,

      planA2:
        entries.filter(
          row => row.plan === "A2"
        ).length,

      planB: 0,
      planB2: 0,

      affectedDays:
        affectedDays.length,

      affectedMatches:
        entries.length
    },

    affectedDays,
    entries
  };

  const file =
    path.join(
      dir,
      "historical-exclusions.json"
    );

  fs.writeFileSync(
    file,
    JSON.stringify(
      payload,
      null,
      2
    ) + "\n",
    "utf8"
  );

  return file;
}

test(
  "cumulative removes exact historical Plan A rows while validating A2 and preserving B",
  () => {
    const dir =
      tempDir();

    const day =
      "2026-08-01";

    const badA =
      pickRow(
        "cid-test-a-bad",
        "WIN"
      );

    const goodA =
      pickRow(
        "cid-test-a-good",
        "LOSS"
      );

    const badA2 =
      pickRow(
        "cid-test-a2-bad",
        "WIN"
      );

    const goodA2 =
      pickRow(
        "cid-test-a2-good",
        "WIN"
      );

    const B =
      [
        pickRow(
          "cid-test-b",
          "WIN"
        )
      ];

    const comparisonFile =
      writeComparison(
        dir,
        day,
        [badA, goodA],
        [badA2, goodA2],
        B
      );

    const before =
      fs.readFileSync(
        comparisonFile,
        "utf8"
      );

    const ledger =
      writeLedger(
        dir,
        [
          exclusionEntry(
            "hvx-test-a",
            day,
            "A",
            0,
            badA
          ),

          exclusionEntry(
            "hvx-test-a2",
            day,
            "A2",
            0,
            badA2
          )
        ]
      );

    const result =
      buildValueComparisonCumulative({
        dir,
        write: false,

        requireImmutablePlanA:
          false,

        requireHistoricalExclusions:
          true,

        historicalExclusionsFile:
          ledger
      });

    assert.equal(
      result.payload
        .plans.A.totals.picks,
      1
    );

    assert.equal(
      result.payload
        .plans.A.totals.wins,
      0
    );

    assert.equal(
      result.payload
        .plans.A.totals.losses,
      1
    );

    const expectedB =
      summarize(B);

    for (const field of [
      "picks",
      "uniqueMatches",
      "settled",
      "wins",
      "losses",
      "voids",
      "unresolved",
      "unsupported",
      "oddsAvailable",
      "totalStake",
      "totalReturn",
      "profit",
      "hitRate",
      "roi"
    ]) {
      assert.equal(
        result.payload
          .plans.B.totals[field],
        expectedB[field],
        `Plan B cumulative field changed: ${field}`
      );
    }

    /*
     * averageOdds is intentionally not part of the cumulative
     * totals contract because it is not an additive day-total field.
     */
    assert.equal(
      Object.hasOwn(
        result.payload
          .plans.B.totals,
        "averageOdds"
      ),
      false
    );

    const correction =
      result.payload
        .historicalStatisticsCorrection;

    assert.equal(
      correction
        .resolvedLedgerEntries,
      2
    );

    assert.equal(
      correction
        .validatedPlanAExclusions,
      1
    );

    assert.equal(
      correction
        .validatedPlanA2Exclusions,
      1
    );

    assert.equal(
      correction
        .appliedPlanAExclusions,
      1
    );

    assert.deepEqual(
      correction
        .statisticsCorrectedDays,
      [day]
    );

    assert.equal(
      fs.readFileSync(
        comparisonFile,
        "utf8"
      ),
      before
    );
  }
);

test(
  "cumulative fails closed when persisted comparison identity no longer matches ledger",
  () => {
    const dir =
      tempDir();

    const day =
      "2026-08-01";

    const bad =
      pickRow(
        "cid-drift",
        "WIN"
      );

    writeComparison(
      dir,
      day,
      [bad],
      [],
      []
    );

    const entry =
      exclusionEntry(
        "hvx-drift",
        day,
        "A",
        0,
        bad
      );

    entry.source.fingerprint =
      "tampered-fingerprint";

    const ledger =
      writeLedger(
        dir,
        [entry]
      );

    assert.throws(
      () =>
        buildValueComparisonCumulative({
          dir,
          write: false,

          requireImmutablePlanA:
            false,

          requireHistoricalExclusions:
            true,

          historicalExclusionsFile:
            ledger
        }),

      /historical_exclusion_fingerprint_mismatch/u
    );
  }
);

test(
  "cumulative fails closed when required historical exclusion ledger is absent",
  () => {
    const dir =
      tempDir();

    assert.throws(
      () =>
        buildValueComparisonCumulative({
          dir,
          write: false,

          requireImmutablePlanA:
            false,

          requireHistoricalExclusions:
            true,

          historicalExclusionsFile:
            path.join(
              dir,
              "missing-ledger.json"
            )
        }),

      /historical_exclusion_ledger_missing/u
    );
  }
);

test(
  "production historical exclusion ledger remains exact approved 58-row evidence",
  () => {
    const file =
      path.join(
        ROOT,
        "data",
        "value-comparison",
        "historical-exclusions.json"
      );

    const raw =
      fs.readFileSync(
        file,
        "utf8"
      );

    /*
     * Git checkout may be CRLF on Windows.
     * Pin canonical LF content so test is cross-platform.
     */
    const normalized =
      raw.replaceAll(
        "\r\n",
        "\n"
      );

    const sha =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          normalized,
          "utf8"
        )
        .digest("hex");

    assert.equal(
      sha,
      "734caf392cc0704e843e34f5962fcb75b247a6742c62f00f8937d9fa73f4a517"
    );

    const ledger =
      JSON.parse(raw);

    assert.equal(
      ledger.ok,
      true
    );

    assert.equal(
      ledger.schema,
      "ai-matchlab.historical-value-statistics-exclusions.v1"
    );

    assert.equal(
      ledger.entries.length,
      58
    );

    assert.equal(
      ledger.counts.planA,
      32
    );

    assert.equal(
      ledger.counts.planA2,
      26
    );

    assert.equal(
      ledger.counts.planB,
      0
    );

    assert.equal(
      ledger.counts.planB2,
      0
    );

    assert.equal(
      ledger.affectedDays.length,
      8
    );

    assert.equal(
      ledger.counts.affectedMatches,
      32
    );

    assert.equal(
      ledger.provenance
        .sourceComparisonParity,
      "459_of_459"
    );

    assert.equal(
      ledger.provenance
        .invalidExclusionsMatched,
      "58_of_58"
    );

    assert.equal(
      ledger.provenance
        .correctedStatisticalPopulation,
      401
    );

    const ids =
      new Set();

    for (
      const entry of
      ledger.entries
    ) {
      assert.equal(
        ["A", "A2"]
          .includes(entry.plan),
        true
      );

      assert.equal(
        entry.exclusion
          .statisticalOnly,
        true
      );

      assert.equal(
        entry.exclusion
          .frozenObservationMutated,
        false
      );

      assert.equal(
        entry
          .eligibilityEvidence
          .minimumRequired,
        3
      );

      assert.equal(
        entry
            .eligibilityEvidence
            .homeSample < 3 ||
        entry
            .eligibilityEvidence
            .awaySample < 3,
        true
      );

      assert.equal(
        ids.has(
          entry.exclusionId
        ),
        false
      );

      ids.add(
        entry.exclusionId
      );
    }

    assert.equal(
      ids.size,
      58
    );
  }
);
