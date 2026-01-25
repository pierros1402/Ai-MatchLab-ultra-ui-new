/**
 * AIMATCHLAB – VALUE ENGINE (compute-only)
 *
 * Inputs:
 * - FIXTURES:DATE:<YYYY-MM-DD> from AIMATCHLAB_KV_CORE
 * - TEAM_STATS:INDEX + TEAM_STATS:SEASON:<latest> from AIMATCHLAB_STATS
 *
 * Outputs:
 * - VALUE:STAT:<YYYY-MM-DD>:<matchId>:<market>:<side> -> JSON
 * - VALUE:SUMMARY:<YYYY-MM-DD> (optional lightweight)
 *
 * Notes:
 * - No cron here. Called by scheduler/value-worker.
 * - Safe when team stats missing (will return ok:false).
 */

const TZ = "Europe/Athens";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ----------------------------
// KV helpers
// ----------------------------
async function kvGetJson(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function kvPutJson(kv, key, obj) {
  await kv.put(key, JSON.stringify(obj));
}

// ----------------------------
// TEAM STATS loader
// ----------------------------
async function loadTeamStatsLatest(env) {
  if (!env.AIMATCHLAB_STATS) {
    return { ok: false, reason: "missing_binding_AIMATCHLAB_STATS", latest: null, stats: null };
  }

  const idx = await kvGetJson(env.AIMATCHLAB_STATS, "TEAM_STATS:INDEX");
  if (!idx || !idx.latest) {
    return { ok: false, reason: "missing_index", latest: null, stats: null };
  }

  const latest = String(idx.latest);
  const seasonKey = `TEAM_STATS:SEASON:${latest}`;

  const payload = await kvGetJson(env.AIMATCHLAB_STATS, seasonKey);
  if (!payload || !payload.leagues) {
    return { ok: false, reason: "missing_season_payload", latest, stats: null };
  }

  return { ok: true, reason: "ok", latest, stats: payload };
}

// ----------------------------
// FIXTURES loader
// ----------------------------
async function loadFixturesForDay(env, day) {
  const data = await env.AIMATCHLAB_KV_CORE.get(`FIXTURES:DATE:${day}`, { type: "json" });
  return data?.matches || [];
}

// ----------------------------
// Basic mapping ESPN league -> Football-Data code
// (Expand later; for now safe subset)
function mapEspnLeagueToFD(leagueSlug) {
  // England
  if (leagueSlug === "eng.1") return "E0";
  if (leagueSlug === "eng.2") return "E1";
  if (leagueSlug === "eng.3") return "E2";
  if (leagueSlug === "eng.4") return "E3";

  // Greece
  if (leagueSlug === "gre.1") return "G1";

  // Spain
  if (leagueSlug === "esp.1") return "SP1"; // depends on your CSV naming, adjust if needed

  // Italy
  if (leagueSlug === "ita.1") return "I1";

  // Germany
  if (leagueSlug === "ger.1") return "D1";

  // France
  if (leagueSlug === "fra.1") return "F1";

  return null;
}

function dayKeyGR() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }))
    .toISOString()
    .slice(0, 10);
}

// ----------------------------
// Picking rules (Phase 1)
// ----------------------------

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function confidenceLabel(score01) {
  if (score01 >= 0.72) return "HIGH";
  if (score01 >= 0.62) return "MEDIUM";
  return "LOW";
}

// We assume TEAM_STATS schema per team contains:
// btts_rate, over25_rate, goals_for_avg, goals_against_avg, matches_used
function calcBTTSScore(home, away) {
  const a = Number(home?.btts_rate ?? 0);
  const b = Number(away?.btts_rate ?? 0);
  return clamp01((a + b) / 2);
}

function calcOver25Score(home, away) {
  const a = Number(home?.over25_rate ?? 0);
  const b = Number(away?.over25_rate ?? 0);
  return clamp01((a + b) / 2);
}

