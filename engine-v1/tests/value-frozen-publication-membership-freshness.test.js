import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildValueFixtureUniverse
} from "../core/value-fixture-universe.js";

import {
  evaluateFrozenValuePublicationMembership
} from "../core/frozen-value-publication-membership.js";

const day =
  "2026-08-25";

function fixture(id) {
  return {
    canonicalId: id,
    matchId: id,
    leagueSlug: "test.1",
    homeTeam: "Home " + id,
    awayTeam: "Away " + id,
    kickoffUtc:
      "2026-08-25T12:00:00.000Z"
  };
}

function universe(ids) {
  return buildValueFixtureUniverse(
    day,
    {
      fixtures:
        ids.map(fixture)
    }
  );
}

function plan(ids = []) {
  return {
    picks:
      ids.map(id => ({
        canonicalId: id,
        matchId: id
      }))
  };
}

function makeManifest({
  currentIds,
  publishedIds,
  deferredIds = [],
  explicitIds,
  legacyIds,
  orphanIds = [],
  valueGateOverride = {}
}) {
  const publicationUniverse = {
    mode:
      "intraday_status_only",
    currentFixtureCount:
      currentIds.length,
    publishedFixtureCount:
      publishedIds.length,
    deferredFixtureCount:
      deferredIds.length,
    deferredFixtureIds:
      [...deferredIds]
  };

  if (explicitIds !== undefined) {
    publicationUniverse
      .authoritativelyRemovedFixtureIds =
      [...explicitIds];
  }

  if (legacyIds !== undefined) {
    publicationUniverse
      .legacyPrunedFixtureIds =
      [...legacyIds];
  }

  return {
    ok: true,
    date: day,
    source:
      "local_canonical_export",

    canonicalFixtureCount:
      currentIds.length,

    fixtureJsonCount:
      currentIds.length,

    publicationUniverse,

    counts: {
      fixtures:
        publishedIds.length,
      details:
        publishedIds.length,
      detailsMatchedToFixtures:
        publishedIds.length,
      orphanDetailsRemoved:
        orphanIds.length,
      detailsMissingForFixtures:
        0
    },

    valueGate: {
      fixtures:
        publishedIds.length,
      ok: true,
      frozenIdentityBound:
        true,
      frozenReleaseSafe:
        true,
      orphanPickCount:
        0,
      missingMatchIdPickCount:
        0,
      dayBound:
        true,
      canonicalSourceBound:
        true,
      ...valueGateOverride
    },

    orphanDetailsRemoved:
      orphanIds.map(
        id => id + ".json"
      ),

    detailsMissingForFixtures:
      []
  };
}

function evaluate({
  frozenIds,
  currentIds,
  publishedIds,
  deferredIds = [],
  explicitIds,
  legacyIds,
  orphanIds = [],
  a2Picks = [],
  bPicks = [],
  b2Picks = [],
  valueGateOverride = {}
}) {
  return evaluateFrozenValuePublicationMembership({
    dayKey: day,

    frozenUniverse:
      universe(frozenIds),

    currentUniverse:
      universe(currentIds),

    snapshotFixtures:
      publishedIds.map(fixture),

    manifest:
      makeManifest({
        currentIds,
        publishedIds,
        deferredIds,
        explicitIds,
        legacyIds,
        orphanIds,
        valueGateOverride
      }),

    plans: [
      plan(a2Picks),
      plan(bPicks),
      plan(b2Picks)
    ]
  });
}

test(
  "legacy wrong-day prune bootstrap preserves the frozen cohort",
  () => {
    const result =
      evaluate({
        frozenIds: [
          "keep",
          "wrong-a",
          "wrong-b"
        ],
        currentIds: [
          "keep"
        ],
        publishedIds: [
          "keep"
        ],
        orphanIds: [
          "wrong-a",
          "wrong-b"
        ]
      });

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.authorizedShrink,
      true
    );

    assert.deepEqual(
      result.removedFixtureIds,
      [
        "wrong-a",
        "wrong-b"
      ]
    );

    assert.equal(
      result.evidenceSource,
      "legacy_orphan_details_bootstrap"
    );
  }
);

