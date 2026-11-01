import test from "node:test";
import assert from "node:assert/strict";
import { resolveVerifiedFlashscoreNonPlayedDecision } from "../source-discovery/flashscore-nonplayed-decisions.js";

const original = {
  dayKey: "2026-10-30",
  canonicalId: "cid_syr1_foutoua_aljaish_20261030",
  leagueSlug: "syr.1",
  providerMatchId: "KdKrgosB",
  canonicalSource: "flashscore",
  canonicalProviderMatchId: "KdKrgosB",
  canonicalHomeTeam: "Foutoua",
  canonicalAwayTeam: "Al Jaish",
  canonicalKickoffUtc: "2026-10-30T12:00:00.000Z",
  canonicalStatus: "STATUS_SCHEDULED",
  canonicalRawStatus: "STATUS_SCHEDULED",
  canonicalScoreHome: null,
  canonicalScoreAway: null,
  sourceHomeTeam: "Foutoua",
  sourceAwayTeam: "Al Jaish",
  sourceKickoffUtc: "2026-10-30T12:00:00.000Z",
  scoreHome: null,
  scoreAway: null
};
test("external reports alone cannot self-authorize Flashscore nonplayed status", () => {
  assert.equal(resolveVerifiedFlashscoreNonPlayedDecision({
    ...original, externalFederationReport: true
  }), null);
});
test("new-day identity does not supply missing original-day terminal nonplayed codes", () => {
  assert.equal(resolveVerifiedFlashscoreNonPlayedDecision({
    ...original,
    sourceKickoffUtc: "2026-11-01T12:00:00.000Z",
    nonPlayedTerminal: true, playedFinal: false, finished: false,
    statusCode: "3", statusDetailCode: "4"
  }), null);
});
test("exact same-day provider codes are mandatory for automated approval", () => {
  const input = {
    ...original, nonPlayedTerminal: true, playedFinal: false, finished: false,
    statusCode: "3", statusDetailCode: "4"
  };
  assert.equal(resolveVerifiedFlashscoreNonPlayedDecision(input)?.resolvedStatus, "STATUS_POSTPONED");
  for (const change of [
    { statusCode: "2" }, { statusDetailCode: "3" },
    { canonicalProviderMatchId: "different" }, { sourceAwayTeam: "Different" },
    { scoreHome: 0 }, { canonicalScoreAway: 0 },
    { playedFinal: true }, { finished: true }, { nonPlayedTerminal: false }
  ]) assert.equal(resolveVerifiedFlashscoreNonPlayedDecision({ ...input, ...change }), null);
});
