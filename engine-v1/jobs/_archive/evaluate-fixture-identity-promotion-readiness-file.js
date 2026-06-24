#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--output") {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function readJson(filePath, label) {
  if (!filePath) throw new Error(`missing ${label} path`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing output path");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function clean(value) {
  return text(value).replace(/\s+/g, " ").trim();
}

function verifiedRowsFromInput(input) {
  if (Array.isArray(input?.verifiedFixtureIdentityRows)) return input.verifiedFixtureIdentityRows;
  if (Array.isArray(input?.rows)) return input.rows;
  return [];
}

function needsSecondSourceRowsFromInput(input) {
  if (Array.isArray(input?.needsSecondSourceFixtureIdentityRows)) return input.needsSecondSourceFixtureIdentityRows;
  return [];
}

function needsReviewRowsFromInput(input) {
  if (Array.isArray(input?.needsReviewFixtureIdentityRows)) return input.needsReviewFixtureIdentityRows;
  return [];
}

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function identityKey(row) {
  return text(row.identityKey) || [
    text(row.leagueSlug).toLowerCase(),
    text(row.localDate || row.dayKey),
    clean(row.homeTeam).toLowerCase(),
    clean(row.awayTeam).toLowerCase()
  ].join("|");
}

function normalizeRow(row, extra = {}) {
  return {
    leagueSlug: text(row.leagueSlug),
    name: text(row.name),
    country: text(row.country),
    dayKey: text(row.dayKey),
    sourceUrl: text(row.sourceUrl),
    sourceHost: text(row.sourceHost),
    sourceMatchId: text(row.sourceMatchId),
    homeTeam: clean(row.homeTeam),
    awayTeam: clean(row.awayTeam),
    localDate: text(row.localDate),
    localTime: text(row.localTime),
    kickoffUtc: text(row.kickoffUtc),
    competition: clean(row.competition),
    round: clean(row.round),
    venue: clean(row.venue),
    extractionMethod: text(row.extractionMethod),
    evidenceState: text(row.evidenceState),
    verificationState: text(row.verificationState),
    verificationReason: text(row.verificationReason),
    verificationMethod: text(row.verificationMethod),
    independentSourceCount: numberValue(row.independentSourceCount),
    officialSource: row.officialSource === true,
    identityKey: identityKey(row),
    canonicalWrites: 0,
    productionWrite: false,
    noCanonicalPromotion: true,
    ...extra
  };
}

function evaluateRow(row) {
  const officialSource = row.officialSource === true;
  const independentSourceCount = numberValue(row.independentSourceCount);
  const verificationState = text(row.verificationState);

  if (verificationState !== "verified_fixture_identity_diagnostic") {
    return {
      ready: false,
      reason: "not_verified_fixture_identity_diagnostic"
    };
  }

  if (!officialSource) {
    return {
      ready: false,
      reason: "non_official_identity_requires_official_or_stronger_policy"
    };
  }

  if (independentSourceCount < 2) {
    return {
      ready: false,
      reason: "official_identity_requires_independent_second_source_before_promotion"
    };
  }

  return {
    ready: true,
    reason: "official_identity_with_independent_second_source_ready_for_guarded_promotion"
  };
}

