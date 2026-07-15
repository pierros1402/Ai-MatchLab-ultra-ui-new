#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildHistoryEvidenceFoundation } from "../core/history-evidence-foundation.js";
import { reasonAboutHistoryEvidence } from "../core/history-evidence-reasoner.js";
import { buildAuthoritativeResolutionReport } from "../core/history-authoritative-resolution.js";
import { buildSourceReliabilityCalibration } from "../core/source-reliability-calibration.js";
import { getProjectRoot, resolveDataPath } from "../storage/data-root.js";

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function readJsonWithHash(filePath) {
  const raw = fs.readFileSync(filePath);
  return {
    raw,
    sha256: sha256Buffer(raw),
    value: JSON.parse(raw.toString("utf8"))
  };
}

function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    historyPath: resolveDataPath("history", "2025-2026.json"),
    planPath: null,
    sourceReliabilityPath: resolveDataPath("source-reliability.json"),
    manifestPath: null,
    outputPath: null,
    expectedHistorySha256: null,
    expectedPlanSha256: null,
    expectedManifestSha256: null,
    summaryOnly: false,
    maxExamples: 20,
    minimumOperationalSamples: 30
  };

  for (const arg of argv) {
    if (arg.startsWith("--history=")) {
      out.historyPath = path.resolve(arg.slice("--history=".length));
    } else if (arg.startsWith("--plan=")) {
      out.planPath = path.resolve(arg.slice("--plan=".length));
    } else if (arg.startsWith("--source-reliability=")) {
      out.sourceReliabilityPath = path.resolve(
        arg.slice("--source-reliability=".length)
      );
    } else if (arg.startsWith("--manifest=")) {
      out.manifestPath = path.resolve(arg.slice("--manifest=".length));
    } else if (arg.startsWith("--output=")) {
      out.outputPath = path.resolve(arg.slice("--output=".length));
    } else if (arg.startsWith("--expected-history-sha256=")) {
      out.expectedHistorySha256 = arg
        .slice("--expected-history-sha256=".length)
        .trim()
        .toLowerCase();
    } else if (arg.startsWith("--expected-plan-sha256=")) {
      out.expectedPlanSha256 = arg
        .slice("--expected-plan-sha256=".length)
        .trim()
        .toLowerCase();
    } else if (arg.startsWith("--expected-manifest-sha256=")) {
      out.expectedManifestSha256 = arg
        .slice("--expected-manifest-sha256=".length)
        .trim()
        .toLowerCase();
    } else if (arg === "--summary-only") {
      out.summaryOnly = true;
    } else if (arg.startsWith("--max-examples=")) {
      const n = Number(arg.slice("--max-examples=".length));
      if (Number.isFinite(n) && n >= 0) out.maxExamples = Math.floor(n);
    } else if (arg.startsWith("--minimum-operational-samples=")) {
      const n = Number(arg.slice("--minimum-operational-samples=".length));
      if (Number.isFinite(n) && n >= 1) {
        out.minimumOperationalSamples = Math.floor(n);
      }
    }
  }

  return out;
}

export function assertSafeOutputPath(outputPath) {
  if (!outputPath) throw new Error("missing_required_output_path");
  const root = path.resolve(getProjectRoot());
  const resolved = path.resolve(outputPath);
  const relative = path.relative(root, resolved).replace(/\\/g, "/");
  const forbidden = [
    "data/history/",
    "data/history-archive/",
    "data/league-memory/results/",
    "data/h2h/"
  ];
  if (
    relative === "data/history" ||
    relative === "data/history-archive" ||
    relative === "data/league-memory/results" ||
    relative === "data/h2h" ||
    relative === "data/source-reliability.json" ||
    forbidden.some(prefix => relative.startsWith(prefix))
  ) {
    throw new Error(`unsafe_truth_layer_output_path:${resolved}`);
  }
  return resolved;
}

function assertHash(label, actual, expected) {
  if (expected && actual !== expected.toLowerCase()) {
    throw new Error(`${label}_sha256_mismatch:expected=${expected}:actual=${actual}`);
  }
}

