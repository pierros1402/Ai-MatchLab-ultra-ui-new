import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCanonicalSuppressedAliasTerminalRepair,
  evaluateCanonicalSuppressedAliasTerminalRepair
} from "./canonical-suppressed-alias-terminal-repair.js";

import {
  findCanonicalStatusConflicts
} from "./canonical-status-coherence.js";

function canonical(
  overrides = {}
) {
  return {
    canonicalId:
      "cid_test_alias_20260808",
    matchId:
      "cid_test_alias_20260808",
    dayKey:
      "2026-08-08",
    leagueSlug:
      "tst.1",
    source:
      "flashscore",
    sourceId:
      "FS1",
    sourceMatchId:
      "FS1",
    homeTeam:
      "Home Club",
    awayTeam:
      "Away Club",
    kickoffUtc:
      "2026-08-08T18:00:00.000Z",
    status:
      "STATUS_SCHEDULED",
    statusType:
      "STATUS_FINAL",
    rawStatus:
      "STATUS_FINAL",
    operationalState:
      "UNKNOWN",
    minute:
      "FT",
    scoreHome:
      0,
    scoreAway:
      0,
    authoritativeTerminalWriteback: {
      schema:
        "ai-matchlab.authoritative-terminal-writeback.v1",
      provider:
        "reconciled",
      providerMatchId:
        "FS1",
      dayKey:
        "2026-08-08",
      identityContract: {
        exactProviderId:
          true,
        athensDay:
          true,
        orderedTeamPair:
          true,
        explicitTerminalStatus:
          true,
        numericScore:
          true,
        heuristicIdentity:
          false
      },
      observation: {
        status:
          "STATUS_SCHEDULED",
        statusType:
          "STATUS_FINAL",
        rawStatus:
          "STATUS_SCHEDULED",
        scoreHome:
          0,
        scoreAway:
          0
      }
    },
    ...overrides
  };
}

function identityDecision(
  overrides = {}
) {
  return {
    dayKey:
      "2026-08-08",
    leagueSlug:
      "tst.1",
    retainedRepositoryFixtureId:
      "cid_test_retained_20260808",
    suppressedRepositoryFixtureIds: [
      "cid_test_alias_20260808"
    ],
    promotionBasis:
      "TWO_PROVIDER_EXACT_COUNTERPART_WITH_STABLE_SIDE",
    sourceFixtures: [
      {
        provider:
          "flashscore",
        providerMatchId:
          "FS1",
        repositoryFixtureId:
          "cid_test_alias_20260808",
        dayKey:
          "2026-08-08",
        leagueSlug:
          "tst.1",
        kickoffUtc:
          "2026-08-08T18:00:00.000Z",
        homeTeam:
          "Home Club",
        awayTeam:
          "Away Club"
      },
      {
        provider:
          "espn",
        providerMatchId:
          "ESPN1",
        repositoryFixtureId:
          "cid_test_retained_20260808",
        dayKey:
          "2026-08-08",
        leagueSlug:
          "tst.1",
        kickoffUtc:
          "2026-08-08T18:00:00.000Z",
        homeTeam:
          "Home Club",
        awayTeam:
          "Away Club"
      }
    ],
    fixtureRetentionDecisionId:
      "decision-1",
    ...overrides
  };
}

function evidence(
  overrides = {}
) {
  return {
    verifiedFinalTruth:
      true,
    mode:
      "retained_final_suppressed_artifact",
    sourceFixtureId:
      "cid_test_alias_20260808",
    retainedFixtureId:
      "cid_test_retained_20260808",
    fixtureRetentionDecisionId:
      "decision-1",
    dayKey:
      "2026-08-08",
    leagueSlug:
      "tst.1",
    provider:
      "flashscore",
    providerMatchId:
      "FS1",
    homeTeam:
      "Home Club",
    awayTeam:
      "Away Club",
    kickoffUtc:
      "2026-08-08T18:00:00.000Z",
    scoreHome:
      2,
    scoreAway:
      1,
    evidencePath:
      "data/final-results/2026-08-08/cid_test_retained_20260808.json",
    ...overrides
  };
}