function buildReport(input) {
  const verifiedRows = verifiedRowsFromInput(input);
  const needsSecondSourceRows = needsSecondSourceRowsFromInput(input);
  const needsReviewRows = needsReviewRowsFromInput(input);

  const promotionReadyFixtureIdentityRows = [];
  const promotionBlockedFixtureIdentityRows = [];

  for (const row of verifiedRows) {
    const evaluation = evaluateRow(row);

    if (evaluation.ready) {
      promotionReadyFixtureIdentityRows.push(normalizeRow(row, {
        promotionReadinessState: "fixture_identity_ready_for_guarded_promotion",
        promotionReadinessReason: evaluation.reason,
        writerAllowed: false,
        writerBlockedUntilSeparatePromotionLayer: true
      }));
    } else {
      promotionBlockedFixtureIdentityRows.push(normalizeRow(row, {
        promotionReadinessState: "fixture_identity_promotion_blocked",
        promotionReadinessReason: evaluation.reason,
        writerAllowed: false,
        writerBlockedUntilSeparatePromotionLayer: true
      }));
    }
  }

  const preservedNeedsSecondSourceRows = needsSecondSourceRows.map((row) => normalizeRow(row, {
    promotionReadinessState: "fixture_identity_promotion_blocked",
    promotionReadinessReason: "candidate_needs_second_source_before_promotion",
    writerAllowed: false,
    writerBlockedUntilSeparatePromotionLayer: true
  }));

  const preservedNeedsReviewRows = needsReviewRows.map((row) => normalizeRow(row, {
    promotionReadinessState: "fixture_identity_promotion_blocked",
    promotionReadinessReason: "candidate_needs_review_before_promotion",
    writerAllowed: false,
    writerBlockedUntilSeparatePromotionLayer: true
  }));

  const summary = {
    inputVerifiedFixtureIdentityCount: verifiedRows.length,
    inputNeedsSecondSourceCount: needsSecondSourceRows.length,
    inputNeedsReviewCandidateCount: needsReviewRows.length,
    promotionReadyFixtureIdentityCount: promotionReadyFixtureIdentityRows.length,
    promotionBlockedFixtureIdentityCount: promotionBlockedFixtureIdentityRows.length,
    preservedNeedsSecondSourceCount: preservedNeedsSecondSourceRows.length,
    preservedNeedsReviewCandidateCount: preservedNeedsReviewRows.length,
    writerAllowedCount: 0,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  return {
    ok: true,
    job: "evaluate-fixture-identity-promotion-readiness-file",
    mode: "read_only_fixture_identity_promotion_readiness_diagnostic",
    generatedAt: new Date().toISOString(),
    summary,
    guarantees: {
      noCanonicalPromotion: true,
      noWriter: true,
      writerAllowedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      dryRun: true
    },
    policy: {
      verifiedDiagnosticIsNotPromotion: true,
      officialSingleSourceRequiresSecondSourceBeforePromotion: true,
      nonOfficialSourcesRequireOfficialOrStrongerPolicy: true,
      promotionRequiresSeparateGuardedWriterLayer: true
    },
    notes: [
      "This job evaluates promotion readiness only; it does not write canonical fixtures.",
      "Diagnostic verified identity rows are not automatically promotion-ready.",
      "A single official league source is blocked until independent second-source confirmation exists.",
      "Any future canonical writer must consume promotion-ready diagnostics through a separate guarded promotion layer."
    ],
    promotionReadyFixtureIdentityRows,
    promotionBlockedFixtureIdentityRows,
    needsSecondSourceFixtureIdentityRows: preservedNeedsSecondSourceRows,
    needsReviewFixtureIdentityRows: preservedNeedsReviewRows
  };
}

function selfTestInput() {
  return {
    verifiedFixtureIdentityRows: [
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        country: "Belgium",
        dayKey: "2026-03-22",
        sourceUrl: "https://www.proleague.be/fr/jupliler-pro-league-20252026-kalender",
        sourceHost: "proleague.be",
        sourceMatchId: "embedded-0",
        homeTeam: "OH Leuven",
        awayTeam: "Royal Antwerp FC",
        localDate: "2026-03-22",
        localTime: "17:30",
        kickoffUtc: "2026-03-22T17:30:00Z",
        competition: "Jupiler Pro League",
        extractionMethod: "official_embedded_next_data_match_rows",
        verificationState: "verified_fixture_identity_diagnostic",
        verificationReason: "official_league_source_identity_candidate",
        verificationMethod: "single_official_league_source_diagnostic",
        independentSourceCount: 1,
        officialSource: true
      },
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        country: "Belgium",
        dayKey: "2026-03-22",
        sourceUrl: "https://www.proleague.be/fr/jupliler-pro-league-20252026-kalender",
        sourceHost: "proleague.be",
        sourceMatchId: "embedded-1",
        homeTeam: "Club Brugge",
        awayTeam: "Anderlecht",
        localDate: "2026-03-22",
        localTime: "19:30",
        kickoffUtc: "2026-03-22T19:30:00Z",
        competition: "Jupiler Pro League",
        extractionMethod: "official_embedded_next_data_match_rows",
        verificationState: "verified_fixture_identity_diagnostic",
        verificationReason: "official_league_source_identity_candidate",
        verificationMethod: "official_plus_independent_second_source_diagnostic",
        independentSourceCount: 2,
        officialSource: true
      },
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        country: "Belgium",
        dayKey: "2026-03-22",
        sourceUrl: "https://example.com/fixture-listing",
        sourceHost: "example.com",
        sourceMatchId: "independent-0",
        homeTeam: "Genk",
        awayTeam: "Gent",
        localDate: "2026-03-22",
        localTime: "15:00",
        kickoffUtc: "2026-03-22T15:00:00Z",
        competition: "Jupiler Pro League",
        extractionMethod: "independent_fixture_listing",
        verificationState: "verified_fixture_identity_diagnostic",
        verificationReason: "multiple_independent_sources_same_identity",
        verificationMethod: "second_source_identity_match_diagnostic",
        independentSourceCount: 2,
        officialSource: false
      }
    ],
    needsSecondSourceFixtureIdentityRows: [
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        dayKey: "2026-03-22",
        sourceUrl: "https://example.com/single-source",
        homeTeam: "Mechelen",
        awayTeam: "Westerlo",
        localDate: "2026-03-22",
        verificationState: "fixture_identity_candidate_needs_second_source"
      }
    ],
    needsReviewFixtureIdentityRows: [
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        dayKey: "2026-05-27",
        sourceUrl: "https://www.proleague.be/fr/jupliler-pro-league-20252026-kalender",
        homeTeam: "Genk",
        awayTeam: "Gent",
        localDate: "2026-03-22",
        verificationState: "fixture_identity_candidate_needs_review"
      }
    ]
  };
}

