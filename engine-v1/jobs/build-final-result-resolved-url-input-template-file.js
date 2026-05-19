#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");

function cleanString(value) {
  return String(value ?? "").trim();
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function resolveFromRoot(file) {
  return path.resolve(ROOT_DIR, file);
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    input: "",
    output: "",
    limitCases: 5,
    maxResolutionsPerMatch: 2,
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      out.selfTest = true;
      continue;
    }

    const nextValue = () => {
      index += 1;
      return cleanString(argv[index]);
    };

    if (arg === "--input") out.input = nextValue();
    else if (arg.startsWith("--input=")) out.input = cleanString(arg.slice("--input=".length));
    else if (arg === "--output") out.output = nextValue();
    else if (arg.startsWith("--output=")) out.output = cleanString(arg.slice("--output=".length));
    else if (arg === "--limit-cases") out.limitCases = toInt(nextValue(), out.limitCases);
    else if (arg.startsWith("--limit-cases=")) out.limitCases = toInt(arg.slice("--limit-cases=".length), out.limitCases);
    else if (arg === "--max-resolutions-per-match") out.maxResolutionsPerMatch = toInt(nextValue(), out.maxResolutionsPerMatch);
    else if (arg.startsWith("--max-resolutions-per-match=")) out.maxResolutionsPerMatch = toInt(arg.slice("--max-resolutions-per-match=".length), out.maxResolutionsPerMatch);
    else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!out.selfTest && !out.input) throw new Error("missing required --input <resolution-tasks.json>");
  if (!out.selfTest && !out.output) throw new Error("missing required --output <resolved-url-template.json>");

  return out;
}

function extractTeamsFromQuery(value) {
  const query = cleanString(value);
  if (!query) {
    return {
      homeTeam: "",
      awayTeam: ""
    };
  }

  const quoted = [...query.matchAll(/"([^"]{2,100})"/g)]
    .map((match) => cleanString(match[1]))
    .filter(Boolean);

  if (quoted.length >= 2) {
    return {
      homeTeam: quoted[0],
      awayTeam: quoted[1]
    };
  }

  return {
    homeTeam: "",
    awayTeam: ""
  };
}

function normalizeWatchRow(task, oneCase) {
  const watchRow = task?.watchRow || oneCase?.watchRow || null;
  const queryTeams = extractTeamsFromQuery(task?.resolution?.query || task?.query || "");

  return {
    matchId: cleanString(task?.matchId || watchRow?.matchId || oneCase?.matchId),
    day: cleanString(task?.day || watchRow?.day || watchRow?.date || oneCase?.day),
    date: cleanString(watchRow?.date || task?.day || oneCase?.day),
    leagueSlug: cleanString(task?.leagueSlug || watchRow?.leagueSlug || oneCase?.leagueSlug),
    league: cleanString(watchRow?.league || oneCase?.league),
    homeTeam: cleanString(task?.homeTeam || watchRow?.homeTeam || oneCase?.teams?.homeTeam || oneCase?.homeTeam || queryTeams.homeTeam),
    awayTeam: cleanString(task?.awayTeam || watchRow?.awayTeam || oneCase?.teams?.awayTeam || oneCase?.awayTeam || queryTeams.awayTeam)
  };
}

function normalizeCase(oneCase, tasks) {
  const firstTask = tasks[0] || {};
  const watchRow = normalizeWatchRow(firstTask, oneCase);

  return {
    matchId: cleanString(oneCase?.matchId || watchRow.matchId),
    day: cleanString(oneCase?.day || watchRow.day),
    leagueSlug: cleanString(oneCase?.leagueSlug || watchRow.leagueSlug),
    teams: {
      homeTeam: cleanString(oneCase?.teams?.homeTeam || watchRow.homeTeam),
      awayTeam: cleanString(oneCase?.teams?.awayTeam || watchRow.awayTeam)
    },
    watchRow,
    resolutionTasks: tasks
  };
}

function buildPlaceholderResolution(task, oneCase, index) {
  const watchRow = normalizeWatchRow(task, oneCase);

  return {
    taskId: cleanString(task?.taskId),
    matchId: watchRow.matchId,
    day: watchRow.day,
    leagueSlug: watchRow.leagueSlug,
    homeTeam: watchRow.homeTeam,
    awayTeam: watchRow.awayTeam,

    resolvedUrl: "",
    sourceName: "",
    sourceType: "provider",
    resolvedBy: "manual_review",
    notes: "",

    watchRow,
    matchedTask: task,
    templateMeta: {
      fillRequired: ["resolvedUrl", "sourceName"],
      sourceTypeAllowedExamples: ["provider", "trusted", "official", "aggregator"],
      taskIndex: index,
      query: cleanString(task?.resolution?.query || task?.query),
      intent: cleanString(task?.resolution?.intent || task?.intent),
      resolutionState: cleanString(task?.resolution?.resolutionState || task?.resolutionState)
    }
  };
}

