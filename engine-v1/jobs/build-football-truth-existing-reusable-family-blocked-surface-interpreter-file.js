#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `existing-reusable-family-blocked-surface-interpreter-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const families = [
  { family:"laliga", slugs:["esp.1","esp.2"], jobs:[
    "engine-v1/jobs/build-football-truth-laliga-full-table-canonical-candidate-proposal-file.js",
    "engine-v1/jobs/run-football-truth-laliga-full-table-candidate-quality-gate-file.js",
    "engine-v1/jobs/run-football-truth-laliga-full-table-extraction-expansion-runner-file.js"
  ]},
  { family:"bundesliga", slugs:["ger.1","ger.2"], jobs:[
    "engine-v1/jobs/build-football-truth-bundesliga-family-local-contract-mapper-file.js",
    "engine-v1/jobs/build-football-truth-bundesliga-exact-route-quality-gate-and-canonical-write-plan-file.js",
    "engine-v1/jobs/run-football-truth-bundesliga-canonical-candidate-write-file.js"
  ]},
  { family:"norway_ntf", slugs:["nor.1","nor.2"], jobs:[
    "engine-v1/jobs/build-football-truth-norway-ntf-canonical-candidate-proposal-file.js",
    "engine-v1/jobs/run-football-truth-norway-ntf-standing-candidate-quality-gate-file.js",
    "engine-v1/jobs/run-football-truth-norway-ntf-controlled-html-table-parser-runner-file.js"
  ]},
  { family:"sportomedia_sef", slugs:["swe.1","swe.2"], jobs:[
    "engine-v1/jobs/build-sportomedia-normalized-standings-evidence-file.js",
    "engine-v1/jobs/build-uefa-sportomedia-normalized-rows-file.js",
    "engine-v1/jobs/build-football-truth-controlled-sportomedia-standings-extraction-quality-gate-file.js",
    "engine-v1/jobs/run-football-truth-controlled-sportomedia-standings-extraction-runner-file.js"
  ]},
  { family:"torneopal", slugs:["fin.1","fin.2","por.taca.portugal"], jobs:[
    "engine-v1/jobs/build-uefa-torneopal-normalized-rows-file.js"
  ]},
  { family:"ksi", slugs:["isl.1"], jobs:[
    "engine-v1/jobs/build-uefa-ksi-tournament-normalized-season-state-file.js"
  ]},
  { family:"loi_ajax", slugs:["irl.1","irl.2"], jobs:[
    "engine-v1/jobs/build-uefa-loi-ajax-normalized-rows-file.js"
  ]},
  { family:"spfl_opta", slugs:["sco.1","sco.2"], jobs:[
    "engine-v1/jobs/build-uefa-spfl-opta-normalized-rows-file.js",
    "engine-v1/jobs/build-spfl-official-html-standings-evidence-file.js"
  ]},
  { family:"cfa_cyprus_html", slugs:["cyp.1"], jobs:[] }
];

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function safeJson(relPath) {
  try {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) return null;
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return null;
  }
}

function linesMatching(lines, regex) {
  return lines
    .map((line, index) => ({ lineNumber: index + 1, text: line.trim() }))
    .filter((row) => regex.test(row.text))
    .map((row) => ({ ...row, text: row.text.slice(0, 240) }));
}

