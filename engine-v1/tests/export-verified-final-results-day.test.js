import test from "node:test";
import assert from "node:assert/strict";

import {
  bindVerifiedFinalResultPayloadIdentity,
  buildCanonicalEspnVerifiedFinalResult,
  resolveCanonicalEspnFinalFallback,
  resolvePenaltyWinnerMarkerConflict
} from "../jobs/export-verified-final-results-day.js";

const dayKey = "2026-07-17";

function validTarget(overrides = {}) {
  const canonicalFixture = {
    canonicalId: "cid_ecu1_aucas_independientedelvalle_20260717",
    matchId: "401859617",
    sourceMatchId: "401859617",
    sourceId: "401859617",
    source: "espn",
    leagueSlug: "ecu.1",
    leagueName: "LigaPro Ecuador",
    dayKey,
    kickoffUtc: "2026-07-16T21:30Z",
    homeTeam: "Aucas",
    awayTeam: "Independiente del Valle",
    scoreHome: 0,
    scoreAway: 3,
    status: "FT",
    rawStatus: "STATUS_FULL_TIME",
    statusType: "STATUS_FINAL",
    lastSeenAt: "2026-07-17T00:12:04.625Z",
    ...overrides
  };

  return {
    matchId: canonicalFixture.canonicalId,
    leagueSlug: "ecu.1",
    leagueName: "LigaPro Ecuador",
    country: "Ecuador",
    homeTeam: "Aucas",
    awayTeam: "Independiente del Valle",
    kickoffUtc: canonicalFixture.kickoffUtc,
    canonicalFixture
  };
}

test("accepts only an explicit canonical ESPN terminal final", () => {
  const target = validTarget();
  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.equal(resolved.ok, true);
  assert.equal(resolved.providerMatchId, "401859617");
  assert.equal(resolved.scoreKey, "0-3");
  assert.equal(
    resolved.observedAt,
    "2026-07-17T00:12:04.625Z"
  );
});

test("rejects a non-ESPN canonical source", () => {
  const target = validTarget({ source: "flashscore" });
  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.deepEqual(resolved, {
    ok: false,
    reason: "canonical_source_not_espn",
    source: "flashscore"
  });
});

test("rejects inferred FT without explicit provider terminal status", () => {
  const target = validTarget({
    status: "FT",
    rawStatus: "STATUS_SCHEDULED",
    statusType: "",
    operationalState: ""
  });

  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.equal(resolved.ok, false);
  assert.equal(
    resolved.reason,
    "canonical_espn_not_explicit_terminal"
  );
});

test("rejects provider terminal evidence when canonical status is not terminal", () => {
  const target = validTarget({
    status: "SCHEDULED",
    rawStatus: "STATUS_FULL_TIME",
    statusType: "STATUS_FINAL"
  });

  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.equal(resolved.ok, false);
  assert.equal(
    resolved.reason,
    "canonical_espn_status_not_terminal"
  );
});

test("rejects invalid or missing final score", () => {
  const target = validTarget({ scoreAway: null });
  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.equal(resolved.ok, false);
  assert.equal(
    resolved.reason,
    "canonical_espn_final_score_invalid"
  );
});

test("rejects a fixture outside the requested Athens day", () => {
  const target = validTarget({
    dayKey: "2026-07-16",
    kickoffUtc: "2026-07-16T18:00Z"
  });

  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.equal(resolved.ok, false);
  assert.equal(
    resolved.reason,
    "canonical_espn_day_key_mismatch"
  );
});

test("builds a settlement-compatible artifact with explicit provenance", () => {
  const target = validTarget();
  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);
  const payload = buildCanonicalEspnVerifiedFinalResult(
    dayKey,
    target,
    resolved
  );

  assert.equal(payload.schema, "ai-matchlab.verified-final-result.v1");
  assert.equal(payload.verifiedFinalTruth, true);
  assert.equal(payload.matchId, target.matchId);
  assert.equal(payload.scoreKey, "0-3");
  assert.equal(payload.source, "canonical_espn_terminal_final");
  assert.equal(payload.sources.length, 1);
  assert.equal(payload.sources[0].provider, "espn");
  assert.equal(payload.sources[0].providerMatchId, "401859617");
  assert.equal(
    payload.verification.method,
    "canonical_espn_terminal_final"
  );
  assert.equal(
    payload.verification.authority,
    "canonical_fixture_store"
  );
  assert.equal(
    payload.verification.checks.flashscoreFinishedMatchAbsent,
    true
  );
  assert.equal(
    payload.settlement.finalTruthVerdict,
    "verified_final_result"
  );
});


