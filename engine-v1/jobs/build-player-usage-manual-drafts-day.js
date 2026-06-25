import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { normalizePlayerUsageTeamKey } from "../storage/player-usage-db.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function clean(value) {
  return String(value || "").trim();
}

function readJsonLoose(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function worksetPath(dayKey) {
  return resolveDataPath("player-usage", "_workset", `${dayKey}.json`);
}

function draftDir(dayKey) {
  return resolveDataPath("player-usage", "_manual-drafts", dayKey);
}

function trackedManualDir(dayKey) {
  return path.resolve(
    MODULE_DIR,
    "..",
    "seeds",
    "player-usage",
    "manual-results",
    dayKey
  );
}

function draftAuditPath(dayKey) {
  return resolveDataPath("player-usage", "_manual-drafts", `${dayKey}.json`);
}

function readExistingManualKeys(dayKey) {
  const dir = trackedManualDir(dayKey);

  if (!fs.existsSync(dir)) return new Set();

  return new Set(
    fs.readdirSync(dir)
      .filter(file => file.endsWith(".json"))
      .map(file => normalizePlayerUsageTeamKey(path.basename(file, ".json")))
      .filter(Boolean)
  );
}

function buildDraft(teamRow) {
  const key = normalizePlayerUsageTeamKey(teamRow?.key || teamRow?.team);
  const team = clean(teamRow?.team);
  const leagueSlug = clean(teamRow?.leagueSlug);
  const matchContexts = Array.isArray(teamRow?.matchContexts)
    ? teamRow.matchContexts.slice(0, 3)
    : [];

  const templateMatches = matchContexts.length
    ? matchContexts.map(context => ({
        matchId: context?.matchId || null,
        date: context?.dayKey || "YYYY-MM-DD",
        opponent: clean(context?.opponent) || "Opponent Name",
        side: clean(context?.side) || "home_or_away",
        kickoff: context?.kickoff || null,
        players: [
          { name: "Verified Player One", starter: true, minutes: 90, position: "GK" },
          { name: "Verified Player Two", starter: true, minutes: 90, position: "DF" },
          { name: "Verified Player Three", starter: true, minutes: 75, position: "MF" }
        ]
      }))
    : [
        {
          matchId: null,
          date: "YYYY-MM-DD",
          opponent: "Opponent Name",
          side: "home_or_away",
          players: [
            { name: "Verified Player One", starter: true, minutes: 90, position: "GK" },
            { name: "Verified Player Two", starter: true, minutes: 90, position: "DF" },
            { name: "Verified Player Three", starter: true, minutes: 75, position: "MF" }
          ]
        },
        {
          matchId: null,
          date: "YYYY-MM-DD",
          opponent: "Opponent Name",
          side: "home_or_away",
          players: [
            { name: "Verified Player One", starter: true, minutes: 90, position: "GK" },
            { name: "Verified Player Two", starter: true, minutes: 90, position: "DF" },
            { name: "Verified Player Four", starter: true, minutes: 80, position: "FW" }
          ]
        }
      ];

  return {
    key,
    team,
    aliases: [
      team
    ],
    leagueSlug,
    source: "tracked_player_usage_manual_result",
    confidence: 0.45,
    matches: templateMatches,
    meta: {
      reviewed: false,
      productionGrade: false,
      evidenceLevel: "draft_requires_verified_match_usage_samples",
      worksetPriority: Number(teamRow?.priority || 0),
      usageStatus: clean(teamRow?.usageStatus),
      usageQuality: clean(teamRow?.usageQuality),
      reason: clean(teamRow?.reason),
      matchContexts,
      note: "Draft only. Replace placeholders with verified match/player usage before moving this file into engine-v1/seeds/player-usage/manual-results/YYYY-MM-DD/."
    }
  };
}

export async function buildPlayerUsageManualDraftsDay(dayKey, options = {}) {
  const safeDayKey = clean(dayKey);

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 12;
  const workset = readJsonLoose(worksetPath(safeDayKey), null);

  if (!workset || !Array.isArray(workset.teams)) {
    return { ok: true, dayKey: safeDayKey, drafted: 0, skipped: true, reason: "no_workset" };
  }

  const existingManualKeys = readExistingManualKeys(safeDayKey);
  const outDir = draftDir(safeDayKey);

  const candidates = workset.teams
    .map(teamRow => {
      const key = normalizePlayerUsageTeamKey(teamRow?.key || teamRow?.team);
      const usageStatus = clean(teamRow?.usageStatus);
      const confidence = Number(teamRow?.confidence || 0);
      const alreadyHasManualResult = existingManualKeys.has(key);

      const worksetPriority = Number(teamRow?.priority || 0);
      const usageQuality = clean(teamRow?.usageQuality);
      const reason = clean(teamRow?.reason);

      let priority = worksetPriority;
      if (!alreadyHasManualResult) priority += 30;
      if (usageStatus === "missing") priority += 30;
      if (usageStatus === "insufficient") priority += 20;
      if (usageQuality === "stub") priority += 15;
      if (usageQuality === "partial") priority += 8;
      if (confidence <= 0) priority += 10;

      return {
        priority,
        key,
        team: clean(teamRow?.team),
        leagueSlug: clean(teamRow?.leagueSlug),
        usageStatus,
        confidence,
        usageQuality,
        reason,
        priorityFromWorkset: worksetPriority,
        matchContexts: Array.isArray(teamRow?.matchContexts) ? teamRow.matchContexts : [],
        sampleMatches: teamRow?.sampleMatches ?? null,
        alreadyHasManualResult,
        teamRow
      };
    })
    .filter(row => row.key && !row.alreadyHasManualResult)
    .sort((a, b) => b.priority - a.priority || a.team.localeCompare(b.team))
    .slice(0, limit);

  const written = [];

  ensureDir(outDir);

  for (const row of candidates) {
    const file = path.join(outDir, `${row.key}.json`);

    if (!fs.existsSync(file) || options.overwrite) {
      writeJson(file, buildDraft(row.teamRow));
    }

    written.push({
      key: row.key,
      team: row.team,
      leagueSlug: row.leagueSlug,
      usageStatus: row.usageStatus,
      usageQuality: row.usageQuality,
      reason: row.reason,
      priority: row.priority,
      priorityFromWorkset: row.priorityFromWorkset,
      confidence: row.confidence,
      matchContextCount: row.matchContexts.length,
      file
    });
  }

  const audit = {
    ok: true,
    dayKey: safeDayKey,
    limit,
    worksetTeamCount: workset.teams.length,
    existingManualCount: existingManualKeys.size,
    draftCount: written.length,
    draftDir: outDir,
    drafts: written.map(row => ({
      ...row,
      file: path.relative(process.cwd(), row.file)
    })),
    updatedAt: new Date().toISOString()
  };

  const auditFile = draftAuditPath(safeDayKey);
  writeJson(auditFile, audit);

  return {
    ...audit,
    file: auditFile
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];
  const limitArg = process.argv.find(arg => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 12;
  const overwrite = process.argv.includes("--overwrite");

  console.log("[build-player-usage-manual-drafts-day] cli:start", {
    dayKey,
    limit,
    overwrite
  });

  buildPlayerUsageManualDraftsDay(dayKey, { limit, overwrite })
    .then(result => {
      console.log("[build-player-usage-manual-drafts-day] cli:done", {
        ok: result.ok,
        dayKey: result.dayKey,
        worksetTeamCount: result.worksetTeamCount,
        existingManualCount: result.existingManualCount,
        draftCount: result.draftCount,
        draftDir: result.draftDir,
        file: result.file
      });
    })
    .catch(err => {
      console.error("[build-player-usage-manual-drafts-day] cli:fatal", err);
      process.exit(1);
    });
}
