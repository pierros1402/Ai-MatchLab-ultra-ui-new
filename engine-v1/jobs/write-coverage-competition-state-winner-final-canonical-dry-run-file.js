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
    plan: "",
    output: "",
    dryRun: false,
    execute: false,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--execute") args.execute = true;
    else if (arg === "--plan") args.plan = argv[++i] || "";
    else if (arg.startsWith("--plan=")) args.plan = arg.slice("--plan=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error("unknown argument: " + arg);
  }

  if (args.execute) {
    throw new Error("--execute is intentionally unsupported in this skeleton; use --dry-run only");
  }

  if (!args.selfTest && !args.plan) throw new Error("--plan is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function planRowsOf(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["promotionPlanRows", "rows", "items"]) {
    if (Array.isArray(json && json[key])) return json[key];
  }
  return [];
}

function isReadyWinnerFinalPlan(row) {
  const readiness = row && typeof row === "object" ? row.readiness || {} : {};
  const gates = row && typeof row === "object" ? row.safetyGates || {} : {};
  const payload = row && typeof row === "object" ? row.proposedCanonicalPayload || {} : {};

  return (
    asText(row && row.promotionType) === "competition_state_winner_final" &&
    asText(row && row.proposedCanonicalState) === "winner_final_confirmed_pending_writer_approval" &&
    readiness.promotionPlanReady === true &&
    readiness.shapeComplete === true &&
    readiness.sourcePolicySatisfied === true &&
    readiness.hasOfficialConfirmation === true &&
    readiness.hasIndependentReference === true &&
    gates.requiresSeparateWriter === true &&
    gates.requiresExplicitPromotionApprovalFlag === true &&
    gates.requiresDryRunWriterFirst === true &&
    Boolean(asText(payload.competitionSlug)) &&
    Boolean(asText(payload.winnerTeam)) &&
    Boolean(asText(payload.runnerUpTeam)) &&
    Boolean(asText(payload.finalScore))
  );
}

function blockReasonFor(row) {
  if (asText(row && row.promotionType) !== "competition_state_winner_final") return "unsupported_promotion_type";
  if (asText(row && row.proposedCanonicalState) !== "winner_final_confirmed_pending_writer_approval") return "not_pending_writer_approval";

  const readiness = row && typeof row === "object" ? row.readiness || {} : {};
  const gates = row && typeof row === "object" ? row.safetyGates || {} : {};
  const payload = row && typeof row === "object" ? row.proposedCanonicalPayload || {} : {};

  if (readiness.promotionPlanReady !== true) return "promotion_plan_not_ready";
  if (readiness.shapeComplete !== true) return "incomplete_final_shape";
  if (readiness.sourcePolicySatisfied !== true) return "source_policy_not_satisfied";
  if (readiness.hasOfficialConfirmation !== true) return "missing_official_confirmation";
  if (readiness.hasIndependentReference !== true) return "missing_independent_reference";
  if (gates.requiresSeparateWriter !== true) return "missing_requires_separate_writer_gate";
  if (gates.requiresExplicitPromotionApprovalFlag !== true) return "missing_explicit_approval_gate";
  if (gates.requiresDryRunWriterFirst !== true) return "missing_dry_run_first_gate";
  if (!asText(payload.competitionSlug)) return "missing_competition_slug";
  if (!asText(payload.winnerTeam)) return "missing_winner_team";
  if (!asText(payload.runnerUpTeam)) return "missing_runner_up_team";
  if (!asText(payload.finalScore)) return "missing_final_score";

  return "";
}

function canonicalPreviewFor(row) {
  const payload = row.proposedCanonicalPayload || {};
  const evidence = row.evidenceSummary || {};
  const sourceRows = row.sourceRows || {};

  return {
    canonicalRecordType: "competition_state_winner_final",
    canonicalKey: [
      asText(payload.competitionSlug),
      asText(payload.resultType) || "final_winner",
      asText(payload.seasonHint) || "unknown-season"
    ].join("::"),
    competitionSlug: asText(payload.competitionSlug),
    competitionName: asText(payload.competitionName),
    seasonHint: asText(payload.seasonHint),
    winnerTeam: asText(payload.winnerTeam),
    runnerUpTeam: asText(payload.runnerUpTeam),
    finalScore: asText(payload.finalScore),
    resultType: asText(payload.resultType) || "final_winner",
    evidenceStatus: asText(payload.evidenceStatus),
    sourceSummary: {
      officialConfirmationHost: asText(evidence.officialConfirmationHost),
      independentReferenceHosts: asArray(evidence.independentReferenceHosts).map(asText).filter(Boolean),
      sourceHostCount: evidence.sourceHostCount || 0
    },
    sourceTrace: {
      officialFinalUrl: asText(sourceRows.officialValidationRow && sourceRows.officialValidationRow.finalUrl),
      referenceFinalUrls: asArray(sourceRows.referenceValidationRows)
        .map((row) => asText(row && row.finalUrl))
        .filter(Boolean)
    },
    writerState: "dry_run_only_not_written"
  };
}

