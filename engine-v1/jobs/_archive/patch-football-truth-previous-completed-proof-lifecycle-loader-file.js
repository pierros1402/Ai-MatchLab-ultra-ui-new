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

function abs(p) { return path.join(ROOT, p); }
function sha256Text(text) { return crypto.createHash("sha256").update(String(text ?? "")).digest("hex"); }

function patchFile(target) {
  const full = abs(target.path);
  if (!fs.existsSync(full)) throw new Error(`Missing target ${target.path}`);
  const before = fs.readFileSync(full, "utf8");

  if (before.includes("PREVIOUS_COMPLETED_PROOF_LIFECYCLE_OVERLAY_START")) {
    return { role: target.role, path: target.path, status: "already_patched", beforeSha256: sha256Text(before), afterSha256: sha256Text(before) };
  }

  let text = before;
  const importMatches = [...text.matchAll(/^import .+?;\s*$/gm)];
  if (!importMatches.length) throw new Error(`No ESM import block found in ${target.path}`);

  const imports = `
// PREVIOUS_COMPLETED_PROOF_LIFECYCLE_OVERLAY_START imports
import * as PREVIOUS_COMPLETED_PROOF_FS from "fs";
import * as PREVIOUS_COMPLETED_PROOF_PATH from "path";
import { loadPreviousCompletedDiagnosticProofState as PREVIOUS_COMPLETED_PROOF_loadState } from "../lib/football-truth-previous-completed-diagnostic-proof-loader.js";
// PREVIOUS_COMPLETED_PROOF_LIFECYCLE_OVERLAY_END imports
`;

  const lastImport = importMatches[importMatches.length - 1];
  text = text.slice(0, lastImport.index + lastImport[0].length) + imports + text.slice(lastImport.index + lastImport[0].length);

  const helper = `

// PREVIOUS_COMPLETED_PROOF_LIFECYCLE_OVERLAY_START post-run
function PREVIOUS_COMPLETED_PROOF_abs(p) {
  return PREVIOUS_COMPLETED_PROOF_PATH.join(process.cwd(), p);
}

function PREVIOUS_COMPLETED_PROOF_walk(dir, predicate, out = []) {
  const full = PREVIOUS_COMPLETED_PROOF_abs(dir);
  if (!PREVIOUS_COMPLETED_PROOF_FS.existsSync(full)) return out;
  for (const entry of PREVIOUS_COMPLETED_PROOF_FS.readdirSync(full, { withFileTypes: true })) {
    const rel = PREVIOUS_COMPLETED_PROOF_PATH.posix.join(dir.replace(/\\\\/g, "/"), entry.name);
    if (entry.isDirectory()) PREVIOUS_COMPLETED_PROOF_walk(rel, predicate, out);
    else if (predicate(rel)) out.push(rel);
  }
  return out;
}

function PREVIOUS_COMPLETED_PROOF_latestArtifact(fileRegex) {
  const re = new RegExp(fileRegex);
  const files = PREVIOUS_COMPLETED_PROOF_walk("data/football-truth/_diagnostics", p => re.test(PREVIOUS_COMPLETED_PROOF_PATH.basename(p)));
  if (!files.length) return null;
  return files.map(p => ({ p, mtimeMs: PREVIOUS_COMPLETED_PROOF_FS.statSync(PREVIOUS_COMPLETED_PROOF_abs(p)).mtimeMs })).sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;
}

function PREVIOUS_COMPLETED_PROOF_taskSlug(task) {
  return task?.competitionSlug ?? task?.leagueSlug ?? task?.slug ?? task?.targetSlug ?? task?.competition?.slug ?? null;
}

function PREVIOUS_COMPLETED_PROOF_isPreviousCompletedTask(task) {
  const text = JSON.stringify(task ?? {}).toLowerCase();
  return text.includes("previous_completed") || text.includes("previous-completed") || text.includes("acquire_previous_completed_standings");
}

function PREVIOUS_COMPLETED_PROOF_readJsonl(rel) {
  const p = PREVIOUS_COMPLETED_PROOF_abs(rel);
  if (!PREVIOUS_COMPLETED_PROOF_FS.existsSync(p)) return [];
  return PREVIOUS_COMPLETED_PROOF_FS.readFileSync(p, "utf8").split(/\\r?\\n/).filter(Boolean).map(line => JSON.parse(line));
}

function PREVIOUS_COMPLETED_PROOF_writeJsonl(rel, rows) {
  PREVIOUS_COMPLETED_PROOF_FS.writeFileSync(PREVIOUS_COMPLETED_PROOF_abs(rel), rows.map(row => JSON.stringify(row)).join("\\n") + (rows.length ? "\\n" : ""));
}

function PREVIOUS_COMPLETED_PROOF_filterTaskJsonlInDir(dir, fileRegex, satisfied) {
  const re = new RegExp(fileRegex);
  const files = PREVIOUS_COMPLETED_PROOF_walk(dir, p => re.test(PREVIOUS_COMPLETED_PROOF_PATH.basename(p)));
  let suppressed = 0;
  for (const file of files) {
    const rows = PREVIOUS_COMPLETED_PROOF_readJsonl(file);
    const kept = rows.filter(row => !(PREVIOUS_COMPLETED_PROOF_isPreviousCompletedTask(row) && satisfied.has(PREVIOUS_COMPLETED_PROOF_taskSlug(row))));
    suppressed += rows.length - kept.length;
    if (kept.length !== rows.length) PREVIOUS_COMPLETED_PROOF_writeJsonl(file, kept);
  }
  return suppressed;
}

function PREVIOUS_COMPLETED_PROOF_filterSourceFamilyBoardInDir(dir, satisfied) {
  const files = PREVIOUS_COMPLETED_PROOF_walk(dir, p => /^source-family-expansion-board-\\d{4}-\\d{2}-\\d{2}\\.jsonl$/.test(PREVIOUS_COMPLETED_PROOF_PATH.basename(p)));
  let suppressed = 0;
  for (const file of files) {
    const rows = PREVIOUS_COMPLETED_PROOF_readJsonl(file);
    const kept = [];
    for (const row of rows) {
      const slugs = Array.isArray(row.slugs) ? row.slugs : [];
      const targetSlugs = slugs.filter(slug => satisfied.has(slug));
      const onlySatisfied = slugs.length > 0 && targetSlugs.length === slugs.length;
      const rowText = JSON.stringify(row).toLowerCase();
      if (onlySatisfied && rowText.includes("previous_completed")) {
        suppressed++;
        continue;
      }
      kept.push(row);
    }
    if (kept.length !== rows.length) PREVIOUS_COMPLETED_PROOF_writeJsonl(file, kept);
  }
  return suppressed;
}

function applyPreviousCompletedDiagnosticProofLifecycleOverlay(fileRegex) {
  const state = PREVIOUS_COMPLETED_PROOF_loadState({
    root: process.cwd(),
    expectedProofSlugs: ["eng.1"]
  });

  if (state.validationStatus !== "passed") {
    throw new Error("previous_completed diagnostic proof validation failed: " + JSON.stringify(state.blocks));
  }

  const artifact = PREVIOUS_COMPLETED_PROOF_latestArtifact(fileRegex);
  if (!artifact) throw new Error("No lifecycle artifact found for regex " + fileRegex);

  const artifactPath = PREVIOUS_COMPLETED_PROOF_abs(artifact);
  const output = JSON.parse(PREVIOUS_COMPLETED_PROOF_FS.readFileSync(artifactPath, "utf8"));
  const summary = output.summary && typeof output.summary === "object" ? output.summary : output;

  const satisfied = new Set(state.verifiedPreviousCompletedProofSlugs);
  const previousCountBefore = Number(summary.previousCompletedSatisfiedCount ?? 0);
  const previousRowsBefore = Number(summary.previousCompletedVerifiedRowsCount ?? 0);
  const projectedSatisfied = Math.max(previousCountBefore, previousCountBefore + state.verifiedPreviousCompletedProofSlugCount);
  const projectedRows = Math.max(previousRowsBefore, previousRowsBefore + state.verifiedPreviousCompletedProofRowCount);
  const deltaSatisfied = projectedSatisfied - previousCountBefore;

  summary.previousCompletedSatisfiedCount = projectedSatisfied;
  summary.previousCompletedVerifiedRowsCount = projectedRows;
  summary.previousCompletedDiagnosticProofSatisfiedCount = state.verifiedPreviousCompletedProofSlugCount;
  summary.previousCompletedDiagnosticProofVerifiedRowsCount = state.verifiedPreviousCompletedProofRowCount;
  summary.previousCompletedDiagnosticProofSlugs = state.verifiedPreviousCompletedProofSlugs;

  if (typeof summary.missingPreviousCompletedCount === "number") {
    summary.missingPreviousCompletedCount = Math.max(0, summary.missingPreviousCompletedCount - deltaSatisfied);
  }
  if (typeof summary.permanentDueTaskCount === "number") {
    summary.permanentDueTaskCount = Math.max(0, summary.permanentDueTaskCount - deltaSatisfied);
  }
  if (typeof summary.duePreviousCompletedStandingsCount === "number") {
    summary.duePreviousCompletedStandingsCount = Math.max(0, summary.duePreviousCompletedStandingsCount - deltaSatisfied);
  }
  if (typeof summary.inputDueTaskCount === "number") {
    summary.inputDueTaskCount = Math.max(0, summary.inputDueTaskCount - deltaSatisfied);
  }
  if (typeof summary.acceptedExecutableTaskCount === "number") {
    summary.acceptedExecutableTaskCount = Math.max(0, summary.acceptedExecutableTaskCount - deltaSatisfied);
  }
  if (typeof summary.standingsExpansionTargetCount === "number") {
    summary.standingsExpansionTargetCount = Math.max(0, summary.standingsExpansionTargetCount - deltaSatisfied);
  }

  const dir = PREVIOUS_COMPLETED_PROOF_PATH.posix.dirname(artifact);
  const suppressedDue = PREVIOUS_COMPLETED_PROOF_filterTaskJsonlInDir(dir, /(?:due-tasks|accepted-prioritized-lifecycle-tasks)-\\d{4}-\\d{2}-\\d{2}\\.jsonl$/, satisfied);
  const suppressedSourceFamily = PREVIOUS_COMPLETED_PROOF_filterSourceFamilyBoardInDir(dir, satisfied);

  if (suppressedDue > 0) {
    summary.previousCompletedDiagnosticProofSuppressedDueTaskCount = (summary.previousCompletedDiagnosticProofSuppressedDueTaskCount ?? 0) + suppressedDue;
  }
  if (suppressedSourceFamily > 0) {
    summary.previousCompletedDiagnosticProofSuppressedSourceFamilyRowCount = (summary.previousCompletedDiagnosticProofSuppressedSourceFamilyRowCount ?? 0) + suppressedSourceFamily;
  }

  for (const key of ["tasks", "dueTasks", "acceptedTasks", "acceptedExecutableTasks", "prioritizedTasks", "executionTasks", "rows"]) {
    if (!Array.isArray(output[key])) continue;
    const before = output[key].length;
    output[key] = output[key].filter(task => !(PREVIOUS_COMPLETED_PROOF_isPreviousCompletedTask(task) && satisfied.has(PREVIOUS_COMPLETED_PROOF_taskSlug(task))));
    const suppressed = before - output[key].length;
    if (suppressed > 0) {
      summary.previousCompletedDiagnosticProofSuppressedInlineTaskCount = (summary.previousCompletedDiagnosticProofSuppressedInlineTaskCount ?? 0) + suppressed;
    }
  }

  output.previousCompletedDiagnosticProofState = {
    latestRowsPath: state.latestRowsPath,
    verifiedPreviousCompletedProofSlugCount: state.verifiedPreviousCompletedProofSlugCount,
    verifiedPreviousCompletedProofRowCount: state.verifiedPreviousCompletedProofRowCount,
    verifiedPreviousCompletedProofSlugs: state.verifiedPreviousCompletedProofSlugs,
    groupSummaries: state.groupSummaries,
    validationStatus: state.validationStatus,
    blocks: state.blocks
  };

  output.previousCompletedLifecycleIntegration = {
    status: "applied",
    mode: "post_run_diagnostic_proof_overlay",
    loaderModule: "engine-v1/lib/football-truth-previous-completed-diagnostic-proof-loader.js",
    artifact,
    previousCompletedSatisfiedCount: projectedSatisfied,
    previousCompletedVerifiedRowsCount: projectedRows,
    previousCompletedDiagnosticProofSatisfiedCount: state.verifiedPreviousCompletedProofSlugCount,
    previousCompletedDiagnosticProofVerifiedRowsCount: state.verifiedPreviousCompletedProofRowCount,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  };

  PREVIOUS_COMPLETED_PROOF_FS.writeFileSync(artifactPath, JSON.stringify(output, null, 2) + "\\n");

  console.log(JSON.stringify({
    previousCompletedLifecycleIntegration: output.previousCompletedLifecycleIntegration,
    suppressedDue,
    suppressedSourceFamily
  }, null, 2));
}

applyPreviousCompletedDiagnosticProofLifecycleOverlay(${JSON.stringify(target.artifactRegex)});
// PREVIOUS_COMPLETED_PROOF_LIFECYCLE_OVERLAY_END post-run
`;

  text = text.trimEnd() + helper + "\n";
  fs.writeFileSync(full, text);

  return { role: target.role, path: target.path, status: "patched", beforeSha256: sha256Text(before), afterSha256: sha256Text(text) };
}

const results = TARGETS.map(patchFile);
console.log(JSON.stringify({
  status: "passed",
  patchedCount: results.filter(r => r.status === "patched").length,
  alreadyPatchedCount: results.filter(r => r.status === "already_patched").length,
  results
}, null, 2));
