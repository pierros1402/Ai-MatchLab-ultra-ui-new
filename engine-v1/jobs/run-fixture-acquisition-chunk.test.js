import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  mergeCanonicalFixtures,
  serializeFixture
} from "./run-fixture-acquisition-chunk.js";

test("explicit final evidence cannot be downgraded by a scheduled acquisition row", () => {
  const previous = {
    matchId: "fixture-1",
    status: "FT",
    rawStatus: "STATUS_FINAL",
    statusType: "STATUS_FINAL",
    minute: "FT",
    scoreHome: 2,
    scoreAway: 1
  };

  const incoming = {
    matchId: "fixture-1",
    status: "STATUS_SCHEDULED",
    rawStatus: "STATUS_SCHEDULED",
    minute: null,
    scoreHome: 0,
    scoreAway: 0
  };

  const [merged] = mergeCanonicalFixtures([previous], [incoming]);

  assert.equal(merged.status, "FT");
  assert.equal(merged.rawStatus, "STATUS_FINAL");
  assert.equal(merged.statusType, "STATUS_FINAL");
  assert.equal(merged.minute, "FT");
  assert.equal(merged.scoreHome, 2);
  assert.equal(merged.scoreAway, 1);
});

test("explicit final metadata repairs a mixed scheduled-final canonical row", () => {
  const previous = {
    matchId: "fixture-2",
    status: "STATUS_SCHEDULED",
    rawStatus: "STATUS_SCHEDULED",
    statusType: "STATUS_FINAL",
    minute: "FT",
    scoreHome: 0,
    scoreAway: 0
  };

  const incoming = {
    matchId: "fixture-2",
    status: "STATUS_SCHEDULED",
    rawStatus: "STATUS_SCHEDULED"
  };

  const [merged] = mergeCanonicalFixtures([previous], [incoming]);

  assert.equal(merged.status, "FT");
  assert.equal(merged.rawStatus, "STATUS_FINAL");
  assert.equal(merged.statusType, "STATUS_FINAL");
  assert.equal(merged.minute, "FT");
});

test("authoritative incoming final evidence upgrades a scheduled row", () => {
  const previous = {
    matchId: "fixture-3",
    status: "STATUS_SCHEDULED",
    rawStatus: "STATUS_SCHEDULED",
    scoreHome: null,
    scoreAway: null
  };

  const incoming = {
    matchId: "fixture-3",
    status: "FT",
    rawStatus: "STATUS_FINAL",
    statusType: "STATUS_FINAL",
    minute: "FT",
    scoreHome: 3,
    scoreAway: 0
  };

  const [merged] = mergeCanonicalFixtures([previous], [incoming]);

  assert.equal(merged.status, "FT");
  assert.equal(merged.rawStatus, "STATUS_FINAL");
  assert.equal(merged.scoreHome, 3);
  assert.equal(merged.scoreAway, 0);
});
test("serialized supplemental fixture preserves ESPN provider league slug", () => {
  const row = serializeFixture(
    {
      canonicalId: "cid_test",
      matchId: "401896232",
      source: "espn",
      sourceId: "401896232",
      sourceMatchId: "401896232",
      providerLeagueSlug: "uefa.europa.conf_qual",
      leagueSlug: "uefa.europa.conf",
      leagueName: "UEFA Conference League",
      kickoffUtc: "2026-07-23T16:30:00.000Z",
      homeTeam: "Rigas Futbola Skola",
      awayTeam: "Vestri",
      scoreHome: null,
      scoreAway: null,
      status: "PRE",
      rawStatus: "STATUS_SCHEDULED"
    },
    "espn_all_scoreboard",
    "2026-07-23"
  );

  assert.equal(row.providerLeagueSlug, "uefa.europa.conf_qual");
  assert.equal(row.leagueSlug, "uefa.europa.conf");
});


test(
  "canonical acquisition write applies identity membership suppression after dedupe",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "./run-fixture-acquisition-chunk.js",
          import.meta.url
        ),
        "utf8"
      );

    const start =
      source.indexOf(
        "function writeCanonicalLeague("
      );

    const end =
      source.indexOf(
        "const EXPLICIT_FINAL_STATUS_TOKENS",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const body = source.slice(start, end);

    const dedupeAt =
      body.indexOf(
        "dedupeLeagueDayFixtures("
      );

    const membershipAt =
      body.indexOf(
        "applyProductionIdentityMembershipGate("
      );

    const filterAt =
      body.indexOf(
        "const membershipFilteredRows ="
      );

    const persistAt =
      body.indexOf(
        "const cleanFixtures = membershipFilteredRows"
      );

    assert.ok(dedupeAt >= 0);
    assert.ok(membershipAt > dedupeAt);
    assert.ok(filterAt > membershipAt);
    assert.ok(persistAt > filterAt);

    assert.match(
      body,
      /suppressedWithoutRetainedTarget/
    );

    assert.match(
      body,
      /canonical_acquisition_suppressed_without_retained_target/
    );

    assert.doesNotMatch(
      body,
      /const cleanFixtures = membershipGate\.rows/
    );
  }
);

