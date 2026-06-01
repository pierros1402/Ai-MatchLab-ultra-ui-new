#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const COUNTRY_PREFIX_TERMS = {
  aut: ["austria", "austrian"],
  bel: ["belgium", "belgian"],
  chi: ["chile", "chilean"],
  cyp: ["cyprus", "cypriot"],
  den: ["denmark", "danish"],
  ger: ["germany", "german"],
  gre: ["greece", "greek"],
  irl: ["ireland", "irish", "league of ireland"],
  jpn: ["japan", "japanese"],
  ksa: ["saudi arabia", "saudi"],
  nir: ["northern ireland", "northern irish"],
  nor: ["norway", "norwegian"],
  per: ["peru", "peruvian"],
  por: ["portugal", "portuguese"],
  rou: ["romania", "romanian"],
  sui: ["switzerland", "swiss"],
  swe: ["sweden", "swedish"],
  tur: ["turkey", "turkish", "türkiye"],
  uru: ["uruguay", "uruguayan"],
  usa: ["united states", "usa", "us"]
};

function normalizeTerm(value) {
  return asText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTerms(values) {
  const seen = new Set();
  const rows = [];

  for (const value of values.flat(Infinity)) {
    const text = normalizeTerm(value);
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    rows.push(text);
  }

  return rows;
}

function compactLeagueTerm(value) {
  return normalizeTerm(value)
    .replace(/\bfootball\b/gi, " ")
    .replace(/\bsoccer\b/gi, " ")
    .replace(/\bleague\b/gi, " ")
    .replace(/\bdivision\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function termsFromCoverageCountry(country) {
  const normalized = normalizeTerm(country);
  if (!normalized) return [];

  return uniqueTerms([
    normalized,
    normalized.replace(/_/g, " "),
    normalized.replace(/_/g, "-")
  ]);
}

const LEAGUE_COVERAGE_BY_SLUG = new Map(
  (Array.isArray(LEAGUES_COVERAGE) ? LEAGUES_COVERAGE : [])
    .filter((row) => asText(row && row.slug))
    .map((row) => [asText(row.slug), row])
);

function queryCoreTerms(row, countryTerms) {
  let query = asText(row.query)
    .replace(/\bofficial\b/gi, " ")
    .replace(/\bstandings\b/gi, " ")
    .replace(/\bleague table\b/gi, " ")
    .replace(/\btable\b/gi, " ")
    .replace(/\branking\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!query) return [];

  for (const countryTerm of countryTerms) {
    const country = asText(countryTerm).toLowerCase();
    if (!country) continue;

    if (query.toLowerCase().startsWith(country + " ")) {
      query = query.slice(country.length).trim();
    }
  }

  return uniqueTerms([
    query,
    compactLeagueTerm(query)
  ]).filter((term) => term.length >= 2);
}

function buildGenericRules(row) {
  const leagueSlug = asText(row.missingLeagueSlug || row.leagueSlug);
  const countryPrefix = asText(row.countryPrefix || leagueSlug.split(".")[0]);
  const coverage = LEAGUE_COVERAGE_BY_SLUG.get(leagueSlug) || {};

  const countryTerms = uniqueTerms([
    countryPrefix,
    COUNTRY_PREFIX_TERMS[countryPrefix] || [],
    termsFromCoverageCountry(coverage.country),
    termsFromCoverageCountry(row.country),
    termsFromCoverageCountry(row.countryName),
    termsFromCoverageCountry(row.countryLabel)
  ]);

  const leagueTerms = uniqueTerms([
    queryCoreTerms(row, countryTerms),
    asText(row.missingTierLabel),
    asText(row.leagueName),
    asText(row.competitionName)
  ]).filter((term) => term && term !== leagueSlug && term !== countryPrefix);

  return {
    countryTerms,
    leagueTerms,
    officialHosts: [],
    rejectTerms: []
  };
}

const LEAGUE_RULES = {
  "aut.2": {
    countryTerms: ["austria", "austrian"],
    leagueTerms: ["2. liga", "2-liga", "second league", "erste liga"],
    officialHosts: ["2liga.at"],
    rejectTerms: ["spain", "spanish", "laliga", "la liga", "bundesliga", "germany", "german", "segunda"]
  },
  "bel.2": {
    countryTerms: ["belgium", "belgian"],
    leagueTerms: ["challenger pro league"],
    officialHosts: ["proleague.be"],
    rejectTerms: ["netherlands", "dutch", "france", "french", "germany", "german"]
  },
  "chi.2": {
    countryTerms: ["chile", "chilean"],
    leagueTerms: ["primera b", "liga de ascenso"],
    officialHosts: ["anfp.cl"],
    rejectTerms: ["spain", "argentina", "colombia", "peru", "mexico"]
  }
};

const GENERIC_REJECT_TERMS = [
  "casino",
  "betting tips",
  "predictions only",
  "odds only",
  "wallpaper",
  "video game"
];

const TRUSTED_REVIEW_HOSTS = [
  "flashscore.com",
  "sofascore.com",
  "soccerway.com",
  "worldfootball.net",
  "livescore.com",
  "footystats.org",
  "soccerstats.com",
  "transfermarkt.com",
  "365scores.com"
];

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function pickSearchResultRows(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.searchResultRows)) return input.searchResultRows;
  if (Array.isArray(input?.rows)) return input.rows;
  return [];
}

function includesAny(text, terms) {
  const haystack = asText(text).toLowerCase();
  return terms.some((term) => haystack.includes(asText(term).toLowerCase()));
}

function hostMatches(hostname, hosts) {
  const host = asText(hostname).toLowerCase();
  return hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function combinedText(row) {
  return [
    row.title,
    row.snippet,
    row.url,
    row.hostname
  ].map(asText).join(" ").toLowerCase();
}

function classifyRow(row) {
  const leagueSlug = asText(row.missingLeagueSlug || row.leagueSlug);
  const genericRules = buildGenericRules(row);
  const explicitRules = LEAGUE_RULES[leagueSlug] || {};
  const rules = {
    countryTerms: uniqueTerms([genericRules.countryTerms, explicitRules.countryTerms || []]),
    leagueTerms: uniqueTerms([genericRules.leagueTerms, explicitRules.leagueTerms || []]),
    officialHosts: uniqueTerms([genericRules.officialHosts, explicitRules.officialHosts || []]),
    rejectTerms: uniqueTerms([genericRules.rejectTerms, explicitRules.rejectTerms || []])
  };

  const text = combinedText(row);
  const hostname = asText(row.hostname).toLowerCase();

  const rejectReasons = [];
  const positiveReasons = [];

  if (includesAny(text, GENERIC_REJECT_TERMS)) {
    rejectReasons.push("generic_non_standings_or_betting_noise");
  }

  if (includesAny(text, rules.rejectTerms)) {
    rejectReasons.push("wrong_country_or_wrong_competition_signal");
  }

  const hasCountrySignal = includesAny(text, rules.countryTerms);
  const hasLeagueSignal = includesAny(text, rules.leagueTerms);
  const hasStandingsSignal = includesAny(text, ["standings", "table", "tabelle", "ranking", "league table"]);
  const isOfficialHost = hostMatches(hostname, rules.officialHosts);
  const isTrustedReviewHost = hostMatches(hostname, TRUSTED_REVIEW_HOSTS);

  if (hasCountrySignal) positiveReasons.push("country_signal");
  if (hasLeagueSignal) positiveReasons.push("league_signal");
  if (hasStandingsSignal) positiveReasons.push("standings_signal");
  if (isOfficialHost) positiveReasons.push("official_host");
  if (isTrustedReviewHost) positiveReasons.push("trusted_review_host");

  let decision = "rejected";
  let nextRequiredAction = "do_not_fetch";

  if (rejectReasons.length > 0) {
    decision = "rejected";
  } else if (isOfficialHost && hasStandingsSignal && (hasLeagueSignal || hasCountrySignal)) {
    decision = "accepted";
    nextRequiredAction = "eligible_for_controlled_standings_source_snapshot_fetch";
  } else if (isTrustedReviewHost && hasStandingsSignal && hasCountrySignal && hasLeagueSignal) {
    decision = "accepted";
    positiveReasons.push("trusted_high_confidence_country_league_standings_match");
    nextRequiredAction = "eligible_for_controlled_standings_source_snapshot_fetch";
  } else if (hasStandingsSignal && hasCountrySignal && (hasLeagueSignal || isTrustedReviewHost)) {
    decision = "review";
    nextRequiredAction = "review_or_rank_before_fetch";
  } else {
    rejectReasons.push("insufficient_country_league_standings_evidence");
  }

  const score =
    (isOfficialHost ? 80 : 0) +
    (hasCountrySignal ? 20 : 0) +
    (hasLeagueSignal ? 20 : 0) +
    (hasStandingsSignal ? 15 : 0) +
    (isTrustedReviewHost ? 8 : 0) +
    (isTrustedReviewHost && hasCountrySignal && hasLeagueSignal && hasStandingsSignal ? 25 : 0) -
    (rejectReasons.length * 60) -
    Math.max(0, asNumber(row.rank, 0) - 1);

  return {
    ...row,
    candidateDecision: decision,
    candidateScore: score,
    positiveReasons,
    rejectionReasons: rejectReasons,
    nextRequiredAction,
    fetchState: "not_fetched",
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    standingsWriteAllowedNow: false,
    fullFixtureSearchAllowedNow: false
  };
}

function buildReport(input) {
  const resultRows = pickSearchResultRows(input);
  const rankedRows = resultRows
    .map(classifyRow)
    .sort((a, b) => b.candidateScore - a.candidateScore || asNumber(a.rank, 999) - asNumber(b.rank, 999));

  const acceptedCandidateRows = rankedRows.filter((row) => row.candidateDecision === "accepted");
  const reviewCandidateRows = rankedRows.filter((row) => row.candidateDecision === "review");
  const rejectedCandidateRows = rankedRows.filter((row) => row.candidateDecision === "rejected");

  const byDecision = {};
  const byLeagueSlug = {};

  for (const row of rankedRows) {
    byDecision[row.candidateDecision] = (byDecision[row.candidateDecision] || 0) + 1;
    const slug = asText(row.missingLeagueSlug || row.leagueSlug);
    if (!byLeagueSlug[slug]) {
      byLeagueSlug[slug] = { accepted: 0, review: 0, rejected: 0 };
    }
    byLeagueSlug[slug][row.candidateDecision] += 1;
  }

  return {
    ok: rankedRows.length > 0,
    job: "rank-same-prefix-missing-standings-search-results-file",
    mode: "read_only_same_prefix_standings_search_result_ranker",
    generatedAt: new Date().toISOString(),
    summary: {
      inputSearchResultRowCount: resultRows.length,
      rankedCandidateRowCount: rankedRows.length,
      acceptedCandidateCount: acceptedCandidateRows.length,
      reviewCandidateCount: reviewCandidateRows.length,
      rejectedCandidateCount: rejectedCandidateRows.length,
      byDecision,
      byLeagueSlug,
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      standingsWriteAllowedNowCount: rankedRows.filter((row) => row.standingsWriteAllowedNow === true).length,
      fullFixtureSearchAllowedNowCount: rankedRows.filter((row) => row.fullFixtureSearchAllowedNow === true).length
    },
    acceptedCandidateRows,
    reviewCandidateRows,
    rejectedCandidateRows,
    rankedRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      standingsWriteAllowedNow: false,
      fullFixtureSearchAllowedNow: false
    }
  };
}

function runSelfTest() {
  const input = {
    searchResultRows: [
      {
        missingLeagueSlug: "aut.2",
        countryPrefix: "aut",
        rank: 1,
        title: "Tabelle - 2. Liga",
        snippet: "Austria 2. Liga standings",
        hostname: "2liga.at",
        url: "https://www.2liga.at/de/tabelle"
      },
      {
        missingLeagueSlug: "aut.2",
        countryPrefix: "aut",
        rank: 2,
        title: "LaLiga 2 standings",
        snippet: "Spain Segunda Division table",
        hostname: "example.com",
        url: "https://example.com/spain/laliga2"
      },
      {
        missingLeagueSlug: "chi.2",
        countryPrefix: "chi",
        rank: 3,
        title: "Chile Primera B Standings",
        snippet: "League table for Chile Primera B",
        hostname: "livescore.com",
        url: "https://www.livescore.com/en/football/chile/primera-b/"
      }
    ]
  };

  const report = buildReport(input);

  if (report.summary.acceptedCandidateCount !== 2) throw new Error("expected official and trusted high-confidence accepted rows");
  if (report.summary.reviewCandidateCount !== 0) throw new Error("expected no review rows in self-test");
  if (report.summary.rejectedCandidateCount !== 1) throw new Error("expected one rejected row");
  if (report.summary.sourceFetch !== false || report.summary.noFetch !== true) throw new Error("fetch guarantees changed");
  if (report.summary.canonicalWrites !== 0 || report.summary.productionWrite !== false) throw new Error("write guarantees changed");

  return {
    ok: true,
    selfTest: "rank-same-prefix-missing-standings-search-results",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");

  const inputPath = path.resolve(args.input);
  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(path.dirname(inputPath), "same-prefix-missing-standings-ranked-search-results.json");

  const report = buildReport(readJson(inputPath));
  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: path.relative(repoRoot, outputPath).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main();
}