import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  resolveVerifiedFinalExportCompletion
} from "./export-verified-final-results-day.js";

const source = fs.readFileSync(
  new URL(
    "./export-verified-final-results-day.js",
    import.meta.url
  ),
  "utf8"
);

test(
  "all-fixtures export always uses canonical truth for target membership",
  () => {
    assert.match(
      source,
      /const allFixtureRows = canonicalFixtures/u
    );

    assert.match(
      source,
      /allFixtures\s*\? "canonical_fixtures"/u
    );

    assert.match(
      source,
      /targetRowsFromCanonicalTruth/u
    );

    assert.match(
      source,
      /deploySnapshotFixturesUsedForTargetMembership: false/u
    );
  }
);

test(
  "snapshot fixtures cannot become all-fixtures truth membership",
  () => {
    assert.doesNotMatch(
      source,
      /deploy_snapshot_fixtures/u
    );
    assert.doesNotMatch(
      source,
      /canonical_fixtures_fallback/u
    );
  }
);

test(
  "value-picks mode retains its original source contract",
  () => {
    assert.match(
      source,
      /deploy_snapshot_value_picks/u
    );
  }
);

test(
  "report exposes actual mode and target source",
  () => {
    assert.match(
      source,
      /allFixtures,\s*targetSource,\s*fixturesPath/u
    );

    assert.match(
      source,
      /targetSource:\s*targetSource\.targetSource/u
    );

    assert.match(
      source,
      /mode:\s*targetSource\.allFixtures\s*\?\s*"all_fixtures"\s*:\s*"value_picks"/u
    );
  }
);

test(
  "target identity prefers canonical ID and preserves provider alias",
  () => {
    assert.match(
      source,
      /const canonicalMatchId =\s*clean\(\s*canonicalFixture\?\.canonicalId\s*\)/u
    );

    assert.match(
      source,
      /const targetMatchId =\s*canonicalMatchId \|\| id/u
    );

    assert.match(
      source,
      /matchId:\s*targetMatchId/u
    );

    assert.match(
      source,
      /providerMatchId,/u
    );

    assert.match(
      source,
      /bindProductionResultIdentity/u
    );

    assert.match(
      source,
      /const resolvedTarget =\s*identity\.managed\s*\?\s*identity\.row\s*:\s*target/u
    );

    assert.match(
      source,
      /targetsById\.set\(\s*resolvedTarget\.matchId,\s*resolvedTarget\s*\)/u
    );
  }
);

test(
  "target descriptive fields prefer canonical fixture truth",
  () => {
    assert.match(
      source,
      /leagueSlug:\s*leagueSlug\(canonicalFixture\)/u
    );

    assert.match(
      source,
      /homeTeam:\s*homeName\(canonicalFixture\)/u
    );

    assert.match(
      source,
      /awayTeam:\s*awayName\(canonicalFixture\)/u
    );

    assert.match(
      source,
      /canonicalFixture\?\.kickoffUtc/u
    );
  }
);

test("write-time per-match conflicts do not abort unrelated final persistence", () => {
  assert.deepEqual(
    resolveVerifiedFinalExportCompletion({ write: true, conflictCount: 2 }),
    {
      ok: true,
      truthComplete: false,
      conflictsIsolated: true
    }
  );

  assert.deepEqual(
    resolveVerifiedFinalExportCompletion({ write: false, conflictCount: 2 }),
    {
      ok: false,
      truthComplete: false,
      conflictsIsolated: false
    }
  );
});
