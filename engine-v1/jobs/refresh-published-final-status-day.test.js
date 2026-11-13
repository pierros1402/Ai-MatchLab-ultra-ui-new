import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planPublishedFinalRefresh, discoverMissingReschedules, assertPublishedFinalRefreshPublicationSafety } from "./refresh-published-final-status-day.js";
const day = "2026-10-30";
const pre = { canonicalId: "cid_one", homeTeam: "Home", awayTeam: "Away", status: "SECOND_HALF", scoreHome: 0, scoreAway: 0 };
const ft = { ...pre, status: "FT", scoreHome: 2, scoreAway: 1 };
const result = { ...ft, matchId: "cid_one", date: day, verifiedFinalTruth: true };
const plan = (overrides = {}) => planPublishedFinalRefresh({ day, published: [pre], canonical: [ft], results: new Map([["cid_one", result]]), ...overrides });
test("verified final closes a published live row without admitting late fixtures", () => {
  const p = plan({ canonical: [ft, { ...ft, canonicalId: "late" }] });
  assert.deepEqual(p.upgrades, ["cid_one"]);
  assert.deepEqual(p.fixtureIds, ["cid_one"]);
  assert.equal(pre.status, "SECOND_HALF");
});
test("existing final is immutable and an unchanged release is idempotent", () => {
  assert.deepEqual(plan({ published: [ft] }).upgrades, []);
  assert.throws(() => plan({ published: [ft], canonical: [{ ...ft, scoreAway: 2 }] }), /terminal_revision_forbidden/);
  assert.throws(() => plan({ published: [ft], canonical: [pre] }), /terminal_revision_forbidden/);
});
test("wrong-day, wrong-team, unverified and conflicting scores cannot publish FT", () => {
  for (const mutation of [{ date: "2026-10-31" }, { awayTeam: "Other" }, { matchId: "other" }, { verifiedFinalTruth: false }, { scoreHome: 9 }]) {
    assert.throws(() => plan({ results: new Map([["cid_one", { ...result, ...mutation }]]) }), /verified_binding_required/);
  }
  assert.throws(() => plan({ results: new Map() }), /verified_binding_required/);
});
test("missing and duplicate identities fail closed; time alone never makes a final", () => {
  assert.throws(() => plan({ canonical: [] }), /missing_canonical/);
  assert.throws(() => plan({ canonical: [ft, ft] }), /duplicate_identity/);
  assert.throws(() => plan({ published: [pre, pre] }), /duplicate_identity/);
  assert.deepEqual(plan({ canonical: [pre], results: new Map() }).upgrades, []);
});

test("pinned federation decision upgrades only the original published postponed fixture", () => {
  const canonicalId = "cid_syr1_foutoua_aljaish_20261030";
  const common = { canonicalId, sourceId: "KdKrgosB", leagueSlug: "syr.1", homeTeam: "Foutoua", awayTeam: "Al Jaish", kickoffUtc: "2026-10-30T12:00:00.000Z", scoreHome: null, scoreAway: null };
  const published = { ...common, status: "STATUS_SCHEDULED" };
  const canonical = { ...common, status: "STATUS_POSTPONED", rawStatus: "STATUS_POSTPONED", statusType: "STATUS_POSTPONED",
    statusCorrection: { decisionId: "foutoua-aljaish-federation-reschedule-20261029-v1", providerNativeStatusCodeVerified: false, policyVersion: "federation-nonplayed-exact-reviewed-v1", publicationAuthorized: true, rescheduledMatch: { providerMatchId: "KdKrgosB" } } };
  const rescheduled = { ...common, canonicalId: "cid_syr1_foutoua_aljaish_20261101", dayKey: "2026-11-01", kickoffUtc: "2026-11-01T12:00:00.000Z", status: "STATUS_SCHEDULED" };
  const base = { day, published: [published], canonical: [canonical], rescheduled: [rescheduled] };
  assert.deepEqual(planPublishedFinalRefresh(base).nonplayed, [canonicalId]);
  assert.deepEqual(planPublishedFinalRefresh(base).upgrades, [canonicalId]);
  assert.deepEqual(planPublishedFinalRefresh({ ...base, rescheduled: [] }).upgrades, []);
  assert.deepEqual(planPublishedFinalRefresh({ ...base, published: [{ ...published, sourceId: "wrong" }] }).upgrades, []);
  assert.deepEqual(planPublishedFinalRefresh({ ...base, canonical: [{ ...canonical, scoreHome: 0 }] }).upgrades, []);
});

test("generic reschedule discovery retains old membership without changing truth", () => {
  const oldDay = "2026-11-08";
  const previous = {
    canonicalId: "old-id",
    leagueSlug: "col.1",
    sourceId: "401877770",
    homeTeam: "Águilas Doradas",
    awayTeam: "Independiente Medellín",
    status: "PRE",
    scoreHome: 0,
    scoreAway: 0
  };
  const later = {
    ...previous,
    canonicalId: "new-id",
    dayKey: "2026-11-12",
    kickoffUtc: "2026-11-12T20:00:00Z",
    status: "SPECIAL",
    scoreHome: null,
    scoreAway: null
  };
  const discovery = discoverMissingReschedules({
    day: oldDay,
    published: [previous],
    canonical: [],
    windowDays: 7,
    lookupDay: day => day === "2026-11-12" ? [later] : []
  });
  assert.equal(discovery.length, 1);
  assert.equal(discovery[0].providerId, "401877770");
  assert.equal(discovery[0].candidateDay, "2026-11-12");

  const planned = planPublishedFinalRefresh({
    day: oldDay,
    published: [previous],
    canonical: [],
    missingReschedules: discovery
  });
  assert.deepEqual(planned.upgrades, []);
  assert.deepEqual(planned.fixtureIds, ["old-id"]);
  assert.deepEqual(planned.retainedReschedules, discovery);
  assert.equal(previous.status, "PRE");
  assert.equal(previous.scoreHome, 0);
});

