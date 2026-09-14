import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyCrossDayProviderRescheduleGroup
} from "../core/cross-day-provider-reschedule.js";

const AS_OF = Date.parse("2026-09-14T12:00:00.000Z");

function row({
  canonicalId,
  dayKey,
  sourceMatchId,
  leagueSlug = "test.1",
  homeTeam = "Alpha",
  awayTeam = "Beta",
  kickoffUtc,
  firstSeenAt,
  lastSeenAt,
  status = "STATUS_SCHEDULED",
  rawStatus = status,
  scoreHome = null,
  scoreAway = null,
  source = "flashscore"
}) {
  return {
    canonicalId,
    matchId: canonicalId,
    dayKey,
    source,
    sourceId: sourceMatchId,
    sourceMatchId,
    leagueSlug,
    homeTeam,
    awayTeam,
    kickoffUtc,
    firstSeenAt,
    lastSeenAt,
    status,
    rawStatus,
    statusType: rawStatus,
    scoreHome,
    scoreAway
  };
}

function abRows() {
  return [
    row({
      canonicalId: "cid_fro1_abargir_toftir_20260911",
      dayKey: "2026-09-11",
      sourceMatchId: "bR8MdXt2",
      leagueSlug: "fro.1",
      homeTeam: "AB Argir",
      awayTeam: "Toftir",
      kickoffUtc: "2026-09-11T17:30:00.000Z",
      firstSeenAt: "2026-09-09T17:54:31.226Z",
      lastSeenAt: "2026-09-11T17:49:20.948Z"
    }),
    row({
      canonicalId: "cid_fro1_abargir_toftir_20260913",
      dayKey: "2026-09-13",
      sourceMatchId: "bR8MdXt2",
      leagueSlug: "fro.1",
      homeTeam: "AB Argir",
      awayTeam: "Toftir",
      kickoffUtc: "2026-09-13T17:30:00.000Z",
      firstSeenAt: "2026-09-11T22:00:33.688Z",
      lastSeenAt: "2026-09-13T20:56:45.721Z",
      status: "FT",
      rawStatus: "STATUS_FINAL",
      scoreHome: 1,
      scoreAway: 1
    })
  ];
}

function ferizajRows() {
  return [
    row({
      canonicalId: "cid_kos2_ferizaj_istogu_20260911",
      dayKey: "2026-09-11",
      sourceMatchId: "OtToQ8QO",
      leagueSlug: "kos.2",
      homeTeam: "Ferizaj",
      awayTeam: "Istogu",
      kickoffUtc: "2026-09-11T14:00:00.000Z",
      firstSeenAt: "2026-09-10T11:53:03.845Z",
      lastSeenAt: "2026-09-11T17:49:24.004Z"
    }),
    row({
      canonicalId: "cid_kos2_ferizaj_istogu_20260912",
      dayKey: "2026-09-12",
      sourceMatchId: "OtToQ8QO",
      leagueSlug: "kos.2",
      homeTeam: "Ferizaj",
      awayTeam: "Istogu",
      kickoffUtc: "2026-09-12T14:30:00.000Z",
      firstSeenAt: "2026-09-09T21:48:31.125Z",
      lastSeenAt: "2026-09-10T06:44:50.690Z"
    }),
    row({
      canonicalId: "cid_kos2_ferizaj_istogu_20260913",
      dayKey: "2026-09-13",
      sourceMatchId: "OtToQ8QO",
      leagueSlug: "kos.2",
      homeTeam: "Ferizaj",
      awayTeam: "Istogu",
      kickoffUtc: "2026-09-13T14:00:00.000Z",
      firstSeenAt: "2026-09-11T22:00:38.584Z",
      lastSeenAt: "2026-09-13T20:06:06.812Z",
      status: "FT",
      rawStatus: "STATUS_FINAL",
      scoreHome: 2,
      scoreAway: 0
    })
  ];
}

