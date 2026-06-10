#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const JOB = "build-official-route-standings-evidence-promotion-plan-file";
const ALLOWED_COMPETITIONS = new Set(["ger.1", "ger.2"]);
const REQUIRED_SOURCE = "bundesliga_official_standings_table";
const EXPECTED_TABLE_ROWS = {
  "ger.1": 18,
  "ger.2": 18
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    inputs: [],
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      args.inputs.push(argv[++i]);
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.inputs.push(arg.slice("--input=".length));
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++i];
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.selfTest && args.inputs.length === 0) throw new Error("Missing required --input");
  if (!args.selfTest && !args.output) throw new Error("Missing required --output");

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function rowsOf(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input?.evidenceRows)) return input.evidenceRows;
  if (Array.isArray(input?.fixtureEvidenceRows)) return input.fixtureEvidenceRows;
  if (Array.isArray(input?.standings)) return input.standings;
  return [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const normalized = String(value).replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = numberOrNull(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    const t = text(value);
    if (t) return t;
  }
  return "";
}

function competitionOf(row) {
  return firstText(row.competitionSlug, row.leagueSlug, row.slug, row.competition, row.league);
}

function sourceOf(row) {
  return firstText(
    row.source,
    row.sourceId,
    row.provider,
    row.sourceContract,
    row.evidence?.provider,
    row.evidence?.sourceContract
  );
}

function evidenceTypeOf(row) {
  return firstText(row.evidenceType, row.type, row.rowType);
}

function cellsOf(row) {
  if (Array.isArray(row.cells)) return row.cells;
  if (Array.isArray(row.rawCells)) return row.rawCells;
  if (Array.isArray(row.tableCells)) return row.tableCells;
  return [];
}

function teamNameOf(row) {
  const cells = cellsOf(row);
  return firstText(
    row.teamName,
    row.team,
    row.name,
    row.club,
    row.squad,
    row.rawTeam,
    row.teamCell,
    cells[1],
    cells[2]
  );
}

function rankOf(row) {
  const cells = cellsOf(row);
  return firstNumber(row.rank, row.position, row.pos, cells[0]);
}

function playedOf(row) {
  const cells = cellsOf(row);
  return firstNumber(
    row.played,
    row.matchesPlayed,
    row.playedMatches,
    row.p,
    row.pld,
    row.mp,
    cells[2],
    cells[3]
  );
}

function pointsOf(row) {
  const cells = cellsOf(row);
  return firstNumber(
    row.points,
    row.pts,
    row.punkte,
    row.totalPoints,
    cells[8],
    cells[9],
    cells[cells.length - 1]
  );
}

function winsOf(row) {
  const cells = cellsOf(row);
  return firstNumber(row.wins, row.win, row.w, cells[3], cells[4]);
}

function drawsOf(row) {
  const cells = cellsOf(row);
  return firstNumber(row.draws, row.draw, row.d, cells[4], cells[5]);
}

function lossesOf(row) {
  const cells = cellsOf(row);
  return firstNumber(row.losses, row.loss, row.l, cells[5], cells[6]);
}

function goalsForOf(row) {
  const cells = cellsOf(row);
  return firstNumber(row.goalsFor, row.gf, row.goalsScored, cells[6], cells[7]);
}

function goalsAgainstOf(row) {
  const cells = cellsOf(row);
  return firstNumber(row.goalsAgainst, row.ga, row.goalsConceded, cells[7], cells[8]);
}

function goalDifferenceOf(row) {
  const cells = cellsOf(row);
  return firstNumber(row.goalDifference, row.gd, row.diff, row.goalDiff, cells[8], cells[9]);
}

function dedupeKey(row) {
  return [
    competitionOf(row),
    sourceOf(row),
    evidenceTypeOf(row),
    rankOf(row),
    teamNameOf(row),
    pointsOf(row)
  ].join("|");
}

