/**
 * AIMATCHLAB – MAIN API WORKER
 * Responsibilities:
 * - Serve fixtures (READ)            ✅ /fixtures
 * - Serve value picks (READ)         ✅ /value-picks
 * - Export value picks as CSV        ✅ /value-export + /value-export/range (ADMIN)
 * - Dashboard health                ✅ /aiml-health.json
 *
 * Notes:
 * - /fixtures is READ-ONLY (no FT archival here)
 * - Export endpoints are protected by ADMIN_EXPORT_TOKEN (= "1234")
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ================= DASHBOARD HEALTH ================= */
    if (url.pathname === "/aiml-health.json") {
      return handleAIMLHealth(url, env);
    }

    /* ================= FIXTURES ================= */
    

    if (url.pathname === "/fixtures-runtime") {
      return handleFixturesRuntime(url, env);
    }

    if (url.pathname === "/fixtures") {
      return handleFixtures(url, env);
    }


    /* ================= FIXTURES INGEST PROXY ================= */
    if (url.pathname === "/internal/fixtures-run") {
      return handleFixturesIngestProxy(url, env);
    }

    /* ================= FIXTURES EXPORT (ADMIN) ================= */
    if (url.pathname === "/fixtures-export/range") {
      return handleFixturesExportRange(url, env);
    }

