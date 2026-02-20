/* ================= LEAGUES ================= */

const LEAGUE_SEEDS = [
  "eng.1","eng.2","eng.3","eng.4","eng.5","eng.fa","eng.league_cup","eng.trophy",

  "esp.1","esp.2","esp.copa_del_rey","esp.super_cup","esp.w.1",

  "ita.1","ita.2","ita.coppa_italia",

  "fra.1","fra.2","fra.coupe_de_france","fra.super_cup",

  "ger.1","ger.2","ger.dfb_pokal",

  "sco.1","sco.2","sco.challenge","sco.tennents",

  "ned.1","ned.2","ned.3","ned.cup",

  "por.1","por.taca.portugal",

  "bel.1",

  "gre.1","cyp.1","ksa.1",

  /* UEFA */
  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conf",

  /* CAF */
  "caf.nations","caf.champions","caf.confed",

  /* AFRICA – DOMESTIC (ADDED) */
  "nga.1",
  "ken.1",
  "rsa.1",
  "rsa.2",
  "uga.1",

  /* AFC */
  "afc.champions","afc.cup",

  /* AMERICAS */
  "mex.1","mex.2",
  "usa.1","usa.w.1",

  "arg.1",
  "bra.1","bra.2",
  "chi.1",
  "uru.1",
  "par.1",
  "per.1",
  "ecu.1",

  /* CENTRAL / CARIBBEAN (HARD ORIGIN) */
  "crc.1",
  "gua.1",
  "hon.1",
  "jam.1",
  "col.1",
  "col.2",

  /* EUROPE – EXTRA */
  "tur.1",
  "sui.1",
  "aut.1",
  "den.1",
  "swe.1",
  "nor.1",
  "irl.1",

  /* ASIA / OCEANIA (HARD ORIGIN) */
  "sgp.1","slv.1",
  "jpn.1",
  "chn.1",
  "tha.1",
  "ind.1",
  "aus.1","aus.w.1",

  /* BRAZIL STATE */
  "bra.camp.carioca",
  "bra.camp.paulista",
  "bra.camp.gaucho",
  "bra.camp.mineiro",

  
  "concacaf.champions",
  "conmebol.libertadores",
  "club.friendly"
];

const LEAGUE_NAME_MAP = {
  "eng.1":"Premier League",
  "eng.2":"Championship",
  "eng.3":"League One",
  "eng.4":"League Two",
  "eng.5":"National League",
  "eng.fa":"FA Cup",
  "eng.league_cup":"EFL Cup",
  "eng.trophy":"EFL Trophy",

  "esp.1":"LaLiga",
  "esp.2":"LaLiga 2",
  "esp.copa_del_rey":"Copa del Rey",
  "esp.super_cup":"Supercopa de España",


  "ita.1":"Serie A",
  "ita.2":"Serie B",
  "ita.coppa_italia":"Coppa Italia",

  "fra.1":"Ligue 1",
  "fra.2":"Ligue 2",
  "fra.coupe_de_france":"Coupe de France",
  "fra.super_cup":"Trophée des Champions",

  "ger.1":"Bundesliga",
  "ger.2":"2. Bundesliga",
  "ger.dfb_pokal":"DFB Pokal",

  "sco.1":"Scottish Premiership",
  "sco.2":"Scottish Championship",
  "sco.challenge":"Scottish Challenge Cup",
  "sco.tennents":"Scottish Premiership",

  "ned.1":"Eredivisie",
  "ned.2":"Keuken Kampioen Divisie",
  "ned.3":"Tweede Divisie",
  "ned.cup":"KNVB Beker",

  "por.1":"Primeira Liga",
  "por.taca.portugal":"Taça de Portugal",

  "bel.1":"Belgian Pro League",

  "gre.1":"Super League Greece",
  "cyp.1":"Cyprus1st",
  "ksa.1":"SaudiPro",

  /* UEFA */
  "uefa.champions":"UCL",
  "uefa.europa":"UEL",
  "uefa.europa.conf":"UECL",

  /* CAF */
  "caf.nations":"AFCON",
  "caf.champions":"CAFCL",
  "caf.confed":"CAFCC",

  /* AFRICA – DOMESTIC (ADDED) */
  "nga.1":"NigeriaPFL",
  "ken.1":"KenyaPL",
  "rsa.1":"SouthAfricaPL",
  "rsa.2":"SouthAfrica1stDiv",
  "uga.1":"UgandaPL",

  /* AFC */
  "afc.champions":"AFCCL",
  "afc.cup":"AFCCup",

  /* AMERICAS */
  "mex.1":"MexicoLigaMX",
  "mex.2":"MexicoExpansion",
  "usa.1":"MLS",
  "usa.w.1":"NWSL",

  "arg.1":"ArgentinaLPF",
  "bra.1":"BrazilSerieA",
  "bra.2":"BrazilSerieB",
  "chi.1":"ChilePrimera",
  "uru.1":"UruguayPrimera",
  "par.1":"ParaguayPrimera",
  "per.1":"PeruPrimera",
  "ecu.1":"EcuadorSerieA",

  /* CENTRAL / CARIBBEAN (HARD ORIGIN) */
  "crc.1":"CostaRicaPrimera",
  "gua.1":"GuatemalaLigaNac",
  "hon.1":"HondurasLigaNac",
  "jam.1":"JamaicaPL",
  "col.1":"ColombiaPrimeraA",
  "col.2": "ColombiaPrimeraB",

  /* EUROPE – EXTRA */
  "tur.1":"TurkeySuperLig",
  "sui.1":"SwitzerlandSL",
  "aut.1":"AustriaBL",
  "den.1":"DenmarkSuperliga",
  "swe.1":"SwedenAllsvenskan",
  "nor.1":"NorwayEliteserien",
  "irl.1":"IrelandPremierDivision",

  /* ASIA / OCEANIA (HARD ORIGIN) */
  "sgp.1":"SingaporePL",
  "slv.1":"ElSalvadorPrimera",
  "jpn.1":"JapanJ1",
  "chn.1":"ChinaCSL",
  "tha.1":"ThailandT1",
  "ind.1":"IndiaISL",
  "aus.1":"AustraliaALeague",
  "aus.w.1":"AustraliaALeagueW",

  /* BRAZIL STATE */
  "bra.camp.carioca":"BrazilCarioca",
  "bra.camp.paulista":"BrazilPaulista",
  "bra.camp.gaucho":"BrazilGaucho",
  "bra.camp.mineiro":"BrazilMineiro",

  "concacaf.champions": "CONCACAFChampionsCup",
  "conmebol.libertadores": "CopaLibertadores",
  "club.friendly":"ClubFriendly"
};


/* =========================================================
   HELPERS (Shared)
========================================================= */

export { LEAGUE_SEEDS, LEAGUE_NAME_MAP };

export function leagueName(slug) {
  return (LEAGUE_NAME_MAP && LEAGUE_NAME_MAP[slug]) ? LEAGUE_NAME_MAP[slug] : (slug || "unknown");
}

export function isKnownLeague(slug) {
  return !!slug && Array.isArray(LEAGUE_SEEDS) && LEAGUE_SEEDS.includes(slug);
}

export function isUEFACompetition(slug) {
  return slug === "uefa.champions" || slug === "uefa.europa" || slug === "uefa.europa.conf";
}

export function normalizeSeason(season) {
  const s = String(season || "").trim();
  if (!s) return "unknown-season";
  if (/^\d{4}-\d{4}$/.test(s)) return s;
  if (/^\d{4}$/.test(s)) {
    const y = Number(s);
    return `${y}-${y + 1}`;
  }
  return s;
}
