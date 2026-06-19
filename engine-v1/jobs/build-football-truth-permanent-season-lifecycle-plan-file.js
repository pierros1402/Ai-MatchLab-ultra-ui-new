#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_START imports
import * as CURRENT_OR_NEW_FS from "fs";
import * as CURRENT_OR_NEW_PATH from "path";
import { loadCurrentOrNewDiagnosticState as CURRENT_OR_NEW_loadDiagnosticState } from "../lib/football-truth-current-or-new-diagnostic-state-loader.js";
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

