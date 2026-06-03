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
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    bucket: "needsFixtures",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--bucket") args.bucket = argv[++i] || "needsFixtures";
    else if (arg.startsWith("--bucket=")) args.bucket = arg.slice("--bucket=".length);
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function workRowsOf(input, bucket) {
  if (Array.isArray(input)) return input;
  if (input && input.worksets && Array.isArray(input.worksets[bucket])) return input.worksets[bucket];
  if (Array.isArray(input && input.globalSeasonStateWorkRows)) {
    return input.globalSeasonStateWorkRows.filter((row) => asText(row.worksetBucket) === bucket);
  }
  if (Array.isArray(input && input.rows)) return input.rows;
  return [];
}

function normalizedName(row) {
  return asText(row.competitionName) || asText(row.competitionSlug);
}

function targetDateOf(row) {
  return asText(row.targetDate) || new Date().toISOString().slice(0, 10);
}

function competitionKind(row) {
  const family = asText(row.competitionFamily);
  if (family === "domestic_league") return "league";
  if (family === "continental_or_global") return "continental";
  if (family === "cup_or_knockout") return "cup";
  return "competition";
}

function buildQueries(row) {
  const name = normalizedName(row);
  const slug = asText(row.competitionSlug);
  const date = targetDateOf(row);
  const kind = competitionKind(row);

  const base = [
    `${name} fixtures ${date}`,
    `${name} schedule ${date}`,
    `${name} matches ${date}`
  ];

  if (kind === "continental") {
    base.push(`${name} qualifying fixtures ${date}`);
    base.push(`${name} official fixtures schedule`);
  } else if (kind === "cup") {
    base.push(`${name} fixtures round schedule ${date}`);
    base.push(`${name} official fixtures`);
  } else {
    base.push(`${name} ${slug} fixtures ${date}`);
  }

  return Array.from(new Set(base.map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean)));
}

function targetRowsFor(row) {
  const slug = asText(row.competitionSlug);
  const date = targetDateOf(row);
  const queries = buildQueries(row);

  return queries.map((query, index) => ({
    searchTargetId: `${slug}::fixture_discovery::${String(index + 1).padStart(2, "0")}`,
    targetType: "global-season-state-fixture-discovery",
    worksetBucket: "needsFixtures",
    leagueSlug: slug,
    competitionSlug: slug,
    competitionName: normalizedName(row),
    competitionFamily: asText(row.competitionFamily),
    competitionType: asText(row.competitionType),
    country: asText(row.country),
    region: asText(row.region),
    tier: Number(row.tier || 0),
    targetDate: date,
    query,
    intent: "fixture_discovery",
    expectedEvidence: [
      "fixture list",
      "match schedule",
      "official or trusted competition page",
      "target date or next fixture date"
    ],
    sourcePolicy: {
      preferOfficial: true,
      allowTrustedSportsFixtures: true,
      rejectUnrelatedCompetition: true,
      rejectOldSeasonOnly: true
    },
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  }));
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport(input, { inputPath = "", bucket = "needsFixtures" } = {}) {
  const workRows = workRowsOf(input, bucket);
  const searchTargetRows = workRows.flatMap(targetRowsFor);

  return {
    ok: true,
    job: "build-global-season-state-fixture-search-targets-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    bucket,
    summary: {
      inputWorkRowCount: workRows.length,
      searchTargetCount: searchTargetRows.length,
      queryPerCompetitionMin: workRows.length > 0 ? Math.min(...workRows.map((row) => targetRowsFor(row).length)) : 0,
      queryPerCompetitionMax: workRows.length > 0 ? Math.max(...workRows.map((row) => targetRowsFor(row).length)) : 0,
      byCompetitionFamily: countBy(searchTargetRows, "competitionFamily"),
      byTargetType: countBy(searchTargetRows, "targetType"),
      sourceFetch: false,
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
      usesOnlyProvidedWorksetRows: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const input = {
    worksets: {
      needsFixtures: [
        {
          worksetBucket: "needsFixtures",
          competitionSlug: "uefa.champions",
          competitionName: "UEFA Champions League",
          competitionFamily: "continental_or_global",
          competitionType: "continental",
          targetDate: "2026-06-03",
          tier: 1,
          trust: 1
        },
        {
          worksetBucket: "needsFixtures",
          competitionSlug: "mex.1",
          competitionName: "Liga MX",
          competitionFamily: "domestic_league",
          competitionType: "league",
          country: "Mexico",
          targetDate: "2026-06-03",
          tier: 1,
          trust: 1
        }
      ]
    }
  };

  const report = buildReport(input, { inputPath: "self-test", bucket: "needsFixtures" });

  if (report.summary.inputWorkRowCount !== 2) throw new Error("expected two input work rows");
  if (report.summary.searchTargetCount < 8) throw new Error("expected multiple search targets");
  if (!report.summary.byCompetitionFamily.continental_or_global) throw new Error("expected continental targets");
  if (!report.summary.byCompetitionFamily.domestic_league) throw new Error("expected domestic targets");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "build-global-season-state-fixture-search-targets-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = buildReport(input, {
    inputPath: args.input,
    bucket: args.bucket
  });

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

export { buildReport };