test("AB Argir old occurrence is safely superseded by later exact-provider occurrence", () => {
  const result = classifyCrossDayProviderRescheduleGroup(abRows(), { asOfMs: AS_OF });
  assert.equal(result.ok, true);
  assert.equal(result.providerIdentity, "flashscore:bR8MdXt2");
  assert.equal(result.evidence.canonicalId, "cid_fro1_abargir_toftir_20260913");
  assert.deepEqual(result.superseded.map(x => x.canonicalId), [
    "cid_fro1_abargir_toftir_20260911"
  ]);
  assert.equal(result.guarantees.oldOccurrenceScorelessScheduledOnly, true);
  assert.equal(result.guarantees.playedFinalNeverSuperseded, true);
});

test("Ferizaj two old occurrences are both superseded by later exact-provider occurrence", () => {
  const result = classifyCrossDayProviderRescheduleGroup(ferizajRows(), { asOfMs: AS_OF });
  assert.equal(result.ok, true);
  assert.equal(result.evidence.canonicalId, "cid_kos2_ferizaj_istogu_20260913");
  assert.deepEqual(result.superseded.map(x => x.canonicalId).sort(), [
    "cid_kos2_ferizaj_istogu_20260911",
    "cid_kos2_ferizaj_istogu_20260912"
  ]);
});

test("single occurrence remains unclassified", () => {
  const result = classifyCrossDayProviderRescheduleGroup([abRows()[0]], { asOfMs: AS_OF });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_group_requires_multiple_rows");
});

test("different provider ids fail closed", () => {
  const rows = abRows();
  rows[1].sourceId = "different";
  rows[1].sourceMatchId = "different";
  const result = classifyCrossDayProviderRescheduleGroup(rows, { asOfMs: AS_OF });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_provider_identity_mismatch");
});

test("different leagues fail closed", () => {
  const rows = abRows();
  rows[1].leagueSlug = "fro.2";
  const result = classifyCrossDayProviderRescheduleGroup(rows, { asOfMs: AS_OF });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_league_mismatch");
});

test("different or reversed ordered team pair fails closed", () => {
  const rows = abRows();
  [rows[1].homeTeam, rows[1].awayTeam] = [rows[1].awayTeam, rows[1].homeTeam];
  const result = classifyCrossDayProviderRescheduleGroup(rows, { asOfMs: AS_OF });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_ordered_team_pair_mismatch");
});

test("ambiguous latest observation fails closed", () => {
  const rows = abRows();
  rows[0].lastSeenAt = rows[1].lastSeenAt;
  const result = classifyCrossDayProviderRescheduleGroup(rows, { asOfMs: AS_OF });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_latest_observation_ambiguous");
});

test("old played-final occurrence is never superseded", () => {
  const rows = abRows();
  rows[0].status = "FT";
  rows[0].rawStatus = "STATUS_FINAL";
  rows[0].statusType = "STATUS_FINAL";
  rows[0].scoreHome = 0;
  rows[0].scoreAway = 0;
  const result = classifyCrossDayProviderRescheduleGroup(rows, { asOfMs: AS_OF });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_no_safe_historical_supersession");
});

test("old explicit non-played occurrence is never superseded", () => {
  const rows = abRows();
  rows[0].status = "STATUS_POSTPONED";
  rows[0].rawStatus = "STATUS_POSTPONED";
  rows[0].statusType = "STATUS_POSTPONED";
  const result = classifyCrossDayProviderRescheduleGroup(rows, { asOfMs: AS_OF });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_no_safe_historical_supersession");
});

test("kickoff shift below minimum fails closed", () => {
  const rows = abRows();
  rows[1].kickoffUtc = "2026-09-11T20:30:00.000Z";
  rows[1].dayKey = "2026-09-12";
  const result = classifyCrossDayProviderRescheduleGroup(rows, { asOfMs: AS_OF });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cross_day_no_safe_historical_supersession");
});
