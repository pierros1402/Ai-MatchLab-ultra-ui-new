import test from "node:test";
import assert from "node:assert/strict";
import { updateValueDataAlarm, dueValueDataResearch, recordValueDataResearch } from "./value-data-alarm.js";
const now = Date.parse("2026-10-01T08:00Z");
const fixture = { canonicalId: "cid_alarm_a_20261001", leagueSlug: "test.1", kickoffUtc: "2026-10-01T10:00Z", homeTeam: "A", awayTeam: "B" };
function update(q, fixtures = [fixture], joinedIds = [], nowMs = now, dayKey = "2026-10-01") {
  return updateValueDataAlarm(q, { dayKey, fixtures, joinedIds, nowMs });
}
test("data alarm survives day rollover and source success; only verified assessment consumption closes it", () => {
  let q = update(null);
  const task = dueValueDataResearch(q, now)[0];
  recordValueDataResearch(q, task, { status: "accepted", rows: 16 }, now);
  assert.equal(q.incidents[fixture.canonicalId].status, "PREMATCH_PREPARATION_OVERDUE");
  assert.equal(dueValueDataResearch(q, now + 60000).length, 0);
  q = update(q, [], [], now + 86400000, "2026-10-02");
  assert.ok(q.incidents[fixture.canonicalId]);
  assert.equal(dueValueDataResearch(q, now + 86400000).length, 1);
  q = update(q, [fixture], [], now + 86400000);
  assert.equal(q.incidents[fixture.canonicalId].status, "HISTORICAL_GAP_OPEN");
  q = update(q, [fixture], [fixture.canonicalId], now + 86400000);
  assert.equal(q.incidents[fixture.canonicalId].status, "RESOLVED");
  assert.equal(dueValueDataResearch(q, now + 86400000).length, 0);
  q = update(q); // A regression reopens the same incident, retaining its history.
  assert.equal(q.incidents[fixture.canonicalId].status, "PREMATCH_PREPARATION_OVERDUE");
  assert.equal(q.incidents[fixture.canonicalId].firstSeenAt, new Date(now).toISOString());
});
test("research is bounded, prioritizes upcoming deadlines, and escalates without dropping historical gaps", () => {
  let q = update(null, [{ ...fixture, canonicalId: "cid_alarm_old_20260930", leagueSlug: "old.1", kickoffUtc: "2026-09-30T10:00Z" }, fixture]);
  assert.equal(dueValueDataResearch(q, now, 1)[0].incidents[0].canonicalId, fixture.canonicalId);
  const task = dueValueDataResearch(q, now, 1)[0];
  for (let i = 0; i < 3; i++) recordValueDataResearch(q, task, { status: "failed" }, now + i * 86400000);
  assert.equal(q.research[task.key].status, "ESCALATED_SOURCE_VALIDATION_REQUIRED");
  assert.equal(Object.keys(q.incidents).length, 2);
  assert.throws(() => update(q, [{ ...fixture, leagueSlug: "../bad" }]), /identity/);
  assert.throws(() => update({ schema: "broken" }), /queue/);
});

test("urgent evidence retries cannot sleep past kickoff or starve other due leagues", () => {
  const other = { ...fixture, canonicalId: "cid_alarm_b_20261001", leagueSlug: "second.1", kickoffUtc: "2026-10-01T11:00Z" };
  let q = update(null, [fixture, other]);
  const first = dueValueDataResearch(q, now, 1)[0];
  q.research[first.key] = { attempts: 12, lastAttemptAt: new Date(now - 3600000).toISOString(), nextAttemptAt: new Date(now + 86400000).toISOString() };
  const due = dueValueDataResearch(q, now, 2);
  assert.equal(due.length, 2, "legacy long backoff must be capped when kickoff is near");
  assert.equal(due[0].incidents[0].leagueSlug, "second.1", "never-attempted urgent league must not starve");
  recordValueDataResearch(q, first, { status: "failed" }, now);
  assert.equal(Date.parse(q.research[first.key].nextAttemptAt) - now, 15 * 60000);
  assert.equal(dueValueDataResearch(q, now + 60000, 2).length, 1, "the rate limit still applies");
});

test("early fixture acquisition keeps a bounded slot while urgent failures recur", () => {
  const rows = [fixture, { ...fixture, canonicalId: "cid_urgent_two", leagueSlug: "urgent.2" },
    { ...fixture, canonicalId: "cid_early_one", leagueSlug: "early.1", kickoffUtc: "2026-10-06T10:00Z" },
    { ...fixture, canonicalId: "cid_early_two", leagueSlug: "early.2", kickoffUtc: "2026-10-07T10:00Z" }];
  const q = update(null, rows);
  const first = dueValueDataResearch(q, now, 2);
  assert.equal(first.length, 2);
  assert.equal(first[0].incidents[0].leagueSlug, "test.1");
  assert.equal(first[1].incidents[0].leagueSlug, "early.1");
  recordValueDataResearch(q, first[1], { status: "failed" }, now);
  const next = dueValueDataResearch(q, now + 60000, 2);
  assert.equal(next[1].incidents[0].leagueSlug, "early.2");
  assert.equal(dueValueDataResearch(q, now + 60000, 1)[0].incidents[0].leagueSlug, "test.1");
});
