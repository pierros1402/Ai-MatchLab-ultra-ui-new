#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function resolveRepoPath(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
}

function readJson(filePath, label) {
  const resolved = resolveRepoPath(filePath);
  if (!resolved) throw new Error(`missing --${label}`);
  if (!fs.existsSync(resolved)) throw new Error(`missing ${label} file: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolved;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round3(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function pickValidatedRows(input) {
  const direct = asArray(input.validatedStandingsEvidenceRows);
  if (direct.length) return direct;

  const nested = asArray(input.report?.validatedStandingsEvidenceRows);
  if (nested.length) return nested;

  return [];
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = asText(row[field]) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function normalizeEvidenceConfidence(value) {
  const n = asNumber(value, 0);
  if (n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

function makeCanonicalLikeTableRow(row, index, leagueConfidence) {
  const teamName = asText(row.teamName);

  return {
    position: asNumber(row.rank, index + 1),
    rank: asNumber(row.rank, index + 1),
    teamId: null,
    team: teamName,
    teamName,
    name: teamName,
    played: asNumber(row.played, null),
    wins: null,
    draws: null,
    losses: null,
    goalsFor: null,
    goalsAgainst: null,
    goalDiff: null,
    points: asNumber(row.points, null),
    confidence: leagueConfidence,
    evidence: {
      sourceHost: asText(row.hostname),
      sourceUrl: asText(row.sourceUrl),
      finalUrl: asText(row.finalUrl),
      extractionMethod: asText(row.extractionMethod),
      validationState: asText(row.validationState),
      validationReasons: asArray(row.validationReasons).map(asText).filter(Boolean)
    }
  };
}

function detectTableWarnings(rows) {
  const warnings = [];
  const sorted = [...rows].sort((a, b) => asNumber(a.rank, 0) - asNumber(b.rank, 0));

  let previousPoints = null;
  let previousRank = null;
  const seenRanks = new Set();
  const seenTeams = new Set();

  for (const row of sorted) {
    const rank = asNumber(row.rank, null);
    const points = asNumber(row.points, null);
    const team = asText(row.teamName).toLowerCase();

    if (Number.isFinite(rank)) {
      if (seenRanks.has(rank)) {
        warnings.push({
          warningType: "duplicate_rank",
          rank,
          teamName: asText(row.teamName)
        });
      }
      seenRanks.add(rank);
    }

    if (team) {
      if (seenTeams.has(team)) {
        warnings.push({
          warningType: "duplicate_team",
          rank,
          teamName: asText(row.teamName)
        });
      }
      seenTeams.add(team);
    }

    if (
      Number.isFinite(points) &&
      Number.isFinite(previousPoints) &&
      Number.isFinite(rank) &&
      Number.isFinite(previousRank) &&
      rank > previousRank &&
      points > previousPoints
    ) {
      warnings.push({
        warningType: "points_increase_after_lower_rank",
        previousRank,
        previousPoints,
        rank,
        points,
        teamName: asText(row.teamName)
      });
    }

    previousRank = rank;
    previousPoints = points;
  }

  if (sorted.length < 4) {
    warnings.push({
      warningType: "too_few_rows_for_standings_table",
      rowCount: sorted.length
    });
  }

  return warnings;
}

function expectedMinimumRowsForLeague(leagueSlug) {
  const slug = asText(leagueSlug);
  if (slug === "bel.2") return 8;
  if (slug === "aut.2") return 8;
  return 4;
}

function sourceGroupKey(row) {
  const host = asText(row.hostname) || "unknown-host";
  const url = asText(row.sourceUrl || row.finalUrl) || "unknown-url";
  return `${host} ${url}`;
}

function summarizeCandidateTable(leagueSlug, rows) {
  const sortedRows = [...rows].sort((a, b) => asNumber(a.rank, 0) - asNumber(b.rank, 0));
  const warnings = detectTableWarnings(sortedRows);
  const sourceHosts = [...new Set(sortedRows.map((row) => asText(row.hostname)).filter(Boolean))];
  const sourceUrls = [...new Set(sortedRows.map((row) => asText(row.sourceUrl || row.finalUrl)).filter(Boolean))];
  const avgConfidence = sortedRows.length
    ? sortedRows.reduce((sum, row) => sum + normalizeEvidenceConfidence(row.confidence), 0) / sortedRows.length
    : 0;

  return {
    leagueSlug,
    sourceHosts,
    sourceUrls,
    rowCount: sortedRows.length,
    uniqueTeamCount: new Set(sortedRows.map((row) => asText(row.teamName).toLowerCase()).filter(Boolean)).size,
    confidence: round3(avgConfidence),
    warningCount: warnings.length,
    orderingWarningCount: warnings.filter((warning) => warning.warningType === "points_increase_after_lower_rank").length,
    duplicateRankWarningCount: warnings.filter((warning) => warning.warningType === "duplicate_rank").length,
    duplicateTeamWarningCount: warnings.filter((warning) => warning.warningType === "duplicate_team").length,
    warnings,
    rows: sortedRows
  };
}

function choosePrimaryCandidateTable(leagueSlug, rows) {
  const bySource = groupBy(rows, (row) => sourceGroupKey(row));
  const candidateTables = [];

  for (const sourceRows of bySource.values()) {
    if (!sourceRows.length) continue;
    candidateTables.push(summarizeCandidateTable(leagueSlug, sourceRows));
  }

  candidateTables.sort((a, b) => {
    const warningDelta = a.warningCount - b.warningCount;
    if (warningDelta !== 0) return warningDelta;

    const rowDelta = b.rowCount - a.rowCount;
    if (rowDelta !== 0) return rowDelta;

    const uniqueTeamDelta = b.uniqueTeamCount - a.uniqueTeamCount;
    if (uniqueTeamDelta !== 0) return uniqueTeamDelta;

    return b.confidence - a.confidence;
  });

  return {
    primary: candidateTables[0] || summarizeCandidateTable(leagueSlug, []),
    confirmationCandidates: candidateTables.slice(1)
  };
}

function buildProposedStandingObject(leagueSlug, rows) {
  const selected = choosePrimaryCandidateTable(leagueSlug, rows);
  const primary = selected.primary;
  const sortedRows = primary.rows;
  const leagueConfidence = primary.confidence;
  const table = sortedRows.map((row, index) => makeCanonicalLikeTableRow(row, index, leagueConfidence));
  const warnings = primary.warnings;
  const expectedMinimumRows = expectedMinimumRowsForLeague(leagueSlug);
  const completeness = table.length >= expectedMinimumRows ? 1 : round3(table.length / expectedMinimumRows);

  const sourceHosts = primary.sourceHosts;
  const sourceUrls = primary.sourceUrls;
  const confirmationCandidateTables = selected.confirmationCandidates.map((candidate) => ({
    sourceHosts: candidate.sourceHosts,
    sourceUrls: candidate.sourceUrls,
    rowCount: candidate.rowCount,
    uniqueTeamCount: candidate.uniqueTeamCount,
    confidence: candidate.confidence,
    warningCount: candidate.warningCount,
    orderingWarningCount: candidate.orderingWarningCount,
    duplicateRankWarningCount: candidate.duplicateRankWarningCount,
    duplicateTeamWarningCount: candidate.duplicateTeamWarningCount,
    readinessState: candidate.warningCount
      ? "confirmation_candidate_requires_review"
      : "confirmation_candidate_available",
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  }));

  const readinessReasons = [
    "diagnostic_materialization_plan_only",
    "standings_write_requires_explicit_future_promotion_gate",
    "second_source_confirmation_not_yet_required_or_satisfied_by_this_plan"
  ];

  if (selected.confirmationCandidates.length > 0) {
    readinessReasons.push("additional_source_tables_kept_for_second_source_confirmation");
  }

  if (warnings.length > 0) {
    readinessReasons.push("table_quality_warnings_require_review");
  }

  if (table.length < expectedMinimumRows) {
    readinessReasons.push("table_row_count_below_expected_minimum");
  }

  return {
    proposedPath: `data/standings/${leagueSlug}.json`,
    leagueSlug,
    proposedStandingsObject: {
      league: leagueSlug,
      updatedAt: Date.now(),
      confidence: leagueConfidence,
      completeness,
      sourceAudit: [
        {
          type: "primary_validated_source_evidence",
          label: `primary-validated-standings-evidence:${sourceHosts.join(",")}`,
          ok: true,
          rowCount: table.length,
          sourceHosts,
          sourceUrls
        },
        {
          type: "confirmation_candidate_source_tables",
          label: `confirmation-candidates:${confirmationCandidateTables.length}`,
          ok: true,
          candidateTableCount: confirmationCandidateTables.length,
          candidateTables: confirmationCandidateTables
        },
        {
          type: "diagnostic_materialization_plan",
          label: "read-only-plan-no-standings-write",
          ok: true
        },
        {
          type: "validation",
          label: `primary-rows:${table.length}/${table.length}`,
          ok: warnings.length === 0
        }
      ],
      phaseSummary: {
        hasPhaseTables: false,
        phaseKeys: ["regular"]
      },
      phaseTables: {
        regular: table
      },
      phases: ["regular"],
      table
    },
    materializationDiagnostics: {
      leagueSlug,
      sourceHosts,
      sourceUrls,
      selectedPrimarySourceHost: sourceHosts[0] || "",
      selectedPrimarySourceUrl: sourceUrls[0] || "",
      confirmationCandidateTableCount: confirmationCandidateTables.length,
      confirmationCandidateTables,
      inputValidatedRowCount: rows.length,
      proposedTableRowCount: table.length,
      expectedMinimumRows,
      completeness,
      confidence: leagueConfidence,
      orderingWarningCount: warnings.filter((warning) => warning.warningType === "points_increase_after_lower_rank").length,
      warningCount: warnings.length,
      warnings,
      readinessBlocked: true,
      readinessState: warnings.length
        ? "blocked_diagnostic_plan_requires_review"
        : "blocked_diagnostic_plan_requires_promotion_gate",
      readinessReasons,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false
    }
  };
}

function buildReport(input, options = {}) {
  const validatedRows = pickValidatedRows(input);
  const proposedStandingsFiles = [];
  const proposedStandingsObjects = {};
  const materializationDiagnosticRows = [];

  const byLeague = groupBy(validatedRows, (row) => asText(row.missingLeagueSlug));

  for (const [leagueSlug, rows] of byLeague.entries()) {
    if (!leagueSlug) continue;

    const proposed = buildProposedStandingObject(leagueSlug, rows);
    proposedStandingsFiles.push({
      leagueSlug,
      proposedPath: proposed.proposedPath,
      proposedTableRowCount: proposed.materializationDiagnostics.proposedTableRowCount,
      confidence: proposed.materializationDiagnostics.confidence,
      completeness: proposed.materializationDiagnostics.completeness,
      readinessBlocked: true,
      readinessState: proposed.materializationDiagnostics.readinessState,
      readinessReasons: proposed.materializationDiagnostics.readinessReasons,
      warningCount: proposed.materializationDiagnostics.warningCount,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false
    });

    proposedStandingsObjects[leagueSlug] = proposed.proposedStandingsObject;
    materializationDiagnosticRows.push(proposed.materializationDiagnostics);
  }

  return {
    ok: true,
    job: "build-standings-materialization-plan-from-validated-evidence-file",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      sourceJob: asText(input.job),
      sourceGeneratedAt: asText(input.generatedAt),
      validatedStandingsEvidenceRowCount: validatedRows.length
    },
    summary: {
      validatedStandingsEvidenceRowCount: validatedRows.length,
      proposedStandingsFileCount: proposedStandingsFiles.length,
      proposedStandingsTableRowCount: proposedStandingsFiles.reduce((sum, row) => sum + asNumber(row.proposedTableRowCount, 0), 0),
      readinessBlockedFileCount: proposedStandingsFiles.filter((row) => row.readinessBlocked).length,
      fileWithWarningCount: proposedStandingsFiles.filter((row) => asNumber(row.warningCount, 0) > 0).length,
      byLeague: countBy(validatedRows, "missingLeagueSlug"),
      standingsWriteAllowedNowCount: 0,
      canonicalWrites: 0,
      productionWrite: false
    },
    proposedStandingsFiles,
    proposedStandingsObjects,
    materializationDiagnosticRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true,
      readinessBlocked: true,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false,
      diagnosticOnly: true
    },
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false,
    selfTest: Boolean(options.selfTest)
  };
}

function selfTestInput() {
  return {
    ok: true,
    job: "validate-standings-evidence-candidates-file",
    validatedStandingsEvidenceRows: [
      { missingLeagueSlug: "bel.2", hostname: "proleague.be", rank: 1, teamName: "SK Beveren", played: 32, points: 88, confidence: 98, sourceUrl: "https://example.test", validationState: "validated_standings_evidence_row", validationReasons: ["primary_segment_row_shape_valid"] },
      { missingLeagueSlug: "bel.2", hostname: "proleague.be", rank: 2, teamName: "KV Kortrijk", played: 32, points: 67, confidence: 98, sourceUrl: "https://example.test", validationState: "validated_standings_evidence_row", validationReasons: ["primary_segment_row_shape_valid"] },
      { missingLeagueSlug: "bel.2", hostname: "proleague.be", rank: 3, teamName: "K. Beerschot VA", played: 32, points: 64, confidence: 98, sourceUrl: "https://example.test", validationState: "validated_standings_evidence_row", validationReasons: ["primary_segment_row_shape_valid"] },
      { missingLeagueSlug: "bel.2", hostname: "proleague.be", rank: 4, teamName: "RFC Liège", played: 32, points: 53, confidence: 98, sourceUrl: "https://example.test", validationState: "validated_standings_evidence_row", validationReasons: ["primary_segment_row_shape_valid"] }
    ]
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = buildReport(selfTestInput(), { selfTest: true });

    if (report.summary.proposedStandingsFileCount !== 1) {
      throw new Error(`self-test expected 1 proposed file, got ${report.summary.proposedStandingsFileCount}`);
    }

    const proposed = report.proposedStandingsObjects["bel.2"];
    if (!proposed || proposed.table.length !== 4) {
      throw new Error("self-test expected bel.2 proposed table with 4 rows");
    }

    if (proposed.table[0].teamName !== "SK Beveren" || proposed.table[0].points !== 88) {
      throw new Error(`self-test unexpected first table row: ${JSON.stringify(proposed.table[0])}`);
    }

    if (report.guarantees.noStandingsWrites !== true || report.guarantees.canonicalWrites !== 0) {
      throw new Error("self-test write guarantees failed");
    }

    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-standings-materialization-plan-from-validated-evidence-file",
      summary: report.summary,
      firstProposedFile: report.proposedStandingsFiles[0],
      firstTableRow: proposed.table[0],
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const outputPath = args.output || "data/football-truth/_diagnostics/same-prefix-missing-standings/standings-materialization-plan.json";
  const report = buildReport(input, args);
  const resolvedOutput = writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, resolvedOutput).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "build-standings-materialization-plan-from-validated-evidence-file",
    error: error?.message || String(error),
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});