import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyCrossDayProviderRescheduleGroup
} from "../core/cross-day-provider-reschedule.js";

const AS_OF = Date.parse("2026-09-13T18:30:00.000Z");
const HOUR = 60 * 60 * 1000;

function row({
  canonicalId,
  dayKey,
  providerId,
  leagueSlug = "kos.2",
  homeTeam = "Ferizaj",
  awayTeam = "Istogu",
  kickoffUtc,
  firstSeenAt,
  lastSeenAt,
  status = "STATUS_SCHEDULED",
  rawStatus = "STATUS_SCHEDULED",
  scoreHome = null,
  scoreAway = null,
  source = "flashscore"
}) {
  return {
    canonicalId,
    matchId: canonicalId,
    source,
    sourceId: providerId,
    sourceMatchId: providerId,
    providerIds: { [source]: providerId },
    leagueSlug,
    dayKey,
    kickoffUtc,
    homeTeam,
    awayTeam,
    status,
    rawStatus,
    scoreHome,
    scoreAway,
    firstSeenAt,
    lastSeenAt
  };
}

test("classifies Ferizaj 11/12 as superseded by exact provider occurrence on 13/09", () => {
  const result = classifyCrossDayProviderRescheduleGroup([
    row({
      canonicalId: "cid_kos2_ferizaj_istogu_20260911",
      dayKey: "2026-09-11",
      providerId: "OtToQ8QO",
      kickoffUtc: "2026-09-11T14:00:00.000Z",
      firstSeenAt: "2026-09-10T12:00:00.000Z",
      lastSeenAt: "2026-09-11T16:00:00.000Z"
    }),
    row({
      canonicalId: "cid_kos2_ferizaj_istogu_20260912",
      dayKey: "2026-09-12",
      providerId: "OtToQ8QO",
      kickoffUtc: "2026-09-12T14:30:00.000Z",
      firstSeenAt: "2026-09-11T20:00:00.000Z",
      lastSeenAt: "2026-09-12T17:00:00.000Z"
    }),
    row({
      canonicalId: "cid_kos2_ferizaj_istogu_20260913",
      dayKey: "2026-09-13",
      providerId: "OtToQ8QO",
      kickoffUtc: "2026-09-13T14:00:00.000Z",
      firstSeenAt: "2026-09-12T18:00:00.000Z",
      lastSeenAt: "2026-09-13T14:38:11.625Z"
    })
  ], { asOfMs: AS_OF, pastGraceMs: 2 * HOUR });

  assert.equal(result.ok, true);
  assert.equal(result.providerIdentity, "flashscore:OtToQ8QO");
  assert.equal(result.evidence.canonicalId, "cid_kos2_ferizaj_istogu_20260913");
  assert.deepEqual(
    result.superseded.map(x => x.canonicalId).sort(),
    [
      "cid_kos2_ferizaj_istogu_20260911",
      "cid_kos2_ferizaj_istogu_20260912"
    ]
  );
});

test("classifies AB Argir 11/09 as superseded by exact provider occurrence on 13/09", () => {
  const result = classifyCrossDayProviderRescheduleGroup([
    row({
      canonicalId: "cid_fro1_abargir_toftir_20260911",
      dayKey: "2026-09-11",
      providerId: "bR8MdXt2",
      leagueSlug: "fro.1",
      homeTeam: "AB Argir",
      awayTeam: "Toftir",
      kickoffUtc: "2026-09-11T17:30:00.000Z",
      firstSeenAt: "2026-09-10T12:00:00.000Z",
      lastSeenAt: "2026-09-11T19:00:00.000Z"
    }),
    row({
      canonicalId: "cid_fro1_abargir_toftir_20260913",
      dayKey: "2026-09-13",
      providerId: "bR8MdXt2",
      leagueSlug: "fro.1",
      homeTeam: "AB Argir",
      awayTeam: "Toftir",
      kickoffUtc: "2026-09-13T17:30:00.000Z",
      firstSeenAt: "2026-09-11T22:00:00.000Z",
      lastSeenAt: "2026-09-13T14:38:08.184Z"
    })
  ], { asOfMs: AS_OF, pastGraceMs: 2 * HOUR });

  assert.equal(result.ok, true);
  assert.equal(result.evidence.canonicalId, "cid_fro1_abargir_toftir_20260913");
  assert.deepEqual(
    result.superseded.map(x => x.canonicalId),
    ["cid_fro1_abargir_toftir_20260911"]
  );
});

