import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DAY_TRUTH_LEDGER_SCHEMA,
  DAY_TRUTH_LEDGER_VERSION,
  DAY_TRUTH_LEDGER_ROLE,
  DAY_TRUTH_LEDGER_AUTHORITY,
  buildDayTruthLedger
} from "./day-truth-ledger.js";

const GENERATED_AT =
  "2026-09-15T12:00:00.000Z";

function canonical({
  id = "cid_test_alpha_beta_20260915",
  dayKey = "2026-09-15",
  status = "FT",
  rawStatus = "STATUS_FINAL",
  statusType = "STATUS_FINAL",
  scoreHome = 2,
  scoreAway = 1,
  extra = {}
} = {}) {
  return {
    canonicalId: id,
    matchId: id,
    dayKey,
    leagueSlug: "test.1",
    homeTeam: "Alpha",
    awayTeam: "Beta",
    kickoffUtc:
      "2026-09-15T18:00:00.000Z",
    status,
    rawStatus,
    statusType,
    scoreHome,
    scoreAway,
    ...extra
  };
}

function verified({
  id = "cid_test_alpha_beta_20260915",
  dayKey = "2026-09-15",
  scoreHome = 2,
  scoreAway = 1,
  verifiedFinalTruth = true,
  verdict = "verified_final_result"
} = {}) {
  return {
    schema:
      "ai-matchlab.verified-final-result.v1",
    verifiedFinalTruth,
    date: dayKey,
    dayKey,
    matchId: id,
    canonicalId: id,
    homeTeam: "Alpha",
    awayTeam: "Beta",
    scoreHome,
    scoreAway,
    homeScore: scoreHome,
    awayScore: scoreAway,
    finalTruthVerdict: verdict,
    verdict
  };
}

function build(options = {}) {
  return buildDayTruthLedger({
    dayKey:
      "2026-09-15",
    generatedAt:
      GENERATED_AT,
    canonicalRows:
      options.canonicalRows ??
      [canonical()],
    verifiedFinalRows:
      options.verifiedFinalRows ??
      [verified()],
    downstream:
      options.downstream ??
      {},

    downstreamConvergence:
      options.downstreamConvergence ??
      null,

    provenance:
      options.provenance ??
      {}
  });
}

test(
  "contract constants identify a derived non-authoritative control plane",
  () => {
    assert.equal(
      DAY_TRUTH_LEDGER_SCHEMA,
      "ai-matchlab.day-truth-ledger.v1"
    );

    assert.equal(
      DAY_TRUTH_LEDGER_VERSION,
      "1.0.0"
    );

    assert.equal(
      DAY_TRUTH_LEDGER_ROLE,
      "derived_control_plane"
    );

    assert.equal(
      DAY_TRUTH_LEDGER_AUTHORITY
        .membership,
      "canonical_fixtures"
    );

    assert.equal(
      DAY_TRUTH_LEDGER_AUTHORITY
        .scoredFinalEvidence,
      "verified_final_results"
    );

    assert.equal(
      DAY_TRUTH_LEDGER_AUTHORITY
        .downstreamProjections,
      "non_authoritative_observations"
    );
  }
);

test(
  "played terminal plus exact verified final converges and enables history plus scored settlement",
  () => {
    const ledger = build();

    assert.equal(
      ledger.ledgerState,
      "CLOSED"
    );

    assert.equal(
      ledger.summary
        .convergedPlayedFinal,
      1
    );

    const row =
      ledger.fixtures[0];

    assert.equal(
      row.operationalState,
      "PLAYED_TERMINAL"
    );

    assert.equal(
      row.verifiedFinal.accepted,
      true
    );

    assert.equal(
      row.verifiedFinal.scoreParity,
      true
    );

    assert.equal(
      row.decision.status,
      "CONVERGED_PLAYED_FINAL"
    );

    assert.equal(
      row.decision.historyEligible,
      true
    );

    assert.equal(
      row.decision
        .scoredSettlementEligible,
      true
    );

    assert.equal(
      row.decision
        .voidSettlementEligible,
      false
    );
  }
);

