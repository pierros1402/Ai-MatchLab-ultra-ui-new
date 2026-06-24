import fs from "node:fs";
import path from "node:path";

const ALLOWED_DECISIONS = new Set([
  "confirmed_no_fixture_on_target_date",
  "found_target_date_fixture",
  "insufficient_evidence"
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: null,
    output: null,
    date: null,
    requireComplete: false,
    selfTest: false,
    pretty: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input" && argv[i + 1]) {
      args.input = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--input=")) {
      args.input = cleanString(arg.slice("--input=".length));
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--output=")) {
      args.output = cleanString(arg.slice("--output=".length));
      continue;
    }

    if (arg === "--date" && argv[i + 1]) {
      args.date = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--date=")) {
      args.date = cleanString(arg.slice("--date=".length));
      continue;
    }

    if (arg === "--require-complete") {
      args.requireComplete = true;
      continue;
    }

    if (arg === "--compact") {
      args.pretty = false;
      continue;
    }

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) {
    throw new Error("missing required --input");
  }

  if (!args.output) {
    args.output = args.input
      ? defaultOutputPath(args.input)
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.second-source-confirmation-review.validation.json";
  }

  return args;
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/validate-fixture-identity-second-source-confirmation-review-file.js --date YYYY-MM-DD --input <manual-review-draft.json> --output <validation.json>",
    "",
    "Options:",
    "  --require-complete  Treat empty/null decisions as errors instead of pending warnings.",
    "",
    "Guarantees:",
    "  - read-only validation",
    "  - no fetch",
    "  - no canonical promotion",
    "  - canonicalWrites: 0",
    "  - productionWrite: false",
    "  - dryRun: true"
  ].join("\n"));
}

function defaultOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.validation.json`);
}

function resolvePath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolvePath(filePath), "utf8"));
}

function writeJson(filePath, value, pretty = true) {
  const abs = resolvePath(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(cleanString(value));
}

function pushIssue(list, row, code, message, extra = {}) {
  list.push({
    code,
    message,
    taskId: cleanString(row?.taskId),
    leagueSlug: cleanString(row?.leagueSlug),
    name: cleanString(row?.name),
    targetDate: cleanString(row?.targetDate),
    ...extra
  });
}

function validateFixtureRows(row, errors, targetDate) {
  const fixtureRows = asArray(row.targetDateFixtureRows);
  const count = Number(row.targetDateFixtureCount);

  if (!Number.isInteger(count) || count < 1) {
    pushIssue(errors, row, "found_fixture_requires_positive_count", "found_target_date_fixture requires targetDateFixtureCount > 0.");
  }

  if (fixtureRows.length < 1) {
    pushIssue(errors, row, "found_fixture_requires_rows", "found_target_date_fixture requires targetDateFixtureRows.");
    return;
  }

  if (Number.isInteger(count) && count !== fixtureRows.length) {
    pushIssue(errors, row, "fixture_count_mismatch", "targetDateFixtureCount must equal targetDateFixtureRows length.", {
      targetDateFixtureCount: count,
      rowCount: fixtureRows.length
    });
  }

  fixtureRows.forEach((fixture, index) => {
    const date = cleanString(fixture?.date || fixture?.dayKey || fixture?.targetDate);
    const homeTeam = cleanString(fixture?.homeTeam);
    const awayTeam = cleanString(fixture?.awayTeam);
    const sourceUrl = cleanString(fixture?.sourceUrl || fixture?.confirmationSourceUrl);

    if (date !== targetDate) {
      pushIssue(errors, row, "fixture_row_wrong_date", "Fixture row date/dayKey must equal targetDate.", {
        fixtureIndex: index,
        actualDate: date,
        expectedDate: targetDate
      });
    }

    if (!homeTeam || !awayTeam) {
      pushIssue(errors, row, "fixture_row_missing_teams", "Fixture row must include homeTeam and awayTeam.", {
        fixtureIndex: index
      });
    }

    if (homeTeam && awayTeam && homeTeam === awayTeam) {
      pushIssue(errors, row, "fixture_row_same_team", "Fixture row homeTeam and awayTeam must differ.", {
        fixtureIndex: index,
        team: homeTeam
      });
    }

    if (!sourceUrl) {
      pushIssue(errors, row, "fixture_row_missing_source_url", "Fixture row must include sourceUrl.", {
        fixtureIndex: index
      });
    }
  });
}

function validateRow(row, index, options, errors, warnings, stats) {
  const targetDate = cleanString(row?.targetDate);
  const decision = cleanString(row?.decision);
  const reviewerNotes = cleanString(row?.reviewerNotes);
  const sourceUrls = asArray(row?.confirmationSourceUrls).map(cleanString).filter(Boolean);
  const sourceTypes = asArray(row?.confirmationSourceTypes).map(cleanString).filter(Boolean);
  const sourceTitles = asArray(row?.confirmationSourceTitles).map(cleanString).filter(Boolean);

  stats.rowCount += 1;

  if (!cleanString(row?.taskId)) {
    pushIssue(errors, row, "missing_task_id", "Row is missing taskId.", { rowIndex: index });
  }

  if (!cleanString(row?.leagueSlug)) {
    pushIssue(errors, row, "missing_league_slug", "Row is missing leagueSlug.", { rowIndex: index });
  }

  if (!isDate(targetDate)) {
    pushIssue(errors, row, "invalid_target_date", "Row targetDate must be YYYY-MM-DD.", { rowIndex: index });
  }

  if (options.date && targetDate !== options.date) {
    pushIssue(errors, row, "target_date_mismatch", "Row targetDate does not match expected --date.", {
      rowIndex: index,
      expectedDate: options.date,
      actualDate: targetDate
    });
  }

  if (!decision) {
    stats.pendingDecisionCount += 1;
    const code = "pending_decision";
    const message = "Decision is empty/null and remains pending.";

    if (options.requireComplete) {
      pushIssue(errors, row, code, message, { rowIndex: index });
    } else {
      pushIssue(warnings, row, code, message, { rowIndex: index });
    }
    return;
  }

  if (!ALLOWED_DECISIONS.has(decision)) {
    pushIssue(errors, row, "invalid_decision", "Decision is not one of the allowed values.", {
      rowIndex: index,
      decision,
      allowedDecisions: [...ALLOWED_DECISIONS]
    });
    return;
  }

  stats.decidedCount += 1;
  stats.byDecision[decision] = (stats.byDecision[decision] || 0) + 1;

  if (decision === "confirmed_no_fixture_on_target_date") {
    if (sourceUrls.length < 1) {
      pushIssue(errors, row, "confirmed_no_fixture_requires_source", "confirmed_no_fixture_on_target_date requires at least one confirmationSourceUrl.");
    }

    if (!reviewerNotes) {
      pushIssue(errors, row, "confirmed_no_fixture_requires_notes", "confirmed_no_fixture_on_target_date requires reviewerNotes.");
    }

    const count = row?.targetDateFixtureCount;
    if (count !== 0) {
      pushIssue(errors, row, "confirmed_no_fixture_requires_zero_count", "confirmed_no_fixture_on_target_date requires targetDateFixtureCount = 0.", {
        targetDateFixtureCount: count
      });
    }

    if (asArray(row?.targetDateFixtureRows).length !== 0) {
      pushIssue(errors, row, "confirmed_no_fixture_forbids_fixture_rows", "confirmed_no_fixture_on_target_date must not include targetDateFixtureRows.");
    }
  }

  if (decision === "found_target_date_fixture") {
    if (sourceUrls.length < 1) {
      pushIssue(errors, row, "found_fixture_requires_source", "found_target_date_fixture requires at least one confirmationSourceUrl.");
    }

    validateFixtureRows(row, errors, targetDate);
  }

  if (decision === "insufficient_evidence") {
    if (!reviewerNotes) {
      pushIssue(errors, row, "insufficient_evidence_requires_notes", "insufficient_evidence requires reviewerNotes.");
    }

    if (Number(row?.targetDateFixtureCount ?? 0) > 0 || asArray(row?.targetDateFixtureRows).length > 0) {
      pushIssue(errors, row, "insufficient_evidence_forbids_fixture_rows", "insufficient_evidence must not include targetDate fixture rows.");
    }
  }

  if (sourceUrls.length > 0 && sourceTypes.length > 0 && sourceTypes.length !== sourceUrls.length) {
    pushIssue(warnings, row, "source_type_count_mismatch", "confirmationSourceTypes length differs from confirmationSourceUrls length.", {
      sourceUrlCount: sourceUrls.length,
      sourceTypeCount: sourceTypes.length
    });
  }

  if (sourceUrls.length > 0 && sourceTitles.length > 0 && sourceTitles.length !== sourceUrls.length) {
    pushIssue(warnings, row, "source_title_count_mismatch", "confirmationSourceTitles length differs from confirmationSourceUrls length.", {
      sourceUrlCount: sourceUrls.length,
      sourceTitleCount: sourceTitles.length
    });
  }
}

function validateReview(input, options = {}) {
  const rows = asArray(input?.rows);
  const errors = [];
  const warnings = [];
  const stats = {
    rowCount: 0,
    decidedCount: 0,
    pendingDecisionCount: 0,
    byDecision: {}
  };

  if (rows.length === 0) {
    errors.push({
      code: "missing_rows",
      message: "Input review file must contain rows[]."
    });
  }

  rows.forEach((row, index) => validateRow(row, index, options, errors, warnings, stats));

  return {
    ok: errors.length === 0,
    job: "validate-fixture-identity-second-source-confirmation-review-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_second_source_confirmation_review_validation",
    sourceInput: options.inputPath || null,
    targetDate: options.date || null,
    requireComplete: Boolean(options.requireComplete),
    summary: {
      reviewRowCount: stats.rowCount,
      decidedCount: stats.decidedCount,
      pendingDecisionCount: stats.pendingDecisionCount,
      confirmedNoFixtureCount: stats.byDecision.confirmed_no_fixture_on_target_date || 0,
      foundTargetDateFixtureCount: stats.byDecision.found_target_date_fixture || 0,
      insufficientEvidenceCount: stats.byDecision.insufficient_evidence || 0,
      errorCount: errors.length,
      warningCount: warnings.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false,
      dryRun: true
    },
    errors,
    warnings
  };
}

function selfTestReview() {
  return {
    ok: true,
    mode: "manual_review_draft_for_fixture_identity_second_source_confirmation",
    targetDate: "2026-05-22",
    rows: [
      {
        taskId: "fixture_identity_second_source_confirmation:2026-05-22:bel.1",
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        decision: "confirmed_no_fixture_on_target_date",
        confirmationSourceUrls: ["https://example.com/calendar"],
        confirmationSourceTypes: ["official_calendar"],
        confirmationSourceTitles: ["Example calendar"],
        targetDateFixtureCount: 0,
        targetDateFixtureRows: [],
        reviewerNotes: "Independent calendar confirms no fixture on target date."
      },
      {
        taskId: "fixture_identity_second_source_confirmation:2026-05-22:nor.1",
        leagueSlug: "nor.1",
        name: "Norwegian Eliteserien",
        targetDate: "2026-05-22",
        decision: "found_target_date_fixture",
        confirmationSourceUrls: ["https://example.com/fixtures"],
        confirmationSourceTypes: ["official_league_fixtures"],
        confirmationSourceTitles: ["Example fixtures"],
        targetDateFixtureCount: 1,
        targetDateFixtureRows: [
          {
            date: "2026-05-22",
            homeTeam: "Alpha FK",
            awayTeam: "Beta FK",
            sourceUrl: "https://example.com/fixtures"
          }
        ],
        reviewerNotes: "Fixture found on official fixture list."
      },
      {
        taskId: "fixture_identity_second_source_confirmation:2026-05-22:ukr.1",
        leagueSlug: "ukr.1",
        name: "Ukrainian Premier League",
        targetDate: "2026-05-22",
        decision: "insufficient_evidence",
        confirmationSourceUrls: [],
        confirmationSourceTypes: [],
        confirmationSourceTitles: [],
        targetDateFixtureCount: null,
        targetDateFixtureRows: [],
        reviewerNotes: "Source blocked and no reliable calendar confirmation found."
      }
    ]
  };
}

function main() {
  const args = parseArgs();

  const input = args.selfTest ? selfTestReview() : readJson(args.input);
  const report = validateReview(input, {
    inputPath: args.selfTest ? "self-test" : args.input,
    date: args.date ? cleanString(args.date) : null,
    requireComplete: args.requireComplete
  });

  writeJson(args.output, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    output: args.output,
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();