#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_LINK_PLAN =
  "data/football-truth/_diagnostics/standing-provider-snapshot-linking-plan-2026-06-13/standing-provider-snapshot-linking-plan-2026-06-13.json";

const TEAM_TABLE_MARKERS = [
  "team",
  "club",
  "played",
  "matches",
  "points",
  "pts",
  "won",
  "draw",
  "drawn",
  "lost",
  "goals",
  "goal difference",
  "gd",
  "position",
  "rank",
  "standings",
  "table"
];

const LOW_VALUE_CONTEXT_MARKERS = [
  "privacy policy",
  "cookie",
  "terms of use",
  "404",
  "not found",
  "access denied",
  "javascript is disabled",
  "enable javascript",
  "login",
  "sign in",
  "subscribe",
  "advertisement"
];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    linkPlan: DEFAULT_LINK_PLAN,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--link-plan") args.linkPlan = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `standing-snapshot-candidate-validator-${args.date}`,
      `standing-snapshot-candidate-validator-${args.date}.json`
    );
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function markerHits(context, markers) {
  const text = normalize(context);
  return markers.filter((marker) => text.includes(marker));
}

function scoreCandidate(candidate, expectedProviders) {
  const context = normalize(candidate.context || "");
  const sourceUrl = normalize(candidate.sourceUrl || "");
  const contentType = normalize(candidate.contentType || "");
  const rawTextLength = Number(candidate.rawTextLength || 0);
  const plainTextLength = Number(candidate.plainTextLength || 0);

  const providerUrlHit = expectedProviders.some((provider) => sourceUrl.includes(normalize(provider)));
  const providerContextHit = expectedProviders.some((provider) => context.includes(normalize(provider)));

  const tableHits = markerHits(context, TEAM_TABLE_MARKERS);
  const lowValueHits = markerHits(context, LOW_VALUE_CONTEXT_MARKERS);

  let score = 0;

  if (providerUrlHit) score += 80;
  if (providerContextHit) score += 20;
  if (contentType.includes("json")) score += 25;
  if (contentType.includes("html") || contentType.includes("text")) score += 10;
  if (rawTextLength > 500 || plainTextLength > 500 || context.length > 500) score += 30;
  if (rawTextLength > 5000 || plainTextLength > 5000) score += 20;

  score += Math.min(tableHits.length, 8) * 12;
  score -= lowValueHits.length * 25;

  if (!sourceUrl) score -= 40;
  if (context.length < 120) score -= 30;

  return {
    score,
    providerUrlHit,
    providerContextHit,
    tableMarkerHitCount: tableHits.length,
    tableMarkerHits: tableHits,
    lowValueMarkerHitCount: lowValueHits.length,
    lowValueMarkerHits: lowValueHits,
    contextLength: context.length
  };
}

