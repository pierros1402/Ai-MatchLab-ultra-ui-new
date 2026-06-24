import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const JOB = "write-official-standings-table-normalization-plan-file";

const ALLOWED_COMPETITIONS = new Set(["nor.2"]);
const EXPECTED_TABLE_ROWS = {
  "nor.2": 16
};

const REQUIRED_CONFIRMATION_STATE = "confirmed_official_standings_candidate_needs_writer_dry_run";

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
  return String(value ?? "").trim();
}

function asNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowsOf(plan) {
  if (Array.isArray(plan?.promotionPlanRows)) return plan.promotionPlanRows;
  if (Array.isArray(plan?.readyPromotionPlanRows)) return plan.readyPromotionPlanRows;
  if (Array.isArray(plan)) return plan;
  return [];
}

function normalizeStandingRow(row, index) {
  const rank = asNumberOrNull(row.rank ?? row.position);
  const teamName = asText(row.teamName || row.team || row.name);
  const wins = asNumberOrNull(row.wins ?? row.won);
  const draws = asNumberOrNull(row.draws ?? row.drawn);
  const losses = asNumberOrNull(row.losses ?? row.lost);

  return {
    position: rank ?? index + 1,
    rank: rank ?? index + 1,
    teamId: row.teamId ?? null,
    team: teamName,
    teamName,
    name: teamName,
    played: asNumberOrNull(row.played),
    wins,
    won: wins,
    draws,
    drawn: draws,
    losses,
    lost: losses,
    goalsFor: asNumberOrNull(row.goalsFor),
    goalsAgainst: asNumberOrNull(row.goalsAgainst),
    goalDifference: asNumberOrNull(row.goalDifference),
    points: asNumberOrNull(row.points),
    confidence: asNumberOrNull(row.confidence) ?? 0.99,
    evidence: {
      sourceHost: asText(row?.evidence?.sourceHost || row?.sourceHost || "obos-ligaen.no"),
      sourceUrl: asText(row?.evidence?.sourceUrl || row?.sourceUrl || "https://www.obos-ligaen.no/tabell"),
      finalUrl: asText(row?.evidence?.finalUrl || row?.finalUrl || "https://www.obos-ligaen.no/tabell"),
      extractionMethod: asText(row?.evidence?.extractionMethod || row?.extractionMethod || "official_standings_table_normalization_plan"),
      validationState: "validated_official_standings_table_normalization_row",
      validationReasons: [
        "official_primary_standings_source",
        "no_fetch_in_writer",
        "no_espn_rows_used"
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
  const proposedCanonicalPath = asText(row.proposedCanonicalPath || row.proposedCanonicalFile);
  const proposedPayload = row.proposedCanonicalPayload || {};
  const rawTable = Array.isArray(proposedPayload.table)
    ? proposedPayload.table
    : (Array.isArray(proposedPayload.rows) ? proposedPayload.rows : []);
  const table = rawTable.map(normalizeStandingRow);

  if (!competitionSlug) errors.push("missing_competition_slug");
  if (competitionSlug !== leagueSlug) errors.push("league_competition_slug_mismatch");
  if (!ALLOWED_COMPETITIONS.has(competitionSlug)) errors.push("competition_not_allowed_for_this_writer");
  if (asText(row.confirmationState) !== REQUIRED_CONFIRMATION_STATE) errors.push("not_confirmed_for_writer_dry_run");

  const expectedPath = `data/standings/${competitionSlug}.json`;
  if (proposedCanonicalPath !== expectedPath) {
    errors.push(`unexpected_proposed_canonical_path:${proposedCanonicalPath || "missing"}:expected:${expectedPath}`);
  }

  if (asText(proposedPayload.competitionSlug || proposedPayload.leagueSlug || competitionSlug) !== competitionSlug) {
    errors.push("payload_league_slug_mismatch");
  }

  if (asText(row.provider) !== "norway_ntf_official") errors.push("unsupported_provider");
  if (asText(row.sourceFamily) !== "official_route_registry_existing_snapshot") errors.push("unsupported_source_family");
  if (asText(row.sourceContract) !== "obos_ligaen_official_tabell_text") errors.push("unsupported_source_contract");
  if (asText(proposedPayload.sourceProvider) !== "obos-ligaen.no") errors.push("unsupported_source_provider");

  if (row.canonicalWrites !== 0) errors.push("input_canonical_writes_not_zero");
  if (row.productionWrite !== false) errors.push("input_production_write_not_false");

  errors.push(...validateTable(competitionSlug, table));

  return {
    competitionSlug,
    leagueSlug,
    proposedCanonicalPath: expectedPath,
    table,
    errors
  };
}

function payloadFor(validation, row, options) {
  return {
    leagueSlug: validation.leagueSlug,
    source: "official_standings_table_normalization_plan",
    generatedAt: new Date().toISOString(),
    table: validation.table,
    meta: {
      generatedBy: JOB,
      inputPromotionPlan: options.inputPath || "",
      providerId: asText(row.provider),
      sourceFamily: asText(row.sourceFamily),
      sourceContract: asText(row.sourceContract),
      sourceProvider: asText(row?.proposedCanonicalPayload?.sourceProvider),
      sourceUrls: row?.proposedCanonicalPayload?.sourceUrls || [],
      seasonHint: asText(row?.proposedCanonicalPayload?.seasonHint),
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
      providerId: asText(row.provider),
      sourceType: "official_standings_table_normalization_plan"
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
  const writtenRows = [];

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
      providerId: asText(row.provider),
      sourceType: "official_standings_table_normalization_plan",
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

  if (writeWouldHappen) {
    for (const row of rows) {
      const validation = validatePlanRow(row);
      if (validation.errors.length) continue;

      const payload = payloadFor(validation, row, {
        inputPath: options.inputPath || "",
        written: true
      });

      writeJson(path.resolve(repoRoot, validation.proposedCanonicalPath), payload);

      writtenRows.push({
        competitionSlug: validation.competitionSlug,
        leagueSlug: validation.leagueSlug,
        providerId: asText(row.provider),
        sourceType: "official_standings_table_normalization_plan",
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
    mode: writeWouldHappen ? "apply" : "dry-run",
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
      detailsWrites: false
    }
  };
}

function selfTestPlanRow() {
  const competitionSlug = "nor.2";

  return {
    promotionPlanId: "nor.2::standings::official-obos-tabell::self-test",
    promotionType: "standings",
    competitionSlug,
    provider: "norway_ntf_official",
    sourceContract: "obos_ligaen_official_tabell_text",
    sourceFamily: "official_route_registry_existing_snapshot",
    confirmationState: REQUIRED_CONFIRMATION_STATE,
    confirmationConfidence: "high",
    proposedCanonicalFile: `data/standings/${competitionSlug}.json`,
    proposedCanonicalPayload: {
      competitionSlug,
      competitionName: "OBOS-ligaen",
      seasonHint: "2026",
      standingsType: "league_table",
      sourceProvider: "obos-ligaen.no",
      sourceUrls: ["https://www.obos-ligaen.no/tabell"],
      rows: Array.from({ length: 16 }, (_, index) => ({
        rank: index + 1,
        team: index === 0 ? "Strømsgodset" : `${competitionSlug} Team ${index + 1}`,
        played: 10,
        won: Math.max(0, 10 - index),
        drawn: 0,
        lost: index,
        goalsFor: 30 - index,
        goalsAgainst: 10 + index,
        goalDifference: 20 - (index * 2),
        points: 40 - index
      }))
    },
    evidenceSummary: {
      extractedRowCount: 16,
      expectedRowCount: 16,
      tableComplete: true
    },
    blockingReasons: [],
    canonicalWrites: 0,
    productionWrite: false
  };
}

function selfTest() {
  const plan = {
    promotionPlanRows: [selfTestPlanRow()]
  };

  const report = buildReport(plan, {
    inputPath: "self-test-official-standings-normalization-plan.json",
    apply: false,
    allowProductionWrites: false,
    confirmOfficialStandingsWrite: false
  });

  if (report.ok !== true) throw new Error(`self-test expected ok dry-run: ${report.planErrors.join("|")}`);
  if (report.summary.wouldWriteStandingsFiles !== 1) throw new Error("expected one would-write standings file");
  if (report.summary.actualStandingsWrites !== 0) throw new Error("dry-run must not write standings files");
  if (report.summary.proposedStandingsTableRowCount !== 16) throw new Error("expected 16 proposed table rows");
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
      planErrors: report.planErrors,
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
    canonicalWritePreviewRows: report.canonicalWritePreviewRows,
    guarantees: report.guarantees
  }, null, 2));

  if (report.guarantees.canonicalWrites !== 0 && !args.apply) {
    throw new Error("dry-run canonical write guarantee failed");
  }
}

main();
