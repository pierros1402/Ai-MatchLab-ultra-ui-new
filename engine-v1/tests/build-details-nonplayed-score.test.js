import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  explicitFiniteNumberOrNull
} from "../jobs/build-details-day.js";

test("explicit score conversion preserves missing scores and real zeroes", () => {
  assert.equal(explicitFiniteNumberOrNull(null), null);
  assert.equal(explicitFiniteNumberOrNull(undefined), null);
  assert.equal(explicitFiniteNumberOrNull(""), null);
  assert.equal(explicitFiniteNumberOrNull("   "), null);
  assert.equal(explicitFiniteNumberOrNull("not-a-score"), null);

  assert.equal(explicitFiniteNumberOrNull(0), 0);
  assert.equal(explicitFiniteNumberOrNull("0"), 0);
  assert.equal(explicitFiniteNumberOrNull(2), 2);
  assert.equal(explicitFiniteNumberOrNull("3"), 3);
});

test("final details basic payload uses explicit null-safe score conversion", () => {
  const source = fs.readFileSync(
    new URL("../jobs/build-details-day.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /scoreHome:\s*explicitFiniteNumberOrNull\(match\.scoreHome\)/
  );

  assert.match(
    source,
    /scoreAway:\s*explicitFiniteNumberOrNull\(match\.scoreAway\)/
  );

  assert.doesNotMatch(
    source,
    /scoreHome:\s*Number\.isFinite\(Number\(match\.scoreHome\)\)/
  );

  assert.doesNotMatch(
    source,
    /scoreAway:\s*Number\.isFinite\(Number\(match\.scoreAway\)\)/
  );
});