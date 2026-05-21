import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";

function parseArgs(argv = process.argv.slice(2)) {
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

    if ((arg === "--snapshot-ref" || arg === "--git-ref") && argv[i + 1]) {
      out.snapshotRef = String(argv[++i]).trim();
      continue;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(out.start || ""))) {
    throw new Error("--start YYYY-MM-DD is required");
  }

  if (!Number.isFinite(out.days) || out.days < 1 || out.days > 14) {
    throw new Error("--days must be between 1 and 14");
  }

  if (!out.output) {
    out.output = `data/football-truth/_diagnostics/fixture-acquisition-stability/${out.start}.active-league-map-gap-workset.json`;
  }

  return out;
}

function addDays(dayKey, offset) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function safeJsonParse(text, context) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${context}: invalid JSON: ${error?.message || String(error)}`);
  }
}

function readLocalJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return safeJsonParse(fs.readFileSync(file, "utf8"), file);
}

function gitShowText(ref, repoPath) {
  if (!ref) return null;

  try {
    return execFileSync("git", ["show", `${ref}:${repoPath.replaceAll("\\", "/")}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
}

function readJsonFromLocalOrRef(localPath, ref = null) {
  const local = readLocalJsonIfExists(localPath);
  if (local) {
    return {
      payload: local,
      source: "local",
      path: localPath
    };
  }

  const repoPath = localPath.replace(/^\.[\\/]/, "").replaceAll("\\", "/");
  const text = gitShowText(ref, repoPath);
  if (!text) {
    return {
      payload: null,
      source: "missing",
      path: localPath,
      ref
    };
  }

  return {
    payload: safeJsonParse(text, `${ref}:${repoPath}`),
    source: "git_ref",
    path: repoPath,
    ref
  };
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

function getSlug(row) {
  return String(row?.slug || row?.leagueSlug || row?.id || "").trim();
}

function getName(row) {
  return String(row?.name || row?.label || row?.leagueName || "").trim();
}

function normalizeFixtureRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.matches)) return payload.matches;
  return [];
}

function getFixtureLeagueSlug(row) {
  return String(
    row?.leagueSlug ||
    row?.league?.slug ||
    row?.competitionSlug ||
    row?.competition?.slug ||
    ""
  ).trim();
}

function buildDeclaredLeagueMap() {
  const map = new Map();

  for (const row of normalizeCoverageRows(LEAGUES_COVERAGE)) {
    const slug = getSlug(row);
    if (!slug) continue;

    map.set(slug, {
      leagueSlug: slug,
      name: getName(row),
      country: row.country || row.countryCode || null,
      tier: row.tier ?? null,
      declared: true
    });
  }

  return map;
}

function buildHistoryLeagueCounts() {
  const file = "data/history/2025-2026.json";
  const payload = readLocalJsonIfExists(file);
  const counts = new Map();

  const days = Array.isArray(payload?.days) ? payload.days : [];
  for (const day of days) {
    const rows = Array.isArray(day?.rows) ? day.rows : [];
    for (const row of rows) {
      const slug = getFixtureLeagueSlug(row);
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) || 0) + 1);
    }
  }

  return counts;
}

function buildSnapshotLeagueCounts(dayKeys, snapshotRef) {
  const byLeague = new Map();
  const dayReports = [];

  for (const dayKey of dayKeys) {
    const file = `data/deploy-snapshots/${dayKey}/fixtures.json`;
    const read = readJsonFromLocalOrRef(file, snapshotRef);
    const rows = normalizeFixtureRows(read.payload);

    const dayCounts = new Map();
    for (const row of rows) {
      const slug = getFixtureLeagueSlug(row);
      if (!slug) continue;
      dayCounts.set(slug, (dayCounts.get(slug) || 0) + 1);
      byLeague.set(slug, byLeague.get(slug) || {
        leagueSlug: slug,
        activeFixtureCount: 0,
        activeDays: [],
        snapshotFixtureCountByDay: {}
      });
      const entry = byLeague.get(slug);
      entry.activeFixtureCount += 1;
      entry.snapshotFixtureCountByDay[dayKey] = (entry.snapshotFixtureCountByDay[dayKey] || 0) + 1;
    }

    for (const [slug] of dayCounts) {
      const entry = byLeague.get(slug);
      if (entry && !entry.activeDays.includes(dayKey)) entry.activeDays.push(dayKey);
    }

    dayReports.push({
      dayKey,
      source: read.source,
      ref: read.ref || null,
      fixtureCount: rows.length,
      leagueCount: dayCounts.size,
      missing: read.source === "missing"
    });
  }

  return {
    byLeague,
    dayReports
  };
}

