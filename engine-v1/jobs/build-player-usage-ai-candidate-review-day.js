import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { normalizePlayerUsageTeamKey } from "../storage/player-usage-db.js";
import { validatePlayerUsageResearchResult } from "../ai-match-intelligence/player-usage/player-usage-validator.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function clean(value) {
  return String(value || "").trim();
}

function readJsonLoose(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (err) {
    return {
      __readError: err.message
    };
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function candidatesDir(dayKey) {
  return resolveDataPath("player-usage", "_ai-candidates", dayKey);
}

function worksetPath(dayKey) {
  return resolveDataPath("player-usage", "_workset", `${dayKey}.json`);
}

function reviewAuditPath(dayKey) {
  return resolveDataPath("player-usage", "_ai-candidate-review", `${dayKey}.json`);
}

function manualResultsDir(dayKey) {
  return path.resolve(
    MODULE_DIR,
    "..",
    "seeds",
    "player-usage",
    "manual-results",
    dayKey
  );
}

function buildWorksetIndex(workset) {
  const index = new Map();

  for (const teamRow of Array.isArray(workset?.teams) ? workset.teams : []) {
    const keys = [
      teamRow?.key,
      teamRow?.team
    ]
      .map(clean)
      .filter(Boolean)
      .map(normalizePlayerUsageTeamKey)
      .filter(Boolean);

    for (const key of keys) {
      index.set(key, teamRow);
    }
  }

  return index;
}

function existingManualSeedKeys(dayKey) {
  const dir = manualResultsDir(dayKey);

  if (!fs.existsSync(dir)) return new Set();

  return new Set(
    fs.readdirSync(dir)
      .filter(file => file.endsWith(".json"))
      .map(file => normalizePlayerUsageTeamKey(path.basename(file, ".json")))
      .filter(Boolean)
  );
}

function listCandidateFiles(dayKey) {
  const dir = candidatesDir(dayKey);

  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(file => file.endsWith(".json"))
    .sort()
    .map(file => path.join(dir, file));
}

function candidateKey(filePath, candidate) {
  return normalizePlayerUsageTeamKey(
    candidate?.key ||
    candidate?.team ||
    path.basename(filePath, ".json")
  );
}

function candidateFlag(candidate, flagName) {
  return candidate?.[flagName] === true || candidate?.meta?.[flagName] === true;
}

function candidateReviewRow(filePath, candidate, context) {
  const key = candidateKey(filePath, candidate);

  if (candidate?.__readError) {
    return {
      key,
      team: null,
      file: filePath,
      status: "invalid_json",
      ok: false,
      promotable: false,
      reviewRequired: false,
      reason: candidate.__readError
    };
  }

  if (!key) {
    return {
      key: null,
      team: candidate?.team || null,
      file: filePath,
      status: "missing_team_key",
      ok: false,
      promotable: false,
      reviewRequired: false,
      reason: "candidate has no key/team"
    };
  }

  const teamRow = context.worksetIndex.get(key);

  if (!teamRow) {
    return {
      key,
      team: candidate?.team || null,
      file: filePath,
      status: "not_in_workset",
      ok: false,
      promotable: false,
      reviewRequired: false,
      reason: "candidate team is not in the day workset"
    };
  }

  if (context.manualSeedKeys.has(key)) {
    return {
      key,
      team: candidate?.team || teamRow.team || null,
      leagueSlug: candidate?.leagueSlug || teamRow.leagueSlug || null,
      file: filePath,
      status: "already_has_manual_seed",
      ok: true,
      promotable: false,
      reviewRequired: false,
      reason: "manual seed already exists for this team/day"
    };
  }

  const isCandidateOnly = candidateFlag(candidate, "candidateOnly");
  const reviewed = candidateFlag(candidate, "reviewed");
  const productionGrade = candidateFlag(candidate, "productionGrade");
  const requiresManualReview = candidate?.requiresManualReview === true || candidate?.meta?.requiresManualReview === true;

  if (!isCandidateOnly) {
    return {
      key,
      team: candidate?.team || teamRow.team || null,
      leagueSlug: candidate?.leagueSlug || teamRow.leagueSlug || null,
      file: filePath,
      status: "not_candidate_only",
      ok: false,
      promotable: false,
      reviewRequired: true,
      reviewed,
      productionGrade,
      requiresManualReview,
      reason: "AI review queue accepts only candidateOnly:true records"
    };
  }

  const validation = validatePlayerUsageResearchResult(candidate, {
    key,
    team: teamRow.team || candidate.team || null,
    leagueSlug: teamRow.leagueSlug || candidate.leagueSlug || null
  });

  const validationAccepted = ["valid_usage", "partial_usage"].includes(validation.status);
  const approved = reviewed === true && productionGrade === true;

  if (!validationAccepted) {
    return {
      key,
      team: candidate?.team || teamRow.team || null,
      leagueSlug: candidate?.leagueSlug || teamRow.leagueSlug || null,
      file: filePath,
      status: "invalid_candidate",
      ok: false,
      promotable: false,
      reviewRequired: true,
      reviewed,
      productionGrade,
      requiresManualReview,
      validationStatus: validation.status,
      validationReason: validation.reason,
      confidence: validation.confidence,
      matchCount: validation.matchCount,
      playerCount: validation.playerCount,
      issues: validation.issues || [],
      reason: "candidate does not pass player-usage validator"
    };
  }

  if (approved) {
    return {
      key,
      team: candidate?.team || teamRow.team || null,
      leagueSlug: candidate?.leagueSlug || teamRow.leagueSlug || null,
      file: filePath,
      status: "approved_ready_for_promotion",
      ok: true,
      promotable: true,
      reviewRequired: false,
      reviewed,
      productionGrade,
      requiresManualReview,
      validationStatus: validation.status,
      validationReason: validation.reason,
      confidence: validation.confidence,
      matchCount: validation.matchCount,
      playerCount: validation.playerCount,
      issues: validation.issues || [],
      reason: "candidate is reviewed, productionGrade, in workset, and validator-accepted"
    };
  }

  return {
    key,
    team: candidate?.team || teamRow.team || null,
    leagueSlug: candidate?.leagueSlug || teamRow.leagueSlug || null,
    file: filePath,
    status: "needs_review",
    ok: true,
    promotable: false,
    reviewRequired: true,
    reviewed,
    productionGrade,
    requiresManualReview,
    validationStatus: validation.status,
    validationReason: validation.reason,
    confidence: validation.confidence,
    matchCount: validation.matchCount,
    playerCount: validation.playerCount,
    issues: validation.issues || [],
    reason: "candidate passes validator but still requires reviewed:true and productionGrade:true"
  };
}

export async function buildPlayerUsageAiCandidateReviewDay(dayKey) {
  const safeDayKey = clean(dayKey);

  if (!safeDayKey) {
    throw new Error("buildPlayerUsageAiCandidateReviewDay: missing dayKey");
  }

  const workset = readJsonLoose(worksetPath(safeDayKey), null);

  if (!workset || workset.__readError || !Array.isArray(workset.teams)) {
    throw new Error(`player-usage workset not found or invalid: ${worksetPath(safeDayKey)}`);
  }

  const files = listCandidateFiles(safeDayKey);
  const context = {
    worksetIndex: buildWorksetIndex(workset),
    manualSeedKeys: existingManualSeedKeys(safeDayKey)
  };

  const results = files.map(file => {
    const candidate = readJsonLoose(file, null);
    return candidateReviewRow(file, candidate, context);
  });

  const out = {
    ok: true,
    dayKey: safeDayKey,
    candidateDir: candidatesDir(safeDayKey),
    worksetTeamCount: workset.teams.length,
    manualSeedCount: context.manualSeedKeys.size,
    candidateCount: files.length,
    needsReviewCount: results.filter(row => row.status === "needs_review").length,
    approvedReadyForPromotionCount: results.filter(row => row.status === "approved_ready_for_promotion").length,
    alreadyHasManualSeedCount: results.filter(row => row.status === "already_has_manual_seed").length,
    invalidCandidateCount: results.filter(row => row.status === "invalid_candidate").length,
    notInWorksetCount: results.filter(row => row.status === "not_in_workset").length,
    invalidJsonCount: results.filter(row => row.status === "invalid_json").length,
    promotableCount: results.filter(row => row.promotable === true).length,
    reviewRequiredCount: results.filter(row => row.reviewRequired === true).length,
    results,
    updatedAt: new Date().toISOString()
  };

  const outPath = reviewAuditPath(safeDayKey);
  writeJson(outPath, out);

  return {
    ...out,
    file: outPath
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];

  console.log("[build-player-usage-ai-candidate-review-day] cli:start", { dayKey });

  buildPlayerUsageAiCandidateReviewDay(dayKey)
    .then(result => {
      console.log("[build-player-usage-ai-candidate-review-day] cli:done", {
        ok: result.ok,
        dayKey: result.dayKey,
        candidateCount: result.candidateCount,
        needsReviewCount: result.needsReviewCount,
        approvedReadyForPromotionCount: result.approvedReadyForPromotionCount,
        invalidCandidateCount: result.invalidCandidateCount,
        notInWorksetCount: result.notInWorksetCount,
        promotableCount: result.promotableCount,
        reviewRequiredCount: result.reviewRequiredCount,
        file: result.file
      });
    })
    .catch(err => {
      console.error("[build-player-usage-ai-candidate-review-day] cli:fatal", err);
      process.exit(1);
    });
}
