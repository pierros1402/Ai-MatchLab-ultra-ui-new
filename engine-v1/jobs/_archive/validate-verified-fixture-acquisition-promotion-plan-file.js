import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? "" : String(value);
}

function norm(value) {
  return text(value).replace(/\s+/g, " ").trim();
}

function intArg(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid integer argument: ${value}`);
  return parsed;
}

function fail(errors, code, message, context = {}) {
  errors.push({ code, message, context });
}

function validatePlan(plan, options) {
  const errors = [];
  const warnings = [];

  const expectedDate = text(options.expectedDate);
  const expectedValidRows = options.expectedValidRows;
  const expectedProposedRows = options.expectedProposedRows;
  const expectedProposedLeagues = options.expectedProposedLeagues;
  const expectedBlockedRows = options.expectedBlockedRows;
  const expectedLeagues = new Set(asArray(options.expectedLeagues).map(norm).filter(Boolean));

  if (plan == null || typeof plan !== "object") {
    fail(errors, "invalid_plan_shape", "Input is not a JSON object.");
    return { errors, warnings };
  }

  if (plan.ok !== true) {
    fail(errors, "plan_not_ok", "Plan must have ok=true.");
  }

  if (plan.dryRun !== true) {
    fail(errors, "plan_not_dry_run", "Plan must have dryRun=true.");
  }

  const summary = plan.summary || {};
  const guarantees = plan.guarantees || {};
  const sourceInput = plan.sourceInput || {};
  const proposedRows = asArray(plan.proposedCanonicalFixtureRows);
  const blockedRows = asArray(plan.blockedProposalRows);
  const rejectedRows = asArray(plan.rejectedValidationRows);

  const summaryChecks = [
    ["canonicalWrites", summary.canonicalWrites, 0],
    ["productionWrite", summary.productionWrite, false],
    ["dryRun", summary.dryRun, true]
  ];

  for (const [field, actual, expected] of summaryChecks) {
    if (actual !== expected) {
      fail(errors, "unsafe_summary_flag", `Summary ${field} must be ${expected}.`, { field, actual, expected });
    }
  }

  const guaranteeChecks = [
    ["sourceFetch", guarantees.sourceFetch, false],
    ["noFetch", guarantees.noFetch, true],
    ["noUrlFetch", guarantees.noUrlFetch, true],
    ["noCanonicalPromotion", guarantees.noCanonicalPromotion, true],
    ["canonicalWrites", guarantees.canonicalWrites, 0],
    ["productionWrite", guarantees.productionWrite, false],
    ["dryRun", guarantees.dryRun, true]
  ];

  for (const [field, actual, expected] of guaranteeChecks) {
    if (actual !== expected) {
      fail(errors, "unsafe_guarantee_flag", `Guarantee ${field} must be ${expected}.`, { field, actual, expected });
    }
  }

  if (expectedDate && sourceInput.dayKey && norm(sourceInput.dayKey) !== expectedDate) {
    fail(errors, "unexpected_source_day_key", "Plan sourceInput.dayKey does not match expected date.", {
      expectedDate,
      actual: sourceInput.dayKey
    });
  }

  if (expectedValidRows != null && summary.validFixtureIdentityRowCount !== expectedValidRows) {
    fail(errors, "unexpected_valid_fixture_identity_row_count", "Unexpected valid fixture identity row count.", {
      expected: expectedValidRows,
      actual: summary.validFixtureIdentityRowCount
    });
  }

  if (expectedProposedRows != null && summary.proposedCanonicalFixtureRowCount !== expectedProposedRows) {
    fail(errors, "unexpected_proposed_row_count", "Unexpected proposed canonical fixture row count.", {
      expected: expectedProposedRows,
      actual: summary.proposedCanonicalFixtureRowCount
    });
  }

  if (expectedProposedLeagues != null && summary.proposedCanonicalFixtureLeagueCount !== expectedProposedLeagues) {
    fail(errors, "unexpected_proposed_league_count", "Unexpected proposed canonical fixture league count.", {
      expected: expectedProposedLeagues,
      actual: summary.proposedCanonicalFixtureLeagueCount
    });
  }

  if (expectedBlockedRows != null && summary.blockedProposalRowCount !== expectedBlockedRows) {
    fail(errors, "unexpected_blocked_row_count", "Unexpected blocked proposal row count.", {
      expected: expectedBlockedRows,
      actual: summary.blockedProposalRowCount
    });
  }

  if (summary.proposedCanonicalFixtureRowCount !== proposedRows.length) {
    fail(errors, "summary_proposed_row_count_mismatch", "Summary proposed row count does not match row array length.", {
      summaryCount: summary.proposedCanonicalFixtureRowCount,
      actualCount: proposedRows.length
    });
  }

  if (summary.blockedProposalRowCount !== blockedRows.length) {
    fail(errors, "summary_blocked_row_count_mismatch", "Summary blocked row count does not match row array length.", {
      summaryCount: summary.blockedProposalRowCount,
      actualCount: blockedRows.length
    });
  }

  if (summary.rejectedFixtureIdentityRowCount !== rejectedRows.length) {
    fail(errors, "summary_rejected_row_count_mismatch", "Summary rejected row count does not match row array length.", {
      summaryCount: summary.rejectedFixtureIdentityRowCount,
      actualCount: rejectedRows.length
    });
  }

  const proposedLeagueSlugs = new Set();
  const seenFixtureKeys = new Set();

  for (const [index, row] of proposedRows.entries()) {
    const fixture = row.proposedCanonicalFixture || {};
    const leagueSlug = norm(fixture.leagueSlug);
    const homeTeam = norm(fixture.homeTeam);
    const awayTeam = norm(fixture.awayTeam);
    const localDate = norm(fixture.localDate);
    const date = norm(fixture.date);
    const status = norm(fixture.status);
    const writeTarget = norm(row.writeTarget);

    if (!norm(row.planRowId)) {
      fail(errors, "missing_plan_row_id", "Proposed row is missing planRowId.", { index });
    }

    if (row.canonicalWrites !== 0) {
      fail(errors, "unsafe_plan_row_canonical_writes", "Proposed row canonicalWrites must be 0.", {
        index,
        planRowId: row.planRowId,
        actual: row.canonicalWrites
      });
    }

    if (row.productionWrite !== false) {
      fail(errors, "unsafe_plan_row_production_write", "Proposed row productionWrite must be false.", {
        index,
        planRowId: row.planRowId,
        actual: row.productionWrite
      });
    }

    if (row.dryRun !== true) {
      fail(errors, "unsafe_plan_row_dry_run", "Proposed row dryRun must be true.", {
        index,
        planRowId: row.planRowId,
        actual: row.dryRun
      });
    }

    if (!leagueSlug) {
      fail(errors, "missing_league_slug", "Proposed fixture is missing leagueSlug.", {
        index,
        planRowId: row.planRowId
      });
      continue;
    }

    proposedLeagueSlugs.add(leagueSlug);

    if (expectedLeagues.size > 0 && !expectedLeagues.has(leagueSlug)) {
      fail(errors, "unexpected_proposed_league", "Proposed fixture has an unexpected leagueSlug.", {
        index,
        planRowId: row.planRowId,
        leagueSlug
      });
    }

    if (!homeTeam) {
      fail(errors, "missing_home_team", "Proposed fixture is missing homeTeam.", {
        index,
        planRowId: row.planRowId,
        leagueSlug
      });
    }

    if (!awayTeam) {
      fail(errors, "missing_away_team", "Proposed fixture is missing awayTeam.", {
        index,
        planRowId: row.planRowId,
        leagueSlug
      });
    }

    if (homeTeam && awayTeam && homeTeam === awayTeam) {
      fail(errors, "same_home_away_team", "Proposed fixture has the same home and away team.", {
        index,
        planRowId: row.planRowId,
        leagueSlug,
        homeTeam,
        awayTeam
      });
    }

    if (expectedDate && date !== expectedDate) {
      fail(errors, "unexpected_fixture_date", "Proposed fixture date does not match expected date.", {
        index,
        planRowId: row.planRowId,
        leagueSlug,
        expectedDate,
        actual: date
      });
    }

    if (expectedDate && localDate !== expectedDate) {
      fail(errors, "unexpected_fixture_local_date", "Proposed fixture localDate does not match expected date.", {
        index,
        planRowId: row.planRowId,
        leagueSlug,
        expectedDate,
        actual: localDate
      });
    }

    if (status !== "PRE") {
      fail(errors, "unexpected_fixture_status", "Proposed fixture status must be PRE.", {
        index,
        planRowId: row.planRowId,
        leagueSlug,
        actual: status
      });
    }

    const expectedWriteTarget = `data/canonical-fixtures/${expectedDate || date}/${leagueSlug}.json`;
    if (writeTarget !== expectedWriteTarget) {
      fail(errors, "unexpected_write_target", "Proposed row writeTarget is not the expected canonical fixture path.", {
        index,
        planRowId: row.planRowId,
        leagueSlug,
        expected: expectedWriteTarget,
        actual: writeTarget
      });
    }

    const sourceEvidence = row.sourceEvidence || {};
    if (!norm(sourceEvidence.sourceUrl) && !norm(fixture.sourceUrl)) {
      fail(errors, "missing_source_url", "Proposed fixture row has no source URL evidence.", {
        index,
        planRowId: row.planRowId,
        leagueSlug
      });
    }

    const fixtureKey = [
      expectedDate || date,
      leagueSlug,
      localDate,
      norm(fixture.localTime),
      homeTeam.toLowerCase(),
      awayTeam.toLowerCase()
    ].join("|");

    if (seenFixtureKeys.has(fixtureKey)) {
      fail(errors, "duplicate_proposed_fixture_key", "Duplicate proposed fixture key in promotion plan.", {
        index,
        planRowId: row.planRowId,
        leagueSlug,
        fixtureKey
      });
    } else {
      seenFixtureKeys.add(fixtureKey);
    }
  }

  if (expectedLeagues.size > 0) {
    for (const expectedLeague of expectedLeagues) {
      if (!proposedLeagueSlugs.has(expectedLeague)) {
        fail(errors, "missing_expected_proposed_league", "Expected league is missing from proposed canonical fixture rows.", {
          leagueSlug: expectedLeague
        });
      }
    }
  }

  for (const [index, row] of blockedRows.entries()) {
    const leagueSlug = norm(row.leagueSlug);

    if (!leagueSlug) {
      fail(errors, "blocked_row_missing_league_slug", "Blocked proposal row is missing leagueSlug.", { index });
    }

    if (row.canonicalWrites !== 0) {
      fail(errors, "unsafe_blocked_row_canonical_writes", "Blocked row canonicalWrites must be 0.", {
        index,
        leagueSlug,
        actual: row.canonicalWrites
      });
    }

    if (row.productionWrite !== false) {
      fail(errors, "unsafe_blocked_row_production_write", "Blocked row productionWrite must be false.", {
        index,
        leagueSlug,
        actual: row.productionWrite
      });
    }

    if (row.dryRun !== true) {
      fail(errors, "unsafe_blocked_row_dry_run", "Blocked row dryRun must be true.", {
        index,
        leagueSlug,
        actual: row.dryRun
      });
    }

    if (proposedLeagueSlugs.has(leagueSlug)) {
      fail(errors, "league_both_proposed_and_blocked", "A league appears in both proposed and blocked rows.", {
        index,
        leagueSlug
      });
    }
  }

  if (summary.proposedCanonicalFixtureLeagueCount !== proposedLeagueSlugs.size) {
    fail(errors, "summary_proposed_league_count_mismatch", "Summary proposed league count does not match distinct proposed leagues.", {
      summaryCount: summary.proposedCanonicalFixtureLeagueCount,
      actualCount: proposedLeagueSlugs.size
    });
  }

  return { errors, warnings };
}

function main() {
  const args = parseArgs(process.argv);
  const input = text(args.input);
  const output = text(args.output);
  const expectedDate = text(args.date || args.expectedDate);

  if (!input) throw new Error("--input is required");
  if (!fs.existsSync(input)) throw new Error(`Missing promotion plan input: ${input}`);

  const expectedLeagues = text(args.expectedLeagues)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const options = {
    expectedDate,
    expectedValidRows: intArg(args.expectedValidRows, null),
    expectedProposedRows: intArg(args.expectedProposedRows, null),
    expectedProposedLeagues: intArg(args.expectedProposedLeagues, null),
    expectedBlockedRows: intArg(args.expectedBlockedRows, null),
    expectedLeagues
  };

  const plan = readJson(input);
  const validation = validatePlan(plan, options);

  const report = {
    ok: validation.errors.length === 0,
    job: "validate-verified-fixture-acquisition-promotion-plan-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_verified_fixture_acquisition_promotion_plan_validation",
    sourceInput: {
      input,
      expectedDate,
      expectedValidRows: options.expectedValidRows,
      expectedProposedRows: options.expectedProposedRows,
      expectedProposedLeagues: options.expectedProposedLeagues,
      expectedBlockedRows: options.expectedBlockedRows,
      expectedLeagues
    },
    summary: {
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
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
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    errors: validation.errors,
    warnings: validation.warnings
  };

  if (output) {
    writeJson(output, report);
  }

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();