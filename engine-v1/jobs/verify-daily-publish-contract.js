import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { athensDayKey } from "../core/daykey.js";
import { validateDeploySnapshotManifest } from "../core/deploy-snapshot-release-contract.js";
import { validatePlanCShadowExportPayload } from "../value/plan-c-shadow-export.js";
import { verifyDetailsValueMirrorDay } from "./verify-details-value-mirror-day.js";

function readJson(file) {
  if (!fs.existsSync(file)) return { exists: false, payload: null, error: null };
  try {
    return { exists: true, payload: JSON.parse(fs.readFileSync(file, "utf8")), error: null };
  } catch (error) {
    return { exists: true, payload: null, error: error?.message || String(error) };
  }
}

function nonNegativeInteger(value) {
  const number = Number(value);

  return Number.isInteger(number) && number >= 0
    ? number
    : null;
}

function validateValuePlanArtifact(planId, payload, dayKey) {
  const errors = [];

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return {
      planId,
      ok: false,
      count: null,
      picks: null,
      errors: ["payload_missing_or_invalid"]
    };
  }

  if (String(payload.date || "") !== dayKey) {
    errors.push("day_mismatch");
  }

  const picks =
    Array.isArray(payload.picks)
      ? payload.picks
      : null;

  if (!picks) {
    errors.push("picks_not_array");
  }

  const count =
    nonNegativeInteger(payload.count);

  if (count === null) {
    errors.push(
      "count_not_nonnegative_integer"
    );
  }

  if (
    picks &&
    count !== null &&
    count !== picks.length
  ) {
    errors.push("count_picks_mismatch");
  }

  if (payload.ok === false) {
    errors.push("plan_ok_false");
  }

  return {
    planId,
    ok: errors.length === 0,
    count,
    picks: picks?.length ?? null,
    errors
  };
}

function comparisonPlanCount(plan) {
  if (
    !plan ||
    typeof plan !== "object" ||
    Array.isArray(plan)
  ) {
    return null;
  }

  const summaryCount =
    nonNegativeInteger(
      plan?.summary?.picks
    );

  if (summaryCount !== null) {
    return summaryCount;
  }

  const count =
    nonNegativeInteger(plan.count);

  if (count !== null) {
    return count;
  }

  return Array.isArray(plan.picks)
    ? plan.picks.length
    : null;
}

function validateValueComparisonArtifact(
  payload,
  dayKey,
  directPlans
) {
  const errors = [];
  const parity = {};
  const counts = {};

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return {
      ok: false,
      errors: ["comparison_missing_or_invalid"],
      parity,
      counts
    };
  }

  if (payload.ok === false) {
    errors.push("comparison_ok_false");
  }

  if (String(payload.date || "") !== dayKey) {
    errors.push("comparison_day_mismatch");
  }

  if (
    !payload.plans ||
    typeof payload.plans !== "object" ||
    Array.isArray(payload.plans)
  ) {
    errors.push("comparison_plans_missing");

    return {
      ok: false,
      errors,
      parity,
      counts
    };
  }

  for (const planId of ["A", "A2", "B", "B2"]) {
    const plan =
      payload.plans[planId];

    if (
      !plan ||
      typeof plan !== "object" ||
      Array.isArray(plan)
    ) {
      errors.push(
        "comparison_plan_missing:" +
        planId
      );

      parity[planId] = false;
      counts[planId] = null;
      continue;
    }

    const comparisonCount =
      comparisonPlanCount(plan);

    counts[planId] =
      comparisonCount;

    if (comparisonCount === null) {
      errors.push(
        "comparison_count_invalid:" +
        planId
      );
    }

    if (
      Array.isArray(plan.picks) &&
      comparisonCount !== null &&
      comparisonCount !== plan.picks.length
    ) {
      errors.push(
        "comparison_internal_count_mismatch:" +
        planId
      );
    }

    const directCount =
      directPlans?.[planId]?.count ??
      null;

    const exact =
      Number.isInteger(directCount) &&
      Number.isInteger(comparisonCount) &&
      directCount === comparisonCount;

    parity[planId] =
      exact;

    if (!exact) {
      errors.push(
        "comparison_count_mismatch:" +
        planId +
        ":direct=" +
        directCount +
        ":comparison=" +
        comparisonCount
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    parity,
    counts
  };
}

function parseArgs(argv) {
  let dayKey = "";
  let gate = false;
  let prepublish = false;

  for (const arg of argv) {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(arg)) {
      dayKey = arg;
    }
    else if (arg.startsWith("--date=")) {
      dayKey = arg.slice(7);
    }
    else if (arg === "--gate") {
      gate = true;
    }
    else if (arg === "--prepublish") {
      prepublish = true;
    }
  }

  return {
    dayKey:
      dayKey ||
      athensDayKey(),
    gate,
    prepublish
  };
}

