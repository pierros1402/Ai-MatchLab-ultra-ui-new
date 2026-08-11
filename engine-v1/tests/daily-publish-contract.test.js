import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  verifyDailyPublishContract
} from "../jobs/verify-daily-publish-contract.js";
import {
  computeDeploySnapshotManifestHash
} from "../core/deploy-snapshot-release-contract.js";

const workflow = fs.readFileSync(
  new URL(
    "../../.github/workflows/daily-deploy-snapshot.yml",
    import.meta.url
  ),
  "utf8"
).replace(/\\r\\n/g, "\\n");

const cycle = fs.readFileSync(
  new URL("../jobs/run-daily-cycle.js", import.meta.url),
  "utf8"
).replace(/\\r\\n/g, "\\n");

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(payload, null, 2) + "\n",
    "utf8"
  );
}

function createContractFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-daily-publish-contract-")
  );

  const dayKey = "2099-08-17";
  const generatedAt = "2099-08-16T20:55:00.000Z";

  const resolve = (...parts) => path.join(root, ...parts);
  const snapshotRoot = resolve("deploy-snapshots", dayKey);

  writeJson(
    path.join(snapshotRoot, "fixtures.json"),
    {
      date: dayKey,
      fixtures: []
    }
  );

const manifest = {
  ok: true,
  date: dayKey,
  generatedAt,
  counts: { fixtures: 0, valuePicks: 0, details: 0 },
  details: [],
  valueGate: {
    fixtures: 0,
    valuePicks: 0,
    valueSource: "canonical_fixtures",
    valueFreshAgainstCanonical: true,
    ok: true
  }
};
manifest.hash = computeDeploySnapshotManifestHash(manifest);
writeJson(path.join(snapshotRoot, "manifest.json"), manifest);

  writeJson(
    path.join(snapshotRoot, "invariant-report.json"),
    {
      ok: true,
      valueSafe: true,
      manifestGeneratedAt: generatedAt
    }
  );

  writeJson(
    path.join(snapshotRoot, "value.json"),
    {
      source: "canonical_fixtures",
      count: 0,
      picks: []
    }
  );

  writeJson(
    path.join(snapshotRoot, "freshness-report.json"),
    {
      ok: true,
      dayKey
    }
  );

  writeJson(
    path.join(snapshotRoot, "value-audit.json"),
    {
      ok: true,
      dayKey
    }
  );

  writeJson(
    resolve("build-reports", `${dayKey}.json`),
    {
      ok: true,
      dayKey,
      clean: true,
      cleanStrict: true,
      hardFailures: [],
      warnings: []
    }
  );

  writeJson(
    resolve("foundation-integrity", `${dayKey}.json`),
    {
      schema: "ai-matchlab.foundation-integrity.v1",
      dayKey,
      modelReady: true,
      publicationReady: true,
      blocked: [],
      warnings: []
    }
  );

  writeJson(
    resolve("system-health", `${dayKey}.json`),
    {
      schema: "ai-matchlab.system-health-alerts.v1",
      dayKey,
      severity: "info",
      issueCounts: {
        error: 0,
        warning: 0,
        info: 1
      }
    }
  );

  writeJson(
    resolve("deploy-snapshots", "latest.json"),
    {
      date: dayKey,
      hash: manifest.hash
    }
  );

  return {
    root,
    dayKey,
    resolve,
    snapshotRoot,
    cleanup() {
      fs.rmSync(root, {
        recursive: true,
        force: true
      });
    }
  };
}

function blockedCodes(report) {
  return report.blocked.map(row => row.code);
}

test(
  "daily publish runs the complete contract gate before staging",
  () => {
    const gate = workflow.indexOf(
      'verify-daily-publish-contract.js --date="$DAY_KEY" --gate'
    );

    const stage = workflow.indexOf(
      "- name: Stage allowed snapshot files only"
    );

    assert.ok(gate >= 0, "publish contract gate missing");
    assert.ok(
      stage > gate,
      "publish contract must run before staging"
    );
  }
);

