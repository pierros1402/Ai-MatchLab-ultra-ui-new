#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

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