export function verifyDailyPublishContract(dayKey, options = {}) {
  const dataPath = typeof options.resolveDataPath === "function"
    ? options.resolveDataPath
    : resolveDataPath;

  const requireLatest =
    options.requireLatest !== false;

  const snapshotRoot = dataPath("deploy-snapshots", dayKey);
  const required = {
    fixtures: path.join(snapshotRoot, "fixtures.json"),
    manifest: path.join(snapshotRoot, "manifest.json"),
    invariant: path.join(snapshotRoot, "invariant-report.json"),
    value: path.join(snapshotRoot, "value.json"),
    freshness: path.join(snapshotRoot, "freshness-report.json"),
    valueAudit: path.join(snapshotRoot, "value-audit.json"),
    planA: dataPath("value-plans", dayKey, "plan-a.json"),
    planA2: dataPath("value-plans", dayKey, "plan-a2.json"),
    planB: dataPath("value-plans", dayKey, "plan-b.json"),
    planB2: dataPath("value-plans", dayKey, "plan-b2.json"),
    valueComparison: dataPath("value-comparison", dayKey + ".json"),
    buildReport: dataPath("build-reports", `${dayKey}.json`),
    foundationIntegrity: dataPath("foundation-integrity", `${dayKey}.json`),
    systemHealth: dataPath("system-health", `${dayKey}.json`)
  };

  const artifacts = {};
  const blocked = [];
  for (const [name, file] of Object.entries(required)) {
    const state = readJson(file);
    artifacts[name] = { file, exists: state.exists, parseError: state.error };
    if (!state.exists) blocked.push({ code: "required_artifact_missing", artifact: name, file });
    else if (state.error) blocked.push({ code: "required_artifact_invalid_json", artifact: name, file, error: state.error });
    else artifacts[name].payload = state.payload;
  }

  const manifest = artifacts.manifest?.payload;
  const fixtures = artifacts.fixtures?.payload;
  const invariant = artifacts.invariant?.payload;
  const value = artifacts.value?.payload;
  const freshness = artifacts.freshness?.payload;
  const valueAudit = artifacts.valueAudit?.payload;
  const valuePlans = {
    A: artifacts.planA?.payload,
    A2: artifacts.planA2?.payload,
    B: artifacts.planB?.payload,
    B2: artifacts.planB2?.payload
  };

  const valueComparison =
    artifacts.valueComparison?.payload;
  const buildReport = artifacts.buildReport?.payload;
  const foundationIntegrity = artifacts.foundationIntegrity?.payload;
  const systemHealth = artifacts.systemHealth?.payload;

  if (manifest) {
    const releaseValidation = validateDeploySnapshotManifest(manifest, dayKey);
    if (!releaseValidation.ok) {
      blocked.push({
        code: "manifest_release_contract_failed",
        errors: releaseValidation.errors
      });
    }

    if (String(manifest.date || manifest.dayKey || "") !== dayKey) {
      blocked.push({ code: "manifest_day_mismatch", expected: dayKey, actual: manifest.date || manifest.dayKey || null });
    }

    for (const [artifactName, manifestKey] of [
      ["planCShadow", "planCShadow"],
      ["planCShadowAudit", "planCShadowAudit"]
    ]) {
      const declaredName = manifest?.files?.[manifestKey];
      if (!declaredName) continue;
      const file = path.join(snapshotRoot, declaredName);
      const state = readJson(file);
      artifacts[artifactName] = { file, exists: state.exists, parseError: state.error, payload: state.payload };
      if (!state.exists) blocked.push({ code: "required_artifact_missing", artifact: artifactName, file });
      else if (state.error) blocked.push({ code: "required_artifact_invalid_json", artifact: artifactName, file, error: state.error });
    }

    const planCShadow = artifacts.planCShadow?.payload;
    if (planCShadow) {
      const planCValidation = validatePlanCShadowExportPayload(planCShadow, dayKey);
      if (!planCValidation.ok) {
        blocked.push({ code: "plan_c_shadow_release_contract_failed", errors: planCValidation.errors });
      }
      if (planCValidation.count !== Number(manifest.counts?.planCShadowPredictions || 0)) {
        blocked.push({ code: "plan_c_shadow_count_mismatch", manifest: manifest.counts?.planCShadowPredictions ?? null, artifact: planCValidation.count });
      }
      if (planCValidation.pickCount !== Number(manifest.counts?.planCShadowPicks || 0)) {
        blocked.push({ code: "plan_c_shadow_pick_count_mismatch", manifest: manifest.counts?.planCShadowPicks ?? null, artifact: planCValidation.pickCount });
      }
    }

    const planCShadowAudit = artifacts.planCShadowAudit?.payload;
    if (planCShadowAudit && (
      planCShadowAudit.ok !== true ||
      planCShadowAudit.date !== dayKey ||
      planCShadowAudit.mode !== "SHADOW" ||
      planCShadowAudit.productionEligible !== false
    )) {
      blocked.push({ code: "plan_c_shadow_audit_contract_failed" });
    }
  }
  if (fixtures && String(fixtures.date || fixtures.dayKey || dayKey) !== dayKey) {
    blocked.push({ code: "fixtures_day_mismatch", expected: dayKey, actual: fixtures.date || fixtures.dayKey || null });
  }
  if (invariant) {
    if (invariant.ok !== true) blocked.push({ code: "invariant_not_ok" });
    if (invariant.valueSafe !== true) blocked.push({ code: "invariant_value_not_safe" });
    if (manifest?.generatedAt && invariant.manifestGeneratedAt !== manifest.generatedAt) {
      blocked.push({ code: "invariant_manifest_stale", manifestGeneratedAt: manifest.generatedAt, invariantManifestGeneratedAt: invariant.manifestGeneratedAt || null });
    }
  }
  if (freshness && freshness.ok !== true) blocked.push({ code: "freshness_not_ok" });
  if (value) {
    if (!Array.isArray(value.picks)) blocked.push({ code: "value_picks_not_array" });
    if (String(value.source || "") === "missing_local_value_file") blocked.push({ code: "value_source_missing_local_file" });
    if (Array.isArray(value.picks) && Number(value.count ?? value.picks.length) !== value.picks.length) {
      blocked.push({ code: "value_count_mismatch", count: value.count ?? null, picks: value.picks.length });
    }
  }
  if (valueAudit && valueAudit.ok === false) {
    blocked.push({ code: "value_audit_not_ok" });
  }

  const valuePlanValidation = {};

  for (const planId of ["A", "A2", "B", "B2"]) {
    const validation =
      validateValuePlanArtifact(
        planId,
        valuePlans[planId],
        dayKey
      );

    valuePlanValidation[planId] =
      validation;

    if (!validation.ok) {
      blocked.push({
        code:
          "value_plan_release_contract_failed",
        plan:
          planId,
        errors:
          validation.errors
      });
    }
  }

  const valueComparisonValidation =
    validateValueComparisonArtifact(
      valueComparison,
      dayKey,
      valuePlanValidation
    );

  if (!valueComparisonValidation.ok) {
    blocked.push({
      code:
        "value_comparison_release_contract_failed",
      errors:
        valueComparisonValidation.errors
    });
  }

  if (foundationIntegrity) {
    if (String(foundationIntegrity.dayKey || "") !== dayKey) {
      blocked.push({ code: "foundation_integrity_day_mismatch", expected: dayKey, actual: foundationIntegrity.dayKey || null });
    }
    if (foundationIntegrity.modelReady !== true) {
      blocked.push({ code: "foundation_model_not_ready", blocked: foundationIntegrity.blocked || [] });
    }
    if (foundationIntegrity.publicationReady !== true) {
      blocked.push({ code: "foundation_publication_not_ready", blocked: foundationIntegrity.blocked || [] });
    }
  }

  if (buildReport) {
    if (buildReport.ok !== true) {
      blocked.push({ code: "build_report_not_ok" });
    }

    if (buildReport.clean !== true) {
      blocked.push({
        code: "build_report_not_clean",
        clean: buildReport.clean ?? null
      });
    }

    if (!Array.isArray(buildReport.hardFailures)) {
      blocked.push({
        code: "build_report_hard_failures_invalid"
      });
    } else if (buildReport.hardFailures.length > 0) {
      blocked.push({
        code: "build_report_has_hard_failures",
        hardFailures: buildReport.hardFailures
      });
    }
  }

  if (systemHealth) {
    const systemHealthDay = String(systemHealth.dayKey || "");

    if (systemHealthDay !== dayKey) {
      blocked.push({
        code: "system_health_day_mismatch",
        expected: dayKey,
        actual: systemHealthDay || null
      });
    }

    const errorCount = Number(systemHealth.issueCounts?.error);

    if (!Number.isFinite(errorCount)) {
      blocked.push({
        code: "system_health_error_count_invalid"
      });
    } else if (errorCount > 0) {
      blocked.push({
        code: "system_health_has_errors",
        errorCount
      });
    }

    if (
      String(systemHealth.severity || "")
        .trim()
        .toLowerCase() === "error"
    ) {
      blocked.push({
        code: "system_health_severity_error"
      });
    }
  }

  const detailsDir = path.join(snapshotRoot, "details");
  const fixtureRows = Array.isArray(fixtures?.fixtures) ? fixtures.fixtures : [];
  const detailFiles = fs.existsSync(detailsDir)
    ? fs.readdirSync(detailsDir).filter(name => name.endsWith(".json"))
    : [];
  if (fixtureRows.length > 0 && detailFiles.length === 0) {
    blocked.push({ code: "details_missing_for_nonempty_fixture_universe", fixtures: fixtureRows.length });
  }

  const detailsValueMirror =
    verifyDetailsValueMirrorDay(
      dayKey,
      {
        resolveDataPath:
          dataPath
      }
    );

  if (
    detailsValueMirror.ok !== true
  ) {
    blocked.push({
      code:
        "details_value_mirror_failed",
      authority:
        detailsValueMirror.authority ||
        null,
      violations:
        detailsValueMirror.violations ||
        []
    });
  }

  const latestFile =
    dataPath(
      "deploy-snapshots",
      "latest.json"
    );

  if (requireLatest) {
    const latestState =
      readJson(latestFile);

    if (
      !latestState.exists ||
      latestState.error
    ) {
      blocked.push({
        code:
          latestState.exists
            ? "latest_invalid_json"
            : "latest_missing",
        file:
          latestFile
      });
    }
    else {
      const latestDay =
        String(
          latestState
            .payload
            ?.date ||
          latestState
            .payload
            ?.dayKey ||
          ""
        );

      if (
        latestDay !== dayKey
      ) {
        blocked.push({
          code:
            "latest_day_mismatch",
          expected:
            dayKey,
          actual:
            latestDay || null
        });
      }

      if (
        manifest?.hash &&
        latestState
          .payload
          ?.hash &&
        latestState
          .payload
          .hash !== manifest.hash
      ) {
        blocked.push({
          code:
            "latest_manifest_hash_mismatch",
          latestHash:
            latestState
              .payload
              .hash,
          manifestHash:
            manifest.hash
        });
      }
    }
  }

  return {
    ok:
      blocked.length === 0,

    dayKey,

    checkedAt:
      new Date().toISOString(),

    mode:
      requireLatest
        ? "final"
        : "prepublish",

    latestRequired:
      requireLatest,

    fixtureCount:
      fixtureRows.length,

    detailFileCount:
      detailFiles.length,

    detailsValueMirror,

    valueRelease: {
      plans:
        valuePlanValidation,
      comparison:
        valueComparisonValidation
    },

    blocked,

    requiredArtifacts:
      Object.fromEntries(
        Object.entries(artifacts)
          .map(
            ([name, state]) => [
              name,
              {
                file:
                  state.file,
                exists:
                  state.exists,
                parseError:
                  state.parseError ||
                  null
              }
            ]
          )
      )
  };
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url);

if (isCli) {
  const {
    dayKey,
    gate,
    prepublish
  } = parseArgs(
    process.argv.slice(2)
  );

  const report =
    verifyDailyPublishContract(
      dayKey,
      {
        requireLatest:
          !prepublish
      }
    );

  console.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );

  if (
    gate &&
    !report.ok
  ) {
    process.exitCode = 1;
  }
}
