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
    gapReport: "",
    standingsDir: path.join(repoRoot, "data", "standings"),
    output: "",
    selfTest: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--gap-report") args.gapReport = argv[++index];
    else if (arg === "--standings-dir") args.standingsDir = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function pickGapRows(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.gapRows)) return input.gapRows;
  if (Array.isArray(input?.rows)) return input.rows;
  return [];
}

function slugParts(leagueSlug) {
  const slug = asText(leagueSlug);
  const parts = slug.split(".");
  const countryPrefix = parts[0] || "";
  const tierMatch = slug.match(/\.(\d+)$/);

  return {
    leagueSlug: slug,
    countryPrefix,
    tier: tierMatch ? Number(tierMatch[1]) : null,
    tierLabel: tierMatch ? String(Number(tierMatch[1])) : "non_numeric"
  };
}

function standingsInventory(standingsDir) {
  const rows = [];

  if (!fs.existsSync(standingsDir)) {
    return {
      rows,
      slugs: new Set(),
      prefixes: new Set()
    };
  }

  for (const fileName of fs.readdirSync(standingsDir).filter((name) => name.endsWith(".json")).sort()) {
    const leagueSlug = path.basename(fileName, ".json");
    const parsed = slugParts(leagueSlug);
    const filePath = path.join(standingsDir, fileName);

    rows.push({
      leagueSlug,
      countryPrefix: parsed.countryPrefix,
      tier: parsed.tier,
      tierLabel: parsed.tierLabel,
      fileName,
      fileSize: fs.statSync(filePath).size
    });
  }

  return {
    rows,
    slugs: new Set(rows.map((row) => row.leagueSlug)),
    prefixes: new Set(rows.map((row) => row.countryPrefix).filter(Boolean))
  };
}

function triageBucket({ parsed, inventory }) {
  if (inventory.slugs.has(parsed.leagueSlug)) {
    return "standings_file_exists_but_not_joined";
  }

  if (inventory.prefixes.has(parsed.countryPrefix)) {
    return "same_country_prefix_standings_available";
  }

  if (parsed.tier === 1) {
    return "tier1_no_country_prefix_standings_available";
  }

  if (parsed.tier === 2) {
    return "tier2_no_country_prefix_standings_available";
  }

  return "domestic_missing_standings_other";
}

function recommendedAction(bucket) {
  if (bucket === "standings_file_exists_but_not_joined") {
    return "inspect_slug_join_between_standings_and_season_status";
  }

  if (bucket === "same_country_prefix_standings_available") {
    return "extend_standings_materialization_to_missing_tier_for_existing_country_prefix";
  }

  if (bucket === "tier1_no_country_prefix_standings_available") {
    return "discover_or_materialize_primary_standings_source_before_full_fixture_search";
  }

  if (bucket === "tier2_no_country_prefix_standings_available") {
    return "defer_full_fixture_search_until_tier1_country_standings_or_calendar_evidence_exists";
  }

  return "review_domestic_coverage_row_and_season_calendar_evidence";
}

