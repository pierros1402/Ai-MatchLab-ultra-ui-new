const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

function format(d) {
  return d.replaceAll("-", "");
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default {
  name: "espn",

  supportsLeague() {
    return true;
  },

  async fetchRange(league, season, fromDate, toDate) {
    let current = fromDate;
    const all = [];

    while (current <= toDate) {
      const dateStr = format(current);
      const url = `${BASE}/${league}/scoreboard?dates=${dateStr}-${dateStr}`;

      try {
        const r = await fetch(url);
        const data = await r.json();

        if (data.events) {
          for (const e of data.events) {
            all.push({
              id: e.id,
              league,
              season,
              home: e.competitions?.[0]?.competitors?.[0]?.team?.displayName,
              away: e.competitions?.[0]?.competitors?.[1]?.team?.displayName,
              date: e.date,
              status: e.status?.type?.name,
              source: "espn"
            });
          }
        }
      } catch (_) {}

      current = addDays(current, 1);
    }

    return all;
  }
};