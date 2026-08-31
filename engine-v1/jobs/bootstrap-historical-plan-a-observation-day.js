/**
 * Recover a missing historical immutable Plan A observation from one final,
 * source-bound Value build.
 *
 * This is deliberately narrower than refresh-value-artifacts-day:
 *   - existing observations are never rewritten;
 *   - only a historical day with full canonical snapshot parity is accepted;
 *   - the candidate is copied into the snapshot before its signature is checked;
 *   - the same verified snapshot payload is then frozen exactly once;
 *   - A2/B2 fixture-universe parity remains mandatory.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildValueDay } from "../core/build-value-day.js";
import { athensDayKey } from "../core/daykey.js";
import { fixturesForSnapshotDay } from "../core/day-fixture-universe.js";
import { assertValueFixtureUniverseParity } from "../core/value-fixture-universe.js";
import { resolveDataPath } from "../storage/data-root.js";
import {
  ensurePlanAObservationDay,
  planAObservationSignature,
  readPlanAObservationDay,
  rowsFromPlanAPayload
} from "../value/plan-a-observation.js";
import {
  evaluateValueRefreshSnapshotCoverage,
  updateManifestValueMetadata,
  updateSnapshotValueArtifacts,
  validateValuePlanPicksAgainstPublishedSnapshot
} from "./refresh-value-artifacts-day.js";

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value || "").trim());
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonStable(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;

  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = stableValue(value[key]);
  }
  return out;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function pickIdentity(pick, index) {
  const identity = [
    pick?.canonicalId,
    pick?.matchId,
    pick?.fixtureId,
    pick?.market,
    pick?.pick,
    pick?.selection
  ]
    .map(value => String(value ?? "").trim())
    .filter(Boolean)
    .join("|");

  return identity || `index:${index}`;
}

export function describePlanAObservationDifference(dayKey, candidate, snapshot) {
  const candidateRows = rowsFromPlanAPayload(candidate);
  const snapshotRows = rowsFromPlanAPayload(snapshot);
  const candidateSignature = planAObservationSignature(dayKey, candidate);
  const snapshotSignature = planAObservationSignature(dayKey, snapshot);

  const maxRows = Math.max(candidateRows.length, snapshotRows.length);
  let firstMismatchIndex = null;
  for (let index = 0; index < maxRows; index += 1) {
    if (stableJson(candidateRows[index]) !== stableJson(snapshotRows[index])) {
      firstMismatchIndex = index;
      break;
    }
  }

  const candidateIdentities = candidateRows.map(pickIdentity);
  const snapshotIdentities = snapshotRows.map(pickIdentity);
  const candidateIdentitySet = new Set(candidateIdentities);
  const snapshotIdentitySet = new Set(snapshotIdentities);

  return {
    ok: candidateSignature === snapshotSignature,
    dayKey,
    candidateSignature,
    snapshotSignature,
    candidateCount: candidateRows.length,
    snapshotCount: snapshotRows.length,
    firstMismatchIndex,
    candidateOnlyIdentities: candidateIdentities
      .filter(identity => !snapshotIdentitySet.has(identity))
      .slice(0, 25),
    snapshotOnlyIdentities: snapshotIdentities
      .filter(identity => !candidateIdentitySet.has(identity))
      .slice(0, 25)
  };
}

function failure(reason, details = {}) {
  return {
    ok: false,
    mode: "historical_plan_a_observation_bootstrap",
    reason,
    ...details
  };
}

function valueUniverseOf(plan, audit) {
  return (
    plan?.fixtureUniverse ||
    plan?.sourceContract?.fixtureUniverse ||
    audit?.fixtureUniverse ||
    audit?.membership?.fixtureUniverse ||
    null
  );
}

function validPlanBObservation(dayKey, plan, audit) {
  return Boolean(
    plan?.ok === true &&
    String(plan?.date || "") === dayKey &&
    String(plan?.planId || "") === "plan-b" &&
    String(plan?.outputMode || "") === "plan-b-observation" &&
    Array.isArray(plan?.picks) &&
    Number(plan?.count) === plan.picks.length &&
    audit?.ok === true &&
    String(audit?.date || "") === dayKey &&
    valueUniverseOf(plan, audit)
  );
}

function ensureHistoricalPlanBObservation({
  dayKey,
  snapshotIds,
  cohortUniverse,
  candidate,
  candidateAudit,
  sourceRef
}) {
  const planFile = resolveDataPath("value-plans", dayKey, "plan-b.json");
  const auditFile = resolveDataPath("value-plans", dayKey, "plan-b-audit.json");
  const planExists = fs.existsSync(planFile);
  const auditExists = fs.existsSync(auditFile);

  if (planExists !== auditExists) {
    return failure("partial_historical_plan_b_observation_state_refused", {
      date: dayKey,
      planExists,
      auditExists
    });
  }

  if (planExists) {
    const existingPlan = readJson(planFile);
    const existingAudit = readJson(auditFile);
    if (!validPlanBObservation(dayKey, existingPlan, existingAudit)) {
      return failure("invalid_existing_historical_plan_b_observation", {
        date: dayKey
      });
    }

    assertValueFixtureUniverseParity(
      valueUniverseOf(existingPlan, existingAudit),
      cohortUniverse
    );

    return {
      ok: true,
      created: false,
      preservedExisting: true,
      count: Number(existingPlan.count || 0),
      planFile,
      auditFile
    };
  }

  if (!validPlanBObservation(dayKey, candidate, candidateAudit)) {
    return failure("missing_or_invalid_historical_plan_b_candidate", {
      date: dayKey
    });
  }

  const candidateUniverse = valueUniverseOf(candidate, candidateAudit);
  assertValueFixtureUniverseParity(candidateUniverse, cohortUniverse);
  assertValueFixtureUniverseParity(
    candidateUniverse,
    valueUniverseOf(null, candidateAudit)
  );

  const publicationGuard = validateValuePlanPicksAgainstPublishedSnapshot(
    snapshotIds,
    { B: candidate }
  );
  if (!publicationGuard.ok) {
    return failure("historical_plan_b_candidate_outside_current_snapshot", {
      date: dayKey,
      publicationGuard
    });
  }

  const recoveryProvenance = {
    kind: "historical_adjusted_cohort_replay_recovery",
    sourceRef: sourceRef || null,
    immutableCohortParityVerified: true,
    currentSnapshotPickMembershipVerified: true
  };

  writeJsonStable(planFile, {
    ...candidate,
    recoveryProvenance
  });
  writeJsonStable(auditFile, {
    ...candidateAudit,
    recoveryProvenance
  });

  const verifiedPlan = readJson(planFile);
  const verifiedAudit = readJson(auditFile);
  if (!validPlanBObservation(dayKey, verifiedPlan, verifiedAudit)) {
    return failure("historical_plan_b_observation_postwrite_invalid", {
      date: dayKey
    });
  }

  return {
    ok: true,
    created: true,
    preservedExisting: false,
    count: Number(verifiedPlan.count || 0),
    planFile,
    auditFile,
    publicationGuard
  };
}

export async function bootstrapHistoricalPlanAObservationDay(dayKey, options = {}) {
  const date = String(dayKey || "").trim();
  const today = String(options.today || athensDayKey()).trim();

  if (!isDayKey(date)) {
    return failure("invalid_day_key", { date });
  }

  if (!isDayKey(today) || date >= today) {
    return failure("historical_plan_a_bootstrap_requires_past_day", {
      date,
      today
    });
  }

  const existing = readPlanAObservationDay(date);
  const observationExists = fs.existsSync(existing.file);
  if (observationExists) {
    if (existing.ok !== true) {
      return failure("invalid_existing_plan_a_observation", {
        date,
        observation: existing
      });
    }

    return {
      ok: true,
      mode: "historical_plan_a_observation_bootstrap",
      date,
      created: false,
      preservedExisting: true,
      reason: "valid_plan_a_observation_already_frozen",
      count: Number(existing.payload?.count || 0),
      observationSignature: existing.payload?.observationSignature || null
    };
  }

  const fixturesPath = resolveDataPath("deploy-snapshots", date, "fixtures.json");
  const manifestPath = resolveDataPath("deploy-snapshots", date, "manifest.json");
  const a2AuditPath = resolveDataPath("value-plans", date, "plan-a2-audit.json");
  const b2AuditPath = resolveDataPath("value-plans", date, "plan-b2-audit.json");

  for (const required of [fixturesPath, manifestPath, a2AuditPath, b2AuditPath]) {
    if (!fs.existsSync(required)) {
      return failure("historical_plan_a_bootstrap_missing_required_artifact", {
        date,
        missingPath: required
      });
    }
  }

  const snapshotFixturesPayload = readJson(fixturesPath);
  const snapshotRows = Array.isArray(snapshotFixturesPayload?.fixtures)
    ? snapshotFixturesPayload.fixtures
    : [];
  const snapshotIds = snapshotRows
    .map(row => String(row?.canonicalId || row?.matchId || "").trim())
    .filter(Boolean);
  const canonicalIds = fixturesForSnapshotDay(date).fixtures
    .map(row => String(row?.canonicalId || row?.matchId || "").trim())
    .filter(Boolean);
  const manifest = readJson(manifestPath);
  const coverage = evaluateValueRefreshSnapshotCoverage({
    canonicalIds,
    snapshotIds,
    publicationUniverse: manifest?.publicationUniverse || null
  });

  if (coverage.ok !== true || coverage.mode !== "full_canonical") {
    return failure(
      "historical_plan_a_bootstrap_requires_full_canonical_snapshot_parity",
      { date, coverage }
    );
  }

  const buildValue = typeof options.buildValue === "function"
    ? options.buildValue
    : buildValueDay;
  const candidateAudit = options.planAAudit || null;
  const builtCandidate = options.planACandidate ||
    await buildValue(date, { rebuild: true });
  const candidate = candidateAudit
    ? {
        ...builtCandidate,
        fixtureUniverse:
          builtCandidate?.fixtureUniverse ||
          candidateAudit?.fixtureUniverse ||
          null,
        sourceContract:
          builtCandidate?.sourceContract ||
          candidateAudit?.sourceContract ||
          null
      }
    : builtCandidate;
  if (candidate?.ok === false) {
    return failure("historical_plan_a_candidate_build_failed", {
      date,
      candidate
    });
  }

  const candidateUniverse = valueUniverseOf(candidate, candidateAudit);
  const a2Audit = readJson(a2AuditPath);
  const b2Audit = readJson(b2AuditPath);
  assertValueFixtureUniverseParity(
    candidateUniverse,
    valueUniverseOf(null, a2Audit)
  );
  assertValueFixtureUniverseParity(
    candidateUniverse,
    valueUniverseOf(null, b2Audit)
  );

  const currentSnapshotPickGuard =
    validateValuePlanPicksAgainstPublishedSnapshot(
      snapshotIds,
      { A: candidate }
    );
  if (!currentSnapshotPickGuard.ok) {
    return failure("historical_plan_a_candidate_outside_current_snapshot", {
      date,
      currentSnapshotPickGuard
    });
  }

  // The previous recovery compared a candidate built after Details refresh with
  // a snapshot copied from an earlier Value build. Publish the final candidate
  // into the snapshot first so the comparison and immutable freeze share one
  // exact source payload.
  const snapshotValue = updateSnapshotValueArtifacts(
    date,
    candidate,
    {
      preferPlanAResult: true,
      valueAudit: candidateAudit
    }
  );
  const manifestUpdate = updateManifestValueMetadata(
    date,
    snapshotValue.valueOut,
    snapshotValue.valueAuditPresent,
    { updateLatest: false }
  );

  if (manifestUpdate?.ok !== true) {
    return failure("historical_plan_a_snapshot_value_refresh_failed", {
      date,
      manifestUpdate
    });
  }

  const persistedSnapshot = readJson(snapshotValue.snapshotValueFile);
  const signatureCheck = describePlanAObservationDifference(
    date,
    candidate,
    persistedSnapshot
  );
  if (!signatureCheck.ok) {
    return failure("historical_plan_a_snapshot_candidate_signature_mismatch", {
      date,
      signatureCheck
    });
  }

  const freeze = ensurePlanAObservationDay(date, persistedSnapshot, {
    sourcePath: `data/deploy-snapshots/${date}/value.json`,
    provenance: {
      kind: "historical_publication_recovery",
      recoveryContract: "full-canonical-source-bound-plan-a-bootstrap-v2",
      fullCanonicalSnapshotParity: true,
      finalValueSnapshotIdentityVerified: true,
      adjustedUniverseParityVerified: true,
      sourceRef: options.sourceRef || null,
      sourceCohortCount: Number(candidateUniverse?.count || 0),
      sourceCohortHash: candidateUniverse?.hash || null,
      currentSnapshotPickMembershipVerified: true,
      canonicalFixtureCount: coverage.canonicalFixtures,
      snapshotFixtureCount: coverage.snapshotFixtures
    }
  });

  if (
    freeze?.ok !== true ||
    freeze?.created !== true ||
    freeze?.conflict === true ||
    freeze?.observationSignature !== signatureCheck.snapshotSignature
  ) {
    return failure("historical_plan_a_observation_freeze_failed", {
      date,
      freeze,
      signatureCheck
    });
  }

  const verified = readPlanAObservationDay(date);
  if (verified?.ok !== true) {
    return failure("historical_plan_a_observation_postfreeze_invalid", {
      date,
      observation: verified
    });
  }

  const planBObservation = ensureHistoricalPlanBObservation({
    dayKey: date,
    snapshotIds,
    cohortUniverse: candidateUniverse,
    candidate: options.planBCandidate || null,
    candidateAudit: options.planBAudit || null,
    sourceRef: options.sourceRef || null
  });
  if (planBObservation?.ok !== true) {
    return planBObservation;
  }

  return {
    ok: true,
    mode: "historical_plan_a_observation_bootstrap",
    date,
    created: true,
    preservedExisting: false,
    reason: freeze.reason,
    count: freeze.count,
    observationSignature: freeze.observationSignature,
    coverage,
    signatureCheck,
    currentSnapshotPickGuard,
    planBObservation,
    manifestHash: manifestUpdate.hash
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    date: null,
    planACandidate: null,
    planAAudit: null,
    planBCandidate: null,
    planBAudit: null,
    sourceRef: null,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "").trim();
    if (arg === "--date" && argv[index + 1]) {
      out.date = String(argv[++index]).trim();
      continue;
    }
    if (arg.startsWith("--date=")) {
      out.date = arg.slice("--date=".length);
      continue;
    }
    if (isDayKey(arg) && !out.date) {
      out.date = arg;
      continue;
    }
    let matchedOption = false;
    for (const [prefix, key] of [
      ["--plan-a-candidate=", "planACandidate"],
      ["--plan-a-audit=", "planAAudit"],
      ["--plan-b-candidate=", "planBCandidate"],
      ["--plan-b-audit=", "planBAudit"],
      ["--source-ref=", "sourceRef"]
    ]) {
      if (arg.startsWith(prefix)) {
        out[key] = arg.slice(prefix.length);
        matchedOption = true;
        break;
      }
    }
    if (matchedOption) {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

const isCli = (() => {
  try {
    return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || "");
  } catch {
    return false;
  }
})();

if (isCli) {
  (async () => {
    try {
      const args = parseArgs();
      if (args.help) {
        console.log(
          [
            "Usage:",
            "  node engine-v1/jobs/bootstrap-historical-plan-a-observation-day.js --date=YYYY-MM-DD",
            "    [--plan-a-candidate=FILE --plan-a-audit=FILE]",
            "    [--plan-b-candidate=FILE --plan-b-audit=FILE]",
            "    [--source-ref=GIT_REF]"
          ].join("\n")
        );
        return;
      }

      const result = await bootstrapHistoricalPlanAObservationDay(
        args.date,
        {
          planACandidate: args.planACandidate
            ? readJson(path.resolve(args.planACandidate))
            : null,
          planAAudit: args.planAAudit
            ? readJson(path.resolve(args.planAAudit))
            : null,
          planBCandidate: args.planBCandidate
            ? readJson(path.resolve(args.planBCandidate))
            : null,
          planBAudit: args.planBAudit
            ? readJson(path.resolve(args.planBAudit))
            : null,
          sourceRef: args.sourceRef || null
        }
      );
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      console.error(JSON.stringify({
        ok: false,
        stage: "historical_plan_a_observation_bootstrap_failed",
        error: error?.message || String(error),
        details: error?.details || null
      }, null, 2));
      process.exitCode = 1;
    }
  })();
}
