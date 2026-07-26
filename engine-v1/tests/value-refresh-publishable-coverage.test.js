import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source =
  fs.readFileSync(
    new URL(
      "../jobs/refresh-value-artifacts-day.js",
      import.meta.url
    ),
    "utf8"
  );

test(
  "Value coverage uses the publishable canonical fixture universe",
  () => {
    assert.match(
      source,
      /import\s+\{\s*fixturesForSnapshotDay\s*\}\s+from\s+"\.\.\/core\/day-fixture-universe\.js";/
    );

    assert.doesNotMatch(
      source,
      /import\s+\{\s*canonicalFixturesForDay\s*\}/
    );

    const match =
      source.match(
        /function canonicalIdsForDay\(dayKey\)\s*\{([\s\S]*?)\r?\n\}/
      );

    assert.ok(
      match,
      "canonicalIdsForDay must exist"
    );

    assert.match(
      match[1],
      /fixturesForSnapshotDay\(dayKey\)/
    );

    assert.match(
      match[1],
      /\.fixtures/
    );

    assert.doesNotMatch(
      match[1],
      /canonicalFixturesForDay/
    );
  }
);

test(
  "Coverage gate remains fail closed for genuinely missing publishable fixtures",
  () => {
    assert.match(
      source,
      /const snapshotSet = new Set\(snapshotIds\);/
    );

    assert.match(
      source,
      /const missingCanonicalIds = canonicalIds\.filter\(id => !snapshotSet\.has\(id\)\);/
    );

    assert.match(
      source,
      /ok: missingCanonicalIds\.length === 0/
    );
  }
);
