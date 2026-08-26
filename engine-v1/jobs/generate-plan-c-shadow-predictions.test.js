import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generatePlanCShadowPredictions } from "./generate-plan-c-shadow-predictions.js";
import { planCPredictionSignature } from "../value/plan-c-shadow-export.js";

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-plan-c-generate-"));
  const predictionRoot = path.join(root, "bundle");
  const truthRoot = path.join(root, "truth");
  const teamFormFile = path.join(root, "team-form.json");
  fs.mkdirSync(path.join(predictionRoot, "predictions"), { recursive: true });
  writeJson(path.join(predictionRoot, "PREDICTION_INDEX.json"), {
    schema: "ai-matchlab.plan-c-prediction-index.v1",
    accounting: { total: 0, planCPickTrue: 0, planCPickFalse: 0, balanced: true },
    predictions: []
  });
  writeJson(path.join(predictionRoot, "MANIFEST.json"), {
    sourcePackage: "test-seed",
    sourceManifestSha256: "1".repeat(64),
    sourceAuditSha256: "2".repeat(64)
  });
  const registry = [];
  for (let index = 0; index < 48; index += 1) {
    const home = index === 0;
    const away = index === 1;
    registry.push({
      projectId: `pt_${String(index).padStart(4, "0")}`,
      projectName: home ? "Home FC" : away ? "Away FC" : `Unused ${index}`,
      projectLeague: "test.1",
      projectFederation: "TST",
      clubeloSlug: home ? "HomeFC" : away ? "AwayFC" : `Unused${index}`,
      clubeloName: home ? "Home FC" : away ? "Away FC" : `Unused ${index}`,
      clubeloElo: home ? 1800 : away ? 1600 : 1500 + index,
      clubeloRank: index + 1,
      clubeloFederation: "TST",
      federationAgreement: true,
      matchType: "exact_name",
      matchMethod: "test_exact"
    });
  }
  writeJson(path.join(predictionRoot, "IDENTITY_REGISTRY.json"), {
    schema: "ai-matchlab.identity-registry.v1.1",
    source: { snapshotRetrievedAt: "2026-08-24T08:00:00.000Z", snapshotAsOf: "2026-08-23" },
    accounting: { total: 48, exactName: 48, documentedAlias: 0, balanced: true },
    registry
  });
  writeJson(path.join(truthRoot, "2026-08-27", "test.1.json"), {
    fixtures: [{
      canonicalId: "cid_test1_homefc_awayfc_20260827",
      leagueSlug: "test.1",
      kickoffUtc: "2026-08-27T19:00:00.000Z",
      homeTeam: "Home FC",
      awayTeam: "Away FC",
      status: "PRE"
    }]
  });
  writeJson(teamFormFile, {
    "Home FC": { total: { gf: 18, ga: 9, played: 10 }, last5: { gf: 10, ga: 4, played: 5 } },
    "Away FC": { total: { gf: 10, ga: 15, played: 10 }, last5: { gf: 4, ga: 8, played: 5 } }
  });
  return { root, predictionRoot, truthRoot, teamFormFile };
}

test("rolling generator appends a signed exact-identity future prediction once", () => {
  const input = setup();
  try {
    const options = {
      dayKey: "2026-08-26",
      predictionRoot: input.predictionRoot,
      truthRoot: input.truthRoot,
      teamFormFile: input.teamFormFile,
      predictionCreatedAt: "2026-08-26T09:00:00.000Z",
      daysForward: 2,
      auditFile: path.join(input.root, "audit.json")
    };
    const first = generatePlanCShadowPredictions(options);
    assert.equal(first.audit.snapshotFresh, true);
    assert.equal(first.audit.accounting.added, 1);
    assert.equal(first.index.accounting.total, 1);
    const predictionFile = path.join(input.predictionRoot, first.index.predictions[0].relativePath);
    const prediction = JSON.parse(fs.readFileSync(predictionFile, "utf8"));
    assert.equal(prediction.identityCategory, "both");
    assert.equal(prediction.eloApplied, true);
    assert.equal(prediction.predictionSignature, planCPredictionSignature(prediction));
    const originalBytes = fs.readFileSync(predictionFile, "utf8");

    const second = generatePlanCShadowPredictions({ ...options, predictionCreatedAt: "2026-08-26T10:00:00.000Z" });
    assert.equal(second.audit.accounting.added, 0);
    assert.equal(second.audit.accounting.alreadyFrozen, 1);
    assert.equal(fs.readFileSync(predictionFile, "utf8"), originalBytes);
    assert.equal(second.manifest.predictionSetHash, first.manifest.predictionSetHash);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test("stale ClubElo snapshot fails closed by adding no predictions", () => {
  const input = setup();
  try {
    const result = generatePlanCShadowPredictions({
      dayKey: "2026-08-26",
      predictionRoot: input.predictionRoot,
      truthRoot: input.truthRoot,
      teamFormFile: input.teamFormFile,
      predictionCreatedAt: "2026-08-26T09:00:00.000Z",
      daysForward: 2,
      maxSnapshotAgeDays: 0.01,
      auditFile: path.join(input.root, "audit.json")
    });
    assert.equal(result.audit.snapshotFresh, false);
    assert.equal(result.audit.staleAction, "NO_NEW_PREDICTIONS_WITH_STALE_IDENTITIES");
    assert.equal(result.audit.accounting.added, 0);
    assert.equal(result.index.accounting.total, 0);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test("rolling manifest hashes are stable across LF and CRLF worktrees", () => {
  const input = setup();
  try {
    const options = {
      dayKey: "2026-08-26",
      predictionRoot: input.predictionRoot,
      truthRoot: input.truthRoot,
      teamFormFile: input.teamFormFile,
      predictionCreatedAt: "2026-08-26T09:00:00.000Z",
      daysForward: 2,
      auditFile: path.join(input.root, "audit.json")
    };
    const first = generatePlanCShadowPredictions(options);
    const predictionPath = first.index.predictions[0].relativePath;
    const firstArtifact = first.manifest.artifacts.find(artifact => artifact.path === predictionPath);
    const predictionFile = path.join(input.predictionRoot, ...predictionPath.split("/"));
    const lfText = fs.readFileSync(predictionFile, "utf8").replace(/\r\n/gu, "\n");
    fs.writeFileSync(predictionFile, lfText.replace(/\n/gu, "\r\n"), "utf8");

    const second = generatePlanCShadowPredictions({ ...options, predictionCreatedAt: "2026-08-26T10:00:00.000Z" });
    const secondArtifact = second.manifest.artifacts.find(artifact => artifact.path === predictionPath);
    assert.equal(second.manifest.artifactHashMode, "UTF8_LF_NORMALIZED");
    assert.deepEqual(secondArtifact, firstArtifact);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});
