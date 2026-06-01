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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const args = {
    plan: "",
    output: "",
    selfTest: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--plan") args.plan = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function pickPlanRows(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.planRows)) return input.planRows;
  if (Array.isArray(input?.rows)) return input.rows;
  return [];
}

function makeSearchQueries(row) {
  const slug = asText(row.missingLeagueSlug);
  const countryPrefix = asText(row.countryPrefix);
  const tier = asText(row.missingTierLabel || row.missingTier);

  return [
    `${slug} standings official table`,
    `${slug} league table standings`,
    `${countryPrefix} ${tier} division standings official`,
    `${countryPrefix} ${tier} tier football standings`
  ];
}

function buildTasks(plan) {
  const planRows = pickPlanRows(plan);

  const taskRows = planRows
    .filter((row) => row.fullFixtureSearchAllowedNow === false)
    .map((row, index) => {
      const missingLeagueSlug = asText(row.missingLeagueSlug);
      const countryPrefix = asText(row.countryPrefix);
      const existingStandingsSlugs = Array.isArray(row.existingStandingsSlugs)
        ? row.existingStandingsSlugs.map(asText).filter(Boolean)
        : [];

      return {
        taskId: `same-prefix-standings-source-discovery-${missingLeagueSlug}`,
        taskIndex: index + 1,
        missingLeagueSlug,
        countryPrefix,
        missingTier: row.missingTier ?? null,
        missingTierLabel: asText(row.missingTierLabel || row.missingTier),
        taskType: "controlled_standings_source_discovery",
        taskScope: "same_country_prefix_missing_standings",
        existingStandingsSlugs,
        existingStandingsFileCount: Number(row.existingStandingsFileCount || existingStandingsSlugs.length || 0),
        candidateSearchQueries: makeSearchQueries(row),
        requiredEvidence: [
          "league_slug_or_competition_identity_match",
          "standings_or_table_page_signal",
          "current_or_recent_season_signal",
          "team_rows_or_played_matches_signal",
          "source_relevance_to_missing_tier"
        ],
        rejectionSignals: [
          "wrong_country",
          "wrong_tier",
          "cup_or_knockout_not_league_table",
          "historical_only_archive",
          "betting_odds_only",
          "fixture_list_without_standings_table",
          "unrelated_team_or_youth_competition"
        ],
        allowedNextStage: "controlled_search_result_collection_only",
        fullFixtureSearchAllowedNow: false,
        fullFixtureSearchBlockReason: "standings_source_discovery_required_before_full_fixture_target_expansion",
        standingsWriteAllowedNow: false,
        sourceFetch: false,
        noSearch: true,
        noFetch: true,
        canonicalWrites: 0,
        productionWrite: false,
        nextRequiredAction: "collect_and_rank_candidate_standings_source_urls_without_fetch"
      };
    })
    .sort((a, b) => a.countryPrefix.localeCompare(b.countryPrefix) || a.missingLeagueSlug.localeCompare(b.missingLeagueSlug));

  const byCountryPrefix = {};
  const byMissingTier = {};
  const byExistingStandingsFileCount = {};

  for (const row of taskRows) {
    byCountryPrefix[row.countryPrefix] = (byCountryPrefix[row.countryPrefix] || 0) + 1;
    byMissingTier[row.missingTierLabel] = (byMissingTier[row.missingTierLabel] || 0) + 1;
    byExistingStandingsFileCount[String(row.existingStandingsFileCount)] = (byExistingStandingsFileCount[String(row.existingStandingsFileCount)] || 0) + 1;
  }

  return {
    ok: taskRows.every((row) => row.missingLeagueSlug && row.countryPrefix && row.fullFixtureSearchAllowedNow === false),
    reportType: "same-prefix-missing-standings-source-discovery-tasks",
    generatedAt: new Date().toISOString(),
    targetDate: asText(plan.targetDate),
    summary: {
      inputPlanRowCount: planRows.length,
      taskRowCount: taskRows.length,
      blockedFullFixtureSearchCount: taskRows.filter((row) => row.fullFixtureSearchAllowedNow === false).length,
      standingsWriteAllowedNowCount: taskRows.filter((row) => row.standingsWriteAllowedNow === true).length,
      countryPrefixCount: Object.keys(byCountryPrefix).length,
      byCountryPrefix,
      byMissingTier,
      byExistingStandingsFileCount,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false
    },
    taskRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      noCanonicalPromotion: true,
      noStandingsWrites: true,
      fullFixtureSearchAllowedNow: false
    }
  };
}

function runSelfTest() {
  const plan = {
    targetDate: "2026-06-02",
    planRows: [
      {
        missingLeagueSlug: "eng.2",
        countryPrefix: "eng",
        missingTier: 2,
        missingTierLabel: "2",
        existingStandingsSlugs: ["eng.1"],
        existingStandingsFileCount: 1,
        fullFixtureSearchAllowedNow: false
      }
    ]
  };

  const report = buildTasks(plan);

  if (!report.ok) throw new Error("expected ok report");
  if (report.summary.taskRowCount !== 1) throw new Error("expected one task row");
  if (report.summary.blockedFullFixtureSearchCount !== 1) throw new Error("expected blocked full fixture search");
  if (report.summary.standingsWriteAllowedNowCount !== 0) throw new Error("expected no standings writes");
  if (report.summary.sourceFetch !== false || report.summary.noSearch !== true || report.summary.noFetch !== true) {
    throw new Error("read-only/search-off guarantees changed");
  }
  if (report.summary.canonicalWrites !== 0 || report.summary.productionWrite !== false) {
    throw new Error("write guarantees changed");
  }

  return {
    ok: true,
    selfTest: "build-same-prefix-missing-standings-source-discovery-tasks",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.plan) throw new Error("--plan is required");

  const planPath = path.resolve(args.plan);
  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(path.dirname(planPath), "same-prefix-missing-standings-source-discovery-tasks.json");

  const report = buildTasks(readJson(planPath));
  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: path.relative(repoRoot, outputPath).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main();
}