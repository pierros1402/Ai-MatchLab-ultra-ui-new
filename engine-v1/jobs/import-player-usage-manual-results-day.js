import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { normalizePlayerUsageTeamKey } from "../storage/player-usage-db.js";
import { validatePlayerUsageResearchResult } from "../ai-match-intelligence/player-usage/player-usage-validator.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;

    const raw = fs
      .readFileSync(filePath, "utf8")
      .replace(/^\uFEFF/, "");

    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map(entry => path.join(dirPath, entry.name));
}

function resolveManualDir(dayKey) {
  return resolveDataPath("player-usage", "_manual-results", dayKey);
}

function resolveResearchResultsDir(dayKey) {
  return resolveDataPath("player-usage", "_research-results", dayKey);
}

function resolveManualImportAuditPath(dayKey) {
  return resolveDataPath("player-usage", "_manual-import-audit", `${dayKey}.json`);
}

function getFallbackFromFile(filePath, raw = {}) {
  const filenameKey = path.basename(filePath, ".json");
  const rawTeam = normalizeText(raw?.team);
  const rawKey = normalizeText(raw?.key);
  const key = normalizePlayerUsageTeamKey(rawKey || filenameKey || rawTeam);

  return {
    key,
    team: rawTeam || null,
    leagueSlug: normalizeText(raw?.leagueSlug) || null
  };
}

function buildResearchResultRecord(validation, sourceFile) {
  return {
    ...validation.record,
    source: validation.record.source || "manual_player_usage_result",
    meta: {
      ...validation.record.meta,
      manualImport: true,
      manualSourceFile: sourceFile,
      importer: "import-player-usage-manual-results-day",
      importedAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  };
}

export async function importPlayerUsageManualResultsDay(dayKey) {
  const safeDayKey = normalizeText(dayKey);

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const manualDir = resolveManualDir(safeDayKey);
  const researchResultsDir = resolveResearchResultsDir(safeDayKey);
  const files = listJsonFiles(manualDir);

  const results = [];
  const imported = [];

  for (const filePath of files) {
    const raw = readJsonSafe(filePath, null);

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      results.push({
        file: filePath,
        key: null,
        team: null,
        status: "invalid_rejected",
        reason: "manual_result_invalid_json",
        imported: false
      });
      continue;
    }

    const fallback = getFallbackFromFile(filePath, raw);
    const validation = validatePlayerUsageResearchResult(raw, fallback);

    const key = validation?.record?.key || fallback.key || null;
    const team = validation?.record?.team || fallback.team || null;

    if (!validation.ok || !validation.record) {
      results.push({
        file: filePath,
        key,
        team,
        status: validation.status,
        reason: validation.reason,
        confidence: validation.confidence,
        matchCount: validation.matchCount,
        playerCount: validation.playerCount,
        imported: false,
        issues: validation.issues
      });
      continue;
    }

    if (validation.status !== "valid_usage") {
      results.push({
        file: filePath,
        key,
        team,
        status: validation.status,
        reason: "manual_import_requires_valid_usage",
        originalReason: validation.reason,
        confidence: validation.confidence,
        matchCount: validation.matchCount,
        playerCount: validation.playerCount,
        imported: false,
        issues: validation.issues
      });
      continue;
    }

    const outFile = path.join(researchResultsDir, `${key}.json`);
    const record = buildResearchResultRecord(validation, filePath);

    writeJson(outFile, record);

    imported.push({
      key,
      team,
      file: outFile
    });

    results.push({
      file: filePath,
      key,
      team,
      leagueSlug: record.leagueSlug || null,
      status: validation.status,
      reason: validation.reason,
      confidence: validation.confidence,
      matchCount: validation.matchCount,
      playerCount: validation.playerCount,
      imported: true,
      outputFile: outFile,
      issues: validation.issues
    });
  }

  const out = {
    ok: true,
    dayKey: safeDayKey,
    manualDir,
    inputFileCount: files.length,
    importedCount: imported.length,
    rejectedCount: results.filter(result => !result.imported).length,
    validUsageCount: results.filter(result => result.status === "valid_usage").length,
    partialUsageCount: results.filter(result => result.status === "partial_usage").length,
    invalidRejectedCount: results.filter(result => result.status === "invalid_rejected").length,
    imported,
    results,
    updatedAt: new Date().toISOString()
  };

  const auditPath = resolveManualImportAuditPath(safeDayKey);
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
    console.error("Usage: node import-player-usage-manual-results-day.js <YYYY-MM-DD>");
    process.exit(1);
  }

  console.log("[import-player-usage-manual-results-day] cli:start", { dayKey });

  importPlayerUsageManualResultsDay(dayKey)
    .then(result => {
      console.log("[import-player-usage-manual-results-day] cli:done", {
        ok: result.ok,
        dayKey: result.dayKey,
        inputFileCount: result.inputFileCount,
        importedCount: result.importedCount,
        rejectedCount: result.rejectedCount,
        file: result.file
      });
    })
    .catch(err => {
      console.error("[import-player-usage-manual-results-day] cli:fatal", err);
      process.exit(1);
    });
}