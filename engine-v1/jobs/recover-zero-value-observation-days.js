import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import {
  ensurePlanAObservationAtPaths,
  planAObservationSignature
} from "../value/plan-a-observation.js";

const EVIDENCE_SCHEMA = "ai-matchlab.zero-value-observation-recovery-evidence.v1";
const COMPARISON_SCHEMA = "ai-matchlab.value-plan-comparison.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(clean(value));
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function emptySummary() {
  return {
    picks: 0,
    uniqueMatches: 0,
    settled: 0,
    wins: 0,
    losses: 0,
    voids: 0,
    unresolved: 0,
    unsupported: 0,
    hitRate: null,
    oddsAvailable: 0,
    averageOdds: null,
    totalStake: null,
    totalReturn: null,
    profit: null,
    roi: null
  };
}

function comparisonPayload(entry, evidencePathLabel, generatedAt) {
  const planBObserved = entry.planBObservation === "observed_zero";
  const provenance = {
    kind: "evidence_bound_runner_recovery",
    evidencePath: evidencePathLabel,
    runIds: entry.runIds,
    headShas: entry.headShas,
    note: entry.note || null
  };

  if (!planBObserved) {
    return {
      ok: true,
      schema: COMPARISON_SCHEMA,
      date: entry.date,
      generatedAt,
      comparisonEligible: false,
      planAAvailability: {
        available: true,
        count: 0,
        immutable: true,
        observationSignature: entry.expectedPlanASignature
      },
      planBAvailability: {
        available: false,
        reason: "plan_b_was_not_observed_by_the_historical_pipeline"
      },
      provenance
    };
  }

  return {
    ok: true,
    schema: COMPARISON_SCHEMA,
    date: entry.date,
    generatedAt,
    comparisonEligible: true,
    sourceContract: {
      planA: "immutable_plan_a_observation_artifact",
      planAObservationStartDate: "2026-07-05",
      planAImmutable: true,
      planB: "evidence_bound_historical_runner_observation",
      historicalArtifactsSurvived: false,
      historicalLogCountsRecovered: true,
      deploySnapshotUsedAsFinalTruth: false
    },
    inputs: {
      planAPath: `data/value-plans/${entry.date}/plan-a.json`,
      planBRunEvidence: entry.runIds,
      outputPath: `data/value-comparison/${entry.date}.json`
    },
    plans: {
      A: {
        id: "plan-a",
        label: "Plan A - frozen production observation",
        immutable: true,
        summary: emptySummary()
      },
      B: {
        id: "plan-b",
        label: "Plan B - recovered historical zero observation",
        immutable: true,
        summary: emptySummary()
      }
    },
    comparison: {
      pickDeltaPlanBMinusPlanA: 0,
      settledDeltaPlanBMinusPlanA: 0,
      winsDeltaPlanBMinusPlanA: 0,
      lossesDeltaPlanBMinusPlanA: 0,
      hitRateDeltaPlanBMinusPlanA: null,
      roiDeltaPlanBMinusPlanA: null
    },
    provenance
  };
}

export function recoverZeroValueObservationDays({
  evidence,
  evidencePathLabel,
  valuePlansRoot = resolveDataPath("value-plans"),
  comparisonRoot = resolveDataPath("value-comparison")
}) {
  if (evidence?.schema !== EVIDENCE_SCHEMA || !Array.isArray(evidence.entries)) {
    return { ok: false, reason: "invalid_zero_observation_recovery_evidence" };
  }

  const results = [];
  for (const entry of evidence.entries) {
    const day = clean(entry?.date);
    const expected = clean(entry?.expectedPlanASignature).toLowerCase();
    if (!isDayKey(day) || !/^[a-f0-9]{64}$/u.test(expected)) {
      return { ok: false, reason: "invalid_zero_observation_entry", date: day || null };
    }
    if (!Array.isArray(entry.runIds) || entry.runIds.length === 0) {
      return { ok: false, reason: "zero_observation_run_evidence_missing", date: day };
    }

    const sourcePayload = {
      ok: true,
      date: day,
      source: "evidence_bound_runner_zero_observation",
      count: 0,
      picks: []
    };
    const computed = planAObservationSignature(day, sourcePayload);
    if (computed !== expected) {
      return {
        ok: false,
        reason: "zero_observation_signature_mismatch",
        date: day,
        expected,
        computed
      };
    }

    const dayRoot = path.join(valuePlansRoot, day);
    const observation = ensurePlanAObservationAtPaths({
      dayKey: day,
      sourcePayload,
      sourcePath: evidencePathLabel,
      observationFile: path.join(dayRoot, "plan-a.json"),
      auditFile: path.join(dayRoot, "plan-a-audit.json"),
      frozenAt: entry.observedAt,
      provenance: {
        kind: "evidence_bound_runner_recovery",
        runIds: entry.runIds,
        headShas: entry.headShas,
        historicalPlanACount: 0,
        note: entry.note || null
      }
    });
    if (!observation.ok || observation.observationSignature !== expected) {
      return {
        ok: false,
        reason: "zero_observation_freeze_failed",
        date: day,
        observation
      };
    }

    const comparisonPath = path.join(comparisonRoot, `${day}.json`);
    const expectedComparison = comparisonPayload(
      entry,
      evidencePathLabel,
      evidence.generatedAt
    );
    let comparisonCreated = true;
    if (fs.existsSync(comparisonPath)) {
      const existingComparison = JSON.parse(fs.readFileSync(comparisonPath, "utf8"));
      if (JSON.stringify(existingComparison) !== JSON.stringify(expectedComparison)) {
        return { ok: false, reason: "comparison_recovery_target_conflict", date: day };
      }
      comparisonCreated = false;
    } else {
      writeJson(comparisonPath, expectedComparison);
    }
    results.push({
      date: day,
      planAObservationSignature: expected,
      planBObservation: entry.planBObservation,
      comparisonEligible: entry.planBObservation === "observed_zero",
      comparisonCreated
    });
  }

  return { ok: true, recoveredDays: results.length, results };
}

function parseArgs(argv = process.argv.slice(2)) {
  const arg = argv.find(item => item.startsWith("--evidence="));
  return { evidencePath: arg ? arg.slice("--evidence=".length) : "" };
}

const isCli = (() => {
  try {
    return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || "");
  } catch {
    return false;
  }
})();

if (isCli) {
  try {
    const { evidencePath } = parseArgs();
    if (!evidencePath || !fs.existsSync(evidencePath)) {
      throw new Error("recovery_evidence_file_missing");
    }
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    const result = recoverZeroValueObservationDays({
      evidence,
      evidencePathLabel: evidencePath.replaceAll("\\", "/")
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    process.exitCode = 1;
  }
}
