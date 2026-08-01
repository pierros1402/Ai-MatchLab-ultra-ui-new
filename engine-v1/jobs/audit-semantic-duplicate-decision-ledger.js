import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalJson,
  loadSemanticDuplicateDecisionLedger,
  sha256File,
  validateSemanticDuplicateDecisionLedger,
} from "../core/semantic-duplicate-decision-ledger.js";

function clean(value) {
  return String(value ?? "").trim();
}

export function parseArgs(argv = []) {
  const out = {
    ledger: null,
    clusterIndex: null,
    sourceManifest: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--ledger") out.ledger = argv[++index] || null;
    else if (token === "--cluster-index") out.clusterIndex = argv[++index] || null;
    else if (token === "--source-manifest") out.sourceManifest = argv[++index] || null;
    else if (token === "--output") out.output = argv[++index] || null;
  }

  return out;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function orderedPairFromCluster(cluster) {
  return [cluster?.rowA?.id, cluster?.rowB?.id].map(clean);
}

function orderedPairFromDecision(decision) {
  const byLabel = new Map(
    (decision.sourceFixtures || []).map(item => [item.claimLabel, clean(item.repositoryFixtureId)]),
  );
  return [byLabel.get("A") || "", byLabel.get("B") || ""];
}

function normalizedPath(value) {
  return clean(value).replaceAll("\\", "/").replace(/^\.\//, "");
}

function findFixtureObjects(value, repositoryFixtureId, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) findFixtureObjects(item, repositoryFixtureId, out);
    return out;
  }

  if (!value || typeof value !== "object") return out;

  const candidateIds = [value.canonicalId, value.matchId, value.id]
    .map(clean)
    .filter(Boolean);
  if (candidateIds.includes(repositoryFixtureId)) out.push(value);

  for (const item of Object.values(value)) {
    findFixtureObjects(item, repositoryFixtureId, out);
  }
  return out;
}