function normalizeStandingRow(row) {
  const rank = rankOf(row);
  const teamName = teamNameOf(row);
  const played = playedOf(row);
  const points = pointsOf(row);

  const normalized = {
    position: rank,
    rank,
    team: teamName,
    teamName,
    name: teamName,
    played,
    wins: winsOf(row),
    draws: drawsOf(row),
    losses: lossesOf(row),
    goalsFor: goalsForOf(row),
    goalsAgainst: goalsAgainstOf(row),
    goalDifference: goalDifferenceOf(row),
    points
  };

  return normalized;
}

function validateTable(competitionSlug, table) {
  const errors = [];
  const expected = EXPECTED_TABLE_ROWS[competitionSlug];

  if (!ALLOWED_COMPETITIONS.has(competitionSlug)) errors.push("competition_not_allowed");
  if (!expected) errors.push("missing_expected_table_row_count");
  if (table.length !== expected) errors.push(`unexpected_table_row_count:${table.length}:expected:${expected}`);

  table.forEach((row, index) => {
    if (!row.teamName) errors.push(`missing_team:${index + 1}`);
    if (!Number.isFinite(row.rank)) errors.push(`bad_rank:${index + 1}`);
    if (!Number.isFinite(row.played) || row.played < 0) errors.push(`bad_played:${index + 1}`);
    if (!Number.isFinite(row.points) || row.points < 0) errors.push(`bad_points:${index + 1}`);
  });

  const ranks = table.map((row) => row.rank).filter(Number.isFinite);
  const teams = table.map((row) => row.teamName).filter(Boolean);
  if (new Set(ranks).size !== table.length) errors.push("duplicate_or_missing_ranks");
  if (new Set(teams).size !== table.length) errors.push("duplicate_or_missing_teams");

  return errors;
}

