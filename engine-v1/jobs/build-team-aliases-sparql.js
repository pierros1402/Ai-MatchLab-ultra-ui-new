/**
 * build-team-aliases-sparql.js
 *
 * Populates per-league team aliases from Wikidata (skos:altLabel), so the same club
 * is matched across sources that name it differently (Flashscore "Inter" vs standings
 * "Internazionale" vs TM "Inter Milan"). Same bulk-SPARQL pattern as team-geo.
 * Writes data/team-aliases/{slug}.json {canonicalName: [aliases]} (merged, not clobbered).
 *
 * Usage: node engine-v1/jobs/build-team-aliases-sparql.js
 * Guardrails: canonicalWrites 0 (writes only to data/team-aliases).
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { readStandings } from "../storage/standings-memory-db.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";
import { normalizeTeamTokens } from "../core/normalize.js";

const SPARQL = "https://query.wikidata.org/sparql";
const QUERY = `SELECT ?clubLabel ?alt ?countryLabel WHERE {
  ?club wdt:P31/wdt:P279* wd:Q476028.
  ?club skos:altLabel ?alt. FILTER(LANG(?alt)="en")
  OPTIONAL { ?club wdt:P17 ?country. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 120000`;

const UK = new Set(["united kingdom", "england", "scotland", "wales", "northern ireland"]);
function countryMatch(a, b) {
  const x = String(a || "").toLowerCase().trim(), y = String(b || "").toLowerCase().trim();
  if (!x || !y) return true;                 // unknown country → don't block
  return x === y || (UK.has(x) && UK.has(y));
}


async function fetchAliasGroups() {
  const r = await fetch(`${SPARQL}?format=json&query=${encodeURIComponent(QUERY)}`, {
    headers: { "user-agent": "AiMatchLab/1.0 aliases", "accept": "application/sparql-results+json" }
  });
  if (!r.ok) throw new Error(`sparql_http_${r.status}`);
  const j = await r.json();
  const groups = new Map();   // normalizeTeamTokens(clubLabel) -> { label, country, alts:Set }
  for (const b of (j.results?.bindings || [])) {
    const label = b.clubLabel?.value, alt = b.alt?.value;
    if (!label || !alt) continue;
    const key = normalizeTeamTokens(label);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { label, country: b.countryLabel?.value || null, alts: new Set() });
    if (normalizeTeamTokens(alt) !== key) groups.get(key).alts.add(alt.trim());
  }
  return groups;
}

export async function buildTeamAliasesSparql() {
  const groups = await fetchAliasGroups();
  const dir = resolveDataPath("league-memory", "standings");
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { /* none */ }

  const stats = { leagues: 0, teams: 0, matched: 0, aliasesWritten: 0 };

  for (const f of files) {
    const slug = f.replace(/\.json$/, "");
    const rows = readStandings(slug)?.accepted?.rows;
    if (!Array.isArray(rows) || !rows.length) continue;
    const country = getLeagueMeta(slug)?.country || null;

    const aliasFile = resolveDataPath("team-aliases", `${slug}.json`);
    let map = {};
    try { map = JSON.parse(fs.readFileSync(aliasFile, "utf8")); } catch { /* new */ }

    let leagueChanged = false;
    for (const row of rows) {
      const team = row.teamName;
      if (!team) continue;
      stats.teams++;
      const g = groups.get(normalizeTeamTokens(team));
      if (!g || !g.alts.size) continue;
      if (g.country && country && !countryMatch(g.country, country)) continue;
      stats.matched++;
      const existing = new Set(Array.isArray(map[team]) ? map[team] : []);
      let added = 0;
      for (const a of g.alts) if (!existing.has(a)) { existing.add(a); added++; }
      if (added) { map[team] = [...existing]; stats.aliasesWritten += added; leagueChanged = true; }
    }
    if (leagueChanged) {
      fs.mkdirSync(resolveDataPath("team-aliases"), { recursive: true });
      fs.writeFileSync(aliasFile, JSON.stringify(map, null, 2), "utf8");
      stats.leagues++;
    }
  }
  return { ok: true, clubGroups: groups.size, ...stats };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  buildTeamAliasesSparql().then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
}
