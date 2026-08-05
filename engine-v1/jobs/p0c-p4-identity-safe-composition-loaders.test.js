import test from "node:test";
import assert from "node:assert/strict";

import {
  P0C_P4_CANONICAL_ALIAS_RECONCILIATION_SCHEMA,
  P0C_P4_H2H_FIXTURE_ONLY_FALLBACK_SCHEMA,
  createP0CP4H2HFixtureIdOnlyOverlay,
  reconcileP0CP4CanonicalAliasGroup,
} from "./p0c-p4-identity-safe-composition-loaders.js";

function fixtureOverlay(mapping = {}) {
  const retained = new Set(Object.values(mapping));
  return {
    resolveEvidenceFixtureId(value) {
      if (Object.hasOwn(mapping, value)) {
        return {
          ok: true,
          managed: true,
          changed: value !== mapping[value],
          sourceFixtureId: value,
          resolvedFixtureId: mapping[value],
          sourceRole: value === mapping[value]
            ? "retained"
            : "suppressed_lineage_alias",
        };
      }
      if (retained.has(value)) {
        return {
          ok: true,
          managed: true,
          changed: false,
          sourceFixtureId: value,
          resolvedFixtureId: value,
          sourceRole: "retained",
        };
      }
      return {
        ok: true,
        managed: false,
        changed: false,
        sourceFixtureId: value,
        resolvedFixtureId: value,
        sourceRole: "unmanaged",
      };
    },
  };
}

function canonicalRows({
  suppressedScore = [1, 1],
  retainedScore = [1, 1],
} = {}) {
  return [
    {
      canonicalId: "suppressed-id",
      matchId: "suppressed-id",
      status: "STATUS_FINAL",
      scoreHome: suppressedScore[0],
      scoreAway: suppressedScore[1],
      homeTeam: "Home",
      awayTeam: "Away",
    },
    {
      canonicalId: "retained-id",
      matchId: "retained-id",
      status: "STATUS_FINAL",
      scoreHome: retainedScore[0],
      scoreAway: retainedScore[1],
      homeTeam: "Home",
      awayTeam: "Away",
    },
  ];
}

