#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function repoRelative(filePath) {
  return path.relative(repoRoot, path.resolve(filePath)).replaceAll(path.sep, "/");
}

function isInsideRepo(filePath) {
  const absolute = path.resolve(filePath);
  const relative = path.relative(repoRoot, absolute);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    canonicalOutput: path.join(
      repoRoot,
      "data",
      "football-truth",
      "_state",
      "league-season-watch",
      "league-season-watch.json"
    ),
    apply: false,
    allowProductionWrites: false,
    confirmIsl1ActivityStateWrite: false,
    allowOverwriteActivityState: false,
    allowedCompetitionSlugs: [],
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--canonical-output") args.canonicalOutput = argv[++i] || "";
    else if (arg.startsWith("--canonical-output=")) args.canonicalOutput = arg.slice("--canonical-output=".length);
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--allow-production-writes") args.allowProductionWrites = true;
    else if (arg === "--confirm-isl1-activity-state-write") args.confirmIsl1ActivityStateWrite = true;
    else if (arg === "--allow-overwrite-activity-state") args.allowOverwriteActivityState = true;
    else if (arg === "--allowed-competition-slugs") {
      args.allowedCompetitionSlugs = String(argv[++i] || "").split(",").map(asText).filter(Boolean);
    } else if (arg.startsWith("--allowed-competition-slugs=")) {
      args.allowedCompetitionSlugs = arg.slice("--allowed-competition-slugs=".length).split(",").map(asText).filter(Boolean);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");
  if (!args.selfTest && !args.canonicalOutput) throw new Error("--canonical-output is required");

  return args;
}

function canonicalStoreOf(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      ok: true,
      job: "write-football-truth-isl1-activity-state-canonical-file",
      mode: "canonical_league_season_watch_state",
      generatedAt: "",
      summary: { rowCount: 0 },
      rows: [],
      guarantees: {
        noSearch: true,
        noFetch: true,
        noUrlFetch: true
      }
    };
  }

  return {
    ...raw,
    ok: raw.ok !== false,
    rows: asArray(raw.rows)
  };
}

function loadCanonicalStore(filePath) {
  if (!fs.existsSync(filePath)) return canonicalStoreOf({});
  return canonicalStoreOf(readJson(filePath));
}

function validateAllowedSlugs(previewRows, allowedCompetitionSlugs) {
  const allowed = new Set(allowedCompetitionSlugs.map(asText).filter(Boolean));
  const slugs = [...new Set(previewRows.map((row) => asText(row.competitionSlug)).filter(Boolean))];

  const errors = [];
  if (allowed.size === 0) errors.push("missing_allowed_competition_slugs");

  const unexpected = slugs.filter((slug) => !allowed.has(slug));
  const missing = [...allowed].filter((slug) => !slugs.includes(slug));

  if (unexpected.length) errors.push(`unexpected_competition_slugs:${unexpected.join(",")}`);
  if (missing.length) errors.push(`missing_allowed_competition_slugs:${missing.join(",")}`);

  return errors;
}

function validatePlan(plan) {
  const errors = [];
  const summary = plan?.summary || {};
  const guarantees = plan?.guarantees || {};
  const approvalGate = plan?.approvalGate || {};
  const rows = asArray(plan?.writePlanRows);

  if (plan?.ok !== true) errors.push("plan_not_ok");
  if (asText(plan?.mode) !== "read_only_writer_dry_run_plan_for_isl1_activity_state") errors.push("unexpected_plan_mode");
  if (Number(summary.canonicalWrites ?? guarantees.canonicalWrites ?? 0) !== 0) errors.push("input_plan_canonical_writes_not_zero");
  if (Boolean(summary.productionWrite ?? guarantees.productionWrite) !== false) errors.push("input_plan_production_write_not_false");
  if (Boolean(summary.dryRun ?? guarantees.dryRun) !== true) errors.push("input_plan_not_dry_run");
  if (approvalGate.required !== true) errors.push("missing_required_approval_gate");
  if (approvalGate.currentRunWritesCanonical !== false) errors.push("input_plan_must_not_have_written_canonical");
  if (rows.length !== 1) errors.push(`expected_one_write_plan_row_got:${rows.length}`);

  return { errors, rows };
}