test("reschedule discovery rejects weak identity and contradictory status", () => {
  const previous = {
    canonicalId: "old",
    sourceId: "401877770",
    leagueSlug: "col.1",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "PRE"
  };
  const base = {
    ...previous,
    canonicalId: "new",
    dayKey: "2026-11-12",
    kickoffUtc: "2026-11-12T20:00:00Z",
    status: "SPECIAL",
    scoreHome: null,
    scoreAway: null
  };
  for (const changes of [
    { sourceId: "other" },
    { homeTeam: "Different" },
    { awayTeam: "Different" },
    { leagueSlug: "other" },
    { status: "FT", scoreHome: 1, scoreAway: 0 },
    { kickoffUtc: "2026-11-13T20:00:00Z" }
  ]) {
    const found = discoverMissingReschedules({
      day: "2026-11-08",
      published: [previous],
      canonical: [],
      windowDays: 7,
      lookupDay: date => date === "2026-11-12" ? [{ ...base, ...changes }] : []
    });
    assert.deepEqual(found, []);
    assert.throws(() => planPublishedFinalRefresh({
      day: "2026-11-08",
      published: [previous],
      canonical: [],
      missingReschedules: found
    }), /missing_canonical/);
  }
});

test("multiple consistent reschedules remain observations, never final truth", () => {
  const previous = {
    canonicalId: "old", sourceId: "123",
    leagueSlug: "col.1", homeTeam: "Home", awayTeam: "Away",
    status: "PRE"
  };
  const candidate = day => ({
    ...previous, canonicalId: "new-" + day,
    dayKey: day, kickoffUtc: day + "T20:00:00Z",
    status: "SPECIAL", scoreHome: null, scoreAway: null
  });
  const found = discoverMissingReschedules({
    day: "2026-11-08", published: [previous], canonical: [],
    windowDays: 7,
    lookupDay: day => ["2026-11-12", "2026-11-14"].includes(day) ? [candidate(day)] : []
  });
  assert.equal(found.length, 2);
  assert.deepEqual(found.map(x => x.candidateDay), ["2026-11-12", "2026-11-14"]);
  const p = planPublishedFinalRefresh({
    day: "2026-11-08", published: [previous],
    canonical: [], missingReschedules: found
  });
  assert.deepEqual(p.upgrades, []);
  assert.equal(p.retainedReschedules.length, 2);
});

test("terminal missing canonical remains forbidden even with reschedule evidence", () => {
  assert.throws(() => planPublishedFinalRefresh({
    day: "2026-11-08",
    published: [{ canonicalId: "old", status: "FT", scoreHome: 1, scoreAway: 0 }],
    canonical: [],
    missingReschedules: [{
      originalId: "old", candidateId: "new", providerId: "123",
      originalDay: "2026-11-08", candidateDay: "2026-11-12"
    }]
  }), /missing_canonical/);
});

test("mixed reschedule and verified final blocks apply before export", () => {
  const published = [
    {
      canonicalId: "moved", sourceId: "provider-1",
      leagueSlug: "test.1", homeTeam: "A", awayTeam: "B",
      status: "PRE", scoreHome: 0, scoreAway: 0
    },
    {
      canonicalId: "played", homeTeam: "C", awayTeam: "D",
      status: "SECOND_HALF", scoreHome: 1, scoreAway: 0
    }
  ];

  const finalRow = {
    ...published[1], status: "FT", scoreHome: 2, scoreAway: 1
  };

  const results = new Map([["played", {
    ...finalRow,
    matchId: "played",
    date: "2026-11-08",
    verifiedFinalTruth: true
  }]]);

  const moved = {
    originalId: "moved",
    candidateId: "moved-later",
    providerId: "provider-1",
    originalDay: "2026-11-08",
    candidateDay: "2026-11-14",
    candidateStatus: "PRE"
  };

  const plan = planPublishedFinalRefresh({
    day: "2026-11-08",
    published,
    canonical: [finalRow],
    results,
    missingReschedules: [moved]
  });

  assert.deepEqual(plan.upgrades, ["played"]);
  assert.deepEqual(plan.retainedReschedules, [moved]);
  assert.deepEqual(plan.fixtureIds, ["moved", "played"]);

  assert.equal(
    assertPublishedFinalRefreshPublicationSafety(plan, { apply: false }),
    true
  );

  assert.throws(
    () => assertPublishedFinalRefreshPublicationSafety(plan, { apply: true }),
    /final_refresh_mixed_reschedule_publication_blocked/
  );
});

test("publication guard permits ordinary finals and unchanged reschedules", () => {
  for (const plan of [
    { upgrades: ["played"], retainedReschedules: [] },
    { upgrades: [], retainedReschedules: [{ originalId: "moved" }] },
    { upgrades: [], retainedReschedules: [] }
  ]) {
    assert.equal(
      assertPublishedFinalRefreshPublicationSafety(plan, { apply: true }),
      true
    );
  }

  assert.throws(
    () => assertPublishedFinalRefreshPublicationSafety({}, { apply: true }),
    /final_refresh_publication_plan_invalid/
  );
});

test("mixed publication guard runs before the exporter", () => {
  const source = fs.readFileSync(
    new URL("./refresh-published-final-status-day.js", import.meta.url),
    "utf8"
  );

  const call = source.indexOf(
    "  assertPublishedFinalRefreshPublicationSafety(plan, { apply });"
  );

  const exportCall = source.indexOf(
    "  await exportDeploySnapshotDay(day, {"
  );

  assert.ok(call >= 0);
  assert.ok(exportCall > call);
});
