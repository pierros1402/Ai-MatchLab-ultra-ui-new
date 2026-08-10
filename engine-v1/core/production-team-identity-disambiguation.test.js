import test from "node:test";
import assert from "node:assert/strict";

import {
  createProductionTeamIdentityDisambiguator,
  deriveDisambiguationDecisionId,
  deriveDisambiguationGlobalClubId,
  deriveDisambiguationSourceIdentityHash,
  deriveDisambiguationTeamIdentityKey,
  validateProductionTeamIdentityDisambiguation,
} from "./production-team-identity-disambiguation.js";

const UTC_ID = "gcid_0119cea2af2c3ec376171829";

function collisionBaseResolver() {
  return {
    resolveTeamReference(reference = {}) {
      const alias = String(reference.alias || "").trim();
      const leagueSlug = String(reference.leagueSlug || "").trim();
      if (
        leagueSlug === "per.1" &&
        ["UTC", "Cajamarca", "FC Cajamarca"].includes(alias)
      ) {
        return {
          ok: true,
          status: "RESOLVED_EXACT_IDENTITY",
          globalClubId: UTC_ID,
          ledgerTeamIdentityKey: "p0cteam_utc",
          preferredDisplayName: "UTC",
        };
      }
      return {
        ok: false,
        status: "NORMALIZED_EXACT_ALIAS_NOT_FOUND",
      };
    },
  };
}

function validDecision() {
  const decision = {
    status: "CONFIRMED_DISTINCT_CLUB_IDENTITY",
    matchingMode: "LEAGUE_SCOPED_EXACT_ALIAS_ONLY",
    leagueSlug: "per.1",
    exactAlias: "FC Cajamarca",
    preferredDisplayName: "FC Cajamarca",
    opposingAlias: "UTC",
    conflictingBaseGlobalClubId: UTC_ID,
    evidence: {
      fixtureId: "espn_401857491",
      dayKey: "2026-05-08",
      kickoff: "2026-05-08T20:00:00.000Z",
      homeTeam: "UTC",
      awayTeam: "FC Cajamarca",
      scoreHome: 1,
      scoreAway: 2,
      externalEvidenceUrls: [
        "https://www.transfermarkt.co/spielbericht/index/spielbericht/4817756",
        "https://www.365scores.com/id/football/match/liga-1-583/fc-cajamarca-utc-10367-77513-583",
      ],
    },
  };
  decision.ledgerTeamIdentityKey = deriveDisambiguationTeamIdentityKey(decision);
  decision.sourceIdentityHash = deriveDisambiguationSourceIdentityHash(decision);
  decision.globalClubId = deriveDisambiguationGlobalClubId(decision);
  decision.decisionId = deriveDisambiguationDecisionId(decision);
  return decision;
}

function validLedger() {
  return {
    schema: "ai-matchlab.production-team-identity-disambiguation-ledger.v1",
    version: "test-v1",
    policy: {
      matchingMode: "LEAGUE_SCOPED_EXACT_ALIAS_ONLY",
      fuzzyMatchingAllowed: false,
      explicitManagedIdentityOverrideAllowed: false,
      productionMutationAuthorized: false,
    },
    decisions: [validDecision()],
  };
}

test("validated exact per.1 FC Cajamarca disambiguation gets a distinct stable global ID", () => {
  const ledger = validLedger();
  const validation = validateProductionTeamIdentityDisambiguation({
    ledger,
    baseResolver: collisionBaseResolver(),
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.issueCount, 0);

  const disambiguator = createProductionTeamIdentityDisambiguator({
    ledger,
    baseResolver: collisionBaseResolver(),
  });
  const resolved = disambiguator.resolve({
    alias: "FC Cajamarca",
    leagueSlug: "per.1",
  });
  assert.equal(resolved.ok, true);
  assert.notEqual(resolved.globalClubId, UTC_ID);
  assert.equal(resolved.preferredDisplayName, "FC Cajamarca");
  assert.equal(resolved.fuzzyMatchingAttempted, false);
});

test("generic Cajamarca and wrong-league FC Cajamarca do not match the disambiguation", () => {
  const disambiguator = createProductionTeamIdentityDisambiguator({
    ledger: validLedger(),
    baseResolver: collisionBaseResolver(),
  });
  assert.equal(
    disambiguator.resolve({ alias: "Cajamarca", leagueSlug: "per.1" }).ok,
    false,
  );
  assert.equal(
    disambiguator.resolve({ alias: "FC Cajamarca", leagueSlug: "col.1" }).ok,
    false,
  );
});

test("explicit managed identity signals are never overridden", () => {
  const disambiguator = createProductionTeamIdentityDisambiguator({
    ledger: validLedger(),
    baseResolver: collisionBaseResolver(),
  });
  const resolved = disambiguator.resolve({
    alias: "FC Cajamarca",
    leagueSlug: "per.1",
    globalClubId: UTC_ID,
  });
  assert.equal(resolved.ok, false);
  assert.equal(
    resolved.status,
    "DISAMBIGUATION_EXPLICIT_IDENTITY_SIGNAL_NOT_OVERRIDDEN",
  );
});

test("tampered derived identity or insufficient independent evidence fails validation", () => {
  const ledger = validLedger();
  ledger.decisions[0].globalClubId = "gcid_tampered";
  ledger.decisions[0].evidence.externalEvidenceUrls = [
    "https://www.transfermarkt.co/one",
    "https://www.transfermarkt.co/two",
  ];
  const validation = validateProductionTeamIdentityDisambiguation({
    ledger,
    baseResolver: collisionBaseResolver(),
  });
  assert.equal(validation.ok, false);
  assert.ok(
    validation.issues.some(x => x.code === "DISAMBIGUATION_IDENTITY_DERIVATION_MISMATCH"),
  );
  assert.ok(
    validation.issues.some(x => x.code === "DISAMBIGUATION_TWO_INDEPENDENT_HTTPS_SOURCES_REQUIRED"),
  );
});
