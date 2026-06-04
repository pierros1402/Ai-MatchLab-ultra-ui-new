#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath, label) {
  if (!filePath) throw new Error(`${label} path is required`);
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    inventory: "",
    validation: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--inventory") args.inventory = argv[++i] || "";
    else if (arg.startsWith("--inventory=")) args.inventory = arg.slice("--inventory=".length);
    else if (arg === "--validation") args.validation = argv[++i] || "";
    else if (arg.startsWith("--validation=")) args.validation = arg.slice("--validation=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.inventory) throw new Error("--inventory is required");
  if (!args.selfTest && !args.validation) throw new Error("--validation is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function inventoryRowsOf(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["rows", "inventoryRows", "footballTruthStateRows", "items"]) {
    if (Array.isArray(json?.[key])) return json[key];
  }
  return [];
}

function validationRowsOf(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["seasonStatusValidationRows", "validatedSeasonStatusRows", "secondSourceRequiredRows", "rows", "items"]) {
    if (Array.isArray(json?.[key])) return json[key];
  }
  return [];
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function validationPriority(row) {
  const state = asText(row.validationState);
  if (state === "season_calendar_validated_from_official_source") return 100;
  if (state === "season_calendar_candidate_needs_official_confirmation") return 70;
  if (state === "season_calendar_candidate_needs_more_specific_evidence") return 60;
  if (state.includes("needs_more_specific")) return 50;
  if (state.includes("needs_second_source")) return 40;
  return 10;
}

function groupValidations(rows) {
  const map = new Map();

  for (const row of rows) {
    const slug = asText(row.competitionSlug || row.leagueSlug);
    if (!slug) continue;

    if (!map.has(slug)) map.set(slug, []);
    map.get(slug).push(row);
  }

  for (const rowsForCompetition of map.values()) {
    rowsForCompetition.sort((a, b) => validationPriority(b) - validationPriority(a));
  }

  return map;
}

function compactValidation(row) {
  return {
    validationState: asText(row.validationState),
    validationConfidence: asText(row.validationConfidence),
    requiresSecondSource: row.requiresSecondSource === true,
    evidenceType: asText(row.evidenceType),
    evidenceState: asText(row.evidenceState),
    sourceType: asText(row.sourceType),
    fetchPurpose: asText(row.fetchPurpose),
    hostname: asText(row.hostname),
    finalUrl: asText(row.finalUrl || row.sourceUrl),
    targetDate: asText(row.targetDate || row.dayKey),
    seasonKey: asText(row.seasonKey),
    signalScore: Number(row.signalScore || 0),
    decisionReason: asText(row.decisionReason)
  };
}

function derivedSeasonStatus(baseRow, validationRows) {
  if (validationRows.length === 0) {
    return {
      seasonStatusEvidenceStatus: "no_validation_overlay",
      seasonStatusConfidence: "unknown",
      seasonStatusRequiresSecondSource: true,
      seasonStatusState: asText(baseRow.seasonStatusState || baseRow.competitionState || "unknown_needs_season_status_evidence"),
      seasonStatusReason: "no season-status validation row available",
      bestSeasonStatusValidation: null
    };
  }

  const best = validationRows[0];
  const state = asText(best.validationState);

  if (state === "season_calendar_validated_from_official_source") {
    return {
      seasonStatusEvidenceStatus: "validated_from_official_source",
      seasonStatusConfidence: asText(best.validationConfidence || "high"),
      seasonStatusRequiresSecondSource: false,
      seasonStatusState: "validated_season_calendar_available",
      seasonStatusReason: asText(best.decisionReason),
      bestSeasonStatusValidation: compactValidation(best)
    };
  }

  if (state === "season_calendar_candidate_needs_official_confirmation") {
    return {
      seasonStatusEvidenceStatus: "needs_official_confirmation",
      seasonStatusConfidence: asText(best.validationConfidence || "medium"),
      seasonStatusRequiresSecondSource: true,
      seasonStatusState: "season_calendar_candidate_needs_official_confirmation",
      seasonStatusReason: asText(best.decisionReason),
      bestSeasonStatusValidation: compactValidation(best)
    };
  }

  if (state.includes("needs_more_specific")) {
    return {
      seasonStatusEvidenceStatus: "needs_more_specific_evidence",
      seasonStatusConfidence: asText(best.validationConfidence || "low"),
      seasonStatusRequiresSecondSource: true,
      seasonStatusState: "season_status_needs_more_specific_evidence",
      seasonStatusReason: asText(best.decisionReason),
      bestSeasonStatusValidation: compactValidation(best)
    };
  }

  return {
    seasonStatusEvidenceStatus: "needs_review",
    seasonStatusConfidence: asText(best.validationConfidence || "low"),
    seasonStatusRequiresSecondSource: best.requiresSecondSource !== false,
    seasonStatusState: "season_status_validation_needs_review",
    seasonStatusReason: asText(best.decisionReason || "season-status validation row needs review"),
    bestSeasonStatusValidation: compactValidation(best)
  };
}

