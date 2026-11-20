import test from "node:test";
import assert from "node:assert/strict";
import { assessPublicationIdentity } from "./assessment-publication-identity.js";
import { approvedPublicationTeamAliasEquivalent } from "../jobs/export-odds-snapshot-day.js";

const canonical = {
  canonicalId: "cid_esp1_athletic_espanyol_20261120",
  providerIds: { espn: "401882805" },
  leagueSlug: "esp.1",
  dayKey: "2026-11-20",
  homeTeam: "Athletic Club",
  awayTeam: "Espanyol",
  kickoffUtc: "2026-11-20T20:00Z"
};
const { homeTeam: _canonicalHome, awayTeam: _canonicalAway, ...eventIdentity } = canonical;
const assessed = {
  ...eventIdentity,
  home: "athletic club",
  away: "Espanyol",
  aiAssessment: { markets: { OU25: { probs: { over: .6, under: .4 } } } }
};
test("case-only difference does not invalidate exact canonical and provider identity", () => {
  assert.equal(assessPublicationIdentity(assessed, [canonical]).status, "publish");
});
test("different team labels stay on HOLD even if provider IDs match", () => {
  assert.equal(assessPublicationIdentity({ ...assessed, home: "Athletic Club FC" }, [canonical]).reason, "home_team_conflict");
});
test("provider conflict never passes", () => {
  assert.equal(assessPublicationIdentity({ ...assessed, providerIds: { espn: "different" } }, [canonical]).reason, "provider_id_conflict");
});
test("kickoff discrepancy remains HOLD", () => {
  assert.equal(assessPublicationIdentity({ ...assessed, kickoffUtc: "2026-11-20T21:00Z" }, [canonical]).reason, "kickoff_conflict");
});

test("committed Welsh league alias reconciles only the exact preapproved two labels", () => {
  const fixture = { ...canonical, canonicalId: "cid_wal1_penybont_haverfordwest_20261120",
    providerIds: { flashscore: "Cl0znH63" }, leagueSlug: "wal.1",
    homeTeam: "Penybont", awayTeam: "Haverfordwest",
    kickoffUtc: "2026-11-20T19:45:00Z" };
  const odds = { ...assessed, canonicalId: fixture.canonicalId,
    providerIds: fixture.providerIds, leagueSlug: fixture.leagueSlug,
    home: "Penybont FC", away: "Haverfordwest", kickoffUtc: fixture.kickoffUtc };
  assert.equal(assessPublicationIdentity(odds, [fixture]).reason, "home_team_conflict");
  assert.equal(assessPublicationIdentity(odds, [fixture], {
    approvedTeamAliasEquivalent: approvedPublicationTeamAliasEquivalent
  }).status, "publish");
  assert.equal(approvedPublicationTeamAliasEquivalent("wal.1", "Penybont", "Penybont FC"), true);
  assert.equal(approvedPublicationTeamAliasEquivalent("esp.1", "Penybont", "Penybont FC"), false);
  assert.equal(approvedPublicationTeamAliasEquivalent("wal.1", "Penybont", "Unknown Club"), false);
});
