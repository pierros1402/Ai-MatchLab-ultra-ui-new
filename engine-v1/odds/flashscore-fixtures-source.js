/**
 * flashscore-fixtures-source.js
 *
 * Comprehensive fixtures source — the whole day's football across every league,
 * read from Flashscore's public data feed (no API key, no paid feed). This is far
 * wider than the BetExplorer odds listing (hundreds of matches vs a handful), so
 * it tells us about every match in our coverage map that is actually being played.
 *
 * Feed: https://2.flashscore.ninja/2/x/feed/f_1_{offset}_3_en_1
 *   offset: 0 = today, 1 = tomorrow, -1 = yesterday (Flashscore local day).
 * Header x-fsign is a fixed public signature the site itself sends.
 *
 * Wire format is delimited: records by "~", fields by "¬", key/value by "÷".
 *   ZA = "COUNTRY: Competition", ZY = country, ZL = /football/<country>/<league>/
 *   AA = match id, AE = home, AF = away, AD = kickoff unix seconds.
 */

const FSIGN = "SW9D1eZo";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchFeed(offset, timeoutMs = 15000) {
  const url = `https://2.flashscore.ninja/2/x/feed/f_1_${offset}_3_en_1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "x-fsign": FSIGN, "user-agent": UA, "referer": "https://www.flashscore.com/" }
    });
    const text = await res.text();
    return { ok: res.ok && text.length > 10, status: res.status, text };
  } catch (err) {
    return { ok: false, status: 0, text: "", error: err?.name === "AbortError" ? "timeout" : String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

function cleanLeagueName(za) {
  // "ARGENTINA: Primera Nacional" → "Primera Nacional"
  const i = String(za || "").indexOf(":");
  return i >= 0 ? za.slice(i + 1).trim() : String(za || "").trim();
}

export function parseFlashscoreFeed(text) {
  const out = [];
  let league = null, country = null, path = null;

  for (const rec of String(text || "").split("~")) {
    const f = {};
    for (const kv of rec.split("¬")) {
      const i = kv.indexOf("÷");
      if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1);
    }

    if (f.ZA) { league = cleanLeagueName(f.ZA); country = f.ZY || null; path = f.ZL || null; }

    if (f.AA && f.AE && f.AF) {
      const ts = Number(f.AD);
      const kickoffUtc = Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null;
      // AG/AH = current/final scores; AB = status code (3 = finished on Flashscore).
      const sh = f.AG !== undefined && f.AG !== "" ? Number(f.AG) : null;
      const sa = f.AH !== undefined && f.AH !== "" ? Number(f.AH) : null;
      out.push({
        matchId: f.AA,
        leaguePath: path,
        country,
        leagueName: league,
        home: f.AE.trim(),
        away: f.AF.trim(),
        kickoffUtc,
        kickoffTs: Number.isFinite(ts) ? ts : null,
        scoreHome: Number.isFinite(sh) ? sh : null,
        scoreAway: Number.isFinite(sa) ? sa : null,
        statusCode: f.AB || null,
        finished: f.AB === "3"
      });
    }
  }
  return out;
}

/**
 * Fetch the day's fixtures for one or more day offsets, deduped by match id.
 * @returns {{ ok, rows, attempts }}
 */
export async function fetchFlashscoreFixtures(options = {}) {
  const offsets = options.offsets || [0, 1, 2];
  const attempts = [];
  const seen = new Set();
  const rows = [];

  for (const off of offsets) {
    const res = await fetchFeed(off, options.timeoutMs || 15000);
    const parsed = res.ok ? parseFlashscoreFeed(res.text) : [];
    attempts.push({ offset: off, ok: res.ok, status: res.status, rows: parsed.length, error: res.error || null });

    for (const row of parsed) {
      if (seen.has(row.matchId)) continue;
      seen.add(row.matchId);
      rows.push(row);
    }
  }

  return { ok: rows.length > 0, rows, attempts };
}