test(
  "previous-day truth rebuilds details before snapshot export and settlement",
  () => {
    const truth = cycle.indexOf(
      "applyResultsTruthToCanonicalDay(finalizeDayKey)"
    );

    const rebuild = cycle.indexOf(
      "buildDetailsDay(finalizeDayKey, {"
    );

    const snapshot = cycle.indexOf(
      "exportDeploySnapshotDay(finalizeDayKey, {"
    );

    const settlement = cycle.indexOf(
      'resettleValueDay(finalizeDayKey, "finalize", -1)'
    );

    assert.ok(truth >= 0);
    assert.ok(rebuild > truth);
    assert.ok(snapshot > rebuild);
    assert.ok(settlement > snapshot);

    assert.match(
      cycle,
      /buildDetailsDay\(finalizeDayKey, \{\s*rebuild: true/u
    );
  }
);

test(
  "complete clean daily publish contract passes",
  () => {
    const fixture = createContractFixture();

    try {
      const report = verifyDailyPublishContract(
        fixture.dayKey,
        {
          resolveDataPath: fixture.resolve
        }
      );

      assert.equal(report.ok, true);
      assert.deepEqual(report.blocked, []);
    } finally {
      fixture.cleanup();
    }
  }
);

test(
  "build report ok true but clean false is rejected",
  () => {
    const fixture = createContractFixture();

    try {
      writeJson(
        fixture.resolve(
          "build-reports",
          `${fixture.dayKey}.json`
        ),
        {
          ok: true,
          dayKey: fixture.dayKey,
          clean: false,
          cleanStrict: false,
          hardFailures: [
            "fixture_universe_incomplete"
          ],
          warnings: []
        }
      );

      const report = verifyDailyPublishContract(
        fixture.dayKey,
        {
          resolveDataPath: fixture.resolve
        }
      );

      assert.equal(report.ok, false);
      assert.ok(
        blockedCodes(report).includes(
          "build_report_not_clean"
        )
      );
      assert.ok(
        blockedCodes(report).includes(
          "build_report_has_hard_failures"
        )
      );
    } finally {
      fixture.cleanup();
    }
  }
);

test(
  "missing system health artifact is rejected",
  () => {
    const fixture = createContractFixture();

    try {
      fs.rmSync(
        fixture.resolve(
          "system-health",
          `${fixture.dayKey}.json`
        )
      );

      const report = verifyDailyPublishContract(
        fixture.dayKey,
        {
          resolveDataPath: fixture.resolve
        }
      );

      assert.equal(report.ok, false);

      assert.ok(
        report.blocked.some(
          row =>
            row.code === "required_artifact_missing" &&
            row.artifact === "systemHealth"
        )
      );
    } finally {
      fixture.cleanup();
    }
  }
);

test(
  "wrong-day system health artifact is rejected",
  () => {
    const fixture = createContractFixture();

    try {
      writeJson(
        fixture.resolve(
          "system-health",
          `${fixture.dayKey}.json`
        ),
        {
          dayKey: "2099-08-16",
          severity: "info",
          issueCounts: {
            error: 0,
            warning: 0,
            info: 0
          }
        }
      );

      const report = verifyDailyPublishContract(
        fixture.dayKey,
        {
          resolveDataPath: fixture.resolve
        }
      );

      assert.equal(report.ok, false);
      assert.ok(
        blockedCodes(report).includes(
          "system_health_day_mismatch"
        )
      );
    } finally {
      fixture.cleanup();
    }
  }
);

test(
  "system health error count blocks publication",
  () => {
    const fixture = createContractFixture();

    try {
      writeJson(
        fixture.resolve(
          "system-health",
          `${fixture.dayKey}.json`
        ),
        {
          dayKey: fixture.dayKey,
          severity: "error",
          issueCounts: {
            error: 2,
            warning: 0,
            info: 0
          }
        }
      );

      const report = verifyDailyPublishContract(
        fixture.dayKey,
        {
          resolveDataPath: fixture.resolve
        }
      );

      assert.equal(report.ok, false);
      assert.ok(
        blockedCodes(report).includes(
          "system_health_has_errors"
        )
      );
      assert.ok(
        blockedCodes(report).includes(
          "system_health_severity_error"
        )
      );
    } finally {
      fixture.cleanup();
    }
  }
);

test(
  "malformed build report hardFailures is rejected",
  () => {
    const fixture = createContractFixture();

    try {
      writeJson(
        fixture.resolve(
          "build-reports",
          `${fixture.dayKey}.json`
        ),
        {
          ok: true,
          dayKey: fixture.dayKey,
          clean: true,
          cleanStrict: true,
          hardFailures: null,
          warnings: []
        }
      );

      const report = verifyDailyPublishContract(
        fixture.dayKey,
        {
          resolveDataPath: fixture.resolve
        }
      );

      assert.equal(report.ok, false);
      assert.ok(
        blockedCodes(report).includes(
          "build_report_hard_failures_invalid"
        )
      );
    } finally {
      fixture.cleanup();
    }
  }
);


test(
  "missing foundation integrity artifact is rejected",
  () => {
    const fixture = createContractFixture();
    try {
      fs.rmSync(fixture.resolve("foundation-integrity", `${fixture.dayKey}.json`));
      const report = verifyDailyPublishContract(fixture.dayKey, { resolveDataPath: fixture.resolve });
      assert.equal(report.ok, false);
      assert.ok(report.blocked.some(row => row.code === "required_artifact_missing" && row.artifact === "foundationIntegrity"));
    } finally {
      fixture.cleanup();
    }
  }
);

test(
  "foundation not publication-ready is rejected",
  () => {
    const fixture = createContractFixture();
    try {
      writeJson(fixture.resolve("foundation-integrity", `${fixture.dayKey}.json`), {
        schema: "ai-matchlab.foundation-integrity.v1",
        dayKey: fixture.dayKey,
        modelReady: true,
        publicationReady: false,
        blocked: [{ component: "details", reason: "details_foundation_not_ready" }],
        warnings: []
      });
      const report = verifyDailyPublishContract(fixture.dayKey, { resolveDataPath: fixture.resolve });
      assert.equal(report.ok, false);
      assert.ok(blockedCodes(report).includes("foundation_publication_not_ready"));
    } finally {
      fixture.cleanup();
    }
  }
);

test(
  "foundation gate runs before build report and final publish contract",
  () => {
    const foundation = workflow.indexOf('build-foundation-integrity-report.js --date="$DAY_KEY" --gate');
    const build = workflow.indexOf("- name: Build day report");
    const publish = workflow.indexOf('verify-daily-publish-contract.js --date="$DAY_KEY" --gate');
    assert.ok(foundation >= 0, "foundation gate missing");
    assert.ok(build > foundation, "build report must follow foundation gate");
    assert.ok(publish > build, "final publish contract must follow build report");
  }
);