function buildReport({ inventory, validation }, inputPaths = {}) {
  const inventoryRows = inventoryRowsOf(inventory);
  const validationsByCompetition = groupValidations(validationRowsOf(validation));

  const rows = inventoryRows.map((row) => {
    const slug = asText(row.competitionSlug || row.leagueSlug);
    const validationRows = validationsByCompetition.get(slug) || [];
    const derived = derivedSeasonStatus(row, validationRows);

    return {
      ...row,
      ...derived,
      seasonStatusValidationRowCount: validationRows.length,
      seasonStatusValidationRows: validationRows.slice(0, 5).map(compactValidation),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  });

  const overlayAppliedRows = rows.filter((row) => row.seasonStatusEvidenceStatus !== "no_validation_overlay");

  return {
    ok: true,
    job: "apply-football-truth-season-status-validation-overlay-file",
    generatedAt: new Date().toISOString(),
    inputPaths,
    summary: {
      inventoryRowCount: inventoryRows.length,
      validationInputRowCount: validationRowsOf(validation).length,
      overlayAppliedCompetitionCount: overlayAppliedRows.length,
      bySeasonStatusState: countBy(rows, "seasonStatusState"),
      bySeasonStatusEvidenceStatus: countBy(rows, "seasonStatusEvidenceStatus"),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    rows,
    overlayAppliedRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedInventoryAndValidationRows: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    canonicalWrites: 0,
    productionWrite: false
  };
}

function runSelfTest() {
  const inventory = {
    rows: [
      { competitionSlug: "uefa.europa", competitionName: "UEFA Europa League", competitionState: "unknown_needs_season_status_evidence" },
      { competitionSlug: "eng.1", competitionName: "Premier League", competitionState: "unknown_needs_season_status_evidence" },
      { competitionSlug: "test.none", competitionName: "No Evidence League", competitionState: "unknown_needs_season_status_evidence" }
    ]
  };

  const validation = {
    seasonStatusValidationRows: [
      {
        competitionSlug: "uefa.europa",
        validationState: "season_calendar_validated_from_official_source",
        validationConfidence: "high",
        requiresSecondSource: false,
        evidenceType: "season_status_calendar_evidence",
        hostname: "www.uefa.com",
        finalUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        signalScore: 3,
        decisionReason: "official source test"
      },
      {
        competitionSlug: "eng.1",
        validationState: "season_calendar_candidate_needs_official_confirmation",
        validationConfidence: "medium",
        requiresSecondSource: true,
        evidenceType: "season_status_calendar_evidence",
        hostname: "example.com",
        finalUrl: "https://example.com/premier-league-fixtures",
        signalScore: 1,
        decisionReason: "non-official source test"
      }
    ]
  };

  const report = buildReport({ inventory, validation }, { inventory: "self-test", validation: "self-test" });

  if (report.summary.inventoryRowCount !== 3) throw new Error("expected three inventory rows");
  if (report.summary.validationInputRowCount !== 2) throw new Error("expected two validation rows");
  if (report.summary.overlayAppliedCompetitionCount !== 2) throw new Error("expected two overlay rows");
  if (report.summary.bySeasonStatusState.validated_season_calendar_available !== 1) throw new Error("missing validated season calendar state");
  if (report.summary.bySeasonStatusState.season_calendar_candidate_needs_official_confirmation !== 1) throw new Error("missing official-confirmation state");
  if (report.summary.bySeasonStatusEvidenceStatus.no_validation_overlay !== 1) throw new Error("missing no-validation overlay state");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "apply-football-truth-season-status-validation-overlay-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const inventory = readJson(args.inventory, "inventory");
  const validation = readJson(args.validation, "validation");
  const report = buildReport({ inventory, validation }, { inventory: args.inventory, validation: args.validation });

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