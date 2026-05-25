#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv = process.argv) {
  const args = {
    matrix: "",
    review: "",
    outputDir: "",
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

    if (arg === "--matrix" && argv[i + 1]) {
      args.matrix = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--matrix=")) {
      args.matrix = arg.slice("--matrix=".length).trim();
      continue;
    }

    if (arg === "--review" && argv[i + 1]) {
      args.review = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--review=")) {
      args.review = arg.slice("--review=".length).trim();
      continue;
    }

    if (arg === "--output-dir" && argv[i + 1]) {
      args.outputDir = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--output-dir=")) {
      args.outputDir = arg.slice("--output-dir=".length).trim();
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
  if (!filePath) throw new Error("missing json path");
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing output path");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runNodeJob(jobPath, args) {
  if (!fs.existsSync(jobPath)) {
    throw new Error(`missing job: ${jobPath}`);
  }

  const run = spawnSync(process.execPath, [jobPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);

  if (run.status !== 0) {
    throw new Error(`${jobPath} failed with exit code ${run.status}`);
  }
}

function ensureNoWriteGuarantees(report, label) {
  const guarantees = report?.guarantees || {};
  const violations = [];

  if (guarantees.canonicalWrites !== 0) {
    violations.push(`${label}: canonicalWrites is not 0`);
  }

  if (guarantees.productionWrite !== false) {
    violations.push(`${label}: productionWrite is not false`);
  }

  if (guarantees.noFetch !== true) {
    violations.push(`${label}: noFetch is not true`);
  }

  return violations;
}

function buildSummary({ targetDate, matrixPath, reviewPath, outputDir, worksetPath, validationPath, promotionPath }) {
  const workset = readJson(worksetPath);
  const validation = readJson(validationPath);
  const promotion = readJson(promotionPath);

  const violations = [
    ...ensureNoWriteGuarantees(workset, "workset"),
    ...ensureNoWriteGuarantees(validation, "validation"),
    ...ensureNoWriteGuarantees(promotion, "promotion")
  ];

  const promotionItems = Array.isArray(promotion.promotionItems) ? promotion.promotionItems : [];
  const blockedItems = Array.isArray(promotion.blockedItems) ? promotion.blockedItems : [];

  const summary = {
    ok: violations.length === 0,
    job: "run-fixture-league-date-acquisition-analyst-pipeline-file",
    generatedAt: new Date().toISOString(),
    mode: "dry_run_fixture_league_date_acquisition_analyst_pipeline",
    targetDate,
    sourceInputs: {
      matrix: matrixPath,
      review: reviewPath
    },
    outputs: {
      outputDir,
      workset: worksetPath,
      validation: validationPath,
      promotionPlan: promotionPath
    },
    summary: {
      worksetCaseCount: workset.summary?.selectedCaseCount ?? null,
      validationInputCaseCount: validation.summary?.inputCaseCount ?? null,
      verifiedFixtureCandidateCount: validation.summary?.verifiedFixtureCandidateCount ?? null,
      verifiedNoFixtureCandidateCount: validation.summary?.verifiedNoFixtureCandidateCount ?? null,
      validationNeedsReviewCount: validation.summary?.needsReviewCount ?? null,
      promotionItemCount: promotion.summary?.promotionItemCount ?? null,
      fixturePromotionCount: promotion.summary?.fixturePromotionCount ?? null,
      noFixturePromotionCount: promotion.summary?.noFixturePromotionCount ?? null,
      proposedFixtureRowCount: promotion.summary?.proposedFixtureRowCount ?? null,
      blockedCaseCount: promotion.summary?.blockedCaseCount ?? null,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    promotionItems: promotionItems.map((item) => ({
      promotionItemId: item.promotionItemId,
      leagueSlug: item.leagueSlug,
      name: item.name,
      promotionType: item.promotionType,
      fixtureCount: item.fixtureCount,
      proposedWriteMode: item.proposedWriteMode
    })),
    blockedItems: blockedItems.map((item) => ({
      leagueSlug: item.leagueSlug,
      name: item.name,
      currentCaseDecision: item.currentCaseDecision,
      recommendedCaseDecision: item.recommendedCaseDecision,
      blockedReason: item.blockedReason
    })),
    violations,
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
      "This wrapper orchestrates the committed analyst workset, review validator, and dry-run promotion plan jobs.",
      "It does not fetch sources, resolve URLs, write canonical data, or promote fixtures.",
      "The promotion plan remains dry-run only."
    ]
  };

  return summary;
}

function runPipeline(args) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("--date YYYY-MM-DD is required");
  }

  if (!args.matrix) throw new Error("missing --matrix");
  if (!args.review) throw new Error("missing --review");
  if (!args.outputDir) throw new Error("missing --output-dir");

  if (!fs.existsSync(args.matrix)) throw new Error(`missing matrix input: ${args.matrix}`);
  if (!fs.existsSync(args.review)) throw new Error(`missing review input: ${args.review}`);

  const outputDir = args.outputDir;
  fs.mkdirSync(outputDir, { recursive: true });

  const worksetPath = path.join(outputDir, `${args.date}.analyst-workset.all-cases.json`);
  const validationPath = path.join(outputDir, `${args.date}.analyst-review.validation.json`);
  const promotionPath = path.join(outputDir, `${args.date}.analyst-promotion-plan.dry-run.json`);
  const summaryPath = args.output || path.join(outputDir, `${args.date}.analyst-pipeline-summary.json`);

  const worksetJob = "engine-v1/jobs/build-fixture-league-date-acquisition-analyst-workset-file.js";
  const validatorJob = "engine-v1/jobs/validate-fixture-league-date-acquisition-analyst-review-file.js";
  const promotionJob = "engine-v1/jobs/build-fixture-league-date-acquisition-analyst-promotion-plan-file.js";

  runNodeJob(worksetJob, [
    "--date", args.date,
    "--input", args.matrix,
    "--output", worksetPath,
    "--all-cases"
  ]);

  runNodeJob(validatorJob, [
    "--date", args.date,
    "--input", args.review,
    "--output", validationPath
  ]);

  runNodeJob(promotionJob, [
    "--date", args.date,
    "--input", validationPath,
    "--output", promotionPath
  ]);

  const summary = buildSummary({
    targetDate: args.date,
    matrixPath: args.matrix,
    reviewPath: args.review,
    outputDir,
    worksetPath,
    validationPath,
    promotionPath
  });

  writeJson(summaryPath, summary);

  return summary;
}

