#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);

const outDir = path.join(
  ROOT,
  "data",
  "football-truth",
  "_diagnostics",
  `existing-reusable-family-artifact-contract-runner-plan-${DATE}`
);
fs.mkdirSync(outDir, { recursive: true });

function readJson(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing required artifact: ${relPath}`);
  }
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function existsRel(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function safeBaseName(value) {
  return String(value)
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

function plannedOutputFor(jobRel) {
  const base = safeBaseName(jobRel).replace(/\.js$/i, "");
  return `data/football-truth/_diagnostics/existing-reusable-family-artifact-contract-runner-${DATE}/${base}-output-${DATE}.json`;
}

function chooseBinding(flag, bindings, jobRel) {
  if (flag === "--output") {
    const planned = plannedOutputFor(jobRel);
    return {
      flag,
      rel: planned,
      exists: false,
      role: "planned_output",
      usable: true
    };
  }

  const candidates = Array.isArray(bindings?.[flag]) ? bindings[flag] : [];
  const firstExisting = candidates.find((candidate) => candidate?.rel && existsRel(candidate.rel));

  if (!firstExisting) {
    return {
      flag,
      rel: null,
      exists: false,
      role: "missing_input_binding",
      usable: false,
      candidateCount: candidates.length,
      candidateSample: candidates.slice(0, 5).map((candidate) => candidate?.rel || null)
    };
  }

  return {
    flag,
    rel: firstExisting.rel,
    exists: true,
    role: "existing_input",
    usable: true,
    candidateCount: candidates.length
  };
}

const contractFullRel =
  `data/football-truth/_diagnostics/existing-reusable-family-invocation-contracts-${DATE}/existing-reusable-family-invocation-contracts-${DATE}.json`;

const interpreterFullRel =
  `data/football-truth/_diagnostics/existing-reusable-family-blocked-surface-interpreter-${DATE}/existing-reusable-family-blocked-surface-interpreter-${DATE}.json`;

const bulkYieldRel =
  `data/football-truth/_diagnostics/existing-reusable-family-bulk-yield-runner-${DATE}/existing-reusable-family-bulk-yield-summary-${DATE}.json`;

const contractFull = readJson(contractFullRel);
const interpreterFull = readJson(interpreterFullRel);
const bulkYield = readJson(bulkYieldRel);

const contractByJob = new Map();
for (const family of contractFull.families || []) {
  for (const job of family.jobs || []) {
    contractByJob.set(job.job, { family: family.family, slugs: family.slugs, job });
  }
}

const planFamilies = [];

for (const family of interpreterFull.families || []) {
  const jobs = [];

  for (const interpretedJob of family.jobs || []) {
    const contract = contractByJob.get(interpretedJob.job);
    const artifactCandidate =
      interpretedJob.status === "static_block_false_positive_artifact_contract_candidate";

    if (!artifactCandidate) {
      jobs.push({
        family: family.family,
        job: interpretedJob.job,
        status: "not_planned_not_artifact_contract_candidate",
        interpretedStatus: interpretedJob.status,
        requiredFlags: interpretedJob.requiredFlags || [],
        reason: interpretedJob.nextAction || "unsafe_or_non_candidate"
      });
      continue;
    }

    if (!contract) {
      jobs.push({
        family: family.family,
        job: interpretedJob.job,
        status: "blocked_missing_contract_record",
        interpretedStatus: interpretedJob.status,
        requiredFlags: interpretedJob.requiredFlags || []
      });
      continue;
    }

    const requiredFlags = interpretedJob.requiredFlags || contract.job.requiredFlags || [];
    const bindings = {};
    for (const flag of requiredFlags) {
      bindings[flag] = chooseBinding(flag, contract.job.flagBindings || {}, interpretedJob.job);
    }

    const missingInputFlags = Object.entries(bindings)
      .filter(([flag, binding]) => flag !== "--output" && !binding.usable)
      .map(([flag]) => flag);

    const outputFlags = requiredFlags.filter((flag) => flag === "--output");
    const outputBindingsOk = outputFlags.every((flag) => bindings[flag]?.usable);

    const jobAbs = path.join(ROOT, interpretedJob.job);
    const jobExists = fs.existsSync(jobAbs);

    const ready =
      jobExists &&
      artifactCandidate &&
      missingInputFlags.length === 0 &&
      outputBindingsOk;

    const args = [];
    if (ready) {
      for (const flag of requiredFlags) {
        args.push(flag, bindings[flag].rel);
      }
    }

    jobs.push({
      family: family.family,
      job: interpretedJob.job,
      jobExists,
      interpretedStatus: interpretedJob.status,
      requiredFlags,
      bindings,
      missingInputFlags,
      status: ready ? "ready_artifact_only_contract_invocation" : "blocked_missing_input_bindings",
      commandPreview: ready ? {
        executable: "node",
        args: [interpretedJob.job, ...args]
      } : null,
      safetyAssertions: {
        noFetch: true,
        noSearch: true,
        noCanonicalWrite: true,
        noProductionWrite: true,
        artifactOnly: true,
        sourceInterpreterStatus: interpretedJob.status
      }
    });
  }

  planFamilies.push({
    family: family.family,
    slugs: family.slugs,
    jobCount: jobs.length,
    readyArtifactOnlyInvocationCount: jobs.filter((job) => job.status === "ready_artifact_only_contract_invocation").length,
    blockedMissingInputBindingsCount: jobs.filter((job) => job.status === "blocked_missing_input_bindings").length,
    notPlannedUnsafeOrNonCandidateCount: jobs.filter((job) => job.status === "not_planned_not_artifact_contract_candidate").length,
    jobs
  });
}

const allJobs = planFamilies.flatMap((family) => family.jobs);
const readyJobs = allJobs.filter((job) => job.status === "ready_artifact_only_contract_invocation");

const summary = {
  status: "passed",
  board: "existing_reusable_family_artifact_contract_runner_plan",
  sourceContractFull: contractFullRel,
  sourceInterpreterFull: interpreterFullRel,
  sourceBulkYield: bulkYieldRel,
  sourceBulkYieldCanonicalCandidateEligibleSlugCount: bulkYield?.summary?.canonicalCandidateEligibleSlugCount ?? null,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  childJobExecutedNowCount: 0,
  familyCount: planFamilies.length,
  jobCount: allJobs.length,
  artifactCandidateJobCount: allJobs.filter((job) => job.interpretedStatus === "static_block_false_positive_artifact_contract_candidate").length,
  readyArtifactOnlyInvocationCount: readyJobs.length,
  blockedMissingInputBindingsCount: allJobs.filter((job) => job.status === "blocked_missing_input_bindings").length,
  notPlannedUnsafeOrNonCandidateCount: allJobs.filter((job) => job.status === "not_planned_not_artifact_contract_candidate").length,
  readyFamilies: [...new Set(readyJobs.map((job) => job.family))].sort(),
  recommendedNextLane: readyJobs.length > 0
    ? "run_ready_artifact_only_contract_invocations_in_bulk_then_recompute_yield"
    : "inspect_missing_input_bindings_for_artifact_candidates_no_execution"
};

const output = {
  summary,
  families: planFamilies
};

const outPath = path.join(outDir, `existing-reusable-family-artifact-contract-runner-plan-${DATE}.json`);
const compactPath = path.join(outDir, `existing-reusable-family-artifact-contract-runner-plan-summary-${DATE}.json`);

fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
fs.writeFileSync(compactPath, `${JSON.stringify({
  summary,
  families: planFamilies.map((family) => ({
    family: family.family,
    slugs: family.slugs,
    readyArtifactOnlyInvocationCount: family.readyArtifactOnlyInvocationCount,
    blockedMissingInputBindingsCount: family.blockedMissingInputBindingsCount,
    notPlannedUnsafeOrNonCandidateCount: family.notPlannedUnsafeOrNonCandidateCount,
    jobs: family.jobs.map((job) => ({
      job: job.job,
      status: job.status,
      interpretedStatus: job.interpretedStatus,
      requiredFlags: job.requiredFlags,
      missingInputFlags: job.missingInputFlags || [],
      commandPreview: job.commandPreview
    }))
  }))
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  output: path.relative(ROOT, outPath),
  compactOutput: path.relative(ROOT, compactPath),
  summary
}, null, 2));
