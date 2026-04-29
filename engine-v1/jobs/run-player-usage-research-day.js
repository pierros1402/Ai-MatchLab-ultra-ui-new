import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { writePlayerUsageRecord } from "../storage/player-usage-db.js";
import { validatePlayerUsageResearchResult } from "../ai-match-intelligence/player-usage/player-usage-validator.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getWorksetPath(dayKey) {
  return resolveDataPath("player-usage", "_workset", `${dayKey}.json`);
}

function getResearchResultCandidates(dayKey, key) {
  return [
    resolveDataPath("player-usage", "_research-results", dayKey, `${key}.json`),
    resolveDataPath("player-usage", "_research-results", `${key}.json`)
  ];
}

function getAuditPath(dayKey) {
  return resolveDataPath("player-usage", "_research-results", `${dayKey}.import.audit.json`);
}

function findFirstExistingFile(files) {
  return files.find(file => fs.existsSync(file)) || null;
}

function shouldProcessTeam(teamRow = {}) {
  return ["missing", "insufficient"].includes(teamRow.usageStatus);
}

export async function runPlayerUsageResearchDay(dayKey) {
  const safeDayKey = normalizeText(dayKey);

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const worksetPath = getWorksetPath(safeDayKey);

  if (!fs.existsSync(worksetPath)) {
    throw new Error(`workset not found: ${worksetPath}`);
  }

  const workset = readJsonSafe(worksetPath, null);

  if (!workset || !Array.isArray(workset.teams)) {
    throw new Error("invalid workset format");
  }

  const results = [];

  for (const teamRow of workset.teams) {
    if (!shouldProcessTeam(teamRow)) {
      continue;
    }

    const key = normalizeText(teamRow.key);
    const team = normalizeText(teamRow.team);
    const leagueSlug = normalizeText(teamRow.leagueSlug) || null;
    const candidates = getResearchResultCandidates(safeDayKey, key);
    const inputFile = findFirstExistingFile(candidates);

    if (!inputFile) {
      results.push({
        key,
        team,
        leagueSlug,
        status: "unresolved_no_input",
        reason: "research_result_file_missing",
        canonicalWritten: false,
        searchedFiles: candidates
      });
      continue;
    }

    const raw = readJsonSafe(inputFile, null);

    if (!raw) {
      results.push({
        key,
        team,
        leagueSlug,
        status: "invalid_rejected",
        reason: "research_result_invalid_json",
        canonicalWritten: false,
        inputFile
      });
      continue;
    }

    const validation = validatePlayerUsageResearchResult(raw, {
      key,
      team,
      leagueSlug
    });

    if (!validation.ok || !validation.record) {
      results.push({
        key,
        team,
        leagueSlug,
        status: validation.status,
        reason: validation.reason,
        confidence: validation.confidence,
        matchCount: validation.matchCount,
        playerCount: validation.playerCount,
        canonicalWritten: false,
        inputFile,
        issues: validation.issues
      });
      continue;
    }

    const writeResult = writePlayerUsageRecord({
      ...validation.record,
      meta: {
        ...validation.record.meta,
        inputFile,
        importer: "run-player-usage-research-day",
        importedAt: new Date().toISOString()
      }
    });

    results.push({
      key,
      team,
      leagueSlug,
      status: validation.status,
      reason: validation.reason,
      confidence: validation.confidence,
      matchCount: validation.matchCount,
      playerCount: validation.playerCount,
      canonicalWritten: true,
      canonicalFile: writeResult.file,
      inputFile,
      issues: validation.issues
    });
  }

  const out = {
    ok: true,
    dayKey: safeDayKey,
    taskCount: results.length,
    canonicalWriteCount: results.filter(result => result.canonicalWritten).length,
    validUsageCount: results.filter(result => result.status === "valid_usage").length,
    partialUsageCount: results.filter(result => result.status === "partial_usage").length,
    emptyReviewedCount: results.filter(result => result.status === "empty_reviewed").length,
    invalidRejectedCount: results.filter(result => result.status === "invalid_rejected").length,
    unresolvedNoInputCount: results.filter(result => result.status === "unresolved_no_input").length,
    results,
    updatedAt: new Date().toISOString()
  };

  const auditPath = getAuditPath(safeDayKey);
  writeJson(auditPath, out);

  return {
    ...out,
    file: auditPath
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];

  if (!dayKey) {
    console.error("Usage: node run-player-usage-research-day.js <YYYY-MM-DD>");
    process.exit(1);
  }

  console.log("[run-player-usage-research-day] start", { dayKey });

  runPlayerUsageResearchDay(dayKey)
    .then(res => {
      console.log("[run-player-usage-research-day] done", {
        ok: res.ok,
        dayKey: res.dayKey,
        taskCount: res.taskCount,
        canonicalWriteCount: res.canonicalWriteCount,
        validUsageCount: res.validUsageCount,
        partialUsageCount: res.partialUsageCount,
        emptyReviewedCount: res.emptyReviewedCount,
        invalidRejectedCount: res.invalidRejectedCount,
        unresolvedNoInputCount: res.unresolvedNoInputCount,
        file: res.file
      });
    })
    .catch(err => {
      console.error("[run-player-usage-research-day] fatal", err);
      process.exit(1);
    });
}
