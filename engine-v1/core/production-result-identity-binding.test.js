import test from "node:test";
import assert from "node:assert/strict";

import {
  assertResultTruthUnchanged,
  bindProductionResultIdentity,
  bindVerifiedFinalResultIdentity,
  captureResultTruth,
  resultFixtureSignals,
  resultMemoryIdentityFields,
} from "./production-result-identity-binding.js";

function fakeResolver() {
  const retained =
    "cid_test_home_away_20260802";

  const suppressed =
    "cid_test_alias_20260802";

  return {
    resolveFixtureId(value) {
      if (value === retained) {
        return {
          ok: true,
          status:
            "RETAINED_FIXTURE_IDEMPOTENT",
          sourceFixtureId:
            retained,
          resolvedFixtureId:
            retained,
          sourceRole:
            "retained",
          fixtureRetentionDecisionId:
            "frd_test",
          homeGlobalClubId:
            "gcid_home",
          awayGlobalClubId:
            "gcid_away",
        };
      }

      if (value === suppressed) {
        return {
          ok: true,
          status:
            "SUPPRESSED_FIXTURE_LINEAGE_ALIAS_RESOLVED",
          sourceFixtureId:
            suppressed,
          resolvedFixtureId:
            retained,
          sourceRole:
            "suppressed_lineage_alias",
          fixtureRetentionDecisionId:
            "frd_test",
          homeGlobalClubId:
            "gcid_home",
          awayGlobalClubId:
            "gcid_away",
        };
      }

      return {
        ok: false,
        status:
          "UNKNOWN_FIXTURE_ID",
        sourceFixtureId:
          value,
      };
    },

    resolveFixtureMembership({
      repositoryFixtureId,
      canonicalFixtureIds,
    }) {
      const resolution =
        this.resolveFixtureId(
          repositoryFixtureId,
        );

      const universe =
        canonicalFixtureIds instanceof Set
          ? canonicalFixtureIds
          : new Set(
              Array.isArray(canonicalFixtureIds)
                ? canonicalFixtureIds
                : [],
            );

      if (
        !resolution.ok ||
        !universe.has(
          resolution.resolvedFixtureId,
        )
      ) {
        return {
          ok: false,
          status:
            "RESOLVED_FIXTURE_NOT_IN_CANONICAL_UNIVERSE",
        };
      }

      return {
        ok: true,
        status:
          "FIXTURE_MEMBERSHIP_RESOLVED_WITHOUT_CREATION",
        resolvedFixtureId:
          resolution.resolvedFixtureId,
      };
    },
  };
}

function baseRow(overrides = {}) {
  return {
    matchId:
      "cid_test_home_away_20260802",
    status:
      "FT",
    statusType:
      "FT",
    rawStatus:
      "STATUS_FINAL",
    operationalState:
      "FT",
    scoreHome:
      2,
    scoreAway:
      1,
    finalScore: {
      home:
        2,
      away:
        1,
      scoreKey:
        "2-1",
    },
    scoreKey:
      "2-1",
    ...overrides,
  };
}

test(
  "retained result identity binds idempotently",
  () => {
    const source =
      baseRow();

    const bound =
      bindProductionResultIdentity(
        source,
        {
          resolver:
            fakeResolver(),
        },
      );

    assert.equal(
      bound.status,
      "RETAINED_RESULT_IDENTITY_BOUND",
    );
    assert.equal(
      bound.row.matchId,
      source.matchId,
    );
    assert.equal(
      bound.row.canonicalId,
      source.matchId,
    );
    assert.equal(
      bound.row.homeGlobalClubId,
      "gcid_home",
    );
    assert.equal(
      bound.row.awayGlobalClubId,
      "gcid_away",
    );
  },
);

test(
  "suppressed result identity maps one-way to retained id",
  () => {
    const bound =
      bindProductionResultIdentity(
        baseRow({
          canonicalId:
            "cid_test_alias_20260802",
          matchId:
            "provider_123",
        }),
        {
          resolver:
            fakeResolver(),
        },
      );

    assert.equal(
      bound.status,
      "SUPPRESSED_RESULT_LINEAGE_BOUND_TO_RETAINED",
    );
    assert.equal(
      bound.sourceFixtureId,
      "cid_test_alias_20260802",
    );
    assert.equal(
      bound.resolvedFixtureId,
      "cid_test_home_away_20260802",
    );
    assert.equal(
      bound.row.matchId,
      "cid_test_home_away_20260802",
    );
    assert.equal(
      bound.row.canonicalId,
      "cid_test_home_away_20260802",
    );
  },
);

test(
  "unmanaged result identity passes through by reference",
  () => {
    const source =
      baseRow({
        matchId:
          "provider_unknown",
      });

    const bound =
      bindProductionResultIdentity(
        source,
        {
          resolver:
            fakeResolver(),
        },
      );

    assert.equal(
      bound.managed,
      false,
    );
    assert.equal(
      bound.row,
      source,
    );
  },
);

