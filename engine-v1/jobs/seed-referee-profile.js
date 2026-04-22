import {
  normalizeRefereeKey,
  writeRefereeProfile
} from "../storage/referee-profiles-db.js";

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function safeNum(value, fallback = null) {
  if (value == null) return fallback;

  const text = String(value).trim();
  if (!text) return fallback;

  const n = Number(text);
  return Number.isFinite(n) ? n : fallback;
}

function printUsage() {
  console.log(`
Usage:
  node engine-v1/jobs/seed-referee-profile.js --name "Referee Name" [options]

Required:
  --name "Referee Name"

Optional:
  --country "Country"
  --sampleSize 18
  --avgCards 4.8
  --avgPenalties 0.22
  --avgFouls 24.1
  --style "strict|balanced|lenient|unknown"
  --competition "eng.2"
  --season "2025-2026"
  --source "manual_seed"
  --print-only

Examples:
  node engine-v1/jobs/seed-referee-profile.js --name "John Doe" --print-only

  node engine-v1/jobs/seed-referee-profile.js ^
    --name "John Doe" ^
    --country "England" ^
    --sampleSize 18 ^
    --avgCards 4.8 ^
    --avgPenalties 0.22 ^
    --avgFouls 24.1 ^
    --style "balanced" ^
    --competition "eng.2" ^
    --season "2025-2026" ^
    --source "manual_seed"
`);
}

async function main() {
  if (hasFlag("--help")) {
    printUsage();
    process.exit(0);
  }

  const name = readArg("--name");
  if (!name) {
    console.error("[seed-referee-profile] missing --name");
    printUsage();
    process.exit(1);
  }

  const competition = readArg("--competition");
  const season = readArg("--season");

  const profile = {
    key: normalizeRefereeKey(name),
    name,
    role: "referee",
    country: readArg("--country") || null,
    sampleSize: safeNum(readArg("--sampleSize"), null),
    avgCards: safeNum(readArg("--avgCards"), null),
    avgPenalties: safeNum(readArg("--avgPenalties"), null),
    avgFouls: safeNum(readArg("--avgFouls"), null),
    style: readArg("--style") || "unknown",
    competitions: competition ? [competition] : [],
    seasons: season ? [season] : [],
    source: readArg("--source") || "manual_seed"
  };

  if (hasFlag("--print-only")) {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  const result = writeRefereeProfile(profile);

  console.log("[seed-referee-profile] done", {
    ok: result.ok,
    filePath: result.filePath,
    key: result.profile.key,
    name: result.profile.name,
    sampleSize: result.profile.sampleSize,
    avgCards: result.profile.avgCards,
    avgPenalties: result.profile.avgPenalties,
    avgFouls: result.profile.avgFouls,
    style: result.profile.style
  });
}

main().catch(err => {
  console.error("[seed-referee-profile] fatal", err);
  process.exit(1);
});