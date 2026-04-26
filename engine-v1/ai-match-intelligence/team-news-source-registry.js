function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLeagueSlug(value) {
  return normalizeText(value).toLowerCase();
}

function uniqByUrl(rows) {
  const seen = new Set();
  const out = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const url = normalizeText(row?.url);
    if (!url) continue;

    const key = url.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(row);
  }

  return out;
}

const GLOBAL_FOOTBALL_SOURCES = [
  {
    id: "transfermarkt-search",
    label: "Transfermarkt search",
    type: "search_url",
    trustTier: "reference",
    buildUrls(input) {
      const team = encodeURIComponent(normalizeText(input?.team));
      return [
        `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${team}`
      ];
    }
  },
  {
    id: "worldfootball-search",
    label: "WorldFootball search",
    type: "search_url",
    trustTier: "reference",
    buildUrls(input) {
      const team = encodeURIComponent(normalizeText(input?.team));
      return [
        `https://www.worldfootball.net/search/?q=${team}`
      ];
    }
  },
  {
    id: "soccerway-search",
    label: "Soccerway search",
    type: "search_url",
    trustTier: "reference",
    buildUrls(input) {
      const team = encodeURIComponent(normalizeText(input?.team));
      return [
        `https://int.soccerway.com/search/?q=${team}`
      ];
    }
  }
];

const LEAGUE_SOURCE_REGISTRY = {
  "chi.1": [
    {
      id: "campeonato-chileno",
      label: "Campeonato Chileno",
      type: "site_search",
      trustTier: "league",
      buildUrls(input) {
        const team = encodeURIComponent(normalizeText(input?.team));
        return [
          `https://campeonatochileno.cl/?s=${team}`
        ];
      }
    },
    {
      id: "palestino-official",
      label: "Club Deportivo Palestino official site",
      type: "official_club",
      trustTier: "official",
      teams: [
        "palestino"
      ],
      buildUrls() {
        return [
          "https://palestino.cl/",
          "https://palestino.cl/noticias/"
        ];
      }
    }
  ],

  "col.1": [
    {
      id: "dimayor",
      label: "DIMAYOR official site",
      type: "site_search",
      trustTier: "league",
      buildUrls(input) {
        const team = encodeURIComponent(normalizeText(input?.team));
        return [
          `https://dimayor.com.co/?s=${team}`
        ];
      }
    },
    {
      id: "millonarios-official",
      label: "Millonarios official site",
      type: "official_club",
      trustTier: "official",
      teams: [
        "millonarios"
      ],
      buildUrls() {
        return [
          "https://millonarios.com.co/",
          "https://millonarios.com.co/noticias/"
        ];
      }
    },
    {
      id: "deportes-tolima-official",
      label: "Deportes Tolima official site",
      type: "official_club",
      trustTier: "official",
      teams: [
        "deportes tolima"
      ],
      buildUrls() {
        return [
          "https://clubdeportestolima.com.co/"
        ];
      }
    },
    {
      id: "santa-fe-official",
      label: "Independiente Santa Fe official site",
      type: "official_club",
      trustTier: "official",
      teams: [
        "independiente santa fe",
        "santa fe"
      ],
      buildUrls() {
        return [
          "https://independientesantafe.com/"
        ];
      }
    }
  ],

  "jpn.1": [
    {
      id: "jleague-official",
      label: "J.League official site",
      type: "league",
      trustTier: "league",
      buildUrls(input) {
        const team = encodeURIComponent(normalizeText(input?.team));
        return [
          `https://www.jleague.co/search/?q=${team}`,
          "https://www.jleague.co/news/"
        ];
      }
    },
    {
      id: "kashiwa-reysol-official",
      label: "Kashiwa Reysol official site",
      type: "official_club",
      trustTier: "official",
      teams: [
        "kashiwa reysol"
      ],
      buildUrls() {
        return [
          "https://www.reysol.co.jp/",
          "https://www.reysol.co.jp/news/"
        ];
      }
    },
    {
      id: "kashima-antlers-official",
      label: "Kashima Antlers official site",
      type: "official_club",
      trustTier: "official",
      teams: [
        "kashima antlers"
      ],
      buildUrls() {
        return [
          "https://www.antlers.co.jp/",
          "https://www.antlers.co.jp/news/"
        ];
      }
    },
    {
      id: "fc-tokyo-official",
      label: "FC Tokyo official site",
      type: "official_club",
      trustTier: "official",
      teams: [
        "fc tokyo"
      ],
      buildUrls() {
        return [
          "https://www.fctokyo.co.jp/",
          "https://www.fctokyo.co.jp/news/"
        ];
      }
    }
  ]
};

function sourceAppliesToTeam(source, input) {
  const teams = Array.isArray(source?.teams) ? source.teams : [];
  if (teams.length === 0) return true;

  const team = normalizeText(input?.team).toLowerCase();

  return teams.some(name => {
    const normalizedName = normalizeText(name).toLowerCase();
    return normalizedName && team.includes(normalizedName);
  });
}

function expandSource(source, input) {
  if (!source || typeof source.buildUrls !== "function") return [];

  const urls = source.buildUrls(input);

  return (Array.isArray(urls) ? urls : [])
    .map(url => ({
      id: source.id,
      label: source.label,
      type: source.type,
      trustTier: source.trustTier,
      url: normalizeText(url),
      sourceMode: "registry"
    }))
    .filter(row => row.url);
}

export function getTeamNewsSourcesForTask(input = {}) {
  const leagueSlug = normalizeLeagueSlug(input?.leagueSlug);

  const leagueSources = LEAGUE_SOURCE_REGISTRY[leagueSlug] || [];

  const selectedLeagueSources = leagueSources
    .filter(source => sourceAppliesToTeam(source, input))
    .flatMap(source => expandSource(source, input));

  const globalSources = GLOBAL_FOOTBALL_SOURCES
    .flatMap(source => expandSource(source, input));

  return uniqByUrl([
    ...selectedLeagueSources,
    ...globalSources
  ]);
}

export function getKnownTeamNewsLeagueSlugs() {
  return Object.keys(LEAGUE_SOURCE_REGISTRY);
}