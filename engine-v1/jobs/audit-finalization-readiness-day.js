import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath } from "../storage/data-root.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function asArray(payload, keys = []) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
}

function fixtureId(row) {
  return String(row?.matchId ?? row?.id ?? row?.fixtureId ?? "");
}

function statusBucket(row) {
  return [
    row?.status,
    row?.operationalState,
    row?.state,
    row?.statusType,
    row?.rawStatus,
    row?.sourceStatus,
    row?.sourceStatusType
  ]
    .map(v => String(v || "").trim().toUpperCase())
    .filter(Boolean)
    .join(" ");
}

function scoreHome(row) {
  return row?.scoreHome ?? row?.homeScore ?? null;
}

function scoreAway(row) {
  return row?.scoreAway ?? row?.awayScore ?? null;
}

function hasFiniteScore(row) {
  return Number.isFinite(Number(scoreHome(row))) && Number.isFinite(Number(scoreAway(row)));
}

function isTerminal(row) {
  return /\b(FT|FULL_TIME|STATUS_FULL_TIME|FINAL|STATUS_FINAL|STATUS_FINAL_AET|AET|PEN|POSTPONED|CANCELLED|CANCELED|ABANDONED|WO|WALKOVER)\b/i.test(statusBucket(row));
}

function isOpenLike(row) {
  if (isTerminal(row)) return false;

  const bucket = statusBucket(row);

  if (!bucket) return true;

  return /\b(PRE|SCHEDULED|STATUS_SCHEDULED|UNKNOWN|STALE|LIVE|FIRST_HALF|SECOND_HALF|HALF_TIME|IN_PROGRESS|STATUS_IN_PROGRESS|EXTRA_TIME)\b/i.test(bucket);
}

function teamName(row, side) {
  if (side === "home") return row?.home ?? row?.homeTeam ?? row?.homeName ?? null;
  return row?.away ?? row?.awayTeam ?? row?.awayName ?? null;
}

function leagueOf(row) {
  return row?.leagueSlug ?? row?.league ?? row?.competitionSlug ?? null;
}

function readCanonicalRows(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  const rows = [];

  if (!fs.existsSync(dir)) {
    return {
      source: "canonical-fixtures",
      dir,
      exists: false,
      rows
    };
  }

  for (const name of fs.readdirSync(dir).filter(x => x.endsWith(".json")).sort()) {
    const payload = readJsonSafe(path.join(dir, name), null);
    const fixtures = asArray(payload, ["fixtures", "rows", "items"]);

    for (const row of fixtures) {
      rows.push(row);
    }
  }

  return {
    source: "canonical-fixtures",
    dir,
    exists: true,
    rows
  };
}

function readJsonDbRows(dayKey) {
  const file = resolveDataPath("fixtures.json");
  const payload = readJsonSafe(file, null);
  const fixtures = asArray(payload, ["fixtures", "rows", "items"])
    .filter(row => String(row?.dayKey || row?.date || "") === String(dayKey));

  return {
    source: "fixtures.json",
    file,
    exists: fs.existsSync(file),
    rows: fixtures
  };
}

