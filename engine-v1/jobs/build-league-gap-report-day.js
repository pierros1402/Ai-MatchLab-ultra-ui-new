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
import { LEAGUES_BY_SLUG, isLeagueCompetition } from "../../workers/_shared/leagues-coverage.js";
import { isDisabledLeague } from "../source-discovery/disabled-leagues.js";
import { hasAcceptedStandings } from "../storage/standings-memory-db.js";
import { computeMatchdayAxis } from "../core/matchday-axis.js";
import { isInSeason } from "../source-discovery/season-calendar.js";
import { athensDayKey, shiftDay } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

function log(...a) { console.log("[league-gap-report]", ...a); }

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

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
  const teamNewsReadyCounts = new Map();
  // Travel and player-usage self-report a graded coverage state. Track the
  // full ready/partial/empty spread instead of "a block exists" — the same
  // "existence ≠ usable" honesty the standings/team-news metrics enforce.
  const travelReadyCounts = new Map();
  const travelPartialCounts = new Map();
  const travelEmptyCounts = new Map();
  const playerUsageReadyCounts = new Map();
  const playerUsagePartialCounts = new Map();
  const playerUsageEmptyCounts = new Map();
  const detailsDir = path.join(root, "details");
  if (fs.existsSync(detailsDir)) {
    for (const file of fs.readdirSync(detailsDir).filter(x => x.endsWith(".json"))) {
      const id = path.basename(file, ".json");
      const detail = readJsonSafe(path.join(detailsDir, file), null);
      const slug = cidToLeague.get(id)
        || String(detail?.basic?.leagueSlug || "").trim()
        || "unknown";

      detailCounts.set(slug, (detailCounts.get(slug) || 0) + 1);

      const hasValue = Array.isArray(detail?.value) && detail.value.length > 0;
      if (hasValue) detailValueCounts.set(slug, (detailValueCounts.get(slug) || 0) + 1);

      // Team-news is usable only with a non-empty, non-error status. "empty"/
      // "missing_local_team_news_evidence" is an explicit gap, not coverage.
      const tnStatus = String(detail?.teamNews?.status || "").toLowerCase();
      const tnUsable = tnStatus && !["empty", "missing", "unavailable", "error", "stale", "rejected"].includes(tnStatus);
      if (tnUsable) teamNewsReadyCounts.set(slug, (teamNewsReadyCounts.get(slug) || 0) + 1);

      // Travel: the block already self-classifies ready/partial/empty
      // (ready = both venues geolocated, partial = one, empty = neither).
      const travelStatus = String(detail?.travel?.status || "").toLowerCase();
      if (travelStatus === "ready") bump(travelReadyCounts, slug);
      else if (travelStatus === "partial") bump(travelPartialCounts, slug);
      else bump(travelEmptyCounts, slug);

      // Player-usage is resolved per side; a match is fully usable only when
      // BOTH sides produced real usage. One side = partial, neither = empty.
      const puUsable = (side) => {
        const s = String(detail?.playerUsageIntel?.[side]?.status || "").toLowerCase();
        return Boolean(s) && !["unavailable", "empty", "missing", "error", "stale", "rejected", "none"].includes(s);
      };
      const puSides = (puUsable("home") ? 1 : 0) + (puUsable("away") ? 1 : 0);
      if (puSides === 2) bump(playerUsageReadyCounts, slug);
      else if (puSides === 1) bump(playerUsagePartialCounts, slug);
      else bump(playerUsageEmptyCounts, slug);
    }
  }

  return {
    fixtureCounts, valueCounts, detailCounts, detailValueCounts, teamNewsReadyCounts,
    travelReadyCounts, travelPartialCounts, travelEmptyCounts,
    playerUsageReadyCounts, playerUsagePartialCounts, playerUsageEmptyCounts
  };
}

