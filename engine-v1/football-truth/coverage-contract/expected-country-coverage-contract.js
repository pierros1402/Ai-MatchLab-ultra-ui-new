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
  { country: "brazil", prefix: "bra", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "argentina", prefix: "arg", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "usa", prefix: "usa", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "mexico", prefix: "mex", region: "americas", expectedDepth: 2, expectsNationalCup: true },
  { country: "japan", prefix: "jpn", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "south-korea", prefix: "kor", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "saudi-arabia", prefix: "ksa", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "australia", prefix: "aus", region: "asia", expectedDepth: 2, expectsNationalCup: true },
  { country: "egypt", prefix: "egy", region: "africa", expectedDepth: 2, expectsNationalCup: true },
  { country: "south-africa", prefix: "rsa", region: "africa", expectedDepth: 2, expectsNationalCup: true },
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
