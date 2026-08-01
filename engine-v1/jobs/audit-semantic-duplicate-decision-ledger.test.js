import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadSemanticDuplicateDecisionLedger,
  sha256File,
} from "../core/semantic-duplicate-decision-ledger.js";
import { buildAudit, parseArgs } from "./audit-semantic-duplicate-decision-ledger.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const jobPath = path.resolve(here, "audit-semantic-duplicate-decision-ledger.js");
const productionLedgerPath = path.resolve(
  here,
  "../../data/identity-decisions/semantic-duplicate-decision-ledger.v1.json",
);

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fixtureRow(sourceFixture) {
  return {
    canonicalId: sourceFixture.repositoryFixtureId,
    matchId: sourceFixture.repositoryFixtureId,
    source: sourceFixture.providerFamily,
    sourceId: sourceFixture.providerFixtureId,
    providerMatchId: sourceFixture.providerFixtureId,
    homeTeam: sourceFixture.homeName,
    awayTeam: sourceFixture.awayName,
    kickoffUtc: sourceFixture.kickoffUtc,
    status: sourceFixture.status,
    rawStatus: sourceFixture.rawStatus,
    scoreHome: sourceFixture.scoreHome,
    scoreAway: sourceFixture.scoreAway,
  };
}

function makeClusterIndex(ledger) {
  return {
    schema: "ai-matchlab.p0c-cluster-index.v1",
    generatedAt: "2026-08-01T00:00:00.000Z",
    sourceCommit: ledger.sourceBinding.p0bCommit,
    summary: {
      clusters: 53,
      fixtureIds: 106,
      highConfidence: 52,
      requiresReview: 1,
      scoreConflicts: 6,
      terminalStatusConflicts: 5,
    },
    clusters: ledger.decisions.map(decision => {
      const byLabel = new Map(
        decision.sourceFixtures.map(item => [item.claimLabel, item]),
      );
      const rowA = byLabel.get("A");
      const rowB = byLabel.get("B");
      return {
        day: decision.dayKey,
        leagueSlug: decision.leagueSlug,
        classification: decision.sourceAuditClassification,
        layer: "synthetic-test",
        scoreConflict: decision.scoreConflict,
        terminalStatusConflict: decision.terminalStatusConflict,
        rowA: {
          id: rowA.repositoryFixtureId,
          home: rowA.homeName,
          away: rowA.awayName,
          score: `${rowA.scoreHome ?? 0}-${rowA.scoreAway ?? 0}`,
          source: rowA.providerFamily,
        },
        rowB: {
          id: rowB.repositoryFixtureId,
          home: rowB.homeName,
          away: rowB.awayName,
          score: `${rowB.scoreHome ?? 0}-${rowB.scoreAway ?? 0}`,
          source: rowB.providerFamily,
        },
        ...structuredClone(decision.propagationImpact),
      };
    }),
  };
}

function createBoundFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p0c-ledger-audit-"));
  const ledger = structuredClone(
    loadSemanticDuplicateDecisionLedger(productionLedgerPath),
  );
  const clusterIndexPath = path.join(root, "audit", "P0C_CLUSTER_INDEX.json");
  const sourceManifestPath = path.join(root, "MANIFEST.json");
  const ledgerPath = path.join(
    root,
    "repository",
    "data",
    "identity-decisions",
    "semantic-duplicate-decision-ledger.v1.json",
  );

  const rowsByPath = new Map();
  for (const decision of ledger.decisions) {
    for (const sourceFixture of decision.sourceFixtures) {
      const relative = sourceFixture.evidencePath.replaceAll("\\", "/");
      if (!rowsByPath.has(relative)) rowsByPath.set(relative, []);
      rowsByPath.get(relative).push(fixtureRow(sourceFixture));
    }
  }

  const manifestFiles = [];
  for (const [relative, fixtures] of rowsByPath) {
    const artifactPath = path.join(root, "repository", relative);
    writeJson(artifactPath, { ok: true, fixtures });
    manifestFiles.push({
      path: `repository/${relative}`,
      sha256: sha256File(artifactPath),
      bytes: fs.statSync(artifactPath).size,
    });
  }

  const clusterIndex = makeClusterIndex(ledger);
  writeJson(clusterIndexPath, clusterIndex);

  const sourceManifest = {
    schema: "ai-matchlab.p0c-source-evidence-manifest.v1",
    generatedAt: "2026-08-01T00:00:00.000Z",
    source: {
      branch: "work/p0b-competition-format-contract-20260801",
      commit: ledger.sourceBinding.p0bCommit,
      worktree: "synthetic-test",
      statusClean: true,
    },
    audit: {
      clusters: 53,
      fixtureIds: 106,
      scoreConflicts: 6,
      terminalStatusConflicts: 5,
      reviewCandidates: 1,
    },
    repositoryEvidenceFiles: manifestFiles.length,
    files: manifestFiles,
    prohibitedActions: ["repository mutation", "commit", "push", "workflow", "deploy"],
  };
  writeJson(sourceManifestPath, sourceManifest);

  ledger.sourceBinding.clusterIndexSha256 = sha256File(clusterIndexPath);
  ledger.sourceBinding.sourceManifestSha256 = sha256File(sourceManifestPath);
  writeJson(ledgerPath, ledger);

  return {
    root,
    ledger,
    ledgerPath,
    clusterIndexPath,
    sourceManifestPath,
  };
}

