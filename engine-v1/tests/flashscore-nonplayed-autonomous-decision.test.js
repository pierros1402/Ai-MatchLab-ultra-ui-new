import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveVerifiedFlashscoreNonPlayedDecision
} from "../source-discovery/flashscore-nonplayed-decisions.js";

const base = {
  dayKey: "2026-08-08",
  canonicalId: "cid_blr1_belshina_dinminsk_20260808",
  leagueSlug: "blr.1",
  providerMatchId: "4nadNw3N",
  canonicalSource: "flashscore",
  canonicalProviderMatchId: "4nadNw3N",
  canonicalHomeTeam: "Belshina",
  canonicalAwayTeam: "Din. Minsk",
  canonicalKickoffUtc: "2026-08-08T11:00:00.000Z",
  canonicalStatus: "STATUS_SCHEDULED",
  canonicalRawStatus: "STATUS_SCHEDULED",
  canonicalStatusType: null,
  canonicalScoreHome: null,
  canonicalScoreAway: null,
  sourceHomeTeam: "Belshina",
  sourceAwayTeam: "Din. Minsk",
  sourceKickoffUtc: "2026-08-08T11:00:00.000Z",
  statusCode: "3",
  statusDetailCode: "4",
  nonPlayedTerminal: true,
  playedFinal: false,
  finished: false,
  scoreHome: null,
  scoreAway: null
};

test("exact same-provider non-played occurrence creates a deterministic autonomous decision", () => {
  const decision =
    resolveVerifiedFlashscoreNonPlayedDecision(base);

  assert.equal(
    decision?.decisionId,
    "flashscore-nonplayed-auto-20260808-4nadNw3N-v1"
  );
  assert.equal(
    decision?.decisionMode,
    "autonomous_exact_provider_occurrence"
  );
  assert.equal(
    decision?.resolvedStatus,
    "STATUS_POSTPONED"
  );
});

test("autonomous non-played decision fails closed on every identity or truth mismatch", () => {
  const invalid = [
    { canonicalSource: "espn" },
    { canonicalProviderMatchId: "different" },
    { canonicalStatus: "FT", canonicalRawStatus: "STATUS_FINAL" },
    { canonicalScoreHome: 0 },
    { sourceAwayTeam: "Different Club" },
    { sourceKickoffUtc: "2026-08-09T11:00:00.000Z" },
    { statusDetailCode: "" },
    { nonPlayedTerminal: false },
    { playedFinal: true },
    { finished: true },
    { scoreHome: 0 }
  ];

  for (const override of invalid) {
    assert.equal(
      resolveVerifiedFlashscoreNonPlayedDecision({
        ...base,
        ...override
      }),
      null,
      JSON.stringify(override)
    );
  }
});

test("historical approved decisions remain available without autonomous evidence", () => {
  const decision =
    resolveVerifiedFlashscoreNonPlayedDecision({
      dayKey: "2026-07-19",
      canonicalId: "cid_kaz1_ertispavlodar_astana_20260719",
      providerMatchId: "ldvtm1Wg"
    });

  assert.equal(
    decision?.decisionMode,
    "approved_occurrence"
  );
  assert.equal(
    decision?.decisionId,
    "flashscore-nonplayed-20260719-ldvtm1Wg-v1"
  );
});
