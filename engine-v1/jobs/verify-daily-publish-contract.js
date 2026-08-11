import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { athensDayKey } from "../core/daykey.js";
import { validateDeploySnapshotManifest } from "../core/deploy-snapshot-release-contract.js";

function readJson(file) {
  if (!fs.existsSync(file)) return { exists: false, payload: null, error: null };
  try {
    return { exists: true, payload: JSON.parse(fs.readFileSync(file, "utf8")), error: null };
  } catch (error) {
    return { exists: true, payload: null, error: error?.message || String(error) };
  }
}

function parseArgs(argv) {
  let dayKey = "";
  let gate = false;
  for (const arg of argv) {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(arg)) dayKey = arg;
    else if (arg.startsWith("--date=")) dayKey = arg.slice(7);
    else if (arg === "--gate") gate = true;
  }
  return { dayKey: dayKey || athensDayKey(), gate };
}

export function verifyDailyPublishContract(dayKey, options = {}) {
  const dataPath = typeof options.resolveDataPath === "function"
    ? options.resolveDataPath
    : resolveDataPath;

  const snapshotRoot = dataPath("deploy-snapshots", dayKey);
  const required = {
    fixtures: path.join(snapshotRoot, "fixtures.json"),
    manifest: path.join(snapshotRoot, "manifest.json"),
    invariant: path.join(snapshotRoot, "invariant-report.json"),
    value: path.join(snapshotRoot, "value.json"),
    freshness: path.join(snapshotRoot, "freshness-report.json"),
    valueAudit: path.join(snapshotRoot, "value-audit.json"),
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

  const latestFile = dataPath("deploy-snapshots", "latest.json");
  const latestState = readJson(latestFile);
  if (!latestState.exists || latestState.error) {
    blocked.push({ code: latestState.exists ? "latest_invalid_json" : "latest_missing", file: latestFile });
  } else {
    const latestDay = String(latestState.payload?.date || latestState.payload?.dayKey || "");
    if (latestDay !== dayKey) blocked.push({ code: "latest_day_mismatch", expected: dayKey, actual: latestDay || null });
    if (manifest?.hash && latestState.payload?.hash && latestState.payload.hash !== manifest.hash) {
      blocked.push({ code: "latest_manifest_hash_mismatch", latestHash: latestState.payload.hash, manifestHash: manifest.hash });
    }
  }

  return {
    ok: blocked.length === 0,
    dayKey,
    checkedAt: new Date().toISOString(),
    fixtureCount: fixtureRows.length,
    detailFileCount: detailFiles.length,
    blocked,
    requiredArtifacts: Object.fromEntries(Object.entries(artifacts).map(([name, state]) => [name, { file: state.file, exists: state.exists, parseError: state.parseError || null }]))
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const { dayKey, gate } = parseArgs(process.argv.slice(2));
  const report = verifyDailyPublishContract(dayKey);
  console.log(JSON.stringify(report, null, 2));
  if (gate && !report.ok) process.exitCode = 1;
}
