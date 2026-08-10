import {
  getProductionIdentityResolverRuntime,
} from "./production-identity-resolver-runtime.js";
import {
  createProductionTeamIdentityDisambiguator,
} from "./production-team-identity-disambiguation.js";

export const PRODUCTION_EVIDENCE_IDENTITY_OVERLAY_SCHEMA =
  "ai-matchlab.production-evidence-identity-overlay.v1";

const FIXTURE_ID_FIELDS = Object.freeze([
  "canonicalId",
  "matchId",
  "id",
  "fixtureId",
  "repositoryFixtureId",
]);

const SCORE_STATUS_FIELDS = Object.freeze([
  "scoreHome",
  "scoreAway",
  "homeScore",
  "awayScore",
  "status",
  "statusType",
  "rawStatus",
  "operationalState",
  "terminalStatus",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function asSet(values) {
  if (values instanceof Set) return values;
  if (!Array.isArray(values)) return null;
  return new Set(values.map(clean).filter(Boolean));
}

function evidenceError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function firstClean(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function fixtureIdsFromRow(row = {}) {
  const ids = [];
  for (const field of FIXTURE_ID_FIELDS) {
    const value = clean(row?.[field]);
    if (value) ids.push({ field, value });
  }
  return ids;
}

function teamReferenceFromRow(row = {}, side) {
  const key = side === "home" ? "home" : "away";
  const title = side === "home" ? "Home" : "Away";
  return {
    globalClubId:
      firstClean(
        row?.[`${key}GlobalClubId`],
        row?.[`${key}TeamGlobalClubId`],
        row?.productionIdentityBinding?.[`${key}GlobalClubId`],
        row?.teams?.[key]?.globalClubId,
      ) || undefined,
    ledgerTeamIdentityKey:
      firstClean(
        row?.[`${key}LedgerTeamIdentityKey`],
        row?.[`${key}TeamIdentityKey`],
        row?.teams?.[key]?.ledgerTeamIdentityKey,
      ) || undefined,
    alias:
      firstClean(
        row?.[`${key}Team`],
        row?.[key],
        row?.[`${key}Name`],
        row?.teams?.[key]?.name,
        row?.[`${title}Team`],
      ) || undefined,
    leagueSlug: firstClean(row?.leagueSlug) || undefined,
  };
}

function truthSnapshot(row = {}) {
  return Object.fromEntries(
    SCORE_STATUS_FIELDS.map(field => [field, clone(row?.[field])]),
  );
}

function assertTruthUnchanged(before, after) {
  for (const field of SCORE_STATUS_FIELDS) {
    if (
      JSON.stringify(before[field]) !==
      JSON.stringify(after?.[field])
    ) {
      throw evidenceError(
        "production_evidence_truth_field_changed",
        { field },
      );
    }
  }
}

export function createProductionEvidenceIdentityOverlay(options = {}) {
  const hasInjectedResolver = Boolean(options?.resolver);
  const runtime = hasInjectedResolver
    ? null
    : getProductionIdentityResolverRuntime();
  const resolver = options?.resolver || runtime.resolver;
  const teamDisambiguator = options?.teamDisambiguator === undefined
    ? (runtime
        ? createProductionTeamIdentityDisambiguator({
            baseResolver: runtime.baseResolver,
          })
        : null)
    : options.teamDisambiguator;
  if (
    !resolver ||
    typeof resolver.resolveFixtureId !== "function" ||
    typeof resolver.resolveFixtureMembership !== "function" ||
    typeof resolver.resolveTeamReference !== "function" ||
    typeof resolver.isManagedFixtureId !== "function"
  ) {
    throw evidenceError(
      "production_evidence_resolver_invalid",
    );
  }

  function resolveEvidenceFixtureId(
    repositoryFixtureId,
    { allowUnmanaged = true } = {},
  ) {
    const sourceFixtureId = clean(repositoryFixtureId);
    if (!sourceFixtureId) {
      return {
        ok: false,
        status: "FIXTURE_ID_REQUIRED",
        sourceFixtureId: null,
        resolvedFixtureId: null,
        managed: false,
        overlayOnly: true,
        productionMutationAuthorized: false,
      };
    }

    if (!resolver.isManagedFixtureId(sourceFixtureId)) {
      if (!allowUnmanaged) {
        return {
          ok: false,
          status: "UNMANAGED_FIXTURE_ID_NOT_ALLOWED",
          sourceFixtureId,
          resolvedFixtureId: null,
          managed: false,
          overlayOnly: true,
          productionMutationAuthorized: false,
        };
      }

      return {
        ok: true,
        status: "UNMANAGED_FIXTURE_ID_PRESERVED",
        sourceFixtureId,
        resolvedFixtureId: sourceFixtureId,
        sourceRole: "unmanaged",
        managed: false,
        changed: false,
        overlayOnly: true,
        productionMutationAuthorized: false,
      };
    }

    const resolution = resolver.resolveFixtureId(sourceFixtureId);
    if (!resolution?.ok) {
      throw evidenceError(
        "managed_fixture_resolution_failed",
        { sourceFixtureId, resolution },
      );
    }

    return {
      ...resolution,
      managed: true,
      changed:
        resolution.resolvedFixtureId !== sourceFixtureId,
      overlayOnly: true,
      productionMutationAuthorized: false,
    };
  }

  function resolveEvidenceFixtureMembership({
    repositoryFixtureId,
    canonicalFixtureIds,
    allowUnmanaged = true,
  } = {}) {
    const universe = asSet(canonicalFixtureIds);
    if (!universe) {
      return {
        ok: false,
        status: "CANONICAL_FIXTURE_UNIVERSE_REQUIRED",
        fixtureMembershipCreated: false,
        productionMutationAuthorized: false,
      };
    }

    const fixture = resolveEvidenceFixtureId(
      repositoryFixtureId,
      { allowUnmanaged },
    );

    if (!fixture.ok) {
      return {
        ...fixture,
        fixtureMembershipCreated: false,
      };
    }

    if (!universe.has(fixture.resolvedFixtureId)) {
      return {
        ok: false,
        status: "RESOLVED_FIXTURE_NOT_IN_CANONICAL_UNIVERSE",
        sourceFixtureId: fixture.sourceFixtureId,
        resolvedFixtureId: fixture.resolvedFixtureId,
        sourceRole: fixture.sourceRole,
        managed: fixture.managed,
        fixtureMembershipCreated: false,
        productionMutationAuthorized: false,
      };
    }

    return {
      ...fixture,
      ok: true,
      status: "EVIDENCE_FIXTURE_MEMBERSHIP_RESOLVED_WITHOUT_CREATION",
      fixtureMembershipCreated: false,
      productionMutationAuthorized: false,
    };
  }

  function overlayEvidenceTeamIdentity(
    reference = {},
    { allowUnmanagedAlias = true } = {},
  ) {
    const globalClubId = clean(reference.globalClubId);
    const ledgerTeamIdentityKey = clean(
      reference.ledgerTeamIdentityKey,
    );
    const alias = clean(reference.alias);
    const hasExplicitManagedSignal =
      Boolean(globalClubId || ledgerTeamIdentityKey);

    if (
      !hasExplicitManagedSignal &&
      alias &&
      teamDisambiguator &&
      typeof teamDisambiguator.resolve === "function"
    ) {
      const disambiguated = teamDisambiguator.resolve({
        alias,
        leagueSlug: clean(reference.leagueSlug) || undefined,
      });
      if (disambiguated?.ok) {
        return {
          ...disambiguated,
          sourceAlias: alias,
          overlayOnly: true,
          productionMutationAuthorized: false,
        };
      }
    }

    const resolution = resolver.resolveTeamReference({
      globalClubId: globalClubId || undefined,
      ledgerTeamIdentityKey:
        ledgerTeamIdentityKey || undefined,
      alias: alias || undefined,
      leagueSlug: clean(reference.leagueSlug) || undefined,
    });

    if (resolution?.ok) {
      return {
        ...resolution,
        managed: true,
        sourceAlias: alias || null,
        overlayOnly: true,
        productionMutationAuthorized: false,
      };
    }

    if (
      hasExplicitManagedSignal &&
      alias &&
      teamDisambiguator &&
      typeof teamDisambiguator.resolveBoundReference === "function"
    ) {
      const bound = teamDisambiguator.resolveBoundReference({
        alias,
        leagueSlug: clean(reference.leagueSlug) || undefined,
        globalClubId: globalClubId || undefined,
        ledgerTeamIdentityKey: ledgerTeamIdentityKey || undefined,
      });
      if (bound?.ok) {
        return {
          ...bound,
          sourceAlias: alias,
          overlayOnly: true,
          productionMutationAuthorized: false,
        };
      }
    }

    if (hasExplicitManagedSignal) {
      throw evidenceError(
        "explicit_team_identity_resolution_failed",
        { reference, resolution },
      );
    }

    if (
      alias &&
      allowUnmanagedAlias &&
      [
        "NORMALIZED_EXACT_ALIAS_NOT_FOUND",
        "NO_IDENTITY_SIGNAL",
      ].includes(resolution?.status)
    ) {
      return {
        ok: true,
        status: "UNMANAGED_TEAM_ALIAS_PRESERVED",
        managed: false,
        globalClubId: null,
        ledgerTeamIdentityKey: null,
        preferredDisplayName: alias,
        sourceAlias: alias,
        matchedSignals: [],
        fuzzyMatchingAttempted: false,
        overlayOnly: true,
        productionMutationAuthorized: false,
      };
    }

    return {
      ok: false,
      status:
        resolution?.status ||
        "TEAM_IDENTITY_RESOLUTION_FAILED",
      managed: false,
      sourceAlias: alias || null,
      overlayOnly: true,
      productionMutationAuthorized: false,
    };
  }

  function preserveEvidenceProvenance({
    sourceFixtureIds = [],
    fixtureResolution = null,
    homeResolution = null,
    awayResolution = null,
  } = {}) {
    return Object.freeze({
      schema:
        "ai-matchlab.production-evidence-provenance.v1",
      sourceFixtureIds: [
        ...new Set(
          sourceFixtureIds.map(clean).filter(Boolean),
        ),
      ],
      sourceFixtureId:
        fixtureResolution?.sourceFixtureId || null,
      resolvedFixtureId:
        fixtureResolution?.resolvedFixtureId || null,
      sourceFixtureRole:
        fixtureResolution?.sourceRole || null,
      fixtureManaged:
        fixtureResolution?.managed ?? null,
      homeSourceAlias:
        homeResolution?.sourceAlias || null,
      homeGlobalClubId:
        homeResolution?.globalClubId || null,
      awaySourceAlias:
        awayResolution?.sourceAlias || null,
      awayGlobalClubId:
        awayResolution?.globalClubId || null,
      scoreTruthChanged: false,
      statusTruthChanged: false,
      sourceEvidenceRewritten: false,
      overlayOnly: true,
      productionMutationAuthorized: false,
    });
  }

  function overlayEvidenceMatchRow(
    row,
    {
      canonicalFixtureIds = null,
      requireMembership = false,
      allowUnmanagedFixture = true,
      allowUnmanagedTeamAlias = true,
    } = {},
  ) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return {
        ok: false,
        status: "EVIDENCE_MATCH_ROW_REQUIRED",
        source: row,
        view: null,
        productionMutationAuthorized: false,
      };
    }

    const source = clone(row);
    const beforeTruth = truthSnapshot(source);
    const fixtureSignals = fixtureIdsFromRow(source);

    if (!fixtureSignals.length) {
      return {
        ok: false,
        status: "EVIDENCE_FIXTURE_ID_REQUIRED",
        source,
        view: null,
        productionMutationAuthorized: false,
      };
    }

    const fixtureResolutions = fixtureSignals.map(signal => ({
      ...signal,
      resolution: requireMembership
        ? resolveEvidenceFixtureMembership({
            repositoryFixtureId: signal.value,
            canonicalFixtureIds,
            allowUnmanaged: allowUnmanagedFixture,
          })
        : resolveEvidenceFixtureId(
            signal.value,
            { allowUnmanaged: allowUnmanagedFixture },
          ),
    }));

    const failedFixture = fixtureResolutions.find(
      item => !item.resolution?.ok,
    );
    if (failedFixture) {
      return {
        ok: false,
        status: failedFixture.resolution.status,
        source,
        view: null,
        fixtureResolution: failedFixture.resolution,
        productionMutationAuthorized: false,
      };
    }

    const resolvedFixtureIds = new Set(
      fixtureResolutions.map(
        item => item.resolution.resolvedFixtureId,
      ),
    );

    if (resolvedFixtureIds.size !== 1) {
      return {
        ok: false,
        status: "CONFLICTING_EVIDENCE_FIXTURE_IDENTITIES",
        source,
        view: null,
        fixtureSignals: fixtureResolutions,
        productionMutationAuthorized: false,
      };
    }

    const fixtureResolution =
      fixtureResolutions[0].resolution;
    const homeResolution = overlayEvidenceTeamIdentity(
      teamReferenceFromRow(source, "home"),
      { allowUnmanagedAlias: allowUnmanagedTeamAlias },
    );
    const awayResolution = overlayEvidenceTeamIdentity(
      teamReferenceFromRow(source, "away"),
      { allowUnmanagedAlias: allowUnmanagedTeamAlias },
    );

    if (!homeResolution.ok || !awayResolution.ok) {
      return {
        ok: false,
        status: "EVIDENCE_TEAM_IDENTITY_RESOLUTION_FAILED",
        source,
        view: null,
        homeResolution,
        awayResolution,
        productionMutationAuthorized: false,
      };
    }

    if (
      homeResolution.globalClubId &&
      homeResolution.globalClubId ===
        awayResolution.globalClubId
    ) {
      return {
        ok: false,
        status: "EVIDENCE_HOME_AWAY_GLOBAL_ID_COLLISION",
        source,
        view: null,
        productionMutationAuthorized: false,
      };
    }

    const view = clone(source);
    for (const signal of fixtureSignals) {
      view[signal.field] =
        fixtureResolution.resolvedFixtureId;
    }

    const sourceFixtureIds = fixtureSignals.map(
      signal => signal.value,
    );

    const binding = preserveEvidenceProvenance({
      sourceFixtureIds,
      fixtureResolution,
      homeResolution,
      awayResolution,
    });

    view.productionIdentityBinding = binding;

    assertTruthUnchanged(beforeTruth, view);

    return {
      ok: true,
      status: "EVIDENCE_IDENTITY_OVERLAY_APPLIED_READ_ONLY",
      schema: PRODUCTION_EVIDENCE_IDENTITY_OVERLAY_SCHEMA,
      source,
      view,
      fixtureResolution,
      homeResolution,
      awayResolution,
      binding,
      sourceEvidenceRewritten: false,
      scoreTruthChanged: false,
      statusTruthChanged: false,
      fixtureMembershipCreated: false,
      productionMutationAuthorized: false,
    };
  }

  return Object.freeze({
    schema: PRODUCTION_EVIDENCE_IDENTITY_OVERLAY_SCHEMA,
    resolveEvidenceFixtureId,
    resolveEvidenceFixtureMembership,
    overlayEvidenceTeamIdentity,
    overlayEvidenceMatchRow,
    preserveEvidenceProvenance,
    authorization: Object.freeze({
      sourceEvidenceRewriteAuthorized: false,
      scoreTruthMutationAuthorized: false,
      statusTruthMutationAuthorized: false,
      fixtureMembershipCreationAuthorized: false,
      productionDataApplicationAuthorized: false,
    }),
  });
}

let defaultProductionEvidenceReadOverlay = null;

function getDefaultProductionEvidenceReadOverlay() {
  if (!defaultProductionEvidenceReadOverlay) {
    defaultProductionEvidenceReadOverlay =
      createProductionEvidenceIdentityOverlay();
  }
  return defaultProductionEvidenceReadOverlay;
}

function readViewClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isCanonicalRepositoryFixtureId(value) {
  return /^cid_[a-z0-9]+(?:_|$)/iu.test(clean(value));
}

function normalizeLegacyProviderMatchIdReadView(row = {}) {
  const view = readViewClone(row);
  const canonicalId = clean(view?.canonicalId);
  const matchId = clean(view?.matchId);

  if (
    !isCanonicalRepositoryFixtureId(canonicalId) ||
    !matchId ||
    matchId === canonicalId ||
    isCanonicalRepositoryFixtureId(matchId)
  ) {
    return view;
  }

  const explicitProviderIds = [
    view?.sourceId,
    view?.sourceMatchId,
    view?.providerMatchId,
  ].map(clean).filter(Boolean);
  const hasExplicitProviderBinding =
    explicitProviderIds.includes(matchId);
  const hasLegacyProviderShape =
    /^\d+$/u.test(matchId) ||
    /^fs_[a-z0-9]+$/iu.test(matchId);

  if (
    !hasExplicitProviderBinding &&
    !hasLegacyProviderShape
  ) {
    return view;
  }

  // Older canonical fixtures and frozen Value rows kept the provider event ID
  // in matchId while canonicalId already held the repository identity. Treat
  // that proven legacy shape as source provenance in the read view only. Two
  // different canonical cid_* signals still reach the conflict guard below.
  if (!clean(view.sourceId)) {
    view.sourceId = matchId;
  }
  if (!clean(view.sourceMatchId)) {
    view.sourceMatchId = matchId;
  }
  view.matchId = canonicalId;

  return view;
}

function readViewFixtureSignals(row = {}) {
  const signals = [];

  for (const field of [
    "canonicalId",
    "matchId",
    "fixtureId",
    "repositoryFixtureId",
  ]) {
    const value = clean(row?.[field]);
    if (value) signals.push({ field, value });
  }

  const contextualId = clean(row?.id);
  const homeContext = firstClean(
    row?.homeTeam,
    row?.home,
    row?.homeName,
    row?.homeTeamName,
  );
  const awayContext = firstClean(
    row?.awayTeam,
    row?.away,
    row?.awayName,
    row?.awayTeamName,
  );
  const temporalContext = firstClean(
    row?.kickoff,
    row?.kickoffUtc,
    row?.dayKey,
    row?.date,
    row?.status,
  );
  const hasMatchContext = Boolean(
    (homeContext && awayContext) ||
    ((homeContext || awayContext) && temporalContext),
  );

  if (contextualId && hasMatchContext) {
    signals.push({ field: "id", value: contextualId });
  }

  return signals;
}

function readViewScalarText(value) {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return "";
  }

  return clean(value);
}

