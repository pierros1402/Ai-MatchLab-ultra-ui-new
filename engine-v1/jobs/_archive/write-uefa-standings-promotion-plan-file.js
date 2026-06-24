import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const ALLOWED_LEAGUES = new Set(["sco.1", "sco.2", "swe.1", "swe.2"]);
const EXPECTED_TABLE_ROWS = {
  "sco.1": 12,
  "sco.2": 10,
  "swe.1": 16,
  "swe.2": 16
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    apply: false,
    allowProductionWrites: false,
    confirmUefaStandingsWrite: false,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      args.input = argv[++i] || "";
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++i] || "";
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
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

    if (arg === "--confirm-uefa-standings-write") {
      args.confirmUefaStandingsWrite = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("Missing required --input");
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

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function planRowsOf(plan) {
  if (Array.isArray(plan)) return plan;
  return asArray(plan?.promotionPlanRows);
}

function normalizeTableRow(row) {
  return {
    position: asNumber(row.position ?? row.rank, null),
    rank: asNumber(row.rank ?? row.position, null),
    teamId: row.teamId ?? null,
    team: asText(row.team || row.teamName || row.name),
    teamName: asText(row.teamName || row.team || row.name),
    name: asText(row.name || row.teamName || row.team),
    played: asNumber(row.played, null),
    wins: row.wins ?? null,
    draws: row.draws ?? null,
    losses: row.losses ?? null,
    goalsFor: row.goalsFor ?? null,
    goalsAgainst: row.goalsAgainst ?? null,
    goalDiff: row.goalDiff ?? null,
    points: asNumber(row.points, null),
    confidence: asNumber(row.confidence, null),
    evidence: row.evidence || null
  };
}

function validatePromotionRow(row) {
  const errors = [];
  const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
  const table = asArray(row?.proposedCanonicalPayload?.table);
  const expectedRows = EXPECTED_TABLE_ROWS[leagueSlug];

  if (!ALLOWED_LEAGUES.has(leagueSlug)) errors.push("league_not_allowed_for_this_writer");
  if (asText(row.promotionType) !== "standings_table") errors.push("unsupported_promotion_type");
  if (asText(row.proposedCanonicalState) !== "standings_table_ready_pending_guarded_writer") {
    errors.push("not_pending_guarded_writer");
  }
  if (row?.readiness?.promotionPlanReady !== true) errors.push("promotion_plan_not_ready");
  if (row?.readiness?.shapeComplete !== true) errors.push("shape_not_complete");
  if (row?.readiness?.officialPrimarySourceSatisfied !== true) errors.push("official_primary_source_not_satisfied");
  if (row?.safetyGates?.requiresSeparateWriter !== true) errors.push("missing_requires_separate_writer_gate");
  if (row?.safetyGates?.requiresExplicitPromotionApprovalFlag !== true) errors.push("missing_explicit_approval_gate");
  if (row?.safetyGates?.requiresDryRunWriterFirst !== true) errors.push("missing_dry_run_first_gate");
  if (row?.safetyGates?.standingsWriteAllowedNow !== false) errors.push("input_write_allowed_unexpectedly");
  if (row.canonicalWrites !== 0) errors.push("row_canonical_writes_not_zero");
  if (row.productionWrite !== false) errors.push("row_production_write_not_false");
  if (row.dryRun !== true) errors.push("row_not_dry_run");

  if (!expectedRows) {
    errors.push("missing_expected_table_row_count");
  } else if (table.length !== expectedRows) {
    errors.push(`unexpected_table_row_count:${table.length}:expected:${expectedRows}`);
  }

  const normalizedTable = table.map(normalizeTableRow);
  for (const [index, tableRow] of normalizedTable.entries()) {
    if (tableRow.position !== index + 1) errors.push(`bad_position:${index + 1}`);
    if (!tableRow.teamName) errors.push(`missing_team:${index + 1}`);
    if (!Number.isFinite(tableRow.played) || tableRow.played < 0) errors.push(`bad_played:${index + 1}`);
    if (!Number.isFinite(tableRow.points) || tableRow.points < 0) errors.push(`bad_points:${index + 1}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    leagueSlug,
    normalizedTable
  };
}

function canonicalPayloadFor(row, validation, options) {
  return {
    leagueSlug: validation.leagueSlug,
    source: "uefa_source_normalized_standings_promotion_plan",
    generatedAt: new Date().toISOString(),
    table: validation.normalizedTable,
    meta: {
      generatedBy: "write-uefa-standings-promotion-plan-file",
      inputPromotionPlan: options.inputPath ? options.inputPath : "",
      promotionPlanId: asText(row.promotionPlanId),
      sourceFamily: asText(row?.evidence?.sourceFamily),
      dryRun: !options.written,
      writtenAt: options.written ? new Date().toISOString() : null
    },
    writeGuards: {
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      requiresExplicitUefaStandingsConfirmationFlag: true,
      allowedLeagueSlug: validation.leagueSlug
    }
  };
}

function buildReport(plan, options = {}) {
  const rows = planRowsOf(plan);
  const apply = options.apply === true;
  const allowProductionWrites = options.allowProductionWrites === true;
  const confirmUefaStandingsWrite = options.confirmUefaStandingsWrite === true;
  const mayWrite = apply && allowProductionWrites && confirmUefaStandingsWrite;

  const previewRows = [];
  const blockedRows = [];
  const writtenRows = [];

  for (const [index, row] of rows.entries()) {
    const validation = validatePromotionRow(row);

    if (!validation.ok) {
      blockedRows.push({
        rowIndex: index,
        promotionPlanId: asText(row?.promotionPlanId),
        leagueSlug: validation.leagueSlug,
        blockedReasons: validation.errors,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
      continue;
    }

    const proposedPath = `data/standings/${validation.leagueSlug}.json`;
    const payload = canonicalPayloadFor(row, validation, {
      inputPath: options.inputPath || "",
      written: mayWrite
    });

    const preview = {
      rowIndex: index,
      promotionPlanId: asText(row.promotionPlanId),
      leagueSlug: validation.leagueSlug,
      proposedPath,
      proposedCanonicalPayload: payload,
      tableRowCount: validation.normalizedTable.length,
      firstTeam: validation.normalizedTable[0]?.teamName || "",
      lastTeam: validation.normalizedTable[validation.normalizedTable.length - 1]?.teamName || "",
      proposedAction: mayWrite ? "write_canonical_standings" : "dry_run_write_canonical_standings",
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: !mayWrite
    };

    previewRows.push(preview);

    if (mayWrite) {
      writeJson(path.resolve(repoRoot, proposedPath), payload);
      writtenRows.push({
        ...preview,
        canonicalWrites: 1,
        productionWrite: true,
        dryRun: false
      });
    }
  }

  const planErrors = [];
  if (blockedRows.length) planErrors.push("blocked_promotion_plan_rows_present");
  if (previewRows.length === 0) planErrors.push("no_preview_rows");
  if (apply && !allowProductionWrites) planErrors.push("apply_requires_allow_production_writes");
  if (apply && !confirmUefaStandingsWrite) planErrors.push("apply_requires_confirm_uefa_standings_write");

  const writeWouldHappen = mayWrite && planErrors.length === 0;

  return {
    ok: planErrors.length === 0,
    job: "write-uefa-standings-promotion-plan-file",
    mode: writeWouldHappen ? "guarded_write" : "dry_run",
    generatedAt: new Date().toISOString(),
    inputPath: options.inputPath || "",
    options: {
      apply,
      allowProductionWrites,
      confirmUefaStandingsWrite,
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
      byLeague: previewRows.reduce((acc, row) => {
        acc[row.leagueSlug] = row.tableRowCount;
        return acc;
      }, {})
    },
    planErrors,
    canonicalWritePreviewRows: previewRows,
    blockedPromotionPlanRows: blockedRows,
    writtenRows,
    guarantees: {
      noUrlFetch: true,
      usesOnlyProvidedPromotionPlanRows: true,
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      requiresExplicitUefaStandingsConfirmationFlag: true,
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
  const rowFor = (leagueSlug, count, firstTeam) => ({
    promotionPlanId: `${leagueSlug}::standings::source-normalized::01`,
    promotionType: "standings_table",
    leagueSlug,
    competitionSlug: leagueSlug,
    proposedCanonicalState: "standings_table_ready_pending_guarded_writer",
    proposedCanonicalPayload: {
      leagueSlug,
      table: Array.from({ length: count }, (_, index) => ({
        position: index + 1,
        rank: index + 1,
        teamName: index === 0 ? firstTeam : `${leagueSlug} Team ${index + 1}`,
        played: 10,
        points: Math.max(0, 30 - index)
      }))
    },
    readiness: {
      promotionPlanReady: true,
      shapeComplete: true,
      officialPrimarySourceSatisfied: true
    },
    safetyGates: {
      requiresSeparateWriter: true,
      requiresExplicitPromotionApprovalFlag: true,
      requiresDryRunWriterFirst: true,
      standingsWriteAllowedNow: false
    },
    evidence: {
      sourceFamily: leagueSlug.startsWith("sco.") ? "spfl_official_html" : "sportomedia_graphql_widget"
    },
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  });

  const plan = {
    promotionPlanRows: [
      rowFor("sco.1", 12, "Celtic"),
      rowFor("sco.2", 10, "St. Johnstone"),
      rowFor("swe.1", 16, "IK Sirius"),
      rowFor("swe.2", 16, "Varbergs BoIS")
    ]
  };

  const report = buildReport(plan, {
    inputPath: "self-test-standings-plan.json",
    apply: false,
    allowProductionWrites: false,
    confirmUefaStandingsWrite: false
  });

  if (report.ok !== true) throw new Error(`self-test expected ok dry-run: ${report.planErrors.join("|")}`);
  if (report.summary.wouldWriteStandingsFiles !== 4) throw new Error("expected four would-write files");
  if (report.summary.actualStandingsWrites !== 0) throw new Error("dry-run must not write files");
  if (report.summary.proposedStandingsTableRowCount !== 54) throw new Error("expected 54 proposed table rows");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("dry-run guarantees failed");
  }

  return report;
}

function main() {
  const args = parseArgs();

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

  const inputPath = path.resolve(repoRoot, args.input);
  const outputPath = path.resolve(repoRoot, args.output);
  const plan = readJson(inputPath);

  const report = buildReport(plan, {
    inputPath: args.input,
    apply: args.apply,
    allowProductionWrites: args.allowProductionWrites,
    confirmUefaStandingsWrite: args.confirmUefaStandingsWrite
  });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees,
    planErrors: report.planErrors
  }, null, 2));

  if (!report.ok) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport };
