import test from "node:test";
import assert from "node:assert/strict";

import {
  canRemoveEspnWrongDayCanonicalRow,
  isConfirmedDelayedFinal,
  mergeConfirmedDelayedFinal,
  normalizeSourceRows,
  parseLiveStatusRefreshCliArgs,
  preserveExactWrongDayReconciliation,
  resolveApprovedFlashscoreFinalScoreRevision,
  resolveEspnExactEventOccurrence
} from "./run-live-status-refresh-day.js";

function espnEvent({
  id = "401896232",
  date = "2026-07-23T16:30:00.000Z",
  statusName = "STATUS_FINAL",
  homeScore = "4",
  awayScore = "1"
} = {}) {
  return {
    id,
    date,
    competitions: [
      {
        date,
        status: {
          type: { name: statusName },
          displayClock: "FT"
        },
        competitors: [
          {
            homeAway: "home",
            score: homeScore,
            team: { displayName: "Rigas Futbola Skola" }
          },
          {
            homeAway: "away",
            score: awayScore,
            team: { displayName: "Vestri" }
          }
        ],
        venue: { fullName: "LNK Sports Park" }
      }
    ]
  };
}

test("qualifier provider rows retain provider slug and write to canonical parent", () => {
  const rows = normalizeSourceRows(
    [espnEvent()],
    "uefa.europa.conf_qual",
    "2026-07-23",
    { canonicalSlug: "uefa.europa.conf" }
  );

  const row = rows.get("401896232");

  assert.ok(row);
  assert.equal(row.providerLeagueSlug, "uefa.europa.conf_qual");
  assert.equal(row.leagueSlug, "uefa.europa.conf");
  assert.equal(
    row.canonicalId,
    "cid_uefaeuropaconf_rigasfutbolaskola_vestri_20260723"
  );
  assert.equal(row.status, "FT");
  assert.equal(row.scoreHome, 4);
  assert.equal(row.scoreAway, 1);
});

test("source rows outside the requested Athens day are rejected", () => {
  const rows = normalizeSourceRows(
    [espnEvent({ date: "2026-07-22T16:30:00.000Z" })],
    "uefa.europa.conf_qual",
    "2026-07-23",
    { canonicalSlug: "uefa.europa.conf" }
  );

  assert.equal(rows.size, 0);
});

test("mature exact Flashscore final-score revision may repair an immutable canonical FT", () => {
  const canonical = {
    canonicalId: "cid_test_home_away_20260808",
    matchId: "cid_test_home_away_20260808",
    source: "flashscore",
    sourceId: "provider-1",
    sourceMatchId: "provider-1",
    homeTeam: "Home",
    awayTeam: "Away",
    kickoffUtc: "2026-08-08T12:00:00.000Z",
    status: "FT",
    statusType: "STATUS_FINAL",
    rawStatus: "STATUS_FINAL",
    scoreHome: 1,
    scoreAway: 0
  };
  const source = {
    matchId: "provider-1",
    home: "Home",
    away: "Away",
    kickoffUtc: "2026-08-08T12:00:00.000Z",
    finished: true,
    playedFinal: true,
    nonPlayedTerminal: false,
    statusCode: "3",
    scoreHome: 1,
    scoreAway: 2
  };
  const finalArtifact = {
    verifiedFinalTruth: true,
    matchId: canonical.matchId,
    homeTeam: "Home",
    awayTeam: "Away",
    kickoffUtc: canonical.kickoffUtc,
    scoreKey: "1-2",
    scoreHome: 1,
    scoreAway: 2,
    terminalScoreRevision: {
      policyVersion: "flashscore-terminal-revision-v1",
      state: "APPLIED",
      provider: "flashscore",
      providerMatchId: "provider-1",
      previousScore: "1-0",
      correctedScore: "1-2",
      observationCount: 2,
      stableForMs: 240001,
      appliedAt: "2026-08-08T18:05:00.000Z"
    }
  };

  const resolved = resolveApprovedFlashscoreFinalScoreRevision(
    canonical,
    source,
    finalArtifact,
    "2026-08-08"
  );

  assert.equal(resolved.ok, true);
  assert.equal(resolved.previousScore, "1-0");
  assert.equal(resolved.correctedScore, "1-2");
});

