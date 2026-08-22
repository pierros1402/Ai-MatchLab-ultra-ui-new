import test from "node:test";
import assert from "node:assert/strict";

import { auditCanonicalRowsAgainstFlashscoreFeed } from "../jobs/audit-flashscore-canonical-taxonomy-day.js";

function canonicalRow(id, leagueName, overrides = {}) {
  return {
    canonicalId: `cid_${id}`,
    source: "flashscore",
    sourceId: id,
    sourceMatchId: id,
    providerIds: { flashscore: id },
    leagueSlug: "eng.1",
    leagueName,
    dayKey: "2026-08-22",
    kickoffUtc: "2026-08-22T14:00:00.000Z",
    homeTeam: `Home ${id}`,
    awayTeam: `Away ${id}`,
    ...overrides
  };
}

function feedRow(id, leagueName, leaguePath) {
  return {
    matchId: id,
    country: "England",
    leagueName,
    leaguePath,
    kickoffUtc: "2026-08-22T14:00:00.000Z",
    home: `Home ${id}`,
    away: `Away ${id}`
  };
}

test("taxonomy audit separates verified, wrong-slug, out-of-scope, and missing evidence", () => {
  const canonicalPayloads = [
    {
      dayKey: "2026-08-22",
      leagueSlug: "eng.1",
      fixtures: [
        canonicalRow("correct", "Premier League"),
        canonicalRow("youth", "Premier League 2"),
        canonicalRow("wrong-tier", "League One"),
        canonicalRow("missing", "Premier League")
      ]
    }
  ];

  const feedRows = [
    feedRow("correct", "Premier League", "/football/england/premier-league/"),
    feedRow("youth", "Premier League 2", "/football/england/premier-league-2/"),
    feedRow("wrong-tier", "League One", "/football/england/league-one/")
  ];

  const audit = auditCanonicalRowsAgainstFlashscoreFeed({
    dayKey: "2026-08-22",
    canonicalPayloads,
    feedRows
  });

  assert.equal(audit.flashscoreCanonicalRows, 4);
  assert.equal(audit.verifiedCount, 1);
  assert.equal(audit.issueCount, 2);
  assert.equal(audit.providerEvidenceMissingCount, 1);
  assert.equal(audit.clean, false);

  const byId = new Map(audit.issues.map(issue => [issue.providerId, issue]));

  assert.equal(
    byId.get("youth")?.reason,
    "provider_path_unmapped_from_declared_coverage"
  );
  assert.equal(byId.get("youth")?.authoritativeSlug, null);
  assert.equal(
    byId.get("youth")?.providerLeaguePath,
    "/football/england/premier-league-2/"
  );

  assert.equal(
    byId.get("wrong-tier")?.reason,
    "canonical_competition_slug_mismatch"
  );
  assert.equal(byId.get("wrong-tier")?.authoritativeSlug, "eng.3");

  assert.equal(
    audit.providerEvidenceMissing[0]?.reason,
    "provider_match_not_in_fetched_window"
  );
});

test("non-Flashscore canonical rows are outside this provider audit", () => {
  const audit = auditCanonicalRowsAgainstFlashscoreFeed({
    dayKey: "2026-08-22",
    canonicalPayloads: [
      {
        dayKey: "2026-08-22",
        leagueSlug: "eng.1",
        fixtures: [
          {
            canonicalId: "espn-one",
            source: "espn",
            sourceMatchId: "123",
            leagueSlug: "eng.1",
            leagueName: "Premier League"
          }
        ]
      }
    ],
    feedRows: []
  });

  assert.equal(audit.flashscoreCanonicalRows, 0);
  assert.equal(audit.issueCount, 0);
  assert.equal(audit.providerEvidenceMissingCount, 0);
  assert.equal(audit.clean, true);
});
