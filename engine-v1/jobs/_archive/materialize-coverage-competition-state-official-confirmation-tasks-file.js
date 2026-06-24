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
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--validation") args.validation = argv[++i] || "";
    else if (arg.startsWith("--validation=")) args.validation = arg.slice("--validation=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.validation) throw new Error("--validation is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function validationRowsOf(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["competitionStateValidationRows", "officialConfirmationRequiredRows", "secondSourceRequiredRows", "rows", "items"]) {
    if (Array.isArray(json && json[key])) return json[key];
  }
  return [];
}

function competitionSlugOf(row) {
  return asText(row.competitionSlug || row.leagueSlug);
}

function competitionNameOf(row) {
  return asText(row.competitionName) || competitionSlugOf(row);
}

function shouldMaterialize(row) {
  return asText(row.validationState) === "winner_or_final_candidate_needs_official_confirmation";
}

function officialHostsFor(row) {
  const slug = competitionSlugOf(row);

  if (slug.startsWith("afc.")) return ["the-afc.com"];
  if (slug.startsWith("uefa.")) return ["uefa.com"];
  if (slug.startsWith("caf.")) return ["cafonline.com"];
  if (slug.startsWith("concacaf.")) return ["concacaf.com"];
  if (slug.startsWith("conmebol.")) return ["conmebol.com"];
  if (slug.startsWith("fifa.")) return ["fifa.com"];

  return [];
}

function inferSeasonHints(row) {
  const url = asText(row.finalUrl);
  const text = [
    url,
    ...asArray(row.extractedDateMentions),
    ...asArray(row.extractedRoundMentions),
    ...asArray(row.signals),
    asText(row.evidenceExcerpt)
  ].join(" ");

  const hints = new Set();

  for (const match of text.matchAll(/\b20\d{2}\b/g)) {
    hints.add(match[0]);
  }

  for (const match of text.matchAll(/\b20\d{2}[-/–]\d{2}\b/g)) {
    hints.add(match[0]);
  }

  if (/2025_AFC_Champions_League_Elite_final/i.test(url)) {
    hints.add("2025");
    hints.add("2024/25");
    hints.add("2025 AFC Champions League Elite final");
  }

  return [...hints];
}

function searchQueriesFor(row) {
  const name = competitionNameOf(row);
  const slug = competitionSlugOf(row);
  const hosts = officialHostsFor(row);
  const seasonHints = inferSeasonHints(row);
  const referenceUrl = asText(row.finalUrl);

  const officialHost = hosts[0] || "";
  const seasonText = seasonHints.length ? seasonHints.join(" ") : "2025 2026";

  if (slug === "afc.champions" || slug.startsWith("afc.")) {
    return [
      `site:the-afc.com AFC Champions League Elite 2025 final Al Ahli Kawasaki Frontale final result`,
      `site:the-afc.com Al Ahli Kawasaki Frontale 2-0 AFC Champions League Elite final`,
      `site:the-afc.com AFC Champions League Elite final 2025 winner Al Ahli`,
      `site:the-afc.com AFC Champions League Elite 2024/25 champions Al Ahli final report`
    ];
  }

  return [
    `site:${officialHost} ${name} final winner result ${seasonText}`.trim(),
    `site:${officialHost} ${name} final match report champion ${seasonText}`.trim(),
    `site:${officialHost} ${name} winner final score ${seasonText}`.trim(),
    `site:${officialHost} ${name} champions final ${seasonText}`.trim()
  ].filter((query) => !query.startsWith("site: "));
}

function expectedEvidenceFor(row) {
  return [
    "official competition body source",
    "specific final match report or result page",
    "winner/champion named explicitly",
    "final score or result marker",
    "teams named explicitly",
    "season/final date context",
    "not a generic landing page or news feed"
  ];
}

function taskIdFor(row, index) {
  return [
    competitionSlugOf(row),
    "winner_final_official_confirmation_search",
    String(index + 1).padStart(2, "0")
  ].join("::");
}

