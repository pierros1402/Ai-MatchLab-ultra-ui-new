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
  alertArtifact
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
    return {
      ...dynamic,
      classificationSource:
        "dynamic-runtime",
      authoritativeAlertArtifactUsed:
        false,
      authoritativeAlertArtifactReason:
        validation.reason
    };
  }

  return {
    ...dynamic,
    ok:
      validation.severity !== "error",
    severity:
      validation.severity,
    status:
      validation.status,
    issueCounts:
      validation.issueCounts,
    issues:
      validation.issues,
    classificationSource:
      "system-health-alerts",
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