function readViewTeamAlias(row = {}, side) {
  const key = side === "home" ? "home" : "away";
  const title = side === "home" ? "Home" : "Away";

  return firstClean(
    readViewScalarText(row?.[`${key}Team`]),
    readViewScalarText(row?.[key]),
    readViewScalarText(row?.[`${key}Name`]),
    readViewScalarText(row?.[`${key}TeamName`]),
    readViewScalarText(
      row?.teams?.[key]?.name,
    ),
    readViewScalarText(row?.[`${title}Team`]),
  );
}

function readBoundaryError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

export function resolveProductionEvidenceFixtureIdReadView(
  repositoryFixtureId,
  {
    overlay = getDefaultProductionEvidenceReadOverlay(),
    allowUnmanaged = true,
  } = {},
) {
  let result;

  try {
    result = overlay.resolveEvidenceFixtureId(
      repositoryFixtureId,
      { allowUnmanaged },
    );
  } catch (error) {
    throw readBoundaryError(
      "production_evidence_read_fixture_resolution_failed",
      {
        repositoryFixtureId:
          clean(repositoryFixtureId) || null,
        cause:
          String(error?.code || error?.message || error),
      },
    );
  }

  if (!result?.ok) {
    throw readBoundaryError(
      "production_evidence_read_fixture_resolution_failed",
      {
        repositoryFixtureId:
          clean(repositoryFixtureId) || null,
        result,
      },
    );
  }

  return result;
}

