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

function asText(value) {
  return String(value || "").trim();
}

function asBool(value) {
  return value === true;
}

function normalizeDecision(value) {
  const decision = asText(value).toLowerCase();
  return decision || "pending_review";
}

function isUsableDecision(decision) {
  return [
    "usable_fixture_evidence",
    "usable_official_fixture_evidence",
    "usable_independent_fixture_evidence",
    "usable_club_fallback_fixture_evidence"
  ].includes(decision);
}

function isExplicitNoFixtureDecision(decision) {
  return [
    "explicit_no_fixture_evidence",
    "usable_explicit_no_fixture_evidence"
  ].includes(decision);
}

function isReviewedDecision(decision) {
  return isUsableDecision(decision) || isExplicitNoFixtureDecision(decision);
}

function hostFromUrl(url) {
  const value = asText(url);
  if (!value) return "";

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isExcludedHostValue(url, host) {
  const joined = `${asText(url)} ${asText(host)}`.toLowerCase();
  return /(^|\.)betexplorer\.com|flashscore\.|(^|\.)soccerway\.com|(^|\.)aiscore\.com|(^|\.)sofascore\.com/.test(joined);
}

function validateReviewRow(row) {
  const decision = normalizeDecision(row.reviewerDecision);
  const candidateUrl = asText(row.candidateUrl);
  const sourceHost = hostFromUrl(candidateUrl);
  const violations = [];
  const warnings = [];

  const rowFlags = {
    opened: asBool(row.opened),
    sourceUsable: asBool(row.sourceUsable),
    targetDateVisible: asBool(row.targetDateVisible),
    matchRowsVisible: asBool(row.matchRowsVisible),
    explicitNoFixtureEvidence: row.explicitNoFixtureEvidence === true,
    wrongCompetition: asBool(row.wrongCompetition),
    wrongDate: asBool(row.wrongDate),
    homepageOnly: asBool(row.homepageOnly),
    newsOnly: asBool(row.newsOnly),
    videoOnly: asBool(row.videoOnly),
    standingsOnly: asBool(row.standingsOnly),
    excludedHost: asBool(row.excludedHost) || isExcludedHostValue(candidateUrl, sourceHost),
    isOfficialOrPrimary: asBool(row.isOfficialOrPrimary),
    isIndependentSecondSource: asBool(row.isIndependentSecondSource),
    isClubFallback: asBool(row.isClubFallback)
  };

  if (!isReviewedDecision(decision)) {
    if (candidateUrl || rowFlags.opened || rowFlags.sourceUsable) {
      warnings.push("row_has_candidate_data_but_reviewerDecision_is_not_reviewed");
    }

    return {
      reviewRowId: row.reviewRowId || "",
      leagueSlug: row.leagueSlug || "",
      name: row.name || "",
      targetDate: row.targetDate || "",
      discoveryTargetId: row.discoveryTargetId || "",
      kind: row.kind || "",
      reviewerDecision: decision,
      candidateUrl,
      sourceHost,
      accepted: false,
      pending: true,
      violations,
      warnings
    };
  }

  if (!candidateUrl) violations.push("candidateUrl_required_for_reviewed_decision");
  if (!rowFlags.opened) violations.push("opened_must_be_true_for_reviewed_decision");
  if (!rowFlags.sourceUsable) violations.push("sourceUsable_must_be_true_for_reviewed_decision");

  if (rowFlags.excludedHost) violations.push("excludedHost_must_be_false_for_reviewed_decision");
  if (rowFlags.homepageOnly) violations.push("homepageOnly_must_be_false_for_reviewed_decision");
  if (rowFlags.newsOnly) violations.push("newsOnly_must_be_false_for_reviewed_decision");
  if (rowFlags.videoOnly) violations.push("videoOnly_must_be_false_for_reviewed_decision");
  if (rowFlags.standingsOnly) violations.push("standingsOnly_must_be_false_for_reviewed_decision");
  if (rowFlags.wrongDate) violations.push("wrongDate_must_be_false_for_reviewed_decision");
  if (rowFlags.wrongCompetition) violations.push("wrongCompetition_must_be_false_for_reviewed_decision");

  if (isUsableDecision(decision)) {
    if (!rowFlags.targetDateVisible) violations.push("targetDateVisible_required_for_fixture_evidence");
    if (!rowFlags.matchRowsVisible) violations.push("matchRowsVisible_required_for_fixture_evidence");

    const fixtureRows = Array.isArray(row.fixtureRowsForTargetDate) ? row.fixtureRowsForTargetDate : [];
    if (fixtureRows.length === 0) violations.push("fixtureRowsForTargetDate_required_for_fixture_evidence");

    for (const [index, fixtureRow] of fixtureRows.entries()) {
      if (asText(fixtureRow.localDate) && asText(fixtureRow.localDate) !== asText(row.targetDate)) {
        violations.push(`fixtureRowsForTargetDate[${index}].localDate_must_match_targetDate`);
      }

      if (!asText(fixtureRow.homeTeam) || !asText(fixtureRow.awayTeam)) {
        violations.push(`fixtureRowsForTargetDate[${index}]_requires_homeTeam_and_awayTeam`);
      }

      if (!asText(fixtureRow.rawKickoffText) && !asText(fixtureRow.localTime) && !asText(fixtureRow.kickoffUtc)) {
        violations.push(`fixtureRowsForTargetDate[${index}]_requires_kickoff_signal`);
      }
    }
  }

  if (isExplicitNoFixtureDecision(decision)) {
    if (rowFlags.matchRowsVisible) violations.push("matchRowsVisible_must_be_false_for_explicit_no_fixture_evidence");
    if (!rowFlags.explicitNoFixtureEvidence) violations.push("explicitNoFixtureEvidence_must_be_true");
    if (!asText(row.evidenceTextSnippet)) violations.push("evidenceTextSnippet_required_for_explicit_no_fixture_evidence");
  }

  if (!rowFlags.isOfficialOrPrimary && !rowFlags.isIndependentSecondSource && !rowFlags.isClubFallback) {
    warnings.push("source_role_flags_all_false");
  }

  return {
    reviewRowId: row.reviewRowId || "",
    leagueSlug: row.leagueSlug || "",
    name: row.name || "",
    targetDate: row.targetDate || "",
    discoveryTargetId: row.discoveryTargetId || "",
    kind: row.kind || "",
    reviewerDecision: decision,
    candidateUrl,
    sourceHost,
    accepted: violations.length === 0,
    pending: false,
    sourceRole: rowFlags.isOfficialOrPrimary
      ? "official_or_primary"
      : rowFlags.isIndependentSecondSource
        ? "independent_second_source"
        : rowFlags.isClubFallback
          ? "club_fallback"
          : "unknown",
    evidenceType: isUsableDecision(decision)
      ? "fixture_rows"
      : isExplicitNoFixtureDecision(decision)
        ? "explicit_no_fixture"
        : "pending",
    violations,
    warnings
  };
}

function validateSheet(input, options = {}) {
  const reviewRows = Array.isArray(input.reviewRows) ? input.reviewRows : [];

  const rowResults = reviewRows.map(validateReviewRow);
  const acceptedRows = rowResults.filter((row) => row.accepted);
  const pendingRows = rowResults.filter((row) => row.pending);
  const rejectedRows = rowResults.filter((row) => !row.accepted && !row.pending);

  const acceptedOfficialRows = acceptedRows.filter((row) => row.sourceRole === "official_or_primary");
  const acceptedIndependentRows = acceptedRows.filter((row) => row.sourceRole === "independent_second_source");
  const acceptedClubFallbackRows = acceptedRows.filter((row) => row.sourceRole === "club_fallback");

  const byLeague = {};
  for (const row of rowResults) {
    if (!byLeague[row.leagueSlug]) {
      byLeague[row.leagueSlug] = {
        name: row.name,
        targetDate: row.targetDate,
        rowCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        pendingCount: 0,
        acceptedOfficialOrPrimaryCount: 0,
        acceptedIndependentCount: 0,
        acceptedClubFallbackCount: 0,
        validationState: "pending"
      };
    }

    const entry = byLeague[row.leagueSlug];
    entry.rowCount += 1;
    if (row.accepted) entry.acceptedCount += 1;
    if (row.pending) entry.pendingCount += 1;
    if (!row.accepted && !row.pending) entry.rejectedCount += 1;
    if (row.accepted && row.sourceRole === "official_or_primary") entry.acceptedOfficialOrPrimaryCount += 1;
    if (row.accepted && row.sourceRole === "independent_second_source") entry.acceptedIndependentCount += 1;
    if (row.accepted && row.sourceRole === "club_fallback") entry.acceptedClubFallbackCount += 1;
  }

  for (const entry of Object.values(byLeague)) {
    if (entry.acceptedOfficialOrPrimaryCount > 0 && entry.acceptedIndependentCount > 0) {
      entry.validationState = "has_official_and_independent_candidates";
    } else if (entry.acceptedOfficialOrPrimaryCount > 0) {
      entry.validationState = "has_official_candidate_only";
    } else if (entry.acceptedCount > 0) {
      entry.validationState = "has_candidate_but_missing_official";
    } else if (entry.rejectedCount > 0) {
      entry.validationState = "reviewed_but_no_accepted_candidates";
    } else {
      entry.validationState = "pending";
    }
  }

  return {
    ok: true,
    job: "validate-fixture-league-date-source-discovery-review-sheet-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_league_date_source_discovery_review_sheet_validation",
    sourceInput: options.input || "",
    summary: {
      reviewRowCount: reviewRows.length,
      acceptedRowCount: acceptedRows.length,
      rejectedRowCount: rejectedRows.length,
      pendingRowCount: pendingRows.length,
      acceptedOfficialOrPrimaryCount: acceptedOfficialRows.length,
      acceptedIndependentCount: acceptedIndependentRows.length,
      acceptedClubFallbackCount: acceptedClubFallbackRows.length,
      leagueCount: Object.keys(byLeague).length,
      leaguesWithOfficialAndIndependentCandidates: Object.values(byLeague).filter((entry) => entry.validationState === "has_official_and_independent_candidates").length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byLeague,
    acceptedRows,
    rejectedRows,
    pendingRowCount: pendingRows.length,
    rowResults,
    guarantees: {
      sourceFetch: false,
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
  const input = {
    reviewRows: [
      {
        reviewRowId: "gre.1:ok-official",
        leagueSlug: "gre.1",
        name: "Super League Greece",
        targetDate: "2026-05-22",
        discoveryTargetId: "gre.1:discovery:01",
        kind: "official_league_calendar",
        candidateUrl: "https://www.slgr.gr/el/schedule/2026-05-22",
        opened: true,
        sourceUsable: true,
        isOfficialOrPrimary: true,
        targetDateVisible: true,
        matchRowsVisible: true,
        fixtureRowsForTargetDate: [
          {
            homeTeam: "AEK Athens",
            awayTeam: "Olympiacos",
            localDate: "2026-05-22",
            localTime: "19:00",
            rawKickoffText: "22.05.2026 19:00"
          }
        ],
        reviewerDecision: "usable_official_fixture_evidence"
      },
      {
        reviewRowId: "gre.1:bad-homepage",
        leagueSlug: "gre.1",
        name: "Super League Greece",
        targetDate: "2026-05-22",
        discoveryTargetId: "gre.1:discovery:02",
        kind: "official_league_calendar",
        candidateUrl: "https://www.slgr.gr/",
        opened: true,
        sourceUsable: true,
        isOfficialOrPrimary: true,
        targetDateVisible: true,
        matchRowsVisible: true,
        homepageOnly: true,
        fixtureRowsForTargetDate: [
          {
            homeTeam: "AEK Athens",
            awayTeam: "Olympiacos",
            localDate: "2026-05-22",
            localTime: "19:00"
          }
        ],
        reviewerDecision: "usable_official_fixture_evidence"
      },
      {
        reviewRowId: "gre.1:pending",
        leagueSlug: "gre.1",
        name: "Super League Greece",
        targetDate: "2026-05-22",
        discoveryTargetId: "gre.1:discovery:03",
        kind: "club_calendar_fallback",
        reviewerDecision: "pending_review"
      }
    ]
  };

  const report = validateSheet(input, { input: "self-test" });

  if (report.summary.acceptedRowCount !== 1) {
    throw new Error(`self-test failed: expected 1 accepted row, got ${report.summary.acceptedRowCount}`);
  }

  if (report.summary.rejectedRowCount !== 1) {
    throw new Error(`self-test failed: expected 1 rejected row, got ${report.summary.rejectedRowCount}`);
  }

  if (report.summary.pendingRowCount !== 1) {
    throw new Error(`self-test failed: expected 1 pending row, got ${report.summary.pendingRowCount}`);
  }

  const rejected = report.rejectedRows[0];
  if (!rejected.violations.includes("homepageOnly_must_be_false_for_reviewed_decision")) {
    throw new Error("self-test failed: homepage violation missing");
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
      selfTest: "validate-fixture-league-date-source-discovery-review-sheet-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = validateSheet(input, {
    input: args.input
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
    job: "validate-fixture-league-date-source-discovery-review-sheet-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
