import { ESPN_BASE } from "../config.js";
import { shiftDay, athensDayFromKickoff } from "../core/daykey.js";

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

    if (!res.ok) {
      console.log("[espn adapter] fetch error", slug, date, res.status);
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

    return data;
  } catch (e) {
    console.log("[espn adapter] fatal", slug, date, e?.message || e);
    return { events: [] };
  }
}