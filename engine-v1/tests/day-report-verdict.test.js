import test from "node:test";
import assert from "node:assert/strict";

import { finalizeDayReportVerdict } from "../jobs/build-day-report.js";

test("day report cannot be ok when hard failures exist", () => {
  const report = finalizeDayReportVerdict({ hardFailures: ["foundation_publication_not_ready"], warnings: [] });
  assert.equal(report.clean, false);
  assert.equal(report.ok, false);
});

test("day report is ok only when clean", () => {
  const report = finalizeDayReportVerdict({ hardFailures: [], warnings: ["context_warning"] });
  assert.equal(report.clean, true);
  assert.equal(report.cleanStrict, false);
  assert.equal(report.ok, true);
});
