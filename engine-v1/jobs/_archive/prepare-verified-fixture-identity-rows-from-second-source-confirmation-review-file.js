#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function cleanString(value) {
  return String(value || "").trim();
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing --input");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    date: "",
    selfTest: false,
    help: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      args.input = cleanString(argv[++i]);
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = cleanString(arg.slice("--input=".length));
      continue;
    }

    if (arg === "--output") {
      args.output = cleanString(argv[++i]);
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = cleanString(arg.slice("--output=".length));
      continue;
    }

    if (arg === "--date") {
      args.date = cleanString(argv[++i]);
      continue;
    }

    if (arg.startsWith("--date=")) {
      args.date = cleanString(arg.slice("--date=".length));
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/prepare-verified-fixture-identity-rows-from-second-source-confirmation-review-file.js --date YYYY-MM-DD --input <validated-confirmation-review.json> --output <prepared-fixture-identity.json>",
    "",
    "Reads validated second-source confirmation review output and prepares fixture identity rows for validate-verified-fixture-identity-rows-file.js.",
    "",
    "Guarantees:",
    "  - no fetch",
    "  - no review decision applied",
    "  - no canonical promotion",
    "  - canonicalWrites: 0",
    "  - productionWrite: false",
    "  - dryRun: true"
  ].join("\n");
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSourceUrl(row, fixture) {
  const fromFixture = cleanString(fixture?.sourceUrl);
  if (fromFixture) return fromFixture;

  const urls = arrayOf(row?.confirmationSourceUrls);
  return cleanString(urls[0]);
}

function normalizeSourceType(row, fixture) {
  const fromFixture = cleanString(fixture?.sourceType);
  if (fromFixture) return fromFixture;

  const types = arrayOf(row?.confirmationSourceTypes);
  return cleanString(types[0] || "second_source");
}

function sourceSnapshotIdFor(row, fixture, index) {
  const taskId = cleanString(row?.taskId);
  const sourceUrl = normalizeSourceUrl(row, fixture);
  if (taskId) return taskId;
  if (sourceUrl) return `second_source_confirmation:${index}:${sourceUrl}`;
  return `second_source_confirmation:${index}`;
}

