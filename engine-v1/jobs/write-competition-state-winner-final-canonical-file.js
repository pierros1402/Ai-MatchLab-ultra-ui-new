import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildReport } from "./write-coverage-competition-state-winner-final-canonical-dry-run-file.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

function asText(value) {
  return String(value ?? "").trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function repoRelative(filePath) {
  return path.relative(repoRoot, path.resolve(filePath)).replace(/\\/g, "/");
}

function isInsideRepo(filePath) {
  const absolute = path.resolve(filePath);
  const relative = path.relative(repoRoot, absolute);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    plan: "",
    output: "",
    canonicalOutput: path.join(
      repoRoot,
      "data",
      "football-truth",
      "_state",
      "competition-state-winner-final",
      "competition-state-winner-final.json"
    ),
    apply: false,
    allowProductionWrites: false,
    confirmUefaCupWinnerFinalWrite: false,
    allowOverwriteCanonicalState: false,
    allowedCompetitionSlugs: [],
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--plan") args.plan = argv[++i] || "";
    else if (arg.startsWith("--plan=")) args.plan = arg.slice("--plan=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--canonical-output") args.canonicalOutput = argv[++i] || "";
    else if (arg.startsWith("--canonical-output=")) args.canonicalOutput = arg.slice("--canonical-output=".length);
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--allow-production-writes") args.allowProductionWrites = true;
    else if (arg === "--confirm-uefa-cup-winner-final-write") args.confirmUefaCupWinnerFinalWrite = true;
    else if (arg === "--allow-overwrite-canonical-state") args.allowOverwriteCanonicalState = true;
    else if (arg === "--allowed-competition-slugs") {
      args.allowedCompetitionSlugs = String(argv[++i] || "")
        .split(",")
        .map(asText)
        .filter(Boolean);
    } else if (arg.startsWith("--allowed-competition-slugs=")) {
      args.allowedCompetitionSlugs = arg
        .slice("--allowed-competition-slugs=".length)
        .split(",")
        .map(asText)
        .filter(Boolean);
    } else {
      throw new Error("unknown argument: " + arg);
    }
  }

  if (!args.selfTest && !args.plan) throw new Error("--plan is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");
  if (!args.selfTest && !args.canonicalOutput) throw new Error("--canonical-output is required");

  return args;
}

function canonicalStoreOf(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      ok: true,
      schema: "ai-matchlab.competition-state-winner-final.v1",
      rows: []
    };
  }

  const rows = Array.isArray(raw.rows)
    ? raw.rows
    : Array.isArray(raw.canonicalRows)
      ? raw.canonicalRows
      : [];

  return {
    ...raw,
    ok: raw.ok !== false,
    schema: asText(raw.schema) || "ai-matchlab.competition-state-winner-final.v1",
    rows
  };
}

function loadCanonicalStore(filePath) {
  if (!fs.existsSync(filePath)) return canonicalStoreOf({});
  return canonicalStoreOf(readJson(filePath));
}

function validateAllowedSlugs(previewRows, allowedCompetitionSlugs) {
  const allowed = new Set(allowedCompetitionSlugs.map(asText).filter(Boolean));
  const slugs = previewRows.map((row) => asText(row.competitionSlug)).filter(Boolean);
  const uniqueSlugs = [...new Set(slugs)].sort();

  if (allowed.size === 0) {
    return ["missing_allowed_competition_slugs"];
  }

  const unexpected = uniqueSlugs.filter((slug) => !allowed.has(slug));
  const missing = [...allowed].filter((slug) => !uniqueSlugs.includes(slug));

  const errors = [];
  if (unexpected.length) errors.push("unexpected_competition_slugs:" + unexpected.join(","));
  if (missing.length) errors.push("missing_allowed_competition_slugs:" + missing.join(","));

  return errors;
}

function buildCanonicalRecord(previewRow, options = {}) {
  return {
    ...previewRow,
    canonicalRecordType: "competition_state_winner_final",
    writerState: options.written
      ? "canonical_written"
      : "canonical_write_preview_not_written",
    provenance: {
      generatedBy: "write-competition-state-winner-final-canonical-file",
      inputPromotionPlan: options.inputPath ? repoRelative(options.inputPath) : "",
      writtenAt: options.written ? new Date().toISOString() : null,
      dryRunAt: options.written ? null : new Date().toISOString()
    },
    writeGuards: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    }
  };
}

