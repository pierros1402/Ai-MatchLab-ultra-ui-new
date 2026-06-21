/**
 * wikipedia-standings-parser.js  (v2)
 *
 * Fetches a Wikipedia page and extracts league standings from static HTML
 * tables. No AI. Fixes:
 *   - unicode minus (U+2212) and en/em dashes normalised to ASCII hyphen
 *   - multiple candidate page titles tried (league naming varies on Wikipedia)
 */

// ─── Normalisation ────────────────────────────────────────────────────────────

function normalizeMinus(value) {
  // U+2212 minus, U+2012..U+2015 dashes → ASCII hyphen
  return String(value || "").replace(/[\u2212\u2012\u2013\u2014\u2015]/g, "-");
}

function stripHtml(value) {
  return normalizeMinus(String(value || ""))
    .replace(/<sup[\s\S]*?<\/sup>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&minus;/gi, "-")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return " "; }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(parseInt(d, 10)); } catch { return " "; }
    })
    .replace(/\s+/g, " ")
    .trim();
}

function parseIntLoose(value) {
  const s = normalizeMinus(stripHtml(value)).replace(/[^\d\-+]/g, "");
  if (!s || s === "-" || s === "+") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseSigned(value) {
  const s = normalizeMinus(stripHtml(value));
  const m = s.match(/[+\-]?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

// ─── Table extraction ─────────────────────────────────────────────────────────

function extractTables(html) {
  const tables = [];
  const tableRx = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRx.exec(html)) !== null) {
    const block = tm[0];
    const isWikitable = /class="[^"]*wikitable[^"]*"/i.test(block);
    const rows = [];
    const rowRx = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRx.exec(block)) !== null) {
      const cells = [];
      const cellRx = /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
      let cm;
      while ((cm = cellRx.exec(rm[0])) !== null) cells.push(stripHtml(cm[1]));
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push({ index: tables.length, isWikitable, rows });
  }
  return tables;
}

// ─── Header-based column mapping ────────────────────────────────────────────────
// en.wikipedia.org standings tables use standardised header abbreviations:
//   Pos | Team | Pld | W | D | L | GF | GA | GD | Pts
// Mapping columns by header (instead of fixed offsets) is robust to extra columns
// (qualification/relegation notes, flags) and reordering.

function classifyHeaderCell(text) {
  const t = String(text || "").toLowerCase().replace(/[^a-z+\-/±]/g, "");
  if (["pos", "rank", "rk", "no", "place", "pos."].includes(t)) return "position";
  if (["team", "club", "teams", "clubs", "side", "teamvte", "clubvte"].includes(t)) return "teamName";
  if (["pld", "mp", "gp", "matches", "played", "pj", "pg"].includes(t)) return "played";
  if (["w", "won", "wins"].includes(t)) return "wins";
  if (["d", "drawn", "draws", "draw"].includes(t)) return "draws";
  if (["l", "lost", "losses", "loss"].includes(t)) return "losses";
  if (["gf", "f"].includes(t)) return "goalsFor";
  if (["ga", "a"].includes(t)) return "goalsAgainst";
  if (["gd", "+/-", "+/−", "±", "dif", "diff"].includes(t)) return "goalDifference";
  if (["pts", "points", "pt"].includes(t)) return "points";
  return null;
}

// Returns { map, headerIndex } where map is { field: columnIndex }, or null.
function detectColumnMap(rows) {
  for (let i = 0; i < Math.min(rows.length, 3); i++) {
    const cells = rows[i];
    const map = {};
    for (let c = 0; c < cells.length; c++) {
      const field = classifyHeaderCell(cells[c]);
      if (field && map[field] === undefined) map[field] = c;
    }
    // A usable header must locate the team plus enough stat columns.
    const hasCore = map.teamName !== undefined &&
      map.points !== undefined &&
      map.wins !== undefined && map.draws !== undefined && map.losses !== undefined;
    if (hasCore) return { map, headerIndex: i };
  }
  return null;
}

function buildRowFromMap(cells, map) {
  const get = (field) => (map[field] !== undefined ? cells[map[field]] : undefined);
  const teamName = stripHtml(get("teamName") || "");
  if (!teamName) return null;

  return {
    position:       parseIntLoose(get("position")),
    teamName,
    played:         parseIntLoose(get("played")),
    wins:           parseIntLoose(get("wins")),
    draws:          parseIntLoose(get("draws")),
    losses:         parseIntLoose(get("losses")),
    goalsFor:       parseIntLoose(get("goalsFor")),
    goalsAgainst:   parseIntLoose(get("goalsAgainst")),
    goalDifference: map.goalDifference !== undefined ? parseSigned(get("goalDifference")) : null,
    points:         parseIntLoose(get("points"))
  };
}

// ─── Row interpretation ───────────────────────────────────────────────────────

function buildRow(cells, offset) {
  const c = cells;
  if (c.length - offset >= 10) {
    return {
      position:       parseIntLoose(c[offset]),
      teamName:       stripHtml(c[offset + 1]),
      played:         parseIntLoose(c[offset + 2]),
      wins:           parseIntLoose(c[offset + 3]),
      draws:          parseIntLoose(c[offset + 4]),
      losses:         parseIntLoose(c[offset + 5]),
      goalsFor:       parseIntLoose(c[offset + 6]),
      goalsAgainst:   parseIntLoose(c[offset + 7]),
      goalDifference: parseSigned(c[offset + 8]),
      points:         parseIntLoose(c[offset + 9])
    };
  }
  if (c.length - offset >= 7) {
    return {
      position: parseIntLoose(c[offset]),
      teamName: stripHtml(c[offset + 1]),
      played:   parseIntLoose(c[offset + 2]),
      wins:     parseIntLoose(c[offset + 3]),
      draws:    parseIntLoose(c[offset + 4]),
      losses:   parseIntLoose(c[offset + 5]),
      points:   parseIntLoose(c[offset + 6])
    };
  }
  return null;
}

