/**
 * Independent active-competition completeness gate.
 *
 * The normal acquisition path starts from our declared/effective league
 * universe. That can never prove that the universe itself is complete. This
 * policy compares the canonical day against the provider-wide Flashscore
 * discovery, restricted to the exact Europe/Athens target day.
 *
 * Known mapped competitions are a hard coverage contract. Unmapped provider
 * competitions remain quarantined and visible as scope warnings; they are not
 * silently treated as covered or automatically published.
 */

export const ACTIVE_COMPETITION_COMPLETENESS_REQUIRED_FROM =
  "2026-08-07";

function clean(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0
    ? Math.trunc(n)
    : null;
}

function countMap(input) {
  if (input instanceof Map) {
    return new Map(
      [...input.entries()]
        .map(([key, value]) => [
          clean(key),
          count(value) ?? 0
        ])
        .filter(([key]) => Boolean(key))
    );
  }

  const out = new Map();

  for (const [key, value] of Object.entries(
    input && typeof input === "object"
      ? input
      : {}
  )) {
    const slug = clean(key);
    if (slug) out.set(slug, count(value) ?? 0);
  }

  return out;
}

function acquisitionBySlug(rows, dayKey) {
  const out = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const rowDay = String(row?.dayKey || "").trim();
    if (rowDay && rowDay !== dayKey) continue;

    const slug = clean(row?.slug);
    if (slug) out.set(slug, row);
  }

  return out;
}

function providerCandidate(row) {
  return {
    providerCompetitionId:
      row?.providerCompetitionId || null,
    providerPath:
      row?.providerPath || null,
    providerCountry:
      row?.providerCountry || null,
    providerName:
      row?.providerName || null,
    reasonCode:
      row?.reasonCode || null,
    targetDayFixtureCount:
      count(row?.targetDayFixtureCount) ?? 0,
    targetDaySourceIds:
      Array.isArray(row?.targetDaySourceIds)
        ? row.targetDaySourceIds
        : []
  };
}

function invalidDiscoveryResult(dayKey, reason, discovery = null) {
  const blockingIssue = {
    slug: null,
    reason,
    providerFixtureCount: null,
    canonicalFixtureCount: null
  };

  return {
    schema:
      "ai-matchlab.active-competition-completeness.v1",
    dayKey,
    ok: false,
    proven: false,
    status: "ERROR",
    discoveryHash:
      discovery?.hash || null,
    summary: {
      targetDayProviderFixtures: null,
      targetDayCompetitions: null,
      knownActiveCompetitions: null,
      knownActiveSlugs: null,
      providerCandidates: null,
      outOfScopeCompetitions: null,
      blockingIssues: 1,
      structuralNoAdapterSlugs: 0,
      knownActiveNotEffectiveSlugs: 0
    },
    knownActiveSlugs: [],
    providerCandidates: [],
    structuralNoAdapterSlugs: [],
    knownActiveNotEffectiveSlugs: [],
    blockingIssues: [blockingIssue],
    bySlug: {}
  };
}

