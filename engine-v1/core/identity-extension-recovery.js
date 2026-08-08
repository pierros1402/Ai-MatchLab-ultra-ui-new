import { normalizeGenesisAlias } from "./production-identity-retention-decisions.js";
import { sameSquadMarkers } from "./team-identity.js";

const KICKOFF_TOLERANCE_MS = 60_000;

function clean(value) {
  return String(value ?? "").trim();
}

function sourceFamily(row) {
  const source = clean(row?.source).toLowerCase();
  if (source.includes("espn")) return "espn";
  if (source.includes("flashscore") || source.startsWith("fs")) return "flashscore";
  if (source.includes("sofa")) return "sofascore";
  return source || "unknown";
}

function rowId(row) {
  return clean(row?.canonicalId || row?.matchId);
}

function kickoffMs(row) {
  const value = Date.parse(row?.kickoffUtc || "");
  return Number.isFinite(value) ? value : null;
}

function exactIdentity(resolver, leagueSlug, teamName) {
  if (!resolver || typeof resolver.resolveTeamReference !== "function") return null;
  const result = resolver.resolveTeamReference({ alias: teamName, leagueSlug });
  return result?.ok ? result.globalClubId : null;
}

function compareTeam(resolver, leagueSlug, left, right) {
  if (!sameSquadMarkers(left, right)) {
    return { kind: "SQUAD_CONFLICT", stable: false, conflict: true };
  }

  const leftId = exactIdentity(resolver, leagueSlug, left);
  const rightId = exactIdentity(resolver, leagueSlug, right);
  if (leftId && rightId) {
    if (leftId === rightId) {
      return { kind: "GLOBAL_ID_EXACT", stable: true, conflict: false, globalClubId: leftId };
    }
    return {
      kind: "GLOBAL_ID_CONFLICT",
      stable: false,
      conflict: true,
      leftGlobalClubId: leftId,
      rightGlobalClubId: rightId,
    };
  }

  const leftNormalized = normalizeGenesisAlias(left);
  const rightNormalized = normalizeGenesisAlias(right);
  if (leftNormalized && leftNormalized === rightNormalized) {
    return {
      kind: "NORMALIZED_EXACT",
      stable: true,
      conflict: false,
      // Preserve a one-sided existing identity for the future alias-extension
      // promoter. NORMALIZED_EXACT is enough to anchor the fixture pair, but it
      // is not the same thing as both provider spellings already being managed.
      globalClubId: leftId || rightId || null,
      leftGlobalClubId: leftId,
      rightGlobalClubId: rightId,
      productionIdentityComplete: Boolean(leftId && rightId),
    };
  }

  return {
    kind: "UNRESOLVED_ALIAS",
    stable: false,
    conflict: false,
    leftGlobalClubId: leftId,
    rightGlobalClubId: rightId,
  };
}

function pairEvidence(left, right, resolver, leagueSlug) {
  const home = compareTeam(resolver, leagueSlug, left?.homeTeam, right?.homeTeam);
  const away = compareTeam(resolver, leagueSlug, left?.awayTeam, right?.awayTeam);
  return {
    home,
    away,
    stableSides: Number(home.stable) + Number(away.stable),
    conflict: Boolean(home.conflict || away.conflict),
  };
}

function alreadyManagedSameFixture(resolver, left, right) {
  if (!resolver || typeof resolver.resolveFixtureId !== "function") return false;
  const a = resolver.resolveFixtureId(rowId(left));
  const b = resolver.resolveFixtureId(rowId(right));
  return Boolean(
    a?.ok &&
    b?.ok &&
    clean(a.resolvedFixtureId) &&
    clean(a.resolvedFixtureId) === clean(b.resolvedFixtureId)
  );
}

function candidateView(candidate) {
  return {
    leagueSlug: candidate.leagueSlug,
    kickoffUtc: candidate.left.kickoffUtc || candidate.right.kickoffUtc || null,
    left: {
      source: sourceFamily(candidate.left),
      sourceId: clean(candidate.left?.sourceId || candidate.left?.sourceMatchId),
      canonicalId: rowId(candidate.left),
      kickoffUtc: clean(candidate.left?.kickoffUtc),
      homeTeam: clean(candidate.left?.homeTeam),
      awayTeam: clean(candidate.left?.awayTeam),
    },
    right: {
      source: sourceFamily(candidate.right),
      sourceId: clean(candidate.right?.sourceId || candidate.right?.sourceMatchId),
      canonicalId: rowId(candidate.right),
      kickoffUtc: clean(candidate.right?.kickoffUtc),
      homeTeam: clean(candidate.right?.homeTeam),
      awayTeam: clean(candidate.right?.awayTeam),
    },
    evidence: candidate.evidence,
  };
}

