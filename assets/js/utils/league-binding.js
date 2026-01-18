/* =========================================================
   League Binding v1.6 (AIML ULTRA, utils, global script)
   PURPOSE: DATA ONLY — NO UI SIDE EFFECTS
   - Builds league index from FINAL datasets
   - ESPN ⇄ Accordion matching
   - Enriches match objects with league meta
   - Emits readiness events ONLY
========================================================= */
(function () {
  "use strict";
  if (window.LeagueBinding && window.LeagueBinding.__v === "1.6") return;

  const DATA_BASE = "./AI-MATCHLAB-DATA";

  const CONTINENT_DATA = {
    EU: `${DATA_BASE}/europe/europe_betting_ready_FINAL.json`,
    AF: `${DATA_BASE}/africa/africa_betting_ready_FINAL.json`,
    AS: `${DATA_BASE}/asia/asia_betting_ready_FINAL.json`,
    NA: `${DATA_BASE}/north_america/north_america_betting_ready_FINAL.json`,
    SA: `${DATA_BASE}/south_america/south_america_betting_ready_FINAL.json`,
    OC: `${DATA_BASE}/oceania/oceania_betting_ready_FINAL.json`,
    IN: `${DATA_BASE}/international/international_betting_ready_FINAL.json`
  };

  const ESPN_ALIAS = {
    "PL": "Premier League",
    "ENG.1": "Premier League",
    "EPL": "Premier League",
    "PD": "La Liga",
    "ESP.1": "La Liga",
    "LALIGA": "La Liga",
    "BL1": "Bundesliga",
    "GER.1": "Bundesliga",
    "SA": "Serie A",
    "ITA.1": "Serie A",
    "FL1": "Ligue 1",
    "FRA.1": "Ligue 1",
    "SL": "Super League Greece",
    "GRE.1": "Super League Greece"
  };

  const state = {
    ready: false,
    loading: null,
    metaById: Object.create(null),
    idByName: Object.create(null),
    idByLoose: Object.create(null)
  };

  function esc(s) { return String(s == null ? "" : s); }
  function normKey(s) {
    return esc(s).toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function looseKey(s) {
    return normKey(s)
      .replace(/\b(league|cup|division|group|stage|round|championship)\b/g, "")
      .replace(/\b(english|spain|spanish|german|italian|french|greek|portuguese|turkish)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function addLeague(meta) {
    if (!meta || !meta.id || !meta.name) return;
    const id = String(meta.id).trim();
    const name = String(meta.name).trim();
    state.metaById[id] = state.metaById[id] || meta;
    const nk = normKey(name);
    if (nk && !state.idByName[nk]) state.idByName[nk] = id;
    const lk = looseKey(name);
    if (lk && !state.idByLoose[lk]) state.idByLoose[lk] = id;
  }

  function ingestContinentDataset(continentCode, countriesArray) {
    if (!Array.isArray(countriesArray)) return;
    countriesArray.forEach((c) => {
      const leagues = Array.isArray(c.leagues) ? c.leagues : [];
      leagues.forEach((l) => {
        if (!l.league_id) return;
        addLeague({
          id: String(l.league_id),
          name: String(l.display_name || l.league_name || l.league_id),
          continentCode: continentCode || "",
          countryName: String(c.country_name || ""),
          tier: (l.tier != null ? Number(l.tier) : null)
        });
      });
    });
    state.ready = true;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function init(opts) {
    if (state.loading) return state.loading;
    if (state.ready) return Promise.resolve(true);

    const preload = Array.isArray(opts?.preload) ? opts.preload : ["EU"];
    const codes = preload.filter((c) => CONTINENT_DATA[c]);

    state.loading = (async () => {
      try {
        for (let i = 0; i < codes.length; i++) {
          const data = await fetchJson(CONTINENT_DATA[codes[i]]);
          ingestContinentDataset(codes[i], Array.isArray(data) ? data : []);
        }
        state.ready = true;
        if (window.emit) window.emit("league-binding:ready", { preload: codes.slice() });
        return true;
      } catch (e) {
        console.warn("[LEAGUE-BIND] init failed:", e);
        return false;
      } finally {
        state.loading = null;
      }
    })();

    return state.loading;
  }

  function findLeagueIdByName(nameOrCode) {
    if (!nameOrCode) return null;
    const raw = String(nameOrCode).trim();
    const up = raw.toUpperCase();

    const aliasName = ESPN_ALIAS[up];
    if (aliasName) {
      const id = state.idByName[normKey(aliasName)] || state.idByLoose[looseKey(aliasName)];
      if (id) return id;
    }

    return state.idByName[normKey(raw)] || state.idByLoose[looseKey(raw)] || null;
  }

  function enrichMatch(match) {
    if (!match || typeof match !== "object") return match;

    const candidates = [
      match.leagueId,
      match.league_id,
      match.leagueSlug,
      match.leagueCode,
      match.leagueName,
      match.league,
      match.competition,
      match.tournament
    ].filter(Boolean);

    let leagueId = match.leagueId || null;
    if (!leagueId) {
      for (let i = 0; i < candidates.length; i++) {
        const id = findLeagueIdByName(candidates[i]);
        if (id) { leagueId = id; break; }
      }
    }

    if (leagueId && state.metaById[leagueId]) {
      const meta = state.metaById[leagueId];
      match.leagueId = leagueId;
      match.leagueName = meta.name;
      match.countryName = match.countryName || meta.countryName || "";
      match.continentCode = match.continentCode || meta.continentCode || "";
      if (meta.tier != null && match.tier == null) match.tier = meta.tier;
    }

    return match;
  }

  function activeLeagueIds(matches) {
    const set = Object.create(null);
    if (!Array.isArray(matches)) return [];
    matches.forEach(m => { if (m && m.leagueId) set[String(m.leagueId)] = 1; });
    return Object.keys(set);
  }

  window.LeagueBinding = {
    __v: "1.6",
    init,
    ingestContinentDataset,
    enrichMatch,
    activeLeagueIds
  };
})();