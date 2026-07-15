import test from "node:test";
import assert from "node:assert/strict";
import {
  auditResultsMemoryPayload,
  auditHistoryRows,
  auditH2HPayload,
  semanticTeamKey
} from "./audit-history-semantic-integrity.js";

test("expired result entries are separated from semantic duplicates", () => {
  const payload = {
    slug: "test.1",
    teams: {
      Alpha: [{ matchId: "old-1", date: "2020-01-01T12:00:00Z", opp: "Beta", ha: "H", gf: 1, ga: 0, res: "W" }],
      Beta: [{ matchId: "old-1", date: "2020-01-01T12:00:00Z", opp: "Alpha", ha: "A", gf: 0, ga: 1, res: "L" }]
    }
  };

  const report = auditResultsMemoryPayload("test.1", payload, {
    nowMs: Date.parse("2026-07-15T00:00:00Z")
  });

  assert.equal(report.expiredEntryCount, 2);
  assert.equal(report.semantic.duplicateGroups, 0);
  assert.equal(report.orphanMatchIdCount, 0);
});

test("cross-provider Atlanta alias duplicate is detected semantically", () => {
  const payload = {
    slug: "arg.2",
    teams: {
      "Atletico Atlanta": [
        { matchId: "espn_1", date: "2026-07-04T21:00:00Z", opp: "Quilmes", ha: "A", gf: 0, ga: 1, res: "L" },
        { matchId: "flash_1", date: "2026-07-04T21:00:00Z", opp: "Quilmes", ha: "A", gf: 0, ga: 1, res: "L" }
      ],
      Atlanta: [],
      Quilmes: [
        { matchId: "espn_1", date: "2026-07-04T21:00:00Z", opp: "Atletico Atlanta", ha: "H", gf: 1, ga: 0, res: "W" },
        { matchId: "flash_1", date: "2026-07-04T21:00:00Z", opp: "Atlanta", ha: "H", gf: 1, ga: 0, res: "W" }
      ]
    }
  };

  const report = auditResultsMemoryPayload("arg.2", payload, {
    nowMs: Date.parse("2026-07-15T00:00:00Z")
  });

  assert.equal(semanticTeamKey("arg.2", "Atlanta"), semanticTeamKey("arg.2", "Atletico Atlanta"));
  assert.equal(report.semantic.duplicateGroups, 1);
  assert.equal(report.semantic.duplicateExtraRecords, 1);
  assert.equal(report.semantic.scoreConflictGroups, 0);
});

test("same fixture with conflicting scores is an error-class semantic conflict", () => {
  const rows = [
    {
      id: "espn_1", leagueSlug: "arg.2", dayKey: "2026-07-12",
      kickoff: "2026-07-12T18:00:00Z",
      homeTeam: "Gimnasia y Esgrima (Jujuy)", awayTeam: "Chacarita Juniors",
      scoreHome: 1, scoreAway: 1
    },
    {
      id: "flash_1", leagueSlug: "arg.2", dayKey: "2026-07-12",
      kickoff: "2026-07-12T18:00:00Z",
      homeTeam: "Gimnasia Jujuy", awayTeam: "Chacarita Juniors",
      scoreHome: 2, scoreAway: 1
    }
  ];

  const report = auditHistoryRows(rows);
  assert.equal(report.semantic.scoreConflictGroups, 1);
  assert.equal(report.semantic.duplicateGroups, 0);
});

test("operational day validation uses Europe/Athens rather than UTC date", () => {
  const rows = [{
    id: "late-1", leagueSlug: "usa.2", dayKey: "2026-07-05",
    kickoff: "2026-07-04T23:00:00Z",
    homeTeam: "Alpha", awayTeam: "Beta", scoreHome: 1, scoreAway: 0
  }];

  const report = auditHistoryRows(rows);
  assert.equal(report.operationalDayMismatchCount, 0);
});

test("H2H audit flags the legacy AFC filename and expects the canonical fallback", () => {
  const payload = {
    teamA: "AFC",
    teamB: "Eemdijk",
    matches: [{
      matchId: "h2h-1", date: "2026-01-01T12:00:00Z",
      homeTeam: "AFC", awayTeam: "Eemdijk", scoreHome: 1, scoreAway: 0,
      leagueSlug: "ned.3"
    }]
  };

  const report = auditH2HPayload("~eemdijk.json", payload);
  assert.equal(report.expectedFileName, "afc~eemdijk.json");
  assert.equal(report.nonCanonicalFileName, true);
  assert.equal(report.degradedPairKey, false);
  assert.equal(report.storedPairMismatchCount, 0);
});