/* ================= VALUE PICKS ================= */
    if (url.pathname === "/value-picks") {
      return handleValuePicks(url, env);
    }

    /* ================= VALUE EXPORT (ADMIN) ================= */
    if (url.pathname === "/value-export") {
      return handleValueExportDaily(url, env);
    }

    if (url.pathname === "/value-export/range") {
      return handleValueExportRange(url, env);
    }

    /* ================= VERSION ================= */
    if (url.pathname === "/version.json") {
      return json({
        ok: true,
        service: "aimatchlab-main",
        version: "v1.3.0+value-export"
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};

/* =====================================================
   DASHBOARD HEALTH (SAFE, READ-ONLY)
===================================================== */

async function handleAIMLHealth(url, env) {
  const dayKey = url.searchParams.get("date") || dayKeyGR();

  const fxKey = `FIXTURES:DATE:${dayKey}`;
  const fx = await env.AIML_INGESTION_KV.get(fxKey, { type: "json" });
  const fixturesTotal = fx?.matches?.length ?? 0;

  const summaryKey = `VALUE:SUMMARY:${dayKey}`;
  const rawSummary = await env.AIML_INGESTION_KV.get(summaryKey, { type: "json" });

  let valueTotal = 0;
  let valueSource = "EMPTY";

  if (rawSummary && Array.isArray(rawSummary.items)) {
    valueTotal = rawSummary.items.length;
    valueSource = "VALUE:SUMMARY";
  }

  return json({
    ok: true,
    service: "aimatchlab-main",
    version: "v1.3.0+value-export",
    date: dayKey,
    fixtures: { key: fxKey, total: fixturesTotal },
    valuePicks: { date: dayKey, total: valueTotal, source: valueSource }
  });
}

/* =====================================================
   FIXTURES – READ FROM KV (READ-ONLY)
===================================================== */

async function handleFixtures(url, env) {
  const dayKey = url.searchParams.get("date") || dayKeyGR();
  const key = `FIXTURES:DATE:${dayKey}`;

  const raw = await env.AIML_INGESTION_KV.get(key, { type: "json" });

  if (!raw || !Array.isArray(raw.matches)) {
    return json({ ok: true, date: dayKey, total: 0, matches: [] });
  }

  return json({
    ok: true,
    date: dayKey,
    total: raw.matches.length,
    matches: raw.matches
  });
}


/* =====================================================
   FIXTURES EXPORT (ADMIN ONLY)
   - /fixtures-export/range?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv&token=1234
===================================================== */

async function handleFixturesExportRange(url, env) {
  if (!requireAdmin(url, env)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const from = String(url.searchParams.get("from") || "").trim();
  const to = String(url.searchParams.get("to") || "").trim();
  const format = (url.searchParams.get("format") || "csv").toLowerCase();

  const days = buildDayRange(from, to, 31);
  if (!days.length) {
    return json({ ok: false, error: "bad_range", from, to }, 400);
  }

  const all = [];

  for (const dayKey of days) {
    const key = `FIXTURES:DATE:${dayKey}`;
    const raw = await env.AIML_INGESTION_KV.get(key, { type: "json" });
    const matches = raw?.matches;

    if (Array.isArray(matches) && matches.length) {
      for (const m of matches) {
        all.push({ dayKey, ...m });
      }
    }
  }

  if (format !== "csv") {
    return json({
      ok: true,
      from,
      to,
      days: days.length,
      total: all.length,
      matches: all
    });
  }

  const headers = [
    "dayKey",
    "id",
    "leagueSlug",
    "leagueName",
    "home",
    "away",
    "kickoff",
    "kickoff_ms",
    "status",
    "minute",
    "scoreHome",
    "scoreAway"
  ];

  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  let out = headers.join(",") + "\n";
  for (const m of all) {
    out += headers.map((h) => esc(m[h])).join(",") + "\n";
  }

  return new Response(out, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fixtures_export_${from}_to_${to}.csv"`,
      "Access-Control-Allow-Origin": "*"
    }
  });
}

/* =====================================================
   VALUE PICKS – READ ONLY (SUMMARY + STAT FALLBACK)
===================================================== */

async function handleValuePicks(url, env) {
  const dayKey = url.searchParams.get("date") || dayKeyGR();

  const raw = await env.AIML_INGESTION_KV.get(`VALUE:SUMMARY:${dayKey}`, { type: "json" });

  if (raw && Array.isArray(raw.items)) {
    return json({
      ok: true,
      date: dayKey,
      total: raw.items.length,
      items: raw.items,
      source: "VALUE:SUMMARY"
    });
  }

  // ✅ no KV.list fallback (prevents daily list-limit)
  return json({
    ok: true,
    date: dayKey,
    total: 0,
    items: [],
    source: "VALUE:SUMMARY",
    reason: "missing_summary",
    message: "Daily summary not produced yet for this date."
  });
}


/* =====================================================
   VALUE EXPORT (ADMIN ONLY)
   - /value-export?date=YYYY-MM-DD&format=csv&token=1234
   - /value-export/range?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv&token=1234
===================================================== */

function requireAdmin(url, env) {
  const token = String(url.searchParams.get("token") || "").trim();
  return token && env.ADMIN_EXPORT_TOKEN && token === String(env.ADMIN_EXPORT_TOKEN);
}

async function handleValueExportDaily(url, env) {
  if (!requireAdmin(url, env)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const dayKey = (url.searchParams.get("date") || dayKeyGR()).trim();
  const format = (url.searchParams.get("format") || "csv").toLowerCase();

  const rows = await collectRowsForDay(dayKey, env);

  if (format !== "csv") {
    return json({ ok: true, date: dayKey, total: rows.length, rows });
  }

  const csv = toCSV(rows);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="value_export_${dayKey}.csv"`,
      "Access-Control-Allow-Origin": "*"
    }
  });
}

async function handleValueExportRange(url, env) {
  if (!requireAdmin(url, env)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const from = (url.searchParams.get("from") || "").trim();
  const to = (url.searchParams.get("to") || "").trim();
  const format = (url.searchParams.get("format") || "csv").toLowerCase();

  if (!from || !to) {
    return json(
      {
        ok: false,
        error: "missing_from_or_to",
        example:
          "/value-export/range?from=2026-01-25&to=2026-01-25&format=csv&token=1234"
      },
      400
    );
  }

  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) {
    return json({ ok: false, error: "invalid_date_format" }, 400);
  }

  const days = buildDayRange(from, to, 31);
  if (!days.length) {
    return json({ ok: false, error: "empty_range" }, 400);
  }

  const rows = [];
  for (const d of days) {
    const dayRows = await collectRowsForDay(d, env);
    for (const r of dayRows) rows.push(r);
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return String(a.kickoff || "").localeCompare(String(b.kickoff || ""));
  });

  if (format !== "csv") {
    return json({ ok: true, from, to, days, total: rows.length, rows });
  }

  const csv = toCSV(rows);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="value_export_${from}_to_${to}.csv"`,
      "Access-Control-Allow-Origin": "*"
    }
  });
}
function buildFixturesIndex(fixturesJson) {
  const idx = new Map();
  const matches = fixturesJson?.matches || [];

  for (const m of matches) {
    const league = String(m.leagueSlug || "").trim();
    const home = String(m.home || "").trim();
    const away = String(m.away || "").trim();
    if (!league || !home || !away) continue;

    const key = `${league}__${home}__${away}`;
    idx.set(key, m);
  }

  return idx;
}

