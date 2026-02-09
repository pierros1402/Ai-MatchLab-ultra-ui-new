// DETAILS ENGINE MODULE (AIML_DETAILS_CACHE + R2_INTEL)
// Place in: modules/detailsEngine.js

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
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
  if (["FT","FINAL","FINISHED"].includes(st)) return 86400;
  if (["LIVE","IN_PLAY","STATUS_IN_PROGRESS","POST"].includes(st)) return 90;
  return 900;
};

const buildStandardQuestions = () => ([
  { id:"context", title:"Context Snapshot", a:{ bullets:["Baseline intel record.","Awaiting enrichment."] } },
  { id:"paths", title:"Market Paths", a:{ home:["Early goal"], draw:["Low-event"], away:["Transitions"] } },
]);

const buildHybrid = () => ({
  dna:["Tempo:MED","Control:NEU","Volatility:MED"],
  winPaths:{ home:["Early goal"], draw:["Low-event"], away:["Late pressure"] },
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
      leagueSlug:match.leagueSlug ?? ctx.league ?? null,
      kickoff_ms:safeNum(match.kickoff_ms),
      status:match.status ?? null,
      scoreHome: scheduled ? null : safeNum(match.scoreHome),
      scoreAway: scheduled ? null : safeNum(match.scoreAway),
    },
    hybrid: buildHybrid(),
    standardQuestions: buildStandardQuestions(),
    facts:{ standings:null, absences:null },
    live:{ stats:null, intel:null },
    meta:{ lastCheckedAt:null, checkCooldownSec:null, payloadHash:null },
  };
};

const r2GetJsonSafe = async (env, key) => {
  try {
    if (!env?.R2_INTEL) return { ok:false };
    const obj = await env.R2_INTEL.get(key);
    if (!obj) return { ok:false };
    return { ok:true, data: JSON.parse(await obj.text()) };
  } catch {
    return { ok:false };
  }
};

const enrichFactsFromR2 = async ({ env, league, season, matchId }) => {
  const standingsKey = `intel/standings/${league}/${season}/latest.json`;
  const absKey = `intel/match/${matchId}/latest.json`;

  const [st, ab] = await Promise.all([
    r2GetJsonSafe(env, standingsKey),
    r2GetJsonSafe(env, absKey),
  ]);

  return {
    standings: st.ok ? st.data : null,
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
      intel: data.live_intel || null
    };
  } catch {
    return null;
  }
}

async function handleMatchDetails(req, url, env) {
  const id = url.searchParams.get("id");
  if (!id) return json({ok:false,error:"missing_query_param"},400);

  const league = url.searchParams.get("league") || "_unknown";
  const season = url.searchParams.get("season") || "2025-2026";
  const key = kvKeyForMatch(id);

  let cached = null;
  try { cached = await env.AIML_DETAILS_CACHE.get(key, "json"); } catch {}

  if (cached?.ok) {
    cached.cache = "HIT";
    cached.facts = await enrichFactsFromR2({ env, league, season, matchId:id });
    cached.live = await fetchLiveLayer(id) || { stats:null, intel:null };
    cached.meta.lastCheckedAt = nowIso();
    return json(cached);
  }

  const base = buildDetailsPayload(id,{ league, season });
  base.meta.payloadHash = stableHash(base);
  base.meta.checkCooldownSec = computeCooldownSeconds({ status: base.basic.status });

  base.facts = await enrichFactsFromR2({ env, league, season, matchId:id });
  base.live = await fetchLiveLayer(id) || { stats:null, intel:null };

  if (base.basic?.home) {
    await env.AIML_DETAILS_CACHE.put(key, JSON.stringify(base), { expirationTtl: 60*60*24*30 });
  }

  return json(base);
}

async function handleSeed(req, env) {
  const body = await req.json().catch(()=>null);
  const id = String(body?.id || body?.matchId || "").trim();
  if (!id) return json({ok:false,error:"missing_id"},400);

  const league = body?.leagueSlug || body?.league || "_unknown";
  const season = body?.season || "2025-2026";
  const key = kvKeyForMatch(id);

  const payload = buildDetailsPayload(id,{ league, season, match: body });
  payload.cache="SEED";
  payload.ts=Date.now();

  await env.AIML_DETAILS_CACHE.put(key, JSON.stringify(payload), { expirationTtl: 60*60*24*30 });

  return json(payload);
}

export async function handleDetails(req, env) {
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname.endsWith("/seed")) {
    return handleSeed(req, env);
  }

  if (req.method === "GET") {
    return handleMatchDetails(req, url, env);
  }

  return json({ok:false,error:"not_allowed"},405);
}
