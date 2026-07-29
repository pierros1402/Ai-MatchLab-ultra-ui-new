import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveFlashscoreCompetitionIdentity
} from "../core/flashscore-competition-identity.js";

test(
  "exact Flashscore path wins over broad name classification",
  () => {
    const result =
      resolveFlashscoreCompetitionIdentity({
        country: "Africa",
        leagueName:
          "Africa Cup of Nations",
        leaguePath:
          "/football/africa/africa-cup-of-nations/",
        providerCompetitionId:
          "known-afcon"
      });

    assert.equal(
      result.status,
      "resolved"
    );

    assert.equal(
      result.canonicalSlug,
      "caf.nations"
    );

    assert.equal(
      result.resolutionMethod,
      "flashscore_exact_path"
    );
  }
);

test(
  "AFCON Women is excluded instead of becoming caf.afcon",
  () => {
    const result =
      resolveFlashscoreCompetitionIdentity({
        country: "Africa",
        leagueName:
          "Africa Cup of Nations Women",
        leaguePath:
          "/football/africa/africa-cup-of-nations-women/",
        providerCompetitionId:
          "dvoOvsMc"
      });

    assert.equal(
      result.status,
      "excluded"
    );

    assert.equal(
      result.canonicalSlug,
      null
    );

    assert.equal(
      result.reasonCode,
      "out_of_scope_womens_competition"
    );
  }
);

test(
  "Kings World Cup Clubs is excluded instead of becoming fifa.world",
  () => {
    const result =
      resolveFlashscoreCompetitionIdentity({
        country: "World",
        leagueName:
          "Kings World Cup Clubs - Round 2",
        leaguePath:
          "/football/world/kings-world-cup-clubs/",
        providerCompetitionId:
          "xYvXlFc4"
      });

    assert.equal(
      result.status,
      "excluded"
    );

    assert.equal(
      result.canonicalSlug,
      null
    );

    assert.equal(
      result.reasonCode,
      "out_of_scope_non_fifa_competition"
    );
  }
);

test(
  "real FIFA World Cup exact path remains fifa.world",
  () => {
    const result =
      resolveFlashscoreCompetitionIdentity({
        country: "World",
        leagueName:
          "World Championship",
        leaguePath:
          "/football/world/world-championship/",
        providerCompetitionId:
          "real-world-cup"
      });

    assert.equal(
      result.status,
      "resolved"
    );

    assert.equal(
      result.canonicalSlug,
      "fifa.world"
    );
  }
);

test(
  "unknown provider path is quarantined instead of name-classified",
  () => {
    const result =
      resolveFlashscoreCompetitionIdentity({
        country: "World",
        leagueName:
          "Some World Cup Tournament",
        leaguePath:
          "/football/world/unknown-world-cup/",
        providerCompetitionId:
          "unknown-id"
      });

    assert.equal(
      result.status,
      "quarantined"
    );

    assert.equal(
      result.reasonCode,
      "unmapped_provider_competition"
    );

    assert.equal(
      result.canonicalSlug,
      null
    );
  }
);

test(
  "legacy international name fallback requires an absent provider path",
  () => {
    const result =
      resolveFlashscoreCompetitionIdentity({
        country: "World",
        leagueName:
          "World Championship"
      });

    assert.equal(
      result.status,
      "resolved"
    );

    assert.equal(
      result.canonicalSlug,
      "fifa.world"
    );

    assert.equal(
      result.resolutionMethod,
      "legacy_name_without_provider_path"
    );
  }
);
