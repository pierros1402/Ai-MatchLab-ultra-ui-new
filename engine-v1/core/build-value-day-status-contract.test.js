import test from "node:test";
import assert from "node:assert/strict";

import {
  isPreMatchFixtureStatus
} from "./build-value-day.js";

test(
  "Plan A accepts canonical scheduled status variants",
  () => {
    assert.equal(
      isPreMatchFixtureStatus({
        status: "PRE",
        rawStatus: "STATUS_SCHEDULED"
      }),
      true
    );

    assert.equal(
      isPreMatchFixtureStatus({
        status: "STATUS_SCHEDULED",
        rawStatus: "STATUS_SCHEDULED"
      }),
      true
    );

    assert.equal(
      isPreMatchFixtureStatus({
        status: "SCHEDULED"
      }),
      true
    );

    assert.equal(
      isPreMatchFixtureStatus({
        statusType: "STATUS_NOT_STARTED"
      }),
      true
    );
  }
);

test(
  "Plan A rejects live and terminal status variants",
  () => {
    const rejected = [
      {
        status: "LIVE"
      },
      {
        rawStatus: "STATUS_IN_PROGRESS"
      },
      {
        status: "FIRST_HALF"
      },
      {
        status: "FT"
      },
      {
        rawStatus: "STATUS_FULL_TIME"
      },
      {
        statusType: "STATUS_FINAL"
      },
      {
        status: "STATUS_POSTPONED"
      },
      {
        status: "STATUS_CANCELLED"
      }
    ];

    for (const fixture of rejected) {
      assert.equal(
        isPreMatchFixtureStatus(
          fixture
        ),
        false,
        JSON.stringify(fixture)
      );
    }
  }
);

test(
  "terminal evidence overrides a stale PRE token",
  () => {
    assert.equal(
      isPreMatchFixtureStatus({
        status: "PRE",
        rawStatus: "STATUS_FULL_TIME"
      }),
      false
    );

    assert.equal(
      isPreMatchFixtureStatus({
        status: "PRE",
        statusType: "STATUS_POSTPONED"
      }),
      false
    );
  }
);

test(
  "missing or unknown status is fail closed",
  () => {
    assert.equal(
      isPreMatchFixtureStatus({}),
      false
    );

    assert.equal(
      isPreMatchFixtureStatus({
        status: "UNKNOWN"
      }),
      false
    );
  }
);
