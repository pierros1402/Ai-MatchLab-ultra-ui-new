/**
 * transfermarkt-fixtures-referee-source.js
 *
 * The APPOINTED referee per upcoming fixture, from a competition's Transfermarkt
 * matchday page (referees are listed once appointed — typically a few days before
 * kickoff). Pairs with referee-memory-db tendencies (same schiedsrichter id) to
 * show, in match details, who referees an upcoming game and how freely they give
 * cards/penalties.
 *
 *   page: /{slug}/spieltag/wettbewerb/{TM_CODE}
 */

import { TM_COMPETITIONS } from "./transfermarkt-referee-source.js";
import { tmFetch } from "./transfermarkt-fetch.js";

// In TM's matchday layout the referee is rendered inside the HOME team's cell, so
// only the home club is adjacent. That's enough: one home fixture per team per
// matchday, so we link our fixtures by home team.
function parseMatchday(html) {
  const out = [];
  const refRe = /Referee:\s*<a [^>]*title="([^"]+)"[^>]*href="\/[^"]*\/profil\/schiedsrichter\/(\d+)"/g;
  for (const m of html.matchAll(refRe)) {
    const refereeName = m[1].trim();
    const refereeId = m[2];
    const before = html.slice(Math.max(0, m.index - 2500), m.index);
    const clubs = [...before.matchAll(/<a title="([^"]+)" href="\/[^"]*\/spielplan\/verein\/\d+/g)]
      .map(c => c[1].trim());
    if (!clubs.length) continue;
    out.push({ home: clubs[clubs.length - 1], refereeId, refereeName });
  }
  return out;
}

/**
 * Appointed referees for a league's current matchday.
 * @returns {{ok, slug, fixtures:[{home,away,refereeId,refereeName}]}}
 */
export async function fetchMatchdayReferees(slug) {
  const code = TM_COMPETITIONS[slug];
  if (!code) return { ok: false, slug, reason: "no_tm_mapping", fixtures: [] };

  const path = `/x/spieltag/wettbewerb/${code}`;
  try {
    const r = await tmFetch(path);
    if (!r.ok) return { ok: false, slug, reason: `http_${r.status}`, fixtures: [] };
    const fixtures = parseMatchday(await r.text());
    return { ok: fixtures.length > 0, slug, fixtures, url: path };
  } catch (err) {
    return { ok: false, slug, reason: String(err?.message || err), fixtures: [] };
  }
}