function sourceFixtureArtifactCrossCheck({ ledger, sourceManifest, sourceManifestPath }) {
  const issues = [];
  const bundleRoot = path.dirname(path.resolve(sourceManifestPath));
  const repositoryRoot = path.resolve(bundleRoot, "repository");
  const manifestEntries = new Map(
    (sourceManifest?.files || []).map(item => [normalizedPath(item.path), item]),
  );
  const jsonCache = new Map();
  const hashCache = new Map();
  let checkedSourceFixtures = 0;
  let checkedArtifactFiles = 0;

  for (const decision of ledger?.decisions || []) {
    for (const sourceFixture of decision?.sourceFixtures || []) {
      const evidencePath = normalizedPath(sourceFixture?.evidencePath);
      const manifestPath = `repository/${evidencePath}`;
      const manifestEntry = manifestEntries.get(manifestPath);
      const artifactPath = path.resolve(repositoryRoot, evidencePath);
      const repositoryPrefix = `${repositoryRoot}${path.sep}`;

      if (!artifactPath.startsWith(repositoryPrefix)) {
        issues.push({
          code: "SOURCE_ARTIFACT_PATH_ESCAPE",
          message: "Source fixture evidence path escapes the repository payload.",
          details: { decisionId: decision.decisionId, evidencePath },
        });
        continue;
      }

      if (!manifestEntry) {
        issues.push({
          code: "SOURCE_ARTIFACT_NOT_IN_MANIFEST",
          message: "Source fixture evidence file is not bound by the source manifest.",
          details: { decisionId: decision.decisionId, manifestPath },
        });
        continue;
      }

      if (!fs.existsSync(artifactPath)) {
        issues.push({
          code: "SOURCE_ARTIFACT_FILE_MISSING",
          message: "Source fixture evidence file is missing from the extracted bundle.",
          details: { decisionId: decision.decisionId, artifactPath },
        });
        continue;
      }

      if (!hashCache.has(artifactPath)) {
        hashCache.set(artifactPath, sha256File(artifactPath));
        checkedArtifactFiles++;
      }
      if (hashCache.get(artifactPath) !== manifestEntry.sha256) {
        issues.push({
          code: "SOURCE_ARTIFACT_HASH_MISMATCH",
          message: "Source fixture evidence file hash differs from the source manifest.",
          details: { decisionId: decision.decisionId, manifestPath },
        });
        continue;
      }

      if (!jsonCache.has(artifactPath)) {
        jsonCache.set(artifactPath, readJson(artifactPath));
      }

      const repositoryFixtureId = clean(sourceFixture?.repositoryFixtureId);
      const rows = findFixtureObjects(
        jsonCache.get(artifactPath),
        repositoryFixtureId,
      );
      if (rows.length !== 1) {
        issues.push({
          code: "SOURCE_FIXTURE_ARTIFACT_MATCH_COUNT_INVALID",
          message: "Source fixture ID must resolve to exactly one row in its bound evidence artifact.",
          details: {
            decisionId: decision.decisionId,
            repositoryFixtureId,
            evidencePath,
            matches: rows.length,
          },
        });
        continue;
      }

      const row = rows[0];
      const expectedProjection = {
        homeName: row.homeTeam ?? null,
        awayName: row.awayTeam ?? null,
        kickoffUtc: row.kickoffUtc ?? null,
        status: row.status ?? null,
        rawStatus: row.rawStatus ?? null,
        scoreHome: row.scoreHome ?? null,
        scoreAway: row.scoreAway ?? null,
      };
      const observedProjection = {
        homeName: sourceFixture.homeName ?? null,
        awayName: sourceFixture.awayName ?? null,
        kickoffUtc: sourceFixture.kickoffUtc ?? null,
        status: sourceFixture.status ?? null,
        rawStatus: sourceFixture.rawStatus ?? null,
        scoreHome: sourceFixture.scoreHome ?? null,
        scoreAway: sourceFixture.scoreAway ?? null,
      };

      if (canonicalJson(expectedProjection) !== canonicalJson(observedProjection)) {
        issues.push({
          code: "SOURCE_FIXTURE_ARTIFACT_FACT_MISMATCH",
          message: "Ledger source claim differs from its exact repository evidence row.",
          details: {
            decisionId: decision.decisionId,
            repositoryFixtureId,
            expectedProjection,
            observedProjection,
          },
        });
      }

      const providerIds = new Set(
        [row.providerMatchId, row.sourceId, row.sourceMatchId]
          .map(clean)
          .filter(Boolean),
      );
      if (
        sourceFixture.providerFixtureId !== null &&
        !providerIds.has(clean(sourceFixture.providerFixtureId))
      ) {
        issues.push({
          code: "SOURCE_PROVIDER_FIXTURE_ID_MISMATCH",
          message: "Ledger provider fixture ID is not present in the bound repository row.",
          details: { decisionId: decision.decisionId, repositoryFixtureId },
        });
      }

      checkedSourceFixtures++;
    }
  }

  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    checkedSourceFixtures,
    checkedArtifactFiles,
    issues,
  };
}

