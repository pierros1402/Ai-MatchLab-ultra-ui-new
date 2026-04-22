import { getFixtureById } from "../storage/json-db.js";
import { writeOfficiatingSnapshot } from "../storage/officiating-db.js";

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function parseOfficialsFromArgs() {
  const officials = [];

  const assistant1 = readArg("--assistant1");
  const assistant2 = readArg("--assistant2");
  const fourth = readArg("--fourth");
  const varOfficial = readArg("--var");
  const avarOfficial = readArg("--avar");

  if (assistant1) officials.push({ name: assistant1, role: "assistant_referee_1" });
  if (assistant2) officials.push({ name: assistant2, role: "assistant_referee_2" });
  if (fourth) officials.push({ name: fourth, role: "fourth_official" });
  if (varOfficial) officials.push({ name: varOfficial, role: "video_assistant_referee" });
  if (avarOfficial) officials.push({ name: avarOfficial, role: "assistant_video_assistant_referee" });

  return officials;
}

function printUsage() {
  console.log(`
Usage:
  node engine-v1/jobs/seed-officiating-match.js <matchId> --referee "Name" [options]

Required:
  <matchId>
  --referee "Main Referee Name"

Optional:
  --source "manual_seed"
  --confidence 0.75
  --assistant1 "Name"
  --assistant2 "Name"
  --fourth "Name"
  --var "Name"
  --avar "Name"
  --note "Free text note"
  --print-only

Examples:
  node engine-v1/jobs/seed-officiating-match.js 745117 --referee "John Smith"

  node engine-v1/jobs/seed-officiating-match.js 745117 ^
    --referee "John Smith" ^
    --assistant1 "A Ref One" ^
    --assistant2 "A Ref Two" ^
    --fourth "Fourth Official" ^
    --var "VAR Official" ^
    --source "manual_seed" ^
    --confidence 0.8
`);
}

async function main() {
  const matchId = process.argv[2];

  if (!matchId || hasFlag("--help")) {
    printUsage();
    process.exit(matchId ? 0 : 1);
  }

  const refereeName = readArg("--referee");
  if (!refereeName) {
    console.error("[seed-officiating-match] missing --referee");
    printUsage();
    process.exit(1);
  }

  const match = getFixtureById(matchId);
  if (!match) {
    console.error("[seed-officiating-match] match not found", { matchId });
    process.exit(1);
  }

  const source = readArg("--source") || "manual_seed";
  const confidenceRaw = readArg("--confidence");
  const confidence =
    confidenceRaw != null && Number.isFinite(Number(confidenceRaw))
      ? Number(confidenceRaw)
      : 0.7;

  const note = readArg("--note");
  const officials = parseOfficialsFromArgs();

  const payload = {
    source,
    confidence,
    referee: {
      name: refereeName,
      role: "referee"
    },
    officials,
    notes: note ? [note] : []
  };

  if (hasFlag("--print-only")) {
    console.log(JSON.stringify({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      payload
    }, null, 2));
    return;
  }

  const result = writeOfficiatingSnapshot(match, payload);

  console.log("[seed-officiating-match] done", {
    ok: result.ok,
    filePath: result.filePath,
    matchId: result.snapshot.matchId,
    referee: result.snapshot.referee,
    officials: result.snapshot.officials?.length || 0,
    source: result.snapshot.source,
    confidence: result.snapshot.confidence
  });
}

main().catch(err => {
  console.error("[seed-officiating-match] fatal", err);
  process.exit(1);
});