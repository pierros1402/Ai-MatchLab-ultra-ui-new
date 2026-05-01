import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildTeamGeoDay } from "./build-team-geo-day.js";
import { normalizeTeamKey, writeTeamGeoRecord } from "../storage/team-geo-db.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function resolveDataPath(...parts) {
  return path.join(rootDir(), "data", ...parts);
}

function seedFilePath() {
  return resolveDataPath("team-geo", "known-team-geo-seeds.json");
}

function buildSeedIndex(seeds) {
  const index = new Map();

  for (const seed of seeds || []) {
    const names = [
      seed?.team,
      ...(Array.isArray(seed?.aliases) ? seed.aliases : [])
    ]
      .map(normalizeText)
      .filter(Boolean);

    for (const name of names) {
      const key = normalizeTeamKey(name);
      if (key && !index.has(key)) {
        index.set(key, seed);
      }
    }
  }

  return index;
}

function buildRecordFromSeed(teamName, seed) {
  const latitude = normalizeNumber(seed?.latitude ?? seed?.lat);
  const longitude = normalizeNumber(seed?.longitude ?? seed?.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    team: normalizeText(teamName),
    venue: normalizeText(seed?.venue) || null,
    city: normalizeText(seed?.city) || null,
    country: normalizeText(seed?.country) || null,
    latitude,
    longitude,
    source: normalizeText(seed?.source) || "known_team_geo_seed",
    updatedAt: new Date().toISOString()
  };
}

function parseArgs(argv) {
  const args = {
    dayKey: null,
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (!args.dayKey) {
      args.dayKey = arg;
    }
  }

  return args;
}

export async function applyTeamGeoSeedsDay(dayKey, options = {}) {
  if (!dayKey) {
    throw new Error("applyTeamGeoSeedsDay: missing dayKey");
  }

  const seedsFile = seedFilePath();
  const seeds = readJsonSafe(seedsFile, []);

  if (!Array.isArray(seeds)) {
    throw new Error(`seed file must contain an array: ${seedsFile}`);
  }

  const seedIndex = buildSeedIndex(seeds);

  const before = await buildTeamGeoDay(dayKey);
  const applied = [];
  const unresolved = [];

  for (const item of before.missing || []) {
    const teamName = normalizeText(item?.teamName);
    const key = normalizeTeamKey(teamName);
    const seed = seedIndex.get(key);

    if (!seed) {
      unresolved.push({
        team: teamName,
        leagueSlug: item?.leagueSlug || null,
        reason: "no_seed"
      });
      continue;
    }

    const record = buildRecordFromSeed(teamName, seed);

    if (!record) {
      unresolved.push({
        team: teamName,
        leagueSlug: item?.leagueSlug || null,
        reason: "seed_missing_coordinates"
      });
      continue;
    }

    if (!options.dryRun) {
      writeTeamGeoRecord(record);
    }

    applied.push({
      team: record.team,
      city: record.city,
      country: record.country,
      latitude: record.latitude,
      longitude: record.longitude,
      source: record.source,
      dryRun: Boolean(options.dryRun)
    });
  }

  const after = options.dryRun ? before : await buildTeamGeoDay(dayKey);

  return {
    ok: true,
    dayKey,
    dryRun: Boolean(options.dryRun),
    seedFile: seedsFile,
    seedCount: seeds.length,
    before: {
      totalTeams: before.totalTeams,
      existingCount: before.existingCount,
      missingCount: before.missingCount,
      coveragePct: before.coveragePct
    },
    appliedCount: applied.length,
    unresolvedCount: unresolved.length,
    after: {
      totalTeams: after.totalTeams,
      existingCount: after.existingCount,
      missingCount: after.missingCount,
      coveragePct: after.coveragePct,
      reportFile: after.file,
      importFile: after.importFile
    },
    applied,
    unresolved
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.dayKey) {
    console.error("[apply-team-geo-seeds-day] cli:fatal missing dayKey");
    process.exit(1);
  }

  console.log("[apply-team-geo-seeds-day] cli:start", args);

  applyTeamGeoSeedsDay(args.dayKey, { dryRun: args.dryRun })
    .then(result => {
      console.log("[apply-team-geo-seeds-day] cli:done", result);
    })
    .catch(err => {
      console.error("[apply-team-geo-seeds-day] cli:fatal", err);
      process.exit(1);
    });
}