import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCanonicalStatusCoherenceRepair,
  evaluateCanonicalStatusCoherenceRepair
} from "./canonical-status-coherence-repair.js";

function canonical(overrides = {}) {
  return {
    canonicalId: "cid_ecu1_delfin_orense_20260810",
    matchId: "cid_ecu1_delfin_orense_20260810",
    source: "espn",
    sourceId: "401859651",
    sourceMatchId: "401859651",
    leagueSlug: "ecu.1",
    dayKey: "2026-08-10",
    kickoffUtc: "2026-08-09T21:00Z",
    homeTeam: "Delfín",
    awayTeam: "Orense",
    scoreHome: 1,
    scoreAway: 1,
    status: "FT",
    statusType: "STATUS_FINAL",
    rawStatus: "STATUS_SCHEDULED",
    operationalState: "TERMINAL_CONFIRMED",
    minute: "FT",
    authoritativeTerminalWriteback: {
      schema: "ai-matchlab.authoritative-terminal-writeback.v1",
      provider: "reconciled",
      providerMatchId: "401859651",
      observation: {
        status: "FT",
        statusType: "STATUS_FINAL",
        rawStatus: "STATUS_SCHEDULED",
        scoreHome: 1,
        scoreAway: 1
      }
    },
    ...overrides
  };
}

function finalResult(overrides = {}) {
  return {
    schema: "ai-matchlab.verified-final-result.v1",
    verifiedFinalTruth: true,
    dayKey: "2026-08-10",
    date: "2026-08-10",
    matchId: "cid_ecu1_delfin_orense_20260810",
    leagueSlug: "ecu.1",
    homeTeam: "Delfín",
    awayTeam: "Orense",
    kickoffUtc: "2026-08-09T21:00Z",
    scoreHome: 1,
    scoreAway: 1,
    generatedAt: "2026-08-09T23:48:33.897Z",
    sources: [
      {
        provider: "espn",
        providerMatchId: "401859651",
        home: "Delfín",
        away: "Orense",
        kickoffUtc: "2026-08-09T21:00Z",
        scoreHome: 1,
        scoreAway: 1,
        rawStatus: "STATUS_FULL_TIME",
        terminalObservedAt: "2026-08-09T23:40:44.016Z"
      },
      {
        provider: "flashscore",
        providerMatchId: "t6P6WkW0",
        home: "Delfin",
        away: "Orense",
        kickoffUtc: "2026-08-09T21:00:00.000Z",
        scoreHome: 1,
        scoreAway: 1
      }
    ],
    ...overrides
  };
}

test("repairs exact production conflict only from exact verified provider terminal evidence", () => {
  const result = applyCanonicalStatusCoherenceRepair({
    canonicalRow: canonical(),
    finalResult: finalResult(),
    dayKey: "2026-08-10",
    repairedAt: "2026-08-11T05:00:00.000Z"
  });

  assert.equal(result.changed, true);
  assert.equal(result.row.status, "FT");
  assert.equal(result.row.statusType, "STATUS_FINAL");
  assert.equal(result.row.rawStatus, "STATUS_FULL_TIME");
  assert.equal(result.row.operationalState, "TERMINAL_CONFIRMED");
  assert.equal(result.row.authoritativeTerminalWriteback.observation.rawStatus, "STATUS_FULL_TIME");
  assert.equal(result.row.statusCoherenceRepair.providerMatchId, "401859651");
  assert.equal(result.row.statusCoherenceRepair.previous.rawStatus, "STATUS_SCHEDULED");
});

test("fails closed when exact provider terminal evidence is absent", () => {
  const final = finalResult({
    sources: finalResult().sources.filter(source => source.provider !== "espn")
  });
  const result = evaluateCanonicalStatusCoherenceRepair({
    canonicalRow: canonical(),
    finalResult: final,
    dayKey: "2026-08-10"
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "exact_provider_terminal_evidence_required");
});

test("fails closed when verified score disagrees with canonical terminal score", () => {
  const result = evaluateCanonicalStatusCoherenceRepair({
    canonicalRow: canonical(),
    finalResult: finalResult({ scoreHome: 2 }),
    dayKey: "2026-08-10"
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "score_mismatch");
});

test("is a no-op for already coherent canonical truth", () => {
  const result = applyCanonicalStatusCoherenceRepair({
    canonicalRow: canonical({
      rawStatus: "STATUS_FULL_TIME",
      authoritativeTerminalWriteback: {
        observation: {
          status: "FT",
          statusType: "STATUS_FINAL",
          rawStatus: "STATUS_FULL_TIME",
          scoreHome: 1,
          scoreAway: 1
        }
      }
    }),
    finalResult: finalResult(),
    dayKey: "2026-08-10"
  });

  assert.equal(result.changed, false);
  assert.equal(result.reason, "canonical_already_coherent");
});
