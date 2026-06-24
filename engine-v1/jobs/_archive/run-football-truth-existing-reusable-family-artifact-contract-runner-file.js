#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");

const OUT_DIR = path.join(
  ROOT,
  "data",
  "football-truth",
  "_diagnostics",
  `existing-reusable-family-artifact-contract-runner-${DATE}`
);
fs.mkdirSync(OUT_DIR, { recursive: true });

const PLAN_REL = `data/football-truth/_diagnostics/existing-reusable-family-artifact-contract-runner-plan-${DATE}/existing-reusable-family-artifact-contract-runner-plan-${DATE}.json`;

const forbiddenRuntimeFlags = new Set([
  "--allow-fetch",
  "--allow-search",
  "--allow-broad-search",
  "--allow-canonical-write",
  "--allow-canonical-candidate-write",
  "--allow-production-write",
  "--allow-write",
  "--write-canonical",
  "--write-production",
  "--promote",
  "--production"
]);

function readJsonRel(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) throw new Error(`Missing required plan: ${relPath}`);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function safeReadText(relPath) {
  try {
    return fs.readFileSync(path.join(ROOT, relPath), "utf8");
  } catch {
    return "";
  }
}

function mkdirForRelFile(relPath) {
  fs.mkdirSync(path.dirname(path.join(ROOT, relPath)), { recursive: true });
}

function relPath(absPath) {
  return path.relative(ROOT, absPath).replaceAll("\\", "/");
}

function sourceSafetyCheck(jobRel) {
  const text = safeReadText(jobRel);
  const actualFetch = /\bfetch\s*\(/.test(text);
  const actualCurl = /spawnSync\(["']curl(?:\.exe)?["']/.test(text);
  const canonicalCandidateWrite = /canonical-standings-candidates|allowCanonicalCandidateWrite|--allow-canonical-candidate-write/i.test(text);
  const productionWrite = /productionWriteAllowedNow\s*:\s*true|allowProductionWrite|--allow-production-write/i.test(text);

  return {
    actualFetch,
    actualCurl,
    canonicalCandidateWrite,
    productionWrite,
    safe: !actualFetch && !actualCurl && !canonicalCandidateWrite && !productionWrite
  };
}

function validateCommand(job) {
  if (job.status !== "ready_artifact_only_contract_invocation") {
    return { ok: false, reason: `not_ready_status:${job.status}` };
  }

  if (!job.commandPreview || job.commandPreview.executable !== "node" || !Array.isArray(job.commandPreview.args)) {
    return { ok: false, reason: "missing_or_invalid_command_preview" };
  }

  const [jobRel, ...runtimeArgs] = job.commandPreview.args;
  if (jobRel !== job.job) {
    return { ok: false, reason: "command_preview_job_mismatch" };
  }

  for (const flag of runtimeArgs.filter((value) => String(value).startsWith("--"))) {
    if (forbiddenRuntimeFlags.has(flag)) {
      return { ok: false, reason: `forbidden_runtime_flag:${flag}` };
    }
  }

  const safety = sourceSafetyCheck(jobRel);
  if (!safety.safe) {
    return { ok: false, reason: "source_safety_check_failed", safety };
  }

  for (let index = 0; index < runtimeArgs.length; index += 2) {
    const flag = runtimeArgs[index];
    const value = runtimeArgs[index + 1];

    if (!String(flag).startsWith("--")) {
      return { ok: false, reason: `malformed_arg_flag_at_index:${index}` };
    }

    if (value === undefined || String(value).startsWith("--")) {
      return { ok: false, reason: `missing_arg_value_for:${flag}` };
    }

    if (flag === "--output" || flag.endsWith("-out")) {
      if (!String(value).startsWith("data/football-truth/_diagnostics/")) {
        return { ok: false, reason: `output_not_diagnostics:${flag}:${value}` };
      }
      mkdirForRelFile(value);
    } else {
      if (!fs.existsSync(path.join(ROOT, value))) {
        return { ok: false, reason: `input_missing:${flag}:${value}` };
      }
    }
  }

  return { ok: true };
}

const plan = readJsonRel(PLAN_REL);
const allPlannedJobs = (plan.families || []).flatMap((family) =>
  (family.jobs || []).map((job) => ({ family: family.family, ...job }))
);
const readyJobs = allPlannedJobs.filter((job) => job.status === "ready_artifact_only_contract_invocation");

const executedJobs = [];

for (const job of readyJobs) {
  const validation = validateCommand(job);

  if (!validation.ok) {
    executedJobs.push({
      family: job.family,
      job: job.job,
      status: "blocked_by_runner_validation",
      validation
    });
    continue;
  }

  if (!allowExecute) {
    executedJobs.push({
      family: job.family,
      job: job.job,
      status: "would_execute_without_allow_execute",
      commandPreview: job.commandPreview
    });
    continue;
  }

  const [jobRel, ...runtimeArgs] = job.commandPreview.args;
  const startedAt = new Date().toISOString();

  const result = spawnSync(process.execPath, [jobRel, ...runtimeArgs], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 20
  });

  executedJobs.push({
    family: job.family,
    job: job.job,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    signal: result.signal || null,
    startedAt,
    finishedAt: new Date().toISOString(),
    commandPreview: job.commandPreview,
    stdoutTail: String(result.stdout || "").slice(-5000),
    stderrTail: String(result.stderr || "").slice(-5000)
  });
}

const summary = {
  status: "passed",
  runner: "existing_reusable_family_artifact_contract_runner",
  sourcePlan: PLAN_REL,
  allowExecuteFlagPresent: allowExecute,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  plannedReadyJobCount: readyJobs.length,
  childJobExecutedNowCount: executedJobs.filter((job) => job.status === "passed" || job.status === "failed").length,
  childJobPassedCount: executedJobs.filter((job) => job.status === "passed").length,
  childJobFailedCount: executedJobs.filter((job) => job.status === "failed").length,
  runnerValidationBlockedCount: executedJobs.filter((job) => job.status === "blocked_by_runner_validation").length,
  familyCount: [...new Set(readyJobs.map((job) => job.family))].length,
  executedFamilies: [...new Set(executedJobs.filter((job) => job.status === "passed" || job.status === "failed").map((job) => job.family))].sort(),
  recommendedNextLane: "recompute_existing_reusable_family_bulk_yield_after_artifact_contract_execution"
};

const outPath = path.join(OUT_DIR, `existing-reusable-family-artifact-contract-runner-${DATE}.json`);
const compactPath = path.join(OUT_DIR, `existing-reusable-family-artifact-contract-runner-summary-${DATE}.json`);

fs.writeFileSync(outPath, `${JSON.stringify({ summary, executedJobs }, null, 2)}\n`, "utf8");
fs.writeFileSync(compactPath, `${JSON.stringify({
  summary,
  executedJobs: executedJobs.map((job) => ({
    family: job.family,
    job: job.job,
    status: job.status,
    exitCode: job.exitCode ?? null,
    validationReason: job.validation?.reason ?? null
  }))
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  output: relPath(outPath),
  compactOutput: relPath(compactPath),
  summary
}, null, 2));
