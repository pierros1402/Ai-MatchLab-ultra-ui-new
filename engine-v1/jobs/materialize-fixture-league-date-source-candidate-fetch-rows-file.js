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

function readJson(filePath, label) {
  if (!filePath) throw new Error(`missing --${label}`);
  if (!fs.existsSync(filePath)) throw new Error(`missing ${label} file: ${filePath}`);
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

function normalizeUrl(value) {
  const raw = asText(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isExcludedHost(url) {
  const joined = `${asText(url)} ${hostFromUrl(url)}`.toLowerCase();
  return /(^|\.)betexplorer\.com|flashscore\.|(^|\.)soccerway\.com|(^|\.)aiscore\.com|(^|\.)sofascore\.com/.test(joined);
}

function decisionLooksLikeCandidate(value) {
  const decision = asText(value).toLowerCase();
  return [
    "candidate_official_url_pending_fetch",
    "candidate_independent_url_pending_fetch",
    "candidate_club_url_pending_fetch"
  ].includes(decision);
}

function sourceTypeForRow(row) {
  if (row.isOfficialOrPrimary === true) return "official_or_primary_fixture_candidate";
  if (row.isIndependentSecondSource === true) return "independent_second_source_fixture_candidate";
  if (row.isClubFallback === true) return "club_fallback_fixture_candidate";
  return asText(row.candidateKind || row.kind || "fixture_source_candidate");
}

function buildReadyRow(row, index) {
  const candidateUrl = normalizeUrl(row.candidateUrl || row.resolvedUrl || row.url);
  const dayKey = asText(row.targetDate || row.dayKey);
  const leagueSlug = asText(row.leagueSlug);
  const sequence = String(index + 1).padStart(3, "0");

  return {
    taskId: `fixture_league_date_source_candidate_fetch:${dayKey}:${leagueSlug}:${sequence}`,
    sourceReviewRowId: asText(row.reviewRowId),
    sourceCaseId: asText(row.caseId),
    discoveryTargetId: asText(row.discoveryTargetId),
    leagueSlug,
    name: asText(row.name),
    country: asText(row.country),
    dayKey,
    searchQuery: asText(row.query || row.searchQuery),
    candidateUrl,
    resolvedUrl: candidateUrl,
    sourceType: sourceTypeForRow(row),
    sourceTitle: asText(row.candidateTitle || row.sourceTitle),
    candidateKind: asText(row.candidateKind || row.kind),
    sourceClass: asText(row.sourceClass),
    truthRole: asText(row.truthRole),
    reviewerDecision: asText(row.reviewerDecision),
    reviewerNotes: asText(row.reviewerNotes),
    sourceRank: row.sourceRank ?? null,
    compositeScore: row.compositeScore ?? null,
    isOfficialOrPrimary: row.isOfficialOrPrimary === true,
    isIndependentSecondSource: row.isIndependentSecondSource === true,
    isClubFallback: row.isClubFallback === true,
    externallyActive: row.externallyActive ?? null,
    fixtureCountFound: row.fixtureCountFound ?? null,
    missingFromSnapshot: row.missingFromSnapshot ?? null,
    validationState: "valid_source_url_resolution",
    readyForFetch: true,
    fetchPurpose: "fixture_league_date_candidate_url_snapshot",
    fetchNotes: asText(row.reviewerNotes || "Candidate URL only. Fetch snapshot for later evidence extraction; do not mark as usable here."),
    canonicalWrites: 0,
    productionWrite: false
  };
}

function materializeFetchRows(input, options = {}) {
  const reviewRows = Array.isArray(input.reviewRows) ? input.reviewRows : [];

  const candidateRows = [];
  const rejectedRows = [];

  for (const row of reviewRows) {
    const candidateUrl = normalizeUrl(row.candidateUrl);
    const decision = asText(row.reviewerDecision);

    if (!candidateUrl && !decisionLooksLikeCandidate(decision)) {
      continue;
    }

    const rejectionReasons = [];

    if (!candidateUrl) rejectionReasons.push("missing_or_invalid_candidateUrl");
    if (!decisionLooksLikeCandidate(decision)) rejectionReasons.push("reviewerDecision_not_candidate_pending_fetch");
    if (isExcludedHost(candidateUrl) || row.excludedHost === true) rejectionReasons.push("excluded_host");
    if (row.wrongDate === true) rejectionReasons.push("wrongDate_true");
    if (row.wrongCompetition === true) rejectionReasons.push("wrongCompetition_true");

    if (rejectionReasons.length > 0) {
      rejectedRows.push({
        reviewRowId: asText(row.reviewRowId),
        leagueSlug: asText(row.leagueSlug),
        name: asText(row.name),
        targetDate: asText(row.targetDate),
        discoveryTargetId: asText(row.discoveryTargetId),
        candidateUrl: asText(row.candidateUrl),
        reviewerDecision: decision,
        rejectionReasons,
        canonicalWrites: 0,
        productionWrite: false
      });
      continue;
    }

    candidateRows.push(row);
  }

  const readyForFetchRows = candidateRows.map(buildReadyRow);

  const byLeague = {};
  for (const row of readyForFetchRows) {
    if (!byLeague[row.leagueSlug]) {
      byLeague[row.leagueSlug] = {
        name: row.name,
        dayKey: row.dayKey,
        readyForFetchCount: 0
      };
    }
    byLeague[row.leagueSlug].readyForFetchCount += 1;
  }

  return {
    ok: true,
    job: "materialize-fixture-league-date-source-candidate-fetch-rows-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_league_date_candidate_fetch_rows",
    sourceInput: options.input || "",
    summary: {
      inputReviewRowCount: reviewRows.length,
      candidatePendingFetchRowCount: candidateRows.length + rejectedRows.length,
      readyForFetchCount: readyForFetchRows.length,
      rejectedCandidateRowCount: rejectedRows.length,
      leagueCount: Object.keys(byLeague).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byLeague,
    readyForFetchRows,
    rejectedRows,
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
        reviewRowId: "gre.1:2026-05-22:source-discovery:target:01",
        caseId: "gre.1:2026-05-22:source-discovery",
        leagueSlug: "gre.1",
        name: "Super League Greece",
        targetDate: "2026-05-22",
        discoveryTargetId: "gre.1:discovery:01",
        kind: "official_league_calendar",
        isOfficialOrPrimary: true,
        query: "site:slgr.gr Super League Greece fixtures 2026-05-22",
        candidateUrl: "https://www.slgr.gr/en/schedule/",
        candidateTitle: "Schedule - Super League Greece",
        candidateKind: "official_league",
        sourceClass: "official_governing_or_competition_operator",
        truthRole: "primary_candidate_after_fetch_evidence",
        sourceRank: 1,
        compositeScore: 100,
        reviewerDecision: "candidate_official_url_pending_fetch",
        reviewerNotes: "Fetch snapshot only; do not promote.",
        isOfficialOrPrimary: true,
        isIndependentSecondSource: false,
        isClubFallback: false
      },
      {
        reviewRowId: "bad:excluded",
        leagueSlug: "bad.1",
        name: "Bad League",
        targetDate: "2026-05-22",
        discoveryTargetId: "bad.1:discovery:01",
        candidateUrl: "https://www.betexplorer.com/soccer/",
        reviewerDecision: "candidate_official_url_pending_fetch"
      },
      {
        reviewRowId: "pending:no-url",
        leagueSlug: "pending.1",
        name: "Pending League",
        targetDate: "2026-05-22",
        reviewerDecision: "pending_review"
      }
    ]
  };

  const report = materializeFetchRows(input, { input: "self-test" });

  if (report.summary.inputReviewRowCount !== 3) {
    throw new Error(`self-test failed: expected 3 input rows, got ${report.summary.inputReviewRowCount}`);
  }

  if (report.summary.readyForFetchCount !== 1) {
    throw new Error(`self-test failed: expected 1 ready row, got ${report.summary.readyForFetchCount}`);
  }

  if (report.summary.rejectedCandidateRowCount !== 1) {
    throw new Error(`self-test failed: expected 1 rejected candidate, got ${report.summary.rejectedCandidateRowCount}`);
  }

  const ready = report.readyForFetchRows[0];
  if (ready.resolvedUrl !== "https://www.slgr.gr/en/schedule/") {
    throw new Error(`self-test failed: wrong resolvedUrl ${ready.resolvedUrl}`);
  }

  if (ready.readyForFetch !== true || ready.validationState !== "valid_source_url_resolution") {
    throw new Error("self-test failed: ready row is not fetch-compatible");
  }

  if (ready.candidateUrl !== "https://www.slgr.gr/en/schedule/") {
    throw new Error(`self-test failed: candidateUrl was not preserved: ${ready.candidateUrl}`);
  }

  if (ready.truthRole !== "primary_candidate_after_fetch_evidence") {
    throw new Error(`self-test failed: truthRole was not preserved: ${ready.truthRole}`);
  }

  if (ready.sourceClass !== "official_governing_or_competition_operator") {
    throw new Error(`self-test failed: sourceClass was not preserved: ${ready.sourceClass}`);
  }

  if (ready.reviewerDecision !== "candidate_official_url_pending_fetch") {
    throw new Error(`self-test failed: reviewerDecision was not preserved: ${ready.reviewerDecision}`);
  }

  if (ready.compositeScore !== 100 || ready.sourceRank !== 1) {
    throw new Error("self-test failed: ranking score metadata was not preserved");
  }

  if (ready.isOfficialOrPrimary !== true || ready.isIndependentSecondSource !== false || ready.isClubFallback !== false) {
    throw new Error("self-test failed: source role booleans were not preserved");
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
      selfTest: "materialize-fixture-league-date-source-candidate-fetch-rows-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const report = materializeFetchRows(input, {
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
    job: "materialize-fixture-league-date-source-candidate-fetch-rows-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
