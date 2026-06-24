import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const JOB = "write-official-route-standings-evidence-promotion-plan-file";
const REQUIRED_SOURCE_TYPE = "official_route_standings_evidence";
const REQUIRED_PROVIDER_ID = "bundesliga_official";
const REQUIRED_SOURCE_FAMILY = "bundesliga_official_standings_table";
const ALLOWED_COMPETITIONS = new Set(["ger.1", "ger.2"]);
const EXPECTED_TABLE_ROWS = {
  "ger.1": 18,
  "ger.2": 18
};

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    apply: false,
    allowProductionWrites: false,
    confirmOfficialStandingsWrite: false,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input") {
      args.input = argv[++i] || "";
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++i] || "";
      continue;
    }

    if (arg === "--apply") {
      args.apply = true;
      continue;
    }

    if (arg === "--allow-production-writes") {
      args.allowProductionWrites = true;
      continue;
    }

    if (arg === "--confirm-official-standings-write") {
      args.confirmOfficialStandingsWrite = true;
      continue;
    }

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function rowsOf(plan) {
  if (Array.isArray(plan)) return plan;
  if (Array.isArray(plan?.rows)) return plan.rows;
  if (Array.isArray(plan?.planRows)) return plan.planRows;
  return [];
}

function normalizeStandingRow(row, index) {
  const rank = asNumberOrNull(row.rank ?? row.position);
  const teamName = asText(row.teamName || row.team || row.name);

  return {
    position: rank ?? index + 1,
    rank: rank ?? index + 1,
    teamId: row.teamId ?? null,
    team: teamName,
    teamName,
    name: teamName,
    played: asNumberOrNull(row.played),
    wins: asNumberOrNull(row.wins),
    draws: asNumberOrNull(row.draws),
    losses: asNumberOrNull(row.losses),
    goalsFor: asNumberOrNull(row.goalsFor),
    goalsAgainst: asNumberOrNull(row.goalsAgainst),
    goalDiff: asNumberOrNull(row.goalDiff ?? row.goalDifference),
    points: asNumberOrNull(row.points),
    confidence: asNumberOrNull(row.confidence) ?? 0.99,
    evidence: {
      sourceHost: "bundesliga.com",
      sourceUrl: asText(row?.evidence?.sourceUrl || row?.sourceUrl || "bundesliga_official_standings_table_cached_diagnostic"),
      finalUrl: asText(row?.evidence?.finalUrl || row?.finalUrl || ""),
      extractionMethod: asText(row?.evidence?.extractionMethod || row?.extractionMethod || "official_route_table_parser_provider_evidence"),
      validationState: "validated_official_route_standings_evidence_row",
      validationReasons: [
        "bundesliga_official_standings_source",
        "official_route_standings_evidence",
        "guarded_writer_validated_row",
        "no_fetch_no_search_writer"
      ]
    }
  };
}

function validateTable(competitionSlug, table) {
  const errors = [];
  const expectedRows = EXPECTED_TABLE_ROWS[competitionSlug];

  if (!expectedRows) errors.push("missing_expected_table_row_count");
  if (table.length !== expectedRows) {
    errors.push(`unexpected_table_row_count:${table.length}:expected:${expectedRows}`);
  }

  table.forEach((row, index) => {
    if (!Number.isFinite(row.rank)) errors.push(`bad_rank:${index + 1}`);
    if (!row.teamName) errors.push(`missing_team:${index + 1}`);
    if (!Number.isFinite(row.played)) errors.push(`bad_played:${index + 1}`);
    if (!Number.isFinite(row.points)) errors.push(`bad_points:${index + 1}`);
  });

  const ranks = table.map((row) => row.rank).filter(Number.isFinite);
  const teams = table.map((row) => row.teamName).filter(Boolean);

  if (new Set(ranks).size !== table.length) errors.push("duplicate_or_missing_ranks");
  if (new Set(teams).size !== table.length) errors.push("duplicate_or_missing_teams");

  return errors;
}

