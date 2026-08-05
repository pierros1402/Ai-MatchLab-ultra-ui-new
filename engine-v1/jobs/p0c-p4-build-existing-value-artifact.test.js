import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildProductionIdentityResolverFromCommittedDecisions,
} from "../core/production-identity-resolver.js";
import {
  createProductionEvidenceIdentityOverlay,
} from "../core/production-evidence-identity-overlay.js";
import {
  P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA,
  P0C_P4_VALUE_IDENTITY_OVERLAY_SCHEMA,
  buildP0CP4ExistingValueArtifact,
} from "./p0c-p4-build-existing-value-artifact.js";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(
  path.dirname(__filename),
  "..",
  "..",
);

const VALUE_INVENTORY = Object.freeze([
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-05-02/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-05-03/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-05-04/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-05-10/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-05-11/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-05-12/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-05-13/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-05-30/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-06-06/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-06-14/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-06-21/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE", "data/deploy-snapshots/2026-07-18/value.json"],
  ["DEPLOY_SNAPSHOT_VALUE_AUDIT", "data/deploy-snapshots/2026-07-15/value-audit.json"],
  ["DEPLOY_SNAPSHOT_VALUE_AUDIT", "data/deploy-snapshots/2026-07-16/value-audit.json"],
  ["DEPLOY_SNAPSHOT_VALUE_AUDIT", "data/deploy-snapshots/2026-07-18/value-audit.json"],
  ["DEPLOY_SNAPSHOT_VALUE_AUDIT", "data/deploy-snapshots/2026-07-21/value-audit.json"],
  ["DEPLOY_SNAPSHOT_VALUE_AUDIT", "data/deploy-snapshots/2026-07-22/value-audit.json"],
  ["DEPLOY_SNAPSHOT_VALUE_AUDIT", "data/deploy-snapshots/2026-07-23/value-audit.json"],
  ["DEPLOY_SNAPSHOT_VALUE_AUDIT", "data/deploy-snapshots/2026-07-25/value-audit.json"],
  ["DEPLOY_SNAPSHOT_VALUE_AUDIT", "data/deploy-snapshots/2026-07-29/value-audit.json"],
  ["DEPLOY_SNAPSHOT_VALUE_AUDIT", "data/deploy-snapshots/2026-07-30/value-audit.json"],
  ["DEPLOY_SNAPSHOT_VALUE_AUDIT", "data/deploy-snapshots/2026-08-01/value-audit.json"],
  ["VALUE_AUDIT_ARTIFACT", "data/value/_audit/2026-07-15.json"],
  ["VALUE_AUDIT_ARTIFACT", "data/value/_audit/2026-07-16.json"],
  ["VALUE_AUDIT_ARTIFACT", "data/value/_audit/2026-07-18.json"],
  ["VALUE_AUDIT_ARTIFACT", "data/value/_audit/2026-07-21.json"],
  ["VALUE_AUDIT_ARTIFACT", "data/value/_audit/2026-07-22.json"],
  ["VALUE_AUDIT_ARTIFACT", "data/value/_audit/2026-07-23.json"],
  ["VALUE_AUDIT_ARTIFACT", "data/value/_audit/2026-07-25.json"],
  ["VALUE_AUDIT_ARTIFACT", "data/value/_audit/2026-07-29.json"],
  ["VALUE_AUDIT_ARTIFACT", "data/value/_audit/2026-07-30.json"],
  ["VALUE_AUDIT_ARTIFACT", "data/value/_audit/2026-08-01.json"],
  ["VALUE_COMPARISON", "data/value-comparison/2026-07-23.json"],
  ["VALUE_COMPARISON", "data/value-comparison/2026-07-26.json"],
  ["VALUE_COMPARISON", "data/value-comparison/2026-08-01.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-12/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-15/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-17/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-21/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-22/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-23/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-23/plan-b.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-24/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-25/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-26/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-26/plan-b.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-29/plan-a2-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-29/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-29/plan-b.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-29/plan-b2-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-29/plan-b2.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-30/plan-a2-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-30/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-30/plan-b.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-30/plan-b2-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-07-30/plan-b2.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-08-01/plan-a.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-08-01/plan-a2-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-08-01/plan-b-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-08-01/plan-b.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-08-01/plan-b2-audit.json"],
  ["VALUE_PLAN_ARTIFACT", "data/value-plans/2026-08-01/plan-b2.json"],
]);

function loadJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(
      path.join(PROJECT_ROOT, relativePath),
      "utf8",
    ),
  );
}

