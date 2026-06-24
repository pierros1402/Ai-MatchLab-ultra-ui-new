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

function pickProposedFiles(input) {
  const direct = asArray(input.proposedStandingsFiles);
  if (direct.length) return direct;

  const nested = asArray(input.report?.proposedStandingsFiles);
  if (nested.length) return nested;

  return [];
}

function pickDiagnostics(input) {
  const direct = asArray(input.materializationDiagnosticRows);
  if (direct.length) return direct;

  const nested = asArray(input.report?.materializationDiagnosticRows);
  if (nested.length) return nested;

  return [];
}

function byLeagueDiagnostics(input) {
  const map = new Map();
  for (const row of pickDiagnostics(input)) {
    const league = asText(row.leagueSlug);
    if (league) map.set(league, row);
  }
  return map;
}

function leagueSearchLabels(leagueSlug) {
  const labels = {
    "aut.2": {
      country: "Austria",
      leagueNames: ["2. Liga", "Austria 2 Liga", "Admiral 2. Liga"],
      tableTerms: ["standings", "table", "tabelle"]
    },
    "bel.2": {
      country: "Belgium",
      leagueNames: ["Challenger Pro League", "Belgian First Division B", "Belgium 2nd division"],
      tableTerms: ["standings", "ranking", "table"]
    },
    "cyp.2": {
      country: "Cyprus",
      leagueNames: ["Cypriot Second Division", "Cyprus 2nd Division"],
      tableTerms: ["standings", "table"]
    },
    "den.2": {
      country: "Denmark",
      leagueNames: ["Danish 1st Division", "Denmark 1st Division"],
      tableTerms: ["standings", "table"]
    },
    "ger.3": {
      country: "Germany",
      leagueNames: ["3. Liga", "Germany 3 Liga"],
      tableTerms: ["standings", "table", "tabelle"]
    },
    "gre.2": {
      country: "Greece",
      leagueNames: ["Super League 2", "Greece Super League 2"],
      tableTerms: ["standings", "table"]
    },
    "nor.2": {
      country: "Norway",
      leagueNames: ["OBOS-ligaen", "Norway 1st Division"],
      tableTerms: ["standings", "table"]
    }
  };

  return labels[leagueSlug] || {
    country: "",
    leagueNames: [leagueSlug],
    tableTerms: ["standings", "table"]
  };
}

function buildSuggestedQueries(leagueSlug, excludedHosts) {
  const labels = leagueSearchLabels(leagueSlug);
  const [primaryName, secondaryName, tertiaryName] = labels.leagueNames;
  const primaryTerm = labels.tableTerms[0] || "standings";
  const secondaryTerm = labels.tableTerms[1] || "table";

  const queries = [
    `${primaryName} ${primaryTerm}`,
    `${primaryName} ${secondaryTerm}`,
    `${labels.country} ${primaryName} ${primaryTerm}`,
    `${secondaryName || primaryName} current standings`,
    `${tertiaryName || primaryName} league table`
  ]
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const unique = [];
  const seen = new Set();

  for (const query of queries) {
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(query);
  }

  return unique.map((query) => ({
    query,
    queryIntent: "independent_standings_second_source_confirmation",
    excludedHosts,
    mustConfirmDifferentHost: true
  }));
}

