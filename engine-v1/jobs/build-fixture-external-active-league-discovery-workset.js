import fs from "node:fs";
import path from "node:path";
import { leagueName as registryLeagueName } from "../../workers/_shared/leagues-registry.js";
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

    if ((arg === "--start" || arg === "--date") && argv[i + 1]) {
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
    out.output = `data/football-truth/_diagnostics/fixture-acquisition-stability/${out.start}.external-active-league-discovery-workset.json`;
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

function normalizeFixtureRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.events)) return payload.events;
  return [];
}

function getSlug(row) {
  return String(row?.slug || row?.leagueSlug || row?.id || "").trim();
}

function toTitleCase(value) {
  return String(value || "")
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (["AFC", "CAF", "UEFA", "CONCACAF", "CONMEBOL", "OFC"].includes(upper)) return upper;
      return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function ordinalDivisionLabel(value) {
  const division = Number.parseInt(String(value ?? ""), 10);
  if (division === 1) return "First Division";
  if (division === 2) return "Second Division";
  if (division === 3) return "Third Division";
  if (division === 4) return "Fourth Division";
  if (division === 5) return "Fifth Division";
  return "League";
}

function divisionNumberFromSlug(slug) {
  const match = String(slug || "").match(/\.([1-5])$/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

const KNOWN_DIAGNOSTIC_LEAGUE_NAMES = {
  "afc.champions": "AFC Champions League",
  "alb.1": "Albanian Superliga",
  "arg.1": "Argentine Primera Division",
  "arm.1": "Armenian First League",
  "aut.2": "Austria 2. Liga",
  "aut.cup": "Austrian Cup",
  "aze.1": "Azerbaijan Premier League",
  "bel.2": "Belgian Challenger Pro League",
  "caf.champions": "CAF Champions League",
  "caf.nations": "Africa Cup of Nations",
  "cyp.2": "Cypriot Second Division",
  "cyp.cup": "Cypriot Cup",
  "cze.1": "Czech First League",
  "cze.2": "Czech National Football League",
  "cze.cup": "Czech Cup",
  "den.2": "Danish 1st Division",
  "den.cup": "Danish Cup",
  "eng.1": "Premier League",
  "eng.2": "EFL Championship",
  "eng.3": "EFL League One"
};

function deriveDiagnosticLeagueName(row) {
  const slug = getSlug(row);
  const registryName = String(registryLeagueName(slug) || "").trim();
  if (registryName && registryName !== slug && registryName !== "unknown") return registryName;

  const knownName = KNOWN_DIAGNOSTIC_LEAGUE_NAMES[slug];
  if (knownName) return knownName;

  const country = toTitleCase(row?.country || row?.region || "");
  const type = String(row?.type || "").trim().toLowerCase();
  const tier = getTier(row);

  if (slug === "afc.champions") return "AFC Champions League";
  if (slug === "caf.champions") return "CAF Champions League";
  if (slug === "caf.nations") return "CAF Nations Cup";
  if (slug === "uefa.champions") return "UEFA Champions League";
  if (slug === "uefa.europa") return "UEFA Europa League";
  if (slug === "uefa.conference") return "UEFA Conference League";

  if (type === "cup" && country) {
    return `${country} Cup`;
  }

  if (type === "continental") {
    return toTitleCase(slug);
  }

  if (country) {
    const divisionNumber = divisionNumberFromSlug(slug);
    return `${country} ${ordinalDivisionLabel(divisionNumber ?? tier)}`;
  }

  return toTitleCase(slug);
}

function getName(row) {
  const explicitName = String(row?.name || row?.label || row?.leagueName || row?.competitionName || "").trim();
  if (explicitName) return explicitName;
  return deriveDiagnosticLeagueName(row);
}

function getCountry(row) {
  return String(row?.country || row?.countryCode || row?.region || "").trim();
}

function getTier(row) {
  const raw = row?.tier ?? row?.level ?? row?.divisionTier ?? null;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
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

function isWomenYouthDevelopmentLeague(row) {
  const text = [
    getSlug(row),
    getName(row),
    row?.category,
    row?.gender,
    row?.ageGroup,
    row?.type
  ].map((value) => String(value || "").toLowerCase()).join(" ");

  return /\b(women|woman|female|u17|u18|u19|u20|u21|u23|youth|academy|reserve|reserves|development)\b/.test(text);
}

function buildDeclaredRows() {
  const rows = [];

  for (const row of normalizeCoverageRows(LEAGUES_COVERAGE)) {
    const leagueSlug = getSlug(row);
    if (!leagueSlug) continue;

    rows.push({
      leagueSlug,
      name: getName(row),
      country: getCountry(row) || null,
      tier: getTier(row),
      excluded: isWomenYouthDevelopmentLeague(row)
    });
  }

  return rows.sort((a, b) => String(a.leagueSlug).localeCompare(String(b.leagueSlug)));
}

function buildHistoryCounts() {
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

function buildSnapshotCounts(dayKeys, snapshotRef) {
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

      if (!byLeague.has(slug)) {
        byLeague.set(slug, {
          leagueSlug: slug,
          snapshotFixtureCount: 0,
          snapshotDays: [],
          snapshotFixtureCountByDay: {}
        });
      }

      const entry = byLeague.get(slug);
      entry.snapshotFixtureCount += 1;
      entry.snapshotFixtureCountByDay[dayKey] = (entry.snapshotFixtureCountByDay[dayKey] || 0) + 1;
    }

    for (const [slug] of dayCounts.entries()) {
      const entry = byLeague.get(slug);
      if (entry && !entry.snapshotDays.includes(dayKey)) entry.snapshotDays.push(dayKey);
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

function buildCanonicalCounts(dayKeys, declaredRows, snapshotRef) {
  const byLeague = new Map();

  for (const dayKey of dayKeys) {
    for (const league of declaredRows) {
      const file = `data/canonical-fixtures/${dayKey}/${league.leagueSlug}.json`;
      const read = readJsonFromLocalOrRef(file, snapshotRef);
      const rows = normalizeFixtureRows(read.payload);
      if (rows.length === 0) continue;

      if (!byLeague.has(league.leagueSlug)) {
        byLeague.set(league.leagueSlug, {
          canonicalFixtureCount: 0,
          canonicalDays: [],
          canonicalFixtureCountByDay: {}
        });
      }

      const entry = byLeague.get(league.leagueSlug);
      entry.canonicalFixtureCount += rows.length;
      entry.canonicalFixtureCountByDay[dayKey] = rows.length;
      if (!entry.canonicalDays.includes(dayKey)) entry.canonicalDays.push(dayKey);
    }
  }

  return byLeague;
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function buildSearchQueries(row, dayKeys) {
  const name = row.name || row.leagueSlug;
  const country = row.country || "";
  const dateTerms = dayKeys.join(" OR ");

  return unique([
    `"${name}" fixtures ${dateTerms}`,
    `"${name}" schedule ${dateTerms}`,
    country ? `${country} "${name}" fixtures ${dayKeys[0]}` : "",
    country ? `${country} football "${name}" matches ${dayKeys[0]}` : "",
    `${row.leagueSlug} fixtures ${dayKeys[0]}`
  ]);
}

function priorityFor({ league, snapshotRow, historyRows }) {
  const tier = league.tier;
  const snapshotFixtureCount = snapshotRow?.snapshotFixtureCount || 0;

  if (snapshotFixtureCount > 0 && historyRows < 20) {
    return {
      priority: "P0",
      reason: "snapshot_active_but_thin_or_missing_history"
    };
  }

  if (snapshotFixtureCount > 0) {
    return {
      priority: "P1",
      reason: "snapshot_active_verify_provider_and_source_path"
    };
  }

  if (tier != null && tier <= 2) {
    return {
      priority: "P2",
      reason: "declared_top_tier_not_seen_in_snapshot_window_external_activity_check_required"
    };
  }

  return {
    priority: "P3",
    reason: "declared_league_not_seen_in_snapshot_window_external_activity_check_required"
  };
}

function buildRows({ declaredRows, dayKeys, snapshotCounts, canonicalCounts, historyCounts }) {
  const rows = [];
  const excludedRows = [];

  for (const league of declaredRows) {
    if (league.excluded) {
      excludedRows.push({
        leagueSlug: league.leagueSlug,
        name: league.name,
        country: league.country,
        tier: league.tier,
        reason: "excluded_women_youth_development_signal"
      });
      continue;
    }

    const snapshotRow = snapshotCounts.get(league.leagueSlug) || null;
    const canonicalRow = canonicalCounts.get(league.leagueSlug) || null;
    const historyRows = historyCounts.get(league.leagueSlug) || 0;
    const classification = priorityFor({ league, snapshotRow, historyRows });

    rows.push({
      leagueSlug: league.leagueSlug,
      name: league.name,
      country: league.country,
      tier: league.tier,
      days: dayKeys,
      snapshotFixtureCount: snapshotRow?.snapshotFixtureCount || 0,
      snapshotDays: snapshotRow?.snapshotDays || [],
      snapshotFixtureCountByDay: snapshotRow?.snapshotFixtureCountByDay || {},
      canonicalFixtureCount: canonicalRow?.canonicalFixtureCount || 0,
      canonicalDays: canonicalRow?.canonicalDays || [],
      canonicalFixtureCountByDay: canonicalRow?.canonicalFixtureCountByDay || {},
      historyRows,
      searchQueries: buildSearchQueries(league, dayKeys),
      expectedSourceTypes: [
        "official_competition_source",
        "reliable_structured_public_provider",
        "manual_verified_import_template"
      ],
      preferredSourceTypes: [
        "official_competition_fixture_page",
        "official_league_schedule_page",
        "major_provider_structured_schedule_cross_check"
      ],
      blockedSourceTypes: [
        "women_youth_development_unless_declared",
        "scoreboard_only_as_value_ready",
        "unverified_scrape_as_canonical_truth"
      ],
      reason: classification.reason,
      priority: classification.priority,
      guarantees: {
        sourceFetch: false,
        discoveredExternally: false,
        canonicalWrites: 0,
        productionWrite: false
      }
    });
  }

  rows.sort((a, b) => {
    const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return (order[a.priority] ?? 9) - (order[b.priority] ?? 9) ||
      (b.snapshotFixtureCount || 0) - (a.snapshotFixtureCount || 0) ||
      String(a.leagueSlug).localeCompare(String(b.leagueSlug));
  });

  return {
    rows,
    excludedRows
  };
}

async function main() {
  const options = parseArgs();
  const dayKeys = Array.from({ length: options.days }, (_, index) => addDays(options.start, index));

  const declaredRows = buildDeclaredRows();
  const historyCounts = buildHistoryCounts();
  const snapshot = buildSnapshotCounts(dayKeys, options.snapshotRef);
  const canonicalCounts = buildCanonicalCounts(dayKeys, declaredRows, options.snapshotRef);

  const built = buildRows({
    declaredRows,
    dayKeys,
    snapshotCounts: snapshot.byLeague,
    canonicalCounts,
    historyCounts
  });

  const priorityCounts = built.rows.reduce((acc, row) => {
    acc[row.priority] = (acc[row.priority] || 0) + 1;
    return acc;
  }, {});

  const mustHaveTargets = built.rows.filter((row) => row.snapshotFixtureCount > 0);
  const priorityTargets = built.rows.filter((row) => row.priority === "P0");
  const snapshotActiveRows = built.rows.filter((row) => row.snapshotFixtureCount > 0);
  const externalCheckTargets = built.rows.filter((row) => row.snapshotFixtureCount === 0);

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
      declaredLeagueCount: declaredRows.length,
      excludedWomenYouthDevelopmentCount: built.excludedRows.length,
      externalDiscoveryTargetCount: built.rows.length,
      mustHaveTargetCount: mustHaveTargets.length,
      priorityTargetCount: priorityTargets.length,
      priorityCounts,
      snapshotDayCount: dayKeys.length,
      missingSnapshotDayCount: snapshot.dayReports.filter((row) => row.missing).length,
      snapshotActiveLeagueCount: snapshot.byLeague.size,
      declaredSnapshotActiveTargetCount: snapshotActiveRows.length,
      activeWithThinOrMissingHistory: snapshotActiveRows.filter((row) => row.historyRows < 20).length,
      externalActivityUnknownDeclaredCount: externalCheckTargets.length,
      topTierExternalCheckTargetCount: externalCheckTargets.filter((row) => row.priority === "P2").length
    },
    rows: built.rows,
    priorityTargets,
    mustHaveTargets,
    externalCheckTargets,
    excludedRows: built.excludedRows,
    notes: [
      "This is a search/discovery target workset only.",
      "Rows are not externally discovered fixtures and must not be treated as verified activity.",
      "mustHaveTargets are leagues observed in our snapshot window; externalCheckTargets are declared leagues whose activity is still unknown.",
      "Scoreboard-only evidence is not value-ready fixture acquisition capability.",
      "Thin or missing history rows can be fixture-visible but must remain value-gated until history/statistical readiness is proven."
    ],
    guarantees: {
      sourceFetch: false,
      discoveredExternally: false,
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