test("fails closed while the earlier occurrence has not passed the grace window", () => {
  const result = classifyCrossDayProviderRescheduleGroup([
    row({
      canonicalId: "old",
      dayKey: "2026-09-13",
      providerId: "future-1",
      kickoffUtc: "2026-09-13T18:00:00.000Z",
      firstSeenAt: "2026-09-12T10:00:00.000Z",
      lastSeenAt: "2026-09-13T12:00:00.000Z"
    }),
    row({
      canonicalId: "new",
      dayKey: "2026-09-14",
      providerId: "future-1",
      kickoffUtc: "2026-09-14T18:00:00.000Z",
      firstSeenAt: "2026-09-13T13:00:00.000Z",
      lastSeenAt: "2026-09-13T14:00:00.000Z"
    })
  ], { asOfMs: AS_OF, pastGraceMs: 6 * HOUR });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_no_safe_historical_supersession");
});

test("fails closed when latest observation is ambiguous", () => {
  const result = classifyCrossDayProviderRescheduleGroup([
    row({
      canonicalId: "old",
      dayKey: "2026-09-10",
      providerId: "ambiguous-1",
      kickoffUtc: "2026-09-10T12:00:00.000Z",
      firstSeenAt: "2026-09-09T10:00:00.000Z",
      lastSeenAt: "2026-09-13T10:00:00.000Z"
    }),
    row({
      canonicalId: "new",
      dayKey: "2026-09-11",
      providerId: "ambiguous-1",
      kickoffUtc: "2026-09-11T12:00:00.000Z",
      firstSeenAt: "2026-09-10T10:00:00.000Z",
      lastSeenAt: "2026-09-13T10:00:00.000Z"
    })
  ], { asOfMs: AS_OF });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_latest_observation_ambiguous");
});

test("fails closed for provider identity, league, or ordered team mismatch", () => {
  const base = [
    row({
      canonicalId: "old",
      dayKey: "2026-09-10",
      providerId: "same-1",
      kickoffUtc: "2026-09-10T12:00:00.000Z",
      firstSeenAt: "2026-09-09T10:00:00.000Z",
      lastSeenAt: "2026-09-10T13:00:00.000Z"
    }),
    row({
      canonicalId: "new",
      dayKey: "2026-09-12",
      providerId: "same-1",
      kickoffUtc: "2026-09-12T12:00:00.000Z",
      firstSeenAt: "2026-09-10T14:00:00.000Z",
      lastSeenAt: "2026-09-12T13:00:00.000Z"
    })
  ];

  assert.equal(
    classifyCrossDayProviderRescheduleGroup([
      base[0],
      { ...base[1], sourceId: "different", sourceMatchId: "different" }
    ], { asOfMs: AS_OF }).reason,
    "cross_day_provider_identity_mismatch"
  );

  assert.equal(
    classifyCrossDayProviderRescheduleGroup([
      base[0],
      { ...base[1], leagueSlug: "different.1" }
    ], { asOfMs: AS_OF }).reason,
    "cross_day_league_mismatch"
  );

  assert.equal(
    classifyCrossDayProviderRescheduleGroup([
      base[0],
      { ...base[1], awayTeam: "Different" }
    ], { asOfMs: AS_OF }).reason,
    "cross_day_ordered_team_pair_mismatch"
  );
});

test("fails closed for non-Flashscore provider identity", () => {
  const result = classifyCrossDayProviderRescheduleGroup([
    row({
      canonicalId: "old",
      dayKey: "2026-09-10",
      providerId: "401000001",
      source: "espn",
      kickoffUtc: "2026-09-10T12:00:00.000Z",
      firstSeenAt: "2026-09-09T10:00:00.000Z",
      lastSeenAt: "2026-09-10T13:00:00.000Z"
    }),
    row({
      canonicalId: "new",
      dayKey: "2026-09-12",
      providerId: "401000001",
      source: "espn",
      kickoffUtc: "2026-09-12T12:00:00.000Z",
      firstSeenAt: "2026-09-10T14:00:00.000Z",
      lastSeenAt: "2026-09-12T13:00:00.000Z"
    })
  ], { asOfMs: AS_OF });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_provider_not_flashscore");
});

