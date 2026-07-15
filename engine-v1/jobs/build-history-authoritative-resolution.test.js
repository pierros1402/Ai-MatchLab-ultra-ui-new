import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  parseArgs,
  assertSafeOutputPath,
  runHistoryAuthoritativeResolutionBuild
} from "./build-history-authoritative-resolution.js";
import { getProjectRoot } from "../storage/data-root.js";

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function minimalFixture() {
  const history = {
    season: "2025-2026",
    days: [{
      dayKey: "2026-07-12",
      rows: [
        {
          id: "espn_1",
          dayKey: "2026-07-12",
          source: "espn",
          leagueSlug: "arg.2",
          homeTeam: "Home",
          awayTeam: "Away",
          scoreHome: 1,
          scoreAway: 1,
          status: "STATUS_FULL_TIME",
          kickoff: "2026-07-12T18:00:00.000Z"
        },
        {
          id: "flash_1",
          dayKey: "2026-07-12",
          source: "flashscore",
          leagueSlug: "arg.2",
          homeTeam: "Home",
          awayTeam: "Away",
          scoreHome: 2,
          scoreAway: 1,
          status: "STATUS_FULL_TIME",
          kickoff: "2026-07-12T18:00:00.000Z"
        }
      ]
    }]
  };
  const plan = {
    schema: "ai-matchlab.history-semantic-repair-plan.v1",
    generatedAt: "2026-07-15T00:00:00.000Z",
    readyToApply: false,
    actions: {
      currentHistoryDedup: [],
      currentHistoryDayNormalization: []
    },
    blocked: {
      scoreConflicts: [{
        blockId: "score-conflict-0001",
        blockType: "current_history_score_conflict",
        alternatives: [
          { rows: [{ id: "espn_1", operationalDay: "2026-07-12" }] },
          { rows: [{ id: "flash_1", operationalDay: "2026-07-12" }] }
        ]
      }],
      orientationConflicts: [],
      h2hDegradedKeys: []
    }
  };
  return { history, plan };
}

test("CLI parser accepts manifest hash and summary mode", () => {
  const args = parseArgs([
    "--manifest=/tmp/manifest.json",
    "--expected-manifest-sha256=abc",
    "--summary-only",
    "--minimum-operational-samples=40"
  ]);
  assert.equal(args.manifestPath, path.resolve("/tmp/manifest.json"));
  assert.equal(args.expectedManifestSha256, "abc");
  assert.equal(args.summaryOnly, true);
  assert.equal(args.minimumOperationalSamples, 40);
});

test("output guard rejects source reliability and history paths", () => {
  assert.throws(
    () => assertSafeOutputPath(path.join(getProjectRoot(), "data/source-reliability.json")),
    /unsafe_truth_layer_output_path/
  );
  assert.throws(
    () => assertSafeOutputPath(path.join(getProjectRoot(), "data/history/test.json")),
    /unsafe_truth_layer_output_path/
  );
});

test("builder writes additive bundle and preserves all input bytes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-phase7-"));
  const historyPath = path.join(dir, "history.json");
  const planPath = path.join(dir, "plan.json");
  const manifestPath = path.join(dir, "manifest.json");
  const reliabilityPath = path.join(dir, "reliability.json");
  const outputPath = path.join(dir, "output.json");
  const { history, plan } = minimalFixture();
  writeJson(historyPath, history);
  writeJson(planPath, plan);
  writeJson(reliabilityPath, { espn: { total: 1, agreements: 1, disagreements: 0 } });

  const foundationModule = fs.readFileSync(
    new URL("../core/history-evidence-foundation.js", import.meta.url),
    "utf8"
  );
  assert.ok(foundationModule.length > 0);

  // Build once to discover the generated fact id through the production modules.
  const { buildHistoryEvidenceFoundation } = await import(
    "../core/history-evidence-foundation.js"
  );
  const { reasonAboutHistoryEvidence } = await import(
    "../core/history-evidence-reasoner.js"
  );
  const foundation = buildHistoryEvidenceFoundation({
    historyPayload: history,
    repairPlan: plan,
    sourceReliability: {},
    includeFacts: true
  });
  const reasoning = reasonAboutHistoryEvidence({
    evidenceFoundation: foundation,
    includeFacts: true
  });
  const fact = reasoning.facts.find(row => row.evidenceStatus === "conflicted");
  writeJson(manifestPath, {
    schema: "ai-matchlab.authoritative-evidence-manifest.v1",
    policyVersion: "history-authoritative-resolution-policy-v1",
    resolutions: [{
      resolutionId: "score-resolution",
      resolutionType: "score",
      blockIds: ["score-conflict-0001"],
      targetFactIds: [fact.factId],
      candidate: { homeGoals: 1, awayGoals: 1 },
      evidenceItems: [
        {
          evidenceId: "a",
          publisher: "A",
          sourceFamily: "a",
          sourceType: "direct_scoreboard",
          url: "https://example.com/a",
          retrievedAt: "2026-07-15T00:00:00.000Z",
          observed: { homeGoals: 1, awayGoals: 1 }
        },
        {
          evidenceId: "b",
          publisher: "B",
          sourceFamily: "b",
          sourceType: "independent_results_portal",
          url: "https://example.com/b",
          retrievedAt: "2026-07-15T00:00:00.000Z",
          observed: { homeGoals: 1, awayGoals: 1 }
        }
      ]
    }],
    deferredBlocks: []
  });

  const before = [historyPath, planPath, manifestPath, reliabilityPath].map(sha256);
  const report = runHistoryAuthoritativeResolutionBuild({
    historyPath,
    planPath,
    manifestPath,
    sourceReliabilityPath: reliabilityPath,
    outputPath,
    summaryOnly: true
  });
  const after = [historyPath, planPath, manifestPath, reliabilityPath].map(sha256);

  assert.deepEqual(after, before);
  assert.equal(report.ok, true);
  assert.equal(report.resolution.summary.authoritativelySupportedResolutions, 1);
  assert.equal(report.guarantees.truthWrites, 0);
  assert.ok(fs.existsSync(outputPath));
});

test("manifest hash mismatch fails before output generation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-phase7-hash-"));
  const historyPath = path.join(dir, "history.json");
  const planPath = path.join(dir, "plan.json");
  const manifestPath = path.join(dir, "manifest.json");
  const outputPath = path.join(dir, "output.json");
  const { history, plan } = minimalFixture();
  writeJson(historyPath, history);
  writeJson(planPath, plan);
  writeJson(manifestPath, {
    schema: "ai-matchlab.authoritative-evidence-manifest.v1",
    resolutions: []
  });
  assert.throws(
    () => runHistoryAuthoritativeResolutionBuild({
      historyPath,
      planPath,
      manifestPath,
      outputPath,
      expectedManifestSha256: "deadbeef"
    }),
    /manifest_sha256_mismatch/
  );
  assert.equal(fs.existsSync(outputPath), false);
});
