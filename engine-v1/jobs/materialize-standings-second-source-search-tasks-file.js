#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function resolveRepoPath(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
}

function readJson(filePath, label) {
  const resolved = resolveRepoPath(filePath);
  if (!resolved) throw new Error(`missing --${label}`);
  if (!fs.existsSync(resolved)) throw new Error(`missing ${label} file: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolved;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeSlug(value) {
  return asText(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function pickConfirmationTasks(input) {
  const direct = asArray(input.secondSourceConfirmationTasks);
  if (direct.length) return direct;

  const nested = asArray(input.report?.secondSourceConfirmationTasks);
  if (nested.length) return nested;

  return [];
}

function normalizeSuggestedQueries(task) {
  const queries = [];
  const seen = new Set();

  for (const item of asArray(task.suggestedQueries)) {
    const query = asText(item?.query || item);
    if (!query) continue;

    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    queries.push({
      query,
      queryIntent: asText(item?.queryIntent) || "independent_standings_second_source_confirmation",
      excludedHosts: asArray(item?.excludedHosts).map(asText).filter(Boolean),
      mustConfirmDifferentHost: item?.mustConfirmDifferentHost !== false
    });
  }

  return queries;
}

function makeSearchTask(task, index) {
  const leagueSlug = asText(task.leagueSlug);
  const excludedHosts = asArray(task.excludedHosts).map(asText).filter(Boolean);
  const suggestedQueries = normalizeSuggestedQueries(task);
  const candidateSearchQueries = suggestedQueries.map((row) => row.query);

  const searchTaskId = [
    "standings-second-source-search",
    safeSlug(leagueSlug),
    String(index + 1).padStart(4, "0")
  ].join(":");

  return {
    taskId: searchTaskId,
    parentTaskId: asText(task.taskId),
    taskType: "standings_second_source_search",
    leagueSlug,
    missingLeagueSlug: leagueSlug,
    proposedPath: asText(task.proposedPath),
    proposedTableRowCount: asNumber(task.proposedTableRowCount, 0),
    confirmationState: asText(task.confirmationState),
    warningCount: asNumber(task.warningCount, 0),
    excludedHosts,
    primarySourceHosts: asArray(task.primarySourceHosts).map(asText).filter(Boolean),
    excludedSourceUrls: asArray(task.excludedSourceUrls).map(asText).filter(Boolean),
    candidateSearchQueries,
    suggestedQueries,
    queryIntent: "independent_standings_second_source_confirmation",
    searchEligibilityState: candidateSearchQueries.length > 0
      ? "eligible_for_controlled_second_source_search"
      : "blocked_no_candidate_search_queries",
    requiredDifferentHost: true,
    readinessBlocked: true,
    standingsWriteAllowedNow: false,
    sourceFetch: false,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = asText(row[field]) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function buildReport(input, options = {}) {
  const confirmationTasks = pickConfirmationTasks(input);
  const taskRows = confirmationTasks.map(makeSearchTask);

  return {
    ok: true,
    job: "materialize-standings-second-source-search-tasks-file",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      sourceJob: asText(input.job),
      sourceGeneratedAt: asText(input.generatedAt),
      secondSourceConfirmationTaskCount: confirmationTasks.length
    },
    summary: {
      taskRowCount: taskRows.length,
      eligibleTaskRowCount: taskRows.filter((row) => row.searchEligibilityState === "eligible_for_controlled_second_source_search").length,
      blockedTaskRowCount: taskRows.filter((row) => row.searchEligibilityState !== "eligible_for_controlled_second_source_search").length,
      totalCandidateSearchQueryCount: taskRows.reduce((sum, row) => sum + asArray(row.candidateSearchQueries).length, 0),
      taskWithExcludedHostsCount: taskRows.filter((row) => asArray(row.excludedHosts).length > 0).length,
      byLeague: countBy(taskRows, "leagueSlug"),
      standingsWriteAllowedNowCount: 0,
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false
    },
    taskRows,
    secondSourceSearchTaskRows: taskRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true,
      readinessBlocked: true,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false,
      diagnosticOnly: true
    },
    notes: [
      "This job only adapts second-source confirmation tasks into search-task shape.",
      "Search still requires a later explicit --allow-search collector.",
      "Excluded primary hosts are preserved on each task for second-source ranking/filtering."
    ],
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false,
    selfTest: Boolean(options.selfTest)
  };
}

function selfTestInput() {
  return {
    ok: true,
    job: "build-standings-second-source-confirmation-tasks-file",
    secondSourceConfirmationTasks: [
      {
        taskId: "standings-second-source-confirmation:bel.2:0001",
        leagueSlug: "bel.2",
        proposedPath: "data/standings/bel.2.json",
        proposedTableRowCount: 17,
        excludedHosts: ["proleague.be"],
        primarySourceHosts: ["proleague.be"],
        confirmationState: "pending_second_source_confirmation",
        warningCount: 0,
        suggestedQueries: [
          {
            query: "Challenger Pro League standings",
            queryIntent: "independent_standings_second_source_confirmation",
            excludedHosts: ["proleague.be"],
            mustConfirmDifferentHost: true
          },
          {
            query: "Belgian First Division B current standings",
            queryIntent: "independent_standings_second_source_confirmation",
            excludedHosts: ["proleague.be"],
            mustConfirmDifferentHost: true
          }
        ],
        readinessBlocked: true,
        standingsWriteAllowedNow: false,
        canonicalWrites: 0,
        productionWrite: false
      }
    ]
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = buildReport(selfTestInput(), { selfTest: true });

    if (report.summary.taskRowCount !== 1) {
      throw new Error(`self-test expected 1 task row, got ${report.summary.taskRowCount}`);
    }

    const first = report.taskRows[0];
    if (first.leagueSlug !== "bel.2") {
      throw new Error("self-test expected bel.2 task");
    }

    if (!first.excludedHosts.includes("proleague.be")) {
      throw new Error("self-test expected proleague.be excluded host");
    }

    if (first.candidateSearchQueries.length !== 2) {
      throw new Error("self-test expected 2 candidateSearchQueries");
    }

    if (report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0) {
      throw new Error("self-test safety guarantees failed");
    }

    console.log(JSON.stringify({
      ok: true,
      selfTest: "materialize-standings-second-source-search-tasks-file",
      summary: report.summary,
      firstTask: first,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const outputPath = args.output || "data/football-truth/_diagnostics/same-prefix-missing-standings/standings-second-source-search-tasks.json";
  const report = buildReport(input, args);
  const resolvedOutput = writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, resolvedOutput).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "materialize-standings-second-source-search-tasks-file",
    error: error?.message || String(error),
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});