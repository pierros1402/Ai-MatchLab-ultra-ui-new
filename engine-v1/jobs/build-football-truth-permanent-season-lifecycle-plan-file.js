#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_START imports
import * as CURRENT_OR_NEW_FS from "fs";
import * as CURRENT_OR_NEW_PATH from "path";
import { loadCurrentOrNewDiagnosticState as CURRENT_OR_NEW_loadDiagnosticState } from "../lib/football-truth-current-or-new-diagnostic-state-loader.js";
// PREVIOUS_COMPLETED_PROOF_LIFECYCLE_OVERLAY_START imports
import * as PREVIOUS_COMPLETED_PROOF_FS from "fs";
import * as PREVIOUS_COMPLETED_PROOF_PATH from "path";
import { loadPreviousCompletedDiagnosticProofState as PREVIOUS_COMPLETED_PROOF_loadState } from "../lib/football-truth-previous-completed-diagnostic-proof-loader.js";
// PREVIOUS_COMPLETED_PROOF_LIFECYCLE_OVERLAY_END imports

// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_END imports

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const OUT_DIR = path.join(DATA_ROOT, "_diagnostics", `permanent-season-lifecycle-plan-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function hasDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function seasonLabelFromStartDate(date) {
  const y = Number(String(date).slice(0, 4));
  const m = Number(String(date).slice(5, 7));
  if (!y || !m) return null;
  if (m >= 7) return `${y}-${y + 1}`;
  return `${y}`;
}

function nextSeasonLabel(label) {
  const s = String(label || "");
  const m = s.match(/^(\d{4})-(\d{4})$/);
  if (m) return `${Number(m[1]) + 1}-${Number(m[2]) + 1}`;
  const y = Number(s);
  if (y) return `${y + 1}`;
  return null;
}

function parseDateMs(v) {
  if (!hasDate(v)) return null;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

const todayMs = Date.parse(`${DATE}T00:00:00Z`);
const ledgerDir = path.join(DATA_ROOT, "_diagnostics", `season-lane-coverage-ledger-${DATE}`);
const ledgerRowsPath = path.join(ledgerDir, `season-lane-coverage-ledger-rows-${DATE}.jsonl`);
const ledgerRows = readJsonl(ledgerRowsPath);

const stateDir = path.join(DATA_ROOT, "_state", "season-start-date-evidence");
const startDateStateFiles = walk(stateDir)
  .filter((f) => /accepted-season-start-date-evidence-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

const startDateEvidenceBySlug = new Map();
for (const file of startDateStateFiles) {
  for (const row of readJsonl(file)) {
    if (!row.competitionSlug || !hasDate(row.nextSeasonStartDate)) continue;
    const key = `${row.competitionSlug}|${row.seasonLabel || seasonLabelFromStartDate(row.nextSeasonStartDate) || "unknown"}`;
    if (!startDateEvidenceBySlug.has(key)) {
      startDateEvidenceBySlug.set(key, { ...row, evidenceStatePath: rel(file) });
    }
  }
}

const routeConfigPath = path.join(ROOT, "engine-v1", "config", "football-truth-browser-rendered-official-route-families.json");
const routeConfig = readJsonSafe(routeConfigPath);
const routeTargetsBySlug = new Map();
for (const family of routeConfig?.families || []) {
  for (const c of family.competitions || []) {
    if (!c.competitionSlug) continue;
    routeTargetsBySlug.set(c.competitionSlug, {
      competitionSlug: c.competitionSlug,
      sourceHost: c.sourceHost || family.sourceHost || null,
      sourceUrl: c.sourceUrl || null,
      familyId: family.familyId || null,
      seasonScope: c.seasonScope || family.seasonScope || null,
      seasonLabel: c.seasonLabel || family.seasonLabel || null
    });
  }
}

const lifecycleRows = [];
const dueTasks = [];

for (const row of ledgerRows) {
  const slug = row.competitionSlug;
  const route = routeTargetsBySlug.get(slug) || {};
  const evidenceRows = [...startDateEvidenceBySlug.values()].filter((e) => e.competitionSlug === slug);
  evidenceRows.sort((a, b) => String(a.nextSeasonStartDate).localeCompare(String(b.nextSeasonStartDate)));

  const activeEvidence = evidenceRows.find((e) => {
    const ms = parseDateMs(e.nextSeasonStartDate);
    return ms !== null && ms >= todayMs;
  }) || evidenceRows[evidenceRows.length - 1] || null;

  const nextSeasonStartDate = activeEvidence?.nextSeasonStartDate || row.nextSeasonStartDate || null;
  const inferredSeasonLabel = activeEvidence?.seasonLabel || seasonLabelFromStartDate(nextSeasonStartDate) || route.seasonLabel || null;
  const followingSeasonLabel = nextSeasonLabel(inferredSeasonLabel);

  let lifecycleState = "unknown_needs_discovery";
  if (row.previousCompletedStandingsSatisfied && nextSeasonStartDate) lifecycleState = "previous_completed_plus_next_start_ready";
  else if (row.previousCompletedStandingsSatisfied) lifecycleState = "previous_completed_missing_next_start";
  else if (nextSeasonStartDate) lifecycleState = "next_start_known_missing_previous_completed";
  else lifecycleState = "missing_previous_completed_and_next_start";

  const daysToStart = nextSeasonStartDate ? Math.ceil((parseDateMs(nextSeasonStartDate) - todayMs) / 86400000) : null;

  const permanentRow = {
    competitionSlug: slug,
    competitionName: row.competitionName || slug,
    lifecycleState,
    previousCompletedStandingsSatisfied: Boolean(row.previousCompletedStandingsSatisfied),
    currentOrNewSeasonStandingsSatisfied: Boolean(row.currentOrNewSeasonStandingsSatisfied),
    nextSeasonStartDateSatisfied: Boolean(nextSeasonStartDate),
    nextSeasonStartDate,
    activeSeasonLabel: inferredSeasonLabel,
    followingSeasonLabel,
    daysToStart,
    sourceHost: row.sourceHost || route.sourceHost || null,
    sourceUrl: row.sourceUrl || route.sourceUrl || null,
    evidenceStatePath: activeEvidence?.evidenceStatePath || null,
    evidenceStatus: activeEvidence?.evidenceStatus || null,
    permanentMaintenancePolicy: {
      previousCompletedStandings: "retain_forever_as_historical_statistical_baseline",
      currentSeasonStandings: "refresh_when_season_active_or_start_date_within_window",
      nextSeasonStartDate: "refresh_until_verified_then_roll_forward_after_season_start",
      futureSeasonRollover: "after_start_date_passes_create_next_required_start_date_lane"
    }
  };

  lifecycleRows.push(permanentRow);

  if (!row.previousCompletedStandingsSatisfied) {
    dueTasks.push({
      competitionSlug: slug,
      taskType: "acquire_previous_completed_standings",
      priority: route.sourceHost ? 20 : 50,
      reason: "missing_previous_completed_standings",
      sourceHostHint: row.sourceHost || route.sourceHost || null
    });
  }

  if (!nextSeasonStartDate) {
    dueTasks.push({
      competitionSlug: slug,
      taskType: "acquire_next_season_start_date",
      priority: row.previousCompletedStandingsSatisfied ? 5 : route.sourceHost ? 25 : 60,
      reason: "missing_verified_next_season_start_date",
      targetSeasonLabel: followingSeasonLabel || "next",
      sourceHostHint: row.sourceHost || route.sourceHost || null
    });
  }

  if (nextSeasonStartDate && daysToStart !== null && daysToStart <= 45 && daysToStart >= -14) {
    dueTasks.push({
      competitionSlug: slug,
      taskType: "activate_current_or_new_season_standings_refresh",
      priority: 1,
      reason: "season_start_window",
      nextSeasonStartDate,
      daysToStart,
      sourceHostHint: row.sourceHost || route.sourceHost || null
    });
  }

  if (nextSeasonStartDate && daysToStart !== null && daysToStart < 0) {
    dueTasks.push({
      competitionSlug: slug,
      taskType: "roll_forward_next_season_start_date_lane",
      priority: 3,
      reason: "known_start_date_has_passed_or_season_started",
      completedStartDate: nextSeasonStartDate,
      nextRequiredSeasonLabel: followingSeasonLabel
    });
  }
}

dueTasks.sort((a, b) => a.priority - b.priority || a.competitionSlug.localeCompare(b.competitionSlug) || a.taskType.localeCompare(b.taskType));

const summary = {
  status: "passed",
  runner: "permanent_season_lifecycle_plan",
  lifecycleContractVersion: 1,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  lifecyclePlanWriteExecutedNowCount: 1,
  ledgerRowsPath: rel(ledgerRowsPath),
  startDateEvidenceStateFileCount: startDateStateFiles.length,
  acceptedStartDateEvidenceSeasonRowCount: startDateEvidenceBySlug.size,
  lifecycleRowCount: lifecycleRows.length,
  previousCompletedSatisfiedCount: lifecycleRows.filter((r) => r.previousCompletedStandingsSatisfied).length,
  nextSeasonStartDateSatisfiedCount: lifecycleRows.filter((r) => r.nextSeasonStartDateSatisfied).length,
  currentOrNewSeasonSatisfiedCount: lifecycleRows.filter((r) => r.currentOrNewSeasonStandingsSatisfied).length,
  permanentDueTaskCount: dueTasks.length,
  duePreviousCompletedStandingsCount: dueTasks.filter((t) => t.taskType === "acquire_previous_completed_standings").length,
  dueNextSeasonStartDateCount: dueTasks.filter((t) => t.taskType === "acquire_next_season_start_date").length,
  dueCurrentSeasonRefreshCount: dueTasks.filter((t) => t.taskType === "activate_current_or_new_season_standings_refresh").length,
  dueSeasonRolloverCount: dueTasks.filter((t) => t.taskType === "roll_forward_next_season_start_date_lane").length,
  nextSeasonStartDateSatisfiedSlugs: lifecycleRows.filter((r) => r.nextSeasonStartDateSatisfied).map((r) => r.competitionSlug),
  recommendedNextLane: "expand_official_rendered_standings_source_families_and_feed_permanent_lifecycle_tasks"
};

const outPath = path.join(OUT_DIR, `permanent-season-lifecycle-plan-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `permanent-season-lifecycle-rows-${DATE}.jsonl`);
const duePath = path.join(OUT_DIR, `permanent-season-lifecycle-due-tasks-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, lifecycleRows, dueTasksSample: dueTasks.slice(0, 250) }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, lifecycleRows.map((r) => JSON.stringify(r)).join("\n") + (lifecycleRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(duePath, dueTasks.map((r) => JSON.stringify(r)).join("\n") + (dueTasks.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  lifecycleRowsOutput: rel(rowsPath),
  dueTasksOutput: rel(duePath),
  summary
}, null, 2));

// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_START post-run
function CURRENT_OR_NEW_abs(p) {
  return CURRENT_OR_NEW_PATH.join(process.cwd(), p);
}

function CURRENT_OR_NEW_walk(dir, predicate, out = []) {
  const full = CURRENT_OR_NEW_abs(dir);
  if (!CURRENT_OR_NEW_FS.existsSync(full)) return out;
  for (const entry of CURRENT_OR_NEW_FS.readdirSync(full, { withFileTypes: true })) {
    const rel = CURRENT_OR_NEW_PATH.posix.join(dir.replace(/\\/g, "/"), entry.name);
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

  CURRENT_OR_NEW_FS.writeFileSync(artifactPath, JSON.stringify(output, null, 2) + "\n");

  console.log(JSON.stringify({
    currentOrNewLifecycleIntegration: output.currentOrNewLifecycleIntegration
  }, null, 2));
}

applyCurrentOrNewDiagnosticLifecycleOverlay("^permanent-season-lifecycle-plan-\\d{4}-\\d{2}-\\d{2}\\.json$");
// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_END post-run

// PREVIOUS_COMPLETED_PROOF_LIFECYCLE_OVERLAY_START post-run
function PREVIOUS_COMPLETED_PROOF_abs(p) {
  return PREVIOUS_COMPLETED_PROOF_PATH.join(process.cwd(), p);
}

function PREVIOUS_COMPLETED_PROOF_walk(dir, predicate, out = []) {
  const full = PREVIOUS_COMPLETED_PROOF_abs(dir);
  if (!PREVIOUS_COMPLETED_PROOF_FS.existsSync(full)) return out;
  for (const entry of PREVIOUS_COMPLETED_PROOF_FS.readdirSync(full, { withFileTypes: true })) {
    const rel = PREVIOUS_COMPLETED_PROOF_PATH.posix.join(dir.replace(/\\/g, "/"), entry.name);
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
  return PREVIOUS_COMPLETED_PROOF_FS.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function PREVIOUS_COMPLETED_PROOF_writeJsonl(rel, rows) {
  PREVIOUS_COMPLETED_PROOF_FS.writeFileSync(PREVIOUS_COMPLETED_PROOF_abs(rel), rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
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
  const files = PREVIOUS_COMPLETED_PROOF_walk(dir, p => /^source-family-expansion-board-\d{4}-\d{2}-\d{2}\.jsonl$/.test(PREVIOUS_COMPLETED_PROOF_PATH.basename(p)));
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
  const suppressedDue = PREVIOUS_COMPLETED_PROOF_filterTaskJsonlInDir(dir, /(?:due-tasks|accepted-prioritized-lifecycle-tasks)-\d{4}-\d{2}-\d{2}\.jsonl$/, satisfied);
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

  PREVIOUS_COMPLETED_PROOF_FS.writeFileSync(artifactPath, JSON.stringify(output, null, 2) + "\n");

  console.log(JSON.stringify({
    previousCompletedLifecycleIntegration: output.previousCompletedLifecycleIntegration,
    suppressedDue,
    suppressedSourceFamily
  }, null, 2));
}

applyPreviousCompletedDiagnosticProofLifecycleOverlay("^permanent-season-lifecycle-plan-\\d{4}-\\d{2}-\\d{2}\\.json$");
// PREVIOUS_COMPLETED_PROOF_LIFECYCLE_OVERLAY_END post-run

