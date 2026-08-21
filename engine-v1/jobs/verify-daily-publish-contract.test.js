import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { computeDeploySnapshotManifestHash } from "../core/deploy-snapshot-release-contract.js";
import {
  PLAN_A_OBSERVATION_SCHEMA,
  planAObservationSignature
} from "../value/plan-a-observation.js";
import { verifyDailyPublishContract } from "./verify-daily-publish-contract.js";

const DAY = "2026-08-11";

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );
}

function buildManifest(valueGate) {
  const manifest = {
    ok: true,
    version: "deploy-snapshot-v2",
    date: DAY,
    generatedAt: "2026-08-11T05:00:00.000Z",
    counts: { fixtures: 0, valuePicks: 0, details: 0 },
    fixturesSource: "canonical",
    staticMinTargetFixtures: 0,
    minTargetFixtures: 0,
    minTargetFixtureSource: "test",
    canonicalCoverageFixtureCount: 0,
    coverage: { ok: true, detailsWithValue: 0 },
    sizes: {},
    fileHashes: {
      "fixtures.json": "a".repeat(64),
      "value.json": "b".repeat(64)
    },
    details: [],
    valueGate
  };
  manifest.hash = computeDeploySnapshotManifestHash(manifest);
  return manifest;
}

function buildPlanAObservation() {
  const observation = {
    ok: true,
    schema:
      PLAN_A_OBSERVATION_SCHEMA,
    date:
      DAY,
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
      DAY,
      observation
    );

  return observation;
}

function buildDirectPlan({
  planId,
  outputMode
}) {
  return {
    ok: true,
    date: DAY,
    planId,
    count: 0,
    picks: [],
    source: "test",
    ...(outputMode
      ? { outputMode }
      : {})
  };
}

