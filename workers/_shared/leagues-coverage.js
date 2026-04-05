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

  // ----------------------------------------------------------
  // AMERICAS
  // ----------------------------------------------------------
  { slug: "usa.1", tier: 2, trust: 0.88, type: "league", region: "americas", country: "usa" },
  { slug: "usa.2", tier: 3, trust: 0.76, type: "league", region: "americas", country: "usa" },
  { slug: "arg.1", tier: 2, trust: 0.88, type: "league", region: "americas", country: "argentina" },
  { slug: "arg.2", tier: 3, trust: 0.76, type: "league", region: "americas", country: "argentina" },
  { slug: "bra.1", tier: 2, trust: 0.88, type: "league", region: "americas", country: "brazil" },
  { slug: "bra.2", tier: 3, trust: 0.76, type: "league", region: "americas", country: "brazil" },
  { slug: "mex.1", tier: 2, trust: 0.88, type: "league", region: "americas", country: "mexico" },
  { slug: "mex.2", tier: 3, trust: 0.74, type: "league", region: "americas", country: "mexico" },
  { slug: "uru.1", tier: 3, trust: 0.74, type: "league", region: "americas", country: "uruguay" },
  { slug: "uru.2", tier: 3, trust: 0.66, type: "league", region: "americas", country: "uruguay" },
  { slug: "col.1", tier: 3, trust: 0.74, type: "league", region: "americas", country: "colombia" },
  { slug: "col.2", tier: 3, trust: 0.66, type: "league", region: "americas", country: "colombia" },
  { slug: "chi.1", tier: 3, trust: 0.72, type: "league", region: "americas", country: "chile" },
  { slug: "chi.2", tier: 3, trust: 0.64, type: "league", region: "americas", country: "chile" },
  { slug: "per.1", tier: 3, trust: 0.70, type: "league", region: "americas", country: "peru" },
  { slug: "per.2", tier: 3, trust: 0.62, type: "league", region: "americas", country: "peru" },

  // ----------------------------------------------------------
  // ASIA / MIDDLE EAST
  // ----------------------------------------------------------
  { slug: "jpn.1", tier: 2, trust: 0.88, type: "league", region: "asia", country: "japan" },
  { slug: "jpn.2", tier: 3, trust: 0.74, type: "league", region: "asia", country: "japan" },
  { slug: "kor.1", tier: 2, trust: 0.84, type: "league", region: "asia", country: "south_korea" },
  { slug: "kor.2", tier: 3, trust: 0.70, type: "league", region: "asia", country: "south_korea" },
  { slug: "ksa.1", tier: 2, trust: 0.84, type: "league", region: "asia", country: "saudi_arabia" },
  { slug: "ksa.2", tier: 3, trust: 0.68, type: "league", region: "asia", country: "saudi_arabia" },
  { slug: "uae.1", tier: 3, trust: 0.72, type: "league", region: "asia", country: "uae" },
  { slug: "uae.2", tier: 3, trust: 0.62, type: "league", region: "asia", country: "uae" },
  { slug: "qat.1", tier: 3, trust: 0.72, type: "league", region: "asia", country: "qatar" },
  { slug: "qat.2", tier: 3, trust: 0.62, type: "league", region: "asia", country: "qatar" },

  // ----------------------------------------------------------
  // AFRICA
  // ----------------------------------------------------------
  { slug: "rsa.1", tier: 3, trust: 0.74, type: "league", region: "africa", country: "south_africa" },
  { slug: "rsa.2", tier: 3, trust: 0.66, type: "league", region: "africa", country: "south_africa" },
  { slug: "egy.1", tier: 3, trust: 0.72, type: "league", region: "africa", country: "egypt" },
  { slug: "egy.2", tier: 3, trust: 0.62, type: "league", region: "africa", country: "egypt" },
  { slug: "mar.1", tier: 3, trust: 0.72, type: "league", region: "africa", country: "morocco" },
  { slug: "mar.2", tier: 3, trust: 0.62, type: "league", region: "africa", country: "morocco" },
  { slug: "tun.1", tier: 3, trust: 0.70, type: "league", region: "africa", country: "tunisia" },
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