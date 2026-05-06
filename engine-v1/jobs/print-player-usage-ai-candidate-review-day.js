import path from "path";
import { fileURLToPath } from "url";
import { buildPlayerUsageAiCandidateReviewDay } from "./build-player-usage-ai-candidate-review-day.js";

function clean(value) {
  return String(value || "").trim();
}

function parseArgs(argv) {
  const args = {
    dayKey: null,
    status: null,
    limit: 50,
    json: false
  };

  for (const arg of argv) {
    if (arg === "--json") {
      args.json = true;
      continue;
    }

    if (arg.startsWith("--status=")) {
      args.status = clean(arg.slice("--status=".length)) || null;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      args.limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : args.limit;
      continue;
    }

    if (!args.dayKey) {
      args.dayKey = clean(arg);
    }
  }

  return args;
}

function compactRow(row) {
  return {
    key: row.key || null,
    team: row.team || null,
    leagueSlug: row.leagueSlug || null,
    status: row.status || null,
    promotable: row.promotable === true,
    reviewRequired: row.reviewRequired === true,
    reviewed: row.reviewed === true,
    productionGrade: row.productionGrade === true,
    validationStatus: row.validationStatus || null,
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    matchCount: typeof row.matchCount === "number" ? row.matchCount : null,
    playerCount: typeof row.playerCount === "number" ? row.playerCount : null,
    reason: row.reason || row.validationReason || null,
    file: row.file || null
  };
}

function groupCounts(results) {
  const counts = {};

  for (const row of results) {
    const key = row.status || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
}

export async function printPlayerUsageAiCandidateReviewDay(dayKey, options = {}) {
  const safeDayKey = clean(dayKey);

  if (!safeDayKey) {
    throw new Error("printPlayerUsageAiCandidateReviewDay: missing dayKey");
  }

  const statusFilter = clean(options.status) || null;
  const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
    ? Math.floor(Number(options.limit))
    : 50;

  const review = await buildPlayerUsageAiCandidateReviewDay(safeDayKey);

  const allRows = Array.isArray(review.results) ? review.results.map(compactRow) : [];
  const filteredRows = statusFilter
    ? allRows.filter(row => row.status === statusFilter)
    : allRows;

  const output = {
    ok: true,
    dayKey: safeDayKey,
    file: review.file,
    candidateCount: review.candidateCount ?? allRows.length,
    needsReviewCount: review.needsReviewCount ?? 0,
    approvedReadyForPromotionCount: review.approvedReadyForPromotionCount ?? 0,
    promotableCount: review.promotableCount ?? 0,
    reviewRequiredCount: review.reviewRequiredCount ?? 0,
    invalidCandidateCount: review.invalidCandidateCount ?? 0,
    notInWorksetCount: review.notInWorksetCount ?? 0,
    alreadyHasManualSeedCount: review.alreadyHasManualSeedCount ?? 0,
    statusCounts: groupCounts(allRows),
    statusFilter,
    shownCount: Math.min(filteredRows.length, limit),
    totalMatchingCount: filteredRows.length,
    rows: filteredRows.slice(0, limit)
  };

  return output;
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = parseArgs(process.argv.slice(2));

  printPlayerUsageAiCandidateReviewDay(args.dayKey, args)
    .then(result => {
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log("[player-usage-ai-candidate-review-report]", {
        ok: result.ok,
        dayKey: result.dayKey,
        candidateCount: result.candidateCount,
        needsReviewCount: result.needsReviewCount,
        approvedReadyForPromotionCount: result.approvedReadyForPromotionCount,
        promotableCount: result.promotableCount,
        reviewRequiredCount: result.reviewRequiredCount,
        invalidCandidateCount: result.invalidCandidateCount,
        notInWorksetCount: result.notInWorksetCount,
        alreadyHasManualSeedCount: result.alreadyHasManualSeedCount,
        file: result.file
      });

      if (!result.rows.length) {
        console.log("[player-usage-ai-candidate-review-report] no rows");
        return;
      }

      for (const row of result.rows) {
        console.log(JSON.stringify(row));
      }
    })
    .catch(err => {
      console.error("[player-usage-ai-candidate-review-report] fatal", err);
      process.exit(1);
    });
}