export function discoverIdentityRecoveryCandidates(
  rows,
  { leagueSlug = null, resolver = null } = {}
) {
  const input = (Array.isArray(rows) ? rows : [])
    .filter(Boolean)
    .filter(row => rowId(row) && kickoffMs(row) !== null);
  const slug = clean(leagueSlug || input[0]?.leagueSlug);
  const temporalPairs = [];
  let alreadyManagedPairs = 0;

  for (let i = 0; i < input.length; i++) {
    for (let j = i + 1; j < input.length; j++) {
      const left = input[i];
      const right = input[j];
      if (sourceFamily(left) === sourceFamily(right)) continue;
      if (clean(left?.dayKey) && clean(right?.dayKey) && clean(left.dayKey) !== clean(right.dayKey)) continue;
      if (Math.abs(kickoffMs(left) - kickoffMs(right)) > KICKOFF_TOLERANCE_MS) continue;
      if (alreadyManagedSameFixture(resolver, left, right)) {
        alreadyManagedPairs += 1;
        continue;
      }

      temporalPairs.push({
        leagueSlug: slug,
        left,
        right,
        evidence: pairEvidence(left, right, resolver, slug),
      });
    }
  }

  const nonConflicting = temporalPairs.filter(item => !item.evidence.conflict);
  // A shared kickoff is only a temporal hint. In leagues with synchronized
  // kickoffs, two completely different known fixtures will naturally produce
  // cross-provider pairs where both sides conflict. Those are alternatives in
  // the kickoff bucket, not identity incidents. A conflict is actionable only
  // when at least one side is an exact identity anchor and the other side
  // contradicts it.
  const anchoredConflicts = temporalPairs.filter(item =>
    item.evidence.conflict && item.evidence.stableSides >= 1
  );
  const strong = nonConflicting.filter(item => item.evidence.stableSides >= 1);
  const temporalByRow = new Map();
  for (const item of temporalPairs) {
    for (const id of [rowId(item.left), rowId(item.right)]) {
      temporalByRow.set(id, (temporalByRow.get(id) || 0) + 1);
    }
  }
  const strongByRow = new Map();
  for (const item of strong) {
    for (const id of [rowId(item.left), rowId(item.right)]) {
      strongByRow.set(id, (strongByRow.get(id) || 0) + 1);
    }
  }

  const autoPromotable = [];
  const pendingIndependentConfirmation = [];
  const ambiguous = [];
  const consumed = new Set();

  for (const item of strong) {
    const leftId = rowId(item.left);
    const rightId = rowId(item.right);
    const unique = strongByRow.get(leftId) === 1 && strongByRow.get(rightId) === 1;
    if (!unique) {
      ambiguous.push({
        ...candidateView(item),
        recoveryStatus: "AMBIGUOUS_STRONG_CANDIDATE",
        promotionAuthorized: false,
      });
      continue;
    }
    consumed.add(leftId);
    consumed.add(rightId);
    autoPromotable.push({
      ...candidateView(item),
      recoveryStatus: item.evidence.home.kind === "GLOBAL_ID_EXACT" &&
        item.evidence.away.kind === "GLOBAL_ID_EXACT"
        ? "AUTO_PROMOTABLE_LINEAGE"
        : "AUTO_PROMOTABLE_IDENTITY_EXTENSION",
      promotionAuthorized: true,
      requiresIndependentConfirmation: false,
    });
  }

  const pendingKeys = new Set();
  const ambiguousBucketKeys = new Set();
  for (const item of nonConflicting.filter(x => x.evidence.stableSides === 0)) {
    const leftId = rowId(item.left);
    const rightId = rowId(item.right);
    if (consumed.has(leftId) || consumed.has(rightId)) continue;
    // With zero stable sides we have no identity anchor at all. Even a
    // structurally rejected alternative in the same kickoff bucket means the
    // pair is not unique enough to ask an automated third-source confirmer to
    // promote it. Keep it ambiguous until the whole bucket disambiguates.
    const unique = temporalByRow.get(leftId) === 1 &&
      temporalByRow.get(rightId) === 1;
    const key = [leftId, rightId].sort().join("|");
    if (pendingKeys.has(key)) continue;
    pendingKeys.add(key);

    if (unique) {
      pendingIndependentConfirmation.push({
        ...candidateView(item),
        recoveryStatus: "PENDING_INDEPENDENT_CONFIRMATION",
        promotionAuthorized: false,
        requiresIndependentConfirmation: true,
      });
    } else {
      const minuteKey = Math.floor(kickoffMs(item.left) / 60_000);
      const bucketKey = `${slug}|${minuteKey}`;
      if (!ambiguousBucketKeys.has(bucketKey)) {
        ambiguousBucketKeys.add(bucketKey);
        const bucketRows = input.filter(row =>
          Math.abs(kickoffMs(row) - kickoffMs(item.left)) <= KICKOFF_TOLERANCE_MS
        );
        ambiguous.push({
          leagueSlug: slug,
          kickoffUtc: item.left.kickoffUtc || item.right.kickoffUtc || null,
          recoveryStatus: "AMBIGUOUS_KICKOFF_BUCKET",
          promotionAuthorized: false,
          rowIds: bucketRows.map(rowId).sort(),
          providers: [...new Set(bucketRows.map(sourceFamily))].sort(),
        });
      }
    }
  }

  return {
    schema: "ai-matchlab.identity-extension-recovery.v1",
    leagueSlug: slug,
    inputRows: input.length,
    temporalCrossProviderPairs: temporalPairs.length,
    autoPromotable,
    pendingIndependentConfirmation,
    ambiguous,
    conflictRejected: anchoredConflicts.map(item => ({
      ...candidateView(item),
      recoveryStatus: "REJECTED_IDENTITY_CONFLICT",
      promotionAuthorized: false,
    })),
    summary: {
      autoPromotable: autoPromotable.length,
      pendingIndependentConfirmation: pendingIndependentConfirmation.length,
      ambiguous: ambiguous.length,
      conflictRejected: anchoredConflicts.length,
      alreadyManagedPairs,
    },
  };
}
