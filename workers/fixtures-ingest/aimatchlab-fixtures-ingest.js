/**
 * AIMATCHLAB — FIXTURES INGEST (BATCHED, TODAY + 7 DAYS)
 * Source of Truth for FIXTURES:DATE:YYYY-MM-DD
 * Timezone: Europe/Athens
 *
 * FIXES:
 * - Avoid Cloudflare "Too many subrequests" by batching LEAGUE_SEEDS per run.
 * - Persist cursor in KV to continue next batch on next cron.
 *
 * KV Keys:
 * - FIXTURES:DATE:<YYYY-MM-DD>
 * - FIXTURES:INGEST:CURSOR
 * - FIXTURES:INGEST:LAST_RUN
 * - FIXTURES:INGEST:LAST_OK
 * - FIXTURES:INGEST:LAST_ERROR
 */

const TZ = "Europe/Athens";
const HORIZON_DAYS = 7;
const KV_PREFIX = "FIXTURES:DATE:";

// How many leagues per run (safe for CF subrequest budget)
const BATCH_SIZE = 12;

// Cursor state key
const CURSOR_KEY = "FIXTURES:INGEST:CURSOR";

// ================= LEAGUES =================

const LEAGUE_SEEDS = [
  "eng.1","eng.2","eng.3","eng.4","eng.5","eng.fa","eng.league_cup","eng.trophy",

  "esp.1","esp.2","esp.copa_del_rey","esp.super_cup","esp.w.1",

  "ita.1","ita.2","ita.coppa_italia",

  "fra.1","fra.2","fra.coupe_de_france","fra.super_cup","fra.w.1",

  "ger.1","ger.2",

  "sco.1","sco.2","sco.challenge","sco.tennents",

  "ned.1","ned.2","ned.3","ned.cup",

  "por.1","por.taca.portugal",

  "bel.1",

  "gre.1","cyp.1","ksa.1",

  /* UEFA */
  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conf",

  /* CAF */
  "caf.nations","caf.champions","caf.confed",

  /* AFC */
  "afc.champions","afc.cup",

  /* AMERICAS */
  "mex.1","mex.2",
  "usa.1","usa.w.1",

  "arg.1",
  "bra.1","bra.2",
  "chi.1",
  "uru.1",
  "par.1",
  "per.1",
  "ecu.1",

  "crc.1",
  "gua.1",
  "hon.1",
  "pan.1",
  "jam.1",
  "col.1",

  /* EUROPE – EXTRA */
  "tur.1",
  "sui.1",
  "aut.1",
  "den.1",
  "swe.1",
  "nor.1",

  /* ASIA / OCEANIA */
  "sgp.1","slv.1",
  "jpn.1",
  "kor.1",
  "chn.1",
  "tha.1",
  "ind.1",
  "aus.1","aus.w.1",

  /* BRAZIL STATE */
  "bra.camp.carioca",
  "bra.camp.paulista",
  "bra.camp.gaucho",
  "bra.camp.mineiro",

  "club.friendly"
];

