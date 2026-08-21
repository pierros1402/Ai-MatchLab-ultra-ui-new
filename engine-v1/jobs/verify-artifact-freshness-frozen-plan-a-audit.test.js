import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  shouldPreserveFrozenPlanAAudit
} from "./verify-artifact-freshness-day.js";

const here =
  path.dirname(
    fileURLToPath(import.meta.url)
  );

const verifierFile =
  path.join(
    here,
    "verify-artifact-freshness-day.js"
  );

function frozenValue(overrides = {}) {
  return {
    immutable: true,
    planId: "plan-a",
    outputMode: "plan-a-observation",
    ...overrides
  };
}

function audit(overrides = {}) {
  return {
    date: "2026-08-20",
    planId: "plan-a",
    outputMode: "production",
    generatedAt: "2026-08-20T10:25:13.886Z",
    count: 1,
    sourceContract: {
      canonicalOnly: true,
      deploySnapshotInput: false,
      realBookmakerOddsUsed: false
    },
    reasons: ["example"],
    ...overrides
  };
}

test(
  "preserves exact source-bound frozen Plan A audit",
  () => {
    const snapshotAudit = audit();

    assert.equal(
      shouldPreserveFrozenPlanAAudit({
        dayKey: "2026-08-20",
        snapshotValue: frozenValue(),
        snapshotAudit,
        sourceAudit:
          structuredClone(snapshotAudit)
      }),
      true
    );
  }
);

test(
  "accepts explicit frozen Plan A publication authority",
  () => {
    const snapshotAudit = audit();

    assert.equal(
      shouldPreserveFrozenPlanAAudit({
        dayKey: "2026-08-20",
        snapshotValue: {
          publicationAuthority:
            "frozen_plan_a_observation"
        },
        snapshotAudit,
        sourceAudit:
          structuredClone(snapshotAudit)
      }),
      true
    );
  }
);

test(
  "rejects audit content mismatch",
  () => {
    assert.equal(
      shouldPreserveFrozenPlanAAudit({
        dayKey: "2026-08-20",
        snapshotValue: frozenValue(),
        snapshotAudit: audit(),
        sourceAudit: audit({
          count: 2
        })
      }),
      false
    );
  }
);

test(
  "rejects wrong day and wrong audit identity",
  () => {
    const exactAudit = audit();

    const cases = [
      {
        dayKey: "2026-08-19",
        snapshotAudit: exactAudit,
        sourceAudit:
          structuredClone(exactAudit)
      },
      {
        dayKey: "2026-08-20",
        snapshotAudit: audit({
          planId: "plan-b"
        }),
        sourceAudit: audit({
          planId: "plan-b"
        })
      },
      {
        dayKey: "2026-08-20",
        snapshotAudit: audit({
          outputMode: "plan-a-observation"
        }),
        sourceAudit: audit({
          outputMode: "plan-a-observation"
        })
      }
    ];

    for (const input of cases) {
      assert.equal(
        shouldPreserveFrozenPlanAAudit({
          ...input,
          snapshotValue: frozenValue()
        }),
        false
      );
    }
  }
);

test(
  "rejects matching audit when Value is not frozen",
  () => {
    const snapshotAudit = audit();

    assert.equal(
      shouldPreserveFrozenPlanAAudit({
        dayKey: "2026-08-20",
        snapshotValue: {
          planId: "plan-a",
          outputMode: "production"
        },
        snapshotAudit,
        sourceAudit:
          structuredClone(snapshotAudit)
      }),
      false
    );
  }
);

test(
  "verifier wires frozen audit preservation into snapshot value audit",
  () => {
    const source =
      fs.readFileSync(
        verifierFile,
        "utf8"
      );

    for (const token of [
      'const sourceAudit = readJsonSafe(resolveDataPath("value", "_audit", `${dayKey}.json`));',
      "const preserveFrozenPlanAAudit = shouldPreserveFrozenPlanAAudit({",
      'kind: "snapshot_value_audit"',
      "preservation: preserveFrozenPlanAAudit",
      'reason: "frozen_plan_a_publication_audit"'
    ]) {
      assert.ok(
        source.includes(token),
        "missing frozen Plan A audit contract token: " + token
      );
    }
  }
);