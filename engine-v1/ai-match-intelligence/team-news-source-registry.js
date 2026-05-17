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
          "https://clubdeportestolima.com.co/category/noticias/",
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
  ,
    {
      id: "deportivo-pasto-official-news",
      label: "Deportivo Pasto official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["deportivo pasto", "pasto"],
      buildUrls() {
        return [
          "https://deportivopasto.com/noticias/",
          "https://deportivopasto.com/"
        ];
      }
    },
    {
      id: "junior-fc-official-news",
      label: "Junior FC official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["atletico junior", "atlético junior", "junior", "junior fc"],
      buildUrls() {
        return [
          "https://juniorfc.co/noticias",
          "https://juniorfc.co/"
        ];
      }
    },
    {
      id: "once-caldas-official-news",
      label: "Once Caldas official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["once caldas"],
      buildUrls() {
        return [
          "https://www.oncecaldas.com.co/category/noticias",
          "https://www.oncecaldas.com.co/"
        ];
      }
    }
  ],

  "col.2": [
    {
      id: "dimayor-primera-b",
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
      id: "bogota-fc-official-news",
      label: "Bogotá FC official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["bogota fc", "bogotá fc", "bogota", "bogotá"],
      buildUrls() {
        return [
          "https://bogotafc.com/noticias/",
          "https://bogotafc.com/"
        ];
      }
    },
    {
      id: "barranquilla-fc-official-news",
      label: "Barranquilla FC official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["barranquilla fc", "barranquilla"],
      buildUrls() {
        return [
          "https://barranquillafc.com/noticias/",
          "https://barranquillafc.com/"
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
    },
    {
      id: "middlesbrough-official-news",
      label: "Middlesbrough official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["middlesbrough"],
      buildUrls() {
        return ["https://www.mfc.co.uk/news/"];
      }
    },
    {
      id: "southampton-official-news",
      label: "Southampton official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["southampton"],
      buildUrls() {
        return [
          "https://www.southamptonfc.com/en/news",
          "https://www.southamptonfc.com/en/news/latest-news"
        ];
      }
    }],

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
  ,
    {
      id: "bradford-city-official-news",
      label: "Bradford City official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["bradford city", "bradford"],
      buildUrls() {
        return [
          "https://www.bradfordcityafc.com/news/",
          "https://www.bradfordcityafc.com/"
        ];
      }
    },
    {
      id: "bolton-wanderers-official-news",
      label: "Bolton Wanderers official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["bolton wanderers", "bolton"],
      buildUrls() {
        return [
          "https://www.bwfc.co.uk/news",
          "https://www.bwfc.co.uk/"
        ];
      }
    },
    {
      id: "cardiff-city-official-news",
      label: "Cardiff City official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["cardiff city","cardiff city fc"],
      buildUrls() {
        return ["https://www.cardiffcityfc.co.uk/news"];
      }
    },
    {
      id: "exeter-city-official-news",
      label: "Exeter City official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["exeter city","exeter city fc"],
      buildUrls() {
        return ["https://www.exetercityfc.co.uk/news"];
      }
    },
    {
      id: "blackpool-official-news",
      label: "Blackpool official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["blackpool","blackpool fc"],
      buildUrls() {
        return ["https://www.blackpoolfc.co.uk/news/"];
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
    },
    {
      id: "laliga-official-news",
      label: "LaLiga official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return [
          "https://www.laliga.com/en-GB/news",
          "https://www.laliga.com/en-ES/news"
        ];
      }
    },
    {
      id: "real-betis-official-news",
      label: "Real Betis official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["real betis", "betis"],
      buildUrls() {
        return [
          "https://en.realbetisbalompie.es/",
          "https://www.realbetisbalompie.es/"
        ];
      }
    },
    {
      id: "elche-official-news",
      label: "Elche official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["elche", "elche cf"],
      buildUrls() {
        return ["https://www.elchecf.es/"];
      }
    },
    {
      id: "celta-official-news",
      label: "Celta Vigo official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["celta vigo", "celta", "rc celta"],
      buildUrls() {
        return [
          "https://rccelta.es/",
          "https://rccelta.es/en/"
        ];
      }
    },
    {
      id: "levante-official-news",
      label: "Levante official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["levante", "levante ud"],
      buildUrls() {
        return [
          "https://www.levanteud.com/en",
          "https://www.levanteud.com/"
        ];
      }
    },
    {
      id: "osasuna-official-news",
      label: "Osasuna official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["osasuna", "ca osasuna"],
      buildUrls() {
        return [
          "https://www.osasuna.es/en",
          "https://www.osasuna.es/"
        ];
      }
    },
    {
      id: "atletico-madrid-official-news",
      label: "Atlético Madrid official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["atlético madrid", "atletico madrid", "atlético", "atletico"],
      buildUrls() {
        return [
          "https://en.atleticodemadrid.com/",
          "https://www.atleticodemadrid.com/"
        ];
      }
    },
    {
      id: "girona-official-news",
      label: "Girona FC official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["girona", "girona fc"],
      buildUrls() {
        return [
          "https://www.gironafc.cat/en/news",
          "https://www.gironafc.cat/en"
        ];
      }
    },
    {
      id: "real-sociedad-official-news",
      label: "Real Sociedad official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["real sociedad"],
      buildUrls() {
        return [
          "https://www.realsociedad.eus/en/news",
          "https://www.realsociedad.eus/en"
        ];
      }
    },
    {
      id: "valencia-official-news",
      label: "Valencia CF official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["valencia", "valencia cf"],
      buildUrls() {
        return [
          "https://www.valenciacf.com/news-vcf",
          "https://www.valenciacf.com/home"
        ];
      }
    },
    {
      id: "rayo-vallecano-official-news",
      label: "Rayo Vallecano official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["rayo vallecano", "rayo"],
      buildUrls() {
        return [
          "https://www.rayovallecano.es/noticias",
          "https://www.rayovallecano.es/"
        ];
      }
    },
    {
      id: "real-madrid-laliga-official-news",
      label: "Real Madrid official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["real madrid"],
      buildUrls() {
        return [
          "https://www.realmadrid.com/en-US/news",
          "https://www.realmadrid.com/en-US/football/first-team/home"
        ];
      }
    },
    {
      id: "real-oviedo-official-news",
      label: "Real Oviedo official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["real oviedo", "oviedo"],
      buildUrls() {
        return [
          "https://www.realoviedo.es/en/news",
          "https://www.realoviedo.es/en"
        ];
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
    },
    {
      id: "as-monaco-official-news",
      label: "AS Monaco official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["as monaco","as monaco fc"],
      buildUrls() {
        return ["https://www.asmonaco.com/fr/news"];
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

  "arg.1": [
    {
      id: "arg-afa-liga-news",
      label: "AFA official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return [
          "https://www.afa.com.ar/"
        ];
      }
    },
    {
      id: "rosario-central-official-news",
      label: "Rosario Central official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["rosario central"],
      buildUrls() {
        return [
          "https://rosariocentral.com/noticias/",
          "https://rosariocentral.com/"
        ];
      }
    },
    {
      id: "racing-club-official-news",
      label: "Racing Club official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["racing club", "racing"],
      buildUrls() {
        return [
          "https://www.racingclub.com.ar/club/noticias/",
          "https://www.racingclub.com.ar/"
        ];
      }
    },
    {
      id: "river-plate-official-news",
      label: "River Plate official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["river plate"],
      buildUrls() {
        return [
          "https://www.cariverplate.com.ar/todas-las-noticias",
          "https://www.cariverplate.com.ar/"
        ];
      }
    },
    {
      id: "gimnasia-la-plata-official-news",
      label: "Gimnasia La Plata official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["gimnasia la plata", "gimnasia y esgrima la plata"],
      buildUrls() {
        return [
          "https://www.gimnasia.org.ar/noticias/",
          "https://www.gimnasia.org.ar/"
        ];
      }
    }
  ],

  "arg.2": [
    {
      id: "arg-afa-news",
      label: "AFA official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://www.afa.com.ar/"];
      }
    },
    {
      id: "arg-tyc-primera-nacional",
      label: "TyC Sports Primera Nacional news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://www.tycsports.com/primera-nacional.html"];
      }
    },
    {
      id: "arg-ole-ascenso",
      label: "Olé Ascenso news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://www.ole.com.ar/futbol-ascenso/"];
      }
    }
  ],

  "ecu.1": [
    {
      id: "ecu-ligapro-news",
      label: "LigaPro Ecuador official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://ligapro.ec/"];
      }
    },
    {
      id: "ecu-futbolecuador-news",
      label: "Futbol Ecuador news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://www.futbolecuador.com/"];
      }
    },
    {
      id: "mushuc-runa-official-news",
      label: "Mushuc Runa official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["mushuc runa"],
      buildUrls() {
        return ["https://mushucrunasc.ec/"];
      }
    },
    {
      id: "liga-quito-official-news",
      label: "Liga de Quito official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["liga de quito", "ldu quito", "liga quito"],
      buildUrls() {
        return ["https://www.ligadequito.com/"];
      }
    }],

  "gre.1": [
    {
      id: "gre-superleague-news",
      label: "Super League Greece official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return [
          "https://www.slgr.gr/el/news/",
          "https://www.slgr.gr/en/news/"
        ];
      }
    },
    {
      id: "gre-sport24-superleague",
      label: "SPORT24 Super League news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.sport24.gr/tag/superleague-1/"];
      }
    },
    {
      id: "gre-gazzetta-superleague",
      label: "Gazzetta Super League news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.gazzetta.gr/football/superleague"];
      }
    },
    {
      id: "gre-monobala-news",
      label: "Monobala Greek football news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://monobala.gr/"];
      }
    },
    {
      id: "asteras-official-news",
      label: "Asteras Tripoli official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["asteras tripoli", "asteras aktor"],
      buildUrls() {
        return [
          "https://www.asterastripolis.gr/",
          "https://www.asterastripolis.gr/el/teleftaia-nea/protis-omadas"
        ];
      }
    },
    {
      id: "panserraikos-official-news",
      label: "Panserraikos official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["panserraikos", "panserraikos fc"],
      buildUrls() {
        return ["https://panserraikosfc.gr/"];
      }
    },
    {
      id: "atromitos-official-news",
      label: "Atromitos official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["atromitos"],
      buildUrls() {
        return [
          "https://www.atromitosfc.gr/",
          "https://www.atromitosfc.gr/news/"
        ];
      }
    },
    {
      id: "kifisia-official-news",
      label: "Kifisia official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["kifisia", "ae kifisia"],
      buildUrls() {
        return ["https://kifisiafc.gr/"];
      }
    },
    {
      id: "panetolikos-official-news",
      label: "Panetolikos official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["panetolikos"],
      buildUrls() {
        return ["https://www.panetolikos.gr/"];
      }
    },
    {
      id: "larissa-official-news",
      label: "Larissa official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["larissa fc", "ael", "ael novibet"],
      buildUrls() {
        return ["https://www.aelfc.gr/"];
      }
    }],

  "ind.1": [
    {
      id: "ind-isl-news",
      label: "Indian Super League official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://www.indiansuperleague.com/news"];
      }
    },
    {
      id: "ind-aiff-news",
      label: "AIFF official news",
      type: "federation_news",
      trustTier: "league",
      buildUrls() {
        return ["https://www.the-aiff.com/"];
      }
    }
  ],

  "ind.2": [
    {
      id: "ind-aiff-ileague",
      label: "AIFF I-League official page",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return [
          "https://www.the-aiff.com/competitions/i-league",
          "https://www.the-aiff.com/"
        ];
      }
    }
  ],

  "cyp.1": [
    {
      id: "ael-limassol-official-news",
      label: "AEL Limassol official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["ael", "ael limassol"],
      buildUrls() {
        return [
          "https://ael.com.cy/news/"
        ];
      }
    },
    {
      id: "anorthosis-official-news",
      label: "Anorthosis official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["anorthosis", "anorthosis famagusta", "anorthosis ammochostou"],
      buildUrls() {
        return [
          "https://anorthosisfc.com.cy/"
        ];
      }
    },
    {
      id: "apoel-nicosia-official-news",
      label: "APOEL Nicosia official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["apoel", "apoel nicosia", "apoel fc"],
      buildUrls() {
        return [
          "https://www.apoelfc.com.cy/"
        ];
      }
    },
    {
      id: "apollon-limassol-official-news",
      label: "Apollon Limassol official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["apollon", "apollon limassol"],
      buildUrls() {
        return [
          "https://www.apollon.com.cy/news/"
        ];
      }
    },
    {
      id: "aris-limassol-official-news",
      label: "Aris Limassol official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["aris", "aris limassol", "aris fc"],
      buildUrls() {
        return [
          "https://arisfc.com/news/"
        ];
      }
    }
  ],

  "ita.2": [
    {
      id: "ita-serieb-official-news",
      label: "Lega Serie B official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return [
          "https://www.legab.it/news",
          "https://www.legab.it/seriebkt"
        ];
      }
    },
    {
      id: "ita-football-italia-serieb",
      label: "Football Italia Serie B news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://football-italia.net/serie-b/"];
      }
    },
    {
      id: "ita-seriebnews",
      label: "SerieBnews news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://www.seriebnews.com/"];
      }
    },
    {
      id: "modena-official-news",
      label: "Modena official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["modena", "modena fc"],
      buildUrls() {
        return ["https://modenacalcio.com/"];
      }
    },
    {
      id: "juve-stabia-official-news",
      label: "Juve Stabia official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["juve stabia", "ss juve stabia"],
      buildUrls() {
        return ["https://www.ssjuvestabia.it/"];
      }
    },
    {
      id: "catanzaro-official-news",
      label: "Catanzaro official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["catanzaro", "us catanzaro"],
      buildUrls() {
        return ["https://www.uscatanzaro1929.com/"];
      }
    },
    {
      id: "avellino-official-news",
      label: "Avellino official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["us avellino", "avellino"],
      buildUrls() {
        return ["https://www.usavellino1912.com/"];
      }
    },
    {
      id: "cesena-official-news",
      label: "Cesena official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["cesena", "cesena fc"],
      buildUrls() {
        return ["https://cesenafc.com/it"];
      }
    }
  ],

  "ksa.1": [
    {
      id: "ksa-spl-news",
      label: "Saudi Pro League official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://www.spl.com.sa/en/news"];
      }
    },
    {
      id: "ksa-arriyadiyah-football",
      label: "Arriyadiyah football news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://www.arriyadiyah.com/football"];
      }
    },
    {
      id: "al-fayha-official-news",
      label: "Al Fayha official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["al fayha", "al-fayha", "alfayha", "al feiha", "al-feiha"],
      buildUrls() {
        return [
          "https://www.alfayhasc.com/",
          "https://www.alfayhasc.com/en"
        ];
      }
    },
    {
      id: "damac-official-news",
      label: "Damac official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["damac", "damac fc", "damak"],
      buildUrls() {
        return [
          "https://damac.sa/"
        ];
      }
    },
    {
      id: "al-riyadh-official-news",
      label: "Al Riyadh official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["al riyadh", "al-riyadh", "riyadh club", "al riyadh sc"],
      buildUrls() {
        return [
          "https://riyadhclub.sa/",
          "https://riyadhclub.sa/news/",
          "https://riyadhclub.sa/en/%D8%A7%D9%84%D8%B1%D8%A6%D9%8A%D8%B3%D9%8A%D8%A9-english/"
        ];
      }
    },
    {
      id: "al-taawoun-official-news",
      label: "Al Taawoun official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["al taawoun", "al-taawoun", "altaawoun", "al taawon", "al-taawon"],
      buildUrls() {
        return [
          "https://www.altaawounfc.com/",
          "https://www.altaawounfc.com/news"
        ];
      }
    },
    {
      id: "al-nassr-official-news",
      label: "Al Nassr official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["al nassr", "al-nassr"],
      buildUrls() {
        return [
          "https://alnassr.sa/",
          "https://alnassr.sa/news"
        ];
      }
    },
    {
      id: "al-hilal-official-news",
      label: "Al Hilal official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["al hilal", "al-hilal"],
      buildUrls() {
        return [
          "https://alhilal.com/",
          "https://alhilal.com/news"
        ];
      }
    }],

  "rsa.1": [
    {
      id: "rsa-psl-news",
      label: "South African PSL official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://www.psl.co.za/"];
      }
    },
    {
      id: "rsa-supersport-psl",
      label: "SuperSport South African football news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://supersport.com/football/south-africa"];
      }
    }
  ],

  "sco.1": [
    {
      id: "sco-spfl-news",
      label: "SPFL official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return ["https://spfl.co.uk/news"];
      }
    },
    {
      id: "sco-bbc-premiership",
      label: "BBC Scottish Premiership news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.bbc.com/sport/football/scottish-premiership"];
      }
    },
    {
      id: "sco-sky-premiership",
      label: "Sky Sports Scottish Premiership news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.skysports.com/scottish-premiership"];
      }
    },
    {
      id: "kilmarnock-official-news",
      label: "Kilmarnock official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["kilmarnock"],
      buildUrls() {
        return ["https://kilmarnockfc.co.uk/news/"];
      }
    },
    {
      id: "dundee-united-official-news",
      label: "Dundee United official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["dundee united"],
      buildUrls() {
        return ["https://www.dundeeunitedfc.co.uk/news/"];
      }
    },
    {
      id: "aberdeen-official-news",
      label: "Aberdeen official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["aberdeen"],
      buildUrls() {
        return [
          "https://www.afc.co.uk/",
          "https://www.afc.co.uk/news/"
        ];
      }
    },
    {
      id: "st-mirren-official-news",
      label: "St Mirren official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["st mirren", "saint mirren"],
      buildUrls() {
        return [
          "https://www.stmirren.com/",
          "https://www.stmirren.com/match-previews"
        ];
      }
    },
    {
      id: "livingston-official-news",
      label: "Livingston official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["livingston"],
      buildUrls() {
        return ["https://livingstonfc.co.uk/"];
      }
    },
    {
      id: "dundee-official-news",
      label: "Dundee official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["dundee fc"],
      buildUrls() {
        return ["https://dundeefc.co.uk/"];
      }
    }],

  "uga.1": [
    {
      id: "uga-upl-news",
      label: "Uganda Premier League official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return [
          "https://upl.co.ug/",
          "https://upl.co.ug/news/"
        ];
      }
    },
    {
      id: "uga-fufa-upl",
      label: "FUFA Uganda Premier League page",
      type: "federation_news",
      trustTier: "league",
      buildUrls() {
        return ["https://fufa.co.ug/competitions/uganda-premier-league/"];
      }
    },
    {
      id: "uga-kawowo-upl",
      label: "Kawowo Uganda Premier League news",
      type: "media_news",
      trustTier: "medium",
      buildUrls() {
        return ["https://kawowo.com/tag/uganda-premier-league/"];
      }
    }
  ],

  "uru.1": [
    {
      id: "uru-auf-news",
      label: "AUF official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() {
        return [
          "https://www.auf.org.uy/",
          "https://www.auf.org.uy/liga-auf-uruguaya/"
        ];
      }
    },
    {
      id: "uru-ovacion-football",
      label: "Ovación Uruguay football news",
      type: "media_news",
      trustTier: "high",
      buildUrls() {
        return ["https://www.elpais.com.uy/ovacion/futbol"];
      }
    },
    {
      id: "penarol-official-news",
      label: "Peñarol official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["peñarol", "penarol"],
      buildUrls() {
        return ["https://www.xn--pearol-xwa.org/"];
      }
    },
    {
      id: "cerro-largo-official-news",
      label: "Cerro Largo official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["cerro largo"],
      buildUrls() {
        return ["https://cerrolargofc.com.uy/"];
      }
    }],


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

  "eng.4": [
    {
      id: "chesterfield-official-news",
      label: "Chesterfield official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["chesterfield", "chesterfield fc"],
      buildUrls() {
        return ["https://chesterfield-fc.co.uk/latest-news", "https://chesterfield-fc.co.uk/category/news", "https://chesterfield-fc.co.uk/category/club-news"];
      }
    },
    {
      id: "notts-county-official-news",
      label: "Notts County official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["notts county", "notts county fc"],
      buildUrls() {
        return ["https://www.nottscountyfc.co.uk/news/"];
      }
    },
    {
      id: "grimsby-town-official-news",
      label: "Grimsby Town official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["grimsby town", "grimsby town fc"],
      buildUrls() {
        return ["https://gtfc.co.uk/"];
      }
    },
    {
      id: "salford-city-official-news",
      label: "Salford City official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["salford city", "salford city fc"],
      buildUrls() {
        return ["https://www.salfordcityfc.co.uk/news/", "https://www.salfordcityfc.co.uk/category/clubnews"];
      }
    },
    {
      id: "bristol-rovers-official-news",
      label: "Bristol Rovers official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["bristol rovers", "bristol rovers fc"],
      buildUrls() {
        return ["https://www.bristolrovers.co.uk/news"];
      }
    },
    {
      id: "cambridge-united-official-news",
      label: "Cambridge United official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["cambridge united", "cambridge united fc"],
      buildUrls() {
        return ["https://www.cambridgeunited.com/news"];
      }
    }
  ],

  "eng.5": [
    {
      id: "altrincham-official-news",
      label: "Altrincham official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["altrincham", "altrincham fc"],
      buildUrls() {
        return ["https://altrinchamfc.com/"];
      }
    },
    {
      id: "carlisle-united-official-news",
      label: "Carlisle United official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["carlisle united", "carlisle united fc"],
      buildUrls() {
        return ["https://www.carlisleunited.co.uk/news"];
      }
    },
    {
      id: "eastleigh-official-news",
      label: "Eastleigh official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["eastleigh","eastleigh fc"],
      buildUrls() {
        return ["https://eastleighfc.com/news/"];
      }
    }
  ],

  "esp.2": [
    {
      id: "albacete-official-news",
      label: "Albacete Balompie official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["albacete", "albacete bp", "albacete balompie", "albacete balompié"],
      buildUrls() {
        return ["https://www.albacetebalompie.es/noticias", "https://www.albacetebalompie.es/"];
      }
    },
    {
      id: "cordoba-official-news",
      label: "Cordoba CF official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["cordoba", "córdoba", "cordoba cf", "córdoba cf"],
      buildUrls() {
        return ["https://www.cordobacf.com/en/noticias", "https://www.cordobacf.com/en"];
      }
    },
    {
      id: "cadiz-official-news",
      label: "Cadiz CF official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["cadiz", "cádiz", "cadiz cf", "cádiz cf"],
      buildUrls() {
        return ["https://www.cadizcf.com/noticias", "https://www.cadizcf.com/"];
      }
    },
    {
      id: "castellon-official-news",
      label: "CD Castellon official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["castellon", "castellón", "cd castellon", "cd castellón"],
      buildUrls() {
        return ["https://www.cdcastellon.com/"];
      }
    }
  ],

  "tur.1": [
    {
      id: "besiktas-official-news",
      label: "Besiktas official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["besiktas", "beşiktaş", "besiktas jk", "beşiktaş jk"],
      buildUrls() {
        return ["https://bjk.com.tr/en/all_news/1/0?fromMobile=true", "https://bjk.com.tr/en/?fromMobile=true"];
      }
    },
    {
      id: "caykur-rizespor-official-news",
      label: "Caykur Rizespor official news",
      type: "official_club_news",
      trustTier: "official",
      teams: ["caykur rizespor", "çaykur rizespor", "rizespor"],
      buildUrls() {
        return ["https://www.caykurrizespor.org.tr/", "https://www.caykurrizespor.org.tr/Haber/Kategori/Duyurular.html"];
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