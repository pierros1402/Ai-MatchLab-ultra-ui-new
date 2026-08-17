import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Value refresh writes exact-day foundation before building the day report", () => {
  const source = fs.readFileSync(
    "engine-v1/jobs/refresh-value-artifacts-day.js",
    "utf8"
  );

  const buildFoundation = source.indexOf(
    "const foundationIntegrityReport = buildFoundationIntegrityReport(date);"
  );

  const writeFoundation = source.indexOf(
    'resolveDataPath("foundation-integrity", `${date}.json`)'
  );

  const buildReport = source.indexOf(
    "const buildReport = buildDayReport(date);"
  );

  assert.ok(buildFoundation >= 0, "foundation build missing");
  assert.ok(writeFoundation > buildFoundation, "foundation exact-day write must follow build");
  assert.ok(buildReport > writeFoundation, "build report must follow exact-day foundation write");

  assert.equal(
    source.includes(
      'writeFoundationIntegrityReport(date)'
    ),
    false,
    "refresh must not overwrite foundation-integrity/latest.json"
  );
});