test("one observation or a mismatched provider cannot revise canonical FT", () => {
  const canonical = {
    canonicalId: "cid_test_home_away_20260808",
    matchId: "cid_test_home_away_20260808",
    source: "flashscore",
    sourceId: "provider-1",
    homeTeam: "Home",
    awayTeam: "Away",
    kickoffUtc: "2026-08-08T12:00:00.000Z",
    status: "FT",
    statusType: "STATUS_FINAL",
    scoreHome: 1,
    scoreAway: 0
  };
  const source = {
    matchId: "provider-1",
    kickoffUtc: canonical.kickoffUtc,
    finished: true,
    playedFinal: true,
    nonPlayedTerminal: false,
    statusCode: "3",
    scoreHome: 1,
    scoreAway: 2
  };
  const artifact = {
    verifiedFinalTruth: true,
    matchId: canonical.matchId,
    homeTeam: "Home",
    awayTeam: "Away",
    kickoffUtc: canonical.kickoffUtc,
    scoreKey: "1-2",
    terminalScoreRevision: {
      policyVersion: "flashscore-terminal-revision-v1",
      state: "APPLIED",
      provider: "flashscore",
      providerMatchId: "provider-1",
      previousScore: "1-0",
      correctedScore: "1-2",
      observationCount: 1,
      stableForMs: 240001
    }
  };

  assert.equal(
    resolveApprovedFlashscoreFinalScoreRevision(canonical, source, artifact, "2026-08-08").ok,
    false
  );

  artifact.terminalScoreRevision.observationCount = 2;
  artifact.terminalScoreRevision.providerMatchId = "provider-2";
  assert.equal(
    resolveApprovedFlashscoreFinalScoreRevision(canonical, source, artifact, "2026-08-08").ok,
    false
  );
});


function espnSummary({
  id,
  date,
  statusName,
  statusState,
  completed,
  homeName,
  awayName,
  homeScore = null,
  awayScore = null
}) {
  return {
    header: {
      id,
      date,
      competitions: [
        {
          id,
          date,
          status: {
            type: {
              name:
                statusName,
              state:
                statusState,
              completed
            },
            displayClock:
              completed
                ? "FT"
                : null
          },
          competitors: [
            {
              homeAway:
                "home",
              score:
                homeScore,
              team: {
                displayName:
                  homeName
              }
            },
            {
              homeAway:
                "away",
              score:
                awayScore,
              team: {
                displayName:
                  awayName
              }
            }
          ]
        }
      ]
    }
  };
}

test(
  "exact ESPN summary removes a rescheduled event from the old canonical day",
  () => {
    const result =
      resolveEspnExactEventOccurrence(
        espnSummary({
          id:
            "401886421",
          date:
            "2026-09-16T01:00Z",
          statusName:
            "STATUS_SCHEDULED",
          statusState:
            "pre",
          completed:
            false,
          homeName:
            "Dorados de Sinaloa",
          awayName:
            "Cancún FC"
        }),
        "mex.2",
        "2026-07-26",
        {
          canonicalSlug:
            "mex.2"
        }
      );

    assert.equal(
      result.kind,
      "other_day"
    );

    assert.equal(
      result.providerMatchId,
      "401886421"
    );

    assert.equal(
      result.authoritativeDayKey,
      "2026-09-16"
    );

    assert.equal(
      result.incoming,
      null
    );

    assert.equal(
      result.evidence.status,
      "PRE"
    );
  }
);

test(
  "exact ESPN terminal evidence from another day is not promoted into the wrong occurrence",
  () => {
    const result =
      resolveEspnExactEventOccurrence(
        espnSummary({
          id:
            "401878179",
          date:
            "2026-07-25T15:30Z",
          statusName:
            "STATUS_FULL_TIME",
          statusState:
            "post",
          completed:
            true,
          homeName:
            "Sport Boys",
          awayName:
            "ADT",
          homeScore:
            "2",
          awayScore:
            "0"
        }),
        "per.1",
        "2026-07-26",
        {
          canonicalSlug:
            "per.1"
        }
      );

    assert.equal(
      result.kind,
      "other_day"
    );

    assert.equal(
      result.authoritativeDayKey,
      "2026-07-25"
    );

    assert.equal(
      result.incoming,
      null
    );

    assert.equal(
      result.evidence.status,
      "FT"
    );

    assert.equal(
      Object.hasOwn(
        result.evidence,
        "scoreHome"
      ),
      false
    );
  }
);

