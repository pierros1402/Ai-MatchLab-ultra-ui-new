import {
  normalizeTeamKey,
  normalizeTeamGeoRecord,
  writeTeamGeoRecord
} from "../storage/team-geo-db.js";

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function printUsage() {
  console.log(`
Usage:
  node engine-v1/jobs/seed-team-geo.js --team "Team Name" [options]

Required:
  --team "Team Name"

Optional:
  --country "Country"
  --city "City"
  --venue "Venue"
  --latitude 52.1234
  --longitude -1.2345
  --source "manual_seed"
  --print-only
`);
}

async function main() {
  if (hasFlag("--help")) {
    printUsage();
    process.exit(0);
  }

  const team = readArg("--team");
  if (!team) {
    console.error("[seed-team-geo] missing --team");
    printUsage();
    process.exit(1);
  }

  const record = normalizeTeamGeoRecord({
    key: normalizeTeamKey(team),
    team,
    country: readArg("--country") || null,
    city: readArg("--city") || null,
    venue: readArg("--venue") || null,
    latitude: readArg("--latitude"),
    longitude: readArg("--longitude"),
    source: readArg("--source") || "manual_seed"
  });

  if (hasFlag("--print-only")) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  const result = writeTeamGeoRecord(record);

  console.log("[seed-team-geo] done", {
    ok: result.ok,
    filePath: result.filePath,
    key: result.record.key,
    team: result.record.team,
    city: result.record.city,
    venue: result.record.venue,
    latitude: result.record.latitude,
    longitude: result.record.longitude
  });
}

main().catch(err => {
  console.error("[seed-team-geo] fatal", err);
  process.exit(1);
});