import test from "node:test";
import assert from "node:assert/strict";

import {
  STUCK_TRIGGER_MIN,
  classifyVerifierObservation,
  isStuckLiveCandidate
} from "./live-ft-verifier.js";

import {
  OPERATIONAL_MATCH_STATE
} from "./non-played-state.js";

test(
  "verifier recognizes penalty final through shared contract",
  () => {
    const result =
      classifyVerifierObservation({
        status: "FT",
        rawStatus: "STATUS_FINAL_PEN"
      });

    assert.equal(
      result.operationalState,
      OPERATIONAL_MATCH_STATE.PLAYED_TERMINAL
    );

    assert.equal(result.finished, true);
    assert.equal(result.live, false);
  }
);

test(
  "verifier never treats delayed or suspended evidence as live/final",
  () => {
    const delayed =
      classifyVerifierObservation({
        status: "LIVE",
        rawStatus: "STATUS_DELAYED"
      });

    assert.equal(
      delayed.operationalState,
      OPERATIONAL_MATCH_STATE.DELAYED
    );

    assert.equal(delayed.finished, false);
    assert.equal(delayed.live, false);

    const suspended =
      classifyVerifierObservation({
        status: "SPECIAL",
        rawStatus: "STATUS_SUSPENDED"
      });

    assert.equal(
      suspended.operationalState,
      OPERATIONAL_MATCH_STATE.INTERRUPTED
    );

    assert.equal(suspended.finished, false);
    assert.equal(suspended.live, false);
  }
);

test(
  "verifier recognizes active play through shared contract",
  () => {
    const result =
      classifyVerifierObservation({
        status: "SECOND_HALF",
        rawStatus: "STATUS_IN_PROGRESS"
      });

    assert.equal(
      result.operationalState,
      OPERATIONAL_MATCH_STATE.LIVE
    );

    assert.equal(result.finished, false);
    assert.equal(result.live, true);
  }
);

test(
  "stuck-live timing is only a trigger and delayed state is excluded",
  () => {
    const kickoff =
      "2026-09-15T15:00:00.000Z";

    const now =
      Date.parse(kickoff) +
      (STUCK_TRIGGER_MIN + 1) * 60 * 1000;

    assert.equal(
      isStuckLiveCandidate(
        {
          status: "LIVE",
          rawStatus: "STATUS_IN_PROGRESS",
          kickoffUtc: kickoff
        },
        now
      ),
      true
    );

    assert.equal(
      isStuckLiveCandidate(
        {
          status: "LIVE",
          rawStatus: "STATUS_DELAYED",
          kickoffUtc: kickoff
        },
        now
      ),
      false
    );
  }
);
