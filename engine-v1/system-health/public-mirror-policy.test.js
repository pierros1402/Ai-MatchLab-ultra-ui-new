import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  reconcilePublicSystemHealth,
  validatePublicSystemHealthAlertArtifact
} from "./public-mirror-policy.js";

const dayKey = "2026-08-25";

function dynamicErrorReport() {
  return {
    ok: false,
    severity: "error",
    status: "error",
    issueCounts: {
      error: 5,
      warning: 1,
      info: 6
    },
    issues: [
      {
        severity: "error",
        source: "manifest",
        type: "value_stale_against_canonical"
      }
    ]
  };
}

test(
  "same-day authoritative alerts retain warnings but cannot mask runtime errors",
  () => {
    const alertArtifact = {
      schema:
        "ai-matchlab.system-health-alerts.v1",
      dayKey,
      generatedAt:
        "2026-08-25T05:42:38.110Z",
      severity: "warning",
      issueCounts: {
        error: 0,
        warning: 99,
        info: 99
      },
      activeIssues: [
        {
          severity: "warning",
          source: "build-report",
          type: "acquisition_skipped_slugs"
        },
        {
          severity: "info",
          source: "value-comparison",
          type: "plan_a_unresolved_settlement"
        }
      ]
    };

    const report =
      reconcilePublicSystemHealth({
        dayKey,
        dynamicReport:
          dynamicErrorReport(),
        alertArtifact
      });

    assert.equal(
      report.classificationSource,
      "system-health-alerts+dynamic-runtime"
    );

    assert.equal(
      report.authoritativeAlertArtifactUsed,
      true
    );

    assert.equal(
      report.severity,
      "error"
    );

    assert.deepEqual(
      report.issueCounts,
      {
        error: 1,
        warning: 1,
        info: 1
      }
    );

    assert.equal(
      report.issues.length,
      3
    );

    assert.equal(report.ok, false);

    assert.equal(
      report.diagnosticRuntime.severity,
      "error"
    );
  }
);

test(
  "authoritative alert severity is derived from active issues rather than trusting summary counters",
  () => {
    const result =
      validatePublicSystemHealthAlertArtifact(
        {
          schema:
            "ai-matchlab.system-health-alerts.v1",
          dayKey,
          severity: "error",
          issueCounts: {
            error: 10,
            warning: 0,
            info: 0
          },
          activeIssues: [
            {
              severity: "warning",
              source: "test",
              type: "real_warning"
            }
          ]
        },
        dayKey
      );

    assert.equal(result.ok, true);
    assert.equal(result.severity, "warning");
    assert.deepEqual(
      result.issueCounts,
      {
        error: 0,
        warning: 1,
        info: 0
      }
    );
  }
);

test(
  "real authoritative error remains error",
  () => {
    const report =
      reconcilePublicSystemHealth({
        dayKey,
        dynamicReport: {
          ok: true,
          severity: "ok",
          status: "ok",
          issueCounts: {
            error: 0,
            warning: 0,
            info: 0
          },
          issues: []
        },
        alertArtifact: {
          schema:
            "ai-matchlab.system-health-alerts.v1",
          dayKey,
          activeIssues: [
            {
              severity: "error",
              source: "invariant-report",
              type: "value_unsafe"
            }
          ]
        }
      });

    assert.equal(report.ok, false);
    assert.equal(report.severity, "error");
    assert.equal(
      report.issueCounts.error,
      1
    );
  }
);

test(
  "wrong-day authoritative artifact fails closed to dynamic runtime report",
  () => {
    const dynamic =
      dynamicErrorReport();

    const report =
      reconcilePublicSystemHealth({
        dayKey,
        dynamicReport: dynamic,
        alertArtifact: {
          schema:
            "ai-matchlab.system-health-alerts.v1",
          dayKey: "2026-08-24",
          activeIssues: []
        }
      });

    assert.equal(
      report.classificationSource,
      "dynamic-runtime"
    );

    assert.equal(
      report.authoritativeAlertArtifactUsed,
      false
    );

    assert.equal(
      report.authoritativeAlertArtifactReason,
      "artifact_day_mismatch"
    );

    assert.equal(
      report.severity,
      "error"
    );

    assert.equal(
      report.issueCounts.error,
      2
    );

    assert.equal(
      report.issues.length,
      2
    );

    assert.equal(
      report.ok,
      false
    );

    assert.equal(
      report.issues.filter(issue =>
        issue.type === "value_stale_against_canonical"
      ).length,
      1
    );

    assert.equal(
      report.issues.filter(issue =>
        issue.type === "system_health_authoritative_alert_untrusted" &&
        issue.details?.reason === "artifact_day_mismatch"
      ).length,
      1
    );
  }
);