function productionOverlay() {
  const resolver =
    buildProductionIdentityResolverFromCommittedDecisions({
      contract: loadJson(
        "data/identity-decisions/production-identity-resolver-contract.v1.json",
      ),
      registry: loadJson(
        "data/identity-decisions/production-global-club-id-registry.v1.json",
      ),
      retentionLedger: loadJson(
        "data/identity-decisions/fixture-retention-decision-ledger.v1.json",
      ),
      sourceLedger: loadJson(
        "data/identity-decisions/semantic-duplicate-decision-ledger.v1.json",
      ),
    });
  return createProductionEvidenceIdentityOverlay({ resolver });
}

function fakeOverlay(mapping = {}) {
  const retainedTargets = new Set(Object.values(mapping));
  return {
    resolveEvidenceFixtureId(value) {
      if (Object.hasOwn(mapping, value)) {
        return {
          ok: true,
          managed: true,
          changed: value !== mapping[value],
          sourceFixtureId: value,
          resolvedFixtureId: mapping[value],
          sourceRole: value === mapping[value]
            ? "retained"
            : "suppressed_lineage_alias",
        };
      }
      if (retainedTargets.has(value)) {
        return {
          ok: true,
          managed: true,
          changed: false,
          sourceFixtureId: value,
          resolvedFixtureId: value,
          sourceRole: "retained",
        };
      }
      return {
        ok: true,
        managed: false,
        changed: false,
        sourceFixtureId: value,
        resolvedFixtureId: value,
        sourceRole: "unmanaged",
      };
    },
  };
}

test("builds an additive existing-artifact identity overlay without changing pick truth", () => {
  const source = Buffer.from(
    `${JSON.stringify({
      date: "2026-08-01",
      count: 1,
      picks: [{
        matchId: "suppressed-id",
        market: "OU25",
        pick: "over",
        score: 0.91,
        status: "WIN",
      }],
      fixtureUniverse: {
        canonicalIds: [
          "suppressed-id",
          "unmanaged-id",
        ],
      },
    }, null, 2)}\n`,
    "utf8",
  );

  const result = buildP0CP4ExistingValueArtifact({
    relativePath:
      "data/value-plans/2026-08-01/plan-b.json",
    family: "VALUE_PLAN_ARTIFACT",
    sourceBytes: source,
    overlay: fakeOverlay({
      "suppressed-id": "retained-id",
    }),
  });

  assert.equal(
    result.schema,
    P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA,
  );
  assert.equal(result.ok, true);
  assert.equal(result.immutablePlanA, false);
  assert.equal(
    result.identityOverlay.schema,
    P0C_P4_VALUE_IDENTITY_OVERLAY_SCHEMA,
  );
  assert.equal(result.identityOverlay.entryCount, 2);
  assert.equal(
    result.identityOverlay.changedFixtureIdCount,
    2,
  );

  const output = JSON.parse(result.content.toString("utf8"));
  assert.equal(output.picks[0].matchId, "retained-id");
  assert.equal(output.picks[0].market, "OU25");
  assert.equal(output.picks[0].pick, "over");
  assert.equal(output.picks[0].score, 0.91);
  assert.equal(output.picks[0].status, "WIN");
  assert.deepEqual(
    output.fixtureUniverse.canonicalIds,
    ["retained-id", "unmanaged-id"],
  );
  assert.equal(
    output.productionIdentityOverlay.changedFixtureIdCount,
    2,
  );
  assert.equal(
    output.productionIdentityOverlay
      .suppressedSourceFixtureIdOmission.count,
    2,
  );
  assert.equal(
    output.productionIdentityOverlay.entries
      .every(entry => entry.changed !== true || (
        entry.sourceFixtureIdOmitted === true &&
        !Object.hasOwn(entry, "sourceFixtureId") &&
        /^[a-f0-9]{64}$/u.test(
          entry.sourceFixtureIdSha256,
        )
      )),
    true,
  );
  assert.equal(
    result.content.toString("utf8").includes(
      "suppressed-id",
    ),
    false,
  );
  assert.equal(
    output.productionIdentityOverlay.invariants.modelEvaluationPerformed,
    false,
  );
  assert.equal(
    output.productionIdentityOverlay.invariants.settlementTruthChanged,
    false,
  );
});

