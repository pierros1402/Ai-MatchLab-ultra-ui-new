function clean(value) {
  return String(value ?? "").trim();
}

const IDENTITY_KEYS = [
  "canonicalId",
  "matchId",
  "id",
  "fixtureId",
  "eventId",
  "gameId",
  "sourceId",
  "sourceMatchId",
  "providerMatchId"
];

function addAlias(target, value) {
  const alias = clean(value);
  if (alias) target.add(alias);
}

export function exactFixtureAliases(row) {
  const aliases = new Set();

  for (const key of IDENTITY_KEYS) {
    addAlias(aliases, row?.[key]);
  }

  // Only aliases explicitly carried by canonical acquisition are accepted.
  // Provider ids are namespaced: ESPN's "123" is not Flashscore's "123".
  for (const alias of Array.isArray(row?.canonicalAliases) ? row.canonicalAliases : []) {
    addAlias(aliases, alias);
  }
  for (const [provider, id] of Object.entries(row?.providerIds || {})) {
    if (clean(provider) && clean(id)) addAlias(aliases, `provider:${clean(provider).toLowerCase()}:${clean(id)}`);
  }

  const sources = row?.sources;

  if (Array.isArray(sources)) {
    for (const sourceRow of sources) {
      for (const key of IDENTITY_KEYS) {
        addAlias(aliases, sourceRow?.[key]);
      }
    }
  } else if (sources && typeof sources === "object") {
    for (const sourceRow of Object.values(sources)) {
      if (!sourceRow || typeof sourceRow !== "object") continue;
      for (const key of IDENTITY_KEYS) {
        addAlias(aliases, sourceRow?.[key]);
      }
    }
  }

  return [...aliases];
}

function canonicalOutputId(row) {
  return clean(row?.canonicalId) || clean(row?.matchId) || null;
}

export function hasModelAssessment(row) {
  const markets = row?.aiAssessment?.markets;
  return Boolean(
    markets &&
    typeof markets === "object" &&
    Object.keys(markets).length > 0
  );
}

function buildUniqueAliasIndex(rows = []) {
  const byAlias = new Map();
  const ambiguousAliases = new Set();

  for (const row of rows) {
    for (const alias of exactFixtureAliases(row)) {
      if (ambiguousAliases.has(alias)) continue;

      const existing = byAlias.get(alias);
      if (!existing) {
        byAlias.set(alias, row);
        continue;
      }

      if (existing !== row) {
        byAlias.delete(alias);
        ambiguousAliases.add(alias);
      }
    }
  }

  return {
    byAlias,
    ambiguousAliases
  };
}

function teamName(row, side) {
  const value = side === "home"
    ? (row?.homeTeam ?? row?.home)
    : (row?.awayTeam ?? row?.away);

  if (typeof value === "string") return clean(value) || null;
  return clean(value?.name ?? value?.displayName ?? value?.shortName) || null;
}

function kickoffUtc(row) {
  return clean(
    row?.kickoffUtc ??
    row?.kickoff ??
    row?.startTime ??
    row?.dateUtc ??
    row?.date
  ) || null;
}

function canonicalJoinedRow(canonicalFixture, assessmentRow) {
  const canonicalId = canonicalOutputId(canonicalFixture);

  return {
    ...assessmentRow,
    canonicalId,
    matchId: clean(canonicalFixture?.matchId) || canonicalId,
    leagueSlug: clean(canonicalFixture?.leagueSlug) || clean(assessmentRow?.leagueSlug) || null,
    home: teamName(canonicalFixture, "home") || teamName(assessmentRow, "home"),
    away: teamName(canonicalFixture, "away") || teamName(assessmentRow, "away"),
    kickoffUtc: kickoffUtc(canonicalFixture) || kickoffUtc(assessmentRow),
    dayKey: clean(canonicalFixture?.dayKey) || clean(assessmentRow?.dayKey) || null,
    aiAssessment: assessmentRow?.aiAssessment ?? null,
    canonicalFixture
  };
}

