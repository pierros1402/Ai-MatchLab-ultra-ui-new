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

function stableFixtureId(row) {
  return [
    row.localDate || "",
    String(row.officialHomeTeam || row.homeTeam || "").toLowerCase().replace(/\s+/g, "-"),
    String(row.officialAwayTeam || row.awayTeam || "").toLowerCase().replace(/\s+/g, "-")
  ].join(":");
}

function toPromotionFixtures(caseResult) {
  const matchedFixtures = caseResult?.fixtureAgreement?.matchedFixtures;
  if (!Array.isArray(matchedFixtures)) return [];

  return matchedFixtures.map((fixture) => ({
    fixtureIdentityKey: stableFixtureId(fixture),
    localDate: fixture.localDate || caseResult.targetDate || "",
    homeTeam: fixture.officialHomeTeam || "",
    awayTeam: fixture.officialAwayTeam || "",
    matchedIndependentHomeTeam: fixture.independentHomeTeam || "",
    matchedIndependentAwayTeam: fixture.independentAwayTeam || "",
    sourceAgreement: {
      officialSource: fixture.officialSource || "",
      independentSource: fixture.independentSource || "",
      agreementKey: fixture.agreementKey || ""
    },
    proposedCanonicalAction: "upsert_verified_fixture_identity_dry_run",
    productionWrite: false,
    dryRun: true
  }));
}

