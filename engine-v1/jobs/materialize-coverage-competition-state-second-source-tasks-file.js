#!/usr/bin/env node

import fs from "fs";
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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    validation: "",
    overlay: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--validation") args.validation = argv[++i] || "";
    else if (arg.startsWith("--validation=")) args.validation = arg.slice("--validation=".length);
    else if (arg === "--overlay") args.overlay = argv[++i] || "";
    else if (arg.startsWith("--overlay=")) args.overlay = arg.slice("--overlay=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.output) throw new Error("--output is required");
  if (!args.selfTest && !args.validation && !args.overlay) throw new Error("--validation or --overlay is required");

  return args;
}

function validationRowsOf(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["secondSourceRequiredRows", "competitionStateValidationRows", "overlayAppliedRows", "rows", "items"]) {
    if (Array.isArray(json && json[key])) return json[key];
  }
  return [];
}

function evidenceTypeOf(row) {
  return asText(row.evidenceType || (asText(row.competitionState).includes("winner_or_final") ? "winner_or_final_evidence" : ""));
}

function competitionSlugOf(row) {
  return asText(row.competitionSlug || row.leagueSlug);
}

function competitionNameOf(row) {
  return asText(row.competitionName) || competitionSlugOf(row);
}

function shouldMaterialize(row) {
  const validationState = asText(row.validationState);
  const competitionState = asText(row.competitionState);
  const requiresSecondSource = row.requiresSecondSource === true || row.competitionStateRequiresSecondSource === true;

  if (!requiresSecondSource) return false;
  if (validationState.includes("needs_more_specific") || competitionState.includes("needs_more_specific")) return true;
  if (validationState.includes("needs_second_source") || competitionState.includes("needs_second_source")) return true;

  return false;
}

function taskTypeFor(row) {
  const evidenceType = evidenceTypeOf(row);
  const validationState = asText(row.validationState);
  const competitionState = asText(row.competitionState);

  if (evidenceType === "winner_or_final_evidence" || validationState.includes("winner_or_final") || competitionState.includes("winner_or_final")) {
    return "winner_final_specific_second_source_search";
  }

  if (evidenceType === "qualifier_calendar_evidence") {
    return "qualifier_calendar_second_source_search";
  }

  return "competition_state_second_source_search";
}

function expectedEvidenceFor(row) {
  const taskType = taskTypeFor(row);

  if (taskType === "winner_final_specific_second_source_search") {
    return [
      "specific final match result",
      "winner/champion named explicitly",
      "season marker",
      "competition official page or trusted match report",
      "avoid generic landing pages"
    ];
  }

  if (taskType === "qualifier_calendar_second_source_search") {
    return [
      "qualifying round date list",
      "round names",
      "season marker",
      "official or trusted competition calendar"
    ];
  }

  return [
    "competition status",
    "season marker",
    "source-specific evidence text"
  ];
}

function searchQueriesFor(row) {
  const slug = competitionSlugOf(row);
  const name = competitionNameOf(row);
  const evidenceType = evidenceTypeOf(row);
  const finalUrl = asText(row.finalUrl);
  const host = asText(row.hostname);
  const seasonHints = [
    ...asArray(row.extractedDateMentions),
    ...asArray(row.extractedRoundMentions)
  ].join(" ");

  if (evidenceType === "winner_or_final_evidence" || asText(row.validationState).includes("winner_or_final") || asText(row.competitionState).includes("winner_or_final")) {
    return [
      `${name} 2025 2026 final winner champion result official`,
      `${name} Elite 2025/26 final winner result AFC`,
      `${name} final result champion 2025 2026 the-afc.com`,
      `${name} 2025 2026 winner final match report`
    ];
  }

  return [
    `${name} competition state 2025 2026 official`,
    `${name} calendar status winner 2025 2026`,
    `${name} fixtures results season 2025 2026`
  ].filter(Boolean);
}

