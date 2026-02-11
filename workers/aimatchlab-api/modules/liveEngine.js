/**
 * AIMATCHLAB – LIVE ENGINE (API MODULE)
 * KV MERGE – UNIFIED STATUS SCHEMA
 *
 * - Fetch ESPN LIVE/FT
 * - Merge into FIXTURES:DATE schema { ok, date, total, matches: [] }
 * - Single source of truth (STATUS_* only)
 */

const VERSION = "2.3.0-api-kv-merge-unified-status";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function safeJsonParse(str) {
  try { return JSON.parse(str); }
  catch { return null; }
}

function normalizeMinute(comp) {
  const clk = comp?.status?.displayClock;
  if (typeof clk === "string" && clk.trim()) return clk.trim();

  const c = comp?.status?.clock;
  if (typeof c === "number" && Number.isFinite(c)) {
    return `${Math.floor(c)}'`;
  }

  return "";
}

function pickTeam(competitors, side) {
  const arr = Array.isArray(competitors) ? competitors : [];
  const bySide = arr.find((c) => (c?.homeAway || "").toLowerCase() === side);
  return bySide || arr[side === "home" ? 0 : 1] || null;
}

async function fetchEspnAllScoreboard() {
  const api = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard";

  const res = await fetch(api, {
    cf: { cacheTtl: 20, cacheEverything: true }
  });

  const txt = await res.text();
  const j = safeJsonParse(txt);

  return {
    ok: res.ok,
    status: res.status,
    json: j
  };
}

function extractLiveMatches(scoreboardJson) {
  const events = Array.isArray(scoreboardJson?.events)
    ? scoreboardJson.events
    : [];

  const out = [];

  for (const ev of events) {
    const comp = Array.isArray(ev?.competitions)
      ? ev.competitions[0]
      : null;

    if (!comp) continue;

    const st = comp?.status?.type || {};
    const state = String(st?.state || "").toLowerCase();

    if (state !== "in" && state !== "post") continue;

    const isLive = state === "in";
    const isFT   = state === "post";

    const competitors = Array.isArray(comp?.competitors)
      ? comp.competitors
      : [];

    const homeObj = pickTeam(competitors, "home");
    const awayObj = pickTeam(competitors, "away");

    const home = homeObj?.team?.displayName || "";
    const away = awayObj?.team?.displayName || "";
    if (!home || !away) continue;

    out.push({
      id: String(ev?.id || comp?.id),
      home,
      away,
      kickoff: comp?.startDate || "",
      status: isLive ? "STATUS_IN_PROGRESS" : "STATUS_FINAL",
      minute: isFT ? null : normalizeMinute(comp),
      scoreHome: Number(homeObj?.score ?? 0),
      scoreAway: Number(awayObj?.score ?? 0)
    });
  }

  return out;
}

async function mergeLiveIntoFixtures(env, liveMatches) {

  if (!env?.AIML_INGESTION_KV) return;
  if (!Array.isArray(liveMatches) || !liveMatches.length) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  const dayKey = `FIXTURES:DATE:${y}-${m}-${d}`;

  try {

    const raw = await env.AIML_INGESTION_KV.get(dayKey);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.matches)) return;

    const fixtures = parsed.matches;

    let changed = false;

    for (const live of liveMatches) {

      const id = String(live.id);
      const f = fixtures.find(x => String(x.id) === id);
      if (!f) continue;

      if (
        f.status !== live.status ||
        Number(f.scoreHome) !== Number(live.scoreHome) ||
        Number(f.scoreAway) !== Number(live.scoreAway) ||
        f.minute !== live.minute
      ) {
        f.status = live.status;
        f.scoreHome = live.scoreHome;
        f.scoreAway = live.scoreAway;
        f.minute = live.minute;
        changed = true;
      }
    }

    if (changed) {
      parsed.matches = fixtures;
      await env.AIML_INGESTION_KV.put(
        dayKey,
        JSON.stringify(parsed)
      );
    }

  } catch (e) {
    console.error("[LIVE MERGE ERROR]", e);
  }
}

export async function handleLive(req, env) {

  if (req.method !== "GET") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const t0 = Date.now();
  let matches = [];

  try {

    const r = await fetchEspnAllScoreboard();

    if (r.ok && r.json) {
      matches = extractLiveMatches(r.json);
      await mergeLiveIntoFixtures(env, matches);
    }

  } catch (e) {
    console.error("[LIVE ENGINE ERROR]", e);
  }

  return json({
    ok: true,
    version: VERSION,
    ts: new Date().toISOString(),
    matches,
    meta: {
      took_ms: Date.now() - t0,
      live_count: matches.filter(m => m.status === "STATUS_IN_PROGRESS").length,
      ft_count: matches.filter(m => m.status === "STATUS_FINAL").length
    }
  });
}
