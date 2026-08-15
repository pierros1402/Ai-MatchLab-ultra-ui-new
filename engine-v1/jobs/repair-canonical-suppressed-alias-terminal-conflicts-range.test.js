import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  repairCanonicalSuppressedAliasTerminalConflictsRange
} from "./repair-canonical-suppressed-alias-terminal-conflicts-range.js";

function writeJson(file, payload) {
  fs.mkdirSync(
    path.dirname(file),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    file,
    JSON.stringify(
      payload,
      null,
      2
    ),
    "utf8"
  );
}

function makeRoots() {
  const root =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "step31-alias-range-"
      )
    );

  const roots = {
    root,
    canonicalRoot:
      path.join(
        root,
        "canonical-fixtures"
      ),
    finalRoot:
      path.join(
        root,
        "final-results"
      ),
    quarantineRoot:
      path.join(
        root,
        "quarantine"
      ),
    identityRecoveryFile:
      path.join(
        root,
        "identity-recovery.json"
      ),
    identityExtensionFile:
      path.join(
        root,
        "identity-extension.json"
      )
  };

  for (const dir of [
    roots.canonicalRoot,
    roots.finalRoot,
    roots.quarantineRoot
  ]) {
    fs.mkdirSync(
      dir,
      {
        recursive: true
      }
    );
  }

  return roots;
}

function canonicalRow({
  matchId,
  providerMatchId,
  scoreHome = 0,
  scoreAway = 0,
  kickoffUtc =
    "2026-08-08T18:00:00.000Z"
}) {
  return {
    canonicalId:
      matchId,
    matchId,
    dayKey:
      "2026-08-08",
    leagueSlug:
      "tst.1",
    source:
      "flashscore",
    sourceId:
      providerMatchId,
    sourceMatchId:
      providerMatchId,
    homeTeam:
      "Home Club",
    awayTeam:
      "Away Club",
    kickoffUtc,
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
    scoreHome,
    scoreAway,
    authoritativeTerminalWriteback: {
      schema:
        "ai-matchlab.authoritative-terminal-writeback.v1",
      provider:
        "reconciled",
      providerMatchId,
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
        scoreHome,
        scoreAway
      }
    }
  };
}

