import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSummary
} from "./export-value-settlement-summary-file.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function read(name) {
  return fs
    .readFileSync(path.join(here, name), "utf8")
    .replace(/\r\n/g, "\n");
}

test("summary exports settled and unresolved rows", () => {
  const summary = buildSummary({
    ok: true,
    stage:
      "value_settlement_from_verified_final_results_dry_run",
    dayKey: "2099-01-01",
    planKey: "A2",
    inputs: {
      valuePath:
        "data/value-plans/2099-01-01/plan-a2.json",
      finalResultsDir:
        "data/final-results/2099-01-01"
    },
    summary: {
      valuePicks: 2,
      verifiedFinalResults: 1
    },
    rows: [
      {
        planKey: "A2",
        canonicalId: "cid_one",
        matchId: "cid_one",
        terminalStatus: "FT",
        ftHome: 2,
        ftAway: 1,
        ftScore: "2-1",
        market: "1X2",
        pick: "HOME",
        result: "WIN",
        finalResultProvenance:
          "data/final-results/2099-01-01/cid_one.json"
      },
      {
        planKey: "A2",
        canonicalId: "cid_two",
        matchId: "cid_two",
        terminalStatus: null,
        ftHome: null,
        ftAway: null,
        ftScore: null,
        market: "BTTS",
        pick: "YES",
        result: "UNRESOLVED",
        reason: "missing_verified_final_result",
        finalResultProvenance: null
      }
    ],
    guarantees: {
      requiresVerifiedFinalTruth: true,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false
    }
  });

  assert.equal(summary.ok, true);
  assert.equal(
    summary.schema,
    "ai-matchlab.value-settlement-summary.v2"
  );
  assert.equal(summary.planKey, "A2");
  assert.equal(summary.summary.totalRows, 2);
  assert.equal(summary.summary.settledRows, 1);
  assert.equal(summary.summary.unresolvedRows, 1);
  assert.equal(summary.rows[0].canonicalId, "cid_one");
  assert.equal(summary.rows[1].result, "UNRESOLVED");
});

test("builder accepts explicit plan key", () => {
  const source = read(
    "build-value-settlement-from-final-results-day.js"
  );

  for (const token of [
    "const planKey = clean(",
    "planKey: args.plan",
    "result: 'UNRESOLVED'",
    "rows: [...settledRows, ...unresolvedRows]"
  ]) {
    assert.ok(source.includes(token));
  }
});

test("all rows expose canonical result fields", () => {
  const source = read(
    "export-value-settlement-summary-file.js"
  );

  for (const token of [
    "planKey:",
    "canonicalId:",
    "terminalStatus:",
    "ftHome:",
    "ftAway:",
    "ftScore:",
    "finalResultProvenance:"
  ]) {
    assert.ok(source.includes(token));
  }
});

test("statistics are plan and unresolved aware", () => {
  const source = read(
    "build-value-settlement-statistics-range.js"
  );

  for (const token of [
    "ai-matchlab.value-settlement-statistics-range.v2",
    "const byPlan = {};",
    "byPlan[planKey]",
    "unresolvedRows: 0",
    "bucket.unresolvedRows += 1"
  ]) {
    assert.ok(source.includes(token));
  }
});

test("zero-pick plan summary remains valid", () => {
  const summary = buildSummary({
    ok: true,
    stage:
      "value_settlement_from_verified_final_results_dry_run",
    dayKey: "2099-01-02",
    planKey: "B2",
    inputs: {
      valuePath:
        "data/value-plans/2099-01-02/plan-b2.json",
      finalResultsDir:
        "data/final-results/2099-01-02"
    },
    summary: {
      valuePicks: 0,
      verifiedFinalResults: 0
    },
    rows: [],
    guarantees: {
      requiresVerifiedFinalTruth: true,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false
    }
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.planKey, "B2");
  assert.equal(summary.summary.totalRows, 0);
  assert.equal(summary.summary.settledRows, 0);
  assert.equal(summary.summary.unresolvedRows, 0);
});

test("builder accepts an explicit zero-pick artifact", async () => {
  const os = await import("node:os");
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-zero-pick-")
  );
  const valuePath = path.join(
    tempDir,
    "plan-b2-zero.json"
  );

  try {
    fs.writeFileSync(
      valuePath,
      JSON.stringify({
        ok: true,
        date: "2099-01-03",
        planKey: "B2",
        count: 0,
        picks: []
      }),
      "utf8"
    );

    const {
      buildSettlementReport
    } = await import(
      "./build-value-settlement-from-final-results-day.js"
    );

    const report = buildSettlementReport(
      "2099-01-03",
      {
        valuePath,
        planKey: "B2"
      }
    );

    assert.equal(report.ok, true);
    assert.equal(report.planKey, "B2");
    assert.equal(report.summary.valuePicks, 0);
    assert.equal(report.summary.settledRows, 0);
    assert.equal(report.summary.unresolvedRows, 0);
    assert.deepEqual(report.rows, []);
  } finally {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});
