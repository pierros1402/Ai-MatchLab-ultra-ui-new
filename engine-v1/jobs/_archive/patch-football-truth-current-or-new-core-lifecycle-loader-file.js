import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();

const TARGETS = [
  {
    role: "season_lane_coverage_ledger",
    path: "engine-v1/jobs/build-football-truth-season-lane-coverage-ledger-file.js",
    artifactRegex: String.raw`^season-lane-coverage-ledger-\d{4}-\d{2}-\d{2}\.json$`
  },
  {
    role: "permanent_season_lifecycle_plan",
    path: "engine-v1/jobs/build-football-truth-permanent-season-lifecycle-plan-file.js",
    artifactRegex: String.raw`^permanent-season-lifecycle-plan-\d{4}-\d{2}-\d{2}\.json$`
  },
  {
    role: "prioritized_lifecycle_execution_board",
    path: "engine-v1/jobs/build-football-truth-prioritized-lifecycle-execution-board-file.js",
    artifactRegex: String.raw`^prioritized-lifecycle-execution-board-\d{4}-\d{2}-\d{2}\.json$`
  }
];

function abs(p) {
  return path.join(ROOT, p);
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text ?? "")).digest("hex");
}

function patchFile(target) {
  const full = abs(target.path);
  if (!fs.existsSync(full)) throw new Error(`Missing target ${target.path}`);

  const before = fs.readFileSync(full, "utf8");
  if (before.includes("CURRENT_OR_NEW_LIFECYCLE_OVERLAY_START")) {
    return {
      role: target.role,
      path: target.path,
      status: "already_patched",
      beforeSha256: sha256Text(before),
      afterSha256: sha256Text(before)
    };
  }

  let text = before;

  const importMatches = [...text.matchAll(/^import .+?;\s*$/gm)];
  if (!importMatches.length) throw new Error(`No ESM import block found in ${target.path}`);

  const imports = `
// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_START imports
import * as CURRENT_OR_NEW_FS from "fs";
import * as CURRENT_OR_NEW_PATH from "path";
import { loadCurrentOrNewDiagnosticState as CURRENT_OR_NEW_loadDiagnosticState } from "../lib/football-truth-current-or-new-diagnostic-state-loader.js";
// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_END imports
`;

  const lastImport = importMatches[importMatches.length - 1];
  text = text.slice(0, lastImport.index + lastImport[0].length) + imports + text.slice(lastImport.index + lastImport[0].length);

  const helper = `

// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_START post-run
function CURRENT_OR_NEW_abs(p) {
  return CURRENT_OR_NEW_PATH.join(process.cwd(), p);
}

function CURRENT_OR_NEW_walk(dir, predicate, out = []) {
  const full = CURRENT_OR_NEW_abs(dir);
  if (!CURRENT_OR_NEW_FS.existsSync(full)) return out;
  for (const entry of CURRENT_OR_NEW_FS.readdirSync(full, { withFileTypes: true })) {
    const rel = CURRENT_OR_NEW_PATH.posix.join(dir.replace(/\\\\/g, "/"), entry.name);
    if (entry.isDirectory()) CURRENT_OR_NEW_walk(rel, predicate, out);
    else if (predicate(rel)) out.push(rel);
  }
  return out;
}

function CURRENT_OR_NEW_latestArtifact(fileRegex) {
  const re = new RegExp(fileRegex);
  const files = CURRENT_OR_NEW_walk("data/football-truth/_diagnostics", p => re.test(CURRENT_OR_NEW_PATH.basename(p)));
  if (!files.length) return null;
  return files
    .map(p => ({ p, mtimeMs: CURRENT_OR_NEW_FS.statSync(CURRENT_OR_NEW_abs(p)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;
}

function CURRENT_OR_NEW_taskSlug(task) {
  return task?.competitionSlug ?? task?.leagueSlug ?? task?.slug ?? task?.targetSlug ?? task?.competition?.slug ?? null;
}

function CURRENT_OR_NEW_isCurrentOrNewTask(task) {
  const text = JSON.stringify(task ?? {}).toLowerCase();
  return text.includes("current_or_new") || text.includes("current-or-new") || text.includes("currentornew");
}

function applyCurrentOrNewDiagnosticLifecycleOverlay(fileRegex) {
  const state = CURRENT_OR_NEW_loadDiagnosticState({
    root: process.cwd(),
    knownOutsideState: ["geo.1"]
  });

  if (state.validationStatus !== "passed") {
    throw new Error("current_or_new diagnostic state validation failed: " + JSON.stringify(state.blocks));
  }

  const artifact = CURRENT_OR_NEW_latestArtifact(fileRegex);
  if (!artifact) throw new Error("No lifecycle artifact found for regex " + fileRegex);

  const artifactPath = CURRENT_OR_NEW_abs(artifact);
  const output = JSON.parse(CURRENT_OR_NEW_FS.readFileSync(artifactPath, "utf8"));
  const summary = output.summary && typeof output.summary === "object" ? output.summary : output;

  summary.currentOrNewSeasonSatisfiedCount = state.projectedKnownCurrentOrNewSlugCount;
  summary.currentOrNewDiagnosticStateSatisfiedCount = state.materializedDiagnosticCurrentOrNewSlugCount;
  summary.currentOrNewDiagnosticStateVerifiedRowsCount = state.materializedDiagnosticCurrentOrNewRowCount;
  summary.currentOrNewKnownOutsideDiagnosticStateSatisfiedCount = state.knownExistingCurrentOrNewOutsideThisState.length;
  summary.currentOrNewProjectedKnownSlugs = state.projectedKnownCurrentOrNewSlugs;

  output.currentOrNewDiagnosticState = {
    stateDir: state.stateDir,
    stateRowsFiles: state.stateRowsFiles,
    materializedDiagnosticCurrentOrNewSlugCount: state.materializedDiagnosticCurrentOrNewSlugCount,
    materializedDiagnosticCurrentOrNewRowCount: state.materializedDiagnosticCurrentOrNewRowCount,
    materializedDiagnosticCurrentOrNewSlugs: state.materializedDiagnosticCurrentOrNewSlugs,
    knownExistingCurrentOrNewOutsideDiagnosticState: state.knownExistingCurrentOrNewOutsideThisState,
    projectedKnownCurrentOrNewSlugCount: state.projectedKnownCurrentOrNewSlugCount,
    projectedKnownCurrentOrNewSlugs: state.projectedKnownCurrentOrNewSlugs,
    validationStatus: state.validationStatus,
    blocks: state.blocks
  };

  const satisfied = new Set(state.projectedKnownCurrentOrNewSlugs);
  for (const key of ["tasks", "dueTasks", "acceptedTasks", "acceptedExecutableTasks", "prioritizedTasks", "executionTasks", "rows"]) {
    if (!Array.isArray(output[key])) continue;
    const before = output[key].length;
    output[key] = output[key].filter(task => !(CURRENT_OR_NEW_isCurrentOrNewTask(task) && satisfied.has(CURRENT_OR_NEW_taskSlug(task))));
    const suppressed = before - output[key].length;
    if (suppressed > 0) {
      summary.currentOrNewSuppressedSatisfiedTaskCount = (summary.currentOrNewSuppressedSatisfiedTaskCount ?? 0) + suppressed;
    }
  }

  output.currentOrNewLifecycleIntegration = {
    status: "applied",
    mode: "post_run_diagnostic_artifact_overlay",
    loaderModule: "engine-v1/lib/football-truth-current-or-new-diagnostic-state-loader.js",
    artifact,
    currentOrNewSeasonSatisfiedCount: state.projectedKnownCurrentOrNewSlugCount,
    currentOrNewDiagnosticStateSatisfiedCount: state.materializedDiagnosticCurrentOrNewSlugCount,
    currentOrNewDiagnosticStateVerifiedRowsCount: state.materializedDiagnosticCurrentOrNewRowCount,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  };

  CURRENT_OR_NEW_FS.writeFileSync(artifactPath, JSON.stringify(output, null, 2) + "\\n");

  console.log(JSON.stringify({
    currentOrNewLifecycleIntegration: output.currentOrNewLifecycleIntegration
  }, null, 2));
}

applyCurrentOrNewDiagnosticLifecycleOverlay(${JSON.stringify(target.artifactRegex)});
// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_END post-run
`;

  text = text.trimEnd() + helper + "\n";

  fs.writeFileSync(full, text);

  return {
    role: target.role,
    path: target.path,
    status: "patched",
    beforeSha256: sha256Text(before),
    afterSha256: sha256Text(text)
  };
}

const results = TARGETS.map(patchFile);

console.log(JSON.stringify({
  status: "passed",
  patchedCount: results.filter(r => r.status === "patched").length,
  alreadyPatchedCount: results.filter(r => r.status === "already_patched").length,
  results
}, null, 2));
