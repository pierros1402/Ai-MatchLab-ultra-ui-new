#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const args = {
    date: "",
    standingsDir: path.join(repoRoot, "data", "standings"),
    output: "",
    selfTest: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--date") args.date = argv[++index];
    else if (arg === "--standings-dir") args.standingsDir = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function collectStandingsRows(standings) {
  if (Array.isArray(standings.table)) return standings.table;

  const rows = [];
  if (standings.phaseTables && typeof standings.phaseTables === "object") {
    for (const value of Object.values(standings.phaseTables)) {
      if (Array.isArray(value)) rows.push(...value);
    }
  }

  return rows;
}

function collectPhaseKeys(standings) {
  const keys = new Set();

  if (standings.phases && typeof standings.phases === "object") {
    Object.keys(standings.phases).forEach((key) => keys.add(key));
  }

  if (standings.phaseTables && typeof standings.phaseTables === "object") {
    Object.keys(standings.phaseTables).forEach((key) => keys.add(key));
  }

  return [...keys].sort();
}

function normalizeDate(value) {
  if (value == null) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function expectedDoubleRoundRobinMatches(teamCount) {
  if (!Number.isFinite(teamCount) || teamCount < 2) return null;
  return (teamCount - 1) * 2;
}

function inferSeasonStatus({ teamCount, minPlayed, maxPlayed, confidence, completeness, phaseKeys }) {
  if (teamCount <= 0) {
    return {
      standingsEvidenceState: "no_standings_table_available",
      seasonStatusState: "unknown_needs_evidence",
      seasonActiveCandidate: false,
      seasonFinishedCandidate: false,
      breakOrCalendarGapCandidate: false,
      nextRequiredAction: "discover_standings_or_competition_calendar",
      confidence: 0
    };
  }

  if (maxPlayed <= 0) {
    return {
      standingsEvidenceState: "standings_available_without_played_matches",
      seasonStatusState: "preseason_or_not_started_candidate",
      seasonActiveCandidate: false,
      seasonFinishedCandidate: false,
      breakOrCalendarGapCandidate: false,
      nextRequiredAction: "discover_first_fixture_date",
      confidence: Math.min(confidence, 0.45)
    };
  }

  if (confidence < 0.35 || completeness < 0.35) {
    return {
      standingsEvidenceState: "low_confidence_standings_with_played_matches",
      seasonStatusState: "season_status_needs_calendar_evidence",
      seasonActiveCandidate: false,
      seasonFinishedCandidate: false,
      breakOrCalendarGapCandidate: true,
      nextRequiredAction: "crosscheck_standings_and_competition_calendar",
      confidence: Math.min(confidence, 0.45)
    };
  }

  const expectedMatches = expectedDoubleRoundRobinMatches(teamCount);
  const hasSplitOrPlayoffPhase = phaseKeys.some((key) => /split|playoff|championship|relegation|promotion/i.test(key));
  const nearRegularCompletion = expectedMatches != null &&
    minPlayed >= Math.max(1, expectedMatches - 1) &&
    maxPlayed >= Math.max(1, expectedMatches - 1);

  if (nearRegularCompletion && !hasSplitOrPlayoffPhase) {
    return {
      standingsEvidenceState: "standings_available_with_played_matches",
      seasonStatusState: "regular_season_complete_or_near_complete_candidate",
      seasonActiveCandidate: false,
      seasonFinishedCandidate: true,
      breakOrCalendarGapCandidate: false,
      nextRequiredAction: "verify_final_table_or_next_season_restart",
      confidence
    };
  }

  return {
    standingsEvidenceState: "standings_available_with_played_matches",
    seasonStatusState: "standings_available_needs_calendar_evidence",
    seasonActiveCandidate: false,
    seasonFinishedCandidate: false,
    breakOrCalendarGapCandidate: true,
    nextRequiredAction: "discover_competition_calendar_or_next_fixture_date",
    confidence
  };
}

function buildSeasonStatusRow({ filePath, standings, targetDate }) {
  const leagueSlug = asText(standings.league) || path.basename(filePath, ".json");
  const rows = collectStandingsRows(standings);
  const phaseKeys = collectPhaseKeys(standings);
  const playedValues = rows
    .map((row) => asNumber(row.played, NaN))
    .filter((value) => Number.isFinite(value));

  const teamCount = rows.length;
  const minPlayed = playedValues.length ? Math.min(...playedValues) : 0;
  const maxPlayed = playedValues.length ? Math.max(...playedValues) : 0;
  const avgPlayed = playedValues.length
    ? playedValues.reduce((sum, value) => sum + value, 0) / playedValues.length
    : 0;

  const inputConfidence = asNumber(standings.confidence, 0);
  const completeness = asNumber(standings.completeness, 0);

  const inferred = inferSeasonStatus({
    teamCount,
    minPlayed,
    maxPlayed,
    confidence: inputConfidence,
    completeness,
    phaseKeys
  });

  return {
    leagueSlug,
    targetDate,
    sourceFile: path.relative(repoRoot, filePath).replace(/\\/g, "/"),
    standingsUpdatedAt: normalizeDate(standings.updatedAt),
    standingsEvidenceState: inferred.standingsEvidenceState,
    seasonStatusState: inferred.seasonStatusState,
    teamCount,
    rowsWithPlayed: playedValues.length,
    minPlayed,
    maxPlayed,
    avgPlayed: Number(avgPlayed.toFixed(3)),
    expectedRegularMatchesPerTeam: expectedDoubleRoundRobinMatches(teamCount),
    phaseKeys,
    confidence: Number(inferred.confidence.toFixed(3)),
    inputConfidence,
    completeness,
    seasonActiveCandidate: inferred.seasonActiveCandidate,
    seasonFinishedCandidate: inferred.seasonFinishedCandidate,
    breakOrCalendarGapCandidate: inferred.breakOrCalendarGapCandidate,
    suggestedDayActivityState: inferred.seasonActiveCandidate
      ? "season_active_no_target_date_fixture_or_break_candidate"
      : inferred.seasonStatusState,
    fixtureAcquisitionMode: "requires_day_fixture_evidence_before_target_date_acquisition",
    nextRequiredAction: inferred.nextRequiredAction,
    hardExcludedFromFutureSearch: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport({ standingsDir, targetDate }) {
  if (!fs.existsSync(standingsDir)) {
    throw new Error(`standings dir not found: ${standingsDir}`);
  }

  const files = fs.readdirSync(standingsDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(standingsDir, name));

  const rows = [];
  const rejectedRows = [];

  for (const filePath of files) {
    try {
      rows.push(buildSeasonStatusRow({
        filePath,
        standings: readJson(filePath),
        targetDate
      }));
    } catch (error) {
      rejectedRows.push({
        sourceFile: path.relative(repoRoot, filePath).replace(/\\/g, "/"),
        error: error.message
      });
    }
  }

  const bySeasonStatusState = {};
  const byStandingsEvidenceState = {};
  for (const row of rows) {
    bySeasonStatusState[row.seasonStatusState] = (bySeasonStatusState[row.seasonStatusState] || 0) + 1;
    byStandingsEvidenceState[row.standingsEvidenceState] = (byStandingsEvidenceState[row.standingsEvidenceState] || 0) + 1;
  }

  return {
    ok: rejectedRows.length === 0,
    reportType: "league-season-status-from-standings",
    generatedAt: new Date().toISOString(),
    targetDate,
    summary: {
      standingsFileCount: files.length,
      seasonStatusRowCount: rows.length,
      rejectedRowCount: rejectedRows.length,
      seasonActiveCandidateCount: rows.filter((row) => row.seasonActiveCandidate).length,
      seasonFinishedCandidateCount: rows.filter((row) => row.seasonFinishedCandidate).length,
      breakOrCalendarGapCandidateCount: rows.filter((row) => row.breakOrCalendarGapCandidate).length,
      noStandingsTableCount: rows.filter((row) => row.standingsEvidenceState === "no_standings_table_available").length,
      bySeasonStatusState,
      byStandingsEvidenceState,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false
    },
    rows,
    rejectedRows,
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      hardExcludedFromFutureSearch: false
    }
  };
}

function runSelfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "league-season-status-self-test-"));

  try {
    writeJson(path.join(dir, "active.1.json"), {
      league: "active.1",
      updatedAt: "2026-06-02T00:00:00Z",
      confidence: 0.9,
      completeness: 1,
      table: [
        { team: "Alpha", played: 2, points: 6 },
        { team: "Beta", played: 2, points: 4 },
        { team: "Gamma", played: 1, points: 3 },
        { team: "Delta", played: 1, points: 1 }
      ],
      phases: { regular: {} }
    });

    writeJson(path.join(dir, "empty.1.json"), {
      league: "empty.1",
      updatedAt: "2026-06-02T00:00:00Z",
      confidence: 0,
      completeness: 0,
      table: []
    });

    const report = buildReport({ standingsDir: dir, targetDate: "2026-06-02" });

    if (report.summary.standingsFileCount !== 2) throw new Error("expected two standings files");
    if (report.summary.seasonActiveCandidateCount !== 0) throw new Error("standings alone must not create active season candidates");
    if (report.summary.bySeasonStatusState.standings_available_needs_calendar_evidence !== 1) throw new Error("expected standings to require calendar evidence");
    if (report.summary.noStandingsTableCount !== 1) throw new Error("expected one empty standings row");
    if (report.summary.canonicalWrites !== 0) throw new Error("must not write canonical data");
    if (report.summary.productionWrite !== false) throw new Error("must not write production data");
    if (report.guarantees.noWebSearch !== true) throw new Error("must not web search");

    return {
      ok: true,
      selfTest: "build-league-season-status-from-standings",
      summary: report.summary
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const targetDate = args.date || new Date().toISOString().slice(0, 10);
  const output = args.output || path.join(
    repoRoot,
    "data",
    "football-truth",
    "_state",
    "league-season-status",
    `${targetDate}.json`
  );

  const report = buildReport({
    standingsDir: path.resolve(args.standingsDir),
    targetDate
  });

  writeJson(path.resolve(output), report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: path.relative(repoRoot, path.resolve(output)).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main();
}