export function resolveCanonicalAssessmentOwnership(canonicalFixtures = [], rows = []) {
  const authoritativeSources = new Set(["canonical_fixture_trusted_standings", "canonical_fixture_team_form_fallback", "canonical_fixture_cross_competition_team_form_fallback"]);
  const owners = new Map(), groups = new Map(), suppressed = new Map();
  for (const fixture of canonicalFixtures) for (const alias of exactFixtureAliases(fixture)) {
    const set = owners.get(alias) || new Set(); set.add(fixture); owners.set(alias, set);
  }
  for (const row of rows.filter(hasModelAssessment)) {
    const candidates = new Set(exactFixtureAliases(row).flatMap(alias => [...(owners.get(alias) || [])]));
    if (candidates.size !== 1) continue;
    const fixture = [...candidates][0];
    const group = groups.get(fixture) || []; group.push(row); groups.set(fixture, group);
  }
  const sameTimeAndDay = (row, fixture) => Boolean(row.dayKey && row.dayKey === fixture.dayKey
    && Number.isFinite(Date.parse(kickoffUtc(row))) && Date.parse(kickoffUtc(row)) === Date.parse(kickoffUtc(fixture)));
  const globalConflict = (row, fixture) => ["home", "away"].some(side => {
    const key = `${side}GlobalClubId`;
    const a = row[key] || row.productionIdentityBinding?.[key], b = fixture[key] || fixture.productionIdentityBinding?.[key];
    return a && b && a !== b;
  });
  for (const [fixture, group] of groups) {
    if (group.length < 2) continue;
    const leaders = group.filter(row => canonicalOutputId(row) === canonicalOutputId(fixture)
      && authoritativeSources.has(row.aiAssessment?.inputSource) && sameTimeAndDay(row, fixture)
      && row.leagueSlug === fixture.leagueSlug && teamName(row, "home") === teamName(fixture, "home")
      && teamName(row, "away") === teamName(fixture, "away") && !globalConflict(row, fixture));
    if (leaders.length !== 1) continue;
    const leader = leaders[0];
    // An explicit canonical producer may supersede legacy aliases, never another
    // canonical producer or a conflicting time/global identity. Preserve all
    // original evidence and bookmaker data for audit; no averaging or best-odds choice.
    const legacy = group.filter(row => row !== leader);
    if (legacy.some(row => authoritativeSources.has(row.aiAssessment?.inputSource)
      || !sameTimeAndDay(row, fixture) || globalConflict(row, fixture) || globalConflict(row, leader))) continue;
    for (const row of legacy) suppressed.set(row, { canonicalId: canonicalOutputId(fixture),
      selectedInputSource: leader.aiAssessment.inputSource, reason: "EXPLICIT_CANONICAL_PRODUCER_SUPERSEDES_LEGACY_ALIAS" });
  }
  return { matches: rows.map(row => suppressed.has(row) ? { ...row, supersededAiAssessment: row.aiAssessment,
    aiAssessment: null, assessmentOwnership: suppressed.get(row) } : row), superseded: [...suppressed.values()] };
}