function classifyRows({ declaredMap, snapshotCounts, historyCounts }) {
  const activeDeclared = [];
  const activeOutOfMap = [];
  const declaredNotActive = [];

  for (const [slug, snapshotRow] of snapshotCounts.entries()) {
    const declared = declaredMap.get(slug);
    const base = declared || {
      leagueSlug: slug,
      name: "",
      country: null,
      tier: null,
      declared: false
    };

    const row = {
      ...base,
      activeFixtureCount: snapshotRow.activeFixtureCount,
      activeDays: snapshotRow.activeDays,
      snapshotFixtureCountByDay: snapshotRow.snapshotFixtureCountByDay,
      historyRows: historyCounts.get(slug) || 0,
      reasons: []
    };

    if (!declared) {
      row.reasons.push("active_league_not_in_declared_map");
      activeOutOfMap.push(row);
      continue;
    }

    if (row.historyRows < 20) row.reasons.push("thin_or_missing_history");
    activeDeclared.push(row);
  }

  for (const [slug, declared] of declaredMap.entries()) {
    if (snapshotCounts.has(slug)) continue;

    declaredNotActive.push({
      ...declared,
      activeFixtureCount: 0,
      activeDays: [],
      snapshotFixtureCountByDay: {},
      historyRows: historyCounts.get(slug) || 0,
      reasons: ["declared_league_not_active_in_snapshot_window"]
    });
  }

  const p0 = [
    ...activeDeclared.filter((row) => row.historyRows < 20),
    ...activeOutOfMap
  ].sort((a, b) =>
    (b.activeFixtureCount || 0) - (a.activeFixtureCount || 0) ||
    String(a.leagueSlug).localeCompare(String(b.leagueSlug))
  );

  return {
    activeDeclared: activeDeclared.sort((a, b) =>
      (b.activeFixtureCount || 0) - (a.activeFixtureCount || 0) ||
      String(a.leagueSlug).localeCompare(String(b.leagueSlug))
    ),
    activeOutOfMap: activeOutOfMap.sort((a, b) =>
      (b.activeFixtureCount || 0) - (a.activeFixtureCount || 0) ||
      String(a.leagueSlug).localeCompare(String(b.leagueSlug))
    ),
    declaredNotActive: declaredNotActive.sort((a, b) =>
      String(a.leagueSlug).localeCompare(String(b.leagueSlug))
    ),
    p0
  };
}

async function main() {
  const options = parseArgs();
  const dayKeys = Array.from({ length: options.days }, (_, index) => addDays(options.start, index));

  const declaredMap = buildDeclaredLeagueMap();
  const historyCounts = buildHistoryLeagueCounts();
  const snapshot = buildSnapshotLeagueCounts(dayKeys, options.snapshotRef);
  const classified = classifyRows({
    declaredMap,
    snapshotCounts: snapshot.byLeague,
    historyCounts
  });

  const activeWithThinOrMissingHistory = classified.activeDeclared
    .filter((row) => row.historyRows < 20)
    .length;

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    auditWindow: {
      start: options.start,
      days: options.days,
      dayKeys
    },
    inputs: {
      snapshotRef: options.snapshotRef || null,
      snapshotDayReports: snapshot.dayReports
    },
    summary: {
      declaredLeagueCount: declaredMap.size,
      snapshotDayCount: dayKeys.length,
      missingSnapshotDayCount: snapshot.dayReports.filter((row) => row.missing).length,
      snapshotActiveLeagueCount: snapshot.byLeague.size,
      activeDeclaredLeagueCount: classified.activeDeclared.length,
      activeOutOfMapLeagueCount: classified.activeOutOfMap.length,
      declaredLeaguesNotActiveInSnapshots: classified.declaredNotActive.length,
      p0ExternalDiscoveryTargetCount: classified.p0.length,
      activeWithThinOrMissingHistory
    },
    p0: classified.p0,
    activeDeclared: classified.activeDeclared,
    activeOutOfMap: classified.activeOutOfMap,
    declaredNotActiveInSnapshots: classified.declaredNotActive,
    guarantees: {
      sourceFetch: false,
      canonicalWrites: 0,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    }
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    ok: true,
    output: options.output,
    summary: report.summary,
    inputs: report.inputs,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});