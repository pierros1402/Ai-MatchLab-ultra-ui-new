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
  return resolveDataPath("player-usage", "_manual-result-validation-audit", `${dayKey}.json`);
}

function asManualRecords(filePath, json) {
  if (!json) return [];

  if (json.__readError) {
    return [{
      sourceFile: filePath,
      readError: json.__readError
    }];
  }

  if (Array.isArray(json)) {
    return json.map(row => ({
      ...row,
      sourceFile: filePath
    }));
  }

  if (Array.isArray(json.results)) {
    return json.results.map(row => ({
      ...row,
      sourceFile: filePath
    }));
  }

  return [{
    ...json,
    sourceFile: filePath
  }];
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

function manualRecordKey(record) {
  return normalizePlayerUsageTeamKey(record?.key || record?.team);
}

export async function validatePlayerUsageManualResultsDay(dayKey) {
  const safeDayKey = normalizeText(dayKey);

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const dir = manualResultsDir(safeDayKey);
  const workset = readJsonLoose(worksetPath(safeDayKey), null);

  if (!workset || workset.__readError || !Array.isArray(workset.teams)) {
    throw new Error(`player-usage workset not found or invalid: ${worksetPath(safeDayKey)}`);
  }

  const worksetIndex = buildWorksetIndex(workset);

  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
        .filter(file => file.endsWith(".json"))
        .sort()
        .map(file => path.join(dir, file))
    : [];

  const records = [];

  for (const file of files) {
    const json = readJsonLoose(file, null);
    records.push(...asManualRecords(file, json));
  }

  const results = [];

  for (const record of records) {
    const key = manualRecordKey(record);
    const teamRow = worksetIndex.get(key);

    if (record.readError) {
      results.push({
        key,
        team: record.team || null,
        sourceFile: record.sourceFile,
        status: "invalid_json",
        ok: false,
        reason: record.readError
      });
      continue;
    }

    if (!key) {
      results.push({
        key: null,
        team: record.team || null,
        sourceFile: record.sourceFile,
        status: "missing_team_key",
        ok: false,
        reason: "manual result has no key/team"
      });
      continue;
    }

    if (!teamRow) {
      results.push({
        key,
        team: record.team || null,
        sourceFile: record.sourceFile,
        status: "not_in_workset",
        ok: false,
        reason: "manual result team is not in the day workset"
      });
      continue;
    }

    const validation = validatePlayerUsageResearchResult(record, {
      key,
      team: teamRow.team || record.team || null,
      leagueSlug: teamRow.leagueSlug || record.leagueSlug || null
    });

    results.push({
      key,
      team: record.team || teamRow.team || null,
      leagueSlug: record.leagueSlug || teamRow.leagueSlug || null,
      sourceFile: record.sourceFile,
      ok: Boolean(validation.ok),
      status: validation.status,
      reason: validation.reason,
      confidence: validation.confidence,
      matchCount: validation.matchCount,
      playerCount: validation.playerCount,
      issues: validation.issues || []
    });
  }

  const accepted = results.filter(row => ["valid_usage", "partial_usage"].includes(row.status));
  const rejected = results.filter(row => !["valid_usage", "partial_usage"].includes(row.status));

  const out = {
    ok: rejected.length === 0,
    dayKey: safeDayKey,
    manualResultsDir: dir,
    manualResultFiles: files,
    worksetTeamCount: workset.teams.length,
    recordCount: records.length,
    acceptedCount: accepted.length,
    readyCount: results.filter(row => row.status === "valid_usage").length,
    partialCount: results.filter(row => row.status === "partial_usage").length,
    rejectedCount: rejected.length,
    notInWorksetCount: results.filter(row => row.status === "not_in_workset").length,
    invalidJsonCount: results.filter(row => row.status === "invalid_json").length,
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

  console.log("[validate-player-usage-manual-results-day] cli:start", { dayKey });

  validatePlayerUsageManualResultsDay(dayKey)
    .then(result => {
      console.log("[validate-player-usage-manual-results-day] cli:done", {
        ok: result.ok,
        dayKey: result.dayKey,
        recordCount: result.recordCount,
        acceptedCount: result.acceptedCount,
        readyCount: result.readyCount,
        partialCount: result.partialCount,
        rejectedCount: result.rejectedCount,
        notInWorksetCount: result.notInWorksetCount,
        invalidJsonCount: result.invalidJsonCount,
        file: result.file
      });
    })
    .catch(err => {
      console.error("[validate-player-usage-manual-results-day] cli:fatal", err);
      process.exit(1);
    });
}