export function joinCanonicalFixturesWithModelAssessments(
  canonicalFixtures = [],
  assessmentRows = []
) {
  const canonicalRows = Array.isArray(canonicalFixtures) ? canonicalFixtures : [];
  const ownership = resolveCanonicalAssessmentOwnership(canonicalRows, Array.isArray(assessmentRows) ? assessmentRows : []);
  const inputRows = ownership.matches;
  const assessments = inputRows.filter(hasModelAssessment);
  const nonAssessmentInputRows = inputRows.filter(row => !hasModelAssessment(row));
  const assessmentIndex = buildUniqueAliasIndex(assessments);
  const usedAssessments = new Set();
  const joinedMatches = [];
  const canonicalRowsWithoutAssessment = [];
  const ambiguousCanonicalMatches = [];
  const canonicalRowsMissingIdentity = [];

  for (const canonicalFixture of canonicalRows) {
    const canonicalId = canonicalOutputId(canonicalFixture);
    const aliases = exactFixtureAliases(canonicalFixture);

    if (!canonicalId || aliases.length === 0) {
      canonicalRowsMissingIdentity.push(canonicalFixture);
      continue;
    }

    const matchedAssessments = new Set();
    const ambiguousAliases = [];

    for (const alias of aliases) {
      if (assessmentIndex.ambiguousAliases.has(alias)) {
        ambiguousAliases.push(alias);
        continue;
      }

      const assessment = assessmentIndex.byAlias.get(alias);
      if (assessment && !(canonicalFixture?.dayKey && assessment?.dayKey && canonicalFixture.dayKey !== assessment.dayKey)) {
        matchedAssessments.add(assessment);
      }
    }

    if (matchedAssessments.size > 1 || ambiguousAliases.length > 0) {
      ambiguousCanonicalMatches.push({
        canonicalId,
        aliases,
        ambiguousAliases: [...new Set(ambiguousAliases)].sort(),
        assessmentMatchIds: [...matchedAssessments]
          .map(row => canonicalOutputId(row))
          .filter(Boolean)
          .sort()
      });
      continue;
    }

    if (matchedAssessments.size === 0) {
      canonicalRowsWithoutAssessment.push(canonicalFixture);
      continue;
    }

    const assessment = [...matchedAssessments][0];

    if (usedAssessments.has(assessment)) {
      ambiguousCanonicalMatches.push({
        canonicalId,
        aliases,
        ambiguousAliases: [],
        assessmentMatchIds: [canonicalOutputId(assessment)].filter(Boolean),
        reason: "assessment_row_matched_multiple_canonical_fixtures"
      });
      continue;
    }

    usedAssessments.add(assessment);
    joinedMatches.push(canonicalJoinedRow(canonicalFixture, assessment));
  }

  const orphanAssessmentRows = assessments.filter(row => !usedAssessments.has(row));

  return {
    joinedMatches,
    orphanAssessmentRows,
    nonAssessmentInputRows,
    canonicalRowsWithoutAssessment,
    ambiguousCanonicalMatches,
    canonicalRowsMissingIdentity,
    ambiguousAssessmentAliases: [...assessmentIndex.ambiguousAliases].sort(),
    summary: {
      canonicalFixtures: canonicalRows.length,
      inputRows: inputRows.length,
      assessmentRows: assessments.length,
      nonAssessmentInputRows: nonAssessmentInputRows.length,
      joinedMatches: joinedMatches.length,
      orphanAssessmentRows: orphanAssessmentRows.length,
      canonicalRowsWithoutAssessment: canonicalRowsWithoutAssessment.length,
      ambiguousCanonicalMatches: ambiguousCanonicalMatches.length,
      canonicalRowsMissingIdentity: canonicalRowsMissingIdentity.length,
      ambiguousAssessmentAliases: assessmentIndex.ambiguousAliases.size,
      supersededLegacyAssessments: ownership.superseded.length
    }
  };
}

export function validatePicksAgainstCanonicalFixtures(picks = [], canonicalFixtures = []) {
  const canonicalRows = Array.isArray(canonicalFixtures) ? canonicalFixtures : [];
  const pickRows = Array.isArray(picks) ? picks : [];
  const canonicalIndex = buildUniqueAliasIndex(canonicalRows);
  const validPicks = [];
  const orphanPicks = [];
  const ambiguousPicks = [];

  for (const pick of pickRows) {
    const matchedCanonicalRows = new Set();
    const ambiguousAliases = [];

    for (const alias of exactFixtureAliases(pick)) {
      if (canonicalIndex.ambiguousAliases.has(alias)) {
        ambiguousAliases.push(alias);
        continue;
      }

      const fixture = canonicalIndex.byAlias.get(alias);
      if (fixture) matchedCanonicalRows.add(fixture);
    }

    if (ambiguousAliases.length > 0 || matchedCanonicalRows.size > 1) {
      ambiguousPicks.push({
        pick,
        ambiguousAliases: [...new Set(ambiguousAliases)].sort(),
        canonicalMatches: [...matchedCanonicalRows]
          .map(row => canonicalOutputId(row))
          .filter(Boolean)
          .sort()
      });
      continue;
    }

    if (matchedCanonicalRows.size === 0) {
      orphanPicks.push(pick);
      continue;
    }

    validPicks.push(pick);
  }

  return {
    ok: orphanPicks.length === 0 && ambiguousPicks.length === 0,
    validPicks,
    orphanPicks,
    ambiguousPicks,
    ambiguousCanonicalAliases: [...canonicalIndex.ambiguousAliases].sort(),
    summary: {
      picks: pickRows.length,
      validPicks: validPicks.length,
      orphanPicks: orphanPicks.length,
      ambiguousPicks: ambiguousPicks.length,
      canonicalFixtures: canonicalRows.length,
      ambiguousCanonicalAliases: canonicalIndex.ambiguousAliases.size
    }
  };
}
