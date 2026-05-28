#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LEAGUES_COVERAGE, LEAGUE_SEEDS } from "../../workers/_shared/leagues-coverage.js";
import {
  EXPECTED_COUNTRY_COVERAGE_CONTRACT,
  expectedLeagueSlugsForContractRow,
  validateExpectedCountryCoverageContract
} from "../football-truth/coverage-contract/expected-country-coverage-contract.js";

const __filename = fileURLToPath(import.meta.url);

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { output: "", selfTest: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = argv[++i];
      continue;
    }

    throw new Error("unknown or incomplete argument: " + arg);
  }

  return args;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function rowView(row) {
  return {
    slug: clean(row.slug),
    name: clean(row.name),
    type: clean(row.type),
    region: clean(row.region),
    country: clean(row.country),
    tier: row.tier,
    level: row.level
  };
}

function byKey(rows, key) {
  return rows.reduce((acc, row) => {
    const value = clean(row[key]) || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

const EXPECTED_CONTINENTAL_AND_GLOBAL = [
  { slug: "uefa.champions", label: "UEFA Champions League" },
  { slug: "uefa.europa", label: "UEFA Europa League" },
  { slug: "uefa.europa.conf", label: "UEFA Conference League" },
  { slug: "uefa.super_cup", label: "UEFA Super Cup" },
  { slug: "conmebol.libertadores", label: "CONMEBOL Libertadores" },
  { slug: "conmebol.sudamericana", label: "CONMEBOL Sudamericana" },
  { slug: "conmebol.recopa", label: "CONMEBOL Recopa" },
  { slug: "concacaf.champions", label: "CONCACAF Champions Cup" },
  { slug: "concacaf.central_american_cup", label: "CONCACAF Central American Cup" },
  { slug: "concacaf.caribbean_cup", label: "CONCACAF Caribbean Cup" },
  { slug: "afc.champions", label: "AFC Champions League Elite" },
  { slug: "afc.cup", label: "AFC Champions League Two / AFC Cup canonical slug" },
  { slug: "caf.champions", label: "CAF Champions League" },
  { slug: "caf.confed", label: "CAF Confederation Cup" },
  { slug: "ofc.champions", label: "OFC Champions League" },
  { slug: "fifa.club_world_cup", label: "FIFA Club World Cup" },
  { slug: "fifa.intercontinental_cup", label: "FIFA Intercontinental Cup" }
];

function expectedDepthForCountry(country) {
  if (country === "england") return 5;
  if (country === "germany") return 3;
  return 2;
}

function auditCoverage(rows = LEAGUES_COVERAGE) {
  const coverageRows = Array.isArray(rows) ? rows : [];
  const slugs = new Set(coverageRows.map((row) => clean(row.slug)).filter(Boolean));

  const leagueRows = coverageRows.filter((row) => clean(row.type) === "league");
  const cupRows = coverageRows.filter((row) => clean(row.type) === "cup");
  const continentalRows = coverageRows.filter((row) => clean(row.type) === "continental");

  const invalidRows = [];
  const duplicateSlugs = [];
  const seenSlugs = new Set();

  for (const row of coverageRows) {
    const slug = clean(row.slug);

    if (!slug || !clean(row.type) || !clean(row.region) || !clean(row.country)) {
      invalidRows.push({ ...rowView(row), reason: "missing_required_slug_type_region_or_country" });
    }

    if (slug) {
      if (seenSlugs.has(slug)) duplicateSlugs.push(slug);
      seenSlugs.add(slug);
    }
  }

  const countriesWithLeagues = [...new Set(
    leagueRows.map((row) => clean(row.country)).filter(Boolean)
  )].sort();

  const contractValidation = validateExpectedCountryCoverageContract(EXPECTED_COUNTRY_COVERAGE_CONTRACT);
  const expectedCountryContractRows = Array.isArray(EXPECTED_COUNTRY_COVERAGE_CONTRACT)
    ? EXPECTED_COUNTRY_COVERAGE_CONTRACT
    : [];

  const expectedCountries = expectedCountryContractRows
    .map((row) => clean(row.country))
    .filter(Boolean)
    .sort();

  const coveredExpectedCountries = expectedCountries
    .filter((country) => countriesWithLeagues.includes(country));

  const missingCountries = expectedCountryContractRows
    .filter((row) => !countriesWithLeagues.includes(clean(row.country)))
    .map((row) => ({
      country: clean(row.country),
      prefix: clean(row.prefix),
      region: clean(row.region),
      expectedDepth: Number(row.expectedDepth),
      expectsNationalCup: row.expectsNationalCup === true,
      expectedLeagueSlugs: expectedLeagueSlugsForContractRow(row),
      reason: "expected_country_missing_from_leagues_coverage"
    }));

  const missingExpectedLeagueRows = [];

  for (const row of expectedCountryContractRows) {
    const country = clean(row.country);
    const expectedSlugs = expectedLeagueSlugsForContractRow(row);

    for (const expectedSlug of expectedSlugs) {
      if (!slugs.has(expectedSlug)) {
        missingExpectedLeagueRows.push({
          country,
          prefix: clean(row.prefix),
          region: clean(row.region),
          expectedSlug,
          reason: "expected_league_slug_missing_from_coverage"
        });
      }
    }
  }

  const missingExpectedNationalCupRows = expectedCountryContractRows
    .filter((row) => row.expectsNationalCup === true)
    .filter((row) => !cupRows.some((cupRow) => clean(cupRow.country) === clean(row.country)))
    .map((row) => ({
      country: clean(row.country),
      prefix: clean(row.prefix),
      region: clean(row.region),
      reason: "expected_country_national_cup_missing_from_coverage"
    }));

  const countryDepthRows = countriesWithLeagues.map((country) => {
    const countryLeagueRows = leagueRows.filter((row) => clean(row.country) === country);
    const prefixes = [...new Set(countryLeagueRows.map((row) => clean(row.slug).split(".")[0]).filter(Boolean))];
    const expectedDepth = expectedDepthForCountry(country);

    if (prefixes.length !== 1) {
      return {
        country,
        expectedDepth,
        prefix: "",
        presentSlugs: countryLeagueRows.map((row) => clean(row.slug)).sort(),
        missingSlugs: [],
        status: "gap_or_ambiguous",
        reason: prefixes.length === 0 ? "no_league_prefix" : "ambiguous_country_prefixes"
      };
    }

    const prefix = prefixes[0];
    const expectedSlugs = Array.from({ length: expectedDepth }, (_, index) => prefix + "." + (index + 1));
    const presentSlugs = countryLeagueRows.map((row) => clean(row.slug)).sort();
    const missingSlugs = expectedSlugs.filter((slug) => !slugs.has(slug));

    return {
      country,
      expectedDepth,
      prefix,
      presentSlugs,
      missingSlugs,
      status: missingSlugs.length === 0 ? "ok" : "gap_or_ambiguous",
      reason: missingSlugs.length === 0 ? "expected_depth_present" : "missing_expected_depth_slug"
    };
  });

  const countryDepthGaps = countryDepthRows.filter((row) => row.status !== "ok");

  const countriesMissingNationalCup = countriesWithLeagues
    .filter((country) => !cupRows.some((row) => clean(row.country) === country))
    .map((country) => ({
      country,
      reason: "country_has_league_coverage_but_no_national_cup_row"
    }));

  const missingContinentalAndGlobal = EXPECTED_CONTINENTAL_AND_GLOBAL
    .filter((expected) => !slugs.has(expected.slug))
    .map((expected) => ({
      ...expected,
      reason: "expected_continental_or_global_club_competition_missing"
    }));

  const tierMetadataWarnings = leagueRows
    .map(rowView)
    .filter((row) => {
      const level = Number(row.slug.split(".")[1]);
      if (!Number.isFinite(level)) return false;
      return Number(row.tier) !== level;
    })
    .map((row) => ({
      ...row,
      reason: "league_slug_numeric_level_does_not_match_tier_metadata"
    }));

  return {
    ok: true,
    job: "audit-leagues-coverage-contract-file",
    mode: "read_only_coverage_contract_audit",
    generatedAt: new Date().toISOString(),
    contract: {
      leagues: "global first and second divisions; England depth 5; Germany depth 3",
      cups: "national cups for covered countries",
      continentalAndGlobal: "UEFA, CONMEBOL, CONCACAF, AFC, CAF, OFC and FIFA club competitions"
    },
    summary: {
      coverageRowCount: coverageRows.length,
      leagueSeedCount: Array.isArray(LEAGUE_SEEDS) ? LEAGUE_SEEDS.length : null,
      leagueCount: leagueRows.length,
      cupCount: cupRows.length,
      continentalCount: continentalRows.length,
      countryWithLeagueCount: countriesWithLeagues.length,
      expectedCountryContractCount: expectedCountryContractRows.length,
      coveredExpectedCountryCount: coveredExpectedCountries.length,
      missingCountryCount: missingCountries.length,
      missingExpectedLeagueRowCount: missingExpectedLeagueRows.length,
      missingExpectedNationalCupRowCount: missingExpectedNationalCupRows.length,
      contractInvalidRowCount: contractValidation.invalidRows.length,
      contractDuplicateCountryCount: contractValidation.duplicateCountries.length,
      contractDuplicatePrefixCount: contractValidation.duplicatePrefixes.length,
      countryDepthGapCount: countryDepthGaps.length,
      countriesMissingNationalCupCount: countriesMissingNationalCup.length,
      missingContinentalAndGlobalCount: missingContinentalAndGlobal.length,
      invalidRowCount: invalidRows.length,
      duplicateSlugCount: duplicateSlugs.length,
      tierMetadataWarningCount: tierMetadataWarnings.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byType: byKey(coverageRows, "type"),
    byRegion: byKey(coverageRows, "region"),
    expectedCountryContract: {
      validation: contractValidation,
      expectedCountries,
      coveredExpectedCountries
    },
    missingCountries,
    missingExpectedLeagueRows,
    missingExpectedNationalCupRows,
    missingContinentalAndGlobal,
    countryDepthRows,
    countryDepthGaps,
    countriesMissingNationalCup,
    tierMetadataWarnings,
    invalidRows,
    duplicateSlugs,
    guarantees: {
      readOnly: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false,
      finalTruthWrites: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const fixture = [
    { slug: "eng.1", type: "league", region: "europe", country: "england", tier: 1 },
    { slug: "eng.2", type: "league", region: "europe", country: "england", tier: 2 },
    { slug: "eng.fa", type: "cup", region: "europe", country: "england", tier: 2 },
    { slug: "uefa.champions", type: "continental", region: "europe", country: "uefa", tier: 1 }
  ];

  const report = auditCoverage(fixture);

  if (report.summary.coverageRowCount !== 4) throw new Error("expected fixture rows");
  if (report.summary.countryDepthGapCount < 1) throw new Error("expected England depth gap");
  if (report.summary.expectedCountryContractCount < 1) throw new Error("expected country contract rows");
  if (report.summary.missingExpectedLeagueRowCount < 1) throw new Error("expected missing contract league diagnostics");
  if (!report.missingContinentalAndGlobal.some((row) => row.slug === "conmebol.sudamericana")) {
    throw new Error("expected missing Sudamericana diagnostic");
  }
  if (report.guarantees.canonicalWrites !== 0) throw new Error("must be read-only");

  return {
    ok: true,
    selfTest: "audit-leagues-coverage-contract-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const report = auditCoverage(LEAGUES_COVERAGE);

  if (args.output) {
    writeJson(args.output, report);
  }

  console.log(JSON.stringify({
    ok: true,
    output: args.output || "",
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}

export { auditCoverage };
