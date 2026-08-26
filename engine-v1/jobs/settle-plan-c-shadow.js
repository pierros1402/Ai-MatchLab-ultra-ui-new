import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import {
  canonicalPlanCJson,
  planCPredictionSetHash,
  planCPredictionSignature
} from "../value/plan-c-shadow-export.js";

export const PLAN_C_SETTLEMENT_SCHEMA = "ai-matchlab.plan-c-settlement.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload) {
  ensureDir(path.dirname(filePath));
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function round(value, digits = 8) {
  return Number(Number(value).toFixed(digits));
}

function athensDay(value) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
}

function fixtureArray(document) {
  if (Array.isArray(document)) return document;
  if (Array.isArray(document?.fixtures)) return document.fixtures;
  if (Array.isArray(document?.matches)) return document.matches;
  return [];
}

function loadPredictions(predictionRoot) {
  const manifestFile = path.join(predictionRoot, "MANIFEST.json");
  const indexFile = path.join(predictionRoot, "PREDICTION_INDEX.json");
  assert(fs.existsSync(manifestFile), "prediction_manifest_missing");
  assert(fs.existsSync(indexFile), "prediction_index_missing");
  const manifest = readJson(manifestFile);
  const index = readJson(indexFile);
  assert(Array.isArray(index.predictions) && index.predictions.length > 0, "prediction_index_empty");
  assert(index.accounting?.total === index.predictions.length, "prediction_index_count_mismatch");
  const calculatedSetHash = planCPredictionSetHash(index.predictions);
  if (manifest.predictionSetHash != null) assert(manifest.predictionSetHash === calculatedSetHash, "prediction_set_hash_mismatch");
  const sourcePredictionSetHash = clean(manifest.predictionSetHash || manifest.sourceManifestSha256 || sha256(fs.readFileSync(manifestFile)));
  assert(/^[0-9a-f]{64}$/u.test(sourcePredictionSetHash), "prediction_set_hash_invalid");
  const seen = new Set();
  const predictions = index.predictions.map(row => {
    const id = clean(row.canonicalFixtureId);
    assert(id && !seen.has(id), `duplicate_prediction:${id}`);
    seen.add(id);
    const relativePath = clean(row.relativePath);
    assert(relativePath.startsWith("predictions/") && !relativePath.includes("\\") && !relativePath.split("/").includes(".."), `prediction_path_invalid:${relativePath}`);
    const filePath = path.join(predictionRoot, ...relativePath.split("/"));
    assert(fs.existsSync(filePath), `prediction_file_missing:${relativePath}`);
    const prediction = readJson(filePath);
    assert(prediction.canonicalFixtureId === id, `prediction_id_mismatch:${id}`);
    assert(prediction.predictionSignature === row.predictionSignature, `prediction_index_signature_mismatch:${id}`);
    assert(planCPredictionSignature(prediction) === prediction.predictionSignature, `prediction_signature_mismatch:${id}`);
    return prediction;
  }).sort((left, right) => left.canonicalFixtureId.localeCompare(right.canonicalFixtureId));
  return { predictions, sourcePredictionSetHash };
}

function truthDays(predictions) {
  const days = new Set();
  for (const prediction of predictions) {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(clean(prediction.day))) days.add(clean(prediction.day));
    const kickoffMs = Date.parse(prediction.kickoffUtc);
    if (Number.isFinite(kickoffMs)) {
      days.add(new Date(kickoffMs).toISOString().slice(0, 10));
      days.add(athensDay(kickoffMs));
    }
  }
  return Array.from(days).sort();
}

function normalizedTruth(row, sourcePath, sourceSha256) {
  return {
    canonicalFixtureId: clean(row.canonicalId || row.matchId || row.id),
    status: clean(row.status).toUpperCase(),
    scoreHome: row.scoreHome,
    scoreAway: row.scoreAway,
    sourcePath,
    sourceSha256
  };
}

function truthEquivalent(left, right) {
  return left.status === right.status
    && left.scoreHome === right.scoreHome
    && left.scoreAway === right.scoreAway;
}

function loadTruthIndex(truthRoot, days) {
  const truthById = new Map();
  const sourceFiles = [];
  for (const day of days) {
    const dayDir = path.join(truthRoot, day);
    if (!fs.existsSync(dayDir)) continue;
    for (const name of fs.readdirSync(dayDir).filter(item => item.endsWith(".json")).sort()) {
      const filePath = path.join(dayDir, name);
      const bytes = fs.readFileSync(filePath);
      const sourceSha256 = sha256(bytes);
      const sourcePath = path.posix.join("data", "canonical-fixtures", day, name);
      const rows = fixtureArray(JSON.parse(bytes.toString("utf8")));
      sourceFiles.push({ path: sourcePath, sha256: sourceSha256, rows: rows.length });
      for (const row of rows) {
        const truth = normalizedTruth(row, sourcePath, sourceSha256);
        if (!truth.canonicalFixtureId) continue;
        if (truthById.has(truth.canonicalFixtureId)) {
          const previous = truthById.get(truth.canonicalFixtureId);
          assert(truthEquivalent(previous, truth), `canonical_truth_conflict:${truth.canonicalFixtureId}`);
          continue;
        }
        truthById.set(truth.canonicalFixtureId, truth);
      }
    }
  }
  return { truthById, sourceFiles };
}

