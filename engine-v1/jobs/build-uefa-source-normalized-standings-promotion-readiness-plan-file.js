import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const EXPECTED_LEAGUES = ["sco.1", "sco.2", "swe.1", "swe.2"];
const EXPECTED_TABLE_ROWS = {
  "sco.1": 12,
  "sco.2": 10,
  "swe.1": 16,
  "swe.2": 16
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: [],
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
      args.input.push(argv[++i] || "");
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input.push(arg.slice("--input=".length));
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

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && args.input.length < 1) throw new Error("Missing required --input");
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

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function planObjectsOf(plan) {
  return plan && plan.proposedStandingsObjects && typeof plan.proposedStandingsObjects === "object"
    ? plan.proposedStandingsObjects
    : {};
}

function validateInputPlan(plan, inputPath) {
  const failures = [];

  if (!plan || typeof plan !== "object") failures.push("input_plan_not_object");
  if (plan?.summary?.canonicalWrites !== 0) failures.push("summary_canonicalWrites_not_zero");
  if (plan?.summary?.productionWrite !== false) failures.push("summary_productionWrite_not_false");
  if (plan?.guarantees?.noFetch !== true) failures.push("guarantee_noFetch_not_true");
  if (plan?.guarantees?.noStandingsWrites !== true) failures.push("guarantee_noStandingsWrites_not_true");
  if (plan?.guarantees?.noCanonicalPromotion !== true) failures.push("guarantee_noCanonicalPromotion_not_true");
  if (plan?.guarantees?.canonicalWrites !== 0) failures.push("guarantee_canonicalWrites_not_zero");
  if (plan?.guarantees?.productionWrite !== false) failures.push("guarantee_productionWrite_not_false");

  return {
    inputPath,
    ok: failures.length === 0,
    failures
  };
}

function sourceFamilyForLeague(leagueSlug, obj) {
  const first = asArray(obj?.table)[0] || {};
  const sourceHost = asText(first?.evidence?.sourceHost);

  if (leagueSlug.startsWith("sco.")) return "spfl_official_html";
  if (leagueSlug.startsWith("swe.")) return "sportomedia_graphql_widget";
  return sourceHost || "unknown";
}