test(
  "played terminal without verified final remains fail-closed and incomplete",
  () => {
    const ledger =
      build({
        verifiedFinalRows: []
      });

    assert.equal(
      ledger.ledgerState,
      "INCOMPLETE"
    );

    assert.equal(
      ledger.summary
        .pendingVerifiedFinal,
      1
    );

    assert.equal(
      ledger.fixtures[0]
        .decision.status,
      "PENDING_VERIFIED_FINAL"
    );

    assert.equal(
      ledger.fixtures[0]
        .decision.historyEligible,
      false
    );

    assert.equal(
      ledger.fixtures[0]
        .decision
        .scoredSettlementEligible,
      false
    );
  }
);

test(
  "played terminal score mismatch is a truth conflict",
  () => {
    const ledger =
      build({
        verifiedFinalRows: [
          verified({
            scoreHome: 0,
            scoreAway: 0
          })
        ]
      });

    assert.equal(
      ledger.ledgerState,
      "CONFLICT"
    );

    assert.equal(
      ledger.summary.conflictRows,
      1
    );

    assert.equal(
      ledger.fixtures[0]
        .verifiedFinal
        .scoreParity,
      false
    );

    assert.equal(
      ledger.fixtures[0]
        .decision.reason,
      "canonical_verified_final_score_mismatch"
    );
  }
);

test(
  "explicit postponed fixture closes as non-played and is void-eligible but never history-eligible",
  () => {
    const fixture =
      canonical({
        status:
          "STATUS_POSTPONED",
        rawStatus:
          "STATUS_POSTPONED",
        statusType:
          "STATUS_POSTPONED",
        scoreHome: null,
        scoreAway: null
      });

    const ledger =
      build({
        canonicalRows: [
          fixture
        ],
        verifiedFinalRows: []
      });

    const row =
      ledger.fixtures[0];

    assert.equal(
      ledger.ledgerState,
      "CLOSED"
    );

    assert.equal(
      row.operationalState,
      "NON_PLAYED_TERMINAL"
    );

    assert.equal(
      row.decision.status,
      "CONVERGED_NON_PLAYED_TERMINAL"
    );

    assert.equal(
      row.decision.historyEligible,
      false
    );

    assert.equal(
      row.decision
        .scoredSettlementEligible,
      false
    );

    assert.equal(
      row.decision
        .voidSettlementEligible,
      true
    );
  }
);

test(
  "score presence cannot turn explicit postponed truth into a played terminal",
  () => {
    const fixture =
      canonical({
        status:
          "SPECIAL",
        rawStatus:
          "STATUS_POSTPONED",
        statusType: null,
        scoreHome: 9,
        scoreAway: 9
      });

    const ledger =
      build({
        canonicalRows: [
          fixture
        ],
        verifiedFinalRows: []
      });

    assert.equal(
      ledger.fixtures[0]
        .operationalState,
      "NON_PLAYED_TERMINAL"
    );

    assert.equal(
      ledger.fixtures[0]
        .decision.status,
      "CONVERGED_NON_PLAYED_TERMINAL"
    );

    assert.equal(
      ledger.fixtures[0]
        .decision
        .voidSettlementEligible,
      true
    );
  }
);

test(
  "verified final attached to non-played terminal truth creates conflict rather than overriding canonical state",
  () => {
    const fixture =
      canonical({
        status:
          "STATUS_POSTPONED",
        rawStatus:
          "STATUS_POSTPONED",
        statusType:
          "STATUS_POSTPONED",
        scoreHome: null,
        scoreAway: null
      });

    const ledger =
      build({
        canonicalRows: [
          fixture
        ],
        verifiedFinalRows: [
          verified()
        ]
      });

    assert.equal(
      ledger.ledgerState,
      "CONFLICT"
    );

    assert.equal(
      ledger.fixtures[0]
        .operationalState,
      "NON_PLAYED_TERMINAL"
    );

    assert.equal(
      ledger.fixtures[0]
        .decision.reason,
      "verified_final_conflicts_with_nonplayed_terminal"
    );
  }
);

