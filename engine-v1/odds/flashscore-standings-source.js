/**
 * flashscore-standings-source.js
 *
 * The AUTHORITATIVE league table, read from Flashscore's mobile site instead of
 * being guessed. Discovered 2026-07-14 (bra.2 was 4 matchdays stale): the wire
 * day feed (f_1_*) already labels every league section with ZE (tournamentId)
 * and ZC (tournamentStageId), and
 *   https://www.flashscore.mobi/standings/{tournamentId}/{stageId}/
 * returns the CURRENT standings as plain server-rendered HTML — the same table
 * the Flashscore app shows (verified: Serie B Criciuma 17 played / 33 pts).
 *
 * No API key. Same politeness rules as the other Flashscore sources.
 */

const UA = "Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Parse the mobi standings HTML into table rows. The page renders one or more
 * <table> blocks (overall first; split-season/group leagues render one per
 * group). Row shape: <td>1.</td><td class="left">Team</td><td>P</td><td>W</td>
 * <td>D</td><td>L</td><td>G "20:12"</td><td>Pts</td>.
 *
 * Returns { rows, groups } where rows = the FIRST (overall) table and groups =
 * every table found (for future group support). Empty rows when nothing parses.
 */
export function parseMobiStandings(html) {
  const groups = [];
  const tables = String(html || "").split(/<table/i).slice(1);

  for (const chunk of tables) {
    const body = chunk.split(/<\/table>/i)[0] || "";
    const rows = [];
    for (const tr of body.split(/<tr[^>]*>/i).slice(1)) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => stripTags(m[1]));
      if (cells.length < 8) continue;

      const position = Number(String(cells[0]).replace(/\.$/, ""));
      const teamName = cells[1];
      const played = Number(cells[2]);
      const wins = Number(cells[3]);
      const draws = Number(cells[4]);
      const losses = Number(cells[5]);
      const gm = String(cells[6]).match(/^(\d+)\s*:\s*(\d+)$/);
      const points = Number(cells[7]);

      if (!teamName || !Number.isFinite(position) || !Number.isFinite(played) || !Number.isFinite(points)) continue;

      const goalsFor = gm ? Number(gm[1]) : null;
      const goalsAgainst = gm ? Number(gm[2]) : null;
      rows.push({
        position, teamName, played, wins, draws, losses,
        goalsFor, goalsAgainst,
        goalDifference: gm ? goalsFor - goalsAgainst : null,
        points
      });
    }
    if (rows.length) groups.push(rows);
  }

  return { rows: groups[0] || [], groups };
}

/**
 * Fetch the current standings for a tournament (ids from the day feed's ZE/ZC).
 * Returns { ok, rows, groups, url, status } — ok only when a plausible table
 * parsed (>=4 rows, sane played counts).
 */
export async function fetchFlashscoreStandings(tournamentId, stageId, { timeoutMs = 15000 } = {}) {
  const url = `https://www.flashscore.mobi/standings/${tournamentId}/${stageId}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": UA, "referer": "https://www.flashscore.mobi/" }
    });
    const text = res.ok ? await res.text() : "";
    const { rows, groups } = parseMobiStandings(text);
    const plausible =
      rows.length >= 4 &&
      rows.every(r => Number.isFinite(r.played) && r.played >= 0 && r.played < 200);
    return { ok: res.ok && plausible, status: res.status, url, rows, groups };
  } catch (err) {
    return {
      ok: false, status: 0, url, rows: [], groups: [],
      error: err?.name === "AbortError" ? "timeout" : String(err?.message || err)
    };
  } finally {
    clearTimeout(timer);
  }
}