function predictionView(prediction) {
  return {
    signature: prediction.predictionSignature,
    planCPick: prediction.planCPick,
    pOver25Adjusted: prediction.adjusted.pOver25,
    pOver25Baseline: prediction.baseline.pOver25,
    lambdaHomeAdjusted: prediction.adjusted.lambdaHome,
    lambdaAwayAdjusted: prediction.adjusted.lambdaAway
  };
}

function pendingRecord(prediction, reason) {
  return {
    canonicalFixtureId: prediction.canonicalFixtureId,
    state: "PENDING",
    planCPick: prediction.planCPick,
    prediction: predictionView(prediction),
    truth: null,
    pendingReason: reason,
    brier: null,
    hitRate: null
  };
}

function settledRecord(prediction, truth) {
  assert(Number.isInteger(truth.scoreHome) && truth.scoreHome >= 0, `ft_home_score_invalid:${prediction.canonicalFixtureId}`);
  assert(Number.isInteger(truth.scoreAway) && truth.scoreAway >= 0, `ft_away_score_invalid:${prediction.canonicalFixtureId}`);
  const totalGoals = truth.scoreHome + truth.scoreAway;
  const actualOver25 = totalGoals > 2 ? 1 : 0;
  const adjusted = round((prediction.adjusted.pOver25 - actualOver25) ** 2);
  const baseline = round((prediction.baseline.pOver25 - actualOver25) ** 2);
  return {
    canonicalFixtureId: prediction.canonicalFixtureId,
    state: "SETTLED",
    planCPick: prediction.planCPick,
    prediction: predictionView(prediction),
    truth: {
      status: "FT",
      source: truth.sourcePath,
      sourceSha256: truth.sourceSha256,
      scoreHome: truth.scoreHome,
      scoreAway: truth.scoreAway,
      totalGoals,
      actualOver25
    },
    pendingReason: null,
    brier: { adjusted, baseline },
    hitRate: {
      applicableToHitRate: prediction.planCPick === true,
      isHit: prediction.planCPick === true ? actualOver25 === 1 : null
    }
  };
}

function voidRecord(prediction, truth) {
  return {
    canonicalFixtureId: prediction.canonicalFixtureId,
    state: "VOID_EXCLUDED",
    planCPick: prediction.planCPick,
    prediction: predictionView(prediction),
    truth: {
      status: truth.status,
      source: truth.sourcePath,
      sourceSha256: truth.sourceSha256,
      scoreHome: null,
      scoreAway: null
    },
    pendingReason: null,
    brier: null,
    hitRate: null
  };
}

function validateTerminalAgainstCurrent(previous, currentTruth) {
  if (!currentTruth) return;
  if (previous.state === "SETTLED") {
    assert(currentTruth.status === "FT", `terminal_settled_status_conflict:${previous.canonicalFixtureId}`);
    assert(previous.truth.scoreHome === currentTruth.scoreHome && previous.truth.scoreAway === currentTruth.scoreAway, `terminal_settled_score_conflict:${previous.canonicalFixtureId}`);
  } else if (previous.state === "VOID_EXCLUDED") {
    assert(previous.truth.status === currentTruth.status, `terminal_void_status_conflict:${previous.canonicalFixtureId}`);
  }
}

