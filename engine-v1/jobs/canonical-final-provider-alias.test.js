import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  canonicalProviderSettlementAliases,
  enrichVerifiedFinalWithCanonicalAliases,
  exactIdentityAliases,
  buildExactIdentityIndex
} from "./build-value-plan-comparison-day.js";

const ROOT =
  path.resolve(
    path.dirname(
      fileURLToPath(
        import.meta.url
      )
    ),
    "..",
    ".."
  );

function validFixture(
  overrides = {}
) {
  return {
    canonicalId:
      "cid_usa1_intermiami_chicagofire_20260723",

    source:
      "espn",

    sourceId:
      "761667",

    sourceMatchId:
      "761667",

    homeTeam:
      "Inter Miami CF",

    awayTeam:
      "Chicago Fire FC",

    status:
      "FT",

    rawStatus:
      "STATUS_FULL_TIME",

    scoreHome: 3,
    scoreAway: 2,

    ...overrides
  };
}

function validFinal(
  overrides = {}
) {
  return {
    schema:
      "ai-matchlab.verified-final-result.v1",

    verifiedFinalTruth: true,

    matchId:
      "cid_usa1_intermiami_chicagofire_20260723",

    homeTeam:
      "Inter Miami CF",

    awayTeam:
      "Chicago Fire FC",

    scoreHome: 3,
    scoreAway: 2,

    finalScore: {
      homeScore: 3,
      awayScore: 2,
      scoreKey: "3-2"
    },

    ...overrides
  };
}

test(
  "verified canonical final receives exact canonical provider alias",
  () => {
    assert.deepEqual(
      canonicalProviderSettlementAliases(
        validFinal(),
        validFixture()
      ),
      [
        "761667"
      ]
    );
  }
);

test(
  "enrichment is settlement-only and does not mutate the artifact",
  () => {
    const finalResult =
      validFinal();

    const enriched =
      enrichVerifiedFinalWithCanonicalAliases(
        finalResult,
        validFixture()
      );

    assert.notEqual(
      enriched,
      finalResult
    );

    assert.equal(
      finalResult
        .settlementIdentityAliases,
      undefined
    );

    assert.deepEqual(
      enriched
        .settlementIdentityAliases,
      [
        "761667"
      ]
    );

    assert.ok(
      exactIdentityAliases(enriched)
        .includes("761667")
    );
  }
);

test(
  "canonical provider alias fails closed on every truth mismatch",
  () => {
    const cases = [
      {
        name:
          "unverified final",

        finalResult:
          validFinal({
            verifiedFinalTruth: false
          }),

        fixture:
          validFixture()
      },
      {
        name:
          "canonical id mismatch",

        finalResult:
          validFinal({
            matchId:
              "cid_wrong"
          }),

        fixture:
          validFixture()
      },
      {
        name:
          "team mismatch",

        finalResult:
          validFinal({
            awayTeam:
              "Different Club"
          }),

        fixture:
          validFixture()
      },
      {
        name:
          "score mismatch",

        finalResult:
          validFinal({
            scoreAway: 1,

            finalScore: {
              homeScore: 3,
              awayScore: 1,
              scoreKey: "3-1"
            }
          }),

        fixture:
          validFixture()
      },
      {
        name:
          "canonical nonterminal",

        finalResult:
          validFinal(),

        fixture:
          validFixture({
            status:
              "STATUS_SCHEDULED",

            rawStatus:
              "STATUS_SCHEDULED",

            scoreHome: null,
            scoreAway: null
          })
      },
      {
        name:
          "provider identity missing",

        finalResult:
          validFinal(),

        fixture:
          validFixture({
            sourceId: "",
            sourceMatchId: ""
          })
      }
    ];

    for (const entry of cases) {
      assert.deepEqual(
        canonicalProviderSettlementAliases(
          entry.finalResult,
          entry.fixture
        ),
        [],
        entry.name
      );
    }
  }
);

test(
  "exact identity index resolves an enriched provider alias",
  () => {
    const enriched =
      enrichVerifiedFinalWithCanonicalAliases(
        validFinal(),
        validFixture()
      );

    const identity =
      buildExactIdentityIndex([
        enriched
      ]);

    assert.equal(
      identity.byId.get("761667"),
      enriched
    );

    assert.deepEqual(
      identity.ambiguousIds,
      []
    );
  }
);

test(
  "provider alias collision remains ambiguous and fails closed",
  () => {
    const first =
      enrichVerifiedFinalWithCanonicalAliases(
        validFinal(),
        validFixture()
      );

    const second = {
      ...validFinal({
        matchId:
          "cid_other_final",

        homeTeam:
          "Other Home",

        awayTeam:
          "Other Away"
      }),

      settlementIdentityAliases: [
        "761667"
      ]
    };

    const identity =
      buildExactIdentityIndex([
        first,
        second
      ]);

    assert.equal(
      identity.byId.has("761667"),
      false
    );

    assert.deepEqual(
      identity.ambiguousIds,
      [
        "761667"
      ]
    );
  }
);

test(
  "real MLS canonical finals expose four frozen Plan B aliases",
  () => {
    const mappings = [
      [
        "761667",
        "cid_usa1_intermiami_chicagofire_20260723"
      ],
      [
        "761669",
        "cid_usa1_cincinnati_vancouverwhitecaps_20260723"
      ],
      [
        "761676",
        "cid_usa1_sanjoseearthquakes_orlandocity_20260723"
      ],
      [
        "761677",
        "cid_usa1_portlandtimbers_dallas_20260723"
      ]
    ];

    const canonicalPayload =
      JSON.parse(
        fs.readFileSync(
          path.join(
            ROOT,
            "data",
            "canonical-fixtures",
            "2026-07-23",
            "usa.1.json"
          ),
          "utf8"
        )
      );

    const canonicalById =
      new Map(
        canonicalPayload.fixtures.map(
          row => [
            row.canonicalId,
            row
          ]
        )
      );

    for (
      const [providerId, canonicalId] of
      mappings
    ) {
      const fixture =
        canonicalById.get(
          canonicalId
        );

      assert.ok(
        fixture,
        `missing fixture: ${canonicalId}`
      );

      const finalResult =
        JSON.parse(
          fs.readFileSync(
            path.join(
              ROOT,
              "data",
              "final-results",
              "2026-07-23",
              `${canonicalId}.json`
            ),
            "utf8"
          )
        );

      assert.deepEqual(
        canonicalProviderSettlementAliases(
          finalResult,
          fixture
        ),
        [
          providerId
        ],
        canonicalId
      );
    }
  }
);