function validatePlanRow(row) {
  const errors = [];
  const patch = row?.proposedPatch || {};

  if (asText(row?.competitionSlug) !== "isl.1") errors.push("unsupported_competition_slug");
  if (asText(row?.writeIntent) !== "competition_activity_state") errors.push("unsupported_write_intent");
  if (asText(patch.seasonState) !== "active") errors.push("unexpected_season_state");
  if (asText(patch.activityState) !== "active_current_season") errors.push("unexpected_activity_state");
  if (asText(patch.fixtureTruthState) !== "fixtures_available") errors.push("unexpected_fixture_truth_state");
  if (asText(patch.standingsState) !== "official_standings_available") errors.push("unexpected_standings_state");
  if (asText(patch.dailyFixtureGateState) !== "eligible_after_explicit_truth_approval") errors.push("unexpected_daily_fixture_gate_state");
  if (asText(patch.sourceFamily) !== "ksi_tournament_route") errors.push("unexpected_source_family");
  if (asText(patch.tournamentId) !== "7025510") errors.push("unexpected_tournament_id");
  if (Number(patch.standingsRowCount || 0) !== 12) errors.push("unexpected_standings_row_count");
  if (Number(patch.fixtureRowCount || 0) !== 5) errors.push("unexpected_fixture_row_count");
  if (row?.explicitApprovalRequiredBeforeWrite !== true) errors.push("row_missing_explicit_approval_required");
  if (row?.writeCanonicalNow !== false) errors.push("input_row_must_not_write_canonical_now");
  if (Number(row?.canonicalWrites || 0) !== 0) errors.push("row_canonical_writes_not_zero");
  if (row?.productionWrite !== false) errors.push("row_production_write_not_false");

  return errors;
}

function canonicalRecordFor(row, options = {}) {
  const patch = row.proposedPatch || {};

  return {
    canonicalRecordType: "league_season_watch_activity_state",
    canonicalKey: "isl.1::activity_state::2026",
    competitionSlug: "isl.1",
    leagueSlug: "isl.1",
    season: asText(patch.season),
    seasonState: asText(patch.seasonState),
    activityState: asText(patch.activityState),
    fixtureTruthState: asText(patch.fixtureTruthState),
    standingsState: asText(patch.standingsState),
    dailyFixtureGateState: asText(patch.dailyFixtureGateState),
    sourceFamily: asText(patch.sourceFamily),
    sourceUrl: asText(patch.sourceUrl),
    tournamentId: asText(patch.tournamentId),
    firstFixtureDate: asText(patch.firstFixtureDate),
    lastFixtureDate: asText(patch.lastFixtureDate),
    standingsRowCount: Number(patch.standingsRowCount || 0),
    fixtureRowCount: Number(patch.fixtureRowCount || 0),
    writerState: options.written ? "canonical_written" : "canonical_write_preview_not_written",
    provenance: {
      generatedBy: "write-football-truth-isl1-activity-state-canonical-file",
      inputPlan: options.inputPath ? repoRelative(options.inputPath) : "",
      writtenAt: options.written ? new Date().toISOString() : null,
      dryRunAt: options.written ? null : new Date().toISOString()
    },
    writeGuards: {
      explicitIsl1Only: true,
      requiresApply: true,
      requiresAllowProductionWrites: true,
      requiresConfirmIsl1ActivityStateWrite: true,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      fixtureWrites: false,
      resultWrites: false,
      standingsWrites: false,
      sourceReliabilityWrites: false
    }
  };
}

function upsertByCanonicalKey(rows, record) {
  const byKey = new Map();
  for (const row of rows) {
    byKey.set(asText(row.canonicalKey), row);
  }
  byKey.set(asText(record.canonicalKey), record);
  return [...byKey.values()].sort((a, b) => asText(a.canonicalKey).localeCompare(asText(b.canonicalKey)));
}

