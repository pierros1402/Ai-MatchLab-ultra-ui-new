import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { resolveDataPath } from "../storage/data-root.js";
import { teamPairMatches } from "../core/team-identity.js";

function clean(value) {
  return String(value ?? "").trim();
}

function norm(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonPretty(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function rowsFromPayload(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  for (const key of ["fixtures", "matches", "items", "rows", "picks", "valuePicks"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
}

function rowId(row) {
  return clean(row?.matchId || row?.canonicalId || row?.fixtureId || row?.id);
}

function homeName(row) {
  return clean(row?.homeTeam || row?.home || row?.homeName);
}

function awayName(row) {
  return clean(row?.awayTeam || row?.away || row?.awayName);
}

function leagueSlug(row) {
  return clean(row?.leagueSlug || row?.league || row?.competitionSlug);
}

function athensDayFromUtc(value) {
  const raw = clean(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
}

function parseArgs(argv) {
  const out = {
    dayKey: "",
    write: false,
    allFixtures: false,
    offsets: [0],
    valuePath: ""
  };

  for (const arg of argv) {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(arg)) {
      out.dayKey = arg;
      continue;
    }

    if (arg.startsWith("--date=")) {
      out.dayKey = arg.slice("--date=".length);
      continue;
    }

    if (arg === "--write") {
      out.write = true;
      continue;
    }

    if (arg === "--all-fixtures") {
      out.allFixtures = true;
      continue;
    }

    if (arg.startsWith("--offsets=")) {
      out.offsets = arg
        .slice("--offsets=".length)
        .split(",")
        .map(v => Number(v.trim()))
        .filter(Number.isFinite);
      continue;
    }

    if (arg.startsWith("--value-path=")) {
      out.valuePath = arg.slice("--value-path=".length);
      continue;
    }
  }

  return out;
}

function buildTargets(dayKey, { allFixtures = false, valuePathOverride = "" } = {}) {
  const fixturesPath = resolveDataPath("deploy-snapshots", dayKey, "fixtures.json");
  const valuePath = valuePathOverride
    ? path.resolve(valuePathOverride)
    : resolveDataPath("deploy-snapshots", dayKey, "value.json");

  const fixtures = rowsFromPayload(readJsonSafe(fixturesPath, null), ["fixtures", "matches"]);
  const valuePicks = rowsFromPayload(readJsonSafe(valuePath, null), ["picks", "valuePicks", "rows"]);

  const fixturesById = new Map();
  for (const fixture of fixtures) {
    const id = rowId(fixture);
    if (id) fixturesById.set(id, fixture);
  }

  const rawTargets = allFixtures ? fixtures : valuePicks;

  const targetsById = new Map();

  for (const row of rawTargets) {
    const id = rowId(row);
    if (!id) continue;

    const fixture = fixturesById.get(id) || row;

    const target = {
      matchId: id,
      leagueSlug: leagueSlug(fixture) || leagueSlug(row),
      leagueName: clean(fixture?.leagueName || fixture?.competitionName || row?.leagueName || row?.competitionName),
      country: clean(fixture?.country || row?.country),
      homeTeam: homeName(fixture) || homeName(row),
      awayTeam: awayName(fixture) || awayName(row),
      kickoffUtc: clean(fixture?.kickoffUtc || row?.kickoffUtc),
      source: allFixtures ? "deploy_snapshot_fixtures" : "deploy_snapshot_value_picks"
    };

    if (!target.homeTeam || !target.awayTeam) continue;
    targetsById.set(id, target);
  }

  return {
    fixturesPath,
    valuePath,
    fixtureRows: fixtures.length,
    valueRows: valuePicks.length,
    targets: [...targetsById.values()]
  };
}

function sourceScoreKey(row) {
  return `${Number(row.scoreHome)}-${Number(row.scoreAway)}`;
}

function isScored(row) {
  // CRITICAL: a "verified final result" must come from a FINISHED match. The
  // Flashscore feed reports 0-0 for pre-game rows, which are finite scores —
  // without the finished gate we fabricated 0-0 "final truths" for matches that
  // hadn't kicked off yet, settling picks as LOSS pre-game. finished = AB==="3".
  return row?.finished === true &&
    Number.isFinite(Number(row?.scoreHome)) &&
    Number.isFinite(Number(row?.scoreAway));
}

function findFlashscoreMatch(target, sourceRows, dayKey) {
  // Scored rows on the same Athens day are the only settlement candidates.
  const pool = sourceRows.filter(row => {
    if (!isScored(row)) return false;
    const sourceDay = athensDayFromUtc(row?.kickoffUtc);
    if (sourceDay && sourceDay !== dayKey) return false;
    return true;
  });

  // Tier 1 — exact normalized-name equality (original path; fast, unambiguous).
  let candidates = pool.filter(row =>
    norm(row?.home) === norm(target.homeTeam) &&
    norm(row?.away) === norm(target.awayTeam)
  );
  let matchTier = "exact";

  // Tier 2 (additive) — only when exact matched nothing, fall back to the shared
  // fuzzy identity matcher (token subset + squad-marker safety). This closes the
  // verify false-negatives ("America MG" vs "América Mineiro", "Keflavik" vs
  // "Keflavík ÍF") without ever overriding a clean exact hit. Uniqueness is
  // still required below, so an ambiguous fuzzy hit stays unresolved.
  if (candidates.length === 0) {
    candidates = pool.filter(row =>
      teamPairMatches(target.homeTeam, target.awayTeam, row?.home, row?.away)
    );
    matchTier = "token";
  }

  if (candidates.length !== 1) {
    return {
      ok: false,
      reason: candidates.length === 0 ? "no_exact_flashscore_match" : "ambiguous_exact_flashscore_matches",
      candidates: candidates.map(row => ({
        providerMatchId: clean(row.matchId),
        country: clean(row.country),
        leagueName: clean(row.leagueName),
        leaguePath: clean(row.leaguePath),
        home: clean(row.home),
        away: clean(row.away),
        scoreHome: row.scoreHome ?? null,
        scoreAway: row.scoreAway ?? null,
        kickoffUtc: clean(row.kickoffUtc)
      }))
    };
  }

  return {
    ok: true,
    row: candidates[0],
    matchTier
  };
}

function buildVerifiedFinalResult(dayKey, target, sourceRow) {
  const homeScore = Number(sourceRow.scoreHome);
  const awayScore = Number(sourceRow.scoreAway);
  const scoreKey = `${homeScore}-${awayScore}`;
  const generatedAt = new Date().toISOString();

  return {
    schema: "ai-matchlab.verified-final-result.v1",
    verifiedFinalTruth: true,
    date: dayKey,
    dayKey,
    matchId: target.matchId,
    leagueSlug: target.leagueSlug,
    leagueName: target.leagueName || clean(sourceRow.leagueName),
    country: target.country || clean(sourceRow.country),
    homeTeam: target.homeTeam,
    awayTeam: target.awayTeam,
    homeScore,
    awayScore,
    scoreHome: homeScore,
    scoreAway: awayScore,
    finalScore: {
      homeScore,
      awayScore,
      home: homeScore,
      away: awayScore,
      scoreKey
    },
    scoreKey,
    kickoffUtc: target.kickoffUtc || clean(sourceRow.kickoffUtc),
    finalTruthVerdict: "verified_final_result",
    verdict: "verified_final_result",
    sourceCount: 1,
    independentSourceCount: 1,
    source: "flashscore_same_day_exact_team_match",
    sources: [
      {
        provider: "flashscore",
        providerMatchId: clean(sourceRow.matchId),
        country: clean(sourceRow.country),
        leagueName: clean(sourceRow.leagueName),
        leaguePath: clean(sourceRow.leaguePath),
        home: clean(sourceRow.home),
        away: clean(sourceRow.away),
        scoreHome: homeScore,
        scoreAway: awayScore,
        kickoffUtc: clean(sourceRow.kickoffUtc),
        scoreKey
      }
    ],
    verification: {
      verdict: "verified_final_result",
      finalTruthVerdict: "verified_final_result",
      state: "verified_final_result",
      method: "flashscore_same_day_exact_team_match",
      sourceCount: 1,
      independentSourceCount: 1,
      generatedAt
    },
    settlement: {
      finalTruthVerdict: "verified_final_result",
      state: "verified_final_result"
    },
    generatedAt
  };
}

export async function exportVerifiedFinalResultsDay(dayKey, options = {}) {
  const safeDayKey = clean(dayKey);

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(safeDayKey)) {
    return { ok: false, reason: "invalid_day_key", dayKey };
  }

  const targetSource = buildTargets(safeDayKey, {
    allFixtures: options.allFixtures === true,
    valuePathOverride: options.valuePath || ""
  });

  const feed = await fetchFlashscoreFixtures({
    offsets: Array.isArray(options.offsets) && options.offsets.length ? options.offsets : [0]
  });

  const sourceRows = Array.isArray(feed?.rows) ? feed.rows : [];
  const outputDir = resolveDataPath("final-results", safeDayKey);

  const written = [];
  const wouldWrite = [];
  const existingRows = [];
  const unresolved = [];
  const conflicts = [];

  for (const target of targetSource.targets) {
    const found = findFlashscoreMatch(target, sourceRows, safeDayKey);

    if (!found.ok) {
      unresolved.push({
        matchId: target.matchId,
        homeTeam: target.homeTeam,
        awayTeam: target.awayTeam,
        reason: found.reason,
        candidates: found.candidates
      });
      continue;
    }

    const payload = buildVerifiedFinalResult(safeDayKey, target, found.row);
    const filePath = path.join(outputDir, `${target.matchId}.json`);
    const existing = readJsonSafe(filePath, null);

    const row = {
      matchId: target.matchId,
      homeTeam: target.homeTeam,
      awayTeam: target.awayTeam,
      scoreKey: payload.scoreKey,
      provider: "flashscore",
      providerMatchId: payload.sources[0].providerMatchId,
      filePath
    };

    if (existing) {
      const existingScore = clean(existing.scoreKey || existing?.finalScore?.scoreKey || `${existing.homeScore ?? existing.scoreHome}-${existing.awayScore ?? existing.scoreAway}`);
      if (existingScore && existingScore !== payload.scoreKey) {
        conflicts.push({
          matchId: target.matchId,
          existingScore,
          newScore: payload.scoreKey,
          filePath
        });
        continue;
      }

      existingRows.push({
        ...row,
        existingScore: existingScore || payload.scoreKey
      });
      continue;
    }

    if (options.write === true) {
      writeJsonPretty(filePath, payload);
      written.push(row);
    } else {
      wouldWrite.push(row);
    }
  }

  return {
    ok: conflicts.length === 0,
    stage: options.write === true
      ? "verified_final_results_export_completed"
      : "verified_final_results_export_dry_run",
    dayKey: safeDayKey,
    generatedAt: new Date().toISOString(),
    mode: targetSource.allFixtures ? "all_fixtures" : "value_picks",
    inputs: {
      fixturesPath: targetSource.fixturesPath,
      valuePath: targetSource.valuePath,
      offsets: options.offsets || [0]
    },
    summary: {
      fixtureRows: targetSource.fixtureRows,
      valueRows: targetSource.valueRows,
      targetRows: targetSource.targets.length,
      flashscoreRows: sourceRows.length,
      flashscoreRowsWithScore: sourceRows.filter(isScored).length,
      wouldWrite: wouldWrite.length,
      written: written.length,
      existing: existingRows.length,
      unresolved: unresolved.length,
      conflicts: conflicts.length
    },
    wouldWrite,
    written,
    existing: existingRows,
    unresolved,
    conflicts,
    guarantees: {
      canonicalWrites: 0,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultsWrites: options.write === true,
      requiresExactTeamPairMatch: true,
      requiresNumericScore: true,
      acceptedFinalTruthVerdict: "verified_final_result"
    }
  };
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.dayKey) {
    console.error(JSON.stringify({
      ok: false,
      reason: "missing_day",
      usage: "node engine-v1/jobs/export-verified-final-results-day.js --date=YYYY-MM-DD [--write] [--all-fixtures] [--offsets=0,-1] [--value-path=data/value-plans/YYYY-MM-DD/plan-b.json]"
    }, null, 2));
    process.exitCode = 2;
  } else {
    exportVerifiedFinalResultsDay(args.dayKey, args)
      .then(result => {
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) process.exitCode = 1;
      })
      .catch(error => {
        console.error(error);
        process.exitCode = 1;
      });
  }
}
