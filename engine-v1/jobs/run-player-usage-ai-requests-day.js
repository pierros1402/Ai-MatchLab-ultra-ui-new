import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

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

function getRequestsIndex(dayKey) {
  return resolveDataPath("player-usage", "_ai-requests", `${dayKey}.json`);
}

function getAuditPath(dayKey) {
  return resolveDataPath("player-usage", "_ai-requests", `${dayKey}.audit.json`);
}

function getTargetPath(dayKey, key) {
  return resolveDataPath("player-usage", "_research-results", dayKey, `${key}.json`);
}

export async function runPlayerUsageAiRequestsDay(dayKey) {
  const safeDayKey = normalizeText(dayKey);

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const indexPath = getRequestsIndex(safeDayKey);
  const indexDoc = readJsonSafe(indexPath, null);

  if (!indexDoc || !Array.isArray(indexDoc.requests)) {
    throw new Error(`ai requests index not found: ${indexPath}`);
  }

  const results = [];

  for (const req of indexDoc.requests) {
    const key = normalizeText(req.key);
    const targetFile = req.targetOutputFile || getTargetPath(safeDayKey, key);

    // ❗ εδώ θα μπει αργότερα το AI execution
    // προς το παρόν ΔΕΝ γράφουμε fake data

    const exists = fs.existsSync(targetFile);

    if (!exists) {
      results.push({
        key,
        team: req.team,
        status: "no_ai_result",
        reason: "no_ai_execution_layer_connected",
        targetFile
      });
      continue;
    }

    const data = readJsonSafe(targetFile, null);

    const valid =
      data &&
      Array.isArray(data.matches) &&
      data.matches.length > 0;

    results.push({
      key,
      team: req.team,
      status: valid ? "accepted_ai_result" : "empty_ai_result",
      matchCount: valid ? data.matches.length : 0,
      targetFile
    });
  }

  const out = {
    ok: true,
    dayKey: safeDayKey,
    requestCount: indexDoc.requests.length,
    acceptedCount: results.filter(r => r.status === "accepted_ai_result").length,
    emptyCount: results.filter(r => r.status === "empty_ai_result").length,
    noResultCount: results.filter(r => r.status === "no_ai_result").length,
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

  console.log("[run-player-usage-ai-requests-day] start", { dayKey });

  runPlayerUsageAiRequestsDay(dayKey)
    .then(res => {
      console.log("[run-player-usage-ai-requests-day] done", {
        ok: res.ok,
        requestCount: res.requestCount,
        accepted: res.acceptedCount,
        empty: res.emptyCount,
        noResult: res.noResultCount,
        file: res.file
      });
    })
    .catch(err => {
      console.error("[run-player-usage-ai-requests-day] fatal", err);
      process.exit(1);
    });
}