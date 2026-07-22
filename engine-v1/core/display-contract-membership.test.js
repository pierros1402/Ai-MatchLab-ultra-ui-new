import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  displayFixtureIdentity,
  partitionDisplaySupplementsByFixtureIdentity,
  selectAuthoritativeDisplayUniverse
} from "./display-contract.js";

test("display fixture identity prefers canonicalId and remains exact", () => {
  assert.equal(
    displayFixtureIdentity({
      canonicalId: "cid_exact",
      matchId: "provider_1"
    }),
    "cid_exact"
  );

  assert.equal(
    displayFixtureIdentity({
      matchId: "cid_match"
    }),
    "cid_match"
  );

  assert.equal(displayFixtureIdentity({}), "");
});

test("odds rows join only through exact fixture identity", () => {
  const fixtures = [
    {
      canonicalId: "cid_fixture_a",
      homeTeam: "Shanghai Shenhua",
      awayTeam: "Qingdao Hainiu"
    },
    {
      matchId: "cid_fixture_b"
    }
  ];

  const sameNamesWrongId = {
    canonicalId: "cid_orphan",
    home: "Shanghai Shenhua",
    away: "Qingdao Hainiu"
  };

  const result =
    partitionDisplaySupplementsByFixtureIdentity(
      fixtures,
      [
        {
          matchId: "cid_fixture_a",
          market: {}
        },
        {
          canonicalId: "cid_fixture_b",
          market: {}
        },
        sameNamesWrongId,
        {
          home: "Shanghai Shenhua",
          away: "Qingdao Hainiu"
        }
      ]
    );

  assert.deepEqual(
    result.matched.map(displayFixtureIdentity),
    ["cid_fixture_a", "cid_fixture_b"]
  );

  assert.deepEqual(
    result.ignored.map(displayFixtureIdentity),
    ["cid_orphan", ""]
  );
});

test("empty fixture universe rejects every odds row", () => {
  const result =
    partitionDisplaySupplementsByFixtureIdentity(
      [],
      [
        { canonicalId: "cid_chn1_orphan" },
        { canonicalId: "cid_isl2_orphan" }
      ]
    );

  assert.equal(result.matched.length, 0);
  assert.equal(result.ignored.length, 2);
});

test("snapshot runtime cannot append odds-only fixtures", () => {
  const source = fs.readFileSync(
    new URL("../index.js", import.meta.url),
    "utf8"
  );

  const start = source.indexOf(
    "function buildSnapshotRuntimeMatches"
  );
  const end = source.indexOf(
    "function snapshotFixturesRuntimeResponse",
    start
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const block = source.slice(start, end);

  assert.match(
    block,
    /partitionDisplaySupplementsByFixtureIdentity\(fixtureRows, oddsRows\)/
  );

  assert.match(
    block,
    /oddsSupplementCount:\s*0/
  );

  assert.doesNotMatch(
    block,
    /for\s*\(const row of oddsRows\)[\s\S]*addSnapshotRuntimeMatch/
  );
});


test("real display existence universe never appends supplements", () => {
  const fixtures = [
    { canonicalId: "cid_a" },
    { canonicalId: "cid_b" }
  ];

  const result =
    selectAuthoritativeDisplayUniverse(
      fixtures,
      [
        { canonicalId: "cid_a" },
        { canonicalId: "cid_odds_orphan" }
      ],
      [
        { canonicalId: "cid_b" },
        { canonicalId: "cid_fixtures_all_orphan" }
      ]
    );

  assert.deepEqual(
    result.matches.map(displayFixtureIdentity),
    ["cid_a", "cid_b"]
  );

  assert.equal(
    result.membership.supplementsMayCreateFixture,
    false
  );

  assert.equal(
    result.membership.oddsRowsIgnoredForExistence,
    2
  );

  assert.equal(
    result.membership.fixturesAllRowsIgnoredForExistence,
    2
  );
});

test("2026-07-21 odds-only rows cannot enter the display universe", () => {
  const fixturesPayload = JSON.parse(
    fs.readFileSync(
      new URL(
        "../../data/deploy-snapshots/2026-07-21/fixtures.json",
        import.meta.url
      ),
      "utf8"
    )
  );

  const oddsPayload = JSON.parse(
    fs.readFileSync(
      new URL(
        "../../data/deploy-snapshots/2026-07-21/odds.json",
        import.meta.url
      ),
      "utf8"
    )
  );

  const fixtures = Array.isArray(fixturesPayload)
    ? fixturesPayload
    : (
        fixturesPayload.fixtures ||
        fixturesPayload.matches ||
        []
      );

  const odds = Array.isArray(oddsPayload)
    ? oddsPayload
    : (
        oddsPayload.matches ||
        oddsPayload.fixtures ||
        []
      );

  const result =
    selectAuthoritativeDisplayUniverse(
      fixtures,
      odds,
      []
    );

  const outputIds = new Set(
    result.matches
      .map(displayFixtureIdentity)
      .filter(Boolean)
  );

  const knownOrphans = [
    "cid_chn1_shanghaiport_shenzhenxinpengcheng_20260721",
    "cid_chn1_wuhanthreetowns_shandongtaishan_20260721",
    "cid_chn1_shanghaishenhua_qingdaohainiu_20260721",
    "cid_chn1_chongqingtonglianglong_qingdaowestcoast_20260721",
    "cid_chn1_yunnanyukun_chengdurongcheng_20260721",
    "cid_chn1_henansongshanlongmen_dalianyingbo_20260721",
    "cid_isl2_fylkir_afturelding_20260721"
  ];

  assert.equal(fixtures.length, 63);
  assert.equal(odds.length, 127);

  for (const id of knownOrphans) {
    assert.equal(outputIds.has(id), false);
  }
});

test("public routes bind to the patched real display builder", () => {
  const source = fs.readFileSync(
    new URL("../index.js", import.meta.url),
    "utf8"
  );

  const functionStart = source.indexOf(
    "function buildDisplayMatchesForDateUncached"
  );

  const matchesRouteStart = source.indexOf(
    'app.get("/api/matches-for-date"',
    functionStart
  );

  const runtimeRouteStart = source.indexOf(
    'app.get("/fixtures-runtime"'
  );

  assert.ok(functionStart >= 0);
  assert.ok(matchesRouteStart > functionStart);
  assert.ok(runtimeRouteStart >= 0);

  const builderBlock = source.slice(
    functionStart,
    matchesRouteStart
  );

  assert.equal(
    builderBlock.includes(
      "selectAuthoritativeDisplayUniverse("
    ),
    true
  );

  assert.equal(
    builderBlock.includes(
      "displayUniverse.matches"
    ),
    true
  );

  assert.equal(
    builderBlock.includes(
      "...fixturesAllMatches"
    ),
    false
  );

  assert.equal(
    builderBlock.includes(
      "reconcileDateMatchesForDisplay(["
    ),
    false
  );

  assert.equal(
    builderBlock.includes(
      "Fallback: fixtures-all.json"
    ),
    false
  );

  const runtimeRouteBlock = source.slice(
    runtimeRouteStart,
    matchesRouteStart
  );

  const matchesRouteBlock = source.slice(
    matchesRouteStart
  );

  assert.equal(
    runtimeRouteBlock.includes("membership"),
    true
  );

  assert.equal(
    matchesRouteBlock.includes("membership"),
    true
  );
});
