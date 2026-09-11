import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  getFixtureAdapters
} from "../adapters/registry.js";

function flashscoreAdapter() {
  const adapter =
    getFixtureAdapters().find(
      row => row?.id === "flashscore"
    );

  assert.ok(
    adapter,
    "Flashscore fixture adapter must exist"
  );

  return adapter;
}

function fixture(overrides = {}) {
  return {
    matchId: "fixture-routing-test",
    kickoffUtc:
      "2026-09-11T18:00:00.000Z",
    home: "Home",
    away: "Away",
    country: "England",
    leagueName: "Premier League",
    leaguePath:
      "/football/england/premier-league/",
    ...overrides
  };
}

test(
  "Flashscore adapter uses strict competition identity in fetch and normalize",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../adapters/registry.js",
          import.meta.url
        ),
        "utf8"
      );

    const strictCalls =
      source.match(
        /resolveFlashscoreCompetitionIdentity\s*\(/g
      ) || [];

    assert.equal(
      strictCalls.length,
      2
    );

    assert.doesNotMatch(
      source,
      /\bresolveSlugFromPath\s*\(/u
    );

    assert.doesNotMatch(
      source,
      /\bresolveSlug\s*\(/u
    );
  }
);

test(
  "real Premier League exact path remains eng.1",
  () => {
    const row =
      flashscoreAdapter().normalize(
        fixture(),
        "eng.1"
      );

    assert.ok(row);
    assert.equal(
      row.leagueSlug,
      "eng.1"
    );
  }
);

test(
  "Premier League 2 cannot fall through to eng.1",
  () => {
    const row =
      flashscoreAdapter().normalize(
        fixture({
          leagueName:
            "Premier League 2",
          leaguePath:
            "/football/england/premier-league-2/"
        }),
        "eng.1"
      );

    assert.equal(row, null);
  }
);

test(
  "real Polish I Liga exact path remains pol.2",
  () => {
    const row =
      flashscoreAdapter().normalize(
        fixture({
          country: "Poland",
          leagueName: "Division 1",
          leaguePath:
            "/football/poland/division-1/"
        }),
        "pol.2"
      );

    assert.ok(row);
    assert.equal(
      row.leagueSlug,
      "pol.2"
    );
  }
);

test(
  "Polish III Liga Group I cannot fall through to pol.2",
  () => {
    const row =
      flashscoreAdapter().normalize(
        fixture({
          country: "Poland",
          leagueName:
            "III Liga - Group I",
          leaguePath:
            "/football/poland/iii-liga-group-i/"
        }),
        "pol.2"
      );

    assert.equal(row, null);
  }
);

test(
  "World Cup Women U20 cannot fall through to fifa.world",
  () => {
    const row =
      flashscoreAdapter().normalize(
        fixture({
          country: "World",
          leagueName:
            "World Cup Women U20",
          leaguePath:
            "/football/world/world-cup-women-u20/"
        }),
        "fifa.world"
      );

    assert.equal(row, null);
  }
);

test(
  "real FIFA World Cup exact provider path remains fifa.world",
  () => {
    const row =
      flashscoreAdapter().normalize(
        fixture({
          country: "World",
          leagueName:
            "World Championship",
          leaguePath:
            "/football/world/world-championship/"
        }),
        "fifa.world"
      );

    assert.ok(row);
    assert.equal(
      row.leagueSlug,
      "fifa.world"
    );
  }
);

test(
  "Cymru Premier exact path remains wal.1",
  () => {
    const row =
      flashscoreAdapter().normalize(
        fixture({
          country: "Wales",
          leagueName:
            "Cymru Premier",
          leaguePath:
            "/football/wales/cymru-premier/"
        }),
        "wal.1"
      );

    assert.ok(row);
    assert.equal(
      row.leagueSlug,
      "wal.1"
    );
  }
);

test(
  "resolved competition must equal requested canonical slug",
  () => {
    const row =
      flashscoreAdapter().normalize(
        fixture(),
        "eng.2"
      );

    assert.equal(row, null);
  }
);

test(
  "legacy name fallback remains available only when provider path is absent",
  () => {
    const raw =
      fixture();

    delete raw.leaguePath;

    const row =
      flashscoreAdapter().normalize(
        raw,
        "eng.1"
      );

    assert.ok(row);
    assert.equal(
      row.leagueSlug,
      "eng.1"
    );
  }
);


test(
  "legitimate Flashscore exact provider path aliases remain canonical",
  () => {
    const adapter =
      flashscoreAdapter();

    const cases = [
      {
        slug: "eng.5",
        country: "England",
        leagueName:
          "National League",
        leaguePath:
          "/football/england/national-league/"
      },
      {
        slug: "ger.3",
        country: "Germany",
        leagueName:
          "3. Liga",
        leaguePath:
          "/football/germany/3-liga/"
      },
      {
        slug: "lva.2",
        country: "Latvia",
        leagueName:
          "1. Liga",
        leaguePath:
          "/football/latvia/1-liga/"
      },
      {
        slug: "wal.2",
        country: "Wales",
        leagueName:
          "Cymru North",
        leaguePath:
          "/football/wales/cymru-north/"
      }
    ];

    for (const item of cases) {
      const row =
        adapter.normalize(
          fixture({
            country:
              item.country,
            leagueName:
              item.leagueName,
            leaguePath:
              item.leaguePath
          }),
          item.slug
        );

      assert.ok(
        row,
        item.leaguePath
      );

      assert.equal(
        row.leagueSlug,
        item.slug,
        item.leaguePath
      );
    }
  }
);