// A standings file counts as READY only when it actually holds table rows.
// An empty/placeholder file existing is NOT coverage — the same "existence ≠
// usable" trap the audit warns about. Handles both store shapes:
//   data/standings:            { table: [...] }  (also phaseTables)
//   data/league-memory/standings: { accepted: { rows: [...] } }
function standingsRowCount(file) {
  const payload = readJsonSafe(file, null);
  if (!payload || typeof payload !== "object") return 0;

  const candidates = [
    payload.table,
    payload.rows,
    payload.standings,
    payload.accepted?.rows
  ];
  for (const rows of candidates) {
    if (Array.isArray(rows) && rows.length > 0) return rows.length;
  }
  return 0;
}

function standingsStateForSlug(slug) {
  const mainFile = resolveDataPath("standings", `${slug}.json`);
  const memoryFile = resolveDataPath("league-memory", "standings", `${slug}.json`);

  const mainRows = standingsRowCount(mainFile);
  const memoryRows = standingsRowCount(memoryFile);
  const rows = Math.max(mainRows, memoryRows);

  // Validated = an ACCEPTED standings snapshot exists (it passed the standings
  // accept flow), which is strictly stronger than "a file with rows exists".
  // A present-but-unvalidated table is a weak fallback and must be reported as
  // such, not conflated with validated coverage (standings fail-closed, audit
  // §θ). Kept as a distinct flag rather than folding it into standingsReady, so
  // legitimate published tables are never hidden from the product.
  const standingsValidated = hasAcceptedStandings(slug);

  return {
    standingsReady: rows > 0,
    standingsValidated,
    standingsRows: rows,
    standingsSource: mainRows > 0 ? "data/standings" : memoryRows > 0 ? "league-memory" : null
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

  // Disabled leagues are DEACTIVATED — never acquired anywhere. They stay on the
  // registry for UI naming only, so they must not appear as declared coverage
  // targets in the gap report (audit V2 §ε). Track them separately for
  // transparency instead of counting them as perpetual OUT_OF_SEASON gaps.
  const allDeclared = (Array.isArray(LEAGUE_SEEDS) ? LEAGUE_SEEDS : [])
    .map(x => String(x || "").trim())
    .filter(Boolean);
  const declared = allDeclared.filter(slug => !isDisabledLeague(slug));
  const disabledDeclared = allDeclared.filter(slug => isDisabledLeague(slug));

  const acquisition = acquisitionResultsForDay(date);
  const expected = expectedCountsForDay(date);
  const canonical = canonicalCountsForDay(date);
  const snapshot = snapshotStateForDay(date);

  const rows = [];

  for (const slug of declared) {
    const acq = acquisition.bySlug.get(slug) || null;
    const standings = standingsStateForSlug(slug);
    // Matchday confirmation axis (core/matchday-axis.js): the current round per
    // league + integrity flag. Surfaced so the daily report shows the round and
    // any corrupt/cumulative standings (blr.1 & co.) are visible as anomalies.
    const md = computeMatchdayAxis(slug);

    const row = {
      slug,
      leagueName: leagueName(slug),
      type: LEAGUES_BY_SLUG[slug]?.type || "unknown",
      isLeague: isLeagueCompetition(slug),
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
      detailsWithTeamNews: snapshot.teamNewsReadyCounts.get(slug) || 0,
      travelReady: snapshot.travelReadyCounts.get(slug) || 0,
      travelPartial: snapshot.travelPartialCounts.get(slug) || 0,
      travelEmpty: snapshot.travelEmptyCounts.get(slug) || 0,
      playerUsageReady: snapshot.playerUsageReadyCounts.get(slug) || 0,
      playerUsagePartial: snapshot.playerUsagePartialCounts.get(slug) || 0,
      playerUsageEmpty: snapshot.playerUsageEmptyCounts.get(slug) || 0,
      valuePicks: snapshot.valueCounts.get(slug) || 0,
      standingsReady: standings.standingsReady,
      standingsValidated: standings.standingsValidated,
      standingsRows: standings.standingsRows,
      standingsSource: standings.standingsSource,
      matchday: md.matchday,
      matchdaySpread: md.matchdaySpread,
      matchdayAnomaly: md.matchdayAnomaly?.bool || false,
      matchdayAnomalyReason: md.matchdayAnomaly?.reason || null
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

  // Leagues actually playing today — the universe that matters for today's
  // product, reused by the honest travel/player-usage coverage rollups.
  const activeRows = rows.filter(r => r.canonicalFixtures > 0);

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
      // NOTE: `declared` is the full ingest universe (leagues + cups +
      // continental, ~229) — we intentionally acquire cup fixtures too. The
      // `leagueOnly` block below is the honest LEAGUE coverage view (audit
      // §8.2); cups/continental must not inflate league counts.
      declaredLeagues: declared.length,
      disabledLeagues: disabledDeclared,
      leagueOnly: {
        declaredLeagues: rows.filter(r => r.isLeague).length,
        leaguesWithCanonicalFixtures: rows.filter(r => r.isLeague && r.canonicalFixtures > 0).length,
        standingsReadyLeagues: rows.filter(r => r.isLeague && r.standingsReady).length,
        standingsValidatedLeagues: rows.filter(r => r.isLeague && r.standingsValidated).length,
        standingsPresentNotValidated: rows
          .filter(r => r.isLeague && r.standingsReady && !r.standingsValidated)
          .map(r => r.slug),
        standingsMissingLeagues: rows.filter(r => r.isLeague && !r.standingsReady).length,
        activeStandingsMissing: rows
          .filter(r => r.isLeague && r.canonicalFixtures > 0 && !r.standingsReady)
          .map(r => r.slug),
        // Matchday axis integrity: validated standings whose played counts are
        // corrupt/cumulative (fail-closed — these must not surface a table).
        matchdayAnomalyLeagues: rows
          .filter(r => r.isLeague && r.matchdayAnomaly)
          .map(r => ({ slug: r.slug, reason: r.matchdayAnomalyReason, spread: r.matchdaySpread })),
        nonLeagueCompetitions: rows.filter(r => !r.isLeague).length
      },
      selectedForAcquisition: acquisition.selected.size,
      leaguesWithExpectedMatches: expected.size,
      leaguesWithCanonicalFixtures: canonical.size,
      expectedMatchesTotal: expectedTotal,
      canonicalFixturesTotal: canonicalTotal,
      lostExpectedMatches: lostMatches,
      standingsReadyLeagues: rows.filter(r => r.standingsReady).length,
      standingsMissingLeagues: rows.filter(r => !r.standingsReady).length,
      // Standings readiness restricted to leagues actually playing today —
      // the number that matters for today's product, vs the whole declared universe.
      activeLeaguesWithMatches: rows.filter(r => r.canonicalFixtures > 0).length,
      activeStandingsReady: rows.filter(r => r.canonicalFixtures > 0 && r.standingsReady).length,
      activeStandingsMissing: rows
        .filter(r => r.canonicalFixtures > 0 && !r.standingsReady)
        .map(r => r.slug),
      activeTeamNewsReady: rows.filter(r => r.canonicalFixtures > 0 && r.detailsWithTeamNews > 0).length,
      // Detail-file coverage across leagues actually playing today, graded
      // honestly: "empty" is a real gap, not silently folded into "covered".
      travelCoverage: {
        ready: activeRows.reduce((s, r) => s + r.travelReady, 0),
        partial: activeRows.reduce((s, r) => s + r.travelPartial, 0),
        empty: activeRows.reduce((s, r) => s + r.travelEmpty, 0)
      },
      playerUsageCoverage: {
        ready: activeRows.reduce((s, r) => s + r.playerUsageReady, 0),
        partial: activeRows.reduce((s, r) => s + r.playerUsagePartial, 0),
        empty: activeRows.reduce((s, r) => s + r.playerUsageEmpty, 0)
      },
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
