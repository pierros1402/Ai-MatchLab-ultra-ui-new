import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  fileURLToPath
} from "node:url";

import {
  computeDeploySnapshotManifestHash
} from "../core/deploy-snapshot-release-contract.js";

import {
  runCheckpointAwareFreshnessCoverageManifestOnlySandboxDay
} from "./run-checkpoint-aware-targeted-freshness-coverage-manifest-only-sandbox-day.js";

const DAY =
  "2026-10-05";

function writeJson(
  file,
  value
) {
  fs.mkdirSync(
    path.dirname(
      file
    ),
    {
      recursive:
        true
    }
  );

  fs.writeFileSync(
    file,
    JSON.stringify(
      value,
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function fixtureManifest() {
  const manifest = {
    ok: true,
    date: DAY,
    generatedAt:
      "2026-10-05T15:00:00.000Z",
    startedAt:
      "2026-10-05T14:59:00.000Z",
    source:
      "local_canonical_export",
    version:
      "deploy-snapshot-v2",
    fixturesSource:
      "canonical",
    staticMinTargetFixtures: 0,
    minTargetFixtures: 0,
    minTargetFixtureSource:
      "test",
    canonicalCoverageFixtureCount: 0,
    files: {
      fixtures:
        "fixtures.json",
      value:
        "value.json",
      valueAudit:
        "value-audit.json",
      planCShadow:
        null,
      planCShadowAudit:
        null,
      detailsDir:
        "details"
    },
    fileHashes: {
      "fixtures.json":
        "a".repeat(64),
      "value.json":
        "b".repeat(64),
      "value-audit.json":
        "c".repeat(64)
    },
    counts: {
      fixtures: 0,
      valuePicks: 0,
      details: 2,
      detailsMatchedToFixtures: 2,
      orphanDetailsRemoved: 0,
      detailsMissingForFixtures: 0
    },
    coverage: {},
    sizes: {},
    details: [
      {
        file:
          "one.json",
        bytes: 2,
        hasTravel: false,
        hasPlayerUsage: false,
        hasTeamNews: false,
        hasValue: false,
        sha256:
          "d".repeat(64)
      },
      {
        file:
          "two.json",
        bytes: 2,
        hasTravel: false,
        hasPlayerUsage: false,
        hasTeamNews: false,
        hasValue: false,
        sha256:
          "e".repeat(64)
      }
    ]
  };

  manifest.hash =
    computeDeploySnapshotManifestHash(
      manifest
    );

  return manifest;
}

function exactFreshness() {
  return {
    ok: false,
    dayKey: DAY,
    generatedAt:
      "2026-10-05T15:00:01.100Z",
    manifestGeneratedAt:
      "2026-10-05T15:00:00.000Z",
    reasons: [
      "snapshot_stale_against_coverage_readiness"
    ],
    staleInputs: [
      {
        kind:
          "coverage_readiness",
        artifact:
          `coverage-readiness/${DAY}.json`,
        at:
          "2026-10-05T15:00:01.000Z",
        staleReason:
          "snapshot_stale_against_coverage_readiness",
        newerThanManifestMs:
          1000
      }
    ],
    staleDerivedArtifacts: [],
    missingRequiredArtifacts: [],
    fourPlanContract: {
      complete: true
    }
  };
}

function sha256(
  file
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      fs.readFileSync(
        file
      )
    )
    .digest(
      "hex"
    );
}

function createInputRoot() {
  const root =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "ai-matchlab-g5-input-"
      )
    );

  const snapshot =
    path.join(
      root,
      "data",
      "deploy-snapshots",
      DAY
    );

  writeJson(
    path.join(
      snapshot,
      "manifest.json"
    ),
    fixtureManifest()
  );

  writeJson(
    path.join(
      root,
      "data",
      "coverage-readiness",
      `${DAY}.json`
    ),
    {
      ok: true,
      dayKey: DAY,
      generatedAt:
        "2026-10-05T15:00:01.000Z"
    }
  );

  writeJson(
    path.join(
      snapshot,
      "freshness-report.json"
    ),
    exactFreshness()
  );

  fs.writeFileSync(
    path.join(
      snapshot,
      "value.json"
    ),
    "{\"value\":1}\r\n",
    "utf8"
  );

  fs.writeFileSync(
    path.join(
      snapshot,
      "value-audit.json"
    ),
    "{\"audit\":1}\n",
    "utf8"
  );

  writeJson(
    path.join(
      snapshot,
      "details",
      "one.json"
    ),
    {
      id: 1
    }
  );

  writeJson(
    path.join(
      snapshot,
      "details",
      "two.json"
    ),
    {
      id: 2
    }
  );

  return root;
}

