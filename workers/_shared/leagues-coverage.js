// ============================================================
// LEAGUES COVERAGE REGISTRY
// ============================================================

export const LEAGUES_COVERAGE = [
  // ----------------------------------------------------------
  // ENGLAND
  // ----------------------------------------------------------
  { slug: "eng.1", tier: 1, trust: 1.00, type: "league", region: "europe", country: "england" },
  { slug: "eng.2", tier: 1, trust: 0.98, type: "league", region: "europe", country: "england" },
  { slug: "eng.3", tier: 1, trust: 0.95, type: "league", region: "europe", country: "england" },
  { slug: "eng.4", tier: 1, trust: 0.93, type: "league", region: "europe", country: "england" },
  { slug: "eng.5", tier: 2, trust: 0.88, type: "league", region: "europe", country: "england" },
  { slug: "eng.fa", tier: 2, trust: 0.90, type: "cup", region: "europe", country: "england" },
  { slug: "eng.league_cup", tier: 2, trust: 0.90, type: "cup", region: "europe", country: "england" },
  { slug: "eng.trophy", tier: 3, trust: 0.78, type: "cup", region: "europe", country: "england" },

  // ----------------------------------------------------------
  // GERMANY
  // ----------------------------------------------------------
  { slug: "ger.1", tier: 1, trust: 1.00, type: "league", region: "europe", country: "germany" },
  { slug: "ger.2", tier: 1, trust: 0.97, type: "league", region: "europe", country: "germany" },
  { slug: "ger.3", tier: 2, trust: 0.90, type: "league", region: "europe", country: "germany" },
  { slug: "ger.dfb_pokal", tier: 2, trust: 0.90, type: "cup", region: "europe", country: "germany" },

  // ----------------------------------------------------------
  // SPAIN
  // ----------------------------------------------------------
  { slug: "esp.1", tier: 1, trust: 1.00, type: "league", region: "europe", country: "spain" },
  { slug: "esp.2", tier: 1, trust: 0.95, type: "league", region: "europe", country: "spain" },
  { slug: "esp.copa_del_rey", tier: 2, trust: 0.90, type: "cup", region: "europe", country: "spain" },
  { slug: "esp.super_cup", tier: 2, trust: 0.88, type: "cup", region: "europe", country: "spain" },

  // ----------------------------------------------------------
  // ITALY
  // ----------------------------------------------------------
  { slug: "ita.1", tier: 1, trust: 1.00, type: "league", region: "europe", country: "italy" },
  { slug: "ita.2", tier: 1, trust: 0.95, type: "league", region: "europe", country: "italy" },
  { slug: "ita.coppa_italia", tier: 2, trust: 0.90, type: "cup", region: "europe", country: "italy" },

  // ----------------------------------------------------------
  // FRANCE
  // ----------------------------------------------------------
  { slug: "fra.1", tier: 1, trust: 0.98, type: "league", region: "europe", country: "france" },
  { slug: "fra.2", tier: 1, trust: 0.93, type: "league", region: "europe", country: "france" },
  { slug: "fra.coupe_de_france", tier: 2, trust: 0.88, type: "cup", region: "europe", country: "france" },
  { slug: "fra.super_cup", tier: 2, trust: 0.86, type: "cup", region: "europe", country: "france" },

  // ----------------------------------------------------------
  // NETHERLANDS
  // ----------------------------------------------------------
  { slug: "ned.1", tier: 1, trust: 0.97, type: "league", region: "europe", country: "netherlands" },
  { slug: "ned.2", tier: 2, trust: 0.88, type: "league", region: "europe", country: "netherlands" },
  { slug: "ned.cup", tier: 2, trust: 0.88, type: "cup", region: "europe", country: "netherlands" },

  // ----------------------------------------------------------
  // PORTUGAL
  // ----------------------------------------------------------
  { slug: "por.1", tier: 1, trust: 0.95, type: "league", region: "europe", country: "portugal" },
  { slug: "por.2", tier: 2, trust: 0.84, type: "league", region: "europe", country: "portugal" },
  { slug: "por.taca.portugal", tier: 2, trust: 0.88, type: "cup", region: "europe", country: "portugal" },

  // ----------------------------------------------------------
  // BELGIUM
  // ----------------------------------------------------------
  { slug: "bel.1", tier: 1, trust: 0.94, type: "league", region: "europe", country: "belgium" },
  { slug: "bel.2", tier: 2, trust: 0.84, type: "league", region: "europe", country: "belgium" },
  { slug: "bel.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "belgium" },

  // ----------------------------------------------------------
  // SCOTLAND
  // ----------------------------------------------------------
  { slug: "sco.1", tier: 1, trust: 0.90, type: "league", region: "europe", country: "scotland" },
  { slug: "sco.2", tier: 2, trust: 0.82, type: "league", region: "europe", country: "scotland" },
  { slug: "sco.challenge", tier: 3, trust: 0.76, type: "cup", region: "europe", country: "scotland" },
  { slug: "sco.tennents", tier: 3, trust: 0.76, type: "cup", region: "europe", country: "scotland" },

  // ----------------------------------------------------------
  // GREECE
  // ----------------------------------------------------------
  { slug: "gre.1", tier: 1, trust: 0.90, type: "league", region: "europe", country: "greece" },
  { slug: "gre.2", tier: 2, trust: 0.80, type: "league", region: "europe", country: "greece" },
  { slug: "gre.cup", tier: 2, trust: 0.84, type: "cup", region: "europe", country: "greece" },

  // ----------------------------------------------------------
  // CYPRUS
  // ----------------------------------------------------------
  { slug: "cyp.1", tier: 1, trust: 0.88, type: "league", region: "europe", country: "cyprus" },
  { slug: "cyp.2", tier: 2, trust: 0.78, type: "league", region: "europe", country: "cyprus" },
  { slug: "cyp.cup", tier: 2, trust: 0.82, type: "cup", region: "europe", country: "cyprus" },

  // ----------------------------------------------------------
  // TURKEY
  // ----------------------------------------------------------
  { slug: "tur.1", tier: 1, trust: 0.92, type: "league", region: "europe", country: "turkey" },
  { slug: "tur.2", tier: 2, trust: 0.82, type: "league", region: "europe", country: "turkey" },
  { slug: "tur.cup", tier: 2, trust: 0.84, type: "cup", region: "europe", country: "turkey" },

  // ----------------------------------------------------------
  // SWITZERLAND
  // ----------------------------------------------------------
  { slug: "sui.1", tier: 1, trust: 0.90, type: "league", region: "europe", country: "switzerland" },
  { slug: "sui.2", tier: 2, trust: 0.80, type: "league", region: "europe", country: "switzerland" },
  { slug: "sui.cup", tier: 2, trust: 0.82, type: "cup", region: "europe", country: "switzerland" },

  // ----------------------------------------------------------
  // AUSTRIA
  // ----------------------------------------------------------
  { slug: "aut.1", tier: 1, trust: 0.90, type: "league", region: "europe", country: "austria" },
  { slug: "aut.2", tier: 2, trust: 0.80, type: "league", region: "europe", country: "austria" },
  { slug: "aut.cup", tier: 2, trust: 0.82, type: "cup", region: "europe", country: "austria" },

  // ----------------------------------------------------------
  // DENMARK
  // ----------------------------------------------------------
  { slug: "den.1", tier: 1, trust: 0.90, type: "league", region: "europe", country: "denmark" },
  { slug: "den.2", tier: 2, trust: 0.80, type: "league", region: "europe", country: "denmark" },
  { slug: "den.cup", tier: 2, trust: 0.82, type: "cup", region: "europe", country: "denmark" },

  // ----------------------------------------------------------
  // SWEDEN
  // ----------------------------------------------------------
  { slug: "swe.1", tier: 1, trust: 0.88, type: "league", region: "europe", country: "sweden" },
  { slug: "swe.2", tier: 2, trust: 0.78, type: "league", region: "europe", country: "sweden" },
  { slug: "swe.cup", tier: 2, trust: 0.80, type: "cup", region: "europe", country: "sweden" },

  // ----------------------------------------------------------
  // NORWAY
  // ----------------------------------------------------------
  { slug: "nor.1", tier: 1, trust: 0.88, type: "league", region: "europe", country: "norway" },
  { slug: "nor.2", tier: 2, trust: 0.78, type: "league", region: "europe", country: "norway" },
  { slug: "nor.cup", tier: 2, trust: 0.80, type: "cup", region: "europe", country: "norway" },

  // ----------------------------------------------------------
  // FINLAND
  // ----------------------------------------------------------
  { slug: "fin.1", tier: 1, trust: 0.86, type: "league", region: "europe", country: "finland" },
  { slug: "fin.2", tier: 2, trust: 0.76, type: "league", region: "europe", country: "finland" },
  { slug: "fin.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "finland" },

  // ----------------------------------------------------------
  // POLAND
  // ----------------------------------------------------------
  { slug: "pol.1", tier: 1, trust: 0.88, type: "league", region: "europe", country: "poland" },
  { slug: "pol.2", tier: 2, trust: 0.78, type: "league", region: "europe", country: "poland" },
  { slug: "pol.cup", tier: 2, trust: 0.80, type: "cup", region: "europe", country: "poland" },

  // ----------------------------------------------------------
  // CZECH REPUBLIC
  // ----------------------------------------------------------
  { slug: "cze.1", tier: 1, trust: 0.88, type: "league", region: "europe", country: "czech_republic" },
  { slug: "cze.2", tier: 2, trust: 0.78, type: "league", region: "europe", country: "czech_republic" },
  { slug: "cze.cup", tier: 2, trust: 0.80, type: "cup", region: "europe", country: "czech_republic" },

  // ----------------------------------------------------------
  // ROMANIA
  // ----------------------------------------------------------
  { slug: "rou.1", tier: 2, trust: 0.82, type: "league", region: "europe", country: "romania" },
  { slug: "rou.2", tier: 3, trust: 0.72, type: "league", region: "europe", country: "romania" },
  { slug: "rou.cup", tier: 3, trust: 0.74, type: "cup", region: "europe", country: "romania" },

  // ----------------------------------------------------------
  // SERBIA
  // ----------------------------------------------------------
  { slug: "srb.1", tier: 2, trust: 0.82, type: "league", region: "europe", country: "serbia" },
  { slug: "srb.2", tier: 3, trust: 0.72, type: "league", region: "europe", country: "serbia" },
  { slug: "srb.cup", tier: 3, trust: 0.74, type: "cup", region: "europe", country: "serbia" },

  // ----------------------------------------------------------
  // CROATIA
  // ----------------------------------------------------------
  { slug: "cro.1", tier: 2, trust: 0.82, type: "league", region: "europe", country: "croatia" },
  { slug: "cro.2", tier: 3, trust: 0.72, type: "league", region: "europe", country: "croatia" },
  { slug: "cro.cup", tier: 3, trust: 0.74, type: "cup", region: "europe", country: "croatia" },

  // ----------------------------------------------------------
  // HUNGARY
  // ----------------------------------------------------------
  { slug: "hun.1", tier: 2, trust: 0.82, type: "league", region: "europe", country: "hungary" },
  { slug: "hun.2", tier: 3, trust: 0.72, type: "league", region: "europe", country: "hungary" },
  { slug: "hun.cup", tier: 3, trust: 0.74, type: "cup", region: "europe", country: "hungary" },

  // ----------------------------------------------------------
  // BULGARIA
  // ----------------------------------------------------------
  { slug: "bul.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "bulgaria" },
  { slug: "bul.2", tier: 3, trust: 0.70, type: "league", region: "europe", country: "bulgaria" },
  { slug: "bul.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "bulgaria" },

  // ----------------------------------------------------------
  // UKRAINE
  // ----------------------------------------------------------
  { slug: "ukr.1", tier: 2, trust: 0.82, type: "league", region: "europe", country: "ukraine" },
  { slug: "ukr.2", tier: 3, trust: 0.70, type: "league", region: "europe", country: "ukraine" },
  { slug: "ukr.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "ukraine" },

  // ALBANIA
  { slug: "alb.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "albania" },
  { slug: "alb.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "albania" },
  { slug: "alb.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "albania" },

  // ARMENIA
  { slug: "arm.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "armenia" },
  { slug: "arm.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "armenia" },
  { slug: "arm.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "armenia" },

  // AZERBAIJAN
  { slug: "aze.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "azerbaijan" },
  { slug: "aze.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "azerbaijan" },
  { slug: "aze.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "azerbaijan" },

  // BOSNIA AND HERZEGOVINA
  { slug: "bih.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "bosnia_and_herzegovina" },
  { slug: "bih.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "bosnia_and_herzegovina" },
  { slug: "bih.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "bosnia_and_herzegovina" },

  // BELARUS
  { slug: "blr.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "belarus" },
  { slug: "blr.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "belarus" },
  { slug: "blr.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "belarus" },

  // ESTONIA
  { slug: "est.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "estonia" },
  { slug: "est.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "estonia" },
  { slug: "est.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "estonia" },

  // FAROE ISLANDS
  { slug: "fro.1", tier: 2, trust: 0.78, type: "league", region: "europe", country: "faroe_islands" },
  { slug: "fro.2", tier: 3, trust: 0.66, type: "league", region: "europe", country: "faroe_islands" },
  { slug: "fro.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "faroe_islands" },

  // GEORGIA
  { slug: "geo.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "georgia" },
  { slug: "geo.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "georgia" },
  { slug: "geo.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "georgia" },

  // ICELAND
  { slug: "isl.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "iceland" },
  { slug: "isl.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "iceland" },
  { slug: "isl.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "iceland" },

  // IRELAND
  { slug: "irl.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "ireland" },
  { slug: "irl.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "ireland" },
  { slug: "irl.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "ireland" },

  // ISRAEL
  { slug: "isr.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "israel" },
  { slug: "isr.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "israel" },
  { slug: "isr.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "israel" },

  // KAZAKHSTAN
  { slug: "kaz.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "kazakhstan" },
  { slug: "kaz.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "kazakhstan" },
  { slug: "kaz.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "kazakhstan" },

  // KOSOVO
  { slug: "kos.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "kosovo" },
  { slug: "kos.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "kosovo" },
  { slug: "kos.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "kosovo" },

  // LATVIA
  { slug: "lva.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "latvia" },
  { slug: "lva.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "latvia" },
  { slug: "lva.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "latvia" },

  // LITHUANIA
  { slug: "ltu.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "lithuania" },
  { slug: "ltu.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "lithuania" },
  { slug: "ltu.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "lithuania" },

  // LUXEMBOURG
  { slug: "lux.1", tier: 2, trust: 0.78, type: "league", region: "europe", country: "luxembourg" },
  { slug: "lux.2", tier: 3, trust: 0.66, type: "league", region: "europe", country: "luxembourg" },
  { slug: "lux.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "luxembourg" },

  // MOLDOVA
  { slug: "mda.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "moldova" },
  { slug: "mda.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "moldova" },
  { slug: "mda.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "moldova" },

  // MALTA
  { slug: "mlt.1", tier: 2, trust: 0.78, type: "league", region: "europe", country: "malta" },
  { slug: "mlt.2", tier: 3, trust: 0.66, type: "league", region: "europe", country: "malta" },
  { slug: "mlt.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "malta" },

  // MONTENEGRO
  { slug: "mne.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "montenegro" },
  { slug: "mne.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "montenegro" },
  { slug: "mne.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "montenegro" },

  // NORTH MACEDONIA
  { slug: "mkd.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "north_macedonia" },
  { slug: "mkd.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "north_macedonia" },
  { slug: "mkd.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "north_macedonia" },

  // NORTHERN IRELAND
  { slug: "nir.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "northern_ireland" },
  { slug: "nir.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "northern_ireland" },
  { slug: "nir.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "northern_ireland" },

  // SLOVAKIA
  { slug: "svk.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "slovakia" },
  { slug: "svk.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "slovakia" },
  { slug: "svk.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "slovakia" },

  // SLOVENIA
  { slug: "svn.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "slovenia" },
  { slug: "svn.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "slovenia" },
  { slug: "svn.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "slovenia" },

  // WALES
  { slug: "wal.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "wales" },
  { slug: "wal.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "wales" },
  { slug: "wal.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "wales" },

  // ANDORRA
  { slug: "and.1", tier: 3, trust: 0.64, type: "league", region: "europe", country: "andorra" },
  { slug: "and.2", tier: 3, trust: 0.56, type: "league", region: "europe", country: "andorra" },
  { slug: "and.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "andorra" },
  // GIBRALTAR
  { slug: "gib.1", tier: 3, trust: 0.64, type: "league", region: "europe", country: "gibraltar" },
  { slug: "gib.2", tier: 3, trust: 0.56, type: "league", region: "europe", country: "gibraltar" },
  { slug: "gib.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "gibraltar" },
  // LIECHTENSTEIN
  { slug: "lie.1", tier: 3, trust: 0.60, type: "league", region: "europe", country: "liechtenstein" },
  { slug: "lie.2", tier: 3, trust: 0.52, type: "league", region: "europe", country: "liechtenstein" },
  { slug: "lie.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "liechtenstein" },
  // RUSSIA
  { slug: "rus.1", tier: 2, trust: 0.80, type: "league", region: "europe", country: "russia" },
  { slug: "rus.2", tier: 3, trust: 0.68, type: "league", region: "europe", country: "russia" },
  { slug: "rus.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "russia" },
  // SAN MARINO
  { slug: "smr.1", tier: 3, trust: 0.60, type: "league", region: "europe", country: "san_marino" },
  { slug: "smr.2", tier: 3, trust: 0.52, type: "league", region: "europe", country: "san_marino" },
  { slug: "smr.cup", tier: 3, trust: 0.72, type: "cup", region: "europe", country: "san_marino" },
  // ----------------------------------------------------------
  // UEFA
  // ----------------------------------------------------------
  { slug: "uefa.champions", tier: 1, trust: 1.00, type: "continental", region: "europe", country: "uefa" },
  { slug: "uefa.europa", tier: 1, trust: 0.96, type: "continental", region: "europe", country: "uefa" },
  { slug: "uefa.europa.conf", tier: 2, trust: 0.90, type: "continental", region: "europe", country: "uefa" },

  // ----------------------------------------------------------
  // AFC
  // ----------------------------------------------------------
  { slug: "afc.champions", tier: 2, trust: 0.84, type: "continental", region: "asia", country: "afc" },
  { slug: "afc.cup", tier: 3, trust: 0.76, type: "continental", region: "asia", country: "afc" },

  // ----------------------------------------------------------
  // CAF
  // ----------------------------------------------------------
  { slug: "caf.champions", tier: 2, trust: 0.82, type: "continental", region: "africa", country: "caf" },
  { slug: "caf.confed", tier: 3, trust: 0.74, type: "continental", region: "africa", country: "caf" },
  { slug: "caf.nations", tier: 2, trust: 0.80, type: "continental", region: "africa", country: "caf" },

  // ----------------------------------------------------------
  // CONMEBOL
  // ----------------------------------------------------------
  { slug: "conmebol.libertadores", tier: 2, trust: 0.84, type: "continental", region: "americas", country: "conmebol" },
  { slug: "uefa.super_cup", tier: 1, trust: 0.86, type: "continental", region: "europe", country: "international" },
  { slug: "conmebol.sudamericana", tier: 1, trust: 0.84, type: "continental", region: "south_america", country: "international" },
  { slug: "conmebol.recopa", tier: 1, trust: 0.82, type: "continental", region: "south_america", country: "international" },
  { slug: "concacaf.champions", tier: 1, trust: 0.84, type: "continental", region: "north_america", country: "international" },
  { slug: "concacaf.central_american_cup", tier: 1, trust: 0.78, type: "continental", region: "north_america", country: "international" },
  { slug: "concacaf.caribbean_cup", tier: 1, trust: 0.76, type: "continental", region: "north_america", country: "international" },
  { slug: "fij.1", tier: 1, trust: 0.56, type: "league", region: "oceania", country: "fiji" },
  { slug: "fij.2", tier: 2, trust: 0.46, type: "league", region: "oceania", country: "fiji" },
  { slug: "fij.cup", tier: 3, trust: 0.62, type: "cup", region: "oceania", country: "fiji" },
  { slug: "asa.1", tier: 1, trust: 0.50, type: "league", region: "oceania", country: "american_samoa" },
  { slug: "asa.2", tier: 2, trust: 0.42, type: "league", region: "oceania", country: "american_samoa" },
  { slug: "asa.cup", tier: 3, trust: 0.56, type: "cup", region: "oceania", country: "american_samoa" },
  { slug: "cok.1", tier: 1, trust: 0.52, type: "league", region: "oceania", country: "cook_islands" },
  { slug: "cok.2", tier: 2, trust: 0.44, type: "league", region: "oceania", country: "cook_islands" },
  { slug: "cok.cup", tier: 3, trust: 0.58, type: "cup", region: "oceania", country: "cook_islands" },
  { slug: "ncl.1", tier: 1, trust: 0.58, type: "league", region: "oceania", country: "new_caledonia" },
  { slug: "ncl.2", tier: 2, trust: 0.48, type: "league", region: "oceania", country: "new_caledonia" },
  { slug: "ncl.cup", tier: 3, trust: 0.62, type: "cup", region: "oceania", country: "new_caledonia" },
  { slug: "nzl.1", tier: 1, trust: 0.72, type: "league", region: "oceania", country: "new_zealand" },
  { slug: "nzl.2", tier: 2, trust: 0.62, type: "league", region: "oceania", country: "new_zealand" },
  { slug: "nzl.cup", tier: 3, trust: 0.72, type: "cup", region: "oceania", country: "new_zealand" },
  { slug: "png.1", tier: 1, trust: 0.52, type: "league", region: "oceania", country: "papua_new_guinea" },
  { slug: "png.2", tier: 2, trust: 0.44, type: "league", region: "oceania", country: "papua_new_guinea" },
  { slug: "png.cup", tier: 3, trust: 0.58, type: "cup", region: "oceania", country: "papua_new_guinea" },
  { slug: "sam.1", tier: 1, trust: 0.50, type: "league", region: "oceania", country: "samoa" },
  { slug: "sam.2", tier: 2, trust: 0.42, type: "league", region: "oceania", country: "samoa" },
  { slug: "sam.cup", tier: 3, trust: 0.56, type: "cup", region: "oceania", country: "samoa" },
  { slug: "sol.1", tier: 1, trust: 0.56, type: "league", region: "oceania", country: "solomon_islands" },
  { slug: "sol.2", tier: 2, trust: 0.46, type: "league", region: "oceania", country: "solomon_islands" },
  { slug: "sol.cup", tier: 3, trust: 0.60, type: "cup", region: "oceania", country: "solomon_islands" },
  { slug: "tah.1", tier: 1, trust: 0.58, type: "league", region: "oceania", country: "tahiti" },
  { slug: "tah.2", tier: 2, trust: 0.48, type: "league", region: "oceania", country: "tahiti" },
  { slug: "tah.cup", tier: 3, trust: 0.62, type: "cup", region: "oceania", country: "tahiti" },
  { slug: "tga.1", tier: 1, trust: 0.48, type: "league", region: "oceania", country: "tonga" },
  { slug: "tga.2", tier: 2, trust: 0.40, type: "league", region: "oceania", country: "tonga" },
  { slug: "tga.cup", tier: 3, trust: 0.54, type: "cup", region: "oceania", country: "tonga" },
  { slug: "van.1", tier: 1, trust: 0.56, type: "league", region: "oceania", country: "vanuatu" },
  { slug: "van.2", tier: 2, trust: 0.46, type: "league", region: "oceania", country: "vanuatu" },
  { slug: "van.cup", tier: 3, trust: 0.60, type: "cup", region: "oceania", country: "vanuatu" },
  { slug: "ofc.champions", tier: 1, trust: 0.78, type: "continental", region: "oceania", country: "international" },
  { slug: "fifa.club_world_cup", tier: 1, trust: 0.9, type: "global", region: "world", country: "international" },
  { slug: "fifa.intercontinental_cup", tier: 1, trust: 0.86, type: "global", region: "world", country: "international" },

  // ----------------------------------------------------------
  // AMERICAS
  // ----------------------------------------------------------
  { slug: "usa.1", tier: 2, trust: 0.88, type: "league", region: "americas", country: "usa" },
  { slug: "usa.2", tier: 3, trust: 0.76, type: "league", region: "americas", country: "usa" },
  { slug: "usa.cup", tier: 3, trust: 0.72, type: "cup", region: "americas", country: "usa" },
  { slug: "arg.1", tier: 2, trust: 0.88, type: "league", region: "americas", country: "argentina" },
  { slug: "arg.2", tier: 3, trust: 0.76, type: "league", region: "americas", country: "argentina" },
  { slug: "arg.cup", tier: 3, trust: 0.72, type: "cup", region: "americas", country: "argentina" },
  { slug: "bra.1", tier: 2, trust: 0.88, type: "league", region: "americas", country: "brazil" },
  { slug: "bra.2", tier: 3, trust: 0.76, type: "league", region: "americas", country: "brazil" },
  { slug: "bra.cup", tier: 3, trust: 0.72, type: "cup", region: "americas", country: "brazil" },
  { slug: "mex.1", tier: 2, trust: 0.88, type: "league", region: "americas", country: "mexico" },
  { slug: "mex.2", tier: 3, trust: 0.74, type: "league", region: "americas", country: "mexico" },
  { slug: "mex.cup", tier: 3, trust: 0.72, type: "cup", region: "americas", country: "mexico" },
  { slug: "uru.1", tier: 3, trust: 0.74, type: "league", region: "americas", country: "uruguay" },
  { slug: "uru.2", tier: 3, trust: 0.66, type: "league", region: "americas", country: "uruguay" },
  { slug: "uru.cup", tier: 3, trust: 0.72, type: "cup", region: "americas", country: "uruguay" },
  { slug: "col.1", tier: 3, trust: 0.74, type: "league", region: "americas", country: "colombia" },
  { slug: "col.2", tier: 3, trust: 0.66, type: "league", region: "americas", country: "colombia" },
  { slug: "col.cup", tier: 3, trust: 0.72, type: "cup", region: "americas", country: "colombia" },
  { slug: "chi.1", tier: 3, trust: 0.72, type: "league", region: "americas", country: "chile" },
  { slug: "chi.2", tier: 3, trust: 0.64, type: "league", region: "americas", country: "chile" },
  { slug: "chi.cup", tier: 3, trust: 0.72, type: "cup", region: "americas", country: "chile" },
  { slug: "per.1", tier: 3, trust: 0.70, type: "league", region: "americas", country: "peru" },
  { slug: "per.2", tier: 3, trust: 0.62, type: "league", region: "americas", country: "peru" },
  { slug: "per.cup", tier: 3, trust: 0.72, type: "cup", region: "americas", country: "peru" },

  // ----------------------------------------------------------
  // ASIA / MIDDLE EAST
  // ----------------------------------------------------------
  { slug: "jpn.1", tier: 2, trust: 0.88, type: "league", region: "asia", country: "japan" },
  { slug: "jpn.2", tier: 3, trust: 0.74, type: "league", region: "asia", country: "japan" },
  { slug: "jpn.cup", tier: 3, trust: 0.72, type: "cup", region: "asia", country: "japan" },
  { slug: "kor.1", tier: 2, trust: 0.84, type: "league", region: "asia", country: "south_korea" },
  { slug: "kor.2", tier: 3, trust: 0.70, type: "league", region: "asia", country: "south_korea" },
  { slug: "kor.cup", tier: 3, trust: 0.72, type: "cup", region: "asia", country: "south_korea" },
  { slug: "ksa.1", tier: 2, trust: 0.84, type: "league", region: "asia", country: "saudi_arabia" },
  { slug: "ksa.2", tier: 3, trust: 0.68, type: "league", region: "asia", country: "saudi_arabia" },
  { slug: "ksa.cup", tier: 3, trust: 0.72, type: "cup", region: "asia", country: "saudi_arabia" },
  { slug: "uae.1", tier: 3, trust: 0.72, type: "league", region: "asia", country: "uae" },
  { slug: "uae.2", tier: 3, trust: 0.62, type: "league", region: "asia", country: "uae" },
  { slug: "uae.cup", tier: 3, trust: 0.72, type: "cup", region: "asia", country: "uae" },
  { slug: "qat.1", tier: 3, trust: 0.72, type: "league", region: "asia", country: "qatar" },
  { slug: "qat.2", tier: 3, trust: 0.62, type: "league", region: "asia", country: "qatar" },
  { slug: "qat.cup", tier: 3, trust: 0.72, type: "cup", region: "asia", country: "qatar" },
  { slug: "aus.1", tier: 3, trust: 0.72, type: "league", region: "asia", country: "australia" },
  { slug: "aus.2", tier: 3, trust: 0.62, type: "league", region: "asia", country: "australia" },
  { slug: "aus.cup", tier: 3, trust: 0.72, type: "cup", region: "asia", country: "australia" },

  // ADDITIONAL ASIA / WORLD TARGETS
  // ----------------------------------------------------------
  { slug: "idn.1", tier: 3, trust: 0.68, type: "league", region: "asia", country: "indonesia" },
  { slug: "idn.2", tier: 3, trust: 0.58, type: "league", region: "asia", country: "indonesia" },
  { slug: "idn.cup", tier: 3, trust: 0.72, type: "cup", region: "asia", country: "indonesia" },
  { slug: "mys.1", tier: 3, trust: 0.68, type: "league", region: "asia", country: "malaysia" },
  { slug: "mys.2", tier: 3, trust: 0.58, type: "league", region: "asia", country: "malaysia" },
  { slug: "mys.cup", tier: 3, trust: 0.72, type: "cup", region: "asia", country: "malaysia" },
  { slug: "ind.1", tier: 3, trust: 0.68, type: "league", region: "asia", country: "india" },
  { slug: "ind.2", tier: 3, trust: 0.58, type: "league", region: "asia", country: "india" },
  { slug: "ind.cup", tier: 3, trust: 0.72, type: "cup", region: "asia", country: "india" },
  { slug: "chn.1", tier: 1, trust: 0.78, type: "league", region: "asia", country: "china" },
  { slug: "chn.2", tier: 2, trust: 0.66, type: "league", region: "asia", country: "china" },
  { slug: "chn.cup", tier: 3, trust: 0.70, type: "cup", region: "asia", country: "china" },
  { slug: "kuw.1", tier: 1, trust: 0.68, type: "league", region: "asia", country: "kuwait" },
  { slug: "kuw.2", tier: 2, trust: 0.58, type: "league", region: "asia", country: "kuwait" },
  { slug: "kuw.cup", tier: 3, trust: 0.68, type: "cup", region: "asia", country: "kuwait" },
  { slug: "afg.1", tier: 1, trust: 0.52, type: "league", region: "asia", country: "afghanistan" },
  { slug: "afg.2", tier: 2, trust: 0.44, type: "league", region: "asia", country: "afghanistan" },
  { slug: "afg.cup", tier: 3, trust: 0.58, type: "cup", region: "asia", country: "afghanistan" },
  { slug: "bhr.1", tier: 1, trust: 0.66, type: "league", region: "asia", country: "bahrain" },
  { slug: "bhr.2", tier: 2, trust: 0.56, type: "league", region: "asia", country: "bahrain" },
  { slug: "bhr.cup", tier: 3, trust: 0.68, type: "cup", region: "asia", country: "bahrain" },
  { slug: "ban.1", tier: 1, trust: 0.58, type: "league", region: "asia", country: "bangladesh" },
  { slug: "ban.2", tier: 2, trust: 0.48, type: "league", region: "asia", country: "bangladesh" },
  { slug: "ban.cup", tier: 3, trust: 0.62, type: "cup", region: "asia", country: "bangladesh" },
  { slug: "bhu.1", tier: 1, trust: 0.48, type: "league", region: "asia", country: "bhutan" },
  { slug: "bhu.2", tier: 2, trust: 0.40, type: "league", region: "asia", country: "bhutan" },
  { slug: "bhu.cup", tier: 3, trust: 0.54, type: "cup", region: "asia", country: "bhutan" },
  { slug: "bru.1", tier: 1, trust: 0.50, type: "league", region: "asia", country: "brunei" },
  { slug: "bru.2", tier: 2, trust: 0.42, type: "league", region: "asia", country: "brunei" },
  { slug: "bru.cup", tier: 3, trust: 0.56, type: "cup", region: "asia", country: "brunei" },
  { slug: "cam.1", tier: 1, trust: 0.58, type: "league", region: "asia", country: "cambodia" },
  { slug: "cam.2", tier: 2, trust: 0.48, type: "league", region: "asia", country: "cambodia" },
  { slug: "cam.cup", tier: 3, trust: 0.62, type: "cup", region: "asia", country: "cambodia" },
  { slug: "tpe.1", tier: 1, trust: 0.56, type: "league", region: "asia", country: "chinese_taipei" },
  { slug: "tpe.2", tier: 2, trust: 0.46, type: "league", region: "asia", country: "chinese_taipei" },
  { slug: "tpe.cup", tier: 3, trust: 0.60, type: "cup", region: "asia", country: "chinese_taipei" },
  { slug: "gum.1", tier: 1, trust: 0.48, type: "league", region: "asia", country: "guam" },
  { slug: "gum.2", tier: 2, trust: 0.40, type: "league", region: "asia", country: "guam" },
  { slug: "gum.cup", tier: 3, trust: 0.54, type: "cup", region: "asia", country: "guam" },
  { slug: "hkg.1", tier: 1, trust: 0.66, type: "league", region: "asia", country: "hong_kong" },
  { slug: "hkg.2", tier: 2, trust: 0.56, type: "league", region: "asia", country: "hong_kong" },
  { slug: "hkg.cup", tier: 3, trust: 0.68, type: "cup", region: "asia", country: "hong_kong" },
  { slug: "irn.1", tier: 1, trust: 0.74, type: "league", region: "asia", country: "iran" },
  { slug: "irn.2", tier: 2, trust: 0.64, type: "league", region: "asia", country: "iran" },
  { slug: "irn.cup", tier: 3, trust: 0.70, type: "cup", region: "asia", country: "iran" },
  { slug: "irq.1", tier: 1, trust: 0.66, type: "league", region: "asia", country: "iraq" },
  { slug: "irq.2", tier: 2, trust: 0.56, type: "league", region: "asia", country: "iraq" },
  { slug: "irq.cup", tier: 3, trust: 0.68, type: "cup", region: "asia", country: "iraq" },
  { slug: "jor.1", tier: 1, trust: 0.66, type: "league", region: "asia", country: "jordan" },
  { slug: "jor.2", tier: 2, trust: 0.56, type: "league", region: "asia", country: "jordan" },
  { slug: "jor.cup", tier: 3, trust: 0.68, type: "cup", region: "asia", country: "jordan" },
  { slug: "kgz.1", tier: 1, trust: 0.58, type: "league", region: "asia", country: "kyrgyz_republic" },
  { slug: "kgz.2", tier: 2, trust: 0.48, type: "league", region: "asia", country: "kyrgyz_republic" },
  { slug: "kgz.cup", tier: 3, trust: 0.62, type: "cup", region: "asia", country: "kyrgyz_republic" },
  { slug: "lao.1", tier: 1, trust: 0.52, type: "league", region: "asia", country: "laos" },
  { slug: "lao.2", tier: 2, trust: 0.44, type: "league", region: "asia", country: "laos" },
  { slug: "lao.cup", tier: 3, trust: 0.58, type: "cup", region: "asia", country: "laos" },
  { slug: "lib.1", tier: 1, trust: 0.62, type: "league", region: "asia", country: "lebanon" },
  { slug: "lib.2", tier: 2, trust: 0.52, type: "league", region: "asia", country: "lebanon" },
  { slug: "lib.cup", tier: 3, trust: 0.64, type: "cup", region: "asia", country: "lebanon" },
  { slug: "mac.1", tier: 1, trust: 0.50, type: "league", region: "asia", country: "macau" },
  { slug: "mac.2", tier: 2, trust: 0.42, type: "league", region: "asia", country: "macau" },
  { slug: "mac.cup", tier: 3, trust: 0.56, type: "cup", region: "asia", country: "macau" },
  { slug: "mdv.1", tier: 1, trust: 0.54, type: "league", region: "asia", country: "maldives" },
  { slug: "mdv.2", tier: 2, trust: 0.46, type: "league", region: "asia", country: "maldives" },
  { slug: "mdv.cup", tier: 3, trust: 0.60, type: "cup", region: "asia", country: "maldives" },
  { slug: "mng.1", tier: 1, trust: 0.54, type: "league", region: "asia", country: "mongolia" },
  { slug: "mng.2", tier: 2, trust: 0.46, type: "league", region: "asia", country: "mongolia" },
  { slug: "mng.cup", tier: 3, trust: 0.60, type: "cup", region: "asia", country: "mongolia" },
  { slug: "mya.1", tier: 1, trust: 0.56, type: "league", region: "asia", country: "myanmar" },
  { slug: "mya.2", tier: 2, trust: 0.46, type: "league", region: "asia", country: "myanmar" },
  { slug: "mya.cup", tier: 3, trust: 0.60, type: "cup", region: "asia", country: "myanmar" },
  { slug: "nep.1", tier: 1, trust: 0.52, type: "league", region: "asia", country: "nepal" },
  { slug: "nep.2", tier: 2, trust: 0.44, type: "league", region: "asia", country: "nepal" },
  { slug: "nep.cup", tier: 3, trust: 0.58, type: "cup", region: "asia", country: "nepal" },
  { slug: "prk.1", tier: 1, trust: 0.46, type: "league", region: "asia", country: "north_korea" },
  { slug: "prk.2", tier: 2, trust: 0.38, type: "league", region: "asia", country: "north_korea" },
  { slug: "prk.cup", tier: 3, trust: 0.52, type: "cup", region: "asia", country: "north_korea" },
  { slug: "oma.1", tier: 1, trust: 0.64, type: "league", region: "asia", country: "oman" },
  { slug: "oma.2", tier: 2, trust: 0.54, type: "league", region: "asia", country: "oman" },
  { slug: "oma.cup", tier: 3, trust: 0.66, type: "cup", region: "asia", country: "oman" },
  { slug: "pak.1", tier: 1, trust: 0.52, type: "league", region: "asia", country: "pakistan" },
  { slug: "pak.2", tier: 2, trust: 0.44, type: "league", region: "asia", country: "pakistan" },
  { slug: "pak.cup", tier: 3, trust: 0.58, type: "cup", region: "asia", country: "pakistan" },
  { slug: "ple.1", tier: 1, trust: 0.56, type: "league", region: "asia", country: "palestine" },
  { slug: "ple.2", tier: 2, trust: 0.46, type: "league", region: "asia", country: "palestine" },
  { slug: "ple.cup", tier: 3, trust: 0.60, type: "cup", region: "asia", country: "palestine" },
  { slug: "phi.1", tier: 1, trust: 0.58, type: "league", region: "asia", country: "philippines" },
  { slug: "phi.2", tier: 2, trust: 0.48, type: "league", region: "asia", country: "philippines" },
  { slug: "phi.cup", tier: 3, trust: 0.62, type: "cup", region: "asia", country: "philippines" },
  { slug: "sgp.1", tier: 1, trust: 0.66, type: "league", region: "asia", country: "singapore" },
  { slug: "sgp.2", tier: 2, trust: 0.56, type: "league", region: "asia", country: "singapore" },
  { slug: "sgp.cup", tier: 3, trust: 0.68, type: "cup", region: "asia", country: "singapore" },
  { slug: "sri.1", tier: 1, trust: 0.50, type: "league", region: "asia", country: "sri_lanka" },
  { slug: "sri.2", tier: 2, trust: 0.42, type: "league", region: "asia", country: "sri_lanka" },
  { slug: "sri.cup", tier: 3, trust: 0.56, type: "cup", region: "asia", country: "sri_lanka" },
  { slug: "syr.1", tier: 1, trust: 0.58, type: "league", region: "asia", country: "syria" },
  { slug: "syr.2", tier: 2, trust: 0.48, type: "league", region: "asia", country: "syria" },
  { slug: "syr.cup", tier: 3, trust: 0.62, type: "cup", region: "asia", country: "syria" },
  { slug: "tjk.1", tier: 1, trust: 0.60, type: "league", region: "asia", country: "tajikistan" },
  { slug: "tjk.2", tier: 2, trust: 0.50, type: "league", region: "asia", country: "tajikistan" },
  { slug: "tjk.cup", tier: 3, trust: 0.64, type: "cup", region: "asia", country: "tajikistan" },
  { slug: "tha.1", tier: 1, trust: 0.72, type: "league", region: "asia", country: "thailand" },
  { slug: "tha.2", tier: 2, trust: 0.62, type: "league", region: "asia", country: "thailand" },
  { slug: "tha.cup", tier: 3, trust: 0.70, type: "cup", region: "asia", country: "thailand" },
  { slug: "tls.1", tier: 1, trust: 0.48, type: "league", region: "asia", country: "timor_leste" },
  { slug: "tls.2", tier: 2, trust: 0.40, type: "league", region: "asia", country: "timor_leste" },
  { slug: "tls.cup", tier: 3, trust: 0.54, type: "cup", region: "asia", country: "timor_leste" },
  { slug: "tkm.1", tier: 1, trust: 0.54, type: "league", region: "asia", country: "turkmenistan" },
  { slug: "tkm.2", tier: 2, trust: 0.46, type: "league", region: "asia", country: "turkmenistan" },
  { slug: "tkm.cup", tier: 3, trust: 0.60, type: "cup", region: "asia", country: "turkmenistan" },
  { slug: "uzb.1", tier: 1, trust: 0.70, type: "league", region: "asia", country: "uzbekistan" },
  { slug: "uzb.2", tier: 2, trust: 0.60, type: "league", region: "asia", country: "uzbekistan" },
  { slug: "uzb.cup", tier: 3, trust: 0.68, type: "cup", region: "asia", country: "uzbekistan" },
  { slug: "vie.1", tier: 1, trust: 0.68, type: "league", region: "asia", country: "vietnam" },
  { slug: "vie.2", tier: 2, trust: 0.58, type: "league", region: "asia", country: "vietnam" },
  { slug: "vie.cup", tier: 3, trust: 0.66, type: "cup", region: "asia", country: "vietnam" },
  { slug: "yem.1", tier: 1, trust: 0.50, type: "league", region: "asia", country: "yemen" },
  { slug: "yem.2", tier: 2, trust: 0.42, type: "league", region: "asia", country: "yemen" },
  { slug: "yem.cup", tier: 3, trust: 0.56, type: "cup", region: "asia", country: "yemen" },

  // ADDITIONAL AMERICAS TARGETS
  // ----------------------------------------------------------
  { slug: "ven.1", tier: 3, trust: 0.66, type: "league", region: "americas", country: "venezuela" },
  { slug: "ven.2", tier: 3, trust: 0.56, type: "league", region: "americas", country: "venezuela" },
  { slug: "ven.cup", tier: 3, trust: 0.72, type: "cup", region: "americas", country: "venezuela" },
  { slug: "ecu.1", tier: 3, trust: 0.68, type: "league", region: "americas", country: "ecuador" },
  { slug: "ecu.2", tier: 3, trust: 0.58, type: "league", region: "americas", country: "ecuador" },
  { slug: "ecu.cup", tier: 3, trust: 0.72, type: "cup", region: "americas", country: "ecuador" },
  // ----------------------------------------------------------
  // AFRICA
  // ----------------------------------------------------------
  { slug: "uga.1", tier: 3, trust: 0.62, type: "league", region: "africa", country: "uganda" },
  { slug: "uga.2", tier: 3, trust: 0.52, type: "league", region: "africa", country: "uganda" },
  { slug: "uga.cup", tier: 3, trust: 0.72, type: "cup", region: "africa", country: "uganda" },
  { slug: "rsa.1", tier: 3, trust: 0.74, type: "league", region: "africa", country: "south_africa" },
  { slug: "rsa.2", tier: 3, trust: 0.66, type: "league", region: "africa", country: "south_africa" },
  { slug: "rsa.cup", tier: 3, trust: 0.72, type: "cup", region: "africa", country: "south_africa" },
  { slug: "egy.1", tier: 3, trust: 0.72, type: "league", region: "africa", country: "egypt" },
  { slug: "egy.2", tier: 3, trust: 0.62, type: "league", region: "africa", country: "egypt" },
  { slug: "egy.cup", tier: 3, trust: 0.72, type: "cup", region: "africa", country: "egypt" },
  { slug: "eth.1", tier: 1, trust: 0.62, type: "league", region: "africa", country: "ethiopia" },
  { slug: "eth.2", tier: 2, trust: 0.52, type: "league", region: "africa", country: "ethiopia" },
  { slug: "eth.cup", tier: 3, trust: 0.66, type: "cup", region: "africa", country: "ethiopia" },
  { slug: "alg.1", tier: 1, trust: 0.72, type: "league", region: "africa", country: "algeria" },
  { slug: "alg.2", tier: 2, trust: 0.62, type: "league", region: "africa", country: "algeria" },
  { slug: "alg.cup", tier: 3, trust: 0.70, type: "cup", region: "africa", country: "algeria" },
  { slug: "ang.1", tier: 1, trust: 0.64, type: "league", region: "africa", country: "angola" },
  { slug: "ang.2", tier: 2, trust: 0.54, type: "league", region: "africa", country: "angola" },
  { slug: "ang.cup", tier: 3, trust: 0.66, type: "cup", region: "africa", country: "angola" },
  { slug: "ben.1", tier: 1, trust: 0.56, type: "league", region: "africa", country: "benin" },
  { slug: "ben.2", tier: 2, trust: 0.46, type: "league", region: "africa", country: "benin" },
  { slug: "ben.cup", tier: 3, trust: 0.60, type: "cup", region: "africa", country: "benin" },
  { slug: "bot.1", tier: 1, trust: 0.58, type: "league", region: "africa", country: "botswana" },
  { slug: "bot.2", tier: 2, trust: 0.48, type: "league", region: "africa", country: "botswana" },
  { slug: "bot.cup", tier: 3, trust: 0.62, type: "cup", region: "africa", country: "botswana" },
  { slug: "bfa.1", tier: 1, trust: 0.58, type: "league", region: "africa", country: "burkina_faso" },
  { slug: "bfa.2", tier: 2, trust: 0.48, type: "league", region: "africa", country: "burkina_faso" },
  { slug: "bfa.cup", tier: 3, trust: 0.62, type: "cup", region: "africa", country: "burkina_faso" },
  { slug: "bdi.1", tier: 1, trust: 0.56, type: "league", region: "africa", country: "burundi" },
  { slug: "bdi.2", tier: 2, trust: 0.46, type: "league", region: "africa", country: "burundi" },
  { slug: "bdi.cup", tier: 3, trust: 0.60, type: "cup", region: "africa", country: "burundi" },
  { slug: "cmr.1", tier: 1, trust: 0.66, type: "league", region: "africa", country: "cameroon" },
  { slug: "cmr.2", tier: 2, trust: 0.56, type: "league", region: "africa", country: "cameroon" },
  { slug: "cmr.cup", tier: 3, trust: 0.68, type: "cup", region: "africa", country: "cameroon" },
  { slug: "cpv.1", tier: 1, trust: 0.54, type: "league", region: "africa", country: "cape_verde" },
  { slug: "cpv.2", tier: 2, trust: 0.44, type: "league", region: "africa", country: "cape_verde" },
  { slug: "cpv.cup", tier: 3, trust: 0.58, type: "cup", region: "africa", country: "cape_verde" },
  { slug: "cta.1", tier: 1, trust: 0.48, type: "league", region: "africa", country: "central_african_republic" },
  { slug: "cta.2", tier: 2, trust: 0.40, type: "league", region: "africa", country: "central_african_republic" },
  { slug: "cta.cup", tier: 3, trust: 0.54, type: "cup", region: "africa", country: "central_african_republic" },
  { slug: "cha.1", tier: 1, trust: 0.48, type: "league", region: "africa", country: "chad" },
  { slug: "cha.2", tier: 2, trust: 0.40, type: "league", region: "africa", country: "chad" },
  { slug: "cha.cup", tier: 3, trust: 0.54, type: "cup", region: "africa", country: "chad" },
  { slug: "com.1", tier: 1, trust: 0.50, type: "league", region: "africa", country: "comoros" },
  { slug: "com.2", tier: 2, trust: 0.42, type: "league", region: "africa", country: "comoros" },
  { slug: "com.cup", tier: 3, trust: 0.56, type: "cup", region: "africa", country: "comoros" },
  { slug: "cgo.1", tier: 1, trust: 0.56, type: "league", region: "africa", country: "congo" },
  { slug: "cgo.2", tier: 2, trust: 0.46, type: "league", region: "africa", country: "congo" },
  { slug: "cgo.cup", tier: 3, trust: 0.60, type: "cup", region: "africa", country: "congo" },
  { slug: "dji.1", tier: 1, trust: 0.48, type: "league", region: "africa", country: "djibouti" },
  { slug: "dji.2", tier: 2, trust: 0.40, type: "league", region: "africa", country: "djibouti" },
  { slug: "dji.cup", tier: 3, trust: 0.54, type: "cup", region: "africa", country: "djibouti" },
  { slug: "cod.1", tier: 1, trust: 0.62, type: "league", region: "africa", country: "dr_congo" },
  { slug: "cod.2", tier: 2, trust: 0.52, type: "league", region: "africa", country: "dr_congo" },
  { slug: "cod.cup", tier: 3, trust: 0.64, type: "cup", region: "africa", country: "dr_congo" },
  { slug: "eqg.1", tier: 1, trust: 0.52, type: "league", region: "africa", country: "equatorial_guinea" },
  { slug: "eqg.2", tier: 2, trust: 0.44, type: "league", region: "africa", country: "equatorial_guinea" },
  { slug: "eqg.cup", tier: 3, trust: 0.58, type: "cup", region: "africa", country: "equatorial_guinea" },
  { slug: "eri.1", tier: 1, trust: 0.44, type: "league", region: "africa", country: "eritrea" },
  { slug: "eri.2", tier: 2, trust: 0.36, type: "league", region: "africa", country: "eritrea" },
  { slug: "eri.cup", tier: 3, trust: 0.50, type: "cup", region: "africa", country: "eritrea" },
  { slug: "swz.1", tier: 1, trust: 0.54, type: "league", region: "africa", country: "eswatini" },
  { slug: "swz.2", tier: 2, trust: 0.44, type: "league", region: "africa", country: "eswatini" },
  { slug: "swz.cup", tier: 3, trust: 0.58, type: "cup", region: "africa", country: "eswatini" },
  { slug: "gab.1", tier: 1, trust: 0.56, type: "league", region: "africa", country: "gabon" },
  { slug: "gab.2", tier: 2, trust: 0.46, type: "league", region: "africa", country: "gabon" },
  { slug: "gab.cup", tier: 3, trust: 0.60, type: "cup", region: "africa", country: "gabon" },
  { slug: "gam.1", tier: 1, trust: 0.54, type: "league", region: "africa", country: "gambia" },
  { slug: "gam.2", tier: 2, trust: 0.44, type: "league", region: "africa", country: "gambia" },
  { slug: "gam.cup", tier: 3, trust: 0.58, type: "cup", region: "africa", country: "gambia" },
  { slug: "gha.1", tier: 1, trust: 0.68, type: "league", region: "africa", country: "ghana" },
  { slug: "gha.2", tier: 2, trust: 0.58, type: "league", region: "africa", country: "ghana" },
  { slug: "gha.cup", tier: 3, trust: 0.68, type: "cup", region: "africa", country: "ghana" },
  { slug: "gui.1", tier: 1, trust: 0.56, type: "league", region: "africa", country: "guinea" },
  { slug: "gui.2", tier: 2, trust: 0.46, type: "league", region: "africa", country: "guinea" },
  { slug: "gui.cup", tier: 3, trust: 0.60, type: "cup", region: "africa", country: "guinea" },
  { slug: "gnb.1", tier: 1, trust: 0.50, type: "league", region: "africa", country: "guinea_bissau" },
  { slug: "gnb.2", tier: 2, trust: 0.42, type: "league", region: "africa", country: "guinea_bissau" },
  { slug: "gnb.cup", tier: 3, trust: 0.56, type: "cup", region: "africa", country: "guinea_bissau" },
  { slug: "civ.1", tier: 1, trust: 0.66, type: "league", region: "africa", country: "ivory_coast" },
  { slug: "civ.2", tier: 2, trust: 0.56, type: "league", region: "africa", country: "ivory_coast" },
  { slug: "civ.cup", tier: 3, trust: 0.68, type: "cup", region: "africa", country: "ivory_coast" },
  { slug: "ken.1", tier: 1, trust: 0.64, type: "league", region: "africa", country: "kenya" },
  { slug: "ken.2", tier: 2, trust: 0.54, type: "league", region: "africa", country: "kenya" },
  { slug: "ken.cup", tier: 3, trust: 0.66, type: "cup", region: "africa", country: "kenya" },
  { slug: "mar.1", tier: 3, trust: 0.72, type: "league", region: "africa", country: "morocco" },
  { slug: "mar.2", tier: 3, trust: 0.62, type: "league", region: "africa", country: "morocco" },
  { slug: "mar.cup", tier: 3, trust: 0.72, type: "cup", region: "africa", country: "morocco" },
  { slug: "tun.1", tier: 3, trust: 0.70, type: "league", region: "africa", country: "tunisia" },
  { slug: "tun.cup", tier: 3, trust: 0.72, type: "cup", region: "africa", country: "tunisia" },
  { slug: "tun.2", tier: 3, trust: 0.60, type: "league", region: "africa", country: "tunisia" }
];

const CLEAN_LEAGUES_COVERAGE = LEAGUES_COVERAGE.filter(
  x => x && typeof x === "object" && x.slug
);

export const LEAGUE_SEEDS = CLEAN_LEAGUES_COVERAGE.map(x => x.slug);

export const LEAGUES_BY_SLUG = Object.fromEntries(
  CLEAN_LEAGUES_COVERAGE.map(x => [x.slug, x])
);

export function getLeagueCoverage(slug) {
  return LEAGUES_BY_SLUG[slug] || null;
}

export function getLeagueTrust(slug) {
  return LEAGUES_BY_SLUG[slug]?.trust ?? 0.70;
}

export function getLeagueTier(slug) {
  return LEAGUES_BY_SLUG[slug]?.tier ?? 3;
}

export function isCupCompetition(slug) {
  const type = LEAGUES_BY_SLUG[slug]?.type || "";
  return type === "cup";
}

export function isContinentalCompetition(slug) {
  const type = LEAGUES_BY_SLUG[slug]?.type || "";
  return type === "continental";
}

export function isLeagueCompetition(slug) {
  const type = LEAGUES_BY_SLUG[slug]?.type || "";
  return type === "league";
}
