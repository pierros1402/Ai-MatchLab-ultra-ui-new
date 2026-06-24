#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const DEFAULT_TOP_LEAGUE_SLUGS = new Set([
  "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "ned.1", "por.1",
  "bel.1", "aut.1", "den.1", "gre.1", "sco.1", "tur.1",
  "arg.1", "bra.1", "bra.2", "usa.1", "can.1", "mex.1",
  "swe.1", "nor.1", "fin.1", "isl.1", "irl.1",
  "uefa.champions", "uefa.europa", "uefa.europa_conf"
]);

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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseList(value) {
  return asText(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    maxTargets: 18,
    includeTopLeagues: true,
    topLeagues: [],
    targetTypes: [],
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--max-targets") args.maxTargets = Number(argv[++i] || 18);
    else if (arg.startsWith("--max-targets=")) args.maxTargets = Number(arg.slice("--max-targets=".length));
    else if (arg === "--no-top-leagues") args.includeTopLeagues = false;
    else if (arg === "--top-leagues") args.topLeagues = parseList(argv[++i] || "");
    else if (arg.startsWith("--top-leagues=")) args.topLeagues = parseList(arg.slice("--top-leagues=".length));
    else if (arg === "--target-types") args.targetTypes = parseList(argv[++i] || "");
    else if (arg.startsWith("--target-types=")) args.targetTypes = parseList(arg.slice("--target-types=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.maxTargets = Number.isFinite(args.maxTargets) && args.maxTargets > 0 ? Math.floor(args.maxTargets) : 18;
  return args;
}

function searchTargetsOf(input) {
  if (Array.isArray(input)) return input;

  for (const key of [
    "searchTargetRows",
    "selectedSearchTargetRows",
    "targets",
    "rows",
    "items"
  ]) {
    if (Array.isArray(input && input[key])) return input[key];
  }

  return [];
}

function competitionSlugOf(row) {
  return asText(row.competitionSlug || row.leagueSlug || row.targetLeagueSlug);
}

function scoreTarget(row, topLeagueSlugs) {
  const slug = competitionSlugOf(row);
  const targetType = asText(row.targetType);
  const family = asText(row.competitionFamily);
  const priority = asText(row.inventoryPriority || row.priority);
  const tier = Number(row.tier || row.coverageTier || 0);
  const trust = Number(row.trust || row.coverageTrust || 0);
  const missingFTCount = Number(row.missingFTCount || 0);

  let score = 0;
  const reasons = [];

  if (targetType === "official-primary") {
    score += 500;
    reasons.push("official_primary_first");
  } else if (targetType === "calendar-status") {
    score += 360;
    reasons.push("calendar_status_second");
  } else if (targetType === "trusted-crosscheck") {
    score += 260;
    reasons.push("trusted_crosscheck_third");
  }

  if (topLeagueSlugs.has(slug)) {
    score += 420;
    reasons.push("top_or_priority_competition");
  }

  if (family === "continental_or_global") {
    score += 220;
    reasons.push("continental_or_global_foundation");
  }

  if (family === "domestic_league" && tier === 1) {
    score += 160;
    reasons.push("domestic_top_tier");
  } else if (family === "domestic_league" && tier === 2) {
    score += 80;
    reasons.push("domestic_second_tier");
  }

  if (priority === "ft_repair_and_season_status") {
    score += 150;
    reasons.push("ft_repair_and_season_status");
  } else if (priority === "fixture_acquisition_and_season_status") {
    score += 110;
    reasons.push("fixture_acquisition_and_season_status");
  }

  if (Number.isFinite(missingFTCount) && missingFTCount > 0) {
    score += Math.min(120, missingFTCount * 4);
    reasons.push("missing_ft_count_signal");
  }

  if (Number.isFinite(trust)) {
    score += Math.round(trust * 40);
    reasons.push("coverage_trust_signal");
  }

  return { score, reasons };
}

function selectedTargets(report, options = {}) {
  const rows = searchTargetsOf(report);
  const configuredTop = options.topLeagues && options.topLeagues.length
    ? new Set(options.topLeagues)
    : DEFAULT_TOP_LEAGUE_SLUGS;
  const topLeagueSlugs = options.includeTopLeagues === false ? new Set() : configuredTop;
  const targetTypes = new Set(asArray(options.targetTypes).map(asText).filter(Boolean));

  const filtered = rows.filter((row) => {
    if (!competitionSlugOf(row)) return false;
    if (targetTypes.size > 0 && !targetTypes.has(asText(row.targetType))) return false;
    return true;
  });

  const scored = filtered.map((row) => {
    const scoredTarget = scoreTarget(row, topLeagueSlugs);
    return {
      ...row,
      selectionScore: scoredTarget.score,
      selectionReasons: scoredTarget.reasons,
      batchSelected: true,
      batchSelectionState: "selected_for_controlled_search_batch",
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  });

  return scored
    .filter((row) => row.selectionScore > 0)
    .sort((a, b) => {
      if (b.selectionScore !== a.selectionScore) return b.selectionScore - a.selectionScore;
      if (asText(a.targetType) !== asText(b.targetType)) return asText(a.targetType).localeCompare(asText(b.targetType));
      return competitionSlugOf(a).localeCompare(competitionSlugOf(b));
    })
    .slice(0, options.maxTargets || 18);
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport(input, options = {}) {
  const sourceRows = searchTargetsOf(input);
  const selectedSearchTargetRows = selectedTargets(input, options);

  return {
    ok: true,
    job: "select-football-truth-season-status-search-target-batch-file",
    generatedAt: new Date().toISOString(),
    inputPath: asText(options.inputPath),
    options: {
      maxTargets: Number(options.maxTargets || 18),
      includeTopLeagues: options.includeTopLeagues !== false,
      topLeagues: asArray(options.topLeagues),
      targetTypes: asArray(options.targetTypes)
    },
    summary: {
      sourceJob: asText(input && input.job),
      sourceTargetCount: sourceRows.length,
      selectedTargetCount: selectedSearchTargetRows.length,
      byTargetType: countBy(selectedSearchTargetRows, "targetType"),
      byCompetitionFamily: countBy(selectedSearchTargetRows, "competitionFamily"),
      byInventoryPriority: countBy(selectedSearchTargetRows, "inventoryPriority"),
      byLeague: countBy(selectedSearchTargetRows, (row) => competitionSlugOf(row)),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    selectedSearchTargetRows,
    searchTargetRows: selectedSearchTargetRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedSearchTargets: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    canonicalWrites: 0,
    productionWrite: false
  };
}

function runSelfTest() {
  const input = {
    job: "build-football-truth-season-status-search-targets-file",
    searchTargetRows: [
      {
        searchTargetId: "eng.1::season_status::official-primary",
        targetType: "official-primary",
        competitionSlug: "eng.1",
        competitionName: "Premier League",
        competitionFamily: "domestic_league",
        tier: 1,
        trust: 1,
        inventoryPriority: "ft_repair_and_season_status",
        missingFTCount: 12
      },
      {
        searchTargetId: "eng.1::season_status::calendar-status",
        targetType: "calendar-status",
        competitionSlug: "eng.1",
        competitionName: "Premier League",
        competitionFamily: "domestic_league",
        tier: 1,
        trust: 1,
        inventoryPriority: "ft_repair_and_season_status",
        missingFTCount: 12
      },
      {
        searchTargetId: "afg.1::season_status::official-primary",
        targetType: "official-primary",
        competitionSlug: "afg.1",
        competitionName: "Afghanistan Champions League",
        competitionFamily: "domestic_league",
        tier: 1,
        trust: 0.4,
        inventoryPriority: "fixture_acquisition_and_season_status"
      },
      {
        searchTargetId: "uefa.champions::season_status::official-primary",
        targetType: "official-primary",
        competitionSlug: "uefa.champions",
        competitionName: "UEFA Champions League",
        competitionFamily: "continental_or_global",
        tier: 1,
        trust: 1,
        inventoryPriority: "fixture_acquisition_and_season_status"
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test", maxTargets: 3, includeTopLeagues: true, topLeagues: [], targetTypes: [] });

  if (report.summary.sourceTargetCount !== 4) throw new Error("expected four source targets");
  if (report.summary.selectedTargetCount !== 3) throw new Error("expected three selected targets");
  if (!report.selectedSearchTargetRows.find((row) => row.competitionSlug === "eng.1")) throw new Error("expected eng.1 selected");
  if (!report.selectedSearchTargetRows.find((row) => row.competitionSlug === "uefa.champions")) throw new Error("expected UEFA selected");
  if (report.selectedSearchTargetRows.some((row) => row.canonicalWrites !== 0 || row.productionWrite !== false)) throw new Error("read-only selected target guarantee failed");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only report guarantee failed");

  const officialOnly = buildReport(input, { inputPath: "self-test", maxTargets: 10, includeTopLeagues: false, topLeagues: [], targetTypes: ["official-primary"] });
  if (officialOnly.summary.selectedTargetCount !== 3) throw new Error("expected official-only selection");

  return {
    ok: true,
    selfTest: "select-football-truth-season-status-search-target-batch-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const inputPath = path.resolve(repoRoot, args.input);
  const outputPath = path.resolve(repoRoot, args.output);
  const input = readJson(inputPath);
  const report = buildReport(input, {
    inputPath: args.input,
    maxTargets: args.maxTargets,
    includeTopLeagues: args.includeTopLeagues,
    topLeagues: args.topLeagues,
    targetTypes: args.targetTypes
  });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    job: report.job,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();