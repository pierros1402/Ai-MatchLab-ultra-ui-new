import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEAGUE_SEEDS,
  getLeagueTier,
  getLeagueTrust,
  isCupCompetition,
  isContinentalCompetition
} from "../../workers/_shared/leagues-coverage.js";

import { LEAGUE_NAME_MAP } from "../../workers/_shared/leagues-registry.js";
import { currentSeason } from "../core/season.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ATHENS_TZ = "Europe/Athens";

const SEASON = currentSeason();
const SEASON_START = `${SEASON.slice(0, 4)}-08-01`;

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
    s === "COMPLETE" ||
    s === "FT"
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

function inferPhaseFromContext({ leagueSlug, competitionType, dayKey }) {
  if (competitionType !== "league") return "knockout";

  const slug = String(leagueSlug || "").toLowerCase();

  // Leagues WITHOUT phases
  const alwaysRegular = [
    "eng.", "ger.", "esp.", "ita.", "fra.", "por.", "ned.", "tur."
  ];

  if (alwaysRegular.some(prefix => slug.startsWith(prefix))) {
    return "regular";
  }

  // Phase-based leagues (basic version)
  const phaseLeagues = [
    "bel.1", "gre.1", "den.1", "sco.1", "aut.1"
  ];

  if (!phaseLeagues.includes(slug)) {
    return "regular";
  }

  // Simple season timing heuristic
  const month = Number(String(dayKey).split("-")[1]);

  if (month >= 4) {
    return "playoff";
  }

  return "regular";
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

  let outcome = "DRAW";
  if (scoreHome > scoreAway) outcome = "HOME";
  else if (scoreAway > scoreHome) outcome = "AWAY";

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

  const competitionType =
    isCupCompetition(leagueSlug)
      ? "cup"
      : isContinentalCompetition(leagueSlug)
        ? "continental"
        : "league";

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
    status: safeText(statusName) || "FT",
    minute,
    outcome,
    source: "espn",
    rebuiltAt: Date.now(),
    competitionType,
    leagueTier: getLeagueTier(leagueSlug),
    leagueTrust: getLeagueTrust(leagueSlug),
    phase: inferPhaseFromContext({
      leagueSlug,
      competitionType,
      dayKey: targetDay
    })
  };
}

async function fetchLeagueDay(slug, dayKey) {
  const espnDate = toEspnDate(dayKey);
  const url = `${ESPN_BASE}/${slug}/scoreboard?limit=300&dates=${espnDate}`;

  let res;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" }
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

  return {
    ok: true,
    slug,
    dayKey,
    url,
    status: res.status,
    events: Array.isArray(json?.events) ? json.events : []
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

function normalizeExistingHistory(history) {
  const rawDays = history?.days;

  if (!Array.isArray(rawDays)) {
    return [];
  }

  return rawDays
    .map(day => ({
      dayKey: day?.dayKey || "",
      matchCount: Array.isArray(day?.rows) ? day.rows.length : 0,
      rows: Array.isArray(day?.rows) ? day.rows : [],
      updatedAt: day?.updatedAt || Date.now()
    }))
    .filter(day => !!day.dayKey)
    .sort((a, b) => String(a.dayKey).localeCompare(String(b.dayKey)));
}

function rebuildGlobalSeenFromHistory(history) {
  const seen = new Set();

  for (const bucket of history?.days || []) {
    for (const m of bucket?.rows || []) {
      if (m?.id) seen.add(String(m.id));
    }
  }

  return seen;
}

function recalcTotalMatches(history) {
  return (history?.days || []).reduce((sum, bucket) => {
    return sum + (Array.isArray(bucket?.rows) ? bucket.rows.length : 0);
  }, 0);
}

function emptyDayBucket(dayKey) {
  return {
    dayKey,
    matchCount: 0,
    rows: [],
    updatedAt: Date.now()
  };
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
    days: [],
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
      history = {
        ...parsed,
        ok: true,
        source: "espn",
        from: start,
        to: end,
        days: normalizeExistingHistory(parsed)
      };
    }
  } catch (_) {}

  try {
    const raw = await fs.readFile(REPORT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.season === SEASON) {
      report = {
        ...parsed,
        ok: true,
        from: start,
        to: end,
        totalDays,
        totalLeagues: LEAGUE_SEEDS.length,
        byDay: parsed.byDay && typeof parsed.byDay === "object" ? parsed.byDay : {},
        failures: Array.isArray(parsed.failures) ? parsed.failures : []
      };
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
    `[history rebuild] start season=${SEASON} days=${days.length} leagues=${LEAGUE_SEEDS.length} existingDays=${history.days.length} existingMatches=${history.totalMatches}`
  );

  for (const dayKey of days) {
    const existingDay = history.days.find(d => d?.dayKey === dayKey);

    const FORCE_REBUILD = true;

    if (!FORCE_REBUILD && existingDay && Array.isArray(existingDay.rows) &&  existingDay.rows.length) {
      console.log(`[history rebuild] skip existing ${dayKey} matches= ${existingDay.rows.length}`);
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

      for (const ev of fetched.events || []) {
        const row = normalizeEvent(ev, slug, dayKey);
        if (!row) continue;

        if (daySeen.has(row.id) || globalSeen.has(row.id)) {
          report.duplicatesDropped += 1;
          report.byDay[dayKey].duplicatesDropped += 1;
          continue;
        }

        daySeen.add(row.id);
        globalSeen.add(row.id);
        dayBucket.rows.push(row);
      }
    }

    dayBucket.rows.sort((a, b) => Number(a.kickoff_ms || 0) - Number(b.kickoff_ms || 0));
    dayBucket.matchCount = dayBucket.rows.length;
    dayBucket.updatedAt = Date.now();

    const existingIndex = history.days.findIndex(d => d?.dayKey === dayKey);
    if (existingIndex >= 0) {
      history.days[existingIndex] = dayBucket;
    } else {
      history.days.push(dayBucket);
    }

    history.days.sort((a, b) => String(a.dayKey).localeCompare(String(b.dayKey)));
    history.totalMatches = recalcTotalMatches(history);

    report.totalTerminalMatches = history.totalMatches;
    report.byDay[dayKey].terminalMatches = dayBucket.rows.length;
    report.lastCompletedDay = dayKey;
    report.lastCompletedAt = new Date().toISOString();

    await flushProgress(history, report);

    console.log(
      `[history rebuild] done ${dayKey} matches=${dayBucket.rows.length} total=${history.totalMatches}`
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