test("ESPN native team evidence survives serialization and missing refresh, but conflicting evidence is quarantined", async () => {
  const {normalizeFixture} = await import("../core/normalize.js");
  const event = {id:"123456",date:"2026-11-25T18:00Z",competitions:[{competitors:[
    {homeAway:"home",team:{id:"101",displayName:"Home"}},
    {homeAway:"away",team:{id:"202",displayName:"Away"}}
  ],status:{type:{name:"STATUS_SCHEDULED"}}}]};
  const normalized = normalizeFixture(event,"ksa.1");
  assert.deepEqual(normalized.providerTeamIds,{espn:{home:"101",away:"202"}});
  const serialized = serializeFixture({...normalized,dayKey:null},"espn","2026-11-25");
  assert.deepEqual(serialized.providerTeamIds,normalized.providerTeamIds);
  const {providerTeamIds,...missing} = serialized;
  assert.deepEqual(mergeCanonicalFixtures([serialized],[missing])[0].providerTeamIds,providerTeamIds);
  const conflict = {...serialized,providerTeamIds:{espn:{home:"303",away:"202"}}};
  const [quarantined] = mergeCanonicalFixtures([serialized],[conflict]);
  assert.equal(quarantined.providerTeamIdentityConflict,true);
  assert.equal(quarantined.providerTeamIds,undefined);
  assert.equal(mergeCanonicalFixtures([quarantined],[serialized])[0].providerTeamIds,undefined);
  event.competitions[0].competitors[1].team.id = "101";
  assert.equal(normalizeFixture(event,"ksa.1").providerTeamIds,undefined);
});

test("serialization cannot resurrect quarantined provider team IDs", () => {
  const row=serializeFixture({canonicalId:"cid_test",matchId:"123",source:"espn",sourceId:"123",leagueSlug:"ksa.1",homeTeam:"Home",awayTeam:"Away",providerTeamIdentityConflict:true,providerTeamIds:{espn:{home:"101",away:"202"}}},"espn","2026-11-25");
  assert.equal(row.providerTeamIdentityConflict,true);
  assert.equal(row.providerTeamIds,undefined);
});

test("Flashscore native team IDs survive normalization, serialization and refresh", async () => {
  const { getFixtureAdapters } = await import("../adapters/registry.js");
  const adapter = getFixtureAdapters().find(a => a.id === "flashscore");
  const normalized = adapter.normalize({
    matchId: "FS123456", home: "Home", away: "Away",
    homeProviderTeamId: "FSHOME", awayProviderTeamId: "FSAWAY",
    kickoffUtc: "2026-11-28T15:00Z", country: "England", leagueName: "Premier League",
    leaguePath: "/football/england/premier-league/"
  }, "eng.1");
  assert.ok(normalized);
  const serialized = serializeFixture({ ...normalized, dayKey: null }, "flashscore", "2026-11-28");
  assert.deepEqual(serialized.providerTeamIds, { flashscore: { home: "FSHOME", away: "FSAWAY" } });
  const { providerTeamIds, ...missing } = serialized;
  assert.deepEqual(mergeCanonicalFixtures([serialized], [missing])[0].providerTeamIds, providerTeamIds);
  const conflicting = { ...serialized, providerTeamIds: { flashscore: { home: "OTHER", away: "FSAWAY" } } };
  const [quarantined] = mergeCanonicalFixtures([serialized], [conflicting]);
  assert.equal(quarantined.providerTeamIdentityConflict, true);
  assert.equal(quarantined.providerTeamIds, undefined);
  assert.equal(mergeCanonicalFixtures([quarantined], [serialized])[0].providerTeamIds, undefined);
});

test("an ESPN refresh preserves an independently verified Flashscore fixture binding", () => {
  const previous = {
    canonicalId: "cid_binding_refresh", matchId: "cid_binding_refresh",
    source: "espn", sourceId: "123", sourceMatchId: "123",
    providerIds: { espn: "123", flashscore: "nativeFS" },
    providerTeamIds: { espn: { home: "101", away: "202" },
      flashscore: { home: "nativeH1", away: "nativeA1" } },
    providerIdentityLink: { schema: "ai-matchlab.verified-provider-identity-link.v1" },
    status: "FT", scoreHome: 2, scoreAway: 1
  };
  const refresh = { ...previous, providerIds: { espn: "123" },
    providerTeamIds: { espn: { home: "101", away: "202" } } };
  delete refresh.providerIdentityLink;
  const [merged] = mergeCanonicalFixtures([previous], [refresh]);
  assert.deepEqual(merged.providerIds, previous.providerIds);
  assert.deepEqual(merged.providerTeamIds, previous.providerTeamIds);
  assert.deepEqual(merged.providerIdentityLink, previous.providerIdentityLink);
  assert.equal(merged.scoreHome, 2);
});

