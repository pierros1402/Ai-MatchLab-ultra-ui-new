import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDetailsPublicationValueSummary,
  selectDetailsValuePicksForPublication
} from "./build-details-day.js";

import {
  parseDeploySnapshotCliArgs
} from "./export-deploy-snapshot-day.js";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  planAObservationSignature
} from "../value/plan-a-observation.js";

import {
  verifyDetailsValueMirrorDay
} from "./verify-details-value-mirror-day.js";

import {
  promoteDeploySnapshotLatestDay,
  writeJsonAtomic
} from "./promote-deploy-snapshot-latest-day.js";

test(
  "Details consume frozen Plan A publication authority",
  () => {
    const mutablePick = {
      canonicalId: "cid_test",
      pick: "mutable"
    };

    const frozenPick = {
      canonicalId: "cid_test",
      pick: "frozen"
    };

    const actual =
      selectDetailsValuePicksForPublication(
        "2026-08-20",
        {
          picks: [mutablePick]
        },
        {
          publicationResolver: () => ({
            ok: true,
            authority:
              "frozen_plan_a_observation",
            payload: {
              picks: [frozenPick]
            }
          })
        }
      );

    assert.deepEqual(
      actual,
      [frozenPick]
    );

    assert.notDeepEqual(
      actual,
      [mutablePick]
    );
  }
);

test(
  "Details consume current Plan A before first freeze",
  () => {
    const currentPick = {
      canonicalId: "cid_test",
      pick: "current"
    };

    const currentPayload = {
      picks: [currentPick]
    };

    const actual =
      selectDetailsValuePicksForPublication(
        "2026-08-20",
        currentPayload,
        {
          publicationResolver:
            (_day, payload) => ({
              ok: true,
              authority:
                "current_value_artifact_first_freeze",
              payload
            })
        }
      );

    assert.deepEqual(
      actual,
      [currentPick]
    );
  }
);

test(
  "Details publication summary stays empty without Plan A publication picks",
  () => {
    assert.equal(
      buildDetailsPublicationValueSummary([]),
      null
    );
  }
);

test(
  "Details publication summary is derived only from Plan A publication picks",
  () => {
    const summary =
      buildDetailsPublicationValueSummary([
        {
          canonicalId: "cid_test",
          market: "1X2",
          pick: "HOME",
          score: 0.8,
          confidence: 0.7
        }
      ]);

    assert.deepEqual(
      summary,
      {
        count: 1,
        topMarket: "1X2",
        topPick: "HOME",
        topScore: 0.8,
        avgConfidence: 0.7,
        confidence: 0.75
      }
    );
  }
);

test(
  "Exporter CLI keeps previous defaults",
  () => {
    const args =
      parseDeploySnapshotCliArgs([
        "2026-08-20"
      ]);

    assert.equal(
      args.dayKey,
      "2026-08-20"
    );

    assert.equal(
      args.preserveDetails,
      true
    );

    assert.equal(
      args.preserveValue,
      false
    );

    assert.equal(
      args.updateLatest,
      undefined
    );

    assert.equal(
      args.buildMissingDetails,
      undefined
    );

    assert.equal(
      args.failOnMissingDetails,
      false
    );
  }
);

test(
  "Exporter CLI supports fail-closed prepublication detail replacement",
  () => {
    const args =
      parseDeploySnapshotCliArgs([
        "2026-08-20",
        "--no-update-latest",
        "--replace-details",
        "--no-build-missing-details",
        "--fail-on-missing-details"
      ]);

    assert.equal(
      args.updateLatest,
      false
    );

    assert.equal(
      args.preserveDetails,
      false
    );

    assert.equal(
      args.buildMissingDetails,
      false
    );

    assert.equal(
      args.failOnMissingDetails,
      true
    );
  }
);

test(
  "Exporter CLI help is non-mutating configuration",
  () => {
    const args =
      parseDeploySnapshotCliArgs([
        "--help"
      ]);

    assert.equal(
      args.help,
      true
    );
  }
);

test(
  "Exporter CLI rejects unknown arguments",
  () => {
    assert.throws(
      () =>
        parseDeploySnapshotCliArgs([
          "2026-08-20",
          "--unknown-option"
        ]),
      /Unknown argument/u
    );
  }
);
function writeTestJson(
  file,
  payload
) {
  fs.mkdirSync(
    path.dirname(file),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    file,
    `${JSON.stringify(
      payload,
      null,
      2
    )}\n`,
    "utf8"
  );
}

