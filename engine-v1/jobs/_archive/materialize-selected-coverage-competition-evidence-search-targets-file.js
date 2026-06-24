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

function parseArgs(argv) {
  const args = {
    selectedTasks: "",
    output: "",
    maxTargets: 0,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--selected-tasks") args.selectedTasks = argv[++i] || "";
    else if (arg.startsWith("--selected-tasks=")) args.selectedTasks = arg.slice("--selected-tasks=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--max-targets") args.maxTargets = Number(argv[++i] || 0);
    else if (arg.startsWith("--max-targets=")) args.maxTargets = Number(arg.slice("--max-targets=".length));
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.selectedTasks) throw new Error("--selected-tasks is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");
  args.maxTargets = Number.isFinite(args.maxTargets) && args.maxTargets > 0 ? Math.floor(args.maxTargets) : 0;

  return args;
}

function compactWords(value) {
  return asText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function officialQueryFor(task) {
  return asText(task.query);
}

function federationQueryFor(task) {
  const name = compactWords(task.competitionName) || compactWords(task.competitionSlug);
  const country = compactWords(task.country || task.region);
  const season = asText(task.seasonKey);
  const type = asText(task.taskType);

  if (type.includes("uefa_qualifier")) return `${name} qualifying rounds ${season} official dates UEFA`;
  if (type.includes("continental")) return `${name} ${season} official competition fixtures results ${country}`;
  if (type.includes("global")) return `${name} ${season} official tournament fixtures results winner`;
  if (type.includes("winner")) return `${name} ${season} official final winner ${country}`;
  if (type.includes("standings")) return `${name} ${season} official standings table ${country}`;
  if (type.includes("calendar") || type.includes("start")) return `${name} ${season} official calendar fixtures start date ${country}`;
  if (type.includes("status")) return `${name} ${season} official current phase status ${country}`;

  return `${name} ${season} official competition status ${country}`;
}

function trustedCrosscheckQueryFor(task) {
  const name = compactWords(task.competitionName) || compactWords(task.competitionSlug);
  const country = compactWords(task.country || task.region);
  const season = asText(task.seasonKey);
  const date = asText(task.targetDate);
  const kind = asText(task.evidenceKind);

  if (kind === "standings") return `${name} ${season} standings table ${country} soccerway flashscore worldfootball`;
  if (kind === "winner") return `${name} ${season} final winner ${country} rsssf wikipedia flashscore`;
  if (kind === "calendar") return `${name} fixtures calendar ${season} start date ${date} ${country}`;
  if (kind === "status") return `${name} current phase status fixtures results ${season} ${country}`;
  return `${name} football competition evidence ${season} ${country}`;
}

function expectedEvidenceFor(task) {
  const taskType = asText(task.taskType);
  const kind = asText(task.evidenceKind);

  if (taskType === "uefa_qualifier_calendar_search") {
    return [
      "qualifying round start date",
      "preliminary/first qualifying round dates",
      "official UEFA competition calendar"
    ];
  }

  if (kind === "standings") {
    return [
      "league table rows",
      "played matches/points",
      "season marker",
      "current or final table marker"
    ];
  }

  if (kind === "calendar") {
    return [
      "fixture calendar",
      "round dates",
      "season start/current round date",
      "official schedule page"
    ];
  }

  if (kind === "winner") {
    return [
      "final match/result",
      "competition winner/champion",
      "season marker",
      "official result or winner page"
    ];
  }

  if (kind === "status") {
    return [
      "current phase or round",
      "competition status",
      "recent/upcoming fixtures",
      "official competition page"
    ];
  }

  return [
    "competition state evidence",
    "season marker",
    "official or trusted source"
  ];
}

function validationIntentFor(task) {
  const taskType = asText(task.taskType);
  const family = asText(task.family);
  const kind = asText(task.evidenceKind);

  if (taskType === "uefa_qualifier_calendar_search") return "verify_uefa_qualifier_start_dates";
  if (family === "league" && kind === "standings") return "verify_league_current_or_final_standings";
  if (family === "league" && kind === "calendar") return "verify_league_active_period_or_next_start";
  if (family === "cup" && kind === "winner") return "verify_cup_final_winner";
  if (family === "cup" && kind === "status") return "verify_cup_current_phase";
  if (family === "cup" && kind === "calendar") return "verify_cup_calendar_or_next_round";
  if (family === "continental" && kind === "winner") return "verify_continental_final_winner";
  if (family === "continental" && kind === "status") return "verify_continental_current_phase";
  if (family === "continental" && kind === "calendar") return "verify_continental_calendar_or_qualifiers";
  if (family === "global" && kind === "winner") return "verify_global_tournament_winner";
  if (family === "global" && kind === "status") return "verify_global_tournament_status";
  if (family === "global" && kind === "calendar") return "verify_global_tournament_calendar";

  return "verify_competition_state_evidence";
}

function targetIdFor(task, targetType) {
  return [
    asText(task.taskId),
    targetType
  ].filter(Boolean).join("::");
}

function buildTargetsForTask(task) {
  const base = {
    sourceTaskId: asText(task.taskId),
    taskType: asText(task.taskType),
    evidenceKind: asText(task.evidenceKind),
    priority: asText(task.priority),
    competitionSlug: asText(task.competitionSlug),
    competitionName: asText(task.competitionName),
    competitionType: asText(task.competitionType),
    family: asText(task.family),
    country: asText(task.country),
    region: asText(task.region),
    targetDate: asText(task.targetDate),
    seasonKey: asText(task.seasonKey),
    competitionState: asText(task.competitionState),
    expectedEvidence: expectedEvidenceFor(task),
    validationIntent: validationIntentFor(task),
    sourcePolicy: {
      preferOfficial: true,
      allowTrustedSportsSitesForCrosscheck: true,
      rejectForumOrBettingOnlySources: true,
      requireSeasonOrDateMarker: true,
      requireEvidenceExtraction: true,
      noFetchInThisJob: true,
      noCanonicalWrites: true
    }
  };

  const official = {
    ...base,
    searchTargetId: targetIdFor(task, "official-primary"),
    targetType: "official-primary",
    query: officialQueryFor(task)
  };

  const federation = {
    ...base,
    searchTargetId: targetIdFor(task, "official-federation-or-competition"),
    targetType: "official-federation-or-competition",
    query: federationQueryFor(task)
  };

  const crosscheck = {
    ...base,
    searchTargetId: targetIdFor(task, "trusted-crosscheck"),
    targetType: "trusted-crosscheck",
    query: trustedCrosscheckQueryFor(task),
    sourcePolicy: {
      ...base.sourcePolicy,
      preferOfficial: false,
      allowTrustedSportsSitesForCrosscheck: true
    }
  };

  return [official, federation, crosscheck].filter((target) => asText(target.query));
}

function buildSearchTargets(taskBatch, options = {}) {
  const targets = [];
  const seen = new Set();

  for (const task of asArray(taskBatch.tasks)) {
    for (const target of buildTargetsForTask(task)) {
      if (!target.searchTargetId || seen.has(target.searchTargetId)) continue;
      seen.add(target.searchTargetId);
      targets.push(target);
    }
  }

  const maxTargets = Number(options.maxTargets || 0);
  return maxTargets > 0 ? targets.slice(0, maxTargets) : targets;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport({ taskBatch, maxTargets = 0 }) {
  const searchTargets = buildSearchTargets(taskBatch, { maxTargets });

  return {
    ok: true,
    job: "materialize-selected-coverage-competition-evidence-search-targets-file",
    generatedAt: new Date().toISOString(),
    summary: {
      sourceBatchJob: asText(taskBatch.job),
      targetDate: asText(taskBatch.summary && taskBatch.summary.targetDate),
      seasonKey: asText(taskBatch.summary && taskBatch.summary.seasonKey),
      sourceTaskCount: Number(taskBatch.summary && taskBatch.summary.selectedTaskCount || asArray(taskBatch.tasks).length),
      searchTargetCount: searchTargets.length,
      maxTargets: Number(maxTargets || 0),
      limited: Number(maxTargets || 0) > 0 && searchTargets.length >= Number(maxTargets || 0),
      byTargetType: countBy(searchTargets, "targetType"),
      byTaskType: countBy(searchTargets, "taskType"),
      byEvidenceKind: countBy(searchTargets, "evidenceKind"),
      byFamily: countBy(searchTargets, "family"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false
    },
    searchTargets,
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
  const taskBatch = {
    job: "select-coverage-competition-state-evidence-task-batch-file",
    summary: {
      targetDate: "2026-06-03",
      seasonKey: "2025-2026",
      selectedTaskCount: 2
    },
    tasks: [
      {
        taskId: "2026-06-03::uefa.champions::uefa_qualifier_calendar_search",
        taskType: "uefa_qualifier_calendar_search",
        evidenceKind: "calendar",
        priority: "high",
        competitionSlug: "uefa.champions",
        competitionName: "UEFA Champions League",
        competitionType: "continental",
        family: "continental",
        country: "uefa",
        targetDate: "2026-06-03",
        seasonKey: "2025-2026",
        competitionState: "unknown_needs_competition_state_evidence",
        query: "UEFA Champions League 2025-2026 qualifying round start dates preliminary draw official UEFA"
      },
      {
        taskId: "2026-06-03::eng.1::standings_currency_or_final_table_search",
        taskType: "standings_currency_or_final_table_search",
        evidenceKind: "standings",
        priority: "high",
        competitionSlug: "eng.1",
        competitionName: "Premier League",
        competitionType: "league",
        family: "league",
        country: "england",
        targetDate: "2026-06-03",
        seasonKey: "2025-2026",
        competitionState: "unknown_needs_competition_state_evidence",
        query: "Premier League England 2025-2026 final table current standings official"
      }
    ]
  };

  const report = buildReport({ taskBatch });

  if (report.summary.searchTargetCount !== 6) throw new Error("expected three search targets per task");
  if (report.summary.byTargetType["official-primary"] !== 2) throw new Error("expected official primary targets");
  if (report.summary.byTargetType["trusted-crosscheck"] !== 2) throw new Error("expected trusted crosscheck targets");

  const uefa = report.searchTargets.find((target) => target.taskType === "uefa_qualifier_calendar_search");
  if (!uefa || uefa.validationIntent !== "verify_uefa_qualifier_start_dates") throw new Error("expected UEFA qualifier validation intent");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees changed");

  return {
    ok: true,
    selfTest: "materialize-selected-coverage-competition-evidence-search-targets-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const taskBatch = readJson(args.selectedTasks);
  const report = buildReport({ taskBatch, maxTargets: args.maxTargets });
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

export { buildReport, buildSearchTargets, buildTargetsForTask };