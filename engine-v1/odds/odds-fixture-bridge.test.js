import test from "node:test";
import assert from "node:assert/strict";

import {
  stripCountrySuffix,
  scorePair,
  resolveOddsForFixtures
} from "./odds-fixture-bridge.js";

const KO = "2026-07-14T18:00:00.000Z";

test("stripCountrySuffix removes trailing country codes only", () => {
  assert.equal(stripCountrySuffix("KuPS (Fin)"), "KuPS");
  assert.equal(stripCountrySuffix("Drita (Kos)"), "Drita");
  assert.equal(stripCountrySuffix("Inter Escaldes (And)"), "Inter Escaldes");
  // A legitimate parenthetical that is not a 2-4 letter code is left alone.
  assert.equal(stripCountrySuffix("Team (Reserves)"), "Team (Reserves)");
  assert.equal(stripCountrySuffix("Ayr United"), "Ayr United");
});

test("scorePair matches a country-suffixed odds name to the ESPN fixture", () => {
  const s = scorePair(
    { homeTeam: "KuPS Kuopio", awayTeam: "Vardar", kickoffUtc: KO },
    { home: "KuPS (Fin)", away: "Vardar (Mkd)", kickoffUtc: KO }
  );
  assert.ok(s && s.score >= 2, "both sides share a token");
});

test("scorePair matches an abbreviated flashscore name (subset) but ranks below exact", () => {
  const subset = scorePair(
    { homeTeam: "Ayr United", awayTeam: "Falkirk", kickoffUtc: KO },
    { home: "Ayr", away: "Falkirk", kickoffUtc: KO }
  );
  const exact = scorePair(
    { homeTeam: "Falkirk", awayTeam: "Ayr", kickoffUtc: KO },
    { home: "Falkirk", away: "Ayr", kickoffUtc: KO }
  );
  assert.ok(subset && exact);
  assert.ok(exact.score > subset.score, "an exact token-set match outscores a subset");
});

test("scorePair rejects when only ONE side agrees", () => {
  const s = scorePair(
    { homeTeam: "Dundee United", awayTeam: "Montrose", kickoffUtc: KO },
    { home: "Dundee FC", away: "Annan", kickoffUtc: KO }
  );
  assert.equal(s, null, "shared 'dundee' on home only must not match");
});

test("scorePair rejects when kickoffs are far apart", () => {
  const s = scorePair(
    { homeTeam: "Falkirk", awayTeam: "Ayr United", kickoffUtc: "2026-07-14T12:00:00Z" },
    { home: "Falkirk", away: "Ayr", kickoffUtc: "2026-07-14T20:00:00Z" }
  );
  assert.equal(s, null, "8h apart is beyond the 3h tolerance");
});

test("resolveOddsForFixtures joins slug-agnostically and is 1:1", () => {
  const fixtures = [
    { canonicalId: "cid_scotennents_falkirk_ayrunited", homeTeam: "Falkirk", awayTeam: "Ayr United", kickoffUtc: KO },
    { canonicalId: "cid_scotennents_eastfife_greenockmorton", homeTeam: "East Fife", awayTeam: "Greenock Morton", kickoffUtc: KO },
    { canonicalId: "cid_uefachampions_kups_vardar", homeTeam: "KuPS Kuopio", awayTeam: "Vardar", kickoffUtc: KO },
    { canonicalId: "cid_scotennents_montrose_dundeeutd", homeTeam: "Montrose", awayTeam: "Dundee United", kickoffUtc: KO }
  ];
  const odds = [
    { canonicalId: "cid_fsscot_falkirk_ayr", home: "Falkirk", away: "Ayr", kickoffUtc: KO, aiAssessment: { markets: {} } },
    { canonicalId: "cid_fsscot_eastfife_morton", home: "East Fife", away: "Morton", kickoffUtc: KO, aiAssessment: { markets: {} } },
    { canonicalId: "cid_uefachampions_kups_vardar_fs", home: "KuPS (Fin)", away: "Vardar (Mkd)", kickoffUtc: KO, aiAssessment: { markets: {} } }
    // no odds entry for Montrose vs Dundee United — a genuine coverage gap
  ];

  const res = resolveOddsForFixtures(fixtures, odds);
  assert.equal(res.matched, 3, "three fixtures recover their odds");
  assert.equal(res.ceiling, 3, "only three fixtures had any candidate");
  assert.equal(
    res.byFixtureId.get("cid_scotennents_falkirk_ayrunited").canonicalId,
    "cid_fsscot_falkirk_ayr"
  );
  assert.equal(
    res.byFixtureId.get("cid_uefachampions_kups_vardar").canonicalId,
    "cid_uefachampions_kups_vardar_fs"
  );
  assert.ok(
    !res.byFixtureId.has("cid_scotennents_montrose_dundeeutd"),
    "the unpriced fixture stays unmatched — no fabricated odds"
  );
});

test("resolveOddsForFixtures never reuses one odds entry for two fixtures", () => {
  // Two same-day fixtures that both share a token with ONE odds entry: only the
  // stronger (exact) one may claim it.
  const fixtures = [
    { canonicalId: "f_exact", homeTeam: "Athletic", awayTeam: "Ceara", kickoffUtc: KO },
    { canonicalId: "f_partial", homeTeam: "Athletic Bilbao", awayTeam: "Ceara Mirim", kickoffUtc: KO }
  ];
  const odds = [
    { canonicalId: "o1", home: "Athletic", away: "Ceara", kickoffUtc: KO, aiAssessment: { markets: {} } }
  ];
  const res = resolveOddsForFixtures(fixtures, odds);
  assert.equal(res.matched, 1, "one odds entry → at most one fixture");
  assert.equal(res.byFixtureId.get("f_exact").canonicalId, "o1", "exact match wins the entry");
  assert.ok(!res.byFixtureId.has("f_partial"));
});
