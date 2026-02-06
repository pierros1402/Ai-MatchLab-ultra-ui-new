/**
 * AIMatchLab Details Worker — Canonical Source (ESM)
 * Stable rebuild: clean scopes, no compiled artifacts.
 */

// ---------- utils ----------
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
  if (["LIVE","IN_PLAY","STATUS_IN_PROGRESS"].includes(st)) return 90;
  return 15 * 60;
};

// ---------- builders ----------
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
    meta:{ lastCheckedAt:null, nextCheckAt:null, checkCooldownSec:null, changed:false, diff:[], payloadHash:null },
  };
};

// ---------- R2 helpers ----------
const r2GetJsonSafe = async (env, key) => {
  try {
    if (!env?.AIMATCHLAB_INTEL) return { ok:false, error:"no_r2_binding", key };
    const obj = await env.AIMATCHLAB_INTEL.get(key);
    if (!obj) return { ok:false, error:"not_found", key };
    return { ok:true, key, data: JSON.parse(await obj.text()) };
  } catch (e) {
    return { ok:false, error:"r2_read_failed", key, message:String(e) };
  }
};

const buildUiHintForPlaceholder = (type) => {
  if (type==="standings") return "Standings pending enrichment.";
  if (type==="referees") return "Referee intel pending enrichment.";
  return "Data pending enrichment.";
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

  const facts = { sources:{}, standings:null, referees:null, absences:null };

  facts.sources.standings = st.ok ? {from:"r2", key:standingsKey} : {from:"r2", key:standingsKey, error:st.error};
  facts.standings = st.ok ? { ok:true, status:st.data?.status||"OK", snapshot:st.data } :
                            { ok:false, status:"MISSING", uiHint:buildUiHintForPlaceholder("standings") };

  facts.sources.referees = rf.ok ? {from:"r2", key:refereesKey} : {from:"r2", key:refereesKey, error:rf.error};
  facts.referees = rf.ok ? { ok:true, status:rf.data?.status||"OK", index:rf.data } :
                           { ok:false, status:"MISSING", uiHint:buildUiHintForPlaceholder("referees") };

  facts.sources.absences = ab.ok ? {from:"r2", key:absKey} : {from:"r2", key:absKey, error:ab.error};
  facts.absences = ab.ok ? { ok:true, status:ab.data?.status||"OK", snapshot:ab.data } :
                           { ok:false, status:"MISSING", uiHint:buildUiHintForPlaceholder("absences") };

  return facts;
};

// ---------- handlers ----------
const handleMatchDetails = async (req, url, env) => {
  const id = url.searchParams.get("id");
  if (!id) return json({ok:false,error:"missing_query_param"},400,corsHeaders(req));

  const league = url.searchParams.get("league") || "_unknown";
  const season = url.searchParams.get("season") || "2025-2026";
  const refresh = url.searchParams.get("refresh")==="1";
  const check = url.searchParams.get("check")==="1";
  const key = kvKeyForMatch(id);

  let cached = null;
  try { cached = await env.AIMATCHLAB_DETAILS.get(key, "json"); } catch {}

  // ===== Fully self-healing flow =====

  // 1️⃣ If cached exists but corrupted (no match shell) → auto-delete
  if (cached?.ok && !cached?.basic?.home) {
    await env.AIMATCHLAB_DETAILS.delete(key);
    cached = null;
  }

  // 2️⃣ If valid cached exists → start from it
  if (cached?.ok) {
    const base = { ...cached };
    base.cache = refresh || check ? "REFRESH" : "HIT";

    base.facts = await enrichFactsFromR2({ env, league, season, matchId:id });

    base.meta = base.meta || {};
    base.meta.lastCheckedAt = nowIso();
    base.meta.checkCooldownSec = computeCooldownSeconds({ status: base.basic?.status });

    await env.AIMATCHLAB_DETAILS.put(key, JSON.stringify(base), { expirationTtl: 60*60*24*30 });
    return json(base,200,corsHeaders(req));
  }

  // 3️⃣ No cached record → build transient payload
  const base = buildDetailsPayload(id,{ league, season });

  base.meta.payloadHash = stableHash(base);
  base.meta.checkCooldownSec = computeCooldownSeconds({ status: base.basic.status });

  base.facts = await enrichFactsFromR2({ env, league, season, matchId:id });

  // ❗ Do NOT persist if match shell is empty
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

// ---------- fetch ----------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders(req)});
    if (url.pathname==="/" || url.pathname==="/health") return json({ok:true,service:"aimatchlab-details-worker"},200,corsHeaders(req));
    if (req.method==="POST" && url.pathname==="/v1/match/details/seed") return handleSeed(req, env);
    if (req.method==="GET" && url.pathname==="/v1/match/details") return handleMatchDetails(req, url, env);
    return json({ok:false,error:"not_found"},404,corsHeaders(req));
  }
};