test("preserves immutable Plan A bytes exactly and rejects a required fixture rewrite", () => {
  const source = Buffer.from(
    '{\r\n  "date": "2026-08-01",\r\n  "picks": []\r\n}\r\n',
    "utf8",
  );
  const result = buildP0CP4ExistingValueArtifact({
    relativePath:
      "data/value-plans/2026-08-01/plan-a.json",
    family: "VALUE_PLAN_ARTIFACT",
    sourceBytes: source,
    overlay: fakeOverlay(),
  });

  assert.equal(result.immutablePlanA, true);
  assert.deepEqual(result.content, source);
  assert.equal(result.sourceSha256, result.outputSha256);
  assert.equal(
    result.identityOverlay.additiveOverlayEmbedded,
    false,
  );

  assert.throws(
    () => buildP0CP4ExistingValueArtifact({
      relativePath:
        "data/value-plans/2026-08-01/plan-a.json",
      family: "VALUE_PLAN_ARTIFACT",
      sourceBytes: Buffer.from(
        '{"picks":[{"matchId":"suppressed-id"}]}\n',
        "utf8",
      ),
      overlay: fakeOverlay({
        "suppressed-id": "retained-id",
      }),
    }),
    /immutable_plan_a_rewrite_required/,
  );
});

test("is deterministic, validates applied overlays idempotently and fails closed on tampering", () => {
  const source = Buffer.from(
    '{"date":"2026-08-01","picks":[{"matchId":"suppressed-id"}]}\n',
    "utf8",
  );
  const options = {
    relativePath:
      "data/value-comparison/2026-08-01.json",
    family: "VALUE_COMPARISON",
    sourceBytes: source,
    overlay: fakeOverlay({
      "suppressed-id": "retained-id",
    }),
  };
  const first = buildP0CP4ExistingValueArtifact(options);
  const second = buildP0CP4ExistingValueArtifact(options);
  assert.deepEqual(first.content, second.content);
  assert.equal(first.outputSha256, second.outputSha256);

  const applied = buildP0CP4ExistingValueArtifact({
    ...options,
    sourceBytes: first.content,
  });
  assert.deepEqual(applied.content, first.content);
  assert.equal(
    applied.identityOverlay.alreadyAppliedOverlayValidated,
    true,
  );
  assert.equal(
    applied.identityOverlay.idempotentPassThrough,
    true,
  );

  assert.throws(
    () => buildP0CP4ExistingValueArtifact({
      ...options,
      relativePath: "../escape.json",
    }),
    /path_invalid/,
  );
  assert.throws(
    () => buildP0CP4ExistingValueArtifact({
      ...options,
      sourceBytes: Buffer.from("not-json"),
    }),
    /json_invalid/,
  );
  assert.throws(
    () => buildP0CP4ExistingValueArtifact({
      ...options,
      sourceBytes: Buffer.from(
        '{"productionIdentityOverlay":{}}\n',
      ),
    }),
    /existing_overlay_invalid/,
  );

  const tampered = JSON.parse(
    first.content.toString("utf8"),
  );
  tampered.productionIdentityOverlay.entries[0]
    .sourceFixtureId = "suppressed-id";
  assert.throws(
    () => buildP0CP4ExistingValueArtifact({
      ...options,
      sourceBytes: Buffer.from(
        `${JSON.stringify(tampered, null, 2)}\n`,
      ),
    }),
    /suppressed_source_not_omitted/,
  );
});

test("reproduces the exact 62-path Value corpus at the current P0-C checkpoint", () => {
  assert.equal(VALUE_INVENTORY.length, 62);
  const overlay = productionOverlay();
  let immutablePlanACount = 0;
  let identityEntryCount = 0;
  let changedFixtureIdCount = 0;

  for (const [family, relativePath] of VALUE_INVENTORY) {
    const sourceBytes = fs.readFileSync(
      path.join(PROJECT_ROOT, relativePath),
    );
    const built = buildP0CP4ExistingValueArtifact({
      relativePath,
      family,
      sourceBytes,
      overlay,
    });
    assert.equal(built.ok, true, relativePath);
    assert.equal(built.family, family, relativePath);
    assert.equal(
      built.relativePath,
      relativePath,
      relativePath,
    );
    assert.equal(
      built.invariants.modelEvaluationPerformed,
      false,
      relativePath,
    );
    assert.equal(
      built.invariants.settlementTruthChanged,
      false,
      relativePath,
    );
    immutablePlanACount += built.immutablePlanA ? 1 : 0;
    identityEntryCount += built.identityOverlay.entryCount;
    changedFixtureIdCount +=
      built.identityOverlay.changedFixtureIdCount;
  }

  assert.equal(immutablePlanACount, 1);
  assert.equal(identityEntryCount, 431);
  assert.equal(changedFixtureIdCount, 215);
});