function selfTest() {
  const report = buildReport(selfTestInput());

  if (report.summary.promotionReadyFixtureIdentityCount !== 1) {
    throw new Error(`self-test failed: expected 1 promotion-ready row, got ${report.summary.promotionReadyFixtureIdentityCount}`);
  }

  if (report.summary.promotionBlockedFixtureIdentityCount !== 2) {
    throw new Error(`self-test failed: expected 2 promotion-blocked verified rows, got ${report.summary.promotionBlockedFixtureIdentityCount}`);
  }

  if (report.summary.preservedNeedsSecondSourceCount !== 1) {
    throw new Error(`self-test failed: expected 1 preserved second-source row, got ${report.summary.preservedNeedsSecondSourceCount}`);
  }

  if (report.summary.preservedNeedsReviewCandidateCount !== 1) {
    throw new Error(`self-test failed: expected 1 preserved review row, got ${report.summary.preservedNeedsReviewCandidateCount}`);
  }

  if ((report.guarantees.canonicalWrites ?? 0) !== 0 || report.guarantees.productionWrite === true) {
    throw new Error("self-test failed: no-write guarantee violated");
  }

  if (report.guarantees.writerAllowedCount !== 0) {
    throw new Error("self-test failed: writerAllowedCount must remain 0");
  }

  return {
    ok: true,
    selfTest: "evaluate-fixture-identity-promotion-readiness-file",
    summary: report.summary,
    guarantees: report.guarantees,
    policy: report.policy
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  if (!args.input) throw new Error("missing --input");
  if (!args.output) throw new Error("missing --output");

  const input = readJson(args.input, "input");
  const report = buildReport(input);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees,
    policy: report.policy
  }, null, 2));
}

main();