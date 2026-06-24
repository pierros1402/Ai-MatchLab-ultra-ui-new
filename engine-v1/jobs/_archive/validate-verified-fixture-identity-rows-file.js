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

function isHttpUrl(value) {
  return /^https?:\/\/[^ "]+$/i.test(text(value));
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value));
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text(value));
}

function proposalIdentitySlugs(proposalPath) {
  if (!proposalPath) return new Set();
  const proposal = readJson(proposalPath);
  return new Set(
    asArray(proposal.proposals)
      .filter((row) => text(row.blockedReason) === "missing_match_level_fixture_identity_rows")
      .map((row) => text(row.leagueSlug))
      .filter(Boolean)
  );
}

function validateRow(row, index, dayKey, expectedSlugs, seenKeys) {
  const errors = [];
  const warnings = [];

  const leagueSlug = norm(row.leagueSlug);
  const homeTeam = norm(row.homeTeam);
  const awayTeam = norm(row.awayTeam);
  const localDate = norm(row.localDate);
  const localTime = norm(row.localTime);
  const provider = norm(row.provider);
  const sourceUrl = norm(row.sourceUrl);
  const sourceSnapshotId = norm(row.sourceSnapshotId);
  const sourceMatchId = norm(row.sourceMatchId);
  const evidenceState = norm(row.evidenceState);

  if (!leagueSlug) errors.push("missing_leagueSlug");
  if (expectedSlugs.size > 0 && leagueSlug && !expectedSlugs.has(leagueSlug)) {
    errors.push("leagueSlug_not_in_expected_proposal_identity_set");
  }

  if (!homeTeam) errors.push("missing_homeTeam");
  if (!awayTeam) errors.push("missing_awayTeam");
  if (homeTeam && awayTeam && homeTeam.toLowerCase() === awayTeam.toLowerCase()) {
    errors.push("homeTeam_equals_awayTeam");
  }

  if (!isDate(localDate)) errors.push("invalid_localDate_format");
  if (localDate && localDate !== dayKey) errors.push("localDate_not_target_day");

  if (!isTime(localTime)) errors.push("invalid_localTime_format");

  if (!provider) errors.push("missing_provider");
  if (!sourceUrl) errors.push("missing_sourceUrl");
  if (sourceUrl && !isHttpUrl(sourceUrl)) errors.push("invalid_sourceUrl");

  if (!sourceSnapshotId) errors.push("missing_sourceSnapshotId");

  if ((provider === "flashscore" || provider === "betexplorer") && !sourceMatchId) {
    errors.push("missing_sourceMatchId_for_provider");
  }

  if (evidenceState !== "fixture_identity_candidate_prepared") {
    errors.push("unexpected_evidenceState");
  }

  const duplicateKey = [
    leagueSlug.toLowerCase(),
    homeTeam.toLowerCase(),
    awayTeam.toLowerCase(),
    localDate,
    localTime
  ].join("|");

  if (seenKeys.has(duplicateKey)) {
    errors.push("duplicate_league_teams_date_time");
  } else {
    seenKeys.add(duplicateKey);
  }

  if (homeTeam.length < 2) warnings.push("short_homeTeam");
  if (awayTeam.length < 2) warnings.push("short_awayTeam");

  return {
    index,
    leagueSlug,
    name: norm(row.name),
    country: norm(row.country),
    provider,
    homeTeam,
    awayTeam,
    localDate,
    localTime,
    kickoffUtc: norm(row.kickoffUtc),
    sourceMatchId,
    sourceUrl,
    sourceSnapshotId,
    extractionMethod: norm(row.extractionMethod),
    dateConfidence: norm(row.dateConfidence),
    valid: errors.length === 0,
    errors,
    warnings,
    sourceRow: row
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = text(args.input);
  const output = text(args.output);
  const dayKey = text(args.date || args.dayKey);

  if (!input) throw new Error("--input is required");
  if (!output) throw new Error("--output is required");
  if (!isDate(dayKey)) throw new Error("--date YYYY-MM-DD is required");
  if (!fs.existsSync(input)) throw new Error(`Missing input file: ${input}`);

  const expectedSlugs = proposalIdentitySlugs(text(args.proposals || args.proposal));
  const report = readJson(input);
  const rows = asArray(report.preparedFixtureIdentityRows);
  const seenKeys = new Set();

  const validations = rows.map((row, index) => validateRow(row, index, dayKey, expectedSlugs, seenKeys));
  const validRows = validations.filter((row) => row.valid);
  const rejectedRows = validations.filter((row) => !row.valid);

  const validLeagueSlugs = new Set(validRows.map((row) => row.leagueSlug).filter(Boolean));
  const rejectedLeagueSlugs = new Set(rejectedRows.map((row) => row.leagueSlug).filter(Boolean));

  const validationReport = {
    ok: rejectedRows.length === 0,
    job: "validate-verified-fixture-identity-rows-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_rows_validator",
    sourceInput: {
      input,
      proposalPath: text(args.proposals || args.proposal),
      dayKey,
      expectedProposalIdentitySlugCount: expectedSlugs.size
    },
    summary: {
      inputPreparedRowCount: rows.length,
      validFixtureIdentityRowCount: validRows.length,
      rejectedFixtureIdentityRowCount: rejectedRows.length,
      validUniqueLeagueSlugCount: validLeagueSlugs.size,
      rejectedUniqueLeagueSlugCount: rejectedLeagueSlugs.size,
      canonicalWrites: 0,
      productionWrite: false
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
      productionWrite: false
    },
    validFixtureIdentityRows: validRows,
    rejectedFixtureIdentityRows: rejectedRows,
    notes: [
      "Diagnostic validator only: this file does not write canonical fixtures.",
      "Valid rows are still not production writes.",
      "A later guarded writer must require explicit apply flags and should consume only validFixtureIdentityRows."
    ]
  };

  writeJson(output, validationReport);

  console.log(JSON.stringify({
    ok: validationReport.ok,
    output,
    summary: validationReport.summary,
    guarantees: validationReport.guarantees
  }, null, 2));

  if (args["fail-on-invalid"] && rejectedRows.length > 0) {
    process.exitCode = 1;
  }
}

main();