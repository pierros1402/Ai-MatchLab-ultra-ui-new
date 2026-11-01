import test from "node:test";
import assert from "node:assert/strict";
import { resolveFederationNonPlayedDecision as resolve } from "./federation-nonplayed-decisions.js";

const id = "cid_syr1_foutoua_aljaish_20261030";
const common = { canonicalId: id, leagueSlug: "syr.1", sourceId: "KdKrgosB", homeTeam: "Foutoua", awayTeam: "Al Jaish", kickoffUtc: "2026-10-30T12:00:00.000Z", scoreHome: null, scoreAway: null };
const published = { ...common, status: "STATUS_SCHEDULED" };
const canonical = { ...common, status: "STATUS_POSTPONED", rawStatus: "STATUS_POSTPONED", statusType: "STATUS_POSTPONED", statusCorrection: { decisionId: "foutoua-aljaish-federation-reschedule-20261029-v1", providerNativeStatusCodeVerified: false, policyVersion: "federation-nonplayed-exact-reviewed-v1", publicationAuthorized: true, rescheduledMatch: { providerMatchId: "KdKrgosB" } } };
const rescheduled = { ...common, canonicalId: "cid_syr1_foutoua_aljaish_20261101", dayKey: "2026-11-01", kickoffUtc: "2026-11-01T12:00:00.000Z", status: "STATUS_SCHEDULED" };
const input = { day: "2026-10-30", published, canonical, rescheduled };
test("only exact separately pinned federation decision is admissible", () => {
  assert.equal(resolve(input)?.terminalStatus, "STATUS_POSTPONED");
  assert.equal(resolve({ ...input, day: "2026-10-31" }), null);
  assert.equal(resolve({ ...input, rescheduled: null }), null);
});
test("cross-day and score/status/identity mutations fail closed", () => {
  for (const [part, changes] of [
    ["published", { status: "FT" }], ["published", { scoreHome: 0 }],
    ["canonical", { status: "FT" }], ["canonical", { scoreAway: 1 }],
    ["canonical", { sourceId: "OTHER" }], ["canonical", { homeTeam: "Other" }],
    ["canonical", { kickoffUtc: "2026-10-31T12:00:00.000Z" }],
    ["rescheduled", { dayKey: "2026-10-30" }],
    ["rescheduled", { sourceId: "different" }],
    ["rescheduled", { scoreHome: 0 }],
    ["canonical", { statusCorrection: { ...canonical.statusCorrection, decisionId: "unknown" } }],
    ["canonical", { statusCorrection: { ...canonical.statusCorrection, publicationAuthorized: false } }]
  ]) assert.equal(resolve({ ...input, [part]: { ...input[part], ...changes } }), null);
});