function buildReport(input, { inputPath = "", dryRun = false } = {}) {
  const rows = planRowsOf(input);
  const readyRows = rows.filter(isReadyWinnerFinalPlan);
  const blockedRows = rows
    .filter((row) => !isReadyWinnerFinalPlan(row))
    .map((row) => ({
      promotionPlanId: asText(row.promotionPlanId),
      competitionSlug: asText(row.competitionSlug),
      blockReason: blockReasonFor(row) || "unknown_block_reason",
      canonicalWrites: 0,
      productionWrite: false
    }));

  const previews = dryRun ? readyRows.map(canonicalPreviewFor) : [];

  return {
    ok: true,
    job: "write-coverage-competition-state-winner-final-canonical-dry-run-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    mode: dryRun ? "dry_run" : "blocked_missing_dry_run_flag",
    summary: {
      inputPromotionPlanRowCount: rows.length,
      readyPromotionPlanRowCount: readyRows.length,
      blockedPromotionPlanRowCount: blockedRows.length,
      dryRunEnabled: dryRun,
      wouldWriteCanonicalRows: dryRun ? previews.length : 0,
      actualCanonicalWrites: 0,
      productionWrite: false,
      byCompetition: readyRows.reduce((acc, row) => {
        const key = asText(row.competitionSlug) || "unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      blockedByReason: blockedRows.reduce((acc, row) => {
        const key = asText(row.blockReason) || "unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    },
    canonicalWritePreviewRows: previews,
    blockedPromotionPlanRows: blockedRows,
    safety: {
      actualWriterImplemented: false,
      executeFlagSupported: false,
      dryRunFlagRequired: true,
      noCanonicalWriteInThisJob: true,
      noProductionWriteInThisJob: true,
      requiresFutureExplicitApprovalForActualWrite: true
    },
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedPromotionPlanRows: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: dryRun
    }
  };
}

function runSelfTest() {
  const input = {
    promotionPlanRows: [
      {
        promotionPlanId: "afc.champions::winner-final::01",
        promotionType: "competition_state_winner_final",
        competitionSlug: "afc.champions",
        proposedCanonicalState: "winner_final_confirmed_pending_writer_approval",
        proposedCanonicalPayload: {
          competitionSlug: "afc.champions",
          competitionName: "AFC Champions League Elite",
          seasonHint: "2024/25 or 2025 final",
          winnerTeam: "Al Ahli Saudi FC",
          runnerUpTeam: "Kawasaki Frontale",
          finalScore: "2-0",
          resultType: "final_winner",
          evidenceStatus: "confirmed_from_official_and_independent_reference"
        },
        evidenceSummary: {
          officialConfirmationHost: "the-afc.com",
          independentReferenceHosts: ["en.wikipedia.org"],
          sourceHostCount: 2
        },
        readiness: {
          promotionPlanReady: true,
          shapeComplete: true,
          sourcePolicySatisfied: true,
          hasOfficialConfirmation: true,
          hasIndependentReference: true
        },
        safetyGates: {
          requiresSeparateWriter: true,
          requiresExplicitPromotionApprovalFlag: true,
          requiresDryRunWriterFirst: true
        },
        sourceRows: {
          officialValidationRow: {
            finalUrl: "https://www.the-afc.com/en/club/afc_champions_league_elite.html/video/aclelite-%7C-final-al-ahli-saudi-fc-ksa-2-0-kawasaki-frontale-jpn"
          },
          referenceValidationRows: [
            {
              finalUrl: "https://en.wikipedia.org/wiki/2025_AFC_Champions_League_Elite_final"
            }
          ]
        }
      }
    ]
  };

  const blocked = buildReport(input, { inputPath: "self-test", dryRun: false });
  if (blocked.summary.wouldWriteCanonicalRows !== 0) throw new Error("blocked mode must not preview writes");
  if (blocked.mode !== "blocked_missing_dry_run_flag") throw new Error("expected blocked mode without dry-run");

  const dry = buildReport(input, { inputPath: "self-test", dryRun: true });
  if (dry.summary.wouldWriteCanonicalRows !== 1) throw new Error("expected one dry-run write preview");
  if (dry.summary.actualCanonicalWrites !== 0) throw new Error("expected zero actual writes");
  if (dry.canonicalWritePreviewRows[0].winnerTeam !== "Al Ahli Saudi FC") throw new Error("expected Al Ahli winner");
  if (dry.canonicalWritePreviewRows[0].finalScore !== "2-0") throw new Error("expected final score 2-0");
  if (dry.guarantees.canonicalWrites !== 0 || dry.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "write-coverage-competition-state-winner-final-canonical-dry-run-file",
    blockedSummary: blocked.summary,
    dryRunSummary: dry.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const input = readJson(args.plan);
  const report = buildReport(input, {
    inputPath: args.plan,
    dryRun: args.dryRun
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport, canonicalPreviewFor };