test(
  "exact ESPN summary on the requested day remains mergeable",
  () => {
    const result =
      resolveEspnExactEventOccurrence(
        espnSummary({
          id:
            "401900777",
          date:
            "2026-07-26T18:00Z",
          statusName:
            "STATUS_FULL_TIME",
          statusState:
            "post",
          completed:
            true,
          homeName:
            "Home Club",
          awayName:
            "Away Club",
          homeScore:
            "1",
          awayScore:
            "0"
        }),
        "test.1",
        "2026-07-26",
        {
          canonicalSlug:
            "test.1"
        }
      );

    assert.equal(
      result.kind,
      "same_day"
    );

    assert.ok(
      result.incoming
    );

    assert.equal(
      result.incoming.status,
      "FT"
    );

    assert.equal(
      result.incoming.scoreHome,
      1
    );

    assert.equal(
      result.incoming.scoreAway,
      0
    );
  }
);


test(
  "wrong-day deletion accepts exact provider and ordered team identity",
  () => {
    assert.equal(
      canRemoveEspnWrongDayCanonicalRow(
        {
          sourceId: "401886421",
          homeTeam: "Dorados",
          awayTeam: "Cancun"
        },
        {
          providerMatchId: "401886421",
          homeTeam: "Dorados de Sinaloa",
          awayTeam: "Cancún FC"
        }
      ),
      true
    );
  }
);

test(
  "wrong-day deletion rejects a different team pair under the same provider ID",
  () => {
    assert.equal(
      canRemoveEspnWrongDayCanonicalRow(
        {
          sourceId: "401886421",
          homeTeam: "Dorados",
          awayTeam: "Cancun"
        },
        {
          providerMatchId: "401886421",
          homeTeam: "Another Club",
          awayTeam: "Cancún FC"
        }
      ),
      false
    );
  }
);

test(
  "wrong-day deletion rejects reversed home and away identity",
  () => {
    assert.equal(
      canRemoveEspnWrongDayCanonicalRow(
        {
          sourceId: "401886421",
          homeTeam: "Dorados",
          awayTeam: "Cancun"
        },
        {
          providerMatchId: "401886421",
          homeTeam: "Cancún FC",
          awayTeam: "Dorados de Sinaloa"
        }
      ),
      false
    );
  }
);

test(
  "wrong-day deletion rejects missing provider team identity",
  () => {
    assert.equal(
      canRemoveEspnWrongDayCanonicalRow(
        {
          sourceId: "401886421",
          homeTeam: "Dorados",
          awayTeam: "Cancun"
        },
        {
          providerMatchId: "401886421",
          homeTeam: null,
          awayTeam: "Cancún FC"
        }
      ),
      false
    );
  }
);

test(
  "wrong-day deletion rejects squad-marker identity mismatch",
  () => {
    assert.equal(
      canRemoveEspnWrongDayCanonicalRow(
        {
          sourceId: "401886421",
          homeTeam: "Ajax",
          awayTeam: "PSV"
        },
        {
          providerMatchId: "401886421",
          homeTeam: "Ajax U21",
          awayTeam: "PSV U21"
        }
      ),
      false
    );
  }
);

test(
  "wrong-day evidence exposes the authoritative ordered team pair",
  () => {
    const result =
      resolveEspnExactEventOccurrence(
        espnSummary({
          id: "401886421",
          date:
            "2026-09-16T01:00Z",
          statusName:
            "STATUS_SCHEDULED",
          statusState: "pre",
          completed: false,
          homeName:
            "Dorados de Sinaloa",
          awayName:
            "Cancún FC"
        }),
        "mex.2",
        "2026-07-26",
        {
          canonicalSlug:
            "mex.2"
        }
      );

    assert.equal(
      result.kind,
      "other_day"
    );

    assert.equal(
      result.evidence.homeTeam,
      "Dorados de Sinaloa"
    );

    assert.equal(
      result.evidence.awayTeam,
      "Cancún FC"
    );
  }
);

test("live status CLI enables independent intraday truth options explicitly", () => {
  const parsed = parseLiveStatusRefreshCliArgs([
    "2026-08-07",
    "--append-new-fixtures",
    "--include-all-open-states"
  ]);

  assert.equal(parsed.dayKey, "2026-08-07");
  assert.deepEqual(parsed.options, {
    appendNewFixtures: true,
    includeAllOpenStates: true
  });
});

test("live status CLI keeps legacy status-refresh behavior by default", () => {
  const parsed = parseLiveStatusRefreshCliArgs(["2026-08-07"]);

  assert.equal(parsed.dayKey, "2026-08-07");
  assert.deepEqual(parsed.options, {
    appendNewFixtures: false,
    includeAllOpenStates: false
  });
});

