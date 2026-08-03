import {
  getProductionIdentityResolver,
} from "./production-identity-resolver-runtime.js";

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

export function createProductionEvidenceIdentityOverlay({
  resolver = getProductionIdentityResolver(),
} = {}) {
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