function rowArithmeticOk(row) {
  if (!row || !row.teamName) return false;
  const { played, wins, draws, losses, points } = row;
  const ints = [played, wins, draws, losses, points].every(v => Number.isInteger(v));
  if (!ints) return false;
  const playedOk = played === wins + draws + losses;
  const pointsOk = points === wins * 3 + draws;
  return playedOk || pointsOk;
}

function isHeaderRow(row) {
  if (!row || !row.teamName) return true;
  const n = row.teamName.toLowerCase();
  const allNull = [row.played, row.wins, row.draws, row.losses, row.points].every(v => v == null);
  return allNull || ["team", "club", "pos", "position", "pld", "equipo", "squadra", "verein", "team name", "equipe"].includes(n);
}

function scoreRows(rows) {
  const arithmeticOk = rows.filter(rowArithmeticOk).length;
  const uniqueTeams = new Set(rows.map(r => (r.teamName || "").toLowerCase())).size;
  const dupes = rows.length - uniqueTeams;
  return { arithmeticOk, score: arithmeticOk * 10 + rows.length - dupes * 15 };
}

function interpretTable(table) {
  let best = { rows: [], score: -1, offset: 0, arithmeticOk: 0 };

  // 1) Header-based mapping (preferred — robust to extra/reordered columns).
  const detected = detectColumnMap(table.rows);
  if (detected) {
    const rows = [];
    for (let r = detected.headerIndex + 1; r < table.rows.length; r++) {
      const row = buildRowFromMap(table.rows[r], detected.map);
      if (row && !isHeaderRow(row)) rows.push(row);
    }
    const { arithmeticOk, score } = scoreRows(rows);
    best = { rows, score, offset: -1, arithmeticOk, method: "header" };
  }

  // 2) Fixed-offset fallback (covers tables without a recognisable header row).
  for (let offset = 0; offset <= 2; offset++) {
    const rows = [];
    for (const cells of table.rows) {
      const row = buildRow(cells, offset);
      if (row && !isHeaderRow(row)) rows.push(row);
    }
    const { arithmeticOk, score } = scoreRows(rows);
    if (score > best.score) best = { rows, score, offset, arithmeticOk, method: "offset" };
  }

  return best;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchPage(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 Ai-MatchLab standings research"
      }
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text };
  } catch (err) {
    return { ok: false, status: 0, url, text: "", error: err?.name === "AbortError" ? "timeout" : String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

// ─── URL building with candidate titles ───────────────────────────────────────

export function buildWikipediaCandidateUrls(leagueName, season, altNames = []) {
  const seasonDash = season.replace(/-/g, "\u2013"); // en-dash form
  const seasonPlain = season;

  const names = [leagueName, ...altNames];
  const urls = [];

  for (const name of names) {
    for (const seasonForm of [seasonDash, seasonPlain]) {
      const title = `${seasonForm} ${name}`.replace(/\s+/g, "_");
      const encoded = encodeURIComponent(title).replace(/%2F/g, "/");
      const url = `https://en.wikipedia.org/wiki/${encoded}`;
      if (!urls.includes(url)) urls.push(url);
    }
  }

  return urls;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parseWikipediaStandings(url, options = {}) {
  const fetched = await fetchPage(url, options.timeoutMs || 12000);

  if (!fetched.ok || !fetched.text) {
    return {
      ok: false, url, host: hostOf(fetched.url || url),
      status: fetched.status,
      error: fetched.error || `http_${fetched.status}`,
      rows: []
    };
  }

  // Wikipedia returns 200 even for "page does not exist" sometimes — check
  if (/Wikipedia does not have an article with this exact name/i.test(fetched.text)) {
    return { ok: false, url, host: hostOf(fetched.url || url), status: 404, error: "article_not_found", rows: [] };
  }

  const tables = extractTables(fetched.text);
  let bestTable = { rows: [], arithmeticOk: 0, index: -1 };
  for (const table of tables) {
    const interp = interpretTable(table);
    if (interp.arithmeticOk > bestTable.arithmeticOk) {
      bestTable = { ...interp, index: table.index, isWikitable: table.isWikitable };
    }
  }

  return {
    ok: bestTable.rows.length > 0,
    url, host: hostOf(fetched.url || url),
    status: fetched.status,
    tableCount: tables.length,
    selectedTableIndex: bestTable.index,
    arithmeticValidRows: bestTable.arithmeticOk || 0,
    parseMethod: "wikitable",
    rows: bestTable.rows
  };
}

// Tries multiple candidate URLs, returns first that yields rows
export async function parseWikipediaStandingsMulti(leagueName, season, altNames = [], options = {}) {
  const urls = buildWikipediaCandidateUrls(leagueName, season, altNames);
  const attempts = [];

  for (const url of urls) {
    const result = await parseWikipediaStandings(url, options);
    attempts.push({ url, ok: result.ok, rows: result.rows.length, error: result.error || null });
    if (result.ok && result.rows.length >= 4) {
      return { ...result, attempts };
    }
  }

  return {
    ok: false,
    rows: [],
    attempts,
    error: "no_candidate_url_yielded_table"
  };
}
