import crypto from "node:crypto";

export const HISTORY_AUTHORITATIVE_RESOLUTION_SCHEMA =
  "ai-matchlab.history-authoritative-resolution.v1";

export const HISTORY_AUTHORITATIVE_RESOLUTION_POLICY_VERSION =
  "history-authoritative-resolution-policy-v1";

export const AUTHORITATIVE_EVIDENCE_MANIFEST_SCHEMA =
  "ai-matchlab.authoritative-evidence-manifest.v1";

const AUTHORITATIVE_SOURCE_TYPES = new Set([
  "official_federation",
  "official_competition",
  "official_club"
]);

const CORROBORATING_SOURCE_TYPES = new Set([
  "direct_scoreboard",
  "independent_results_portal",
  "independent_match_database"
]);

function text(value) {
  return value == null ? "" : String(value).trim();
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stableObject(value[key])])
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableObject(value)))
    .digest("hex");
}

function scoreKey(value = {}) {
  const homeGoals = Number(value.homeGoals);
  const awayGoals = Number(value.awayGoals);
  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return null;
  return `${homeGoals}|${awayGoals}`;
}

function sourceAuthority(item = {}) {
  const sourceType = text(item.sourceType).toLowerCase();
  if (AUTHORITATIVE_SOURCE_TYPES.has(sourceType)) return "authoritative";
  if (CORROBORATING_SOURCE_TYPES.has(sourceType)) return "corroborating";
  return "unsupported";
}

function validateEvidenceItem(item, resolutionType) {
  const required = [
    "evidenceId",
    "publisher",
    "sourceFamily",
    "sourceType",
    "url",
    "retrievedAt",
    "observed"
  ];
  for (const key of required) {
    if (item?.[key] == null || text(item[key]) === "") {
      throw new Error(`authoritative_evidence_missing_${key}`);
    }
  }

  let parsed;
  try {
    parsed = new URL(item.url);
  } catch {
    throw new Error(`authoritative_evidence_invalid_url:${item.evidenceId}`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`authoritative_evidence_unsupported_url:${item.evidenceId}`);
  }

  const authority = sourceAuthority(item);
  if (authority === "unsupported") {
    throw new Error(`authoritative_evidence_unsupported_source_type:${item.sourceType}`);
  }

  if (resolutionType === "score" && !scoreKey(item.observed)) {
    throw new Error(`authoritative_evidence_missing_score:${item.evidenceId}`);
  }
  if (resolutionType === "orientation") {
    if (!text(item.observed?.homeTeam) || !text(item.observed?.awayTeam)) {
      throw new Error(`authoritative_evidence_missing_orientation:${item.evidenceId}`);
    }
  }

  return {
    ...item,
    authority,
    evidenceDigest: digest(item)
  };
}

function factById(reasoning) {
  return new Map((reasoning?.facts || []).map(fact => [fact.factId, fact]));
}

function normalizedTeam(value) {
  const normalized = text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalized
    .split(/\s+/)
    .filter(token => token && !["fc", "fk", "sc", "cf"].includes(token))
    .join("");
}

function observedMatchesCandidate(observed, candidate, resolutionType) {
  if (resolutionType === "score") {
    return scoreKey(observed) === scoreKey(candidate);
  }
  if (resolutionType === "orientation") {
    const homeMatches = normalizedTeam(observed?.homeTeam) ===
      normalizedTeam(candidate?.homeTeam);
    const awayMatches = normalizedTeam(observed?.awayTeam) ===
      normalizedTeam(candidate?.awayTeam);
    const scoreMatches = scoreKey(observed) === scoreKey(candidate);
    return homeMatches && awayMatches && scoreMatches;
  }
  return false;
}

function validateResolutionTargets(resolution, facts) {
  const targetFactIds = Array.isArray(resolution.targetFactIds)
    ? resolution.targetFactIds
    : [];
  if (!targetFactIds.length) {
    throw new Error(`resolution_missing_target_facts:${resolution.resolutionId}`);
  }
  const targetFacts = targetFactIds.map(id => {
    const fact = facts.get(id);
    if (!fact) throw new Error(`resolution_target_fact_not_found:${id}`);
    if (fact.evidenceStatus !== "conflicted") {
      throw new Error(`resolution_target_not_conflicted:${id}`);
    }
    return fact;
  });

  const declaredBlocks = new Set(resolution.blockIds || []);
  const factBlocks = new Set(targetFacts.flatMap(fact => fact?.lineage?.blockIds || []));
  for (const blockId of declaredBlocks) {
    if (!factBlocks.has(blockId)) {
      throw new Error(`resolution_block_not_linked_to_target:${blockId}`);
    }
  }
  return targetFacts;
}

function resolutionSupport(resolution, evidenceItems) {
  const matches = evidenceItems.filter(item =>
    observedMatchesCandidate(item.observed, resolution.candidate, resolution.resolutionType)
  );
  const contradictions = evidenceItems.filter(item => !matches.includes(item));
  const authoritativeMatches = matches.filter(item => item.authority === "authoritative");
  const authoritativeContradictions = contradictions.filter(
    item => item.authority === "authoritative"
  );
  const independentFamilies = new Set(matches.map(item => text(item.sourceFamily)));
  const corroboratingFamilies = new Set(
    matches
      .filter(item => item.authority === "corroborating")
      .map(item => text(item.sourceFamily))
  );

  let supported = false;
  const reasonCodes = [];
  if (authoritativeContradictions.length) {
    reasonCodes.push("authoritative_evidence_contradicts_candidate");
  } else if (authoritativeMatches.length >= 1) {
    supported = true;
    reasonCodes.push("authoritative_source_confirms_candidate");
  } else if (corroboratingFamilies.size >= 2) {
    supported = true;
    reasonCodes.push("two_independent_corroborating_families_confirm_candidate");
  } else {
    reasonCodes.push("candidate_support_below_authoritative_policy_threshold");
  }

  return {
    supported,
    matches,
    contradictions,
    authoritativeMatches,
    authoritativeContradictions,
    independentFamilies: [...independentFamilies].sort(),
    reasonCodes
  };
}

