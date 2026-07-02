// assets/js/ui/navigation.js
// FINAL — emits league-selected AND leagues:all (canonical catalogue, no legacy DATA dependency)
(function () {
  "use strict";

  const STATIC_CATALOGUE_URL = "./assets/data/leagues-catalogue.json";
  const CONTINENTS = [
    { code: "EU", name: "Europe", timezone: "Europe/London" },
    { code: "AS", name: "Asia", timezone: "Asia/Tokyo" },
    { code: "AF", name: "Africa", timezone: "Africa/Johannesburg" },
    { code: "NA", name: "North America", timezone: "America/New_York" },
    { code: "SA", name: "South America", timezone: "America/Sao_Paulo" },
    { code: "OC", name: "Oceania", timezone: "Pacific/Auckland" },
    { code: "IN", name: "International", timezone: "UTC" }
  ];

  const el = id => document.getElementById(id);
  const emitEvt = (e, p) => window.emit && window.emit(e, p);
  const safeOpen = id => window.openAccordion && window.openAccordion(id);

  async function fetchJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }

  function item(txt, fn) {
    const d = document.createElement("div");
    d.className = "list-row";
    d.textContent = txt;
    d.onclick = fn;
    return d;
  }

  function isCatalogue(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function continentRows(catalogue, code) {
    const rows = catalogue?.[code];
    return Array.isArray(rows) ? rows : [];
  }

  function leagueRows(country) {
    const rows = country?.leagues || country?.competitions || [];
    return Array.isArray(rows) ? rows : [];
  }

  let ALL_LEAGUES = [];
  let _leagueCatalogue = null;

  async function fetchLeagueCatalogue() {
    if (_leagueCatalogue) return _leagueCatalogue;

    try {
      const base = window.__AIML_ENGINE_BASE || "";
      const dynamic = await fetchJson(`${base}/api/leagues`);
      if (isCatalogue(dynamic)) {
        _leagueCatalogue = dynamic;
        return _leagueCatalogue;
      }
    } catch (e) {
      console.warn("[navigation] /api/leagues unavailable; using static catalogue fallback", e?.message || e);
    }

    try {
      const fallback = await fetchJson(STATIC_CATALOGUE_URL);
      if (isCatalogue(fallback)) {
        _leagueCatalogue = fallback;
        return _leagueCatalogue;
      }
    } catch (e) {
      console.warn("[navigation] static league catalogue unavailable", e?.message || e);
    }

    _leagueCatalogue = {};
    return _leagueCatalogue;
  }

  window.loadNavigation = async function () {
    ALL_LEAGUES = [];
    const seen = Object.create(null);
    const catalogue = await fetchLeagueCatalogue();

    const list = el("continents-list");
    if (!list) return;
    list.innerHTML = "";

    for (const c of CONTINENTS) {
      list.appendChild(item(c.name, () => onContinent(c)));
      const data = continentRows(catalogue, c.code);
      data.forEach(ct => {
        leagueRows(ct).forEach(lg => {
          const id = lg.league_id;
          if (!id || seen[id]) return;
          seen[id] = 1;
          ALL_LEAGUES.push({ id, name: lg.display_name || lg.league_name || id });
        });
      });
    }

    emitEvt("leagues:all", { leagues: ALL_LEAGUES });
  };

  async function onContinent(c) {
    const list = el("countries-list");
    if (!list) return;
    list.innerHTML = "Loading…";
    const catalogue = await fetchLeagueCatalogue();
    const data = continentRows(catalogue, c.code);
    list.innerHTML = "";
    data.forEach(ct => list.appendChild(item(ct.country_name || ct.category || "Unknown", () => onCountry(ct))));
    safeOpen("panel-countries");
  }

  function onCountry(country) {
    const list = el("leagues-list");
    if (!list) return;
    list.innerHTML = "";
    leagueRows(country).forEach(lg => {
      const id = lg.league_id;
      const name = lg.display_name || lg.league_name || id;
      if (!id) return;
      list.appendChild(item(name, () => {
        emitEvt("league-selected", {
          id,
          name,
          source: "navigation"
        });
        safeOpen("panel-matches");
      }));
    });
    safeOpen("panel-leagues");
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (window.loadNavigation) window.loadNavigation();
  });
})();