function buildTemplate(inputPayload, options) {
  const sourceCases = asArray(inputPayload?.cases).slice(0, Math.max(1, options.limitCases));
  const cases = [];
  const urlResolutions = [];
  const skippedCases = [];

  for (const oneCase of sourceCases) {
    const tasks = asArray(oneCase?.resolutionTasks)
      .filter((task) => cleanString(task?.taskId))
      .slice(0, Math.max(1, options.maxResolutionsPerMatch));

    if (tasks.length === 0) {
      skippedCases.push({
        matchId: cleanString(oneCase?.matchId),
        reason: "no_resolution_tasks"
      });
      continue;
    }

    cases.push(normalizeCase(oneCase, tasks));

    tasks.forEach((task, index) => {
      urlResolutions.push(buildPlaceholderResolution(task, oneCase, index));
    });
  }

  const report = {
    ok: true,
    job: "build-final-result-resolved-url-input-template-file",
    generatedAt: new Date().toISOString(),
    summary: {
      inputCases: asArray(inputPayload?.cases).length,
      selectedCases: cases.length,
      skippedCases: skippedCases.length,
      urlResolutionPlaceholders: urlResolutions.length,
      limitCases: options.limitCases,
      maxResolutionsPerMatch: options.maxResolutionsPerMatch
    },
    instructions: {
      purpose: "Fill resolvedUrl and sourceName for each urlResolutions row, then pass this file to validate-final-result-source-url-resolutions-file.js or run-final-result-consensus-smoke-day.js --resolved-urls-file.",
      requiredPerUrlResolution: ["taskId", "resolvedUrl", "sourceName"],
      keep: ["cases", "urlResolutions", "matchedTask", "watchRow"],
      doNotUseForProductionPromotion: true
    },
    cases,
    urlResolutions,
    skippedCases,
    guarantees: {
      readOnlyDiagnosticTemplate: true,
      canonicalWrites: 0,
      noFetch: true,
      noValidation: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      noProductionRepair: true,
      noFixtureWrite: true,
      noHistoryWrite: true,
      noValueWrite: true,
      noDetailsWrite: true
    }
  };

  return report;
}

async function run(options) {
  const inputFile = resolveFromRoot(options.input);
  const outputFile = resolveFromRoot(options.output);

  if (!fs.existsSync(inputFile)) {
    throw new Error(`input file not found: ${inputFile}`);
  }

  const inputPayload = readJson(inputFile);
  const report = buildTemplate(inputPayload, options);

  writeJson(outputFile, report);

  return {
    ...report,
    inputFile,
    outputFile
  };
}

function selfTest() {
  const payload = {
    cases: [
      {
        matchId: "m1",
        day: "2026-05-18",
        leagueSlug: "ita.1",
        teams: {
          homeTeam: "Alpha FC",
          awayTeam: "Beta FC"
        },
        resolutionTasks: [
          {
            taskId: "task-1",
            matchId: "m1",
            day: "2026-05-18",
            leagueSlug: "ita.1",
            homeTeam: "Alpha FC",
            awayTeam: "Beta FC",
            resolution: {
              query: "\"Alpha FC\" \"Beta FC\" final score",
              intent: "exact_match_final_result",
              resolutionState: "manual_or_external_search_needed"
            }
          }
        ]
      }
    ]
  };

  const template = buildTemplate(payload, {
    limitCases: 1,
    maxResolutionsPerMatch: 1
  });

  return {
    ok: template.ok === true &&
      template.cases.length === 1 &&
      template.urlResolutions.length === 1 &&
      template.urlResolutions[0].taskId === "task-1" &&
      template.urlResolutions[0].resolvedUrl === "" &&
      template.guarantees.canonicalWrites === 0,
    selfTest: "build-final-result-resolved-url-input-template-file",
    summary: template.summary,
    guarantees: template.guarantees
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  Promise.resolve()
    .then(async () => {
      const options = parseArgs();

      if (options.selfTest) {
        console.log(JSON.stringify(selfTest(), null, 2));
        return;
      }

      const report = await run(options);
      console.log(JSON.stringify({
        ok: report.ok,
        summary: report.summary,
        inputFile: report.inputFile,
        outputFile: report.outputFile,
        guarantees: report.guarantees
      }, null, 2));
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exit(1);
    });
}

export {
  parseArgs,
  buildTemplate,
  run,
  selfTest
};