export function overlayProductionEvidenceFixtureIdReadView(
  row,
  {
    overlay = getDefaultProductionEvidenceReadOverlay(),
    allowUnmanaged = true,
  } = {},
) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return readViewClone(row);
  }

  const source =
    normalizeLegacyProviderMatchIdReadView(row);
  const signals = readViewFixtureSignals(source);

  if (!signals.length) {
    return source;
  }

  const resolutions = signals.map(signal => ({
    ...signal,
    resolution:
      resolveProductionEvidenceFixtureIdReadView(
        signal.value,
        { overlay, allowUnmanaged },
      ),
  }));

  const resolvedIds = new Set(
    resolutions.map(
      item => item.resolution.resolvedFixtureId,
    ),
  );

  if (resolvedIds.size !== 1) {
    throw readBoundaryError(
      "production_evidence_read_conflicting_fixture_identities",
      { signals: resolutions },
    );
  }

  const fixtureResolution =
    resolutions[0].resolution;
  const view = readViewClone(source);

  for (const signal of signals) {
    view[signal.field] =
      fixtureResolution.resolvedFixtureId;
  }

  const binding =
    overlay.preserveEvidenceProvenance({
      sourceFixtureIds:
        signals.map(signal => signal.value),
      fixtureResolution,
    });

  view.productionIdentityBinding = {
    ...(view.productionIdentityBinding || {}),
    ...binding,
  };

  return view;
}