function validatePlanRow(row) {
  const errors = [];
  const competitionSlug = asText(row.competitionSlug || row.leagueSlug);
  const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
  const proposedCanonicalPath = asText(row.proposedCanonicalPath);
  const proposedPayload = row.proposedCanonicalPayload || {};
  const rawTable = Array.isArray(proposedPayload.table) ? proposedPayload.table : [];
  const table = rawTable.map(normalizeStandingRow);

  if (!competitionSlug) errors.push("missing_competition_slug");
  if (competitionSlug !== leagueSlug) errors.push("league_competition_slug_mismatch");
  if (!ALLOWED_COMPETITIONS.has(competitionSlug)) errors.push("competition_not_allowed_for_this_writer");
  if (asText(row.providerId) !== REQUIRED_PROVIDER_ID) errors.push("unsupported_provider_id");
  if (asText(row.sourceType) !== REQUIRED_SOURCE_TYPE) errors.push("unsupported_source_type");
  if (asText(row.promotionType) !== "standings_table") errors.push("unsupported_promotion_type");
  if (asText(row.proposedCanonicalState) !== "standings_table_ready_pending_guarded_writer") {
    errors.push("not_pending_guarded_writer");
  }

  const expectedPath = `data/standings/${competitionSlug}.json`;
  if (proposedCanonicalPath !== expectedPath) {
    errors.push(`unexpected_proposed_canonical_path:${proposedCanonicalPath || "missing"}:expected:${expectedPath}`);
  }

  if (asText(proposedPayload.leagueSlug) !== competitionSlug) errors.push("payload_league_slug_mismatch");
  if (asText(proposedPayload.source) !== REQUIRED_SOURCE_TYPE) errors.push("payload_source_type_mismatch");

  if (asText(row?.evidence?.providerId) !== REQUIRED_PROVIDER_ID) errors.push("evidence_provider_id_mismatch");
  if (asText(row?.evidence?.sourceFamily) !== REQUIRED_SOURCE_FAMILY) errors.push("evidence_source_family_mismatch");
  if (row?.readiness?.officialPrimarySourceSatisfied !== true) errors.push("official_primary_source_not_satisfied");
  if (row?.readiness?.dryRunFirstGateSatisfied !== true) errors.push("dry_run_first_gate_not_satisfied");
  if (row?.readiness?.noEspnRowsUsed !== true) errors.push("espn_rows_not_explicitly_excluded");
  if (row?.readiness?.noFetchRequired !== true) errors.push("fetch_not_explicitly_excluded");

  if (row?.safetyGates?.standingsWriteAllowedNow !== false) errors.push("input_write_allowed_unexpectedly");
  if (row?.safetyGates?.requiresDedicatedWriterDryRun !== true) errors.push("missing_dedicated_writer_dry_run_gate");
  if (row?.safetyGates?.requiresApplyFlag !== true) errors.push("missing_apply_gate");
  if (row?.safetyGates?.requiresAllowProductionWritesFlag !== true) errors.push("missing_allow_production_writes_gate");


  errors.push(...validateTable(competitionSlug, table));

  return {
    competitionSlug,
    leagueSlug,
    proposedCanonicalPath: expectedPath,
    table,
    errors
  };
}

function canonicalPayloadFor(row, validation, options) {
  return {
    leagueSlug: validation.leagueSlug,
    source: REQUIRED_SOURCE_TYPE,
    generatedAt: new Date().toISOString(),
    table: validation.table,
    meta: {
      generatedBy: JOB,
      inputPromotionPlan: options.inputPath || "",
      providerId: asText(row.providerId),
      sourceFamily: asText(row?.evidence?.sourceFamily),
      inputSourceType: asText(row?.proposedCanonicalPayload?.provenance?.inputSourceType || "official_route_table_parser_provider_evidence"),
      sourcePlanGeneratedBy: asText(row?.proposedCanonicalPayload?.provenance?.generatedBy),
      dryRun: !options.written,
      writtenAt: options.written ? new Date().toISOString() : null,
      noFetch: true,
      noSearch: true,
      noEspnRowsUsed: true
    },
    writeGuards: {
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      requiresExplicitOfficialStandingsConfirmationFlag: true,
      allowedCompetitionSlug: validation.competitionSlug,
      providerId: REQUIRED_PROVIDER_ID,
      sourceType: REQUIRED_SOURCE_TYPE
    }
  };
}