function finalPenaltyTarget({
  canonicalHome = 0,
  canonicalAway = 0,
  rawStatus = "STATUS_FINAL_PEN"
} = {}) {
  return validTarget({
    canonicalId:
      "cid_test_penalty_final_20260717",

    matchId:
      "401999999",

    sourceMatchId:
      "401999999",

    sourceId:
      "401999999",

    leagueSlug:
      "test.cup",

    leagueName:
      "Test Cup",

    dayKey,

    kickoffUtc:
      "2026-07-16T21:30Z",

    homeTeam:
      "Home Club",

    awayTeam:
      "Away Club",

    scoreHome:
      canonicalHome,

    scoreAway:
      canonicalAway,

    status:
      "FT",

    rawStatus,

    statusType:
      rawStatus,

    lastSeenAt:
      "2026-07-17T00:12:04.625Z"
  });
}

function penaltyTarget(options = {}) {
  const target =
    finalPenaltyTarget(options);

  return {
    ...target,

    matchId:
      target.canonicalFixture
        .canonicalId,

    leagueSlug:
      target.canonicalFixture
        .leagueSlug,

    leagueName:
      target.canonicalFixture
        .leagueName,

    country:
      "Test Country",

    homeTeam:
      target.canonicalFixture
        .homeTeam,

    awayTeam:
      target.canonicalFixture
        .awayTeam,

    kickoffUtc:
      target.canonicalFixture
        .kickoffUtc
  };
}

function flashscoreExisting({
  target,
  homeScore,
  awayScore,
  source =
    "flashscore_same_day_exact_team_match",
  provider =
    "flashscore"
}) {
  const scoreKey =
    homeScore + "-" + awayScore;

  return {
    schema:
      "ai-matchlab.verified-final-result.v1",

    verifiedFinalTruth:
      true,

    date:
      dayKey,

    dayKey,

    matchId:
      target.matchId,

    leagueSlug:
      target.leagueSlug,

    homeTeam:
      target.homeTeam,

    awayTeam:
      target.awayTeam,

    homeScore,
    awayScore,
    scoreHome:
      homeScore,
    scoreAway:
      awayScore,

    finalScore: {
      homeScore,
      awayScore,
      home:
        homeScore,
      away:
        awayScore,
      scoreKey
    },

    scoreKey,

    kickoffUtc:
      target.kickoffUtc,

    source,

    sources: [
      {
        provider,

        providerMatchId:
          "AbCd1234",

        home:
          target.homeTeam,

        away:
          target.awayTeam,

        scoreHome:
          homeScore,

        scoreAway:
          awayScore,

        kickoffUtc:
          target.kickoffUtc,

        scoreKey
      }
    ]
  };
}

function canonicalCandidate(
  target
) {
  const resolved =
    resolveCanonicalEspnFinalFallback(
      target,
      dayKey
    );

  assert.equal(
    resolved.ok,
    true
  );

  return buildCanonicalEspnVerifiedFinalResult(
    dayKey,
    target,
    resolved
  );
}

test("repairs an exact home penalty winner-marker artifact", () => {
  const target =
    penaltyTarget();

  const result =
    resolvePenaltyWinnerMarkerConflict({
      existing:
        flashscoreExisting({
          target,
          homeScore: 1,
          awayScore: 0
        }),

      target,

      candidatePayload:
        canonicalCandidate(target),

      dayKey
    });

  assert.equal(result.ok, true);
  assert.equal(
    result.previousScore.scoreKey,
    "1-0"
  );
  assert.equal(
    result.canonicalScore.scoreKey,
    "0-0"
  );
  assert.equal(
    result.replacementPayload.scoreKey,
    "0-0"
  );
  assert.equal(
    result.replacementPayload.source,
    "canonical_espn_final_pen_score_correction"
  );
  assert.equal(
    result.replacementPayload
      .settlement
      .scoreSemantics,
    "played_score_excluding_penalty_shootout"
  );
});

test("repairs an exact away penalty winner-marker artifact", () => {
  const target =
    penaltyTarget({
      canonicalHome: 1,
      canonicalAway: 1
    });

  const result =
    resolvePenaltyWinnerMarkerConflict({
      existing:
        flashscoreExisting({
          target,
          homeScore: 1,
          awayScore: 2
        }),

      target,

      candidatePayload:
        canonicalCandidate(target),

      dayKey
    });

  assert.equal(result.ok, true);
  assert.equal(
    result.previousScore.scoreKey,
    "1-2"
  );
  assert.equal(
    result.canonicalScore.scoreKey,
    "1-1"
  );
});

