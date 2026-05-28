import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ESPN_BASE, LEAGUE_SEEDS, leagueName } from "../config.js";
import { getFixtureAdapters, getFixtureProviderPlan } from "../adapters/registry.js";
import { normalizeFixture } from "../core/normalize.js";
import { shiftDay, athensDayKey } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    dayKey: athensDayKey(),
    chunkSize: Number(process.env.FIXTURE_ACQ_CHUNK_SIZE || 12),
    daysBack: Number(process.env.FIXTURE_ACQ_DAYS_BACK || 1),
    daysForward: Number(process.env.FIXTURE_ACQ_DAYS_FORWARD || 14),
    reset: false,
    fullPass: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--reset") {
      out.reset = true;
      continue;
    }

    if (arg === "--full-pass") {
      out.fullPass = true;
      continue;
    }

    if (arg === "--day" && argv[i + 1]) {
      out.dayKey = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--chunk-size" && argv[i + 1]) {
      out.chunkSize = Number(argv[++i]);
      continue;
    }

    if (arg === "--days-back" && argv[i + 1]) {
      out.daysBack = Number(argv[++i]);
      continue;
    }

    if (arg === "--days-forward" && argv[i + 1]) {
      out.daysForward = Number(argv[++i]);
      continue;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      out.dayKey = arg;
      continue;
    }
  }

  out.chunkSize = Number.isFinite(out.chunkSize) && out.chunkSize > 0
    ? Math.floor(out.chunkSize)
    : 12;

  out.daysBack = Number.isFinite(out.daysBack) && out.daysBack >= 0
    ? Math.floor(out.daysBack)
    : 1;

  out.daysForward = Number.isFinite(out.daysForward) && out.daysForward >= 0
    ? Math.floor(out.daysForward)
    : 14;

  return out;
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function statePath() {
  return resolveDataPath("ingest-state", "league-cursor.json");
}

function readState() {
  return readJson(statePath(), {
    cursor: 0,
    updatedAt: null,
    lastRun: null
  });
}

function writeState(state) {
  writeJson(statePath(), state);
}

function buildDateWindow(dayKey, daysBack, daysForward) {
  const days = [];

  for (let offset = -daysBack; offset <= daysForward; offset++) {
    days.push(shiftDay(dayKey, offset));
  }

  return days;
}

function selectLeagueChunk({ cursor, chunkSize }) {
  const seeds = Array.isArray(LEAGUE_SEEDS)
    ? LEAGUE_SEEDS.map(x => String(x || "").trim()).filter(Boolean)
    : [];

  if (seeds.length === 0) {
    return {
      seeds,
      selected: [],
      startCursor: 0,
      nextCursor: 0
    };
  }

  const startCursor = ((Number(cursor || 0) % seeds.length) + seeds.length) % seeds.length;
  const selected = [];

  for (let i = 0; i < Math.min(chunkSize, seeds.length); i++) {
    selected.push(seeds[(startCursor + i) % seeds.length]);
  }

  const nextCursor = (startCursor + selected.length) % seeds.length;

  return {
    seeds,
    selected,
    startCursor,
    nextCursor
  };
}

function stableFixtureId(row) {
  return String(row?.matchId || row?.sourceMatchId || row?.sourceId || row?.matchKey || "").trim();
}

function canonicalLeagueFile(dayKey, slug) {
  return resolveDataPath("canonical-fixtures", dayKey, `${slug}.json`);
}

function readCanonicalLeague(dayKey, slug) {
  const file = canonicalLeagueFile(dayKey, slug);
  const payload = readJson(file, null);

  if (!payload || !Array.isArray(payload.fixtures)) {
    return {
      dayKey,
      leagueSlug: slug,
      leagueName: leagueName(slug),
      updatedAt: null,
      count: 0,
      fixtures: []
    };
  }

  return payload;
}

function writeCanonicalLeague(dayKey, slug, fixtures, meta = {}) {
  const cleanFixtures = fixtures
    .filter(Boolean)
    .sort((a, b) => {
      const ka = String(a?.kickoffUtc || "");
      const kb = String(b?.kickoffUtc || "");
      if (ka !== kb) return ka.localeCompare(kb);
      return String(a?.matchId || "").localeCompare(String(b?.matchId || ""));
    });

  const payload = {
    dayKey,
    leagueSlug: slug,
    leagueName: leagueName(slug),
    updatedAt: new Date().toISOString(),
    count: cleanFixtures.length,
    sourceMeta: meta,
    fixtures: cleanFixtures
  };

  writeJson(canonicalLeagueFile(dayKey, slug), payload);
  return payload;
}

