export const RUNTIME_ARTIFACT_POLICY = Object.freeze([
  Object.freeze({ key: "manifest", severity: "error" }),
  Object.freeze({ key: "invariant", severity: "error" }),
  Object.freeze({ key: "freshness", severity: "warning" }),
  Object.freeze({ key: "value", severity: "error" }),
  Object.freeze({ key: "valueAudit", severity: "warning" }),
  Object.freeze({ key: "buildReport", severity: "warning" }),
  Object.freeze({ key: "valueComparison", severity: "info" })
]);

export function systemHealthMissingArtifactSeverity(key) {
  return RUNTIME_ARTIFACT_POLICY.find(
    item => item.key === key
  )?.severity || "error";
}

export function collectRuntimeArtifactIssues(
  read,
  { relativeArtifact = value => String(value || "") } = {}
) {
  const issues = [];

  for (const { key, severity } of RUNTIME_ARTIFACT_POLICY) {
    const artifactRead = read?.[key] || {};
    const artifact = relativeArtifact(artifactRead.path);

    if (!artifactRead.exists) {
      issues.push({
        severity,
        source: key,
        type: "artifact_missing",
        message: "Diagnostic artifact is missing.",
        details: { artifact }
      });
      continue;
    }

    if (!artifactRead.ok) {
      issues.push({
        severity: "error",
        source: key,
        type: "artifact_json_invalid",
        message: "Diagnostic artifact exists but cannot be parsed as JSON.",
        details: {
          artifact,
          error: artifactRead.error || null
        }
      });
    }
  }

  return issues;
}

export function classifyRuntimeSystemHealth({
  issues = [],
  invariant = null
} = {}) {
  const severity = issues.some(
    issue => issue?.severity === "error"
  )
    ? "error"
    : issues.some(issue => issue?.severity === "warning")
      ? "warning"
      : issues.some(issue => issue?.severity === "info")
        ? "info"
        : "ok";

  const status = severity === "error"
    ? "error"
    : severity === "warning"
      ? "warning"
      : severity === "info"
        ? "info"
        : "ok";

  return {
    ok: severity !== "error",
    severity,
    status,
    valueSafe: invariant?.valueSafe === true
  };
}