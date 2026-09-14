import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveFlashscoreCompetitionIdentity
} from "../core/flashscore-competition-identity.js";

function identity({
  country,
  leagueName,
  leaguePath
}) {
  return resolveFlashscoreCompetitionIdentity({
    country,
    leagueName,
    leaguePath
  });
}

function assertExcluded(input, reasonCode) {
  const result = identity(input);

  assert.equal(result.ok, true, input.leaguePath);
  assert.equal(result.status, "excluded", input.leaguePath);
  assert.equal(result.canonicalSlug, null, input.leaguePath);
  assert.equal(result.reasonCode, reasonCode, input.leaguePath);
  assert.equal(
    result.resolutionMethod,
    "flashscore_explicit_scope_policy",
    input.leaguePath
  );
}

function assertStillCandidate(input) {
  const result = identity(input);

  assert.equal(result.ok, false, input.leaguePath);
  assert.equal(result.status, "quarantined", input.leaguePath);
  assert.equal(result.canonicalSlug, null, input.leaguePath);
  assert.equal(
    result.reasonCode,
    "unmapped_provider_competition",
    input.leaguePath
  );
}

test("generic women competitions are explicitly out of scope", () => {
  const cases = [
    {
      country: "Germany",
      leagueName: "Bundesliga Women",
      leaguePath: "/football/germany/bundesliga-women/"
    },
    {
      country: "USA",
      leagueName: "NWSL Women",
      leaguePath: "/football/usa/nwsl-women/"
    },
    {
      country: "World",
      leagueName: "Friendly International Women",
      leaguePath: "/football/world/friendly-international-women/"
    }
  ];

  for (const item of cases) {
    assertExcluded(
      item,
      "out_of_scope_womens_competition"
    );
  }
});

test("generic youth age bands are explicitly out of scope", () => {
  const cases = [
    {
      country: "Brazil",
      leagueName: "Brasileiro U17",
      leaguePath: "/football/brazil/brasileiro-u17/"
    },
    {
      country: "Portugal",
      leagueName: "Liga Next Gen U23",
      leaguePath: "/football/portugal/liga-next-gen-u23/"
    },
    {
      country: "Turkey",
      leagueName: "U19 League",
      leaguePath: "/football/turkey/u19-league/"
    }
  ];

  for (const item of cases) {
    assertExcluded(
      item,
      "out_of_scope_youth_or_reserve_competition"
    );
  }
});

test("known reserve and development competitions are explicitly out of scope", () => {
  const cases = [
    {
      country: "England",
      leagueName: "Premier League 2",
      leaguePath: "/football/england/premier-league-2/"
    },
    {
      country: "England",
      leagueName: "Professional Development League",
      leaguePath: "/football/england/professional-development-league/"
    },
    {
      country: "Italy",
      leagueName: "Primavera 1",
      leaguePath: "/football/italy/primavera-1/"
    },
    {
      country: "Ukraine",
      leagueName: "Premier League 2",
      leaguePath: "/football/ukraine/premier-league-2/"
    }
  ];

  for (const item of cases) {
    assertExcluded(
      item,
      "out_of_scope_youth_or_reserve_competition"
    );
  }
});

test("country-specific leagues below the declared tier boundary are excluded", () => {
  const cases = [
    {
      country: "Argentina",
      leagueName: "Primera C",
      leaguePath: "/football/argentina/primera-c/"
    },
    {
      country: "Brazil",
      leagueName: "Serie C - Second stage",
      leaguePath: "/football/brazil/serie-c/"
    },
    {
      country: "England",
      leagueName: "Isthmian League Premier Division",
      leaguePath: "/football/england/isthmian-league-premier-division/"
    },
    {
      country: "Estonia",
      leagueName: "Esiliiga B",
      leaguePath: "/football/estonia/esiliiga-b/"
    },
    {
      country: "Japan",
      leagueName: "J3 League",
      leaguePath: "/football/japan/j3-league/"
    },
    {
      country: "Mexico",
      leagueName: "Liga Premier Serie A",
      leaguePath: "/football/mexico/liga-premier-serie-a/"
    },
    {
      country: "Norway",
      leagueName: "Division 3 - Group 4",
      leaguePath: "/football/norway/division-3-group-4/"
    },
    {
      country: "Russia",
      leagueName: "FNL 2 - Division B - Group 4",
      leaguePath: "/football/russia/fnl-2-division-b-group-4/"
    },
    {
      country: "Sweden",
      leagueName: "Division 2 - Sodra Svealand",
      leaguePath: "/football/sweden/division-2-sodra-svealand/"
    },
    {
      country: "Ukraine",
      leagueName: "Druha Liga",
      leaguePath: "/football/ukraine/druha-liga/"
    },
    {
      country: "USA",
      leagueName: "USL League One",
      leaguePath: "/football/usa/usl-league-one/"
    }
  ];

  for (const item of cases) {
    assertExcluded(
      item,
      "out_of_scope_lower_tier_competition"
    );
  }
});

test("regional competitions outside the declared national tiers are excluded", () => {
  const cases = [
    {
      country: "Brazil",
      leagueName: "Carioca B2",
      leaguePath: "/football/brazil/carioca-b2/"
    },
    {
      country: "Brazil",
      leagueName: "Copa FMF (Mato Grosso)",
      leaguePath: "/football/brazil/copa-fmf-mato-grosso/"
    },
    {
      country: "India",
      leagueName: "Calcutta Premier Division",
      leaguePath: "/football/india/calcutta-premier-division/"
    }
  ];

  for (const item of cases) {
    assertExcluded(
      item,
      "out_of_scope_regional_competition"
    );
  }
});

test("genuine unresolved first or second tier coverage gaps remain candidates", () => {
  const cases = [
    ["Bhutan", "Premier League", "/football/bhutan/premier-league/"],
    ["Bolivia", "Copa Simon Bolivar", "/football/bolivia/copa-simon-bolivar/"],
    ["Costa Rica", "Primera Division - Apertura", "/football/costa-rica/primera-division/"],
    ["Dominican Republic", "LDF", "/football/dominican-republic/ldf/"],
    ["El Salvador", "Primera Division - Apertura", "/football/el-salvador/primera-division/"],
    ["Guatemala", "Liga Nacional - Apertura", "/football/guatemala/liga-nacional/"],
    ["Honduras", "Liga Nacional - Apertura", "/football/honduras/liga-nacional/"],
    ["Iraq", "Stars League", "/football/iraq/stars-league/"],
    ["Panama", "LPF - Apertura", "/football/panama/lpf/"],
    ["Paraguay", "Copa de Primera - Clausura", "/football/paraguay/copa-de-primera/"],
    ["Paraguay", "Division Intermedia", "/football/paraguay/division-intermedia/"],
    ["Singapore", "Premier League", "/football/singapore/premier-league/"],
    ["Sri Lanka", "Super League", "/football/sri-lanka/super-league/"]
  ];

  for (const [country, leagueName, leaguePath] of cases) {
    assertStillCandidate({
      country,
      leagueName,
      leaguePath
    });
  }
});

test("ambiguous undeclared inter-club competitions remain candidates", () => {
  assertStillCandidate({
    country: "Asia",
    leagueName: "ASEAN Club Championship - Qualification",
    leaguePath: "/football/asia/asean-club-championship/"
  });
});

test("declared exact-path competitions still resolve before scope policy", () => {
  const result = identity({
    country: "England",
    leagueName: "Premier League",
    leaguePath: "/football/england/premier-league/"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "resolved");
  assert.equal(result.canonicalSlug, "eng.1");
  assert.equal(result.reasonCode, "resolved_exact_provider_path");
});