test(
  "index binds system health reconciliation to synchronized same-day alert artifact",
  () => {
    const source =
      fs.readFileSync(
        new URL("../index.js", import.meta.url),
        "utf8"
      );

    assert.match(
      source,
      /reconcilePublicSystemHealth/
    );

    assert.match(
      source,
      /preferRuntimeReleaseArtifact\(\s*day,\s*"system-health-alerts\.json",\s*resolveDataPath\("system-health", day \+ "\.json"\)\s*\)/s
    );

    assert.match(
      source,
      /return reconcilePublicSystemHealth\(\{\s*dayKey: day,\s*dynamicReport,\s*alertArtifact,\s*manifestGeneratedAt: manifest\?\.generatedAt \|\| null\s*\}\);/s
    );
  }
);
test("runtime error already in authoritative alerts is not counted twice", () => {
  const issue = { severity: "error", source: "manifest", type: "value_stale_against_canonical" };
  const report = reconcilePublicSystemHealth({
    dayKey,
    dynamicReport: { ok: false, severity: "error", issues: [issue] },
    alertArtifact: {
      schema: "ai-matchlab.system-health-alerts.v1", dayKey, activeIssues: [issue]
    }
  });
  assert.equal(report.severity, "error");
  assert.equal(report.issueCounts.error, 1);
  assert.equal(report.issues.length, 1);
});

test("runtime error missing an issue fails closed with explicit diagnostic", () => {
  const report = reconcilePublicSystemHealth({
    dayKey,
    dynamicReport: { ok: false, severity: "error", issues: [] },
    alertArtifact: {
      schema: "ai-matchlab.system-health-alerts.v1", dayKey,
      activeIssues: [{ severity: "warning", source: "build-report", type: "known_warning" }]
    }
  });
  assert.equal(report.ok, false);
  assert.equal(report.severity, "error");
  assert.equal(report.issueCounts.error, 1);
  assert.equal(report.issues.some(row => row.type === "runtime_error_without_issue"), true);
  assert.equal(report.authoritativeAlertArtifactUsed, true);
});

test("invalid authoritative alert fails closed even if dynamic diagnostics are OK", () => {
  const report = reconcilePublicSystemHealth({
    dayKey, manifestGeneratedAt: "2026-08-25T14:00:00Z",
    dynamicReport: { ok: true, severity: "ok", status: "ok", issues: [] },
    alertArtifact: { schema: "ai-matchlab.system-health-alerts.v1", dayKey:"2026-08-24", activeIssues:[] }
  });
  assert.equal(report.ok, false);
  assert.equal(report.severity, "error");
  assert.equal(report.issues.some(x => x.type === "system_health_authoritative_alert_untrusted"), true);
});

test("stale same-day alert becomes an actionable primary error", () => {
  const report = reconcilePublicSystemHealth({
    dayKey, manifestGeneratedAt: "2026-08-25T14:00:00Z",
    dynamicReport: { ok: true, severity: "ok", issues: [] },
    alertArtifact: { schema: "ai-matchlab.system-health-alerts.v1", dayKey,
      generatedAt: "2026-08-25T00:00:00Z", activeIssues: [] }
  });
  assert.equal(report.severity, "error");
  assert.equal(report.ok, false);
  assert.equal(report.issues.some(x => x.type === "system_health_alert_stale_against_snapshot"), true);
});

test("missing alert timestamp cannot certify fresh public health", () => {
  const report = reconcilePublicSystemHealth({
    dayKey, manifestGeneratedAt: "2026-08-25T14:00:00Z",
    dynamicReport: { ok: true, severity: "ok", issues: [] },
    alertArtifact: { schema: "ai-matchlab.system-health-alerts.v1", dayKey, activeIssues: [] }
  });
  assert.equal(report.severity, "error");
  assert.equal(report.issues.some(x => x.type === "system_health_alert_freshness_unverifiable"), true);
});

test("fresh same-day alerts preserve valid authoritative classification", () => {
  const report = reconcilePublicSystemHealth({
    dayKey, manifestGeneratedAt: "2026-08-25T14:00:00Z",
    dynamicReport: { ok: true, severity: "ok", issues: [] },
    alertArtifact: { schema: "ai-matchlab.system-health-alerts.v1", dayKey,
      generatedAt: "2026-08-25T13:59:00Z", activeIssues: [{severity:"warning",source:"x",type:"real"}] }
  });
  assert.equal(report.severity, "warning");
  assert.equal(report.issueCounts.error, 0);
});
