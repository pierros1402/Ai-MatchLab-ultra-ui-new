import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildFinalResultWatchset } from "./build-final-result-watchset.js";
import { discoverFinalResultSources } from "../football-truth/source-discovery.js";

function dataPath(...parts) {
  return path.join(process.cwd(), "data", ...parts);
}

function writeJsonPretty(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const out = {
    date: null,
    limit: 25,
    minAgeHours: 0,
    maxSearchDescriptors: 8,
    output: null,
    pretty: true
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

    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--limit must be an integer >= 1");
      }
      out.limit = value;
      continue;
    }

    if (arg.startsWith("--min-age-hours=")) {
      const value = Number(arg.slice("--min-age-hours=".length));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--min-age-hours must be a number >= 0");
      }
      out.minAgeHours = value;
      continue;
    }

    if (arg.startsWith("--max-search-descriptors=")) {
      const value = Number(arg.slice("--max-search-descriptors=".length));
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--max-search-descriptors must be an integer >= 0");
      }
      out.maxSearchDescriptors = value;
      continue;
    }

    if (arg.startsWith("--output=")) {
      out.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--compact") {
      out.pretty = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/discover-final-result-sources-watchset-day.js --date=YYYY-MM-DD [--limit=25]",
    "",
    "Builds a final-result watchset from deploy snapshot fixtures, then runs read-only source discovery for each selected row.",
    "",
    "This job is read-only. It does not fetch pages, decide final truth, promote canonical data, or write fixtures/value/history/standings/details."
  ].join("\n");
}

function latestSnapshotDay() {
  const root = dataPath("deploy-snapshots");
  if (!fs.existsSync(root)) return null;

  const days = fs.readdirSync(root)
    .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort();

  return days[days.length - 1] || null;
}

function summarizeResults(results) {
  const byVerdict = {};
  const byPriority = {};
  const byReason = {};
  const byLeague = {};

  for (const row of results) {
    const verdict = row.discovery?.verdict || "unknown";
    byVerdict[verdict] = (byVerdict[verdict] || 0) + 1;

    const priority = row.watchRow?.priority || "unknown";
    byPriority[priority] = (byPriority[priority] || 0) + 1;

    const reason = row.watchRow?.reason || "unknown";
    byReason[reason] = (byReason[reason] || 0) + 1;

    const league = row.watchRow?.leagueSlug || "unknown";
    byLeague[league] = (byLeague[league] || 0) + 1;
  }

  return {
    byVerdict,
    byPriority,
    byReason,
    byLeague,
    okCount: results.filter(row => row.discovery?.ok === true).length,
    failedCount: results.filter(row => row.discovery?.ok !== true).length,
    totalSourceDescriptors: results.reduce((sum, row) => sum + Number(row.discovery?.counts?.sourceDescriptors || 0), 0),
    totalSearchDescriptors: results.reduce((sum, row) => sum + Number(row.discovery?.counts?.searchDescriptors || 0), 0)
  };
}

export function buildSourceDiscoveryWatchsetDayReport(options = {}) {
  const date = options.date || latestSnapshotDay();
  if (!date) {
    throw new Error("No --date provided and no deploy snapshot days found");
  }

  const watchset = buildFinalResultWatchset({
    date,
    minAgeHours: options.minAgeHours,
    noReport: true
  });

  const rows = Array.isArray(watchset.rows) ? watchset.rows.slice(0, options.limit) : [];

  const results = rows.map((watchRow, index) => {
    const discovery = discoverFinalResultSources(watchRow, {
      maxSearchDescriptors: options.maxSearchDescriptors
    });

    return {
      index,
      watchRow: {
        day: watchRow.day || watchRow.date || null,
        matchId: watchRow.matchId || watchRow.fixtureId || watchRow.id || null,
        kickoffUtc: watchRow.kickoffUtc || null,
        leagueSlug: watchRow.leagueSlug || null,
        homeTeam: watchRow.homeTeam || watchRow.home || null,
        awayTeam: watchRow.awayTeam || watchRow.away || null,
        currentStatus: watchRow.currentStatus || watchRow.status || null,
        rawStatus: watchRow.rawStatus || null,
        reason: watchRow.reason || null,
        priority: watchRow.priority || null,
        sourceState: watchRow.sourceState || null
      },
      discovery
    };
  });

  const summary = summarizeResults(results);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "discover-final-result-sources-watchset-day",
    mode: "read_only_source_discovery_batch",
    canonicalWrites: 0,
    date,
    limit: options.limit,
    minAgeHours: options.minAgeHours,
    maxSearchDescriptors: options.maxSearchDescriptors,
    watchsetSummary: watchset.summary,
    selectedRows: rows.length,
    summary,
    guarantees: {
      noFetch: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0
    },
    results
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  const report = buildSourceDiscoveryWatchsetDayReport(args);
  const output = args.output || dataPath("football-truth", "_diagnostics", `source-discovery-watchset-${report.date}.json`);

  if (args.pretty) {
    writeJsonPretty(output, report);
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report)}\n`, "utf8");
  }

  console.log(JSON.stringify({
    ok: report.ok,
    wrote: output,
    date: report.date,
    selectedRows: report.selectedRows,
    summary: report.summary,
    canonicalWrites: report.canonicalWrites,
    guarantees: report.guarantees
  }, null, 2));

  if (report.summary.failedCount > 0) {
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error?.message || String(error),
      job: "discover-final-result-sources-watchset-day"
    }, null, 2));
    process.exitCode = 1;
  }
}