function makeConfirmationTask(proposedFile, diagnostic, index) {
  const leagueSlug = asText(proposedFile.leagueSlug);
  const excludedHosts = asArray(diagnostic?.sourceHosts).map(asText).filter(Boolean);
  const excludedSourceUrls = asArray(diagnostic?.sourceUrls).map(asText).filter(Boolean);
  const warningCount = asNumber(proposedFile.warningCount ?? diagnostic?.warningCount, 0);
  const readinessState = asText(proposedFile.readinessState || diagnostic?.readinessState);
  const proposedTableRowCount = asNumber(proposedFile.proposedTableRowCount ?? diagnostic?.proposedTableRowCount, 0);

  const taskId = [
    "standings-second-source-confirmation",
    safeSlug(leagueSlug),
    String(index + 1).padStart(4, "0")
  ].join(":");

  const confirmationState = warningCount > 0
    ? "pending_second_source_confirmation_and_table_quality_review"
    : "pending_second_source_confirmation";

  const confirmationReasons = [
    "materialized_standings_plan_is_diagnostic_only",
    "require_independent_second_source_before_any_standings_write",
    "exclude_primary_source_hosts_from_confirmation"
  ];

  if (warningCount > 0) {
    confirmationReasons.push("primary_materialization_plan_has_table_quality_warnings");
  }

  return {
    taskId,
    taskType: "standings_second_source_confirmation",
    leagueSlug,
    proposedPath: asText(proposedFile.proposedPath),
    proposedTableRowCount,
    primarySourceHosts: excludedHosts,
    excludedHosts,
    excludedSourceUrls,
    readinessState,
    warningCount,
    confirmationState,
    confirmationGoal: "Confirm the proposed standings table using an independent source host before any canonical standings write.",
    suggestedQueries: buildSuggestedQueries(leagueSlug, excludedHosts),
    requiredEvidence: [
      "same league and season/context",
      "independent host not listed in excludedHosts",
      "standing rows include team names, rank/position, played matches and points",
      "row count and top teams broadly agree with proposed table",
      "do not promote if second source is generic, stale, anti-bot, wrong league, wrong season, or copied from the excluded primary source"
    ],
    decisionTemplate: {
      leagueSlug,
      confirmationState,
      secondSourceConfirmed: false,
      confirmingSourceUrls: [],
      confirmingSourceHosts: [],
      confirmedRowCount: 0,
      mismatchedRows: [],
      reviewerNotes: "",
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false
    },
    readinessBlocked: true,
    readinessReasons: confirmationReasons,
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(input, options = {}) {
  const proposedFiles = pickProposedFiles(input);
  const diagnosticsByLeague = byLeagueDiagnostics(input);

  const secondSourceConfirmationTasks = proposedFiles.map((proposedFile, index) => {
    const leagueSlug = asText(proposedFile.leagueSlug);
    return makeConfirmationTask(proposedFile, diagnosticsByLeague.get(leagueSlug), index);
  });

  const confirmationDecisionTemplateRows = secondSourceConfirmationTasks.map((task) => ({
    taskId: task.taskId,
    leagueSlug: task.leagueSlug,
    proposedPath: task.proposedPath,
    confirmationState: task.confirmationState,
    secondSourceConfirmed: false,
    confirmingSourceUrls: [],
    confirmingSourceHosts: [],
    confirmedRowCount: 0,
    mismatchedRows: [],
    reviewerNotes: "",
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  }));

  return {
    ok: true,
    job: "build-standings-second-source-confirmation-tasks-file",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      sourceJob: asText(input.job),
      sourceGeneratedAt: asText(input.generatedAt),
      proposedStandingsFileCount: proposedFiles.length,
      proposedStandingsTableRowCount: proposedFiles.reduce((sum, row) => sum + asNumber(row.proposedTableRowCount, 0), 0)
    },
    summary: {
      taskCount: secondSourceConfirmationTasks.length,
      confirmationDecisionTemplateRowCount: confirmationDecisionTemplateRows.length,
      taskWithWarningReviewCount: secondSourceConfirmationTasks.filter((task) => task.warningCount > 0).length,
      taskBlockedCount: secondSourceConfirmationTasks.filter((task) => task.readinessBlocked).length,
      standingsWriteAllowedNowCount: 0,
      canonicalWrites: 0,
      productionWrite: false
    },
    secondSourceConfirmationTasks,
    confirmationDecisionTemplateRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true,
      readinessBlocked: true,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false,
      diagnosticOnly: true
    },
    notes: [
      "This job only materializes second-source confirmation tasks.",
      "No URL fetch is performed by this job.",
      "No data/standings file may be written from this report.",
      "A later readiness diagnostic must explicitly approve promotion before any writer can be considered."
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
    job: "build-standings-materialization-plan-from-validated-evidence-file",
    proposedStandingsFiles: [
      {
        leagueSlug: "bel.2",
        proposedPath: "data/standings/bel.2.json",
        proposedTableRowCount: 17,
        confidence: 0.98,
        completeness: 1,
        readinessBlocked: true,
        readinessState: "blocked_diagnostic_plan_requires_promotion_gate",
        warningCount: 0
      }
    ],
    materializationDiagnosticRows: [
      {
        leagueSlug: "bel.2",
        sourceHosts: ["proleague.be"],
        sourceUrls: ["https://www.proleague.be/cpl-ranking"],
        warningCount: 0,
        readinessState: "blocked_diagnostic_plan_requires_promotion_gate"
      }
    ]
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = buildReport(selfTestInput(), { selfTest: true });

    if (report.summary.taskCount !== 1) {
      throw new Error(`self-test expected 1 task, got ${report.summary.taskCount}`);
    }

    const task = report.secondSourceConfirmationTasks[0];
    if (task.leagueSlug !== "bel.2") {
      throw new Error("self-test expected bel.2 task");
    }

    if (!task.excludedHosts.includes("proleague.be")) {
      throw new Error("self-test expected proleague.be excluded host");
    }

    if (task.suggestedQueries.length < 3) {
      throw new Error("self-test expected suggested queries");
    }

    if (report.guarantees.noStandingsWrites !== true || report.guarantees.canonicalWrites !== 0) {
      throw new Error("self-test write guarantees failed");
    }

    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-standings-second-source-confirmation-tasks-file",
      summary: report.summary,
      firstTask: task,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const outputPath = args.output || "data/football-truth/_diagnostics/same-prefix-missing-standings/standings-second-source-confirmation-tasks.json";
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
    job: "build-standings-second-source-confirmation-tasks-file",
    error: error?.message || String(error),
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});