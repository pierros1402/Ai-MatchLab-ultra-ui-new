import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateIndependentFixtureConfirmation,
  validateIndependentFixtureConfirmation,
} from "./independent-fixture-confirmer.js";

function pendingCandidate() {
  return {
    leagueSlug: "test.1",
    dayKey: "2026-08-08",
    kickoffUtc: "2026-08-08T18:45:00.000Z",
    recoveryStatus: "PENDING_INDEPENDENT_CONFIRMATION",
    promotionAuthorized: false,
    requiresIndependentConfirmation: true,
    left: {
      source: "flashscore",
      canonicalId: "fs-1",
      homeTeam: "Alpha Town",
      awayTeam: "Short Beta",
    },
    right: {
      source: "espn",
      canonicalId: "espn-1",
      homeTeam: "Long Alpha United",
      awayTeam: "Beta Athletic",
    },
  };
}

function thirdRow(overrides = {}) {
  return {
    source: "api_football",
    sourceFamily: "api_football",
    providerMatchId: "998877",
    providerLeagueId: 777,
    leagueSlug: "test.1",
    requestedDayKey: "2026-08-08",
    kickoffUtc: "2026-08-08T18:45:30.000Z",
    homeTeam: "Alpha Town FC",
    awayTeam: "Beta Athletic Club",
    homeTeamId: "101",
    awayTeamId: "202",
    evidenceUrl: "https://v3.football.api-sports.io/fixtures?id=998877",
    oddsRequested: false,
    ...overrides,
  };
}

test("independent confirmer requires an exact no-fuzzy bridge across both providers", () => {
  const result = evaluateIndependentFixtureConfirmation(
    pendingCandidate(),
    [thirdRow()],
    { observedAt: "2026-08-08T19:00:00.000Z" },
  );
  assert.equal(result.ok, true);
  assert.equal(result.status, "CONFIRMED");
  assert.equal(result.evidence.source, "api_football");
  assert.equal(result.evidence.oddsUsed, false);
  assert.equal(result.evidence.bridge.leftAway, true); // ESPN is canonical left.
  assert.equal(result.evidence.bridge.rightHome, true); // Flashscore is canonical right.
  assert.equal(
    validateIndependentFixtureConfirmation(pendingCandidate(), result.evidence).ok,
    true,
  );
});

test("one-provider-only name support cannot authorize a two-sided unknown pair", () => {
  const result = evaluateIndependentFixtureConfirmation(
    pendingCandidate(),
    [thirdRow({ homeTeam: "Long Alpha United", awayTeam: "Beta Athletic" })],
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, "NO_EXACT_CROSS_SOURCE_BRIDGE");
});

test("synchronized third-source kickoff bucket remains fail-closed", () => {
  const result = evaluateIndependentFixtureConfirmation(
    pendingCandidate(),
    [
      thirdRow(),
      thirdRow({
        providerMatchId: "998878",
        homeTeam: "Other Home",
        awayTeam: "Other Away",
        evidenceUrl: "https://v3.football.api-sports.io/fixtures?id=998878",
      }),
    ],
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, "AMBIGUOUS_THIRD_SOURCE_KICKOFF_BUCKET");
});

test("stored independent evidence fails if the odds contract or payload is tampered", () => {
  const result = evaluateIndependentFixtureConfirmation(
    pendingCandidate(),
    [thirdRow()],
    { observedAt: "2026-08-08T19:00:00.000Z" },
  );
  assert.equal(result.ok, true);

  assert.equal(validateIndependentFixtureConfirmation(pendingCandidate(), {
    ...result.evidence,
    oddsUsed: true,
  }).ok, false);
  assert.equal(validateIndependentFixtureConfirmation(pendingCandidate(), {
    ...result.evidence,
    homeTeam: "Tampered Home",
  }).ok, false);
});