export function overlayProductionEvidenceMatchRowReadView(
  row,
  {
    overlay = getDefaultProductionEvidenceReadOverlay(),
    allowUnmanagedFixture = true,
    allowUnmanagedTeamAlias = true,
    leagueSlug = undefined,
  } = {},
) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return readViewClone(row);
  }

  const source =
    normalizeLegacyProviderMatchIdReadView(row);
  const signals = readViewFixtureSignals(source);

  if (!signals.length) {
    return source;
  }

  const candidate = {
    ...source,
    homeTeam:
      readViewTeamAlias(source, "home") ||
      undefined,
    awayTeam:
      readViewTeamAlias(source, "away") ||
      undefined,
    leagueSlug:
      firstClean(source?.leagueSlug, leagueSlug) ||
      undefined,
  };

  const homeAlias =
    readViewTeamAlias(candidate, "home");
  const awayAlias =
    readViewTeamAlias(candidate, "away");

  if (!homeAlias || !awayAlias) {
    return overlayProductionEvidenceFixtureIdReadView(
      candidate,
      {
        overlay,
        allowUnmanaged:
          allowUnmanagedFixture,
      },
    );
  }

  const result =
    overlay.overlayEvidenceMatchRow(candidate, {
      allowUnmanagedFixture,
      allowUnmanagedTeamAlias,
    });

  if (!result?.ok) {
    throw readBoundaryError(
      "production_evidence_read_match_overlay_failed",
      {
        status: result?.status || null,
        fixtureSignals: signals,
      },
    );
  }

  return result.view;
}

