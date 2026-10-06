import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildValueExportReport,
  comparisonToValueExportDay,
  prepareValueComparisonForExport
} from "./value-export-report.js";

const here =
  path.dirname(
    fileURLToPath(import.meta.url)
  );

const root =
  path.resolve(here, "../..");

function plan(picks = []) {
  return {
    summary: {
      picks: picks.length,
      wins: picks.filter(
        row => row.result === "WIN"
      ).length,
      losses: picks.filter(
        row => row.result === "LOSS"
      ).length,
      unresolved: picks.filter(
        row =>
          !row.result ||
          row.result === "UNRESOLVED"
      ).length
    },
    picks
  };
}

function pick(id, result) {
  return {
    matchId: id,
    canonicalMatchId: id,
    market: "OU25",
    pick: "over",
    result
  };
}

function prepare(date, comparison) {
  const result =
    prepareValueComparisonForExport({
      date,
      comparison
    });

  assert.equal(
    result.ok,
    true,
    result.reason || date
  );

  return result;
}

test(
  "legacy A/B comparison stays exportable while A2/B2 remain explicitly unavailable",
  () => {
    const date = "2026-07-05";
    const prepared = prepare(
      date,
      {
        ok: true,
        date,
        plans: {
          A: plan([pick("a", "WIN")]),
          B: plan([pick("b", "LOSS")])
        }
      }
    );

    assert.equal(
      prepared.kind,
      "LEGACY_AB"
    );

    const day =
      comparisonToValueExportDay({
        date,
        comparison:
          prepared.comparison
      });

    const report =
      buildValueExportReport({
        from: date,
        to: date,
        days: [date],
        dayRecords: [day],
        today: "2026-10-05"
      });

    assert.equal(
      report.plans.A.daily[0].status,
      "COMPLETE_WITH_PICKS"
    );
    assert.equal(
      report.plans.B.daily[0].status,
      "COMPLETE_WITH_PICKS"
    );
    assert.equal(
      report.plans.A2.daily[0].status,
      "NOT_AVAILABLE"
    );
    assert.equal(
      report.plans.B2.daily[0].status,
      "NOT_AVAILABLE"
    );
    assert.equal(
      report.plans.A2.range.picks,
      0
    );
    assert.equal(
      report.plans.A2.range.availableDays,
      0
    );
    assert.equal(
      report.plans.A2.range.notAvailableDays,
      1
    );
    assert.equal(
      report.integrity.status,
      "INCOMPLETE"
    );
    assert.ok(
      report.integrity.issues.some(
        issue =>
          issue.code ===
            "VALUE_EXPORT_PLAN_NOT_AVAILABLE" &&
          issue.plan === "A2"
      )
    );
  }
);

test(
  "unrecoverable historical Plan A stays unavailable and is never synthesized",
  () => {
    const date = "2026-07-26";
    const prepared = prepare(
      date,
      {
        ok: true,
        date,
        comparisonEligible: false,
        planAAvailability: {
          status: "unrecoverable",
          reason:
            "historical_plan_a_artifact_never_persisted"
        },
        plans: {
          A: null,
          B: plan([])
        }
      }
    );

    assert.equal(
      prepared.kind,
      "PLAN_A_UNRECOVERABLE"
    );
    assert.equal(
      prepared.comparison.plans.A,
      null
    );

    const day =
      comparisonToValueExportDay({
        date,
        comparison:
          prepared.comparison
      });

    assert.equal(
      day.plans.A.available,
      false
    );
    assert.equal(
      day.plans.A.availabilityReason,
      "historical_plan_a_artifact_never_persisted"
    );
  }
);

test(
  "evidence-bound Plan A zero observation becomes a zero-pick read view without inventing Plan B",
  () => {
    const date = "2026-08-11";
    const prepared = prepare(
      date,
      {
        ok: true,
        date,
        comparisonEligible: false,
        planAAvailability: {
          available: true,
          count: 0,
          immutable: true,
          observationSignature:
            "a".repeat(64)
        },
        planBAvailability: {
          available: false,
          reason:
            "plan_b_was_not_observed_by_the_historical_pipeline"
        },
        provenance: {
          kind:
            "evidence_bound_runner_recovery",
          runIds: ["123"]
        },
        plans: {}
      }
    );

    assert.equal(
      prepared.kind,
      "EVIDENCE_BOUND_PLAN_A_ZERO"
    );

    const day =
      comparisonToValueExportDay({
        date,
        comparison:
          prepared.comparison
      });

    const report =
      buildValueExportReport({
        from: date,
        to: date,
        days: [date],
        dayRecords: [day],
        today: "2026-10-05"
      });

    assert.equal(
      report.plans.A.daily[0].status,
      "COMPLETE_ZERO_PICKS"
    );
    assert.equal(
      report.plans.B.daily[0].status,
      "NOT_AVAILABLE"
    );
    assert.equal(
      report.plans.B.range.picks,
      0
    );
    assert.ok(
      report.integrity.issues.some(
        issue =>
          issue.plan === "B" &&
          issue.reason ===
            "plan_b_was_not_observed_by_the_historical_pipeline"
      )
    );
  }
);

test(
  "malformed historical partial comparison remains fail-closed",
  () => {
    const date = "2026-07-05";
    const result =
      prepareValueComparisonForExport({
        date,
        comparison: {
          ok: true,
          date,
          plans: {
            A: plan([]),
            B: "invalid"
          }
        }
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.reason,
      "value_comparison_payload_invalid"
    );
  }
);

test(
  "real historical compatibility states classify as audited",
  () => {
    const expected = new Map([
      ["2026-07-05", "LEGACY_AB"],
      ["2026-07-26", "PLAN_A_UNRECOVERABLE"],
      ["2026-07-27", "LEGACY_AB"],
      [
        "2026-08-11",
        "EVIDENCE_BOUND_PLAN_A_ZERO"
      ],
      [
        "2026-08-12",
        "EVIDENCE_BOUND_PLAN_A_ZERO"
      ],
      ["2026-08-13", "LEGACY_AB"],
      ["2026-08-14", "LEGACY_AB"],
      ["2026-10-05", "FOUR_PLAN"]
    ]);

    for (const [date, kind] of expected) {
      const file =
        path.join(
          root,
          "data",
          "value-comparison",
          `${date}.json`
        );

      const payload =
        JSON.parse(
          fs.readFileSync(file, "utf8")
        );

      const result =
        prepareValueComparisonForExport({
          date,
          comparison: payload
        });

      assert.equal(
        result.ok,
        true,
        date
      );
      assert.equal(
        result.kind,
        kind,
        date
      );
    }
  }
);

test(
  "range endpoint treats comparison NOT_FOUND as a reportable missing day rather than a fatal source error",
  () => {
    const source =
      fs.readFileSync(
        path.join(root, "engine-v1", "index.js"),
        "utf8"
      ).replace(/\r\n/gu, "\n");

    assert.ok(
      source.includes(
        "prepareValueComparisonForExport"
      )
    );
    assert.match(
      source,
      /comparisonResult\?\.issue\?\.code ===\s*"VALUE_EXPORT_COMPARISON_NOT_FOUND"[\s\S]{0,120}?continue;/u
    );
  }
);
