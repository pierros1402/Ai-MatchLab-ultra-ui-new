import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalDomesticDivisionLevel,
  getLeagueMeta,
  getLeagueMetaMap
} from "./league-awareness-service.js";

test("canonical domestic division comes from senior league slug, not coverage tier", () => {
  assert.equal(canonicalDomesticDivisionLevel("ukr.1", "league"), 1);
  assert.equal(canonicalDomesticDivisionLevel("ukr.2", "league"), 2);
  assert.equal(canonicalDomesticDivisionLevel("eng.5", "league"), 5);
  assert.equal(canonicalDomesticDivisionLevel("ukr.cup", "cup"), null);
  assert.equal(canonicalDomesticDivisionLevel("uefa.champions", "continental"), null);
});

test("internal awareness metadata preserves coverage tier", () => {
  const first = getLeagueMeta("ukr.1");
  const second = getLeagueMeta("ukr.2");

  assert.equal(first.tier, 2);
  assert.equal(first.coverageTier, 2);
  assert.equal(first.divisionLevel, 1);

  assert.equal(second.tier, 3);
  assert.equal(second.coverageTier, 3);
  assert.equal(second.divisionLevel, 2);
});

test("display metadata exposes real Ukrainian football division while retaining coverage tier", () => {
  const map = getLeagueMetaMap();

  assert.equal(map["ukr.1"].name, "Ukrainian Premier League");
  assert.equal(map["ukr.1"].tier, 1);
  assert.equal(map["ukr.1"].divisionLevel, 1);
  assert.equal(map["ukr.1"].coverageTier, 2);

  assert.equal(map["ukr.2"].name, "Ukrainian First League");
  assert.equal(map["ukr.2"].tier, 2);
  assert.equal(map["ukr.2"].divisionLevel, 2);
  assert.equal(map["ukr.2"].coverageTier, 3);
});