export function buildActiveCompetitionCompleteness({
  dayKey,
  discovery,
  effectiveSlugs = [],
  acquisitionRows = [],
  canonicalCounts = new Map()
} = {}) {
  const date = String(dayKey || "").trim();

  if (!discovery || typeof discovery !== "object") {
    return invalidDiscoveryResult(
      date,
      "provider_discovery_missing"
    );
  }

  if (discovery.ok !== true) {
    return invalidDiscoveryResult(
      date,
      "provider_discovery_not_ok",
      discovery
    );
  }

  if (String(discovery.dayKey || "") !== date) {
    return invalidDiscoveryResult(
      date,
      "provider_discovery_day_mismatch",
      discovery
    );
  }

  const competitions =
    Array.isArray(discovery.competitions)
      ? discovery.competitions
      : null;

  if (!competitions) {
    return invalidDiscoveryResult(
      date,
      "provider_discovery_competitions_missing",
      discovery
    );
  }

  if (
    competitions.some(row =>
      count(row?.targetDayFixtureCount) === null
    )
  ) {
    return invalidDiscoveryResult(
      date,
      "provider_discovery_target_day_contract_missing",
      discovery
    );
  }

  const activeCompetitions =
    competitions.filter(row =>
      Number(row.targetDayFixtureCount) > 0
    );

  const providerCandidates =
    activeCompetitions
      .filter(row =>
        row?.classification === "candidate"
      )
      .map(providerCandidate);

  const outOfScopeCompetitions =
    activeCompetitions.filter(row =>
      row?.classification === "out_of_scope"
    );

  const known =
    activeCompetitions.filter(row =>
      row?.classification === "known_active" &&
      row?.publicationEligible === true &&
      clean(row?.canonicalSlug)
    );

  const groupedKnown = new Map();

  for (const row of known) {
    const slug = clean(row.canonicalSlug);

    if (!groupedKnown.has(slug)) {
      groupedKnown.set(slug, {
        slug,
        providerFixtureCount: 0,
        providerSourceIds: new Set(),
        competitions: []
      });
    }

    const group = groupedKnown.get(slug);
    group.providerFixtureCount +=
      count(row.targetDayFixtureCount) ?? 0;

    for (
      const id of
      Array.isArray(row.targetDaySourceIds)
        ? row.targetDaySourceIds
        : []
    ) {
      const sourceId = String(id || "").trim();
      if (sourceId) group.providerSourceIds.add(sourceId);
    }

    group.competitions.push({
      providerCompetitionId:
        row?.providerCompetitionId || null,
      providerPath:
        row?.providerPath || null,
      providerCountry:
        row?.providerCountry || null,
      providerName:
        row?.providerName || null
    });
  }

  const effectiveSet =
    new Set(
      (Array.isArray(effectiveSlugs)
        ? effectiveSlugs
        : []
      )
        .map(clean)
        .filter(Boolean)
    );

  const acquisition =
    acquisitionBySlug(
      acquisitionRows,
      date
    );

  const canonical =
    countMap(canonicalCounts);

  const blockingIssues = [];
  const knownActiveNotEffectiveSlugs = [];
  const bySlug = {};

  for (
    const [slug, group] of
    [...groupedKnown.entries()]
      .sort(([a], [b]) =>
        a.localeCompare(b)
      )
  ) {
    const providerFixtureCount =
      group.providerFixtureCount;

    const canonicalFixtureCount =
      canonical.get(slug) || 0;

    const acq =
      acquisition.get(slug) || null;

    const inEffectiveScope =
      effectiveSet.has(slug);

    if (!inEffectiveScope) {
      knownActiveNotEffectiveSlugs.push(slug);
    }

    const shortfall =
      Math.max(
        0,
        providerFixtureCount -
          canonicalFixtureCount
      );

    const detail = {
      slug,
      providerFixtureCount,
      canonicalFixtureCount,
      shortfall,
      inEffectiveScope,
      selectedForAcquisition:
        Boolean(acq),
      acquisitionError:
        acq?.error || null,
      rawEvents:
        count(acq?.rawEvents) ?? 0,
      accepted:
        count(acq?.accepted) ?? 0,
      providerSourceIds:
        [...group.providerSourceIds]
          .sort(),
      competitions:
        group.competitions
    };

    bySlug[slug] = detail;

    if (shortfall > 0) {
      blockingIssues.push({
        ...detail,
        reason:
          "canonical_fixture_shortfall"
      });
    }
  }

  const structuralNoAdapterSlugs =
    [...new Set(
      [...acquisition.entries()]
        .filter(([, row]) =>
          String(row?.error || "") ===
          "no_enabled_adapter_for_league"
        )
        .map(([slug]) => slug)
    )].sort();

  const knownActiveSlugs =
    [...groupedKnown.keys()].sort();

  const targetDayProviderFixtures =
    activeCompetitions.reduce(
      (sum, row) =>
        sum +
        (count(
          row.targetDayFixtureCount
        ) ?? 0),
      0
    );

  const warning =
    providerCandidates.length > 0 ||
    structuralNoAdapterSlugs.length > 0 ||
    knownActiveNotEffectiveSlugs.length > 0;

  return {
    schema:
      "ai-matchlab.active-competition-completeness.v1",
    dayKey: date,
    ok:
      blockingIssues.length === 0,
    proven:
      blockingIssues.length === 0 &&
      providerCandidates.length === 0,
    status:
      blockingIssues.length > 0
        ? "ERROR"
        : warning
          ? "WARNING"
          : "PASS",
    discoveryHash:
      discovery.hash || null,
    summary: {
      targetDayProviderFixtures,
      targetDayCompetitions:
        activeCompetitions.length,
      knownActiveCompetitions:
        known.length,
      knownActiveSlugs:
        knownActiveSlugs.length,
      providerCandidates:
        providerCandidates.length,
      outOfScopeCompetitions:
        outOfScopeCompetitions.length,
      blockingIssues:
        blockingIssues.length,
      structuralNoAdapterSlugs:
        structuralNoAdapterSlugs.length,
      knownActiveNotEffectiveSlugs:
        knownActiveNotEffectiveSlugs.length
    },
    knownActiveSlugs,
    providerCandidates,
    structuralNoAdapterSlugs,
    knownActiveNotEffectiveSlugs,
    blockingIssues,
    bySlug
  };
}