function pickKey(day, matchId, market, side) {
  return `VALUE:STAT:${day}:${matchId}:${market}:${side}`;
}

// ----------------------------
// Engine run
// ----------------------------
async function runEngine(env, day) {
  const ts = await loadTeamStatsLatest(env);
  if (!ts.ok) {
    return {
      ok: false,
      reason: ts.reason,
      latest: ts.latest,
      produced: 0,
      note: "TEAM_STATS not ready yet. Run KV loader to write TEAM_STATS:INDEX and TEAM_STATS:SEASON:<latest>."
    };
  }

  const fixtures = await loadFixturesForDay(env, day);
  if (!fixtures.length) {
    return { ok: true, day, latest: ts.latest, produced: 0, reason: "no_fixtures" };
  }

  let produced = 0;

  // TEAM_STATS payload layout:
  // { season: "2025-2026", leagues: { "E0": { "Team": {..stats..} } } }
  const leagues = ts.stats.leagues || {};

  for (const m of fixtures) {
    // Only PRE matches are picks
    if (m.status !== "PRE") continue;

    const leagueSlug = m.leagueSlug || m.league || null;
    const fdCode = mapEspnLeagueToFD(leagueSlug);
    if (!fdCode) continue;

    const leagueTeams = leagues[fdCode];
    if (!leagueTeams) continue;

    const homeName = m.home;
    const awayName = m.away;
    if (!homeName || !awayName) continue;

    const homeStats = leagueTeams[homeName] || null;
    const awayStats = leagueTeams[awayName] || null;

    if (!homeStats || !awayStats) continue;

    // Basic picks
    const bttsScore = calcBTTSScore(homeStats, awayStats);
    const over25Score = calcOver25Score(homeStats, awayStats);

    // Thresholds (Phase 1)
    // We keep LOW also (so UI can filter), but you can decide to store only MED/HIGH.
    const bttsConf = confidenceLabel(bttsScore);
    const o25Conf = confidenceLabel(over25Score);

    // Write BTTS YES
    const recBTTS = {
      type: "value-pick",
      engine: "stats-only-v1",
      date: day,
      matchId: String(m.id),
      leagueSlug: leagueSlug,
      home: homeName,
      away: awayName,
      market: "BTTS",
      side: "YES",
      score: round2(bttsScore),
      confidence: bttsConf,
      createdAtMs: Date.now(),
      status: "PRE"
    };

    await kvPutJson(env.AIMATCHLAB_KV_CORE, pickKey(day, m.id, "BTTS", "YES"), recBTTS);
    produced++;

    // Write OVER 2.5 YES
    const recO25 = {
      type: "value-pick",
      engine: "stats-only-v1",
      date: day,
      matchId: String(m.id),
      leagueSlug: leagueSlug,
      home: homeName,
      away: awayName,
      market: "Over 2.5",
      side: "YES",
      score: round2(over25Score),
      confidence: o25Conf,
      createdAtMs: Date.now(),
      status: "PRE"
    };

    await kvPutJson(env.AIMATCHLAB_KV_CORE, pickKey(day, m.id, "O25", "YES"), recO25);
    produced++;
  }

  // Optional summary
  await kvPutJson(env.AIMATCHLAB_KV_CORE, `VALUE:ENGINE:SUMMARY:${day}`, {
    ok: true,
    date: day,
    produced,
    latestTeamStatsSeason: ts.latest,
    updatedAtMs: Date.now()
  });

  return { ok: true, day, latest: ts.latest, produced };
}

function round2(x) {
  return Math.round(Number(x) * 100) / 100;
}

// ----------------------------
// Worker entry
// ----------------------------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/internal/run") {
      const day = url.searchParams.get("date") || dayKeyGR();
      const out = await runEngine(env, day);
      return json(out);
    }

    if (url.pathname === "/internal/team-stats") {
      const ts = await loadTeamStatsLatest(env);
      return json(ts);
    }

    return json({ ok: false, error: "not_found" }, 404);
  }
};