export function validateAuthoritativeEvidenceManifest(manifest = {}) {
  if (manifest.schema !== AUTHORITATIVE_EVIDENCE_MANIFEST_SCHEMA) {
    throw new Error(`unexpected_authoritative_manifest_schema:${manifest.schema}`);
  }
  if (!Array.isArray(manifest.resolutions) || !manifest.resolutions.length) {
    throw new Error("authoritative_manifest_has_no_resolutions");
  }
  const seen = new Set();
  for (const resolution of manifest.resolutions) {
    if (!text(resolution.resolutionId)) {
      throw new Error("resolution_missing_id");
    }
    if (seen.has(resolution.resolutionId)) {
      throw new Error(`duplicate_resolution_id:${resolution.resolutionId}`);
    }
    seen.add(resolution.resolutionId);
    if (!["score", "orientation"].includes(resolution.resolutionType)) {
      throw new Error(`unsupported_resolution_type:${resolution.resolutionType}`);
    }
    if (!Array.isArray(resolution.evidenceItems) || !resolution.evidenceItems.length) {
      throw new Error(`resolution_has_no_evidence:${resolution.resolutionId}`);
    }
  }
  return true;
}

export function buildAuthoritativeResolutionReport({
  reasoning,
  manifest,
  includeResolvedFacts = true
} = {}) {
  if (!reasoning?.ok || !Array.isArray(reasoning?.facts)) {
    throw new Error("full_reasoning_report_required");
  }
  validateAuthoritativeEvidenceManifest(manifest);
  const facts = factById(reasoning);

  const resolutions = manifest.resolutions.map(resolution => {
    const targetFacts = validateResolutionTargets(resolution, facts);
    const evidenceItems = resolution.evidenceItems.map(item =>
      validateEvidenceItem(item, resolution.resolutionType)
    );
    const support = resolutionSupport(resolution, evidenceItems);

    const proposalStatus = support.supported
      ? "authoritatively_supported"
      : "insufficient_authoritative_evidence";

    const proposal = {
      resolutionId: resolution.resolutionId,
      resolutionType: resolution.resolutionType,
      blockIds: [...(resolution.blockIds || [])],
      targetFactIds: [...resolution.targetFactIds],
      proposalStatus,
      candidate: support.supported ? resolution.candidate : null,
      confidenceClass: support.authoritativeMatches.length
        ? "authoritative"
        : support.supported
          ? "multi_source_corroborated"
          : "insufficient",
      automaticApplyAllowed: false,
      explicitResolutionManifestRequiredForWrite: true,
      evidenceItemCount: evidenceItems.length,
      matchingEvidenceCount: support.matches.length,
      contradictoryEvidenceCount: support.contradictions.length,
      authoritativeEvidenceCount: support.authoritativeMatches.length,
      authoritativeContradictionCount: support.authoritativeContradictions.length,
      independentSupportingFamilies: support.independentFamilies,
      evidenceItems,
      evidenceDigest: digest(evidenceItems),
      reasonCodes: [
        ...support.reasonCodes,
        "proposal_is_read_only",
        "truth_write_requires_separate_hash_verified_executor"
      ]
    };

    return {
      ...proposal,
      targetFacts: includeResolvedFacts
        ? targetFacts.map(fact => ({
            factId: fact.factId,
            factKey: fact.factKey,
            identity: fact.identity,
            lineage: fact.lineage,
            claimScores: fact.claimScores,
            proposal: fact.proposal
          }))
        : undefined
    };
  });

  const supported = resolutions.filter(
    row => row.proposalStatus === "authoritatively_supported"
  );
  const unresolved = resolutions.filter(
    row => row.proposalStatus !== "authoritatively_supported"
  );
  const h2hDeferredBlocks = Array.isArray(manifest.deferredBlocks)
    ? manifest.deferredBlocks.filter(row => row.blockType === "h2h_degraded_pair_key")
    : [];

  return {
    ok: true,
    status: unresolved.length || h2hDeferredBlocks.length ? "partial" : "ready",
    schema: HISTORY_AUTHORITATIVE_RESOLUTION_SCHEMA,
    policyVersion: HISTORY_AUTHORITATIVE_RESOLUTION_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    summary: {
      conflictedFactsSeen: reasoning.summary?.conflictedFacts || 0,
      resolutionGroups: resolutions.length,
      authoritativelySupportedResolutions: supported.length,
      unresolvedResolutionGroups: unresolved.length,
      scoreResolutionCandidates: supported.filter(row => row.resolutionType === "score").length,
      orientationResolutionCandidates: supported.filter(
        row => row.resolutionType === "orientation"
      ).length,
      evidenceItems: resolutions.reduce((sum, row) => sum + row.evidenceItemCount, 0),
      authoritativeEvidenceItems: resolutions.reduce(
        (sum, row) => sum + row.authoritativeEvidenceCount,
        0
      ),
      h2hDeferredBlocks: h2hDeferredBlocks.length
    },
    resolutions,
    deferredBlocks: manifest.deferredBlocks || [],
    guarantees: {
      truthWrites: 0,
      truthFilesChanged: 0,
      resolutionsAutomaticallyApplied: 0,
      reliabilityTruthWrites: 0
    }
  };
}