function mergeFTIntoItem(item, fxMatch) {
  if (!fxMatch) return item;

  // only trust FT/LIVE/PRE from fixtures (source of truth)
  const merged = { ...item };

  merged.kickoff = merged.kickoff || fxMatch.kickoff || "";

  merged.status = fxMatch.status || merged.status || "";
  merged.scoreHome = (fxMatch.scoreHome ?? merged.scoreHome ?? "");
  merged.scoreAway = (fxMatch.scoreAway ?? merged.scoreAway ?? "");

  return merged;
}

async function collectRowsForDay(dayKey, env) {
  // Load fixtures for FT verification
  const fxKey = `FIXTURES:DATE:${dayKey}`;
  const fx = await env.AIML_INGESTION_KV.get(fxKey, { type: "json" });
  const fxIndex = buildFixturesIndex(fx);

  // Prefer VALUE:SUMMARY
  const summaryKey = `VALUE:SUMMARY:${dayKey}`;
  const summary = await env.AIML_INGESTION_KV.get(summaryKey, { type: "json" });

  if (summary && Array.isArray(summary.items) && summary.items.length) {
    return summary.items.map((it) => {
      const league = String(it.leagueSlug || "").trim();
      const home = String(it.home || "").trim();
      const away = String(it.away || "").trim();

      const key = `${league}__${home}__${away}`;
      const fxMatch = fxIndex.get(key);

      const merged = mergeFTIntoItem(it, fxMatch);
      return normalizeValueRow(dayKey, merged);
    });
  }

  // fallback to VALUE:STAT keys
  const prefix = `VALUE:STAT:${dayKey}:`;
  const list = await env.AIML_INGESTION_KV.list({ prefix });
  if (!list?.keys?.length) return [];

  const out = [];
  for (const k of list.keys) {
    const rec = await env.AIML_INGESTION_KV.get(k.name, { type: "json" });
    if (!rec) continue;

    const league = String(rec.leagueSlug || "").trim();
    const home = String(rec.home || "").trim();
    const away = String(rec.away || "").trim();

    const key = `${league}__${home}__${away}`;
    const fxMatch = fxIndex.get(key);

    const merged = mergeFTIntoItem(rec, fxMatch);
    out.push(normalizeValueRow(dayKey, merged));
  }

  return out;
}