function buildWriteReport(plan, options = {}) {
  const inputPath = options.inputPath || "";
  const canonicalOutput = path.resolve(options.canonicalOutput || "");
  const apply = options.apply === true;
  const allowProductionWrites = options.allowProductionWrites === true;
  const confirmUefaCupWinnerFinalWrite = options.confirmUefaCupWinnerFinalWrite === true;
  const allowOverwriteCanonicalState = options.allowOverwriteCanonicalState === true;
  const allowedCompetitionSlugs = Array.isArray(options.allowedCompetitionSlugs)
    ? options.allowedCompetitionSlugs
    : [];

  const dryValidation = buildReport(plan, { inputPath, dryRun: true });
  const previewRows = Array.isArray(dryValidation.canonicalWritePreviewRows)
    ? dryValidation.canonicalWritePreviewRows
    : [];

  const mayWrite = apply && allowProductionWrites && confirmUefaCupWinnerFinalWrite;

  const planErrors = [];
  if (dryValidation?.ok !== true) planErrors.push("dry_validation_not_ok");
  if (dryValidation?.summary?.readyPromotionPlanRowCount !== previewRows.length) {
    planErrors.push("preview_row_count_mismatch");
  }
  if (dryValidation?.summary?.blockedPromotionPlanRowCount !== 0) {
    planErrors.push("blocked_promotion_plan_rows_present");
  }
  if (previewRows.length === 0) planErrors.push("no_canonical_preview_rows");
  if (apply && !allowProductionWrites) planErrors.push("apply_requires_allow_production_writes");
  if (apply && !confirmUefaCupWinnerFinalWrite) planErrors.push("apply_requires_confirm_uefa_cup_winner_final_write");
  if (apply) planErrors.push(...validateAllowedSlugs(previewRows, allowedCompetitionSlugs));
  if (canonicalOutput && !isInsideRepo(canonicalOutput)) planErrors.push("canonical_output_outside_repo");

  const existing = loadCanonicalStore(canonicalOutput);
  const existingByKey = new Map(
    existing.rows
      .map((row) => [asText(row.canonicalKey), row])
      .filter(([key]) => Boolean(key))
  );

  const collisionRows = [];
  const writeRows = [];

  for (const previewRow of previewRows) {
    const canonicalKey = asText(previewRow.canonicalKey);
    const record = buildCanonicalRecord(previewRow, {
      inputPath,
      written: mayWrite
    });

    if (canonicalKey && existingByKey.has(canonicalKey) && !allowOverwriteCanonicalState) {
      collisionRows.push({
        canonicalKey,
        competitionSlug: asText(previewRow.competitionSlug),
        reason: "canonical_key_exists_requires_allow_overwrite_canonical_state"
      });
      continue;
    }

    writeRows.push(record);
  }

  if (collisionRows.length) planErrors.push("canonical_key_collision");

  const writtenRows = [];
  const wouldWriteRows = mayWrite ? [] : writeRows;

  if (mayWrite && planErrors.length === 0) {
    const nextByKey = new Map(existingByKey);

    for (const record of writeRows) {
      nextByKey.set(asText(record.canonicalKey), record);
      writtenRows.push({
        canonicalKey: asText(record.canonicalKey),
        competitionSlug: asText(record.competitionSlug),
        canonicalOutput: repoRelative(canonicalOutput)
      });
    }

    const nextStore = {
      ok: true,
      schema: "ai-matchlab.competition-state-winner-final.v1",
      updatedAt: new Date().toISOString(),
      generatedBy: "write-competition-state-winner-final-canonical-file",
      rows: [...nextByKey.values()].sort((a, b) =>
        asText(a.canonicalKey).localeCompare(asText(b.canonicalKey))
      )
    };

    writeJson(canonicalOutput, nextStore);
  }

  return {
    ok: planErrors.length === 0,
    job: "write-competition-state-winner-final-canonical-file",
    stage: mayWrite && planErrors.length === 0
      ? "competition_state_winner_final_canonical_write_completed"
      : "competition_state_winner_final_canonical_write_dry_run_ready",
    generatedAt: new Date().toISOString(),
    input: inputPath ? repoRelative(inputPath) : "",
    canonicalOutput: canonicalOutput ? repoRelative(canonicalOutput) : "",
    mode: {
      apply,
      allowProductionWrites,
      confirmUefaCupWinnerFinalWrite,
      allowOverwriteCanonicalState,
      dryRun: !mayWrite,
      allowedCompetitionSlugs
    },
    summary: {
      inputPromotionPlanRowCount: Number(dryValidation?.summary?.inputPromotionPlanRowCount || 0),
      readyPromotionPlanRowCount: Number(dryValidation?.summary?.readyPromotionPlanRowCount || 0),
      blockedPromotionPlanRowCount: Number(dryValidation?.summary?.blockedPromotionPlanRowCount || 0),
      wouldWriteCanonicalRows: wouldWriteRows.length,
      actualCanonicalWrites: writtenRows.length,
      canonicalKeyCollisionCount: collisionRows.length,
      planErrorCount: planErrors.length,
      productionWrite: mayWrite && planErrors.length === 0,
      byCompetition: previewRows.reduce((acc, row) => {
        const key = asText(row.competitionSlug) || "unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    },
    planErrors,
    collisionRows,
    wouldWriteRows,
    writtenRows,
    dryValidationSummary: dryValidation.summary,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedPromotionPlanRows: true,
      requiresApplyFlag: true,
      requiresAllowProductionWritesFlag: true,
      requiresExplicitUefaCupWinnerFinalConfirmationFlag: true,
      canonicalWrites: writtenRows.length,
      productionWrite: mayWrite && planErrors.length === 0,
      dryRun: !mayWrite,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false
    }
  };
}

function runSelfTest() {
  const tmp = fs.mkdtempSync(path.join(repoRoot, "data", "football-truth", "_diagnostics", "_tmp-winner-final-writer-self-test-"));
  const planPath = path.join(tmp, "plan.json");
  const reportPath = path.join(tmp, "report.json");
  const canonicalPath = path.join(tmp, "canonical.json");

  const plan = {
    promotionPlanRows: [
      {
        promotionPlanId: "afc.champions::winner-final::01",
        promotionType: "competition_state_winner_final",
        competitionSlug: "afc.champions",
        proposedCanonicalState: "winner_final_confirmed_pending_writer_approval",
        proposedCanonicalPayload: {
          competitionSlug: "afc.champions",
          competitionName: "AFC Champions League Elite",
          seasonHint: "2024/25",
          winnerTeam: "Al Ahli Saudi FC",
          runnerUpTeam: "Kawasaki Frontale",
          finalScore: "2-0",
          resultType: "final_winner",
          evidenceStatus: "confirmed_from_official_and_independent_reference"
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
          officialValidationRow: { finalUrl: "https://example.test/official" },
          referenceValidationRows: [{ finalUrl: "https://example.test/reference" }]
        }
      }
    ]
  };

  writeJson(planPath, plan);

  const dry = buildWriteReport(plan, {
    inputPath: planPath,
    canonicalOutput: canonicalPath,
    apply: false,
    allowProductionWrites: false,
    confirmUefaCupWinnerFinalWrite: false,
    allowedCompetitionSlugs: ["afc.champions"]
  });

  if (dry.ok !== true) throw new Error("expected dry report ok");
  if (dry.summary.wouldWriteCanonicalRows !== 1) throw new Error("expected one dry would-write row");
  if (dry.summary.actualCanonicalWrites !== 0) throw new Error("expected zero dry actual writes");
  if (fs.existsSync(canonicalPath)) throw new Error("dry run must not create canonical file");

  const written = buildWriteReport(plan, {
    inputPath: planPath,
    canonicalOutput: canonicalPath,
    apply: true,
    allowProductionWrites: true,
    confirmUefaCupWinnerFinalWrite: true,
    allowedCompetitionSlugs: ["afc.champions"]
  });

  writeJson(reportPath, written);

  if (written.ok !== true) throw new Error("expected write report ok");
  if (written.summary.actualCanonicalWrites !== 1) throw new Error("expected one actual write");
  if (!fs.existsSync(canonicalPath)) throw new Error("expected canonical file");
  const canonical = readJson(canonicalPath);
  if (!Array.isArray(canonical.rows) || canonical.rows.length !== 1) throw new Error("expected one canonical row");
  if (canonical.rows[0].winnerTeam !== "Al Ahli Saudi FC") throw new Error("expected winner");

  const result = {
    ok: true,
    selfTest: "write-competition-state-winner-final-canonical-file",
    drySummary: dry.summary,
    writeSummary: written.summary
  };

  fs.rmSync(tmp, { recursive: true, force: true });

  return result;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const planPath = path.resolve(args.plan);
  const outputPath = path.resolve(args.output);
  const canonicalOutput = path.resolve(args.canonicalOutput);

  const report = buildWriteReport(readJson(planPath), {
    inputPath: planPath,
    canonicalOutput,
    apply: args.apply,
    allowProductionWrites: args.allowProductionWrites,
    confirmUefaCupWinnerFinalWrite: args.confirmUefaCupWinnerFinalWrite,
    allowOverwriteCanonicalState: args.allowOverwriteCanonicalState,
    allowedCompetitionSlugs: args.allowedCompetitionSlugs
  });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    output: repoRelative(outputPath),
    canonicalOutput: report.canonicalOutput,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));

  if (!report.ok) process.exit(2);
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildWriteReport, buildCanonicalRecord };