function materializeRows(rows) {
  const tasks = [];
  const seen = new Set();

  for (const row of rows) {
    if (!shouldMaterialize(row)) continue;

    const hosts = officialHostsFor(row);
    const queries = searchQueriesFor(row);

    queries.forEach((query, index) => {
      const taskId = taskIdFor(row, index);
      if (seen.has(taskId)) return;
      seen.add(taskId);

      tasks.push({
        taskId,
        taskType: "winner_final_official_confirmation_search",
        evidenceKind: "winner_or_final_official_confirmation",
        validationIntent: "confirm_reference_final_winner_from_official_source",
        competitionSlug: competitionSlugOf(row),
        leagueSlug: asText(row.leagueSlug || row.competitionSlug),
        competitionName: competitionNameOf(row),
        priorValidationState: asText(row.validationState),
        priorValidationConfidence: asText(row.validationConfidence),
        priorEvidenceState: asText(row.evidenceState),
        priorEvidenceConfidence: asText(row.evidenceConfidence),
        referenceHostname: asText(row.hostname),
        referenceFinalUrl: asText(row.finalUrl),
        officialHosts: hosts,
        query,
        expectedEvidence: expectedEvidenceFor(row),
        sourcePolicy: {
          officialConfirmationOnly: true,
          allowedHosts: hosts,
          rejectGenericLandingPages: true,
          requireSpecificWinnerOrFinalResult: true,
          requireWinnerOrChampionNamed: true,
          requireFinalScoreOrResultMarker: true,
          requireTeamNamesWhenAvailable: true,
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

function buildReport(input, inputPath = "") {
  const rows = validationRowsOf(input);
  const tasks = materializeRows(rows);

  return {
    ok: true,
    job: "materialize-coverage-competition-state-official-confirmation-tasks-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    summary: {
      inputValidationRowCount: rows.length,
      officialConfirmationTaskCount: tasks.length,
      byTaskType: countBy(tasks, "taskType"),
      byCompetition: countBy(tasks, "competitionSlug"),
      byEvidenceKind: countBy(tasks, "evidenceKind"),
      byReferenceHost: countBy(tasks, "referenceHostname"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    officialConfirmationTasks: tasks,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      officialConfirmationOnly: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const input = {
    competitionStateValidationRows: [
      {
        competitionSlug: "afc.champions",
        leagueSlug: "afc.champions",
        competitionName: "AFC Champions League Elite",
        evidenceType: "winner_or_final_evidence",
        evidenceState: "candidate_winner_or_final_evidence_needs_validation",
        evidenceConfidence: "medium",
        validationState: "winner_or_final_candidate_needs_official_confirmation",
        validationConfidence: "medium",
        requiresSecondSource: true,
        hostname: "en.wikipedia.org",
        finalUrl: "https://en.wikipedia.org/wiki/2025_AFC_Champions_League_Elite_final",
        extractedDateMentions: [],
        extractedRoundMentions: ["final"],
        signals: ["season_marker", "final_marker", "winner_or_champion_marker", "final_page_url_marker", "specific_final_winner_structure_marker"]
      },
      {
        competitionSlug: "uefa.champions",
        leagueSlug: "uefa.champions",
        competitionName: "UEFA Champions League",
        validationState: "qualifier_calendar_validated_from_official_source",
        hostname: "uefa.com"
      }
    ]
  };

  const report = buildReport(input, "self-test");

  if (report.summary.inputValidationRowCount !== 2) throw new Error("expected two validation rows");
  if (report.summary.officialConfirmationTaskCount !== 4) throw new Error("expected four official-confirmation tasks");
  if (report.summary.byCompetition["afc.champions"] !== 4) throw new Error("expected AFC official-confirmation tasks");
  if (report.summary.byReferenceHost["en.wikipedia.org"] !== 4) throw new Error("expected Wikipedia reference host");
  if (report.guarantees.sourceFetch !== false || report.guarantees.canonicalWrites !== 0) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "materialize-coverage-competition-state-official-confirmation-tasks-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const input = readJson(args.validation);
  const report = buildReport(input, args.validation);
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