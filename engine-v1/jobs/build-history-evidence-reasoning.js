#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  buildHistoryEvidenceFoundation
} from "../core/history-evidence-foundation.js";
import {
  reasonAboutHistoryEvidence
} from "../core/history-evidence-reasoner.js";
import {
  getProjectRoot,
  resolveDataPath
} from "../storage/data-root.js";

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
    outputPath: null,
    expectedHistorySha256: null,
    expectedPlanSha256: null,
    summaryOnly: false,
    maxExamples: 20
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
    } else if (arg === "--summary-only") {
      out.summaryOnly = true;
    } else if (arg.startsWith("--max-examples=")) {
      const n = Number(arg.slice("--max-examples=".length));
      if (Number.isFinite(n) && n >= 0) out.maxExamples = Math.floor(n);
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
    forbidden.some(prefix => relative.startsWith(prefix))
  ) {
    throw new Error(`unsafe_truth_layer_output_path:${resolved}`);
  }

  return resolved;
}

export function runHistoryEvidenceReasoningBuild(options = {}) {
  const historyPath = path.resolve(options.historyPath);
  const planPath = options.planPath ? path.resolve(options.planPath) : null;
  const outputPath = assertSafeOutputPath(options.outputPath);

  if (!fs.existsSync(historyPath)) {
    throw new Error(`history_file_not_found:${historyPath}`);
  }
  if (!planPath || !fs.existsSync(planPath)) {
    throw new Error(`repair_plan_not_found:${planPath || "missing"}`);
  }

  const history = readJsonWithHash(historyPath);
  const plan = readJsonWithHash(planPath);

  if (
    options.expectedHistorySha256 &&
    history.sha256 !== options.expectedHistorySha256.toLowerCase()
  ) {
    throw new Error(
      `history_sha256_mismatch:expected=${options.expectedHistorySha256}:actual=${history.sha256}`
    );
  }
  if (
    options.expectedPlanSha256 &&
    plan.sha256 !== options.expectedPlanSha256.toLowerCase()
  ) {
    throw new Error(
      `plan_sha256_mismatch:expected=${options.expectedPlanSha256}:actual=${plan.sha256}`
    );
  }

  let sourceReliability = {};
  let sourceReliabilitySha256 = null;
  const reliabilityPath = options.sourceReliabilityPath
    ? path.resolve(options.sourceReliabilityPath)
    : null;
  if (reliabilityPath && fs.existsSync(reliabilityPath)) {
    const reliability = readJsonWithHash(reliabilityPath);
    sourceReliability = reliability.value;
    sourceReliabilitySha256 = reliability.sha256;
  }

  const evidenceFoundation = buildHistoryEvidenceFoundation({
    historyPayload: history.value,
    repairPlan: plan.value,
    sourceReliability,
    includeFacts: true,
    maxExamples: options.maxExamples ?? 20
  });

  if (!evidenceFoundation.ok) {
    throw new Error("evidence_foundation_not_safe_for_reasoning");
  }

  const report = reasonAboutHistoryEvidence({
    evidenceFoundation,
    includeFacts: !options.summaryOnly,
    maxExamples: options.maxExamples ?? 20
  });

  report.sourceArtifacts = {
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
    sourceReliability: reliabilityPath
      ? {
          path: reliabilityPath,
          sha256: sourceReliabilitySha256,
          available: sourceReliabilitySha256 != null
        }
      : null,
    evidenceFoundation: {
      schema: evidenceFoundation.schema,
      policyVersion: evidenceFoundation.policyVersion,
      facts: evidenceFoundation.summary.facts,
      claims: evidenceFoundation.summary.claims,
      unresolvedBlocks: evidenceFoundation.summary.unresolvedBlocks,
      generatedInMemory: true
    }
  };
  report.output = {
    path: outputPath,
    summaryOnly: Boolean(options.summaryOnly),
    atomicWrite: true,
    artifactWrites: 1
  };

  writeJsonAtomic(outputPath, report);
  return report;
}

async function main() {
  const args = parseArgs();
  const report = runHistoryEvidenceReasoningBuild(args);
  const stdout = {
    ok: report.ok,
    status: report.status,
    schema: report.schema,
    policyVersion: report.policyVersion,
    generatedAt: report.generatedAt,
    outputPath: report.output.path,
    summaryOnly: report.output.summaryOnly,
    summary: report.summary,
    proposals: report.proposals,
    guarantees: report.guarantees,
    sourceArtifacts: report.sourceArtifacts
  };
  process.stdout.write(`${JSON.stringify(stdout, null, 2)}\n`);
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
