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

function asArray(value) {
  return Array.isArray(value) ? value : [];
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
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.inventory) throw new Error("--inventory is required");
  if (!args.selfTest && !args.validation) throw new Error("--validation is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function inventoryRowsOf(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json && json.rows)) return json.rows;
  return [];
}

function validationRowsOf(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["competitionStateValidationRows", "validatedCompetitionStateRows", "secondSourceRequiredRows", "rows", "items"]) {
    if (Array.isArray(json && json[key])) return json[key];
  }
  return [];
}

function validationPriority(row) {
  const state = asText(row.validationState);
  if (state === "qualifier_calendar_validated_from_official_source") return 100;
  if (state.includes("candidate_needs_second_source")) return 70;
  if (state.includes("needs_more_specific")) return 60;
  if (state.includes("needs_second_source")) return 50;
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

  for (const [slug, list] of map.entries()) {
    list.sort((a, b) => validationPriority(b) - validationPriority(a));
    map.set(slug, list);
  }

  return map;
}

function derivedCompetitionState(baseRow, validationRows) {
  if (!validationRows.length) {
    return {
      competitionState: asText(baseRow.competitionState || "unknown_needs_competition_state_evidence"),
      competitionStateEvidenceStatus: "no_validation_overlay",
      competitionStateConfidence: "unknown",
      competitionStateRequiresSecondSource: true,
      competitionStateReason: "no validation row available"
    };
  }

  const best = validationRows[0];
  const state = asText(best.validationState);

  if (state === "qualifier_calendar_validated_from_official_source") {
    return {
      competitionState: "validated_qualifier_calendar_available",
      competitionStateEvidenceStatus: "validated_from_official_source",
      competitionStateConfidence: asText(best.validationConfidence || "high"),
      competitionStateRequiresSecondSource: false,
      competitionStateReason: asText(best.decisionReason)
    };
  }

  if (state === "winner_or_final_needs_more_specific_final_evidence") {
    return {
      competitionState: "winner_or_final_evidence_needs_more_specific_source",
      competitionStateEvidenceStatus: "needs_more_specific_evidence",
      competitionStateConfidence: asText(best.validationConfidence || "medium"),
      competitionStateRequiresSecondSource: true,
      competitionStateReason: asText(best.decisionReason)
    };
  }

  if (state.includes("needs_second_source")) {
    return {
      competitionState: "competition_state_needs_second_source",
      competitionStateEvidenceStatus: "needs_second_source",
      competitionStateConfidence: asText(best.validationConfidence || "low"),
      competitionStateRequiresSecondSource: true,
      competitionStateReason: asText(best.decisionReason)
    };
  }

  return {
    competitionState: "competition_state_validation_needs_review",
    competitionStateEvidenceStatus: "needs_review",
    competitionStateConfidence: asText(best.validationConfidence || "low"),
    competitionStateRequiresSecondSource: true,
    competitionStateReason: asText(best.decisionReason || "validation row needs review")
  };
}

function compactValidation(row) {
  return {
    validationState: asText(row.validationState),
    validationConfidence: asText(row.validationConfidence),
    requiresSecondSource: row.requiresSecondSource === true,
    evidenceType: asText(row.evidenceType),
    sourceType: asText(row.sourceType),
    hostname: asText(row.hostname),
    finalUrl: asText(row.finalUrl),
    extractedDateMentions: asArray(row.extractedDateMentions),
    extractedRoundMentions: asArray(row.extractedRoundMentions),
    decisionReason: asText(row.decisionReason)
  };
}

function buildReport({ inventory, validation }, inputPaths = {}) {
  const inventoryRows = inventoryRowsOf(inventory);
  const validationsByCompetition = groupValidations(validationRowsOf(validation));

  const rows = inventoryRows.map((row) => {
    const slug = asText(row.competitionSlug || row.leagueSlug);
    const validationRows = validationsByCompetition.get(slug) || [];
    const derived = derivedCompetitionState(row, validationRows);

    return {
      ...row,
      ...derived,
      appliedValidationCount: validationRows.length,
      appliedValidations: validationRows.map(compactValidation),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const appliedRows = rows.filter((row) => row.appliedValidationCount > 0);

  return {
    ok: true,
    job: "apply-coverage-competition-state-validation-overlay-file",
    generatedAt: new Date().toISOString(),
    inputPaths,
    summary: {
      inventoryRowCount: inventoryRows.length,
      validationInputRowCount: validationRowsOf(validation).length,
      overlayAppliedCompetitionCount: appliedRows.length,
      byCompetitionState: countBy(rows, "competitionState"),
      byEvidenceStatus: countBy(rows, "competitionStateEvidenceStatus"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    rows,
    overlayAppliedRows: appliedRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedInventoryAndValidationRows: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function runSelfTest() {
  const inventory = {
    rows: [
      { competitionSlug: "uefa.champions", competitionName: "UEFA Champions League", competitionState: "unknown_needs_competition_state_evidence" },
      { competitionSlug: "afc.champions", competitionName: "AFC Champions League", competitionState: "unknown_needs_competition_state_evidence" },
      { competitionSlug: "eng.1", competitionName: "Premier League", competitionState: "unknown_needs_competition_state_evidence" }
    ]
  };

  const validation = {
    competitionStateValidationRows: [
      {
        competitionSlug: "uefa.champions",
        validationState: "qualifier_calendar_validated_from_official_source",
        validationConfidence: "high",
        requiresSecondSource: false,
        evidenceType: "qualifier_calendar_evidence",
        sourceType: "official_uefa",
        hostname: "uefa.com",
        finalUrl: "https://www.uefa.com/test",
        extractedDateMentions: ["8 July 2025"],
        extractedRoundMentions: ["first qualifying round"],
        decisionReason: "official test"
      },
      {
        competitionSlug: "afc.champions",
        validationState: "winner_or_final_needs_more_specific_final_evidence",
        validationConfidence: "medium",
        requiresSecondSource: true,
        evidenceType: "winner_or_final_evidence",
        sourceType: "official_afc",
        hostname: "the-afc.com",
        finalUrl: "https://www.the-afc.com/test",
        extractedDateMentions: [],
        extractedRoundMentions: ["final"],
        decisionReason: "needs specific winner source"
      }
    ]
  };

  const report = buildReport({ inventory, validation }, { inventory: "self-test", validation: "self-test" });

  if (report.summary.inventoryRowCount !== 3) throw new Error("expected three inventory rows");
  if (report.summary.overlayAppliedCompetitionCount !== 2) throw new Error("expected two overlay rows");
  if (report.summary.byCompetitionState.validated_qualifier_calendar_available !== 1) throw new Error("missing validated qualifier state");
  if (report.summary.byCompetitionState.winner_or_final_evidence_needs_more_specific_source !== 1) throw new Error("missing winner needs-more-specific state");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "apply-coverage-competition-state-validation-overlay-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const inventory = readJson(args.inventory);
  const validation = readJson(args.validation);
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