const LEAGUE_NAME_MAP = {
  "eng.1":"Premier League",
  "eng.2":"Championship",
  "eng.3":"League One",
  "eng.4":"League Two",
  "eng.5":"National League",
  "eng.fa":"FA Cup",
  "eng.league_cup":"EFL Cup",
  "eng.trophy":"EFL Trophy",

  "esp.1":"LaLiga",
  "esp.2":"LaLiga 2",
  "esp.copa_del_rey":"Copa del Rey",
  "esp.super_cup":"Supercopa de España",
  "esp.w.1":"Liga F",

  "ita.1":"Serie A",
  "ita.2":"Serie B",
  "ita.coppa_italia":"Coppa Italia",

  "fra.1":"Ligue 1",
  "fra.2":"Ligue 2",
  "fra.coupe_de_france":"Coupe de France",
  "fra.super_cup":"Trophée des Champions",
  "fra.w.1":"Première Ligue",

  "ger.1":"Bundesliga",
  "ger.2":"2. Bundesliga",

  "sco.1":"Scottish Premiership",
  "sco.2":"Scottish Championship",
  "sco.challenge":"Scottish Challenge Cup",
  "sco.tennents":"Scottish Premiership",

  "ned.1":"Eredivisie",
  "ned.2":"Keuken Kampioen Divisie",
  "ned.3":"Tweede Divisie",
  "ned.cup":"KNVB Beker",

  "por.1":"Primeira Liga",
  "por.taca.portugal":"Taça de Portugal",

  "bel.1":"Belgian Pro League",

  "gre.1":"Super League Greece",
  "cyp.1":"Cypriot First Division",
  "ksa.1":"Saudi Pro League",

  /* UEFA */
  "uefa.champions":"UEFA Champions League",
  "uefa.europa":"UEFA Europa League",
  "uefa.europa.conf":"UEFA Europa Conference League",

  /* CAF */
  "caf.nations":"Africa Cup of Nations",
  "caf.champions":"CAF Champions League",
  "caf.confed":"CAF Confederation Cup",

  /* AFC */
  "afc.champions":"AFC Champions League",
  "afc.cup":"AFC Cup",

  /* AMERICAS */
  "mex.1":"Liga MX",
  "mex.2":"Liga de Expansión MX",
  "usa.1":"MLS",
  "usa.w.1":"NWSL",

  "arg.1":"Liga Profesional Argentina",
  "bra.1":"Brasileirão Série A",
  "bra.2":"Brasileirão Série B",
  "chi.1":"Primera División de Chile",
  "uru.1":"Uruguayan Primera División",
  "par.1":"Paraguayan Primera División",
  "per.1":"Peruvian Primera División",
  "ecu.1":"Ecuadorian Serie A",

  "crc.1":"Costa Rican Primera División",
  "gua.1":"Liga Nacional de Guatemala",
  "hon.1":"Liga Nacional de Honduras",
  "pan.1":"Liga Panameña de Fútbol",
  "jam.1":"Jamaica Premier League",
  "col.1":"Categoría Primera A",

  /* EUROPE – EXTRA */
  "tur.1":"Turkish Süper Lig",
  "sui.1":"Swiss Super League",
  "aut.1":"Austrian Bundesliga",
  "den.1":"Danish Superliga",
  "swe.1":"Allsvenskan",
  "nor.1":"Eliteserien",

  /* ASIA / OCEANIA */
  "sgp.1":"Singapore Premier League",
  "slv.1":"Primera División de El Salvador",
  "jpn.1":"J1 League",
  "kor.1":"K League 1",
  "chn.1":"Chinese Super League",
  "tha.1":"Thai League 1",
  "ind.1":"Indian Super League",
  "aus.1":"A-League Men",
  "aus.w.1":"A-League Women",

  /* BRAZIL STATE */
  "bra.camp.carioca":"Campeonato Carioca",
  "bra.camp.paulista":"Campeonato Paulista",
  "bra.camp.gaucho":"Campeonato Gaúcho",
  "bra.camp.mineiro":"Campeonato Mineiro",

  "club.friendly":"Club Friendly"
};

// ================= WORKER =================

export default {
  async scheduled(event, env, ctx) {
    console.log("[CRON] fixtures-ingest triggered");
    ctx.waitUntil(runIngest(env, { isCron: true }));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== "/internal/run") {
      return new Response("Not Found", { status: 404 });
    }

    const reset = url.searchParams.get("reset") === "1";
    const batchSize = Number(url.searchParams.get("batch") || BATCH_SIZE);

    console.log("[INTERNAL] fixtures-ingest run");
    const res = await runIngest(env, { isCron: false, reset, batchSize });

    return json(res);
  }
};

// ================= CORE =================

