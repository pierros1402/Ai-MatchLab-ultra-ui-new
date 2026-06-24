import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { leagueName } from "../../workers/_shared/leagues-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UEFA_COUNTRY_CODES = [
  "alb", "and", "arm", "aut", "aze", "blr", "bel", "bih", "bul", "cro",
  "cyp", "cze", "den", "eng", "est", "fro", "fin", "fra", "geo", "ger",
  "gib", "gre", "hun", "isl", "irl", "isr", "ita", "kaz", "kos", "lva",
  "lie", "ltu", "lux", "mlt", "mda", "mne", "mkd", "ned", "nir", "nor",
  "pol", "por", "rou", "rus", "smr", "sco", "srb", "svk", "svn", "esp",
  "swe", "sui", "tur", "ukr", "wal"
];

const COUNTRY_NAME_BY_CODE = {
  alb: "Albania",
  and: "Andorra",
  arm: "Armenia",
  aut: "Austria",
  aze: "Azerbaijan",
  blr: "Belarus",
  bel: "Belgium",
  bih: "Bosnia and Herzegovina",
  bul: "Bulgaria",
  cro: "Croatia",
  cyp: "Cyprus",
  cze: "Czech Republic",
  den: "Denmark",
  eng: "England",
  est: "Estonia",
  fro: "Faroe Islands",
  fin: "Finland",
  fra: "France",
  geo: "Georgia",
  ger: "Germany",
  gib: "Gibraltar",
  gre: "Greece",
  hun: "Hungary",
  isl: "Iceland",
  irl: "Ireland",
  isr: "Israel",
  ita: "Italy",
  kaz: "Kazakhstan",
  kos: "Kosovo",
  lva: "Latvia",
  lie: "Liechtenstein",
  ltu: "Lithuania",
  lux: "Luxembourg",
  mlt: "Malta",
  mda: "Moldova",
  mne: "Montenegro",
  mkd: "North Macedonia",
  ned: "Netherlands",
  nir: "Northern Ireland",
  nor: "Norway",
  pol: "Poland",
  por: "Portugal",
  rou: "Romania",
  rus: "Russia",
  smr: "San Marino",
  sco: "Scotland",
  srb: "Serbia",
  svk: "Slovakia",
  svn: "Slovenia",
  esp: "Spain",
  swe: "Sweden",
  sui: "Switzerland",
  tur: "Turkey",
  ukr: "Ukraine",
  wal: "Wales"
};

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    date: null,
    review: null,
    output: null,
    strict: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--date" && argv[i + 1]) {
      out.date = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--review" && argv[i + 1]) {
      out.review = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      out.output = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--strict") {
      out.strict = true;
      continue;
    }
  }

  if (!out.date) {
    throw new Error("--date YYYY-MM-DD is required");
  }

  if (!out.output) {
    out.output = path.join(
      process.cwd(),
      "data",
      "football-truth",
      "_diagnostics",
      "fixture-acquisition-stability",
      `${out.date}.uefa-league-coverage-contract.json`
    );
  }

  return out;
}

