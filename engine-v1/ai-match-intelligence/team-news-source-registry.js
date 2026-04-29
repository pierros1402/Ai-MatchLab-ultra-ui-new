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

  "uefa.champions": [
    {
      id: "uefa-champions-news",
      label: "UEFA Champions League official news",
      type: "competition_news",
      trustTier: "league",
      buildUrls(input) {
        const team = encodeURIComponent(normalizeText(input?.team));
        return [
          "https://www.uefa.com/uefachampionsleague/news/",
          `https://www.uefa.com/uefachampionsleague/search/?q=${team}`
        ];
      }
    },
    {
      id: "psg-official-news",
      label: "Paris Saint-Germain official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["psg", "paris saint-germain", "paris saint germain"],
      buildUrls() {
        return [
          "https://en.psg.fr/teams/first-team/content/news",
          "https://www.psg.fr/equipes/equipe-premiere/content/actualite"
        ];
      }
    },
    {
      id: "bayern-official-news",
      label: "Bayern Munich official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["bayern munich", "bayern", "fc bayern", "fc bayern munich"],
      buildUrls() {
        return [
          "https://fcbayern.com/en/news",
          "https://fcbayern.com/en/teams/professionals"
        ];
      }
    },
    {
      id: "real-madrid-official-news",
      label: "Real Madrid official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["real madrid"],
      buildUrls() {
        return [
          "https://www.realmadrid.com/en-US/news/football/first-team",
          "https://www.realmadrid.com/en-US/football/first-team"
        ];
      }
    },
    {
      id: "barcelona-official-news",
      label: "FC Barcelona official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["barcelona", "fc barcelona"],
      buildUrls() {
        return [
          "https://www.fcbarcelona.com/en/football/first-team/news",
          "https://www.fcbarcelona.com/en/football/first-team/players"
        ];
      }
    }
  ],

  "eng.1": [
    {
      id: "premierleague-news",
      label: "Premier League official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return [
          "https://www.premierleague.com/en/news"
        ];
      }
    },
    {
      id: "arsenal-official-news",
      label: "Arsenal official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["arsenal"],
      buildUrls() { return ["https://www.arsenal.com/news"]; }
    },
    {
      id: "aston-villa-official-news",
      label: "Aston Villa official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["aston villa"],
      buildUrls() { return ["https://www.avfc.co.uk/news/"]; }
    },
    {
      id: "bournemouth-official-news",
      label: "AFC Bournemouth official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["bournemouth", "afc bournemouth"],
      buildUrls() { return ["https://www.afcb.co.uk/news/"]; }
    },
    {
      id: "brentford-official-news",
      label: "Brentford official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["brentford"],
      buildUrls() {
        return [
          "https://www.brentfordfc.com/en/news/all-news",
          "https://www.brentfordfc.com/en/news/latest-mens-news"
        ];
      }
    },
    {
      id: "brentford-premierinjuries",
      label: "Brentford Premier Injuries team page",
      type: "specialist_injury_page",
      trustTier: "specialist",
      teams: ["brentford"],
      buildUrls() { return ["https://www.premierinjuries.com/teams/brentford"]; }
    },
    {
      id: "brighton-official-news",
      label: "Brighton official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["brighton", "brighton & hove albion", "brighton and hove albion"],
      buildUrls() { return ["https://www.brightonandhovealbion.com/pages/en/latest-news"]; }
    },
    {
      id: "burnley-official-news",
      label: "Burnley official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["burnley"],
      buildUrls() { return ["https://www.burnleyfootballclub.com/content/latest-news"]; }
    },
    {
      id: "chelsea-official-news",
      label: "Chelsea official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["chelsea"],
      buildUrls() { return ["https://www.chelseafc.com/en/news/latest-news"]; }
    },
    {
      id: "crystal-palace-official-news",
      label: "Crystal Palace official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["crystal palace"],
      buildUrls() { return ["https://www.cpfc.co.uk/news/"]; }
    },
    {
      id: "everton-official-news",
      label: "Everton official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["everton"],
      buildUrls() { return ["https://www.evertonfc.com/news"]; }
    },
    {
      id: "fulham-official-news",
      label: "Fulham official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["fulham"],
      buildUrls() { return ["https://www.fulhamfc.com/news"]; }
    },
    {
      id: "leeds-official-news",
      label: "Leeds United official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["leeds", "leeds united"],
      buildUrls() { return ["https://www.leedsunited.com/en/news"]; }
    },
    {
      id: "liverpool-official-news",
      label: "Liverpool official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["liverpool"],
      buildUrls() { return ["https://www.liverpoolfc.com/news"]; }
    },
    {
      id: "manchester-city-official-news",
      label: "Manchester City official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["manchester city", "man city"],
      buildUrls() { return ["https://www.mancity.com/news/mens"]; }
    },
    {
      id: "manchester-united-official-news",
      label: "Manchester United official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["manchester united", "man utd", "man united", "manchester utd"],
      buildUrls() {
        return [
          "https://www.manutd.com/en/news/latest",
          "https://www.manutd.com/en/news/first-team",
          "https://www.manutd.com/en/news"
        ];
      }
    },
    {
      id: "manchester-united-premierinjuries",
      label: "Manchester United Premier Injuries team page",
      type: "specialist_injury_page",
      trustTier: "specialist",
      teams: ["manchester united", "man utd", "man united", "manchester utd"],
      buildUrls() { return ["https://www.premierinjuries.com/teams/manchester-united"]; }
    },
    {
      id: "newcastle-official-news",
      label: "Newcastle United official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["newcastle", "newcastle united"],
      buildUrls() { return ["https://www.newcastleunited.com/en/news/latest-news"]; }
    },
    {
      id: "nottingham-forest-official-news",
      label: "Nottingham Forest official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["nottingham forest", "forest"],
      buildUrls() { return ["https://www.nottinghamforest.co.uk/news/"]; }
    },
    {
      id: "sunderland-official-news",
      label: "Sunderland official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["sunderland"],
      buildUrls() { return ["https://www.safc.com/news"]; }
    },
    {
      id: "tottenham-official-news",
      label: "Tottenham Hotspur official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["tottenham", "tottenham hotspur", "spurs"],
      buildUrls() { return ["https://www.tottenhamhotspur.com/news/"]; }
    },
    {
      id: "west-ham-official-news",
      label: "West Ham United official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["west ham", "west ham united"],
      buildUrls() { return ["https://www.whufc.com/news"]; }
    },
    {
      id: "wolves-official-news",
      label: "Wolves official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["wolves", "wolverhampton", "wolverhampton wanderers"],
      buildUrls() { return ["https://www.wolves.co.uk/news/"]; }
    }
  ],

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