async function runIngest(env, opts = {}) {
  const startedAt = Date.now();
  const isCron = !!opts.isCron;
  const reset = !!opts.reset;
  const batchSize = Number(opts.batchSize || BATCH_SIZE);

  if (!env?.AIMATCHLAB_KV_CORE) {
    console.error("Missing AIMATCHLAB_KV_CORE binding");
    return { ok: false, reason: "missing_binding_AIMATCHLAB_KV_CORE" };
  }

  // Load cursor
  let cursor = 0;
  const cursorRaw = await env.AIMATCHLAB_KV_CORE.get(CURSOR_KEY);
  if (cursorRaw) {
    const n = Number(cursorRaw);
    if (Number.isFinite(n) && n >= 0) cursor = n;
  }

  if (reset) cursor = 0;

  // Determine league batch slice
  const totalLeagues = LEAGUE_SEEDS.length;

  if (cursor >= totalLeagues) cursor = 0;

  const from = cursor;
  const to = Math.min(cursor + batchSize, totalLeagues);
  const batch = LEAGUE_SEEDS.slice(from, to);

  // Next cursor
  let nextCursor = to;
  if (nextCursor >= totalLeagues) nextCursor = 0;

  // Persist next cursor
  await env.AIMATCHLAB_KV_CORE.put(CURSOR_KEY, String(nextCursor));

  const base = nowInTZ(TZ);

  const runSummary = {
    ok: true,
    service: "fixtures-ingest",
    timezone: TZ,
    horizonDays: HORIZON_DAYS,
    batchSize,
    totalLeagues,
    cursorFrom: from,
    cursorTo: to,
    nextCursor,
    batchLeagues: batch,
    wroteDays: [],
    errors: [],
    startedAt,
    finishedAt: null,
    durationMs: null,
    isCron
  };

  await env.AIMATCHLAB_KV_CORE.put(
    "FIXTURES:INGEST:LAST_RUN",
    JSON.stringify({ ...runSummary, note: "started" })
  );

  // Loop days
  for (let d = 0; d < HORIZON_DAYS; d++) {
    const dp = addDaysTZ(base, d, TZ);
    const dayKey = dp.dayKey;
    const kvKey = `${KV_PREFIX}${dayKey}`;

    console.log(`[INGEST] day=${dayKey} leagues=${batch.length} cursor=${from}-${to}`);

    let allEvents = [];
    let dayErrors = [];

    // Fetch only this batch of leagues (safe)
    for (const league of batch) {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dp.ymdCompact}`;
      try {
        const res = await fetch(url, { cf: { cacheTtl: 0 } });
        if (!res.ok) {
          dayErrors.push({ type: "fetch_failed", league, status: res.status });
          continue;
        }

        const data = await res.json();
        const events = Array.isArray(data?.events) ? data.events : [];

        for (const ev of events) {
          const m = mapEvent(ev, league);
          if (!m || !m.kickoff) continue;

          const realDayKey = dayKeyFromKickoff(m.kickoff, TZ);
          if (realDayKey !== dayKey) continue;

          allEvents.push(m);
        }
      } catch (e) {
        dayErrors.push({ type: "exception", league, error: String(e) });
      }
    }

    // Deduplicate by match id
    const byId = new Map();
    for (const m of allEvents) {
      const prev = byId.get(m.id);
      if (!prev) {
        byId.set(m.id, m);
      } else {
        // keep stronger status
        const strong = prev.status === "LIVE" || prev.status === "FT";
        byId.set(m.id, strong ? prev : m);
      }
    }

    const matchesBatch = Array.from(byId.values()).sort(
      (a, b) => (a.kickoff_ms || 0) - (b.kickoff_ms || 0)
    );

    // Merge into existing day key (critical)
    const existingRaw = await env.AIMATCHLAB_KV_CORE.get(kvKey);
    const existing = safeJson(existingRaw, null);

    const existingMatches = Array.isArray(existing?.matches) ? existing.matches : [];
    const existingErrors = Array.isArray(existing?.errors) ? existing.errors : [];

    // Merge matches by id (new batch overwrites weaker old)
    const merged = new Map();
    for (const m of existingMatches) merged.set(String(m.id), m);
    for (const m of matchesBatch) merged.set(String(m.id), m);

    const mergedMatches = Array.from(merged.values()).sort(
      (a, b) => (a.kickoff_ms || 0) - (b.kickoff_ms || 0)
    );

    // Merge errors (keep a reasonable cap)
    const mergedErrors = [...existingErrors, ...dayErrors].slice(-200);

    const finalData = {
      date: dayKey,
      timezone: TZ,
      createdAt: Date.now(),
      source: "espn_per_league_batched",
      matches: mergedMatches,
      errors: mergedErrors
    };

    await env.AIMATCHLAB_KV_CORE.put(kvKey, JSON.stringify(finalData));

    runSummary.wroteDays.push({
      dayKey,
      kvKey,
      wroteBatchMatches: matchesBatch.length,
      totalMatchesAfterMerge: mergedMatches.length,
      errorsAdded: dayErrors.length
    });

    console.log(
      `[INGEST] wrote ${kvKey} batch=${matchesBatch.length} mergedTotal=${mergedMatches.length} errorsAdded=${dayErrors.length}`
    );
  }

  runSummary.finishedAt = Date.now();
  runSummary.durationMs = runSummary.finishedAt - startedAt;

  await env.AIMATCHLAB_KV_CORE.put(
    "FIXTURES:INGEST:LAST_OK",
    JSON.stringify(runSummary)
  );

  return runSummary;
}

// ================= TIME =================

function nowInTZ(tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const p = fmt.formatToParts(new Date());
  return {
    y: Number(p.find(x => x.type === "year").value),
    m: Number(p.find(x => x.type === "month").value),
    d: Number(p.find(x => x.type === "day").value)
  };
}

function addDaysTZ(base, add, tz) {
  const utc = new Date(Date.UTC(base.y, base.m - 1, base.d, 12));
  const dt = new Date(utc.getTime() + add * 86400000);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const s = fmt.format(dt);
  const [y, m, d] = s.split("-").map(Number);
  const dayKey = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const ymdCompact = `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
  return { dayKey, ymdCompact };
}

function dayKeyFromKickoff(iso, tz) {
  if (!iso) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = fmt.formatToParts(new Date(iso));
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

// ================= UTIL =================

function safeJson(txt, fallback) {
  try { return txt ? JSON.parse(txt) : fallback; }
  catch { return fallback; }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function cleanName(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function teamIdFromCompetitor(c) {
  const id =
    c?.team?.id ??
    c?.team?.uid ??
    null;
  if (id === null || id === undefined) return null;
  const s = String(id).trim();
  return s ? s : null;
}

function mapEvent(ev, leagueSeed) {
  try {
    const id = String(ev?.id || "");
    if (!id) return null;

    const comp = ev?.competitions?.[0];
    const dateIso = comp?.date || ev?.date;
    const kickoff_ms = dateIso ? Date.parse(dateIso) : null;

    const cs = comp?.competitors || [];
    const h = cs.find(c => c.homeAway === "home");
    const a = cs.find(c => c.homeAway === "away");
    if (!h || !a) return null;

    const status = mapStatus(comp?.status);

    const homeTeamId = teamIdFromCompetitor(h);
    const awayTeamId = teamIdFromCompetitor(a);

    return {
      id,
      home: cleanName(h.team?.displayName),
      away: cleanName(a.team?.displayName),

      homeTeamId,
      awayTeamId,

      kickoff: dateIso,
      kickoff_ms,
      status,
      minute: extractMinute(comp?.status),
      scoreHome: num(h.score),
      scoreAway: num(a.score),

      leagueSlug: leagueSeed,
      leagueName: LEAGUE_NAME_MAP[leagueSeed] || leagueSeed,
      dayKey: dayKeyFromKickoff(dateIso, TZ)
    };
  } catch {
    return null;
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapStatus(st) {
  const t = (st?.type?.state || "").toUpperCase();
  if (t === "IN") return "LIVE";
  if (t === "POST") return "FT";
  return "PRE";
}

function extractMinute(st) {
  const c = st?.displayClock;
  if (!c) return null;
  const m = c.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}