function readJson(file) {
  if (!file) return null;
  if (!fs.existsSync(file)) throw new Error(`Missing JSON file: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function clean(value) {
  return String(value || "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function cleanCoverageRows() {
  return (Array.isArray(LEAGUES_COVERAGE) ? LEAGUES_COVERAGE : [])
    .filter((row) => row && typeof row === "object" && row.slug)
    .map((row) => ({
      ...row,
      slug: clean(row.slug),
      code: clean(row.slug).split(".")[0],
      type: clean(row.type),
      region: clean(row.region),
      country: clean(row.country)
    }));
}

function normalizeReviewRows(review) {
  const rows = Array.isArray(review?.reviewItems) ? review.reviewItems : [];

  return rows.map((row) => ({
    leagueSlug: clean(row.leagueSlug),
    reviewId: clean(row.reviewId),
    dayKey: clean(row.dayKey),
    name: clean(row.name),
    country: clean(row.country),
    priority: clean(row.priority),
    targetType: clean(row.targetType),
    sourceVerdict: clean(row.reviewFields?.sourceVerdict || "unreviewed"),
    externallyActive: row.reviewFields?.externallyActive ?? null,
    fixtureCountFound: row.reviewFields?.fixtureCountFound ?? null,
    missingFromSnapshot: row.reviewFields?.missingFromSnapshot ?? null,
    sourceUrls: asArray(row.reviewFields?.sourceUrls).map(clean).filter(Boolean),
    reviewerNotes: clean(row.reviewFields?.reviewerNotes)
  }));
}

function groupCoverageByCode(rows) {
  const byCode = new Map();

  for (const code of UEFA_COUNTRY_CODES) {
    byCode.set(code, []);
  }

  for (const row of rows) {
    if (!UEFA_COUNTRY_CODES.includes(row.code)) continue;
    if (!byCode.has(row.code)) byCode.set(row.code, []);
    byCode.get(row.code).push(row);
  }

  return byCode;
}

function reviewStatusForSlug(reviewBySlug, slug) {
  return reviewBySlug.get(slug) || {
    leagueSlug: slug,
    reviewId: null,
    dayKey: null,
    sourceVerdict: "not_in_review_pack",
    externallyActive: null,
    fixtureCountFound: null,
    missingFromSnapshot: null,
    sourceUrls: [],
    reviewerNotes: ""
  };
}

function buildCountryRows({ coverageRows, reviewRows }) {
  const byCode = groupCoverageByCode(coverageRows);
  const reviewBySlug = new Map(reviewRows.map((row) => [row.leagueSlug, row]));

  return UEFA_COUNTRY_CODES.map((code) => {
    const rows = (byCode.get(code) || []).slice().sort((a, b) => a.slug.localeCompare(b.slug));
    const slugs = rows.map((row) => row.slug);

    const firstSlug = `${code}.1`;
    const secondSlug = `${code}.2`;
    const firstCoverage = rows.find((row) => row.slug === firstSlug) || null;
    const secondCoverage = rows.find((row) => row.slug === secondSlug) || null;
    const cups = rows.filter((row) => row.type === "cup");
    const domesticLeagues = rows.filter((row) => row.type === "league");
    const firstReview = reviewStatusForSlug(reviewBySlug, firstSlug);

    const reviewRowsForCountry = rows
      .map((row) => reviewStatusForSlug(reviewBySlug, row.slug))
      .filter((row) => row.sourceVerdict !== "not_in_review_pack");

    const todayVerifiedActive = reviewRowsForCountry.filter((row) => row.sourceVerdict === "verified_active");
    const todayVerifiedInactive = reviewRowsForCountry.filter((row) => row.sourceVerdict === "verified_inactive");
    const todayUnreviewed = reviewRowsForCountry.filter((row) => row.sourceVerdict === "unreviewed");
    const todayMissingFromSnapshot = reviewRowsForCountry.filter((row) => row.missingFromSnapshot === true);

    const needsCoverageFirstDivision = !firstCoverage;
    const needsCoverageSecondDivision = !secondCoverage;
    const needsTodayReview = firstCoverage && firstReview.sourceVerdict === "unreviewed";
    const notRepresentedInTodayReview = firstCoverage && firstReview.sourceVerdict === "not_in_review_pack";

    let action = "none";
    if (needsCoverageFirstDivision) action = "add_first_division_to_coverage";
    else if (needsTodayReview) action = "review_today_first_division_activity";
    else if (notRepresentedInTodayReview) action = "season_watch_only_not_in_today_review";
    else if (firstReview.sourceVerdict === "verified_active" && firstReview.missingFromSnapshot === true) action = "fix_today_snapshot_gap";
    else if (firstReview.sourceVerdict === "verified_inactive") action = "no_today_fixture_gap";
    else if (firstReview.sourceVerdict === "verified_active") action = "today_active_present_or_gap_reviewed";

    return {
      code,
      country: COUNTRY_NAME_BY_CODE[code] || code,
      coverage: {
        hasFirstDivision: !!firstCoverage,
        firstDivisionSlug: firstCoverage?.slug || firstSlug,
        firstDivisionName: firstCoverage ? leagueName(firstCoverage.slug) : null,
        hasSecondDivision: !!secondCoverage,
        secondDivisionSlug: secondCoverage?.slug || secondSlug,
        secondDivisionName: secondCoverage ? leagueName(secondCoverage.slug) : null,
        leagueSlugs: domesticLeagues.map((row) => row.slug),
        cupSlugs: cups.map((row) => row.slug),
        declaredSlugCount: slugs.length
      },
      today: {
        dateReviewStatus: firstReview.sourceVerdict,
        externallyActive: firstReview.externallyActive,
        fixtureCountFound: firstReview.fixtureCountFound,
        missingFromSnapshot: firstReview.missingFromSnapshot,
        reviewId: firstReview.reviewId,
        sourceUrls: firstReview.sourceUrls,
        reviewerNotes: firstReview.reviewerNotes
      },
      countryReviewSummary: {
        reviewedRowsInPack: reviewRowsForCountry.length,
        verifiedActiveCount: todayVerifiedActive.length,
        verifiedInactiveCount: todayVerifiedInactive.length,
        unreviewedCount: todayUnreviewed.length,
        missingFromSnapshotCount: todayMissingFromSnapshot.length,
        reviewedSlugs: reviewRowsForCountry.map((row) => ({
          leagueSlug: row.leagueSlug,
          sourceVerdict: row.sourceVerdict,
          externallyActive: row.externallyActive,
          missingFromSnapshot: row.missingFromSnapshot
        }))
      },
      action
    };
  });
}

function count(rows, predicate) {
  return rows.filter(predicate).length;
}

function buildReport({ date, reviewPath }) {
  const coverageRows = cleanCoverageRows();
  const review = reviewPath ? readJson(reviewPath) : null;
  const reviewRows = normalizeReviewRows(review);
  const countryRows = buildCountryRows({ coverageRows, reviewRows });

  const allCoverageSlugs = new Set(coverageRows.map((row) => row.slug));
  const duplicateCoverageSlugs = coverageRows
    .map((row) => row.slug)
    .filter((slug, index, all) => all.indexOf(slug) !== index);

  const reviewRowsWithoutCoverage = reviewRows
    .filter((row) => row.leagueSlug && !allCoverageSlugs.has(row.leagueSlug))
    .map((row) => row.leagueSlug)
    .sort();

  const summary = {
    date,
    uefaCountryCountExpected: UEFA_COUNTRY_CODES.length,
    uefaCountryRows: countryRows.length,
    coveredFirstDivisionCount: count(countryRows, (row) => row.coverage.hasFirstDivision),
    missingFirstDivisionCount: count(countryRows, (row) => !row.coverage.hasFirstDivision),
    coveredSecondDivisionCount: count(countryRows, (row) => row.coverage.hasSecondDivision),
    missingSecondDivisionCount: count(countryRows, (row) => !row.coverage.hasSecondDivision),
    declaredDomesticLeagueCount: coverageRows.filter((row) => row.region === "europe" && row.type === "league").length,
    declaredDomesticCupCount: coverageRows.filter((row) => row.region === "europe" && row.type === "cup").length,
    todayFirstDivisionVerifiedActiveCount: count(countryRows, (row) => row.today.dateReviewStatus === "verified_active"),
    todayFirstDivisionVerifiedInactiveCount: count(countryRows, (row) => row.today.dateReviewStatus === "verified_inactive"),
    todayFirstDivisionUnreviewedCount: count(countryRows, (row) => row.today.dateReviewStatus === "unreviewed"),
    todayFirstDivisionNotInReviewPackCount: count(countryRows, (row) => row.today.dateReviewStatus === "not_in_review_pack"),
    todayFirstDivisionMissingFromSnapshotCount: count(countryRows, (row) => row.today.missingFromSnapshot === true),
    reviewRowsWithoutCoverageCount: reviewRowsWithoutCoverage.length,
    duplicateCoverageSlugCount: duplicateCoverageSlugs.length
  };

  const actionRows = countryRows.filter((row) => row.action !== "none");

  const ok = (
    summary.uefaCountryRows === summary.uefaCountryCountExpected &&
    summary.missingFirstDivisionCount === 0 &&
    summary.reviewRowsWithoutCoverageCount === 0 &&
    summary.duplicateCoverageSlugCount === 0
  );

  return {
    ok,
    generatedAt: new Date().toISOString(),
    source: {
      coverageRegistry: "workers/_shared/leagues-coverage.js",
      reviewPack: reviewPath || null
    },
    guarantees: {
      sourceFetch: false,
      canonicalWrites: 0,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    },
    summary,
    missingFirstDivisionCountries: countryRows
      .filter((row) => !row.coverage.hasFirstDivision)
      .map((row) => ({ code: row.code, country: row.country, expectedSlug: `${row.code}.1` })),
    missingSecondDivisionCountries: countryRows
      .filter((row) => !row.coverage.hasSecondDivision)
      .map((row) => ({ code: row.code, country: row.country, expectedSlug: `${row.code}.2` })),
    todayFirstDivisionSnapshotGaps: countryRows
      .filter((row) => row.today.missingFromSnapshot === true)
      .map((row) => ({
        code: row.code,
        country: row.country,
        leagueSlug: row.coverage.firstDivisionSlug,
        name: row.coverage.firstDivisionName,
        sourceVerdict: row.today.dateReviewStatus,
        fixtureCountFound: row.today.fixtureCountFound,
        action: row.action
      })),
    todayFirstDivisionUnreviewed: countryRows
      .filter((row) => row.today.dateReviewStatus === "unreviewed")
      .map((row) => ({
        code: row.code,
        country: row.country,
        leagueSlug: row.coverage.firstDivisionSlug,
        name: row.coverage.firstDivisionName,
        reviewId: row.today.reviewId,
        action: row.action
      })),
    todayFirstDivisionNotInReviewPack: countryRows
      .filter((row) => row.today.dateReviewStatus === "not_in_review_pack")
      .map((row) => ({
        code: row.code,
        country: row.country,
        leagueSlug: row.coverage.firstDivisionSlug,
        name: row.coverage.firstDivisionName,
        action: row.action
      })),
    reviewRowsWithoutCoverage,
    duplicateCoverageSlugs,
    actionRows,
    countries: countryRows
  };
}

function main() {
  const options = parseArgs();
  const report = buildReport({
    date: options.date,
    reviewPath: options.review
  });

  writeJson(options.output, report);
  console.log(JSON.stringify({
    ok: report.ok,
    output: options.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));

  if (!report.ok && options.strict) {
    process.exitCode = 1;
  }
}

main();