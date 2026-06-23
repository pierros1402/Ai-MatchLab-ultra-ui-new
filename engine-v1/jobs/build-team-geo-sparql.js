/**
 * build-team-geo-sparql.js
 *
 * Fast team-geo acquisition via ONE Wikidata SPARQL query (the per-team API
 * bootstrap timed out/hung). Pulls ~10k+ football clubs with their home-venue
 * coordinates in seconds, then matches our standings teams by name and writes a
 * team-geo record per matched team (keyed by OUR name) so buildTravelContext finds
 * it → travel/distance works for far more leagues.
 *
 * Usage: node engine-v1/jobs/build-team-geo-sparql.js
 * Guardrails: canonicalWrites 0 (writes only to data/team-geo).
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { readStandings } from "../storage/standings-memory-db.js";
import { readTeamGeoRecord, writeTeamGeoRecord } from "../storage/team-geo-db.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";

const UK = new Set(["united kingdom", "england", "scotland", "wales", "northern ireland"]);
function countryMatch(a, b) {
  const x = String(a || "").toLowerCase().trim(), y = String(b || "").toLowerCase().trim();
  if (!x || !y) return false;
  if (x === y) return true;
  return UK.has(x) && UK.has(y);   // UK home nations share Wikidata "United Kingdom"
}

const SPARQL = "https://query.wikidata.org/sparql";
const QUERY = `SELECT ?clubLabel ?lat ?lon ?countryLabel WHERE {
  ?club wdt:P31/wdt:P279* wd:Q476028.
  ?club wdt:P115 ?venue.
  ?venue p:P625/psv:P625 ?node.
  ?node wikibase:geoLatitude ?lat; wikibase:geoLongitude ?lon.
  OPTIONAL { ?club wdt:P17 ?country. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 60000`;

function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(fc|afc|cf|sc|ac|cd|ca|ec|se|ad|sv|fk|if|bk|club|futebol|foot|ball)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
const tok = s => new Set(norm(s).split(" ").filter(Boolean));

async function fetchClubs() {
  const r = await fetch(`${SPARQL}?format=json&query=${encodeURIComponent(QUERY)}`, {
    headers: { "user-agent": "AiMatchLab/1.0 team-geo", "accept": "application/sparql-results+json" }
  });
  if (!r.ok) throw new Error(`sparql_http_${r.status}`);
  const j = await r.json();
  return (j.results?.bindings || []).map(b => ({
    label: b.clubLabel?.value || "",
    lat: Number(b.lat?.value), lon: Number(b.lon?.value),
    country: b.countryLabel?.value || null
  })).filter(c => c.label && Number.isFinite(c.lat) && Number.isFinite(c.lon));
}

export async function buildTeamGeoSparql() {
  const clubs = await fetchClubs();
  // Exact-normalized index + token sets for fuzzy fallback.
  const exact = new Map();
  for (const c of clubs) { const n = norm(c.label); if (n && !exact.has(n)) exact.set(n, c); }

  const dir = resolveDataPath("league-memory", "standings");
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { /* none */ }

  const stats = { teams: 0, alreadyHadGeo: 0, matched: 0, written: 0 };
  const seen = new Set();

  for (const f of files) {
    const slug = f.replace(/\.json$/, "");
    const rows = readStandings(slug)?.accepted?.rows;
    if (!Array.isArray(rows)) continue;
    const leagueCountry = getLeagueMeta(slug)?.country || null;
    for (const row of rows) {
      const team = row.teamName;
      if (!team || seen.has(team)) continue;
      seen.add(team);
      stats.teams++;
      if (readTeamGeoRecord(team)) { stats.alreadyHadGeo++; continue; }

      const n = norm(team);
      // Exact-normalized: trust if same country (or country agrees / unknown).
      let hit = exact.get(n);
      if (hit && leagueCountry && hit.country && !countryMatch(hit.country, leagueCountry)) hit = null;

      if (!hit) {
        // token-containment fallback — REQUIRE same country to avoid far mismatches.
        const a = tok(team);
        let best = null, bestScore = 0;
        for (const c of clubs) {
          if (leagueCountry && c.country && !countryMatch(c.country, leagueCountry)) continue;
          const b = tok(c.label);
          if (!b.size) continue;
          let inter = 0; for (const t of a) if (b.has(t)) inter++;
          const score = inter / Math.min(a.size, b.size);
          if (score > bestScore) { bestScore = score; best = c; }
        }
        if (bestScore >= 0.85) hit = best;
      }
      if (!hit) continue;
      stats.matched++;
      writeTeamGeoRecord({ team, latitude: hit.lat, longitude: hit.lon, country: hit.country, source: "wikidata-sparql" });
      stats.written++;
    }
  }
  return { ok: true, clubsFetched: clubs.length, ...stats };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  buildTeamGeoSparql().then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
}
