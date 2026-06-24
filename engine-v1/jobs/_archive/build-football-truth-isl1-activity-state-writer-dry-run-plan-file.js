import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing input file path");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    gapPlan: "",
    ksiNormalized: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = asText(argv[i]);

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--gap-plan") {
      args.gapPlan = asText(argv[++i]);
      continue;
    }

    if (arg === "--ksi-normalized") {
      args.ksiNormalized = asText(argv[++i]);
      continue;
    }

    if (arg === "--output") {
      args.output = asText(argv[++i]);
      continue;
    }

    if (arg === "--date") {
      args.date = asText(argv[++i]);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function validateIsl1Gap(gapPlan) {
  const row = asArray(gapPlan.activityGapRows)
    .find((entry) => asText(entry.competitionSlug) === "isl.1");

  if (!row) throw new Error("isl.1 activity gap row not found");
  if (asText(row.gapState) !== "missing_current_board_activity_state") {
    throw new Error(`Unexpected isl.1 gapState: ${asText(row.gapState)}`);
  }
  if (row.canonicalActivityStateWriteNeeded !== true) {
    throw new Error("isl.1 canonicalActivityStateWriteNeeded must be true in dry-run plan input");
  }

  return row;
}

function validateKsiEvidence(ksi) {
  const summary = ksi.summary || {};
  const standingRows = asArray(ksi.normalizedStandingRows);
  const fixtureRows = asArray(ksi.normalizedFixtureRows);

  if (asText(summary.competitionSlug) !== "isl.1") {
    throw new Error(`Unexpected KSI competitionSlug: ${asText(summary.competitionSlug)}`);
  }
  if (asText(summary.sourceFamily) !== "ksi_tournament_route") {
    throw new Error(`Unexpected KSI sourceFamily: ${asText(summary.sourceFamily)}`);
  }
  if (asText(summary.seasonStateCandidate) !== "active_current_season") {
    throw new Error(`Unexpected KSI seasonStateCandidate: ${asText(summary.seasonStateCandidate)}`);
  }
  if (asText(summary.fixtureTruthStateCandidate) !== "fixtures_available") {
    throw new Error(`Unexpected KSI fixtureTruthStateCandidate: ${asText(summary.fixtureTruthStateCandidate)}`);
  }
  if (asText(summary.standingsStateCandidate) !== "official_standings_available") {
    throw new Error(`Unexpected KSI standingsStateCandidate: ${asText(summary.standingsStateCandidate)}`);
  }
  if (standingRows.length !== 12) {
    throw new Error(`Expected 12 KSI standing rows, got ${standingRows.length}`);
  }
  if (fixtureRows.length !== 5) {
    throw new Error(`Expected 5 KSI fixture rows, got ${fixtureRows.length}`);
  }
  if (Number(summary.canonicalWrites || 0) !== 0) {
    throw new Error("KSI input must have canonicalWrites 0");
  }
  if (summary.productionWrite !== false) {
    throw new Error("KSI input must have productionWrite false");
  }

  return { summary, standingRows, fixtureRows };
}

function buildWriterDryRunPlan({ gapPlan, ksi, date }) {
  const gapRow = validateIsl1Gap(gapPlan);
  const evidence = validateKsiEvidence(ksi);

  const writePlanRows = [
    {
      competitionSlug: "isl.1",
      leagueSlug: "isl.1",
      writeIntent: "competition_activity_state",
      proposedPatch: {
        seasonState: "active",
        activityState: "active_current_season",
        fixtureTruthState: "fixtures_available",
        standingsState: "official_standings_available",
        dailyFixtureGateState: "eligible_after_explicit_truth_approval",
        sourceFamily: "ksi_tournament_route",
        sourceUrl: asText(evidence.summary.sourceUrl),
        tournamentId: asText(evidence.summary.tournamentId),
        season: asText(evidence.summary.season),
        firstFixtureDate: asText(evidence.summary.firstFixtureDate),
        lastFixtureDate: asText(evidence.summary.lastFixtureDate),
        standingsRowCount: evidence.standingRows.length,
        fixtureRowCount: evidence.fixtureRows.length
      },
      evidenceSummary: {
        gapState: asText(gapRow.gapState),
        canonicalActivityStateWriteNeeded: gapRow.canonicalActivityStateWriteNeeded === true,
        fixtureMaterializationNeeded: gapRow.fixtureMaterializationNeeded === true,
        sourceFamily: "ksi_tournament_route",
        seasonStateCandidate: asText(evidence.summary.seasonStateCandidate),
        fixtureTruthStateCandidate: asText(evidence.summary.fixtureTruthStateCandidate),
        standingsStateCandidate: asText(evidence.summary.standingsStateCandidate),
        standingsRowCount: evidence.standingRows.length,
        fixtureRowCount: evidence.fixtureRows.length,
        firstFixtureDate: asText(evidence.summary.firstFixtureDate),
        lastFixtureDate: asText(evidence.summary.lastFixtureDate)
      },
      explicitApprovalRequiredBeforeWrite: true,
      writeCanonicalNow: false,
      mayPromoteCanonical: false,
      canonicalWrites: 0,
      productionWrite: false
    }
  ];

  return {
    ok: true,
    job: "build-football-truth-isl1-activity-state-writer-dry-run-plan-file",
    mode: "read_only_writer_dry_run_plan_for_isl1_activity_state",
    generatedAt: new Date().toISOString(),
    date,
    summary: {
      competitionSlug: "isl.1",
      writePlanRowCount: writePlanRows.length,
      proposedActivityStateWriteCount: 1,
      proposedFixtureWriteCount: 0,
      proposedResultWriteCount: 0,
      proposedStandingWriteCount: 0,
      explicitApprovalRequiredBeforeWrite: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    writePlanRows,
    disallowedWrites: [
      "fixtures",
      "results",
      "standings",
      "source-reliability",
      "production"
    ],
    approvalGate: {
      required: true,
      requiredUserAction: "explicitly approve canonical activity-state/gate write for isl.1",
      currentRunWritesCanonical: false
    },
    policy: {
      dryRunOnly: true,
      noCanonicalWritesFromThisPlan: true,
      noFixtureMaterializationInThisPlan: true,
      noResultWrites: true,
      noStandingWrites: true,
      noSourceReliabilityMutation: true,
      noSearch: true,
      noFetch: true,
      noCanonicalPromotion: true
    },
    guarantees: {
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const report = buildWriterDryRunPlan({
    date: "2026-06-12",
    gapPlan: {
      activityGapRows: [
        {
          competitionSlug: "isl.1",
          gapState: "missing_current_board_activity_state",
          canonicalActivityStateWriteNeeded: true,
          fixtureMaterializationNeeded: true
        }
      ]
    },
    ksi: {
      summary: {
        competitionSlug: "isl.1",
        sourceFamily: "ksi_tournament_route",
        sourceUrl: "https://www.ksi.is/oll-mot/mot?id=7025510",
        tournamentId: "7025510",
        season: "2026",
        seasonStateCandidate: "active_current_season",
        fixtureTruthStateCandidate: "fixtures_available",
        standingsStateCandidate: "official_standings_available",
        firstFixtureDate: "2026-06-14",
        lastFixtureDate: "2026-06-16",
        canonicalWrites: 0,
        productionWrite: false
      },
      normalizedStandingRows: Array.from({ length: 12 }, (_, i) => ({ teamName: `Team ${i + 1}` })),
      normalizedFixtureRows: Array.from({ length: 5 }, (_, i) => ({ matchId: `m${i + 1}` }))
    }
  });

  if (report.summary.writePlanRowCount !== 1) throw new Error("expected one write plan row");
  if (report.summary.canonicalWrites !== 0) throw new Error("must not write canonical");
  if (report.approvalGate.required !== true) throw new Error("approval gate must be required");
  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-isl1-activity-state-writer-dry-run-plan-file",
      summary: report.summary,
      approvalGate: report.approvalGate,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.gapPlan) throw new Error("--gap-plan is required");
  if (!args.ksiNormalized) throw new Error("--ksi-normalized is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildWriterDryRunPlan({
    gapPlan: readJson(args.gapPlan),
    ksi: readJson(args.ksiNormalized),
    date: args.date
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    approvalGate: report.approvalGate,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-isl1-activity-state-writer-dry-run-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}