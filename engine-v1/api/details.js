import fs from "fs";
import { getFixtureById } from "../storage/json-db.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";
import { buildDetailsForMatch } from "../jobs/build-details-day.js";
import { readOdds, findOddsByTeams } from "../storage/odds-memory-db.js";
import { teamDisciplineRates } from "../storage/discipline-memory-db.js";
import { teamPlayerUsage } from "../storage/lineups-memory-db.js";
import { readStandings } from "../storage/standings-memory-db.js";
import { buildTravelContext } from "../core/travel-context.js";
import { teamFormRates } from "../storage/results-memory-db.js";

const r1 = v => (v == null ? null : Math.round(v * 10) / 10);

function normName(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findStandingRow(rows, team) {
  const n = normName(team);
  return rows.find(r => { const x = normName(r.teamName); return x === n || x.includes(n) || n.includes(x); }) || null;
}

// Map our appointed-referee tendencies (from aiAssessment.referee) to the shape the
// details panel already renders: { name, style, stats:{avgCards, avgPenalties} }.
function mapReferee(r) {
  if (!r || !r.name) return null;
  const cards = (Number(r.yellowPerGame) || 0) + (Number(r.redPerGame) || 0);
  const round2 = v => (v == null ? null : Math.round(v * 100) / 100);
  const style = cards >= 4.5 ? "strict" : cards <= 2.5 ? "lenient" : "balanced";
  return {
    name: r.name,
    style,
    stats: { avgCards: round2(cards), avgPenalties: round2(r.penPerGame) },
    appearances: r.appearances ?? null,
    source: r.source || "transfermarkt"
  };
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function kickoffDay(match) {
  if (match?.dayKey) return String(match.dayKey);
  if (match?.kickoffUtc) return athensDayFromKickoff(match.kickoffUtc);
  return null;
}

function readValueForMatch(dayKey, matchId) {
  const file = resolveDataPath("value", `${dayKey}.json`);
  const payload = readJsonSafe(file, null);
  const picks = Array.isArray(payload?.picks) ? payload.picks : [];
  return picks.filter(p => String(p?.matchId) === String(matchId));
}

/**
 * Merge our odds-memory data (form-aware assessment + appointed referee + per-team
 * discipline) into a details snapshot — used by BOTH the runtime payload and the
 * production snapshot path, so our estimates show whether or not a pre-built
 * snapshot exists. Never clobbers fields the platform builder already produced.
 */
export function enrichSnapshotWithAssessment(snapshot, matchId, leagueSlug, homeTeam, awayTeam, leagueName) {
  const out = snapshot || {};
  // Match by our id, else by team names (canonical/UI id differs from our fs_ id).
  const rec = readOdds(String(matchId)) || findOddsByTeams(homeTeam, awayTeam);

  // Basic context (competition + teams) so the panel shows them for our fs_ matches.
  if (!out.basic || !out.basic.leagueName) {
    out.basic = {
      ...(out.basic || {}),
      leagueName: out.basic?.leagueName || leagueName || rec?.competition || null,
      leagueSlug: out.basic?.leagueSlug || leagueSlug || null,
      homeTeam: out.basic?.homeTeam || homeTeam || null,
      awayTeam: out.basic?.awayTeam || awayTeam || null
    };
  }
  if (!out.leagueName) out.leagueName = leagueName || rec?.competition || null;

  // Table context (positions) from our standings.
  if (leagueSlug && (!out.context || !out.context.table)) {
    const rows = readStandings(leagueSlug)?.accepted?.rows;
    if (Array.isArray(rows) && rows.length) {
      const h = findStandingRow(rows, homeTeam), a = findStandingRow(rows, awayTeam);
      if (h || a) {
        out.context = out.context || {};
        out.context.table = {
          homePosition: h?.position ?? null, awayPosition: a?.position ?? null, totalTeams: rows.length
        };
      }
    }
  }

  // Travel (distance / impact) from team-geo — reuse the platform's builder.
  if (!out.travel || out.travel.status === "empty") {
    const tc = buildTravelContext({ homeTeam, awayTeam });
    if (tc && tc.status !== "empty" && tc.data) {
      out.travel = { status: tc.status, ...tc.data };
      out.context = out.context || {};
      if (tc.data.impact && !out.context.travelImpact) out.context.travelImpact = tc.data.impact;
    }
  }

  const referee = mapReferee(rec?.aiAssessment?.referee);
  if (referee && (!out.referee || !out.referee.name)) out.referee = referee;

  if (rec?.aiAssessment && !out.assessment) {
    out.assessment = {
      model: rec.aiAssessment.model || null,
      markets: rec.aiAssessment.markets || null
    };
  }
  if (leagueSlug && !out.discipline) {
    out.discipline = {
      home: teamDisciplineRates(leagueSlug, homeTeam),
      away: teamDisciplineRates(leagueSlug, awayTeam)
    };
  }

  // Player usage (expected XI from accumulated lineups) — fills the details
  // panel's "Player Usage Intel" when the platform's gated subsystem has none.
  if (leagueSlug) {
    const usageFor = (team, side) => {
      const u = teamPlayerUsage(leagueSlug, team);
      if (!u.sample) return null;
      return {
        team, side, leagueSlug, status: "available",
        sampleMatches: u.sample,
        confidence: Math.min(0.9, 0.4 + u.sample * 0.06),
        expectedStarters: u.expectedStarters.map(p => ({ name: p.name, frequency: p.freq })),
        coreStarters: u.coreStarters,
        confirmedAbsences: [], inferredAbsences: [],
        source: "flashscore-lineups"
      };
    };
    const h = usageFor(homeTeam, "home");
    const a = usageFor(awayTeam, "away");
    if (h || a) {
      const prev = out.playerUsageIntel || {};
      out.playerUsageIntel = { home: h || prev.home || null, away: a || prev.away || null };
    }
  }

  // Motivation inferred from table position (no platform competition-state needed).
  const tbl = out.context?.table;
  if (tbl && tbl.totalTeams && (!out.context.motivation || out.context.motivation === "unknown")) {
    const band = Math.max(2, Math.ceil(tbl.totalTeams * 0.22));
    const zone = pos => !pos ? null
      : pos <= band ? "europe_race"
      : pos > tbl.totalTeams - band ? "relegation_battle" : "mid_table";
    const h = zone(tbl.homePosition), a = zone(tbl.awayPosition);
    out.context.motivation =
      (h === "relegation_battle" || a === "relegation_battle") ? "relegation_battle"
      : (h === "europe_race" || a === "europe_race") ? "europe_race" : "mid_table";
    out.context.importance = out.context.motivation === "mid_table" ? "normal" : "high";
  }

  // Form guide from accumulated results + a plain Match-Analysis summary, so the
  // panel isn't blank for our matches even before the platform builder runs.
  if (leagueSlug) {
    const hf = teamFormRates(leagueSlug, homeTeam), af = teamFormRates(leagueSlug, awayTeam);
    if (!out.formGuide && (hf.sample || af.sample)) {
      out.formGuide = {
        home: hf.sample ? { ppg: r1(hf.ppg), gfPerGame: r1(hf.gfRate), gaPerGame: r1(hf.gaRate), sample: hf.sample } : null,
        away: af.sample ? { ppg: r1(af.ppg), gfPerGame: r1(af.gfRate), gaPerGame: r1(af.gaRate), sample: af.sample } : null
      };
    }
    if (!out.analysis?.summary) {
      const parts = [];
      if (out.basic?.leagueName) parts.push(out.basic.leagueName);
      if (tbl?.homePosition && tbl?.awayPosition) parts.push(`${homeTeam} #${tbl.homePosition} vs ${awayTeam} #${tbl.awayPosition} of ${tbl.totalTeams}`);
      if (hf.sample) parts.push(`${homeTeam} ${r1(hf.ppg)} ppg (last ${hf.sample})`);
      if (af.sample) parts.push(`${awayTeam} ${r1(af.ppg)} ppg (last ${af.sample})`);
      const pr = out.assessment?.markets?.["1X2"]?.probs;
      if (pr) {
        const fav = pr.home >= pr.draw && pr.home >= pr.away ? homeTeam
          : pr.away >= pr.draw && pr.away >= pr.home ? awayTeam : "the draw";
        parts.push(`AI lean: ${fav}`);
      }
      if (parts.length >= 2) { const s = parts.join(". ") + "."; out.analysis = { summary: { en: s, el: s } }; }
    }
  }
  return out;
}

export async function getDetailsPayload(matchId, { rebuild = false } = {}) {
  let match = getFixtureById(String(matchId));

  // Our autonomous Flashscore matches (fs_*) live in odds-memory, not the canonical
  // json-db, so fall back to that record for the match basics.
  if (!match) {
    const odds = readOdds(String(matchId));
    if (odds) {
      match = {
        matchId: String(matchId),
        leagueSlug: odds.leagueSlug || null,
        leagueName: odds.competition || null,
        homeTeam: odds.home || null,
        awayTeam: odds.away || null,
        kickoffUtc: odds.kickoffUtc || null,
        dayKey: odds.dayKey || null,
        status: "SCHEDULED"
      };
    }
  }

  if (!match) {
    return { ok: false, error: "match_not_found", matchId: String(matchId) };
  }

  const dayKey = kickoffDay(match);

  if (!dayKey) {
    return { ok: false, error: "missing_day_key", matchId: String(matchId) };
  }

  const detailsFile = resolveDataPath("details", dayKey, `${match.matchId}.json`);

  let snapshot = readJsonSafe(detailsFile, null);

  if (!snapshot || rebuild) {
    try {
      const built = await buildDetailsForMatch(match.matchId, { rebuild });
      snapshot = built?.details || null;
    } catch {
      // Builder only knows canonical matches; ours still get the referee merge below.
      snapshot = snapshot || null;
    }
  }

  // Merge our assessment / referee / discipline (form-aware fair odds for EVERY
  // priced match, independent of the value run) into the snapshot.
  snapshot = enrichSnapshotWithAssessment(
    snapshot, match.matchId, match.leagueSlug, match.homeTeam, match.awayTeam, match.leagueName
  );
  const assessment = snapshot?.assessment || null;
  const discipline = snapshot?.discipline || null;

  const value = readValueForMatch(dayKey, match.matchId);

  return {
    ok: true,
    matchId: String(match.matchId),
    dayKey,
    basic: {
      matchId: String(match.matchId),
      leagueSlug: match.leagueSlug || null,
      leagueName: match.leagueName || null,
      homeTeam: match.homeTeam || null,
      awayTeam: match.awayTeam || null,
      kickoffUtc: match.kickoffUtc || null,
      status: match.status || null,
      rawStatus: match.rawStatus || null,
      minute: match.minute || null,
      scoreHome: Number.isFinite(Number(match.scoreHome)) ? Number(match.scoreHome) : null,
      scoreAway: Number.isFinite(Number(match.scoreAway)) ? Number(match.scoreAway) : null,
      venue: match.venue || null
    },
    value,
    assessment,
    discipline,
    snapshot,
    meta: {
      hasSnapshot: !!snapshot,
      hasAssessment: !!assessment,
      hasValue: value.length > 0,
      isLive: String(match.status || "").toUpperCase() === "LIVE",
      isFinal: String(match.status || "").toUpperCase() === "FT",
      version: "details-api-v1"
    }
  };
}