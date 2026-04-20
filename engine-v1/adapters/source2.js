import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = "https://v3.football.api-sports.io";

// Cache: 1 fetch per dayKey:slug
const __dailyCache = new Map();
const __rateLimitedDays = new Set();

// Για να μη χάνουμε σιωπηλά coverage που υπάρχει στο registry
// αλλά δεν έχει ακόμα leagueId mapping στο provider layer.
const __missingLeagueIdLogged = new Set();

// SOURCE2 = provider adapter
// Τα target slugs τα παίρνουμε από το canonical coverage universe,
// όχι από μικρή hardcoded λίστα.
const SOURCE2_TARGET_SLUGS = new Set(
  LEAGUES_COVERAGE
    .filter(seed => {
      const slug = String(seed?.slug || "").trim();
      const type = String(seed?.type || "").trim();
      const region = String(seed?.region || "").trim();

      if (!slug) return false;

      // Όλες οι UEFA continental
      if (slug.startsWith("uefa.")) return true;

      // Όλες οι ευρωπαϊκές εγχώριες λίγκες
      if (region === "europe" && type === "league") return true;

      // Όλα τα εγχώρια κύπελλα Ευρώπης
      if (region === "europe" && type === "cup") return true;

      // Υπόλοιπος κόσμος: μόνο 1η κατηγορία προς το παρόν
      if (region !== "europe" && type === "league" && /\.1$/.test(slug)) return true;

      // Άλλες διεθνείς διοργανώσεις που υποστηρίζεις
      if (type === "continental") return true;

      return false;
    })
    .map(seed => String(seed.slug).trim())
);

export function isSource2Enabled() {
  return Boolean(API_KEY);
}

export function isSource2TargetLeague(slug) {
  return SOURCE2_TARGET_SLUGS.has(String(slug || "").trim());
}

function getSource2LeagueId(slug) {
  const key = String(slug || "").trim();
  if (!key) return null;

  const leagueId = slugToLeagueId[key] || null;

  if (!leagueId && !__missingLeagueIdLogged.has(key)) {
    console.warn("[source2] missing leagueId mapping for slug:", key);
    __missingLeagueIdLogged.add(key);
  }

  return leagueId;
}

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