function mergeCanonicalFixtures(existing, incoming) {
  const map = new Map();

  function meaningful(value) {
    return value !== null && value !== undefined && value !== "";
  }

  function mergeRow(previous, next) {
    if (!previous) return next;
    if (!next) return previous;

    const merged = { ...previous, ...next };

    for (const key of [
      "scoreHome",
      "scoreAway",
      "penalties",
      "decidedBy",
      "status",
      "rawStatus",
      "minute",
      "venue",
      "kickoffUtc",
      "homeTeam",
      "awayTeam",
      "leagueSlug",
      "leagueName",
      "dayKey",
      "source",
      "sourceId",
      "sourceMatchId"
    ]) {
      if (meaningful(next[key])) {
        merged[key] = next[key];
      } else if (meaningful(previous[key])) {
        merged[key] = previous[key];
      }
    }

    merged.firstSeenAt = previous.firstSeenAt || next.firstSeenAt || new Date().toISOString();
    merged.lastSeenAt = next.lastSeenAt || previous.lastSeenAt || new Date().toISOString();

    return merged;
  }

  for (const row of existing || []) {
    const id = stableFixtureId(row);
    if (!id) continue;
    map.set(id, row);
  }

  for (const row of incoming || []) {
    const id = stableFixtureId(row);
    if (!id) continue;
    map.set(id, mergeRow(map.get(id), row));
  }

  return [...map.values()];
}

function serializeFixture(normalized, adapterId, fetchedDayKey) {
  return {
    matchId: normalized.matchId,
    matchKey: normalized.matchKey,
    source: normalized.source || adapterId,
    sourceId: normalized.sourceId || normalized.sourceMatchId || normalized.matchId,
    sourceMatchId: normalized.sourceMatchId || normalized.sourceId || normalized.matchId,

    leagueSlug: normalized.leagueSlug,
    leagueName: normalized.leagueName,

    dayKey: normalized.dayKey,
    fetchedDayKey,

    kickoffUtc: normalized.kickoffUtc,

    homeTeam: normalized.homeTeam,
    awayTeam: normalized.awayTeam,

    scoreHome: normalized.scoreHome,
    scoreAway: normalized.scoreAway,
    penalties: normalized.penalties || null,
    decidedBy: normalized.decidedBy || null,

    status: normalized.status,
    rawStatus: normalized.rawStatus,
    minute: normalized.minute || null,
    venue: normalized.venue || null,

    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  };
}

function selectAdapterForLeague(slug) {
  const plan = getFixtureProviderPlan(slug);
  const adapters = getFixtureAdapters();

  const primaryId = String(plan?.primary?.id || "").trim();

  const adapter = adapters.find(x =>
    String(x?.id || "").trim() === primaryId &&
    x.isEnabled() &&
    x.supportsLeague(slug)
  ) || null;

  return {
    plan,
    adapter
  };
}

