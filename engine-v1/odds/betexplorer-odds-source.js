/**
 * betexplorer-odds-source.js
 *
 * Reads REAL bookmaker odds straight from the web — no odds API, no paid feed.
 * BetExplorer renders today's matches with 1X2 odds in static HTML (the
 * `data-odd` / `data-odd-max` attributes), so the engine can "read" them the way
 * an analyst would. We parse the whole listing and let the caller match rows to
 * its own fixtures by team name.
 *
 * Reliability notes:
 *   - Only static HTML is used (no JS execution), so coverage = whatever the
 *     listing contains; rows without 3 valid prices are skipped.
 *   - `data-odd` is the market (average) price, `data-odd-max` the best price.
 */

const DEFAULT_URLS = [
  "https://www.betexplorer.com/football/",
  "https://www.betexplorer.com/next/soccer/"
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchHtml(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": UA, "accept": "text/html" }
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    return { ok: false, status: 0, text: "", error: err?.name === "AbortError" ? "timeout" : String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

// data-dt="DD,M,YYYY,H,MM" → { kickoff ISO-ish, dayKey } in the listing's local
// timezone (BetExplorer ≈ CET/CEST). Good enough for day grouping; callers that
// need exact Athens boundaries can refine.
function parseDt(dt) {
  const m = String(dt || "").split(",").map(s => s.trim());
  if (m.length < 5) return null;
  const [d, mo, y, h, mi] = m.map(Number);
  if (![d, mo, y, h, mi].every(Number.isFinite)) return null;
  const pad = n => String(n).padStart(2, "0");
  return {
    dayKey: `${y}-${pad(mo)}-${pad(d)}`,
    kickoffLocal: `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`
  };
}

// Tournament section headers carry the competition, e.g. "World: World
// Championship 2026", "Brazil: Serie B", "Europe: Champions League Qualifying".
function competitionHeaders(html) {
  const heads = [];
  const re = /leaguesNames[^>]*>\s*([^<]+?)\s*<\/p>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].replace(/\s+/g, " ").trim();
    const [country, ...rest] = raw.split(":");
    heads.push({
      index: m.index,
      raw,
      country: rest.length ? country.trim() : null,
      name: (rest.length ? rest.join(":") : country).trim()
    });
  }
  return heads;
}

function competitionAt(headers, pos) {
  let best = null;
  for (const h of headers) {
    if (h.index < pos) best = h; else break;
  }
  return best;
}

/**
 * Parse BetExplorer static HTML into match rows: 1X2 odds + kickoff + id +
 * the COMPETITION each match belongs to (domestic or international).
 * @returns {Array<{eventId,competition,country,home,away,dayKey,kickoffLocal,odds,oddsMax}>}
 */
export function parseBetExplorerHtml(html) {
  const s = String(html || "");
  const headers = competitionHeaders(s);
  const out = [];

  // Each match begins at a data-event-id (carries kickoff via data-dt) and
  // precedes its participants + odds.
  const idRe = /data-event-id="([^"]+)"/g;
  let m;
  const events = [];
  while ((m = idRe.exec(s)) !== null) events.push({ eventId: m[1], index: m.index });

  for (let i = 0; i < events.length; i++) {
    const start = events[i].index;
    const end = i + 1 < events.length ? events[i + 1].index : Math.min(s.length, start + 3000);
    const block = s.slice(start, end);

    const dt = parseDt((block.match(/data-dt="([^"]+)"/) || [])[1]);

    const homeIdx = block.indexOf("table-main__participantHome");
    if (homeIdx < 0) continue;
    const scope = block.slice(homeIdx, homeIdx + 2000);

    const home = (scope.match(/<p[^>]*>([^<]+)<\/p>/) || [])[1];
    const away = (scope.match(/participantAway[\s\S]*?<p[^>]*>([^<]+)<\/p>/) || [])[1];
    if (!home || !away) continue;

    const cells = [...scope.matchAll(/data-odd="([\d.]+)"(?:\s+data-odd-max="([\d.]+)")?/g)].slice(0, 3);
    if (cells.length < 3) continue;

    const odds = cells.map(c => parseFloat(c[1]));
    if (!odds.every(x => Number.isFinite(x) && x > 1)) continue;
    const maxes = cells.map(c => parseFloat(c[2]));

    const comp = competitionAt(headers, start);

    out.push({
      eventId: events[i].eventId,
      competition: comp?.name || null,
      country: comp?.country || null,
      home: home.trim(),
      away: away.trim(),
      dayKey: dt?.dayKey || null,
      kickoffLocal: dt?.kickoffLocal || null,
      odds:    { home: odds[0], draw: odds[1], away: odds[2] },
      oddsMax: {
        home: Number.isFinite(maxes[0]) ? maxes[0] : odds[0],
        draw: Number.isFinite(maxes[1]) ? maxes[1] : odds[1],
        away: Number.isFinite(maxes[2]) ? maxes[2] : odds[2]
      }
    });
  }

  return out;
}

/**
 * Fetch + parse one or more BetExplorer listings, deduped by home|away.
 * @returns {{ ok, rows, attempts }}
 */
export async function fetchMarketOdds(options = {}) {
  const urls = options.urls || DEFAULT_URLS;
  const attempts = [];
  const seen = new Set();
  const rows = [];

  for (const url of urls) {
    const res = await fetchHtml(url, options.timeoutMs || 15000);
    const parsed = res.ok ? parseBetExplorerHtml(res.text) : [];
    attempts.push({ url, ok: res.ok, status: res.status, rows: parsed.length, error: res.error || null });

    for (const row of parsed) {
      const key = row.eventId || `${row.home.toLowerCase()}|${row.away.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  return { ok: rows.length > 0, rows, attempts };
}
