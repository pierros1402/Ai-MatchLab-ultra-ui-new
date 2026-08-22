import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveFlashscoreCompetitionIdentity,
  resolveFlashscoreCompetitionSlug
} from "../odds/flashscore-competition-identity.js";
import { getFixtureAdapterById } from "../adapters/registry.js";

function fsRow(overrides = {}) {
  return {
    matchId: "fs-test-match",
    country: "England",
    leagueName: "Premier League",
    leaguePath: "/football/england/premier-league/",
    home: "Home FC",
    away: "Away FC",
    kickoffUtc: "2026-08-22T14:00:00.000Z",
    ...overrides
  };
}

test("covered English senior Flashscore paths resolve deterministically", () => {
  const cases = [
    ["/football/england/premier-league/", "eng.1"],
    ["/football/england/championship/", "eng.2"],
    ["/football/england/league-one/", "eng.3"],
    ["/football/england/league-two/", "eng.4"],
    ["/football/england/national-league/", "eng.5"]
  ];

  for (const [leaguePath, expected] of cases) {
    const identity = resolveFlashscoreCompetitionIdentity(fsRow({ leaguePath }));
    assert.equal(identity.slug, expected, leaguePath);
    assert.equal(identity.authoritative, true, leaguePath);
    assert.equal(identity.resolution, "provider_path", leaguePath);
  }
});

test("Germany 3. Liga provider path resolves to the declared third tier", () => {
  assert.equal(
    resolveFlashscoreCompetitionSlug({
      country: "Germany",
      leagueName: "3. Liga",
      leaguePath: "/football/germany/3-liga/"
    }),
    "ger.3"
  );
});

test("provider path is authoritative and blocks youth/regional contamination", () => {
  const rejected = [
    ["Premier League 2", "/football/england/premier-league-2/"],
    ["National League North", "/football/england/national-league-north/"],
    ["National League South", "/football/england/national-league-south/"],
    ["Isthmian League Premier Division", "/football/england/isthmian-league-premier-division/"],
    ["Southern League Premier Central", "/football/england/southern-league-premier-central/"]
  ];

  for (const [leagueName, leaguePath] of rejected) {
    const identity = resolveFlashscoreCompetitionIdentity({
      country: "England",
      leagueName,
      leaguePath
    });

    assert.equal(identity.slug, null, `${leagueName} must not enter a senior slug`);
    assert.equal(identity.authoritative, true);
    assert.equal(identity.resolution, "provider_path_unmapped");
  }
});

test("known provider path outranks a misleading competition display name", () => {
  const identity = resolveFlashscoreCompetitionIdentity({
    country: "England",
    leagueName: "Premier League",
    leaguePath: "/football/england/league-one/"
  });

  assert.equal(identity.slug, "eng.3");
  assert.equal(identity.resolution, "provider_path");
});

test("pathless compatibility rows may still use legacy name resolution", () => {
  const identity = resolveFlashscoreCompetitionIdentity({
    country: "England",
    leagueName: "Premier League",
    leaguePath: null
  });

  assert.equal(identity.slug, "eng.1");
  assert.equal(identity.authoritative, false);
  assert.equal(identity.resolution, "domestic_name_fallback");
});

test("Flashscore adapter refuses unresolved provider competition instead of inheriting requested slug", () => {
  const adapter = getFixtureAdapterById("flashscore");
  assert.ok(adapter);

  const youth = adapter.normalize(
    fsRow({
      matchId: "pl2-test",
      leagueName: "Premier League 2",
      leaguePath: "/football/england/premier-league-2/",
      home: "Arsenal U21",
      away: "Crystal Palace U21"
    }),
    "eng.1"
  );

  assert.equal(youth, null);
});

test("Flashscore adapter keeps exact requested senior competition", () => {
  const adapter = getFixtureAdapterById("flashscore");
  assert.ok(adapter);

  const senior = adapter.normalize(
    fsRow({
      matchId: "league-one-test",
      leagueName: "League One",
      leaguePath: "/football/england/league-one/",
      home: "Doncaster",
      away: "Barnsley"
    }),
    "eng.3"
  );

  assert.ok(senior);
  assert.equal(senior.leagueSlug, "eng.3");
  assert.equal(senior.providerLeaguePath, "/football/england/league-one/");
  assert.equal(senior.competitionIdentityResolution, "provider_path");
  assert.equal(senior.competitionIdentityAuthoritative, true);
});
