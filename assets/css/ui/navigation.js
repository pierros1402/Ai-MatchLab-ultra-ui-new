// assets/js/ui/navigation.js
// FINAL — emits league-selected AND leagues:all (stable base)
(function () {
  "use strict";

  const DATA_BASE = "./AI-MATCHLAB-DATA";
  const URL_CONTINENTS = `${DATA_BASE}/indexes/continents.json`;
  const CONTINENT_DATA = {
    EU: `${DATA_BASE}/europe/europe_betting_ready_FINAL.json`,
    AF: `${DATA_BASE}/africa/africa_betting_ready_FINAL.json`,
    AS: `${DATA_BASE}/asia/asia_betting_ready_FINAL.json`,
    NA: `${DATA_BASE}/north_america/north_america_betting_ready_FINAL.json`,
    SA: `${DATA_BASE}/south_america/south_america_betting_ready_FINAL.json`,
    OC: `${DATA_BASE}/oceania/oceania_betting_ready_FINAL.json`,
    IN: `${DATA_BASE}/international/international_betting_ready_FINAL.json`
  };

  const el = id => document.getElementById(id);
  const emitEvt = (e,p)=> window.emit && window.emit(e,p);
  const safeOpen = id => window.openAccordion && window.openAccordion(id);

  async function fetchJson(url){
    const r = await fetch(url);
    if(!r.ok) throw new Error(url);
    return r.json();
  }

  function item(txt,fn){
    const d=document.createElement("div");
    d.className="list-row";
    d.textContent=txt;
    d.onclick=fn;
    return d;
  }

  let ALL_LEAGUES = [];

  window.loadNavigation = async function(){
    ALL_LEAGUES = [];

    const continents = await fetchJson(URL_CONTINENTS);
    const list = el("continents-list");
    list.innerHTML="";

    for (const c of continents){
      list.appendChild(item(c.name,()=>onContinent(c)));

      const data = await fetchJson(CONTINENT_DATA[c.code]);
      data.forEach(ct=>{
        (ct.leagues||[]).forEach(lg=>{
          ALL_LEAGUES.push({
            id: lg.league_id,
            name: lg.display_name || lg.league_id
          });
        });
      });
    }

    emitEvt("leagues:all",{leagues:ALL_LEAGUES});
  };

  async function onContinent(c){
    const list = el("countries-list");
    list.innerHTML="Loading…";
    const data = await fetchJson(CONTINENT_DATA[c.code]);
    list.innerHTML="";
    data.forEach(ct=>list.appendChild(item(ct.country_name,()=>onCountry(ct))));
    safeOpen("panel-countries");
  }

  function onCountry(country){
    const list = el("leagues-list");
    list.innerHTML="";
    (country.leagues||[]).forEach(lg=>{
      list.appendChild(item(lg.display_name||lg.league_id,()=>{
        emitEvt("league-selected",{
          id: lg.league_id,
          name: lg.display_name||lg.league_id,
          source:"navigation"
        });
        safeOpen("panel-matches");
      }));
    });
    safeOpen("panel-leagues");
  }

  document.addEventListener("DOMContentLoaded",()=>{
    if(window.loadNavigation) window.loadNavigation();
  });
})();
