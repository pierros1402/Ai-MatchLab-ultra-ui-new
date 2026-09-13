import test from "node:test";
import assert from "node:assert/strict";

import {
  VALUE_SETTLEMENT_OCCURRENCE_DISPLACEMENT_DECISIONS,
  evaluateValueSettlementOccurrenceDisplacement,
  resolveValueSettlementOccurrenceDisplacement,
  buildOccurrenceDisplacementSettlementProvenance
} from "../core/value-settlement-occurrence-displacement.js";

const decision = VALUE_SETTLEMENT_OCCURRENCE_DISPLACEMENT_DECISIONS[0];
const pick = {
  matchId: decision.originalCanonicalId,
  leagueSlug: decision.leagueSlug,
  homeTeam: decision.homeTeam,
  awayTeam: decision.awayTeam,
  kickoff: decision.originalKickoffUtc,
  market: "Over / Under 2.5",
  pick: "Over 2.5"
};

function originalDocument(overrides = {}) {
  return {
    dayKey: decision.originalDayKey,
    leagueSlug: decision.leagueSlug,
    count: 0,
    fixtures: [],
    sourceMeta: {
      exactEventSummaryReconciliation: {
        fetches: [
          {
            providerSlug: decision.leagueSlug,
            providerMatchId: decision.providerMatchId,
            ok: true,
            kind: "other_day",
            authoritativeDayKey: decision.authoritativeDayKey,
            reason: null
          }
        ],
        policy: {
          exactProviderIdOnly: true,
          authoritativeEventDayOnly: true,
          teamIdentityRequired: true,
          homeAwayOrientationRequired: true,
          crossDayStatusPromotion: false,
          heuristicFinalPromotion: false
        }
      }
    },
    ...overrides
  };
}

function targetRow(overrides = {}) {
  return {
    canonicalId: decision.authoritativeCanonicalId,
    matchId: decision.authoritativeCanonicalId,
    source: decision.provider,
    sourceId: decision.providerMatchId,
    sourceMatchId: decision.providerMatchId,
    providerIds: { [decision.provider]: decision.providerMatchId },
    leagueSlug: decision.leagueSlug,
    dayKey: decision.authoritativeDayKey,
    kickoffUtc: decision.authoritativeKickoffUtc,
    homeTeam: decision.homeTeam,
    awayTeam: decision.awayTeam,
    status: "FT",
    scoreHome: 1,
    scoreAway: 1,
    ...overrides
  };
}

function authoritativeDocument(row = targetRow(), overrides = {}) {
  return {
    dayKey: decision.authoritativeDayKey,
    leagueSlug: decision.leagueSlug,
    count: 1,
    fixtures: [row],
    ...overrides
  };
}

function evaluate({
  testPick = pick,
  testDecision = decision,
  oldDoc = originalDocument(),
  targetDoc = authoritativeDocument()
} = {}) {
  return evaluateValueSettlementOccurrenceDisplacement({
    pick: testPick,
    decision: testDecision,
    originalDocument: oldDoc,
    authoritativeDocument: targetDoc
  });
}

test("exact provider occurrence displaced to another authoritative day resolves VOID evidence", () => {
  const evidence = evaluate();
  assert.equal(evidence?.verified, true);
  assert.equal(evidence?.action, "VOID");
  assert.equal(evidence?.providerMatchId, "401900921");
  assert.equal(evidence?.originalDayKey, "2026-09-10");
  assert.equal(evidence?.authoritativeDayKey, "2026-09-12");

  const provenance = buildOccurrenceDisplacementSettlementProvenance(evidence);
  assert.equal(provenance?.verifiedOccurrenceDisplacement, true);
  assert.equal(provenance?.method, "authoritative_provider_occurrence_moved_other_day");
  assert.equal(provenance?.independentSourceCount, 1);
});

test("current repository evidence resolves the exact Al Khaleej occurrence and nothing generic", () => {
  const evidence = resolveValueSettlementOccurrenceDisplacement(pick);
  assert.equal(evidence?.verified, true);
  assert.equal(evidence?.authoritativeCanonicalId, "cid_ksa1_alkhaleej_alnassr_20260912");

  assert.equal(resolveValueSettlementOccurrenceDisplacement({
    ...pick,
    matchId: "cid_ksa1_unregistered_fixture_20260910"
  }), null);
});

test("wrong provider id in old-day reconciliation remains unresolved", () => {
  const oldDoc = originalDocument();
  oldDoc.sourceMeta.exactEventSummaryReconciliation.fetches[0].providerMatchId = "wrong-id";
  assert.equal(evaluate({ oldDoc }), null);
});

test("wrong authoritative day remains unresolved", () => {
  const oldDoc = originalDocument();
  oldDoc.sourceMeta.exactEventSummaryReconciliation.fetches[0].authoritativeDayKey = "2026-09-11";
  assert.equal(evaluate({ oldDoc }), null);
});

test("team orientation mismatch remains unresolved", () => {
  assert.equal(evaluate({ targetDoc: authoritativeDocument(targetRow({ homeTeam: "Al Nassr", awayTeam: "Al Khaleej" })) }), null);
});

test("kickoff mismatch remains unresolved", () => {
  assert.equal(evaluate({ targetDoc: authoritativeDocument(targetRow({ kickoffUtc: "2026-09-12T19:00:00.000Z" })) }), null);
});

test("missing authoritative target occurrence remains unresolved", () => {
  assert.equal(evaluate({ targetDoc: authoritativeDocument(null, { count: 0, fixtures: [] }) }), null);
});

test("weak or heuristic reconciliation policy remains unresolved", () => {
  const oldDoc = originalDocument();
  oldDoc.sourceMeta.exactEventSummaryReconciliation.policy.heuristicFinalPromotion = true;
  assert.equal(evaluate({ oldDoc }), null);
});

test("a still-present original canonical occurrence cannot be voided as displaced", () => {
  const oldDoc = originalDocument({
    count: 1,
    fixtures: [{ canonicalId: decision.originalCanonicalId }]
  });
  assert.equal(evaluate({ oldDoc }), null);
});

test("duplicate authoritative provider identity fails closed", () => {
  const row = targetRow();
  const duplicate = { ...row, canonicalId: `${row.canonicalId}_duplicate` };
  assert.equal(evaluate({ targetDoc: authoritativeDocument(row, { count: 2, fixtures: [row, duplicate] }) }), null);
});
