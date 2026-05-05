import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { writeTeamNewsRecord } from "../storage/team-news-db.js";
import { validateTeamNewsSeedRecord } from "./validate-team-news-seeds-day.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function getSeedsDir(dayKey) {
  return path.resolve(process.cwd(), "engine-v1", "seeds", "team-news", "manual-results", dayKey);
}

function getSeedAuditPath(dayKey) {
  return resolveDataPath("team-news", "_seed-audit", `${dayKey}.json`);
}

function listSeedFiles(dayKey) {
  const dir = getSeedsDir(dayKey);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .map(name => path.join(dir, name));
}

export function applyTeamNewsSeedsDay(dayKey) {
  const files = listSeedFiles(dayKey);
  const results = [];
  let canonicalWriteCount = 0;

  for (const file of files) {
    const raw = readJsonSafe(file, null);
    const validation = raw && typeof raw === "object" && !Array.isArray(raw)
      ? validateTeamNewsSeedRecord(raw, { dayKey, file })
      : {
          ok: false,
          status: "rejected",
          reason: "invalid_json",
          key: null,
          team: null,
          file,
          issueCount: 1,
          issues: [{ code: "invalid_json", message: "seed file is not valid JSON object" }]
        };

    let canonicalWrite = null;

    if (validation.ok) {
      canonicalWrite = writeTeamNewsRecord({
        ...(validation.canonicalPayload || {}),
        updatedAt: new Date().toISOString()
      });

      canonicalWriteCount += 1;
    }

    results.push({
      ok: validation.ok,
      status: validation.status,
      reason: validation.reason,
      key: validation.key,
      team: validation.team,
      file,
      issueCount: validation.issueCount,
      issues: validation.issues,
      canonicalWrite: canonicalWrite
        ? {
            ok: canonicalWrite.ok,
            filePath: canonicalWrite.filePath
          }
        : null
    });
  }

  const audit = {
    ok: true,
    dayKey,
    seedCount: files.length,
    acceptedCount: results.filter(row => row.ok).length,
    rejectedCount: results.filter(row => !row.ok).length,
    canonicalWriteCount,
    generatedAt: new Date().toISOString(),
    results
  };

  writeJson(getSeedAuditPath(dayKey), audit);

  return {
    ok: true,
    dayKey,
    seedCount: audit.seedCount,
    acceptedCount: audit.acceptedCount,
    rejectedCount: audit.rejectedCount,
    canonicalWriteCount,
    file: getSeedAuditPath(dayKey)
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const dayKey = process.argv[2];

  if (!dayKey) {
    console.error("Usage: node engine-v1/jobs/apply-team-news-seeds-day.js YYYY-MM-DD");
    process.exit(1);
  }

  try {
    const result = applyTeamNewsSeedsDay(dayKey);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("[apply-team-news-seeds-day] failed", err);
    process.exit(1);
  }
}
