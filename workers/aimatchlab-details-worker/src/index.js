/**
 * AIMatchLab Details Worker
 * Version: 3.1.0
 * Created: 2026-02-07
 * Phase: DETAILS-LIVE-INTEGRATED
 */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

const corsHeaders = (req) => ({
  "access-control-allow-origin": req?.headers?.get("Origin") || "*",
  "access-control-allow-methods": "GET,OPTIONS,POST",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
  "vary": "Origin",
});

const kvKeyForMatch = (id) => `DETAILS:match:${String(id)}`;
const nowIso = () => new Date().toISOString();
const safeNum = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

const stableHash = (obj) => {
  const s = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return String(h);
};

const computeCooldownSeconds = ({ status }) => {
  const st = String(status || "").toUpperCase();
  if (["FT","FINAL","FINISHED"].includes(st)) return 24 * 60 * 60;
  if (["LIVE","IN_PLAY","STATUS_IN_PROGRESS","POST"].includes(st)) return 90;
  return 15 * 60;
};

const buildStandardQuestions = () => ([
  { id:"context", title:"Context Snapshot", q:"What is the match context?", a:{ bullets:["Baseline intel record.","Awaiting enrichment."] } },
  { id:"paths", title:"Market Paths (1/X/2)", q:"Plausible paths", a:{ home:["Early goal"], draw:["Low-event"], away:["Transitions"] } },
  { id:"risk", title:"Risk & Volatility", q:"Risk", a:{ upset:45, draw:40, volatility:"MED" } },
  { id:"triggers", title:"Key Triggers", q:"Triggers", a:{ bullets:["First goal","Red card","Absences"] } },
  { id:"value", title:"Value Notes", q:"Value", a:{ bullets:["Avoid incomplete intel","Prefer confirmed edges"] } },
]);

const buildHybrid = () => ({
  dna:["Tempo:MED","Control:NEU","Volatility:MED"],
  winPaths:{ home:["Early goal"], draw:["Low-event"], away:["Late pressure"] },
  risk:{ upset:45, draw:40 },
  insights:["Baseline only (not enriched yet)."],
});

const buildDetailsPayload = (id, ctx = {}) => {
  const match = ctx.match || {};
  const scheduled = String(match.status||"").toUpperCase().includes("SCHEDULED") ||
                    String(match.status||"").toUpperCase().includes("PRE");
  return {
    ok:true,
    id:String(id),
    cache:"MISS",
    ts:Date.now(),
    basic:{
      home:match.home ?? null,
      away:match.away ?? null,
      league:match.leagueName ?? null,
      leagueSlug:match.leagueSlug ?? ctx.league ?? null,
      kickoff_ms:safeNum(match.kickoff_ms),
      status:match.status ?? null,
      scoreHome: scheduled ? null : safeNum(match.scoreHome),
      scoreAway: scheduled ? null : safeNum(match.scoreAway),
    },
    hybrid: buildHybrid(),
    standardQuestions: buildStandardQuestions(),
    extras:{ venue:null, referee:null, absences:[], lineups:null, weather:null },
    facts:{ standings:null, referees:null, absences:null, sources:{} },
    live:{ stats:null, intel:null, source:null },
    meta:{ lastCheckedAt:null, nextCheckAt:null, checkCooldownSec:null, changed:false, diff:[], payloadHash:null },
  };
};

const r2GetJsonSafe = async (env, key) => {
  try {
    if (!env?.AIMATCHLAB_INTEL) return { ok:false };
    const obj = await env.AIMATCHLAB_INTEL.get(key);
    if (!obj) return { ok:false };
    return { ok:true, data: JSON.parse(await obj.text()) };
  } catch {
    return { ok:false };
  }
};

const enrichFactsFromR2 = async ({ env, league, season, matchId }) => {
  const standingsKey = `intel/standings/${league}/${season}/latest.json`;
  const refereesKey = `referees/index.json`;
  const absKey = `intel/match/${matchId}/latest.json`;

  const [st, rf, ab] = await Promise.all([
    r2GetJsonSafe(env, standingsKey),
    r2GetJsonSafe(env, refereesKey),
    r2GetJsonSafe(env, absKey),
  ]);

  return {
    standings: st.ok ? st.data : null,
    referees: rf.ok ? rf.data : null,
    absences: ab.ok ? ab.data : null,
  };
};

async function fetchLiveLayer(id) {
  try {
    const res = await fetch(`https://aiml-live-match-worker.pierros1402.workers.dev/api/match-live?id=${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    return {
      stats: data.stats || null,
      intel: data.live_intel || null,
      source: "aiml-live-match-worker"
    };
  } catch {
    return null;
  }
}

const handleMatchDetails = async (req, url, env) => {
  const id = url.searchParams.get("id");
  if (!id) return json({ok:false,error:"missing_query_param"},400,corsHeaders(req));

  const league = url.searchParams.get("league") || "_unknown";
  const season = url.searchParams.get("season") || "2025-2026";
  const key = kvKeyForMatch(id);

  let cached = null;
  try { cached = await env.AIMATCHLAB_DETAILS.get(key, "json"); } catch {}

  if (cached?.ok) {
    cached.cache = "HIT";
    cached.facts = await enrichFactsFromR2({ env, league, season, matchId:id });
    cached.live = await fetchLiveLayer(id) || { stats:null, intel:null, source:null };
    cached.meta.lastCheckedAt = nowIso();
    return json(cached,200,corsHeaders(req));
  }

  const base = buildDetailsPayload(id,{ league, season });
  base.meta.payloadHash = stableHash(base);
  base.meta.checkCooldownSec = computeCooldownSeconds({ status: base.basic.status });

  base.facts = await enrichFactsFromR2({ env, league, season, matchId:id });
  base.live = await fetchLiveLayer(id) || { stats:null, intel:null, source:null };

  if (base.basic?.home) {
    await env.AIMATCHLAB_DETAILS.put(key, JSON.stringify(base), { expirationTtl: 60*60*24*30 });
  }

  return json(base,200,corsHeaders(req));
};

const handleSeed = async (req, env) => {
  const body = await req.json().catch(()=>null);
  const id = String(body?.id || body?.matchId || "").trim();
  if (!id) return json({ok:false,error:"missing_id"},400,corsHeaders(req));
  const league = body?.leagueSlug || body?.league || "_unknown";
  const season = body?.season || "2025-2026";
  const key = kvKeyForMatch(id);

  const payload = buildDetailsPayload(id,{ league, season, match: body });
  payload.cache="SEED"; payload.ts=Date.now();
  await env.AIMATCHLAB_DETAILS.put(key, JSON.stringify(payload), { expirationTtl: 60*60*24*30 });
  return json(payload,200,corsHeaders(req));
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders(req)});
    if (url.pathname==="/" || url.pathname==="/health") return json({ok:true,service:"aimatchlab-details-worker",version:"3.1.0"},200,corsHeaders(req));
    if (req.method==="POST" && url.pathname==="/v1/match/details/seed") return handleSeed(req, env);
    if (req.method==="GET" && url.pathname==="/v1/match/details") return handleMatchDetails(req, url, env);
    return json({ok:false,error:"not_found"},404,corsHeaders(req));
  }
};