test(
  "persisted prune ledger survives future intraday cycles",
  () => {
    const result =
      evaluate({
        frozenIds: [
          "keep",
          "wrong-a"
        ],
        currentIds: [
          "keep"
        ],
        publishedIds: [
          "keep"
        ],
        explicitIds: [],
        legacyIds: [
          "wrong-a"
        ]
      });

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.evidenceSource,
      "persisted_legacy_prune_ledger"
    );
  }
);

test(
  "unknown frozen shrink remains fail closed",
  () => {
    const result =
      evaluate({
        frozenIds: [
          "keep",
          "unknown"
        ],
        currentIds: [
          "keep"
        ],
        publishedIds: [
          "keep"
        ]
      });

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      result.reason,
      "frozen_publication_removal_evidence_mismatch"
    );
  }
);

test(
  "a removed frozen pick can never receive a freshness waiver",
  () => {
    const result =
      evaluate({
        frozenIds: [
          "keep",
          "wrong-a"
        ],
        currentIds: [
          "keep"
        ],
        publishedIds: [
          "keep"
        ],
        explicitIds: [
          "wrong-a"
        ],
        bPicks: [
          "wrong-a"
        ]
      });

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      result.reason,
      "frozen_pick_not_publishable"
    );
  }
);

test(
  "late current fixtures may remain explicitly deferred",
  () => {
    const result =
      evaluate({
        frozenIds: [
          "keep"
        ],
        currentIds: [
          "keep",
          "late"
        ],
        publishedIds: [
          "keep"
        ],
        deferredIds: [
          "late"
        ],
        explicitIds: [],
        legacyIds: []
      });

    assert.equal(
      result.ok,
      true
    );

    assert.deepEqual(
      result.deferredCurrentFixtureIds,
      [
        "late"
      ]
    );
  }
);

test(
  "undeclared current additions fail closed",
  () => {
    const result =
      evaluate({
        frozenIds: [
          "keep"
        ],
        currentIds: [
          "keep",
          "late"
        ],
        publishedIds: [
          "keep"
        ],
        deferredIds: [],
        explicitIds: [],
        legacyIds: []
      });

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      result.reason,
      "deferred_current_membership_mismatch"
    );
  }
);

test(
  "unsafe frozen Value gate receives no waiver",
  () => {
    const result =
      evaluate({
        frozenIds: [
          "keep",
          "wrong-a"
        ],
        currentIds: [
          "keep"
        ],
        publishedIds: [
          "keep"
        ],
        explicitIds: [
          "wrong-a"
        ],
        valueGateOverride: {
          orphanPickCount: 1
        }
      });

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      result.reason,
      "publication_manifest_not_safe"
    );
  }
);

test(
  "runner and exporter persist the prune ledger",
  () => {
    const runner =
      fs.readFileSync(
        new URL(
          "../jobs/run-intraday-snapshot-refresh.js",
          import.meta.url
        ),
        "utf8"
      );

    const exporter =
      fs.readFileSync(
        new URL(
          "../jobs/export-deploy-snapshot-day.js",
          import.meta.url
        ),
        "utf8"
      );

    assert.match(
      runner,
      /preservedIntradayPruneLedger/u
    );

    assert.match(
      runner,
      /legacyPrunedFixtureIds/u
    );

    assert.match(
      exporter,
      /authoritativelyRemovedFixtureCount/u
    );

    assert.match(
      exporter,
      /legacyPrunedFixtureCount/u
    );
  }
);

test(
  "workflow treats publication-universe provenance as material snapshot state",
  () => {
    const workflow =
      fs.readFileSync(
        new URL(
          "../../.github/workflows/intraday-deploy-snapshot-refresh.yml",
          import.meta.url
        ),
        "utf8"
      );

    for (const token of [
      "publicationUniverseProjection",
      "publicationUniverseMaterial",
      "deferredFixtureIds",
      "authoritativelyRemovedFixtureCount",
      "authoritativelyRemovedFixtureIds",
      "legacyPrunedFixtureCount",
      "legacyPrunedFixtureIds"
    ]) {
      assert.match(
        workflow,
        new RegExp(token, "u")
      );
    }

    assert.match(
      workflow,
      /fixtureMaterial\s*\|\|\s*publicationUniverseMaterial\s*\|\|\s*canonicalMaterial\s*\|\|\s*detailMaterial/u
    );

    assert.match(
      workflow,
      /if \[ "\$MATERIAL" != "true" \]; then[\s\S]*git restore -- "data\/deploy-snapshots\/\$\{DAY_KEY\}"/u
    );
  }
);
