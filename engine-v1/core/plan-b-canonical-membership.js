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

export function joinCanonicalFixturesWithModelAssessments(
  canonicalFixtures = [],
  assessmentRows = []
) {
  const canonicalRows = Array.isArray(canonicalFixtures) ? canonicalFixtures : [];
  const assessments = Array.isArray(assessmentRows) ? assessmentRows : [];
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
      if (assessment) matchedAssessments.add(assessment);
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
    canonicalRowsWithoutAssessment,
    ambiguousCanonicalMatches,
    canonicalRowsMissingIdentity,
    ambiguousAssessmentAliases: [...assessmentIndex.ambiguousAliases].sort(),
    summary: {
      canonicalFixtures: canonicalRows.length,
      assessmentRows: assessments.length,
      joinedMatches: joinedMatches.length,
      orphanAssessmentRows: orphanAssessmentRows.length,
      canonicalRowsWithoutAssessment: canonicalRowsWithoutAssessment.length,
      ambiguousCanonicalMatches: ambiguousCanonicalMatches.length,
      canonicalRowsMissingIdentity: canonicalRowsMissingIdentity.length,
      ambiguousAssessmentAliases: assessmentIndex.ambiguousAliases.size
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
