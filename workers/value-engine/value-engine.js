/**
 * AIMATCHLAB – VALUE ENGINE (compute-only)
 *
 * Inputs:
 * - FIXTURES:DATE:<YYYY-MM-DD> from AIMATCHLAB_KV_CORE
 * - TEAM_STATS:INDEX + TEAM_STATS:SEASON:<latest> from AIMATCHLAB_STATS
 *
 * Outputs:
 * - VALUE:STAT:<YYYY-MM-DD>:<matchId>:<market>:<side> -> JSON
 * - VALUE:ENGINE:SUMMARY:<YYYY-MM-DD>
 *
 * NOTE:
 * This worker is ONLY correct if it can read TEAM_STATS keys from AIMATCHLAB_STATS.
 */

const BUILD_TAG = "VALUE_ENGINE_BUILD_2026-01-24_HARD_RESET_V1";
const TZ = "Europe/Athens";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json;charset=UTF-8" },
  });
}

async function kvGetRaw(kv, key) {
  try {
    return await kv.get(key);
  } catch (e) {
    return null;
  }
}

async function kvGetJsonSafe(kv, key) {
  try {
    const obj = await kv.get(key, { type: "json" });
    return obj ?? null;
  } catch (e) {
    const raw = await kvGetRaw(kv, key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

async function kvPutJson(kv, key, obj) {
  await kv.put(key, JSON.stringify(obj));
}

function dayKeyGR() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }))
    .toISOString()
    .slice(0, 10);
}

// ========= ENGINE CORE =========

async function loadTeamStatsLatest(env) {
  if (!env.AIMATCHLAB_STATS) {
    return { ok: false, reason: "missing_binding_AIMATCHLAB_STATS", latest: null, stats: null };
  }

  // Try multiple possible index key variants (fixes whitespace/newline poison)
  const INDEX_KEYS = [
    "TEAM_STATS:INDEX",
    "TEAM_STATS:INDEX\n",
    "TEAM_STATS:INDEX\r",
    "TEAM_STATS:INDEX\r\n",
    "TEAM_STATS:INDEX ",
    "TEAM_STATS:INDEX\t",
  ];

  let idx = null;
  let usedKey = null;

  for (const k of INDEX_KEYS) {
    const v = await kvGetJsonSafe(env.AIMATCHLAB_STATS, k);
    if (v && v.latest) {
      idx = v;
      usedKey = k;
      break;
    }
  }

  if (!idx || !idx.latest) {
    return {
      ok: false,
      reason: "missing_index",
      latest: null,
      stats: null,
      debug: {
        tried: INDEX_KEYS,
        found: null,
      },
    };
  }

  const latest = String(idx.latest).trim();
  const seasonKey = `TEAM_STATS:SEASON:${latest}`;

  const payload = await kvGetJsonSafe(env.AIMATCHLAB_STATS, seasonKey);
  if (!payload || !payload.leagues) {
    return {
      ok: false,
      reason: "missing_season_payload",
      latest,
      stats: null,
      debug: { usedIndexKey: usedKey, seasonKey },
    };
  }

  return {
    ok: true,
    reason: "ok",
    latest,
    stats: payload,
    debug: { usedIndexKey: usedKey, seasonKey },
  };
}

async function loadFixturesForDay(env, day) {
  if (!env.AIMATCHLAB_KV_CORE) return [];
  const data = await env.AIMATCHLAB_KV_CORE.get(`FIXTURES:DATE:${day}`, { type: "json" });
  return data?.matches || [];
}