test("delayed scoreboard finals require matching event, teams, day, league and scores", () => {
  const event = espnEvent();
  const occurrence = resolveEspnExactEventOccurrence({header: {
    id: event.id, competitions: event.competitions
  }}, "nor.1", "2026-07-23");
  const row = { ...occurrence.incoming, status: "LIVE", rawStatus: "STATUS_DELAYED" };
  row.statusType = null;
  const merged = mergeConfirmedDelayedFinal(row, occurrence);
  assert.equal(merged.status, "FT");
  assert.equal(merged.rawStatus, occurrence.incoming.rawStatus);
  assert.equal(merged.scoreHome, 4);
  const postponed = { ...row, status: "POSTPONED" };
  assert.deepEqual(mergeConfirmedDelayedFinal(postponed, occurrence), postponed);
  assert.equal(isConfirmedDelayedFinal(row, occurrence), true);
  for (const changes of [
    { sourceMatchId: "different" }, { homeTeam: row.awayTeam },
    { dayKey: "2026-07-24" }, { leagueSlug: "nor.2" }
  ]) assert.equal(isConfirmedDelayedFinal({ ...row, ...changes }, occurrence), false);
  for (const changes of [{ scoreHome: null }, { scoreAway: -1 }, { status: "LIVE", rawStatus: "STATUS_DELAYED", statusType: "STATUS_DELAYED" }]) {
    assert.equal(isConfirmedDelayedFinal(row, { ...occurrence, incoming: { ...occurrence.incoming, ...changes } }), false);
  }
});

function exactWrongDayMeta({ removed = 1, providerId = "401902006" } = {}) {
  return {
    acquisitionProvider: "espn_direct_league_status",
    requestedDayKey: "2026-11-28",
    requestedLeagueSlug: "rsa.1",
    providerFetchSlugs: ["rsa.1"],
    exactEventSummaryReconciliation: {
      candidates: removed,
      sameDayMatches: 0,
      wrongDayMatches: removed,
      wrongDayRemovedRows: removed,
      wrongDayIdentityRejectedRows: 0,
      fetches: removed ? [{
        providerSlug: "rsa.1",
        providerMatchId: providerId,
        ok: true,
        kind: "other_day",
        authoritativeDayKey: "2026-11-29",
        reason: null
      }] : [],
      policy: {
        exactProviderIdOnly: true,
        authoritativeEventDayOnly: true,
        teamIdentityRequired: true,
        homeAwayOrientationRequired: true,
        crossDayStatusPromotion: false,
        heuristicFinalPromotion: false
      }
    }
  };
}

function preserveWrongDay(previousSourceMeta, overrides = {}) {
  return preserveExactWrongDayReconciliation({
    dayKey: "2026-11-28",
    leagueSlug: "rsa.1",
    previousSourceMeta,
    nextSourceMeta: exactWrongDayMeta({ removed: 0 }),
    currentFixtures: [{ sourceId: "401902003" }],
    nextFixtures: [{ sourceId: "401902003" }],
    incomingProviderIds: [],
    ...overrides
  });
}

test("retains exact prior ESPN wrong-day proof on unrelated status refresh", () => {
  const result = preserveWrongDay(exactWrongDayMeta());
  const audit = result.exactEventSummaryReconciliation;
  assert.equal(audit.wrongDayMatches, 1);
  assert.equal(audit.wrongDayRemovedRows, 1);
  assert.equal(audit.retainedWrongDayEvidenceCount, 1);
  assert.equal(audit.currentRunWrongDayRemovedRows, 0);
  assert.equal(audit.fetches[0].providerMatchId, "401902006");
  assert.equal(audit.fetches[0].authoritativeDayKey, "2026-11-29");
});

test("revokes retained proof on canonical reappearance or fresh ESPN observation", () => {
  const previous = exactWrongDayMeta();
  const present = preserveWrongDay(previous, {
    nextFixtures: [{ sourceId: "401902006" }]
  });
  assert.equal(present.exactEventSummaryReconciliation.wrongDayRemovedRows, 0);
  const observed = preserveWrongDay(previous, {
    incomingProviderIds: ["401902006"]
  });
  assert.equal(observed.exactEventSummaryReconciliation.wrongDayRemovedRows, 0);
  const sameDay = preserveWrongDay(previous, {
    nextSourceMeta: {
      ...exactWrongDayMeta({ removed: 0 }),
      exactEventSummaryReconciliation: {
        ...exactWrongDayMeta({ removed: 0 }).exactEventSummaryReconciliation,
        fetches: [{
          ok: true,
          kind: "same_day",
          providerMatchId: "401902006"
        }]
      }
    }
  });
  assert.equal(sameDay.exactEventSummaryReconciliation.wrongDayRemovedRows, 0);
});

