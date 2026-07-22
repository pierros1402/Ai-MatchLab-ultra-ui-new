import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  displayFixtureIdentity,
  partitionDisplaySupplementsByFixtureIdentity
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