function buildWriteReport(plan, options = {}) {
  const inputPath = options.inputPath || "";
  const canonicalOutput = path.resolve(options.canonicalOutput || "");
  const apply = options.apply === true;
  const allowProductionWrites = options.allowProductionWrites === true;
  const confirmIsl1ActivityStateWrite = options.confirmIsl1ActivityStateWrite === true;
  const allowOverwriteActivityState = options.allowOverwriteActivityState === true;
  const allowedCompetitionSlugs = Array.isArray(options.allowedCompetitionSlugs) ? options.allowedCompetitionSlugs : [];

  const planValidation = validatePlan(plan);
  const rowErrors = planValidation.rows.flatMap((row) => validatePlanRow(row));
  const previewRows = planValidation.rows
    .filter((row) => validatePlanRow(row).length === 0)
    .map((row) => canonicalRecordFor(row, { inputPath, written: false }));

  const planErrors = [...planValidation.errors, ...rowErrors];

  if (canonicalOutput && !isInsideRepo(canonicalOutput)) planErrors.push("canonical_output_outside_repo");
  if (apply && !allowProductionWrites) planErrors.push("apply_requires_allow_production_writes");
  if (apply && !confirmIsl1ActivityStateWrite) planErrors.push("apply_requires_confirm_isl1_activity_state_write");
  if (apply) planErrors.push(...validateAllowedSlugs(previewRows, allowedCompetitionSlugs));

  const existing = loadCanonicalStore(canonicalOutput);
  const existingByKey = new Map(asArray(existing.rows).map((row) => [asText(row.canonicalKey), row]));

  const blockedPreviewRows = [];
  const wouldWriteRows = [];

  for (const previewRow of previewRows) {
    if (existingByKey.has(asText(previewRow.canonicalKey)) && !allowOverwriteActivityState) {
      blockedPreviewRows.push({
        competitionSlug: previewRow.competitionSlug,
        canonicalKey: previewRow.canonicalKey,
        reason: "canonical_key_exists_requires_allow_overwrite_activity_state",
        canonicalWrites: 0,
        productionWrite: false
      });
      continue;
    }

    wouldWriteRows.push(previewRow);
  }

  const mayWrite = apply && allowProductionWrites && confirmIsl1ActivityStateWrite && planErrors.length === 0;
  const writtenRows = [];

  if (mayWrite) {
    let nextRows = asArray(existing.rows);
    for (const row of wouldWriteRows) {
      const writtenRecord = {
        ...row,
        writerState: "canonical_written",
        provenance: {
          ...row.provenance,
          writtenAt: new Date().toISOString(),
          dryRunAt: null
        }
      };
      nextRows = upsertByCanonicalKey(nextRows, writtenRecord);
      writtenRows.push(writtenRecord);
    }

    const nextStore = {
      ...existing,
      ok: true,
      job: "write-football-truth-isl1-activity-state-canonical-file",
      mode: "canonical_league_season_watch_state",
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      summary: {
        rowCount: nextRows.length,
        canonicalWrites: writtenRows.length,
        productionWrite: true,
        dryRun: false
      },
      rows: nextRows,
      guarantees: {
        noSearch: true,
        noFetch: true,
        noUrlFetch: true,
        canonicalWrites: writtenRows.length,
        productionWrite: true,
        dryRun: false
      }
    };

    writeJson(canonicalOutput, nextStore);
  }

  return {
    ok: planErrors.length === 0,
    job: "write-football-truth-isl1-activity-state-canonical-file",
    generatedAt: new Date().toISOString(),
    mode: mayWrite ? "apply_canonical_activity_state" : "dry_run_or_blocked",
    input: inputPath ? repoRelative(inputPath) : "",
    canonicalOutput: canonicalOutput ? repoRelative(canonicalOutput) : "",
    options: {
      apply,
      allowProductionWrites,
      confirmIsl1ActivityStateWrite,
      allowOverwriteActivityState,
      allowedCompetitionSlugs
    },
    summary: {
      inputWritePlanRowCount: planValidation.rows.length,
      previewCanonicalRows: previewRows.length,
      wouldWriteCanonicalRows: wouldWriteRows.length,
      blockedPreviewRows: blockedPreviewRows.length,
      actualCanonicalWrites: writtenRows.length,
      canonicalWrites: writtenRows.length,
      productionWrite: mayWrite,
      dryRun: !mayWrite
    },
    planErrors,
    blockedPreviewRows,
    canonicalWritePreviewRows: wouldWriteRows,
    writtenRows,
    policy: {
      hardGatedWriter: true,
      applyRequiresAllowProductionWrites: true,
      applyRequiresConfirmIsl1ActivityStateWrite: true,
      allowedCompetitionSlugsRequired: true,
      isl1Only: true,
      noFixtureWrites: true,
      noResultWrites: true,
      noStandingWrites: true,
      noSourceReliabilityMutation: true
    },
    guarantees: {
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: !mayWrite,
      canonicalWrites: writtenRows.length,
      productionWrite: mayWrite,
      dryRun: !mayWrite
    }
  };
}