const EUROPE_MEDIA_SOURCE_REGISTRY = {
  "uefa.champions": [
    {
      id: "uefa-cl-news",
      label: "UEFA Champions League news",
      type: "competition_news",
      trustTier: "league",
      buildUrls() {
        return ["https://www.uefa.com/uefachampionsleague/news/"];
      }
    }
  ],

  "uefa.europa": [
    {
      id: "uefa-el-news",
      label: "UEFA Europa League news",
      type: "competition_news",
      trustTier: "league",
      buildUrls() {
        return ["https://www.uefa.com/uefaeuropaleague/news/"];
      }
    }
  ],

  "uefa.conference": [
    {
      id: "uefa-ecl-news",
      label: "UEFA Conference League news",
      type: "competition_news",
      trustTier: "league",
      buildUrls() {
        return ["https://www.uefa.com/uefaeuropaconferenceleague/news/"];
      }
    }
  ],

  "eng.1": [
    {
      id: "premierleague-news",
      label: "Premier League news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://www.premierleague.com/news"];
      }
    },
    {
      id: "bbc-pl-news",
      label: "BBC Premier League news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.bbc.com/sport/football/premier-league"];
      }
    },
    {
      id: "sky-pl-news",
      label: "Sky Sports Premier League news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.skysports.com/premier-league"];
      }
    }
  ],

  "eng.2": [
    {
      id: "efl-championship-news",
      label: "EFL Championship news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://www.efl.com/news/"];
      }
    },
    {
      id: "bbc-championship-news",
      label: "BBC Championship news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.bbc.com/sport/football/championship"];
      }
    },
    {
      id: "sky-championship-news",
      label: "Sky Sports Championship news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.skysports.com/championship"];
      }
    }
  ],

  "eng.3": [
    {
      id: "efl-league-one-news",
      label: "EFL League One news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://www.efl.com/news/"];
      }
    },
    {
      id: "bbc-league-one-news",
      label: "BBC League One news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.bbc.com/sport/football/league-one"];
      }
    },
    {
      id: "sky-league-one-news",
      label: "Sky Sports League One news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.skysports.com/league-1"];
      }
    }
  ],

  "esp.1": [
    {
      id: "marca-news",
      label: "Marca football news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.marca.com/futbol.html"];
      }
    },
    {
      id: "as-news",
      label: "AS football news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://as.com/futbol/"];
      }
    }
  ],

  "ita.1": [
    {
      id: "gazzetta-news",
      label: "Gazzetta football news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.gazzetta.it/Calcio/"];
      }
    }
  ],

  "fra.1": [
    {
      id: "lequipe-news",
      label: "L'Équipe football news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.lequipe.fr/Football/"];
      }
    }
  ],

  "ger.1": [
    {
      id: "kicker-news",
      label: "Kicker football news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.kicker.de/fussball"];
      }
    }
  ],

  "ned.1": [
    {
      id: "eredivisie-news",
      label: "Eredivisie official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://eredivisie.eu/news/"];
      }
    },
    {
      id: "vi-football-news",
      label: "Voetbal International news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.vi.nl/nieuws"];
      }
    },
    {
      id: "espn-nl-football-news",
      label: "ESPN Netherlands football news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.espn.nl/voetbal/"];
      }
    }
  ],

  "swe.1": [
    {
      id: "allsvenskan-news",
      label: "Allsvenskan official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://allsvenskan.se/nyheter/"];
      }
    },
    {
      id: "fotbollskanalen-news",
      label: "Fotbollskanalen news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://www.fotbollskanalen.se/allsvenskan/"];
      }
    },
    {
      id: "aftonbladet-football-news",
      label: "Aftonbladet football news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://www.aftonbladet.se/sportbladet/fotboll"];
      }
    }
  ],

  "per.1": [
    {
      id: "peru-rpp-futbol",
      label: "RPP Futbol news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://rpp.pe/futbol"];
      }
    },
    {
      id: "peru-ovacion-noticias",
      label: "Ovacion noticias",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://ovacion.pe/noticias"];
      }
    },
    {
      id: "peru-liga1-news",
      label: "Liga 1 Peru official site",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://ligadefutbolprofesional.pe/noticias/"];
      }
    }
  ],

  "bol.1": [
    {
      id: "bolivia-diez-news",
      label: "Diez Bolivia football news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://www.diez.bo/futbol"];
      }
    },
    {
      id: "bolivia-tigo-sports-news",
      label: "Tigo Sports Bolivia football news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://www.tigosports.com.bo/futbol"];
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
  const extraEuropeSources = EUROPE_MEDIA_SOURCE_REGISTRY[leagueSlug] || [];

  const selectedLeagueSources = leagueSources
    .filter(source => sourceAppliesToTeam(source, input))
    .sort((a, b) => {
      const aTeamSpecific = Array.isArray(a?.teams) && a.teams.length > 0;
      const bTeamSpecific = Array.isArray(b?.teams) && b.teams.length > 0;
      return Number(bTeamSpecific) - Number(aTeamSpecific);
    })
    .flatMap(source => expandSource(source, input));

  const selectedExtraSources = extraEuropeSources
    .filter(source => sourceAppliesToTeam(source, input))
    .flatMap(source => expandSource(source, input));

  const globalSources = GLOBAL_FOOTBALL_SOURCES
    .flatMap(source => expandSource(source, input));

  return uniqByUrl([
    ...selectedLeagueSources,
    ...selectedExtraSources,
    ...globalSources
  ]);
}

export function getKnownTeamNewsLeagueSlugs() {
  return Object.keys(LEAGUE_SOURCE_REGISTRY);
}