function buildReport(plan, options = {}) {
  const rows = rowsOf(plan);
  const apply = options.apply === true;
  const allowProductionWrites = options.allowProductionWrites === true;
  const confirmOfficialStandingsWrite = options.confirmOfficialStandingsWrite === true;

  const previewRows = [];
  const blockedRows = [];

  for (const row of rows) {
    const validation = validatePlanRow(row);

    if (validation.errors.length) {
      blockedRows.push({
        competitionSlug: validation.competitionSlug,
        leagueSlug: validation.leagueSlug,
        blockedReasons: validation.errors,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
      continue;
    }

    previewRows.push({
      competitionSlug: validation.competitionSlug,
      leagueSlug: validation.leagueSlug,
      providerId: REQUIRED_PROVIDER_ID,
      sourceType: REQUIRED_SOURCE_TYPE,
      proposedCanonicalPath: validation.proposedCanonicalPath,
      tableRowCount: validation.table.length,
      firstTeam: validation.table[0]?.teamName || "",
      lastTeam: validation.table[validation.table.length - 1]?.teamName || "",
      proposedAction: "dry_run_write_canonical_standings",
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    });
  }

  const planErrors = [];
  if (rows.length === 0) planErrors.push("no_plan_rows");
  if (blockedRows.length) planErrors.push("blocked_promotion_plan_rows_present");
  if (previewRows.length === 0) planErrors.push("no_preview_rows");
  if (apply && !allowProductionWrites) planErrors.push("apply_requires_allow_production_writes");
  if (apply && !confirmOfficialStandingsWrite) planErrors.push("apply_requires_confirm_official_standings_write");

  const writeWouldHappen =
    apply &&
    allowProductionWrites &&
    confirmOfficialStandingsWrite &&
    planErrors.length === 0;

  const writtenRows = [];

  if (writeWouldHappen) {
    for (const row of rows) {
      const validation = validatePlanRow(row);
      const payload = canonicalPayloadFor(row, validation, {
        inputPath: options.inputPath || "",
        written: true
      });

      writeJson(path.resolve(repoRoot, validation.proposedCanonicalPath), payload);

      writtenRows.push({
        competitionSlug: validation.competitionSlug,
        leagueSlug: validation.leagueSlug,
        providerId: REQUIRED_PROVIDER_ID,
        sourceType: REQUIRED_SOURCE_TYPE,
        proposedCanonicalPath: validation.proposedCanonicalPath,
        tableRowCount: validation.table.length,
        firstTeam: validation.table[0]?.teamName || "",
        lastTeam: validation.table[validation.table.length - 1]?.teamName || "",
        proposedAction: "write_canonical_standings",
        canonicalWrites: 1,
        productionWrite: true,
        dryRun: false
      });
    }
  }

  return {
    ok: planErrors.length === 0,
    job: JOB,
    mode: writeWouldHappen ? "guarded_write" : "dry_run",
    generatedAt: new Date().toISOString(),
    inputPath: options.inputPath || "",
    options: {
      apply,
      allowProductionWrites,
      confirmOfficialStandingsWrite,
      dryRun: !writeWouldHappen
    },
    summary: {
      inputPromotionPlanRowCount: rows.length,
      readyPromotionPlanRowCount: previewRows.length,
      blockedPromotionPlanRowCount: blockedRows.length,
      wouldWriteStandingsFiles: previewRows.length,
      actualStandingsWrites: writeWouldHappen ? writtenRows.length : 0,
      proposedStandingsTableRowCount: previewRows.reduce((sum, row) => sum + row.tableRowCount, 0),
      planErrorCount: planErrors.length,
      canonicalWrites: writeWouldHappen ? writtenRows.length : 0,
      productionWrite: writeWouldHappen,
      dryRun: !writeWouldHappen,
      byCompetition: previewRows.reduce((acc, row) => {
        acc[row.competitionSlug] = row.tableRowCount;
        return acc;
      }, {})
    },
    planErrors,
    canonicalWritePreviewRows: previewRows,
    blockedPromotionPlanRows: blockedRows,
    writtenRows,
    guarantees: {
      noFetch: true,
      noSearch: true,
      noUrlFetch: true,
      noEspnRowsUsed: true,
      usesOnlyProvidedPromotionPlanRows: true,
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      requiresExplicitOfficialStandingsConfirmationFlag: true,
      canonicalWrites: writeWouldHappen ? writtenRows.length : 0,
      productionWrite: writeWouldHappen,
      dryRun: !writeWouldHappen,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      competitionStateWrites: false,
      standingsWrites: writeWouldHappen
    }
  };
}

function selfTest() {
  const rowFor = (competitionSlug, firstTeam) => ({
    competitionSlug,
    leagueSlug: competitionSlug,
    providerId: REQUIRED_PROVIDER_ID,
    promotionType: "standings_table",
    sourceType: REQUIRED_SOURCE_TYPE,
    proposedCanonicalState: "standings_table_ready_pending_guarded_writer",
    proposedCanonicalPath: `data/standings/${competitionSlug}.json`,
    proposedCanonicalPayload: {
      leagueSlug: competitionSlug,
      source: REQUIRED_SOURCE_TYPE,
      generatedAt: "2026-06-10T00:00:00.000Z",
      table: Array.from({ length: 18 }, (_, index) => ({
        position: index + 1,
        rank: index + 1,
        team: index === 0 ? firstTeam : `${competitionSlug} Team ${index + 1}`,
        teamName: index === 0 ? firstTeam : `${competitionSlug} Team ${index + 1}`,
        name: index === 0 ? firstTeam : `${competitionSlug} Team ${index + 1}`,
        played: 34,
        points: 80 - index
      })),
      provenance: {
        providerId: REQUIRED_PROVIDER_ID,
        sourceFamily: REQUIRED_SOURCE_FAMILY,
        generatedBy: "build-official-route-standings-evidence-promotion-plan-file",
        inputSourceType: "official_route_table_parser_provider_evidence",
        dryRun: true
      }
    },
    evidence: {
      providerId: REQUIRED_PROVIDER_ID,
      sourceFamily: REQUIRED_SOURCE_FAMILY,
      inputRowCount: 36,
      uniqueRowCount: 18,
      duplicateRowCount: 18
    },
    readiness: {
      officialPrimarySourceSatisfied: true,
      dryRunFirstGateSatisfied: true,
      noEspnRowsUsed: true,
      noFetchRequired: true
    },
    safetyGates: {
      standingsWriteAllowedNow: false,
      requiresDedicatedWriterDryRun: true,
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      requiresExplicitConfirmation: true
    }
  });

  const report = buildReport({
    rows: [
      rowFor("ger.1", "FCB Bayern Bayern Munich"),
      rowFor("ger.2", "S04 Schalke Schalke")
    ]
  }, {
    inputPath: "self-test-official-standings-plan.json",
    apply: false,
    allowProductionWrites: false,
    confirmOfficialStandingsWrite: false
  });

  if (report.ok !== true) throw new Error(`self-test expected ok dry-run: ${report.planErrors.join("|")}`);
  if (report.summary.wouldWriteStandingsFiles !== 2) throw new Error("expected two would-write standings files");
  if (report.summary.actualStandingsWrites !== 0) throw new Error("dry-run must not write standings files");
  if (report.summary.proposedStandingsTableRowCount !== 36) throw new Error("expected 36 proposed table rows");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("dry-run guarantees failed");
  }

  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: report.ok,
      mode: report.mode,
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const inputPath = path.resolve(repoRoot, args.input);
  const outputPath = path.resolve(repoRoot, args.output);
  const plan = readJson(inputPath);

  const report = buildReport(plan, {
    inputPath: args.input,
    apply: args.apply,
    allowProductionWrites: args.allowProductionWrites,
    confirmOfficialStandingsWrite: args.confirmOfficialStandingsWrite
  });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    mode: report.mode,
    summary: report.summary,
    planErrors: report.planErrors,
    blockedPromotionPlanRows: report.blockedPromotionPlanRows,
    guarantees: report.guarantees
  }, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();