function promotionReadinessRowFor({ leagueSlug, obj, inputPath, rowIndex }) {
  const table = asArray(obj.table);
  const expectedRows = EXPECTED_TABLE_ROWS[leagueSlug] || null;
  const warnings = [];

  if (!expectedRows) warnings.push("league_not_in_expected_set");
  if (expectedRows && table.length !== expectedRows) {
    warnings.push(`unexpected_table_row_count:${table.length}:expected:${expectedRows}`);
  }

  if (obj.readinessBlocked !== true) warnings.push("input_materialization_plan_not_blocked_as_expected");
  if (obj.standingsWriteAllowedNow !== false) warnings.push("input_standings_write_allowed_unexpectedly");

  const hasValidRows = table.every((row, index) =>
    asNumber(row.rank || row.position, 0) === index + 1 &&
    Boolean(asText(row.teamName || row.team || row.name)) &&
    asNumber(row.played, -1) >= 0 &&
    asNumber(row.points, -1) >= 0
  );

  if (!hasValidRows) warnings.push("one_or_more_table_rows_invalid");

  const promotionPlanReady =
    EXPECTED_LEAGUES.includes(leagueSlug) &&
    expectedRows === table.length &&
    hasValidRows &&
    warnings.length === 0;

  return {
    promotionPlanId: `${leagueSlug}::standings::source-normalized::${String(rowIndex + 1).padStart(2, "0")}`,
    promotionType: "standings_table",
    leagueSlug,
    competitionSlug: leagueSlug,
    proposedCanonicalState: promotionPlanReady
      ? "standings_table_ready_pending_guarded_writer"
      : "standings_table_promotion_plan_blocked",
    proposedPath: `data/standings/${leagueSlug}.json`,
    proposedCanonicalPayload: {
      leagueSlug,
      table,
      source: "uefa_source_normalized_standings_promotion_readiness_plan",
      generatedBy: "build-uefa-source-normalized-standings-promotion-readiness-plan-file"
    },
    readiness: {
      promotionPlanReady,
      shapeComplete: expectedRows === table.length && hasValidRows,
      sourcePolicySatisfied: true,
      officialPrimarySourceSatisfied: true,
      secondSourceRequiredForThisGate: false,
      tableRowCount: table.length,
      expectedTableRowCount: expectedRows,
      warningCount: warnings.length
    },
    safetyGates: {
      requiresSeparateWriter: true,
      requiresExplicitPromotionApprovalFlag: true,
      requiresDryRunWriterFirst: true,
      standingsWriteAllowedNow: false
    },
    evidence: {
      inputPath,
      sourceFamily: sourceFamilyForLeague(leagueSlug, obj),
      firstRow: table[0] || null,
      lastRow: table[table.length - 1] || null
    },
    blockedCanonicalWriteReason: "promotion readiness plan only; canonical standings write requires separate guarded writer with explicit approval",
    warnings,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildReportFromPlans(plansWithPaths) {
  const inputValidations = plansWithPaths.map(({ plan, inputPath }) => validateInputPlan(plan, inputPath));
  const inputValidationFailures = inputValidations.flatMap((row) =>
    row.failures.map((failure) => `${row.inputPath}:${failure}`)
  );

  if (inputValidationFailures.length) {
    throw new Error(`input plan validation failed: ${inputValidationFailures.join("|")}`);
  }

  const byLeagueObject = new Map();

  for (const { plan, inputPath } of plansWithPaths) {
    const objects = planObjectsOf(plan);
    for (const [leagueSlug, obj] of Object.entries(objects)) {
      if (!EXPECTED_LEAGUES.includes(leagueSlug)) continue;
      if (byLeagueObject.has(leagueSlug)) {
        throw new Error(`duplicate proposed standings object for ${leagueSlug}`);
      }
      byLeagueObject.set(leagueSlug, { obj, inputPath });
    }
  }

  const missingExpectedLeagues = EXPECTED_LEAGUES.filter((leagueSlug) => !byLeagueObject.has(leagueSlug));
  if (missingExpectedLeagues.length) {
    throw new Error(`missing expected standings leagues: ${missingExpectedLeagues.join(",")}`);
  }

  const promotionPlanRows = EXPECTED_LEAGUES.map((leagueSlug, index) => {
    const entry = byLeagueObject.get(leagueSlug);
    return promotionReadinessRowFor({
      leagueSlug,
      obj: entry.obj,
      inputPath: entry.inputPath,
      rowIndex: index
    });
  });

  const readyRows = promotionPlanRows.filter((row) => row.readiness.promotionPlanReady === true);
  const blockedRows = promotionPlanRows.filter((row) => row.readiness.promotionPlanReady !== true);
  const totalTableRows = promotionPlanRows.reduce((sum, row) => sum + asNumber(row.readiness.tableRowCount, 0), 0);

  return {
    ok: true,
    job: "build-uefa-source-normalized-standings-promotion-readiness-plan-file",
    mode: "read_only_standings_promotion_readiness_plan",
    generatedAt: new Date().toISOString(),
    summary: {
      inputPlanCount: plansWithPaths.length,
      expectedLeagueCount: EXPECTED_LEAGUES.length,
      promotionPlanRowCount: promotionPlanRows.length,
      promotionPlanReadyCount: readyRows.length,
      blockedPromotionPlanCount: blockedRows.length,
      proposedStandingsFileCount: promotionPlanRows.length,
      proposedStandingsTableRowCount: totalTableRows,
      standingsWriteAllowedNowCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byLeague: Object.fromEntries(
        promotionPlanRows.map((row) => [row.leagueSlug, row.readiness.tableRowCount])
      ),
      bySourceFamily: promotionPlanRows.reduce((acc, row) => {
        const key = row.evidence.sourceFamily || "unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    },
    inputValidations,
    promotionPlanRows,
    readyPromotionPlanRows: readyRows,
    blockedPromotionPlanRows: blockedRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      usesOnlyProvidedMaterializationPlans: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true,
      requiresSeparateWriter: true,
      requiresExplicitPromotionApprovalFlag: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function selfTest() {
  const makeObj = (leagueSlug, count, firstTeam) => ({
    table: Array.from({ length: count }, (_, index) => ({
      position: index + 1,
      rank: index + 1,
      teamName: index === 0 ? firstTeam : `${leagueSlug} Team ${index + 1}`,
      team: index === 0 ? firstTeam : `${leagueSlug} Team ${index + 1}`,
      played: 10,
      points: Math.max(0, 30 - index),
      evidence: {
        sourceHost: leagueSlug.startsWith("sco.") ? "spfl.co.uk" : "sportomedia"
      }
    })),
    readinessBlocked: true,
    readinessState: "blocked_diagnostic_plan_requires_promotion_gate",
    standingsWriteAllowedNow: false
  });

  const planA = {
    summary: { canonicalWrites: 0, productionWrite: false },
    guarantees: {
      noFetch: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false
    },
    proposedStandingsObjects: {
      "sco.1": makeObj("sco.1", 12, "Celtic"),
      "sco.2": makeObj("sco.2", 10, "St. Johnstone")
    }
  };

  const planB = {
    summary: { canonicalWrites: 0, productionWrite: false },
    guarantees: {
      noFetch: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false
    },
    proposedStandingsObjects: {
      "swe.1": makeObj("swe.1", 16, "IK Sirius"),
      "swe.2": makeObj("swe.2", 16, "Varbergs BoIS")
    }
  };

  const report = buildReportFromPlans([
    { plan: planA, inputPath: "self-test-spfl-plan.json" },
    { plan: planB, inputPath: "self-test-sportomedia-plan.json" }
  ]);

  if (report.summary.promotionPlanRowCount !== 4) throw new Error("expected four promotion plan rows");
  if (report.summary.promotionPlanReadyCount !== 4) throw new Error("expected four ready rows");
  if (report.summary.proposedStandingsTableRowCount !== 54) throw new Error("expected 54 table rows");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: report.ok,
      promotionPlanRowCount: report.summary.promotionPlanRowCount,
      promotionPlanReadyCount: report.summary.promotionPlanReadyCount,
      proposedStandingsTableRowCount: report.summary.proposedStandingsTableRowCount,
      byLeague: report.summary.byLeague,
      canonicalWrites: report.guarantees.canonicalWrites,
      productionWrite: report.guarantees.productionWrite
    }, null, 2));
    return;
  }

  const plansWithPaths = args.input.map((inputPath) => ({
    inputPath,
    plan: readJson(path.resolve(repoRoot, inputPath))
  }));

  const report = buildReportFromPlans(plansWithPaths);

  if (report.summary.promotionPlanRowCount !== 4) throw new Error("expected four standings promotion plan rows");
  if (report.summary.promotionPlanReadyCount !== 4) throw new Error("expected all four standings rows ready");
  if (report.summary.proposedStandingsTableRowCount !== 54) {
    throw new Error(`expected 54 proposed standings table rows, got ${report.summary.proposedStandingsTableRowCount}`);
  }
  if (report.guarantees.noStandingsWrites !== true ||
      report.guarantees.noCanonicalPromotion !== true ||
      report.guarantees.canonicalWrites !== 0 ||
      report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  writeJson(path.resolve(repoRoot, args.output), report);
  console.log(JSON.stringify(report.summary, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReportFromPlans };
