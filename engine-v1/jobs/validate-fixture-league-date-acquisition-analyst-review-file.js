#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length).trim();
      continue;
    }

    if ((arg === "--date" || arg === "--day") && argv[i + 1]) {
      args.date = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--date=")) {
      args.date = arg.slice("--date=".length).trim();
      continue;
    }
  }

  return args;
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing --input");
  if (!fs.existsSync(filePath)) throw new Error(`missing input file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeTeamName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/\bfc\b/g, "")
    .replace(/\bfk\b/g, "")
    .replace(/\bsc\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function teamAliasKey(value) {
  const normalized = normalizeTeamName(value)
    .replace(/\bcrvena zvezda beograd\b/g, "crvena zvezda")
    .replace(/\bzeleznicar\b/g, "zeleznicar pancevo")
    .replace(/\bzeleznicar pancevo pancevo\b/g, "zeleznicar pancevo")
    .trim();

  const aliases = new Map([
    ["zeleznicar", "zeleznicar pancevo"],
    ["zeleznicar pancevo", "zeleznicar pancevo"],
    ["cukaricki", "cukaricki"],
    ["crvena zvezda", "crvena zvezda"],
    ["crvena zvezda beograd", "crvena zvezda"],
    ["ofk beograd", "ofk beograd"]
  ]);

  return aliases.get(normalized) || normalized;
}

function fixtureKey(row) {
  return [
    String(row?.localDate || "").trim(),
    teamAliasKey(row?.homeTeam),
    teamAliasKey(row?.awayTeam)
  ].join("|");
}

function toFixtureRows(source) {
  const fixtures = source?.reviewFields?.fixturesFoundForTargetDate;
  if (!Array.isArray(fixtures)) return [];

  return fixtures.map((fixture) => ({
    ...fixture,
    sourceReviewId: source.sourceReviewId || "",
    sourceName: source.sourceName || "",
    sourceKind: source.sourceKind || "",
    key: fixtureKey(fixture)
  }));
}

function validateFixtureAgreementCase(reviewCase) {
  const sourceReviews = Array.isArray(reviewCase?.sourceReviews) ? reviewCase.sourceReviews : [];
  const usableFixtureSources = sourceReviews.filter((source) => source.sourceDecision === "usable_fixture_evidence");

  const officialSources = usableFixtureSources.filter((source) => source?.reviewFields?.isOfficialOrPrimary === true);
  const independentSources = usableFixtureSources.filter((source) => source?.reviewFields?.isIndependentSecondSource === true);

  const officialFixtures = officialSources.flatMap(toFixtureRows);
  const independentFixtures = independentSources.flatMap(toFixtureRows);

  const officialKeys = new Set(officialFixtures.map((fixture) => fixture.key));
  const independentKeys = new Set(independentFixtures.map((fixture) => fixture.key));

  const matchedFixtures = officialFixtures
    .filter((fixture) => independentKeys.has(fixture.key))
    .map((fixture) => {
      const match = independentFixtures.find((candidate) => candidate.key === fixture.key);
      return {
        localDate: fixture.localDate,
        officialHomeTeam: fixture.homeTeam,
        officialAwayTeam: fixture.awayTeam,
        independentHomeTeam: match?.homeTeam || "",
        independentAwayTeam: match?.awayTeam || "",
        officialSource: fixture.sourceName,
        independentSource: match?.sourceName || "",
        agreementKey: fixture.key
      };
    });

  const officialOnly = officialFixtures.filter((fixture) => !independentKeys.has(fixture.key));
  const independentOnly = independentFixtures.filter((fixture) => !officialKeys.has(fixture.key));

  const violations = [];

  if (officialSources.length < 1) {
    violations.push("missing official usable fixture evidence source");
  }

  if (independentSources.length < 1) {
    violations.push("missing independent usable fixture evidence source");
  }

  if (officialFixtures.length === 0) {
    violations.push("missing official fixture rows");
  }

  if (independentFixtures.length === 0) {
    violations.push("missing independent fixture rows");
  }

  if (officialOnly.length > 0 || independentOnly.length > 0) {
    violations.push("official and independent fixture rows do not fully agree");
  }

  const canPromoteToVerifiedFixtures = violations.length === 0 && matchedFixtures.length > 0;

  return {
    leagueSlug: reviewCase.leagueSlug || "",
    name: reviewCase.name || "",
    targetDate: reviewCase.targetDate || "",
    currentCaseDecision: reviewCase.caseDecision || "",
    recommendedCaseDecision: canPromoteToVerifiedFixtures ? "verified_fixtures_dry_run_candidate" : "needs_review",
    canPromoteToVerifiedFixtures,
    officialSourceCount: officialSources.length,
    independentSourceCount: independentSources.length,
    officialFixtureCount: officialFixtures.length,
    independentFixtureCount: independentFixtures.length,
    matchedFixtureCount: matchedFixtures.length,
    matchedFixtures,
    officialOnly,
    independentOnly,
    violations
  };
}

function validateNoFixtureCase(reviewCase) {
  const sourceReviews = Array.isArray(reviewCase?.sourceReviews) ? reviewCase.sourceReviews : [];
  const usableNoFixtureSources = sourceReviews.filter((source) => source.sourceDecision === "usable_no_fixture_evidence");

  const officialNoFixtureSources = usableNoFixtureSources.filter((source) => source?.reviewFields?.isOfficialOrPrimary === true);
  const independentNoFixtureSources = usableNoFixtureSources.filter((source) => source?.reviewFields?.isIndependentSecondSource === true);

  const canPromoteToVerifiedNoFixture =
    officialNoFixtureSources.length >= 1 &&
    independentNoFixtureSources.length >= 1;

  return {
    leagueSlug: reviewCase.leagueSlug || "",
    name: reviewCase.name || "",
    targetDate: reviewCase.targetDate || "",
    recommendedCaseDecision: canPromoteToVerifiedNoFixture ? "verified_no_fixture_dry_run_candidate" : "needs_review",
    canPromoteToVerifiedNoFixture,
    officialNoFixtureSourceCount: officialNoFixtureSources.length,
    independentNoFixtureSourceCount: independentNoFixtureSources.length
  };
}

function validateAnalystReview(input, options = {}) {
  const cases = Array.isArray(input?.cases) ? input.cases : [];
  if (cases.length === 0) {
    throw new Error("input analyst review has no cases[]");
  }

  const targetDate = options.date || input?.targetDate || "";
  const caseResults = cases.map((reviewCase) => {
    const fixtureAgreement = validateFixtureAgreementCase(reviewCase);
    const noFixtureAgreement = validateNoFixtureCase(reviewCase);

    let recommendedCaseDecision = "needs_review";
    if (fixtureAgreement.canPromoteToVerifiedFixtures) {
      recommendedCaseDecision = "verified_fixtures_dry_run_candidate";
    } else if (noFixtureAgreement.canPromoteToVerifiedNoFixture) {
      recommendedCaseDecision = "verified_no_fixture_dry_run_candidate";
    }

    return {
      caseId: reviewCase.caseId || "",
      leagueSlug: reviewCase.leagueSlug || "",
      name: reviewCase.name || "",
      targetDate: reviewCase.targetDate || targetDate,
      previousAnalystStatus: reviewCase.previousAnalystStatus || "",
      currentCaseDecision: reviewCase.caseDecision || "",
      recommendedCaseDecision,
      fixtureAgreement,
      noFixtureAgreement,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  });

  const verifiedFixtureCandidateCount = caseResults.filter((row) => row.recommendedCaseDecision === "verified_fixtures_dry_run_candidate").length;
  const verifiedNoFixtureCandidateCount = caseResults.filter((row) => row.recommendedCaseDecision === "verified_no_fixture_dry_run_candidate").length;
  const needsReviewCount = caseResults.filter((row) => row.recommendedCaseDecision === "needs_review").length;

  return {
    ok: true,
    job: "validate-fixture-league-date-acquisition-analyst-review-file",
    generatedAt: new Date().toISOString(),
    mode: "dry_run_fixture_league_date_analyst_review_validation",
    targetDate,
    sourceInput: options.input || "",
    summary: {
      inputCaseCount: cases.length,
      verifiedFixtureCandidateCount,
      verifiedNoFixtureCandidateCount,
      needsReviewCount,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    caseResults,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noSearchSideEffects: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    notes: [
      "This validator only evaluates analyst-reviewed evidence.",
      "It does not fetch sources, resolve URLs, promote fixtures, or write canonical acquisition data.",
      "A verified_* dry-run candidate still needs a separate promotion plan before any production write."
    ]
  };
}

function selfTest() {
  const input = {
    targetDate: "2026-05-22",
    cases: [
      {
        caseId: "fixture_league_date_acquisition_analyst:2026-05-22:srb.1",
        leagueSlug: "srb.1",
        name: "Serbian SuperLiga",
        targetDate: "2026-05-22",
        previousAnalystStatus: "NEEDS_REPLACEMENT_URL",
        caseDecision: "needs_review",
        sourceReviews: [
          {
            sourceReviewId: "srb.1:source:1",
            sourceName: "Super liga Srbije official Najava kola / Raspored",
            sourceDecision: "usable_fixture_evidence",
            reviewFields: {
              isOfficialOrPrimary: true,
              isIndependentSecondSource: false,
              fixturesFoundForTargetDate: [
                { localDate: "2026-05-22", homeTeam: "Železničar", awayTeam: "Čukarički" },
                { localDate: "2026-05-22", homeTeam: "Crvena zvezda", awayTeam: "OFK Beograd" }
              ]
            }
          },
          {
            sourceReviewId: "srb.1:source:2",
            sourceName: "SportsGambler Serbian SuperLiga fixtures/results",
            sourceDecision: "usable_fixture_evidence",
            reviewFields: {
              isOfficialOrPrimary: false,
              isIndependentSecondSource: true,
              fixturesFoundForTargetDate: [
                { localDate: "2026-05-22", homeTeam: "Zeleznicar Pancevo", awayTeam: "Cukaricki" },
                { localDate: "2026-05-22", homeTeam: "Crvena Zvezda", awayTeam: "OFK Beograd" }
              ]
            }
          }
        ]
      },
      {
        caseId: "fixture_league_date_acquisition_analyst:2026-05-22:srb.1:official-only",
        leagueSlug: "srb.1",
        name: "Serbian SuperLiga official-only negative case",
        targetDate: "2026-05-22",
        previousAnalystStatus: "NEEDS_REPLACEMENT_URL",
        caseDecision: "needs_review",
        sourceReviews: [
          {
            sourceReviewId: "srb.1:source:official-only",
            sourceName: "Super liga Srbije official Najava kola / Raspored",
            sourceDecision: "usable_fixture_evidence",
            reviewFields: {
              isOfficialOrPrimary: true,
              isIndependentSecondSource: false,
              fixturesFoundForTargetDate: [
                { localDate: "2026-05-22", homeTeam: "Železničar", awayTeam: "Čukarički" },
                { localDate: "2026-05-22", homeTeam: "Crvena zvezda", awayTeam: "OFK Beograd" }
              ]
            }
          }
        ]
      }
    ]
  };

  const report = validateAnalystReview(input, { date: "2026-05-22", input: "self-test" });

  if (report.summary.inputCaseCount !== 2) {
    throw new Error(`self-test failed: expected 2 input cases, got ${report.summary.inputCaseCount}`);
  }

  if (report.summary.verifiedFixtureCandidateCount !== 1) {
    throw new Error(`self-test failed: expected 1 verified fixture candidate, got ${report.summary.verifiedFixtureCandidateCount}`);
  }

  if (report.summary.needsReviewCount !== 1) {
    throw new Error(`self-test failed: expected 1 needs_review case, got ${report.summary.needsReviewCount}`);
  }

  const positiveResult = report.caseResults.find((row) => row.caseId === "fixture_league_date_acquisition_analyst:2026-05-22:srb.1");
  if (!positiveResult) {
    throw new Error("self-test failed: missing positive agreement case result");
  }

  if (positiveResult.fixtureAgreement.matchedFixtureCount !== 2) {
    throw new Error(`self-test failed: expected 2 matched fixtures, got ${positiveResult.fixtureAgreement.matchedFixtureCount}`);
  }

  if (positiveResult.recommendedCaseDecision !== "verified_fixtures_dry_run_candidate") {
    throw new Error(`self-test failed: unexpected positive recommendation ${positiveResult.recommendedCaseDecision}`);
  }

  const officialOnlyResult = report.caseResults.find((row) => row.caseId === "fixture_league_date_acquisition_analyst:2026-05-22:srb.1:official-only");
  if (!officialOnlyResult) {
    throw new Error("self-test failed: missing official-only negative case result");
  }

  if (officialOnlyResult.recommendedCaseDecision !== "needs_review") {
    throw new Error(`self-test failed: official-only case must stay needs_review, got ${officialOnlyResult.recommendedCaseDecision}`);
  }

  if (!officialOnlyResult.fixtureAgreement.violations.includes("missing independent usable fixture evidence source")) {
    throw new Error("self-test failed: official-only case did not report missing independent source");
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false || report.guarantees.noFetch !== true) {
    throw new Error("self-test failed: safety guarantees missing");
  }

  return report;
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "validate-fixture-league-date-acquisition-analyst-review-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("--date YYYY-MM-DD is required");
  }

  const input = readJson(args.input);
  const report = validateAnalystReview(input, {
    input: args.input,
    date: args.date
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "validate-fixture-league-date-acquisition-analyst-review-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
