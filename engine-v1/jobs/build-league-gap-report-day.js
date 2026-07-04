/**
 * build-league-gap-report-day.js
 *
 * Daily league readiness/gap report — the single place that answers, per
 * declared league slug, "what did we actually cover today and what did we
 * merely declare?".
 *
 * For every declared slug it compares:
 *   declared registry → in-season flag → expected matches (real fixture
 *   signal) → acquisition selection + provider raw events → canonical
 *   fixtures → deploy-snapshot fixtures → details files → value picks →
 *   standings stores.
 *
 * Every league with expected matches that ended the day without canonical
 * fixtures is marked BROKEN with a concrete reason
 * (season_calendar_false_negative, providers_zero_events, …) so coverage
 * losses are loud instead of silently shrinking the fixture count.
 *
 * Output: data/coverage-readiness/{dayKey}.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LEAGUE_SEEDS, leagueName } from "../config.js";
import { LEAGUES_BY_SLUG } from "../../workers/_shared/leagues-coverage.js";
import { isInSeason } from "../source-discovery/season-calendar.js";
import { athensDayKey, shiftDay } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

function log(...a) { console.log("[league-gap-report]", ...a); }

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function inSeasonOn(slug, dayKey) {
  try {
    const meta = LEAGUES_BY_SLUG[slug] || {};
    return Boolean(isInSeason(slug, meta, new Date(`${dayKey}T12:00:00Z`)).inSeason);
  } catch {
    return false;
  }
}

// Latest acquisition result per slug for the target day. The acquisition run
// report is keyed by its base day and may cover the target day from the
// previous day's window too, so both files are consulted.
function acquisitionResultsForDay(dayKey) {
  const bySlug = new Map();
  let selected = new Set();
  let seasonOverrides = new Set();

  for (const reportDay of [shiftDay(dayKey, -1), dayKey]) {
    const report = readJsonSafe(resolveDataPath("coverage-reports", `${reportDay}.json`), null);
    if (!report) continue;

    for (const slug of Array.isArray(report.selectedLeagues) ? report.selectedLeagues : []) {
      selected.add(String(slug));
    }
    for (const slug of Array.isArray(report.seasonOverrides) ? report.seasonOverrides : []) {
      seasonOverrides.add(String(slug));
    }

    for (const row of Array.isArray(report.results) ? report.results : []) {
      if (String(row?.dayKey || "") !== String(dayKey)) continue;
      const slug = String(row?.slug || "").trim();
      if (!slug) continue;
      // Later runs overwrite earlier ones — keep the freshest attempt.
      bySlug.set(slug, row);
    }
  }

  return { bySlug, selected, seasonOverrides };
}

function expectedCountsForDay(dayKey) {
  const record = readJsonSafe(resolveDataPath("expected-matches", `${dayKey}.json`), null);
  const counts = new Map();

  for (const match of Array.isArray(record?.matches) ? record.matches : []) {
    const slug = String(match?.leagueSlug || "").trim();
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }

  return counts;
}

function canonicalCountsForDay(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  const counts = new Map();
  if (!fs.existsSync(dir)) return counts;

  for (const file of fs.readdirSync(dir).filter(x => x.endsWith(".json"))) {
    const slug = path.basename(file, ".json");
    const payload = readJsonSafe(path.join(dir, file), null);
    const rows = Array.isArray(payload?.fixtures) ? payload.fixtures : [];
    counts.set(slug, rows.length);
  }

  return counts;
}

function snapshotStateForDay(dayKey) {
  const root = resolveDataPath("deploy-snapshots", dayKey);
  const fixturesPayload = readJsonSafe(path.join(root, "fixtures.json"), null);
  const valuePayload = readJsonSafe(path.join(root, "value.json"), null);

  const fixtureCounts = new Map();
  const cidToLeague = new Map();
  for (const row of Array.isArray(fixturesPayload?.fixtures) ? fixturesPayload.fixtures : []) {
    const slug = String(row?.leagueSlug || "").trim() || "unknown";
    fixtureCounts.set(slug, (fixtureCounts.get(slug) || 0) + 1);
    for (const id of [row?.canonicalId, row?.matchId]) {
      const key = String(id || "").trim();
      if (key) cidToLeague.set(key, slug);
    }
  }

  const valueCounts = new Map();
  for (const pick of Array.isArray(valuePayload?.picks) ? valuePayload.picks : []) {
    const slug = String(pick?.leagueSlug || "").trim() || "unknown";
    valueCounts.set(slug, (valueCounts.get(slug) || 0) + 1);
  }

  const detailCounts = new Map();
  const detailValueCounts = new Map();
  const detailsDir = path.join(root, "details");
  if (fs.existsSync(detailsDir)) {
    for (const file of fs.readdirSync(detailsDir).filter(x => x.endsWith(".json"))) {
      const id = path.basename(file, ".json");
      let slug = cidToLeague.get(id);
      if (!slug) {
        const detail = readJsonSafe(path.join(detailsDir, file), null);
        slug = String(detail?.basic?.leagueSlug || "").trim() || "unknown";
      }
      detailCounts.set(slug, (detailCounts.get(slug) || 0) + 1);

      const detail = readJsonSafe(path.join(detailsDir, file), null);
      const hasValue = Array.isArray(detail?.value) && detail.value.length > 0;
      if (hasValue) detailValueCounts.set(slug, (detailValueCounts.get(slug) || 0) + 1);
    }
  }

  return { fixtureCounts, valueCounts, detailCounts, detailValueCounts };
}

function standingsStateForSlug(slug) {
  const main = fs.existsSync(resolveDataPath("standings", `${slug}.json`));
  const leagueMemory = fs.existsSync(resolveDataPath("league-memory", "standings", `${slug}.json`));
  return {
    standingsReady: main || leagueMemory,
    standingsSource: main ? "data/standings" : leagueMemory ? "league-memory" : null
  };
}

function classify(row) {
  const expected = row.expectedMatches;
  const canonical = row.canonicalFixtures;

  if (expected > 0 && canonical === 0) {
    if (!row.selectedForAcquisition) {
      return { status: "BROKEN", reason: "season_calendar_false_negative" };
    }
    if (row.rawEvents === 0) {
      return { status: "BROKEN", reason: "providers_zero_events" };
    }
    if (row.acquisitionError) {
      return { status: "BROKEN", reason: `acquisition_error:${row.acquisitionError}` };
    }
    return { status: "BROKEN", reason: "acquired_but_not_canonical" };
  }

  if (canonical > 0) {
    if (row.snapshotFixtures === 0) {
      return { status: "WARN", reason: "canonical_not_in_snapshot" };
    }
    if (row.detailsFiles < row.snapshotFixtures) {
      return { status: "PARTIAL", reason: "details_missing_for_some_fixtures" };
    }
    if (!row.standingsReady) {
      return { status: "PARTIAL", reason: "standings_missing" };
    }
    return { status: "READY", reason: null };
  }

  // No expected matches and no canonical fixtures — nothing to cover today.
  return row.inSeason
    ? { status: "IDLE", reason: "no_matches_today" }
    : { status: "OUT_OF_SEASON", reason: null };
}

export function buildLeagueGapReportDay(dayKey = athensDayKey()) {
  const date = String(dayKey);

  const declared = (Array.isArray(LEAGUE_SEEDS) ? LEAGUE_SEEDS : [])
    .map(x => String(x || "").trim())
    .filter(Boolean);

  const acquisition = acquisitionResultsForDay(date);
  const expected = expectedCountsForDay(date);
  const canonical = canonicalCountsForDay(date);
  const snapshot = snapshotStateForDay(date);

  const rows = [];

  for (const slug of declared) {
    const acq = acquisition.bySlug.get(slug) || null;
    const standings = standingsStateForSlug(slug);

    const row = {
      slug,
      leagueName: leagueName(slug),
      declared: true,
      inSeason: inSeasonOn(slug, date),
      seasonOverride: acquisition.seasonOverrides.has(slug),
      expectedMatches: expected.get(slug) || 0,
      selectedForAcquisition: acquisition.selected.has(slug),
      provider: acq?.provider || null,
      providerAttempts: acq?.providerAttempts || null,
      rawEvents: Number(acq?.rawEvents ?? 0),
      accepted: Number(acq?.accepted ?? 0),
      acquisitionError: acq?.error || null,
      canonicalFixtures: canonical.get(slug) || 0,
      snapshotFixtures: snapshot.fixtureCounts.get(slug) || 0,
      detailsFiles: snapshot.detailCounts.get(slug) || 0,
      detailsWithValue: snapshot.detailValueCounts.get(slug) || 0,
      valuePicks: snapshot.valueCounts.get(slug) || 0,
      standingsReady: standings.standingsReady,
      standingsSource: standings.standingsSource
    };

    const { status, reason } = classify(row);
    row.status = status;
    row.reason = reason;
    rows.push(row);
  }

  // Leagues that appear in the day's data but are NOT declared (should be rare
  // — usually a slug alias bug worth surfacing).
  const declaredSet = new Set(declared);
  const undeclaredSlugs = [...new Set([...expected.keys(), ...canonical.keys()])]
    .filter(slug => !declaredSet.has(slug))
    .sort();

  const byStatus = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  }

  const broken = rows
    .filter(row => row.status === "BROKEN")
    .map(row => ({
      slug: row.slug,
      expectedMatches: row.expectedMatches,
      reason: row.reason,
      providerAttempts: row.providerAttempts
    }));

  const expectedTotal = [...expected.values()].reduce((s, n) => s + n, 0);
  const canonicalTotal = [...canonical.values()].reduce((s, n) => s + n, 0);
  const lostMatches = broken.reduce((s, b) => s + b.expectedMatches, 0);

  const report = {
    ok: true,
    dayKey: date,
    generatedAt: new Date().toISOString(),
    summary: {
      declaredLeagues: declared.length,
      selectedForAcquisition: acquisition.selected.size,
      leaguesWithExpectedMatches: expected.size,
      leaguesWithCanonicalFixtures: canonical.size,
      expectedMatchesTotal: expectedTotal,
      canonicalFixturesTotal: canonicalTotal,
      lostExpectedMatches: lostMatches,
      standingsReadyLeagues: rows.filter(r => r.standingsReady).length,
      standingsMissingLeagues: rows.filter(r => !r.standingsReady).length,
      byStatus
    },
    broken,
    undeclaredSlugs,
    leagues: rows
  };

  const outDir = resolveDataPath("coverage-readiness");
  ensureDir(outDir);
  const outFile = path.join(outDir, `${date}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");

  log("written", {
    dayKey: date,
    file: outFile,
    byStatus,
    broken: broken.map(b => `${b.slug}(${b.expectedMatches})`),
    lostExpectedMatches: lostMatches
  });

  return { ...report, file: outFile };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || athensDayKey();
  const r = buildLeagueGapReportDay(arg);
  console.log(JSON.stringify({ ok: r.ok, dayKey: r.dayKey, summary: r.summary, broken: r.broken }, null, 2));
}