function taskIdFor(row, query, index) {
  return [
    competitionSlugOf(row),
    taskTypeFor(row),
    String(index + 1).padStart(2, "0")
  ].join("::");
}

function materializeRows(inputRows) {
  const tasks = [];
  const seen = new Set();

  for (const row of inputRows) {
    if (!shouldMaterialize(row)) continue;

    const queries = searchQueriesFor(row);
    queries.forEach((query, index) => {
      const taskId = taskIdFor(row, query, index);
      if (seen.has(taskId)) return;
      seen.add(taskId);

      tasks.push({
        taskId,
        taskType: taskTypeFor(row),
        evidenceKind: evidenceTypeOf(row) || "competition_state_evidence",
        competitionSlug: competitionSlugOf(row),
        leagueSlug: asText(row.leagueSlug || row.competitionSlug),
        competitionName: competitionNameOf(row),
        validationState: asText(row.validationState),
        competitionState: asText(row.competitionState),
        validationConfidence: asText(row.validationConfidence || row.competitionStateConfidence),
        sourceType: asText(row.sourceType),
        priorHostname: asText(row.hostname),
        priorFinalUrl: asText(row.finalUrl),
        query,
        expectedEvidence: expectedEvidenceFor(row),
        sourcePolicy: {
          preferOfficial: true,
          allowTrustedSportsSitesForCrosscheck: true,
          rejectGenericLandingPages: true,
          requireSpecificWinnerOrFinalResult: taskTypeFor(row) === "winner_final_specific_second_source_search",
          requireSeasonMarker: true,
          requireEvidenceExtraction: true,
          noSearchInThisJob: true,
          noFetchInThisJob: true,
          noCanonicalWrites: true
        },
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false
      });
    });
  }

  return tasks;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport({ validationInput = null, overlayInput = null }, inputPaths = {}) {
  const validationRows = validationInput ? validationRowsOf(validationInput) : [];
  const overlayRows = overlayInput ? validationRowsOf(overlayInput) : [];
  const sourceRows = validationRows.length ? validationRows : overlayRows;
  const tasks = materializeRows(sourceRows);

  return {
    ok: true,
    job: "materialize-coverage-competition-state-second-source-tasks-file",
    generatedAt: new Date().toISOString(),
    inputPaths,
    summary: {
      sourceRowCount: sourceRows.length,
      secondSourceTaskCount: tasks.length,
      byTaskType: countBy(tasks, "taskType"),
      byCompetition: countBy(tasks, "competitionSlug"),
      byEvidenceKind: countBy(tasks, "evidenceKind"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    secondSourceTasks: tasks,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const validationInput = {
    secondSourceRequiredRows: [
      {
        competitionSlug: "afc.champions",
        leagueSlug: "afc.champions",
        competitionName: "AFC Champions League",
        evidenceType: "winner_or_final_evidence",
        validationState: "winner_or_final_needs_more_specific_final_evidence",
        validationConfidence: "medium",
        requiresSecondSource: true,
        sourceType: "official_afc",
        hostname: "the-afc.com",
        finalUrl: "https://www.the-afc.com/en/club/afc_champions_league_elite/home.html"
      }
    ]
  };

  const report = buildReport({ validationInput }, { validation: "self-test" });

  if (report.summary.sourceRowCount !== 1) throw new Error("expected one source row");
  if (report.summary.secondSourceTaskCount !== 4) throw new Error("expected four second-source tasks");
  if (report.summary.byCompetition["afc.champions"] !== 4) throw new Error("expected AFC tasks");
  if (report.guarantees.sourceFetch !== false || report.guarantees.canonicalWrites !== 0) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "materialize-coverage-competition-state-second-source-tasks-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const validationInput = args.validation ? readJson(args.validation) : null;
  const overlayInput = args.overlay ? readJson(args.overlay) : null;
  const report = buildReport({ validationInput, overlayInput }, { validation: args.validation, overlay: args.overlay });
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

export { buildReport, materializeRows };