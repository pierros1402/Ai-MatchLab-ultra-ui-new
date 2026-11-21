import test from "node:test";
import assert from "node:assert/strict";
import { mergeCertifiedOddsAssessments as merge } from "../core/merge-certified-odds-assessments.js";
import { classifyAssessmentPublication } from "../core/assessment-publication-identity.js";
import { runOddsRefresh } from "./run-odds-refresh.js";

const fixture = id => ({
  canonicalId: id, matchId: id, providerIds: {flashscore: id},
  source: "flashscore", dayKey: "2026-11-22", leagueSlug: "eng.1",
  home: "Home", away: "Away", kickoffUtc: "2026-11-22T20:00:00Z"
});
const model = {markets: {"1X2": {probs: {home: 0.5, draw: 0.3, away: 0.2}}}};
const row = (id, enabled=true) => ({
  ...fixture(id), market: {open: {home: 2}},
  aiAssessment: enabled ? model : null
});

test("certified merge preserves old and new instead of suppressing new model", () => {
  const v = merge([row("old")], [row("new")],
    [fixture("old"), fixture("new")], classifyAssessmentPublication);
  assert.deepEqual(v.matches.map(x => x.canonicalId), ["new", "old"]);
  assert.equal(v.carriedRows, 1);
  assert.equal(v.restoredModels, 0);
});

test("certified merge restores prior model while preserving new bookmaker market", () => {
  const next = {...row("a", false), market: {open: {home: 3}}};
  const v = merge([row("a")], [next], [fixture("a")], classifyAssessmentPublication);
  assert.equal(v.restoredModels, 1);
  assert.equal(v.matches[0].market.open.home, 3);
  assert.deepEqual(v.matches[0].aiAssessment, model);
});

test("certified merge never overwrites a new certified model", () => {
  const current = {...row("a"), aiAssessment: {markets: {BTTS: {probs: {yes: 0.6}}}}};
  const v = merge([row("a")], [current], [fixture("a")], classifyAssessmentPublication);
  assert.deepEqual(v.matches[0].aiAssessment, current.aiAssessment);
});

test("certified merge rejects conflicting team identities", () => {
  assert.throws(() => merge([row("a")],[{...row("a",false),home:"Other"}],
    [fixture("a")], classifyAssessmentPublication), /identity_drift/);
});

test("certified merge rejects different provider event IDs", () => {
  assert.throws(() => merge([row("a")],[{...row("a",false),providerIds:{flashscore:"other"}}],
    [fixture("a")], classifyAssessmentPublication), /provider_drift/);
});

test("certified merge rejects duplicate prior certified rows", () => {
  assert.throws(() => merge([row("a"),row("a")],[],
    [fixture("a")], classifyAssessmentPublication), /duplicate_previous/);
});

test("certified merge rejects ambiguous candidate identities", () => {
  assert.throws(() => merge([row("a")],[row("a"),row("a")],
    [fixture("a")], classifyAssessmentPublication), /ambiguous_candidate/);
});

test("certified merge rejects duplicate canonical fixtures", () => {
  assert.throws(() => merge([row("a")],[],
    [fixture("a"),fixture("a")], classifyAssessmentPublication), /non_unique/);
});

test("certified merge refuses uncorroborated prior model", () => {
  const v = merge([{...row("a"),providerIds:{flashscore:"wrong"}}],[],
    [fixture("a")], classifyAssessmentPublication);
  assert.equal(v.matches.length, 0);
});

test("odds refresh rejects exporter identity hold before stale snapshot verification", async () => {
  let reads=0;
  await assert.rejects(() => runOddsRefresh("2026-11-22",{
    readSnapshot: () => {reads++;return null},
    exportFixtures: async () => ({changed:false}),
    updateDecision: () => ({due:false,reason:"not_due"}),
    supplement: () => ({canonicalFixtures:0,modelEvidenceEligibleFixtureIds:[]}),
    exportOdds: () => ({ok:false,reason:"ambiguous_canonical_ownership_publication_hold"}),
    readCanonical: () => []
  }), e => e?.code === "odds_export_not_approved" &&
    e.exportResult?.reason === "ambiguous_canonical_ownership_publication_hold");
  assert.equal(reads,1);
});
