import crypto from "node:crypto";
import {
  canonicalHistoryTeamName,
  normalizeTeamName
} from "./history-layer.js";

export const HISTORY_EVIDENCE_SCHEMA =
  "ai-matchlab.history-evidence-foundation.v1";

export const HISTORY_EVIDENCE_POLICY_VERSION =
  "history-evidence-policy-v1";

export const EVIDENCE_STATUSES = Object.freeze([
  "verified",
  "supported",
  "inferred",
  "conflicted",
  "missing",
  "stale"
]);

const PROVIDER_ALIASES = new Map([
  ["espn", "espn"],
  ["flashscore", "flashscore"],
  ["flashscore_or_native", "flashscore"],
  ["flashscore-native", "flashscore"],
  ["sofascore", "sofascore"],
  ["sofa", "sofascore"],
  ["api_football", "api_football"],
  ["api-football", "api_football"],
  ["source2", "api_football"],
  ["canonical", "canonical_native"],
  ["native", "canonical_native"],
  ["history", "history_unknown"]
]);

const PROVIDER_PRIORS = Object.freeze({
  espn: 0.82,
  flashscore: 0.82,
  sofascore: 0.78,
  api_football: 0.74,
  canonical_native: 0.72,
  history_unknown: 0.60,
  unknown: 0.50
});

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function stableString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function safeNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function kickoffMs(row) {
  const numeric = safeNum(row?.kickoff_ms, null);
  if (numeric != null) return numeric;
  const raw = row?.kickoff || row?.kickoffUtc || null;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function kickoffMinuteToken(row) {
  const ms = kickoffMs(row);
  if (ms == null) return "unknown";
  return String(Math.floor(ms / 60000));
}

function canonicalTeamKey(name, canonicalizeTeam = canonicalHistoryTeamName) {
  const canonical = canonicalizeTeam(name) || stableString(name);
  const primary = normalizeTeamName(canonical).replace(/\s+/g, "");
  if (primary) return primary;

  // The existing history normalizer intentionally strips football affixes such
  // as "club" and "athletic". A legitimate name made entirely from those words
  // (for example Athletic Club) would otherwise collapse to an empty identity.
  // Evidence identity must fail closed on ambiguity, but it must never discard a
  // fully named source claim merely because every token is in the affix list.
  return stableString(canonical)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function canonicalProvider(value) {
  const key = stableString(value).toLowerCase();
  if (!key) return "unknown";
  return PROVIDER_ALIASES.get(key) || key.replace(/[^a-z0-9_]+/g, "_");
}

export function providerPrior(provider) {
  return PROVIDER_PRIORS[canonicalProvider(provider)] ?? PROVIDER_PRIORS.unknown;
}

export function buildHistoryFactIdentity(row, options = {}) {
  const canonicalizeTeam =
    typeof options.canonicalizeTeam === "function"
      ? options.canonicalizeTeam
      : canonicalHistoryTeamName;

  const leagueSlug = stableString(row?.leagueSlug || options.leagueSlug).toLowerCase();
  const operationalDay = stableString(
    row?.operationalDay || row?.dayKey || options.operationalDay
  );
  const homeKey = canonicalTeamKey(row?.homeTeam, canonicalizeTeam);
  const awayKey = canonicalTeamKey(row?.awayTeam, canonicalizeTeam);
  const kickoffMinute = kickoffMinuteToken(row);

  if (!leagueSlug || !operationalDay || !homeKey || !awayKey) {
    return {
      ok: false,
      factId: null,
      factKey: null,
      reasonCode: "incomplete_match_identity"
    };
  }

  const factKey = [
    "match_result",
    leagueSlug,
    homeKey,
    awayKey,
    operationalDay,
    kickoffMinute
  ].join("|");

  return {
    ok: true,
    factId: `hfact_${sha256(factKey).slice(0, 24)}`,
    factKey,
    leagueSlug,
    operationalDay,
    kickoffMinute,
    homeKey,
    awayKey,
    canonicalHomeTeam: canonicalizeTeam(row?.homeTeam) || stableString(row?.homeTeam),
    canonicalAwayTeam: canonicalizeTeam(row?.awayTeam) || stableString(row?.awayTeam)
  };
}

function scoreKey(row) {
  const home = safeNum(row?.scoreHome, null);
  const away = safeNum(row?.scoreAway, null);
  if (home == null || away == null) return null;
  return `${home}|${away}`;
}

function finalStatus(value) {
  const status = stableString(value).toUpperCase();
  return (
    status === "FT" ||
    status.includes("FINAL") ||
    status.includes("FULL_TIME") ||
    status.includes("COMPLETE") ||
    status.includes("AET") ||
    status.includes("PEN")
  );
}

export function buildHistoryClaim({
  factId,
  row,
  role = "current_history_claim",
  provider = null,
  leagueSlug = null,
  declaredDay = null,
  operationalDay = null,
  sourceReliability = {}
} = {}) {
  const resolvedProvider = canonicalProvider(
    provider || row?.sourceFamily || row?.source || "unknown"
  );
  const sourceId = stableString(row?.id || row?.matchId || row?.sourceId);
  const resolvedDeclaredDay = stableString(
    declaredDay || row?.declaredDay || row?.dayKey
  );
  const resolvedOperationalDay = stableString(
    operationalDay || row?.operationalDay || row?.dayKey
  );
  const claimScore = scoreKey(row);
  const reliability = sourceReliability?.[resolvedProvider] || null;
  const learnedTotal = safeNum(reliability?.total, 0);
  const learnedAgreements = safeNum(reliability?.agreements, 0);
  const learnedAgreementRate =
    learnedTotal > 0 ? learnedAgreements / learnedTotal : null;

  const signature = [
    factId,
    role,
    resolvedProvider,
    sourceId,
    resolvedDeclaredDay,
    resolvedOperationalDay,
    row?.kickoff || row?.kickoffUtc || "",
    claimScore || "missing-score"
  ].join("|");

  return {
    claimId: `hclaim_${sha256(signature).slice(0, 24)}`,
    factId,
    role,
    provider: resolvedProvider,
    sourceId: sourceId || null,
    evidenceClass: finalStatus(row?.status)
      ? "direct_structured_final"
      : "direct_structured_result",
    observed: {
      leagueSlug: stableString(row?.leagueSlug || leagueSlug) || null,
      declaredDay: resolvedDeclaredDay || null,
      operationalDay: resolvedOperationalDay || null,
      kickoff: row?.kickoff || row?.kickoffUtc || null,
      homeTeam: stableString(row?.homeTeam) || null,
      awayTeam: stableString(row?.awayTeam) || null,
      scoreHome: safeNum(row?.scoreHome, null),
      scoreAway: safeNum(row?.scoreAway, null),
      status: row?.status || null
    },
    fieldClaims: {
      score: claimScore,
      finalStatus: finalStatus(row?.status)
    },
    providerDiagnostics: {
      initialPrior: providerPrior(resolvedProvider),
      learnedAgreementRate:
        learnedAgreementRate == null ? null : round3(learnedAgreementRate),
      learnedSampleSize: learnedTotal,
      decisionWeightApplied: false,
      reasonCode: "provider_reliability_is_diagnostic_only_in_v1"
    }
  };
}

function providerSet(claims) {
  return new Set((claims || []).map(x => x?.provider).filter(Boolean));
}

function completeScoreClaims(claims) {
  return (claims || []).filter(x => x?.fieldClaims?.score != null);
}

export function resolveHistoryFactEvidence({
  claims = [],
  blockedReasonCodes = []
} = {}) {
  const directClaims = completeScoreClaims(claims);
  const scoreGroups = new Map();

  for (const claim of directClaims) {
    const key = claim.fieldClaims.score;
    if (!scoreGroups.has(key)) scoreGroups.set(key, []);
    scoreGroups.get(key).push(claim);
  }

  const allProviders = providerSet(directClaims);
  const scoreGroupEntries = [...scoreGroups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const scoreConflict = scoreGroupEntries.length > 1;
  const explicitBlock = blockedReasonCodes.length > 0;

  if (!directClaims.length) {
    return {
      evidenceStatus: "missing",
      confidence: 0,
      selectedScore: null,
      reasonCodes: ["no_complete_direct_score_claim"],
      metrics: {
        directClaimCount: 0,
        independentProviderCount: 0,
        scoreAlternativeCount: 0,
        scoreAgreementRatio: 0
      }
    };
  }

  if (scoreConflict || explicitBlock) {
    return {
      evidenceStatus: "conflicted",
      confidence: 0,
      selectedScore: null,
      alternatives: scoreGroupEntries.map(([score, rows]) => ({
        score,
        providers: [...providerSet(rows)].sort(),
        claimIds: rows.map(x => x.claimId).sort()
      })),
      reasonCodes: Array.from(
        new Set([
          ...(scoreConflict ? ["direct_score_claims_disagree"] : []),
          ...blockedReasonCodes
        ])
      ).sort(),
      metrics: {
        directClaimCount: directClaims.length,
        independentProviderCount: allProviders.size,
        scoreAlternativeCount: scoreGroupEntries.length,
        scoreAgreementRatio: round3(
          Math.max(...scoreGroupEntries.map(([, rows]) => rows.length)) /
            directClaims.length
        )
      }
    };
  }

  const [selectedScore, agreeingClaims] = scoreGroupEntries[0];
  const independentProviderCount = providerSet(agreeingClaims).size;
  const isVerified = independentProviderCount >= 2;
  const meanPrior =
    agreeingClaims.reduce((sum, claim) => {
      return sum + providerPrior(claim.provider);
    }, 0) / agreeingClaims.length;

  const confidence = isVerified
    ? clamp01(0.90 + Math.min(0.08, (independentProviderCount - 2) * 0.025))
    : clamp01(0.62 + meanPrior * 0.10);

  return {
    evidenceStatus: isVerified ? "verified" : "supported",
    confidence: round3(confidence),
    selectedScore: {
      home: Number(selectedScore.split("|")[0]),
      away: Number(selectedScore.split("|")[1])
    },
    reasonCodes: [
      isVerified
        ? "independent_direct_sources_agree"
        : "single_independent_direct_source"
    ],
    metrics: {
      directClaimCount: directClaims.length,
      independentProviderCount,
      scoreAlternativeCount: 1,
      scoreAgreementRatio: 1
    }
  };
}

function flattenHistory(historyPayload) {
  const out = [];
  const days = Array.isArray(historyPayload?.days) ? historyPayload.days : [];

  for (const day of days) {
    const containerDay = stableString(day?.dayKey);
    const rows = Array.isArray(day?.rows) ? day.rows : [];
    for (const row of rows) {
      out.push({
        ...row,
        __containerDay: containerDay,
        dayKey: row?.dayKey || containerDay
      });
    }
  }

  return out;
}

function rowLookupKey(id, dayKey) {
  return `${stableString(id)}|${stableString(dayKey)}`;
}

function sortedObjectCounts(values) {
  const counts = {};
  for (const value of values) {
    const key = stableString(value) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))
  );
}

function blockLeagueSlug(block) {
  const pair = stableString(block?.pair);
  return pair ? pair.split("|")[0] : null;
}

function addUnique(target, values) {
  for (const value of values || []) {
    if (value != null && !target.includes(value)) target.push(value);
  }
}

export function buildHistoryEvidenceFoundation({
  historyPayload,
  repairPlan,
  sourceReliability = {},
  generatedAt = new Date().toISOString(),
  includeFacts = true,
  maxExamples = 20,
  canonicalizeTeam = canonicalHistoryTeamName
} = {}) {
  const historyRows = flattenHistory(historyPayload);
  const factMap = new Map();
  const currentRowMap = new Map();
  const invalidRows = [];

  const ensureFact = (identity, row) => {
    if (!factMap.has(identity.factId)) {
      factMap.set(identity.factId, {
        factId: identity.factId,
        factKey: identity.factKey,
        factType: "match_result",
        identity: {
          leagueSlug: identity.leagueSlug,
          operationalDay: identity.operationalDay,
          kickoffMinute: identity.kickoffMinute,
          canonicalHomeTeam: identity.canonicalHomeTeam,
          canonicalAwayTeam: identity.canonicalAwayTeam,
          homeKey: identity.homeKey,
          awayKey: identity.awayKey
        },
        claims: [],
        lineage: {
          currentHistoryRowIds: [],
          preservedSourceIds: [],
          repairActionIds: [],
          dayNormalizationActionIds: [],
          blockIds: []
        },
        blockedReasonCodes: [],
        sourceRows: []
      });
    }

    const fact = factMap.get(identity.factId);
    if (row) fact.sourceRows.push(row);
    return fact;
  };

  for (const row of historyRows) {
    const identity = buildHistoryFactIdentity(row, { canonicalizeTeam });
    if (!identity.ok) {
      invalidRows.push({
        id: row?.id || null,
        dayKey: row?.dayKey || row?.__containerDay || null,
        reasonCode: identity.reasonCode
      });
      continue;
    }

    const fact = ensureFact(identity, row);
    const claim = buildHistoryClaim({
      factId: fact.factId,
      row,
      role: "current_history_claim",
      sourceReliability
    });

    fact.claims.push(claim);
    addUnique(fact.lineage.currentHistoryRowIds, [claim.sourceId]);
    addUnique(fact.lineage.preservedSourceIds, [claim.sourceId]);
    currentRowMap.set(rowLookupKey(row?.id, row?.dayKey || row?.__containerDay), {
      row,
      fact
    });
  }

  const dedupActions = Array.isArray(repairPlan?.actions?.currentHistoryDedup)
    ? repairPlan.actions.currentHistoryDedup
    : [];
  const dayActions = Array.isArray(
    repairPlan?.actions?.currentHistoryDayNormalization
  )
    ? repairPlan.actions.currentHistoryDayNormalization
    : [];

  let recoveredDuplicateClaims = 0;
  const unmatchedPlanActions = [];

  for (const action of dedupActions) {
    const retain = action?.retainRow || {};
    const retainDay =
      action?.normalizeRetainedDay?.to ||
      retain?.operationalDay ||
      retain?.declaredDay;
    const lookup = currentRowMap.get(rowLookupKey(retain?.id, retainDay));

    if (!lookup) {
      unmatchedPlanActions.push({
        actionId: action?.actionId || null,
        reasonCode: "retained_history_row_not_found"
      });
      continue;
    }

    const fact = lookup.fact;
    addUnique(fact.lineage.repairActionIds, [action?.actionId]);

    for (const removed of action?.removeRows || []) {
      const synthetic = {
        ...removed,
        leagueSlug: action?.pair?.split("|")?.[0] || lookup.row?.leagueSlug,
        dayKey: removed?.operationalDay || removed?.declaredDay,
        status: "STATUS_FULL_TIME"
      };
      const claim = buildHistoryClaim({
        factId: fact.factId,
        row: synthetic,
        role: "corroborating_removed_duplicate",
        provider: removed?.sourceFamily,
        leagueSlug: synthetic.leagueSlug,
        declaredDay: removed?.declaredDay,
        operationalDay: removed?.operationalDay,
        sourceReliability
      });
      fact.claims.push(claim);
      addUnique(fact.lineage.preservedSourceIds, [claim.sourceId]);
      recoveredDuplicateClaims += 1;
    }
  }

  for (const action of dayActions) {
    const row = action?.row || {};
    const lookup = currentRowMap.get(rowLookupKey(row?.id, action?.toDay));
    if (!lookup) {
      unmatchedPlanActions.push({
        actionId: action?.actionId || null,
        reasonCode: "normalized_history_row_not_found"
      });
      continue;
    }
    addUnique(lookup.fact.lineage.dayNormalizationActionIds, [action?.actionId]);
  }

  const scoreBlocks = Array.isArray(repairPlan?.blocked?.scoreConflicts)
    ? repairPlan.blocked.scoreConflicts
    : [];
  const orientationBlocks = Array.isArray(
    repairPlan?.blocked?.orientationConflicts
  )
    ? repairPlan.blocked.orientationConflicts
    : [];
  const h2hBlocks = Array.isArray(repairPlan?.blocked?.h2hDegradedKeys)
    ? repairPlan.blocked.h2hDegradedKeys
    : [];

  const factBlocks = [];

  for (const block of scoreBlocks) {
    const linked = new Set();
    for (const alternative of block?.alternatives || []) {
      for (const row of alternative?.rows || []) {
        const lookup = currentRowMap.get(
          rowLookupKey(row?.id, row?.operationalDay || row?.declaredDay)
        );
        if (lookup) linked.add(lookup.fact.factId);
      }
    }

    for (const factId of linked) {
      const fact = factMap.get(factId);
      addUnique(fact.lineage.blockIds, [block?.blockId]);
      addUnique(fact.blockedReasonCodes, [
        "blocked_authoritative_score_resolution_required"
      ]);
    }

    factBlocks.push({
      blockId: block?.blockId || null,
      blockType: block?.blockType || "current_history_score_conflict",
      status: block?.status || "blocked",
      linkedFactIds: [...linked].sort(),
      automaticResolutionAllowed: false,
      requiredEvidence: block?.requiredEvidence || []
    });
  }

  for (const block of orientationBlocks) {
    const linked = new Set();
    const leagueSlug = blockLeagueSlug(block);

    for (const row of block?.rows || []) {
      const lookup = currentRowMap.get(
        rowLookupKey(row?.id, row?.operationalDay || row?.declaredDay)
      );
      if (lookup) {
        linked.add(lookup.fact.factId);
        addUnique(lookup.fact.lineage.blockIds, [block?.blockId]);
        addUnique(lookup.fact.blockedReasonCodes, [
          "blocked_fixture_orientation_resolution_required"
        ]);
      } else {
        const identity = buildHistoryFactIdentity(
          { ...row, leagueSlug, dayKey: row?.operationalDay },
          { canonicalizeTeam }
        );
        if (identity.ok) linked.add(identity.factId);
      }
    }

    factBlocks.push({
      blockId: block?.blockId || null,
      blockType: block?.blockType || "current_history_flipped_orientation",
      status: block?.status || "blocked",
      linkedFactIds: [...linked].sort(),
      automaticResolutionAllowed: false,
      requiredEvidence: ["fixture_identity_resolution"]
    });
  }

  for (const block of h2hBlocks) {
    factBlocks.push({
      blockId: block?.blockId || null,
      blockType: block?.blockType || "h2h_degraded_pair_key",
      status: block?.status || "blocked",
      linkedFactIds: [],
      automaticResolutionAllowed: false,
      requiredEvidence: ["team_key_policy_fix"],
      meta: {
        actual: block?.actual || null,
        expected: block?.expected || null,
        teamA: block?.teamA || null,
        teamB: block?.teamB || null
      }
    });
  }

  const facts = [...factMap.values()].map(fact => {
    const resolution = resolveHistoryFactEvidence({
      claims: fact.claims,
      blockedReasonCodes: fact.blockedReasonCodes
    });

    return {
      factId: fact.factId,
      factKey: fact.factKey,
      factType: fact.factType,
      identity: fact.identity,
      resolution,
      claims: fact.claims.sort((a, b) => a.claimId.localeCompare(b.claimId)),
      lineage: {
        currentHistoryRowIds: fact.lineage.currentHistoryRowIds.sort(),
        preservedSourceIds: fact.lineage.preservedSourceIds.sort(),
        repairActionIds: fact.lineage.repairActionIds.sort(),
        dayNormalizationActionIds:
          fact.lineage.dayNormalizationActionIds.sort(),
        blockIds: fact.lineage.blockIds.sort()
      }
    };
  });

  facts.sort((a, b) => a.factKey.localeCompare(b.factKey));

  const claims = facts.flatMap(fact => fact.claims);
  const statusCounts = sortedObjectCounts(
    facts.map(fact => fact.resolution.evidenceStatus)
  );
  const providerCounts = sortedObjectCounts(claims.map(claim => claim.provider));
  const multiSourceFacts = facts.filter(
    fact => fact.resolution.metrics.independentProviderCount >= 2
  ).length;
  const conflictedFacts = facts.filter(
    fact => fact.resolution.evidenceStatus === "conflicted"
  );
  const verifiedFacts = facts.filter(
    fact => fact.resolution.evidenceStatus === "verified"
  );
  const supportedFacts = facts.filter(
    fact => fact.resolution.evidenceStatus === "supported"
  );
  const preservedSourceIds = claims.filter(claim => claim.sourceId != null).length;
  const expectedLineageClaims = historyRows.length + dedupActions.reduce(
    (sum, action) => sum + (Array.isArray(action?.removeRows) ? action.removeRows.length : 0),
    0
  );

  const report = {
    ok: invalidRows.length === 0 && unmatchedPlanActions.length === 0,
    status: conflictedFacts.length ? "partial" : "available",
    schema: HISTORY_EVIDENCE_SCHEMA,
    policyVersion: HISTORY_EVIDENCE_POLICY_VERSION,
    generatedAt,
    sourceContract: {
      historyReadOnly: true,
      repairPlanReadOnly: true,
      sourceReliabilityReadOnly: true,
      additiveArtifactOnly: true,
      automaticTruthSelectionOnConflict: false,
      truthWrites: 0,
      truthFilesChanged: 0
    },
    evidenceContract: {
      statuses: EVIDENCE_STATUSES,
      verified: "two_or_more_independent_direct_sources_agree",
      supported: "one_independent_direct_source_or_same_provider_repetition",
      inferred: "reserved_for_future_derived_claims",
      conflicted: "direct_claims_disagree_or_explicit_block_exists",
      missing: "no_complete_direct_claim",
      stale: "reserved_for_time_sensitive_non_final_claims",
      providerReliabilityUsage:
        "diagnostic_only_not_used_to_auto_resolve_truth_in_v1"
    },
    summary: {
      currentHistoryRows: historyRows.length,
      facts: facts.length,
      claims: claims.length,
      recoveredDuplicateClaims,
      expectedLineageClaims,
      lineageCoverage:
        expectedLineageClaims > 0
          ? round3(claims.length / expectedLineageClaims)
          : 1,
      preservedSourceIds,
      multiSourceFacts,
      singleSourceFacts: facts.length - multiSourceFacts,
      unresolvedBlocks: factBlocks.length,
      invalidHistoryRows: invalidRows.length,
      unmatchedPlanActions: unmatchedPlanActions.length,
      byEvidenceStatus: statusCounts,
      byProvider: providerCounts
    },
    blocks: factBlocks.sort((a, b) =>
      stableString(a.blockId).localeCompare(stableString(b.blockId))
    ),
    diagnostics: {
      invalidHistoryRows: invalidRows.slice(0, maxExamples),
      unmatchedPlanActions: unmatchedPlanActions.slice(0, maxExamples),
      verifiedExamples: verifiedFacts.slice(0, maxExamples).map(x => ({
        factId: x.factId,
        factKey: x.factKey,
        providers: [...providerSet(x.claims)].sort(),
        score: x.resolution.selectedScore
      })),
      supportedExamples: supportedFacts.slice(0, maxExamples).map(x => ({
        factId: x.factId,
        factKey: x.factKey,
        providers: [...providerSet(x.claims)].sort(),
        score: x.resolution.selectedScore
      })),
      conflictedExamples: conflictedFacts.slice(0, maxExamples).map(x => ({
        factId: x.factId,
        factKey: x.factKey,
        blockIds: x.lineage.blockIds,
        alternatives: x.resolution.alternatives || [],
        reasonCodes: x.resolution.reasonCodes
      }))
    },
    guarantees: {
      truthWrites: 0,
      truthFilesChanged: 0,
      removedProviderClaimsPreserved: recoveredDuplicateClaims,
      blockedFactsAutoResolved: 0
    }
  };

  if (includeFacts) report.facts = facts;
  return report;
}