function mean(values) {
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function settlePlanCShadow(options) {
  const dayKey = clean(options.dayKey);
  assert(/^\d{4}-\d{2}-\d{2}$/u.test(dayKey), `invalid_day_key:${dayKey}`);
  const predictionRoot = options.predictionRoot;
  const truthRoot = options.truthRoot || resolveDataPath("canonical-fixtures");
  const outputFile = options.outputFile || resolveDataPath("plan-c-shadow", "settlement", "latest.json");
  const auditFile = options.auditFile || resolveDataPath("plan-c-shadow", "settlement", "_audit", `${dayKey}.json`);
  assert(predictionRoot && fs.existsSync(predictionRoot), "prediction_root_missing");

  const loaded = loadPredictions(predictionRoot);
  const truth = loadTruthIndex(truthRoot, truthDays(loaded.predictions));
  const previous = fs.existsSync(outputFile) ? readJson(outputFile) : null;
  if (previous) {
    assert(previous.schema === PLAN_C_SETTLEMENT_SCHEMA, "previous_settlement_schema_invalid");
    assert(Array.isArray(previous.records), "previous_settlement_records_missing");
  }
  const previousById = new Map((previous?.records || []).map(record => [record.canonicalFixtureId, record]));
  assert(previousById.size === (previous?.records || []).length, "previous_settlement_duplicate_records");
  const predictionIds = new Set(loaded.predictions.map(prediction => prediction.canonicalFixtureId));
  for (const id of previousById.keys()) assert(predictionIds.has(id), `settlement_prediction_removed:${id}`);

  const voidStatuses = new Set(["POSTP", "ABAND", "CANC", "CANCELLED", "SUSP", "WALK", "WO"]);
  const records = loaded.predictions.map(prediction => {
    const currentTruth = truth.truthById.get(prediction.canonicalFixtureId) || null;
    const oldRecord = previousById.get(prediction.canonicalFixtureId) || null;
    if (oldRecord && ["SETTLED", "VOID_EXCLUDED"].includes(oldRecord.state)) {
      assert(oldRecord?.prediction?.signature === prediction.predictionSignature, `terminal_prediction_signature_conflict:${prediction.canonicalFixtureId}`);
      validateTerminalAgainstCurrent(oldRecord, currentTruth);
      return oldRecord;
    }
    if (!currentTruth) return pendingRecord(prediction, "NO_CANONICAL_TRUTH");
    if (currentTruth.status === "FT") return settledRecord(prediction, currentTruth);
    if (voidStatuses.has(currentTruth.status)) return voidRecord(prediction, currentTruth);
    return pendingRecord(prediction, `CANONICAL_STATUS_${currentTruth.status || "UNKNOWN"}`);
  }).sort((left, right) => left.canonicalFixtureId.localeCompare(right.canonicalFixtureId));

  const settled = records.filter(record => record.state === "SETTLED");
  const voidExcluded = records.filter(record => record.state === "VOID_EXCLUDED");
  const pending = records.filter(record => record.state === "PENDING");
  const settledPicks = settled.filter(record => record.planCPick === true);
  const hits = settledPicks.filter(record => record.hitRate?.isHit === true).length;
  const misses = settledPicks.length - hits;
  const adjustedMeanBrier = mean(settled.map(record => record.brier.adjusted));
  const baselineMeanBrier = mean(settled.map(record => record.brier.baseline));
  const report = {
    schema: PLAN_C_SETTLEMENT_SCHEMA,
    ok: true,
    mode: "SHADOW",
    productionEligible: false,
    sourcePredictionSetHash: loaded.sourcePredictionSetHash,
    idempotencyHash: sha256(Buffer.from(canonicalPlanCJson(records), "utf8")),
    accounting: {
      total: records.length,
      settled: settled.length,
      voidExcluded: voidExcluded.length,
      pending: pending.length,
      balanced: records.length === settled.length + voidExcluded.length + pending.length
    },
    brierSummary: {
      adjustedMeanBrier,
      baselineMeanBrier,
      delta: adjustedMeanBrier == null || baselineMeanBrier == null ? null : round(adjustedMeanBrier - baselineMeanBrier),
      n: settled.length
    },
    hitRateSummary: {
      frozenPickCount: records.filter(record => record.planCPick === true).length,
      settledPickCount: settledPicks.length,
      hits: settledPicks.length ? hits : null,
      misses: settledPicks.length ? misses : null,
      hitRate: settledPicks.length ? round(hits / settledPicks.length) : null
    },
    records
  };
  assert(report.accounting.balanced, "settlement_accounting_unbalanced");
  writeJsonAtomic(outputFile, report);
  const audit = {
    schema: "ai-matchlab.plan-c-settlement-audit.v1",
    ok: true,
    date: dayKey,
    generatedAt: new Date().toISOString(),
    mode: "SHADOW",
    productionEligible: false,
    sourcePredictionSetHash: loaded.sourcePredictionSetHash,
    truthDays: truthDays(loaded.predictions),
    truthSourceFiles: truth.sourceFiles,
    accounting: report.accounting,
    brierSummary: report.brierSummary,
    hitRateSummary: report.hitRateSummary,
    idempotencyHash: report.idempotencyHash,
    outputSha256: sha256(fs.readFileSync(outputFile)),
    officialPlansUnaffected: true
  };
  writeJsonAtomic(auditFile, audit);
  return { report, audit, outputFile, auditFile };
}

export function parseSettlePlanCCli(argv = process.argv.slice(2)) {
  const out = { dayKey: null, predictionRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = clean(argv[index]);
    if (!out.dayKey && /^\d{4}-\d{2}-\d{2}$/u.test(arg)) { out.dayKey = arg; continue; }
    const next = () => { index += 1; const value = clean(argv[index]); if (!value) throw new Error(`missing_value_for:${arg}`); return value; };
    if (arg === "--prediction-root") out.predictionRoot = next();
    else if (arg === "--truth-root") out.truthRoot = next();
    else if (arg === "--output") out.outputFile = next();
    else if (arg === "--audit") out.auditFile = next();
    else throw new Error(`unknown_argument:${arg}`);
  }
  return out;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const args = parseSettlePlanCCli();
    assert(args.dayKey, "missing_day_key");
    assert(args.predictionRoot, "missing_prediction_root");
    const result = settlePlanCShadow(args);
    console.log(JSON.stringify({
      ok: true,
      mode: "SHADOW",
      date: args.dayKey,
      accounting: result.report.accounting,
      brierSummary: result.report.brierSummary,
      hitRateSummary: result.report.hitRateSummary,
      idempotencyHash: result.report.idempotencyHash
    }, null, 2));
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  }
}