function clusterCrossCheck(ledger, clusterIndex) {
  const issues = [];
  const clusters = Array.isArray(clusterIndex?.clusters)
    ? clusterIndex.clusters
    : [];
  const decisions = Array.isArray(ledger?.decisions)
    ? ledger.decisions
    : [];

  if (clusterIndex?.schema !== "ai-matchlab.p0c-cluster-index.v1") {
    issues.push({
      code: "CLUSTER_INDEX_SCHEMA_MISMATCH",
      message: "Unexpected cluster-index schema.",
    });
  }

  if (clusterIndex?.sourceCommit !== ledger?.sourceBinding?.p0bCommit) {
    issues.push({
      code: "CLUSTER_INDEX_SOURCE_COMMIT_MISMATCH",
      message: "Cluster index and ledger are bound to different commits.",
    });
  }

  if (clusters.length !== 53 || decisions.length !== 53) {
    issues.push({
      code: "CLUSTER_LEDGER_COUNT_MISMATCH",
      message: "Cluster index and ledger must both contain 53 records.",
      details: { clusters: clusters.length, decisions: decisions.length },
    });
  }

  for (let index = 0; index < Math.min(clusters.length, decisions.length); index += 1) {
    const cluster = clusters[index];
    const decision = decisions[index];
    const expectedOrdinal = index + 1;

    if (decision.clusterOrdinal !== expectedOrdinal) {
      issues.push({
        code: "CLUSTER_ORDINAL_ORDER_MISMATCH",
        message: "Ledger decision order does not match the immutable cluster index.",
        details: { expectedOrdinal, observed: decision.clusterOrdinal },
      });
    }

    if (
      decision.dayKey !== cluster.day ||
      decision.leagueSlug !== cluster.leagueSlug ||
      decision.sourceAuditClassification !== cluster.classification ||
      decision.scoreConflict !== Boolean(cluster.scoreConflict) ||
      decision.terminalStatusConflict !== Boolean(cluster.terminalStatusConflict)
    ) {
      issues.push({
        code: "CLUSTER_FACT_MISMATCH",
        message: "Ledger decision facts differ from the source cluster.",
        details: { ordinal: expectedOrdinal },
      });
    }

    const expectedPair = orderedPairFromCluster(cluster);
    const observedPair = orderedPairFromDecision(decision);
    if (expectedPair[0] !== observedPair[0] || expectedPair[1] !== observedPair[1]) {
      issues.push({
        code: "CLUSTER_SOURCE_PAIR_MISMATCH",
        message: "Ledger source fixture pair differs from the source cluster.",
        details: { ordinal: expectedOrdinal, expectedPair, observedPair },
      });
    }

    const byLabel = new Map(
      (decision.sourceFixtures || []).map(item => [item.claimLabel, item]),
    );
    for (const [label, row] of [["A", cluster.rowA], ["B", cluster.rowB]]) {
      const sourceFixture = byLabel.get(label);
      if (
        sourceFixture?.homeName !== row?.home ||
        sourceFixture?.awayName !== row?.away
      ) {
        issues.push({
          code: "CLUSTER_SOURCE_TEAM_NAME_MISMATCH",
          message: "Ledger source team names differ from the immutable cluster index.",
          details: { ordinal: expectedOrdinal, claimLabel: label },
        });
      }
    }

    const propagationKeys = [
      "historyExactHitsA",
      "historyExactHitsB",
      "historySemanticRows",
      "historySemanticIds",
      "standingsTeamCount",
      "standingsArchiveMode",
      "standingsAliasPresence",
      "teamFormNameHits",
      "h2hIdHits",
      "valueComparisonStatus",
      "affectedPicks",
      "finalResultPaths",
      "detailPaths",
    ];
    const expectedPropagation = Object.fromEntries(
      propagationKeys.map(key => [key, cluster?.[key]]),
    );
    if (
      canonicalJson(decision?.propagationImpact) !==
      canonicalJson(expectedPropagation)
    ) {
      issues.push({
        code: "CLUSTER_PROPAGATION_IMPACT_MISMATCH",
        message: "Ledger propagation impact differs from the immutable cluster index.",
        details: { ordinal: expectedOrdinal },
      });
    }
  }

  return issues;
}

