import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../../workers/_shared/leagues-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ATHENS_TZ = "Europe/Athens";

const SEASON = "2025-2026";

// ======================================================
// TEMP TEST RANGE
// Όταν επιβεβαιώσεις ότι όλα γράφουν σωστά,
// γύρισέ το πάλι σε "2025-08-01"
// ======================================================
const SEASON_START = "2025-08-01";

const OUT_DIR = path.resolve(__dirname, "../../data/history");
const OUT_FILE = path.join(OUT_DIR, `${SEASON}.json`);
const REPORT_FILE = path.join(OUT_DIR, `${SEASON}.report.json`);

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toEspnDate(dayKey) {
  return String(dayKey).replaceAll("-", "");
}

function dayKeyTZ(dateLike, tz = ATHENS_TZ) {
  const d = new Date(dateLike);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(d);
}

function todayAthens() {
  return dayKeyTZ(Date.now(), ATHENS_TZ);
}

function addDays(dayKey, days) {
  const [y, m, d] = String(dayKey).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return [
    dt.getUTCFullYear(),
    pad2(dt.getUTCMonth() + 1),
    pad2(dt.getUTCDate())
  ].join("-");
}

function dateRange(startDay, endDay) {
  const out = [];
  let cur = startDay;
  while (cur <= endDay) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(v, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function isTerminalStatus(status) {
  const s = String(status || "").toUpperCase();
  return (
    s.includes("FINAL") ||
    s.includes("FULL_TIME") ||
    s.includes("AET") ||
    s.includes("PEN") ||
    s === "STATUS_COMPLETE" ||
    s === "COMPLETE"
  );
}

function normalizeMinute(statusDetail, displayClock, statusName) {
  const detail = safeText(statusDetail).trim();
  const clock = safeText(displayClock).trim();
  const name = safeText(statusName).toUpperCase();

  if (clock) return clock;
  if (detail) return detail;
  if (isTerminalStatus(name)) return "FT";
  return "";
}

function getCompetitors(ev) {
  const comp = ev?.competitions?.[0]?.competitors;
  return Array.isArray(comp) ? comp : [];
}

function getHomeAway(ev) {
  const comp = getCompetitors(ev);

  const home =
    comp.find(x => x?.homeAway === "home") ||
    comp[0] ||
    null;

  const away =
    comp.find(x => x?.homeAway === "away") ||
    comp[1] ||
    null;

  return { home, away };
}

function normalizeEvent(ev, requestedLeague, targetDay) {
  const id = String(ev?.id || "").trim();
  if (!id) return null;

  const statusName =
    ev?.status?.type?.name ||
    ev?.status?.type?.state ||
    ev?.status?.type?.description ||
    "";

  if (!isTerminalStatus(statusName)) return null;

  const kickoff =
    ev?.date ||
    ev?.competitions?.[0]?.date ||
    null;

  if (!kickoff) return null;

  const athensDay = dayKeyTZ(kickoff, ATHENS_TZ);

  // κρατάμε μόνο αγώνες που ανήκουν στη ζητούμενη Athens day
  if (athensDay !== targetDay) return null;

  const { home, away } = getHomeAway(ev);
  if (!home || !away) return null;

  const leagueSlug =
    ev?.leagues?.[0]?.slug ||
    ev?.league?.slug ||
    requestedLeague;

  const leagueName =
    ev?.leagues?.[0]?.name ||
    ev?.league?.name ||
    LEAGUE_NAME_MAP[leagueSlug] ||
    requestedLeague;

  const scoreHome = safeNum(home?.score, 0);
  const scoreAway = safeNum(away?.score, 0);

  const minute = normalizeMinute(
    ev?.status?.displayClock,
    ev?.status?.displayClock,
    statusName
  );

  let outcome = "X";
  if (scoreHome > scoreAway) outcome = "1";
  else if (scoreAway > scoreHome) outcome = "2";

  const homeTeam = safeText(
    home?.team?.displayName ||
    home?.team?.shortDisplayName ||
    home?.team?.name
  );

  const awayTeam = safeText(
    away?.team?.displayName ||
    away?.team?.shortDisplayName ||
    away?.team?.name
  );

  if (!homeTeam || !awayTeam) return null;

  return {
    id,
    season: SEASON,
    dayKey: targetDay,
    kickoff,
    kickoff_ms: new Date(kickoff).getTime(),
    leagueSlug,
    leagueName,
    homeTeam,
    awayTeam,
    scoreHome,
    scoreAway,
    status: safeText(statusName),
    minute,
    outcome,
    source: "espn",
    rebuiltAt: new Date().toISOString()
  };
}

async function fetchLeagueDay(slug, dayKey) {
  const espnDate = toEspnDate(dayKey);
  const url = `${ESPN_BASE}/${slug}/scoreboard?limit=300&dates=${espnDate}`;

  let res;
  try {
    res = await fetch(url, {
      headers: {
        accept: "application/json"
      }
    });
  } catch (err) {
    return {
      ok: false,
      slug,
      dayKey,
      url,
      error: String(err?.message || err),
      events: []
    };
  }

  if (res.status === 404) {
    await res.body?.cancel?.();
    return {
      ok: true,
      slug,
      dayKey,
      url,
      status: 404,
      events: []
    };
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return {
      ok: false,
      slug,
      dayKey,
      url,
      status: res.status,
      error: txt || `HTTP_${res.status}`,
      events: []
    };
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    return {
      ok: false,
      slug,
      dayKey,
      url,
      status: res.status,
      error: `invalid_json: ${String(err?.message || err)}`,
      events: []
    };
  }

  const events = Array.isArray(json?.events) ? json.events : [];
  return {
    ok: true,
    slug,
    dayKey,
    url,
    status: res.status,
    events
  };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function flushProgress(history, report) {
  await writeJson(OUT_FILE, history);
  await writeJson(REPORT_FILE, report);
}

function emptyDayBucket(dayKey) {
  return {
    date: dayKey,
    matches: []
  };
}

function rebuildGlobalSeenFromHistory(history) {
  const seen = new Set();

  for (const bucket of Object.values(history?.days || {})) {
    const matches = Array.isArray(bucket?.matches) ? bucket.matches : [];
    for (const m of matches) {
      if (m?.id) seen.add(String(m.id));
    }
  }

  return seen;
}

function recalcTotalMatches(history) {
  return Object.values(history?.days || {}).reduce((sum, bucket) => {
    const matches = Array.isArray(bucket?.matches) ? bucket.matches : [];
    return sum + matches.length;
  }, 0);
}

async function loadExistingProgress(start, end, totalDays) {
  let history = {
    ok: true,
    season: SEASON,
    source: "espn",
    createdAt: Date.now(),
    createdAtIso: new Date().toISOString(),
    from: start,
    to: end,
    days: {},
    totalMatches: 0
  };

  let report = {
    ok: true,
    season: SEASON,
    startedAt: new Date().toISOString(),
    from: start,
    to: end,
    totalDays,
    totalLeagues: LEAGUE_SEEDS.length,
    fetches: 0,
    failedFetches: 0,
    totalRawEvents: 0,
    totalTerminalMatches: 0,
    duplicatesDropped: 0,
    byDay: {},
    failures: []
  };

  try {
    const raw = await fs.readFile(OUT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.season === SEASON) {
      history = parsed;
      history.ok = true;
      history.source = "espn";
      history.from = start;
      history.to = end;
    }
  } catch (_) {}

  try {
    const raw = await fs.readFile(REPORT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.season === SEASON) {
      report = parsed;
      report.ok = true;
      report.from = start;
      report.to = end;
      report.totalDays = totalDays;
      report.totalLeagues = LEAGUE_SEEDS.length;
      if (!report.byDay || typeof report.byDay !== "object") {
        report.byDay = {};
      }
      if (!Array.isArray(report.failures)) {
        report.failures = [];
      }
    }
  } catch (_) {}

  history.totalMatches = recalcTotalMatches(history);
  report.totalTerminalMatches = history.totalMatches;

  return { history, report };
}

async function rebuildCurrentSeason() {
  const start = SEASON_START;
  const end = todayAthens();
  const days = dateRange(start, end);

  const { history, report } = await loadExistingProgress(start, end, days.length);
  const globalSeen = rebuildGlobalSeenFromHistory(history);

  console.log(
    `[history rebuild] start season=${SEASON} days=${days.length} leagues=${LEAGUE_SEEDS.length} existingDays=${Object.keys(history.days || {}).length} existingMatches=${history.totalMatches}`
  );

  for (const dayKey of days) {
    const existingDay = history.days?.[dayKey];
    if (existingDay && Array.isArray(existingDay.matches)) {
      console.log(
        `[history rebuild] skip existing ${dayKey} matches=${existingDay.matches.length}`
      );
      continue;
    }

    console.log(`[history rebuild] day ${dayKey}`);

    const dayBucket = emptyDayBucket(dayKey);
    const daySeen = new Set();

    report.byDay[dayKey] = {
      rawEvents: 0,
      terminalMatches: 0,
      duplicatesDropped: 0,
      leaguesScanned: 0,
      failedLeagues: 0
    };

    for (const slug of LEAGUE_SEEDS) {
      console.log(`[history rebuild] fetch ${dayKey} ${slug}`);

      report.fetches += 1;
      report.byDay[dayKey].leaguesScanned += 1;

      const fetched = await fetchLeagueDay(slug, dayKey);

      if (!fetched.ok) {
        report.failedFetches += 1;
        report.byDay[dayKey].failedLeagues += 1;
        report.failures.push({
          dayKey,
          slug,
          status: fetched.status || null,
          error: fetched.error || "unknown_error"
        });
        continue;
      }

      const events = Array.isArray(fetched.events) ? fetched.events : [];
      report.totalRawEvents += events.length;
      report.byDay[dayKey].rawEvents += events.length;

      for (const ev of events) {
        const row = normalizeEvent(ev, slug, dayKey);
        if (!row) continue;

        // dedupe πρώτα εντός μέρας
        if (daySeen.has(row.id)) {
          report.duplicatesDropped += 1;
          report.byDay[dayKey].duplicatesDropped += 1;
          continue;
        }

        // dedupe global για ασφάλεια
        if (globalSeen.has(row.id)) {
          report.duplicatesDropped += 1;
          report.byDay[dayKey].duplicatesDropped += 1;
          continue;
        }

        daySeen.add(row.id);
        globalSeen.add(row.id);
        dayBucket.matches.push(row);
      }
    }

    dayBucket.matches.sort((a, b) => {
      const ak = Number(a.kickoff_ms || 0);
      const bk = Number(b.kickoff_ms || 0);
      return ak - bk;
    });

    history.days[dayKey] = dayBucket;
    history.totalMatches += dayBucket.matches.length;

    report.totalTerminalMatches = history.totalMatches;
    report.byDay[dayKey].terminalMatches = dayBucket.matches.length;
    report.lastCompletedDay = dayKey;
    report.lastCompletedAt = new Date().toISOString();

    await flushProgress(history, report);

    console.log(
      `[history rebuild] done ${dayKey} matches=${dayBucket.matches.length} total=${history.totalMatches}`
    );
  }

  report.finishedAt = new Date().toISOString();

  await flushProgress(history, report);

  return {
    ok: true,
    outFile: OUT_FILE,
    reportFile: REPORT_FILE,
    season: SEASON,
    from: start,
    to: end,
    totalDays: days.length,
    totalLeagues: LEAGUE_SEEDS.length,
    totalMatches: history.totalMatches,
    failedFetches: report.failedFetches,
    duplicatesDropped: report.duplicatesDropped
  };
}

rebuildCurrentSeason()
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(err => {
    console.error("[rebuild-current-season-history] failed");
    console.error(err);
    process.exit(1);
  });