import test from "node:test";
import assert from "node:assert/strict";
import { collectMergedPublishedFixtureIds, resolveIntradayPublishedUniverse } from "./intraday-publication-universe.js";
import { dedupeLeagueDayFixtures } from "./fixture-dedup.js";

const dayKey = "2026-10-19";
const row = (id, homeTeam, source, sourceId) => ({ canonicalId: id, matchId: id, dayKey, leagueSlug: "esp.2", homeTeam, awayTeam: "Tenerife", kickoffUtc: `${dayKey}T18:30Z`, source, sourceId, sourceMatchId: sourceId, providerIds: { [source]: sourceId }, status: "PRE" });
const alias = row("cid_esp2_celtavigob_tenerife_20261019", "Celta Vigo B", "flashscore", "YLuihUR1");
const retained = row("cid_esp2_rcceltafortuna_tenerife_20261019", "RC Celta Fortuna", "espn", "401883309");
const publishedFixtures = [alias, retained];
const currentFixtures = dedupeLeagueDayFixtures(publishedFixtures, { slug: "esp.2" }).rows;
const publishedDetailIds = publishedFixtures.map(x => x.canonicalId);
const collect = (overrides = {}) => collectMergedPublishedFixtureIds({ dayKey, publishedFixtures, currentFixtures, publishedDetailIds, ...overrides });

test("real Celta provider identities authorize only the disappeared alias and retain detail-complete survivor", () => {
  const before = JSON.stringify(publishedFixtures);
  assert.equal(currentFixtures.length, 1);
  assert.deepEqual(collect(), [alias.canonicalId]);
  const result = resolveIntradayPublishedUniverse({ publishedFixtures, currentFixtures, publishedDetailIds, authoritativelyRemovedFixtureIds: collect() });
  assert.equal(result.ok, true);
  assert.deepEqual(result.allowedFixtureIds, [retained.canonicalId]);
  assert.equal(JSON.stringify(publishedFixtures), before);
});

test("missing retained publication or detail, ambiguous alias and absent provider proof fail closed", () => {
  assert.deepEqual(collect({ publishedFixtures: [alias] }), []);
  assert.deepEqual(collect({ publishedDetailIds: [alias.canonicalId] }), []);
  const survivor = currentFixtures[0];
  for (const patch of [{ canonicalAliases: [] }, { providerIds: { espn: "401883309" } }, { providerIds: { ...survivor.providerIds, flashscore: "wrong" } }]) {
    assert.deepEqual(collect({ currentFixtures: [{ ...survivor, ...patch }] }), []);
  }
  assert.deepEqual(collect({ currentFixtures: [survivor, { ...survivor, canonicalId: alias.canonicalId }] }), []);
  assert.deepEqual(collect({ currentFixtures: [survivor, { ...survivor, canonicalId: "ambiguous-new-survivor" }] }), []);
});

test("time, competition, orientation, squad and explicit identity conflicts veto merge publication", () => {
  for (const patch of [{ kickoffUtc: `${dayKey}T18:31Z` }, { dayKey: "2026-10-20" }, { leagueSlug: "esp.1" }, { homeTeam: "Tenerife", awayTeam: "RC Celta Fortuna" }, { homeTeam: "Celta Vigo" }, { hasConflict: true }, { reconcileMeta: { disagreement: true } }, { homeGlobalClubId: "other" }]) {
    const source = { ...alias, homeGlobalClubId: "celta-b" };
    assert.deepEqual(collect({ publishedFixtures: [source, retained], currentFixtures: [{ ...currentFixtures[0], ...patch }] }), []);
  }
});

test("published terminal score and finality cannot be discarded through dedup", () => {
  const source = { ...alias, status: "FT", scoreHome: 1, scoreAway: 2 };
  const final = { ...currentFixtures[0], status: "FT", scoreHome: 1, scoreAway: 2 };
  assert.deepEqual(collect({ publishedFixtures: [source, retained], currentFixtures: [final] }), [alias.canonicalId]);
  for (const patch of [{ status: "PRE" }, { scoreHome: 2 }, { scoreAway: null }]) assert.deepEqual(collect({ publishedFixtures: [source, retained], currentFixtures: [{ ...final, ...patch }] }), []);
});

test("unexplained missing fixtures remain blocked even beside a proven merge", () => {
  const missing = row("unexplained", "Other Club", "espn", "9999");
  const published = [...publishedFixtures, missing];
  const removals = collect({ publishedFixtures: published });
  assert.deepEqual(removals, [alias.canonicalId]);
  const result = resolveIntradayPublishedUniverse({ publishedFixtures: published, currentFixtures, publishedDetailIds: [...publishedDetailIds, "unexplained"], authoritativelyRemovedFixtureIds: removals });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unauthorizedMissingCurrentFixtureIds, ["unexplained"]);
});
