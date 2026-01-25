/* =========================================================
   AI MatchLab ULTRA — History Viewer v2.02 (STABLE ANCHOR)
   ---------------------------------------------------------
   - Button text: "View History"
   - Hard-anchored to #right-panels-header or .right-panels-header
   - Modal overlay viewer (same style as current)
   - Reads localStorage keys: AIML_HISTORY_V1:YYYY-MM-DD:<type>
   - Load / Copy / Export JSON / Clear day / Clear all / Reload
========================================================= */

(function () {
  "use strict";
  if (window.__AIML_HISTORY_VIEWER_V202__) return;
  window.__AIML_HISTORY_VIEWER_V202__ = true;

  const PREFIX = "AIML_HISTORY_V1:";
  const BTN_ID = "btn-history-viewer";
  const OVERLAY_ID = "aiml-history-overlay";
  const STYLE_ID = "aiml-history-viewer-style";
  const ANCHOR_ATTR = "data-aiml-hv-anchor";
  const HEADER_SELECTOR = "#right-panels-header, .right-panels-header";

  // ---------- helpers ----------
  const esc = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  function safeConfirm(msg) {
    try { return confirm(msg); } catch { return false; }
  }

  function getRightRoot() {
    return (
      document.getElementById("right-panel") ||
      document.querySelector("#right-drawer") ||
      document.querySelector(".right-panel") ||
      document
    );
  }

  // ---------- style injection ----------
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      [${ANCHOR_ATTR}="1"] #${BTN_ID}{
        position:relative !important;
        top:auto !important; right:auto !important; left:auto !important; bottom:auto !important;
        transform:none !important;
        margin-left:auto !important;
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:6px !important;
        white-space:nowrap !important;
        z-index:10 !important;
        pointer-events:auto !important;
      }
      #${BTN_ID}:not(.btn-history-pill){
        background:rgba(255,255,255,0.08);
        border:1px solid rgba(255,255,255,0.20);
        border-radius:10px;
        padding:4px 10px;
        font-size:12px;
        font-weight:900;
        color:inherit;
        cursor:pointer;
      }
      #${BTN_ID}:hover{ filter:brightness(1.08); }
      #${OVERLAY_ID}{
        position:fixed; inset:0;
        background:rgba(0,0,0,0.72);
        z-index:99999;
        display:flex; align-items:center; justify-content:center;
        padding:16px;
      }
      #${OVERLAY_ID} .hv-card{
        width:min(980px,96vw);
        height:min(680px,92vh);
        background:rgba(12,14,18,0.96);
        border:1px solid rgba(255,255,255,0.12);
        border-radius:16px;
        box-shadow:0 12px 40px rgba(0,0,0,0.55);
        display:flex; flex-direction:column; overflow:hidden;
      }
      #${OVERLAY_ID} .hv-top{
        display:flex; align-items:center; justify-content:space-between;
        gap:10px; padding:12px 12px;
        border-bottom:1px solid rgba(255,255,255,0.10);
        background:rgba(255,255,255,0.03);
      }
      #${OVERLAY_ID} .hv-title{ font-weight:900; display:flex; align-items:center; gap:10px; min-width:0; }
      #${OVERLAY_ID} .hv-actions{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      #${OVERLAY_ID} select, #${OVERLAY_ID} .hv-btn{
        background:rgba(255,255,255,0.06);
        border:1px solid rgba(255,255,255,0.14);
        color:inherit;
        border-radius:10px;
        padding:6px 10px;
        font-weight:900;
        font-size:12px;
        cursor:pointer;
        user-select:none;
      }
      #${OVERLAY_ID} .hv-btn.danger{
        border-color:rgba(255,80,80,0.25);
        background:rgba(255,80,80,0.08);
      }
      #${OVERLAY_ID} .hv-btn.danger:hover{ background:rgba(255,80,80,0.16); }
      #${OVERLAY_ID} .hv-body{
        display:grid;
        grid-template-columns:260px 1fr;
        height:100%;
        min-height:0;
      }
      #${OVERLAY_ID} pre{
        margin:0;
        background:rgba(0,0,0,0.35);
        border:1px solid rgba(255,255,255,0.10);
        border-radius:14px;
        padding:12px;
        overflow:auto;
        flex:1;
        font-size:12px;
        line-height:1.45;
        white-space:pre-wrap;
        word-break:break-word;
      }
    `;
    document.head.appendChild(st);
  }

  // ---------- key parsing ----------
  function splitKey(k) {
    const parts = String(k).split(":");
    const day = parts[1] || "";
    const type = parts.slice(2).join(":") || "";
    return { day, type };
  }

  function listAllKeys() {
    try {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) out.push(k);
      }
      out.sort((a, b) => (a < b ? 1 : -1));
      return out;
    } catch { return []; }
  }

  function listDays(keys) {
    const set = new Set();
    keys.forEach((k) => set.add(splitKey(k).day));
    return Array.from(set).filter(Boolean).sort((a, b) => (a < b ? 1 : -1));
  }

  function typesForDay(keys, day) {
    const set = new Set();
    keys.forEach((k) => {
      const p = splitKey(k);
      if (p.day === day) set.add(p.type);
    });
    return Array.from(set).filter(Boolean).sort();
  }

  function readKey(k) {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function unwrap(rec) {
    if (!rec) return null;
    return (rec && rec.payload !== undefined) ? rec.payload : rec;
  }

  function summarize(rec) {
    if (!rec) return "—";
    const payload = unwrap(rec);
    const ts = rec.ts || payload?.ts || null;
    let count = null;
    if (Array.isArray(payload?.matches)) count = payload.matches.length;
    else if (Array.isArray(payload?.allMatches)) count = payload.allMatches.length;
    else if (Array.isArray(payload?.values)) count = payload.values.length;
    else if (Array.isArray(payload?.moves)) count = payload.moves.length;
    const t = ts ? new Date(ts).toLocaleString() : "";
    return [count !== null ? `items=${count}` : null, t ? `ts=${t}` : null].filter(Boolean).join(" · ") || "—";
  }

  // ---------- deterministic anchor ----------
  function anchorToHeader(header){
    if (!header) return;
    header.setAttribute(ANCHOR_ATTR,"1");
    let btn = document.getElementById(BTN_ID);
    if (!btn){
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.className = "btn-history-pill";
      btn.textContent = "View History";
      btn.title = "View stored daily snapshots";
      btn.addEventListener("click",(e)=>{
        e.preventDefault(); e.stopPropagation(); openOverlay();
      });
    }
    header.appendChild(btn);
  }
  function findIntelligenceTitleLeaf(root) {
    const nodes = root.querySelectorAll("h1,h2,h3,div,span,p,strong,b,small");
    for (const el of nodes) {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt === "intelligence panels") return el;
    }
    for (const el of nodes) {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt.includes("intelligence panels")) return el;
    }
    return null;
  }

  function pickHeaderContainer(titleLeaf, root) {
    if (!titleLeaf) return null;
    let cur = titleLeaf;
    for (let i = 0; i < 8; i++) {
      const p = cur.parentElement;
      if (!p) break;
      if (p === root) break;
      const cn = (p.className || "").toLowerCase();
      if (cn.includes("header") || cn.includes("title") || cn.includes("toolbar")) return p;
      cur = p;
    }
    return titleLeaf.parentElement || null;
  }

  function ensureButtonAnchored() {
    const manualHeader = document.querySelector(HEADER_SELECTOR);
    if (manualHeader) { anchorToHeader(manualHeader); return true; }

    const root = getRightRoot();
    const titleLeaf = findIntelligenceTitleLeaf(root);
    if (!titleLeaf) return false;
    const header = pickHeaderContainer(titleLeaf, root) || titleLeaf.parentElement;
    if (!header) return false;
    anchorToHeader(header);
    return true;
  }

  // ---------- overlay ----------
  function buildKey(day, type) { return `${PREFIX}${day}:${type}`; }

  function exportJson(filename, obj) {
    try {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { console.warn("[HISTORY] export failed", err); }
  }

  async function copyText(txt) {
    if (!txt) return;
    try { await navigator.clipboard.writeText(txt); }
    catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch (_) {}
    }
  }

  function closeOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
    window.removeEventListener("keydown", onEscClose);
    window.removeEventListener("storage", onStorageRefresh);
  }

  function onEscClose(e){ if (e.key === "Escape") closeOverlay(); }
  function onStorageRefresh(e){
    try{
      if (!e || !e.key) { refreshUI(true); return; }
      if (String(e.key).startsWith(PREFIX)) refreshUI(false);
    }catch(_){}
  }

  function openOverlay() {
    injectStyles();
    if (document.getElementById(OVERLAY_ID)) return;
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    const activeDay = (window.AIMLHistory && typeof window.AIMLHistory.todayKey==="function")
      ? window.AIMLHistory.todayKey() : "";
    overlay.innerHTML = `
      <div class="hv-card" role="dialog" aria-modal="true">
        <div class="hv-top">
          <div class="hv-title">
            <span>History Viewer</span>
            ${activeDay ? `<span style="opacity:.65;font-weight:900;font-size:12px">• Active: ${esc(activeDay)}</span>` : ``}
          </div>
          <div class="hv-actions">
            <select id="hv-day"></select>
            <select id="hv-type"></select>
            <button class="hv-btn" id="hv-reload">Reload</button>
            <button class="hv-btn" id="hv-load">Load</button>
            <button class="hv-btn" id="hv-copy">Copy</button>
            <button class="hv-btn" id="hv-export">Export</button>
            <button class="hv-btn danger" id="hv-clear-day">Clear day</button>
            <button class="hv-btn danger" id="hv-clear-all">Clear all</button>
            <button class="hv-btn hv-close" id="hv-close">✕</button>
          </div>
        </div>
        <div class="hv-body">
          <div class="hv-left">
            <div class="hv-k">Available snapshots</div>
            <div class="hv-list" id="hv-list"></div>
          </div>
          <div class="hv-right">
            <div class="hv-meta">
              <div id="hv-key">—</div>
              <div id="hv-sum">—</div>
            </div>
            <pre id="hv-json">No snapshot loaded.</pre>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById("hv-close").onclick = closeOverlay;
    overlay.addEventListener("click",(e)=>{ if (e.target===overlay) closeOverlay(); });
    window.addEventListener("keydown", onEscClose);
    window.addEventListener("storage", onStorageRefresh);

    document.getElementById("hv-reload").onclick = ()=>refreshUI(true);
    document.getElementById("hv-load").onclick = ()=>loadSelected(true);
    document.getElementById("hv-copy").onclick = ()=>copyText(document.getElementById("hv-json")?.textContent||"");
    document.getElementById("hv-export").onclick = ()=>{
      const day=document.getElementById("hv-day")?.value||"unknown";
      const type=document.getElementById("hv-type")?.value||"unknown";
      const key=buildKey(day,type);
      const rec=readKey(key);
      exportJson(`AIML_HISTORY_${day}_${type.replaceAll(":","-")}.json`, rec||{});
    };
    document.getElementById("hv-clear-day").onclick = clearSelectedDay;
    document.getElementById("hv-clear-all").onclick = clearAll;

    document.getElementById("hv-day").addEventListener("change",()=>refreshUI(false));
    document.getElementById("hv-type").addEventListener("change",()=>refreshUI(false));
    refreshUI(true);
  }

  function refreshUI(forcePickDay){
    const keys=listAllKeys();
    const days=listDays(keys);
    const daySel=document.getElementById("hv-day");
    const typeSel=document.getElementById("hv-type");
    const listEl=document.getElementById("hv-list");
    if(!daySel||!typeSel||!listEl) return;
    const prevDay=daySel.value; const prevType=typeSel.value;
    daySel.innerHTML=days.map((d)=>`<option value="${esc(d)}">${esc(d)}</option>`).join("");
    let nextDay=prevDay&&days.includes(prevDay)?prevDay:"";
    if(!nextDay){
      const activeDay=(window.AIMLHistory&&typeof window.AIMLHistory.todayKey==="function")?window.AIMLHistory.todayKey():"";
      if(activeDay&&days.includes(activeDay)) nextDay=activeDay;
    }
    if(!nextDay&&days.length) nextDay=days[0];
    if(forcePickDay) daySel.value=nextDay||"";
    else daySel.value=daySel.value||nextDay||"";
    const day=daySel.value;
    const types=day?typesForDay(keys,day):[];
    typeSel.innerHTML=types.map((t)=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
    let nextType=prevType&&types.includes(prevType)?prevType:(types[0]||"");
    typeSel.value=typeSel.value&&types.includes(typeSel.value)?typeSel.value:nextType;

    const rows=day
      ? keys.filter((k)=>splitKey(k).day===day).map((k)=>{
          const p=splitKey(k); const rec=readKey(k);
          const meta=summarize(rec);
          const active=(p.type===typeSel.value)?"active":"";
          return `<div class="hv-item ${active}" data-k="${esc(k)}">
                    <div class="d1">${esc(p.type)}</div>
                    <div class="d2">${esc(meta)}</div>
                  </div>`;
        })
      : [];
    listEl.innerHTML=rows.length?rows.join(""):`<div style="opacity:.7;font-weight:800">No snapshots found.</div>`;
    listEl.querySelectorAll(".hv-item").forEach((node)=>{
      node.onclick=()=>{
        const k=node.getAttribute("data-k"); if(!k) return;
        const p=splitKey(k);
        daySel.value=p.day; refreshUI(false);
        typeSel.value=p.type; loadSelected(true);
      };
    });
    loadSelected(false);
  }

  function loadSelected(force){
    const day=document.getElementById("hv-day")?.value;
    const type=document.getElementById("hv-type")?.value;
    const keyEl=document.getElementById("hv-key");
    const sumEl=document.getElementById("hv-sum");
    const jsonEl=document.getElementById("hv-json");
    if(!keyEl||!sumEl||!jsonEl) return;

    if(!day||!type){
      keyEl.textContent="—"; sumEl.textContent="—";
      if(force) jsonEl.textContent="No snapshots found."; return;
    }
    const k=buildKey(day,type);
    const rec=readKey(k);
    keyEl.textContent=k;
    sumEl.textContent=summarize(rec);
    if(!rec){ if(force) jsonEl.textContent="Snapshot not found."; return; }
    try{ jsonEl.textContent=JSON.stringify(rec,null,2); }
    catch{ jsonEl.textContent=String(rec); }
  }

  function clearSelectedDay(){
    const day=document.getElementById("hv-day")?.value;
    if(!day) return;
    if(!safeConfirm(`Clear ALL history snapshots for ${day}?`)) return;
    try{
      const removePrefix=`${PREFIX}${day}:`;
      const toRemove=[];
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k.startsWith(removePrefix)) toRemove.push(k);
      }
      toRemove.forEach((k)=>localStorage.removeItem(k));
    }catch(_){}
    refreshUI(true);
  }

  function clearAll(){
    if(!safeConfirm("Clear ALL stored history snapshots?")) return;
    try{
      const toRemove=[];
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k.startsWith(PREFIX)) toRemove.push(k);
      }
      toRemove.forEach((k)=>localStorage.removeItem(k));
    }catch(_){}
    refreshUI(true);
  }

  // ---------- boot ----------
  function boot(){
    injectStyles();
    ensureButtonAnchored();
    let checkCount=0;
    const safeInterval=setInterval(()=>{
      checkCount++;
      if(checkCount>20) clearInterval(safeInterval);
      ensureButtonAnchored();
    },2000);
    setTimeout(ensureButtonAnchored,300);
    setTimeout(ensureButtonAnchored,1200);
    console.log("[HISTORY] Viewer v2.02 Stable Anchor loaded");
  }

  if(document.readyState==="loading")
    document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();