function decision({
  aliasId,
  retainedId,
  providerMatchId,
  decisionId
}) {
  return {
    dayKey:
      "2026-08-08",
    leagueSlug:
      "tst.1",
    retainedRepositoryFixtureId:
      retainedId,
    suppressedRepositoryFixtureIds: [
      aliasId
    ],
    promotionBasis:
      "TWO_PROVIDER_EXACT_COUNTERPART_WITH_STABLE_SIDE",
    sourceFixtures: [
      {
        provider:
          "flashscore",
        providerMatchId,
        repositoryFixtureId:
          aliasId,
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
          `ESPN-${decisionId}`,
        repositoryFixtureId:
          retainedId,
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
      decisionId
  };
}

function installLedgers(
  roots,
  decisions
) {
  const payload = {
    fixtureLineageDecisions:
      decisions
  };

  writeJson(
    roots.identityRecoveryFile,
    payload
  );

  writeJson(
    roots.identityExtensionFile,
    payload
  );
}

function invoke(
  roots,
  overrides = {}
) {
  return repairCanonicalSuppressedAliasTerminalConflictsRange({
    from:
      "2026-08-08",
    to:
      "2026-08-08",
    canonicalRoot:
      roots.canonicalRoot,
    finalRoot:
      roots.finalRoot,
    quarantineRoot:
      roots.quarantineRoot,
    identityRecoveryFile:
      roots.identityRecoveryFile,
    identityExtensionFile:
      roots.identityExtensionFile,
    repairedAt:
      "2026-08-15T03:30:00.000Z",
    ...overrides
  });
}

test(
  "repairs retained-final suppressed artifact with dual-ledger identity binding",
  () => {
    const roots =
      makeRoots();

    try {
      const aliasId =
        "cid_test_alias_20260808";
      const retainedId =
        "cid_test_retained_20260808";
      const decisionId =
        "decision-retained";
      const providerMatchId =
        "FS-RETAINED";

      const d =
        decision({
          aliasId,
          retainedId,
          providerMatchId,
          decisionId
        });

      installLedgers(
        roots,
        [d]
      );

      writeJson(
        path.join(
          roots.canonicalRoot,
          "2026-08-08",
          "tst.1.json"
        ),
        {
          leagueSlug:
            "tst.1",
          fixtures: [
            canonicalRow({
              matchId:
                aliasId,
              providerMatchId
            })
          ]
        }
      );

      writeJson(
        path.join(
          roots.finalRoot,
          "2026-08-08",
          `${retainedId}.json`
        ),
        {
          verifiedFinalTruth:
            true,
          matchId:
            retainedId,
          dayKey:
            "2026-08-08",
          leagueSlug:
            "tst.1",
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
          productionIdentityReconciliation: {
            retainedFixtureId:
              retainedId,
            fixtureRetentionDecisionId:
              decisionId,
            suppressedArtifacts: [
              {
                sourceFixtureId:
                  aliasId,
                originalMatchId:
                  aliasId,
                scoreKey:
                  "2-1",
                verification: {
                  verdict:
                    "verified_final_result"
                },
                sources: [
                  {
                    provider:
                      "flashscore",
                    providerMatchId,
                    home:
                      "Home Club",
                    away:
                      "Away Club",
                    kickoffUtc:
                      "2026-08-08T18:00:00.000Z",
                    scoreHome:
                      2,
                    scoreAway:
                      1
                  }
                ]
              }
            ]
          }
        }
      );

      const dry =
        invoke(
          roots
        );

      assert.equal(
        dry.repairableRows,
        1
      );
      assert.equal(
        dry.unresolvedRows,
        0
      );
      assert.equal(
        dry.byMode
          .retained_final_suppressed_artifact,
        1
      );

      const written =
        invoke(
          roots,
          {
            write:
              true
          }
        );

      assert.equal(
        written.repairedRows,
        1
      );
      assert.equal(
        written.filesWritten,
        1
      );

      const payload =
        JSON.parse(
          fs.readFileSync(
            path.join(
              roots.canonicalRoot,
              "2026-08-08",
              "tst.1.json"
            ),
            "utf8"
          )
        );

      assert.equal(
        payload.fixtures[0].status,
        "FT"
      );
      assert.equal(
        payload.fixtures[0].scoreHome,
        2
      );
      assert.equal(
        payload.fixtures[0].scoreAway,
        1
      );

      const fixed =
        invoke(
          roots
        );

      assert.equal(
        fixed.topLevelConflictRows,
        0
      );
      assert.equal(
        fixed.repairableRows,
        0
      );
    }
    finally {
      fs.rmSync(
        roots.root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "repairs quarantined SAME_TRUTH_SUPPRESSED_ALIAS only when retained final agrees",
  () => {
    const roots =
      makeRoots();

    try {
      const aliasId =
        "cid_test_alias_quarantine_20260808";
      const retainedId =
        "cid_test_retained_quarantine_20260808";
      const decisionId =
        "decision-quarantine";
      const providerMatchId =
        "FS-QUARANTINE";

      const d =
        decision({
          aliasId,
          retainedId,
          providerMatchId,
          decisionId
        });

      installLedgers(
        roots,
        [d]
      );

      writeJson(
        path.join(
          roots.canonicalRoot,
          "2026-08-08",
          "tst.1.json"
        ),
        {
          leagueSlug:
            "tst.1",
          fixtures: [
            canonicalRow({
              matchId:
                aliasId,
              providerMatchId
            })
          ]
        }
      );

      writeJson(
        path.join(
          roots.finalRoot,
          "2026-08-08",
          `${retainedId}.json`
        ),
        {
          verifiedFinalTruth:
            true,
          matchId:
            retainedId,
          dayKey:
            "2026-08-08",
          scoreHome:
            0,
          scoreAway:
            0
        }
      );

      const aliasDir =
        path.join(
          roots.quarantineRoot,
          "final-result-aliases",
          "2026-08-08"
        );

      writeJson(
        path.join(
          aliasDir,
          `${aliasId}.json`
        ),
        {
          verifiedFinalTruth:
            true,
          matchId:
            aliasId,
          dayKey:
            "2026-08-08",
          leagueSlug:
            "tst.1",
          homeTeam:
            "Home Club",
          awayTeam:
            "Away Club",
          kickoffUtc:
            "2026-08-08T18:00:00.000Z",
          scoreHome:
            0,
          scoreAway:
            0,
          sources: [
            {
              provider:
                "flashscore",
              providerMatchId,
              home:
                "Home Club",
              away:
                "Away Club",
              kickoffUtc:
                "2026-08-08T18:00:00.000Z",
              scoreHome:
                0,
              scoreAway:
                0
            }
          ]
        }
      );

      writeJson(
        path.join(
          aliasDir,
          `${aliasId}.json.manifest.json`
        ),
        {
          schema:
            "ai-matchlab.suppressed-final-result-alias-repair.v1",
          dayKey:
            "2026-08-08",
          aliasFixtureId:
            aliasId,
          targetFixtureId:
            retainedId,
          reason:
            "SAME_TRUTH_SUPPRESSED_ALIAS",
          aliasScore:
            "0-0",
          targetScore:
            "0-0",
          reversible:
            true
        }
      );

      const report =
        invoke(
          roots
        );

      assert.equal(
        report.repairableRows,
        1
      );
      assert.equal(
        report.unresolvedRows,
        0
      );
      assert.equal(
        report.byMode
          .quarantined_same_truth_alias,
        1
      );
    }
    finally {
      fs.rmSync(
        roots.root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "fails closed when the two identity ledgers disagree",
  () => {
    const roots =
      makeRoots();

    try {
      const aliasId =
        "cid_test_alias_disagree_20260808";
      const providerMatchId =
        "FS-DISAGREE";

      const left =
        decision({
          aliasId,
          retainedId:
            "cid_retained_a_20260808",
          providerMatchId,
          decisionId:
            "decision-a"
        });

      const right =
        decision({
          aliasId,
          retainedId:
            "cid_retained_b_20260808",
          providerMatchId,
          decisionId:
            "decision-b"
        });

      writeJson(
        roots.identityRecoveryFile,
        {
          fixtureLineageDecisions:
            [left]
        }
      );

      writeJson(
        roots.identityExtensionFile,
        {
          fixtureLineageDecisions:
            [right]
        }
      );

      writeJson(
        path.join(
          roots.canonicalRoot,
          "2026-08-08",
          "tst.1.json"
        ),
        {
          fixtures: [
            canonicalRow({
              matchId:
                aliasId,
              providerMatchId
            })
          ]
        }
      );

      const report =
        invoke(
          roots
        );

      assert.equal(
        report.repairableRows,
        0
      );
      assert.equal(
        report.unresolvedRows,
        1
      );
      assert.equal(
        report
          .unresolvedByReason
          .identity_ledgers_disagree_or_missing,
        1
      );
    }
    finally {
      fs.rmSync(
        roots.root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);
