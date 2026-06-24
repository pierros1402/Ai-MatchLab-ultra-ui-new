#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

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

function normalizeDate(value) {
  const text = asText(value);
  const match = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return match ? match[0] : "";
}

function parseArgs(argv) {
  const args = {
    inventory: "",
    output: "",
    maxTasks: 0,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--inventory") args.inventory = argv[++i] || "";
    else if (arg.startsWith("--inventory=")) args.inventory = arg.slice("--inventory=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--max-tasks") args.maxTasks = Number(argv[++i] || 0);
    else if (arg.startsWith("--max-tasks=")) args.maxTasks = Number(arg.slice("--max-tasks=".length));
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.inventory) throw new Error("--inventory is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");
  args.maxTasks = Number.isFinite(args.maxTasks) && args.maxTasks > 0 ? Math.floor(args.maxTasks) : 0;

  return args;
}

function compactWords(value) {
  return asText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFor(row) {
  return compactWords(row.competitionName) || compactWords(row.competitionSlug);
}

function countryFor(row) {
  return compactWords(row.country || row.region);
}

function priorityFor(taskType, row) {
  const family = asText(row.family);
  const slug = asText(row.competitionSlug);

  if (taskType === "uefa_qualifier_calendar_search") return "high";
  if (taskType.includes("winner")) return "high";
  if (taskType.includes("final_table")) return "high";
  if (family === "continental" || family === "global") return "high";
  if (slug.endsWith(".1") && family === "league") return "medium";
  if (family === "cup") return "medium";
  return "normal";
}

function queryFor(taskType, row) {
  const name = titleFor(row);
  const country = countryFor(row);
  const slug = asText(row.competitionSlug);
  const targetDate = asText(row.targetDate);
  const seasonKey = asText(row.seasonKey);

  const subject = [name, country].filter(Boolean).join(" ");

  if (taskType === "standings_search") {
    return `${subject} ${seasonKey} league table standings official`;
  }

  if (taskType === "standings_currency_or_final_table_search") {
    return `${subject} ${seasonKey} final table current standings official`;
  }

  if (taskType === "season_calendar_search") {
    return `${subject} ${seasonKey} fixtures calendar season dates official`;
  }

  if (taskType === "next_season_start_or_current_round_search") {
    return `${subject} next season start date current round fixtures ${targetDate} official`;
  }

  if (taskType === "cup_status_search") {
    return `${subject} ${seasonKey} cup current round phase official`;
  }

  if (taskType === "cup_calendar_search") {
    return `${subject} ${seasonKey} cup fixtures calendar official`;
  }

  if (taskType === "cup_winner_search") {
    return `${subject} ${seasonKey} cup final winner official`;
  }

  if (taskType === "continental_status_search") {
    return `${subject} ${seasonKey} competition current phase official`;
  }

  if (taskType === "continental_calendar_search") {
    return `${subject} ${seasonKey} fixtures calendar qualifying rounds official`;
  }

  if (taskType === "continental_winner_search") {
    return `${subject} ${seasonKey} final winner official`;
  }

  if (taskType === "uefa_qualifier_calendar_search") {
    return `${subject} ${seasonKey} qualifying round start dates preliminary draw official UEFA`;
  }

  if (taskType === "global_tournament_status_search") {
    return `${subject} ${seasonKey} tournament status current phase official`;
  }

  if (taskType === "global_tournament_calendar_search") {
    return `${subject} ${seasonKey} tournament fixtures calendar official`;
  }

  if (taskType === "global_tournament_winner_search") {
    return `${subject} ${seasonKey} tournament final winner official`;
  }

  if (taskType === "target_date_fixture_verification") {
    return `${subject} fixtures ${targetDate} official`;
  }

  if (taskType === "target_date_fixture_search") {
    return `${subject} matches ${targetDate} official fixtures`;
  }

  return `${subject} ${slug} ${seasonKey} official football competition evidence`;
}

function evidenceKindFor(taskType) {
  if (taskType.includes("standings")) return "standings";
  if (taskType.includes("calendar") || taskType.includes("start") || taskType.includes("current_round")) return "calendar";
  if (taskType.includes("winner")) return "winner";
  if (taskType.includes("status") || taskType.includes("phase")) return "status";
  if (taskType.includes("fixture")) return "fixture";
  return "competition_state";
}

function taskIdFor(row, taskType) {
  return [
    asText(row.targetDate),
    asText(row.competitionSlug),
    taskType
  ].filter(Boolean).join("::");
}

function buildTask(row, taskType) {
  return {
    taskId: taskIdFor(row, taskType),
    taskType,
    evidenceKind: evidenceKindFor(taskType),
    priority: priorityFor(taskType, row),
    competitionSlug: asText(row.competitionSlug),
    competitionName: asText(row.competitionName),
    competitionType: asText(row.competitionType),
    family: asText(row.family),
    country: asText(row.country),
    region: asText(row.region),
    targetDate: asText(row.targetDate),
    seasonKey: asText(row.seasonKey),
    competitionState: asText(row.competitionState),
    evidenceNeeds: asArray(row.evidenceNeeds),
    query: queryFor(taskType, row),
    sourcePolicy: {
      preferOfficial: true,
      allowTrustedSportsSitesForCrosscheck: true,
      requireEvidenceExtraction: true,
      noCanonicalWrites: true,
      noFetchInThisJob: true
    }
  };
}

function buildTasks(inventory) {
  const rows = asArray(inventory.rows);
  const tasks = [];
  const seen = new Set();

  for (const row of rows) {
    const recommended = asArray(row.recommendedNextEvidenceSearch);

    for (const taskType of recommended) {
      const cleanType = asText(taskType);
      if (!cleanType) continue;

      const task = buildTask(row, cleanType);
      if (!task.taskId || seen.has(task.taskId)) continue;

      seen.add(task.taskId);
      tasks.push(task);
    }
  }

  const priorityRank = { high: 0, medium: 1, normal: 2, low: 3 };
  return tasks.sort((a, b) => {
    const pa = priorityRank[a.priority] ?? 9;
    const pb = priorityRank[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    if (a.family !== b.family) return a.family.localeCompare(b.family);
    if (a.competitionSlug !== b.competitionSlug) return a.competitionSlug.localeCompare(b.competitionSlug);
    return a.taskType.localeCompare(b.taskType);
  });
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport({ inventory, maxTasks = 0 }) {
  const allTasks = buildTasks(inventory);
  const tasks = maxTasks > 0 ? allTasks.slice(0, maxTasks) : allTasks;

  const summary = {
    sourceInventoryJob: asText(inventory.job),
    targetDate: asText(inventory.summary && inventory.summary.targetDate),
    seasonKey: asText(inventory.summary && inventory.summary.seasonKey),
    coverageRowCount: Number(inventory.summary && inventory.summary.coverageRowCount || 0),
    totalTaskCount: allTasks.length,
    emittedTaskCount: tasks.length,
    limited: maxTasks > 0 && tasks.length < allTasks.length,
    byTaskType: countBy(tasks, "taskType"),
    byEvidenceKind: countBy(tasks, "evidenceKind"),
    byFamily: countBy(tasks, "family"),
    byPriority: countBy(tasks, "priority"),
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false
  };

  return {
    ok: true,
    job: "materialize-coverage-competition-state-evidence-tasks-file",
    generatedAt: new Date().toISOString(),
    summary,
    tasks,
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
  const inventory = {
    job: "build-coverage-competition-state-inventory-file",
    summary: {
      targetDate: "2026-06-03",
      seasonKey: "2025-2026",
      coverageRowCount: 4
    },
    rows: [
      {
        competitionSlug: "eng.1",
        competitionName: "Premier League",
        competitionType: "league",
        family: "league",
        country: "england",
        targetDate: "2026-06-03",
        seasonKey: "2025-2026",
        competitionState: "unknown_needs_competition_state_evidence",
        evidenceNeeds: ["standings_evidence", "season_calendar_evidence"],
        recommendedNextEvidenceSearch: ["standings_search", "season_calendar_search", "next_season_start_or_current_round_search"]
      },
      {
        competitionSlug: "eng.fa",
        competitionName: "FA Cup",
        competitionType: "cup",
        family: "cup",
        country: "england",
        targetDate: "2026-06-03",
        seasonKey: "2025-2026",
        competitionState: "unknown_needs_competition_state_evidence",
        evidenceNeeds: ["cup_phase_evidence", "cup_calendar_evidence", "cup_final_or_winner_evidence"],
        recommendedNextEvidenceSearch: ["cup_status_search", "cup_calendar_search", "cup_winner_search"]
      },
      {
        competitionSlug: "uefa.champions",
        competitionName: "UEFA Champions League",
        competitionType: "continental",
        family: "continental",
        country: "uefa",
        targetDate: "2026-06-03",
        seasonKey: "2025-2026",
        competitionState: "unknown_needs_competition_state_evidence",
        evidenceNeeds: ["continental_calendar_evidence", "uefa_qualifier_start_date_evidence"],
        recommendedNextEvidenceSearch: ["continental_status_search", "continental_calendar_search", "continental_winner_search", "uefa_qualifier_calendar_search"]
      },
      {
        competitionSlug: "fifa.club_world_cup",
        competitionName: "FIFA Club World Cup",
        competitionType: "global",
        family: "global",
        country: "global",
        targetDate: "2026-06-03",
        seasonKey: "2025-2026",
        competitionState: "unknown_needs_competition_state_evidence",
        evidenceNeeds: ["global_tournament_calendar_evidence"],
        recommendedNextEvidenceSearch: ["global_tournament_status_search", "global_tournament_calendar_search", "global_tournament_winner_search"]
      }
    ]
  };

  const report = buildReport({ inventory });

  if (report.summary.totalTaskCount !== 13) throw new Error("expected 13 evidence tasks");
  if (report.summary.byTaskType.standings_search !== 1) throw new Error("expected one standings search task");
  if (report.summary.byTaskType.cup_winner_search !== 1) throw new Error("expected one cup winner task");
  if (report.summary.byTaskType.uefa_qualifier_calendar_search !== 1) throw new Error("expected one UEFA qualifier task");
  if (report.summary.byEvidenceKind.winner !== 3) throw new Error("expected three winner tasks");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees changed");

  return {
    ok: true,
    selfTest: "materialize-coverage-competition-state-evidence-tasks-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const inventory = readJson(args.inventory);
  const report = buildReport({ inventory, maxTasks: args.maxTasks });
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

export { buildReport, buildTasks, buildTask };