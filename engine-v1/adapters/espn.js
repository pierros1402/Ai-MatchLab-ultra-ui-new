import { ESPN_BASE } from "../config.js";
import { shiftDay, athensDayFromKickoff } from "../core/daykey.js";

function normalizeEvent(e, fallbackLeagueSlug = null) {
  const comp = e?.competitions?.[0] || {};
  const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];

  const home =
    competitors.find(c => c?.homeAway === "home") ||
    competitors[0] ||
    {};

  const away =
    competitors.find(c => c?.homeAway === "away") ||
    competitors[1] ||
    {};

  const statusObj = comp?.status || e?.status || {};
  const statusType = statusObj?.type || {};

  const rawStatus =
    statusType?.name ||
    statusType?.description ||
    "";

  const state =
    statusType?.state ||
    "";

  const leagueSlug =
    e?.leagues?.[0]?.slug ||
    comp?.league?.slug ||
    fallbackLeagueSlug ||
    null;

  const leagueName =
    e?.leagues?.[0]?.name ||
    comp?.league?.name ||
    null;

  const homeScoreRaw = home?.score;
  const awayScoreRaw = away?.score;

  const scoreHome =
    homeScoreRaw == null || homeScoreRaw === ""
      ? null
      : Number(homeScoreRaw);

  const scoreAway =
    awayScoreRaw == null || awayScoreRaw === ""
      ? null
      : Number(awayScoreRaw);

  return {
    id: e?.id || null,
    matchId: e?.id || null,

    leagueSlug,
    leagueName,

    homeTeam:
      home?.team?.displayName ||
      home?.team?.shortDisplayName ||
      null,

    awayTeam:
      away?.team?.displayName ||
      away?.team?.shortDisplayName ||
      null,

    kickoffUtc:
      comp?.date ||
      e?.date ||
      null,

    rawStatus,
    status: state || rawStatus || "",

    minute:
      statusObj?.displayClock ||
      null,

    scoreHome:
      Number.isFinite(scoreHome) ? scoreHome : null,

    scoreAway:
      Number.isFinite(scoreAway) ? scoreAway : null,

    venue:
      comp?.venue?.fullName ||
      comp?.venue?.address?.city ||
      null
  };
}

function normalizePayloadEvents(data, fallbackLeagueSlug = null) {
  const events = Array.isArray(data?.events) ? data.events : [];
  return events.map(e => normalizeEvent(e, fallbackLeagueSlug));
}

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractPenaltyInfoFromSummary(data) {
  const headerComp =
    data?.header?.competitions?.[0] ||
    null;

  const comp =
    data?.boxscore?.teams?.length
      ? null
      : (data?.gamepackageJSON?.header?.competitions?.[0] || null);

  const competition =
    headerComp ||
    data?.competitions?.[0] ||
    data?.header?.events?.[0]?.competitions?.[0] ||
    comp ||
    null;

  const competitors = Array.isArray(competition?.competitors)
    ? competition.competitors
    : [];

  const home =
    competitors.find(c => c?.homeAway === "home") ||
    competitors[0] ||
    null;

  const away =
    competitors.find(c => c?.homeAway === "away") ||
    competitors[1] ||
    null;

  const homeShootout =
    safeNum(home?.shootoutScore) ??
    safeNum(home?.shootout?.score) ??
    safeNum(home?.penaltyScore);

  const awayShootout =
    safeNum(away?.shootoutScore) ??
    safeNum(away?.shootout?.score) ??
    safeNum(away?.penaltyScore);

  const detail =
    String(
      competition?.status?.type?.detail ||
      competition?.status?.detail ||
      data?.header?.competitions?.[0]?.status?.type?.detail ||
      ""
    ).toUpperCase();

  const shortDetail =
    String(
      competition?.status?.type?.shortDetail ||
      data?.header?.competitions?.[0]?.status?.type?.shortDetail ||
      ""
    ).toUpperCase();

  const noteTexts = [
    ...(Array.isArray(data?.notes) ? data.notes.map(x => x?.headline || x?.text || "") : []),
    ...(Array.isArray(competition?.notes) ? competition.notes.map(x => x?.headline || x?.text || "") : [])
  ]
    .map(x => String(x || ""))
    .filter(Boolean);

  const notesJoined = noteTexts.join(" | ").toUpperCase();

  const hasPensSignal =
    detail.includes("PEN") ||
    shortDetail.includes("PEN") ||
    notesJoined.includes("PENALT");

  if (
    Number.isFinite(homeShootout) &&
    Number.isFinite(awayShootout)
  ) {
    return {
      penalties: {
        home: homeShootout,
        away: awayShootout
      },
      decidedBy: "pens"
    };
  }

  if (hasPensSignal) {
    return {
      penalties: null,
      decidedBy: "pens"
    };
  }

  return {
    penalties: null,
    decidedBy: null
  };
}

