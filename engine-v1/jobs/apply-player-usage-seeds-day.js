import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import {
  normalizePlayerUsageTeamKey,
  writePlayerUsageRecord
} from "../storage/player-usage-db.js";
import { validatePlayerUsageResearchResult } from "../ai-match-intelligence/player-usage/player-usage-validator.js";

function normalizeText(value) {
  return String(value || "").trim();
}

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
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function seedFilePath() {
  return resolveDataPath("player-usage", "known-player-usage-seeds.json");
}

function trackedSeedFilePath() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "seeds",
    "player-usage",
    "known-player-usage-seeds.json"
  );
}

function readSeedArray(filePath) {
  const seeds = readJsonSafe(filePath, []);
  if (!Array.isArray(seeds)) {
    throw new Error(`seed file must contain an array: ${filePath}`);
  }
  return seeds;
}

function loadKnownPlayerUsageSeeds(seedFiles = []) {
  const out = [];
  const seen = new Set();

  for (const filePath of seedFiles) {
    const seeds = readSeedArray(filePath);

    for (const seed of seeds) {
      const key = normalizePlayerUsageTeamKey(seed?.key || seed?.team);
      if (!key || seen.has(key)) continue;

      seen.add(key);
      out.push({
        ...seed,
        sourceSeedFile: filePath
      });
    }
  }

  return out;
}

function worksetPath(dayKey) {
  return resolveDataPath("player-usage", "_workset", `${dayKey}.json`);
}

function auditPath(dayKey) {
  return resolveDataPath("player-usage", "_seed-audit", `${dayKey}.json`);
}

function buildSeedIndex(seeds = []) {
  const index = new Map();

  for (const seed of seeds) {
    const names = [
      seed?.team,
      seed?.key,
      ...(Array.isArray(seed?.aliases) ? seed.aliases : [])
    ]
      .map(normalizeText)
      .filter(Boolean);

    for (const name of names) {
      const key = normalizePlayerUsageTeamKey(name);
      if (key && !index.has(key)) {
        index.set(key, seed);
      }
    }
  }

  return index;
}

function buildCandidateRecord(teamRow, seed) {
  return {
    key: normalizePlayerUsageTeamKey(seed?.key || teamRow?.key || teamRow?.team),
    team: normalizeText(seed?.team || teamRow?.team),
    leagueSlug: normalizeText(seed?.leagueSlug || teamRow?.leagueSlug) || null,
    matches: Array.isArray(seed?.matches) ? seed.matches : [],
    source: normalizeText(seed?.source) || "known_player_usage_seed",
    confidence: Number.isFinite(Number(seed?.confidence)) ? Number(seed.confidence) : 0.6,
    updatedAt: new Date().toISOString(),
    meta: {
      ...(seed?.meta && typeof seed.meta === "object" ? seed.meta : {}),
      seeded: true,
      seedImporter: "apply-player-usage-seeds-day",
      seededAt: new Date().toISOString()
    }
  };
}

export async function applyPlayerUsageSeedsDay(dayKey, options = {}) {
  const safeDayKey = normalizeText(dayKey);

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const seedFiles = [
    seedFilePath(),
    trackedSeedFilePath()
  ];

  const seeds = loadKnownPlayerUsageSeeds(seedFiles);

  const workset = readJsonSafe(worksetPath(safeDayKey), null);

  if (!workset || !Array.isArray(workset.teams)) {
    throw new Error(`player-usage workset not found or invalid: ${worksetPath(safeDayKey)}`);
  }

  const seedIndex = buildSeedIndex(seeds);
  const results = [];
  const writes = [];

  for (const teamRow of workset.teams) {
    if (!["missing", "insufficient"].includes(teamRow?.usageStatus)) continue;

    const key = normalizePlayerUsageTeamKey(teamRow?.key || teamRow?.team);
    const seed = seedIndex.get(key);

    if (!seed) {
      results.push({
        key,
        team: teamRow?.team || null,
        status: "unresolved_no_seed",
        wrote: false
      });
      continue;
    }

    const candidate = buildCandidateRecord(teamRow, seed);
    const validation = validatePlayerUsageResearchResult(candidate, {
      key,
      team: teamRow?.team || null,
      leagueSlug: teamRow?.leagueSlug || null
    });

    if (!validation.ok || !validation.record) {
      results.push({
        key,
        team: teamRow?.team || null,
        status: validation.status,
        reason: validation.reason,
        confidence: validation.confidence,
        matchCount: validation.matchCount,
        playerCount: validation.playerCount,
        issues: validation.issues,
        wrote: false
      });
      continue;
    }

    let canonicalWrite = null;

    if (!options.dryRun) {
      canonicalWrite = writePlayerUsageRecord({
        ...validation.record,
        source: candidate.source,
        updatedAt: new Date().toISOString(),
        meta: {
          ...validation.record.meta,
          ...candidate.meta,
          validationStatus: validation.status,
          validationReason: validation.reason
        }
      });

      writes.push(canonicalWrite);
    }

    results.push({
      key: validation.record.key,
      team: validation.record.team,
      leagueSlug: validation.record.leagueSlug || null,
      status: validation.status,
      reason: validation.reason,
      confidence: validation.confidence,
      matchCount: validation.matchCount,
      playerCount: validation.playerCount,
      wrote: Boolean(canonicalWrite?.ok),
      file: canonicalWrite?.file || null
    });
  }

  const out = {
    ok: true,
    dayKey: safeDayKey,
    dryRun: Boolean(options.dryRun),
    seedFiles,
    seedCount: seeds.length,
    worksetTeamCount: workset.teams.length,
    checkedCount: results.length,
    canonicalWriteCount: writes.filter(x => x?.ok).length,
    unresolvedCount: results.filter(x => !x.wrote).length,
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
  const dryRun = process.argv.includes("--dry-run");

  console.log("[apply-player-usage-seeds-day] cli:start", { dayKey, dryRun });

  applyPlayerUsageSeedsDay(dayKey, { dryRun })
    .then(result => {
      console.log("[apply-player-usage-seeds-day] cli:done", {
        ok: result.ok,
        dayKey: result.dayKey,
        seedCount: result.seedCount,
        checkedCount: result.checkedCount,
        canonicalWriteCount: result.canonicalWriteCount,
        unresolvedCount: result.unresolvedCount,
        file: result.file
      });
    })
    .catch(err => {
      console.error("[apply-player-usage-seeds-day] cli:fatal", err);
      process.exit(1);
    });
}