/* =====================================================
   FIXTURES INGEST PROXY (INTERNAL)
   - /internal/fixtures-run?date=YYYY-MM-DD
   - This is used by scheduler to avoid workers.dev routing glitches (1042)
===================================================== */
async function handleFixturesIngestProxy(url, env) {
  const date = String(url.searchParams.get("date") || "").trim();
  const dayKey = date || dayKeyGR();

  const base =
    env.FIXTURES_INGEST_BASE ||
    "https://aimatchlab-fixtures-ingest.pierros1402.workers.dev";

  const target = `${base}/internal/run?date=${encodeURIComponent(dayKey)}`;

  const res = await fetch(target, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  const txt = await res.text();

  return new Response(txt, {
    status: res.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}


/* =====================================================
   HELPERS
===================================================== */
function evaluateVerified(market, pick, scoreHome, scoreAway, status) {
  if (String(status || "").toUpperCase() !== "FT") return "N/A";

  const h = Number(scoreHome);
  const a = Number(scoreAway);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return "N/A";

  const m = String(market || "").toUpperCase().replaceAll(" ", "");
  const p = String(pick || "").toUpperCase().replaceAll(" ", "");
  const total = h + a;

  // BTTS
  if (m.includes("BTTS")) {
    const bttsYes = (h > 0 && a > 0);
    if (p === "YES") return bttsYes ? "YES" : "NO";
    if (p === "NO") return (!bttsYes) ? "YES" : "NO";
    return "N/A";
  }

  // 1X2
  if (m.includes("1X2")) {
    if (p === "1") return (h > a) ? "YES" : "NO";
    if (p === "X") return (h === a) ? "YES" : "NO";
    if (p === "2") return (h < a) ? "YES" : "NO";
    return "N/A";
  }

  // DC (1X / X2 / 12)
  if (m.includes("DC") || m.includes("DOUBLECHANCE")) {
    if (p === "1X") return (h >= a) ? "YES" : "NO";
    if (p === "X2") return (a >= h) ? "YES" : "NO";
    if (p === "12") return (h !== a) ? "YES" : "NO";
    return "N/A";
  }

  // Over/Under X.5 (supports: OVER2.5, UNDER3.5, O/U2.5 etc)
  if (m.includes("OVER") || m.includes("UNDER") || m.includes("O/U") || m.includes("OU")) {
    const num = Number((m.match(/(\d+(\.\d+)?)/)?.[1]) || "");
    if (!Number.isFinite(num)) return "N/A";

    const isOver = m.includes("OVER");
    const pass = isOver ? (total > num) : (total < num); // with .5 line, this is correct
    return pass ? "YES" : "NO";
  }

  return "N/A";
}

function normalizeValueRow(dayKey, item) {
  const league = item.leagueName ?? item.leagueSlug ?? "";
  const home = item.home ?? "";
  const away = item.away ?? "";

  const market = item.market ?? item.pickType ?? "";
  const pick = item.pick ?? item.selection ?? "";
  const confidence = item.confidence ?? item.tier ?? "";
  const score = item.score ?? item.valueScore ?? item.rankScore ?? "";

  const status = item.status ?? "";
  const scoreHome = item.scoreHome ?? "";
  const scoreAway = item.scoreAway ?? "";

  // ✅ "ανάσα" στο Excel
  const spacer = "";

  const ft = (String(status).toUpperCase() === "FT")
    ? `${scoreHome}-${scoreAway}`
    : "";

  return {
    date: dayKey,
    league,
    home,
    away,
    kickoff: item.kickoff ?? "",

    _sp1: spacer,

    market,
    pick,
    confidence,
    score,

    _sp2: spacer,

    status,
    ft,

    verified: evaluateVerified(market, pick, scoreHome, scoreAway, status)
  };
}

function buildDayRange(from, to, maxDays = 31) {
  const out = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  if (start > end) return [];

  const cur = new Date(start);
  while (cur <= end && out.length < maxDays) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function dayKeyGR(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function toCSV(rows) {
  const headers = [
    "date",
    "league",
    "home",
    "away",
    "kickoff",

    "_sp1",

    "market",
    "pick",
    "confidence",
    "score",

    "_sp2",

    "status",
    "ft",
    "verified"
  ];


  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  let out = headers.join(",") + "\n";
  for (const r of rows) {
    out += headers.map((h) => esc(r[h])).join(",") + "\n";
  }
  return out;
}



/* =====================================================
   FIXTURES RUNTIME (STATE-AWARE ENGINE)
   - /fixtures-runtime?mode=today|active|live
===================================================== */

async function handleFixturesRuntime(url, env) {
  const mode = (url.searchParams.get("mode") || "today").toLowerCase();
  const dayKey = url.searchParams.get("date") || dayKeyGR();

  const raw = await env.AIML_INGESTION_KV.get(`FIXTURES:DATE:${dayKey}`, { type: "json" });
  if (!raw || !Array.isArray(raw.matches)) {
    return json({ ok: true, date: dayKey, total: 0, matches: [] });
  }

  const now = Date.now();
  const matches = [];

  for (const m of raw.matches) {
    let match = { ...m };

    // LIVE OVERLAY
    const liveState = await env.AIML_INGESTION_KV.get(`LIVE:STATE:${m.id}`, { type: "json" });
    const liveIntel = await env.AIML_INGESTION_KV.get(`LIVE:INTEL:${m.id}`, { type: "json" });

    if (liveState) {
      match.status = liveState.status || match.status;
      match.minute = liveState.minute ?? match.minute;
      match.scoreHome = liveState.scoreHome ?? match.scoreHome;
      match.scoreAway = liveState.scoreAway ?? match.scoreAway;
    }

    const status = String(match.status || "").toUpperCase();
    const kickoff = Number(match.kickoff_ms || 0);

    if (mode === "live") {
      if (status.includes("IN")) matches.push(match);
      continue;
    }

    if (mode === "active") {
      if (status.includes("PRE")) matches.push(match);
      continue;
    }

    // TODAY MODE
    if (status.includes("PRE")) {
      matches.push(match);
      continue;
    }

    if (status.includes("IN")) {
      matches.push(match);
      continue;
    }

    if (status.includes("FT")) {
      // keep FT for 10 minutes
      const endedAgo = now - (kickoff || now);
      if (endedAgo < 10 * 60 * 1000) {
        matches.push(match);
      }
      continue;
    }
  }

  return json({
    ok: true,
    mode,
    date: dayKey,
    total: matches.length,
    matches
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
