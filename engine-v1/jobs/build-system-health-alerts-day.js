/**
 * build-system-health-alerts-day.js
 *
 * Writes:
 *   data/system-health/<DAY>.json
 *   data/system-health/latest.json
 *
 * Purpose:
 *   Alert/history layer above raw System Health diagnostics.
 *   Keeps INFO visible, but raises alert only for ERROR/WARNING issues.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

function readJsonSafe(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function issueKey(issue) {
  const source = String(issue?.source || "unknown");
  const type = String(issue?.type || "unknown");
  const severity = String(issue?.severity || "info");
  const details = issue?.details || {};
  const artifact = details.artifact || "";
  const league = details.leagueSlug || details.league || "";
  const match = details.canonicalId || details.matchId || "";
  const raw = details.raw || "";

  return [
    severity,
    source,
    type,
    artifact,
    league,
    match,
    raw
  ].map(x => String(x || "").toLowerCase()).join("|");
}

function countIssues(issues) {
  const out = { error: 0, warning: 0, info: 0 };
  for (const issue of issues || []) {
    if (out[issue.severity] != null) out[issue.severity] += 1;
  }
  return out;
}

function severityFromIssues(issues) {
  if ((issues || []).some(i => i.severity === "error")) return "error";
  if ((issues || []).some(i => i.severity === "warning")) return "warning";
  if ((issues || []).some(i => i.severity === "info")) return "info";
  return "ok";
}

function issue(severity, source, type, message, details = {}) {
  return { severity, source, type, message, details };
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseSkippedSlugs(raw) {
  return String(raw || "")
    .replace(/^acquisition_skipped_slugs:/, "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function knownContextSkippedSlug(slug) {
  const s = String(slug || "").toLowerCase();

  if (!s) return false;
  if (s.startsWith("fs.")) return true;
  if (s.startsWith("club.")) return true;
  if (s.includes("friendly")) return true;
  if (s.includes("u19") || s.includes("u20") || s.includes("reserve")) return true;

  if (s === "usa.nwsl") return true;
  if (s === "arg.3") return true;

  return false;
}

function skippedSlugsContextOnly(slugs) {
  return Array.isArray(slugs)
    && slugs.length > 0
    && slugs.every(knownContextSkippedSlug);
}

function buildWarningIssue(text) {
  const raw = String(text || "");

  if (raw.startsWith("acquisition_skipped_slugs:")) {
    const slugs = parseSkippedSlugs(raw);
    const contextOnly = skippedSlugsContextOnly(slugs);

    return issue(
      contextOnly ? "info" : "warning",
      "build-report",
      "acquisition_skipped_slugs",
      contextOnly
        ? "Acquisition skipped only known out-of-scope/context slugs."
        : "Acquisition skipped slugs during fixture acquisition.",
      { slugs, raw, contextOnly }
    );
  }

  return issue("warning", "build-report", "build_warning", raw, { raw });
}

function buildWarningIsContextOnly(text) {
  const raw = String(text || "");
  if (!raw.startsWith("acquisition_skipped_slugs:")) return false;
  return skippedSlugsContextOnly(parseSkippedSlugs(raw));
}

function invariantWarningIssue(w) {
  const type = w?.type || "invariant_warning";

  if (type === "coverage_floor_drop") {
    const actualFixtures = num(w?.actualFixtures);
    const effectiveFloor = num(w?.effectiveFloor);
    const effectiveFloorMet = actualFixtures !== null
      && effectiveFloor !== null
      && actualFixtures >= effectiveFloor;

    return issue(
      effectiveFloorMet ? "info" : "warning",
      "invariant-report",
      type,
      effectiveFloorMet
        ? "Canonical fixtures are below static floor but meet the effective floor."
        : (w?.reason || "Canonical fixture count is below the effective floor."),
      { ...w, effectiveFloorMet }
    );
  }

  return issue(
    "warning",
    "invariant-report",
    type,
    w?.reason || "Invariant warning.",
    w
  );
}

export function buildSystemHealthAlertsDay(dayKey) {
  const snapshotDir = resolveDataPath("deploy-snapshots", dayKey);

  const buildReport = readJsonSafe(resolveDataPath("build-reports", `${dayKey}.json`));
  const invariant = readJsonSafe(path.join(snapshotDir, "invariant-report.json"));
  const freshness = readJsonSafe(path.join(snapshotDir, "freshness-report.json"));
  const manifest = readJsonSafe(path.join(snapshotDir, "manifest.json"));
  const valueAudit = readJsonSafe(path.join(snapshotDir, "value-audit.json"));
  const value = readJsonSafe(path.join(snapshotDir, "value.json"));
  const valueComparison = readJsonSafe(resolveDataPath("value-comparison", `${dayKey}.json`));

  const issues = [];

  if (!manifest) {
    issues.push(issue("error", "manifest", "artifact_missing", "Snapshot manifest is missing.", {
      artifact: `data/deploy-snapshots/${dayKey}/manifest.json`
    }));
  }

  if (!invariant) {
    issues.push(issue("error", "invariant-report", "artifact_missing", "Invariant report is missing.", {
      artifact: `data/deploy-snapshots/${dayKey}/invariant-report.json`
    }));
  } else {
    for (const b of invariant.blocked || []) {
      issues.push(issue("error", "invariant-report", b.type || "invariant_blocked", "Snapshot invariant blocked the build.", b));
    }

    for (const a of invariant.autoFixed || []) {
      issues.push(issue("warning", "invariant-report", "auto_fixed_" + (a.type || "issue"), "Invariant check auto-fixed a snapshot/detail issue.", a));
    }

    for (const w of invariant.warnings || []) {
      issues.push(invariantWarningIssue(w));
    }

    if (invariant.ok === false) {
      issues.push(issue("error", "invariant-report", "invariant_not_ok", "Invariant report marked the snapshot as not OK.", {
        ok: invariant.ok
      }));
    }

    if (invariant.valueSafe === false) {
      issues.push(issue("error", "invariant-report", "value_unsafe", "Invariant report marked Value output as unsafe.", {
        valueSafe: invariant.valueSafe,
        valueCount: invariant.valueCount
      }));
    }
  }

  if (!freshness) {
    issues.push(issue("warning", "freshness-report", "artifact_missing", "Freshness report is missing.", {
      artifact: `data/deploy-snapshots/${dayKey}/freshness-report.json`
    }));
  } else {
    if (freshness.ok === false) {
      issues.push(issue("warning", "freshness-report", "freshness_not_ok", "Freshness report is not OK.", {
        reasons: freshness.reasons || []
      }));
    }

    for (const input of freshness.staleInputs || []) {
      issues.push(issue("warning", "freshness-report", "stale_input", "Freshness report found stale input.", input));
    }

    for (const artifact of freshness.staleDerivedArtifacts || []) {
      issues.push(issue("warning", "freshness-report", "stale_derived_artifact", "Freshness report found stale derived artifact.", artifact));
    }

    for (const skipped of freshness.skippedInputs || []) {
      issues.push(issue("info", "freshness-report", "skipped_freshness_input", "Freshness report skipped an optional/missing input.", skipped));
    }
  }

  if (!buildReport) {
    issues.push(issue("warning", "build-report", "artifact_missing", "Build report is missing.", {
      artifact: `data/build-reports/${dayKey}.json`
    }));
  } else {
    for (const failure of buildReport.hardFailures || []) {
      issues.push(issue("error", "build-report", "build_hard_failure", String(failure), { failure }));
    }

    const buildWarnings = Array.isArray(buildReport.warnings) ? buildReport.warnings : [];
    const buildWarningsContextOnly = buildWarnings.length > 0
      && buildWarnings.every(buildWarningIsContextOnly);

    for (const warning of buildWarnings) {
      issues.push(buildWarningIssue(warning));
    }

    if (buildReport.clean === false) {
      issues.push(issue("error", "build-report", "build_not_clean", "Build report is not clean.", {
        clean: buildReport.clean,
        cleanStrict: buildReport.cleanStrict
      }));
    } else if (buildReport.cleanStrict === false) {
      issues.push(issue(
        buildWarningsContextOnly ? "info" : "warning",
        "build-report",
        "build_not_strict_clean",
        buildWarningsContextOnly
          ? "Build report is clean; strict-clean is false only because of contextual warnings."
          : "Build report is clean but not strict-clean.",
        {
          clean: buildReport.clean,
          cleanStrict: buildReport.cleanStrict,
          contextOnlyWarnings: buildWarningsContextOnly
        }
      ));
    }

    const failedFetches = Number(buildReport.acquisition?.failedFetches || 0);
    if (failedFetches > 0) {
      issues.push(issue("warning", "build-report", "acquisition_failed_fetches", "Fixture acquisition had failed provider fetches.", {
        failedFetches
      }));
    }

    const planBUnresolved = Number(buildReport.settlement?.planB?.unresolved || 0);
    if (planBUnresolved > 0) {
      issues.push(issue("info", "build-report", "plan_b_unresolved_settlement", "Plan B observation picks are still unresolved.", {
        picks: buildReport.settlement?.planB?.picks,
        settled: buildReport.settlement?.planB?.settled,
        unresolved: planBUnresolved
      }));
    }
  }

  if (!value) {
    issues.push(issue("error", "value", "artifact_missing", "Production value artifact is missing.", {
      artifact: `data/deploy-snapshots/${dayKey}/value.json`
    }));
  } else if (value.ok === false) {
    issues.push(issue("error", "value", "value_not_ok", "Production value artifact is not OK.", {
      ok: value.ok,
      count: value.count
    }));
  }

  if (!valueAudit) {
    issues.push(issue("warning", "value-audit", "artifact_missing", "Production value audit artifact is missing.", {
      artifact: `data/deploy-snapshots/${dayKey}/value-audit.json`
    }));
  } else {
    if (valueAudit.sourceContract?.deploySnapshotInput === true) {
      issues.push(issue("error", "value-audit", "value_uses_deploy_snapshot_input", "Value audit says production Value used deploy snapshot input.", {
        sourceContract: valueAudit.sourceContract
      }));
    }

    // Do not infer zero candidates from missing/renamed audit fields.
    // Production value may still have approved picks even when a specific
    // candidate counter is absent from the audit schema.
    const explicitCandidateValues = [
      valueAudit.summary?.candidateMarkets,
      valueAudit.candidateMarkets
    ].filter(v => v !== undefined && v !== null);

    const explicitApprovedValues = [
      valueAudit.summary?.approved,
      valueAudit.approved
    ].filter(v => v !== undefined && v !== null);

    const candidates = explicitCandidateValues.length > 0 ? Number(explicitCandidateValues[0]) : null;
    const approved = explicitApprovedValues.length > 0 ? Number(explicitApprovedValues[0]) : null;
    const valueCount = Number(value?.count || 0);

    if (
      candidates === 0
      && approved === 0
      && valueCount === 0
    ) {
      issues.push(issue("info", "value-audit", "production_value_zero_candidates", "Production Value had zero candidates.", {
        candidates,
        approved,
        valueCount
      }));
    }
  }

  if (!valueComparison) {
    issues.push(issue("info", "value-comparison", "artifact_missing", "Value Plan A/B comparison artifact is missing.", {
      artifact: `data/value-comparison/${dayKey}.json`
    }));
  } else {
    issues.push(issue("info", "value-comparison", "value_plan_comparison_summary", "Value Plan A/B comparison artifact is available.", {
      planA: {
        count: valueComparison.plans?.A?.count ?? null,
        summary: valueComparison.plans?.A?.summary ?? null
      },
      planB: {
        count: valueComparison.plans?.B?.count ?? null,
        summary: valueComparison.plans?.B?.summary ?? null
      }
    }));
  }

  const activeIssues = issues;
  const actionableIssues = activeIssues.filter(i => i.severity === "error" || i.severity === "warning");

  const outDir = resolveDataPath("system-health");
  const previous = readJsonSafe(path.join(outDir, "latest.json"), null);
  const previousDay = readJsonSafe(path.join(outDir, `${dayKey}.json`), null);
  const previousActive = Array.isArray(previous?.activeIssues) ? previous.activeIssues : [];

  const previousKeys = new Set(previousActive.map(issueKey));
  const activeKeys = new Set(activeIssues.map(issueKey));

  const newIssues = activeIssues.filter(i => !previousKeys.has(issueKey(i)));
  const resolvedIssues = previousActive.filter(i => !activeKeys.has(issueKey(i)));
  const persistentIssues = activeIssues.filter(i => previousKeys.has(issueKey(i)));

  const newActionableIssues = newIssues.filter(i => i.severity === "error" || i.severity === "warning");

  const activeKeyList = [...activeKeys].sort();
  const previousDayActiveKeys = new Set(
    Array.isArray(previousDay?.activeIssues)
      ? previousDay.activeIssues.map(issueKey)
      : []
  );
  const previousDayActiveKeyList = [...previousDayActiveKeys].sort();
  const sameActiveIssueSet = previousDay?.dayKey === dayKey
    && activeKeyList.length === previousDayActiveKeyList.length
    && activeKeyList.every((key, index) => key === previousDayActiveKeyList[index]);

  let report = {
    schema: "ai-matchlab.system-health-alerts.v1",
    dayKey,
    generatedAt: new Date().toISOString(),
    severity: severityFromIssues(activeIssues),
    issueCounts: countIssues(activeIssues),
    alert: newActionableIssues.length > 0,
    alertCounts: countIssues(newActionableIssues),
    activeIssueCount: activeIssues.length,
    actionableIssueCount: actionableIssues.length,
    newIssueCount: newIssues.length,
    newActionableIssueCount: newActionableIssues.length,
    resolvedIssueCount: resolvedIssues.length,
    persistentIssueCount: persistentIssues.length,
    activeIssues,
    actionableIssues,
    newIssues,
    newActionableIssues,
    resolvedIssues,
    persistentIssues
  };

  // Avoid timestamp-only / new-vs-persistent churn in intraday runs.
  // If the active issue set is unchanged for the same day, keep the previous
  // report stable so workflows do not commit only generatedAt/history noise.
  if (sameActiveIssueSet && previousDay) {
    report = {
      ...previousDay,
      activeIssues,
      actionableIssues,
      activeIssueCount: activeIssues.length,
      actionableIssueCount: actionableIssues.length,
      issueCounts: countIssues(activeIssues),
      severity: severityFromIssues(activeIssues)
    };
  }

  writeJson(path.join(outDir, `${dayKey}.json`), report);
  writeJson(path.join(outDir, "latest.json"), {
    ...report,
    latestForDay: dayKey
  });

  return report;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const dateArg = process.argv.find(a => a.startsWith("--date="))?.split("=")[1]
    || process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateArg || ""))) {
    console.error("Usage: node engine-v1/jobs/build-system-health-alerts-day.js --date=YYYY-MM-DD");
    process.exit(1);
  }

  const report = buildSystemHealthAlertsDay(dateArg);
  console.log(JSON.stringify({
    dayKey: report.dayKey,
    severity: report.severity,
    issueCounts: report.issueCounts,
    alert: report.alert,
    newActionableIssueCount: report.newActionableIssueCount,
    activeIssueCount: report.activeIssueCount,
    output: `data/system-health/${dateArg}.json`
  }, null, 2));
}