test("fails closed for malformed historical proof or fresh identity rejection", () => {
  const previous = exactWrongDayMeta();
  const corrupted = structuredClone(previous);
  corrupted.exactEventSummaryReconciliation.policy.teamIdentityRequired = false;
  assert.equal(preserveWrongDay(corrupted).exactEventSummaryReconciliation.wrongDayRemovedRows, 0);
  const rejected = preserveWrongDay(previous, {
    nextSourceMeta: {
      ...exactWrongDayMeta({ removed: 0 }),
      exactEventSummaryReconciliation: {
        ...exactWrongDayMeta({ removed: 0 }).exactEventSummaryReconciliation,
        wrongDayIdentityRejectedRows: 1
      }
    }
  });
  assert.equal(rejected.exactEventSummaryReconciliation.wrongDayRemovedRows, 0);
});

test("does not multiply evidence across repeat refreshes", () => {
  const first = preserveWrongDay(exactWrongDayMeta());
  const second = preserveWrongDay(first);
  assert.equal(second.exactEventSummaryReconciliation.wrongDayRemovedRows, 1);
  assert.equal(second.exactEventSummaryReconciliation.fetches.filter(x => x.kind === "other_day").length, 1);
});

import { selectWrongDayRemovalRecoveryRows } from "./run-live-status-refresh-day.js";
import { verifiedExactWrongDayFetches } from "../core/exact-wrongday-removal-evidence.js";
function markedMixedMeta() {
 const meta=exactWrongDayMeta(),r=meta.exactEventSummaryReconciliation;
 r.removalEvidenceSchema="ai-matchlab.exact-wrongday-removal.v2";
 r.candidates=2;r.wrongDayMatches=2;r.wrongDayIdentityRejectedRows=1;
 Object.assign(r.fetches[0],{canonicalRemovalVerified:true,teamIdentityVerified:true,homeAwayOrientationVerified:true,
  canonicalIdentityRejected:false,removedCanonicalFixtureIds:["removed"]});
 r.fetches.push({...r.fetches[0],providerMatchId:"401902099",canonicalRemovalVerified:false,
  canonicalIdentityRejected:true,removedCanonicalFixtureIds:[]});
 return meta;
}
test("mixed removal proof survives unrelated refresh without promoting its rejected event",()=>{
 const first=preserveWrongDay(markedMixedMeta());
 assert.equal(first.exactEventSummaryReconciliation.wrongDayRemovedRows,1);
 assert.equal(verifiedExactWrongDayFetches("2026-11-28","rsa.1",first)[0].providerMatchId,"401902006");
 const fresh=markedMixedMeta();
 fresh.exactEventSummaryReconciliation.fetches[0].providerMatchId="401902007";
 fresh.exactEventSummaryReconciliation.fetches[0].removedCanonicalFixtureIds=["new-removal"];
 const combined=preserveWrongDay(first,{nextSourceMeta:fresh});
 const r=combined.exactEventSummaryReconciliation;
 assert.equal(r.wrongDayRemovedRows,2);assert.equal(r.wrongDayIdentityRejectedRows,1);
 assert.equal(r.wrongDayMatches,3);
 assert.equal(verifiedExactWrongDayFetches("2026-11-28","rsa.1",combined).length,2);
});
test("removal evidence recovery selects only unique missing exact published lineage already recorded as other-day",()=>{
 const meta=markedMixedMeta(),row={canonicalId:"removed",matchId:"removed",source:"espn",
  dayKey:"2026-11-28",leagueSlug:"rsa.1",sourceId:"401902006",sourceMatchId:"401902006",providerIds:{espn:"401902006"}};
 const select=overrides=>selectWrongDayRemovalRecoveryRows({dayKey:"2026-11-28",leagueSlug:"rsa.1",
  currentFixtures:[],publishedFixtures:[row],sourceMeta:meta,...overrides});
 assert.equal(select({}).size,1);
 assert.equal(select({currentFixtures:[row]}).size,0);
 assert.equal(select({publishedFixtures:[row,row]}).size,0);
 assert.equal(select({publishedFixtures:[{...row,source:"flashscore"}]}).size,0);
 assert.equal(select({publishedFixtures:[{...row,providerIds:{espn:"999"}}]}).size,0);
 assert.equal(select({publishedFixtures:[{...row,dayKey:"2026-11-29"}]}).size,0);
});
