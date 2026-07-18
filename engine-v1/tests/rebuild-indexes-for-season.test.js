import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveSeasonFromDay,
  collectIndexRebuildTargets
} from "../jobs/rebuild-indexes-for-season.js";

import {
  resolveTargetDateFromDay
} from "../jobs/build-current-season-indexes.js";

test(
  "July remains in the Aug-to-Jul global season",
  () => {
    assert.equal(
      resolveSeasonFromDay("2026-07-01"),
      "2025-2026"
    );

    assert.equal(
      resolveSeasonFromDay("2026-07-31"),
      "2025-2026"
    );
  }
);

test(
  "global season rolls on 1 August",
  () => {
    assert.equal(
      resolveSeasonFromDay("2026-08-01"),
      "2026-2027"
    );
  }
);

test(
  "winter date resolves to the active cross-year season",
  () => {
    assert.equal(
      resolveSeasonFromDay("2026-01-15"),
      "2025-2026"
    );
  }
);

test(
  "invalid dates fail closed",
  () => {
    assert.equal(
      resolveSeasonFromDay("2026-02-30"),
      "unknown-season"
    );

    assert.equal(
      resolveSeasonFromDay("not-a-date"),
      "unknown-season"
    );
  }
);

test(
  "catch-up rebuild targets are unique per season",
  () => {
    assert.deepEqual(
      collectIndexRebuildTargets([
        {
          day: "2026-07-16",
          season: "2025-2026",
          appended: true
        },
        {
          day: "2026-07-15",
          season: "2025-2026",
          appended: true
        },
        {
          day: "2026-08-02",
          season: "2026-2027",
          appended: true
        },
        {
          day: "2026-07-14",
          season: "2025-2026",
          appended: false
        }
      ]),
      [
        {
          season: "2025-2026",
          day: "2026-07-16"
        },
        {
          season: "2026-2027",
          day: "2026-08-02"
        }
      ]
    );
  }
);
test(
  "index target day is parsed exactly",
  () => {
    assert.equal(
      resolveTargetDateFromDay(
        "2026-07-18"
      )?.toISOString(),
      "2026-07-18T00:00:00.000Z"
    );
  }
);

test(
  "invalid index target days fail closed",
  () => {
    assert.equal(
      resolveTargetDateFromDay(
        "2026-02-30"
      ),
      null
    );

    assert.equal(
      resolveTargetDateFromDay(
        "invalid"
      ),
      null
    );
  }
);