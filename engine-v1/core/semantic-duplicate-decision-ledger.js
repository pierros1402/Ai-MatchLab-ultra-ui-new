import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const LEDGER_SCHEMA =
  "ai-matchlab.semantic-duplicate-decision-ledger.v1";

export const EXPECTED_SOURCE_COMMIT =
  "0f5992846e51e95b253ae70b13001950c3bee9d9";

export const EXPECTED_COUNTS = Object.freeze({
  decisions: 53,
  ledgerTeamIdentities: 70,
  sourceFixtureIds: 106,
  reviewCandidates: 1,
  scoreConflicts: 6,
  terminalStatusConflicts: 5,
  truthConflictUnion: 7,
});

function clean(value) {
  return String(value ?? "").trim();
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function sha256Canonical(value) {
  return crypto
    .createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

export function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

export function loadSemanticDuplicateDecisionLedger(filePath) {
  const resolved = path.resolve(clean(filePath));
  if (!resolved || !fs.existsSync(resolved)) {
    throw new Error(`semantic_duplicate_ledger_missing:${resolved}`);
  }

  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function issue(code, message, details = {}) {
  return {
    code,
    severity: "error",
    message,
    details,
  };
}

function verifyTeamIdentityHash(team) {
  const copy = { ...team };
  delete copy.identityHash;
  return sha256Canonical(copy) === team.identityHash;
}

function verifyDecisionHash(decision) {
  const copy = { ...decision };
  delete copy.immutableDecisionHash;
  return sha256Canonical(copy) === decision.immutableDecisionHash;
}

function evidenceIndex(decision) {
  return new Map(
    (decision.externalEvidence || []).map(item => [item.evidenceId, item]),
  );
}

function referencedEvidence(decision, refs = []) {
  const index = evidenceIndex(decision);
  return refs.map(ref => index.get(ref)).filter(Boolean);
}

function hasPrimaryEvidence(decision, refs = []) {
  return referencedEvidence(decision, refs).some(item =>
    item?.sourceClass === "PRIMARY_COMPETITION" ||
    item?.sourceClass === "PRIMARY_CLUB"
  );
}

function hasTwoIndependentDirectEvidence(decision, refs = []) {
  const publishers = new Set(
    referencedEvidence(decision, refs)
      .filter(item =>
        item?.sourceClass === "SECONDARY_DIRECT_SCOREBOARD" ||
        item?.sourceClass === "SECONDARY_DIRECT_MATCH_REPORT"
      )
      .map(item => clean(item.publisher).toLowerCase())
      .filter(Boolean),
  );
  return publishers.size >= 2;
}

function evidenceSupports(item, token) {
  return (item?.supports || []).includes(token);
}

function truthEvidenceSupportsResolution(decision) {
  const truth = decision?.truthDecision || {};
  const items = referencedEvidence(decision, truth.evidenceRefs || []);
  const fixtureBound = items.filter(item => evidenceSupports(item, "FIXTURE_IDENTITY"));

  if (truth.status === "RESOLVED_FINAL") {
    const scoreToken = `SCORE_${truth.scoreHome}_${truth.scoreAway}`;
    return fixtureBound.filter(item =>
      evidenceSupports(item, "FINAL_STATUS") && evidenceSupports(item, scoreToken)
    );
  }

  if (truth.status === "RESOLVED_NON_PLAYED") {
    const statusToken = `${clean(truth.nonPlayedStatus).toUpperCase()}_STATUS`;
    return fixtureBound.filter(item =>
      evidenceSupports(item, statusToken) && evidenceSupports(item, "NULL_SCORE")
    );
  }

  return [];
}

export function validateSemanticDuplicateDecisionLedger(ledger) {
  const issues = [];

  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) {
    return {
      ok: false,
      issueCount: 1,
      issues: [issue("LEDGER_NOT_OBJECT", "Ledger must be an object.")],
    };
  }

  if (ledger.schema !== LEDGER_SCHEMA) {
    issues.push(issue(
      "LEDGER_SCHEMA_MISMATCH",
      `Expected ${LEDGER_SCHEMA}.`,
      { observed: ledger.schema },
    ));
  }

  if (ledger?.sourceBinding?.p0bCommit !== EXPECTED_SOURCE_COMMIT) {
    issues.push(issue(
      "SOURCE_COMMIT_MISMATCH",
      "Ledger is not bound to the validated P0-B commit.",
      { observed: ledger?.sourceBinding?.p0bCommit },
    ));
  }

  if (
    ledger?.policy?.repositoryApplicationAuthorized !== false ||
    ledger?.policy?.mutationAllowed !== false ||
    ledger?.policy?.providerPreferenceMaySelectTruth !== false
  ) {
    issues.push(issue(
      "FAIL_CLOSED_POLICY_VIOLATION",
      "P0-C foundation must forbid repository application, mutation and provider-only truth selection.",
    ));
  }

  if (
    ledger?.policy?.providerTeamIdCoverage !==
    "NOT_AVAILABLE_IN_SOURCE_EVIDENCE_BUNDLE"
  ) {
    issues.push(issue(
      "PROVIDER_TEAM_ID_COVERAGE_FALSE_CLAIM",
      "The source bundle does not expose provider team IDs and the ledger must say so.",
    ));
  }

  const teamIdentities = Array.isArray(ledger.teamIdentities)
    ? ledger.teamIdentities
    : [];
  const decisions = Array.isArray(ledger.decisions)
    ? ledger.decisions
    : [];

  const teamKeys = new Set();
  const aliasOwner = new Map();
  const usedTeamKeys = new Set();

  if (teamIdentities.length !== EXPECTED_COUNTS.ledgerTeamIdentities) {
    issues.push(issue(
      "TEAM_IDENTITY_COUNT_MISMATCH",
      "Ledger must contain exactly 70 ledger-scoped team identities.",
      { observed: teamIdentities.length },
    ));
  }

  for (const team of teamIdentities) {
    const key = clean(team?.ledgerTeamIdentityKey);
    if (!key) {
      issues.push(issue("TEAM_IDENTITY_KEY_MISSING", "Team identity key is missing."));
      continue;
    }
    if (teamKeys.has(key)) {
      issues.push(issue("TEAM_IDENTITY_KEY_DUPLICATE", "Duplicate team identity key.", { key }));
    }
    teamKeys.add(key);

    if (team.productionGlobalClubId !== null) {
      issues.push(issue(
        "PRODUCTION_GLOBAL_CLUB_ID_PREMATURE",
        "P0-C foundation cannot bind production globalClubId from this source bundle.",
        { key },
      ));
    }

    if (
      team.productionBindingStatus !==
        "UNBOUND_SOURCE_BUNDLE_HAS_NO_PROVIDER_TEAM_IDS" ||
      team.scope !== "P0C_SEMANTIC_DUPLICATE_ALIAS_GRAPH"
    ) {
      issues.push(issue(
        "TEAM_IDENTITY_FOUNDATION_SCOPE_INVALID",
        "Team identity must remain ledger-scoped and production-unbound in P0-C foundation.",
        { key },
      ));
    }

    if (!(team.aliases || []).includes(team.preferredDisplayName)) {
      issues.push(issue(
        "PREFERRED_TEAM_NAME_NOT_IN_ALIASES",
        "Preferred display name must be part of the immutable alias set.",
        { key, preferredDisplayName: team.preferredDisplayName },
      ));
    }

    if (!verifyTeamIdentityHash(team)) {
      issues.push(issue("TEAM_IDENTITY_HASH_MISMATCH", "Team identity hash mismatch.", { key }));
    }

    for (const alias of team.aliases || []) {
      const normalized = clean(alias).toLowerCase();
      if (!normalized) continue;
      const prior = aliasOwner.get(normalized);
      if (prior && prior !== key) {
        issues.push(issue(
          "TEAM_ALIAS_MULTI_OWNER",
          "One exact alias is assigned to multiple ledger team identities.",
          { alias, prior, current: key },
        ));
      } else {
        aliasOwner.set(normalized, key);
      }
    }
  }

  if (decisions.length !== EXPECTED_COUNTS.decisions) {
    issues.push(issue(
      "DECISION_COUNT_MISMATCH",
      "Ledger must contain exactly 53 decision records.",
      { observed: decisions.length },
    ));
  }

  const decisionIds = new Set();
  const fixtureKeys = new Set();
  const fixtureIds = new Set();
  const ordinals = new Set();
  let reviewCandidates = 0;
  let scoreConflicts = 0;
  let terminalConflicts = 0;
  let truthConflictUnion = 0;

  for (const decision of decisions) {
    const id = clean(decision?.decisionId);
    if (!id || decisionIds.has(id)) {
      issues.push(issue("DECISION_ID_INVALID", "Decision ID missing or duplicated.", { id }));
    }
    decisionIds.add(id);

    const ordinal = Number(decision?.clusterOrdinal);
    if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 53 || ordinals.has(ordinal)) {
      issues.push(issue("CLUSTER_ORDINAL_INVALID", "Cluster ordinal missing, out of range or duplicated.", { ordinal }));
    }
    ordinals.add(ordinal);

    const fixtureKey = clean(decision?.canonicalFixtureIdentityKey);
    if (!fixtureKey || fixtureKeys.has(fixtureKey)) {
      issues.push(issue("CANONICAL_FIXTURE_KEY_INVALID", "Canonical fixture identity key missing or duplicated.", { fixtureKey }));
    }
    fixtureKeys.add(fixtureKey);

    if (!teamKeys.has(decision.homeTeamIdentityKey) || !teamKeys.has(decision.awayTeamIdentityKey)) {
      issues.push(issue(
        "DECISION_TEAM_IDENTITY_UNKNOWN",
        "Decision references an unknown ledger team identity.",
        { decisionId: id },
      ));
    }
    usedTeamKeys.add(decision.homeTeamIdentityKey);
    usedTeamKeys.add(decision.awayTeamIdentityKey);

    if (decision.homeTeamIdentityKey === decision.awayTeamIdentityKey) {
      issues.push(issue(
        "HOME_AWAY_TEAM_IDENTITY_COLLISION",
        "Home and away participants cannot resolve to the same ledger team identity.",
        { decisionId: id, teamIdentityKey: decision.homeTeamIdentityKey },
      ));
    }

    const sourceFixtures = Array.isArray(decision.sourceFixtures)
      ? decision.sourceFixtures
      : [];
    if (sourceFixtures.length !== 2) {
      issues.push(issue("SOURCE_FIXTURE_PAIR_INVALID", "Each decision must contain exactly two source fixtures.", { decisionId: id }));
    }

    const claimLabels = new Set();
    for (const sourceFixture of sourceFixtures) {
      const sourceId = clean(sourceFixture?.repositoryFixtureId);
      if (!sourceId || fixtureIds.has(sourceId)) {
        issues.push(issue(
          "SOURCE_FIXTURE_ID_INVALID",
          "Source fixture ID missing or reused across decisions.",
          { decisionId: id, sourceId },
        ));
      }
      fixtureIds.add(sourceId);
      claimLabels.add(sourceFixture?.claimLabel);

      if (
        sourceFixture?.providerHomeTeamId !== null ||
        sourceFixture?.providerAwayTeamId !== null ||
        sourceFixture?.providerTeamIdAvailability !==
          "NOT_AVAILABLE_IN_SOURCE_EVIDENCE_BUNDLE"
      ) {
        issues.push(issue(
          "PROVIDER_TEAM_ID_FALSE_BINDING",
          "Provider team IDs cannot be claimed from the P0-C source bundle.",
          { decisionId: id, sourceId },
        ));
      }

      if (
        sourceFixture?.homeTeamIdentityKey !== decision.homeTeamIdentityKey ||
        sourceFixture?.awayTeamIdentityKey !== decision.awayTeamIdentityKey
      ) {
        issues.push(issue(
          "SOURCE_FIXTURE_TEAM_BINDING_MISMATCH",
          "Source fixture does not bind to the decision's ordered ledger team identities.",
          { decisionId: id, sourceId },
        ));
      }
    }
    if (!claimLabels.has("A") || !claimLabels.has("B") || claimLabels.size !== 2) {
      issues.push(issue("SOURCE_CLAIM_LABELS_INVALID", "Source claims must be exactly A and B.", { decisionId: id }));
    }

    if (decision?.identityDecision?.status !== "CONFIRMED_SEMANTIC_DUPLICATE") {
      issues.push(issue("IDENTITY_DECISION_NOT_CONFIRMED", "Every P0-C record must classify the semantic duplicate.", { decisionId: id }));
    }

    const externalItems = Array.isArray(decision.externalEvidence)
      ? decision.externalEvidence
      : [];
    const external = evidenceIndex(decision);
    const evidenceIds = new Set();
    for (const item of externalItems) {
      const evidenceId = clean(item?.evidenceId);
      if (!evidenceId || evidenceIds.has(evidenceId)) {
        issues.push(issue(
          "EXTERNAL_EVIDENCE_ID_INVALID",
          "External evidence ID is missing or duplicated within a decision.",
          { decisionId: id, evidenceId },
        ));
      }
      evidenceIds.add(evidenceId);
    }

    const refs = [
      ...(decision?.identityDecision?.evidenceRefs || []),
      ...(decision?.truthDecision?.evidenceRefs || []),
    ];
    for (const ref of refs) {
      if (!external.has(ref)) {
        issues.push(issue(
          "EVIDENCE_REFERENCE_MISSING",
          "Decision references external evidence that is not embedded in the record.",
          { decisionId: id, evidenceRef: ref },
        ));
      }
    }

    for (const evidenceId of evidenceIds) {
      if (!refs.includes(evidenceId)) {
        issues.push(issue(
          "UNREFERENCED_EXTERNAL_EVIDENCE",
          "Embedded external evidence must be referenced by identity or truth decision.",
          { decisionId: id, evidenceId },
        ));
      }
    }

    if (decision.sourceAuditClassification === "POSSIBLE_DUPLICATE_REQUIRES_REVIEW") {
      reviewCandidates++;
      const identityRefs = decision?.identityDecision?.evidenceRefs || [];
      const identityEvidence = referencedEvidence(decision, identityRefs);
      if (
        !hasPrimaryEvidence(decision, identityRefs) ||
        !identityEvidence.some(item => evidenceSupports(item, "FIXTURE_IDENTITY"))
      ) {
        issues.push(issue(
          "REVIEW_CANDIDATE_PRIMARY_EVIDENCE_MISSING",
          "The single review candidate requires referenced primary evidence supporting fixture identity.",
          { decisionId: id },
        ));
      }
    }

    const hasScoreConflict = decision.scoreConflict === true;
    const hasTerminalConflict = decision.terminalStatusConflict === true;
    if (hasScoreConflict) scoreConflicts++;
    if (hasTerminalConflict) terminalConflicts++;
    if (hasScoreConflict || hasTerminalConflict) truthConflictUnion++;

    if (hasScoreConflict || hasTerminalConflict) {
      const truth = decision.truthDecision || {};
      if (!['RESOLVED_FINAL', 'RESOLVED_NON_PLAYED'].includes(truth.status)) {
        issues.push(issue(
          "TRUTH_CONFLICT_UNRESOLVED",
          "Score or terminal-status conflicts must be evidence-resolved.",
          { decisionId: id },
        ));
      }

      if (truth.status === "RESOLVED_FINAL") {
        if (!Number.isInteger(truth.scoreHome) || !Number.isInteger(truth.scoreAway)) {
          issues.push(issue(
            "RESOLVED_FINAL_SCORE_INVALID",
            "Resolved final must contain integer home and away scores.",
            { decisionId: id },
          ));
        }
        if (truth.terminalStatus !== "FT" || truth.nonPlayedStatus !== null) {
          issues.push(issue(
            "RESOLVED_FINAL_STATUS_INVALID",
            "Resolved final must be FT and cannot carry a non-played status.",
            { decisionId: id },
          ));
        }
      }

      if (truth.status === "RESOLVED_NON_PLAYED") {
        if (truth.scoreHome !== null || truth.scoreAway !== null) {
          issues.push(issue(
            "NON_PLAYED_SCORE_MUST_BE_NULL",
            "Resolved non-played outcome must have null scores.",
            { decisionId: id },
          ));
        }
        if (!clean(truth.nonPlayedStatus)) {
          issues.push(issue(
            "NON_PLAYED_STATUS_MISSING",
            "Resolved non-played outcome requires an explicit status.",
            { decisionId: id },
          ));
        }
      }

      const supportingTruthEvidence = truthEvidenceSupportsResolution(decision);
      const supportingTruthIds = new Set(
        supportingTruthEvidence.map(item => item.evidenceId),
      );
      const supportingTruthRefs = (truth.evidenceRefs || []).filter(ref =>
        supportingTruthIds.has(ref)
      );

      if (supportingTruthRefs.length === 0) {
        issues.push(issue(
          "TRUTH_EVIDENCE_SEMANTIC_BINDING_MISSING",
          "Referenced evidence does not support the resolved fixture status and exact score/non-played outcome.",
          { decisionId: id },
        ));
      }

      if (
        !hasPrimaryEvidence(decision, supportingTruthRefs) &&
        !hasTwoIndependentDirectEvidence(decision, supportingTruthRefs)
      ) {
        issues.push(issue(
          "TRUTH_EVIDENCE_INSUFFICIENT",
          "Conflict resolution requires truth-supporting primary evidence or two independent truth-supporting direct sources.",
          { decisionId: id },
        ));
      }
    } else if (decision?.truthDecision?.status !== "NO_CONFLICT_RECORDED") {
      issues.push(issue(
        "NON_CONFLICT_TRUTH_STATUS_INVALID",
        "A record without a source conflict must remain NO_CONFLICT_RECORDED in the foundation ledger.",
        { decisionId: id },
      ));
    }

    if (
      decision?.repositoryFixtureIdDecision?.status !==
        "DEFERRED_UNTIL_PRODUCTION_GLOBAL_CLUB_ID_BINDING" ||
      decision?.repositoryFixtureIdDecision?.retainedRepositoryFixtureId !== null ||
      (decision?.repositoryFixtureIdDecision?.suppressedRepositoryFixtureIds || []).length !== 0
    ) {
      issues.push(issue(
        "REPOSITORY_FIXTURE_SELECTION_PREMATURE",
        "Repository fixture-ID retention/suppression must stay deferred until production globalClubId binding.",
        { decisionId: id },
      ));
    }

    if (
      decision?.applicationAuthorization?.repositoryApplicationAuthorized !== false ||
      decision?.applicationAuthorization?.mutationAllowed !== false ||
      decision?.applicationAuthorization?.writePlanGenerated !== false
    ) {
      issues.push(issue(
        "DECISION_APPLICATION_AUTHORIZED",
        "P0-C foundation decisions must not authorize repository mutation.",
        { decisionId: id },
      ));
    }

    if (!verifyDecisionHash(decision)) {
      issues.push(issue("IMMUTABLE_DECISION_HASH_MISMATCH", "Decision hash mismatch.", { decisionId: id }));
    }
  }

  if (fixtureIds.size !== EXPECTED_COUNTS.sourceFixtureIds) {
    issues.push(issue(
      "SOURCE_FIXTURE_ID_COUNT_MISMATCH",
      "Ledger must cover all 106 source fixture IDs exactly once.",
      { observed: fixtureIds.size },
    ));
  }

  for (const key of teamKeys) {
    if (!usedTeamKeys.has(key)) {
      issues.push(issue(
        "ORPHAN_LEDGER_TEAM_IDENTITY",
        "Ledger-scoped team identity is not referenced by any decision.",
        { key },
      ));
    }
  }
  if (reviewCandidates !== EXPECTED_COUNTS.reviewCandidates) {
    issues.push(issue("REVIEW_CANDIDATE_COUNT_MISMATCH", "Expected one review candidate.", { observed: reviewCandidates }));
  }
  if (scoreConflicts !== EXPECTED_COUNTS.scoreConflicts) {
    issues.push(issue("SCORE_CONFLICT_COUNT_MISMATCH", "Expected six score conflicts.", { observed: scoreConflicts }));
  }
  if (terminalConflicts !== EXPECTED_COUNTS.terminalStatusConflicts) {
    issues.push(issue("TERMINAL_CONFLICT_COUNT_MISMATCH", "Expected five terminal-status conflicts.", { observed: terminalConflicts }));
  }
  if (truthConflictUnion !== EXPECTED_COUNTS.truthConflictUnion) {
    issues.push(issue("TRUTH_CONFLICT_UNION_COUNT_MISMATCH", "Expected seven unique truth-conflict records.", { observed: truthConflictUnion }));
  }

  const summary = {
    decisionRecords: decisions.length,
    ledgerTeamIdentities: teamIdentities.length,
    sourceFixtureIds: fixtureIds.size,
    confirmedSemanticDuplicates: decisions.filter(
      item => item?.identityDecision?.status === "CONFIRMED_SEMANTIC_DUPLICATE",
    ).length,
    reviewCandidatesResolved: reviewCandidates,
    scoreConflicts,
    terminalStatusConflicts: terminalConflicts,
    truthConflictUnionResolved: truthConflictUnion,
    repositoryFixtureIdSelectionsDeferred: decisions.filter(
      item => item?.repositoryFixtureIdDecision?.status ===
        "DEFERRED_UNTIL_PRODUCTION_GLOBAL_CLUB_ID_BINDING",
    ).length,
    productionGlobalClubIdsBound: teamIdentities.filter(
      item => item?.productionGlobalClubId !== null,
    ).length,
  };

  for (const [key, observed] of Object.entries(summary)) {
    if (ledger?.summary?.[key] !== observed) {
      issues.push(issue(
        "LEDGER_SUMMARY_MISMATCH",
        "Stored ledger summary does not match independently recomputed content.",
        { key, stored: ledger?.summary?.[key], observed },
      ));
    }
  }

  return {
    schema: "ai-matchlab.semantic-duplicate-decision-ledger-validation.v1",
    ok: issues.length === 0,
    status: issues.length === 0 ? "PASS" : "FAIL",
    ledgerVersion: ledger.ledgerVersion || null,
    issueCount: issues.length,
    summary,
    issues,
    applicationAuthorization: {
      repositoryApplicationAuthorized: false,
      mutationAllowed: false,
      writePlanGenerated: false,
    },
  };
}
