import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("./index.js", import.meta.url),
  "utf8"
);

test(
  "runtime value-comparison validator accepts an explicit unrecoverable Plan A gap",
  () => {
    assert.match(
      source,
      /const unrecoverablePlanAGapValid = Boolean\(/
    );

    assert.match(
      source,
      /payload\?\.comparisonEligible === false/
    );

    assert.match(
      source,
      /payload\?\.planAAvailability\?\.status === "unrecoverable"/
    );

    assert.match(
      source,
      /payload\?\.plans\?\.A === null/
    );

    assert.match(
      source,
      /\(!ordinaryComparisonValid && !unrecoverablePlanAGapValid\)/
    );
  }
);

test(
  "runtime value-comparison validator still requires Plan B",
  () => {
    assert.match(
      source,
      /payload\?\.plans\?\.B/
    );
  }
);