test(
  "scheduled live delayed and interrupted states remain open without manufacturing closure",
  () => {
    const rows = [
      canonical({
        id:
          "cid_scheduled",
        status:
          "STATUS_SCHEDULED",
        rawStatus:
          "STATUS_SCHEDULED",
        statusType: null,
        scoreHome: null,
        scoreAway: null
      }),

      canonical({
        id:
          "cid_live",
        status:
          "LIVE",
        rawStatus:
          "STATUS_IN_PROGRESS",
        statusType:
          "STATUS_IN_PROGRESS",
        scoreHome: 1,
        scoreAway: 0
      }),

      canonical({
        id:
          "cid_delayed",
        status:
          "LIVE",
        rawStatus:
          "STATUS_DELAYED",
        statusType:
          "STATUS_DELAYED",
        scoreHome: 1,
        scoreAway: 0
      }),

      canonical({
        id:
          "cid_interrupted",
        status:
          "SPECIAL",
        rawStatus:
          "STATUS_SUSPENDED",
        statusType:
          "STATUS_SUSPENDED",
        scoreHome: 2,
        scoreAway: 1
      })
    ];

    const ledger =
      build({
        canonicalRows: rows,
        verifiedFinalRows: []
      });

    assert.equal(
      ledger.ledgerState,
      "OPEN"
    );

    assert.deepEqual(
      ledger.fixtures
        .map(row => [
          row.canonicalId,
          row.operationalState,
          row.decision.status
        ]),
      [
        [
          "cid_delayed",
          "DELAYED",
          "OPEN"
        ],
        [
          "cid_interrupted",
          "INTERRUPTED",
          "OPEN"
        ],
        [
          "cid_live",
          "LIVE",
          "OPEN"
        ],
        [
          "cid_scheduled",
          "SCHEDULED",
          "OPEN"
        ]
      ]
    );
  }
);

test(
  "generic lifecycle and terminal metadata alone remain unresolved",
  () => {
    const fixture =
      canonical({
        status: "",
        rawStatus: "",
        statusType: null,
        scoreHome: null,
        scoreAway: null,
        extra: {
          operationalState:
            "TERMINAL_CONFIRMED",
          finalized: 1,
          state: "final"
        }
      });

    const ledger =
      build({
        canonicalRows: [
          fixture
        ],
        verifiedFinalRows: []
      });

    assert.equal(
      ledger.ledgerState,
      "INCOMPLETE"
    );

    assert.equal(
      ledger.fixtures[0]
        .operationalState,
      "UNRESOLVED"
    );

    assert.equal(
      ledger.fixtures[0]
        .decision.status,
      "UNRESOLVED"
    );
  }
);

test(
  "orphan verified-final evidence cannot create match membership",
  () => {
    const ledger =
      build({
        canonicalRows: [],
        verifiedFinalRows: [
          verified({
            id:
              "cid_orphan_final"
          })
        ]
      });

    assert.equal(
      ledger.fixtures.length,
      0
    );

    assert.equal(
      ledger.summary
        .orphanVerifiedFinals,
      1
    );

    assert.equal(
      ledger.ledgerState,
      "CONFLICT"
    );

    assert.deepEqual(
      ledger.anomalies
        .orphanVerifiedFinals,
      [
        {
          canonicalId:
            "cid_orphan_final",
          reason:
            "verified_final_missing_canonical_membership"
        }
      ]
    );
  }
);

test(
  "duplicate canonical membership is rejected structurally",
  () => {
    const row =
      canonical();

    assert.throws(
      () =>
        build({
          canonicalRows: [
            row,
            {
              ...row
            }
          ],
          verifiedFinalRows: []
        }),
      /duplicate_canonical_fixture_id/
    );
  }
);

test(
  "duplicate verified-final artifacts fail closed on the fixture",
  () => {
    const ledger =
      build({
        verifiedFinalRows: [
          verified(),
          verified()
        ]
      });

    assert.equal(
      ledger.ledgerState,
      "CONFLICT"
    );

    assert.equal(
      ledger.summary
        .duplicateVerifiedFinalFixtureIds,
      1
    );

    assert.equal(
      ledger.fixtures[0]
        .decision.reason,
      "duplicate_verified_final_artifacts"
    );
  }
);