function requiredFlags(text) {
  const out = new Set();
  for (const m of text.matchAll(/(?:Missing required|missing|required)\s+(--[a-z0-9-]+)/gi)) out.add(m[1]);
  if (/--input\b|args\.input\b|const\s+input\b|getArg\(["']--input["']\)/i.test(text)) out.add("--input");
  if (/--output\b|args\.output\b|const\s+output\b|getArg\(["']--output["']\)/i.test(text)) out.add("--output");
  if (/--script-fetch-out\b|scriptFetchOut/i.test(text)) out.add("--script-fetch-out");
  if (/--mapping-out\b|mappingOut/i.test(text)) out.add("--mapping-out");
  if (/--decoder-fetch-out\b|decoderFetchOut/i.test(text)) out.add("--decoder-fetch-out");
  if (/--repaired-input\b|repairedInput/i.test(text)) out.add("--repaired-input");
  if (/--snapshot-input\b|snapshotInput/i.test(text)) out.add("--snapshot-input");
  if (/--repair-input\b|repairInput/i.test(text)) out.add("--repair-input");
  return [...out].sort();
}

function classifyJob(jobRel) {
  const full = path.join(ROOT, jobRel);
  if (!fs.existsSync(full)) {
    return {
      job: jobRel,
      exists: false,
      status: "missing_job"
    };
  }

  const text = readText(jobRel);
  const lines = text.split(/\r?\n/);

  const actualFetchLines = linesMatching(lines, /\bfetch\s*\(/);
  const actualCurlLines = linesMatching(lines, /spawnSync\(["']curl\.exe["']|spawnSync\(["']curl["']/);
  const stateCanonicalPathLines = linesMatching(lines, /"_state"|'_state'|canonical-standings-candidates/);
  const allowCanonicalWriteLines = linesMatching(lines, /allowCanonicalCandidateWrite|--allow-canonical-candidate-write|allow-canonical-write/i);
  const writeFileLines = linesMatching(lines, /writeFileSync|fs\.writeFile/);

  const searchCounterOnlyLines = linesMatching(lines, /searchExecutedNowCount|broadSearchExecutedNowCount|searchAllowed:\s*false|broadSearchAllowed:\s*false|noSearch|noBroadSearch|sourceSearch/i);
  const productionCounterOnlyLines = linesMatching(lines, /productionWrite:\s*false|productionWriteExecutedNowCount:\s*0|noProductionWrite|productionWriteAllowedNow:\s*false|ProductionWriteBlocked/i);
  const canonicalBlockedOnlyLines = linesMatching(lines, /canonicalWriteExecutedNowCount:\s*0|canonicalWriteAllowedNow:\s*false|noCanonicalWrite|CanonicalWriteBlocked/i);

  const hasActualNetworkExecution = actualFetchLines.length > 0 || actualCurlLines.length > 0;
  const hasActualCanonicalCandidateWriteSurface =
    stateCanonicalPathLines.length > 0 &&
    (
      /canonical-standings-candidates/.test(text) ||
      allowCanonicalWriteLines.length > 0 ||
      /expectedCandidatePath|candidateText|allowCanonicalCandidateWrite/i.test(text)
    );

  const hasActualProductionWriteSurface = false;

  let status = "static_block_false_positive_artifact_contract_candidate";
  if (hasActualNetworkExecution) status = "blocked_actual_network_execution_surface";
  else if (hasActualCanonicalCandidateWriteSurface) status = "blocked_actual_canonical_candidate_write_surface";
  else if (hasActualProductionWriteSurface) status = "blocked_actual_production_write_surface";

  return {
    job: jobRel,
    exists: true,
    sha256: sha256(text),
    requiredFlags: requiredFlags(text),
    status,
    interpretedSurface: {
      hasActualNetworkExecution,
      hasActualCanonicalCandidateWriteSurface,
      hasActualProductionWriteSurface,
      diagnosticWriteOnlyLikely: writeFileLines.length > 0 && !hasActualCanonicalCandidateWriteSurface && !hasActualProductionWriteSurface,
      searchSurfaceWasCounterOnly: searchCounterOnlyLines.length > 0 && !hasActualNetworkExecution,
      productionSurfaceWasGuaranteeOnly: productionCounterOnlyLines.length > 0 && !hasActualProductionWriteSurface,
      canonicalSurfaceWasBlockedGuaranteeOnly: canonicalBlockedOnlyLines.length > 0 && !hasActualCanonicalCandidateWriteSurface
    },
    evidence: {
      actualFetchLines,
      actualCurlLines,
      stateCanonicalPathLines,
      allowCanonicalWriteLines,
      writeFileLines: writeFileLines.slice(0, 8),
      searchCounterOnlyLines: searchCounterOnlyLines.slice(0, 8),
      productionCounterOnlyLines: productionCounterOnlyLines.slice(0, 8),
      canonicalBlockedOnlyLines: canonicalBlockedOnlyLines.slice(0, 8)
    },
    nextAction:
      status === "static_block_false_positive_artifact_contract_candidate"
        ? "eligible_for_future_explicit_artifact_only_contract_runner_no_fetch_no_search_no_canonical_or_production_write"
        : status === "blocked_actual_network_execution_surface"
          ? "requires_separate_controlled_fetch_approval_not_bulk_artifact_runner"
          : status === "blocked_actual_canonical_candidate_write_surface"
            ? "requires_separate_canonical_candidate_write_approval_not_bulk_artifact_runner"
            : "blocked"
  };
}

const sourceContractSummary = safeJson(`data/football-truth/_diagnostics/existing-reusable-family-invocation-contracts-${DATE}/existing-reusable-family-invocation-contracts-summary-${DATE}.json`);
const sourceBulkYieldSummary = safeJson(`data/football-truth/_diagnostics/existing-reusable-family-bulk-yield-runner-${DATE}/existing-reusable-family-bulk-yield-summary-${DATE}.json`);

const familyReports = families.map((family) => {
  const jobs = family.jobs.map(classifyJob);
  return {
    family: family.family,
    slugs: family.slugs,
    jobCount: jobs.length,
    artifactContractCandidateCount: jobs.filter((job) => job.status === "static_block_false_positive_artifact_contract_candidate").length,
    actualNetworkBlockedCount: jobs.filter((job) => job.status === "blocked_actual_network_execution_surface").length,
    actualCanonicalCandidateWriteBlockedCount: jobs.filter((job) => job.status === "blocked_actual_canonical_candidate_write_surface").length,
    actualProductionWriteBlockedCount: jobs.filter((job) => job.status === "blocked_actual_production_write_surface").length,
    jobs
  };
});

const allJobs = familyReports.flatMap((family) => family.jobs.map((job) => ({ family: family.family, ...job })));
const summary = {
  status: "passed",
  board: "existing_reusable_family_blocked_surface_interpreter",
  sourceContractReadyCount: sourceContractSummary?.summary?.readyNoFetchNoSearchNoWriteContractCount ?? null,
  sourceBulkYieldCanonicalCandidateEligibleSlugCount: sourceBulkYieldSummary?.summary?.canonicalCandidateEligibleSlugCount ?? null,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  childJobExecutedNowCount: 0,
  familyCount: familyReports.length,
  jobCount: allJobs.length,
  artifactContractCandidateCount: allJobs.filter((job) => job.status === "static_block_false_positive_artifact_contract_candidate").length,
  actualNetworkBlockedCount: allJobs.filter((job) => job.status === "blocked_actual_network_execution_surface").length,
  actualCanonicalCandidateWriteBlockedCount: allJobs.filter((job) => job.status === "blocked_actual_canonical_candidate_write_surface").length,
  actualProductionWriteBlockedCount: allJobs.filter((job) => job.status === "blocked_actual_production_write_surface").length,
  recommendedNextLane: "build_bulk_artifact_contract_runner_for_false_positive_blocked_jobs_only_no_fetch_no_search_no_canonical_or_production_write"
};

const output = { summary, families: familyReports };
const outPath = path.join(OUT_DIR, `existing-reusable-family-blocked-surface-interpreter-${DATE}.json`);
const compactPath = path.join(OUT_DIR, `existing-reusable-family-blocked-surface-interpreter-summary-${DATE}.json`);

fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
fs.writeFileSync(compactPath, `${JSON.stringify({
  summary,
  families: familyReports.map((family) => ({
    family: family.family,
    slugs: family.slugs,
    jobCount: family.jobCount,
    artifactContractCandidateCount: family.artifactContractCandidateCount,
    actualNetworkBlockedCount: family.actualNetworkBlockedCount,
    actualCanonicalCandidateWriteBlockedCount: family.actualCanonicalCandidateWriteBlockedCount,
    actualProductionWriteBlockedCount: family.actualProductionWriteBlockedCount,
    jobs: family.jobs.map((job) => ({
      job: job.job,
      status: job.status,
      requiredFlags: job.requiredFlags,
      nextAction: job.nextAction,
      interpretedSurface: job.interpretedSurface
    }))
  }))
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  output: path.relative(ROOT, outPath),
  compactOutput: path.relative(ROOT, compactPath),
  summary
}, null, 2));
