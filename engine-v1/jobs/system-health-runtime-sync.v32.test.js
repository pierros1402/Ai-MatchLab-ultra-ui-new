import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  stageRuntimeReleaseArtifacts
} from "./sync-deploy-snapshot-from-github.js";

const DAY = "2026-11-11";
const encode = value => Buffer.from(JSON.stringify(value));

function fixtures() {
  return {
    "value-comparison": encode({
      ok: true,
      date: DAY,
      plans: { A: {}, A2: {}, B: {}, B2: {} }
    }),
    "build-reports": encode({ dayKey: DAY }),
    "system-health": encode({
      schema: "ai-matchlab.system-health-alerts.v1",
      dayKey: DAY,
      generatedAt: "2026-11-11T14:00:00Z",
      activeIssues: []
    }),
    "coverage-readiness": encode({
      dayKey: DAY,
      activeCompetitionCompleteness: {
        schema: "ai-matchlab.active-competition-completeness.v1",
        proven: false
      }
    }),
    "foundation-integrity": encode({
      dayKey: DAY,
      modelReady: false,
      publicationReady: false
    })
  };
}

async function runStage({ missing = null, required = true } = {}) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "aiml-v32-gate-")
  );

  const values = fixtures();

  try {
    return await stageRuntimeReleaseArtifacts({
      repo: "isolated-test",
      ref: "399b121d7e6c8c53455ea3afaa67a2a288cda5ad",
      day: DAY,
      stageDayDir: root,
      stats: {
        filesDownloaded: 0,
        bytesDownloaded: 0
      },
      requireDiagnostics: required,
      fetchArtifact: async url => {
        const match = url.match(
          /data\/([^/]+)\/2026-11-11\.json$/
        );

        if (!match) throw Error("unexpected_test_url");

        if (match[1] === missing) return null;

        if (!(match[1] in values)) {
          throw Error("unknown_test_fixture");
        }

        return values[match[1]];
      }
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("V32 complete required diagnostics accepted", async () => {
  const result = await runStage();
  assert.equal(result.buildReportPresent, true);
  assert.equal(result.systemHealthPresent, true);
  assert.equal(result.coverageReadinessPresent, true);
  assert.equal(result.foundationIntegrityPresent, true);
});

test("V32 missing build report rejected", async () => {
  await assert.rejects(
    runStage({ missing: "build-reports" }),
    /runtime_build_report_required_for_current_release/
  );
});

test("V32 missing authoritative alert rejected", async () => {
  await assert.rejects(
    runStage({ missing: "system-health" }),
    /runtime_authoritative_alert_required_for_current_release/
  );
});

test("V32 missing coverage rejected", async () => {
  await assert.rejects(
    runStage({ missing: "coverage-readiness" }),
    /runtime_coverage_required_for_current_release/
  );
});

test("V32 missing foundation rejected", async () => {
  await assert.rejects(
    runStage({ missing: "foundation-integrity" }),
    /runtime_foundation_required_for_current_release/
  );
});

test("V32 historical missing build remains optional", async () => {
  const result = await runStage({
    missing: "build-reports",
    required: false
  });
  assert.equal(result.buildReportPresent, false);
});

test("V32 historical missing alert remains optional", async () => {
  const result = await runStage({
    missing: "system-health",
    required: false
  });
  assert.equal(result.systemHealthPresent, false);
});
