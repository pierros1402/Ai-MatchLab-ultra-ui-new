/**
 * transfermarkt-absences-source.js
 *
 * Current injuries + suspensions for a whole competition from Transfermarkt's
 * per-competition "Suspensions and injuries" page — one fetch covers every club:
 *
 *   page: /x/sperrenausfaelle/wettbewerb/{TM_CODE}
 *
 * Same accessibility story as the referee source (fbref/sofascore 403 us; TM
 * serves fine, via tm-proxy on GitHub runners). The competition NAME is parsed
 * from <title>, so a wrong code mapping is visible rather than silently wrong.
 *
 * Row fields: player, position, reason ("Ankle injury", "Red card suspension"),
 * "out until" date, missed-games count, and the club (logo anchor title).
 */

import { tmFetch } from "./transfermarkt-fetch.js";
import { TM_COMPETITIONS } from "./transfermarkt-referee-source.js";

// Codes verified live 2026-07-05 (HTTP 200 + correct competition title) for the
// summer-active leagues the referee map lacked. Micro leagues TM has no
// competition page for (chn.2, mda.1, mar.2, mwi.1, som.1, zim.1, eth.1, tan.1)
// stay unmapped: their teams keep a truthful "no source" status instead.
const TM_ABSENCE_EXTRA = {
  "arg.2": "ARG2",
  "kor.2": "RSK2",
  "chn.1": "CSL",
  "usa.2": "USL",
  "ecu.1": "EL1S",
  "est.1": "EST1",
  "est.2": "EST2",
  "lva.1": "LET1",
  "lva.2": "LET2",
  "ltu.1": "LI1",
  "fin.2": "FI2",
  "fro.1": "FARO",
  "kaz.1": "KAS1",
  "blr.1": "WER1",
  "blr.2": "WER2",
  "mar.1": "MAR1",
  "can.1": "CDN1",
  "uru.2": "URU2"
};

export const TM_ABSENCE_COMPETITIONS = {
  ...TM_COMPETITIONS,
  ...TM_ABSENCE_EXTRA
};

function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseCompetitionName(html) {
  const t = String(html || "").match(/<title>([\s\S]*?)<\/title>/);
  if (!t) return null;
  return t[1]
    .replace(/\s*[-|]\s*Suspensions and injuries.*$/i, "")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function classifyAbsenceType(reason) {
  return /susp|sperr|ban(?:ned)?\b|red card|yellow card/i.test(String(reason || ""))
    ? "suspension"
    : "injury";
}

/**
 * Parse the "Suspensions and injuries" items table.
 * Rows nest an inline-table for the player photo/name (same layout as the
 * referee page), so anchor on each player profile link and read the slice up
 * to the next player.
 */
export function parseAbsencesTable(html) {
  const startIdx = String(html || "").indexOf('<table class="items"');
  if (startIdx < 0) return [];
  const scope = String(html).slice(startIdx);

  const anchors = [...scope.matchAll(
    /<a [^>]*href="\/[^"]*\/profil\/spieler\/(\d+)"[^>]*>([^<]+)<\/a>/g
  )];

  const out = [];
  for (let i = 0; i < anchors.length; i++) {
    const playerId = anchors[i][1];
    const player = stripTags(anchors[i][2]);
    const start = anchors[i].index;
    const end = i + 1 < anchors.length ? anchors[i + 1].index : scope.length;
    const slice = scope.slice(start, end);

    // Club = the logo anchor's title (players link to /profil/spieler, clubs
    // to /verein — the title sits on the club anchor wrapping the crest img).
    const club =
      (slice.match(/<a[^>]*title="([^"]+)"[^>]*href="\/[^"]*verein\/\d+[^"]*"[^>]*>\s*<img/) ||
       slice.match(/<a[^>]*href="\/[^"]*verein\/\d+[^"]*"[^>]*title="([^"]+)"[^>]*>\s*<img/) ||
       slice.match(/title="([^"]+)"[^>]*>\s*<img[^>]*class="tiny_wappen/) ||
       [])[1] || null;

    const cells = [...slice.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => stripTags(m[1]));

    // Column layout: [position, (photo cell), reason, until, missed, value].
    // Read defensively: date cell = dd/mm/yyyy, missed = pure integer,
    // reason = first text cell that is none of position/date/int/money.
    const position = cells[0] || null;
    const until = cells.find(c => /^\d{2}\/\d{2}\/\d{4}$/.test(c)) || null;
    const missedGames = (() => {
      const v = cells.find(c => /^\d{1,2}$/.test(c));
      return v ? Number(v) : null;
    })();
    const reason = cells.find((c, idx) =>
      idx > 0 &&
      c &&
      c !== position &&
      !/^\d{2}\/\d{2}\/\d{4}$/.test(c) &&
      !/^\d{1,3}$/.test(c) &&
      !/^€|^\?$|^-$/.test(c) &&
      c.toLowerCase() !== player.toLowerCase()
    ) || null;

    if (!player) continue;

    out.push({
      playerId,
      player,
      position,
      club,
      reason,
      type: classifyAbsenceType(reason),
      until,
      missedGames
    });
  }

  return out;
}

/**
 * Fetch current suspensions + injuries for one of our league slugs.
 * Never throws: { ok:false, reason } on any failure.
 */
export async function fetchCompetitionAbsences(slug) {
  const code = TM_ABSENCE_COMPETITIONS[String(slug || "").trim()];
  if (!code) {
    return { ok: false, slug, reason: "no_tm_code" };
  }

  const path = `/x/sperrenausfaelle/wettbewerb/${code}`;
  const url = `https://www.transfermarkt.com${path}`;

  let res;
  try {
    res = await tmFetch(path);
  } catch (err) {
    return { ok: false, slug, code, url, reason: `fetch_failed: ${err?.message || err}` };
  }

  if (!res.ok) {
    return { ok: false, slug, code, url, reason: `http_${res.status}` };
  }

  const html = await res.text();
  const competitionName = parseCompetitionName(html);
  const absences = parseAbsencesTable(html);

  const byClub = new Map();
  for (const row of absences) {
    const club = String(row.club || "").trim();
    if (!club) continue;
    if (!byClub.has(club)) byClub.set(club, []);
    byClub.get(club).push(row);
  }

  return {
    ok: true,
    slug,
    code,
    url,
    competitionName,
    fetchedAt: new Date().toISOString(),
    absenceCount: absences.length,
    absences,
    byClub
  };
}