export function overlayProductionEvidenceDocumentReadView(
  value,
  options = {},
) {
  if (Array.isArray(value)) {
    return value.map(item =>
      overlayProductionEvidenceDocumentReadView(
        item,
        options,
      ),
    );
  }

  if (
    !value ||
    typeof value !== "object"
  ) {
    return value;
  }

  const recursivelyCloned =
    Object.fromEntries(
      Object.entries(value).map(
        ([key, entryValue]) => [
          key,
          overlayProductionEvidenceDocumentReadView(
            entryValue,
            options,
          ),
        ],
      ),
    );

  if (
    readViewFixtureSignals(recursivelyCloned)
      .length
  ) {
    return overlayProductionEvidenceMatchRowReadView(
      recursivelyCloned,
      options,
    );
  }

  return recursivelyCloned;
}

export function overlayProductionEvidenceTeamRowReadView(
  row,
  {
    overlay = getDefaultProductionEvidenceReadOverlay(),
    teamFields = [
      "teamName",
      "team",
      "name",
      "club",
    ],
    leagueSlug = undefined,
    allowUnmanagedAlias = true,
  } = {},
) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return readViewClone(row);
  }

  const source = readViewClone(row);
  const alias =
    firstClean(
      ...teamFields.map(field => source?.[field]),
    );

  if (!alias) {
    return source;
  }

  let resolution;

  try {
    resolution =
      overlay.overlayEvidenceTeamIdentity(
        {
          alias,
          leagueSlug:
            firstClean(
              source?.leagueSlug,
              leagueSlug,
            ) || undefined,
        },
        { allowUnmanagedAlias },
      );
  } catch (error) {
    throw readBoundaryError(
      "production_evidence_read_team_overlay_failed",
      {
        alias,
        cause:
          String(error?.code || error?.message || error),
      },
    );
  }

  if (!resolution?.ok) {
    throw readBoundaryError(
      "production_evidence_read_team_overlay_failed",
      {
        alias,
        status: resolution?.status || null,
      },
    );
  }

  source.productionIdentityBinding = {
    ...(source.productionIdentityBinding || {}),
    schema:
      "ai-matchlab.production-evidence-team-read-view.v1",
    sourceAlias:
      resolution.sourceAlias || alias,
    globalClubId:
      resolution.globalClubId || null,
    ledgerTeamIdentityKey:
      resolution.ledgerTeamIdentityKey || null,
    preferredDisplayName:
      resolution.preferredDisplayName || alias,
    managed:
      resolution.managed === true,
    sourceEvidenceRewritten: false,
    overlayOnly: true,
    productionMutationAuthorized: false,
  };

  return source;
}

