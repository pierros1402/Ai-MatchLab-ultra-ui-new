import test from "node:test";
import assert from "node:assert/strict";

import {
  assessDetailStatusState,
  synchronizeDetailStatusState
} from "../core/detail-status-sync.js";

function detail({
  status = "PRE",
  rawStatus = "STATUS_SCHEDULED",
  minute = "0'",
  scoreHome = 0,
  scoreAway = 0
} = {}) {
  return {
    basic: {
      status,
      rawStatus,
      minute,
      scoreHome,
      scoreAway
    },
    meta: {
      signature: JSON.stringify({
        matchId: "provider-id",
        dayKey: "2026-07-18",
        status,
        rawStatus,
        minute: String(minute || ""),
        scoreHome,
        scoreAway,
        preservedContext: "must-stay"
      })
    }
  };
}

test("played-final synchronization repairs basic state and signature together", () => {
  const payload = detail({
    status: "SECOND_HALF",
    rawStatus: "STATUS_SECOND_HALF",
    minute: "89'",
    scoreHome: 0,
    scoreAway: 2
  });

  payload.meta.signature = JSON.stringify({
    matchId: "401861427",
    status: "PRE",
    rawStatus: "STATUS_SCHEDULED",
    minute: "0'",
    scoreHome: 0,
    scoreAway: 0,
    preservedContext: "must-stay"
  });

  const result = synchronizeDetailStatusState(
    payload,
    {
      status: "FT",
      rawStatus: "STATUS_FULL_TIME",
      minute: "90'+4'",
      scoreHome: 0,
      scoreAway: 2
    },
    { patchedAt: "2026-07-22T00:00:00.000Z" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(payload.basic.status, "FT");
  assert.equal(payload.basic.rawStatus, "STATUS_FULL_TIME");
  assert.equal(payload.basic.minute, "90'+4'");
  assert.equal(payload.basic.scoreHome, 0);
  assert.equal(payload.basic.scoreAway, 2);
  assert.equal(payload.basic.lastStatusPatchedAt, "2026-07-22T00:00:00.000Z");

  const signature = JSON.parse(payload.meta.signature);
  assert.equal(signature.status, "FT");
  assert.equal(signature.rawStatus, "STATUS_FULL_TIME");
  assert.equal(signature.minute, "90'+4'");
  assert.equal(signature.scoreHome, 0);
  assert.equal(signature.scoreAway, 2);
  assert.equal(signature.matchId, "401861427");
  assert.equal(signature.preservedContext, "must-stay");
});

test("postponed synchronization clears manufactured zero-zero and minute", () => {
  const payload = detail({
    status: "SPECIAL",
    rawStatus: "STATUS_POSTPONED",
    minute: "0'",
    scoreHome: 0,
    scoreAway: 0
  });

  const result = synchronizeDetailStatusState(payload, {
    status: "SPECIAL",
    rawStatus: "STATUS_POSTPONED",
    minute: "0'",
    scoreHome: 0,
    scoreAway: 0
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(payload.basic.status, "SPECIAL");
  assert.equal(payload.basic.rawStatus, "STATUS_POSTPONED");
  assert.equal(payload.basic.minute, null);
  assert.equal(payload.basic.scoreHome, null);
  assert.equal(payload.basic.scoreAway, null);

  const signature = JSON.parse(payload.meta.signature);
  assert.equal(signature.status, "SPECIAL");
  assert.equal(signature.rawStatus, "STATUS_POSTPONED");
  assert.equal(signature.minute, "");
  assert.equal(signature.scoreHome, null);
  assert.equal(signature.scoreAway, null);
});

test("clean postponed control remains byte-semantically unchanged", () => {
  const payload = detail({
    status: "STATUS_POSTPONED",
    rawStatus: "STATUS_POSTPONED",
    minute: null,
    scoreHome: null,
    scoreAway: null
  });

  const before = JSON.stringify(payload);
  const result = synchronizeDetailStatusState(payload, {
    status: "STATUS_POSTPONED",
    rawStatus: "STATUS_POSTPONED",
    minute: null,
    scoreHome: null,
    scoreAway: null
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(JSON.stringify(payload), before);
});

test("real zero-zero final remains a played result", () => {
  const payload = detail({
    status: "PRE",
    rawStatus: "STATUS_SCHEDULED",
    minute: null,
    scoreHome: null,
    scoreAway: null
  });

  const result = synchronizeDetailStatusState(payload, {
    status: "FT",
    rawStatus: "STATUS_FINAL",
    minute: 90,
    scoreHome: 0,
    scoreAway: 0
  });

  assert.equal(result.ok, true);
  assert.equal(payload.basic.scoreHome, 0);
  assert.equal(payload.basic.scoreAway, 0);
  assert.equal(payload.basic.minute, 90);

  const signature = JSON.parse(payload.meta.signature);
  assert.equal(signature.scoreHome, 0);
  assert.equal(signature.scoreAway, 0);
  assert.equal(signature.minute, "90");
});

test("malformed signature fails closed without partial mutation", () => {
  const payload = detail();
  payload.meta.signature = "{not-json";
  const before = JSON.stringify(payload);

  const assessment = assessDetailStatusState(payload, {
    status: "FT",
    rawStatus: "STATUS_FINAL",
    minute: 90,
    scoreHome: 1,
    scoreAway: 0
  });

  assert.equal(assessment.ok, false);
  assert.equal(assessment.reason, "detail_signature_invalid_json");

  const result = synchronizeDetailStatusState(payload, {
    status: "FT",
    rawStatus: "STATUS_FINAL",
    minute: 90,
    scoreHome: 1,
    scoreAway: 0
  });

  assert.equal(result.ok, false);
  assert.equal(result.changed, false);
  assert.equal(JSON.stringify(payload), before);
});

test("statusType remains schema-optional when detail basic omits it", () => {
  const payload = detail({
    status: "FT",
    rawStatus: "STATUS_FINAL",
    minute: "FT",
    scoreHome: 1,
    scoreAway: 0
  });

  assert.equal(
    Object.prototype.hasOwnProperty.call(payload.basic, "statusType"),
    false
  );

  const result = synchronizeDetailStatusState(payload, {
    status: "FT",
    rawStatus: "STATUS_FINAL",
    statusType: "STATUS_FINAL",
    minute: "FT",
    scoreHome: 1,
    scoreAway: 0
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(payload.basic, "statusType"),
    false
  );
});

test("FT and final stoppage clock are display-equivalent", () => {
  const payload = detail({
    status: "FT",
    rawStatus: "STATUS_FULL_TIME",
    minute: "FT",
    scoreHome: 1,
    scoreAway: 1
  });

  const before = JSON.stringify(payload);
  const result = synchronizeDetailStatusState(payload, {
    status: "FT",
    rawStatus: "STATUS_FULL_TIME",
    statusType: "STATUS_FINAL",
    minute: "90'+5'",
    scoreHome: 1,
    scoreAway: 1
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(JSON.stringify(payload), before);
});

test("nonterminal clock drift is never display-equivalent", () => {
  const payload = detail({
    status: "SECOND_HALF",
    rawStatus: "STATUS_SECOND_HALF",
    minute: "89'",
    scoreHome: 0,
    scoreAway: 2
  });

  const result = assessDetailStatusState(payload, {
    status: "FT",
    rawStatus: "STATUS_FULL_TIME",
    minute: "90'+4'",
    scoreHome: 0,
    scoreAway: 2
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.basicDifferences.some((item) => item.field === "minute"),
    true
  );
});
