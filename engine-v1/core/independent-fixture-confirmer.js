import {
  normalizeGenesisAlias,
  sha256Canonical,
} from "./production-identity-retention-decisions.js";
import { sameSquadMarkers } from "./team-identity.js";

const KICKOFF_TOLERANCE_MS = 60_000;
const CONFIRMER_SOURCE = "api_football";
const EVIDENCE_KIND = "INDEPENDENT_NON_ODDS_FIXTURE_CONFIRMATION";
const MATCHING_MODE = "EXACT_NORMALIZED_CROSS_SOURCE_BRIDGE_NO_FUZZY";
const API_FOOTBALL_EVIDENCE_RE =
  /^https:\/\/v3\.football\.api-sports\.io\/fixtures\?id=[A-Za-z0-9_-]+$/u;

function clean(value) {
  return String(value ?? "").trim();
}

function kickoffMs(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceFamily(row) {
  const source = clean(row?.source || row?.sourceFamily).toLowerCase();
  if (source.includes("espn")) return "espn";
  if (source.includes("flashscore") || source.startsWith("fs")) return "flashscore";
  if (source === "api_football" || source === "source2") return "api_football";
  return source || "unknown";
}

function canonicalCandidate(candidate) {
  const pair = [candidate?.left, candidate?.right]
    .filter(Boolean)
    .sort((a, b) => {
      const rank = value => sourceFamily(value) === "espn" ? 0 : 1;
      return rank(a) - rank(b) ||
        clean(a?.canonicalId).localeCompare(clean(b?.canonicalId));
    });
  return pair.length === 2
    ? { ...candidate, left: pair[0], right: pair[1] }
    : candidate;
}

function exactTeamEquivalent(left, right) {
  const a = clean(left);
  const b = clean(right);
  if (!a || !b || !sameSquadMarkers(a, b)) return false;
  const normalizedA = normalizeGenesisAlias(a);
  return Boolean(normalizedA && normalizedA === normalizeGenesisAlias(b));
}

function candidateShapeValid(candidate) {
  const leftFamily = sourceFamily(candidate?.left);
  const rightFamily = sourceFamily(candidate?.right);
  return Boolean(
    candidate?.recoveryStatus === "PENDING_INDEPENDENT_CONFIRMATION" &&
    candidate?.requiresIndependentConfirmation === true &&
    candidate?.promotionAuthorized === false &&
    clean(candidate?.leagueSlug) &&
    kickoffMs(candidate?.kickoffUtc) !== null &&
    new Set([leftFamily, rightFamily]).size === 2 &&
    [leftFamily, rightFamily].every(item => item === "espn" || item === "flashscore") &&
    clean(candidate?.left?.canonicalId) &&
    clean(candidate?.right?.canonicalId) &&
    clean(candidate?.left?.homeTeam) &&
    clean(candidate?.left?.awayTeam) &&
    clean(candidate?.right?.homeTeam) &&
    clean(candidate?.right?.awayTeam)
  );
}

function rowBridge(candidate, row) {
  const leftHome = exactTeamEquivalent(candidate.left.homeTeam, row.homeTeam);
  const leftAway = exactTeamEquivalent(candidate.left.awayTeam, row.awayTeam);
  const rightHome = exactTeamEquivalent(candidate.right.homeTeam, row.homeTeam);
  const rightAway = exactTeamEquivalent(candidate.right.awayTeam, row.awayTeam);
  const swapped = [candidate.left, candidate.right].some(sourceRow =>
    exactTeamEquivalent(sourceRow.homeTeam, row.awayTeam) ||
    exactTeamEquivalent(sourceRow.awayTeam, row.homeTeam)
  );

  return {
    leftHome,
    leftAway,
    rightHome,
    rightAway,
    swapped,
    homeSupported: leftHome || rightHome,
    awaySupported: leftAway || rightAway,
    leftSupported: leftHome || leftAway,
    rightSupported: rightHome || rightAway,
  };
}

function confirmationEvidence(candidate, row, bridge, observedAt) {
  const payload = {
    status: "CONFIRMED",
    source: CONFIRMER_SOURCE,
    evidenceKind: EVIDENCE_KIND,
    matchingMode: MATCHING_MODE,
    oddsUsed: false,
    observedAt: clean(observedAt) || null,
    url: clean(row?.evidenceUrl),
    providerMatchId: clean(row?.providerMatchId),
    providerLeagueId: Number(row?.providerLeagueId),
    leagueSlug: clean(candidate?.leagueSlug),
    dayKey: clean(candidate?.dayKey || row?.requestedDayKey),
    kickoffUtc: clean(row?.kickoffUtc),
    homeTeam: clean(row?.homeTeam),
    awayTeam: clean(row?.awayTeam),
    homeTeamId: clean(row?.homeTeamId) || null,
    awayTeamId: clean(row?.awayTeamId) || null,
    bridge: {
      leftHome: bridge.leftHome,
      leftAway: bridge.leftAway,
      rightHome: bridge.rightHome,
      rightAway: bridge.rightAway,
    },
  };
  return {
    ...payload,
    evidenceSha256: sha256Canonical(payload),
  };
}

export function validateIndependentFixtureConfirmation(candidate, confirmation) {
  const canonical = canonicalCandidate(candidate);
  if (!candidateShapeValid(canonical)) {
    return { ok: false, reason: "INVALID_PENDING_CANDIDATE" };
  }
  if (clean(confirmation?.status) !== "CONFIRMED" ||
      clean(confirmation?.source).toLowerCase() !== CONFIRMER_SOURCE ||
      clean(confirmation?.evidenceKind) !== EVIDENCE_KIND ||
      clean(confirmation?.matchingMode) !== MATCHING_MODE ||
      confirmation?.oddsUsed !== false) {
    return { ok: false, reason: "INVALID_CONFIRMATION_CONTRACT" };
  }
  if (!API_FOOTBALL_EVIDENCE_RE.test(clean(confirmation?.url)) ||
      !clean(confirmation?.providerMatchId) ||
      !Number.isFinite(Number(confirmation?.providerLeagueId)) ||
      clean(confirmation?.leagueSlug) !== clean(canonical?.leagueSlug) ||
      !clean(confirmation?.dayKey) ||
      !clean(confirmation?.homeTeam) ||
      !clean(confirmation?.awayTeam)) {
    return { ok: false, reason: "INCOMPLETE_CONFIRMATION_EVIDENCE" };
  }
  if (clean(canonical?.dayKey) && clean(confirmation?.dayKey) !== clean(canonical?.dayKey)) {
    return { ok: false, reason: "CONFIRMATION_DAY_MISMATCH" };
  }
  const candidateKickoff = kickoffMs(canonical?.kickoffUtc);
  const evidenceKickoff = kickoffMs(confirmation?.kickoffUtc);
  if (candidateKickoff === null || evidenceKickoff === null ||
      Math.abs(candidateKickoff - evidenceKickoff) > KICKOFF_TOLERANCE_MS) {
    return { ok: false, reason: "CONFIRMATION_KICKOFF_MISMATCH" };
  }

  const row = {
    homeTeam: confirmation.homeTeam,
    awayTeam: confirmation.awayTeam,
  };
  const bridge = rowBridge(canonical, row);
  if (bridge.swapped || !bridge.homeSupported || !bridge.awaySupported ||
      !bridge.leftSupported || !bridge.rightSupported) {
    return { ok: false, reason: "EXACT_CROSS_SOURCE_BRIDGE_NOT_PROVEN" };
  }
  const claimedBridge = confirmation?.bridge || {};
  for (const key of ["leftHome", "leftAway", "rightHome", "rightAway"]) {
    if (claimedBridge[key] !== bridge[key]) {
      return { ok: false, reason: "CONFIRMATION_BRIDGE_MISMATCH" };
    }
  }

  const payload = { ...confirmation };
  const claimedHash = clean(payload.evidenceSha256);
  delete payload.evidenceSha256;
  if (!claimedHash || sha256Canonical(payload) !== claimedHash) {
    return { ok: false, reason: "CONFIRMATION_EVIDENCE_HASH_MISMATCH" };
  }
  return { ok: true, reason: "CONFIRMED_INDEPENDENT_NON_ODDS_FIXTURE", bridge };
}

export function evaluateIndependentFixtureConfirmation(
  candidate,
  thirdSourceRows,
  { observedAt = new Date().toISOString() } = {},
) {
  const canonical = canonicalCandidate(candidate);
  if (!candidateShapeValid(canonical)) {
    return { ok: false, retryable: false, status: "INVALID_PENDING_CANDIDATE" };
  }
  const candidateKickoff = kickoffMs(canonical.kickoffUtc);
  const leagueSlug = clean(canonical.leagueSlug);
  const bucket = (Array.isArray(thirdSourceRows) ? thirdSourceRows : [])
    .filter(row => sourceFamily(row) === CONFIRMER_SOURCE)
    .filter(row => clean(row?.leagueSlug) === leagueSlug)
    .filter(row => {
      const ms = kickoffMs(row?.kickoffUtc);
      return ms !== null && Math.abs(ms - candidateKickoff) <= KICKOFF_TOLERANCE_MS;
    });

  // If the independent provider sees more than one fixture at the same league
  // kickoff, the two-provider pair is not sufficiently unique. Never use name
  // similarity to choose one from a synchronized-kickoff bucket.
  if (bucket.length !== 1) {
    return {
      ok: false,
      retryable: true,
      status: bucket.length === 0
        ? "NO_THIRD_SOURCE_FIXTURE_AT_KICKOFF"
        : "AMBIGUOUS_THIRD_SOURCE_KICKOFF_BUCKET",
      thirdSourceKickoffRows: bucket.length,
    };
  }

  const row = bucket[0];
  const bridge = rowBridge(canonical, row);
  if (bridge.swapped || !bridge.homeSupported || !bridge.awaySupported ||
      !bridge.leftSupported || !bridge.rightSupported) {
    return {
      ok: false,
      retryable: true,
      status: "NO_EXACT_CROSS_SOURCE_BRIDGE",
      thirdSourceKickoffRows: 1,
    };
  }
  const evidence = confirmationEvidence(canonical, row, bridge, observedAt);
  const validation = validateIndependentFixtureConfirmation(canonical, evidence);
  if (!validation.ok) {
    return { ok: false, retryable: false, status: validation.reason };
  }
  return {
    ok: true,
    retryable: false,
    status: "CONFIRMED",
    thirdSourceKickoffRows: 1,
    evidence,
  };
}

export const INDEPENDENT_FIXTURE_CONFIRMATION_CONTRACT = Object.freeze({
  source: CONFIRMER_SOURCE,
  evidenceKind: EVIDENCE_KIND,
  matchingMode: MATCHING_MODE,
  kickoffToleranceMs: KICKOFF_TOLERANCE_MS,
  bookmakerOddsAllowed: false,
  fuzzyMatchingAllowed: false,
});