function selfTest() {
  const outputDir = path.join("data", "football-truth", "_diagnostics", "fixture-acquisition-stability", "self-test-analyst-pipeline");

  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const matrixPath = path.join(outputDir, "matrix.json");
  const reviewPath = path.join(outputDir, "review.json");
  const summaryPath = path.join(outputDir, "summary.json");

  const matrix = {
    ok: true,
    targetDate: "2026-05-22",
    rows: [
      {
        leagueSlug: "srb.1",
        name: "Serbian SuperLiga",
        targetDate: "2026-05-22",
        analystStatus: "NEEDS_REPLACEMENT_URL",
        fetch: { httpStatus: 404, httpOk: false, finalUrl: "https://example.invalid/broken" },
        extraction: {}
      },
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        analystStatus: "BLOCKED_BY_EXCLUDED_HOST_ONLY",
        adapter: { blockedHosts: ["www.betexplorer.com"], reason: "only_excluded_host_candidates" }
      }
    ]
  };

  const review = {
    ok: true,
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
        caseId: "fixture_league_date_acquisition_analyst:2026-05-22:bel.1",
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        previousAnalystStatus: "BLOCKED_BY_EXCLUDED_HOST_ONLY",
        caseDecision: "needs_review",
        sourceReviews: [
          {
            sourceReviewId: "bel.1:source:1",
            sourceName: "Pro League official homepage/generic page",
            sourceDecision: "generic_landing_not_usable",
            reviewFields: {
              isOfficialOrPrimary: true,
              isIndependentSecondSource: false,
              fixturesFoundForTargetDate: []
            }
          }
        ]
      }
    ]
  };

  writeJson(matrixPath, matrix);
  writeJson(reviewPath, review);

  const summary = runPipeline({
    matrix: matrixPath,
    review: reviewPath,
    outputDir,
    output: summaryPath,
    date: "2026-05-22"
  });

  if (!summary.ok) {
    throw new Error(`self-test failed: summary not ok: ${summary.violations.join("; ")}`);
  }

  if (summary.summary.worksetCaseCount !== 2) {
    throw new Error(`self-test failed: expected 2 workset cases, got ${summary.summary.worksetCaseCount}`);
  }

  if (summary.summary.promotionItemCount !== 1) {
    throw new Error(`self-test failed: expected 1 promotion item, got ${summary.summary.promotionItemCount}`);
  }

  if (summary.summary.proposedFixtureRowCount !== 2) {
    throw new Error(`self-test failed: expected 2 proposed fixture rows, got ${summary.summary.proposedFixtureRowCount}`);
  }

  if (summary.summary.blockedCaseCount !== 1) {
    throw new Error(`self-test failed: expected 1 blocked case, got ${summary.summary.blockedCaseCount}`);
  }

  if (summary.guarantees.canonicalWrites !== 0 || summary.guarantees.productionWrite !== false || summary.guarantees.noFetch !== true) {
    throw new Error("self-test failed: safety guarantees missing");
  }

  fs.rmSync(outputDir, { recursive: true, force: true });

  return summary;
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const summary = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "run-fixture-league-date-acquisition-analyst-pipeline-file",
      summary: summary.summary,
      guarantees: summary.guarantees
    }, null, 2));
    return;
  }

  const summary = runPipeline(args);

  console.log(JSON.stringify({
    ok: summary.ok,
    output: args.output || path.join(args.outputDir, `${args.date}.analyst-pipeline-summary.json`),
    summary: summary.summary,
    promotionItems: summary.promotionItems,
    blockedItems: summary.blockedItems,
    violations: summary.violations,
    guarantees: summary.guarantees
  }, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "run-fixture-league-date-acquisition-analyst-pipeline-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
