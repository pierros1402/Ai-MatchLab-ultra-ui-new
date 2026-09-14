import test from "node:test";
import assert from "node:assert/strict";

import { dedupeLeagueDayFixtures } from "../core/fixture-dedup.js";

function row({ canonicalId, source, sourceId, kickoffUtc, homeTeam, awayTeam }) {
  return {
    canonicalId,
    matchId: canonicalId,
    source,
    sourceId,
    sourceMatchId: sourceId,
    providerIds: { [source]: sourceId },
    leagueSlug: "afc.champions",
    leagueName: source === "espn" ? "AFC Champions League" : "AFC Champions League - League phase",
    dayKey: "2026-09-14",
    kickoffUtc,
    homeTeam,
    awayTeam,
    status: "PRE",
    rawStatus: "STATUS_SCHEDULED",
    scoreHome: null,
    scoreAway: null
  };
}

test("AFC cross-provider aliases collapse Neftchi/Air Force duplicate and preserve lineage", () => {
  const espn = row({ canonicalId: "cid_afcchampions_neftchifergana_airforce_20260914", source: "espn", sourceId: "401912664", kickoffUtc: "2026-09-14T13:45:00.000Z", homeTeam: "Neftchi Fergana", awayTeam: "Air Force Club" });
  const flashscore = row({ canonicalId: "cid_afcchampions_neftchifargonauzb_alquwaaljawiyairq_20260914", source: "flashscore", sourceId: "riNKwxy1", kickoffUtc: "2026-09-14T13:45:00.000Z", homeTeam: "Neftchi Fargona (Uzb)", awayTeam: "Al Quwa Al Jawiya (Irq)" });
  const result = dedupeLeagueDayFixtures([flashscore, espn], { slug: "afc.champions" });
  assert.equal(result.rows.length, 1);
  assert.equal(result.removed.length, 1);
  const kept = result.rows[0];
  assert.equal(kept.canonicalId, espn.canonicalId);
  assert.equal(kept.providerIds.espn, "401912664");
  assert.equal(kept.providerIds.flashscore, "riNKwxy1");
  assert.deepEqual(kept.canonicalAliases, [flashscore.canonicalId]);
});

test("AFC cross-provider aliases collapse Shabab Al-Ahli/Tractor duplicate and preserve lineage", () => {
  const espn = row({ canonicalId: "cid_afcchampions_shababalahli_traktorsazi_20260914", source: "espn", sourceId: "401912673", kickoffUtc: "2026-09-14T16:00:00.000Z", homeTeam: "Shabab Al-Ahli", awayTeam: "Traktor Sazi FC" });
  const flashscore = row({ canonicalId: "cid_afcchampions_shababalahlidubaiuae_tractorirn_20260914", source: "flashscore", sourceId: "rBDEaJcK", kickoffUtc: "2026-09-14T16:00:00.000Z", homeTeam: "Shabab Al-Ahli Dubai (Uae)", awayTeam: "Tractor (Irn)" });
  const result = dedupeLeagueDayFixtures([flashscore, espn], { slug: "afc.champions" });
  assert.equal(result.rows.length, 1);
  assert.equal(result.removed.length, 1);
  const kept = result.rows[0];
  assert.equal(kept.canonicalId, espn.canonicalId);
  assert.equal(kept.providerIds.espn, "401912673");
  assert.equal(kept.providerIds.flashscore, "rBDEaJcK");
  assert.deepEqual(kept.canonicalAliases, [flashscore.canonicalId]);
});
