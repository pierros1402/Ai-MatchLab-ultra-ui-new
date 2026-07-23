import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyHistoricalIntegrityOutcome,
  hasPreservedBaselineRepairEvidence
} from "../jobs/audit-historical-integrity-range.js";

function preservedRepairReport(
  dayKey = "2026-07-19"
) {
  return {
    ok: true,
    dayKey,
    validation: {
      ok: true,
      newFreshnessReasons: [],
      newBuildHardFailures: [],
      invariantBlocked: 0,
      blockingIntegrityHardFailures: [],
      preservedBaselineIntegrityHardFailures: [
        "build_report_not_clean"
      ]
    }
  };
}

test(
  "clean historical evidence remains clean",
  () => {
    const result =
      classifyHistoricalIntegrityOutcome({
        dayKey: "2026-07-19",
        hardFailures: [],
        warnings: []
      });

    assert.equal(result.ok, true);
    assert.equal(result.clean, true);
    assert.equal(result.classification, "clean");
    assert.deepEqual(
      result.repairRequiredFailures,
      []
    );
  }
);

test(
  "aged-out canonical rescue is usable warning evidence",
  () => {
    const result =
      classifyHistoricalIntegrityOutcome({
        dayKey: "2026-07-18",
        hardFailures: [],
        warnings: [
          "snapshot_rescue_from_aged_out_canonical"
        ]
      });

    assert.equal(result.ok, true);
    assert.equal(result.clean, false);
    assert.equal(
      result.classification,
      "aged_out_canonical_warning"
    );
    assert.equal(
      result.agedOutCanonicalWarning,
      true
    );
  }
);

test(
  "verified baseline build limitation does not request repair again",
  () => {
    const dayKey = "2026-07-19";
    const repairReport =
      preservedRepairReport(dayKey);

    assert.equal(
      hasPreservedBaselineRepairEvidence(
        repairReport,
        dayKey
      ),
      true
    );

    const result =
      classifyHistoricalIntegrityOutcome({
        dayKey,
        hardFailures: [
          "build_report_not_clean"
        ],
        warnings: [],
        repairReport
      });

    assert.equal(result.ok, true);
    assert.equal(result.clean, false);
    assert.equal(
      result.classification,
      "preserved_baseline_limitation"
    );
    assert.deepEqual(
      result.repairRequiredFailures,
      []
    );
    assert.deepEqual(
      result.preservedBaselineLimitations,
      ["build_report_not_clean"]
    );
  }
);

test(
  "build failure without exact repair evidence remains repair-required",
  () => {
    const result =
      classifyHistoricalIntegrityOutcome({
        dayKey: "2026-07-19",
        hardFailures: [
          "build_report_not_clean"
        ],
        warnings: [],
        repairReport: null
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.classification,
      "repair_required"
    );
    assert.deepEqual(
      result.repairRequiredFailures,
      ["build_report_not_clean"]
    );
  }
);

test(
  "unrelated integrity failure stays blocking despite baseline evidence",
  () => {
    const dayKey = "2026-07-19";

    const result =
      classifyHistoricalIntegrityOutcome({
        dayKey,
        hardFailures: [
          "build_report_not_clean",
          "details_fixtures_not_bijective"
        ],
        warnings: [],
        repairReport:
          preservedRepairReport(dayKey)
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.classification,
      "repair_required"
    );
    assert.deepEqual(
      result.repairRequiredFailures,
      ["details_fixtures_not_bijective"]
    );
  }
);

test(
  "new build failure invalidates baseline-preservation evidence",
  () => {
    const dayKey = "2026-07-19";
    const repairReport =
      preservedRepairReport(dayKey);

    repairReport.validation.newBuildHardFailures = [
      "new_build_failure"
    ];

    assert.equal(
      hasPreservedBaselineRepairEvidence(
        repairReport,
        dayKey
      ),
      false
    );

    const result =
      classifyHistoricalIntegrityOutcome({
        dayKey,
        hardFailures: [
          "build_report_not_clean"
        ],
        warnings: [],
        repairReport
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.classification,
      "repair_required"
    );
  }
);
