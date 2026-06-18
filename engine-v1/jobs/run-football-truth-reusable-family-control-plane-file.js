import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `reusable-family-control-plane-${DATE}`);

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function latestFile(re) {
  const files = walk(DIAG_ROOT).filter((f) => re.test(f));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function readJson(file) {
  if (!file || !fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function runNode(label, script, args = [], mode = "required") {
  const full = path.join(ROOT, script);
  if (!fs.existsSync(full)) {
    return {
      label,
      script,
      mode,
      status: mode === "required" ? "failed_missing" : "skipped_missing",
      exitCode: null,
      stdoutTail: "",
      stderrTail: "script_missing"
    };
  }

  const r = spawnSync(process.execPath, [full, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
    env: {
      ...process.env,
      FOOTBALL_TRUTH_CONTROL_PLANE: "1",
      FOOTBALL_TRUTH_NO_PRODUCTION_WRITES: "1"
    }
  });

  return {
    label,
    script,
    mode,
    status: r.status === 0 ? "passed" : "failed",
    exitCode: r.status,
    stdoutTail: String(r.stdout || "").slice(-8000),
    stderrTail: String(r.stderr || "").slice(-8000)
  };
}

ensureDir(OUT_DIR);

const familyJobs = [
  {
    familyGroup: "browser_rendered_official",
    label: "central_browser_rendered_official_standings",
    script: "engine-v1/jobs/run-football-truth-browser-rendered-official-standings-adapter-file.js",
    args: ["--allow-render"],
    mode: "required",
    expectedOutputRegex: /browser-rendered-official-standings-adapter-\d{4}-\d{2}-\d{2}\.json$/
  },
  {
    familyGroup: "official_api",
    label: "central_official_api_standings",
    script: "engine-v1/jobs/run-football-truth-official-api-standings-adapter-file.js",
    args: ["--allow-fetch"],
    mode: "required",
    expectedOutputRegex: /official-api-standings-adapter-\d{4}-\d{2}-\d{2}\.json$/
  },
  {
    familyGroup: "official_html_proof",
    label: "jleague_official_html_proof",
    script: "engine-v1/jobs/build-football-truth-jleague-official-html-standings-proof-file.js",
    args: [],
    mode: "temporary_proof_source",
    expectedOutputRegex: /jleague-official-html-standings-proof-\d{4}-\d{2}-\d{2}\.json$/
  },
  {
    familyGroup: "current_or_new_proof",
    label: "georgia_current_or_new_proof_v2",
    script: "engine-v1/jobs/build-football-truth-georgia-current-season-table-proof-v2-file.js",
    args: ["--allow-fetch"],
    mode: "temporary_proof_source",
    expectedOutputRegex: /georgia-current-season-table-proof-v2-\d{4}-\d{2}-\d{2}\.json$/
  }
];

const lifecycleJobs = [
  {
    label: "season_lane_coverage_ledger",
    script: "engine-v1/jobs/build-football-truth-season-lane-coverage-ledger-file.js",
    args: [],
    mode: "required"
  },
  {
    label: "permanent_season_lifecycle_plan",
    script: "engine-v1/jobs/build-football-truth-permanent-season-lifecycle-plan-file.js",
    args: [],
    mode: "required"
  },
  {
    label: "prioritized_lifecycle_execution_board",
    script: "engine-v1/jobs/build-football-truth-prioritized-lifecycle-execution-board-file.js",
    args: [],
    mode: "required"
  }
];

const familyResults = [];
for (const j of familyJobs) {
  const result = runNode(j.label, j.script, j.args, j.mode);
  result.familyGroup = j.familyGroup;
  const latest = latestFile(j.expectedOutputRegex);
  result.latestOutput = latest ? rel(latest) : null;
  result.latestSummary = latest ? (readJson(latest)?.summary || readJson(latest)) : null;
  familyResults.push(result);
}

const lifecycleResults = [];
for (const j of lifecycleJobs) lifecycleResults.push(runNode(j.label, j.script, j.args, j.mode));

const latestLedger = latestFile(/season-lane-coverage-ledger-\d{4}-\d{2}-\d{2}\.json$/);
const latestLifecycle = latestFile(/permanent-season-lifecycle-plan-\d{4}-\d{2}-\d{2}\.json$/);
const latestBoard = latestFile(/prioritized-lifecycle-execution-board-\d{4}-\d{2}-\d{2}\.json$/);
const sourceFamilyCompiler = latestFile(/source-family-execution-compiler-\d{4}-\d{2}-\d{2}\.json$/);

const ledger = readJson(latestLedger);
const lifecycle = readJson(latestLifecycle);
const board = readJson(latestBoard);
const compiler = readJson(sourceFamilyCompiler);

const requiredFailures = [...familyResults, ...lifecycleResults].filter((r) => r.mode === "required" && !["passed"].includes(r.status));
const temporaryFailures = familyResults.filter((r) => r.mode !== "required" && !["passed"].includes(r.status));

const familyCoverage = familyResults.map((r) => ({
  label: r.label,
  familyGroup: r.familyGroup,
  mode: r.mode,
  status: r.status,
  exitCode: r.exitCode,
  latestOutput: r.latestOutput,
  verifiedCompetitionCount: r.latestSummary?.verifiedCompetitionCount ?? null,
  verifiedCompetitionSlugs: r.latestSummary?.verifiedCompetitionSlugs ?? null,
  acceptedRowsCount: r.latestSummary?.acceptedRowsCount ?? null,
  currentOrNewVerifiedCount: r.latestSummary?.verifiedCurrentOrNewCompetitionCount ?? null,
  currentOrNewSlugs: r.latestSummary?.verifiedCurrentOrNewCompetitionSlugs ?? null
}));

const controlPlaneStatus =
  requiredFailures.length > 0
    ? "blocked_required_family_or_lifecycle_job"
    : temporaryFailures.length > 0
      ? "passed_with_temporary_proof_failures_recorded"
      : "passed";

const summary = {
  status: controlPlaneStatus,
  runner: "reusable_family_control_plane",
  contractVersion: 2,
  controlPlanePurpose: "execute reusable source-family adapters and produce explicit blockers; never promote from review jobs",
  hardRules: [
    "review jobs must not promote truth rows",
    "family adapters must emit seasonScope and seasonLabel",
    "previous_completed must pass route identity, row count, team signal, arithmetic, non-trivial and duplicate gates",
    "current_or_new rows must never satisfy previous_completed",
    "start-date rows require direct governed start-date evidence and explicit approval before state materialization",
    "temporary proof sources are allowed to fail without aborting the governance report, but must be listed as blockers"
  ],
  searchExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  familyJobsExecutedNowCount: familyResults.length,
  familyJobsPassedCount: familyResults.filter((r) => r.status === "passed").length,
  requiredFamilyOrLifecycleFailureCount: requiredFailures.length,
  temporaryProofFailureCount: temporaryFailures.length,
  lifecycleJobsExecutedNowCount: lifecycleResults.length,
  lifecycleJobsPassedCount: lifecycleResults.filter((r) => r.status === "passed").length,
  latestLedgerPath: latestLedger ? rel(latestLedger) : null,
  latestLifecyclePath: latestLifecycle ? rel(latestLifecycle) : null,
  latestBoardPath: latestBoard ? rel(latestBoard) : null,
  sourceFamilyCompilerPath: sourceFamilyCompiler ? rel(sourceFamilyCompiler) : null,
  previousCompletedSatisfiedCount: ledger?.summary?.previousCompletedSatisfiedCount ?? null,
  previousCompletedVerifiedRowsCount: ledger?.summary?.previousCompletedVerifiedRowsCount ?? null,
  currentOrNewSeasonSatisfiedCount: ledger?.summary?.currentOrNewSeasonSatisfiedCount ?? null,
  nextSeasonStartDateSatisfiedCount: ledger?.summary?.nextSeasonStartDateSatisfiedCount ?? null,
  duePreviousCompletedStandingsCount: lifecycle?.summary?.duePreviousCompletedStandingsCount ?? null,
  dueNextSeasonStartDateCount: lifecycle?.summary?.dueNextSeasonStartDateCount ?? null,
  standingsExpansionTargetCount: board?.summary?.standingsExpansionTargetCount ?? null,
  startDateEvidenceTargetCount: board?.summary?.startDateEvidenceTargetCount ?? null,
  routeConsistentExecutableCandidateCount: compiler?.summary?.executableRouteIdentityPassedCandidateCount ?? null,
  hardBlockedRouteMismatchCount: compiler?.summary?.hardBlockedRouteMismatchCount ?? null,
  architectureAssessment: {
    currentCoverageIsStillInsufficient: true,
    currentFailureMode: "too_many_review_candidate_jobs_and_too_few_reusable_family_adapters",
    nextRequiredBuild: "registry_driven_family_adapter_generator_and_executor",
    stopDoing: "single_candidate_promotion_from_review_outputs"
  },
  recommendedNextLane:
    requiredFailures.length > 0
      ? "repair_required_family_or_lifecycle_jobs"
      : "build_registry_driven_family_adapter_generator_from_unsatisfied_due_tasks"
};

const outPath = path.join(OUT_DIR, `reusable-family-control-plane-${DATE}.json`);
const familyRowsPath = path.join(OUT_DIR, `reusable-family-control-plane-family-rows-${DATE}.jsonl`);
const jobRowsPath = path.join(OUT_DIR, `reusable-family-control-plane-job-results-${DATE}.jsonl`);
const blockersPath = path.join(OUT_DIR, `reusable-family-control-plane-blockers-${DATE}.jsonl`);

const blockers = [...requiredFailures, ...temporaryFailures].map((r) => ({
  label: r.label,
  familyGroup: r.familyGroup || "lifecycle",
  mode: r.mode,
  status: r.status,
  exitCode: r.exitCode,
  script: r.script,
  stderrTail: r.stderrTail,
  stdoutTail: r.stdoutTail
}));

fs.writeFileSync(outPath, JSON.stringify({ summary, familyCoverage, familyResults, lifecycleResults, blockers }, null, 2) + "\n", "utf8");
fs.writeFileSync(familyRowsPath, familyCoverage.map((r) => JSON.stringify(r)).join("\n") + (familyCoverage.length ? "\n" : ""), "utf8");
fs.writeFileSync(jobRowsPath, [...familyResults, ...lifecycleResults].map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
fs.writeFileSync(blockersPath, blockers.map((r) => JSON.stringify(r)).join("\n") + (blockers.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  familyRowsOutput: rel(familyRowsPath),
  jobRowsOutput: rel(jobRowsPath),
  blockersOutput: rel(blockersPath),
  summary
}, null, 2));