function buildReport({ gapReport, standingsDir }) {
  const gapRows = pickGapRows(gapReport);
  const inventory = standingsInventory(standingsDir);

  const domesticRows = gapRows
    .filter((row) => asText(row.gapBucket) === "domestic_league_missing_standings")
    .map((row) => {
      const parsed = slugParts(row.leagueSlug);
      const bucket = triageBucket({ parsed, inventory });

      return {
        leagueSlug: parsed.leagueSlug,
        countryPrefix: parsed.countryPrefix,
        tier: parsed.tier,
        tierLabel: parsed.tierLabel,
        triageBucket: bucket,
        hasExactStandingsFile: inventory.slugs.has(parsed.leagueSlug),
        hasSameCountryPrefixStandings: inventory.prefixes.has(parsed.countryPrefix),
        activityState: asText(row.activityState),
        routeState: asText(row.routeState),
        standingsEvidenceState: asText(row.standingsEvidenceState),
        seasonStatusState: asText(row.seasonStatusState),
        targetRowCount: asNumber(row.targetRowCount, 0),
        emittedTargetRowCount: asNumber(row.emittedTargetRowCount, 0),
        continueAutonomousSearch: row.continueAutonomousSearch === true,
        continueSeasonMonitoring: row.continueSeasonMonitoring === true,
        nextRequiredAction: asText(row.nextRequiredAction),
        recommendedAction: recommendedAction(bucket),
        hardExcludedFromFutureSearch: false
      };
    })
    .sort((a, b) => a.leagueSlug.localeCompare(b.leagueSlug));

  const byTriageBucket = {};
  const byCountryPrefix = {};
  const byTier = {};
  const byRecommendedAction = {};

  for (const row of domesticRows) {
    byTriageBucket[row.triageBucket] = (byTriageBucket[row.triageBucket] || 0) + 1;
    byCountryPrefix[row.countryPrefix] = (byCountryPrefix[row.countryPrefix] || 0) + 1;
    byTier[row.tierLabel] = (byTier[row.tierLabel] || 0) + 1;
    byRecommendedAction[row.recommendedAction] = (byRecommendedAction[row.recommendedAction] || 0) + 1;
  }

  const samePrefixRows = domesticRows.filter((row) => row.triageBucket === "same_country_prefix_standings_available");
  const tier1NoPrefixRows = domesticRows.filter((row) => row.triageBucket === "tier1_no_country_prefix_standings_available");
  const tier2NoPrefixRows = domesticRows.filter((row) => row.triageBucket === "tier2_no_country_prefix_standings_available");

  return {
    ok: true,
    reportType: "domestic-missing-standings-triage",
    generatedAt: new Date().toISOString(),
    targetDate: asText(gapReport.targetDate),
    summary: {
      inputGapRowCount: gapRows.length,
      domesticMissingStandingsCount: domesticRows.length,
      standingsFileCount: inventory.rows.length,
      standingsCountryPrefixCount: inventory.prefixes.size,
      sameCountryPrefixStandingsAvailableCount: samePrefixRows.length,
      tier1NoCountryPrefixStandingsAvailableCount: tier1NoPrefixRows.length,
      tier2NoCountryPrefixStandingsAvailableCount: tier2NoPrefixRows.length,
      exactStandingsFileButNotJoinedCount: domesticRows.filter((row) => row.triageBucket === "standings_file_exists_but_not_joined").length,
      byTriageBucket,
      byCountryPrefix,
      byTier,
      byRecommendedAction,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false
    },
    standingsInventoryRows: inventory.rows,
    domesticMissingStandingsRows: domesticRows,
    priorityGroups: {
      firstFixSameCountryPrefix: samePrefixRows,
      tier1NoCountryPrefixStandings: tier1NoPrefixRows,
      tier2NoCountryPrefixStandings: tier2NoPrefixRows,
      highestTargetRows: [...domesticRows].sort((a, b) => b.targetRowCount - a.targetRowCount || a.leagueSlug.localeCompare(b.leagueSlug)).slice(0, 80)
    },
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      noCanonicalPromotion: true,
      hardExcludedFromFutureSearch: false
    }
  };
}

function runSelfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "domestic-missing-standings-triage-self-test-"));

  try {
    writeJson(path.join(dir, "eng.1.json"), { league: "eng.1", table: [] });
    writeJson(path.join(dir, "esp.1.json"), { league: "esp.1", table: [] });

    const gapReport = {
      targetDate: "2026-06-02",
      gapRows: [
        { leagueSlug: "eng.2", gapBucket: "domestic_league_missing_standings", targetRowCount: 20 },
        { leagueSlug: "abc.1", gapBucket: "domestic_league_missing_standings", targetRowCount: 20 },
        { leagueSlug: "abc.2", gapBucket: "domestic_league_missing_standings", targetRowCount: 20 },
        { leagueSlug: "uefa.champions", gapBucket: "continental_or_global_needs_calendar_evidence", targetRowCount: 20 }
      ]
    };

    const report = buildReport({ gapReport, standingsDir: dir });

    if (report.summary.domesticMissingStandingsCount !== 3) throw new Error("expected 3 domestic rows");
    if (report.summary.sameCountryPrefixStandingsAvailableCount !== 1) throw new Error("expected one same-prefix row");
    if (report.summary.tier1NoCountryPrefixStandingsAvailableCount !== 1) throw new Error("expected one tier1 no-prefix row");
    if (report.summary.tier2NoCountryPrefixStandingsAvailableCount !== 1) throw new Error("expected one tier2 no-prefix row");
    if (report.summary.canonicalWrites !== 0 || report.summary.productionWrite !== false) {
      throw new Error("read-only guarantees changed");
    }

    return {
      ok: true,
      selfTest: "build-domestic-missing-standings-triage",
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

  if (!args.gapReport) throw new Error("--gap-report is required");

  const gapReportPath = path.resolve(args.gapReport);
  const standingsDir = path.resolve(args.standingsDir);
  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(path.dirname(gapReportPath), "domestic-missing-standings-triage.json");

  const report = buildReport({
    gapReport: readJson(gapReportPath),
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