import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, "..", "..");

function clean(value) {
  return String(value ?? "").trim();
}

function normalizedText(value) {
  return clean(value).toLocaleLowerCase("en-US");
}

function sameExactText(a, b) {
  return normalizedText(a) !== "" && normalizedText(a) === normalizedText(b);
}

function sameInstant(a, b) {
  const left = Date.parse(clean(a));
  const right = Date.parse(clean(b));
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

function pickId(pick) {
  return clean(
    pick?.matchId ||
    pick?.canonicalId ||
    pick?.id ||
    pick?.fixtureId ||
    pick?.eventId ||
    pick?.gameId
  );
}

function pickKickoff(pick) {
  return clean(
    pick?.kickoff ||
    pick?.kickoffUtc ||
    pick?.startTime ||
    pick?.startUtc ||
    pick?.time
  );
}

function providerIdOf(row, provider) {
  const direct = [
    row?.providerMatchId,
    row?.sourceMatchId,
    row?.sourceId
  ].map(clean).filter(Boolean);

  const providerIds = row?.providerIds;
  if (providerIds && typeof providerIds === "object") {
    const providerValue = clean(providerIds[provider]);
    if (providerValue) direct.push(providerValue);
  }

  return [...new Set(direct)];
}

function fixtureRows(document) {
  if (Array.isArray(document)) return document;
  if (Array.isArray(document?.fixtures)) return document.fixtures;
  return [];
}

export const VALUE_SETTLEMENT_OCCURRENCE_DISPLACEMENT_DECISIONS = Object.freeze([
  Object.freeze({
    schema: "ai-matchlab.value-settlement-occurrence-displacement.v1",
    action: "VOID",
    reason: "authoritative_provider_occurrence_moved_other_day",
    provider: "espn",
    providerMatchId: "401900921",
    leagueSlug: "ksa.1",
    originalDayKey: "2026-09-10",
    originalCanonicalId: "cid_ksa1_alkhaleej_alnassr_20260910",
    originalKickoffUtc: "2026-09-10T18:00:00.000Z",
    homeTeam: "Al Khaleej",
    awayTeam: "Al Nassr",
    authoritativeDayKey: "2026-09-12",
    authoritativeCanonicalId: "cid_ksa1_alkhaleej_alnassr_20260912",
    authoritativeKickoffUtc: "2026-09-12T18:00:00.000Z"
  })
]);

export function evaluateValueSettlementOccurrenceDisplacement({
  pick,
  decision,
  originalDocument,
  authoritativeDocument
} = {}) {
  if (!pick || !decision || !originalDocument || !authoritativeDocument) return null;
  if (decision.action !== "VOID") return null;
  if (pickId(pick) !== clean(decision.originalCanonicalId)) return null;
  if (!sameExactText(pick?.leagueSlug || pick?.league, decision.leagueSlug)) return null;
  if (!sameExactText(pick?.homeTeam, decision.homeTeam)) return null;
  if (!sameExactText(pick?.awayTeam, decision.awayTeam)) return null;
  if (!sameInstant(pickKickoff(pick), decision.originalKickoffUtc)) return null;

  if (clean(originalDocument?.dayKey) !== clean(decision.originalDayKey)) return null;
  if (!sameExactText(originalDocument?.leagueSlug, decision.leagueSlug)) return null;

  const originalRows = fixtureRows(originalDocument);
  if (originalRows.some((row) => clean(row?.canonicalId) === clean(decision.originalCanonicalId))) {
    return null;
  }

  const reconciliation = originalDocument?.sourceMeta?.exactEventSummaryReconciliation;
  const policy = reconciliation?.policy || {};
  if (
    policy?.exactProviderIdOnly !== true ||
    policy?.authoritativeEventDayOnly !== true ||
    policy?.teamIdentityRequired !== true ||
    policy?.homeAwayOrientationRequired !== true ||
    policy?.crossDayStatusPromotion !== false ||
    policy?.heuristicFinalPromotion !== false
  ) {
    return null;
  }

  const fetches = Array.isArray(reconciliation?.fetches) ? reconciliation.fetches : [];
  const matchingFetches = fetches.filter((row) =>
    clean(row?.providerMatchId) === clean(decision.providerMatchId)
  );
  if (matchingFetches.length !== 1) return null;

  const fetch = matchingFetches[0];
  if (
    fetch?.ok !== true ||
    clean(fetch?.kind) !== "other_day" ||
    clean(fetch?.authoritativeDayKey) !== clean(decision.authoritativeDayKey)
  ) {
    return null;
  }

  if (clean(authoritativeDocument?.dayKey) !== clean(decision.authoritativeDayKey)) return null;
  if (!sameExactText(authoritativeDocument?.leagueSlug, decision.leagueSlug)) return null;

  const targetRows = fixtureRows(authoritativeDocument).filter((row) =>
    providerIdOf(row, decision.provider).includes(clean(decision.providerMatchId))
  );
  if (targetRows.length !== 1) return null;

  const target = targetRows[0];
  if (clean(target?.canonicalId) !== clean(decision.authoritativeCanonicalId)) return null;
  if (clean(target?.dayKey) !== clean(decision.authoritativeDayKey)) return null;
  if (!sameExactText(target?.leagueSlug, decision.leagueSlug)) return null;
  if (!sameExactText(target?.homeTeam, decision.homeTeam)) return null;
  if (!sameExactText(target?.awayTeam, decision.awayTeam)) return null;
  if (!sameInstant(target?.kickoffUtc || target?.kickoff, decision.authoritativeKickoffUtc)) return null;
  if (clean(target?.canonicalId) === clean(decision.originalCanonicalId)) return null;

  return {
    verified: true,
    action: "VOID",
    reason: decision.reason,
    provider: decision.provider,
    providerMatchId: decision.providerMatchId,
    originalDayKey: decision.originalDayKey,
    originalCanonicalId: decision.originalCanonicalId,
    originalKickoffUtc: decision.originalKickoffUtc,
    authoritativeDayKey: decision.authoritativeDayKey,
    authoritativeCanonicalId: decision.authoritativeCanonicalId,
    authoritativeKickoffUtc: decision.authoritativeKickoffUtc,
    homeTeam: decision.homeTeam,
    awayTeam: decision.awayTeam,
    reconciliationKind: "other_day"
  };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function resolveValueSettlementOccurrenceDisplacement(
  pick,
  { rootDir = DEFAULT_ROOT, decisions = VALUE_SETTLEMENT_OCCURRENCE_DISPLACEMENT_DECISIONS } = {}
) {
  const id = pickId(pick);
  if (!id) return null;

  const matching = decisions.filter((decision) => clean(decision?.originalCanonicalId) === id);
  if (matching.length !== 1) return null;
  const decision = matching[0];

  const originalFile = path.join(
    rootDir,
    "data",
    "canonical-fixtures",
    decision.originalDayKey,
    `${decision.leagueSlug}.json`
  );
  const authoritativeFile = path.join(
    rootDir,
    "data",
    "canonical-fixtures",
    decision.authoritativeDayKey,
    `${decision.leagueSlug}.json`
  );

  const originalDocument = readJson(originalFile);
  const authoritativeDocument = readJson(authoritativeFile);
  if (!originalDocument || !authoritativeDocument) return null;

  return evaluateValueSettlementOccurrenceDisplacement({
    pick,
    decision,
    originalDocument,
    authoritativeDocument
  });
}

export function buildOccurrenceDisplacementSettlementProvenance(evidence) {
  if (evidence?.verified !== true || evidence?.action !== "VOID") return null;

  return {
    verifiedFinalTruth: false,
    verifiedNonPlayedTruth: false,
    verifiedOccurrenceDisplacement: true,
    verdict: "verified_occurrence_moved_void",
    source: evidence.provider,
    method: evidence.reason,
    authority: "canonical_fixture_store_exact_event_summary",
    sourceCount: 2,
    independentSourceCount: 1,
    generatedAt: null,
    providerMatchId: evidence.providerMatchId,
    originalDayKey: evidence.originalDayKey,
    originalCanonicalId: evidence.originalCanonicalId,
    originalKickoffUtc: evidence.originalKickoffUtc,
    authoritativeDayKey: evidence.authoritativeDayKey,
    authoritativeCanonicalId: evidence.authoritativeCanonicalId,
    authoritativeKickoffUtc: evidence.authoritativeKickoffUtc,
    sources: [
      {
        provider: evidence.provider,
        providerMatchId: evidence.providerMatchId,
        role: "original_day_exact_event_summary_reconciliation",
        dayKey: evidence.originalDayKey,
        reconciliationKind: evidence.reconciliationKind
      },
      {
        provider: evidence.provider,
        providerMatchId: evidence.providerMatchId,
        role: "authoritative_target_canonical_occurrence",
        dayKey: evidence.authoritativeDayKey,
        canonicalId: evidence.authoritativeCanonicalId
      }
    ]
  };
}
