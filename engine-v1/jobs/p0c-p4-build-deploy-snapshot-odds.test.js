import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import {
  P0C_P4_DEPLOY_SNAPSHOT_ODDS_SCHEMA,
  P0C_P4_DEPLOY_SNAPSHOT_ODDS_SOURCE,
  buildP0CP4DeploySnapshotOdds,
  buildP0CP4DeploySnapshotOddsFromMatches,
  computeP0CP4DeploySnapshotOddsContentHash,
} from "./p0c-p4-build-deploy-snapshot-odds.js";

const DAY =
  "2026-08-03";

const GENERATED_AT =
  "2026-08-03T19:30:00.000Z";

function sourceMatches() {
  return [
    {
      matchId:
        "cid_alpha_beta_20260803",
      leagueSlug:
        "grc.1",
      competition:
        "Super League",
      home:
        "Alpha",
      away:
        "Beta",
      dayKey:
        DAY,
      kickoffUtc:
        "2026-08-03T18:00:00.000Z",
      market: {
        home:
          2.1,
        draw:
          3.2,
        away:
          3.4,
      },
      aiAssessment: {
        odds: {
          home:
            1.95,
          draw:
            3.4,
          away:
            3.7,
        },
      },
      ignoredField:
        "not-hashed",
    },
    {
      matchId:
        "cid_gamma_delta_20260803",
      leagueSlug:
        "eng.1",
      competition:
        "Premier League",
      home:
        "Gamma",
      away:
        "Delta",
      dayKey:
        DAY,
      kickoffLocal:
        "2026-08-03T22:00:00+03:00",
      market: {
        home:
          1.7,
        draw:
          3.8,
        away:
          4.9,
      },
    },
  ];
}

function exporterHash(matches) {
  const stable =
    matches.map(match => ({
      matchId:
        match.matchId,
      leagueSlug:
        match.leagueSlug,
      competition:
        match.competition,
      home:
        match.home,
      away:
        match.away,
      dayKey:
        match.dayKey,
      kickoffUtc:
        match.kickoffUtc ||
        match.kickoffLocal,
      market:
        match.market,
      ai:
        match.aiAssessment?.odds ||
        null,
    }));

  return crypto
    .createHash("sha1")
    .update(
      JSON.stringify(stable),
    )
    .digest("hex");
}

test("publishes the source-bound odds builder contract", () => {
  assert.equal(
    P0C_P4_DEPLOY_SNAPSHOT_ODDS_SCHEMA,
    "ai-matchlab.p0c-p4-deploy-snapshot-odds.v1",
  );

  assert.equal(
    P0C_P4_DEPLOY_SNAPSHOT_ODDS_SOURCE,
    "autonomous-odds-capture",
  );
});

test("builds the exact odds.json wrapper with injected timestamp", () => {
  const matches =
    sourceMatches();

  const result =
    buildP0CP4DeploySnapshotOdds({
      dayKey:
        DAY,
      generatedAt:
        GENERATED_AT,
      oddsDay: {
        count:
          matches.length,
        matches,
      },
    });

  assert.equal(result.ok, true);
  assert.equal(result.date, DAY);
  assert.equal(
    result.generatedAt,
    GENERATED_AT,
  );
  assert.equal(
    result.source,
    "autonomous-odds-capture",
  );
  assert.equal(result.count, 2);
  assert.deepEqual(
    result.matches,
    matches,
  );
});

test("matches the current exporter content-hash projection exactly", () => {
  const matches =
    sourceMatches();

  assert.equal(
    computeP0CP4DeploySnapshotOddsContentHash(
      matches,
    ),
    exporterHash(matches),
  );
});

test("excludes non-material fields from the content hash", () => {
  const first =
    sourceMatches();

  const second =
    sourceMatches();

  second[0].ignoredField =
    "changed";

  second[1].providerMetadata = {
    receivedAt:
      "later",
  };

  assert.equal(
    computeP0CP4DeploySnapshotOddsContentHash(
      first,
    ),
    computeP0CP4DeploySnapshotOddsContentHash(
      second,
    ),
  );
});

test("changes the hash when material market evidence changes", () => {
  const first =
    sourceMatches();

  const second =
    sourceMatches();

  second[0].market.home =
    2.2;

  assert.notEqual(
    computeP0CP4DeploySnapshotOddsContentHash(
      first,
    ),
    computeP0CP4DeploySnapshotOddsContentHash(
      second,
    ),
  );
});