function mapEspnLeagueToFD(leagueSlug) {
  if (leagueSlug === "eng.1") return "E0";
  if (leagueSlug === "eng.2") return "E1";
  if (leagueSlug === "eng.3") return "E2";
  if (leagueSlug === "eng.4") return "E3";

  if (leagueSlug === "gre.1") return "G1";
  if (leagueSlug === "esp.1") return "SP1";
  if (leagueSlug === "ita.1") return "I1";
  if (leagueSlug === "ger.1") return "D1";
  if (leagueSlug === "fra.1") return "F1";

  return null;
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function confidenceLabel(score01) {
  if (score01 >= 0.72) return "HIGH";
  if (score01 >= 0.62) return "MEDIUM";
  return "LOW";
}

function round2(x) {
  return Math.round(Number(x) * 100) / 100;
}

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

async function runEngine(env, day) {
  const ts = await loadTeamStatsLatest(env);
  if (!ts.ok) {
    return {
      ok: false,
      reason: ts.reason,
      latest: ts.latest,
      produced: 0,
      note: "TEAM_STATS not ready. Ensure TEAM_STATS:INDEX + TEAM_STATS:SEASON:<latest> exist in AIMATCHLAB_STATS.",
      build: BUILD_TAG,
    };
  }

  const fixtures = await loadFixturesForDay(env, day);
  if (!fixtures.length) {
    return { ok: true, day, latest: ts.latest, produced: 0, reason: "no_fixtures", build: BUILD_TAG };
  }

  const leagues = ts.stats.leagues || {};
  let produced = 0;

  for (const m of fixtures) {
    if (!m || m.status !== "PRE") continue;

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

    const bttsScore = calcBTTSScore(homeStats, awayStats);
    const over25Score = calcOver25Score(homeStats, awayStats);

    const recBTTS = {
      type: "value-pick",
      engine: "stats-only-v1",
      build: BUILD_TAG,
      date: day,
      matchId: String(m.id),
      leagueSlug,
      home: homeName,
      away: awayName,
      market: "BTTS",
      side: "YES",
      score: round2(bttsScore),
      confidence: confidenceLabel(bttsScore),
      createdAtMs: Date.now(),
      status: "PRE",
    };
    await kvPutJson(env.AIMATCHLAB_KV_CORE, pickKey(day, m.id, "BTTS", "YES"), recBTTS);
    produced++;

    const recO25 = {
      type: "value-pick",
      engine: "stats-only-v1",
      build: BUILD_TAG,
      date: day,
      matchId: String(m.id),
      leagueSlug,
      home: homeName,
      away: awayName,
      market: "Over 2.5",
      side: "YES",
      score: round2(over25Score),
      confidence: confidenceLabel(over25Score),
      createdAtMs: Date.now(),
      status: "PRE",
    };
    await kvPutJson(env.AIMATCHLAB_KV_CORE, pickKey(day, m.id, "O25", "YES"), recO25);
    produced++;
  }

  await kvPutJson(env.AIMATCHLAB_KV_CORE, `VALUE:SUMMARY:${day}`, {
    ok: true,
    date: day,
    produced,
    latestTeamStatsSeason: ts.latest,
    build: BUILD_TAG,
    updatedAtMs: Date.now(),
  });

  return { ok: true, day, latest: ts.latest, produced, build: BUILD_TAG };
}

// ========= ROUTES =========

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/" || url.pathname === "") {
      return json({
        ok: true,
        service: "aimatchlab-value-engine",
        build: BUILD_TAG,
        hasStatsBinding: !!env.AIMATCHLAB_STATS,
        hasCoreBinding: !!env.AIMATCHLAB_KV_CORE,
      });
    }

    // ---- HARD DEBUG: list keys from stats binding ----
    if (url.pathname === "/internal/debug/kv-sanity") {
      try {
        const listTeam = await env.AIMATCHLAB_STATS.list({ prefix: "TEAM_STATS:" });
        const rawIndex = await kvGetRaw(env.AIMATCHLAB_STATS, "TEAM_STATS:INDEX");
        const jsonIndex = await kvGetJsonSafe(env.AIMATCHLAB_STATS, "TEAM_STATS:INDEX");

        return json({
          ok: true,
          build: BUILD_TAG,
          envHasStats: !!env.AIMATCHLAB_STATS,
          teamKeysCount: listTeam.keys?.length || 0,
          teamKeys: (listTeam.keys || []).map((k) => k.name),
          rawIndex,
          rawIndexType: typeof rawIndex,
          jsonIndex,
        });
      } catch (err) {
        return json({ ok: false, build: BUILD_TAG, error: String(err?.message || err) }, 500);
      }
    }

    if (url.pathname === "/internal/debug/kv-index") {
      try {
        const rawText = await env.AIMATCHLAB_STATS.get("TEAM_STATS:INDEX");
        let jsonParsed = null;
        let jsonErr = null;

        try {
          jsonParsed = await env.AIMATCHLAB_STATS.get("TEAM_STATS:INDEX", { type: "json" });
        } catch (e) {
          jsonErr = String(e?.message || e);
        }

        return json({
          ok: true,
          build: BUILD_TAG,
          key: "TEAM_STATS:INDEX",
          rawText,
          rawTextType: typeof rawText,
          jsonParsed,
          jsonErr,
        });
      } catch (err) {
        return json({ ok: false, build: BUILD_TAG, error: String(err?.message || err) }, 500);
      }
    }

    if (url.pathname === "/internal/team-stats") {
      const ts = await loadTeamStatsLatest(env);
      return json({ ...ts, build: BUILD_TAG });
    }

    if (url.pathname === "/internal/run") {
      const day = url.searchParams.get("date") || dayKeyGR();
      const out = await runEngine(env, day);
      return json(out);
    }

    return json({ ok: false, error: "not_found", build: BUILD_TAG }, 404);
  },
};
