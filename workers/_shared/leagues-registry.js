import { LEAGUES_COVERAGE } from "./leagues-coverage.js";

/* =========================================================
   CANONICAL LEAGUE SEEDS
   SINGLE SOURCE OF TRUTH = LEAGUES_COVERAGE
========================================================= */

export const LEAGUE_SEEDS = LEAGUES_COVERAGE.map(x => x.slug);

const EXPLICIT_NAME_MAP = {
  // ENGLAND
  "eng.1": "Premier League",
  "eng.2": "Championship",
  "eng.3": "League One",
  "eng.4": "League Two",
  "eng.5": "National League",
  "eng.fa": "FA Cup",
  "eng.league_cup": "EFL Cup",
  "eng.trophy": "EFL Trophy",

  // GERMANY
  "ger.1": "Bundesliga",
  "ger.2": "2. Bundesliga",
  "ger.3": "3. Liga",
  "ger.dfb_pokal": "DFB Pokal",

  // SPAIN
  "esp.1": "LaLiga",
  "esp.2": "LaLiga 2",
  "esp.copa_del_rey": "Copa del Rey",
  "esp.super_cup": "Supercopa de España",

  // ITALY
  "ita.1": "Serie A",
  "ita.2": "Serie B",
  "ita.coppa_italia": "Coppa Italia",

  // FRANCE
  "fra.1": "Ligue 1",
  "fra.2": "Ligue 2",
  "fra.coupe_de_france": "Coupe de France",
  "fra.super_cup": "Trophée des Champions",

  // NETHERLANDS
  "ned.1": "Eredivisie",
  "ned.2": "Eerste Divisie",
  "ned.cup": "KNVB Beker",

  // PORTUGAL
  "por.1": "Primeira Liga",
  "por.2": "Liga Portugal 2",
  "por.taca.portugal": "Taça de Portugal",

  // BELGIUM
  "bel.1": "Belgian Pro League",
  "bel.2": "Challenger Pro League",

  // SCOTLAND
  "sco.1": "Scottish Premiership",
  "sco.2": "Scottish Championship",
  "sco.challenge": "Scottish Challenge Cup",
  "sco.tennents": "Scottish League Cup",

  // GREECE
  "gre.1": "Super League Greece",
  "gre.2": "Super League 2",
  "gre.cup": "Greek Cup",

  // CYPRUS
  "cyp.1": "Cyprus First Division",
  "cyp.2": "Cyprus Second Division",
  "cyp.cup": "Cyprus Cup",

  // TURKEY
  "tur.1": "Süper Lig",
  "tur.2": "1. Lig",
  "tur.cup": "Turkish Cup",

  // SWITZERLAND
  "sui.1": "Swiss Super League",
  "sui.2": "Swiss Challenge League",
  "sui.cup": "Swiss Cup",

  // AUSTRIA
  "aut.1": "Austrian Bundesliga",
  "aut.2": "2. Liga",
  "aut.cup": "Austrian Cup",

  // DENMARK
  "den.1": "Danish Superliga",
  "den.2": "Danish 1st Division",
  "den.cup": "Danish Cup",

  // SWEDEN
  "swe.1": "Allsvenskan",
  "swe.2": "Superettan",
  "swe.cup": "Svenska Cupen",

  // NORWAY
  "nor.1": "Eliteserien",
  "nor.2": "OBOS-ligaen",
  "nor.cup": "Norwegian Cup",

  // FINLAND
  "fin.1": "Veikkausliiga",
  "fin.2": "Ykkosliiga",

  // POLAND
  "pol.1": "Ekstraklasa",
  "pol.2": "I Liga",
  "pol.cup": "Polish Cup",

  // CZECH REPUBLIC
  "cze.1": "Czech First League",
  "cze.2": "Czech National League",
  "cze.cup": "Czech Cup",

  // ROMANIA
  "rou.1": "Liga I",
  "rou.2": "Liga II",
  "rou.cup": "Romanian Cup",

  // SERBIA
  "srb.1": "Serbian SuperLiga",
  "srb.2": "Serbian First League",
  "srb.cup": "Serbian Cup",

  // CROATIA
  "cro.1": "HNL",
  "cro.2": "Prva NL",
  "cro.cup": "Croatian Cup",

  // HUNGARY
  "hun.1": "NB I",
  "hun.2": "NB II",
  "hun.cup": "Hungarian Cup",

  // BULGARIA
  "bul.1": "Bulgarian First League",
  "bul.2": "Bulgarian Second League",
  "bul.cup": "Bulgarian Cup",

  // UKRAINE
  "ukr.1": "Ukrainian Premier League",
  "ukr.2": "Ukrainian First League",
  "ukr.cup": "Ukrainian Cup",

  // ALBANIA
  "alb.1": "Albanian Superliga",
  "alb.2": "Albanian First Division",

  // ARMENIA
  "arm.1": "Armenian Premier League",
  "arm.2": "Armenian First League",

  // AZERBAIJAN
  "aze.1": "Azerbaijan Premier League",
  "aze.2": "Azerbaijan First Division",

  // BOSNIA AND HERZEGOVINA
  "bih.1": "Premier League of Bosnia and Herzegovina",
  "bih.2": "Bosnia and Herzegovina First League",

  // BELARUS
  "blr.1": "Belarusian Premier League",
  "blr.2": "Belarusian First League",

  // ESTONIA
  "est.1": "Estonian Meistriliiga",
  "est.2": "Estonian Esiliiga",

  // FAROE ISLANDS
  "fro.1": "Faroe Islands Premier League",
  "fro.2": "Faroe Islands 1. deild",

  // GEORGIA
  "geo.1": "Erovnuli Liga",
  "geo.2": "Erovnuli Liga 2",

  // ICELAND
  "isl.1": "Icelandic Besta deild karla",
  "isl.2": "Icelandic 1. deild karla",

  // IRELAND
  "irl.1": "League of Ireland Premier Division",
  "irl.2": "League of Ireland First Division",

  // ISRAEL
  "isr.1": "Israeli Premier League",
  "isr.2": "Liga Leumit",

  // KAZAKHSTAN
  "kaz.1": "Kazakhstan Premier League",
  "kaz.2": "Kazakhstan First Division",

  // KOSOVO
  "kos.1": "Football Superleague of Kosovo",
  "kos.2": "Kosovo First League",

  // LATVIA
  "lva.1": "Latvian Virsliga",
  "lva.2": "Latvian 1. Liga",

  // LITHUANIA
  "ltu.1": "Lithuanian A Lyga",
  "ltu.2": "Lithuanian I Lyga",

  // LUXEMBOURG
  "lux.1": "Luxembourg National Division",
  "lux.2": "Luxembourg Division of Honour",

  // MOLDOVA
  "mda.1": "Moldovan Super Liga",
  "mda.2": "Moldovan Liga 1",

  // MALTA
  "mlt.1": "Maltese Premier League",
  "mlt.2": "Maltese Challenge League",

  // MONTENEGRO
  "mne.1": "Montenegrin First League",
  "mne.2": "Montenegrin Second League",

  // NORTH MACEDONIA
  "mkd.1": "Macedonian First Football League",
  "mkd.2": "Macedonian Second Football League",

  // NORTHERN IRELAND
  "nir.1": "NIFL Premiership",
  "nir.2": "NIFL Championship",

  // SLOVAKIA
  "svk.1": "Slovak Super Liga",
  "svk.2": "2. Liga",

  // SLOVENIA
  "svn.1": "Slovenian PrvaLiga",
  "svn.2": "Slovenian Second League",

  // WALES
  "wal.1": "Cymru Premier",
  "wal.2": "Cymru North/South",

  // ANDORRA
  "and.1": "Andorran Primera Divisió",
  "and.2": "Andorran Segona Divisió",
  // GIBRALTAR
  "gib.1": "Gibraltar Football League",
  "gib.2": "Gibraltar Second Division",
  // LIECHTENSTEIN
  "lie.1": "Liechtenstein First Level",
  "lie.2": "Liechtenstein Second Level",
  // RUSSIA
  "rus.1": "Russian Premier League",
  "rus.2": "Russian First League",
  // SAN MARINO
  "smr.1": "Campionato Sammarinese",
  "smr.2": "San Marino Second Level",
  // UEFA
  "uefa.champions": "UEFA Champions League",
  "uefa.europa": "UEFA Europa League",
  "uefa.europa.conf": "UEFA Conference League",

  // AFC / CAF / CONMEBOL (κρατάμε αυτά)
  "afc.champions": "AFC Champions League",
  "afc.cup": "AFC Cup",
  "caf.champions": "CAF Champions League",
  "caf.confed": "CAF Confederation Cup",
  "caf.nations": "Africa Cup of Nations",
  "conmebol.libertadores": "Copa Libertadores",

  // AMERICAS
  "usa.1": "MLS",
  "usa.2": "USL Championship",
  "arg.1": "Argentina Primera División",
  "arg.2": "Argentina Primera Nacional",
  "bra.1": "Brazil Serie A",
  "bra.2": "Brazil Serie B",
  "mex.1": "Liga MX",
  "mex.2": "Liga de Expansión MX",
  "uru.1": "Uruguay Primera División",
  "uru.2": "Uruguay Segunda División",
  "col.1": "Colombia Primera A",
  "col.2": "Colombia Primera B",
  "chi.1": "Chile Primera División",
  "chi.2": "Chile Primera B",
  "per.1": "Peru Primera División",
  "per.2": "Peru Liga 2",

  "ven.1": "Venezuelan Primera División",
  "ven.2": "Venezuelan Segunda División",
  "ecu.1": "LigaPro Ecuador",
  "ecu.2": "Ecuador Serie B",
  // ASIA / MIDDLE EAST
  "idn.1": "Indonesian Super League",
  "idn.2": "Indonesian Second Division",
  "mys.1": "Malaysian Super League",
  "mys.2": "Malaysia Premier League",
  "ind.1": "Indian Super League",
  "ind.2": "Indian I-League",
  "jpn.1": "J1 League",
  "jpn.2": "J2 League",
  "kor.1": "K League 1",
  "kor.2": "K League 2",
  "ksa.1": "Saudi Pro League",
  "ksa.2": "Saudi First Division League",
  "uae.1": "UAE Pro League",
  "uae.2": "UAE First Division League",
  "qat.1": "Qatar Stars League",
  "qat.2": "Qatari Second Division",

  // AFRICA DOMESTIC
  "uga.1": "Ugandan Premier League",
  "uga.2": "Ugandan Big League",
  "rsa.1": "South African Premiership",
  "rsa.2": "South African First Division",
  "egy.1": "Egyptian Premier League",
  "egy.2": "Egyptian Second Division",
  "mar.1": "Botola Pro",
  "mar.2": "Botola 2",
  "tun.1": "Tunisian Ligue Professionnelle 1",
  "tun.2": "Tunisian Ligue Professionnelle 2"
};

function slugFallbackName(slug) {
  return String(slug || "")
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

export const LEAGUE_NAME_MAP = Object.fromEntries(
  LEAGUES_COVERAGE.map(entry => [
    entry.slug,
    EXPLICIT_NAME_MAP[entry.slug] || slugFallbackName(entry.slug)
  ])
);

export function leagueName(slug) {
  return LEAGUE_NAME_MAP[slug] || slug || "unknown";
}

export function isKnownLeague(slug) {
  return !!slug && LEAGUE_SEEDS.includes(slug);
}

export function isUEFACompetition(slug) {
  return slug === "uefa.champions" ||
         slug === "uefa.europa" ||
         slug === "uefa.europa.conf";
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