function inferValidationStatus(scoredCandidates) {
  const best = scoredCandidates[0];

  if (!best) {
    return {
      validationStatus: "no_candidate_to_validate",
      validationLane: "blocked",
      nextAction: "prepare_scoped_fetch_input_if_user_approves_fetch",
      blockedReason: "no_strict_snapshot_candidate"
    };
  }

  if (
    best.validationScore >= 130 &&
    best.providerUrlHit &&
    best.tableMarkerHitCount >= 4 &&
    best.lowValueMarkerHitCount === 0
  ) {
    return {
      validationStatus: "strong_candidate_for_final_evidence_review",
      validationLane: "candidate_final_evidence_review",
      nextAction: "build_final_standing_evidence_review_for_best_snapshot_candidate",
      blockedReason: ""
    };
  }

  if (
    best.validationScore >= 90 &&
    (best.providerUrlHit || best.providerContextHit) &&
    best.tableMarkerHitCount >= 3
  ) {
    return {
      validationStatus: "moderate_candidate_needs_manual_snapshot_review",
      validationLane: "manual_snapshot_review",
      nextAction: "inspect_best_snapshot_candidate_before_final_evidence_review",
      blockedReason: ""
    };
  }

  return {
    validationStatus: "weak_snapshot_candidate",
    validationLane: "blocked",
    nextAction: "prepare_scoped_fetch_input_or_find_better_snapshot",
    blockedReason: "best_snapshot_candidate_does_not_meet_standing_evidence_threshold"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const linkPlan = readJson(args.linkPlan);

  if (!Array.isArray(linkPlan.linkRows)) throw new Error("Expected linkPlan.linkRows array.");

  const sourceRows = linkPlan.linkRows.filter((row) =>
    row &&
    row.snapshotLinkStatus === "strict_provider_standing_snapshot_candidate_found" &&
    Array.isArray(row.strictSnapshotCandidates)
  );

  const validationRows = sourceRows.map((row) => {
    const expectedProviders = Array.isArray(row.expectedOfficialProviders)
      ? row.expectedOfficialProviders
      : [];

    const scoredCandidates = row.strictSnapshotCandidates.map((candidate) => {
      const score = scoreCandidate(candidate, expectedProviders);

      return {
        filePath: candidate.filePath,
        pointer: candidate.pointer,
        sourceUrl: candidate.sourceUrl || "",
        status: candidate.status ?? null,
        contentType: candidate.contentType || "",
        rawTextLength: candidate.rawTextLength || null,
        plainTextLength: candidate.plainTextLength || null,
        validationScore: score.score,
        providerUrlHit: score.providerUrlHit,
        providerContextHit: score.providerContextHit,
        tableMarkerHitCount: score.tableMarkerHitCount,
        tableMarkerHits: score.tableMarkerHits,
        lowValueMarkerHitCount: score.lowValueMarkerHitCount,
        lowValueMarkerHits: score.lowValueMarkerHits,
        contextLength: score.contextLength,
        context: candidate.context || ""
      };
    }).sort((a, b) => {
      if (b.validationScore !== a.validationScore) return b.validationScore - a.validationScore;
      return String(a.filePath).localeCompare(String(b.filePath));
    });

    const inferred = inferValidationStatus(scoredCandidates);

    return {
      competitionSlug: row.competitionSlug,
      expectedOfficialProviders: expectedProviders,
      canonicalStandingRows: row.canonicalStandingRows,
      canonicalFixtureRows: row.canonicalFixtureRows,
      strictSnapshotCandidateCount: row.strictSnapshotCandidateCount,
      evaluatedCandidateCount: scoredCandidates.length,
      bestValidationScore: scoredCandidates[0]?.validationScore ?? 0,
      validationStatus: inferred.validationStatus,
      validationLane: inferred.validationLane,
      nextAction: inferred.nextAction,
      blockedReason: inferred.blockedReason,
      canonicalWriteEligibleNow: false,
      sourceFetch: false,
      searchProviderUsed: false,
      bestCandidates: scoredCandidates.slice(0, 5)
    };
  }).sort((a, b) => {
    const laneRank = {
      candidate_final_evidence_review: 0,
      manual_snapshot_review: 1,
      blocked: 2
    };

    if (laneRank[a.validationLane] !== laneRank[b.validationLane]) {
      return laneRank[a.validationLane] - laneRank[b.validationLane];
    }

    if (b.bestValidationScore !== a.bestValidationScore) return b.bestValidationScore - a.bestValidationScore;
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-standing-snapshot-candidate-validator-file",
    mode: "source_only_strict_snapshot_candidate_validator_no_search_no_fetch_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      linkPlan: args.linkPlan,
      sourceStrictLinkRowCount: sourceRows.length
    },
    summary: {
      sourceStrictLinkRowCount: sourceRows.length,
      validationRowCount: validationRows.length,
      strongCandidateForFinalEvidenceReviewCount: validationRows.filter((row) => row.validationStatus === "strong_candidate_for_final_evidence_review").length,
      moderateCandidateNeedsManualSnapshotReviewCount: validationRows.filter((row) => row.validationStatus === "moderate_candidate_needs_manual_snapshot_review").length,
      weakSnapshotCandidateCount: validationRows.filter((row) => row.validationStatus === "weak_snapshot_candidate").length,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane:
        validationRows.some((row) => row.validationStatus === "strong_candidate_for_final_evidence_review")
          ? "build_final_standing_evidence_review_for_strong_candidates"
          : "manual_snapshot_review_or_scoped_fetch_required"
    },
    counts: {
      byValidationStatus: countBy(validationRows, "validationStatus"),
      byValidationLane: countBy(validationRows, "validationLane"),
      byBlockedReason: countBy(validationRows.filter((row) => row.blockedReason), "blockedReason")
    },
    guardrails: [
      "This validator reduces strict snapshot candidates; it does not declare truth.",
      "Best candidate score is not canonical eligibility.",
      "canonicalWriteEligibleNow remains false for every row.",
      "No search, fetch, canonical write, or production write is performed."
    ],
    validationRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    sourceStrictLinkRowCount: output.summary.sourceStrictLinkRowCount,
    validationRowCount: output.summary.validationRowCount,
    strongCandidateForFinalEvidenceReviewCount: output.summary.strongCandidateForFinalEvidenceReviewCount,
    moderateCandidateNeedsManualSnapshotReviewCount: output.summary.moderateCandidateNeedsManualSnapshotReviewCount,
    weakSnapshotCandidateCount: output.summary.weakSnapshotCandidateCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();
