/**
 * AIMATCHLAB — CURRENT STANDINGS WORKER
 *
 * ΡΟΛΟΣ:
 * - Διαβάζει ενεργές λίγκες από FIXTURES (CORE KV)
 * - Παίρνει CURRENT standings από ESPN
 * - Ανιχνεύει season από το ίδιο το standings payload
 * - Γράφει ΜΟΝΟ:
 *   STANDINGS:CURRENT:<leagueSlug>
 *
 * ΣΗΜΑΝΤΙΚΟ:
 * - Χρησιμοποιεί ΑΠΟΚΛΕΙΣΤΙΚΑ το AIMATCHLAB_KV_CORE
 * - Χωρίς cron
 * - Χωρίς UI endpoints
 * - Manual trigger: /run
 */

const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

/* ================================
   ENTRY
================================ */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/run") {
      const result = await run(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};

/* ================================
   MAIN LOGIC
================================ */

async function run(env) {
  // ΑΣΦΑΛΕΙΑ: το KV ΠΡΕΠΕΙ να υπάρχει
  if (!env.AIMATCHLAB_KV_CORE) {
    return {
      ok: false,
      error: "AIMATCHLAB_KV_CORE is not bound"
    };
  }

  // 1) Παίρνουμε fixtures ΣΗΜΕΡΑ (GR timezone)
  const dayKey = getTodayKeyGR();
  const fxKey = `FIXTURES:DATE:${dayKey}`;
  const raw = await env.AIMATCHLAB_KV_CORE.get(fxKey);

  if (!raw) {
    return {
      ok: true,
      written: 0,
      reason: "no fixtures for today"
    };
  }

  let fixtures;
  try {
    fixtures = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: "invalid fixtures json"
    };
  }

  const matches = Array.isArray(fixtures.matches)
    ? fixtures.matches
    : [];

  // 2) Ενεργές λίγκες από fixtures
  const leagueSet = new Set();
  for (const m of matches) {
    if (m.leagueSlug) leagueSet.add(m.leagueSlug);
  }

  let written = 0;
  const details = [];

  // 3) Για κάθε league → standings
  for (const leagueSlug of leagueSet) {
    try {
      const standingsPayload = await fetchStandings(leagueSlug);
      if (!standingsPayload) continue;

      const season = detectSeason(standingsPayload);

      const standings =
        standingsPayload?.standings?.entries ??
        standingsPayload?.children ??
        null;

      if (!Array.isArray(standings) || standings.length === 0) continue;

      const out = {
        leagueSlug,
        season,
        source: "espn",
        updatedAt: new Date().toISOString(),
        standings: normalizeStandings(standings)
      };

      const key = `STANDINGS:CURRENT:${leagueSlug}`;

      await env.AIMATCHLAB_KV_CORE.put(
        key,
        JSON.stringify(out)
      );

      written++;
      details.push({ leagueSlug, season });
    } catch (err) {
      details.push({
        leagueSlug,
        error: err?.message || "unknown error"
      });
    }
  }

  return {
    ok: true,
    written,
    details
  };
}

/* ================================
   ESPN HELPERS
================================ */

async function fetchStandings(leagueSlug) {
  const url = `${ESPN_BASE}/${leagueSlug}/standings`;
  const res = await fetch(url, { cf: { cacheTtl: 0 } });
  if (!res.ok) return null;
  return res.json();
}

function detectSeason(payload) {
  return (
    payload?.season?.year ??
    payload?.seasons?.[0]?.year ??
    payload?.league?.season?.year ??
    null
  );
}

function normalizeStandings(entries) {
  return entries.map(e => {
    const stats = e.stats || [];
    const stat = name =>
      stats.find(s => s.name === name)?.value ?? null;

    return {
      name:
        e.team?.displayName ??
        e.team?.name ??
        "Unknown",
      p: stat("gamesPlayed"),
      pts: stat("points"),
      w: stat("wins"),
      d: stat("ties"),
      l: stat("losses"),
      gf: stat("pointsFor"),
      ga: stat("pointsAgainst"),
      gd: stat("pointDifferential")
    };
  });
}

/* ================================
   DATE (EUROPE / ATHENS)
================================ */

function getTodayKeyGR() {
  const now = new Date();
  const gr = new Date(
    now.toLocaleString("en-US", {
      timeZone: "Europe/Athens"
    })
  );

  const y = gr.getFullYear();
  const m = String(gr.getMonth() + 1).padStart(2, "0");
  const d = String(gr.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}
