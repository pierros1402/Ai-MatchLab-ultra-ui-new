#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    canonicalRoot: path.join(repoRoot, "data", "canonical-fixtures"),
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--canonical-root") args.canonicalRoot = argv[++i] || "";
    else if (arg.startsWith("--canonical-root=")) args.canonicalRoot = arg.slice("--canonical-root=".length);
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function evidenceRowsOf(input) {
  if (Array.isArray(input?.evidenceRows)) return input.evidenceRows;
  if (Array.isArray(input?.fixtureEvidenceRows)) return input.fixtureEvidenceRows;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input)) return input;
  return [];
}

function canonicalRowsOf(input) {
  if (Array.isArray(input?.fixtures)) return input.fixtures;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input?.matches)) return input.matches;
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") return [input];
  return [];
}

function normalizeTeamName(value) {
  return asText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(football club|club de futbol|fc|afc|cf|sc|ac|cd|fk|sk|sv|as|bk|calcio|club)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function kickoffMs(value) {
  const text = asText(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function kickoffMinuteKey(value) {
  const ms = kickoffMs(value);
  if (ms == null) return "";
  return new Date(Math.floor(ms / 60000) * 60000).toISOString().slice(0, 16);
}

function canonicalPathFor(row, canonicalRoot) {
  const dayKey = asText(row.kickoffDate || row.dayKey || asText(row.kickoffUtc).slice(0, 10));
  const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
  if (!dayKey || !leagueSlug) return "";
  return path.join(canonicalRoot, dayKey, `${leagueSlug}.json`);
}

function loadCanonicalRowsFor(row, canonicalRoot) {
  const filePath = canonicalPathFor(row, canonicalRoot);
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      canonicalPath: filePath,
      exists: false,
      rows: []
    };
  }

  const input = readJson(filePath);
  return {
    canonicalPath: filePath,
    exists: true,
    rows: canonicalRowsOf(input)
  };
}

function rowTeamPair(row) {
  return {
    home: normalizeTeamName(row.homeTeam || row.home),
    away: normalizeTeamName(row.awayTeam || row.away)
  };
}

function sameTeamPair(a, b) {
  const left = rowTeamPair(a);
  const right = rowTeamPair(b);

  return Boolean(
    left.home &&
    left.away &&
    right.home &&
    right.away &&
    left.home === right.home &&
    left.away === right.away
  );
}

function sameKickoffWindow(a, b, toleranceMinutes = 240) {
  const aMs = kickoffMs(a.kickoffUtc || a.utcDateTime || a.dateTime || a.kickoff);
  const bMs = kickoffMs(b.kickoffUtc || b.utcDateTime || b.dateTime || b.kickoff);

  if (aMs == null || bMs == null) return false;
  return Math.abs(aMs - bMs) <= toleranceMinutes * 60000;
}

function directIdMatch(existing, evidence) {
  const evidenceIds = new Set([
    asText(evidence.matchId),
    asText(evidence.fixtureId),
    asText(evidence.sourceMatchId),
    asText(evidence.sourceId)
  ].filter(Boolean));

  const existingIds = [
    asText(existing.id),
    asText(existing.matchId),
    asText(existing.fixtureId),
    asText(existing.sourceMatchId),
    asText(existing.sourceId)
  ].filter(Boolean);

  return existingIds.some((id) => evidenceIds.has(id));
}

function findExistingCanonicalMatch(existingRows, evidenceRow) {
  for (const existing of existingRows) {
    if (directIdMatch(existing, evidenceRow)) {
      return {
        row: existing,
        duplicateReason: "direct_match_id"
      };
    }
  }

  for (const existing of existingRows) {
    if (sameTeamPair(existing, evidenceRow) && sameKickoffWindow(existing, evidenceRow)) {
      return {
        row: existing,
        duplicateReason: "same_teams_and_kickoff_window"
      };
    }
  }

  for (const existing of existingRows) {
    if (sameTeamPair(existing, evidenceRow) && asText(existing.dayKey || existing.kickoffDate) === asText(evidenceRow.kickoffDate)) {
      return {
        row: existing,
        duplicateReason: "same_teams_and_day"
      };
    }
  }

  return null;
}

function statusRank(status) {
  const value = asText(status).toUpperCase();
  if (value === "FINISHED" || value === "FT" || value === "AET" || value === "PEN") return 3;
  if (value === "LIVE" || value.includes("IN_PROGRESS")) return 2;
  if (value === "PRE" || value === "SCHEDULED" || value === "STATUS_SCHEDULED") return 1;
  return 0;
}

function canonicalStatusFromEvidence(row) {
  const outcomeStatus = asText(row.outcomeStatus).toUpperCase();
  const status = asText(row.status).toUpperCase();
  const decidedBy = asText(row.decidedBy);

  if (outcomeStatus === "PEN" || decidedBy === "penalties") return "PEN";
  if (outcomeStatus === "AET" || decidedBy === "extra_time") return "AET";
  if (outcomeStatus === "FT" || status === "FINISHED" || status === "FT") return "FT";
  if (status === "SCHEDULED" || status === "PRE" || status === "UPCOMING") return "PRE";
  return outcomeStatus || status || "UNKNOWN";
}

function cloneOrNull(value) {
  if (!value || typeof value !== "object") return null;
  return JSON.parse(JSON.stringify(value));
}

function proposedFixtureFromEvidence(row, existing = null) {
  const kickoffUtc = asText(row.kickoffUtc);
  const dayKey = asText(row.kickoffDate || kickoffUtc.slice(0, 10));

  return {
    matchId: asText(existing?.matchId || row.matchId),
    matchKey: [
      normalizeTeamName(row.homeTeam),
      normalizeTeamName(row.awayTeam),
      kickoffMs(kickoffUtc) || kickoffUtc
    ].join("|"),
    source: "uefa_api",
    sourceId: asText(row.matchId),
    sourceMatchId: asText(row.matchId),
    leagueSlug: asText(row.leagueSlug),
    leagueName: asText(row.competitionName || "UEFA Champions League"),
    dayKey,
    fetchedDayKey: dayKey,
    kickoffUtc,
    homeTeam: asText(row.homeTeam),
    awayTeam: asText(row.awayTeam),
    scoreHome: row.scoreHome,
    scoreAway: row.scoreAway,
    regularScore: cloneOrNull(row.regularScore),
    halfTimeScore: cloneOrNull(row.halfTimeScore),
    extraTimeScore: cloneOrNull(row.extraTimeScore),
    aggregateScore: cloneOrNull(row.aggregateScore),
    penalties: cloneOrNull(row.penaltyScore),
    decidedBy: asText(row.decidedBy) || null,
    status: canonicalStatusFromEvidence(row),
    rawStatus: asText(row.status),
    minute: ["FT", "AET", "PEN"].includes(canonicalStatusFromEvidence(row)) ? canonicalStatusFromEvidence(row) : "",
    venue: asText(row.stadiumName),
    sourceEvidence: {
      sourceType: asText(row.sourceType),
      evidenceRowId: asText(row.evidenceRowId),
      apiCandidateId: asText(row.apiCandidateId),
      apiFamily: asText(row.apiFamily),
      sourceUrl: asText(row.sourceUrl),
      fetchedAt: asText(row.fetchedAt),
      competitionCode: asText(row.competitionCode),
      competitionId: asText(row.competitionId),
      seasonYear: asText(row.seasonYear),
      roundName: asText(row.roundName),
      outcomeStatus: asText(row.outcomeStatus),
      decidedBy: asText(row.decidedBy),
      halfTimeScoreAvailable: Boolean(row.halfTimeScoreAvailable),
      halfTimeScoreSourceKey: asText(row.halfTimeScoreSourceKey),
      halfTimeScoreReason: row.halfTimeScoreAvailable ? "" : "not_provided_by_uefa_match_api_score_payload",
      matchWinnerReason: asText(row.matchWinnerReason),
      aggregateWinnerReason: asText(row.aggregateWinnerReason),
      matchWinnerTeamId: asText(row.matchWinnerTeamId),
      aggregateWinnerTeamId: asText(row.aggregateWinnerTeamId)
    }
  };
}

function planRowForEvidence(row, index, canonicalRoot) {
  const canonical = loadCanonicalRowsFor(row, canonicalRoot);
  const existingMatch = findExistingCanonicalMatch(canonical.rows, row);

  if (!row.acceptedForEvidence) {
    return {
      planRowId: `${asText(row.evidenceRowId) || "evidence"}::promotion_plan::${String(index + 1).padStart(3, "0")}`,
      planState: "rejected",
      blockedReason: "evidence_row_not_accepted",
      evidenceRow: row,
      canonicalPath: canonical.canonicalPath,
      canonicalFileExists: canonical.exists,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  }

  if (existingMatch) {
    const existing = existingMatch.row;
    const evidenceStatusRank = statusRank(row.status);
    const existingStatusRank = statusRank(existing.status || existing.rawStatus);
    const evidenceHasScore = row.scoreHome != null && row.scoreAway != null;
    const existingHasScore = existing.scoreHome != null && existing.scoreAway != null;
    const needsUpdate = evidenceStatusRank > existingStatusRank || (evidenceHasScore && !existingHasScore);

    return {
      planRowId: `${asText(row.evidenceRowId)}::promotion_plan::${String(index + 1).padStart(3, "0")}`,
      planState: needsUpdate ? "existing_canonical_update_candidate" : "duplicate_existing_canonical_no_action",
      duplicateReason: existingMatch.duplicateReason,
      canonicalPath: canonical.canonicalPath,
      canonicalFileExists: canonical.exists,
      evidenceRowId: asText(row.evidenceRowId),
      leagueSlug: asText(row.leagueSlug),
      matchId: asText(row.matchId),
      dayKey: asText(row.kickoffDate),
      homeTeam: asText(row.homeTeam),
      awayTeam: asText(row.awayTeam),
      kickoffUtc: asText(row.kickoffUtc),
      existingCanonicalFixture: existing,
      proposedCanonicalFixture: proposedFixtureFromEvidence(row, existing),
      proposedAction: needsUpdate ? "dry_run_update_existing_canonical_fixture" : "no_write_duplicate_existing_canonical_fixture",
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  }

  return {
    planRowId: `${asText(row.evidenceRowId)}::promotion_plan::${String(index + 1).padStart(3, "0")}`,
    planState: "new_canonical_fixture_candidate",
    canonicalPath: canonical.canonicalPath,
    canonicalFileExists: canonical.exists,
    evidenceRowId: asText(row.evidenceRowId),
    leagueSlug: asText(row.leagueSlug),
    matchId: asText(row.matchId),
    dayKey: asText(row.kickoffDate),
    homeTeam: asText(row.homeTeam),
    awayTeam: asText(row.awayTeam),
    kickoffUtc: asText(row.kickoffUtc),
    proposedCanonicalFixture: proposedFixtureFromEvidence(row),
    proposedAction: "dry_run_insert_new_canonical_fixture",
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport(input, options = {}) {
  const canonicalRoot = options.canonicalRoot || path.join(repoRoot, "data", "canonical-fixtures");
  const evidenceRows = evidenceRowsOf(input);
  const promotionPlanRows = evidenceRows.map((row, index) => planRowForEvidence(row, index, canonicalRoot));

  const proposedInsertRows = promotionPlanRows.filter((row) => row.planState === "new_canonical_fixture_candidate");
  const proposedUpdateRows = promotionPlanRows.filter((row) => row.planState === "existing_canonical_update_candidate");
  const duplicateNoActionRows = promotionPlanRows.filter((row) => row.planState === "duplicate_existing_canonical_no_action");
  const rejectedRows = promotionPlanRows.filter((row) => row.planState === "rejected");

  return {
    ok: true,
    job: "build-uefa-fixture-api-evidence-promotion-plan-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_uefa_fixture_api_evidence_promotion_plan",
    canonicalRoot,
    summary: {
      evidenceRowCount: evidenceRows.length,
      promotionPlanRowCount: promotionPlanRows.length,
      proposedInsertRowCount: proposedInsertRows.length,
      proposedUpdateRowCount: proposedUpdateRows.length,
      duplicateNoActionRowCount: duplicateNoActionRows.length,
      rejectedRowCount: rejectedRows.length,
      byPlanState: countBy(promotionPlanRows, "planState"),
      byLeague: countBy(promotionPlanRows, "leagueSlug"),
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    promotionPlanRows,
    proposedInsertRows,
    proposedUpdateRows,
    duplicateNoActionRows,
    rejectedRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      readOnlyPromotionPlan: true,
      noCanonicalPromotion: true,
      noCanonicalWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    notes: [
      "This diagnostic only builds a dry-run plan from UEFA API evidence rows.",
      "Existing canonical fixtures are detected by direct ids, normalized team names, and kickoff window.",
      "A later guarded writer must require explicit apply flags before any canonical write."
    ]
  };
}

function selfTest() {
  const tmpRoot = fs.mkdtempSync(path.join(process.cwd(), ".tmp-uefa-promotion-plan-"));
  const canonicalDir = path.join(tmpRoot, "2026-05-30");
  fs.mkdirSync(canonicalDir, { recursive: true });

  writeJson(path.join(canonicalDir, "uefa.champions.json"), [
    {
      matchId: "espn-1",
      leagueSlug: "uefa.champions",
      dayKey: "2026-05-30",
      kickoffUtc: "2026-05-30T16:00Z",
      homeTeam: "Paris Saint-Germain",
      awayTeam: "Arsenal",
      status: "PRE",
      scoreHome: null,
      scoreAway: null
    }
  ]);

  const input = {
    evidenceRows: [
      {
        evidenceRowId: "uefa.champions::uefa-api-match::2047742",
        acceptedForEvidence: true,
        sourceType: "uefa_fixture_api",
        leagueSlug: "uefa.champions",
        competitionCode: "UCL",
        competitionId: "1",
        competitionName: "UEFA Champions League",
        seasonYear: "2026",
        matchId: "2047742",
        status: "FINISHED",
        kickoffDate: "2026-05-30",
        kickoffUtc: "2026-05-30T16:00:00Z",
        homeTeam: "Paris Saint-Germain",
        awayTeam: "Arsenal FC",
        scoreHome: 1,
        scoreAway: 1,
        roundName: "Final",
        stadiumName: "Puskás Aréna"
      },
      {
        evidenceRowId: "uefa.champions::uefa-api-match::2048000",
        acceptedForEvidence: true,
        sourceType: "uefa_fixture_api",
        leagueSlug: "uefa.champions",
        competitionCode: "UCL",
        competitionId: "1",
        seasonYear: "2026",
        matchId: "2048000",
        status: "FINISHED",
        kickoffDate: "2026-05-29",
        kickoffUtc: "2026-05-29T19:00:00Z",
        homeTeam: "Alpha FC",
        awayTeam: "Beta FC",
        scoreHome: 2,
        scoreAway: 0
      }
    ]
  };

  const report = buildReport(input, { canonicalRoot: tmpRoot });

  fs.rmSync(tmpRoot, { recursive: true, force: true });

  if (report.summary.evidenceRowCount !== 2) throw new Error("expected 2 evidence rows");
  if (report.summary.proposedUpdateRowCount !== 1) throw new Error("expected one update candidate");
  if (report.summary.proposedInsertRowCount !== 1) throw new Error("expected one insert candidate");
  if (report.proposedUpdateRows[0].duplicateReason !== "same_teams_and_kickoff_window") {
    throw new Error("expected fuzzy duplicate reason");
  }
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "build-uefa-fixture-api-evidence-promotion-plan-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = buildReport(input, {
    canonicalRoot: path.resolve(args.canonicalRoot)
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport };