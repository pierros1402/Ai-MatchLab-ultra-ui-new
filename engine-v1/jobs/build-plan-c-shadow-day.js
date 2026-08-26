import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import {
  PLAN_C_SHADOW_DAY_SCHEMA,
  canonicalPlanCJson,
  planCPredictionSetHash,
  planCPredictionSignature,
  validatePlanCShadowDay
} from "../value/plan-c-shadow-export.js";

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function manifestArtifactBytes(filePath, hashMode) {
  const bytes = fs.readFileSync(filePath);
  if (hashMode !== "UTF8_LF_NORMALIZED") return bytes;
  return Buffer.from(bytes.toString("utf8").replace(/\r\n/gu, "\n"), "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeRelativePath(value) {
  const relativePath = clean(value);
  return relativePath
    && !path.posix.isAbsolute(relativePath)
    && !relativePath.includes("\\")
    && !relativePath.split("/").includes("..");
}

function settlementView(record) {
  if (!record) return { state: "PENDING", truth: null, pendingReason: "NO_CANONICAL_TRUTH", brier: null, hitRate: null };
  return {
    state: record.state,
    truth: record.truth ?? null,
    pendingReason: record.pendingReason ?? null,
    brier: record.brier ?? null,
    hitRate: record.hitRate ?? null
  };
}

export function assertPlanCShadowMonotonic(previous, next) {
  if (!previous) return;
  const previousById = new Map(previous.entries.map(entry => [entry.prediction.canonicalFixtureId, entry]));
  const nextById = new Map(next.entries.map(entry => [entry.prediction.canonicalFixtureId, entry]));
  for (const [id, oldEntry] of previousById) {
    const newEntry = nextById.get(id);
    assert(newEntry, `plan_c_shadow_prediction_removed:${id}`);
    assert(oldEntry.prediction.predictionSignature === newEntry.prediction.predictionSignature, `plan_c_shadow_prediction_mutated:${id}`);
    if (["SETTLED", "VOID_EXCLUDED"].includes(oldEntry.settlement.state)) {
      assert(canonicalPlanCJson(oldEntry.settlement) === canonicalPlanCJson(newEntry.settlement), `plan_c_shadow_terminal_rewrite:${id}`);
    }
  }
}

export function buildPlanCShadowDayArtifact({ dayKey, predictionRoot, settlementReport = null, generatedAt = new Date().toISOString() }) {
  const day = clean(dayKey);
  assert(/^\d{4}-\d{2}-\d{2}$/u.test(day), `invalid_day_key:${day}`);
  assert(predictionRoot && fs.existsSync(predictionRoot), "prediction_root_missing");

  const manifestFile = path.join(predictionRoot, "MANIFEST.json");
  const indexFile = path.join(predictionRoot, "PREDICTION_INDEX.json");
  assert(fs.existsSync(manifestFile), "prediction_manifest_missing");
  assert(fs.existsSync(indexFile), "prediction_index_missing");
  const manifest = readJson(manifestFile);
  if (Array.isArray(manifest.artifacts)) {
    const artifactHashMode = clean(manifest.artifactHashMode);
    assert(!artifactHashMode || artifactHashMode === "UTF8_LF_NORMALIZED", `prediction_manifest_hash_mode_invalid:${artifactHashMode}`);
    assert(manifest.artifactCount === manifest.artifacts.length, "prediction_manifest_count_mismatch");
    for (const artifact of manifest.artifacts) {
      assert(safeRelativePath(artifact.path), `prediction_manifest_path_invalid:${artifact.path}`);
      const artifactFile = path.join(predictionRoot, ...artifact.path.split("/"));
      assert(fs.existsSync(artifactFile), `prediction_manifest_artifact_missing:${artifact.path}`);
      const bytes = manifestArtifactBytes(artifactFile, artifactHashMode);
      assert(bytes.length === artifact.bytes, `prediction_manifest_bytes_mismatch:${artifact.path}`);
      assert(sha256(bytes) === artifact.sha256, `prediction_manifest_hash_mismatch:${artifact.path}`);
    }
  }
  const index = readJson(indexFile);
  assert(Array.isArray(index.predictions) && index.predictions.length > 0, "prediction_index_empty");
  assert(index.accounting?.total === index.predictions.length, "prediction_index_count_mismatch");
  const calculatedPredictionSetHash = planCPredictionSetHash(index.predictions);
  if (manifest.predictionSetHash != null) {
    assert(clean(manifest.predictionSetHash) === calculatedPredictionSetHash, "prediction_set_hash_mismatch");
  }
  const manifestHash = /^[0-9a-f]{64}$/u.test(clean(manifest.predictionSetHash))
    ? clean(manifest.predictionSetHash)
    : /^[0-9a-f]{64}$/u.test(clean(manifest.sourceManifestSha256))
      ? clean(manifest.sourceManifestSha256)
      : sha256(fs.readFileSync(manifestFile));

  const settlementById = new Map();
  if (settlementReport) {
    assert(settlementReport.sourcePredictionSetHash === manifestHash, "settlement_prediction_set_mismatch");
    assert(Array.isArray(settlementReport.records), "settlement_records_missing");
    for (const record of settlementReport.records) {
      assert(!settlementById.has(record.canonicalFixtureId), `duplicate_settlement_record:${record.canonicalFixtureId}`);
      settlementById.set(record.canonicalFixtureId, record);
    }
  }

  const entries = index.predictions.map(indexEntry => {
    assert(safeRelativePath(indexEntry.relativePath), `prediction_path_invalid:${indexEntry.relativePath}`);
    const predictionFile = path.join(predictionRoot, ...indexEntry.relativePath.split("/"));
    assert(fs.existsSync(predictionFile), `prediction_file_missing:${indexEntry.relativePath}`);
    const prediction = readJson(predictionFile);
    assert(prediction.canonicalFixtureId === indexEntry.canonicalFixtureId, `prediction_id_mismatch:${indexEntry.canonicalFixtureId}`);
    assert(prediction.predictionSignature === indexEntry.predictionSignature, `prediction_index_signature_mismatch:${indexEntry.canonicalFixtureId}`);
    assert(planCPredictionSignature(prediction) === prediction.predictionSignature, `prediction_signature_mismatch:${indexEntry.canonicalFixtureId}`);
    return { prediction, settlement: settlementView(settlementById.get(prediction.canonicalFixtureId)) };
  }).sort((left, right) => left.prediction.canonicalFixtureId.localeCompare(right.prediction.canonicalFixtureId));

  for (const settledId of settlementById.keys()) {
    assert(entries.some(entry => entry.prediction.canonicalFixtureId === settledId), `settlement_without_prediction:${settledId}`);
  }

  const payload = {
    schema: PLAN_C_SHADOW_DAY_SCHEMA,
    ok: true,
    available: true,
    mode: "SHADOW",
    productionEligible: false,
    date: day,
    generatedAt,
    sourcePredictionSetHash: manifestHash,
    count: entries.length,
    pickCount: entries.filter(entry => entry.prediction.planCPick).length,
    entries
  };
  const validation = validatePlanCShadowDay(payload, day);
  assert(validation.ok, `built_plan_c_shadow_invalid:${validation.errors.join(",")}`);
  return payload;
}

export function writePlanCShadowDay({ dayKey, predictionRoot, settlementFile = null, generatedAt, outputFile, auditFile }) {
  const day = clean(dayKey);
  const resolvedOutput = outputFile || resolveDataPath("plan-c-shadow", `${day}.json`);
  const resolvedAudit = auditFile || resolveDataPath("plan-c-shadow", "_audit", `${day}.json`);
  const settlementReport = settlementFile ? readJson(settlementFile) : null;
  const payload = buildPlanCShadowDayArtifact({ dayKey: day, predictionRoot, settlementReport, generatedAt });
  const previous = fs.existsSync(resolvedOutput) ? readJson(resolvedOutput) : null;
  if (previous) {
    const validation = validatePlanCShadowDay(previous, day);
    assert(validation.ok, `existing_plan_c_shadow_invalid:${validation.errors.join(",")}`);
  }
  assertPlanCShadowMonotonic(previous, payload);
  writeJson(resolvedOutput, payload);
  const audit = {
    schema: "ai-matchlab.plan-c-shadow-build-audit.v1",
    ok: true,
    date: day,
    generatedAt: payload.generatedAt,
    outputPath: path.posix.join("data", "plan-c-shadow", `${day}.json`),
    outputSha256: sha256(fs.readFileSync(resolvedOutput)),
    sourcePredictionSetHash: payload.sourcePredictionSetHash,
    settlementSource: settlementFile ? "canonical_settlement_report" : "no_truth_all_pending",
    count: payload.count,
    pickCount: payload.pickCount,
    productionEligible: false
  };
  writeJson(resolvedAudit, audit);
  return { payload, audit, outputFile: resolvedOutput, auditFile: resolvedAudit };
}

export function parsePlanCShadowCli(argv = process.argv.slice(2)) {
  const out = { dayKey: null, predictionRoot: null, settlementFile: null, outputFile: null, auditFile: null, generatedAt: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = clean(argv[index]);
    if (!out.dayKey && /^\d{4}-\d{2}-\d{2}$/u.test(arg)) { out.dayKey = arg; continue; }
    const next = () => {
      index += 1;
      const value = clean(argv[index]);
      if (!value) throw new Error(`missing_value_for:${arg}`);
      return value;
    };
    if (arg === "--prediction-root") { out.predictionRoot = next(); continue; }
    if (arg === "--settlement-report") { out.settlementFile = next(); continue; }
    if (arg === "--output") { out.outputFile = next(); continue; }
    if (arg === "--audit") { out.auditFile = next(); continue; }
    if (arg === "--generated-at") { out.generatedAt = next(); continue; }
    throw new Error(`unknown_argument:${arg}`);
  }
  return out;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const args = parsePlanCShadowCli();
    assert(args.dayKey, "missing_day_key");
    assert(args.predictionRoot, "missing_prediction_root");
    const result = writePlanCShadowDay(args);
    console.log(JSON.stringify({ ok: true, date: result.payload.date, count: result.payload.count, pickCount: result.payload.pickCount, outputFile: result.outputFile, auditFile: result.auditFile }, null, 2));
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  }
}
