import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveFlashscoreCompetitionIdentity
} from "../core/flashscore-competition-identity.js";

import {
  buildProviderCompetitionDiscovery
} from "../jobs/discover-provider-competitions-day.js";

function resolve(overrides = {}) {
  return resolveFlashscoreCompetitionIdentity({
    country: "England",
    leagueName: "Premier League",
    leaguePath: "/football/england/premier-league/",
    providerCompetitionId: "scope-test",
    ...overrides
  });
}

test("exact mapped senior path still resolves before scope exclusions", () => {
  const result = resolve();

  assert.equal(result.status, "resolved");
  assert.equal(result.reasonCode, "resolved_exact_provider_path");
  assert.equal(result.canonicalSlug, "eng.1");
});

test("women competition path is explicitly out of scope", () => {
  const result = resolve({
    country: "World",
    leagueName: "Asian Games Women",
    leaguePath: "/football/world/asian-games-women/"
  });

  assert.equal(result.status, "excluded");
  assert.equal(result.reasonCode, "out_of_scope_womens_competition");
  assert.equal(result.canonicalSlug, null);
});

test("age-group and Primavera competitions are explicitly out of scope", () => {
  const cases = [
    {
      country: "Uzbekistan",
      leagueName: "Super League U21",
      leaguePath: "/football/uzbekistan/super-league-u21/"
    },
    {
      country: "Italy",
      leagueName: "Primavera 1",
      leaguePath: "/football/italy/primavera-1/"
    },
    {
      country: "World",
      leagueName: "World Cup Women U20",
      leaguePath: "/football/world/world-cup-women-u20/"
    }
  ];

  for (const row of cases) {
    const result = resolve(row);
    assert.equal(result.status, "excluded", row.leagueName);
    assert.match(
      result.reasonCode,
      /^out_of_scope_(?:womens|youth)_competition$/u,
      row.leagueName
    );
  }
});

test("reserve and development competitions are explicitly out of scope", () => {
  const cases = [
    {
      leagueName: "Premier League 2",
      leaguePath: "/football/england/premier-league-2/"
    },
    {
      leagueName: "Professional Development League",
      leaguePath: "/football/england/professional-development-league/"
    }
  ];

  for (const row of cases) {
    const result = resolve(row);
    assert.equal(result.status, "excluded", row.leagueName);
    assert.equal(
      result.reasonCode,
      "out_of_scope_reserve_or_development_competition",
      row.leagueName
    );
  }
});

test("unmapped senior top-division provider path remains a candidate", () => {
  const result = resolve({
    country: "Iraq",
    leagueName: "Stars League",
    leaguePath: "/football/iraq/stars-league/",
    providerCompetitionId: "nufI7SSI"
  });

  assert.equal(result.status, "quarantined");
  assert.equal(result.reasonCode, "unmapped_provider_competition");
  assert.equal(result.canonicalSlug, null);
});

test("discovery converts hard exclusions to out_of_scope but preserves senior candidate", () => {
  const rows = [
    {
      sourceId: "women-1",
      leagueId: "women-league",
      leaguePath: "/football/world/asian-games-women/",
      country: "World",
      leagueName: "Asian Games Women",
      kickoffUtc: "2026-09-14T12:00:00.000Z",
      home: "Home W",
      away: "Away W"
    },
    {
      sourceId: "iraq-1",
      leagueId: "nufI7SSI",
      leaguePath: "/football/iraq/stars-league/",
      country: "Iraq",
      leagueName: "Stars League",
      kickoffUtc: "2026-09-14T13:00:00.000Z",
      home: "Home",
      away: "Away"
    }
  ];

  const { artifact } = buildProviderCompetitionDiscovery({
    dayKey: "2026-09-14",
    rows,
    previousRegistry: { competitions: [] },
    generatedAt: "2026-09-14T10:00:00.000Z"
  });

  const women = artifact.competitions.find(row => row.providerName === "Asian Games Women");
  const iraq = artifact.competitions.find(row => row.providerName === "Stars League");

  assert.equal(women.classification, "out_of_scope");
  assert.equal(women.publicationEligible, false);
  assert.equal(iraq.classification, "candidate");
  assert.equal(iraq.reasonCode, "unmapped_provider_competition");
  assert.equal(iraq.publicationEligible, false);
});
