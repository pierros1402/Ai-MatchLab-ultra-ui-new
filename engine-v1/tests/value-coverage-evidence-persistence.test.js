import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  normalizeValueCoverageEvidence,
  summarizeValueCoverageEvidence
} from "../core/value-coverage-evidence.js";

test("value coverage evidence preserves the denominator diagnostics", () => {
  const report = {
    dayKey: "2026-09-13",
    generatedAt: "2026-09-13T05:00:00.000Z",
    source: {
      inputSource: "canonical_fixtures",
      canonicalMatches: 120,
      snapshotFallbackMatches: 0,
      sourceMatches: 120,
      playable: 117
    },
    counts: {
      totalRows: 117,
      detailsFound: 115,
      intelligenceOk: 112,
      valueReturned: 88,
      valueNull: 24,
      valueFailed: 5,
      minimumRecentSampleNull: 19
    },
    breakdown: {
      nullByReason: { minimum_recent_sample: 19, other: 5 },
      nullByClass: { low_recent_sample: 19 },
      nullByLeague: { "eng.1": 2 },
      returnedByLeague: { "eng.1": 8 }
    },
    rows: [
      {
        matchId: "cid_test_home_away_20260913",
        detailsFound: true,
        intelligenceOk: true,
        valueReturned: false,
        nullReason: "minimum_recent_sample"
      }
    ]
  };

  const evidence = normalizeValueCoverageEvidence(
    report,
    "2026-09-13",
    "data/value/_coverage-reports/2026-09-13.json"
  );

  assert.equal(evidence.present, true);
  assert.equal(evidence.dayKey, "2026-09-13");
  assert.deepEqual(evidence.source, report.source);
  assert.deepEqual(evidence.counts, report.counts);
  assert.deepEqual(evidence.breakdown, report.breakdown);
  assert.deepEqual(evidence.rows, report.rows);
  assert.deepEqual(summarizeValueCoverageEvidence(evidence), {
    present: true,
    inputSource: "canonical_fixtures",
    canonicalMatches: 120,
    sourceMatches: 120,
    playable: 117,
    totalRows: 117,
    detailsFound: 115,
    intelligenceOk: 112,
    valueReturned: 88,
    valueNull: 24,
    valueFailed: 5,
    minimumRecentSampleNull: 19
  });
});

test("missing raw coverage evidence is explicit and non-fabricated", () => {
  const evidence = normalizeValueCoverageEvidence(
    null,
    "2026-09-13",
    "data/value/_coverage-reports/2026-09-13.json"
  );

  assert.deepEqual(evidence, {
    present: false,
    dayKey: "2026-09-13",
    sourcePath: "data/value/_coverage-reports/2026-09-13.json",
    generatedAt: null,
    source: null,
    counts: null,
    breakdown: null,
    rows: []
  });
});

test("league readiness report embeds value coverage evidence for ungated persistence", () => {
  const source = fs
    .readFileSync(
      new URL("../jobs/build-league-gap-report-day.js", import.meta.url),
      "utf8"
    )
    .replace(/\r\n/g, "\n");

  assert.match(
    source,
    /resolveDataPath\("value", "_coverage-reports", `\$\{date\}\.json`\)/u
  );
  assert.match(source, /valueCoverageEvidence/u);
  assert.match(source, /summarizeValueCoverageEvidence\(valueCoverageEvidence\)/u);
});
