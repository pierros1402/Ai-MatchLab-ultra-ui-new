import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFinalResultWatchsetFromRows,
  summarizeWatchset
} from "../football-truth/result-watchset-builder.js";

function dataPath(...parts) {
  return path.join(process.cwd(), "data", ...parts);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonPretty(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function compareDay(a, b) {
  return String(a).localeCompare(String(b));
}

function parseArgs(argv) {
  const out = {
    date: null,
    from: null,
    to: null,
    minAgeHours: 2,
    warnOnly: false,
    noReport: false
  };

  for (const arg of argv) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      out.date = arg;
      continue;
    }

    if (arg.startsWith("--date=")) {
      out.date = arg.slice("--date=".length);
      continue;
    }

    if (arg.startsWith("--from=")) {
      out.from = arg.slice("--from=".length);
      continue;
    }

    if (arg.startsWith("--to=")) {
      out.to = arg.slice("--to=".length);
      continue;
    }

    if (arg.startsWith("--min-age-hours=")) {
      out.minAgeHours = Number(arg.slice("--min-age-hours=".length));
      continue;
    }

    if (arg === "--warn-only" || arg === "--exit-zero") {
      out.warnOnly = true;
      continue;
    }

    if (arg === "--no-report") {
      out.noReport = true;
      continue;
    }
  }

  return out;
}

export function buildFinalResultWatchset(options = {}) {
  const snapshotRoot = dataPath("deploy-snapshots");

  const availableDays = fs.existsSync(snapshotRoot)
    ? fs.readdirSync(snapshotRoot).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort()
    : [];

  const days = availableDays.filter(day => {
    if (options.date && day !== options.date) return false;
    if (options.from && compareDay(day, options.from) < 0) return false;
    if (options.to && compareDay(day, options.to) > 0) return false;
    return true;
  });

  const rows = [];
  const daySummaries = [];

  for (const day of days) {
    const file = dataPath("deploy-snapshots", day, "fixtures.json");
    if (!fs.existsSync(file)) {
      daySummaries.push({ day, fixtures: 0, watchCount: 0, missingFixturesFile: true });
      continue;
    }

    const payload = readJson(file);
    const fixtureRows = rowsOf(payload);
    const watchRows = buildFinalResultWatchsetFromRows(fixtureRows, {
      day,
      minAgeHours: options.minAgeHours
    });

    rows.push(...watchRows);
    daySummaries.push({
      day,
      fixtures: fixtureRows.length,
      watchCount: watchRows.length,
      missingFixturesFile: false,
      summary: summarizeWatchset(watchRows)
    });
  }

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    date: options.date || null,
    from: options.from || null,
    to: options.to || null,
    minAgeHours: options.minAgeHours,
    days: daySummaries.length,
    summary: summarizeWatchset(rows),
    daySummaries,
    rows
  };

  if (!options.noReport) {
    const key = options.date || `${options.from || "first"}_${options.to || "latest"}`;
    const file = dataPath("final-result-watchsets", `${key}.json`);
    writeJsonPretty(file, report);
    report.reportFile = file;
  }

  return report;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const result = buildFinalResultWatchset(args);

  console.log(JSON.stringify({
    ok: result.ok,
    generatedAt: result.generatedAt,
    date: result.date,
    from: result.from,
    to: result.to,
    minAgeHours: result.minAgeHours,
    days: result.days,
    summary: result.summary,
    reportFile: result.reportFile || null,
    sample: result.rows.slice(0, 20)
  }, null, 2));

  if (!args.warnOnly && result.rows.length > 0) {
    process.exitCode = 2;
  }
}
