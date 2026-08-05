import crypto from "node:crypto";

export const P0C_P4_IDENTITY_SAFE_COMPOSITION_LOADERS_SCHEMA =
  "ai-matchlab.p0c-p4-identity-safe-composition-loaders.v1";

export const P0C_P4_CANONICAL_ALIAS_RECONCILIATION_SCHEMA =
  "ai-matchlab.p0c-p4-canonical-alias-reconciliation.v1";

export const P0C_P4_H2H_FIXTURE_ONLY_FALLBACK_SCHEMA =
  "ai-matchlab.p0c-p4-h2h-fixture-only-fallback.v1";

const FIXTURE_ID_FIELDS = Object.freeze([
  "canonicalId",
  "repositoryFixtureId",
  "fixtureId",
  "matchId",
  "id",
]);

const EXPLICIT_TEAM_IDENTITY_FIELDS = Object.freeze([
  "homeGlobalClubId",
  "homeTeamIdentityKey",
  "homeLedgerTeamIdentityKey",
  "awayGlobalClubId",
  "awayTeamIdentityKey",
  "awayLedgerTeamIdentityKey",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function sha256Json(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function firstClean(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function fixtureId(row = {}) {
  return firstClean(
    row.canonicalId,
    row.repositoryFixtureId,
    row.fixtureId,
    row.matchId,
    row.id,
  );
}

function identitySignals(row = {}) {
  return FIXTURE_ID_FIELDS
    .map(field => clean(row[field]))
    .filter(Boolean);
}

function teamAlias(row = {}, side) {
  const key = side === "home" ? "home" : "away";
  const title = side === "home" ? "Home" : "Away";
  return firstClean(
    row[`${key}Team`],
    row[key],
    row[`${key}Name`],
    row[`${title}Team`],
    row?.teams?.[key]?.name,
  );
}

function truthState(row = {}) {
  const tokens = [
    row.state,
    row.status,
    row.statusType,
    row.rawStatus,
    row.operationalState,
    row.verdict,
    row.finalTruthVerdict,
  ]
    .map(value => clean(value).toUpperCase())
    .filter(Boolean);

  if (tokens.some(value => [
    "STATUS_POSTPONED",
    "POSTPONED",
  ].includes(value))) return "POSTPONED";
  if (tokens.some(value => [
    "STATUS_CANCELLED",
    "CANCELLED",
    "CANCELED",
  ].includes(value))) return "CANCELLED";
  if (tokens.some(value => [
    "STATUS_ABANDONED",
    "ABANDONED",
  ].includes(value))) return "ABANDONED";
  if (tokens.some(value => [
    "FT",
    "STATUS_FINAL",
    "STATUS_FULL_TIME",
    "FULL_TIME",
    "VERIFIED_FINAL_RESULT",
  ].includes(value))) return "FINAL";
  if (tokens.some(value => [
    "PRE",
    "STATUS_SCHEDULED",
    "SCHEDULED",
  ].includes(value))) return "SCHEDULED";
  return tokens[0] || "UNKNOWN";
}

function scoreValue(value) {
  if (value === null || value === "" || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function p0cP4TruthVector(row = {}) {
  return Object.freeze({
    state: truthState(row),
    scoreHome: scoreValue(
      row.scoreHome ??
      row.homeScore ??
      row?.finalScore?.homeScore ??
      row?.finalScore?.home,
    ),
    scoreAway: scoreValue(
      row.scoreAway ??
      row.awayScore ??
      row?.finalScore?.awayScore ??
      row?.finalScore?.away,
    ),
  });
}

export function p0cP4TruthVectorKey(row = {}) {
  return JSON.stringify(p0cP4TruthVector(row));
}

function normalizeRetainedFixtureIdentity({
  row,
  resolvedFixtureId,
  overlay,
}) {
  const view = clone(row);
  const sourceFixtureId = fixtureId(view);
  const resolution = overlay.resolveEvidenceFixtureId(
    sourceFixtureId,
    { allowUnmanaged: true },
  );
  if (
    !resolution?.ok ||
    resolution.resolvedFixtureId !== resolvedFixtureId ||
    resolution.changed === true
  ) {
    throw new Error(
      `p0c_p4_canonical_retained_resolution_invalid:${sourceFixtureId}`,
    );
  }

  for (const field of FIXTURE_ID_FIELDS) {
    if (
      Object.hasOwn(view, field) ||
      field === "canonicalId" ||
      field === "matchId" ||
      field === "id"
    ) {
      view[field] = resolvedFixtureId;
    }
  }
  return view;
}

export function reconcileP0CP4CanonicalAliasGroup({
  dayKey,
  resolvedFixtureId,
  sourceRows,
  authoritativeEvidence = [],
  overlay,
} = {}) {
  const normalizedDayKey = clean(dayKey);
  const normalizedResolvedId = clean(resolvedFixtureId);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(normalizedDayKey) ||
    !normalizedResolvedId ||
    !Array.isArray(sourceRows) ||
    sourceRows.length < 2 ||
    !overlay ||
    typeof overlay.resolveEvidenceFixtureId !== "function"
  ) {
    throw new Error(
      "p0c_p4_canonical_alias_group_input_invalid",
    );
  }

  const resolvedRows = sourceRows.map(row => {
    const sourceFixtureId = fixtureId(row);
    const resolution = overlay.resolveEvidenceFixtureId(
      sourceFixtureId,
      { allowUnmanaged: true },
    );
    if (
      !resolution?.ok ||
      resolution.resolvedFixtureId !== normalizedResolvedId
    ) {
      throw new Error(
        `p0c_p4_canonical_alias_group_resolution_mismatch:${sourceFixtureId}`,
      );
    }
    return {
      row,
      sourceFixtureId,
      truth: p0cP4TruthVector(row),
    };
  });

  const retainedRows = resolvedRows.filter(
    item => item.sourceFixtureId === normalizedResolvedId,
  );
  if (retainedRows.length !== 1) {
    throw new Error(
      `p0c_p4_canonical_alias_group_retained_row_required:${normalizedResolvedId}:${retainedRows.length}`,
    );
  }

  const retained = retainedRows[0];
  const sourceTruthKeys = [
    ...new Set(
      resolvedRows.map(item => JSON.stringify(item.truth)),
    ),
  ];
  const evidenceRows = authoritativeEvidence.map(item => ({
    authority: clean(item?.authority) || "unspecified",
    sourcePath: clean(item?.sourcePath) || null,
    sourceSha256: clean(item?.sourceSha256) || null,
    truth: p0cP4TruthVector(item?.truth || item),
  }));
  const evidenceTruthKeys = [
    ...new Set(
      evidenceRows.map(item => JSON.stringify(item.truth)),
    ),
  ];

  let reason;
  if (sourceTruthKeys.length === 1) {
    reason =
      "SEMANTIC_TRUTH_EQUIVALENT_RETAINED_LINEAGE_SELECTED";
  }
  else {
    if (evidenceTruthKeys.length !== 1) {
      throw new Error(
        `p0c_p4_canonical_alias_group_authoritative_truth_not_unique:${normalizedResolvedId}:${evidenceTruthKeys.length}`,
      );
    }
    if (
      evidenceTruthKeys[0] !==
      JSON.stringify(retained.truth)
    ) {
      throw new Error(
        `p0c_p4_canonical_alias_group_retained_truth_not_authoritative:${normalizedResolvedId}`,
      );
    }
    reason = evidenceRows.some(
      item => item.authority === "verified-final-result",
    )
      ? "VERIFIED_FINAL_TRUTH_CONFIRMS_RETAINED_LINEAGE"
      : evidenceRows.some(
        item => item.authority === "league-memory",
      )
        ? "LEAGUE_MEMORY_TRUTH_CONFIRMS_RETAINED_LINEAGE"
        : "EXPLICIT_TERMINAL_TRUTH_CONFIRMS_RETAINED_LINEAGE";
  }

  const view = normalizeRetainedFixtureIdentity({
    row: retained.row,
    resolvedFixtureId: normalizedResolvedId,
    overlay,
  });

  if (
    p0cP4TruthVectorKey(view) !==
    JSON.stringify(retained.truth)
  ) {
    throw new Error(
      `p0c_p4_canonical_alias_group_truth_changed:${normalizedResolvedId}`,
    );
  }

  return Object.freeze({
    schema: P0C_P4_CANONICAL_ALIAS_RECONCILIATION_SCHEMA,
    ok: true,
    status: reason,
    dayKey: normalizedDayKey,
    resolvedFixtureId: normalizedResolvedId,
    view: Object.freeze(view),
    diagnostics: Object.freeze({
      sourceRowCount: sourceRows.length,
      sourceRowsSha256: sha256Json(sourceRows),
      sourceFixtureIds: Object.freeze(
        resolvedRows.map(item => item.sourceFixtureId),
      ),
      sourceTruthCount: sourceTruthKeys.length,
      authoritativeEvidenceCount: evidenceRows.length,
      authoritativeTruthCount: evidenceTruthKeys.length,
      selectedSourceFixtureId: retained.sourceFixtureId,
      selectedTruth: retained.truth,
      scoreTruthChanged: false,
      statusTruthChanged: false,
      fixtureMembershipCreated: false,
      repositoryApplicationAuthorized: false,
    }),
  });
}

export function createP0CP4H2HFixtureIdOnlyOverlay({
  overlay,
  onFallback = () => {},
} = {}) {
  if (
    !overlay ||
    typeof overlay.overlayEvidenceMatchRow !== "function" ||
    typeof overlay.resolveEvidenceFixtureId !== "function" ||
    typeof overlay.preserveEvidenceProvenance !== "function" ||
    typeof onFallback !== "function"
  ) {
    throw new Error(
      "p0c_p4_h2h_fixture_only_overlay_input_invalid",
    );
  }

  function overlayEvidenceMatchRow(row, options = {}) {
    const result = overlay.overlayEvidenceMatchRow(
      row,
      options,
    );
    if (
      result?.ok ||
      result?.status !==
        "EVIDENCE_HOME_AWAY_GLOBAL_ID_COLLISION"
    ) {
      return result;
    }

    const sourceFixtureId = fixtureId(row);
    const fixtureResolution =
      overlay.resolveEvidenceFixtureId(
        sourceFixtureId,
        { allowUnmanaged: true },
      );
    const homeAlias = teamAlias(row, "home");
    const awayAlias = teamAlias(row, "away");
    const hasExplicitTeamIdentity =
      EXPLICIT_TEAM_IDENTITY_FIELDS.some(
        field => Boolean(clean(row?.[field])),
      );

    if (
      !fixtureResolution?.ok ||
      fixtureResolution.managed === true ||
      !homeAlias ||
      !awayAlias ||
      homeAlias === awayAlias ||
      hasExplicitTeamIdentity
    ) {
      return result;
    }

    const homeResolution = Object.freeze({
      ok: true,
      status:
        "UNMANAGED_TEAM_ALIAS_PRESERVED_AFTER_FALSE_GLOBAL_ID_COLLISION",
      managed: false,
      globalClubId: null,
      ledgerTeamIdentityKey: null,
      preferredDisplayName: homeAlias,
      sourceAlias: homeAlias,
      matchedSignals: Object.freeze([]),
      fuzzyMatchingAttempted: false,
      overlayOnly: true,
      productionMutationAuthorized: false,
    });
    const awayResolution = Object.freeze({
      ...homeResolution,
      preferredDisplayName: awayAlias,
      sourceAlias: awayAlias,
    });

    const view = clone(row);
    for (const field of FIXTURE_ID_FIELDS) {
      if (clean(view?.[field])) {
        view[field] = fixtureResolution.resolvedFixtureId;
      }
    }
    const binding = overlay.preserveEvidenceProvenance({
      sourceFixtureIds: identitySignals(row),
      fixtureResolution,
      homeResolution,
      awayResolution,
    });
    view.productionIdentityBinding = binding;

    const beforeTruth = p0cP4TruthVectorKey(row);
    const afterTruth = p0cP4TruthVectorKey(view);
    if (beforeTruth !== afterTruth) {
      throw new Error(
        `p0c_p4_h2h_fixture_only_overlay_truth_changed:${sourceFixtureId}`,
      );
    }

    const diagnostic = Object.freeze({
      schema: P0C_P4_H2H_FIXTURE_ONLY_FALLBACK_SCHEMA,
      scope: "H2H_INDEX",
      reason:
        "UNMANAGED_ROW_FALSE_HOME_AWAY_GLOBAL_ID_COLLISION",
      fixtureId: sourceFixtureId,
      dayKey: clean(row?.dayKey || row?.date).slice(0, 10),
      leagueSlug: clean(row?.leagueSlug),
      homeAlias,
      awayAlias,
      sourceRowSha256: sha256Json(row),
      scoreTruthChanged: false,
      statusTruthChanged: false,
      productionMutationAuthorized: false,
    });
    onFallback(diagnostic);

    return Object.freeze({
      ok: true,
      status:
        "EVIDENCE_FIXTURE_ID_ONLY_OVERLAY_APPLIED_FOR_UNMANAGED_TEAM_COLLISION",
      source: clone(row),
      view: Object.freeze(view),
      fixtureResolution,
      homeResolution,
      awayResolution,
      binding,
      sourceEvidenceRewritten: false,
      scoreTruthChanged: false,
      statusTruthChanged: false,
      fixtureMembershipCreated: false,
      productionMutationAuthorized: false,
      diagnostic,
    });
  }

  return Object.freeze({
    ...overlay,
    schema: P0C_P4_IDENTITY_SAFE_COMPOSITION_LOADERS_SCHEMA,
    overlayEvidenceMatchRow,
  });
}