test("selects the exact retained row when alias truth is semantically equivalent", () => {
  const result = reconcileP0CP4CanonicalAliasGroup({
    dayKey: "2026-08-01",
    resolvedFixtureId: "retained-id",
    sourceRows: canonicalRows(),
    overlay: fixtureOverlay({
      "suppressed-id": "retained-id",
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.schema,
    P0C_P4_CANONICAL_ALIAS_RECONCILIATION_SCHEMA,
  );
  assert.equal(
    result.status,
    "SEMANTIC_TRUTH_EQUIVALENT_RETAINED_LINEAGE_SELECTED",
  );
  assert.equal(result.view.canonicalId, "retained-id");
  assert.equal(result.view.matchId, "retained-id");
  assert.equal(result.view.scoreHome, 1);
  assert.equal(result.view.scoreAway, 1);
  assert.equal(result.diagnostics.scoreTruthChanged, false);
  assert.equal(result.diagnostics.statusTruthChanged, false);
});

test("requires one unique authoritative truth when alias rows disagree", () => {
  const result = reconcileP0CP4CanonicalAliasGroup({
    dayKey: "2026-08-01",
    resolvedFixtureId: "retained-id",
    sourceRows: canonicalRows({
      suppressedScore: [2, 1],
      retainedScore: [1, 1],
    }),
    authoritativeEvidence: [{
      authority: "verified-final-result",
      sourcePath: "data/final-results/2026-08-01/retained-id.json",
      truth: {
        status: "STATUS_FINAL",
        scoreHome: 1,
        scoreAway: 1,
      },
    }],
    overlay: fixtureOverlay({
      "suppressed-id": "retained-id",
    }),
  });

  assert.equal(
    result.status,
    "VERIFIED_FINAL_TRUTH_CONFIRMS_RETAINED_LINEAGE",
  );
  assert.equal(result.view.scoreHome, 1);
  assert.equal(result.view.scoreAway, 1);

  assert.throws(
    () => reconcileP0CP4CanonicalAliasGroup({
      dayKey: "2026-08-01",
      resolvedFixtureId: "retained-id",
      sourceRows: canonicalRows({
        suppressedScore: [2, 1],
        retainedScore: [1, 1],
      }),
      authoritativeEvidence: [{
        authority: "verified-final-result",
        truth: {
          status: "STATUS_FINAL",
          scoreHome: 2,
          scoreAway: 1,
        },
      }],
      overlay: fixtureOverlay({
        "suppressed-id": "retained-id",
      }),
    }),
    /retained_truth_not_authoritative/,
  );
});

test("fails closed unless the exact retained source row exists once", () => {
  assert.throws(
    () => reconcileP0CP4CanonicalAliasGroup({
      dayKey: "2026-08-01",
      resolvedFixtureId: "retained-id",
      sourceRows: [
        canonicalRows()[0],
        {
          ...canonicalRows()[0],
          canonicalId: "second-suppressed-id",
          matchId: "second-suppressed-id",
        },
      ],
      overlay: fixtureOverlay({
        "suppressed-id": "retained-id",
        "second-suppressed-id": "retained-id",
      }),
    }),
    /retained_row_required/,
  );
});

function collisionOverlay({ managedFixture = false } = {}) {
  return {
    overlayEvidenceMatchRow(row) {
      return {
        ok: false,
        status: "EVIDENCE_HOME_AWAY_GLOBAL_ID_COLLISION",
        source: row,
      };
    },
    resolveEvidenceFixtureId(value) {
      return {
        ok: true,
        managed: managedFixture,
        changed: false,
        sourceFixtureId: value,
        resolvedFixtureId: value,
        sourceRole: managedFixture ? "retained" : "unmanaged",
      };
    },
    preserveEvidenceProvenance({
      sourceFixtureIds,
      fixtureResolution,
      homeResolution,
      awayResolution,
    }) {
      return {
        schema: "ai-matchlab.production-evidence-provenance.v1",
        sourceFixtureIds,
        sourceFixtureId: fixtureResolution.sourceFixtureId,
        resolvedFixtureId: fixtureResolution.resolvedFixtureId,
        homeSourceAlias: homeResolution.sourceAlias,
        awaySourceAlias: awayResolution.sourceAlias,
        scoreTruthChanged: false,
        statusTruthChanged: false,
      };
    },
  };
}

test("uses fixture-ID-only H2H fallback only for an unmanaged false team collision", () => {
  const diagnostics = [];
  const overlay = createP0CP4H2HFixtureIdOnlyOverlay({
    overlay: collisionOverlay(),
    onFallback: row => diagnostics.push(row),
  });
  const row = {
    canonicalId: "unmanaged-fixture-id",
    matchId: "unmanaged-fixture-id",
    dayKey: "2026-07-18",
    leagueSlug: "arg.2",
    homeTeam: "Club A Reserve",
    awayTeam: "Club A",
    status: "STATUS_FINAL",
    scoreHome: 2,
    scoreAway: 0,
  };

  const result = overlay.overlayEvidenceMatchRow(row);
  assert.equal(result.ok, true);
  assert.equal(
    result.status,
    "EVIDENCE_FIXTURE_ID_ONLY_OVERLAY_APPLIED_FOR_UNMANAGED_TEAM_COLLISION",
  );
  assert.equal(result.view.canonicalId, row.canonicalId);
  assert.equal(result.view.homeTeam, row.homeTeam);
  assert.equal(result.view.awayTeam, row.awayTeam);
  assert.equal(result.view.scoreHome, 2);
  assert.equal(result.view.scoreAway, 0);
  assert.equal(result.scoreTruthChanged, false);
  assert.equal(result.statusTruthChanged, false);
  assert.equal(diagnostics.length, 1);
  assert.equal(
    diagnostics[0].schema,
    P0C_P4_H2H_FIXTURE_ONLY_FALLBACK_SCHEMA,
  );
});

test("does not use H2H fallback for managed fixtures or explicit team identities", () => {
  const managed = createP0CP4H2HFixtureIdOnlyOverlay({
    overlay: collisionOverlay({ managedFixture: true }),
  });
  const managedResult = managed.overlayEvidenceMatchRow({
    canonicalId: "managed-id",
    homeTeam: "Home",
    awayTeam: "Away",
  });
  assert.equal(managedResult.ok, false);
  assert.equal(
    managedResult.status,
    "EVIDENCE_HOME_AWAY_GLOBAL_ID_COLLISION",
  );

  const explicit = createP0CP4H2HFixtureIdOnlyOverlay({
    overlay: collisionOverlay(),
  });
  const explicitResult = explicit.overlayEvidenceMatchRow({
    canonicalId: "unmanaged-id",
    homeTeam: "Home",
    awayTeam: "Away",
    homeGlobalClubId: "gcid_home",
  });
  assert.equal(explicitResult.ok, false);
  assert.equal(
    explicitResult.status,
    "EVIDENCE_HOME_AWAY_GLOBAL_ID_COLLISION",
  );
});
