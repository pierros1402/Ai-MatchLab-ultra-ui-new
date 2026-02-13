/**
 * AIMATCHLAB – LIVE ENGINE (EXTENDED STATS)
 * Adds basic live statistics into FIXTURES bucket
 */

const VERSION = "3.0.0-live-stats-extended";

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

function pickTeam(competitors, side) {
  const arr = Array.isArray(competitors) ? competitors : [];
  return arr.find(c => (c?.homeAway || "").toLowerCase() === side);
}

function extractStat(stats, name) {
  const s = Array.isArray(stats) ? stats.find(x => x?.name === name) : null;
  return s ? Number(s.displayValue || s.value || 0) : 0;
}

async function fetchEspnAllScoreboard() {
  const api = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard";
  const res = await fetch(api, { cf: { cacheTtl: 20, cacheEverything: true }});
  const txt = await res.text();
  return safeJsonParse(txt);
}

function extractLiveMatches(scoreboardJson) {

  const events = Array.isArray(scoreboardJson?.events)
    ? scoreboardJson.events
    : [];

  const out = [];

  for (const ev of events) {

    const comp = Array.isArray(ev?.competitions) ? ev.competitions[0] : null;
    if (!comp) continue;

    const state = String(comp?.status?.type?.state || "").toLowerCase();
    if (state !== "in" && state !== "post") continue;

    const competitors = comp?.competitors || [];
    const homeObj = pickTeam(competitors, "home");
    const awayObj = pickTeam(competitors, "away");

    if (!homeObj || !awayObj) continue;

    const statsHome = homeObj.statistics || [];
    const statsAway = awayObj.statistics || [];

    out.push({
      id: String(ev?.id),
      status: state === "in" ? "STATUS_IN_PROGRESS" : "STATUS_FINAL",
      scoreHome: Number(homeObj.score || 0),
      scoreAway: Number(awayObj.score || 0),
      minute: comp?.status?.displayClock || null,
      liveStats: {
        shotsHome: extractStat(statsHome, "shotsTotal"),
        shotsAway: extractStat(statsAway, "shotsTotal"),
        shotsOnTargetHome: extractStat(statsHome, "shotsOnTarget"),
        shotsOnTargetAway: extractStat(statsAway, "shotsOnTarget"),
        possessionHome: extractStat(statsHome, "possessionPct"),
        possessionAway: extractStat(statsAway, "possessionPct"),
        cornersHome: extractStat(statsHome, "cornerKicks"),
        cornersAway: extractStat(statsAway, "cornerKicks"),
        cardsHome: extractStat(statsHome, "yellowCards"),
        cardsAway: extractStat(statsAway, "yellowCards")
      }
    });
  }

  return out;
}

async function mergeLiveIntoFixtures(env, liveMatches) {

  if (!env?.AIML_INGESTION_KV) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dayKey = `FIXTURES:DATE:${y}-${m}-${d}`;

  const raw = await env.AIML_INGESTION_KV.get(dayKey);
  if (!raw) return;

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.matches)) return;

  let changed = false;

  for (const live of liveMatches) {

    const f = parsed.matches.find(x => String(x.id) === String(live.id));
    if (!f) continue;

    f.status = live.status;
    f.scoreHome = live.scoreHome;
    f.scoreAway = live.scoreAway;
    f.minute = live.minute;
    f.liveStats = live.liveStats;

    changed = true;
  }

  if (changed) {
    await env.AIML_INGESTION_KV.put(dayKey, JSON.stringify(parsed));
  }
}

export async function handleLive(req, env) {

  if (req.method !== "GET") {
    return json({ ok:false, error:"method_not_allowed" }, 405);
  }

  const scoreboard = await fetchEspnAllScoreboard();
  if (!scoreboard) return json({ ok:false, error:"fetch_failed" }, 500);

  const matches = extractLiveMatches(scoreboard);
  await mergeLiveIntoFixtures(env, matches);

  return json({
    ok:true,
    version: VERSION,
    matches
  });
}