function summarizeRows(dayKey, rows, sourceMeta = {}) {
  const statusCounts = {};
  const openByStatus = {};
  const openByLeague = {};
  const missingScoreByStatus = {};
  const duplicateIds = [];
  const seen = new Set();

  let terminal = 0;
  let terminalWithScore = 0;
  let terminalMissingScore = 0;
  let open = 0;
  let unknown = 0;

  const openFixtures = [];
  const terminalMissingScoreFixtures = [];

  for (const row of rows) {
    const id = fixtureId(row);
    if (id) {
      if (seen.has(id)) duplicateIds.push(id);
      seen.add(id);
    }

    const bucket = statusBucket(row) || "UNKNOWN";
    statusCounts[bucket] = (statusCounts[bucket] || 0) + 1;

    const terminalLike = isTerminal(row);
    const openLike = isOpenLike(row);
    const hasScore = hasFiniteScore(row);

    if (terminalLike) {
      terminal += 1;

      if (hasScore) {
        terminalWithScore += 1;
      } else {
        terminalMissingScore += 1;
        missingScoreByStatus[bucket] = (missingScoreByStatus[bucket] || 0) + 1;

        terminalMissingScoreFixtures.push({
          id,
          league: leagueOf(row),
          home: teamName(row, "home"),
          away: teamName(row, "away"),
          status: bucket,
          scoreHome: scoreHome(row),
          scoreAway: scoreAway(row)
        });
      }

      continue;
    }

    if (openLike) {
      open += 1;
      openByStatus[bucket] = (openByStatus[bucket] || 0) + 1;

      const league = leagueOf(row) || "unknown";
      openByLeague[league] = (openByLeague[league] || 0) + 1;

      openFixtures.push({
        id,
        league,
        home: teamName(row, "home"),
        away: teamName(row, "away"),
        status: bucket,
        scoreHome: scoreHome(row),
        scoreAway: scoreAway(row)
      });

      continue;
    }

    unknown += 1;
    open += 1;
    openByStatus[bucket] = (openByStatus[bucket] || 0) + 1;

    const league = leagueOf(row) || "unknown";
    openByLeague[league] = (openByLeague[league] || 0) + 1;

    openFixtures.push({
      id,
      league,
      home: teamName(row, "home"),
      away: teamName(row, "away"),
      status: bucket,
      scoreHome: scoreHome(row),
      scoreAway: scoreAway(row)
    });
  }

  const safeToFinalizeStats =
    rows.length > 0 &&
    open === 0 &&
    terminalMissingScore === 0 &&
    duplicateIds.length === 0;

  return {
    ok: true,
    dayKey,
    source: sourceMeta.source || null,
    sourcePath: sourceMeta.file || sourceMeta.dir || null,
    sourceExists: Boolean(sourceMeta.exists),
    fixtures: rows.length,
    terminal,
    terminalWithScore,
    terminalMissingScore,
    open,
    unknown,
    duplicateIdCount: duplicateIds.length,
    safeToFinalizeStats,
    statusCounts,
    openByStatus,
    openByLeague,
    missingScoreByStatus,
    openFixtures,
    terminalMissingScoreFixtures,
    duplicateIds: duplicateIds.slice(0, 100)
  };
}

export function auditFinalizationReadinessDay(dayKey, options = {}) {
  const preferredSource = String(options.source || "canonical").toLowerCase();

  const canonical = readCanonicalRows(dayKey);
  const jsonDb = readJsonDbRows(dayKey);

  const selected =
    preferredSource === "json-db"
      ? jsonDb
      : canonical.rows.length
        ? canonical
        : jsonDb;

  const summary = summarizeRows(dayKey, selected.rows, selected);

  return {
    ...summary,
    fallbackUsed: selected.source !== preferredSource && preferredSource !== "canonical",
    sources: {
      canonical: {
        exists: canonical.exists,
        rows: canonical.rows.length,
        dir: canonical.dir
      },
      jsonDb: {
        exists: jsonDb.exists,
        rows: jsonDb.rows.length,
        file: jsonDb.file
      }
    }
  };
}

function parseCliArgs(argv) {
  const out = {
    dayKey: null,
    source: "canonical"
  };

  for (const arg of argv) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      out.dayKey = arg;
      continue;
    }

    if (arg.startsWith("--date=")) {
      out.dayKey = arg.slice("--date=".length);
      continue;
    }

    if (arg.startsWith("--day=")) {
      out.dayKey = arg.slice("--day=".length);
      continue;
    }

    if (arg.startsWith("--source=")) {
      out.source = arg.slice("--source=".length);
      continue;
    }
  }

  return out;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = parseCliArgs(process.argv.slice(2));

  if (!args.dayKey) {
    console.error(JSON.stringify({
      ok: false,
      reason: "missing_day",
      usage: "node engine-v1/jobs/audit-finalization-readiness-day.js --date=YYYY-MM-DD"
    }, null, 2));
    process.exitCode = 1;
  } else {
    const result = auditFinalizationReadinessDay(args.dayKey, {
      source: args.source
    });

    console.log(JSON.stringify(result, null, 2));

    if (!result.safeToFinalizeStats) {
      process.exitCode = 2;
    }
  }
}
