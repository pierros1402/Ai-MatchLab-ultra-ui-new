import test from "node:test";
import assert from "node:assert/strict";

import { discoverIdentityRecoveryCandidates } from "./identity-extension-recovery.js";

function row(id, source, kickoffUtc, homeTeam, awayTeam) {
  return {
    canonicalId: id,
    source,
    sourceId: `${source}-${id}`,
    dayKey: "2026-08-08",
    leagueSlug: "test.1",
    kickoffUtc,
    homeTeam,
    awayTeam,
  };
}

function fakeResolver(bindings = {}) {
  return {
    resolveTeamReference({ alias }) {
      const globalClubId = bindings[alias] || null;
      return globalClubId
        ? { ok: true, globalClubId }
        : { ok: false, status: "NORMALIZED_EXACT_ALIAS_NOT_FOUND" };
    },
  };
}

test("one stable side makes a unique cross-provider pair auto-promotable", () => {
  const report = discoverIdentityRecoveryCandidates([
    row("fs-1", "flashscore", "2026-08-08T18:45:00.000Z", "Stable FC", "Short Name"),
    row("espn-1", "espn", "2026-08-08T18:45:00.000Z", "Stable FC", "Completely Different Name"),
  ]);
  assert.equal(report.summary.autoPromotable, 1);
  assert.equal(report.autoPromotable[0].recoveryStatus, "AUTO_PROMOTABLE_IDENTITY_EXTENSION");
  assert.equal(report.autoPromotable[0].promotionAuthorized, true);
});

test("two unresolved sides never auto-promote without independent confirmation", () => {
  const report = discoverIdentityRecoveryCandidates([
    row("fs-1", "flashscore", "2026-08-08T18:45:00.000Z", "Alias A", "Alias B"),
    row("espn-1", "espn", "2026-08-08T18:45:00.000Z", "Long Club A", "Long Club B"),
  ]);
  assert.equal(report.summary.autoPromotable, 0);
  assert.equal(report.summary.pendingIndependentConfirmation, 1);
  assert.equal(report.pendingIndependentConfirmation[0].promotionAuthorized, false);
});

test("different known global IDs are rejected before proposal", () => {
  const resolver = fakeResolver({
    "Club A": "gcid_a",
    "Club B": "gcid_b",
    "Opponent": "gcid_opp",
  });
  const report = discoverIdentityRecoveryCandidates([
    row("fs-1", "flashscore", "2026-08-08T18:45:00.000Z", "Club A", "Opponent"),
    row("espn-1", "espn", "2026-08-08T18:45:00.000Z", "Club B", "Opponent"),
  ], { resolver });
  assert.equal(report.summary.autoPromotable, 0);
  assert.equal(report.summary.conflictRejected, 1);
  assert.equal(report.conflictRejected[0].recoveryStatus, "REJECTED_IDENTITY_CONFLICT");
  assert.equal(report.conflictRejected[0].promotionAuthorized, false);
});

test("Jrs and Juniors share the same squad marker instead of creating a false conflict", () => {
  const resolver = fakeResolver({ "Racing Club": "gcid_racing" });
  const report = discoverIdentityRecoveryCandidates([
    row("fs-1", "flashscore", "2026-08-08T18:45:00.000Z", "Argentinos Jrs", "Racing Club"),
    row("espn-1", "espn", "2026-08-08T18:45:00.000Z", "Argentinos Juniors", "Racing Club"),
  ], { resolver });
  assert.equal(report.summary.conflictRejected, 0);
  assert.equal(report.summary.autoPromotable, 1);
  assert.equal(report.autoPromotable[0].evidence.stableSides, 1);
  assert.equal(
    report.autoPromotable[0].recoveryStatus,
    "AUTO_PROMOTABLE_IDENTITY_EXTENSION"
  );
});