function buildPlanFromRows(inputRows, options = {}) {
  const now = options.generatedAt || new Date().toISOString();

  const officialRows = inputRows
    .filter((row) => ALLOWED_COMPETITIONS.has(competitionOf(row)))
    .filter((row) => sourceOf(row) === REQUIRED_SOURCE)
    .filter((row) => evidenceTypeOf(row) === "standings")
    .map((row) => ({
      ...row,
      _competitionSlug: competitionOf(row),
      _source: sourceOf(row),
      _evidenceType: evidenceTypeOf(row),
      _dedupeKey: dedupeKey(row)
    }));

  const byKey = new Map();
  const duplicateRows = [];

  for (const row of officialRows) {
    if (byKey.has(row._dedupeKey)) {
      duplicateRows.push(row);
    } else {
      byKey.set(row._dedupeKey, row);
    }
  }

  const uniqueRows = [...byKey.values()];
  const planRows = [];
  const blockedRows = [];

  for (const competitionSlug of [...ALLOWED_COMPETITIONS].sort()) {
    const rows = uniqueRows
      .filter((row) => row._competitionSlug === competitionSlug)
      .sort((a, b) => (rankOf(a) ?? 9999) - (rankOf(b) ?? 9999));

    const table = rows.map(normalizeStandingRow);
    const validationErrors = validateTable(competitionSlug, table);

    const planRow = {
      competitionSlug,
      leagueSlug: competitionSlug,
      providerId: "bundesliga_official",
      promotionType: "standings_table",
      sourceType: "official_route_standings_evidence",
      proposedCanonicalState: "standings_table_ready_pending_guarded_writer",
      proposedCanonicalPath: `data/standings/${competitionSlug}.json`,
      proposedCanonicalPayload: {
        leagueSlug: competitionSlug,
        source: "official_route_standings_evidence",
        generatedAt: now,
        table,
        provenance: {
          providerId: "bundesliga_official",
          sourceFamily: REQUIRED_SOURCE,
          generatedBy: JOB,
          inputSourceType: "official_route_table_parser_provider_evidence",
          dryRun: true
        }
      },
      evidence: {
        providerId: "bundesliga_official",
        sourceFamily: REQUIRED_SOURCE,
        inputRowCount: officialRows.filter((row) => row._competitionSlug === competitionSlug).length,
        uniqueRowCount: rows.length,
        duplicateRowCount: officialRows.filter((row) => row._competitionSlug === competitionSlug).length - rows.length
      },
      readiness: {
        officialPrimarySourceSatisfied: validationErrors.length === 0,
        dryRunFirstGateSatisfied: true,
        noEspnRowsUsed: true,
        noFetchRequired: true
      },
      safetyGates: {
        standingsWriteAllowedNow: false,
        requiresDedicatedWriterDryRun: true,
        requiresApplyFlag: true,
        requiresAllowProductionWritesFlag: true
      },
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };

    if (validationErrors.length) {
      blockedRows.push({
        competitionSlug,
        validationErrors,
        rowCount: rows.length
      });
    }

    planRows.push(planRow);
  }

  return {
    ok: blockedRows.length === 0,
    generatedAt: now,
    job: JOB,
    mode: "official_route_standings_evidence_promotion_plan_no_write",
    schema: {
      sourceType: "official_route_standings_evidence",
      rowPath: "rows",
      canonicalTargetPathTemplate: "data/standings/{leagueSlug}.json"
    },
    summary: {
      inputRows: inputRows.length,
      officialInputRows: officialRows.length,
      uniqueOfficialRows: uniqueRows.length,
      duplicateOfficialRows: duplicateRows.length,
      planRows: planRows.length,
      readyRows: planRows.length - blockedRows.length,
      blockedRows: blockedRows.length,
      wouldWriteStandingsFiles: planRows.length - blockedRows.length,
      actualStandingsWrites: 0,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byCompetition: planRows.map((row) => ({
      competitionSlug: row.competitionSlug,
      tableRows: row.proposedCanonicalPayload.table.length,
      firstTeam: row.proposedCanonicalPayload.table[0]?.teamName || "",
      lastTeam: row.proposedCanonicalPayload.table[row.proposedCanonicalPayload.table.length - 1]?.teamName || "",
      uniqueRowCount: row.evidence.uniqueRowCount,
      duplicateRowCount: row.evidence.duplicateRowCount
    })),
    rows: planRows,
    blockedRows,
    guarantees: {
      noFetch: true,
      noSearch: true,
      noCanonicalWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false,
      espnRowsUsed: false
    }
  };
}

function runSelfTest() {
  const sample = [];
  for (const competitionSlug of ["ger.1", "ger.2"]) {
    for (let i = 1; i <= 18; i += 1) {
      sample.push({
        competitionSlug,
        source: REQUIRED_SOURCE,
        evidenceType: "standings",
        rank: i,
        teamName: `${competitionSlug} Team ${i}`,
        played: 34,
        wins: 18 - Math.floor(i / 2),
        draws: i % 4,
        losses: Math.floor(i / 3),
        goalsFor: 70 - i,
        goalsAgainst: 20 + i,
        goalDifference: 50 - (i * 2),
        points: 80 - i
      });
    }
  }

  const report = buildPlanFromRows(sample, { generatedAt: "2026-06-10T00:00:00.000Z" });
  if (!report.ok) throw new Error(`self-test failed: ${JSON.stringify(report.blockedRows)}`);
  if (report.summary.readyRows !== 2) throw new Error("self-test expected 2 ready rows");
  if (report.summary.canonicalWrites !== 0 || report.summary.productionWrite !== false) {
    throw new Error("self-test write guarantees failed");
  }

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = runSelfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: JOB,
      summary: report.summary,
      byCompetition: report.byCompetition,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const inputRows = [];
  for (const input of args.inputs) {
    const json = readJson(input);
    for (const row of rowsOf(json)) {
      inputRows.push(row);
    }
  }

  const report = buildPlanFromRows(inputRows);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    ok: report.ok,
    summary: report.summary,
    byCompetition: report.byCompetition,
    blockedRows: report.blockedRows,
    guarantees: report.guarantees
  }, null, 2));

  if (!report.ok) process.exitCode = 1;
}

main();
