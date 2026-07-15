import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  assertSafeOutputPath,
  parseArgs,
  runHistoryEvidenceBuild
} from "./build-history-evidence-foundation.js";

function digest(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

test("CLI parser keeps read-only defaults and accepts explicit hashes", () => {
  const parsed = parseArgs([
    "--history=/tmp/history.json",
    "--plan=/tmp/plan.json",
    "--output=/tmp/evidence.json",
    "--expected-history-sha256=ABC",
    "--expected-plan-sha256=DEF",
    "--summary-only",
    "--max-examples=7"
  ]);

  assert.equal(parsed.historyPath, path.resolve("/tmp/history.json"));
  assert.equal(parsed.planPath, path.resolve("/tmp/plan.json"));
  assert.equal(parsed.outputPath, path.resolve("/tmp/evidence.json"));
  assert.equal(parsed.expectedHistorySha256, "abc");
  assert.equal(parsed.expectedPlanSha256, "def");
  assert.equal(parsed.summaryOnly, true);
  assert.equal(parsed.maxExamples, 7);
});

test("output guard rejects every truth-layer destination", () => {
  assert.throws(
    () => assertSafeOutputPath(path.join(process.cwd(), "data/history/x.json")),
    /unsafe_truth_layer_output_path/
  );
  assert.throws(
    () => assertSafeOutputPath(path.join(process.cwd(), "data/h2h/x.json")),
    /unsafe_truth_layer_output_path/
  );
});

test("builder writes only additive artifact and leaves sources byte-identical", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-evidence-foundation-"));
  const historyPath = path.join(dir, "history.json");
  const planPath = path.join(dir, "plan.json");
  const reliabilityPath = path.join(dir, "source-reliability.json");
  const outputPath = path.join(dir, "evidence.json");

  writeJson(historyPath, {
    season: "2025-2026",
    days: [{
      dayKey: "2026-07-12",
      rows: [{
        id: "espn_1",
        dayKey: "2026-07-12",
        kickoff: "2026-07-12T18:00Z",
        leagueSlug: "arg.2",
        homeTeam: "Gimnasia Jujuy",
        awayTeam: "Chacarita Juniors",
        scoreHome: 1,
        scoreAway: 1,
        status: "STATUS_FULL_TIME",
        source: "espn"
      }]
    }]
  });
  writeJson(planPath, {
    actions: { currentHistoryDedup: [], currentHistoryDayNormalization: [] },
    blocked: {
      scoreConflicts: [],
      orientationConflicts: [],
      h2hDegradedKeys: []
    }
  });
  writeJson(reliabilityPath, { espn: { total: 10, agreements: 9 } });

  const beforeHistory = digest(historyPath);
  const beforePlan = digest(planPath);

  const report = runHistoryEvidenceBuild({
    historyPath,
    planPath,
    sourceReliabilityPath: reliabilityPath,
    outputPath,
    expectedHistorySha256: beforeHistory,
    expectedPlanSha256: beforePlan,
    summaryOnly: true,
    maxExamples: 3
  });

  assert.equal(report.ok, true);
  assert.equal(report.output.summaryOnly, true);
  assert.equal("facts" in report, false);
  assert.equal(report.summary.currentHistoryRows, 1);
  assert.equal(report.sourceContract.truthWrites, 0);
  assert.equal(digest(historyPath), beforeHistory);
  assert.equal(digest(planPath), beforePlan);
  assert.equal(fs.existsSync(outputPath), true);
});

test("hash mismatch fails closed before artifact generation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-evidence-hash-"));
  const historyPath = path.join(dir, "history.json");
  const planPath = path.join(dir, "plan.json");
  const outputPath = path.join(dir, "evidence.json");
  writeJson(historyPath, { season: "x", days: [] });
  writeJson(planPath, {
    actions: { currentHistoryDedup: [], currentHistoryDayNormalization: [] },
    blocked: {
      scoreConflicts: [], orientationConflicts: [], h2hDegradedKeys: []
    }
  });

  assert.throws(() => runHistoryEvidenceBuild({
    historyPath,
    planPath,
    outputPath,
    expectedHistorySha256: "0".repeat(64),
    summaryOnly: true
  }), /history_sha256_mismatch/);
  assert.equal(fs.existsSync(outputPath), false);
});
