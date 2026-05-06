import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { normalizePlayerUsageTeamKey } from "../storage/player-usage-db.js";
import { validatePlayerUsageResearchResult } from "../ai-match-intelligence/player-usage/player-usage-validator.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function normalizeText(value) {
  return String(value || "").trim();
}

function readJsonSafe(filePath, fallback = null) {
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

function aiCandidatesDir(dayKey) {
  return resolveDataPath("player-usage", "_ai-candidates", dayKey);
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

function worksetPath(dayKey) {
  return resolveDataPath("player-usage", "_workset", `${dayKey}.json`);
}

function auditPath(dayKey) {
  return resolveDataPath("player-usage", "_ai-candidate-promotion-audit", `${dayKey}.json`);
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map(entry => path.join(dirPath, entry.name))
    .sort();
}

function buildWorksetIndex(workset) {
  const index = new Map();

  for (const teamRow of Array.isArray(workset?.teams) ? workset.teams : []) {
    const keys = [
      teamRow?.key,
      teamRow?.team
    ]
      .map(normalizeText)
      .filter(Boolean)
      .map(normalizePlayerUsageTeamKey)
      .filter(Boolean);

    for (const key of keys) {
      index.set(key, teamRow);
    }
  }

  return index;
}

function candidateReviewFlag(raw, key) {
  return raw?.[key] === true || raw?.meta?.[key] === true;
}

function candidateKey(raw, filePath) {
  const filenameKey = path.basename(filePath, ".json");
  return normalizePlayerUsageTeamKey(raw?.key || raw?.team || filenameKey);
}

function buildManualSeed(raw, validation, sourceFile, dayKey, teamRow) {
  const now = new Date().toISOString();
  const record = validation.record;

  return {
    key: record.key,
    team: record.team,
    aliases: Array.isArray(raw?.aliases) ? raw.aliases : [],
    leagueSlug: record.leagueSlug || teamRow?.leagueSlug || raw?.leagueSlug || null,
    source: "tracked_player_usage_manual_result",
    reviewed: true,
    productionGrade: true,
    confidence: Number.isFinite(Number(record.confidence))
      ? Number(record.confidence)
      : Number(raw?.confidence || 0),
    matches: Array.isArray(record.matches) ? record.matches : [],
    meta: {
      ...(record.meta && typeof record.meta === "object" ? record.meta : {}),
      promotedFromAiCandidate: true,
      originalCandidateFile: sourceFile,
      originalCandidateOnly: raw?.candidateOnly === true || raw?.meta?.candidateOnly === true,
      originalCandidateWriter: raw?.meta?.candidateWriter || null,
      originalTargetOutputFile: raw?.meta?.originalTargetOutputFile || null,
      promotionJob: "promote-player-usage-ai-candidates-day",
      promotedAt: now,
      dayKey
    },
    updatedAt: now
  };
}

export async function promotePlayerUsageAiCandidatesDay(dayKey, options = {}) {
  const safeDayKey = normalizeText(dayKey);
  const write = options.write === true;

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const workset = readJsonSafe(worksetPath(safeDayKey), null);

  if (!workset || workset.__readError || !Array.isArray(workset.teams)) {
    throw new Error(`player-usage workset not found or invalid: ${worksetPath(safeDayKey)}`);
  }

  const worksetIndex = buildWorksetIndex(workset);
  const inputDir = aiCandidatesDir(safeDayKey);
  const outputDir = manualResultsDir(safeDayKey);
  const files = listJsonFiles(inputDir);

  const results = [];
  const promoted = [];

  for (const filePath of files) {
    const raw = readJsonSafe(filePath, null);

    if (!raw || raw.__readError || typeof raw !== "object" || Array.isArray(raw)) {
      results.push({
        file: filePath,
        key: null,
        team: null,
        status: "invalid_rejected",
        reason: raw?.__readError || "candidate_invalid_json",
        promoted: false
      });
      continue;
    }

    const key = candidateKey(raw, filePath);
    const teamRow = worksetIndex.get(key);

    if (!teamRow) {
      results.push({
        file: filePath,
        key,
        team: raw?.team || null,
        status: "not_in_workset",
        reason: "candidate team is not in the day workset",
        promoted: false
      });
      continue;
    }

    const isCandidateOnly = raw?.candidateOnly === true || raw?.meta?.candidateOnly === true;
    const reviewed = candidateReviewFlag(raw, "reviewed");
    const productionGrade = candidateReviewFlag(raw, "productionGrade");
    const requiresManualReview = raw?.requiresManualReview === true || raw?.meta?.requiresManualReview === true;

    if (!isCandidateOnly) {
      results.push({
        file: filePath,
        key,
        team: raw?.team || teamRow?.team || null,
        status: "candidate_rejected",
        reason: "missing_candidate_only_flag",
        promoted: false
      });
      continue;
    }

    if (requiresManualReview && (!reviewed || !productionGrade)) {
      results.push({
        file: filePath,
        key,
        team: raw?.team || teamRow?.team || null,
        status: "review_required",
        reason: "candidate requires reviewed:true and productionGrade:true before promotion",
        reviewed,
        productionGrade,
        promoted: false
      });
      continue;
    }

    if (!reviewed || !productionGrade) {
      results.push({
        file: filePath,
        key,
        team: raw?.team || teamRow?.team || null,
        status: "review_required",
        reason: "candidate promotion requires reviewed:true and productionGrade:true",
        reviewed,
        productionGrade,
        promoted: false
      });
      continue;
    }

    const validation = validatePlayerUsageResearchResult(raw, {
      key,
      team: teamRow?.team || raw?.team || null,
      leagueSlug: teamRow?.leagueSlug || raw?.leagueSlug || null
    });

    if (!validation.ok || !validation.record || !["valid_usage", "partial_usage"].includes(validation.status)) {
      results.push({
        file: filePath,
        key,
        team: raw?.team || teamRow?.team || null,
        status: validation.status || "validation_rejected",
        reason: validation.reason || "candidate failed player usage validation",
        confidence: validation.confidence,
        matchCount: validation.matchCount,
        playerCount: validation.playerCount,
        issues: validation.issues || [],
        promoted: false
      });
      continue;
    }

    const seed = buildManualSeed(raw, validation, filePath, safeDayKey, teamRow);
    const outFile = path.join(outputDir, `${seed.key}.json`);

    if (write) {
      writeJson(outFile, seed);
    }

    promoted.push({
      key: seed.key,
      team: seed.team,
      file: outFile
    });

    results.push({
      file: filePath,
      key: seed.key,
      team: seed.team,
      leagueSlug: seed.leagueSlug || null,
      status: validation.status,
      reason: validation.reason,
      confidence: validation.confidence,
      matchCount: validation.matchCount,
      playerCount: validation.playerCount,
      promoted: true,
      outputFile: outFile,
      dryRun: !write,
      issues: validation.issues || []
    });
  }

  const out = {
    ok: true,
    dayKey: safeDayKey,
    dryRun: !write,
    inputDir,
    outputDir,
    inputFileCount: files.length,
    promotedCount: promoted.length,
    rejectedCount: results.filter(result => !result.promoted).length,
    reviewRequiredCount: results.filter(result => result.status === "review_required").length,
    notInWorksetCount: results.filter(result => result.status === "not_in_workset").length,
    invalidRejectedCount: results.filter(result => result.status === "invalid_rejected").length,
    promoted,
    results,
    updatedAt: new Date().toISOString()
  };

  const outPath = auditPath(safeDayKey);
  writeJson(outPath, out);

  return {
    ...out,
    file: outPath
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];
  const write = process.argv.includes("--write");

  console.log("[promote-player-usage-ai-candidates-day] cli:start", {
    dayKey,
    write
  });

  promotePlayerUsageAiCandidatesDay(dayKey, { write })
    .then(result => {
      console.log("[promote-player-usage-ai-candidates-day] cli:done", {
        ok: result.ok,
        dayKey: result.dayKey,
        dryRun: result.dryRun,
        inputFileCount: result.inputFileCount,
        promotedCount: result.promotedCount,
        rejectedCount: result.rejectedCount,
        reviewRequiredCount: result.reviewRequiredCount,
        notInWorksetCount: result.notInWorksetCount,
        invalidRejectedCount: result.invalidRejectedCount,
        file: result.file
      });
    })
    .catch(err => {
      console.error("[promote-player-usage-ai-candidates-day] cli:fatal", err);
      process.exit(1);
    });
}
