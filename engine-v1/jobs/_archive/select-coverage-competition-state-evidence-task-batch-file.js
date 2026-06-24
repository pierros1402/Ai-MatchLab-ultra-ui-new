#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const DEFAULT_TOP_LEAGUE_SLUGS = new Set([
  "arg.1", "bra.1", "bra.2", "usa.1", "can.1", "mex.1",
  "swe.1", "nor.1", "fin.1", "isl.1", "irl.1",
  "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "ned.1", "por.1",
  "bel.1", "aut.1", "den.1", "gre.1", "sco.1", "tur.1"
]);

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseList(value) {
  return asText(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const args = {
    tasks: "",
    output: "",
    maxTasks: 80,
    includeTopLeagues: true,
    topLeagues: [],
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--tasks") args.tasks = argv[++i] || "";
    else if (arg.startsWith("--tasks=")) args.tasks = arg.slice("--tasks=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--max-tasks") args.maxTasks = Number(argv[++i] || 80);
    else if (arg.startsWith("--max-tasks=")) args.maxTasks = Number(arg.slice("--max-tasks=".length));
    else if (arg === "--no-top-leagues") args.includeTopLeagues = false;
    else if (arg === "--top-leagues") args.topLeagues = parseList(argv[++i] || "");
    else if (arg.startsWith("--top-leagues=")) args.topLeagues = parseList(arg.slice("--top-leagues=".length));
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.tasks) throw new Error("--tasks is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.maxTasks = Number.isFinite(args.maxTasks) && args.maxTasks > 0 ? Math.floor(args.maxTasks) : 80;
  return args;
}

function scoreTask(task, topLeagueSlugs) {
  const taskType = asText(task.taskType);
  const slug = asText(task.competitionSlug);
  const family = asText(task.family);
  let score = 0;
  const reasons = [];

  if (taskType === "uefa_qualifier_calendar_search") {
    score += 1000;
    reasons.push("uefa_qualifier_calendar");
  }

  if (family === "continental") {
    score += 800;
    reasons.push("continental_competition_state");
  }

  if (family === "global") {
    score += 760;
    reasons.push("global_competition_state");
  }

  if (taskType.includes("winner")) {
    score += 220;
    reasons.push("winner_or_final_evidence");
  }

  if (taskType.includes("status")) {
    score += 180;
    reasons.push("status_or_phase_evidence");
  }

  if (taskType.includes("calendar") || taskType.includes("start") || taskType.includes("current_round")) {
    score += 150;
    reasons.push("calendar_or_start_evidence");
  }

  if (topLeagueSlugs.has(slug) && family === "league") {
    score += 520;
    reasons.push("top_or_seasonally_relevant_league");
  }

  if (family === "league" && taskType === "standings_currency_or_final_table_search") {
    score += 180;
    reasons.push("existing_standings_needs_currency_or_final_table");
  }

  if (family === "league" && taskType === "standings_search") {
    score += 90;
    reasons.push("missing_standings");
  }

  if (slug.endsWith(".1") && family === "league") {
    score += 80;
    reasons.push("top_tier_league");
  }

  const priority = asText(task.priority);
  if (priority === "high") score += 60;
  else if (priority === "medium") score += 30;

  return { score, reasons };
}

function selectTasks(report, options = {}) {
  const allTasks = asArray(report.tasks);
  const configuredTop = options.topLeagues && options.topLeagues.length
    ? new Set(options.topLeagues)
    : DEFAULT_TOP_LEAGUE_SLUGS;
  const topLeagueSlugs = options.includeTopLeagues === false ? new Set() : configuredTop;

  const scored = allTasks.map((task) => {
    const scoredTask = scoreTask(task, topLeagueSlugs);
    return {
      ...task,
      selectionScore: scoredTask.score,
      selectionReasons: scoredTask.reasons
    };
  });

  const selected = scored
    .filter((task) => task.selectionScore > 0)
    .sort((a, b) => {
      if (b.selectionScore !== a.selectionScore) return b.selectionScore - a.selectionScore;
      if (a.family !== b.family) return a.family.localeCompare(b.family);
      if (a.competitionSlug !== b.competitionSlug) return a.competitionSlug.localeCompare(b.competitionSlug);
      return a.taskType.localeCompare(b.taskType);
    })
    .slice(0, options.maxTasks || 80);

  return selected;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport({ taskReport, maxTasks = 80, includeTopLeagues = true, topLeagues = [] }) {
  const selectedTasks = selectTasks(taskReport, { maxTasks, includeTopLeagues, topLeagues });

  return {
    ok: true,
    job: "select-coverage-competition-state-evidence-task-batch-file",
    generatedAt: new Date().toISOString(),
    summary: {
      sourceTaskJob: asText(taskReport.job),
      targetDate: asText(taskReport.summary && taskReport.summary.targetDate),
      seasonKey: asText(taskReport.summary && taskReport.summary.seasonKey),
      sourceTaskCount: Number(taskReport.summary && taskReport.summary.totalTaskCount || asArray(taskReport.tasks).length),
      selectedTaskCount: selectedTasks.length,
      maxTasks,
      byTaskType: countBy(selectedTasks, "taskType"),
      byEvidenceKind: countBy(selectedTasks, "evidenceKind"),
      byFamily: countBy(selectedTasks, "family"),
      byPriority: countBy(selectedTasks, "priority"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false
    },
    tasks: selectedTasks,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      noFixtureWrites: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true
    }
  };
}

function runSelfTest() {
  const taskReport = {
    job: "materialize-coverage-competition-state-evidence-tasks-file",
    summary: {
      targetDate: "2026-06-03",
      seasonKey: "2025-2026",
      totalTaskCount: 5
    },
    tasks: [
      { taskType: "standings_search", evidenceKind: "standings", priority: "normal", competitionSlug: "afg.1", family: "league" },
      { taskType: "season_calendar_search", evidenceKind: "calendar", priority: "medium", competitionSlug: "swe.1", family: "league" },
      { taskType: "uefa_qualifier_calendar_search", evidenceKind: "calendar", priority: "high", competitionSlug: "uefa.champions", family: "continental" },
      { taskType: "continental_winner_search", evidenceKind: "winner", priority: "high", competitionSlug: "uefa.champions", family: "continental" },
      { taskType: "global_tournament_status_search", evidenceKind: "status", priority: "high", competitionSlug: "fifa.club_world_cup", family: "global" }
    ]
  };

  const report = buildReport({ taskReport, maxTasks: 3 });

  if (report.summary.selectedTaskCount !== 3) throw new Error("expected selected task limit");
  if (!report.tasks.find((task) => task.taskType === "uefa_qualifier_calendar_search")) throw new Error("expected UEFA qualifier task");
  if (!report.tasks.find((task) => task.family === "global")) throw new Error("expected global task");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees changed");

  return {
    ok: true,
    selfTest: "select-coverage-competition-state-evidence-task-batch-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const taskReport = readJson(args.tasks);
  const report = buildReport({
    taskReport,
    maxTasks: args.maxTasks,
    includeTopLeagues: args.includeTopLeagues,
    topLeagues: args.topLeagues
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport, selectTasks, scoreTask };