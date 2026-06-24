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
    merge: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--merge") args.merge = argv[++i] || "";
    else if (arg.startsWith("--merge=")) args.merge = arg.slice("--merge=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.merge) throw new Error("--merge is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function mergedRowsOf(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["mergedWinnerFinalConfirmationRows", "mergedRows", "rows", "items"]) {
    if (Array.isArray(json && json[key])) return json[key];
  }
  return [];
}

function sourceHostList(row) {
  const roles = row && typeof row === "object" ? row.sourceRoles || {} : {};
  return [
    asText(roles.officialConfirmation),
    ...asArray(roles.independentReference).map(asText)
  ].filter(Boolean);
}

function isPromotionPlanCandidate(row) {
  return (
    asText(row.confirmationState) === "confirmed_winner_final_candidate_needs_promotion_plan" &&
    asText(row.confirmationConfidence) === "high" &&
    row.canonicalPromotionReady === false
  );
}

function finalShapeOf(row) {
  const shape = row && typeof row === "object" ? row.confirmedFinalShape || {} : {};
  return {
    winnerTeam: asText(shape.winnerTeam),
    runnerUpTeam: asText(shape.runnerUpTeam),
    finalScore: asText(shape.finalScore),
    competitionName: asText(shape.competitionName),
    seasonHint: asText(shape.seasonHint),
    hasFinal: shape.hasFinal === true,
    hasAfc: shape.hasAfc === true,
    hasNamedTeams: shape.hasNamedTeams === true,
    hasExplicitScore: shape.hasExplicitScore === true
  };
}

function planRowFor(row, index) {
  const finalShape = finalShapeOf(row);
  const sourceHosts = sourceHostList(row);
  const hasOfficial = sourceHosts.includes("the-afc.com");
  const hasReference = sourceHosts.includes("en.wikipedia.org");

  const shapeComplete =
    Boolean(finalShape.winnerTeam) &&
    Boolean(finalShape.runnerUpTeam) &&
    Boolean(finalShape.finalScore) &&
    finalShape.hasFinal &&
    finalShape.hasNamedTeams &&
    finalShape.hasExplicitScore;

  const sourcePolicySatisfied = hasOfficial && hasReference;
  const proposalReady = shapeComplete && sourcePolicySatisfied;

  return {
    promotionPlanId: [
      asText(row.competitionSlug) || "unknown-competition",
      "winner-final",
      String(index + 1).padStart(2, "0")
    ].join("::"),
    promotionType: "competition_state_winner_final",
    competitionSlug: asText(row.competitionSlug),
    confirmationState: asText(row.confirmationState),
    confirmationConfidence: asText(row.confirmationConfidence),
    proposedCanonicalState: proposalReady
      ? "winner_final_confirmed_pending_writer_approval"
      : "winner_final_promotion_plan_blocked",
    proposedCanonicalPayload: {
      competitionSlug: asText(row.competitionSlug),
      competitionName: finalShape.competitionName,
      seasonHint: finalShape.seasonHint,
      winnerTeam: finalShape.winnerTeam,
      runnerUpTeam: finalShape.runnerUpTeam,
      finalScore: finalShape.finalScore,
      resultType: "final_winner",
      evidenceStatus: "confirmed_from_official_and_independent_reference"
    },
    evidenceSummary: {
      officialConfirmationHost: hasOfficial ? "the-afc.com" : "",
      independentReferenceHosts: sourceHosts.filter((host) => host !== "the-afc.com"),
      sourceHostCount: sourceHosts.length,
      finalShape
    },
    readiness: {
      promotionPlanReady: proposalReady,
      shapeComplete,
      sourcePolicySatisfied,
      hasOfficialConfirmation: hasOfficial,
      hasIndependentReference: hasReference,
      canonicalPromotionReadyInMergeInput: row.canonicalPromotionReady === true
    },
    safetyGates: {
      noCanonicalWriteInThisJob: true,
      requiresSeparateWriter: true,
      requiresExplicitPromotionApprovalFlag: true,
      requiresDryRunWriterFirst: true,
      rejectIfMissingOfficialConfirmation: true,
      rejectIfMissingIndependentReference: true,
      rejectIfIncompleteFinalShape: true
    },
    blockedCanonicalWriteReason: "promotion plan diagnostic only; canonical write requires separate writer with explicit approval",
    sourceRows: {
      officialValidationRow: row.officialValidationRow || null,
      referenceValidationRows: asArray(row.referenceValidationRows)
    },
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildPromotionPlanRows(rows) {
  const candidateRows = rows.filter(isPromotionPlanCandidate);
  return candidateRows.map(planRowFor);
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport(input, inputPath = "") {
  const rows = mergedRowsOf(input);
  const promotionPlanRows = buildPromotionPlanRows(rows);

  return {
    ok: true,
    job: "build-coverage-competition-state-winner-final-promotion-plan-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    summary: {
      mergedConfirmationRowCount: rows.length,
      promotionPlanRowCount: promotionPlanRows.length,
      promotionPlanReadyCount: promotionPlanRows.filter((row) => row.readiness.promotionPlanReady === true).length,
      blockedPromotionPlanCount: promotionPlanRows.filter((row) => row.readiness.promotionPlanReady !== true).length,
      proposedCanonicalWriteCount: 0,
      byPromotionType: countBy(promotionPlanRows, "promotionType"),
      byCompetition: countBy(promotionPlanRows, "competitionSlug"),
      byProposedCanonicalState: countBy(promotionPlanRows, "proposedCanonicalState"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    promotionPlanRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedMergeRows: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const report = buildReport({
    mergedWinnerFinalConfirmationRows: [
      {
        competitionSlug: "afc.champions",
        confirmationState: "confirmed_winner_final_candidate_needs_promotion_plan",
        confirmationConfidence: "high",
        canonicalPromotionReady: false,
        confirmedFinalShape: {
          winnerTeam: "Al Ahli Saudi FC",
          runnerUpTeam: "Kawasaki Frontale",
          finalScore: "2-0",
          competitionName: "AFC Champions League Elite",
          seasonHint: "2024/25 or 2025 final",
          hasFinal: true,
          hasAfc: true,
          hasNamedTeams: true,
          hasExplicitScore: true
        },
        sourceRoles: {
          officialConfirmation: "the-afc.com",
          independentReference: ["en.wikipedia.org"]
        }
      }
    ]
  }, "self-test");

  if (report.summary.promotionPlanRowCount !== 1) throw new Error("expected one promotion plan row");
  if (report.summary.promotionPlanReadyCount !== 1) throw new Error("expected one ready promotion plan row");
  if (report.summary.proposedCanonicalWriteCount !== 0) throw new Error("expected zero canonical writes");
  if (report.promotionPlanRows[0].readiness.promotionPlanReady !== true) throw new Error("expected ready plan");
  if (report.promotionPlanRows[0].proposedCanonicalPayload.winnerTeam !== "Al Ahli Saudi FC") throw new Error("expected Al Ahli winner");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "build-coverage-competition-state-winner-final-promotion-plan-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const input = readJson(args.merge);
  const report = buildReport(input, args.merge);
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

export { buildReport, buildPromotionPlanRows };