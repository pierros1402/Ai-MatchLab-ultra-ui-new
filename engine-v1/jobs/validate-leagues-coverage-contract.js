import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";

const UEFA_COUNTRY_CODES = [
  "alb", "and", "arm", "aut", "aze", "blr", "bel", "bih", "bul", "cro",
  "cyp", "cze", "den", "eng", "est", "fro", "fin", "fra", "geo", "ger",
  "gib", "gre", "hun", "isl", "irl", "isr", "ita", "kaz", "kos", "lva",
  "lie", "ltu", "lux", "mlt", "mda", "mne", "mkd", "ned", "nir", "nor",
  "pol", "por", "rou", "rus", "smr", "sco", "srb", "svk", "svn", "esp",
  "swe", "sui", "tur", "ukr", "wal"
];

const REQUIRED_EXACT_SLUGS = [
  "eng.1", "eng.2", "eng.3", "eng.4", "eng.5",
  "ger.1", "ger.2", "ger.3",
  "uefa.champions", "uefa.europa", "uefa.europa.conf",
  "afc.champions", "afc.cup",
  "caf.champions", "caf.confed",
  "conmebol.libertadores"
];

const WORLD_TOP_TWO_MINIMUM_CODES = [
  // Americas currently in target scope
  "usa", "arg", "bra", "mex", "uru", "col", "chi", "per",

  // Asia / Middle East currently in target scope
  "jpn", "kor", "ksa", "uae", "qat",

  // Africa currently in target scope
  "rsa", "egy", "mar", "tun",

  // Countries already proven present in ESPN all-scoreboard audit but missing from target
  "idn", "mys", "ind", "uga", "ven", "ecu"
];

const DOMESTIC_CUP_EXPECTED = [
  "eng.fa", "eng.league_cup",
  "ger.dfb_pokal",
  "esp.copa_del_rey",
  "ita.coppa_italia",
  "fra.coupe_de_france",
  "ned.cup",
  "por.taca.portugal",
  "gre.cup",
  "tur.cup",
  "sui.cup",
  "aut.cup",
  "den.cup",
  "swe.cup",
  "nor.cup",
  "pol.cup",
  "cze.cup",
  "rou.cup",
  "srb.cup",
  "cro.cup",
  "hun.cup",
  "bul.cup",
  "ukr.cup"
];

function cleanRows() {
  return (Array.isArray(LEAGUES_COVERAGE) ? LEAGUES_COVERAGE : [])
    .filter(row => row && typeof row === "object" && row.slug)
    .map(row => ({
      ...row,
      slug: String(row.slug).trim()
    }));
}

function hasSlug(set, slug) {
  return set.has(String(slug || "").trim());
}

function auditTopTwo({ codes, slugs }) {
  return codes.map(code => {
    const first = `${code}.1`;
    const second = `${code}.2`;

    return {
      code,
      hasFirst: hasSlug(slugs, first),
      hasSecond: hasSlug(slugs, second),
      ok: hasSlug(slugs, first) && hasSlug(slugs, second)
    };
  });
}

function groupByPrefix(slugList) {
  const out = {};

  for (const slug of slugList) {
    const prefix = String(slug).split(".")[0];
    out[prefix] = (out[prefix] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(out).sort((a, b) => a[0].localeCompare(b[0]))
  );
}

function main() {
  const rows = cleanRows();
  const slugList = rows.map(row => row.slug);
  const slugs = new Set(slugList);

  const duplicateSlugs = slugList.filter((slug, index) => slugList.indexOf(slug) !== index);

  const missingExact = REQUIRED_EXACT_SLUGS.filter(slug => !hasSlug(slugs, slug));
  const missingDomesticCups = DOMESTIC_CUP_EXPECTED.filter(slug => !hasSlug(slugs, slug));

  const uefaAudit = auditTopTwo({
    codes: UEFA_COUNTRY_CODES,
    slugs
  });

  const worldAudit = auditTopTwo({
    codes: WORLD_TOP_TWO_MINIMUM_CODES,
    slugs
  });

  const invalidRows = rows.filter(row =>
    !row.slug ||
    !row.type ||
    !row.region ||
    !row.country ||
    typeof row.trust !== "number" ||
    typeof row.tier !== "number"
  ).map(row => ({
    slug: row.slug || null,
    missing: {
      type: !row.type,
      region: !row.region,
      country: !row.country,
      trust: typeof row.trust !== "number",
      tier: typeof row.tier !== "number"
    }
  }));

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    totals: {
      rows: rows.length,
      uniqueSlugs: slugs.size,
      duplicateCount: duplicateSlugs.length
    },
    contract: {
      uefaCountryCountExpected: UEFA_COUNTRY_CODES.length,
      worldTopTwoMinimumCountryCount: WORLD_TOP_TWO_MINIMUM_CODES.length,
      requiredExactCount: REQUIRED_EXACT_SLUGS.length,
      domesticCupExpectedCount: DOMESTIC_CUP_EXPECTED.length
    },
    missing: {
      exact: missingExact,
      domesticCups: missingDomesticCups,
      uefaTopTwo: uefaAudit.filter(row => !row.ok),
      worldTopTwoMinimum: worldAudit.filter(row => !row.ok)
    },
    present: {
      england: slugList.filter(slug => slug.startsWith("eng.")).sort(),
      germany: slugList.filter(slug => slug.startsWith("ger.")).sort(),
      uefaCompetitions: slugList.filter(slug => slug.startsWith("uefa.")).sort(),
      continental: rows.filter(row => row.type === "continental").map(row => row.slug).sort()
    },
    invalidRows,
    duplicateSlugs,
    byPrefix: groupByPrefix(slugList)
  };

  if (
    duplicateSlugs.length ||
    invalidRows.length ||
    missingExact.length ||
    missingDomesticCups.length ||
    report.missing.uefaTopTwo.length ||
    report.missing.worldTopTwoMinimum.length
  ) {
    report.ok = false;
  }

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok && process.argv.includes("--strict")) {
    process.exitCode = 1;
  }
}

main();
