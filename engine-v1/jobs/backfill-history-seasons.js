/**
 * backfill-history-seasons.js
 *
 * One-time backfill: fetches 5 past seasons (2020-21 → 2024-25) from ESPN for
 * ~150 target leagues using monthly date-range batches, writes data/history/{season}.json
 * in the exact same format as append-finalized-day-to-history.js, then calls
 * bootstrapH2HFromHistory() so all H2H pairs are populated from 6 seasons total.
 *
 * Resume-safe: a checkpoint file (data/backfill-checkpoint.json) records which
 * (slug × month) combos are done — re-running skips already-processed batches.
 *
 * Usage: node engine-v1/jobs/backfill-history-seasons.js
 *   --from 2020-08   (default: 2020-08)
 *   --to   2025-06   (default: 2025-06, day before 2025-2026 history starts)
 *   --delay 120      (ms between requests, default 120)
 *   --resume         (skip already-done slug×month pairs, always on by default)
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { bootstrapH2HFromHistory } from "./bootstrap-h2h-from-history.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

// ─── Target leagues ───────────────────────────────────────────────────────────
// Active summer leagues (94) + major European / winter leagues + UEFA cups
const TARGET_SLUGS = [
  // Nordic / Baltic
  "swe.1","swe.2","nor.1","nor.2","fin.1","fin.2",
  "est.1","est.2","lva.1","lva.2","ltu.1","ltu.2",
  "fro.1","fro.2","isl.1","isl.2",
  // British Isles
  "irl.1","irl.2",
  "eng.1","eng.2","eng.3","eng.4","eng.5",
  "sco.1","sco.2","sco.3",
  "wal.1","nir.1",
  // Western Europe (winter leagues)
  "ger.1","ger.2","ger.3",
  "spa.1","spa.2",
  "ita.1","ita.2",
  "fra.1","fra.2",
  "por.1","por.2",
  "nld.1","nld.2",
  "bel.1","bel.2",
  "aut.1","aut.2",
  "che.1","che.2",
  "dan.1","dan.2",
  // Eastern / Southern Europe
  "tur.1","tur.2",
  "gre.1","gre.2",
  "rus.1","rus.2",
  "ukr.1","ukr.2",
  "pol.1","pol.2",
  "cze.1","cze.2",
  "hrv.1","hrv.2",
  "srb.1","srb.2",
  "rou.1","rou.2",
  "hun.1","hun.2",
  "svn.1","svk.1",
  "bul.1","cyp.1",
  "bih.1","alb.1","kos.1","mne.1","mkd.1",
  "geo.1","arm.1","aze.1","blr.1","mda.1",
  // South America (all active)
  "bra.1","bra.2",
  "arg.1","arg.2",
  "col.1","col.2",
  "chi.1","chi.2",
  "uru.1","uru.2",
  "ecu.1","ecu.2",
  "per.1","per.2",
  "ven.1","ven.2",
  "bol.1","bol.2",
  "par.1","par.2",
  // North / Central America
  "usa.1","usa.2",
  "can.1","can.2",
  "mex.1","mex.2",
  "crc.1","crc.2",
  "slv.1","slv.2",
  "gua.1","gua.2",
  "hon.1","hon.2",
  "pan.1","pan.2",
  "jam.1",
  // Asia / Pacific
  "jpn.1","jpn.2",
  "kor.1","kor.2",
  "chn.1","chn.2",
  "tpe.1",
  "aus.1",
  // Africa (active)
  "rsa.1","rsa.2",
  "ang.1","bot.1","zam.1","zim.1",
  "moz.1","mwi.1","nam.1","swz.1","les.1",
  // UEFA competitions
  "uefa.cl","uefa.el","uefa.conference.league","uefa.super_cup",
  "conmebol.sudamericana","conmebol.libertadores",
  // Domestic cups (European — ESPN has these)
  "eng.fa_cup","eng.league_cup","ger.dfb_pokal","ita.coppa_italia","fra.coupe_de_france",
  "esp.copa_del_rey","ned.knvb_beker","por.taça_de_portugal","bel.cup","sco.fa_cup",
  // Continental club cups
  "concacaf.champions",   // CONCACAF Champions Cup — relevant for usa/can/mex/crc clubs
  "afc.champions",        // AFC Champions League — relevant for jpn/kor/chn clubs
  // Americas domestic cups
  "bra.copa_brasil","arg.copa.argentina","chi.1.cup","ven.1.cup","col.cup",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(...a) { console.log("[backfill]", ...a); }

function resolveSeasonFromDay(dayKey) {
  const [year, month] = String(dayKey).split("-").map(Number);
  if (!year || !month) return "unknown-season";
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function isFinalStatus(rawStatus = "") {
  const s = rawStatus.toUpperCase();
  return (
    s.includes("STATUS_FULL_TIME") ||
    s.includes("STATUS_FINAL") ||
    s.includes("STATUS_AET") ||
    s.includes("STATUS_PENALTIES") ||
    s === "FT" || s === "AET" || s === "PEN" || s === "FINAL"
  );
}

function normalizeEventRow(e, slug, season, dayKey) {
  const comp = e?.competitions?.[0] || {};
  const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
  const home = competitors.find(c => c?.homeAway === "home") || competitors[0] || {};
  const away = competitors.find(c => c?.homeAway === "away") || competitors[1] || {};
  const statusType = (comp?.status || e?.status || {})?.type || {};
  const rawStatus = statusType?.name || statusType?.description || "";
  const kickoff = comp?.date || e?.date || null;
  const kickoff_ms = kickoff ? Date.parse(kickoff) : null;
  const leagueSlug = e?.leagues?.[0]?.slug || comp?.league?.slug || slug || null;
  const leagueName = e?.leagues?.[0]?.name || comp?.league?.name || null;
  const sh = home?.score == null || home?.score === "" ? null : Number(home.score);
  const sa = away?.score == null || away?.score === "" ? null : Number(away.score);
  const scoreHome = Number.isFinite(sh) ? sh : null;
  const scoreAway = Number.isFinite(sa) ? sa : null;

  return {
    id:     e?.id || null,
    season,
    dayKey,
    kickoff,
    kickoff_ms,
    leagueSlug,
    leagueName,
    homeTeam: home?.team?.displayName || home?.team?.shortDisplayName || null,
    awayTeam: away?.team?.displayName || away?.team?.shortDisplayName || null,
    scoreHome,
    scoreAway,
    status: statusType?.state || rawStatus || "",
    rawStatus,
    minute: (comp?.status || {})?.displayClock || null,
    outcome:
      scoreHome != null && scoreAway != null
        ? scoreHome > scoreAway ? "HOME" : scoreHome < scoreAway ? "AWAY" : "DRAW"
        : null,
    source: "espn",
    rebuiltAt: Date.now(),
    competitionType: "league",
    leagueTier: null,
    leagueTrust: null,
    phase: "regular",
  };
}

// Returns YYYY-MM strings from fromMonth to toMonth inclusive
function monthRange(fromMonth, toMonth) {
  const months = [];
  let [y, m] = fromMonth.split("-").map(Number);
  const [ey, em] = toMonth.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

function monthDateRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const pad = n => String(n).padStart(2, "0");
  const from = `${y}${pad(m)}01`;
  const to   = `${y}${pad(m)}${lastDay}`;
  return { from, to };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

const CHECKPOINT_FILE = resolveDataPath("backfill-checkpoint.json");

function loadCheckpoint() {
  try { return new Set(JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"))); }
  catch { return new Set(); }
}

function saveCheckpoint(done) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify([...done], null, 0), "utf8");
}

// ─── History file helpers ──────────────────────────────────────────────────────

const HISTORY_DIR = ensureDir(resolveDataPath("history"));

function readHistory(season) {
  const f = path.join(HISTORY_DIR, `${season}.json`);
  try { return JSON.parse(fs.readFileSync(f, "utf8")); }
  catch { return { season, days: [] }; }
}

function writeHistory(season, history) {
  const f = path.join(HISTORY_DIR, `${season}.json`);
  fs.writeFileSync(f, JSON.stringify(history, null, 2), "utf8");
}

// Merge incoming rows into history by dayKey, deduplicated by match id
function mergeIntoHistory(history, incomingRows) {
  const dayMap = new Map();
  for (const day of (history.days || [])) {
    dayMap.set(day.dayKey, day);
  }

  for (const row of incomingRows) {
    const dk = row.dayKey;
    if (!dk) continue;
    if (!dayMap.has(dk)) {
      dayMap.set(dk, { dayKey: dk, rows: [], updatedAt: Date.now() });
    }
    const day = dayMap.get(dk);
    const existingIds = new Set(day.rows.map(r => String(r.id || "")));
    if (row.id && !existingIds.has(String(row.id))) {
      day.rows.push(row);
      day.matchCount = day.rows.length;
      day.updatedAt = Date.now();
    }
  }

  const days = [...dayMap.values()]
    .filter(d => d.dayKey)
    .sort((a, b) => String(a.dayKey).localeCompare(String(b.dayKey)));

  history.days = days;
  return history;
}

// ─── ESPN fetch ───────────────────────────────────────────────────────────────

async function fetchMonthForSlug(slug, ym) {
  const { from, to } = monthDateRange(ym);
  const url = `${ESPN_BASE}/${slug}/scoreboard?limit=500&dates=${from}-${to}`;
  try {
    const r = await fetch(url);
    if (r.status === 404 || r.status === 400) { await r.body?.cancel?.(); return []; }
    if (!r.ok) { await r.body?.cancel?.(); return []; }
    const data = await r.json();
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function backfillHistorySeasons({
  fromMonth = "2020-08",
  toMonth   = "2025-06",
  delayMs   = 120,
  slugs     = TARGET_SLUGS,
} = {}) {
  log("start", { fromMonth, toMonth, leagues: slugs.length });

  const months = monthRange(fromMonth, toMonth);
  log(`months to cover: ${months[0]} → ${months[months.length - 1]} (${months.length} months)`);

  const done = loadCheckpoint();
  const totals = { requests: 0, events: 0, stored: 0, skipped: 0 };

  // Batch writes: accumulate rows per season in memory, flush every 500 events
  const pending = new Map(); // season → rows[]
  let pendingCount = 0;

  function flushPending() {
    for (const [season, rows] of pending) {
      if (!rows.length) continue;
      const history = readHistory(season);
      mergeIntoHistory(history, rows);
      writeHistory(season, history);
      totals.stored += rows.length;
    }
    pending.clear();
    pendingCount = 0;
  }

  const total = slugs.length * months.length;
  let processed = 0;

  for (const slug of slugs) {
    for (const ym of months) {
      const key = `${slug}:${ym}`;
      processed++;

      if (done.has(key)) {
        totals.skipped++;
        continue;
      }

      const events = await fetchMonthForSlug(slug, ym);
      totals.requests++;

      for (const e of events) {
        const rawStatus = (((e?.competitions?.[0] || {})?.status || {})?.type?.name || "");
        if (!isFinalStatus(rawStatus)) continue; // only finished matches
        const kickoff = e?.competitions?.[0]?.date || e?.date || null;
        if (!kickoff) continue;
        const dayKey = kickoff.slice(0, 10);
        const season = resolveSeasonFromDay(dayKey);
        if (!pending.has(season)) pending.set(season, []);
        const row = normalizeEventRow(e, slug, season, dayKey);
        if (!row.homeTeam || !row.awayTeam) continue;
        pending.get(season).push(row);
        pendingCount++;
        totals.events++;
      }

      done.add(key);
      if (delayMs > 0) await sleep(delayMs);

      // Flush + checkpoint every 500 events or every 200 requests
      if (pendingCount >= 500 || totals.requests % 200 === 0) {
        flushPending();
        saveCheckpoint(done);
        const pct = Math.round(processed / total * 100);
        log(`progress ${pct}% | req:${totals.requests} ev:${totals.events} stored:${totals.stored} skip:${totals.skipped}`);
      }
    }
  }

  // Final flush
  flushPending();
  saveCheckpoint(done);
  log("fetch complete", totals);

  // Count rows in all seasons
  let totalMatches = 0;
  const seasonFiles = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith(".json") && !f.endsWith(".report.json"));
  for (const f of seasonFiles) {
    try {
      const h = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), "utf8"));
      const n = (h.days || []).reduce((s, d) => s + (d.rows || []).length, 0);
      log(`  ${f}: ${n} matches`);
      totalMatches += n;
    } catch { /* */ }
  }
  log(`total matches across all season files: ${totalMatches}`);

  // Now bootstrap H2H from all history files
  log("running H2H bootstrap from all seasons…");
  const h2h = await bootstrapH2HFromHistory();
  log("H2H bootstrap done", h2h);

  return { ok: true, ...totals, totalMatches, h2h };
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const args = process.argv.slice(2);
  const get  = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

  const fromMonth = get("--from") || "2020-08";
  const toMonth   = get("--to")   || "2025-06";
  const delayMs   = Number(get("--delay") || 120);

  backfillHistorySeasons({ fromMonth, toMonth, delayMs })
    .then(r => {
      console.log(JSON.stringify({ summary: r }, null, 2));
    })
    .catch(err => {
      console.error("[backfill] fatal", String(err?.message || err));
      process.exitCode = 1;
    });
}