test(
  "invalid verified-final day is rejected as evidence and cannot authorize history",
  () => {
    const ledger =
      build({
        verifiedFinalRows: [
          verified({
            dayKey:
              "2026-09-14"
          })
        ]
      });

    assert.equal(
      ledger.ledgerState,
      "CONFLICT"
    );

    assert.equal(
      ledger.fixtures[0]
        .verifiedFinal.accepted,
      false
    );

    assert.equal(
      ledger.fixtures[0]
        .verifiedFinal.reason,
      "verified_final_day_mismatch"
    );

    assert.equal(
      ledger.fixtures[0]
        .decision.historyEligible,
      false
    );
  }
);

test(
  "downstream history settlement and publication are observations and cannot alter truth fingerprint",
  () => {
    const withoutDownstream =
      build();

    const withDownstream =
      build({
        downstream: {
          history: {
            fixtureIds: [
              "cid_test_alpha_beta_20260915"
            ]
          },

          settlement: {
            byCanonicalId: {
              cid_test_alpha_beta_20260915:
                "WIN"
            }
          },

          publication: {
            fixtureIds: [
              "cid_test_alpha_beta_20260915"
            ]
          },

          systemHealth: {
            severity:
              "warning",
            alert: true
          }
        }
      });

    assert.equal(
      withDownstream.truthFingerprint,
      withoutDownstream.truthFingerprint
    );

    assert.deepEqual(
      withDownstream.fixtures[0]
        .decision,
      withoutDownstream.fixtures[0]
        .decision
    );

    assert.deepEqual(
      withDownstream.fixtures[0]
        .downstream,
      {
        history: {
          observed: true,
          present: true
        },
        settlement: {
          observed: true,
          state: "WIN"
        },
        publication: {
          observed: true,
          present: true
        }
      }
    );
  }
);

test(
  "truth fingerprint and fixture order are deterministic regardless of input ordering",
  () => {
    const one =
      canonical({
        id: "cid_b"
      });

    const two =
      canonical({
        id: "cid_a",
        scoreHome: 1,
        scoreAway: 1
      });

    const finalOne =
      verified({
        id: "cid_b"
      });

    const finalTwo =
      verified({
        id: "cid_a",
        scoreHome: 1,
        scoreAway: 1
      });

    const left =
      build({
        canonicalRows: [
          one,
          two
        ],
        verifiedFinalRows: [
          finalOne,
          finalTwo
        ]
      });

    const right =
      build({
        canonicalRows: [
          two,
          one
        ],
        verifiedFinalRows: [
          finalTwo,
          finalOne
        ]
      });

    assert.equal(
      left.truthFingerprint,
      right.truthFingerprint
    );

    assert.deepEqual(
      left.fixtures.map(
        row => row.canonicalId
      ),
      [
        "cid_a",
        "cid_b"
      ]
    );

    assert.deepEqual(
      left.fixtures,
      right.fixtures
    );
  }
);

test(
  "downstream convergence is embedded without changing football truth fingerprint or mutation authority",
  () => {
    const base =
      build();

    assert.equal(
      base.downstream
        .convergence,
      null
    );

    const convergence = {
      overallState:
        "PARTIALLY_OBSERVED",

      truthFingerprint:
        base.truthFingerprint,

      history: {
        observed: true,
        state:
          "PRESENT_CONVERGED"
      },

      settlement: {
        observed: false,
        state:
          "NOT_OBSERVED"
      },

      publication: {
        observed: true,
        state:
          "PRESENT_CONVERGED"
      },

      systemHealth: {
        observed: true,
        state:
          "OBSERVED_WARNING"
      },

      authority: {
        footballTruthMutable:
          false,

        downstreamMutationAuthorized:
          false,

        repairAuthorized:
          false,

        observationsAffectTruthFingerprint:
          false
      }
    };

    const enriched =
      build({
        downstreamConvergence:
          convergence
      });

    assert.equal(
      enriched.truthFingerprint,
      base.truthFingerprint
    );

    assert.deepEqual(
      enriched.downstream
        .convergence,
      convergence
    );

    assert.equal(
      enriched.downstream
        .historyObserved,
      true
    );

    assert.equal(
      enriched.downstream
        .settlementObserved,
      false
    );

    assert.equal(
      enriched.downstream
        .publicationObserved,
      true
    );

    assert.equal(
      enriched.downstream
        .systemHealthObserved,
      true
    );

    assert.deepEqual(
      enriched.authorization,
      base.authorization
    );

    assert.throws(
      () =>
        build({
          downstreamConvergence: {
            ...convergence,
            truthFingerprint:
              "0".repeat(64)
          }
        }),
      /downstream_convergence_truth_fingerprint_mismatch/
    );

    assert.throws(
      () =>
        build({
          downstreamConvergence: {
            ...convergence,

            authority: {
              ...convergence.authority,

              repairAuthorized:
                true
            }
          }
        }),
      /invalid_downstream_convergence_authority/
    );
  }
);

