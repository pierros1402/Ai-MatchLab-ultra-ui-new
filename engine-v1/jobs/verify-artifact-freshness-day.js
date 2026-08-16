/**
 * verify-artifact-freshness-day.js
 *
 * Freshness contract between the published deploy snapshot and its
 * authoritative upstream inputs. A snapshot whose manifest.generatedAt is
 * OLDER than any upstream artifact was built from data that has since
 * changed and must be re-exported before it ships (2026-07-07 incident:
 * manifest 05:33Z, uefa.champions canonical 07:31Z — 10 Champions League
 * qualifiers existed in the canonical store but not in the published UI).
 *
 * Upstream inputs checked (each skipped when absent — an evening pre-build
 * of tomorrow legitimately has no expected-matches file yet):
 *   - data/canonical-fixtures/<day>/*.json  (updatedAt, per league file)
 *   - data/expected-matches/<day>.json      (recordedAt)
 *   - data/coverage-reports/<day>.json      (finishedAt)
 *   - data/coverage-readiness/<day>.json    (generatedAt)
 *
 * This is a PUBLISH gate: it must only ever block the snapshot commit or
 * deploy — never the persistence of harvested truth (canonical fixtures,
 * results, history), which is committed separately and unconditionally.
 *
 * Usage: node engine-v1/jobs/verify-artifact-freshness-day.js --date=YYYY-MM-DD [--gate]
 * Writes: data/deploy-snapshots/<day>/freshness-report.json
 * Exit codes: without --gate always 0 (report-only) · with --gate 1 when
 * stale or the manifest is missing/unreadable.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function parseTime(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = String(value || "").trim();
  if (!text) return null;

  if (/^\d+(?:\.\d+)?$/u.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const t = Date.parse(text);
  return Number.isFinite(t) ? t : null;
}

function maxTime(values) {
  const times = values.map(parseTime).filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}

export function snapshotValueFreshnessTime({ snapshotValue, manifest } = {}) {
  const frozenPlanAPublication = Boolean(
    snapshotValue?.publicationAuthority === "frozen_plan_a_observation" ||
    (
      snapshotValue?.immutable === true &&
      snapshotValue?.planId === "plan-a" &&
      snapshotValue?.outputMode === "plan-a-observation"
    )
  );

  if (frozenPlanAPublication) {
    const publicationAt = maxTime([
      manifest?.valueGate?.valueArtifactAt,
      manifest?.generatedAt
    ]);
    if (publicationAt !== null) return publicationAt;
  }

  return maxTime([
    snapshotValue?.updatedAt,
    snapshotValue?.createdAt,
    snapshotValue?.generatedAt
  ]);
}

export function shouldPreserveHistoricalPlanBObservation({
  dayKey,
  currentAthensDay = athensDayKey(),
  planB,
  planBAudit
} = {}) {
  const requestedDay = String(dayKey || "").trim();
  const operationalDay = String(currentAthensDay || "").trim();
  const validDay = /^\d{4}-\d{2}-\d{2}$/u;

  if (!validDay.test(requestedDay) || !validDay.test(operationalDay)) return false;
  if (requestedDay >= operationalDay) return false;
  if (planB?.outputMode !== "plan-b-observation") return false;
  if (planBAudit?.date !== requestedDay) return false;

  const sourceContract = planBAudit?.sourceContract;
  const acceptedValueInputs = new Set([
    "odds_memory_ai_assessment",
    "canonical_fixture_universe_joined_with_odds_memory_ai_assessment"
  ]);

  return acceptedValueInputs.has(sourceContract?.valueInput)
    && sourceContract?.deploySnapshotInput === false
    && sourceContract?.realBookmakerOddsUsed === false;
}

export function verifyArtifactFreshnessDay(dayKey) {
  const report = {
    ok: true,
    dayKey,
    generatedAt: new Date().toISOString(),
    manifestGeneratedAt: null,
    inputs: [],
    staleInputs: [],
    derivedArtifacts: [],
    staleDerivedArtifacts: [],
    missingRequiredArtifacts: [],
    preservedHistoricalDerivedArtifacts: [],
    skippedInputs: [],
    fourPlanContract: {
      requiredPlans: ["A", "A2", "B", "B2"],
      presentPlans: [],
      complete: false
    },
    reasons: []
  };

  const manifestFile = resolveDataPath("deploy-snapshots", dayKey, "manifest.json");
  const manifest = readJsonSafe(manifestFile);
  const manifestAt = parseTime(manifest?.generatedAt);

  if (!manifestAt) {
    report.ok = false;
    report.reasons.push("manifest_missing_or_unreadable");
    return report;
  }
  report.manifestGeneratedAt = manifest.generatedAt;

  const inputs = [];

  const canonicalDir = resolveDataPath("canonical-fixtures", dayKey);
  if (fs.existsSync(canonicalDir)) {
    for (const name of fs.readdirSync(canonicalDir).filter(f => f.endsWith(".json")).sort()) {
      const payload = readJsonSafe(path.join(canonicalDir, name));
      inputs.push({
        kind: "canonical_fixtures",
        artifact: `canonical-fixtures/${dayKey}/${name}`,
        at: payload?.updatedAt || null,
        staleReason: "snapshot_stale_against_canonical"
      });
    }
  }

  inputs.push({
    kind: "expected_matches",
    artifact: `expected-matches/${dayKey}.json`,
    at: readJsonSafe(resolveDataPath("expected-matches", `${dayKey}.json`))?.recordedAt || null,
    staleReason: "snapshot_stale_against_expected_matches"
  });

  inputs.push({
    kind: "coverage_report",
    artifact: `coverage-reports/${dayKey}.json`,
    at: readJsonSafe(resolveDataPath("coverage-reports", `${dayKey}.json`))?.finishedAt || null,
    staleReason: "snapshot_stale_against_coverage_report"
  });

  inputs.push({
    kind: "coverage_readiness",
    artifact: `coverage-readiness/${dayKey}.json`,
    at: readJsonSafe(resolveDataPath("coverage-readiness", `${dayKey}.json`))?.generatedAt || null,
    staleReason: "snapshot_stale_against_coverage_readiness"
  });

  for (const input of inputs) {
    const at = parseTime(input.at);

    if (at === null) {
      report.skippedInputs.push({ ...input, skipped: "artifact_missing_or_no_timestamp" });
      continue;
    }

    const entry = { ...input, newerThanManifestMs: at - manifestAt };
    report.inputs.push(entry);

    if (at > manifestAt) {
      report.staleInputs.push(entry);
      if (!report.reasons.includes(input.staleReason)) {
        report.reasons.push(input.staleReason);
      }
    }
  }

  const canonicalInputTimes = report.inputs
    .filter(input => input.kind === "canonical_fixtures")
    .map(input => parseTime(input.at))
    .filter(Number.isFinite);
  const latestCanonicalInputAt = canonicalInputTimes.length ? Math.max(...canonicalInputTimes) : null;

  if (latestCanonicalInputAt !== null) {
    const snapshotValue = readJsonSafe(resolveDataPath("deploy-snapshots", dayKey, "value.json"));
    const snapshotAudit = readJsonSafe(resolveDataPath("deploy-snapshots", dayKey, "value-audit.json"));
    const planA2 = readJsonSafe(resolveDataPath("value-plans", dayKey, "plan-a2.json"));
    const planA2Audit = readJsonSafe(resolveDataPath("value-plans", dayKey, "plan-a2-audit.json"));
    const planB = readJsonSafe(resolveDataPath("value-plans", dayKey, "plan-b.json"));
    const planBAudit = readJsonSafe(resolveDataPath("value-plans", dayKey, "plan-b-audit.json"));
    const planB2 = readJsonSafe(resolveDataPath("value-plans", dayKey, "plan-b2.json"));
    const planB2Audit = readJsonSafe(resolveDataPath("value-plans", dayKey, "plan-b2-audit.json"));
    const comparison = readJsonSafe(resolveDataPath("value-comparison", `${dayKey}.json`));

    const requiredArtifacts = [
      {
        kind: "plan_a2",
        artifact: `value-plans/${dayKey}/plan-a2.json`,
        payload: planA2
      },
      {
        kind: "plan_a2_audit",
        artifact: `value-plans/${dayKey}/plan-a2-audit.json`,
        payload: planA2Audit
      },
      {
        kind: "plan_b",
        artifact: `value-plans/${dayKey}/plan-b.json`,
        payload: planB
      },
      {
        kind: "plan_b_audit",
        artifact: `value-plans/${dayKey}/plan-b-audit.json`,
        payload: planBAudit
      },
      {
        kind: "plan_b2",
        artifact: `value-plans/${dayKey}/plan-b2.json`,
        payload: planB2
      },
      {
        kind: "plan_b2_audit",
        artifact: `value-plans/${dayKey}/plan-b2-audit.json`,
        payload: planB2Audit
      },
      {
        kind: "value_plan_comparison",
        artifact: `value-comparison/${dayKey}.json`,
        payload: comparison
      }
    ];

    for (const artifact of requiredArtifacts) {
      if (!artifact.payload || typeof artifact.payload !== "object") {
        report.missingRequiredArtifacts.push({
          kind: artifact.kind,
          artifact: artifact.artifact,
          reason: "missing_or_unreadable"
        });
      }
    }

    const requiredPlanKeys = ["A", "A2", "B", "B2"];
    const presentPlanKeys = requiredPlanKeys.filter(
      key => comparison?.plans?.[key] && typeof comparison.plans[key] === "object"
    );

    report.fourPlanContract.presentPlans = presentPlanKeys;
    report.fourPlanContract.complete =
      presentPlanKeys.length === requiredPlanKeys.length;

    if (!report.fourPlanContract.complete) {
      report.missingRequiredArtifacts.push({
        kind: "four_plan_comparison_contract",
        artifact: `value-comparison/${dayKey}.json`,
        reason: "comparison_missing_required_plans",
        requiredPlans: requiredPlanKeys,
        presentPlans: presentPlanKeys
      });
    }

    if (
      report.missingRequiredArtifacts.length > 0 &&
      !report.reasons.includes("four_plan_artifacts_missing_or_invalid")
    ) {
      report.reasons.push("four_plan_artifacts_missing_or_invalid");
    }
    const currentAthensDay = athensDayKey();
    const preserveHistoricalPlanBAudit = shouldPreserveHistoricalPlanBObservation({
      dayKey,
      currentAthensDay,
      planB,
      planBAudit
    });

    const derivedArtifacts = [
      {
        kind: "snapshot_value",
        artifact: `deploy-snapshots/${dayKey}/value.json`,
        at: snapshotValueFreshnessTime({ snapshotValue, manifest }),
        staleReason: "snapshot_value_stale_against_canonical"
      },
      {
        kind: "snapshot_value_audit",
        artifact: `deploy-snapshots/${dayKey}/value-audit.json`,
        at: snapshotAudit?.generatedAt || null,
        staleReason: "snapshot_value_audit_stale_against_canonical"
      },
      {
        kind: "plan_a2",
        artifact: `value-plans/${dayKey}/plan-a2.json`,
        at: maxTime([
          planA2?.generatedAt,
          planA2?.updatedAt,
          planA2?.createdAt
        ]),
        staleReason: "plan_a2_stale_against_canonical"
      },
      {
        kind: "plan_a2_audit",
        artifact: `value-plans/${dayKey}/plan-a2-audit.json`,
        at: planA2Audit?.generatedAt || null,
        staleReason: "plan_a2_audit_stale_against_canonical"
      },
      {
        kind: "plan_b",
        artifact: `value-plans/${dayKey}/plan-b.json`,
        at: maxTime([
          planB?.generatedAt,
          planB?.updatedAt,
          planB?.createdAt
        ]),
        staleReason: "plan_b_stale_against_canonical"
      },
      {
        kind: "plan_b_audit",
        artifact: `value-plans/${dayKey}/plan-b-audit.json`,
        at: planBAudit?.generatedAt || null,
        staleReason: "plan_b_audit_stale_against_canonical",
        preservation: preserveHistoricalPlanBAudit
          ? {
              reason: "closed_day_immutable_plan_b_observation",
              requestedDay: dayKey,
              currentAthensDay,
              outputMode: planB?.outputMode || null,
              auditDate: planBAudit?.date || null,
              sourceContract: planBAudit?.sourceContract || null
            }
          : null
      },
      {
        kind: "plan_b2",
        artifact: `value-plans/${dayKey}/plan-b2.json`,
        at: maxTime([
          planB2?.generatedAt,
          planB2?.updatedAt,
          planB2?.createdAt
        ]),
        staleReason: "plan_b2_stale_against_canonical"
      },
      {
        kind: "plan_b2_audit",
        artifact: `value-plans/${dayKey}/plan-b2-audit.json`,
        at: planB2Audit?.generatedAt || null,
        staleReason: "plan_b2_audit_stale_against_canonical"
      },
      {
        kind: "value_plan_comparison",
        artifact: `value-comparison/${dayKey}.json`,
        at: comparison?.generatedAt || null,
        staleReason: "value_plan_comparison_stale_against_canonical"
      }
    ];

    for (const artifact of derivedArtifacts) {
      const at = parseTime(artifact.at);
      if (at === null) {
        report.skippedInputs.push({ ...artifact, skipped: "artifact_missing_or_no_timestamp" });
        continue;
      }

      const entry = {
        ...artifact,
        olderThanLatestCanonicalMs: at - latestCanonicalInputAt
      };
      report.derivedArtifacts.push(entry);

      if (at < latestCanonicalInputAt) {
        if (artifact.preservation) {
          report.preservedHistoricalDerivedArtifacts.push({ ...entry, preserved: true });
          continue;
        }

        report.staleDerivedArtifacts.push(entry);
        if (!report.reasons.includes(artifact.staleReason)) {
          report.reasons.push(artifact.staleReason);
        }
      }
    }
  }

  report.ok =
    report.staleInputs.length === 0 &&
    report.staleDerivedArtifacts.length === 0 &&
    report.missingRequiredArtifacts.length === 0 &&
    report.fourPlanContract.complete === true;

  return report;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const dateArg = process.argv.find(a => a.startsWith("--date="))?.split("=")[1]
    || process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const gate = process.argv.includes("--gate");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateArg || ""))) {
    console.error("Usage: node engine-v1/jobs/verify-artifact-freshness-day.js --date=YYYY-MM-DD [--gate]");
    process.exit(1);
  }

  const report = verifyArtifactFreshnessDay(dateArg);
  console.log(JSON.stringify(report, null, 2));

  const outDir = resolveDataPath("deploy-snapshots", dateArg);
  if (fs.existsSync(outDir)) {
    fs.writeFileSync(path.join(outDir, "freshness-report.json"), JSON.stringify(report, null, 2) + "\n");
  }

  process.exit(gate && !report.ok ? 1 : 0);
}