export async function fetchLeagueFixtures(slug, date = null) {
  try {
    const espnDate = date ? date.replaceAll("-", "") : null;

    const url = date
      ? `${ESPN_BASE}/${slug}/scoreboard?limit=300&dates=${espnDate}`
      : `${ESPN_BASE}/${slug}/scoreboard?limit=300`;

    const res = await fetch(url);

    if (res.status === 404) {
      return { events: [] };
    }

    if (res.status === 400 || res.status === 404) {
      console.log("[espn adapter] skip", slug, date, res.status);
      await res.body?.cancel?.();
      return { events: [] };
    }

    if (!res.ok) {
      console.log("[espn adapter] fetch error", slug, date, res.status);
      await res.body?.cancel?.();
      return { events: [] };
    }

    let data = await res.json();

    if (!data?.events?.length && date) {
      const fallbackUrl = `${ESPN_BASE}/${slug}/scoreboard?limit=300`;
      const fallbackRes = await fetch(fallbackUrl);

      if (!fallbackRes.ok) {
        return { events: [] };
      }

      const fallbackData = await fallbackRes.json();
      const targetDay = date;

      const filtered = (fallbackData.events || []).filter(e => {
        const kickoff = e?.date || e?.competitions?.[0]?.date;
        if (!kickoff) return false;

        const rawDay = kickoff.slice(0, 10);
        const athensDay = athensDayFromKickoff(kickoff);

        return (
          rawDay === targetDay ||
          rawDay === shiftDay(targetDay, -1) ||
          rawDay === shiftDay(targetDay, 1) ||
          athensDay === targetDay
        );
      });

      data = { events: filtered };
    }

    return {
      events: Array.isArray(data?.events) ? data.events : []
    };
  } catch (e) {
    console.log("[espn adapter] fatal", slug, date, e?.message || e);
    return { events: [] };
  }
}

export async function fetchMatchSummary(slug, matchId) {
  try {
    if (!slug || !matchId) {
      return {
        ok: false,
        reason: "missing_slug_or_match",
        penalties: null,
        decidedBy: null
      };
    }

    const url = `${ESPN_BASE}/${slug}/summary?event=${encodeURIComponent(matchId)}`;
    const res = await fetch(url);

    if (res.status === 400 || res.status === 404) {
      await res.body?.cancel?.();
      return {
        ok: false,
        reason: `http_${res.status}`,
        penalties: null,
        decidedBy: null
      };
    }

    if (!res.ok) {
      await res.body?.cancel?.();
      return {
        ok: false,
        reason: `http_${res.status}`,
        penalties: null,
        decidedBy: null
      };
    }

    const data = await res.json();
    const extracted = extractPenaltyInfoFromSummary(data);

    return {
      ok: true,
      reason: "summary_loaded",
      penalties: extracted.penalties,
      decidedBy: extracted.decidedBy
    };
  } catch (e) {
    return {
      ok: false,
      reason: e?.message || "summary_fetch_failed",
      penalties: null,
      decidedBy: null
    };
  }
}