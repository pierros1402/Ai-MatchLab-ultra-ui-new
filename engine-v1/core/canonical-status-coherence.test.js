import test from "node:test";
import assert from "node:assert/strict";

import {
  assertCanonicalStatusCoherence,
  findCanonicalStatusConflicts
} from "./canonical-status-coherence.js";

const baseRow = {
  canonicalId: "cid_test_home_away_20260810",
  matchId: "cid_test_home_away_20260810",
  status: "FT",
  statusType: "STATUS_FINAL",
  rawStatus: "STATUS_FULL_TIME",
  operationalState: "TERMINAL_CONFIRMED",
  scoreHome: 1,
  scoreAway: 1
};

test("accepts coherent played-final canonical status", () => {
  const payload = { fixtures: [{ ...baseRow }] };
  assert.deepEqual(findCanonicalStatusConflicts(payload), []);
  assert.equal(assertCanonicalStatusCoherence(payload), true);
});

test("rejects exact production regression FT/final with scheduled raw status", () => {
  const payload = {
    fixtures: [
      {
        ...baseRow,
        rawStatus: "STATUS_SCHEDULED"
      }
    ]
  };

  const conflicts = findCanonicalStatusConflicts(payload, { path: "data/canonical-fixtures/2026-08-10/ecu.1.json" });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].surface, "canonical");
  assert.equal(conflicts[0].rawStatus, "STATUS_SCHEDULED");
  assert.throws(
    () => assertCanonicalStatusCoherence(payload),
    /canonical_status_coherence_failed:1/
  );
});

test("rejects contradictory authoritative terminal observation even if canonical row is coherent", () => {
  const payload = {
    fixtures: [
      {
        ...baseRow,
        authoritativeTerminalWriteback: {
          schema: "ai-matchlab.authoritative-terminal-writeback.v1",
          observation: {
            status: "FT",
            statusType: "STATUS_FINAL",
            rawStatus: "STATUS_SCHEDULED",
            scoreHome: 1,
            scoreAway: 1
          }
        }
      }
    ]
  };

  const conflicts = findCanonicalStatusConflicts(payload);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].surface, "authoritativeTerminalWriteback.observation");
});

test("reports both canonical and writeback-observation conflicts when both are polluted", () => {
  const payload = {
    fixtures: [
      {
        ...baseRow,
        rawStatus: "STATUS_SCHEDULED",
        authoritativeTerminalWriteback: {
          observation: {
            status: "FT",
            statusType: "STATUS_FINAL",
            rawStatus: "STATUS_SCHEDULED"
          }
        }
      }
    ]
  };

  const conflicts = findCanonicalStatusConflicts(payload);
  assert.deepEqual(
    conflicts.map(row => row.surface),
    ["canonical", "authoritativeTerminalWriteback.observation"]
  );
});
