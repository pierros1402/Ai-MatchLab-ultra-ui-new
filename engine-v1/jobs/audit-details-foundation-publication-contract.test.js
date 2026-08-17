import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePublicationUniverseContract,
  evaluateDetailFoundationRecord,
} from "./audit-details-foundation-day.js";

function fixture(id, kickoffUtc = "2026-08-16T18:00:00.000Z") {
  return { canonicalId: id, matchId: id, kickoffUtc };
}

function manifest({ mode, current, published, deferred = [] }) {
  return {
    publicationUniverse: {
      mode,
      currentFixtureCount: current,
      publishedFixtureCount: published,
      deferredFixtureCount: deferred.length,
      deferredFixtureIds: deferred,
    },
    files: { fixtures: "fixtures.json", detailsDir: "details" },
    counts: { fixtures: published, details: published },
  };
}

function detail(id, {
  kickoffUtc = "2026-08-16T18:00:00.000Z",
  history = "history-ok",
  h2h = "h2h-ok",
} = {}) {
  return {
    matchId: id,
    basic: { canonicalId: id, kickoffUtc },
    form: { cutoffUtc: kickoffUtc },
    leagueForm5: { cutoffUtc: kickoffUtc },
    h2h: { status: "empty", all: [], atHome: [], atAway: [] },
    meta: { foundation: { historyIndexFingerprint: history, h2hFingerprint: h2h } },
  };
}

const foundations = {
  indexValidation: { ok: true, artifact: { foundationFingerprint: "history-ok" } },
  h2hValidation: { ok: true, artifact: { foundationFingerprint: "h2h-ok" } },
};

test("full current universe requires exact publication parity", () => {
  const current = [fixture("a"), fixture("b")];
  const result = evaluatePublicationUniverseContract({
    manifest: manifest({ mode: "full_current_universe", current: 2, published: 2 }),
    currentFixtures: current,
    publishedFixtures: current,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.deferredIds, []);
});

test("intraday publication accepts exact trusted deferred fixture", () => {
  const result = evaluatePublicationUniverseContract({
    manifest: manifest({ mode: "intraday_status_only", current: 3, published: 2, deferred: ["c"] }),
    currentFixtures: [fixture("a"), fixture("b"), fixture("c")],
    publishedFixtures: [fixture("a"), fixture("b")],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.deferredIds, ["c"]);
});

test("undeclared missing current fixture fails closed", () => {
  const result = evaluatePublicationUniverseContract({
    manifest: manifest({ mode: "intraday_status_only", current: 3, published: 2, deferred: [] }),
    currentFixtures: [fixture("a"), fixture("b"), fixture("c")],
    publishedFixtures: [fixture("a"), fixture("b")],
  });
  assert.equal(result.ok, false);
  assert(result.issues.some(issue => issue.code === "CURRENT_FIXTURE_UNACCOUNTED"));
});

test("published fixture outside current universe fails closed", () => {
  const result = evaluatePublicationUniverseContract({
    manifest: manifest({ mode: "intraday_status_only", current: 2, published: 2, deferred: [] }),
    currentFixtures: [fixture("a"), fixture("b")],
    publishedFixtures: [fixture("a"), fixture("x")],
  });
  assert.equal(result.ok, false);
  assert(result.issues.some(issue => issue.code === "PUBLISHED_FIXTURE_NOT_IN_CURRENT_UNIVERSE"));
});

test("duplicate published IDs fail closed", () => {
  const result = evaluatePublicationUniverseContract({
    manifest: manifest({ mode: "intraday_status_only", current: 1, published: 1, deferred: [] }),
    currentFixtures: [fixture("a")],
    publishedFixtures: [fixture("a"), fixture("a")],
  });
  assert.equal(result.ok, false);
  assert(result.issues.some(issue => issue.code === "PUBLISHED_FIXTURE_DUPLICATE_CANONICAL_ID"));
});

test("stale history-index fingerprint is reported separately", () => {
  const issues = evaluateDetailFoundationRecord({
    detail: detail("a", { history: "stale" }),
    expectedFixture: fixture("a"),
    ...foundations,
  });
  assert(issues.some(issue => issue.code === "DETAIL_HISTORY_INDEX_FINGERPRINT_STALE"));
  assert(!issues.some(issue => issue.code === "DETAIL_H2H_FINGERPRINT_STALE"));
});

test("stale H2H fingerprint is reported separately", () => {
  const issues = evaluateDetailFoundationRecord({
    detail: detail("a", { h2h: "stale" }),
    expectedFixture: fixture("a"),
    ...foundations,
  });
  assert(issues.some(issue => issue.code === "DETAIL_H2H_FINGERPRINT_STALE"));
  assert(!issues.some(issue => issue.code === "DETAIL_HISTORY_INDEX_FINGERPRINT_STALE"));
});

test("missing or invalid publication mode fails closed", () => {
  const result = evaluatePublicationUniverseContract({
    manifest: manifest({ mode: "", current: 1, published: 1 }),
    currentFixtures: [fixture("a")],
    publishedFixtures: [fixture("a")],
  });
  assert.equal(result.ok, false);
  assert(result.issues.some(issue => issue.code === "PUBLICATION_MODE_INVALID"));
});