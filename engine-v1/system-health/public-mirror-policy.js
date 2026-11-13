import { isDeepStrictEqual } from "node:util";

const ALERT_SCHEMA =
  "ai-matchlab.system-health-alerts.v1";

const ISSUE_SEVERITIES =
  new Set(["error", "warning", "info"]);

function countIssues(issues) {
  const counts = {
    error: 0,
    warning: 0,
    info: 0
  };

  for (const issue of issues) {
    if (counts[issue.severity] !== undefined) {
      counts[issue.severity] += 1;
    }
  }

  return counts;
}

function severityFromIssues(issues) {
  if (issues.some(issue => issue.severity === "error")) {
    return "error";
  }

  if (issues.some(issue => issue.severity === "warning")) {
    return "warning";
  }

  if (issues.some(issue => issue.severity === "info")) {
    return "info";
  }

  return "ok";
}

export function validatePublicSystemHealthAlertArtifact(
  artifact,
  dayKey
) {
  const day = String(dayKey || "").trim();

  if (!artifact || typeof artifact !== "object") {
    return {
      ok: false,
      reason: "artifact_missing"
    };
  }

  if (artifact.schema !== ALERT_SCHEMA) {
    return {
      ok: false,
      reason: "artifact_schema_mismatch"
    };
  }

  if (String(artifact.dayKey || "") !== day) {
    return {
      ok: false,
      reason: "artifact_day_mismatch"
    };
  }

  if (!Array.isArray(artifact.activeIssues)) {
    return {
      ok: false,
      reason: "artifact_active_issues_missing"
    };
  }

  const invalidIssue =
    artifact.activeIssues.find(issue =>
      !issue ||
      typeof issue !== "object" ||
      !ISSUE_SEVERITIES.has(
        String(issue.severity || "")
      )
    );

  if (invalidIssue) {
    return {
      ok: false,
      reason: "artifact_issue_contract_invalid"
    };
  }

  const issues =
    artifact.activeIssues.map(issue => ({
      ...issue
    }));

  const issueCounts =
    countIssues(issues);

  const severity =
    severityFromIssues(issues);

  return {
    ok: true,
    reason: null,
    issues,
    issueCounts,
    severity,
    status: severity
  };
}

export function reconcilePublicSystemHealth({
  dayKey,
  dynamicReport,
  alertArtifact,
  manifestGeneratedAt = null
} = {}) {
  const dynamic =
    dynamicReport &&
    typeof dynamicReport === "object"
      ? dynamicReport
      : {
          ok: false,
          severity: "error",
          status: "error",
          issueCounts: {
            error: 1,
            warning: 0,
            info: 0
          },
          issues: []
        };

  const validation =
    validatePublicSystemHealthAlertArtifact(
      alertArtifact,
      dayKey
    );

  if (!validation.ok) {
    const invalidAlertIssue = {
      severity: "error", source: "system-health-alerts",
      type: "system_health_authoritative_alert_untrusted",
      message: "Authoritative System Health artifact is absent or invalid for this snapshot.",
      details: { reason: validation.reason, manifestGeneratedAt }
    };
    const unresolvedIssues = [
      ...(Array.isArray(dynamic.issues) ? dynamic.issues : []),
      invalidAlertIssue
    ];
    return {
      ...dynamic,
      ok: false,
      severity: "error",
      status: "error",
      issues: unresolvedIssues,
      issueCounts: countIssues(unresolvedIssues),
      classificationSource:
        "dynamic-runtime",
      authoritativeAlertArtifactUsed:
        false,
      authoritativeAlertArtifactReason:
        validation.reason
    };
  }

  const runtimeErrorIssues = Array.isArray(dynamic.issues)
    ? dynamic.issues.filter(issue => issue?.severity === "error")
    : [];
  if ((dynamic.ok === false || dynamic.severity === "error") && runtimeErrorIssues.length === 0) {
    runtimeErrorIssues.push({
      severity: "error",
      source: "dynamic-runtime",
      type: "runtime_error_without_issue",
      message: "Runtime diagnostics report an error without an actionable error issue."
    });
  }
  const combinedIssues = validation.issues.map(issue => ({ ...issue }));
  for (const issue of runtimeErrorIssues) {
    const alreadyPresent = combinedIssues.some(existing =>
      isDeepStrictEqual(existing, issue)
    );
    if (!alreadyPresent) combinedIssues.push({ ...issue });
  }
  // A same-day alert is not necessarily fresh relative to the served snapshot.
  // Missing or invalid timestamps cannot certify freshness.
  let alertFreshnessIssue = null;
  if (manifestGeneratedAt !== null && manifestGeneratedAt !== undefined) {
    const manifestMs = Date.parse(String(manifestGeneratedAt));
    const alertMs = Date.parse(String(alertArtifact?.generatedAt || ""));
    if (!Number.isFinite(manifestMs) || !Number.isFinite(alertMs)) {
      alertFreshnessIssue = {
        severity: "error", source: "system-health-alerts",
        type: "system_health_alert_freshness_unverifiable",
        message: "Authoritative alert or snapshot timestamp is missing or invalid.",
        details: { alertGeneratedAt: alertArtifact?.generatedAt || null,
          manifestGeneratedAt }
      };
    } else if (manifestMs - alertMs > 10 * 60 * 1000) {
      alertFreshnessIssue = {
        severity: "error", source: "system-health-alerts",
        type: "system_health_alert_stale_against_snapshot",
        message: "Authoritative System Health is older than the published snapshot.",
        details: { alertGeneratedAt: alertArtifact.generatedAt,
          manifestGeneratedAt, lagMinutes: (manifestMs - alertMs) / 60000 }
      };
    }
  }
  if (alertFreshnessIssue) combinedIssues.push(alertFreshnessIssue);
  const combinedCounts = countIssues(combinedIssues);
  const combinedSeverity = severityFromIssues(combinedIssues);
  return {
    ...dynamic,
    ok:
      combinedSeverity !== "error",
    severity:
      combinedSeverity,
    status:
      combinedSeverity,
    issueCounts:
      combinedCounts,
    issues:
      combinedIssues,
    classificationSource:
      runtimeErrorIssues.length > 0 || alertFreshnessIssue !== null
        ? "system-health-alerts+dynamic-runtime"
        : "system-health-alerts",
    authoritativeAlertArtifactUsed:
      true,
    authoritativeAlertArtifactReason:
      null,
    authoritativeAlertGeneratedAt:
      alertArtifact.generatedAt || null,
    diagnosticRuntime: {
      ok:
        dynamic.ok === true,
      severity:
        dynamic.severity || null,
      status:
        dynamic.status || null,
      issueCounts:
        dynamic.issueCounts || null,
      issues:
        Array.isArray(dynamic.issues)
          ? dynamic.issues
          : []
    }
  };
}