export const EXPECTED_COUNTRY_COVERAGE_CONTRACT = [
  // This is the explicit contract seed, not a provider list.
  // It must be expanded in controlled waves until it represents the full intended global coverage:
  // global 1st+2nd divisions, England depth 5, Germany depth 3, plus national cups.
  { country: "england", prefix: "eng", region: "europe", expectedDepth: 5, expectsNationalCup: true },
  { country: "germany", prefix: "ger", region: "europe", expectedDepth: 3, expectsNationalCup: true },
  { country: "spain", prefix: "esp", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "italy", prefix: "ita", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "france", prefix: "fra", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "portugal", prefix: "por", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "netherlands", prefix: "ned", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "belgium", prefix: "bel", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "greece", prefix: "gre", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "turkey", prefix: "tur", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "albania", prefix: "alb", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "andorra", prefix: "and", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "armenia", prefix: "arm", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "austria", prefix: "aut", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "azerbaijan", prefix: "aze", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "belarus", prefix: "blr", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "bosnia_and_herzegovina", prefix: "bih", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "bulgaria", prefix: "bul", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "croatia", prefix: "cro", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "cyprus", prefix: "cyp", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "czech_republic", prefix: "cze", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "denmark", prefix: "den", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "estonia", prefix: "est", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "faroe_islands", prefix: "fro", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "finland", prefix: "fin", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "georgia", prefix: "geo", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "gibraltar", prefix: "gib", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "hungary", prefix: "hun", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "iceland", prefix: "isl", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "ireland", prefix: "irl", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "israel", prefix: "isr", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "kazakhstan", prefix: "kaz", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "kosovo", prefix: "kos", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "latvia", prefix: "lva", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "liechtenstein", prefix: "lie", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "lithuania", prefix: "ltu", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "luxembourg", prefix: "lux", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "malta", prefix: "mlt", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "moldova", prefix: "mda", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "montenegro", prefix: "mne", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "north_macedonia", prefix: "mkd", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "northern_ireland", prefix: "nir", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "norway", prefix: "nor", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "poland", prefix: "pol", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "romania", prefix: "rou", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "russia", prefix: "rus", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "san_marino", prefix: "smr", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "scotland", prefix: "sco", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "serbia", prefix: "srb", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "slovakia", prefix: "svk", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "slovenia", prefix: "svn", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "sweden", prefix: "swe", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "switzerland", prefix: "sui", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "ukraine", prefix: "ukr", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "wales", prefix: "wal", region: "europe", expectedDepth: 2, expectsNationalCup: true },
  { country: "brazil", prefix: "bra", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "argentina", prefix: "arg", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "usa", prefix: "usa", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "mexico", prefix: "mex", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "chile", prefix: "chi", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "colombia", prefix: "col", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "ecuador", prefix: "ecu", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "peru", prefix: "per", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "uruguay", prefix: "uru", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "venezuela", prefix: "ven", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "japan", prefix: "jpn", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "south_korea", prefix: "kor", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "saudi_arabia", prefix: "ksa", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "india", prefix: "ind", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "indonesia", prefix: "idn", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "malaysia", prefix: "mys", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "qatar", prefix: "qat", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "uae", prefix: "uae", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "australia", prefix: "aus", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "egypt", prefix: "egy", region: "africa", expectedDepth: 2, expectsNationalCup: true },
  { country: "south_africa", prefix: "rsa", region: "africa", expectedDepth: 2, expectsNationalCup: true },
  { country: "uganda", prefix: "uga", region: "africa", expectedDepth: 2, expectsNationalCup: true },
  { country: "morocco", prefix: "mar", region: "africa", expectedDepth: 2, expectsNationalCup: true },
  { country: "tunisia", prefix: "tun", region: "africa", expectedDepth: 2, expectsNationalCup: true }
];

export function normalizeContractCountry(value) {
  return value == null ? "" : String(value).trim().toLowerCase();
}

export function expectedLeagueSlugsForContractRow(row) {
  const prefix = normalizeContractCountry(row?.prefix);
  const depth = Number(row?.expectedDepth);

  if (!prefix || !Number.isFinite(depth) || depth < 1) return [];

  return Array.from({ length: depth }, (_, index) => `${prefix}.${index + 1}`);
}

export function validateExpectedCountryCoverageContract(rows = EXPECTED_COUNTRY_COVERAGE_CONTRACT) {
  const contractRows = Array.isArray(rows) ? rows : [];
  const invalidRows = [];
  const duplicateCountries = [];
  const duplicatePrefixes = [];
  const seenCountries = new Set();
  const seenPrefixes = new Set();

  for (const row of contractRows) {
    const country = normalizeContractCountry(row?.country);
    const prefix = normalizeContractCountry(row?.prefix);
    const region = normalizeContractCountry(row?.region);
    const expectedDepth = Number(row?.expectedDepth);

    if (!country || !prefix || !region || !Number.isFinite(expectedDepth) || expectedDepth < 1) {
      invalidRows.push({
        country,
        prefix,
        region,
        expectedDepth: row?.expectedDepth,
        reason: "missing_or_invalid_country_prefix_region_or_expected_depth"
      });
      continue;
    }

    if (seenCountries.has(country)) duplicateCountries.push(country);
    seenCountries.add(country);

    if (seenPrefixes.has(prefix)) duplicatePrefixes.push(prefix);
    seenPrefixes.add(prefix);
  }

  return {
    ok: invalidRows.length === 0 && duplicateCountries.length === 0 && duplicatePrefixes.length === 0,
    expectedCountryCount: contractRows.length,
    invalidRows,
    duplicateCountries,
    duplicatePrefixes
  };
}
