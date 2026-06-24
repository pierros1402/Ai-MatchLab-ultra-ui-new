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

function hostOf(urlValue) {
  try {
    return new URL(text(urlValue)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function preparedRowsFromInput(input) {
  if (Array.isArray(input?.preparedFixtureIdentityRows)) return input.preparedFixtureIdentityRows;
  if (Array.isArray(input?.fixtureIdentityCandidateRows)) return input.fixtureIdentityCandidateRows;
  if (Array.isArray(input?.rows)) return input.rows;
  return [];
}

function reviewRowsFromInput(input) {
  if (Array.isArray(input?.needsReviewFixtureIdentityRows)) return input.needsReviewFixtureIdentityRows;
  return [];
}

function sourceUrlOf(row) {
  return text(row.sourceUrl || row.finalUrl || row.resolvedUrl || row.candidateUrl || row.url);
}

function officialLeagueHostsFor(leagueSlug) {
  const map = {
    "bel.1": ["proleague.be"]
  };

  return map[text(leagueSlug).toLowerCase()] || [];
}

function isOfficialLeagueEvidence(row) {
  const leagueSlug = text(row.leagueSlug).toLowerCase();
  const hostname = hostOf(sourceUrlOf(row));
  const officialHosts = officialLeagueHostsFor(leagueSlug);
  return officialHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function identityKey(row) {
  return [
    text(row.leagueSlug).toLowerCase(),
    text(row.localDate || row.dayKey),
    clean(row.homeTeam).toLowerCase(),
    clean(row.awayTeam).toLowerCase()
  ].join("|");
}

function isCompleteTargetDateCandidate(row) {
  const dayKey = text(row.dayKey);
  const localDate = text(row.localDate);

  return Boolean(
    text(row.leagueSlug) &&
    dayKey &&
    localDate &&
    localDate === dayKey &&
    clean(row.homeTeam) &&
    clean(row.awayTeam)
  );
}

function normalizeCandidate(row, extra = {}) {
  const sourceUrl = sourceUrlOf(row);

  return {
    leagueSlug: text(row.leagueSlug),
    name: text(row.name),
    country: text(row.country),
    dayKey: text(row.dayKey),
    provider: text(row.provider),
    sourceSnapshotId: text(row.sourceSnapshotId),
    sourceUrl,
    sourceHost: hostOf(sourceUrl),
    sourceMatchId: text(row.sourceMatchId),
    homeTeam: clean(row.homeTeam),
    awayTeam: clean(row.awayTeam),
    rawKickoffText: clean(row.rawKickoffText),
    localDate: text(row.localDate),
    localTime: text(row.localTime),
    kickoffUtc: text(row.kickoffUtc),
    dateConfidence: text(row.dateConfidence),
    competition: clean(row.competition),
    round: clean(row.round),
    venue: clean(row.venue),
    homeScore: row.homeScore ?? null,
    awayScore: row.awayScore ?? null,
    periodType: clean(row.periodType),
    extractionMethod: text(row.extractionMethod),
    evidenceState: text(row.evidenceState),
    identityKey: identityKey(row),
    canonicalWrites: 0,
    productionWrite: false,
    ...extra
  };
}

function buildReport(input) {
  const preparedRows = preparedRowsFromInput(input);
  const incomingReviewRows = reviewRowsFromInput(input);

  const verifiedFixtureIdentityRows = [];
  const needsSecondSourceFixtureIdentityRows = [];
  const needsReviewFixtureIdentityRows = [];

  const completeRows = [];
  const incompleteOrOutsideRows = [];

  for (const row of preparedRows) {
    if (isCompleteTargetDateCandidate(row)) {
      completeRows.push(row);
    } else {
      incompleteOrOutsideRows.push(row);
    }
  }

  const grouped = new Map();
  for (const row of completeRows) {
    const key = identityKey(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  for (const rows of grouped.values()) {
    const officialRows = rows.filter(isOfficialLeagueEvidence);
    const uniqueHosts = new Set(rows.map((row) => hostOf(sourceUrlOf(row))).filter(Boolean));

    if (officialRows.length > 0) {
      const row = officialRows[0];
      verifiedFixtureIdentityRows.push(normalizeCandidate(row, {
        verificationState: "verified_fixture_identity_diagnostic",
        verificationReason: "official_league_source_identity_candidate",
        verificationMethod: "single_official_league_source_diagnostic",
        independentSourceCount: uniqueHosts.size,
        officialSource: true,
        noCanonicalPromotion: true
      }));
      continue;
    }

    if (uniqueHosts.size >= 2) {
      const row = rows[0];
      verifiedFixtureIdentityRows.push(normalizeCandidate(row, {
        verificationState: "verified_fixture_identity_diagnostic",
        verificationReason: "multiple_independent_sources_same_identity",
        verificationMethod: "second_source_identity_match_diagnostic",
        independentSourceCount: uniqueHosts.size,
        officialSource: false,
        noCanonicalPromotion: true
      }));
      continue;
    }

    for (const row of rows) {
      needsSecondSourceFixtureIdentityRows.push(normalizeCandidate(row, {
        verificationState: "fixture_identity_candidate_needs_second_source",
        verificationReason: "single_non_official_source_requires_independent_confirmation",
        verificationMethod: "second_source_required",
        independentSourceCount: uniqueHosts.size,
        officialSource: false,
        noCanonicalPromotion: true
      }));
    }
  }

  for (const row of incompleteOrOutsideRows) {
    needsReviewFixtureIdentityRows.push(normalizeCandidate(row, {
      verificationState: "fixture_identity_candidate_needs_review",
      verificationReason: text(row.blockedReason || row.reason || "incomplete_or_outside_target_date_identity_candidate"),
      verificationMethod: "date_or_identity_guard_review",
      officialSource: isOfficialLeagueEvidence(row),
      noCanonicalPromotion: true
    }));
  }

  for (const row of incomingReviewRows) {
    needsReviewFixtureIdentityRows.push(normalizeCandidate(row, {
      verificationState: "fixture_identity_candidate_needs_review",
      verificationReason: text(row.blockedReason || row.reason || "upstream_needs_review_identity_candidate"),
      verificationMethod: "upstream_review_row_preserved",
      officialSource: isOfficialLeagueEvidence(row),
      noCanonicalPromotion: true
    }));
  }

  const summary = {
    inputPreparedCandidateCount: preparedRows.length,
    inputNeedsReviewCandidateCount: incomingReviewRows.length,
    verifiedFixtureIdentityCount: verifiedFixtureIdentityRows.length,
    needsSecondSourceCount: needsSecondSourceFixtureIdentityRows.length,
    needsReviewCandidateCount: needsReviewFixtureIdentityRows.length,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  return {
    ok: true,
    job: "verify-fixture-identity-candidates-file",
    mode: "read_only_fixture_identity_verification_diagnostic",
    generatedAt: new Date().toISOString(),
    summary,
    guarantees: {
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      dryRun: true
    },
    notes: [
      "Diagnostic verifier only; it does not write canonical fixtures.",
      "Official league source identity candidates may be marked verified diagnostically.",
      "Non-official single-source identity candidates require independent second-source confirmation.",
      "Outside-date and incomplete candidates remain review rows."
    ],
    verifiedFixtureIdentityRows,
    needsSecondSourceFixtureIdentityRows,
    needsReviewFixtureIdentityRows
  };
}

function selfTestInput() {
  return {
    preparedFixtureIdentityRows: [
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        country: "Belgium",
        dayKey: "2026-03-22",
        provider: "proleague.be",
        sourceUrl: "https://www.proleague.be/fr/jupliler-pro-league-20252026-kalender",
        sourceMatchId: "embedded-0",
        homeTeam: "OH Leuven",
        awayTeam: "Royal Antwerp FC",
        localDate: "2026-03-22",
        localTime: "17:30",
        kickoffUtc: "2026-03-22T17:30:00Z",
        competition: "Jupiler Pro League",
        extractionMethod: "official_embedded_next_data_match_rows",
        evidenceState: "fixture_identity_candidate_prepared"
      },
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        country: "Belgium",
        dayKey: "2026-03-22",
        provider: "example.com",
        sourceUrl: "https://example.com/belgian-pro-league-fixtures",
        sourceMatchId: "example-0",
        homeTeam: "Club Brugge",
        awayTeam: "Anderlecht",
        localDate: "2026-03-22",
        localTime: "19:30",
        kickoffUtc: "2026-03-22T19:30:00Z",
        competition: "Jupiler Pro League",
        extractionMethod: "independent_fixture_listing",
        evidenceState: "fixture_identity_candidate_prepared"
      },
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        country: "Belgium",
        dayKey: "2026-05-27",
        provider: "proleague.be",
        sourceUrl: "https://www.proleague.be/fr/jupliler-pro-league-20252026-kalender",
        sourceMatchId: "embedded-1",
        homeTeam: "Genk",
        awayTeam: "Gent",
        localDate: "2026-03-22",
        localTime: "15:00",
        kickoffUtc: "2026-03-22T15:00:00Z",
        competition: "Jupiler Pro League",
        extractionMethod: "official_embedded_next_data_match_rows",
        evidenceState: "fixture_identity_candidate_outside_target_date",
        blockedReason: "local_date_does_not_match_requested_day"
      }
    ]
  };
}

function selfTest() {
  const report = buildReport(selfTestInput());

  if (report.summary.verifiedFixtureIdentityCount !== 1) {
    throw new Error(`self-test failed: expected 1 verified identity row, got ${report.summary.verifiedFixtureIdentityCount}`);
  }

  if (report.summary.needsSecondSourceCount !== 1) {
    throw new Error(`self-test failed: expected 1 second-source row, got ${report.summary.needsSecondSourceCount}`);
  }

  if (report.summary.needsReviewCandidateCount !== 1) {
    throw new Error(`self-test failed: expected 1 review row, got ${report.summary.needsReviewCandidateCount}`);
  }

  if ((report.guarantees.canonicalWrites ?? 0) !== 0 || report.guarantees.productionWrite === true) {
    throw new Error("self-test failed: no-write guarantee violated");
  }

  return {
    ok: true,
    selfTest: "verify-fixture-identity-candidates-file",
    summary: report.summary,
    guarantees: report.guarantees
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
    guarantees: report.guarantees
  }, null, 2));
}

main();