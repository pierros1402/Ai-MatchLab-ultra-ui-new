import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  auditIdentityRows,
  parseArgs,
  structuralIntegrationStatus,
} from "./audit-production-identity-result-truth-integration.js";

import {
  prepareResultMemoryMatch,
} from "../storage/results-memory-db.js";

import {
  canonicalizeLeagueResults,
} from "../storage/result-dedup.js";

function resolver() {
  return {
    resolveFixtureId(value) {
      if (value === "cid_retained") {
        return {
          ok: true,
          resolvedFixtureId:
            "cid_retained",
          sourceRole:
            "retained",
          fixtureRetentionDecisionId:
            "frd_1",
          homeGlobalClubId:
            "gcid_home",
          awayGlobalClubId:
            "gcid_away",
        };
      }

      if (value === "cid_suppressed") {
        return {
          ok: true,
          resolvedFixtureId:
            "cid_retained",
          sourceRole:
            "suppressed_lineage_alias",
          fixtureRetentionDecisionId:
            "frd_1",
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
      };
    },
  };
}

test(
  "CLI parser requires all source-bound inputs",
  () => {
    assert.throws(
      () =>
        parseArgs([
          "node",
          "audit.js",
          "--repo-root",
          "repo",
        ]),
      /missing_argument/u,
    );
  },
);

test(
  "row audit resolves retained and suppressed identities without truth changes",
  () => {
    const rows = [
      {
        matchId:
          "cid_retained",
        status:
          "FT",
        scoreHome:
          2,
        scoreAway:
          1,
      },
      {
        matchId:
          "cid_suppressed",
        status:
          "FT",
        scoreHome:
          1,
        scoreAway:
          0,
      },
      {
        matchId:
          "provider_unknown",
        status:
          "FT",
        scoreHome:
          0,
        scoreAway:
          0,
      },
    ];

    const result =
      auditIdentityRows(
        rows,
        {
          resolver:
            resolver(),
        },
      );

    assert.equal(
      result.summary.rowsScanned,
      3,
    );
    assert.equal(
      result.summary.managedRows,
      2,
    );
    assert.equal(
      result.summary.retainedRows,
      1,
    );
    assert.equal(
      result.summary.suppressedRows,
      1,
    );
    assert.equal(
      result.summary.unmanagedRows,
      1,
    );
    assert.equal(
      result.summary.truthChangedRows,
      0,
    );
    assert.equal(
      result.summary.bindingErrors,
      0,
    );
    assert.deepEqual(
      result.issues,
      [],
    );
  },
);

test(
  "structural integration requires all four production consumers",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-t1b-structure-",
        ),
      );

    try {
      const files = {
        "engine-v1/core/results-truth-overlay.js":
          "production-result-identity-binding.js resolvedFixtureId suppressed_lineage_alias",

        "engine-v1/jobs/export-verified-final-results-day.js":
          "bindProductionResultIdentity bindVerifiedFinalResultPayloadIdentity requireCanonicalMembership",

        "engine-v1/storage/results-memory-db.js":
          "bindProductionResultIdentity resultMemoryIdentityFields sourceMatchId",

        "engine-v1/storage/result-dedup.js":
          "bindProductionResultIdentity resultMemoryIdentityFields sourceMatchId",
      };

      for (
        const [relativePath, content]
        of Object.entries(files)
      ) {
        const filePath =
          path.join(
            root,
            relativePath,
          );

        fs.mkdirSync(
          path.dirname(filePath),
          {
            recursive: true,
          },
        );

        fs.writeFileSync(
          filePath,
          content,
          "utf8",
        );
      }

      const result =
        structuralIntegrationStatus(
          root,
        );

      assert.equal(
        result.ok,
        true,
      );
      assert.equal(
        result.productionConsumersIntegrated,
        4,
      );
      assert.deepEqual(
        result.missing,
        [],
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive: true,
          force: true,
        },
      );
    }
  },
);

test(
  "structural integration fails closed on a missing anchor",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-t1b-structure-",
        ),
      );

    try {
      const filePath =
        path.join(
          root,
          "engine-v1/core/results-truth-overlay.js",
        );

      fs.mkdirSync(
        path.dirname(filePath),
        {
          recursive: true,
        },
      );

      fs.writeFileSync(
        filePath,
        "resolvedFixtureId",
        "utf8",
      );

      const result =
        structuralIntegrationStatus(
          root,
        );

      assert.equal(
        result.ok,
        false,
      );
      assert.ok(
        result.missing.length > 0,
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive: true,
          force: true,
        },
      );
    }
  },
);


test(
  "result memory preparation preserves score and binds retained identity",
  () => {
    const prepared =
      prepareResultMemoryMatch(
        {
          matchId:
            "cid_suppressed",
          home:
            "Home",
          away:
            "Away",
          scoreHome:
            3,
          scoreAway:
            2,
          kickoffUtc:
            "2026-08-02T12:00:00.000Z",
        },
        {
          resolver:
            resolver(),
        },
      );

    assert.equal(
      prepared.ok,
      true,
    );
    assert.equal(
      prepared.matchId,
      "cid_retained",
    );
    assert.equal(
      prepared.originalMatchId,
      "cid_suppressed",
    );
    assert.equal(
      prepared.row.scoreHome,
      3,
    );
    assert.equal(
      prepared.row.scoreAway,
      2,
    );
    assert.equal(
      prepared.identityFields.homeGlobalClubId,
      "gcid_home",
    );
    assert.equal(
      prepared.identityFields.awayGlobalClubId,
      "gcid_away",
    );
  },
);

test(
  "result dedup normalizes suppressed identity without changing score",
  () => {
    const payload = {
      slug:
        "test.1",
      teams: {
        Home: [
          {
            matchId:
              "cid_suppressed",
            date:
              "2026-08-02T12:00:00.000Z",
            opp:
              "Away",
            ha:
              "H",
            gf:
              2,
            ga:
              1,
            res:
              "W",
          },
        ],
        Away: [
          {
            matchId:
              "cid_suppressed",
            date:
              "2026-08-02T12:00:00.000Z",
            opp:
              "Home",
            ha:
              "A",
            gf:
              1,
            ga:
              2,
            res:
              "L",
          },
        ],
      },
    };

    const result =
      canonicalizeLeagueResults(
        payload,
        {
          slug:
            "test.1",
          resolver:
            resolver(),
          aliasResolver:
            () => [],
        },
      );

    const home =
      result.payload.teams.Home[0];

    const away =
      result.payload.teams.Away[0];

    assert.equal(
      home.matchId,
      "cid_retained",
    );
    assert.equal(
      away.matchId,
      "cid_retained",
    );
    assert.equal(
      home.sourceMatchId,
      "cid_suppressed",
    );
    assert.equal(
      home.gf,
      2,
    );
    assert.equal(
      home.ga,
      1,
    );
    assert.equal(
      away.gf,
      1,
    );
    assert.equal(
      away.ga,
      2,
    );
    assert.equal(
      home.homeGlobalClubId,
      "gcid_home",
    );
    assert.equal(
      home.awayGlobalClubId,
      "gcid_away",
    );
  },
);