test("different known fixtures at a synchronized kickoff are bucket noise, not conflicts", () => {
  const resolver = fakeResolver({
    "Home A": "gcid_home_a",
    "Away A": "gcid_away_a",
    "Home B": "gcid_home_b",
    "Away B": "gcid_away_b",
  });
  const report = discoverIdentityRecoveryCandidates([
    row("fs-a", "flashscore", "2026-08-08T18:45:00.000Z", "Home A", "Away A"),
    row("espn-b", "espn", "2026-08-08T18:45:00.000Z", "Home B", "Away B"),
  ], { resolver });
  assert.equal(report.summary.conflictRejected, 0);
  assert.deepEqual(report.conflictRejected, []);
});

test("same kickoff with multiple unresolved fixtures stays ambiguous", () => {
  const kickoff = "2026-08-08T18:45:00.000Z";
  const report = discoverIdentityRecoveryCandidates([
    row("fs-1", "flashscore", kickoff, "A short", "B short"),
    row("fs-2", "flashscore", kickoff, "C short", "D short"),
    row("espn-1", "espn", kickoff, "A long", "B long"),
    row("espn-2", "espn", kickoff, "C long", "D long"),
  ]);
  assert.equal(report.summary.autoPromotable, 0);
  assert.equal(report.summary.pendingIndependentConfirmation, 0);
  assert.equal(report.summary.ambiguous, 1);
  assert.equal(report.ambiguous[0].recoveryStatus, "AMBIGUOUS_KICKOFF_BUCKET");
  assert.ok(report.ambiguous.every(x => x.promotionAuthorized === false));
});

test("existing exact global identity on both sides produces lineage-only promotion", () => {
  const resolver = fakeResolver({
    "Short Home": "gcid_home",
    "Long Home": "gcid_home",
    "Short Away": "gcid_away",
    "Long Away": "gcid_away",
  });
  const report = discoverIdentityRecoveryCandidates([
    row("fs-1", "flashscore", "2026-08-08T18:45:00.000Z", "Short Home", "Short Away"),
    row("espn-1", "espn", "2026-08-08T18:45:00.000Z", "Long Home", "Long Away"),
  ], { resolver });
  assert.equal(report.summary.autoPromotable, 1);
  assert.equal(report.autoPromotable[0].recoveryStatus, "AUTO_PROMOTABLE_LINEAGE");
});

test("normalized-exact unknown team still requires identity extension before lineage promotion", () => {
  const resolver = fakeResolver({
    "Known Home": "gcid_home",
    "Known Home Alt": "gcid_home",
  });
  const report = discoverIdentityRecoveryCandidates([
    row("fs-1", "flashscore", "2026-08-08T18:45:00.000Z", "Known Home", "Tristan Suarez"),
    row("espn-1", "espn", "2026-08-08T18:45:00.000Z", "Known Home Alt", "Tristán Suárez"),
  ], { resolver });
  assert.equal(report.summary.autoPromotable, 1);
  assert.equal(
    report.autoPromotable[0].recoveryStatus,
    "AUTO_PROMOTABLE_IDENTITY_EXTENSION"
  );
  assert.equal(report.autoPromotable[0].evidence.away.productionIdentityComplete, false);
});

test("already-managed retained/suppressed lineage is not proposed again", () => {
  const resolver = {
    ...fakeResolver({
      "Short Home": "gcid_home",
      "Long Home": "gcid_home",
      "Short Away": "gcid_away",
      "Long Away": "gcid_away",
    }),
    resolveFixtureId(id) {
      if (id === "fs-1") {
        return { ok: true, resolvedFixtureId: "espn-1" };
      }
      if (id === "espn-1") {
        return { ok: true, resolvedFixtureId: "espn-1" };
      }
      return { ok: false, status: "UNKNOWN_FIXTURE_ID" };
    },
  };
  const report = discoverIdentityRecoveryCandidates([
    row("fs-1", "flashscore", "2026-08-08T18:45:00.000Z", "Short Home", "Short Away"),
    row("espn-1", "espn", "2026-08-08T18:45:00.000Z", "Long Home", "Long Away"),
  ], { resolver });
  assert.equal(report.summary.autoPromotable, 0);
  assert.equal(report.summary.alreadyManagedPairs, 1);
});