export function buildAudit({ ledgerPath, clusterIndexPath, sourceManifestPath }) {
  const ledger = loadSemanticDuplicateDecisionLedger(ledgerPath);
  const clusterIndex = readJson(clusterIndexPath);
  const sourceManifest = readJson(sourceManifestPath);

  const ledgerValidation = validateSemanticDuplicateDecisionLedger(ledger);
  const sourceBindingIssues = [];

  const sourceManifestHash = sha256File(sourceManifestPath);
  const clusterIndexHash = sha256File(clusterIndexPath);

  if (sourceManifest?.schema !== "ai-matchlab.p0c-source-evidence-manifest.v1") {
    sourceBindingIssues.push({
      code: "SOURCE_MANIFEST_SCHEMA_MISMATCH",
      message: "Unexpected source manifest schema.",
    });
  }

  if (sourceManifestHash !== ledger?.sourceBinding?.sourceManifestSha256) {
    sourceBindingIssues.push({
      code: "SOURCE_MANIFEST_HASH_MISMATCH",
      message: "Source manifest hash does not match ledger binding.",
      details: { expected: ledger?.sourceBinding?.sourceManifestSha256, observed: sourceManifestHash },
    });
  }

  if (clusterIndexHash !== ledger?.sourceBinding?.clusterIndexSha256) {
    sourceBindingIssues.push({
      code: "CLUSTER_INDEX_HASH_MISMATCH",
      message: "Cluster index hash does not match ledger binding.",
      details: { expected: ledger?.sourceBinding?.clusterIndexSha256, observed: clusterIndexHash },
    });
  }

  if (sourceManifest?.source?.commit !== ledger?.sourceBinding?.p0bCommit) {
    sourceBindingIssues.push({
      code: "SOURCE_MANIFEST_COMMIT_MISMATCH",
      message: "Source manifest commit does not match ledger binding.",
    });
  }

  const crossCheckIssues = clusterCrossCheck(ledger, clusterIndex);
  const sourceArtifactCrossCheck = sourceFixtureArtifactCrossCheck({
    ledger,
    sourceManifest,
    sourceManifestPath,
  });
  const issues = [
    ...ledgerValidation.issues,
    ...sourceBindingIssues,
    ...crossCheckIssues,
    ...sourceArtifactCrossCheck.issues,
  ];

  return {
    schema: "ai-matchlab.semantic-duplicate-decision-ledger-audit.v1",
    generatedAt: new Date().toISOString(),
    status: issues.length === 0 ? "PASS" : "FAIL",
    ok: issues.length === 0,
    publicationDecision: "NOT_APPLIED_READ_ONLY",
    inputs: {
      ledger: {
        path: path.resolve(ledgerPath),
        sha256: sha256File(ledgerPath),
      },
      clusterIndex: {
        path: path.resolve(clusterIndexPath),
        sha256: clusterIndexHash,
      },
      sourceManifest: {
        path: path.resolve(sourceManifestPath),
        sha256: sourceManifestHash,
      },
    },
    ledgerValidation,
    sourceBinding: {
      ok: sourceBindingIssues.length === 0,
      issueCount: sourceBindingIssues.length,
      issues: sourceBindingIssues,
    },
    clusterCrossCheck: {
      ok: crossCheckIssues.length === 0,
      issueCount: crossCheckIssues.length,
      issues: crossCheckIssues,
    },
    sourceArtifactCrossCheck,
    summary: ledgerValidation.summary,
    issueCount: issues.length,
    issues,
    readOnlyEvidence: {
      mutationAllowed: false,
      repositoryApplicationAuthorized: false,
      writePlanGenerated: false,
      sourceFilesChanged: false,
      changedFiles: [],
    },
  };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ledger || !args.clusterIndex || !args.sourceManifest || !args.output) {
    console.error("required: --ledger --cluster-index --source-manifest --output");
    process.exit(1);
  }

  const audit = buildAudit({
    ledgerPath: args.ledger,
    clusterIndexPath: args.clusterIndex,
    sourceManifestPath: args.sourceManifest,
  });

  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: audit.ok,
    status: audit.status,
    output: path.resolve(args.output),
    summary: audit.summary,
    issueCount: audit.issueCount,
  }, null, 2));
  process.exit(audit.ok ? 0 : 2);
}
