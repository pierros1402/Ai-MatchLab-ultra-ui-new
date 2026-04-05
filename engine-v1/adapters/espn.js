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

    // raw ESPN status for downstream mapping
    rawStatus,

    // keep the state too — downstream can map from rawStatus/state
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
      events: normalizePayloadEvents(data, slug)
    };
  } catch (e) {
    console.log("[espn adapter] fatal", slug, date, e?.message || e);
    return { events: [] };
  }
}