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
import {
  PLAN_A_OBSERVATION_SCHEMA,
  planAObservationSignature
} from "../value/plan-a-observation.js";

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

function buildPlanAObservation(dayKey) {
  const observation = {
    ok: true,
    schema:
      PLAN_A_OBSERVATION_SCHEMA,
    date:
      dayKey,
    immutable:
      true,
    count:
      0,
    picks:
      [],
    source:
      "canonical_fixtures",
    outputMode:
      "plan-a-observation"
  };

  observation.observationSignature =
    planAObservationSignature(
      dayKey,
      observation
    );

  return observation;
}

function buildDirectPlan(
  dayKey,
  planId,
  outputMode = ""
) {
  return {
    ok: true,
    date: dayKey,
    planId,
    count: 0,
    picks: [],
    source:
      "test",
    ...(outputMode
      ? { outputMode }
      : {})
  };
}

function buildComparison(dayKey) {
  const plan =
    (id, outputMode = "") => ({
      id,
      count: 0,
      picks: [],
      summary: {
        picks: 0
      },
      ...(outputMode
        ? { outputMode }
        : {})
    });

  return {
    ok: true,
    date: dayKey,
    plans: {
      A:
        plan(
          "plan-a",
          "plan-a-observation"
        ),
      A2:
        plan("plan-a2"),
      B:
        plan(
          "plan-b",
          "plan-b-observation"
        ),
      B2:
        plan(
          "plan-b2",
          "plan-b2-observation"
        )
    }
  };
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
  coverage: {
    detailsWithValue: 0
  },
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
    resolve("value", `${dayKey}.json`),
    {
      date: dayKey,
      source: "canonical_fixtures",
      count: 0,
      picks: []
    }
  );

  const planA =
    buildPlanAObservation(
      dayKey
    );

  writeJson(
    resolve(
      "value-plans",
      dayKey,
      "plan-a.json"
    ),
    planA
  );

  writeJson(
    resolve(
      "value-plans",
      dayKey,
      "plan-a2.json"
    ),
    buildDirectPlan(
      dayKey,
      "plan-a2"
    )
  );

  writeJson(
    resolve(
      "value-plans",
      dayKey,
      "plan-b.json"
    ),
    buildDirectPlan(
      dayKey,
      "plan-b",
      "plan-b-observation"
    )
  );

  writeJson(
    resolve(
      "value-plans",
      dayKey,
      "plan-b2.json"
    ),
    buildDirectPlan(
      dayKey,
      "plan-b2",
      "plan-b2-observation"
    )
  );

  writeJson(
    resolve(
      "value-comparison",
      dayKey + ".json"
    ),
    buildComparison(
      dayKey
    )
  );


  writeJson(
    path.join(snapshotRoot, "value.json"),
    {
      ...planA,
      publicationAuthority:
        "frozen_plan_a_observation"
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

test(
  "details semantic preflight self-heals before invariant and value gates",
  () => {
    const preflight = workflow.indexOf(
      "- name: Details foundation semantic preflight (self-heal, pre-publish)"
    );
    const invariant = workflow.indexOf("- name: Invariant gate (pre-publish)");
    const value = workflow.indexOf("- name: Value artifact gate (pre-publish)");
    const foundation = workflow.indexOf("- name: Foundation integrity gate (pre-publish)");

    assert.ok(preflight >= 0, "details semantic preflight missing");
    assert.ok(invariant > preflight, "invariant must follow semantic preflight");
    assert.ok(value > invariant, "value gate must follow invariant");
    assert.ok(foundation > value, "foundation gate must follow value");

    const block = workflow.slice(preflight, invariant);

    assert.ok(block.includes(
      'build-foundation-integrity-report.js --date="$DAY_KEY"'
    ));
    assert.ok(block.includes(
      'build-details-day.js "$DAY_KEY" --rebuild'
    ));
    assert.ok(block.includes(
      'export-deploy-snapshot-day.js "$DAY_KEY"'
    ));
    assert.ok(block.includes(
      'refresh-value-artifacts-day.js --date="$DAY_KEY"'
    ));
    assert.ok(block.includes(
      'verify-artifact-freshness-day.js --date="$DAY_KEY" --gate'
    ));
    assert.ok(block.includes("r.modelReady===true"));
    assert.ok(block.includes(
      "refusing late foundation mutation"
    ));
  }
);

test(
  "failed foundation diagnostics are uploaded before build report",
  () => {
    const foundation = workflow.indexOf(
      "- name: Foundation integrity gate (pre-publish)"
    );
    const upload = workflow.indexOf(
      "- name: Preserve foundation integrity diagnostics"
    );
    const build = workflow.indexOf("- name: Build day report");

    assert.ok(foundation >= 0, "foundation gate missing");
    assert.ok(upload > foundation, "diagnostic upload must follow foundation gate");
    assert.ok(build > upload, "build report must follow diagnostic upload");

    const block = workflow.slice(upload, build);

    assert.ok(block.includes(
      "if: failure() && env.SKIP_BUILD != 'true'"
    ));
    assert.ok(block.includes("uses: actions/upload-artifact@v4"));
    assert.ok(block.includes(
      "data/foundation-integrity/${{ env.DAY_KEY }}.json"
    ));
  }
);

test(
  "daily Plan C remains shadow-only while generation precedes settlement and export",
  () => {
    const generate = workflow.indexOf("generate-plan-c-shadow-predictions.js");
    const refresh = workflow.indexOf("refresh-clubelo-shadow-registry.js");
    const settle = workflow.indexOf("settle-plan-c-shadow.js");
    const build = workflow.indexOf("build-plan-c-shadow-day.js");
    const snapshotExport = workflow.indexOf("export-deploy-snapshot-day.js");

    assert.ok(refresh > 0, "ClubElo shadow refresh missing");
    assert.ok(refresh < generate, "ClubElo refresh must precede prediction freeze");
    assert.ok(generate > 0, "Plan C generator missing");
    assert.ok(generate < settle, "Plan C settlement must follow generation");
    assert.ok(settle < build, "Plan C daily build must follow settlement");
    assert.ok(build < snapshotExport, "snapshot export must follow Plan C build");
    assert.match(workflow, /--max-snapshot-age-days 30/);
    assert.match(workflow, /PREDICTION_CREATED_AT=.*new Date\(\)\.toISOString\(\)/);
    assert.doesNotMatch(workflow, /PREDICTION_CREATED_AT=.*date -u/);
    assert.match(workflow, /data\/plan-c-shadow\/settlement\/latest\.json/);
    assert.match(workflow, /stale Elo adds no new/);
    assert.match(workflow, /continue-on-error: true[\s\S]*refresh-clubelo-shadow-registry\.js/);
  }
);
