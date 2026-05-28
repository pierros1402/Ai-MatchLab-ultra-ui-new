#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = argv[++i];
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = argv[++i];
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function selectRankedCandidateRows(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.rankedCandidateUrlRows)) return input.rankedCandidateUrlRows;
  if (Array.isArray(input?.candidateUrlRows)) return input.candidateUrlRows;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input?.items)) return input.items;
  return [];
}

function reviewRowFromRankedCandidate(row, index) {
  const truthRole = asText(row.truthRole);
  const isPrimary = truthRole === "primary_candidate_after_fetch_evidence";
  const dayKey = asText(row.dayKey || row.targetDate);
  const leagueSlug = asText(row.leagueSlug);
  const paddedIndex = String(index + 1).padStart(3, "0");

  return {
    reviewRowId: asText(row.reviewRowId || row.searchTargetId || `ranked-candidate:${dayKey}:${leagueSlug}:${paddedIndex}`),
    caseId: asText(row.caseId || `${leagueSlug}:${dayKey}:autonomous-ranked-source-candidate`),
    leagueSlug,
    name: asText(row.name),
    targetDate: dayKey,
    discoveryTargetId: asText(row.discoveryTargetId || row.searchTargetId),
    kind: asText(row.expectedSourceFamily || row.sourceClass || "autonomous_ranked_source_candidate"),
    isOfficialOrPrimary: isPrimary,
    isIndependentSecondSource: false,
    isClubFallback: false,
    query: asText(row.query || row.searchQuery),
    candidateUrl: asText(row.candidateUrl || row.resolvedUrl || row.url),
    candidateTitle: asText(row.title || row.sourceTitle || row.expectedSourceFamily),
    candidateKind: asText(row.expectedSourceFamily || row.sourceClass || "autonomous_ranked_source_candidate"),
    sourceClass: asText(row.sourceClass),
    truthRole,
    sourceRank: Number.isFinite(Number(row.sourceRank || row.rank)) ? Number(row.sourceRank || row.rank) : null,
    compositeScore: Number.isFinite(Number(row.compositeScore)) ? Number(row.compositeScore) : null,
    reviewerDecision: isPrimary ? "candidate_official_url_pending_fetch" : "ranked_candidate_not_primary_truth_role",
    reviewerNotes: isPrimary
      ? "Autonomous ranked source policy marked this URL as primary candidate after fetch evidence. Fetch snapshot only; do not promote."
      : "Autonomous ranked source policy did not mark this URL as primary truth candidate; keep out of fetch rows.",
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(input, options = {}) {
  const rankedCandidateRows = selectRankedCandidateRows(input);
  const reviewRows = rankedCandidateRows.map(reviewRowFromRankedCandidate);

  const primaryCandidateCount = reviewRows.filter((row) => row.truthRole === "primary_candidate_after_fetch_evidence").length;
  const supplementalOnlyCount = reviewRows.filter((row) => row.truthRole === "supplemental_crosscheck_only").length;
  const notTruthReadyCount = reviewRows.filter((row) => row.truthRole === "not_truth_ready").length;
  const missingUrlCount = reviewRows.filter((row) => !row.candidateUrl).length;

  const byLeague = {};
  for (const row of reviewRows) {
    if (!byLeague[row.leagueSlug]) {
      byLeague[row.leagueSlug] = {
        name: row.name,
        dayKey: row.targetDate,
        reviewRowCount: 0,
        primaryCandidateCount: 0,
        supplementalOnlyCount: 0,
        notTruthReadyCount: 0
      };
    }

    byLeague[row.leagueSlug].reviewRowCount += 1;
    if (row.truthRole === "primary_candidate_after_fetch_evidence") byLeague[row.leagueSlug].primaryCandidateCount += 1;
    if (row.truthRole === "supplemental_crosscheck_only") byLeague[row.leagueSlug].supplementalOnlyCount += 1;
    if (row.truthRole === "not_truth_ready") byLeague[row.leagueSlug].notTruthReadyCount += 1;
  }

  return {
    ok: true,
    job: "materialize-fixture-league-date-ranked-candidates-review-rows-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_ranked_candidates_to_review_rows",
    sourceInput: options.input || "",
    summary: {
      rankedCandidateRowCount: rankedCandidateRows.length,
      reviewRowCount: reviewRows.length,
      primaryCandidateCount,
      supplementalOnlyCount,
      notTruthReadyCount,
      missingUrlCount,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byLeague,
    reviewRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const report = buildReport({
    rankedCandidateUrlRows: [
      {
        searchTargetId: "2026-05-28:eng.1:official_league_fixture_calendar:competition_operator:0",
        leagueSlug: "eng.1",
        name: "Premier League",
        dayKey: "2026-05-28",
        query: "Premier League official fixtures schedule 2026-05-28",
        candidateUrl: "https://www.premierleague.com/fixtures",
        hostname: "premierleague.com",
        sourceClass: "official_governing_or_competition_operator",
        truthRole: "primary_candidate_after_fetch_evidence",
        expectedSourceFamily: "competition_operator",
        compositeScore: 100
      },
      {
        searchTargetId: "2026-05-28:eng.1:official_league_fixture_calendar:competition_operator:0",
        leagueSlug: "eng.1",
        name: "Premier League",
        dayKey: "2026-05-28",
        query: "Premier League official fixtures schedule 2026-05-28",
        candidateUrl: "https://www.espn.com/soccer/fixtures/_/league/eng.1",
        hostname: "espn.com",
        sourceClass: "supplemental_scoreboard_or_media",
        truthRole: "supplemental_crosscheck_only",
        expectedSourceFamily: "official_league",
        compositeScore: 60
      }
    ]
  }, { input: "self-test" });

  if (report.summary.rankedCandidateRowCount !== 2) throw new Error("expected 2 ranked rows");
  if (report.summary.reviewRowCount !== 2) throw new Error("expected 2 review rows");
  if (report.summary.primaryCandidateCount !== 1) throw new Error("expected 1 primary candidate");
  if (report.summary.supplementalOnlyCount !== 1) throw new Error("expected 1 supplemental row");

  const primary = report.reviewRows.find((row) => row.truthRole === "primary_candidate_after_fetch_evidence");
  const supplemental = report.reviewRows.find((row) => row.truthRole === "supplemental_crosscheck_only");

  if (!primary) throw new Error("missing primary review row");
  if (!supplemental) throw new Error("missing supplemental review row");

  if (primary.reviewerDecision !== "candidate_official_url_pending_fetch") {
    throw new Error("primary row must be pending fetch");
  }

  if (supplemental.reviewerDecision === "candidate_official_url_pending_fetch") {
    throw new Error("supplemental row must not be pending fetch");
  }

  if (report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("safety guarantees missing");
  }

  return report;
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required unless --self-test is used");
  if (!args.output) throw new Error("--output is required unless --self-test is used");

  const input = readJson(args.input);
  const report = buildReport(input, { input: args.input });
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
