#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

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

const sourceFamilyExpansionBoard = immediateOfficialRenderedFamilyTargets.map((family) => ({
  ...family,
  targetCount: family.slugs.length,
  lifecycleTasks: family.slugs.flatMap((slug) => accepted.filter((r) => r.competitionSlug === slug)),
  blockedUntilInspected: ["eredivisie_official_rendered","premierleague_official_rendered","serie_a_official_rendered"].includes(family.familyId),
  recommendedAction:
    family.familyId === "spfl_official_rendered"
      ? "add_family_to_browser_rendered_config_and_run_expected_rows_gate"
      : "inspect_rendered_table_cells_before_config_acceptance"
}));

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
  recommendedNextLane: "add_spfl_official_rendered_family_to_config_then_run_browser_rendered_adapter_expected_rows_gate"
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