function buildPromotionPlan(input, options = {}) {
  const caseResults = Array.isArray(input?.caseResults) ? input.caseResults : [];
  if (caseResults.length === 0) {
    throw new Error("input analyst validation has no caseResults[]");
  }

  const targetDate = options.date || input?.targetDate || "";
  const verifiedFixtureCandidates = caseResults.filter(
    (row) => row.recommendedCaseDecision === "verified_fixtures_dry_run_candidate"
  );

  const verifiedNoFixtureCandidates = caseResults.filter(
    (row) => row.recommendedCaseDecision === "verified_no_fixture_dry_run_candidate"
  );

  const blockedCases = caseResults.filter(
    (row) =>
      row.recommendedCaseDecision !== "verified_fixtures_dry_run_candidate" &&
      row.recommendedCaseDecision !== "verified_no_fixture_dry_run_candidate"
  );

  const promotionItems = [];

  for (const row of verifiedFixtureCandidates) {
    const fixtures = toPromotionFixtures(row);

    promotionItems.push({
      promotionItemId: `fixture_league_date_acquisition:${row.targetDate || targetDate}:${row.leagueSlug}:verified_fixtures`,
      leagueSlug: row.leagueSlug || "",
      name: row.name || "",
      targetDate: row.targetDate || targetDate,
      promotionType: "verified_fixtures",
      sourceCaseDecision: row.recommendedCaseDecision,
      fixtureCount: fixtures.length,
      fixtures,
      evidenceSummary: {
        officialSourceCount: row.fixtureAgreement?.officialSourceCount || 0,
        independentSourceCount: row.fixtureAgreement?.independentSourceCount || 0,
        matchedFixtureCount: row.fixtureAgreement?.matchedFixtureCount || 0,
        violations: row.fixtureAgreement?.violations || []
      },
      proposedWriteTarget: "canonical_fixture_acquisition_store",
      proposedWriteMode: "dry_run_only",
      blockedReason: "",
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    });
  }

  for (const row of verifiedNoFixtureCandidates) {
    promotionItems.push({
      promotionItemId: `fixture_league_date_acquisition:${row.targetDate || targetDate}:${row.leagueSlug}:verified_no_fixture`,
      leagueSlug: row.leagueSlug || "",
      name: row.name || "",
      targetDate: row.targetDate || targetDate,
      promotionType: "verified_no_fixture_on_target_date",
      sourceCaseDecision: row.recommendedCaseDecision,
      fixtureCount: 0,
      fixtures: [],
      evidenceSummary: {
        officialNoFixtureSourceCount: row.noFixtureAgreement?.officialNoFixtureSourceCount || 0,
        independentNoFixtureSourceCount: row.noFixtureAgreement?.independentNoFixtureSourceCount || 0
      },
      proposedWriteTarget: "canonical_fixture_acquisition_store",
      proposedWriteMode: "dry_run_only",
      blockedReason: "",
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    });
  }

  const blockedItems = blockedCases.map((row) => ({
    leagueSlug: row.leagueSlug || "",
    name: row.name || "",
    targetDate: row.targetDate || targetDate,
    currentCaseDecision: row.currentCaseDecision || "",
    recommendedCaseDecision: row.recommendedCaseDecision || "",
    blockedReason: "analyst_review_validation_did_not_produce_verified_dry_run_candidate",
    fixtureViolations: row.fixtureAgreement?.violations || [],
    noFixtureAgreement: row.noFixtureAgreement || {},
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  }));

  const fixturePromotionCount = promotionItems.filter((item) => item.promotionType === "verified_fixtures").length;
  const noFixturePromotionCount = promotionItems.filter((item) => item.promotionType === "verified_no_fixture_on_target_date").length;
  const proposedFixtureRowCount = promotionItems.reduce((sum, item) => sum + (Array.isArray(item.fixtures) ? item.fixtures.length : 0), 0);

  return {
    ok: true,
    job: "build-fixture-league-date-acquisition-analyst-promotion-plan-file",
    generatedAt: new Date().toISOString(),
    mode: "dry_run_fixture_league_date_acquisition_analyst_promotion_plan",
    targetDate,
    sourceInput: options.input || "",
    summary: {
      inputCaseCount: caseResults.length,
      promotionItemCount: promotionItems.length,
      fixturePromotionCount,
      noFixturePromotionCount,
      proposedFixtureRowCount,
      blockedCaseCount: blockedItems.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    promotionItems,
    blockedItems,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noSearchSideEffects: true,
      noCanonicalPromotion: true,
      noCanonicalWrite: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    notes: [
      "This is a dry-run promotion plan only.",
      "It consumes analyst review validation output and only plans candidates already classified as verified_*_dry_run_candidate.",
      "It does not write canonical fixture acquisition data.",
      "A separate guarded writer with explicit --apply and --allow-production-writes would be required for any future production write."
    ]
  };
}

function selfTest() {
  const input = {
    targetDate: "2026-05-22",
    caseResults: [
      {
        caseId: "fixture_league_date_acquisition_analyst:2026-05-22:srb.1",
        leagueSlug: "srb.1",
        name: "Serbian SuperLiga",
        targetDate: "2026-05-22",
        currentCaseDecision: "needs_review",
        recommendedCaseDecision: "verified_fixtures_dry_run_candidate",
        fixtureAgreement: {
          officialSourceCount: 1,
          independentSourceCount: 1,
          officialFixtureCount: 2,
          independentFixtureCount: 2,
          matchedFixtureCount: 2,
          matchedFixtures: [
            {
              localDate: "2026-05-22",
              officialHomeTeam: "Železničar",
              officialAwayTeam: "Čukarički",
              independentHomeTeam: "Zeleznicar Pancevo",
              independentAwayTeam: "Cukaricki",
              officialSource: "Super liga Srbije official Najava kola / Raspored",
              independentSource: "SportsGambler Serbian SuperLiga fixtures/results",
              agreementKey: "2026-05-22|zeleznicar pancevo|cukaricki"
            },
            {
              localDate: "2026-05-22",
              officialHomeTeam: "Crvena zvezda",
              officialAwayTeam: "OFK Beograd",
              independentHomeTeam: "Crvena Zvezda",
              independentAwayTeam: "OFK Beograd",
              officialSource: "Super liga Srbije official Najava kola / Raspored",
              independentSource: "SportsGambler Serbian SuperLiga fixtures/results",
              agreementKey: "2026-05-22|crvena zvezda|ofk beograd"
            }
          ],
          violations: []
        }
      },
      {
        caseId: "fixture_league_date_acquisition_analyst:2026-05-22:bel.1",
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        currentCaseDecision: "needs_review",
        recommendedCaseDecision: "needs_review",
        fixtureAgreement: {
          officialSourceCount: 0,
          independentSourceCount: 0,
          matchedFixtureCount: 0,
          violations: ["missing official usable fixture evidence source"]
        }
      }
    ]
  };

  const report = buildPromotionPlan(input, { date: "2026-05-22", input: "self-test" });

  if (report.summary.inputCaseCount !== 2) {
    throw new Error(`self-test failed: expected 2 input cases, got ${report.summary.inputCaseCount}`);
  }

  if (report.summary.promotionItemCount !== 1) {
    throw new Error(`self-test failed: expected 1 promotion item, got ${report.summary.promotionItemCount}`);
  }

  if (report.summary.proposedFixtureRowCount !== 2) {
    throw new Error(`self-test failed: expected 2 proposed fixture rows, got ${report.summary.proposedFixtureRowCount}`);
  }

  if (report.summary.blockedCaseCount !== 1) {
    throw new Error(`self-test failed: expected 1 blocked case, got ${report.summary.blockedCaseCount}`);
  }

  const item = report.promotionItems[0];
  if (item.leagueSlug !== "srb.1" || item.promotionType !== "verified_fixtures") {
    throw new Error("self-test failed: unexpected promotion item");
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
      selfTest: "build-fixture-league-date-acquisition-analyst-promotion-plan-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("--date YYYY-MM-DD is required");
  }

  const input = readJson(args.input);
  const report = buildPromotionPlan(input, {
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
    job: "build-fixture-league-date-acquisition-analyst-promotion-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
