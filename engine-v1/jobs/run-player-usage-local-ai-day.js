import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

const MODEL = process.env.OPENAI_PLAYER_USAGE_MODEL || "gpt-5";

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
  return resolveDataPath("player-usage", "_ai-requests", `${dayKey}.local-ai.audit.json`);
}

function normalizePlayer(row = {}) {
  const name = normalizeText(row?.name || row?.player || row?.displayName);
  if (!name) return null;

  return {
    name,
    starter: row?.starter === true,
    minutes: Number.isFinite(Number(row?.minutes)) ? Number(row.minutes) : null,
    position: normalizeText(row?.position) || null
  };
}

function normalizeMatch(row = {}) {
  const players = (Array.isArray(row?.players) ? row.players : [])
    .map(normalizePlayer)
    .filter(Boolean);

  return {
    date: normalizeText(row?.date) || null,
    opponent: normalizeText(row?.opponent) || null,
    side: normalizeText(row?.side).toLowerCase() === "away" ? "away" : "home",
    players
  };
}

function normalizeResult(raw = {}, request = {}) {
  const matches = (Array.isArray(raw?.matches) ? raw.matches : [])
    .map(normalizeMatch)
    .filter(match => match.players.length > 0);

  return {
    team: normalizeText(raw?.team || request.team),
    leagueSlug: normalizeText(raw?.leagueSlug || request.leagueSlug) || null,
    source: normalizeText(raw?.source) || "local_ai_player_usage",
    confidence: Number.isFinite(Number(raw?.confidence)) ? Number(raw.confidence) : 0,
    matches,
    meta: {
      executor: "run-player-usage-local-ai-day",
      model: MODEL,
      generatedAt: new Date().toISOString()
    }
  };
}

function isUsableResult(result) {
  return (
    result &&
    Array.isArray(result.matches) &&
    result.matches.length > 0 &&
    Number(result.confidence) >= 0.35
  );
}

function buildInput(request) {
  return [
    request.prompt || "",
    "",
    "Hard validation rules:",
    "- Return ONLY JSON.",
    "- Do not include markdown.",
    "- If you are not confident from reliable evidence, return matches: [] and confidence: 0.",
    "- Do not invent players.",
    "- Do not use ESPN as canonical source.",
    "- Prefer official club site, competition match centre, club match report, or credible lineup report.",
    "- It is acceptable to return fewer than 5 matches if evidence is reliable."
  ].join("\n");
}

async function executeRequest(client, request) {
  const response = await client.responses.create({
    model: MODEL,
    instructions: "You extract football player usage into strict JSON. You must not hallucinate.",
    input: buildInput(request),
    text: {
      format: {
        type: "json_object"
      }
    }
  });

  const text = response.output_text || "{}";
  const parsed = JSON.parse(text);
  return normalizeResult(parsed, request);
}

export async function runPlayerUsageLocalAiDay(dayKey, { maxRequests = 2 } = {}) {
  const safeDayKey = normalizeText(dayKey);

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("missing OPENAI_API_KEY");
  }

  const indexPath = getRequestsIndex(safeDayKey);
  const indexDoc = readJsonSafe(indexPath, null);

  if (!indexDoc || !Array.isArray(indexDoc.requests)) {
    throw new Error(`ai requests index not found: ${indexPath}`);
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const requests = indexDoc.requests.slice(0, maxRequests);
  const results = [];

  for (const req of requests) {
    const requestDoc = readJsonSafe(req.file, null);

    if (!requestDoc) {
      results.push({
        key: req.key,
        team: req.team,
        status: "request_file_missing",
        file: req.file
      });
      continue;
    }

    try {
      const normalized = await executeRequest(client, requestDoc);
      const accepted = isUsableResult(normalized);

      if (accepted) {
        writeJson(req.targetOutputFile, normalized);
      }

      results.push({
        key: req.key,
        team: req.team,
        status: accepted ? "accepted_ai_result" : "rejected_empty_or_low_confidence",
        confidence: normalized.confidence,
        matchCount: normalized.matches.length,
        targetOutputFile: req.targetOutputFile
      });
    } catch (err) {
      results.push({
        key: req.key,
        team: req.team,
        status: "ai_execution_failed",
        error: err?.message || String(err),
        targetOutputFile: req.targetOutputFile
      });
    }
  }

  const out = {
    ok: true,
    dayKey: safeDayKey,
    model: MODEL,
    requestedCount: requests.length,
    acceptedCount: results.filter(r => r.status === "accepted_ai_result").length,
    rejectedCount: results.filter(r => r.status === "rejected_empty_or_low_confidence").length,
    failedCount: results.filter(r => r.status === "ai_execution_failed").length,
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
  const maxRequests = Number.isFinite(Number(process.argv[3]))
    ? Number(process.argv[3])
    : 2;

  console.log("[run-player-usage-local-ai-day] start", {
    dayKey,
    maxRequests,
    model: MODEL
  });

  runPlayerUsageLocalAiDay(dayKey, { maxRequests })
    .then(res => {
      console.log("[run-player-usage-local-ai-day] done", {
        ok: res.ok,
        requestedCount: res.requestedCount,
        acceptedCount: res.acceptedCount,
        rejectedCount: res.rejectedCount,
        failedCount: res.failedCount,
        file: res.file
      });
    })
    .catch(err => {
      console.error("[run-player-usage-local-ai-day] fatal", err);
      process.exit(1);
    });
}