export function collectActiveCompetitionCompletenessIssues({
  dayKey,
  coverageReadiness
} = {}) {
  const date = String(dayKey || "").trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
    date <
      ACTIVE_COMPETITION_COMPLETENESS_REQUIRED_FROM
  ) {
    return [];
  }

  const completeness =
    coverageReadiness
      ?.activeCompetitionCompleteness;

  if (
    !completeness ||
    completeness.schema !==
      "ai-matchlab.active-competition-completeness.v1"
  ) {
    return [{
      severity: "error",
      source:
        "active-competition-completeness",
      type:
        "active_competition_completeness_missing",
      message:
        "Independent target-day active competition coverage proof is missing.",
      details: {
        dayKey: date,
        artifact:
          `data/coverage-readiness/${date}.json`
      }
    }];
  }

  const issues = [];

  for (
    const gap of
    Array.isArray(
      completeness.blockingIssues
    )
      ? completeness.blockingIssues
      : []
  ) {
    issues.push({
      severity: "error",
      source:
        "active-competition-completeness",
      type:
        "active_competition_coverage_shortfall",
      message:
        gap?.slug
          ? `Provider-wide discovery has target-day fixtures missing from canonical coverage for ${gap.slug}.`
          : "Provider-wide target-day discovery could not prove canonical coverage.",
      details: {
        dayKey: date,
        ...gap
      }
    });
  }

  const candidates =
    Array.isArray(
      completeness.providerCandidates
    )
      ? completeness.providerCandidates
      : [];

  if (candidates.length > 0) {
    issues.push({
      severity: "warning",
      source:
        "active-competition-completeness",
      type:
        "active_competition_scope_unresolved",
      message:
        "Provider-wide discovery found target-day competitions whose canonical scope is still unresolved.",
      details: {
        dayKey: date,
        count: candidates.length,
        competitions:
          candidates.slice(0, 50)
      }
    });
  }

  const noAdapter =
    Array.isArray(
      completeness.structuralNoAdapterSlugs
    )
      ? completeness.structuralNoAdapterSlugs
      : [];

  if (noAdapter.length > 0) {
    issues.push({
      severity: "warning",
      source:
        "active-competition-completeness",
      type:
        "active_competition_structural_adapter_gap",
      message:
        "Effective competition slugs still rely on supplemental acquisition because no league adapter is enabled.",
      details: {
        dayKey: date,
        slugs: noAdapter
      }
    });
  }

  const notEffective =
    Array.isArray(
      completeness
        .knownActiveNotEffectiveSlugs
    )
      ? completeness
          .knownActiveNotEffectiveSlugs
      : [];

  if (notEffective.length > 0) {
    issues.push({
      severity: "warning",
      source:
        "active-competition-completeness",
      type:
        "active_competition_not_in_effective_scope",
      message:
        "Known target-day competitions were covered canonically but are absent from the effective acquisition seed set.",
      details: {
        dayKey: date,
        slugs: notEffective
      }
    });
  }

  if (
    completeness.ok === false &&
    issues.every(issue =>
      issue.severity !== "error"
    )
  ) {
    issues.push({
      severity: "error",
      source:
        "active-competition-completeness",
      type:
        "active_competition_completeness_not_ok",
      message:
        "Independent active competition completeness gate is not OK.",
      details: {
        dayKey: date,
        summary:
          completeness.summary || null
      }
    });
  }

  return issues;
}
