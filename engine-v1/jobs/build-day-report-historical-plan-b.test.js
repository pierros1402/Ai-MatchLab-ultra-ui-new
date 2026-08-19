import test from "node:test";
import assert from "node:assert/strict";

import {
  isHistoricalPlanBNotAvailable
} from "./build-day-report.js";

const DAY =
  "2026-08-18";

function historicalPair() {
  const sourceContract = {
    historicalRecovery: true,
    historicalAvailability:
      "NOT_AVAILABLE",
    valueInput:
      "none_historical_not_available",
    scoringRerun: false,
    deploySnapshotInput: false,
    realBookmakerOddsUsed: false
  };

  return {
    planB: {
      ok: true,
      date: DAY,
      planId: "plan-b",
      status: "NOT_AVAILABLE",
      availability: "not_available",
      outputMode:
        "historical-not-available",
      count: 0,
      picks: [],
      sourceContract: {
        ...sourceContract
      }
    },

    audit: {
      ok: true,
      date: DAY,
      planId: "plan-b",
      status: "NOT_AVAILABLE",
      availability: "not_available",
      outputMode:
        "historical-not-available",
      count: 0,
      sourceContract: {
        ...sourceContract
      }
    }
  };
}

test(
  "accepts exact evidence-bound historical Plan B NOT_AVAILABLE",
  () => {
    const { planB, audit } =
      historicalPair();

    assert.equal(
      isHistoricalPlanBNotAvailable(
        planB,
        audit,
        DAY
      ),
      true
    );
  }
);

test(
  "does not exempt an ordinary empty Plan B",
  () => {
    const { planB, audit } =
      historicalPair();

    planB.status = "COMPLETE";
    planB.availability = "available";
    planB.outputMode = "production";

    assert.equal(
      isHistoricalPlanBNotAvailable(
        planB,
        audit,
        DAY
      ),
      false
    );
  }
);

test(
  "does not exempt populated historical Plan B output",
  () => {
    const { planB, audit } =
      historicalPair();

    planB.count = 1;
    planB.picks = [
      {
        canonicalId:
          "cid_must_not_be_exempt"
      }
    ];

    assert.equal(
      isHistoricalPlanBNotAvailable(
        planB,
        audit,
        DAY
      ),
      false
    );
  }
);

test(
  "does not exempt historical Plan B when scoring was rerun",
  () => {
    const { planB, audit } =
      historicalPair();

    audit.sourceContract.scoringRerun =
      true;

    assert.equal(
      isHistoricalPlanBNotAvailable(
        planB,
        audit,
        DAY
      ),
      false
    );
  }
);

test(
  "does not exempt historical Plan B for a different day",
  () => {
    const { planB, audit } =
      historicalPair();

    assert.equal(
      isHistoricalPlanBNotAvailable(
        planB,
        audit,
        "2026-08-19"
      ),
      false
    );
  }
);

test(
  "does not exempt historical Plan B without complete source evidence",
  () => {
    const { planB, audit } =
      historicalPair();

    delete audit
      .sourceContract
      .historicalAvailability;

    assert.equal(
      isHistoricalPlanBNotAvailable(
        planB,
        audit,
        DAY
      ),
      false
    );
  }
);