function buildComparison() {
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
    date: DAY,
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

function withPublishTree(valueGate, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-publish-contract-"));
  const dataPath = (...parts) => path.join(root, ...parts);
  const snapshot = dataPath("deploy-snapshots", DAY);
  const manifest = buildManifest(valueGate);

  writeJson(path.join(snapshot, "fixtures.json"), { date: DAY, fixtures: [] });
  writeJson(path.join(snapshot, "manifest.json"), manifest);
  writeJson(path.join(snapshot, "invariant-report.json"), {
    ok: true,
    valueSafe: true,
    manifestGeneratedAt: manifest.generatedAt
  });
  writeJson(dataPath("value", `${DAY}.json`), {
    date: DAY,
    count: 0,
    picks: [],
    source: "local_value_file"
  });

  const planA =
    buildPlanAObservation();

  writeJson(
    dataPath(
      "value-plans",
      DAY,
      "plan-a.json"
    ),
    planA
  );

  writeJson(
    dataPath(
      "value-plans",
      DAY,
      "plan-a2.json"
    ),
    buildDirectPlan({
      planId: "plan-a2"
    })
  );

  writeJson(
    dataPath(
      "value-plans",
      DAY,
      "plan-b.json"
    ),
    buildDirectPlan({
      planId: "plan-b",
      outputMode:
        "plan-b-observation"
    })
  );

  writeJson(
    dataPath(
      "value-plans",
      DAY,
      "plan-b2.json"
    ),
    buildDirectPlan({
      planId: "plan-b2",
      outputMode:
        "plan-b2-observation"
    })
  );

  writeJson(
    dataPath(
      "value-comparison",
      DAY + ".json"
    ),
    buildComparison()
  );

  writeJson(path.join(snapshot, "value.json"), {
    ...planA,
    publicationAuthority:
      "frozen_plan_a_observation"
  });
  writeJson(path.join(snapshot, "freshness-report.json"), { ok: true });
  writeJson(path.join(snapshot, "value-audit.json"), { ok: true });
  writeJson(dataPath("build-reports", `${DAY}.json`), {
    ok: true,
    clean: true,
    hardFailures: []
  });
  writeJson(dataPath("foundation-integrity", `${DAY}.json`), {
    dayKey: DAY,
    modelReady: true,
    publicationReady: true
  });
  writeJson(dataPath("system-health", `${DAY}.json`), {
    dayKey: DAY,
    severity: "ok",
    issueCounts: { error: 0 }
  });
  writeJson(dataPath("deploy-snapshots", "latest.json"), {
    date: DAY,
    hash: manifest.hash
  });

  try {
    return fn({ dataPath, manifest });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("daily publish contract accepts a release-valid green Value gate", () => {
  withPublishTree(
    {
      fixtures: 0,
      valuePicks: 0,
      valueFreshAgainstCanonical: true,
      ok: true
    },
    ({ dataPath }) => {
      const report = verifyDailyPublishContract(DAY, { resolveDataPath: dataPath });
      assert.equal(report.ok, true, JSON.stringify(report.blocked));
      assert.deepEqual(report.blocked, []);
    }
  );
});

test("daily publish contract blocks top-level ok manifest with red Value gate", () => {
  withPublishTree(
    {
      fixtures: 80,
      valuePicks: 5,
      valueFreshAgainstCanonical: false,
      ok: false
    },
    ({ dataPath }) => {
      const report = verifyDailyPublishContract(DAY, { resolveDataPath: dataPath });
      assert.equal(report.ok, false);
      const blocked = report.blocked.find(row => row.code === "manifest_release_contract_failed");
      assert.ok(blocked);
      assert.ok(blocked.errors.includes("manifest_value_gate_not_ok"));
    }
  );
});

test(
  "prepublish contract omits only the latest.json requirement",
  () => {
    withPublishTree(
      {
        fixtures: 0,
        valuePicks: 0,
        valueFreshAgainstCanonical: true,
        ok: true
      },
      ({ dataPath }) => {
        fs.rmSync(
          dataPath(
            "deploy-snapshots",
            "latest.json"
          )
        );

        const prepublish =
          verifyDailyPublishContract(
            DAY,
            {
              resolveDataPath:
                dataPath,
              requireLatest:
                false
            }
          );

        assert.equal(
          prepublish.ok,
          true,
          JSON.stringify(
            prepublish.blocked
          )
        );

        assert.equal(
          prepublish.mode,
          "prepublish"
        );

        assert.equal(
          prepublish.latestRequired,
          false
        );

        const final =
          verifyDailyPublishContract(
            DAY,
            {
              resolveDataPath:
                dataPath
            }
          );

        assert.equal(
          final.ok,
          false
        );

        assert.ok(
          final.blocked.some(
            row =>
              row.code ===
              "latest_missing"
          )
        );
      }
    );
  }
);

test(
  "daily publish contract blocks a missing direct Plan B artifact",
  () => {
    withPublishTree(
      {
        fixtures: 0,
        valuePicks: 0,
        valueFreshAgainstCanonical: true,
        ok: true
      },
      ({ dataPath }) => {
        fs.rmSync(
          dataPath(
            "value-plans",
            DAY,
            "plan-b.json"
          )
        );

        const report =
          verifyDailyPublishContract(
            DAY,
            {
              resolveDataPath:
                dataPath
            }
          );

        assert.equal(report.ok, false);

        assert.ok(
          report.blocked.some(
            row =>
              row.code ===
                "required_artifact_missing" &&
              row.artifact ===
                "planB"
          )
        );
      }
    );
  }
);

test(
  "daily publish contract blocks a direct plan bound to the wrong day",
  () => {
    withPublishTree(
      {
        fixtures: 0,
        valuePicks: 0,
        valueFreshAgainstCanonical: true,
        ok: true
      },
      ({ dataPath }) => {
        const file =
          dataPath(
            "value-plans",
            DAY,
            "plan-a2.json"
          );

        const payload =
          readJson(file);

        payload.date =
          "2099-01-01";

        writeJson(file, payload);

        const report =
          verifyDailyPublishContract(
            DAY,
            {
              resolveDataPath:
                dataPath
            }
          );

        const blocked =
          report.blocked.find(
            row =>
              row.code ===
                "value_plan_release_contract_failed" &&
              row.plan === "A2"
          );

        assert.equal(report.ok, false);
        assert.ok(blocked);
        assert.ok(
          blocked.errors.includes(
            "day_mismatch"
          )
        );
      }
    );
  }
);

test(
  "daily publish contract blocks direct plan count and picks mismatch",
  () => {
    withPublishTree(
      {
        fixtures: 0,
        valuePicks: 0,
        valueFreshAgainstCanonical: true,
        ok: true
      },
      ({ dataPath }) => {
        const file =
          dataPath(
            "value-plans",
            DAY,
            "plan-b.json"
          );

        const payload =
          readJson(file);

        payload.count = 1;

        writeJson(file, payload);

        const report =
          verifyDailyPublishContract(
            DAY,
            {
              resolveDataPath:
                dataPath
            }
          );

        const blocked =
          report.blocked.find(
            row =>
              row.code ===
                "value_plan_release_contract_failed" &&
              row.plan === "B"
          );

        assert.equal(report.ok, false);
        assert.ok(blocked);
        assert.ok(
          blocked.errors.includes(
            "count_picks_mismatch"
          )
        );
      }
    );
  }
);

test(
  "daily publish contract blocks comparison missing Plan B2",
  () => {
    withPublishTree(
      {
        fixtures: 0,
        valuePicks: 0,
        valueFreshAgainstCanonical: true,
        ok: true
      },
      ({ dataPath }) => {
        const file =
          dataPath(
            "value-comparison",
            DAY + ".json"
          );

        const payload =
          readJson(file);

        delete payload.plans.B2;

        writeJson(file, payload);

        const report =
          verifyDailyPublishContract(
            DAY,
            {
              resolveDataPath:
                dataPath
            }
          );

        const blocked =
          report.blocked.find(
            row =>
              row.code ===
                "value_comparison_release_contract_failed"
          );

        assert.equal(report.ok, false);
        assert.ok(blocked);
        assert.ok(
          blocked.errors.includes(
            "comparison_plan_missing:B2"
          )
        );
      }
    );
  }
);

test(
  "daily publish contract blocks comparison and direct count mismatch",
  () => {
    withPublishTree(
      {
        fixtures: 0,
        valuePicks: 0,
        valueFreshAgainstCanonical: true,
        ok: true
      },
      ({ dataPath }) => {
        const file =
          dataPath(
            "value-comparison",
            DAY + ".json"
          );

        const payload =
          readJson(file);

        payload.plans.A.summary.picks = 1;
        payload.plans.A.count = 1;

        writeJson(file, payload);

        const report =
          verifyDailyPublishContract(
            DAY,
            {
              resolveDataPath:
                dataPath
            }
          );

        const blocked =
          report.blocked.find(
            row =>
              row.code ===
                "value_comparison_release_contract_failed"
          );

        assert.equal(report.ok, false);
        assert.ok(blocked);

        assert.ok(
          blocked.errors.some(
            error =>
              error.startsWith(
                "comparison_count_mismatch:A:"
              )
          )
        );
      }
    );
  }
);

test(
  "daily publish contract accepts a real zero-pick direct plan",
  () => {
    withPublishTree(
      {
        fixtures: 0,
        valuePicks: 0,
        valueFreshAgainstCanonical: true,
        ok: true
      },
      ({ dataPath }) => {
        const report =
          verifyDailyPublishContract(
            DAY,
            {
              resolveDataPath:
                dataPath
            }
          );

        assert.equal(
          report.ok,
          true,
          JSON.stringify(
            report.blocked
          )
        );

        assert.equal(
          report.valueRelease
            .plans
            .A2
            .count,
          0
        );

        assert.equal(
          report.valueRelease
            .comparison
            .parity
            .A2,
          true
        );
      }
    );
  }
);