const slugToLeagueId = {
  "eng.1": 39,
  "eng.2": 40,
  "eng.3": 41,
  "eng.4": 42,
  "eng.5": 43,

  "eng.fa": 45,
  "eng.league_cup": 48,
  "eng.trophy": 528,

  "ger.1": 78,
  "ger.2": 79,
  "ger.3": 80,
  "ger.dfb_pokal": 81,

  "esp.1": 140,
  "esp.2": 141,
  "esp.copa_del_rey": 143,
  "esp.super_cup": 556,

  "ita.1": 135,
  "ita.2": 136,
  "ita.coppa_italia": 137,

  "fra.1": 61,
  "fra.2": 62,
  "fra.coupe_de_france": 66,
  "fra.super_cup": 526,

  "ned.1": 88,
  "ned.2": 89,
  "ned.cup": 96,

  "por.1": 94,
  "por.2": 95,
  "por.taca.portugal": 97,

  "bel.1": 144,
  "bel.2": 145,

  "sco.1": 179,
  "sco.2": 180,
  "sco.challenge": 181,
  "sco.tennents": 182,

  "gre.1": 197,
  "gre.2": 198,
  "gre.cup": 200,

  "cyp.1": 211,
  "cyp.2": 212,
  "cyp.cup": 213,

  "tur.1": 203,
  "tur.2": 204,
  "tur.cup": 206,

  "sui.1": 207,
  "sui.2": 208,
  "sui.cup": 210,

  "aut.1": 188,
  "aut.2": 189,
  "aut.cup": 190,

  "den.1": 119,
  "den.2": 120,
  "den.cup": 121,

  "swe.1": 113,
  "swe.2": 114,
  "swe.cup": 115,

  "nor.1": 103,
  "nor.2": 104,
  "nor.cup": 105,

  "fin.1": 244,
  "fin.2": 245,

  "pol.1": 106,
  "pol.2": 107,
  "pol.cup": 108,

  "cze.1": 345,
  "cze.2": 346,
  "cze.cup": 347,

  "rou.1": 283,
  "rou.2": 284,
  "rou.cup": 285,

  "srb.1": 286,
  "srb.2": 287,
  "srb.cup": 549,

  "cro.1": 2100,
  "cro.2": 2101,
  "cro.cup": 2102,

  "hun.1": 271,
  "hun.2": 272,
  "hun.cup": 273,

  "bul.1": 172,
  "bul.2": 173,
  "bul.cup": 174,

  "ukr.1": 218,
  "ukr.2": 219,
  "ukr.cup": 220,

  "uefa.champions": 2,
  "uefa.europa": 3,
  "uefa.europa.conf": 848,

  "afc.champions": 17,
  "afc.cup": 18,

  "caf.champions": 12,
  "caf.confed": 20,
  "caf.nations": 15,

  "conmebol.libertadores": 13,

  "usa.1": 253,
  "usa.2": 254,

  "arg.1": 128,
  "arg.2": 129,

  "bra.1": 71,
  "bra.2": 72,

  "mex.1": 262,
  "mex.2": 263,

  "uru.1": 268,
  "uru.2": 269,

  "col.1": 239,
  "col.2": 240,

  "chi.1": 265,
  "chi.2": 266,

  "per.1": 281,
  "per.2": 282,

  "jpn.1": 98,
  "jpn.2": 99,

  "kor.1": 292,
  "kor.2": 293,

  "ksa.1": 307,
  "ksa.2": 308,

  "uae.1": 301,
  "uae.2": 302,

  "qat.1": 304,
  "qat.2": 305,

  "rsa.1": 288,
  "rsa.2": 289,

  "egy.1": 233,
  "egy.2": 234,

  "mar.1": 2000,
  "mar.2": 2001,

  "tun.1": 2002,
  "tun.2": 2003
};

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
  const score = row?.score || {};
  const status = fixture?.status || {};

  const leagueSlug = mapLeagueIdToSlug(league.id);
  if (!leagueSlug) return null;

  return {
    fixture: {
      id: fixture.id,
      date: fixture.date,
      referee: fixture?.referee || null,
      timezone: fixture?.timezone || null,
      venue: {
        name: fixture?.venue?.name || null,
        city: fixture?.venue?.city || null
      },
      status: {
        short: status.short || null,
        long: status.long || null,
        elapsed: status.elapsed ?? null
      }
    },
    league: {
      id: league.id,
      name: league.name || null,
      country: league.country || null,
      round: league.round || null,
      season: league.season || null
    },
    teams: {
      home: {
        id: teams?.home?.id ?? null,
        name: teams?.home?.name || null,
        winner: teams?.home?.winner ?? null
      },
      away: {
        id: teams?.away?.id ?? null,
        name: teams?.away?.name || null,
        winner: teams?.away?.winner ?? null
      }
    },
    goals: {
      home: goals.home ?? null,
      away: goals.away ?? null
    },
    score: {
      halftime: score?.halftime || null,
      fulltime: score?.fulltime || null,
      extratime: score?.extratime || null,
      penalty: score?.penalty || null
    },
    __facts: {
      referee: fixture?.referee || null,
      venueName: fixture?.venue?.name || null,
      venueCity: fixture?.venue?.city || null,
      statusShort: status.short || null,
      statusLong: status.long || null,
      elapsed: status.elapsed ?? null,
      round: league.round || null,
      season: league.season || null,
      homeTeamId: teams?.home?.id ?? null,
      awayTeamId: teams?.away?.id ?? null,
      homeWinner: teams?.home?.winner ?? null,
      awayWinner: teams?.away?.winner ?? null,
      halftimeHome: score?.halftime?.home ?? null,
      halftimeAway: score?.halftime?.away ?? null,
      fulltimeHome: score?.fulltime?.home ?? null,
      fulltimeAway: score?.fulltime?.away ?? null,
      extratimeHome: score?.extratime?.home ?? null,
      extratimeAway: score?.extratime?.away ?? null,
      penaltyHome: score?.penalty?.home ?? null,
      penaltyAway: score?.penalty?.away ?? null
    },
    __meta: {
      source: "source2",
      leagueSlug,
      normalizedStatus: mapStatus(status.short)
    }
  };
}
async function fetchDailySource2Rows(dayKey, slug) {
  const cacheKey = `${dayKey}:${slug}`;

  if (!API_KEY) {
    console.warn("[source2] missing API_FOOTBALL_KEY");
    return [];
  }

  if (!isSource2TargetLeague(slug)) {
    return [];
  }

  if (__rateLimitedDays.has(dayKey)) {
    return [];
  }

  if (__dailyCache.has(cacheKey)) {
    return __dailyCache.get(cacheKey);
  }

  const leagueId = getSource2LeagueId(slug);
  if (!leagueId) {
    __dailyCache.set(cacheKey, []);
    return [];
  }

  const url = `${BASE_URL}/fixtures?date=${encodeURIComponent(dayKey)}&league=${leagueId}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: buildHeaders()
    });

    if (res.status === 429) {
      console.warn("[source2] daily fetch rate-limited", dayKey, slug);
      __rateLimitedDays.add(dayKey);
      __dailyCache.set(cacheKey, []);
      return [];
    }

    if (!res.ok) {
      console.warn("[source2] daily fetch bad response", res.status, dayKey, slug);
      __dailyCache.set(cacheKey, []);
      return [];
    }

    const json = await res.json();
    const rows = safeArray(json?.response);

    console.log("[source2] fetch", {
      dayKey,
      slug,
      leagueId,
      rows: rows.length
    });

    __dailyCache.set(cacheKey, rows);
    return rows;
  } catch (err) {
    console.error("[source2] daily fetch failed", err?.message || err);
    __dailyCache.set(cacheKey, []);
    return [];
  }
}

export async function fetchLeagueFixturesSource2(slug, dayKey) {
  const rows = await fetchDailySource2Rows(dayKey, slug);

  const events = rows
    .map(mapFixture)
    .filter(Boolean)
    .filter(event => event?.__meta?.leagueSlug === slug);

  return { events };
}