test(
  "sandbox runner writes only outside the input root and preserves protected bytes",
  t => {
    const inputRoot =
      createInputRoot();

    const sandboxRoot =
      path.join(
        os.tmpdir(),
        `ai-matchlab-g5-sandbox-${process.pid}-${Date.now()}`
      );

    t.after(
      () => {
        fs.rmSync(
          inputRoot,
          {
            recursive: true,
            force: true
          }
        );

        fs.rmSync(
          sandboxRoot,
          {
            recursive: true,
            force: true
          }
        );
      }
    );

    const protectedFiles = [
      path.join(
        inputRoot,
        "data",
        "deploy-snapshots",
        DAY,
        "value.json"
      ),
      path.join(
        inputRoot,
        "data",
        "deploy-snapshots",
        DAY,
        "value-audit.json"
      ),
      path.join(
        inputRoot,
        "data",
        "deploy-snapshots",
        DAY,
        "details",
        "one.json"
      ),
      path.join(
        inputRoot,
        "data",
        "deploy-snapshots",
        DAY,
        "details",
        "two.json"
      )
    ];

    const before =
      protectedFiles.map(
        sha256
      );

    const sourceManifestBefore =
      fs.readFileSync(
        path.join(
          inputRoot,
          "data",
          "deploy-snapshots",
          DAY,
          "manifest.json"
        )
      );

    const result =
      runCheckpointAwareFreshnessCoverageManifestOnlySandboxDay({
        dayKey: DAY,
        inputRoot,
        sandboxRoot,
        generatedAt:
          "2026-10-05T15:00:02.000Z"
      });

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.mode,
      "SANDBOX_ONLY_NO_REPOSITORY_MUTATION"
    );

    assert.equal(
      result.safety.repositoryWritePerformed,
      false
    );

    assert.equal(
      result.safety.fullSnapshotExporterUsed,
      false
    );

    assert.equal(
      result.preservation.byteIdentical,
      true
    );

    assert.deepEqual(
      protectedFiles.map(
        sha256
      ),
      before
    );

    assert.deepEqual(
      fs.readFileSync(
        path.join(
          inputRoot,
          "data",
          "deploy-snapshots",
          DAY,
          "manifest.json"
        )
      ),
      sourceManifestBefore
    );

    assert.equal(
      fs.existsSync(
        path.join(
          sandboxRoot,
          "manifest.json"
        )
      ),
      true
    );

    assert.equal(
      fs.existsSync(
        path.join(
          sandboxRoot,
          "sandbox-result.json"
        )
      ),
      true
    );

    assert.deepEqual(
      result.adapter.assignedMutationKeys,
      [
        "generatedAt",
        "hash"
      ]
    );
  }
);

test(
  "sandbox runner rejects a sandbox path inside the source input root",
  t => {
    const inputRoot =
      createInputRoot();

    t.after(
      () => {
        fs.rmSync(
          inputRoot,
          {
            recursive: true,
            force: true
          }
        );
      }
    );

    assert.throws(
      () =>
        runCheckpointAwareFreshnessCoverageManifestOnlySandboxDay({
          dayKey: DAY,
          inputRoot,
          sandboxRoot:
            path.join(
              inputRoot,
              "sandbox"
            ),
          generatedAt:
            "2026-10-05T15:00:02.000Z"
        }),
      /sandbox_root_must_be_outside_input_root/u
    );
  }
);

test(
  "sandbox runner fails closed when freshness is not the exact coverage-readiness-only class",
  t => {
    const inputRoot =
      createInputRoot();

    const freshnessFile =
      path.join(
        inputRoot,
        "data",
        "deploy-snapshots",
        DAY,
        "freshness-report.json"
      );

    const freshness =
      exactFreshness();

    freshness.reasons.push(
      "snapshot_stale_against_canonical"
    );

    writeJson(
      freshnessFile,
      freshness
    );

    const sandboxRoot =
      path.join(
        os.tmpdir(),
        `ai-matchlab-g5-sandbox-fail-${process.pid}-${Date.now()}`
      );

    t.after(
      () => {
        fs.rmSync(
          inputRoot,
          {
            recursive: true,
            force: true
          }
        );

        fs.rmSync(
          sandboxRoot,
          {
            recursive: true,
            force: true
          }
        );
      }
    );

    assert.throws(
      () =>
        runCheckpointAwareFreshnessCoverageManifestOnlySandboxDay({
          dayKey: DAY,
          inputRoot,
          sandboxRoot,
          generatedAt:
            "2026-10-05T15:00:02.000Z"
        }),
      /plan_not_exact/u
    );
  }
);

test(
  "sandbox runner source has no full snapshot exporter dependency",
  () => {
    const here =
      path.dirname(
        fileURLToPath(
          import.meta.url
        )
      );

    const source =
      fs.readFileSync(
        path.join(
          here,
          "run-checkpoint-aware-targeted-freshness-coverage-manifest-only-sandbox-day.js"
        ),
        "utf8"
      );

    assert.equal(
      source.includes(
        "export-deploy-snapshot-day.js"
      ),
      false
    );
  }
);