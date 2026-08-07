import test from "node:test";
import assert from "node:assert/strict";

import {
  canRemoveEspnWrongDayCanonicalRow,
  normalizeSourceRows,
  parseLiveStatusRefreshCliArgs,
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
