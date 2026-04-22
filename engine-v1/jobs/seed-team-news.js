import {
  normalizeTeamKey,
  readTeamNewsRecord,
  writeTeamNewsRecord
} from "../storage/team-news-db.js";

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function parseAbsence(argValue) {
  if (!argValue) return null;

  const raw = String(argValue).trim();
  if (!raw) return null;

  const parts = raw.split("|").map(x => String(x || "").trim());
  const [player, reason, importance] = parts;

  if (!player && !reason) return null;

  return {
    player: player || null,
    reason: reason || null,
    importance: importance || "low"
  };
}

function collectAbsences() {
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === "--absence") {
      values.push(process.argv[i + 1] ?? null);
    }
  }

  return values.map(parseAbsence).filter(Boolean);
}

function printUsage() {
  console.log(`
Usage:
  node engine-v1/jobs/seed-team-news.js --team "Team Name" [options]

Required:
  --team "Team Name"

Optional:
  --absence "Player Name|Reason|high"
  --absence "Another Player|Reason|medium"
  --note "Free text note"
  --source "manual_seed"
  --replace
  --print-only

Examples:
  node engine-v1/jobs/seed-team-news.js --team "Coventry City" --print-only

  node engine-v1/jobs/seed-team-news.js ^
    --team "Coventry City" ^
    --absence "Player One|Hamstring injury|high" ^
    --absence "Player Two|Suspended|medium" ^
    --note "Verified manually before kickoff" ^
    --source "manual_seed"

  node engine-v1/jobs/seed-team-news.js ^
    --team "Coventry City" ^
    --absence "Player Three|Knock|low" ^
    --replace
`);
}

async function main() {
  if (hasFlag("--help")) {
    printUsage();
    process.exit(0);
  }

  const team = readArg("--team");
  if (!team) {
    console.error("[seed-team-news] missing --team");
    printUsage();
    process.exit(1);
  }

  const key = normalizeTeamKey(team);
  if (!key) {
    console.error("[seed-team-news] invalid team key");
    process.exit(1);
  }

  const incomingAbsences = collectAbsences();
  const note = readArg("--note");
  const source = readArg("--source") || "manual_seed";
  const replaceMode = hasFlag("--replace");

  const existing = readTeamNewsRecord(key);

  const nextRecord = {
    key,
    team,
    absences: replaceMode
      ? incomingAbsences
      : [
          ...(existing?.absences || []),
          ...incomingAbsences
        ],
    notes: replaceMode
      ? (note ? [note] : [])
      : [
          ...(existing?.notes || []),
          ...(note ? [note] : [])
        ],
    source
  };

  if (hasFlag("--print-only")) {
    console.log(JSON.stringify(nextRecord, null, 2));
    return;
  }

  const result = writeTeamNewsRecord(nextRecord);

  console.log("[seed-team-news] done", {
    ok: result.ok,
    filePath: result.filePath,
    key: result.record.key,
    team: result.record.team,
    absences: result.record.absences.length,
    notes: result.record.notes.length,
    source: result.record.source
  });
}

main().catch(err => {
  console.error("[seed-team-news] fatal", err);
  process.exit(1);
});