export function runHistoryAuthoritativeResolutionBuild(options = {}) {
  const historyPath = path.resolve(options.historyPath);
  const planPath = options.planPath ? path.resolve(options.planPath) : null;
  const manifestPath = options.manifestPath ? path.resolve(options.manifestPath) : null;
  const reliabilityPath = options.sourceReliabilityPath
    ? path.resolve(options.sourceReliabilityPath)
    : null;
  const outputPath = assertSafeOutputPath(options.outputPath);

  if (!fs.existsSync(historyPath)) {
    throw new Error(`history_file_not_found:${historyPath}`);
  }
  if (!planPath || !fs.existsSync(planPath)) {
    throw new Error(`repair_plan_not_found:${planPath || "missing"}`);
  }
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    throw new Error(`authoritative_manifest_not_found:${manifestPath || "missing"}`);
  }

  const history = readJsonWithHash(historyPath);
  const plan = readJsonWithHash(planPath);
  const manifest = readJsonWithHash(manifestPath);
  assertHash("history", history.sha256, options.expectedHistorySha256);
  assertHash("plan", plan.sha256, options.expectedPlanSha256);
  assertHash("manifest", manifest.sha256, options.expectedManifestSha256);

  let reliability = { value: {}, sha256: null, raw: Buffer.from("") };
  if (reliabilityPath && fs.existsSync(reliabilityPath)) {
    reliability = readJsonWithHash(reliabilityPath);
  }

  const foundation = buildHistoryEvidenceFoundation({
    historyPayload: history.value,
    repairPlan: plan.value,
    sourceReliability: reliability.value,
    includeFacts: true,
    maxExamples: options.maxExamples ?? 20
  });
  if (!foundation.ok) {
    throw new Error("evidence_foundation_not_safe_for_authoritative_resolution");
  }

  const reasoning = reasonAboutHistoryEvidence({
    evidenceFoundation: foundation,
    includeFacts: true,
    maxExamples: options.maxExamples ?? 20
  });

  const resolution = buildAuthoritativeResolutionReport({
    reasoning,
    manifest: manifest.value,
    includeResolvedFacts: true
  });

  const calibration = buildSourceReliabilityCalibration({
    reasoning,
    resolutionReport: resolution,
    legacyReliability: reliability.value,
    minimumOperationalSamples: options.minimumOperationalSamples ?? 30
  });

  const report = {
    ok: true,
    status: resolution.status,
    schema: "ai-matchlab.history-authoritative-resolution-bundle.v1",
    policyVersion: "history-authoritative-resolution-bundle-policy-v1",
    generatedAt: new Date().toISOString(),
    summary: {
      factsAnalyzed: reasoning.summary.factsAnalyzed,
      claimsScored: reasoning.summary.claimsScored,
      conflictedFacts: reasoning.summary.conflictedFacts,
      ...resolution.summary,
      adjudicatedCalibrationObservations:
        calibration.summary.adjudicatedObservations,
      operationallyEligibleReliabilityUpdates:
        calibration.summary.operationallyEligibleUpdates,
      legacyReliabilityObservationsDiagnosticOnly:
        calibration.summary.legacyReliabilityObservations
    },
    resolution: options.summaryOnly
      ? {
          summary: resolution.summary,
          resolutions: resolution.resolutions.map(row => ({
            resolutionId: row.resolutionId,
            resolutionType: row.resolutionType,
            blockIds: row.blockIds,
            targetFactIds: row.targetFactIds,
            proposalStatus: row.proposalStatus,
            candidate: row.candidate,
            confidenceClass: row.confidenceClass,
            automaticApplyAllowed: row.automaticApplyAllowed,
            explicitResolutionManifestRequiredForWrite:
              row.explicitResolutionManifestRequiredForWrite,
            evidenceItemCount: row.evidenceItemCount,
            matchingEvidenceCount: row.matchingEvidenceCount,
            contradictoryEvidenceCount: row.contradictoryEvidenceCount,
            authoritativeEvidenceCount: row.authoritativeEvidenceCount,
            independentSupportingFamilies: row.independentSupportingFamilies,
            evidenceDigest: row.evidenceDigest,
            reasonCodes: row.reasonCodes
          })),
          deferredBlocks: resolution.deferredBlocks,
          guarantees: resolution.guarantees
        }
      : resolution,
    calibration: options.summaryOnly
      ? {
          status: calibration.status,
          summary: calibration.summary,
          calibrationRows: calibration.calibrationRows,
          peerAgreementDiagnostics: calibration.peerAgreementDiagnostics,
          legacyReliability: calibration.legacyReliability,
          guarantees: calibration.guarantees
        }
      : calibration,
    sourceArtifacts: {
      history: {
        path: historyPath,
        sha256: history.sha256,
        bytes: history.raw.length
      },
      repairPlan: {
        path: planPath,
        sha256: plan.sha256,
        bytes: plan.raw.length
      },
      authoritativeManifest: {
        path: manifestPath,
        sha256: manifest.sha256,
        bytes: manifest.raw.length
      },
      sourceReliability: reliabilityPath
        ? {
            path: reliabilityPath,
            sha256: reliability.sha256,
            bytes: reliability.raw.length,
            available: reliability.sha256 != null
          }
        : null,
      evidenceFoundation: {
        facts: foundation.summary.facts,
        claims: foundation.summary.claims,
        unresolvedBlocks: foundation.summary.unresolvedBlocks,
        generatedInMemory: true
      },
      evidenceReasoning: {
        factsAnalyzed: reasoning.summary.factsAnalyzed,
        claimsScored: reasoning.summary.claimsScored,
        generatedInMemory: true
      }
    },
    output: {
      path: outputPath,
      summaryOnly: Boolean(options.summaryOnly),
      atomicWrite: true,
      artifactWrites: 1
    },
    guarantees: {
      truthWrites: 0,
      truthFilesChanged: 0,
      resolutionsAutomaticallyApplied: 0,
      sourceReliabilityWrites: 0,
      h2hWrites: 0,
      legacyReliabilityOperationallyTrusted: 0
    }
  };

  writeJsonAtomic(outputPath, report);
  return report;
}

async function main() {
  const args = parseArgs();
  const report = runHistoryAuthoritativeResolutionBuild(args);
  process.stdout.write(`${JSON.stringify({
    ok: report.ok,
    status: report.status,
    schema: report.schema,
    policyVersion: report.policyVersion,
    generatedAt: report.generatedAt,
    outputPath: report.output.path,
    summaryOnly: report.output.summaryOnly,
    summary: report.summary,
    resolution: report.resolution,
    calibration: report.calibration,
    guarantees: report.guarantees,
    sourceArtifacts: report.sourceArtifacts
  }, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 2;
}

const isCli = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main().catch(error => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