test(
  "Details Value mirror follows frozen Plan A observation end to end",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-details-value-mirror-"
        )
      );

    const day =
      "2026-08-20";

    const dataPath =
      (...parts) =>
        path.join(
          root,
          ...parts
        );

    const id =
      "cid_test_match_20260820";

    const mutablePick = {
      canonicalId: id,
      market: "1X2",
      pick: "mutable"
    };

    const frozenPick = {
      canonicalId: id,
      market: "1X2",
      pick: "frozen"
    };

    const observationSignature =
      planAObservationSignature(
        day,
        {
          picks:
            [frozenPick]
        }
      );

    writeTestJson(
      dataPath(
        "value",
        `${day}.json`
      ),
      {
        date: day,
        count: 1,
        picks:
          [mutablePick]
      }
    );

    writeTestJson(
      dataPath(
        "value-plans",
        day,
        "plan-a.json"
      ),
      {
        schema:
          "ai-matchlab.value-plan-a-observation.v1",
        date: day,
        immutable: true,
        count: 1,
        picks:
          [frozenPick],
        observationSignature
      }
    );

    writeTestJson(
      dataPath(
        "deploy-snapshots",
        day,
        "fixtures.json"
      ),
      {
        date: day,
        fixtures: [
          {
            canonicalId: id,
            matchId: id
          }
        ]
      }
    );

    writeTestJson(
      dataPath(
        "deploy-snapshots",
        day,
        "value.json"
      ),
      {
        date: day,
        count: 1,
        picks:
          [frozenPick],
        publicationAuthority:
          "frozen_plan_a_observation"
      }
    );

    writeTestJson(
      dataPath(
        "deploy-snapshots",
        day,
        "manifest.json"
      ),
      {
        date: day,
        counts: {
          fixtures: 1,
          details: 1,
          valuePicks: 1
        },
        coverage: {
          detailsWithValue: 1
        }
      }
    );

    const detail = {
      matchId: id,
      value:
        [frozenPick],
      valueSummary: {
        count: 1
      }
    };

    writeTestJson(
      dataPath(
        "details",
        day,
        `${id}.json`
      ),
      detail
    );

    writeTestJson(
      dataPath(
        "deploy-snapshots",
        day,
        "details",
        `${id}.json`
      ),
      detail
    );

    try {
      const green =
        verifyDetailsValueMirrorDay(
          day,
          {
            resolveDataPath:
              dataPath
          }
        );

      assert.equal(
        green.ok,
        true,
        JSON.stringify(
          green.violations
        )
      );

      assert.equal(
        green.authority,
        "frozen_plan_a_observation"
      );

      assert.equal(
        green.counts
          .publicationPicks,
        1
      );

      writeTestJson(
        dataPath(
          "deploy-snapshots",
          day,
          "details",
          `${id}.json`
        ),
        {
          ...detail,
          value:
            [mutablePick]
        }
      );

      const red =
        verifyDetailsValueMirrorDay(
          day,
          {
            resolveDataPath:
              dataPath
          }
        );

      assert.equal(
        red.ok,
        false
      );

      assert.ok(
        red.violations.some(
          row =>
            row.code ===
            "snapshot_detail_value_mismatch"
        )
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "latest promotion is impossible before prepublish contract passes",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-latest-promotion-red-"
        )
      );

    const dataPath =
      (...parts) =>
        path.join(
          root,
          ...parts
        );

    try {
      const result =
        promoteDeploySnapshotLatestDay(
          "2026-08-20",
          {
            resolveDataPath:
              dataPath,

            verifyContract:
              () => ({
                ok: false,
                blocked: [
                  {
                    code:
                      "synthetic_failure"
                  }
                ]
              })
          }
        );

      assert.equal(
        result.ok,
        false
      );

      assert.equal(
        result.reason,
        "prepublish_contract_failed"
      );

      assert.equal(
        fs.existsSync(
          dataPath(
            "deploy-snapshots",
            "latest.json"
          )
        ),
        false
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "latest promotion writes only the validated manifest authority",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-latest-promotion-green-"
        )
      );

    const day =
      "2026-08-20";

    const dataPath =
      (...parts) =>
        path.join(
          root,
          ...parts
        );

    const manifestHash =
      "a".repeat(64);

    writeTestJson(
      dataPath(
        "deploy-snapshots",
        day,
        "manifest.json"
      ),
      {
        date: day,
        generatedAt:
          "2026-08-20T12:00:00.000Z",
        hash:
          manifestHash
      }
    );

    writeTestJson(
      dataPath(
        "deploy-snapshots",
        "latest.json"
      ),
      {
        ok: true,
        date:
          "2026-08-18",
        hash:
          "b".repeat(64)
      }
    );

    try {
      const result =
        promoteDeploySnapshotLatestDay(
          day,
          {
            resolveDataPath:
              dataPath,

            verifyContract:
              () => ({
                ok: true,
                mode:
                  "prepublish",
                blocked: []
              })
          }
        );

      assert.equal(
        result.ok,
        true
      );

      assert.equal(
        result.updated,
        true
      );

      const latest =
        JSON.parse(
          fs.readFileSync(
            dataPath(
              "deploy-snapshots",
              "latest.json"
            ),
            "utf8"
          )
        );

      assert.equal(
        latest.date,
        day
      );

      assert.equal(
        latest.hash,
        manifestHash
      );

      assert.equal(
        latest.manifest,
        `data/deploy-snapshots/${day}/manifest.json`
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "latest promotion refuses to move backwards",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-latest-promotion-backward-"
        )
      );

    const day =
      "2026-08-20";

    const dataPath =
      (...parts) =>
        path.join(
          root,
          ...parts
        );

    writeTestJson(
      dataPath(
        "deploy-snapshots",
        day,
        "manifest.json"
      ),
      {
        date: day,
        generatedAt:
          "2026-08-20T12:00:00.000Z",
        hash:
          "c".repeat(64)
      }
    );

    writeTestJson(
      dataPath(
        "deploy-snapshots",
        "latest.json"
      ),
      {
        date:
          "2026-08-21",
        hash:
          "d".repeat(64)
      }
    );

    try {
      const result =
        promoteDeploySnapshotLatestDay(
          day,
          {
            resolveDataPath:
              dataPath,

            verifyContract:
              () => ({
                ok: true
              })
          }
        );

      assert.equal(
        result.ok,
        false
      );

      assert.equal(
        result.reason,
        "backward_latest_promotion_refused"
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "atomic latest writer replaces the pointer and leaves no temp artifact",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-latest-atomic-success-"
        )
      );

    const file =
      path.join(
        root,
        "latest.json"
      );

    try {
      fs.writeFileSync(
        file,
        JSON.stringify({
          date: "2026-08-19"
        }),
        "utf8"
      );

      writeJsonAtomic(
        file,
        {
          ok: true,
          date: "2026-08-20",
          hash:
            "a".repeat(64)
        }
      );

      const actual =
        JSON.parse(
          fs.readFileSync(
            file,
            "utf8"
          )
        );

      assert.equal(
        actual.date,
        "2026-08-20"
      );

      assert.equal(
        actual.hash,
        "a".repeat(64)
      );

      const leftovers =
        fs.readdirSync(root)
          .filter(
            name =>
              name.startsWith(
                ".latest.json."
              ) &&
              name.endsWith(".tmp")
          );

      assert.deepEqual(
        leftovers,
        []
      );

      const source =
        writeJsonAtomic.toString();

      assert.match(
        source,
        /fs\.fsyncSync\(handle\)/u
      );

      assert.match(
        source,
        /fs\.renameSync\(\s*tempFile,\s*file\s*\)/u
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "atomic latest writer cleans its temp artifact when rename fails",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-latest-atomic-failure-"
        )
      );

    const blockedTarget =
      path.join(
        root,
        "latest.json"
      );

    try {
      fs.mkdirSync(
        blockedTarget
      );

      assert.throws(
        () =>
          writeJsonAtomic(
            blockedTarget,
            {
              ok: true,
              date:
                "2026-08-20"
            }
          )
      );

      assert.equal(
        fs.statSync(
          blockedTarget
        ).isDirectory(),
        true
      );

      const leftovers =
        fs.readdirSync(root)
          .filter(
            name =>
              name.startsWith(
                ".latest.json."
              ) &&
              name.endsWith(".tmp")
          );

      assert.deepEqual(
        leftovers,
        []
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);
