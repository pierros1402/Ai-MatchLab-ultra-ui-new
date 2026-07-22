import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  classifyRepairIntegrityFailures,
  newlyIntroducedReasons
} from "../jobs/repair-historical-snapshot-day.js";

test("historical repair sanitizes canonical truth, synchronizes details, then re-exports before invariant", () => {
  const source = fs.readFileSync(
    new URL(
      "../jobs/repair-historical-snapshot-day.js",
      import.meta.url
    ),
    "utf8"
  ).replace(/\r\n/g, "\n");

  const baselineFreshnessIndex = source.indexOf(
    "const baselineFreshness"
  );
  const baselineBuildIndex = source.indexOf(
    "const baselineBuildReport"
  );
  const sanitizeIndex = source.indexOf(
    "const canonicalSanitation = sanitizeHistoricalCanonicalNonPlayedDay(dayKey)"
  );
  const firstExportIndex = source.indexOf(
    "let exportResult = await exportDeploySnapshotDay"
  );
  const detailSyncIndex = source.indexOf(
    "const detailSync = synchronizeHistoricalSnapshotDetailsDay(dayKey)"
  );
  const secondExportIndex = source.indexOf(
    "reason: \"bind_repaired_detail_bytes\""
  );
  const invariantIndex = source.indexOf(
    "await runSnapshotInvariantCheck(dayKey)"
  );

  assert.ok(baselineFreshnessIndex >= 0);
  assert.ok(baselineBuildIndex > baselineFreshnessIndex);
  assert.ok(sanitizeIndex > baselineBuildIndex);
  assert.ok(firstExportIndex > sanitizeIndex);
  assert.ok(detailSyncIndex > firstExportIndex);
  assert.ok(secondExportIndex > detailSyncIndex);
  assert.ok(invariantIndex > secondExportIndex);

  assert.match(
    source,
    /hasPreKickoffNonPlayedDisplayViolation\(row\)/
  );
  assert.match(source, /sanitizePreKickoffNonPlayed\(row\)/);
  assert.match(source, /synchronizeDetailStatusState\(detail, row\)/);
});

test("historical repair classifies only newly introduced diagnostics as blockers", () => {
  assert.deepEqual(
    newlyIntroducedReasons(
      [
        "snapshot_value_stale_against_canonical",
        "legacy_contract_missing"
      ],
      [
        "legacy_contract_missing",
        "snapshot_value_stale_against_canonical"
      ]
    ),
    []
  );

  assert.deepEqual(
    newlyIntroducedReasons(
      ["legacy_contract_missing"],
      [
        "legacy_contract_missing",
        "manifest_detail_metadata_drift"
      ]
    ),
    ["manifest_detail_metadata_drift"]
  );
});

test("historical repair preserves baseline build-report failure but blocks unrelated integrity failures", () => {
  assert.deepEqual(
    classifyRepairIntegrityFailures(
      ["build_report_not_clean"],
      []
    ),
    {
      blocking: [],
      preserved: ["build_report_not_clean"]
    }
  );

  assert.deepEqual(
    classifyRepairIntegrityFailures(
      [
        "build_report_not_clean",
        "details_incomplete"
      ],
      []
    ),
    {
      blocking: ["details_incomplete"],
      preserved: ["build_report_not_clean"]
    }
  );

  assert.deepEqual(
    classifyRepairIntegrityFailures(
      ["build_report_not_clean"],
      ["new_build_failure"]
    ),
    {
      blocking: ["build_report_not_clean"],
      preserved: []
    }
  );
});