function selfTest() {
  const tmpRoot = path.join(repoRoot, "data", "football-truth", "_diagnostics", "_tmp-isl1-activity-writer-self-test");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(tmpRoot, "case-"));
  const canonicalPath = path.join(tmp, "league-season-watch.json");

  const plan = {
    ok: true,
    mode: "read_only_writer_dry_run_plan_for_isl1_activity_state",
    summary: { canonicalWrites: 0, productionWrite: false, dryRun: true },
    approvalGate: { required: true, currentRunWritesCanonical: false },
    guarantees: { canonicalWrites: 0, productionWrite: false, dryRun: true },
    writePlanRows: [
      {
        competitionSlug: "isl.1",
        writeIntent: "competition_activity_state",
        proposedPatch: {
          seasonState: "active",
          activityState: "active_current_season",
          fixtureTruthState: "fixtures_available",
          standingsState: "official_standings_available",
          dailyFixtureGateState: "eligible_after_explicit_truth_approval",
          sourceFamily: "ksi_tournament_route",
          sourceUrl: "https://www.ksi.is/oll-mot/mot?id=7025510",
          tournamentId: "7025510",
          season: "2026",
          firstFixtureDate: "2026-06-14",
          lastFixtureDate: "2026-06-16",
          standingsRowCount: 12,
          fixtureRowCount: 5
        },
        explicitApprovalRequiredBeforeWrite: true,
        writeCanonicalNow: false,
        canonicalWrites: 0,
        productionWrite: false
      }
    ]
  };

  const dry = buildWriteReport(plan, {
    inputPath: "self-test-plan.json",
    canonicalOutput: canonicalPath,
    apply: false,
    allowProductionWrites: false,
    confirmIsl1ActivityStateWrite: false,
    allowedCompetitionSlugs: ["isl.1"]
  });

  if (dry.summary.actualCanonicalWrites !== 0) throw new Error("dry run must not write");
  if (fs.existsSync(canonicalPath)) throw new Error("dry run must not create canonical file");

  const blocked = buildWriteReport(plan, {
    inputPath: "self-test-plan.json",
    canonicalOutput: canonicalPath,
    apply: true,
    allowProductionWrites: false,
    confirmIsl1ActivityStateWrite: false,
    allowedCompetitionSlugs: ["isl.1"]
  });

  if (blocked.summary.actualCanonicalWrites !== 0) throw new Error("blocked apply must not write");
  if (!blocked.planErrors.includes("apply_requires_allow_production_writes")) throw new Error("missing allow production block");

  const written = buildWriteReport(plan, {
    inputPath: "self-test-plan.json",
    canonicalOutput: canonicalPath,
    apply: true,
    allowProductionWrites: true,
    confirmIsl1ActivityStateWrite: true,
    allowedCompetitionSlugs: ["isl.1"]
  });

  if (written.summary.actualCanonicalWrites !== 1) throw new Error("approved apply should write one row");
  if (!fs.existsSync(canonicalPath)) throw new Error("approved apply should create canonical file");

  fs.rmSync(tmp, { recursive: true, force: true });

  return { dry, blocked, written };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const result = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "write-football-truth-isl1-activity-state-canonical-file",
      dryRunSummary: result.dry.summary,
      blockedSummary: result.blocked.summary,
      writtenSummary: result.written.summary,
      guarantees: result.dry.guarantees
    }, null, 2));
    return;
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);
  const canonicalOutput = path.resolve(args.canonicalOutput);
  const plan = readJson(inputPath);

  const report = buildWriteReport(plan, {
    inputPath,
    canonicalOutput,
    apply: args.apply,
    allowProductionWrites: args.allowProductionWrites,
    confirmIsl1ActivityStateWrite: args.confirmIsl1ActivityStateWrite,
    allowOverwriteActivityState: args.allowOverwriteActivityState,
    allowedCompetitionSlugs: args.allowedCompetitionSlugs
  });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: repoRelative(outputPath),
    canonicalOutput: report.canonicalOutput,
    summary: report.summary,
    planErrors: report.planErrors,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "write-football-truth-isl1-activity-state-canonical-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}