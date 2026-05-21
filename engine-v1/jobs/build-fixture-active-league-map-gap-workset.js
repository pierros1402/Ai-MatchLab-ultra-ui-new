import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";

function parseArgs(argv) {
  const out = {
    start: null,
    days: 3,
    output: null,
    snapshotRef: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--start" && argv[i + 1]) {
      out.start = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--days" && argv[i + 1]) {
      out.days = Number(String(argv[++i]).trim());
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      out.output = String(argv[++i]).trim();
      continue;
    }
    if (arg === "--snapshot-ref" && argv[i + 1]) {
      out.snapshotRef = String(argv[++i]).trim();
      continue;
    }

  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(out.start || ""))) {
    throw new Error("missing or invalid --start YYYY-MM-DD");
  }

  if (!Number.isInteger(out.days) || out.days < 1 || out.days > 14) {
    throw new Error("invalid --days, expected integer 1..14");
  }

  if (!out.output) {
    out.output = `data/football-truth/_diagnostics/fixture-active-league-map-gaps/${out.start}.fixture-active-league-map-gap-workset.json`;
  }

  return out;
}

function addDays(dayKey, offset) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonFromGitRefIfExists(ref, file) {
  if (!ref) return null;

  try {
    const raw = execFileSync("git", ["show", `${ref}:${file.replaceAll("\\", "/")}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readSnapshotJsonIfExists(file, snapshotRef) {
  if (snapshotRef) {
    return readJsonFromGitRefIfExists(snapshotRef, file);
  }

  return readJsonIfExists(file);
}

function normalizeCoverageRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.leagues)) return value.leagues;
  if (Array.isArray(value?.rows)) return value.rows;

  if (value && typeof value === "object") {
    return Object.entries(value).map(([slug, row]) => ({
      slug,
      ...(row && typeof row === "object" ? row : {})
    }));
  }

  return [];
}

function getLeagueSlug(row) {
  return String(row?.leagueSlug || row?.slug || row?.id || row?.league || "").trim();
}

function getFixtureRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.fixtures)) return payload.fixtures;
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function getHistoryRowsByLeague() {
  const file = "data/history/2025-2026.json";
  const payload = readSnapshotJsonIfExists(file, args.snapshotRef);
  const out = new Map();

  if (!payload || !Array.isArray(payload.days)) return out;

  for (const day of payload.days) {
    const rows = Array.isArray(day?.rows) ? day.rows : [];
    for (const row of rows) {
      const slug = getLeagueSlug(row);
      if (!slug) continue;
      out.set(slug, (out.get(slug) || 0) + 1);
    }
  }

  return out;
}

function fixtureSourceIds(row) {
  const values = [];

  for (const key of ["source", "sourceId", "provider", "providerId", "acquisitionSource", "fixtureSource"]) {
    if (row?.[key]) values.push(String(row[key]));
  }

  if (Array.isArray(row?.sources)) {
    for (const source of row.sources) {
      if (typeof source === "string") values.push(source);
      else if (source?.id) values.push(String(source.id));
      else if (source?.sourceId) values.push(String(source.sourceId));
      else if (source?.providerId) values.push(String(source.providerId));
    }
  }

  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

const args = parseArgs(process.argv.slice(2));
const dayKeys = Array.from({ length: args.days }, (_, index) => addDays(args.start, index));

const coverageRows = normalizeCoverageRows(LEAGUES_COVERAGE);
const coverageBySlug = new Map();

for (const row of coverageRows) {
  const slug = getLeagueSlug(row);
  if (!slug) continue;
  coverageBySlug.set(slug, row);
}

const historyRowsByLeague = getHistoryRowsByLeague();

const snapshotDays = [];
const fixtureLeagueMap = new Map();
const missingSnapshotDays = [];

for (const dayKey of dayKeys) {
  const file = `data/deploy-snapshots/${dayKey}/fixtures.json`;
  const payload = readSnapshotJsonIfExists(file, args.snapshotRef);

  if (!payload) {
    missingSnapshotDays.push(dayKey);
    snapshotDays.push({
      dayKey,
      snapshotFixturesPath: file,
      exists: false,
      fixtureCount: 0,
      leagueCount: 0,
      leagues: []
    });
    continue;
  }

  const fixtures = getFixtureRows(payload);
  const byLeague = new Map();

  for (const fixture of fixtures) {
    const slug = getLeagueSlug(fixture);
    if (!slug) continue;

    if (!byLeague.has(slug)) {
      byLeague.set(slug, {
        leagueSlug: slug,
        fixtureCount: 0,
        sourceIds: new Set()
      });
    }

    const entry = byLeague.get(slug);
    entry.fixtureCount += 1;

    for (const sourceId of fixtureSourceIds(fixture)) {
      entry.sourceIds.add(sourceId);
    }

    if (!fixtureLeagueMap.has(slug)) {
      fixtureLeagueMap.set(slug, {
        leagueSlug: slug,
        fixtureCount: 0,
        activeDays: new Set(),
        sourceIds: new Set()
      });
    }

    const aggregate = fixtureLeagueMap.get(slug);
    aggregate.fixtureCount += 1;
    aggregate.activeDays.add(dayKey);

    for (const sourceId of fixtureSourceIds(fixture)) {
      aggregate.sourceIds.add(sourceId);
    }
  }

  snapshotDays.push({
    dayKey,
    snapshotFixturesPath: file,
    exists: true,
    fixtureCount: fixtures.length,
    leagueCount: byLeague.size,
    leagues: [...byLeague.values()]
      .map((row) => ({
        leagueSlug: row.leagueSlug,
        fixtureCount: row.fixtureCount,
        sourceIds: [...row.sourceIds].sort()
      }))
      .sort((a, b) => b.fixtureCount - a.fixtureCount || a.leagueSlug.localeCompare(b.leagueSlug))
  });
}

const activeSnapshotLeagues = [...fixtureLeagueMap.values()].map((row) => {
  const coverage = coverageBySlug.get(row.leagueSlug) || null;
  const historyRows = historyRowsByLeague.get(row.leagueSlug) || 0;

  return {
    leagueSlug: row.leagueSlug,
    inDeclaredMap: Boolean(coverage),
    name: coverage?.name || coverage?.label || coverage?.leagueName || null,
    country: coverage?.country || coverage?.countryCode || null,
    tier: coverage?.tier || null,
    activeDays: [...row.activeDays].sort(),
    fixtureCount: row.fixtureCount,
    sourceIds: [...row.sourceIds].sort(),
    historyRows,
    historyStatus: historyRows >= 30 ? "usable_history" : historyRows > 0 ? "thin_history" : "missing_history"
  };
}).sort((a, b) => {
  if (a.inDeclaredMap !== b.inDeclaredMap) return a.inDeclaredMap ? -1 : 1;
  return b.fixtureCount - a.fixtureCount || a.leagueSlug.localeCompare(b.leagueSlug);
});

const activeDeclaredLeagues = activeSnapshotLeagues.filter((row) => row.inDeclaredMap);
const activeOutOfMapLeagues = activeSnapshotLeagues.filter((row) => !row.inDeclaredMap);

const declaredLeaguesNotActiveInSnapshots = [...coverageBySlug.entries()]
  .filter(([slug]) => !fixtureLeagueMap.has(slug))
  .map(([slug, row]) => ({
    leagueSlug: slug,
    name: row?.name || row?.label || row?.leagueName || null,
    country: row?.country || row?.countryCode || null,
    tier: row?.tier || null,
    historyRows: historyRowsByLeague.get(slug) || 0,
    externalDiscoveryTarget: true,
    reason: "declared_league_not_present_in_current_snapshot_window"
  }))
  .sort((a, b) => {
    const tierA = Number(a.tier ?? 999);
    const tierB = Number(b.tier ?? 999);
    return tierA - tierB || String(a.country || "").localeCompare(String(b.country || "")) || a.leagueSlug.localeCompare(b.leagueSlug);
  });

const p0ExternalDiscoveryTargets = declaredLeaguesNotActiveInSnapshots
  .filter((row) => Number(row.tier ?? 999) <= 2)
  .slice(0, 80);

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  auditWindow: {
    start: args.start,
    days: args.days,
    dayKeys,
    snapshotRef: args.snapshotRef
  },
  guarantees: {
    sourceFetch: false,
    canonicalWrites: 0,
    valueWrites: false,
    detailsWrites: false,
    productionWrite: false
  },
  summary: {
    declaredLeagueCount: coverageBySlug.size,
    snapshotDayCount: snapshotDays.length,
    missingSnapshotDayCount: missingSnapshotDays.length,
    snapshotActiveLeagueCount: activeSnapshotLeagues.length,
    activeDeclaredLeagueCount: activeDeclaredLeagues.length,
    activeOutOfMapLeagueCount: activeOutOfMapLeagues.length,
    declaredLeaguesNotActiveInSnapshots: declaredLeaguesNotActiveInSnapshots.length,
    p0ExternalDiscoveryTargetCount: p0ExternalDiscoveryTargets.length,
    activeWithThinOrMissingHistory: activeSnapshotLeagues.filter((row) => row.historyStatus !== "usable_history").length
  },
  missingSnapshotDays,
  snapshotDays,
  activeDeclaredLeagues,
  activeOutOfMapLeagues,
  declaredLeaguesNotActiveInSnapshots,
  p0ExternalDiscoveryTargets
};

fs.mkdirSync(path.dirname(args.output), { recursive: true });
fs.writeFileSync(args.output, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  ok: true,
  output: args.output,
  summary: report.summary,
  guarantees: report.guarantees
}, null, 2));