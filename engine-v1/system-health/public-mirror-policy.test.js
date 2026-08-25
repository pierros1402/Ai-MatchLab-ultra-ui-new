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
  "same-day authoritative alert artifact overrides dynamic split-brain classification",
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
      "system-health-alerts"
    );

    assert.equal(
      report.authoritativeAlertArtifactUsed,
      true
    );

    assert.equal(
      report.severity,
      "warning"
    );

    assert.deepEqual(
      report.issueCounts,
      {
        error: 0,
        warning: 1,
        info: 1
      }
    );

    assert.equal(
      report.issues.length,
      2
    );

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
      5
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
      /return reconcilePublicSystemHealth\(\{\s*dayKey: day,\s*dynamicReport,\s*alertArtifact\s*\}\);/s
    );
  }
);