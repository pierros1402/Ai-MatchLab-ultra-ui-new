import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalEspnLeagueSlug,
  espnProviderFetchSlugs
} from "./espn-league-identity.js";

test("ESPN qualifier slugs map to canonical parent competition slugs", () => {
  assert.equal(
    canonicalEspnLeagueSlug("uefa.europa.conf_qual"),
    "uefa.europa.conf"
  );
  assert.equal(
    canonicalEspnLeagueSlug("uefa.champions_qual"),
    "uefa.champions"
  );
  assert.equal(canonicalEspnLeagueSlug("usa.1"), "usa.1");
});

test("explicit provider league slug is included in the live fetch plan", () => {
  assert.deepEqual(
    espnProviderFetchSlugs("uefa.europa.conf", [
      {
        source: "espn",
        providerLeagueSlug: "uefa.europa.conf_qual"
      }
    ]),
    ["uefa.europa.conf", "uefa.europa.conf_qual"]
  );
});

test("legacy ESPN rows without provider slug fetch known aliases", () => {
  assert.deepEqual(
    espnProviderFetchSlugs("uefa.europa.conf", [
      { source: "espn", sourceId: "401896232" }
    ]),
    ["uefa.europa.conf", "uefa.europa.conf_qual"]
  );
});

test("non-ESPN rows do not expand the ESPN fetch plan", () => {
  assert.deepEqual(
    espnProviderFetchSlugs("uefa.europa.conf", [
      { source: "flashscore", sourceId: "abc" }
    ]),
    ["uefa.europa.conf"]
  );
});