async function acquireLeagueDay({ slug, dayKey, allowedDays }) {
  const { plan, adapter } = selectAdapterForLeague(slug);

  const stats = {
    slug,
    leagueName: leagueName(slug),
    dayKey,
    providerMode: plan?.mode || "none",
    providerExecution: plan?.execution || "skip",
    provider: adapter?.id || null,
    ok: false,
    rawEvents: 0,
    normalized: 0,
    accepted: 0,
    writtenByDay: {},
    error: null
  };

  if (!adapter) {
    stats.error = "no_enabled_adapter_for_league";
    return stats;
  }

  let events = [];

  try {
    const payload = await adapter.fetch({ slug, dayKey });
    events = Array.isArray(payload) ? payload : [];
  } catch (err) {
    stats.error = String(err?.message || err);
    return stats;
  }

  stats.rawEvents = events.length;

  const grouped = new Map();

  for (const event of events) {
    const normalized = adapter.normalize(event, slug);
    if (!normalized) continue;

    stats.normalized++;

    const fixtureDay = String(normalized.dayKey || "").trim();
    if (!allowedDays.has(fixtureDay)) continue;

    const row = serializeFixture(normalized, adapter.id, dayKey);
    const key = `${fixtureDay}::${normalized.leagueSlug || slug}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        dayKey: fixtureDay,
        slug: normalized.leagueSlug || slug,
        rows: []
      });
    }

    grouped.get(key).rows.push(row);
    stats.accepted++;
  }

  for (const group of grouped.values()) {
    const current = readCanonicalLeague(group.dayKey, group.slug);
    const merged = mergeCanonicalFixtures(current.fixtures, group.rows);

    writeCanonicalLeague(group.dayKey, group.slug, merged, {
      acquisitionProvider: adapter.id,
      requestedLeagueSlug: slug,
      requestedDayKey: dayKey,
      mergedAt: new Date().toISOString()
    });

    stats.writtenByDay[group.dayKey] =
      (stats.writtenByDay[group.dayKey] || 0) + group.rows.length;
  }

  stats.ok = true;
  return stats;
}


function espnDateFromDayKey(dayKey) {
  return String(dayKey || "").replaceAll("-", "");
}

function extractEspnLeagueId(uid) {
  const match = String(uid || "").match(/~l:(\d+)~/);
  return match ? match[1] : null;
}

async function fetchJson(url, label) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 Ai-MatchLab fixture acquisition",
      "accept": "application/json,text/plain,*/*"
    }
  });

  if (!res.ok) {
    await res.body?.cancel?.();
    throw new Error(String(label || "fetch") + " http_" + String(res.status));
  }

  return res.json();
}

function flattenEspnDropdownLeagues(payload) {
  const rows = [];

  function walk(node) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    const id = node.id != null ? String(node.id) : extractEspnLeagueId(node.uid);

    if (id && (node.slug || node.name || node.shortName || node.abbreviation)) {
      rows.push({
        id,
        slug: node.slug || null,
        name: node.name || null,
        shortName: node.shortName || null,
        abbreviation: node.abbreviation || null
      });
    }

    for (const key of Object.keys(node)) {
      const value = node[key];
      if (value && typeof value === "object") walk(value);
    }
  }

  walk(payload?.leagues || payload);

  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }

  return byId;
}

function existingCanonicalIdsForDay(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  const ids = new Set();

  if (!fs.existsSync(dir)) return ids;

  for (const file of fs.readdirSync(dir).filter(x => x.endsWith(".json"))) {
    const payload = readJson(path.join(dir, file), null);
    const rows = Array.isArray(payload?.fixtures) ? payload.fixtures : [];

    for (const row of rows) {
      const id = stableFixtureId(row);
      if (id) ids.add(id);
    }
  }

  return ids;
}

async function acquireEspnAllScoreboardSupplemental({ dayKey, allowedDays }) {
  const targetSeedSet = new Set(
    (Array.isArray(LEAGUE_SEEDS) ? LEAGUE_SEEDS : [])
      .map(x => String(x || "").trim())
      .filter(Boolean)
  );

  const stats = {
    provider: "espn_all_scoreboard",
    dayKey,
    ok: false,
    rawEvents: 0,
    normalized: 0,
    accepted: 0,
    existingCanonicalUpdates: 0,
    skippedOtherDay: 0,
    skippedOutOfTargetSeeds: 0,
    skippedNoLeagueSlug: 0,
    writtenByDay: {},
    byLeague: {},
    error: null
  };

  try {
    const supplementalDays = [
      shiftDay(dayKey, -1),
      dayKey
    ].filter(Boolean);

    const scoreboardUrls = [...new Set(supplementalDays.map(d =>
      ESPN_BASE + "/all/scoreboard?dates=" + espnDateFromDayKey(d) + "&limit=1000"
    ))];

    const dropdownUrl = "https://site.api.espn.com/apis/site/v2/leagues/dropdown?lang=en&region=us&calendartype=whitelist&limit=1000&sport=soccer";

    const [scoreboards, dropdown] = await Promise.all([
      Promise.all(scoreboardUrls.map((url, idx) => fetchJson(url, "espn_all_scoreboard_" + supplementalDays[idx]))),
      fetchJson(dropdownUrl, "espn_dropdown")
    ]);

    const dropdownById = flattenEspnDropdownLeagues(dropdown);
    const eventById = new Map();

    for (const scoreboard of scoreboards) {
      const rows = Array.isArray(scoreboard?.events) ? scoreboard.events : [];
      for (const event of rows) {
        const id = String(event?.id || "").trim();
        if (!id) continue;
        eventById.set(id, event);
      }
    }

    const events = [...eventById.values()];
    stats.supplementalDays = supplementalDays;
    stats.scoreboardUrls = scoreboardUrls;
    const existingIds = existingCanonicalIdsForDay(dayKey);
    const grouped = new Map();

    stats.rawEvents = events.length;

    for (const event of events) {
      const eventId = String(event?.id || "").trim();
      if (!eventId) continue;

      const existedInCanonical = existingIds.has(eventId);

      const leagueId = extractEspnLeagueId(event?.uid);
      const dropdownLeague = leagueId ? dropdownById.get(leagueId) : null;
      const slug = String(dropdownLeague?.slug || "").trim();

      if (!slug) {
        stats.skippedNoLeagueSlug++;
        continue;
      }

      if (!targetSeedSet.has(slug)) {
        stats.skippedOutOfTargetSeeds++;
        continue;
      }

      const normalized = normalizeFixture(event, slug);
      if (!normalized) continue;

      stats.normalized++;

      const fixtureDay = String(normalized.dayKey || "").trim();

      if (!allowedDays.has(fixtureDay) || fixtureDay !== dayKey) {
        stats.skippedOtherDay++;
        continue;
      }

      const row = serializeFixture(
        {
          ...normalized,
          leagueSlug: slug,
          leagueName: leagueName(slug)
        },
        "espn_all_scoreboard",
        dayKey
      );

      const key = fixtureDay + "::" + slug;

      if (!grouped.has(key)) {
        grouped.set(key, {
          dayKey: fixtureDay,
          slug,
          rows: []
        });
      }

      grouped.get(key).rows.push(row);
      existingIds.add(eventId);
      stats.accepted++;
      if (existedInCanonical) {
        stats.existingCanonicalUpdates++;
      }
      stats.byLeague[slug] = (stats.byLeague[slug] || 0) + 1;
    }

    for (const group of grouped.values()) {
      const current = readCanonicalLeague(group.dayKey, group.slug);
      const merged = mergeCanonicalFixtures(current.fixtures, group.rows);

      writeCanonicalLeague(group.dayKey, group.slug, merged, {
        acquisitionProvider: "espn_all_scoreboard",
        requestedLeagueSlug: "all",
        requestedDayKey: dayKey,
        mergedAt: new Date().toISOString(),
        mode: "supplemental_target_seed_only"
      });

      stats.writtenByDay[group.dayKey] =
        (stats.writtenByDay[group.dayKey] || 0) + group.rows.length;
    }

    stats.ok = true;
    return stats;
  } catch (err) {
    stats.error = String(err?.message || err);
    return stats;
  }
}
function readCanonicalCoverage(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);

  const out = {
    dayKey,
    leagues: 0,
    fixtures: 0,
    byLeague: []
  };

  if (!fs.existsSync(dir)) {
    return out;
  }

  const files = fs.readdirSync(dir).filter(x => x.endsWith(".json"));

  for (const file of files) {
    const payload = readJson(path.join(dir, file), null);
    if (!payload) continue;

    const count = Array.isArray(payload.fixtures)
      ? payload.fixtures.length
      : Number(payload.count || 0);

    out.leagues++;
    out.fixtures += count;

    out.byLeague.push({
      slug: payload.leagueSlug || file.replace(/\.json$/, ""),
      leagueName: payload.leagueName || leagueName(file.replace(/\.json$/, "")),
      count
    });
  }

  out.byLeague.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  return out;
}

function writeCoverageReport(dayKey, report) {
  writeJson(resolveDataPath("coverage-reports", `${dayKey}.json`), report);
}

export async function runFixtureAcquisitionChunk(options = {}) {
  const opts = {
    ...parseArgs([]),
    ...options
  };

  const state = readState();

  if (opts.reset) {
    state.cursor = 0;
  }

  const chunk = opts.fullPass
    ? selectLeagueChunk({
        cursor: 0,
        chunkSize: Number.MAX_SAFE_INTEGER
      })
    : selectLeagueChunk({
        cursor: state.cursor,
        chunkSize: opts.chunkSize
      });

  if (opts.fullPass) {
    chunk.startCursor = 0;
    chunk.nextCursor = state.cursor;
  }

  const dateWindow = buildDateWindow(opts.dayKey, opts.daysBack, opts.daysForward);
  const allowedDays = new Set(dateWindow);

  const startedAt = new Date().toISOString();

  const report = {
    ok: true,
    type: opts.fullPass ? "fixture_acquisition_full_pass" : "fixture_acquisition_chunk",
    fullPass: Boolean(opts.fullPass),
    startedAt,
    finishedAt: null,
    baseDayKey: opts.dayKey,
    daysBack: opts.daysBack,
    daysForward: opts.daysForward,
    dateWindow,
    leagueSeedCount: chunk.seeds.length,
    chunkSize: opts.fullPass ? chunk.selected.length : opts.chunkSize,
    startCursor: chunk.startCursor,
    nextCursor: chunk.nextCursor,
    selectedLeagues: chunk.selected,
    results: [],
    summary: {
      leagueDaysAttempted: 0,
      rawEvents: 0,
      normalized: 0,
      accepted: 0,
      failedFetches: 0,
      noAdapter: 0
    },
    coverage: null
  };

  for (const slug of chunk.selected) {
    for (const fetchDay of dateWindow) {
      const row = await acquireLeagueDay({
        slug,
        dayKey: fetchDay,
        allowedDays
      });

      report.results.push(row);
      report.summary.leagueDaysAttempted++;
      report.summary.rawEvents += Number(row.rawEvents || 0);
      report.summary.normalized += Number(row.normalized || 0);
      report.summary.accepted += Number(row.accepted || 0);

      if (row.error === "no_enabled_adapter_for_league") {
        report.summary.noAdapter++;
      } else if (row.error) {
        report.summary.failedFetches++;
      }
    }
  }

  const supplemental = await acquireEspnAllScoreboardSupplemental({
    dayKey: opts.dayKey,
    allowedDays
  });

  report.results.push({
    slug: "all",
    leagueName: "ESPN All Scoreboard Supplemental",
    dayKey: opts.dayKey,
    providerMode: "supplemental",
    providerExecution: "target_seed_only",
    provider: supplemental.provider,
    ok: supplemental.ok,
    rawEvents: supplemental.rawEvents,
    normalized: supplemental.normalized,
    accepted: supplemental.accepted,
    writtenByDay: supplemental.writtenByDay,
    error: supplemental.error,
    existingCanonicalUpdates: supplemental.existingCanonicalUpdates,
    skippedOtherDay: supplemental.skippedOtherDay,
    skippedOutOfTargetSeeds: supplemental.skippedOutOfTargetSeeds,
    skippedNoLeagueSlug: supplemental.skippedNoLeagueSlug,
    byLeague: supplemental.byLeague
  });

  report.summary.rawEvents += Number(supplemental.rawEvents || 0);
  report.summary.normalized += Number(supplemental.normalized || 0);
  report.summary.accepted += Number(supplemental.accepted || 0);

  if (supplemental.error) {
    report.summary.failedFetches++;
  }

  report.summary.supplementalAllScoreboard = {
    provider: supplemental.provider,
    ok: supplemental.ok,
    rawEvents: supplemental.rawEvents,
    normalized: supplemental.normalized,
    accepted: supplemental.accepted,
    existingCanonicalUpdates: supplemental.existingCanonicalUpdates,
    skippedOtherDay: supplemental.skippedOtherDay,
    skippedOutOfTargetSeeds: supplemental.skippedOutOfTargetSeeds,
    skippedNoLeagueSlug: supplemental.skippedNoLeagueSlug,
    byLeague: supplemental.byLeague,
    error: supplemental.error
  };

  report.coverage = readCanonicalCoverage(opts.dayKey);
  report.finishedAt = new Date().toISOString();

  writeCoverageReport(opts.dayKey, report);

  if (!opts.fullPass) {
    state.cursor = chunk.nextCursor;
    state.updatedAt = report.finishedAt;
    state.lastRun = {
      baseDayKey: opts.dayKey,
      chunkSize: opts.chunkSize,
      daysBack: opts.daysBack,
      daysForward: opts.daysForward,
      startCursor: chunk.startCursor,
      nextCursor: chunk.nextCursor,
      selectedLeagues: chunk.selected,
      summary: report.summary,
      coverage: report.coverage
    };

    writeState(state);
  } else {
    report.stateUpdateSkipped = true;
  }

  return report;
}

const isCli = (() => {
  try {
    return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || "");
  } catch {
    return false;
  }
})();

if (isCli) {
  const args = parseArgs();

  runFixtureAcquisitionChunk(args)
    .then(report => {
      console.log(JSON.stringify({
        ok: report.ok,
        type: report.type,
        fullPass: report.fullPass,
        baseDayKey: report.baseDayKey,
        selectedLeagues: report.selectedLeagues,
        startCursor: report.startCursor,
        nextCursor: report.nextCursor,
        summary: report.summary,
        coverage: report.coverage,
        reportFile: resolveDataPath("coverage-reports", `${report.baseDayKey}.json`)
      }, null, 2));
    })
    .catch(err => {
      console.error("[fixture-acquisition] failed", err);
      process.exitCode = 1;
    });
}