function refreshManifestAndLedger(fixture) {
  const manifest = JSON.parse(fs.readFileSync(fixture.sourceManifestPath, "utf8"));
  for (const item of manifest.files) {
    const filePath = path.join(fixture.root, item.path);
    item.sha256 = sha256File(filePath);
    item.bytes = fs.statSync(filePath).size;
  }
  writeJson(fixture.sourceManifestPath, manifest);
  fixture.ledger.sourceBinding.sourceManifestSha256 = sha256File(
    fixture.sourceManifestPath,
  );
  writeJson(fixture.ledgerPath, fixture.ledger);
}

test("CLI parser accepts the four explicit read-only paths", () => {
  assert.deepEqual(
    parseArgs([
      "--ledger", "ledger.json",
      "--cluster-index", "clusters.json",
      "--source-manifest", "manifest.json",
      "--output", "audit.json",
    ]),
    {
      ledger: "ledger.json",
      clusterIndex: "clusters.json",
      sourceManifest: "manifest.json",
      output: "audit.json",
    },
  );
});

test("real-shaped audit binds all 53 decisions, 106 fixtures and source artifact facts", t => {
  const fixture = createBoundFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  const audit = buildAudit({
    ledgerPath: fixture.ledgerPath,
    clusterIndexPath: fixture.clusterIndexPath,
    sourceManifestPath: fixture.sourceManifestPath,
  });

  assert.equal(audit.ok, true, JSON.stringify(audit.issues, null, 2));
  assert.equal(audit.summary.decisionRecords, 53);
  assert.equal(audit.summary.sourceFixtureIds, 106);
  assert.equal(audit.summary.ledgerTeamIdentities, 70);
  assert.equal(audit.summary.truthConflictUnionResolved, 7);
  assert.equal(audit.sourceArtifactCrossCheck.checkedSourceFixtures, 106);
  assert.equal(audit.sourceArtifactCrossCheck.checkedArtifactFiles, 25);
  assert.equal(audit.readOnlyEvidence.writePlanGenerated, false);
});

test("cluster-pair drift is detected even when the changed cluster file is re-bound", t => {
  const fixture = createBoundFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  const clusterIndex = JSON.parse(
    fs.readFileSync(fixture.clusterIndexPath, "utf8"),
  );
  clusterIndex.clusters[0].rowB.id = "attacker_fixture_id";
  writeJson(fixture.clusterIndexPath, clusterIndex);
  fixture.ledger.sourceBinding.clusterIndexSha256 = sha256File(
    fixture.clusterIndexPath,
  );
  writeJson(fixture.ledgerPath, fixture.ledger);

  const audit = buildAudit({
    ledgerPath: fixture.ledgerPath,
    clusterIndexPath: fixture.clusterIndexPath,
    sourceManifestPath: fixture.sourceManifestPath,
  });
  assert.equal(audit.ok, false);
  assert(
    audit.clusterCrossCheck.issues.some(
      item => item.code === "CLUSTER_SOURCE_PAIR_MISMATCH",
    ),
  );
});

test("source repository fact drift is detected after manifest hashes are recomputed", t => {
  const fixture = createBoundFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  const firstSource = fixture.ledger.decisions[0].sourceFixtures[0];
  const artifactPath = path.join(fixture.root, "repository", firstSource.evidencePath);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const row = artifact.fixtures.find(
    item => item.canonicalId === firstSource.repositoryFixtureId,
  );
  row.status = "ATTACKER_STATUS";
  writeJson(artifactPath, artifact);
  refreshManifestAndLedger(fixture);

  const audit = buildAudit({
    ledgerPath: fixture.ledgerPath,
    clusterIndexPath: fixture.clusterIndexPath,
    sourceManifestPath: fixture.sourceManifestPath,
  });
  assert.equal(audit.ok, false);
  assert(
    audit.sourceArtifactCrossCheck.issues.some(
      item => item.code === "SOURCE_FIXTURE_ARTIFACT_FACT_MISMATCH",
    ),
  );
});

test("CLI writes only the requested audit output and preserves every input byte", t => {
  const fixture = createBoundFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const outputPath = path.join(fixture.root, "output", "audit.json");
  const before = new Map(
    [fixture.ledgerPath, fixture.clusterIndexPath, fixture.sourceManifestPath]
      .map(filePath => [filePath, sha256File(filePath)]),
  );

  const run = spawnSync(
    process.execPath,
    [
      jobPath,
      "--ledger", fixture.ledgerPath,
      "--cluster-index", fixture.clusterIndexPath,
      "--source-manifest", fixture.sourceManifestPath,
      "--output", outputPath,
    ],
    { encoding: "utf8" },
  );

  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.equal(fs.existsSync(outputPath), true);
  const audit = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(audit.ok, true);
  assert.equal(audit.publicationDecision, "NOT_APPLIED_READ_ONLY");
  assert.deepEqual(audit.readOnlyEvidence.changedFiles, []);

  for (const [filePath, hash] of before) {
    assert.equal(sha256File(filePath), hash);
  }
});