test("uses kickoffLocal only when kickoffUtc is absent", () => {
  const matches =
    sourceMatches();

  const expected =
    exporterHash(matches);

  assert.equal(
    computeP0CP4DeploySnapshotOddsContentHash(
      matches,
    ),
    expected,
  );

  matches[1].kickoffUtc =
    "2026-08-03T19:00:00.000Z";

  assert.notEqual(
    computeP0CP4DeploySnapshotOddsContentHash(
      matches,
    ),
    expected,
  );
});

test("normalizes missing AI odds to null in the hash projection", () => {
  const matches =
    sourceMatches();

  const withoutAssessment =
    computeP0CP4DeploySnapshotOddsContentHash(
      matches,
    );

  matches[1].aiAssessment = {
    unrelated:
      true,
  };

  assert.equal(
    computeP0CP4DeploySnapshotOddsContentHash(
      matches,
    ),
    withoutAssessment,
  );
});

test("is deterministic and does not mutate the source day", () => {
  const matches =
    sourceMatches();

  const oddsDay = {
    count:
      matches.length,
    matches,
  };

  const before =
    JSON.stringify(oddsDay);

  const first =
    buildP0CP4DeploySnapshotOdds({
      dayKey:
        DAY,
      generatedAt:
        GENERATED_AT,
      oddsDay,
    });

  const second =
    buildP0CP4DeploySnapshotOdds({
      dayKey:
        DAY,
      generatedAt:
        GENERATED_AT,
      oddsDay,
    });

  assert.deepEqual(first, second);
  assert.equal(
    JSON.stringify(oddsDay),
    before,
  );
  assert.notEqual(
    first.matches,
    oddsDay.matches,
  );
});

test("builds from a raw matches array with an exact derived count", () => {
  const matches =
    sourceMatches();

  const result =
    buildP0CP4DeploySnapshotOddsFromMatches({
      dayKey:
        DAY,
      generatedAt:
        GENERATED_AT,
      matches,
    });

  assert.equal(
    result.count,
    matches.length,
  );

  assert.equal(
    result.hash,
    exporterHash(matches),
  );
});

test("preserves the source count contract independently of array length", () => {
  const result =
    buildP0CP4DeploySnapshotOdds({
      dayKey:
        DAY,
      generatedAt:
        GENERATED_AT,
      oddsDay: {
        count:
          9,
        matches:
          sourceMatches(),
      },
    });

  assert.equal(
    result.count,
    9,
  );

  assert.equal(
    result.matches.length,
    2,
  );
});

test("rejects invalid day, timestamp, day object, count, matches and rows", () => {
  assert.throws(
    () => buildP0CP4DeploySnapshotOdds({
      dayKey:
        "2026-8-3",
      generatedAt:
        GENERATED_AT,
      oddsDay: {
        count:
          0,
        matches:
          [],
      },
    }),
    /day_key_invalid/,
  );

  assert.throws(
    () => buildP0CP4DeploySnapshotOdds({
      dayKey:
        DAY,
      generatedAt:
        "not-a-date",
      oddsDay: {
        count:
          0,
        matches:
          [],
      },
    }),
    /generated_at_invalid/,
  );

  assert.throws(
    () => buildP0CP4DeploySnapshotOdds({
      dayKey:
        DAY,
      generatedAt:
        GENERATED_AT,
      oddsDay:
        null,
    }),
    /day_invalid/,
  );

  assert.throws(
    () => buildP0CP4DeploySnapshotOdds({
      dayKey:
        DAY,
      generatedAt:
        GENERATED_AT,
      oddsDay: {
        count:
          -1,
        matches:
          [],
      },
    }),
    /count_invalid/,
  );

  assert.throws(
    () => buildP0CP4DeploySnapshotOdds({
      dayKey:
        DAY,
      generatedAt:
        GENERATED_AT,
      oddsDay: {
        count:
          0,
        matches:
          {},
      },
    }),
    /matches_invalid/,
  );

  assert.throws(
    () => buildP0CP4DeploySnapshotOdds({
      dayKey:
        DAY,
      generatedAt:
        GENERATED_AT,
      oddsDay: {
        count:
          1,
        matches: [
          null,
        ],
      },
    }),
    /match_invalid:0/,
  );
});
