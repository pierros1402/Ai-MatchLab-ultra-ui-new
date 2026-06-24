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

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
    triage: "",
    standingsDir: path.join(repoRoot, "data", "standings"),
    output: "",
    selfTest: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--triage") args.triage = argv[++index];
    else if (arg === "--standings-dir") args.standingsDir = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function pickRows(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.domesticMissingStandingsRows)) return input.domesticMissingStandingsRows;
  if (Array.isArray(input?.priorityGroups?.firstFixSameCountryPrefix)) return input.priorityGroups.firstFixSameCountryPrefix;
  if (Array.isArray(input?.rows)) return input.rows;
  return [];
}

function countryPrefixFromSlug(leagueSlug) {
  return asText(leagueSlug).split(".")[0] || "";
}

function tierFromSlug(leagueSlug) {
  const match = asText(leagueSlug).match(/\.(\d+)$/);
  return match ? Number(match[1]) : null;
}

function listExistingStandingsRows({ standingsDir, countryPrefix }) {
  if (!fs.existsSync(standingsDir)) return [];

  return fs.readdirSync(standingsDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const leagueSlug = path.basename(fileName, ".json");
      return {
        leagueSlug,
        countryPrefix: countryPrefixFromSlug(leagueSlug),
        fileName,
        filePath: path.join(standingsDir, fileName),
        fileSize: fs.statSync(path.join(standingsDir, fileName)).size
      };
    })
    .filter((row) => row.countryPrefix === countryPrefix)
    .sort((a, b) => a.leagueSlug.localeCompare(b.leagueSlug));
}

function buildPlan({ triage, standingsDir }) {
  const rows = pickRows(triage)
    .filter((row) => asText(row.triageBucket) === "same_country_prefix_standings_available")
    .map((row) => {
      const missingLeagueSlug = asText(row.leagueSlug);
      const countryPrefix = asText(row.countryPrefix) || countryPrefixFromSlug(missingLeagueSlug);
      const missingTier = asNumber(row.tier, tierFromSlug(missingLeagueSlug));
      const existing = listExistingStandingsRows({ standingsDir, countryPrefix });

      return {
        missingLeagueSlug,
        countryPrefix,
        missingTier,
        missingTierLabel: String(missingTier || ""),
        existingStandingsSlugs: existing.map((item) => item.leagueSlug),
        existingStandingsFileCount: existing.length,
        existingStandingsFiles: existing.map((item) => ({
          leagueSlug: item.leagueSlug,
          fileName: item.fileName,
          fileSize: item.fileSize
        })),
        proposedTaskType: "same_country_prefix_missing_standings_materialization_candidate",
        recommendedAction: "extend_standings_materialization_to_missing_tier_for_existing_country_prefix",
        fullFixtureSearchAllowedNow: false,
        fullFixtureSearchBlockReason: "standings_or_calendar_evidence_required_before_full_fixture_target_expansion",
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false,
        nextRequiredAction: "create_controlled_standings_source_discovery_task_for_missing_league_slug"
      };
    })
    .sort((a, b) => a.countryPrefix.localeCompare(b.countryPrefix) || a.missingTier - b.missingTier || a.missingLeagueSlug.localeCompare(b.missingLeagueSlug));

  const byCountryPrefix = {};
  const byMissingTier = {};
  const byExistingStandingsFileCount = {};

  for (const row of rows) {
    byCountryPrefix[row.countryPrefix] = (byCountryPrefix[row.countryPrefix] || 0) + 1;
    byMissingTier[row.missingTierLabel] = (byMissingTier[row.missingTierLabel] || 0) + 1;
    byExistingStandingsFileCount[String(row.existingStandingsFileCount)] = (byExistingStandingsFileCount[String(row.existingStandingsFileCount)] || 0) + 1;
  }

  return {
    ok: rows.every((row) => row.missingLeagueSlug && row.countryPrefix && row.existingStandingsFileCount > 0),
    reportType: "same-prefix-missing-standings-materialization-plan",
    generatedAt: new Date().toISOString(),
    targetDate: asText(triage.targetDate),
    summary: {
      planRowCount: rows.length,
      missingLeagueCount: rows.length,
      countryPrefixCount: Object.keys(byCountryPrefix).length,
      blockedFullFixtureSearchCount: rows.filter((row) => row.fullFixtureSearchAllowedNow === false).length,
      rowsWithoutExistingStandingsFileCount: rows.filter((row) => row.existingStandingsFileCount <= 0).length,
      byCountryPrefix,
      byMissingTier,
      byExistingStandingsFileCount,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false
    },
    planRows: rows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      noCanonicalPromotion: true,
      noStandingsWrites: true,
      hardExcludedFromFutureSearch: false
    }
  };
}

function runSelfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "same-prefix-standings-plan-self-test-"));

  try {
    writeJson(path.join(dir, "eng.1.json"), { leagueSlug: "eng.1", table: [] });
    writeJson(path.join(dir, "eng.fa_cup.json"), { leagueSlug: "eng.fa_cup", rounds: [] });

    const triage = {
      targetDate: "2026-06-02",
      domesticMissingStandingsRows: [
        {
          leagueSlug: "eng.2",
          countryPrefix: "eng",
          tier: 2,
          triageBucket: "same_country_prefix_standings_available"
        },
        {
          leagueSlug: "abc.1",
          countryPrefix: "abc",
          tier: 1,
          triageBucket: "tier1_no_country_prefix_standings_available"
        }
      ]
    };

    const report = buildPlan({ triage, standingsDir: dir });

    if (!report.ok) throw new Error("expected ok report");
    if (report.summary.planRowCount !== 1) throw new Error("expected one plan row");
    if (report.summary.rowsWithoutExistingStandingsFileCount !== 0) throw new Error("expected existing standings file");
    if (report.summary.blockedFullFixtureSearchCount !== 1) throw new Error("expected full fixture search blocked");
    if (report.summary.canonicalWrites !== 0 || report.summary.productionWrite !== false) {
      throw new Error("read-only guarantees changed");
    }

    return {
      ok: true,
      selfTest: "build-same-prefix-missing-standings-materialization-plan",
      summary: report.summary
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.triage) throw new Error("--triage is required");

  const triagePath = path.resolve(args.triage);
  const standingsDir = path.resolve(args.standingsDir);
  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(path.dirname(triagePath), "same-prefix-missing-standings-materialization-plan.json");

  const report = buildPlan({
    triage: readJson(triagePath),
    standingsDir
  });

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