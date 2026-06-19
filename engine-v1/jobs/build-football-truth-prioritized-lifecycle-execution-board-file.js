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
const PLAN_DIR = path.join(DATA_ROOT, "_diagnostics", `permanent-season-lifecycle-plan-${DATE}`);
const DUE_PATH = path.join(PLAN_DIR, `permanent-season-lifecycle-due-tasks-${DATE}.jsonl`);
const ROWS_PATH = path.join(PLAN_DIR, `permanent-season-lifecycle-rows-${DATE}.jsonl`);
const OUT_DIR = path.join(DATA_ROOT, "_diagnostics", `prioritized-lifecycle-execution-board-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
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

const highValuePrefixes = new Set([
  "eng","esp","ger","ita","fra","por","ned","bel","aut","sui","tur","gre","sco","den","swe","nor","fin","pol","cze","cro","ser","ukr","rus",
  "arg","bra","mex","usa","can","jpn","kor","aus","chn","ksa","qat"
]);

const uefaLikePrefixes = new Set([
  "alb","and","arm","aut","aze","bel","bih","blr","bul","cro","cyp","cze","den","eng","esp","est","fin","fra","fro","geo","ger","gib","gre",
  "hun","irl","isl","isr","ita","kaz","kos","lva","ltu","lux","mda","mkd","mlt","mne","ned","nir","nor","pol","por","rom","rus","sco","ser",
  "sui","svk","svn","swe","tur","ukr","wal"
]);

const suppressedPrefixes = new Set(["afg","aia","asa","awd"]);
const noisePrefixes = new Set(["www","klo","abc","bad"]);

function validLeagueSlug(slug) {
  return /^[a-z]{3}\.[1-9]\d*$/.test(String(slug || "")) && !noisePrefixes.has(String(slug).split(".")[0]);
}

function priorityScore(task, lifecycleRow) {
  const slug = task.competitionSlug;
  const [prefix, tierText] = String(slug).split(".");
  const tier = Number(tierText);
  let score = 0;

  if (task.taskType === "activate_current_or_new_season_standings_refresh") score += 100000;
  if (task.taskType === "roll_forward_next_season_start_date_lane") score += 90000;
  if (task.taskType === "acquire_next_season_start_date") score += 60000;
  if (task.taskType === "acquire_previous_completed_standings") score += 50000;

  if (lifecycleRow?.previousCompletedStandingsSatisfied) score += 20000;
  if (lifecycleRow?.sourceHost) score += 12000;
  if (highValuePrefixes.has(prefix)) score += 10000;
  if (uefaLikePrefixes.has(prefix)) score += 5000;

  if (tier === 1) score += 3000;
  else if (tier === 2) score += 2000;
  else if (tier === 3) score += 1000;

  if (suppressedPrefixes.has(prefix)) score -= 50000;
  if (!validLeagueSlug(slug)) score -= 100000;

  return score;
}

const tasks = readJsonl(DUE_PATH);
const lifecycleRows = readJsonl(ROWS_PATH);
const rowBySlug = new Map(lifecycleRows.map((r) => [r.competitionSlug, r]));

const rows = tasks.map((task) => {
  const lifecycleRow = rowBySlug.get(task.competitionSlug) || {};
  const prefix = String(task.competitionSlug || "").split(".")[0];
  const validSlug = validLeagueSlug(task.competitionSlug);
  const suppressedLowValue = suppressedPrefixes.has(prefix);
  const score = priorityScore(task, lifecycleRow);

  return {
    ...task,
    validSlug,
    suppressedLowValue,
    highValuePrefix: highValuePrefixes.has(prefix),
    uefaLikePrefix: uefaLikePrefixes.has(prefix),
    lifecycleState: lifecycleRow.lifecycleState || null,
    previousCompletedStandingsSatisfied: Boolean(lifecycleRow.previousCompletedStandingsSatisfied),
    nextSeasonStartDateSatisfied: Boolean(lifecycleRow.nextSeasonStartDateSatisfied),
    currentOrNewSeasonStandingsSatisfied: Boolean(lifecycleRow.currentOrNewSeasonStandingsSatisfied),
    sourceHost: lifecycleRow.sourceHost || task.sourceHostHint || null,
    score,
    executionLane:
      task.taskType === "acquire_previous_completed_standings" ? "official_rendered_or_provider_standings_expansion" :
      task.taskType === "acquire_next_season_start_date" ? "official_start_date_evidence_discovery" :
      task.taskType === "activate_current_or_new_season_standings_refresh" ? "current_standings_refresh" :
      "season_rollover"
  };
});

const accepted = rows
  .filter((r) => r.validSlug && !r.suppressedLowValue)
  .sort((a, b) => b.score - a.score || a.competitionSlug.localeCompare(b.competitionSlug) || a.taskType.localeCompare(b.taskType));

const rejected = rows.filter((r) => !r.validSlug || r.suppressedLowValue);

const standingsExpansionTargets = accepted.filter((r) => r.executionLane === "official_rendered_or_provider_standings_expansion");
const startDateTargets = accepted.filter((r) => r.executionLane === "official_start_date_evidence_discovery");

const immediateOfficialRenderedFamilyTargets = [
  { familyId: "spfl_official_rendered", slugs: ["sco.1","sco.2"], reason: "previous diagnostic showed strong official rendered tables" },
  { familyId: "eredivisie_official_rendered", slugs: ["ned.1"], reason: "previous diagnostic showed rendered table signal; inspect before accepting" },
  { familyId: "premierleague_official_rendered", slugs: ["eng.1"], reason: "official rendered table exists but likely new-season zero table; requires currentness gate" },
  { familyId: "serie_a_official_rendered", slugs: ["ita.1"], reason: "official rendered table exists but likely new-season zero table; requires currentness gate" }
];

const standingsExpansionSlugSet = new Set(standingsExpansionTargets.map((r) => r.competitionSlug));
const blockedOfficialRenderedFamilyIds = new Set(["premierleague_official_rendered","serie_a_official_rendered"]);

const sourceFamilyExpansionBoard = immediateOfficialRenderedFamilyTargets
  .map((family) => {
    const lifecycleTasks = family.slugs.flatMap((slug) => accepted.filter((r) => r.competitionSlug === slug));
    const standingsLifecycleTasks = lifecycleTasks.filter((task) => task.taskType === "acquire_previous_completed_standings");
    const startDateLifecycleTasks = lifecycleTasks.filter((task) => task.taskType === "acquire_next_season_start_date");
    const standingTargetSlugs = family.slugs.filter((slug) => standingsExpansionSlugSet.has(slug));
    const blockedUntilInspected = blockedOfficialRenderedFamilyIds.has(family.familyId);
    const excludedFromStandingsExpansion = standingTargetSlugs.length === 0;
    const exclusionReason =
      excludedFromStandingsExpansion && lifecycleTasks.length > 0
        ? "previous_completed_standings_already_satisfied_only_non_standings_lifecycle_tasks_remain"
        : excludedFromStandingsExpansion
          ? "no_active_previous_completed_standings_task_for_family"
          : null;
    return {
      ...family,
      originalSlugs: family.slugs,
      slugs: standingTargetSlugs,
      targetCount: standingTargetSlugs.length,
      lifecycleTasks,
      standingsLifecycleTasks,
      startDateLifecycleTasks,
      excludedFromStandingsExpansion,
      exclusionReason,
      blockedUntilInspected,
      recommendedAction:
        blockedUntilInspected
          ? "inspect_rendered_table_cells_before_config_acceptance"
          : "add_family_to_browser_rendered_config_and_run_expected_rows_gate"
    };
  })
  .filter((family) => !family.excludedFromStandingsExpansion);

const recommendedNextLane =
  sourceFamilyExpansionBoard.some((family) => !family.blockedUntilInspected)
    ? "add_next_unblocked_official_rendered_family_to_config_then_run_expected_rows_gate"
    : sourceFamilyExpansionBoard.some((family) => family.blockedUntilInspected)
      ? "inspect_blocked_official_rendered_table_cells_before_config_acceptance"
      : "mine_additional_official_api_or_provider_source_families_for_standings_expansion";

const summary = {
  status: "passed",
  runner: "prioritized_lifecycle_execution_board",
  sourceDueTasksPath: rel(DUE_PATH),
  sourceLifecycleRowsPath: rel(ROWS_PATH),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  inputDueTaskCount: tasks.length,
  acceptedExecutableTaskCount: accepted.length,
  rejectedTaskCount: rejected.length,
  rejectedInvalidSlugCount: rejected.filter((r) => !r.validSlug).length,
  rejectedSuppressedLowValueCount: rejected.filter((r) => r.suppressedLowValue).length,
  standingsExpansionTargetCount: standingsExpansionTargets.length,
  startDateEvidenceTargetCount: startDateTargets.length,
  highValueAcceptedTaskCount: accepted.filter((r) => r.highValuePrefix).length,
  uefaLikeAcceptedTaskCount: accepted.filter((r) => r.uefaLikePrefix).length,
  immediateOfficialRenderedFamilyTargetCount: sourceFamilyExpansionBoard.length,
  recommendedNextLane
};

const outPath = path.join(OUT_DIR, `prioritized-lifecycle-execution-board-${DATE}.json`);
const acceptedPath = path.join(OUT_DIR, `accepted-prioritized-lifecycle-tasks-${DATE}.jsonl`);
const rejectedPath = path.join(OUT_DIR, `rejected-prioritized-lifecycle-tasks-${DATE}.jsonl`);
const familyBoardPath = path.join(OUT_DIR, `source-family-expansion-board-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, sourceFamilyExpansionBoard, topAcceptedTasks: accepted.slice(0, 250) }, null, 2) + "\n", "utf8");
fs.writeFileSync(acceptedPath, accepted.map((r) => JSON.stringify(r)).join("\n") + (accepted.length ? "\n" : ""), "utf8");
fs.writeFileSync(rejectedPath, rejected.map((r) => JSON.stringify(r)).join("\n") + (rejected.length ? "\n" : ""), "utf8");
fs.writeFileSync(familyBoardPath, sourceFamilyExpansionBoard.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  acceptedTasksOutput: rel(acceptedPath),
  rejectedTasksOutput: rel(rejectedPath),
  sourceFamilyExpansionBoardOutput: rel(familyBoardPath),
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

applyCurrentOrNewDiagnosticLifecycleOverlay("^prioritized-lifecycle-execution-board-\\d{4}-\\d{2}-\\d{2}\\.json$");
// CURRENT_OR_NEW_LIFECYCLE_OVERLAY_END post-run

