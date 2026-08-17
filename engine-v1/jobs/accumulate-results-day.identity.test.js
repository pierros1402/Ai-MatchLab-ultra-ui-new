import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCanonicalResultIdentity
} from "./accumulate-results-day.js";

test("Flashscore result uses authoritative canonical id and preserves provider provenance", () => {
  const result = resolveCanonicalResultIdentity(
    {
      matchId: "jJ2FOCp1",
      home: "Estudiantes L.P.",
      away: "Gimnasia L.P.",
      kickoffUtc: "2026-08-15T19:45:00.000Z",
    },
    "arg.1",
    {
      canonicalRows: [
        {
          canonicalId:
            "cid_arg1_estudianteslaplata_gimnasialaplata_20260815",
          matchId:
            "cid_arg1_estudianteslaplata_gimnasialaplata_20260815",
          leagueSlug: "arg.1",
          homeTeam: "Estudiantes de La Plata",
          awayTeam: "Gimnasia La Plata",
          kickoffUtc: "2026-08-15T19:45Z",
        },
      ],
    },
  );

  assert.equal(result.status, "canonical");
  assert.equal(
    result.matchId,
    "cid_arg1_estudianteslaplata_gimnasialaplata_20260815",
  );
  assert.equal(result.sourceMatchId, "jJ2FOCp1");
  assert.equal(result.providerMatchId, "jJ2FOCp1");
  assert.equal(result.candidateCount, 1);
});

test("operational Athens day resolves cross-UTC-midnight fixture identity", () => {
  const result = resolveCanonicalResultIdentity(
    {
      matchId: "vJLQsUhc",
      home: "Athletico-PR",
      away: "Bragantino",
      kickoffUtc: "2026-08-15T21:30:00.000Z",
    },
    "bra.1",
    {
      canonicalRows: [
        {
          canonicalId:
            "cid_bra1_athleticopr_redbullbragantino_20260816",
          matchId:
            "cid_bra1_athleticopr_redbullbragantino_20260816",
          leagueSlug: "bra.1",
          homeTeam: "Athletico-PR",
          awayTeam: "Red Bull Bragantino",
          kickoffUtc: "2026-08-15T21:30Z",
        },
      ],
    },
  );

  assert.equal(result.status, "canonical");
  assert.equal(result.dayKey, "2026-08-16");
  assert.equal(
    result.matchId,
    "cid_bra1_athleticopr_redbullbragantino_20260816",
  );
  assert.equal(result.sourceMatchId, "vJLQsUhc");
});

test("ambiguous canonical candidates never manufacture canonical identity", () => {
  const provider = {
    matchId: "provider_1",
    home: "Example FC",
    away: "Other FC",
    kickoffUtc: "2026-08-15T18:00:00.000Z",
  };

  const canonicalRows = [
    {
      canonicalId: "cid_one",
      leagueSlug: "test.1",
      homeTeam: "Example FC",
      awayTeam: "Other FC",
      kickoffUtc: "2026-08-15T18:00:00.000Z",
    },
    {
      canonicalId: "cid_two",
      leagueSlug: "test.1",
      homeTeam: "Example FC",
      awayTeam: "Other FC",
      kickoffUtc: "2026-08-15T18:00:00.000Z",
    },
  ];

  const result = resolveCanonicalResultIdentity(
    provider,
    "test.1",
    { canonicalRows },
  );

  assert.equal(
    result.status,
    "ambiguous_canonical_identity",
  );
  assert.equal(result.matchId, "provider_1");
  assert.equal(result.sourceMatchId, null);
  assert.equal(result.canonicalMatchId, null);
  assert.equal(result.candidateCount, 2);
});

test("unresolved provider result remains provider identity without false canonical link", () => {
  const result = resolveCanonicalResultIdentity(
    {
      matchId: "provider_unresolved",
      home: "Unknown Home",
      away: "Unknown Away",
      kickoffUtc: "2026-08-15T18:00:00.000Z",
    },
    "test.1",
    {
      canonicalRows: [
        {
          canonicalId: "cid_different",
          leagueSlug: "test.1",
          homeTeam: "Different Home",
          awayTeam: "Different Away",
          kickoffUtc: "2026-08-15T18:00:00.000Z",
        },
      ],
    },
  );

  assert.equal(result.status, "provider_fallback");
  assert.equal(result.matchId, "provider_unresolved");
  assert.equal(result.sourceMatchId, null);
  assert.equal(result.canonicalMatchId, null);
  assert.equal(result.candidateCount, 0);
});

test("squad identity boundary prevents senior result from matching youth fixture", () => {
  const result = resolveCanonicalResultIdentity(
    {
      matchId: "provider_ajax",
      home: "Ajax",
      away: "PSV",
      kickoffUtc: "2026-08-15T18:00:00.000Z",
    },
    "ned.1",
    {
      canonicalRows: [
        {
          canonicalId: "cid_ajax_u21",
          leagueSlug: "ned.1",
          homeTeam: "Ajax U21",
          awayTeam: "PSV",
          kickoffUtc: "2026-08-15T18:00:00.000Z",
        },
      ],
    },
  );

  assert.equal(result.status, "provider_fallback");
  assert.equal(result.matchId, "provider_ajax");
  assert.equal(result.candidateCount, 0);
});