test("fails closed when old and new observation windows overlap", () => {
  const result = classifyCrossDayProviderRescheduleGroup([
    row({
      canonicalId: "old",
      dayKey: "2026-09-10",
      providerId: "overlap-1",
      kickoffUtc: "2026-09-10T12:00:00.000Z",
      firstSeenAt: "2026-09-09T10:00:00.000Z",
      lastSeenAt: "2026-09-10T15:00:00.000Z"
    }),
    row({
      canonicalId: "new",
      dayKey: "2026-09-12",
      providerId: "overlap-1",
      kickoffUtc: "2026-09-12T12:00:00.000Z",
      firstSeenAt: "2026-09-10T14:00:00.000Z",
      lastSeenAt: "2026-09-12T13:00:00.000Z"
    })
  ], { asOfMs: AS_OF });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_no_safe_historical_supersession");
});

test("fails closed when kickoff moved by less than the minimum shift", () => {
  const result = classifyCrossDayProviderRescheduleGroup([
    row({
      canonicalId: "old",
      dayKey: "2026-09-10",
      providerId: "small-shift-1",
      kickoffUtc: "2026-09-10T22:00:00.000Z",
      firstSeenAt: "2026-09-09T10:00:00.000Z",
      lastSeenAt: "2026-09-10T20:00:00.000Z"
    }),
    row({
      canonicalId: "new",
      dayKey: "2026-09-11",
      providerId: "small-shift-1",
      kickoffUtc: "2026-09-11T02:00:00.000Z",
      firstSeenAt: "2026-09-10T21:00:00.000Z",
      lastSeenAt: "2026-09-11T03:00:00.000Z"
    })
  ], { asOfMs: AS_OF });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_no_safe_historical_supersession");
});

test("never supersedes an already non-played or played-final old occurrence", () => {
  const evidence = row({
    canonicalId: "new",
    dayKey: "2026-09-12",
    providerId: "same-2",
    kickoffUtc: "2026-09-12T12:00:00.000Z",
    firstSeenAt: "2026-09-10T14:00:00.000Z",
    lastSeenAt: "2026-09-12T13:00:00.000Z"
  });

  for (const old of [
    row({
      canonicalId: "old-postponed",
      dayKey: "2026-09-10",
      providerId: "same-2",
      kickoffUtc: "2026-09-10T12:00:00.000Z",
      firstSeenAt: "2026-09-09T10:00:00.000Z",
      lastSeenAt: "2026-09-10T13:00:00.000Z",
      status: "STATUS_POSTPONED",
      rawStatus: "STATUS_POSTPONED"
    }),
    row({
      canonicalId: "old-final",
      dayKey: "2026-09-10",
      providerId: "same-2",
      kickoffUtc: "2026-09-10T12:00:00.000Z",
      firstSeenAt: "2026-09-09T10:00:00.000Z",
      lastSeenAt: "2026-09-10T13:00:00.000Z",
      status: "FT",
      rawStatus: "STATUS_FINAL",
      scoreHome: 1,
      scoreAway: 0
    })
  ]) {
    const result = classifyCrossDayProviderRescheduleGroup(
      [old, evidence],
      { asOfMs: AS_OF }
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "cross_day_no_safe_historical_supersession");
  }
});

test("normalizes harmless accents/punctuation but preserves ordered teams", () => {
  const result = classifyCrossDayProviderRescheduleGroup([
    row({
      canonicalId: "old",
      dayKey: "2026-09-10",
      providerId: "norm-1",
      homeTeam: "América FC",
      awayTeam: "São João",
      kickoffUtc: "2026-09-10T12:00:00.000Z",
      firstSeenAt: "2026-09-09T10:00:00.000Z",
      lastSeenAt: "2026-09-10T13:00:00.000Z"
    }),
    row({
      canonicalId: "new",
      dayKey: "2026-09-12",
      providerId: "norm-1",
      homeTeam: "America-FC",
      awayTeam: "Sao Joao",
      kickoffUtc: "2026-09-12T12:00:00.000Z",
      firstSeenAt: "2026-09-10T14:00:00.000Z",
      lastSeenAt: "2026-09-12T13:00:00.000Z"
    })
  ], { asOfMs: AS_OF });

  assert.equal(result.ok, true);
  assert.equal(result.superseded.length, 1);
});
