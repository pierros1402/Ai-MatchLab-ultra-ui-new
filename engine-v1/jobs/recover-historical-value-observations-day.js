import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { athensDayKey } from "../core/daykey.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import {
  buildValueFixtureUniverse,
  valueFixtureUniverseContract
} from "../core/value-fixture-universe.js";
import { resolveDataPath } from "../storage/data-root.js";
import {
  ensurePlanAObservationAtPaths,
  rowsFromPlanAPayload
} from "../value/plan-a-observation.js";
import { buildValuePlanComparisonDay } from "./build-value-plan-comparison-day.js";

export const HISTORICAL_VALUE_OBSERVATION_RECOVERY_SOURCE =
  "historical_missing_observation_recovery_sentinel";
export const HISTORICAL_VALUE_OBSERVATION_RECOVERY_REASON =
  "historical_observation_not_recoverable_from_authentic_release_artifacts";
export const HISTORICAL_VALUE_OBSERVATION_RECOVERY_SCHEMA =
  "ai-matchlab.historical-value-observation-recovery.v1";

const PLAN_SPECS = Object.freeze([
  Object.freeze({
    label: "B",
    planId: "plan-b",
    outputMode: "plan-b-observation"
  }),
  Object.freeze({
    label: "B2",
    planId: "plan-b2",
    outputMode: "plan-b2-observation"
  })
]);

function clean(value) {
  return String(value ?? "").trim();
}

function validDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(clean(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonPretty(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function validUniverseContract(value) {
  const contract = valueFixtureUniverseContract(value);
  return Boolean(
    contract.source === "canonical_fixtures" &&
    Number.isInteger(contract.count) &&
    contract.count > 0 &&
    /^[a-f0-9]{64}$/u.test(clean(contract.hash).toLowerCase()) &&
    Array.isArray(contract.canonicalIds) &&
    contract.canonicalIds.length === contract.count &&
    new Set(contract.canonicalIds).size === contract.count
  );
}

function pickId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.fixtureId ||
    row?.id
  );
}

function validateAuthenticReleaseEvidence({
  dayKey,
  canonicalFixtures,
  manifest,
  snapshotValue,
  snapshotValueAudit,
  snapshotValueFile,
  snapshotValueAuditFile
}) {
  const currentUniverse = buildValueFixtureUniverse(dayKey, {
    fixtures: canonicalFixtures
  });
  const currentContract = valueFixtureUniverseContract(currentUniverse);
  const picks = rowsFromPlanAPayload(snapshotValue);
  const historicalUniverse = snapshotValueAudit?.fixtureUniverse || null;

  if (!manifest || manifest.ok !== true || clean(manifest.date) !== dayKey) {
    return { ok: false, reason: "unsafe_or_wrong_day_manifest" };
  }
  if (
    manifest?.publicationUniverse?.mode !== "full_current_universe" ||
    Number(manifest?.publicationUniverse?.currentFixtureCount) !== currentContract.count ||
    Number(manifest?.publicationUniverse?.publishedFixtureCount) !== currentContract.count ||
    Number(manifest?.publicationUniverse?.deferredFixtureCount || 0) !== 0 ||
    Number(manifest?.canonicalFixtureCount) !== currentContract.count ||
    Number(manifest?.counts?.fixtures) !== currentContract.count ||
    Number(manifest?.counts?.details) !== currentContract.count ||
    Number(manifest?.counts?.detailsMissingForFixtures || 0) !== 0
  ) {
    return {
      ok: false,
      reason: "manifest_not_bound_to_current_full_canonical_universe",
      currentCanonicalFixtures: currentContract.count,
      manifestCanonicalFixtures: Number(manifest?.canonicalFixtureCount || 0)
    };
  }
  if (
    manifest?.valueGate?.ok !== true ||
    manifest?.valueGate?.mode !== "frozen_snapshot" ||
    manifest?.valueGate?.frozenIdentityBound !== true ||
    manifest?.valueGate?.frozenReleaseSafe !== true ||
    Number(manifest?.valueGate?.orphanPickCount || 0) !== 0
  ) {
    return { ok: false, reason: "manifest_frozen_plan_a_release_not_safe" };
  }
  if (
    !snapshotValue ||
    clean(snapshotValue.date) !== dayKey ||
    Number(snapshotValue.count) !== picks.length ||
    Number(manifest?.counts?.valuePicks) !== picks.length ||
    Number(manifest?.valueGate?.frozenPickCount) !== picks.length
  ) {
    return { ok: false, reason: "snapshot_plan_a_count_or_day_mismatch" };
  }
  if (
    !snapshotValueAudit ||
    snapshotValueAudit.ok !== true ||
    clean(snapshotValueAudit.date) !== dayKey ||
    snapshotValueAudit.planId !== "plan-a" ||
    snapshotValueAudit.outputMode !== "production" ||
    snapshotValueAudit.policyVersion !== "statistical-value-policy-v2.3" ||
    !validUniverseContract(historicalUniverse)
  ) {
    return { ok: false, reason: "snapshot_plan_a_audit_not_authentic_v2_3" };
  }

  const historicalContract = valueFixtureUniverseContract(historicalUniverse);
  const historicalIds = new Set(historicalContract.canonicalIds);
  const pickIds = picks.map(pickId);
  if (pickIds.some(id => !id || !historicalIds.has(id))) {
    return {
      ok: false,
      reason: "snapshot_plan_a_pick_outside_authentic_assessment_universe"
    };
  }

  const currentIds = new Set(currentContract.canonicalIds);
  if (pickIds.some(id => !currentIds.has(id))) {
    return {
      ok: false,
      reason: "snapshot_plan_a_pick_not_publishable_in_current_canonical_universe"
    };
  }

  if (!fs.existsSync(snapshotValueFile) || !fs.existsSync(snapshotValueAuditFile)) {
    return { ok: false, reason: "authentic_release_source_file_missing" };
  }

  const expectedValueHash = clean(manifest?.fileHashes?.["value.json"]).toLowerCase();
  const expectedAuditHash = clean(manifest?.fileHashes?.["value-audit.json"]).toLowerCase();
  const actualValueHash = sha256File(snapshotValueFile);
  const actualAuditHash = sha256File(snapshotValueAuditFile);

  if (
    !/^[a-f0-9]{64}$/u.test(expectedValueHash) ||
    !/^[a-f0-9]{64}$/u.test(expectedAuditHash) ||
    actualValueHash !== expectedValueHash ||
    actualAuditHash !== expectedAuditHash
  ) {
    return {
      ok: false,
      reason: "authentic_release_file_hash_mismatch",
      expectedValueHash,
      actualValueHash,
      expectedAuditHash,
      actualAuditHash
    };
  }

  return {
    ok: true,
    currentUniverse: currentContract,
    historicalPlanAUniverse: historicalContract,
    picks,
    valueHash: actualValueHash,
    valueAuditHash: actualAuditHash
  };
}

function recoveryContract() {
  return {
    authenticPayloadRecovered: false,
    retrospectivePredictionGeneration: false,
    inventedHistoricalPicks: false
  };
}

function buildUnavailableObservation({
  dayKey,
  spec,
  fixtureUniverse,
  recoveredAt
}) {
  const sourceContract = {
    valueInput: HISTORICAL_VALUE_OBSERVATION_RECOVERY_SOURCE,
    fixtureUniverse,
    canonicalFixtureUniverseRequired: true,
    exactIdentityJoinOnly: true,
    oddsMemoryCanCreateFixture: false,
    deploySnapshotInput: false,
    realBookmakerOddsUsed: false,
    observation: true,
    frozen: true,
    recoveryObservation: true,
    retrospectiveModelOutputUsed: false
  };
  const recovery = recoveryContract();

  const plan = {
    ok: true,
    schema: HISTORICAL_VALUE_OBSERVATION_RECOVERY_SCHEMA,
    date: dayKey,
    source: HISTORICAL_VALUE_OBSERVATION_RECOVERY_SOURCE,
    planId: spec.planId,
    outputMode: spec.outputMode,
    observation: true,
    frozen: true,
    authenticObservationUnavailable: true,
    unavailable: true,
    unavailableReason: HISTORICAL_VALUE_OBSERVATION_RECOVERY_REASON,
    recoveredAt,
    count: 0,
    picks: [],
    sourceContract,
    recoveryContract: recovery
  };

  const audit = {
    ok: true,
    schema: "ai-matchlab.value-audit.v1",
    date: dayKey,
    source: HISTORICAL_VALUE_OBSERVATION_RECOVERY_SOURCE,
    planId: spec.planId,
    outputMode: spec.outputMode,
    policyVersion: "statistical-value-policy-v2.3",
    observation: true,
    frozen: true,
    authenticObservationUnavailable: true,
    unavailable: true,
    unavailableReason: HISTORICAL_VALUE_OBSERVATION_RECOVERY_REASON,
    generatedAt: recoveredAt,
    fixtureUniverse,
    membership: {
      canonicalFixtures: fixtureUniverse.count,
      evaluatedFixtureCount: fixtureUniverse.count,
      fixtureUniverse,
      assessmentRows: 0,
      joinedMatches: 0,
      outputPicks: 0,
      outputValidPicks: 0,
      outputOrphanPicks: 0,
      outputAmbiguousPicks: 0
    },
    sourceContract,
    recoveryContract: recovery
  };

  return { plan, audit };
}

export function isHistoricalUnavailableObservationSentinel({
  dayKey,
  plan,
  audit,
  spec,
  fixtureUniverse
}) {
  const planUniverse = valueFixtureUniverseContract(plan?.sourceContract?.fixtureUniverse);
  const auditUniverse = valueFixtureUniverseContract(
    audit?.sourceContract?.fixtureUniverse || audit?.membership?.fixtureUniverse
  );
  const expected = valueFixtureUniverseContract(fixtureUniverse);
  const sameUniverse = value =>
    value.count === expected.count &&
    value.hash === expected.hash &&
    JSON.stringify(value.canonicalIds) === JSON.stringify(expected.canonicalIds);

  return Boolean(
    plan?.ok === true &&
    audit?.ok === true &&
    clean(plan?.date) === dayKey &&
    clean(audit?.date) === dayKey &&
    plan?.planId === spec.planId &&
    audit?.planId === spec.planId &&
    plan?.outputMode === spec.outputMode &&
    audit?.outputMode === spec.outputMode &&
    plan?.source === HISTORICAL_VALUE_OBSERVATION_RECOVERY_SOURCE &&
    audit?.source === HISTORICAL_VALUE_OBSERVATION_RECOVERY_SOURCE &&
    plan?.observation === true &&
    audit?.observation === true &&
    plan?.frozen === true &&
    audit?.frozen === true &&
    plan?.authenticObservationUnavailable === true &&
    audit?.authenticObservationUnavailable === true &&
    Number(plan?.count) === 0 &&
    Array.isArray(plan?.picks) &&
    plan.picks.length === 0 &&
    plan?.sourceContract?.canonicalFixtureUniverseRequired === true &&
    audit?.sourceContract?.canonicalFixtureUniverseRequired === true &&
    plan?.sourceContract?.exactIdentityJoinOnly === true &&
    audit?.sourceContract?.exactIdentityJoinOnly === true &&
    plan?.sourceContract?.oddsMemoryCanCreateFixture === false &&
    audit?.sourceContract?.oddsMemoryCanCreateFixture === false &&
    plan?.sourceContract?.realBookmakerOddsUsed === false &&
    audit?.sourceContract?.realBookmakerOddsUsed === false &&
    plan?.sourceContract?.recoveryObservation === true &&
    audit?.sourceContract?.recoveryObservation === true &&
    plan?.sourceContract?.retrospectiveModelOutputUsed === false &&
    audit?.sourceContract?.retrospectiveModelOutputUsed === false &&
    plan?.recoveryContract?.authenticPayloadRecovered === false &&
    audit?.recoveryContract?.authenticPayloadRecovered === false &&
    plan?.recoveryContract?.retrospectivePredictionGeneration === false &&
    audit?.recoveryContract?.retrospectivePredictionGeneration === false &&
    plan?.recoveryContract?.inventedHistoricalPicks === false &&
    audit?.recoveryContract?.inventedHistoricalPicks === false &&
    Number(audit?.membership?.canonicalFixtures) === expected.count &&
    Number(audit?.membership?.assessmentRows) === 0 &&
    Number(audit?.membership?.joinedMatches) === 0 &&
    Number(audit?.membership?.outputPicks) === 0 &&
    Number(audit?.membership?.outputValidPicks) === 0 &&
    Number(audit?.membership?.outputOrphanPicks) === 0 &&
    Number(audit?.membership?.outputAmbiguousPicks) === 0 &&
    sameUniverse(planUniverse) &&
    sameUniverse(auditUniverse)
  );
}

function allExist(paths) {
  return paths.every(file => fs.existsSync(file));
}

function anyExist(paths) {
  return paths.some(file => fs.existsSync(file));
}

export function recoverHistoricalValueObservationsAtPaths({
  dayKey,
  currentAthensDay,
  canonicalFixtures,
  manifest,
  snapshotValue,
  snapshotValueAudit,
  snapshotValueFile,
  snapshotValueAuditFile,
  planAObservationFile,
  planAObservationAuditFile,
  planBFile,
  planBAuditFile,
  planB2File,
  planB2AuditFile,
  recoveredAt = new Date().toISOString()
}) {
  const day = clean(dayKey);
  const today = clean(currentAthensDay);
  if (!validDayKey(day) || !validDayKey(today)) {
    return { ok: false, reason: "invalid_day_contract", dayKey: day, currentAthensDay: today };
  }
  if (day >= today) {
    return { ok: false, reason: "recovery_requires_past_day", dayKey: day, currentAthensDay: today };
  }
  if (!Array.isArray(canonicalFixtures) || canonicalFixtures.length <= 0) {
    return { ok: false, reason: "recovery_requires_current_canonical_fixtures" };
  }

  const evidence = validateAuthenticReleaseEvidence({
    dayKey: day,
    canonicalFixtures,
    manifest,
    snapshotValue,
    snapshotValueAudit,
    snapshotValueFile,
    snapshotValueAuditFile
  });
  if (!evidence.ok) return evidence;

  const targets = [
    planAObservationFile,
    planAObservationAuditFile,
    planBFile,
    planBAuditFile,
    planB2File,
    planB2AuditFile
  ];
  if (targets.some(file => !file)) {
    return { ok: false, reason: "recovery_target_path_missing" };
  }

  if (allExist(targets)) {
    const planAProbe = ensurePlanAObservationAtPaths({
      dayKey: day,
      sourcePayload: snapshotValue,
      sourcePath: snapshotValueFile,
      observationFile: planAObservationFile,
      auditFile: planAObservationAuditFile,
      provenance: {
        kind: "authentic_release_observation_recovery"
      },
      frozenAt: recoveredAt
    });
    if (!planAProbe.ok || planAProbe.conflict === true) {
      return { ok: false, reason: "existing_plan_a_recovery_conflicts_with_authentic_release", planAProbe };
    }

    const planB = readJson(planBFile);
    const planBAudit = readJson(planBAuditFile);
    const planB2 = readJson(planB2File);
    const planB2Audit = readJson(planB2AuditFile);
    const bOk = isHistoricalUnavailableObservationSentinel({
      dayKey: day,
      plan: planB,
      audit: planBAudit,
      spec: PLAN_SPECS[0],
      fixtureUniverse: evidence.currentUniverse
    });
    const b2Ok = isHistoricalUnavailableObservationSentinel({
      dayKey: day,
      plan: planB2,
      audit: planB2Audit,
      spec: PLAN_SPECS[1],
      fixtureUniverse: evidence.currentUniverse
    });
    if (!bOk || !b2Ok) {
      return { ok: false, reason: "existing_recovery_sentinel_mismatch", planB: bOk, planB2: b2Ok };
    }
    return {
      ok: true,
      alreadyRecovered: true,
      dayKey: day,
      planAPicks: evidence.picks.length,
      recoveryUniverse: evidence.currentUniverse
    };
  }
  if (anyExist(targets)) {
    return { ok: false, reason: "partial_recovery_artifacts_exist_refusing_overwrite" };
  }

  const targetDir = path.dirname(planAObservationFile);
  const stagingDir = path.join(
    targetDir,
    `.historical-value-observation-recovery-${process.pid}-${Date.now()}`
  );
  fs.mkdirSync(stagingDir, { recursive: true });

  const staged = {
    planA: path.join(stagingDir, "plan-a.json"),
    planAAudit: path.join(stagingDir, "plan-a-audit.json"),
    planB: path.join(stagingDir, "plan-b.json"),
    planBAudit: path.join(stagingDir, "plan-b-audit.json"),
    planB2: path.join(stagingDir, "plan-b2.json"),
    planB2Audit: path.join(stagingDir, "plan-b2-audit.json")
  };

  const planARecovery = ensurePlanAObservationAtPaths({
    dayKey: day,
    sourcePayload: snapshotValue,
    sourcePath: snapshotValueFile,
    observationFile: staged.planA,
    auditFile: staged.planAAudit,
    frozenAt: recoveredAt,
    provenance: {
      kind: "authentic_release_observation_recovery",
      recoveryReason: "missing_immutable_plan_a_observation_store",
      authenticPayloadRecovered: true,
      sourceValueAuditPath: snapshotValueAuditFile,
      sourceValueSha256: evidence.valueHash,
      sourceValueAuditSha256: evidence.valueAuditHash,
      sourceAssessmentFixtureUniverseCount: evidence.historicalPlanAUniverse.count,
      sourceAssessmentFixtureUniverseHash: evidence.historicalPlanAUniverse.hash,
      retrospectivePredictionGeneration: false
    }
  });

  if (!planARecovery.ok || planARecovery.created !== true) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return { ok: false, reason: "plan_a_authentic_release_recovery_failed", planARecovery };
  }

  for (const spec of PLAN_SPECS) {
    const { plan, audit } = buildUnavailableObservation({
      dayKey: day,
      spec,
      fixtureUniverse: evidence.currentUniverse,
      recoveredAt
    });
    const planPath = spec.planId === "plan-b" ? staged.planB : staged.planB2;
    const auditPath = spec.planId === "plan-b" ? staged.planBAudit : staged.planB2Audit;
    writeJsonPretty(planPath, plan);
    writeJsonPretty(auditPath, audit);
    if (!isHistoricalUnavailableObservationSentinel({
      dayKey: day,
      plan,
      audit,
      spec,
      fixtureUniverse: evidence.currentUniverse
    })) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
      return { ok: false, reason: `generated_${spec.planId}_sentinel_failed_self_validation` };
    }
  }

  const moves = [
    [staged.planA, planAObservationFile],
    [staged.planAAudit, planAObservationAuditFile],
    [staged.planB, planBFile],
    [staged.planBAudit, planBAuditFile],
    [staged.planB2, planB2File],
    [staged.planB2Audit, planB2AuditFile]
  ];
  const moved = [];
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const [source, target] of moves) {
      if (fs.existsSync(target)) throw new Error(`target_appeared_during_recovery:${target}`);
      fs.renameSync(source, target);
      moved.push(target);
    }
  } catch (error) {
    for (const target of moved.reverse()) fs.rmSync(target, { force: true });
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return {
      ok: false,
      reason: "recovery_commit_failed_rolled_back",
      error: error?.message || String(error)
    };
  }
  fs.rmSync(stagingDir, { recursive: true, force: true });

  return {
    ok: true,
    alreadyRecovered: false,
    dayKey: day,
    planAPicks: evidence.picks.length,
    planAObservationSignature: planARecovery.observationSignature,
    authenticPlanAAssessmentUniverse: evidence.historicalPlanAUniverse,
    recoveryUniverse: evidence.currentUniverse,
    unavailablePlans: PLAN_SPECS.map(spec => spec.planId),
    guarantees: {
      authenticPlanAPayloadRecovered: true,
      retrospectivePlanAScoringUsed: false,
      retrospectivePlanBScoringUsed: false,
      retrospectivePlanB2ScoringUsed: false,
      inventedHistoricalPicks: false
    }
  };
}

