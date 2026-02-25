/* =========================================================
   AIMATCHLAB ULTRA — LIVE PANEL FINAL (PRODUCTION STABLE)
========================================================= */

/* ================= LIVE PANEL BOOT ================= */

(function(){

  function waitUntilReady(){

    const busReady =
      typeof window.on === "function" &&
      typeof window.emit === "function";

    const panel =
      document.querySelector(".intelligence-panel.live-panel");

    if(!busReady || !panel){
      setTimeout(waitUntilReady,100);
      return;
    }

    console.log("[LIVE PANEL] BOOT OK");

    initLivePanel(panel);
  }

  waitUntilReady();

})();

function initLivePanel(panel){

  // ✅ PREVENT MULTIPLE INIT (MUST BE FIRST)
  if (window.__LIVE_PANEL_LOADED__) {
    console.warn("[LIVE PANEL] already initialized");
    return;
  }
  window.__LIVE_PANEL_LOADED__ = true;

  console.log("[LIVE PANEL] ready");
  const body =
    panel.querySelector("#live-list") ||
    panel.querySelector(".panel-body") ||
    panel;  

/* ================= STATE ================= */

  const MEMORY   = new Map();
  const PRIORITY = new Map();
  const DANGER   = new Map();
  const ROWS     = new Map();
  const LEAGUES  = new Map();

  const BOOST_LIFETIME = 90000;

  // ✅ SAFE UNIQUE KEY
  const keyOf = m =>
    String(m.id ?? `${m.home}|${m.away}|${m.kickoff_ms||0}`);

  /* ================= HELPERS ================= */

  const esc = s =>
    String(s ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;");

  function normalizeStatus(m){
    return String(
      m?.status ??
      m?.status?.type?.state ??
      m?.status?.type?.name ??
      ""
    ).toUpperCase();
  }

  function isLiveStatus(st){

    if(!st) return false;

    st = String(st).toUpperCase();

    return (
      st.includes("LIVE") ||
      st.includes("IN_PROGRESS") ||
      st.includes("FIRST_HALF") ||
      st.includes("SECOND_HALF") ||
      st.includes("HALF_TIME") ||
      st.includes("EXTRA_TIME")
    );
  }

  const formatScore = m =>
    (m.scoreHome==null||m.scoreAway==null)
      ? ""
      : `${m.scoreHome}-${m.scoreAway}`;

  const getLeagueName = m =>
    m.leagueName||m.leagueSlug||m.league||"SOCCER";

  /* ================= CLOCK ================= */

  function parseMinute(raw){
    const n=parseInt(String(raw||"").replace(/[^\d]/g,""),10);
    return Number.isFinite(n)?n:null;
  }

  function minuteValue(m){

    const key = keyOf(m);
    const mem = MEMORY.get(key);

    const base = parseMinute(m.minute ?? m?.status?.displayClock);
    if(base == null) return 0;

    if(!mem?.live_ts) return base;

    return base + Math.floor((Date.now() - mem.live_ts)/60000);
  }

  /* ================= INTELLIGENCE ================= */

  function detectDanger(m){
    const minute=minuteValue(m);
    const diff=Math.abs((+m.scoreHome||0)-(+m.scoreAway||0));

    if(minute>=70 && diff===0) return 35;
    if(minute>=75 && diff===1) return 25;
    if(minute>=85) return 20;

    return 0;
  }

  function priorityScore(m){

    const key=keyOf(m);
    let score=minuteValue(m);
    const now=Date.now();

    const apply=(map)=>{
      const e=map.get(key);
      if(!e) return;

      const age=now-e.ts;
      if(age>BOOST_LIFETIME){
        map.delete(key);
        return;
      }

      score+=e.boost*(1-age/BOOST_LIFETIME);
    };

    apply(PRIORITY);
    apply(DANGER);

    return score;
  }

  function snapshot(m){
    return {
      score: formatScore(m),
      minute: parseMinute(
        m.minute ?? m?.status?.displayClock
      )
    };
  }

  function visualClass(m){
    const minute=minuteValue(m);
    const diff=Math.abs((+m.scoreHome||0)-(+m.scoreAway||0));

    if(minute>=85) return "live-critical";
    if(minute>=70 && diff===0) return "live-danger";
    if(diff===1 && minute>=60) return "live-pressure";
    return "";
  }

  /* ================= DOM HELPERS ================= */

  function getLeagueBlock(name){

    let block = LEAGUES.get(name);
    if(block) return block;

    block=document.createElement("div");
    block.className="league-block";

    const title=document.createElement("div");
    title.className="league-title";
    title.textContent=name;

    block.appendChild(title);
    body.appendChild(block);

    LEAGUES.set(name,block);

    return block;
  }

  // ✅ FIXED CLOCK (NO RESET)
  function patchRow(row,m){

    const key = keyOf(m);

    const base = parseMinute(m.minute ?? m?.status?.displayClock) ?? "";

  // keep persistent clock start
    let mem = MEMORY.get(key);

    if(!mem){
      mem = {};
      MEMORY.set(key, mem);
    }

    const newBase = base;
    const prevBase = mem.base_minute;

    if(prevBase !== newBase){
      mem.live_ts = Date.now();
      mem.base_minute = newBase;
    }

    row.className = `match-row live-row ${visualClass(m)}`;

    const minuteNow = minuteValue(m);

    row.innerHTML = `
      <div class="teams">${esc(m.home)} – ${esc(m.away)}</div>
      <div class="meta">
        <span class="live-minute"
              data-base="${base}"
              data-start="${mem.live_ts}">${minuteNow ? `${minuteNow}'` :       ""}</span>
        ${formatScore(m)}
      </div>
    `;
    }
function render(matches){

  if(!Array.isArray(matches)) return;

  // RESET VIEW
  body.innerHTML = "";
  ROWS.clear();
  LEAGUES.clear();

  const placeholder = panel.querySelector(".panel-placeholder");
  if (placeholder) placeholder.style.display = "none";

  const live = matches
    .filter(m => isLiveStatus(normalizeStatus(m)))
    .sort((a,b)=>priorityScore(b)-priorityScore(a));

  /* ================= EMPTY STATE ================= */

  if (live.length === 0) {

    body.innerHTML = `
      <div class="live-empty">
        <div class="live-empty-title">
          No matches live right now
        </div>
        <div class="live-empty-sub">
          Next kickoff monitoring active
        </div>
        <div class="live-empty-meta">
          AI tracking today's fixtures
        </div>
      </div>
    `;

    ROWS.clear();
    LEAGUES.clear();
    return;
  }

  const nextKeys = new Set(live.map(keyOf));

    // remove old rows
    for(const [k,row] of ROWS){
      if(!nextKeys.has(k)){
        row.remove();
        ROWS.delete(k);
        MEMORY.delete(k);
        PRIORITY.delete(k);
        DANGER.delete(k);
      }
    }

    // ✅ CLEAN EMPTY LEAGUES
    for (const [name, block] of LEAGUES) {
      if (block.children.length <= 1) {
        block.remove();
        LEAGUES.delete(name);
      }
    }

    for(const m of live){

      const key=keyOf(m);

      const mem = MEMORY.get(key) || {};

      const now = snapshot(m);

// ================= GOAL DETECT =================
      const goalChanged = mem.score && mem.score !== now.score;

      if(goalChanged){
        PRIORITY.set(key,{ ts:Date.now(), boost:50 });
      }

// danger boost
     const d = detectDanger(m);
     if(d>0)
       DANGER.set(key,{ ts:Date.now(), boost:d });

// ✅ MERGE instead of overwrite
      mem.score  = now.score;
      mem.minute = now.minute;

      MEMORY.set(key, mem);

      const league=getLeagueName(m);
      const block=getLeagueBlock(league);

      let row=ROWS.get(key);

      if(!row){
        row=document.createElement("div");

        row.onclick=()=>{
          window.emit("match-selected",m);
          window.emit("active-match:set",m);
        };

        ROWS.set(key,row);
        block.appendChild(row);
      }

      patchRow(row,m);

// ================= VISUAL UPDATE FLASH =================
      if(goalChanged){
        row.classList.add("updated");

        setTimeout(()=>{
          row.classList.remove("updated");
        },1200);
       }
     }
   }
  /* ================= EVENTS ================= */

  let LAST_HASH=null;

  console.log("[LIVE PANEL] binding live:update listener");
  window.__AIML_LIVE_READY = true;  
 
  window.__LIVE_RENDER = render;

  window.on("live:update",(payload)=>{
    

    if (!payload) return;

    const matches = Array.isArray(payload.matches) ? payload.matches : [];

  // ✅ ignore “empty/undefined” noise events
    if (!payload.date && matches.length === 0) return;

    if (payload.hash && payload.hash === LAST_HASH) return;
    LAST_HASH = payload.hash || null;
    
    render(matches);
  });


  /* ================= INSTANT BOOT ================= */

  function bootFromSnapshot(){
    const cached = window.__AIML_LAST_LIVE;
    if(!cached) return;

    LAST_HASH = cached.hash || null;
    render(cached.matches || []);
  }

  setTimeout(()=>{
    bootFromSnapshot();

  // retry once more after full UI mount
    setTimeout(bootFromSnapshot,300);

  },0);


  /* ================= LIVE CLOCK ENGINE ================= */
 // prevent multiple executions

  function updateLiveClocks(){
    const now = Date.now();

    document.querySelectorAll(".live-minute").forEach(el=>{
      const base  = Number(el.dataset.base);
      const start = Number(el.dataset.start);
      if(!Number.isFinite(base)||!Number.isFinite(start)) return;

      const elapsed=Math.floor((now-start)/60000);
      el.textContent=`${base+elapsed}'`;
    });
  }

  setInterval(updateLiveClocks,15000);
  updateLiveClocks();
// ----------------------------------
// replay last live snapshot
// ----------------------------------
  setTimeout(()=>{

    if (window.__LIVE_REPLAY_DONE__) return;
    window.__LIVE_REPLAY_DONE__ = true;

    if(window.__AIML_LAST_LIVE){
      console.log("[LIVE PANEL] replay snapshot");
      window.emit("live:update", window.__AIML_LAST_LIVE);
    }

  },50);
  }