test(
  "conflicting managed fixture signals fail closed",
  () => {
    const resolver =
      fakeResolver();

    resolver.resolveFixtureId =
      value => {
        if (
          value ===
          "cid_other"
        ) {
          return {
            ok: true,
            resolvedFixtureId:
              "cid_other_retained",
            sourceRole:
              "retained",
            fixtureRetentionDecisionId:
              "frd_other",
            homeGlobalClubId:
              "gcid_other_home",
            awayGlobalClubId:
              "gcid_other_away",
          };
        }

        return fakeResolver()
          .resolveFixtureId(value);
      };

    assert.throws(
      () =>
        bindProductionResultIdentity(
          baseRow({
            canonicalId:
              "cid_other",
          }),
          { resolver },
        ),
      /conflicting_fixture_signals/u,
    );
  },
);

test(
  "conflicting pre-existing global club id fails closed",
  () => {
    assert.throws(
      () =>
        bindProductionResultIdentity(
          baseRow({
            homeGlobalClubId:
              "gcid_wrong",
          }),
          {
            resolver:
              fakeResolver(),
          },
        ),
      /identity_conflict:homeGlobalClubId/u,
    );
  },
);

test(
  "canonical membership is required when requested",
  () => {
    assert.throws(
      () =>
        bindProductionResultIdentity(
          baseRow(),
          {
            resolver:
              fakeResolver(),
            canonicalFixtureIds:
              [],
            requireCanonicalMembership:
              true,
          },
        ),
      /identity_membership_failed/u,
    );

    assert.doesNotThrow(
      () =>
        bindProductionResultIdentity(
          baseRow(),
          {
            resolver:
              fakeResolver(),
            canonicalFixtureIds: [
              "cid_test_home_away_20260802",
            ],
            requireCanonicalMembership:
              true,
          },
        ),
    );
  },
);

test(
  "binding cannot alter score or status truth",
  () => {
    const source =
      baseRow();

    const before =
      captureResultTruth(source);

    const bound =
      bindProductionResultIdentity(
        source,
        {
          resolver:
            fakeResolver(),
        },
      );

    assert.deepEqual(
      captureResultTruth(bound.row),
      before,
    );

    assert.equal(
      assertResultTruthUnchanged(
        source,
        bound.row,
      ),
      true,
    );
  },
);

test(
  "verified final binding preserves verdict and settlement",
  () => {
    const source = {
      ...baseRow(),
      verifiedFinalTruth:
        true,
      finalTruthVerdict:
        "verified_final_result",
      verdict:
        "verified_final_result",
      settlement: {
        state:
          "verified_final_result",
      },
    };

    const bound =
      bindVerifiedFinalResultIdentity(
        source,
        {
          resolver:
            fakeResolver(),
        },
      );

    assert.equal(
      bound.finalTruthVerdict,
      source.finalTruthVerdict,
    );
    assert.deepEqual(
      bound.settlement,
      source.settlement,
    );
  },
);

test(
  "result fixture signals are exact and deduplicated",
  () => {
    assert.deepEqual(
      resultFixtureSignals({
        canonicalId:
          "cid_a",
        matchId:
          "cid_a",
        fixtureId:
          "cid_b",
        id:
          "",
      }),
      [
        {
          field:
            "canonicalId",
          value:
            "cid_a",
        },
        {
          field:
            "fixtureId",
          value:
            "cid_b",
        },
      ],
    );
  },
);

test(
  "result memory identity fields contain no score or status fields",
  () => {
    const bound =
      bindProductionResultIdentity(
        baseRow(),
        {
          resolver:
            fakeResolver(),
        },
      );

    const fields =
      resultMemoryIdentityFields(
        bound.row,
      );

    assert.equal(
      fields.canonicalId,
      "cid_test_home_away_20260802",
    );
    assert.equal(
      "scoreHome" in fields,
      false,
    );
    assert.equal(
      "status" in fields,
      false,
    );
  },
);


test(
  "repeated binding preserves suppressed source lineage",
  () => {
    const first =
      bindProductionResultIdentity(
        baseRow({
          matchId:
            "cid_test_alias_20260802",
        }),
        {
          resolver:
            fakeResolver(),
        },
      );

    const second =
      bindProductionResultIdentity(
        first.row,
        {
          resolver:
            fakeResolver(),
        },
      );

    assert.equal(
      second.sourceFixtureId,
      "cid_test_alias_20260802",
    );
    assert.equal(
      second.sourceFixtureRole,
      "suppressed_lineage_alias",
    );
    assert.equal(
      second.resolvedFixtureId,
      "cid_test_home_away_20260802",
    );
  },
);