test("does not repair a non-penalty terminal conflict", () => {
  const target =
    penaltyTarget({
      rawStatus:
        "STATUS_FULL_TIME"
    });

  const result =
    resolvePenaltyWinnerMarkerConflict({
      existing:
        flashscoreExisting({
          target,
          homeScore: 1,
          awayScore: 0
        }),

      target,

      candidatePayload:
        canonicalCandidate(target),

      dayKey
    });

  assert.equal(result.ok, false);
  assert.equal(
    result.reason,
    "canonical_not_exact_espn_final_pen"
  );
});

test("does not repair a non-tied canonical penalty score", () => {
  const target =
    penaltyTarget({
      canonicalHome: 2,
      canonicalAway: 1
    });

  const result =
    resolvePenaltyWinnerMarkerConflict({
      existing:
        flashscoreExisting({
          target,
          homeScore: 3,
          awayScore: 1
        }),

      target,

      candidatePayload:
        canonicalCandidate(target),

      dayKey
    });

  assert.equal(result.ok, false);
  assert.equal(
    result.reason,
    "canonical_final_pen_score_not_tied"
  );
});

test("does not repair a score difference larger than one winner marker", () => {
  const target =
    penaltyTarget();

  const result =
    resolvePenaltyWinnerMarkerConflict({
      existing:
        flashscoreExisting({
          target,
          homeScore: 2,
          awayScore: 0
        }),

      target,

      candidatePayload:
        canonicalCandidate(target),

      dayKey
    });

  assert.equal(result.ok, false);
  assert.equal(
    result.reason,
    "existing_score_not_single_penalty_winner_marker"
  );
});

test("does not repair a non-Flashscore existing artifact", () => {
  const target =
    penaltyTarget();

  const result =
    resolvePenaltyWinnerMarkerConflict({
      existing:
        flashscoreExisting({
          target,
          homeScore: 1,
          awayScore: 0,
          source:
            "canonical_espn_terminal_final",
          provider:
            "espn"
        }),

      target,

      candidatePayload:
        canonicalCandidate(target),

      dayKey
    });

  assert.equal(result.ok, false);
  assert.equal(
    result.reason,
    "existing_not_exact_flashscore_verified_artifact"
  );
});

test("does not repair when the candidate score disagrees with canonical", () => {
  const target =
    penaltyTarget();

  const candidate =
    canonicalCandidate(target);

  candidate.scoreKey =
    "1-0";

  const result =
    resolvePenaltyWinnerMarkerConflict({
      existing:
        flashscoreExisting({
          target,
          homeScore: 1,
          awayScore: 0
        }),

      target,

      candidatePayload:
        candidate,

      dayKey
    });

  assert.equal(result.ok, false);
  assert.equal(
    result.reason,
    "candidate_score_disagrees_with_canonical"
  );
});


function resultIdentityResolver() {
  return {
    resolveFixtureId(value) {
      if (
        value ===
        "cid_ecu1_aucas_independientedelvalle_20260717"
      ) {
        return {
          ok: true,
          resolvedFixtureId:
            value,
          sourceRole:
            "retained",
          fixtureRetentionDecisionId:
            "frd_ecu_test",
          homeGlobalClubId:
            "gcid_aucas",
          awayGlobalClubId:
            "gcid_independiente",
        };
      }

      return {
        ok: false,
        status:
          "UNKNOWN_FIXTURE_ID",
      };
    },
  };
}

test(
  "verified-final identity binding adds retained IDs without changing score",
  () => {
    const target =
      validTarget();

    const resolved =
      resolveCanonicalEspnFinalFallback(
        target,
        dayKey,
      );

    const payload =
      buildCanonicalEspnVerifiedFinalResult(
        dayKey,
        target,
        resolved,
      );

    const bound =
      bindVerifiedFinalResultPayloadIdentity(
        payload,
        {
          resolver:
            resultIdentityResolver(),
        },
      );

    assert.equal(
      bound.matchId,
      target.matchId,
    );
    assert.equal(
      bound.canonicalId,
      target.matchId,
    );
    assert.equal(
      bound.homeGlobalClubId,
      "gcid_aucas",
    );
    assert.equal(
      bound.awayGlobalClubId,
      "gcid_independiente",
    );
    assert.equal(
      bound.scoreKey,
      payload.scoreKey,
    );
    assert.deepEqual(
      bound.finalScore,
      payload.finalScore,
    );
    assert.deepEqual(
      bound.settlement,
      payload.settlement,
    );
  },
);

test(
  "verified-final identity binding leaves unknown provider rows unchanged",
  () => {
    const payload = {
      matchId:
        "provider_unknown",
      verifiedFinalTruth:
        true,
      status:
        "FT",
      scoreHome:
        1,
      scoreAway:
        0,
    };

    const bound =
      bindVerifiedFinalResultPayloadIdentity(
        payload,
        {
          resolver:
            resultIdentityResolver(),
        },
      );

    assert.equal(
      bound,
      payload,
    );
  },
);