test(
  "ledger has zero mutation authority",
  () => {
    const ledger = build();

    assert.deepEqual(
      ledger.authorization,
      {
        canonicalWriteAuthorized:
          false,

        verifiedFinalWriteAuthorized:
          false,

        historyWriteAuthorized:
          false,

        valueSettlementWriteAuthorized:
          false,

        publicationWriteAuthorized:
          false,

        repairAuthorized:
          false
      }
    );

    assert.equal(
      ledger.fixtures[0]
        .decision.repairAuthorized,
      false
    );
  }
);

test(
  "builder does not mutate canonical or verified-final inputs",
  () => {
    const canonicalRows = [
      canonical()
    ];

    const finalRows = [
      verified()
    ];

    const canonicalBefore =
      JSON.stringify(
        canonicalRows
      );

    const finalBefore =
      JSON.stringify(
        finalRows
      );

    build({
      canonicalRows,
      verifiedFinalRows:
        finalRows
    });

    assert.equal(
      JSON.stringify(
        canonicalRows
      ),
      canonicalBefore
    );

    assert.equal(
      JSON.stringify(
        finalRows
      ),
      finalBefore
    );
  }
);

test(
  "invalid calendar day fails closed",
  () => {
    assert.throws(
      () =>
        buildDayTruthLedger({
          dayKey:
            "2026-02-30",
          generatedAt:
            GENERATED_AT
        }),
      /invalid_day_key/
    );
  }
);

test(
  "schema freezes authority and mutation authorization contract",
  () => {
    const __filename =
      fileURLToPath(
        import.meta.url
      );

    const __dirname =
      path.dirname(
        __filename
      );

    const schema =
      JSON.parse(
        fs.readFileSync(
          path.resolve(
            __dirname,
            "../contracts/day-truth-ledger.schema.v1.json"
          ),
          "utf8"
        )
      );

    assert.equal(
      schema.properties
        .schema.const,
      "ai-matchlab.day-truth-ledger.v1"
    );

    assert.equal(
      schema.properties
        .role.const,
      "derived_control_plane"
    );

    assert.equal(
      schema.properties
        .authority
        .properties
        .membership
        .const,
      "canonical_fixtures"
    );

    assert.equal(
      schema.properties
        .authority
        .properties
        .scoredFinalEvidence
        .const,
      "verified_final_results"
    );

    assert.equal(
      schema.properties
        .authorization
        .properties
        .repairAuthorized
        .const,
      false
    );

    assert.equal(
      schema.properties
        .downstream
        .required
        .includes(
          "convergence"
        ),
      true
    );

    const convergenceSchema =
      schema.properties
        .downstream
        .properties
        .convergence
        .oneOf
        .find(
          branch =>
            branch?.type ===
            "object"
        );

    assert.ok(
      convergenceSchema
    );

    assert.equal(
      convergenceSchema
        .properties
        .authority
        .properties
        .repairAuthorized
        .const,
      false
    );

    assert.equal(
      convergenceSchema
        .properties
        .authority
        .properties
        .observationsAffectTruthFingerprint
        .const,
      false
    );
  }
);
