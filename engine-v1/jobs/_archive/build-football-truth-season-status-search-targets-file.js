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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    bucket: "seasonStatus",
    limit: 0,
    perLeagueLimit: 0,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--bucket") args.bucket = argv[++i] || "seasonStatus";
    else if (arg.startsWith("--bucket=")) args.bucket = arg.slice("--bucket=".length);
    else if (arg === "--limit") args.limit = Number(argv[++i] || 0);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--per-league-limit") args.perLeagueLimit = Number(argv[++i] || 0);
    else if (arg.startsWith("--per-league-limit=")) args.perLeagueLimit = Number(arg.slice("--per-league-limit=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 0;
  args.perLeagueLimit = Number.isFinite(args.perLeagueLimit) && args.perLeagueLimit > 0 ? Math.floor(args.perLeagueLimit) : 0;

  return args;
}

function workRowsOf(input, bucket) {
  if (Array.isArray(input)) return input.filter((row) => !bucket || asText(row.worksetBucket) === bucket);
  if (input && input.worksets && Array.isArray(input.worksets[bucket])) return input.worksets[bucket];
  if (Array.isArray(input && input.footballTruthStateWorkRows)) {
    return input.footballTruthStateWorkRows.filter((row) => asText(row.worksetBucket) === bucket);
  }
  if (Array.isArray(input && input.workRows)) {
    return input.workRows.filter((row) => !bucket || asText(row.worksetBucket) === bucket);
  }
  if (Array.isArray(input && input.rows)) return input.rows;
  return [];
}

function normalizedName(row) {
  return asText(row.competitionName || row.leagueName) || asText(row.competitionSlug || row.leagueSlug);
}

function competitionSlug(row) {
  return asText(row.competitionSlug || row.leagueSlug || row.targetLeagueSlug);
}

function competitionKind(row) {
  const family = asText(row.competitionFamily);
  const type = asText(row.competitionType || row.coverageType).toLowerCase();

  if (family === "domestic_league" || type === "league") return "league";
  if (family === "continental_or_global" || type === "continental" || type === "global") return "continental";
  if (family === "cup_or_knockout" || type === "cup") return "cup";

  return "competition";
}

function compactWords(value) {
  return asText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function seasonLabel(row) {
  return asText(row.seasonKey) || "current season";
}

function officialQuery(row) {
  const name = compactWords(normalizedName(row));
  const season = seasonLabel(row);
  const country = compactWords(row.country || row.coverageCountry || row.region || row.coverageRegion);
  const kind = competitionKind(row);

  if (kind === "league") return `${name} ${season} official fixtures standings current season status ${country}`;
  if (kind === "cup") return `${name} ${season} official cup fixtures round status winner ${country}`;
  if (kind === "continental") return `${name} ${season} official competition fixtures results current phase`;

  return `${name} ${season} official competition status fixtures results`;
}

function calendarQuery(row) {
  const name = compactWords(normalizedName(row));
  const season = seasonLabel(row);
  const date = asText(row.targetDate);
  const kind = competitionKind(row);

  if (kind === "league") return `${name} ${season} fixtures calendar season start end date ${date}`;
  if (kind === "cup") return `${name} ${season} round dates fixtures calendar final winner`;
  if (kind === "continental") return `${name} ${season} competition calendar qualifying round dates fixtures`;

  return `${name} ${season} calendar fixtures current phase ${date}`;
}

function crosscheckQuery(row) {
  const name = compactWords(normalizedName(row));
  const season = seasonLabel(row);
  const country = compactWords(row.country || row.coverageCountry || row.region || row.coverageRegion);

  return `${name} ${season} current standings fixtures results ${country} flashscore soccerway worldfootball`;
}

function expectedEvidenceFor(row) {
  const kind = competitionKind(row);

  if (kind === "league") {
    return [
      "current or final league table",
      "recent results or upcoming fixtures",
      "season marker",
      "official league/federation page or trusted sports crosscheck"
    ];
  }

  if (kind === "cup") {
    return [
      "current round or final result",
      "fixture calendar or round dates",
      "winner/champion marker if completed",
      "official cup/federation page or trusted sports crosscheck"
    ];
  }

  if (kind === "continental") {
    return [
      "current phase or qualifying round",
      "competition calendar",
      "recent results or upcoming fixtures",
      "official confederation/competition page or trusted sports crosscheck"
    ];
  }

  return [
    "competition status",
    "season marker",
    "fixtures/results evidence",
    "official or trusted source"
  ];
}

function sourcePolicyFor(targetType) {
  return {
    preferOfficial: targetType !== "trusted-crosscheck",
    allowTrustedSportsSitesForCrosscheck: true,
    rejectForumOrBettingOnlySources: true,
    rejectOldSeasonOnly: true,
    requireSeasonOrDateMarker: true,
    requireCompetitionStatusSignal: true,
    noFetchInThisJob: true,
    noCanonicalWrites: true
  };
}

function baseTarget(row) {
  const slug = competitionSlug(row);

  return {
    worksetBucket: asText(row.worksetBucket) || "seasonStatus",
    sourceWorkRowId: [
      asText(row.worksetBucket) || "seasonStatus",
      slug
    ].join("::"),
    leagueSlug: slug,
    targetLeagueSlug: slug,
    competitionSlug: slug,
    competitionName: normalizedName(row),
    competitionType: asText(row.competitionType || row.coverageType),
    competitionFamily: asText(row.competitionFamily),
    country: asText(row.country || row.coverageCountry),
    region: asText(row.region || row.coverageRegion),
    tier: Number(row.tier || row.coverageTier || 0),
    trust: Number(row.trust || row.coverageTrust || 0),
    targetDate: asText(row.targetDate),
    seasonKey: asText(row.seasonKey),
    standingsFreshness: asText(row.standingsFreshness),
    canonicalFixtureCountToday: Number(row.canonicalFixtureCountToday || 0),
    canonicalFixtureCountNext7Days: Number(row.canonicalFixtureCountNext7Days || 0),
    missingFTCount: Number(row.missingFTCount || 0),
    inventoryPriority: asText(row.inventoryPriority || row.priority),
    expectedEvidence: expectedEvidenceFor(row),
    validationIntent: "verify_football_truth_season_status",
    sourceType: "season_status_official_primary",
    fetchPurpose: "season_activity_status_calendar",
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function targetsForRow(row) {
  const slug = competitionSlug(row);
  if (!slug) return [];

  const targets = [
    {
      ...baseTarget(row),
      searchTargetId: `${slug}::season_status::official-primary`,
      targetType: "official-primary",
      sourceType: "season_status_official_primary",
      query: officialQuery(row),
      intent: "season_status_official_primary",
      sourcePolicy: sourcePolicyFor("official-primary")
    },
    {
      ...baseTarget(row),
      searchTargetId: `${slug}::season_status::calendar-status`,
      targetType: "calendar-status",
      sourceType: "season_status_calendar",
      query: calendarQuery(row),
      intent: "season_calendar_and_phase_status",
      sourcePolicy: sourcePolicyFor("calendar-status")
    },
    {
      ...baseTarget(row),
      searchTargetId: `${slug}::season_status::trusted-crosscheck`,
      targetType: "trusted-crosscheck",
      sourceType: "season_status_trusted_crosscheck",
      query: crosscheckQuery(row),
      intent: "season_status_trusted_crosscheck",
      sourcePolicy: sourcePolicyFor("trusted-crosscheck")
    }
  ];

  return targets.filter((target) => asText(target.query));
}

function sortRows(rows) {
  return [...rows].sort((a, b) =>
    Number(a.tier || 99) - Number(b.tier || 99) ||
    Number(b.trust || 0) - Number(a.trust || 0) ||
    asText(a.competitionSlug || a.leagueSlug).localeCompare(asText(b.competitionSlug || b.leagueSlug))
  );
}

function limitPerLeague(targets, perLeagueLimit) {
  if (!perLeagueLimit) return targets;

  const counts = new Map();
  return targets.filter((target) => {
    const slug = asText(target.competitionSlug || target.leagueSlug);
    const count = counts.get(slug) || 0;
    if (count >= perLeagueLimit) return false;
    counts.set(slug, count + 1);
    return true;
  });
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
  const bucket = asText(options.bucket) || "seasonStatus";
  const workRows = sortRows(workRowsOf(input, bucket));
  let searchTargetRows = workRows.flatMap(targetsForRow);
  searchTargetRows = limitPerLeague(searchTargetRows, Number(options.perLeagueLimit || 0));

  const limit = Number(options.limit || 0);
  if (limit > 0) searchTargetRows = searchTargetRows.slice(0, limit);

  return {
    ok: true,
    job: "build-football-truth-season-status-search-targets-file",
    generatedAt: new Date().toISOString(),
    inputPath: asText(options.inputPath),
    bucket,
    options: {
      limit,
      perLeagueLimit: Number(options.perLeagueLimit || 0)
    },
    summary: {
      inputWorkRowCount: workRows.length,
      searchTargetCount: searchTargetRows.length,
      byTargetType: countBy(searchTargetRows, "targetType"),
      byCompetitionFamily: countBy(searchTargetRows, "competitionFamily"),
      byInventoryPriority: countBy(searchTargetRows, "inventoryPriority"),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    searchTargetRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedFootballTruthWorkset: true,
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
    worksets: {
      seasonStatus: [
        {
          worksetBucket: "seasonStatus",
          leagueSlug: "eng.1",
          competitionSlug: "eng.1",
          competitionName: "Premier League",
          competitionType: "league",
          competitionFamily: "domestic_league",
          country: "england",
          region: "europe",
          tier: 1,
          trust: 1,
          targetDate: "2026-06-03",
          seasonKey: "2025-2026",
          standingsFreshness: "current_season",
          inventoryPriority: "ft_repair_and_season_status"
        },
        {
          worksetBucket: "seasonStatus",
          leagueSlug: "uefa.champions",
          competitionSlug: "uefa.champions",
          competitionName: "UEFA Champions League",
          competitionType: "continental",
          competitionFamily: "continental_or_global",
          region: "europe",
          tier: 1,
          trust: 1,
          targetDate: "2026-06-03",
          seasonKey: "2025-2026",
          inventoryPriority: "fixture_acquisition_and_season_status"
        }
      ]
    }
  };

  const report = buildReport(input, { inputPath: "self-test", bucket: "seasonStatus", limit: 0, perLeagueLimit: 0 });

  if (report.summary.inputWorkRowCount !== 2) throw new Error("expected two work rows");
  if (report.summary.searchTargetCount !== 6) throw new Error("expected six search targets");
  if (report.summary.byTargetType["official-primary"] !== 2) throw new Error("expected two official targets");
  if (report.summary.byTargetType["calendar-status"] !== 2) throw new Error("expected two calendar targets");
  if (report.summary.byTargetType["trusted-crosscheck"] !== 2) throw new Error("expected two trusted crosscheck targets");
  if (report.searchTargetRows.some((row) => row.canonicalWrites !== 0 || row.productionWrite !== false)) throw new Error("read-only target guarantee failed");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only report guarantee failed");

  const limited = buildReport(input, { inputPath: "self-test", bucket: "seasonStatus", limit: 3, perLeagueLimit: 2 });
  if (limited.summary.searchTargetCount !== 3) throw new Error("expected hard limit to produce three rows");

  return {
    ok: true,
    selfTest: "build-football-truth-season-status-search-targets-file",
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
    bucket: args.bucket,
    limit: args.limit,
    perLeagueLimit: args.perLeagueLimit
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