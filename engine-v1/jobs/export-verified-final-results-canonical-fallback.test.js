import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL(
    "./export-verified-final-results-day.js",
    import.meta.url
  ),
  "utf8"
);

test(
  "all-fixtures export uses canonical rows when snapshot fixtures are absent",
  () => {
    assert.match(
      source,
      /allFixtures && fixtures\.length === 0\s*\?\s*canonicalFixtures\s*:\s*fixtures/u
    );

    assert.match(
      source,
      /canonical_fixtures_fallback/u
    );

    assert.match(
      source,
      /targetRowsFromCanonicalFallback/u
    );
  }
);

test(
  "snapshot fixtures remain preferred when present",
  () => {
    assert.match(
      source,
      /fixtures\.length > 0\s*\?\s*"deploy_snapshot_fixtures"\s*:\s*"canonical_fixtures_fallback"/u
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
      /targetsById\.set\(\s*target\.matchId,\s*target\s*\)/u
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
