/* ============================================================
   AI MATCHLAB ULTRA — DATA LOADER (FINAL)
   Loads everything through AI-MATCHLAB-DATA/indexes/
============================================================ */

console.log("[DATA] Loader ready");

const DATA_ROOT = "/AI-MATCHLAB-DATA";   // root of your folder

/* Generic fetch helper */
async function loadJSON(path) {
  try {
    const res = await fetch(path + "?v=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (err) {
    console.error("[DATA] Failed:", path, err);
    return null;
  }
}

/* -------------------------
   LOAD CONTINENTS
   (παραμένει για συμβατότητα, αν το χρειαστούμε κάπου)
---------------------------- */
export async function loadContinents() {
  return await loadJSON(`${DATA_ROOT}/continents.json`);
}

/* -------------------------
   LOAD COUNTRIES INDEX
   (παλιό σύστημα, το κρατάμε ως backup)
---------------------------- */
export async function loadCountriesIndex() {
  return await loadJSON(`${DATA_ROOT}/indexes/countries_index.json`);
}

/* -------------------------
   LOAD LEAGUES INDEX
   (παλιό σύστημα, το κρατάμε ως backup)
---------------------------- */
export async function loadLeaguesIndex() {
  return await loadJSON(`${DATA_ROOT}/indexes/leagues_index.json`);
}

/* -------------------------
   LOAD TEAMS (from league path)
---------------------------- */
export async function loadTeamsFromLeague(leagueId, leaguesIndex) {
  if (!leaguesIndex.leagues[leagueId]) return [];

  const path = leaguesIndex.leagues[leagueId].path;
  return await loadJSON(`${DATA_ROOT}${path}`);
}

/* -------------------------
   LOAD TEAMS GLOBAL INDEX
---------------------------- */
export async function loadTeamsGlobalIndex() {
  return await loadJSON(`${DATA_ROOT}/indexes/teams_global_index.json`);
}

/* ------------------------------------------------
   NEW: LOAD GLOBAL LEAGUES MASTER (MAIN DATA SOURCE)
   /AI-MATCHLAB-DATA/indexes/global_leagues_master_GLOBAL.json
   Χρησιμοποιείται για τα αριστερά panels:
   Continents -> Countries -> Leagues
--------------------------------------------------- */
export async function loadGlobalLeaguesMaster() {
  return await loadJSON(
    `${DATA_ROOT}/indexes/global_leagues_master_GLOBAL.json`
  );
}
