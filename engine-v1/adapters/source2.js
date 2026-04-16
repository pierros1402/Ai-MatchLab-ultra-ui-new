const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = "https://v3.football.api-sports.io";

// Cache: 1 fetch per dayKey
const __dailyCache = new Map();

function buildHeaders() {
  return {
    "x-apisports-key": API_KEY
  };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function mapLeagueIdToSlug(leagueId) {
  const map = {
    39: "eng.1",
    40: "eng.2",
    41: "eng.3",
    42: "eng.4",
    43: "eng.5",

    45: "eng.fa",
    48: "eng.league_cup",
    528: "eng.trophy",

    78: "ger.1",
    79: "ger.2",
    80: "ger.3",
    81: "ger.dfb_pokal",

    140: "esp.1",
    141: "esp.2",
    143: "esp.copa_del_rey",
    556: "esp.super_cup",

    135: "ita.1",
    136: "ita.2",
    137: "ita.coppa_italia",

    61: "fra.1",
    62: "fra.2",
    66: "fra.coupe_de_france",
    526: "fra.super_cup",

    88: "ned.1",
    89: "ned.2",
    96: "ned.cup",

    94: "por.1",
    95: "por.2",
    97: "por.taca.portugal",

    144: "bel.1",
    145: "bel.2",

    179: "sco.1",
    180: "sco.2",
    181: "sco.challenge",
    182: "sco.tennents",

    197: "gre.1",
    198: "gre.2",
    200: "gre.cup",

    211: "cyp.1",
    212: "cyp.2",
    213: "cyp.cup",

    203: "tur.1",
    204: "tur.2",
    206: "tur.cup",

    207: "sui.1",
    208: "sui.2",
    210: "sui.cup",

    188: "aut.1",
    189: "aut.2",
    190: "aut.cup",

    119: "den.1",
    120: "den.2",
    121: "den.cup",

    113: "swe.1",
    114: "swe.2",
    115: "swe.cup",

    103: "nor.1",
    104: "nor.2",
    105: "nor.cup",

    244: "fin.1",
    245: "fin.2",

    106: "pol.1",
    107: "pol.2",
    108: "pol.cup",

    345: "cze.1",
    346: "cze.2",
    347: "cze.cup",

    283: "rou.1",
    284: "rou.2",
    285: "rou.cup",

    286: "srb.1",
    287: "srb.2",
    549: "srb.cup",

    2100: "cro.1",
    2101: "cro.2",
    2102: "cro.cup",

    271: "hun.1",
    272: "hun.2",
    273: "hun.cup",

    172: "bul.1",
    173: "bul.2",
    174: "bul.cup",

    218: "ukr.1",
    219: "ukr.2",
    220: "ukr.cup",

    2: "uefa.champions",
    3: "uefa.europa",
    848: "uefa.europa.conf",

    17: "afc.champions",
    18: "afc.cup",

    12: "caf.champions",
    20: "caf.confed",
    15: "caf.nations",

    13: "conmebol.libertadores",

    253: "usa.1",
    254: "usa.2",

    128: "arg.1",
    129: "arg.2",

    71: "bra.1",
    72: "bra.2",

    262: "mex.1",
    263: "mex.2",

    268: "uru.1",
    269: "uru.2",

    239: "col.1",
    240: "col.2",

    265: "chi.1",
    266: "chi.2",

    281: "per.1",
    282: "per.2",

    98: "jpn.1",
    99: "jpn.2",

    292: "kor.1",
    293: "kor.2",

    307: "ksa.1",
    308: "ksa.2",

    301: "uae.1",
    302: "uae.2",

    304: "qat.1",
    305: "qat.2",

    288: "rsa.1",
    289: "rsa.2",

    233: "egy.1",
    234: "egy.2",

    2000: "mar.1",
    2001: "mar.2",

    2002: "tun.1",
    2003: "tun.2"
  };

  return map[Number(leagueId)] || null;
}

function mapStatus(shortCode) {
  const s = String(shortCode || "").toUpperCase();

  if (!s) return "PRE";

  if (["NS", "TBD", "PST"].includes(s)) return "PRE";
  if (["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"].includes(s)) return "LIVE";
  if (["FT", "AET", "PEN"].includes(s)) return "FT";

  // CANC / ABD / AWD / WO: δεν θέλουμε να τα βαφτίζουμε live ή final
  return "PRE";
}

function mapFixture(row) {
  const fixture = row?.fixture || {};
  const league = row?.league || {};
  const teams = row?.teams || {};
  const goals = row?.goals || {};
  const status = fixture?.status || {};

  const leagueSlug = mapLeagueIdToSlug(league.id);
  if (!leagueSlug) return null;

  return {
    fixture: {
      id: fixture.id,
      date: fixture.date,
      venue: {
        name: fixture?.venue?.name || null
      },
      status: {
        short: status.short || null,
        elapsed: status.elapsed ?? null
      }
    },
    league: {
      id: league.id,
      name: league.name || null,
      country: league.country || null
    },
    teams: {
      home: {
        name: teams?.home?.name || null
      },
      away: {
        name: teams?.away?.name || null
      }
    },
    goals: {
      home: goals.home ?? null,
      away: goals.away ?? null
    },
    __meta: {
      source: "source2",
      leagueSlug,
      normalizedStatus: mapStatus(status.short)
    }
  };
}

async function fetchDailySource2Rows(dayKey) {
  if (!API_KEY) {
    console.warn("[source2] missing API_FOOTBALL_KEY");
    return [];
  }

  if (__dailyCache.has(dayKey)) {
    return __dailyCache.get(dayKey);
  }

  const url = `${BASE_URL}/fixtures?date=${encodeURIComponent(dayKey)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: buildHeaders()
    });

    if (!res.ok) {
      console.warn("[source2] daily fetch bad response", res.status, dayKey);
      __dailyCache.set(dayKey, []);
      return [];
    }

    const json = await res.json();
    const rows = safeArray(json?.response);

    __dailyCache.set(dayKey, rows);
    return rows;
  } catch (err) {
    console.error("[source2] daily fetch failed", err?.message || err);
    __dailyCache.set(dayKey, []);
    return [];
  }
}

export async function fetchLeagueFixturesSource2(slug, dayKey) {
  const rows = await fetchDailySource2Rows(dayKey);

  const events = rows
    .map(mapFixture)
    .filter(Boolean)
    .filter(event => event?.__meta?.leagueSlug === slug);

  return { events };
}