function parseArgs(argv) {
  const out = { date: "", writeComparison: false };
  for (const arg of argv) {
    if (arg.startsWith("--date=")) out.date = arg.slice("--date=".length);
    if (arg === "--write-comparison") out.writeComparison = true;
  }
  return out;
}

export function recoverHistoricalValueObservationsDay(dayKey, options = {}) {
  const day = clean(dayKey);
  const snapshotDir = resolveDataPath("deploy-snapshots", day);
  const snapshotValueFile = path.join(snapshotDir, "value.json");
  const snapshotValueAuditFile = path.join(snapshotDir, "value-audit.json");
  const manifestFile = path.join(snapshotDir, "manifest.json");
  const plansDir = resolveDataPath("value-plans", day);

  for (const file of [manifestFile, snapshotValueFile, snapshotValueAuditFile]) {
    if (!fs.existsSync(file)) {
      return { ok: false, reason: "required_authentic_release_artifact_missing", file };
    }
  }

  const recovery = recoverHistoricalValueObservationsAtPaths({
    dayKey: day,
    currentAthensDay: options.currentAthensDay || athensDayKey(),
    canonicalFixtures: canonicalFixturesForDay(day),
    manifest: readJson(manifestFile),
    snapshotValue: readJson(snapshotValueFile),
    snapshotValueAudit: readJson(snapshotValueAuditFile),
    snapshotValueFile,
    snapshotValueAuditFile,
    planAObservationFile: path.join(plansDir, "plan-a.json"),
    planAObservationAuditFile: path.join(plansDir, "plan-a-audit.json"),
    planBFile: path.join(plansDir, "plan-b.json"),
    planBAuditFile: path.join(plansDir, "plan-b-audit.json"),
    planB2File: path.join(plansDir, "plan-b2.json"),
    planB2AuditFile: path.join(plansDir, "plan-b2-audit.json"),
    recoveredAt: options.recoveredAt || new Date().toISOString()
  });
  if (!recovery.ok) return recovery;

  if (options.writeComparison === true) {
    const comparison = buildValuePlanComparisonDay(day, { write: true });
    if (!comparison?.ok) {
      return {
        ok: false,
        reason: "comparison_failed_after_observation_recovery",
        recovery,
        comparison
      };
    }
    return {
      ...recovery,
      comparison: {
        planA: comparison?.plans?.A?.summary || null,
        planA2: comparison?.plans?.A2?.summary || null,
        planB: comparison?.plans?.B?.summary || null,
        planB2: comparison?.plans?.B2?.summary || null
      }
    };
  }

  return recovery;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.date) {
    console.error(JSON.stringify({
      ok: false,
      reason: "missing_date",
      usage: "node engine-v1/jobs/recover-historical-value-observations-day.js --date=YYYY-MM-DD [--write-comparison]"
    }, null, 2));
    process.exitCode = 2;
  } else {
    const result = recoverHistoricalValueObservationsDay(args.date, {
      writeComparison: args.writeComparison
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  }
}
