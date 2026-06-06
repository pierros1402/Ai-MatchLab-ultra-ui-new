const officialRouteRegistry = {
  // Global / intercontinental
  "fifa.club_world_cup": {
    hosts: ["fifa.com"],
    routes: [
      "/en/tournaments/mens/club-world-cup/usa-2025/scores-fixtures",
      "/en/tournaments/mens/club-world-cup/usa-2025/standings",
      "/en/tournaments/mens/club-world-cup"
    ]
  },
  "fifa.intercontinental_cup": {
    hosts: ["fifa.com"],
    routes: [
      "/en/tournaments/mens/intercontinental-cup",
      "/en/tournaments/mens/intercontinental-cup/scores-fixtures"
    ]
  },

  // UEFA
  "uefa.champions": {
    hosts: ["uefa.com"],
    routes: ["/uefachampionsleague/fixtures-results/", "/uefachampionsleague/matches/", "/uefachampionsleague/standings/"]
  },
  "uefa.europa": {
    hosts: ["uefa.com"],
    routes: ["/uefaeuropaleague/fixtures-results/", "/uefaeuropaleague/matches/", "/uefaeuropaleague/standings/"]
  },
  "uefa.europa.conf": {
    hosts: ["uefa.com"],
    routes: ["/uefaconferenceleague/fixtures-results/", "/uefaconferenceleague/matches/", "/uefaconferenceleague/standings/"]
  },
  "uefa.super_cup": {
    hosts: ["uefa.com"],
    routes: ["/uefasupercup/fixtures-results/", "/uefasupercup/matches/"]
  },

  // Other continental / confederation
  "afc.champions": {
    hosts: ["the-afc.com"],
    routes: ["/en/club/afc_champions_league_elite/fixtures__standings.html", "/en/club/afc_champions_league_elite.html"]
  },
  "afc.cup": {
    hosts: ["the-afc.com"],
    routes: ["/en/club/afc_champions_league_two/fixtures__standings.html", "/en/club/afc_champions_league_two.html"]
  },
  "caf.champions": {
    hosts: ["cafonline.com"],
    routes: ["/caf-champions-league/fixtures-results/", "/caf-champions-league/"]
  },
  "caf.confed": {
    hosts: ["cafonline.com"],
    routes: ["/caf-confederation-cup/fixtures-results/", "/caf-confederation-cup/"]
  },
  "caf.nations": {
    hosts: ["cafonline.com"],
    routes: ["/totalenergies-africa-cup-of-nations/fixtures-results/", "/totalenergies-africa-cup-of-nations/"]
  },
  "concacaf.champions": {
    hosts: ["concacaf.com"],
    routes: ["/champions-cup/schedule-results/", "/champions-cup/"]
  },
  "concacaf.central_american_cup": {
    hosts: ["concacaf.com"],
    routes: ["/central-american-cup/schedule-results/", "/central-american-cup/"]
  },
  "concacaf.caribbean_cup": {
    hosts: ["concacaf.com"],
    routes: ["/caribbean-cup/schedule-results/", "/caribbean-cup/"]
  },
  "conmebol.libertadores": {
    hosts: ["conmebol.com"],
    routes: ["/libertadores/fixtures/", "/libertadores/resultados/", "/libertadores/"]
  },
  "conmebol.sudamericana": {
    hosts: ["conmebol.com"],
    routes: ["/sudamericana/fixtures/", "/sudamericana/resultados/", "/sudamericana/"]
  },
  "conmebol.recopa": {
    hosts: ["conmebol.com"],
    routes: ["/recopa/fixtures/", "/recopa/"]
  },
  "ofc.champions": {
    hosts: ["oceaniafootball.com", "ofcfootball.com"],
    routes: ["/ofc-mens-champions-league/", "/ofc-mens-champions-league/fixtures/", "/competitions/ofc-mens-champions-league/"]
  },

  // England
  "eng.1": { hosts: ["premierleague.com"], routes: ["/fixtures", "/results", "/tables"] },
  "eng.2": { hosts: ["efl.com"], routes: ["/competitions/sky-bet-championship/fixtures-and-results/", "/competitions/sky-bet-championship/standings/"] },
  "eng.3": { hosts: ["efl.com"], routes: ["/competitions/sky-bet-league-one/fixtures-and-results/", "/competitions/sky-bet-league-one/standings/"] },
  "eng.4": { hosts: ["efl.com"], routes: ["/competitions/sky-bet-league-two/fixtures-and-results/", "/competitions/sky-bet-league-two/standings/"] },
  "eng.5": { hosts: ["thenationalleague.org.uk"], routes: ["/match-info/fixtures", "/match-info/results", "/tables"] },
  "eng.fa": { hosts: ["thefa.com"], routes: ["/competitions/thefacup/fixtures", "/competitions/thefacup/results"] },
  "eng.league_cup": { hosts: ["efl.com"], routes: ["/competitions/carabao-cup/fixtures-and-results/"] },
  "eng.trophy": { hosts: ["efl.com"], routes: ["/competitions/efl-trophy/fixtures-and-results/"] },

  // Spain
  "esp.1": { hosts: ["laliga.com"], routes: ["/en-GB/laliga-easports/results", "/en-GB/laliga-easports/calendar", "/en-GB/laliga-easports/standing"] },
  "esp.2": { hosts: ["laliga.com"], routes: ["/en-GB/laliga-hypermotion/results", "/en-GB/laliga-hypermotion/calendar", "/en-GB/laliga-hypermotion/standing"] },
  "esp.copa_del_rey": { hosts: ["rfef.es"], routes: ["/es/competiciones/copa-de-sm-el-rey", "/en/competitions/copa-de-sm-el-rey"] },
  "esp.super_cup": { hosts: ["rfef.es"], routes: ["/es/competiciones/supercopa-de-espana", "/en/competitions/supercopa-de-espana"] },

  // Italy
  "ita.1": { hosts: ["legaseriea.it", "seriea.com"], routes: ["/en/serie-a/calendar-and-results", "/en/serie-a/fixtures", "/en/serie-a/matches"] },
  "ita.2": { hosts: ["legab.it"], routes: ["/seriebkt/calendario-e-risultati", "/campionato/seriebkt"] },
  "ita.coppa_italia": { hosts: ["legaseriea.it"], routes: ["/en/coppa-italia/calendar-and-results", "/en/coppa-italia"] },

  // Germany
  "ger.1": { hosts: ["bundesliga.com"], routes: ["/en/bundesliga/matchday", "/en/bundesliga/matches", "/en/bundesliga/table"] },
  "ger.2": { hosts: ["bundesliga.com"], routes: ["/en/2bundesliga/matchday", "/en/2bundesliga/matches", "/en/2bundesliga/table"] },
  "ger.3": { hosts: ["dfb.de"], routes: ["/3-liga/spieltagtabelle", "/3-liga/spielplan"] },
  "ger.dfb_pokal": { hosts: ["dfb.de"], routes: ["/dfb-pokal/spieltagtabelle", "/dfb-pokal/spielplan"] },

  // France
  "fra.1": { hosts: ["ligue1.com"], routes: ["/fixtures-results", "/standings"] },
  "fra.2": { hosts: ["ligue1.com"], routes: ["/ligue2/fixtures-results", "/ligue2/standings"] },
  "fra.coupe_de_france": { hosts: ["fff.fr"], routes: ["/competition/engagement/388-coupe-de-france.html", "/competition"] },
  "fra.super_cup": { hosts: ["ligue1.com"], routes: ["/trophee-des-champions", "/fixtures-results"] },

  // Netherlands / Belgium / Portugal
  "ned.1": { hosts: ["eredivisie.com", "eredivisie.nl"], routes: ["/competitie/programma", "/competitie/uitslagen", "/competitie/stand"] },
  "ned.2": { hosts: ["keukenkampioendivisie.nl", "knvb.nl"], routes: ["/programma", "/uitslagen", "/stand"] },
  "ned.cup": { hosts: ["knvb.nl"], routes: ["/competities/toto-knvb-beker/programma", "/competities/toto-knvb-beker"] },
  "bel.1": { hosts: ["proleague.be"], routes: ["/en/jupiler-pro-league/calendar", "/en/jupiler-pro-league/fixtures", "/en/jupiler-pro-league/results"] },
  "bel.2": { hosts: ["proleague.be"], routes: ["/en/challenger-pro-league/calendar", "/en/challenger-pro-league/fixtures", "/en/challenger-pro-league/results"] },
  "bel.cup": { hosts: ["rbfa.be"], routes: ["/en/competitions/croky-cup", "/en/national-competitions/croky-cup"] },
  "por.1": { hosts: ["ligaportugal.pt"], routes: ["/en/liga/classificacao/20252026/ligaportugalbetclic", "/en/liga/calendario/20252026/ligaportugalbetclic"] },
  "por.2": { hosts: ["ligaportugal.pt"], routes: ["/en/liga/classificacao/20252026/ligaportugal2", "/en/liga/calendario/20252026/ligaportugal2"] },
  "por.taca.portugal": { hosts: ["fpf.pt"], routes: ["/pt/competicoes/futebol/masculino/taca-de-portugal", "/en/competitions"] },

  // Northern / Central Europe
  "nor.1": { hosts: ["eliteserien.no", "fotball.no"], routes: ["/terminliste", "/resultater", "/tabell"] },
  "nor.2": { hosts: ["obos-ligaen.no", "fotball.no"], routes: ["/terminliste", "/resultater", "/tabell"] },
  "nor.cup": { hosts: ["fotball.no"], routes: ["/turneringer/nm-menn/terminliste", "/turneringer/nm-menn"] },
  "swe.1": { hosts: ["allsvenskan.se", "svenskfotboll.se"], routes: ["/matcher", "/spelschema", "/resultat", "/tabell"] },
  "swe.2": { hosts: ["superettan.se", "svenskfotboll.se"], routes: ["/matcher", "/spelschema", "/resultat", "/tabell"] },
  "swe.cup": { hosts: ["svenskfotboll.se"], routes: ["/serier-cuper/svenska-cupen-herrar", "/matcher"] },
  "den.1": { hosts: ["superliga.dk", "dbu.dk"], routes: ["/kampe", "/resultater", "/stilling"] },
  "den.2": { hosts: ["division.dk", "dbu.dk"], routes: ["/1-division", "/kampe", "/resultater"] },
  "den.cup": { hosts: ["dbu.dk"], routes: ["/turneringer/pokalturnering", "/resultater"] },
  "fin.1": { hosts: ["veikkausliiga.com", "palloliitto.fi"], routes: ["/ottelut", "/sarjataulukko", "/tulokset"] },
  "fin.2": { hosts: ["palloliitto.fi"], routes: ["/kilpailut/miesten-ykkonen", "/tulospalvelu"] },
  "fin.cup": { hosts: ["palloliitto.fi"], routes: ["/kilpailut/suomen-cup", "/tulospalvelu"] },
  "isl.1": { hosts: ["ksi.is"], routes: ["/mot/stakt-mot/$TournamentDetails/Table", "/mot/stakt-mot/$TournamentDetails/Fixtures"] },
  "isl.cup": { hosts: ["ksi.is"], routes: ["/mot/stakt-mot/$TournamentDetails/Fixtures"] },

  // Scotland / Ireland / Wales
  "sco.1": { hosts: ["spfl.co.uk"], routes: ["/league/premiership/fixtures", "/league/premiership/results", "/league/premiership/table"] },
  "sco.2": { hosts: ["spfl.co.uk"], routes: ["/league/championship/fixtures", "/league/championship/results", "/league/championship/table"] },
  "sco.challenge": { hosts: ["spfl.co.uk"], routes: ["/league/challenge-cup/fixtures", "/league/challenge-cup/results"] },
  "sco.tennents": { hosts: ["scottishfa.co.uk"], routes: ["/scottish-cup/fixtures", "/scottish-cup/results"] },
  "irl.1": { hosts: ["leagueofireland.ie", "fai.ie"], routes: ["/mens/sse-airtricity-mens-premier-division/fixtures", "/fixtures"] },
  "irl.2": { hosts: ["leagueofireland.ie", "fai.ie"], routes: ["/mens/sse-airtricity-mens-first-division/fixtures", "/fixtures"] },
  "irl.cup": { hosts: ["fai.ie"], routes: ["/domestic/news/sports-direct-mens-fai-cup", "/competitions"] },
  "wal.1": { hosts: ["cymrufootball.wales", "faw.cymru"], routes: ["/cymru-premier/fixtures", "/cymru-premier/table"] },
  "wal.2": { hosts: ["cymrufootball.wales", "faw.cymru"], routes: ["/cymru-north/fixtures", "/cymru-south/fixtures"] },
  "wal.cup": { hosts: ["faw.cymru"], routes: ["/jd-welsh-cup/fixtures", "/competitions"] },

  // Wider Europe first pass
  "aut.1": { hosts: ["bundesliga.at", "oefbl.at", "oefb.at"], routes: ["/de/bundesliga/spielplan", "/de/bundesliga/tabelle"] },
  "aut.2": { hosts: ["2liga.at", "oefb.at"], routes: ["/2liga/spielplan", "/de/tabelle"] },
  "aut.cup": { hosts: ["oefb.at"], routes: ["/oefb-cup/spielplan", "/oefb-cup"] },
  "gre.1": { hosts: ["slgr.gr", "superleaguegreece.net"], routes: ["/el/schedule/", "/el/scoreboard/", "/el/standings/"] },
  "gre.2": { hosts: ["sl2.gr"], routes: ["/fixtures", "/results", "/standings"] },
  "gre.cup": { hosts: ["epo.gr"], routes: ["/Competition.aspx?a_id=22524", "/Cup"] },
  "tur.1": { hosts: ["tff.org"], routes: ["/Default.aspx?pageID=198", "/Default.aspx?pageID=142"] },
  "tur.2": { hosts: ["tff.org"], routes: ["/Default.aspx?pageID=488", "/Default.aspx?pageID=142"] },
  "tur.cup": { hosts: ["tff.org"], routes: ["/Default.aspx?pageID=288", "/Default.aspx?pageID=267"] },
  "sui.1": { hosts: ["sfl.ch"], routes: ["/superleague/spielplan", "/superleague/tabelle"] },
  "sui.2": { hosts: ["sfl.ch"], routes: ["/challengeleague/spielplan", "/challengeleague/tabelle"] },
  "sui.cup": { hosts: ["football.ch"], routes: ["/sfv/schweizer-cups/schweizer-cup.aspx", "/play"] },
  "pol.1": { hosts: ["ekstraklasa.org"], routes: ["/terminarz", "/tabela"] },
  "pol.2": { hosts: ["1liga.org"], routes: ["/terminarz", "/tabela"] },
  "pol.cup": { hosts: ["laczynaspilka.pl"], routes: ["/rozgrywki/puchar-polski", "/terminarz"] },
  "cze.1": { hosts: ["fortunaliga.cz"], routes: ["/zapasy", "/tabulka"] },
  "cze.2": { hosts: ["fnliga.cz"], routes: ["/zapasy", "/tabulka"] },
  "cze.cup": { hosts: ["fotbal.cz"], routes: ["/souteze/pohar-mol-cup", "/souteze"] },
  "rou.1": { hosts: ["lpf.ro"], routes: ["/liga-1", "/program", "/clasament"] },
  "rou.2": { hosts: ["frf.ro"], routes: ["/competitii/competitii-masculin/liga-2-casa-pariurilor", "/liga-2"] },
  "rou.cup": { hosts: ["frf.ro"], routes: ["/competitii/competitii-masculin/cupa-romaniei-betano", "/cupa-romaniei"] },
  "cro.1": { hosts: ["hnl.hr"], routes: ["/natjecanja/super-sport-hnl", "/raspored", "/tablica"] },
  "cro.2": { hosts: ["hnl.hr"], routes: ["/natjecanja/super-sport-prva-nl", "/raspored"] },
  "cro.cup": { hosts: ["hns.family"], routes: ["/natjecanja/supersport-hrvatski-nogometni-kup", "/raspored"] },
  "ukr.1": { hosts: ["upl.ua"], routes: ["/en/tournaments/championship", "/en/calendar"] },
  "ukr.2": { hosts: ["pfl.ua"], routes: ["/competition/first-league", "/calendar"] },
  "ukr.cup": { hosts: ["uaf.ua"], routes: ["/en/article/competitions", "/en/competitions"] },
  "rus.1": { hosts: ["premierliga.ru"], routes: ["/tournaments/championship/calendar", "/tournaments/championship/table"] },
  "rus.2": { hosts: ["1fnl.ru"], routes: ["/champioship/results", "/champioship/table"] },
  "rus.cup": { hosts: ["rfs.ru"], routes: ["/cup", "/tournaments"] },

  // Americas / North America
  "usa.1": { hosts: ["mlssoccer.com"], routes: ["/schedule", "/standings", "/results"] },
  "usa.2": { hosts: ["uslchampionship.com"], routes: ["/league-schedule", "/league-standings", "/results"] },
  "usa.cup": { hosts: ["ussoccer.com"], routes: ["/us-open-cup/schedule", "/us-open-cup"] },
  "can.1": { hosts: ["canpl.ca"], routes: ["/schedule", "/standings", "/results"] },
  "can.2": { hosts: ["league1canada.ca"], routes: ["/schedule", "/standings"] },
  "can.cup": { hosts: ["canadasoccer.com"], routes: ["/events/canadian-championship", "/competitions"] },
  "mex.1": { hosts: ["ligamx.net"], routes: ["/cancha/calendarios", "/cancha/estadisticahistorica"] },
  "mex.2": { hosts: ["ligamx.net"], routes: ["/cancha/calendarios", "/cancha/ascenso"] },
  "arg.1": { hosts: ["afa.com.ar"], routes: ["/es/posts/fixture-y-resultados-liga-profesional", "/es/pages/primera-division"] },
  "arg.2": { hosts: ["afa.com.ar"], routes: ["/es/pages/primera-nacional", "/es/posts/fixture-primera-nacional"] },
  "arg.cup": { hosts: ["afa.com.ar"], routes: ["/es/pages/copa-argentina", "/es/posts"] },
  "bra.1": { hosts: ["cbf.com.br"], routes: ["/futebol-brasileiro/competicoes/campeonato-brasileiro-serie-a", "/competicoes/brasileiro-serie-a"] },
  "bra.2": { hosts: ["cbf.com.br"], routes: ["/futebol-brasileiro/competicoes/campeonato-brasileiro-serie-b", "/competicoes/brasileiro-serie-b"] },
  "bra.cup": { hosts: ["cbf.com.br"], routes: ["/futebol-brasileiro/competicoes/copa-brasil", "/competicoes/copa-brasil"] },
  "chi.1": { hosts: ["anfp.cl"], routes: ["/estadisticas", "/fixture", "/campeonato-nacional"] },
  "chi.2": { hosts: ["anfp.cl"], routes: ["/primera-b", "/fixture"] },
  "col.1": { hosts: ["dimayor.com.co"], routes: ["/liga-betplay-dimayor", "/calendario"] },
  "col.2": { hosts: ["dimayor.com.co"], routes: ["/torneo-betplay-dimayor", "/calendario"] },
  "per.1": { hosts: ["liga1.pe"], routes: ["/fixtures", "/tabla-de-posiciones"] },
  "uru.1": { hosts: ["auf.org.uy"], routes: ["/primera-division", "/fixture"] },
  "ecu.1": { hosts: ["ligapro.ec"], routes: ["/fixture", "/tabla-de-posiciones"] },

  // Asia / Oceania first pass
  "jpn.1": { hosts: ["jleague.co", "jleague.jp"], routes: ["/en/matches", "/en/standings", "/matches"] },
  "jpn.2": { hosts: ["jleague.co", "jleague.jp"], routes: ["/en/matches", "/en/standings", "/matches"] },
  "kor.1": { hosts: ["kleague.com"], routes: ["/match.do", "/record.do"] },
  "kor.2": { hosts: ["kleague.com"], routes: ["/match.do", "/record.do"] },
  "chn.1": { hosts: ["thecfa.cn"], routes: ["/competition", "/match"] },
  "chn.2": { hosts: ["thecfa.cn"], routes: ["/competition", "/match"] },
  "aus.1": { hosts: ["aleagues.com.au"], routes: ["/a-league-men/fixtures", "/a-league-men/standings"] },
  "aus.2": { hosts: ["aleagues.com.au"], routes: ["/a-league-men/fixtures", "/a-league-men/standings"] },
  "aus.cup": { hosts: ["footballaustralia.com.au"], routes: ["/australia-cup/fixtures", "/australia-cup"] },
  "nzl.1": { hosts: ["nzfootball.co.nz"], routes: ["/national-league", "/fixtures", "/standings"] },
  "nzl.2": { hosts: ["nzfootball.co.nz"], routes: ["/national-league", "/fixtures"] },
  "nzl.cup": { hosts: ["nzfootball.co.nz"], routes: ["/chatham-cup", "/fixtures"] }
};

const defaultRouteTemplates = [
  "/fixtures",
  "/fixtures-results",
  "/matches",
  "/schedule",
  "/calendar",
  "/results",
  "/standings",
  "/table",
  "/competition"
];

function getOfficialRouteRegistry() {
  return officialRouteRegistry;
}

function getDefaultRouteTemplates() {
  return defaultRouteTemplates;
}

function getOfficialRouteEntry(leagueSlug) {
  return officialRouteRegistry[leagueSlug] || null;
}

function listOfficialRouteRegistrySlugs() {
  return Object.keys(officialRouteRegistry).sort();
}

export {
  defaultRouteTemplates,
  officialRouteRegistry,
  getDefaultRouteTemplates,
  getOfficialRouteEntry,
  getOfficialRouteRegistry,
  listOfficialRouteRegistrySlugs
};