import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function resolvePath(input) {
  if (!input) return null;
  if (path.isAbsolute(input)) return input;
  return path.resolve(rootDir(), input);
}

function increment(map, key, step = 1) {
  const safeKey = normalizeText(key) || "unknown";
  map[safeKey] = (map[safeKey] || 0) + step;
}

function pushBucket(map, key, value) {
  const safeKey = normalizeText(key) || "unknown";
  if (!Array.isArray(map[safeKey])) map[safeKey] = [];
  map[safeKey].push(value);
}

function sortObjectDesc(input = {}) {
  return Object.fromEntries(
    Object.entries(input).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return String(a[0]).localeCompare(String(b[0]));
    })
  );
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildOutputPath(diagnosticFile) {
  const dir = path.dirname(diagnosticFile);
  const base = path.basename(diagnosticFile, ".json");
  return path.join(dir, `${base}.coverage-report.json`);
}

function topExamples(items = [], limit = 5) {
  return items.slice(0, limit);
}

export async function buildTeamGeoCoverageReport(inputArg) {
  const diagnosticFile = resolvePath(inputArg);

  if (!diagnosticFile || !fs.existsSync(diagnosticFile)) {
    throw new Error(`diagnostic file not found: ${inputArg}`);
  }

  const rows = readJson(diagnosticFile);

  if (!Array.isArray(rows)) {
    throw new Error("diagnostic file must contain an array");
  }

  const totals = {
    total: rows.length,
    complete: 0,
    safe_partial: 0,
    unresolved: 0
  };

  const byStatus = {};
  const byReason = {};
  const byLeague = {};
  const unresolvedByLeague = {};
  const unresolvedByLeagueReason = {};
  const unresolvedExamplesByReason = {};
  const partialByLeague = {};
  const partialExamples = [];

  for (const row of rows) {
    const status = normalizeText(row?.status).toLowerCase() || "unknown";
    const reason = normalizeText(row?.reason) || "unknown";
    const leagueSlug = normalizeText(row?.leagueSlug) || "unknown";
    const team = normalizeText(row?.team) || "unknown";
    const quality = normalizeText(row?.validation?.quality) || null;

    increment(byStatus, status);
    increment(byLeague, leagueSlug);

    if (status === "complete") totals.complete += 1;
    else if (status === "safe_partial") totals.safe_partial += 1;
    else if (status === "unresolved") totals.unresolved += 1;

    if (status === "unresolved") {
      increment(byReason, reason);
      increment(unresolvedByLeague, leagueSlug);

      if (!unresolvedByLeagueReason[leagueSlug]) {
        unresolvedByLeagueReason[leagueSlug] = {};
      }
      increment(unresolvedByLeagueReason[leagueSlug], reason);

      pushBucket(unresolvedExamplesByReason, reason, {
        team,
        leagueSlug,
        country: row?.country || null,
        city: row?.city || null,
        venue: row?.venue || null,
        validation: row?.validation || null
      });
    }

    if (status === "safe_partial") {
      increment(partialByLeague, leagueSlug);
      partialExamples.push({
        team,
        leagueSlug,
        quality,
        country: row?.country || null,
        city: row?.city || null,
        venue: row?.venue || null,
        latitude: row?.latitude ?? null,
        longitude: row?.longitude ?? null
      });
    }
  }

  const unresolvedExampleSummary = Object.fromEntries(
    Object.entries(unresolvedExamplesByReason)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([reason, items]) => [reason, topExamples(items, 5)])
  );

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    diagnosticFile,
    totals,
    byStatus: sortObjectDesc(byStatus),
    byLeague: sortObjectDesc(byLeague),
    unresolved: {
      total: totals.unresolved,
      byReason: sortObjectDesc(byReason),
      byLeague: sortObjectDesc(unresolvedByLeague),
      byLeagueReason: Object.fromEntries(
        Object.entries(unresolvedByLeagueReason)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([leagueSlug, reasonMap]) => [leagueSlug, sortObjectDesc(reasonMap)])
      ),
      examplesByReason: unresolvedExampleSummary
    },
    safePartial: {
      total: totals.safe_partial,
      byLeague: sortObjectDesc(partialByLeague),
      examples: topExamples(partialExamples, 10)
    }
  };

  const outputFile = buildOutputPath(diagnosticFile);
  writeJson(outputFile, report);

  return {
    ok: true,
    diagnosticFile,
    outputFile,
    totals,
    unresolvedByReason: report.unresolved.byReason,
    unresolvedByLeague: report.unresolved.byLeague,
    safePartialByLeague: report.safePartial.byLeague
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const inputArg = process.argv[2];

  if (!inputArg) {
    console.error("[build-team-geo-coverage-report] cli:fatal missing diagnostic file");
    process.exit(1);
  }

  console.log("[build-team-geo-coverage-report] cli:start", { inputArg });

  buildTeamGeoCoverageReport(inputArg)
    .then(result => {
      console.log("[build-team-geo-coverage-report] cli:done", result);
    })
    .catch(err => {
      console.error("[build-team-geo-coverage-report] cli:fatal", err);
      process.exit(1);
    });
}