test(
  "repairs top-level and nested conflict only with approved identity-bound verified final",
  () => {
    const result =
      applyCanonicalSuppressedAliasTerminalRepair({
        canonicalRow:
          canonical(),
        identityDecision:
          identityDecision(),
        evidence:
          evidence(),
        dayKey:
          "2026-08-08",
        repairedAt:
          "2026-08-15T03:30:00.000Z"
      });

    assert.equal(
      result.changed,
      true
    );

    assert.equal(
      result.row.status,
      "FT"
    );

    assert.equal(
      result.row.scoreHome,
      2
    );

    assert.equal(
      result.row.scoreAway,
      1
    );

    assert.equal(
      result.row.operationalState,
      "TERMINAL_CONFIRMED"
    );

    assert.deepEqual(
      result.row
        .authoritativeTerminalWriteback
        .observation,
      {
        status:
          "FT",
        statusType:
          "STATUS_FINAL",
        rawStatus:
          "STATUS_FINAL",
        scoreHome:
          2,
        scoreAway:
          1
      }
    );

    assert.equal(
      findCanonicalStatusConflicts({
        fixtures:
          [result.row]
      }).length,
      0
    );
  }
);

test(
  "rejects identity decision that does not suppress the canonical fixture",
  () => {
    const evaluation =
      evaluateCanonicalSuppressedAliasTerminalRepair({
        canonicalRow:
          canonical(),
        identityDecision:
          identityDecision({
            suppressedRepositoryFixtureIds: [
              "other-id"
            ]
          }),
        evidence:
          evidence(),
        dayKey:
          "2026-08-08"
      });

    assert.equal(
      evaluation.ok,
      false
    );

    assert.equal(
      evaluation.reason,
      "approved_identity_decision_required"
    );
  }
);

test(
  "rejects provider mismatch even when score and retained identity match",
  () => {
    const evaluation =
      evaluateCanonicalSuppressedAliasTerminalRepair({
        canonicalRow:
          canonical(),
        identityDecision:
          identityDecision(),
        evidence:
          evidence({
            providerMatchId:
              "WRONG"
          }),
        dayKey:
          "2026-08-08"
      });

    assert.equal(
      evaluation.ok,
      false
    );

    assert.equal(
      evaluation.reason,
      "evidence_provider_identity_mismatch"
    );
  }
);

test(
  "never uses suppressed-alias path for a nested-only conflict",
  () => {
    const row =
      canonical({
        status:
          "FT",
        operationalState:
          "TERMINAL_CONFIRMED",
        scoreHome:
          2,
        scoreAway:
          1
      });

    const evaluation =
      evaluateCanonicalSuppressedAliasTerminalRepair({
        canonicalRow:
          row,
        identityDecision:
          identityDecision(),
        evidence:
          evidence(),
        dayKey:
          "2026-08-08"
      });

    assert.equal(
      evaluation.ok,
      false
    );

    assert.equal(
      evaluation.reason,
      "top_level_conflict_required"
    );
  }
);

test(
  "second pass is fixed-point after suppressed-alias repair",
  () => {
    const first =
      applyCanonicalSuppressedAliasTerminalRepair({
        canonicalRow:
          canonical(),
        identityDecision:
          identityDecision(),
        evidence:
          evidence(),
        dayKey:
          "2026-08-08"
      });

    const second =
      applyCanonicalSuppressedAliasTerminalRepair({
        canonicalRow:
          first.row,
        identityDecision:
          identityDecision(),
        evidence:
          evidence(),
        dayKey:
          "2026-08-08"
      });

    assert.equal(
      second.changed,
      false
    );

    assert.equal(
      second.reason,
      "canonical_already_coherent"
    );
  }
);