function buildSourceMatchId(targetDate, leagueSlug, homeTeam, awayTeam, sourceType) {
  const slug = [sourceType, targetDate, leagueSlug, homeTeam, awayTeam]
    .map((part) => cleanString(part).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join(":");
  return slug || `second-source:${targetDate}:${leagueSlug}`;
}

function prepareRows(input, options = {}) {
  const targetDate = cleanString(options.date || input?.targetDate || input?.date);
  const inputRows = arrayOf(input?.validReviewRows).length > 0
    ? arrayOf(input.validReviewRows)
    : arrayOf(input?.rows);

  const preparedFixtureIdentityRows = [];
  const rejectedReviewRows = [];

  for (let rowIndex = 0; rowIndex < inputRows.length; rowIndex += 1) {
    const row = inputRows[rowIndex];
    const decision = cleanString(row?.decision);

    if (decision !== "found_target_date_fixture") {
      rejectedReviewRows.push({
        rowIndex,
        taskId: cleanString(row?.taskId),
        leagueSlug: cleanString(row?.leagueSlug),
        targetDate: cleanString(row?.targetDate || targetDate),
        decision,
        reason: "review_decision_not_found_target_date_fixture",
        canonicalWrites: 0,
        productionWrite: false
      });
      continue;
    }

    const fixtureRows = arrayOf(row?.targetDateFixtureRows);

    if (fixtureRows.length < 1) {
      rejectedReviewRows.push({
        rowIndex,
        taskId: cleanString(row?.taskId),
        leagueSlug: cleanString(row?.leagueSlug),
        targetDate: cleanString(row?.targetDate || targetDate),
        decision,
        reason: "missing_targetDateFixtureRows",
        canonicalWrites: 0,
        productionWrite: false
      });
      continue;
    }

    for (let fixtureIndex = 0; fixtureIndex < fixtureRows.length; fixtureIndex += 1) {
      const fixture = fixtureRows[fixtureIndex];
      const leagueSlug = cleanString(fixture?.leagueSlug || row?.leagueSlug);
      const name = cleanString(row?.name || fixture?.name || fixture?.leagueName);
      const localDate = cleanString(fixture?.targetDate || fixture?.localDate || row?.targetDate || targetDate);
      const homeTeam = cleanString(fixture?.homeTeam);
      const awayTeam = cleanString(fixture?.awayTeam);
      const localTime = cleanString(fixture?.kickoffTimeLocal || fixture?.localTime);
      const sourceUrl = normalizeSourceUrl(row, fixture);
      const sourceType = normalizeSourceType(row, fixture);

      const missing = [];
      if (!leagueSlug) missing.push("leagueSlug");
      if (!localDate) missing.push("targetDate");
      if (!homeTeam) missing.push("homeTeam");
      if (!awayTeam) missing.push("awayTeam");
      if (!sourceUrl) missing.push("sourceUrl");

      if (missing.length > 0) {
        rejectedReviewRows.push({
          rowIndex,
          fixtureIndex,
          taskId: cleanString(row?.taskId),
          leagueSlug,
          targetDate: localDate,
          homeTeam,
          awayTeam,
          sourceUrl,
          reason: "missing_required_fixture_identity_fields",
          missing,
          canonicalWrites: 0,
          productionWrite: false
        });
        continue;
      }

      preparedFixtureIdentityRows.push({
        leagueSlug,
        name,
        country: cleanString(fixture?.country || row?.country || ""),
        provider: sourceType || "second_source",
        homeTeam,
        awayTeam,
        localDate,
        localTime,
        kickoffUtc: cleanString(fixture?.kickoffUtc),
        sourceMatchId: cleanString(fixture?.sourceMatchId) || buildSourceMatchId(localDate, leagueSlug, homeTeam, awayTeam, sourceType),
        sourceUrl,
        sourceSnapshotId: sourceSnapshotIdFor(row, fixture, preparedFixtureIdentityRows.length),
        extractionMethod: "from_validated_second_source_confirmation_review",
        dateConfidence: "high",
        timeConfidence: localTime ? "high" : "",
        venue: cleanString(fixture?.venue),
        evidenceState: "fixture_identity_candidate_prepared",
        verificationState: "prepared_from_validated_second_source_confirmation_review",
        officialSource: sourceType === "official_club",
        independentSourceCount: 2,
        confirmationSourceCount: Math.max(1, arrayOf(row?.confirmationSourceUrls).length),
        sourceAgreementState: "fixture_identity_confirmed_by_independent_second_source",
        reviewerNotes: cleanString(row?.reviewerNotes),
        canonicalWrites: 0,
        productionWrite: false
      });
    }
  }

  return {
    preparedFixtureIdentityRows,
    rejectedReviewRows
  };
}

function buildReport(input, options = {}) {
  const result = prepareRows(input, options);

  return {
    ok: true,
    job: "prepare-verified-fixture-identity-rows-from-second-source-confirmation-review-file",
    mode: "read_only_prepare_verified_fixture_identity_rows_from_second_source_confirmation_review",
    sourceInput: options.inputPath || "",
    targetDate: cleanString(options.date || input?.targetDate || input?.date),
    summary: {
      inputReviewRowCount: arrayOf(input?.validReviewRows).length > 0 ? arrayOf(input.validReviewRows).length : arrayOf(input?.rows).length,
      preparedFixtureIdentityRowCount: result.preparedFixtureIdentityRows.length,
      rejectedReviewRowCount: result.rejectedReviewRows.length,
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
    preparedFixtureIdentityRows: result.preparedFixtureIdentityRows,
    rejectedReviewRows: result.rejectedReviewRows
  };
}

function selfTestInput() {
  return {
    ok: true,
    targetDate: "2026-05-31",
    rows: [
      {
        taskId: "fixture_identity_second_source_confirmation:2026-05-31:bel.1:kaa-gent-official",
        leagueSlug: "bel.1",
        name: "Jupiler Pro League",
        targetDate: "2026-05-31",
        decision: "found_target_date_fixture",
        confirmationSourceUrls: ["https://www.kaagent.be/nl/nieuws/26-05-2026/ticketinfo-kaa-gent-krc-genk-1"],
        confirmationSourceTypes: ["official_club"],
        targetDateFixtureRows: [
          {
            leagueSlug: "bel.1",
            homeTeam: "KAA Gent",
            awayTeam: "KRC Genk",
            targetDate: "2026-05-31",
            kickoffTimeLocal: "18:30",
            venue: "Planet Group Arena",
            sourceUrl: "https://www.kaagent.be/nl/nieuws/26-05-2026/ticketinfo-kaa-gent-krc-genk-1",
            sourceType: "official_club"
          }
        ]
      }
    ]
  };
}

function runSelfTest() {
  const report = buildReport(selfTestInput(), {
    inputPath: "self-test",
    date: "2026-05-31"
  });

  if (report.summary.preparedFixtureIdentityRowCount !== 1) {
    throw new Error("self-test failed: expected one prepared fixture identity row");
  }

  if (report.summary.rejectedReviewRowCount !== 0) {
    throw new Error("self-test failed: expected zero rejected review rows");
  }

  const row = report.preparedFixtureIdentityRows[0];

  if (row.evidenceState !== "fixture_identity_candidate_prepared") {
    throw new Error("self-test failed: validator-compatible evidenceState missing");
  }

  if (row.localDate !== "2026-05-31" || row.homeTeam !== "KAA Gent" || row.awayTeam !== "KRC Genk") {
    throw new Error("self-test failed: fixture identity fields mismatch");
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false || report.guarantees.dryRun !== true) {
    throw new Error("self-test failed: read-only guarantees missing");
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(usage());
    return;
  }

  const report = args.selfTest
    ? runSelfTest()
    : buildReport(readJson(args.input), {
        inputPath: args.input,
        date: args.date
      });

  if (args.output) {
    writeJson(args.output, report);
  }

  console.log(JSON.stringify({
    ok: report.ok,
    job: report.job,
    mode: report.mode,
    targetDate: report.targetDate,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "prepare-verified-fixture-identity-rows-from-second-source-confirmation-review-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  }, null, 2));
  process.exitCode = 1;
});