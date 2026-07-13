import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeAbsenceReason } from "./team-news-db.js";

test("collapses echoed 'X: X' doubling", () => {
  assert.equal(sanitizeAbsenceReason("Hamstring: Hamstring"), "Hamstring");
  assert.equal(sanitizeAbsenceReason("Sports Hernia: Sports Hernia"), "Sports Hernia");
  // case-insensitive echo
  assert.equal(sanitizeAbsenceReason("Knee: knee"), "Knee");
});

test("strips opponent leakage after ' vs '", () => {
  assert.equal(sanitizeAbsenceReason("broken foot - certain absentee vs Barcelona"), "broken foot - certain absentee");
  assert.equal(sanitizeAbsenceReason("injured - unavailable vs Celta Vigo"), "injured - unavailable");
});

test("leaves legitimate reasons untouched", () => {
  for (const r of ["Knee injury", "out for the season", "Suspension (yellow cards)", "Thigh", "Red card ban"]) {
    assert.equal(sanitizeAbsenceReason(r), r);
  }
});

test("handles empty / nullish input", () => {
  assert.equal(sanitizeAbsenceReason(""), "");
  assert.equal(sanitizeAbsenceReason(null), "");
  assert.equal(sanitizeAbsenceReason(undefined), "");
});