export function overlayProductionEvidenceTeamRowsReadView(
  rows,
  options = {},
) {
  if (!Array.isArray(rows)) return [];

  return rows.map(row =>
    overlayProductionEvidenceTeamRowReadView(
      row,
      options,
    ),
  );
}

export function overlayProductionEvidenceTeamKeyedEntriesReadView(
  document,
  {
    overlay = getDefaultProductionEvidenceReadOverlay(),
    leagueSlug = undefined,
  } = {},
) {
  const source =
    document &&
    typeof document === "object" &&
    !Array.isArray(document)
      ? readViewClone(document)
      : {};

  const teams =
    source?.teams &&
    typeof source.teams === "object" &&
    !Array.isArray(source.teams)
      ? source.teams
      : {};

  const view = {
    ...source,
    teams: {},
    productionIdentityBindings: {
      ...(source.productionIdentityBindings || {}),
      teams: {
        ...(
          source
            ?.productionIdentityBindings
            ?.teams || {}
        ),
      },
    },
  };

  for (const [teamName, entries] of Object.entries(
    teams,
  )) {
    const teamView =
      overlayProductionEvidenceTeamRowReadView(
        { teamName },
        {
          overlay,
          leagueSlug:
            firstClean(
              source?.slug,
              source?.leagueSlug,
              leagueSlug,
            ) || undefined,
        },
      );

    view.productionIdentityBindings.teams[
      teamName
    ] =
      teamView.productionIdentityBinding ||
      null;

    view.teams[teamName] =
      Array.isArray(entries)
        ? entries.map(entry =>
            overlayProductionEvidenceFixtureIdReadView(
              entry,
              { overlay },
            ),
          )
        : entries;
  }

  return view;
}

export function resetProductionEvidenceReadOverlayForTests() {
  defaultProductionEvidenceReadOverlay = null;
}
