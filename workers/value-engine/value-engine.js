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
  // Football-Data league codes (TEAM_STATS.leagues keys)
  // Keep this small + explicit; anything else can fall back to cross-league lookup.
  if (!leagueSlug) return null;

  // England
  if (leagueSlug === "eng.1") return "E0";
  if (leagueSlug === "eng.2") return "E1";
  if (leagueSlug === "eng.3") return "E2";
  if (leagueSlug === "eng.4") return "E3";

  // Scotland
  if (leagueSlug === "sco.1") return "SC0";
  if (leagueSlug === "sco.2") return "SC1";

  // Greece
  if (leagueSlug === "gre.1") return "G1";

  // Spain
  if (leagueSlug === "esp.1") return "SP1";
  if (leagueSlug === "esp.2") return "SP2";

  // Italy
  if (leagueSlug === "ita.1") return "I1";
  if (leagueSlug === "ita.2") return "I2";

  // Germany
  if (leagueSlug === "ger.1") return "D1";
  if (leagueSlug === "ger.2") return "D2";

  // France
  if (leagueSlug === "fra.1") return "F1";
  if (leagueSlug === "fra.2") return "F2";

  // Netherlands
  if (leagueSlug === "ned.1") return "N1";

  // Portugal
  if (leagueSlug === "por.1") return "P1";

  // Belgium
  if (leagueSlug === "bel.1") return "B1";

  // Turkey
  if (leagueSlug === "tur.1") return "T1";

  return null;
}

// Domestic cups / super cups / trophies / friendlies to exclude (per your LEAGUE_SEEDS)
const EXCLUDED_LEAGUE_SLUGS = new Set([
  "eng.fa",
  "eng.league_cup",
  "eng.trophy",
  "esp.copa_del_rey",
  "esp.super_cup",
  "ita.coppa_italia",
  "fra.coupe_de_france",
  "fra.super_cup",
  "sco.challenge",
  "ned.cup",
  "por.taca.portugal",
  "club.friendly",
]);

function isExcludedLeague(leagueSlug) {
  if (!leagueSlug) return false;
  if (EXCLUDED_LEAGUE_SLUGS.has(leagueSlug)) return true;
  // safety: friendlies often appear with "friendly"
  if (String(leagueSlug).includes("friendly")) return true;
  return false;
}

function normTeamName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// cache: fdCode -> Map(normalizedName -> originalKey)
const _normLeagueKeyCache = new Map();
function getNormMapForLeague(leagueTeams) {
  if (!leagueTeams || typeof leagueTeams !== "object") return null;
  // leagueTeams is object keyed by teamName, values stats
  const cacheKey = leagueTeams; // object identity
  if (_normLeagueKeyCache.has(cacheKey)) return _normLeagueKeyCache.get(cacheKey);

  const m = new Map();
  for (const k of Object.keys(leagueTeams)) {
    m.set(normTeamName(k), k);
  }
  _normLeagueKeyCache.set(cacheKey, m);
  return m;
}

function findTeamStatsInLeague(leagueTeams, homeName, awayName) {
  if (!leagueTeams) return null;

  // exact first
  const h0 = leagueTeams[homeName] || null;
  const a0 = leagueTeams[awayName] || null;
  if (h0 && a0) return { homeStats: h0, awayStats: a0 };

  const nm = getNormMapForLeague(leagueTeams);
  if (!nm) return null;

  const hk = nm.get(normTeamName(homeName));
  const ak = nm.get(normTeamName(awayName));
  if (!hk || !ak) return null;

  const hs = leagueTeams[hk] || null;
  const as = leagueTeams[ak] || null;
  if (!hs || !as) return null;
  return { homeStats: hs, awayStats: as };
}

function findStatsForMatch(leagues, leagueSlug, homeName, awayName) {
  // 1) try mapped league first
  const fd = mapEspnLeagueToFD(leagueSlug);
  if (fd && leagues?.[fd]) {
    const found = findTeamStatsInLeague(leagues[fd], homeName, awayName);
    if (found) return { fdCode: fd, ...found };
  }

  // 2) fallback: search across all leagues blocks (useful when slug isn't mapped but stats exist)
  for (const fdCode of Object.keys(leagues || {})) {
    const leagueTeams = leagues[fdCode];
    const found = findTeamStatsInLeague(leagueTeams, homeName, awayName);
    if (found) return { fdCode, ...found };
  }

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

  let producedPicks = 0;       // number of written pick records (BTTS + O25 per match)
  let producedMatches = 0;     // number of matches that produced at least one pick-set
  let totalPRE = 0;

  let skippedExcludedLeague = 0;
  let skippedNoTeams = 0;
  let skippedNoStats = 0;

  for (const m of fixtures) {
    if (!m) continue;
    if (m.status !== "PRE") continue;
    totalPRE++;

    const leagueSlug = m.leagueSlug || m.league || null;
    if (isExcludedLeague(leagueSlug)) {
      skippedExcludedLeague++;
      continue;
    }

    const homeName = m.home;
    const awayName = m.away;
    if (!homeName || !awayName) {
      skippedNoTeams++;
      continue;
    }

    const found = findStatsForMatch(leagues, leagueSlug, homeName, awayName);
    if (!found) {
      skippedNoStats++;
      continue;
    }

    const { homeStats, awayStats, fdCode } = found;

    const bttsScore = calcBTTSScore(homeStats, awayStats);
    const over25Score = calcOver25Score(homeStats, awayStats);

    const recBTTS = {
      type: "value-pick",
      engine: "stats-only-v1",
      build: BUILD_TAG,
      date: day,
      matchId: String(m.id),
      leagueSlug,
      fdCode,
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
    producedPicks++;

    const recO25 = {
      type: "value-pick",
      engine: "stats-only-v1",
      build: BUILD_TAG,
      date: day,
      matchId: String(m.id),
      leagueSlug,
      fdCode,
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
    producedPicks++;

    producedMatches++;
  }

  const summary = {
    ok: true,
    date: day,
    build: BUILD_TAG,
    updatedAtMs: Date.now(),
    latestTeamStatsSeason: ts.latest,

    // debug / transparency (so we know why it becomes 0)
    totalMatchesInFixtures: Array.isArray(fixtures) ? fixtures.length : 0,
    totalPRE,
    producedMatches,
    producedPicks,
    skippedExcludedLeague,
    skippedNoTeams,
    skippedNoStats,
  };

  await kvPutJson(env.AIMATCHLAB_KV_CORE, `VALUE:SUMMARY:${day}`, summary);

  return { ok: true, day, latest: ts.latest, ...summary };
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
