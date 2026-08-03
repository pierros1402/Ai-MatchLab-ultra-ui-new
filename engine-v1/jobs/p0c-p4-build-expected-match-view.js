export const P0C_P4_EXPECTED_MATCH_VIEW_SCHEMA =
  "ai-matchlab.p0c-p4-expected-match-view.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function assertDayKey(value) {
  const dayKey = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    throw new Error(
      "p0c_p4_expected_match_day_key_invalid",
    );
  }
  return dayKey;
}

function assertRecordedAt(value) {
  const recordedAt = clean(value);
  const parsed = Date.parse(recordedAt);
  if (
    !recordedAt ||
    !Number.isFinite(parsed)
  ) {
    throw new Error(
      "p0c_p4_expected_match_recorded_at_invalid",
    );
  }
  return recordedAt;
}

function assertFixturesAll(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray(value.matches)
  ) {
    throw new Error(
      "p0c_p4_expected_match_fixtures_all_invalid",
    );
  }
  return value;
}

function readIdentity(row) {
  return clean(
    row?.canonicalId ||
    row?.id ||
    row?.matchId,
  );
}

function normalizeMatch(row, dayKey) {
  if (!row || typeof row !== "object") {
    return null;
  }

  if (clean(row.dayKey) !== dayKey) {
    return null;
  }

  const matchId = readIdentity(row);
  const home = clean(
    row.home ||
    row.homeTeam,
  );
  const away = clean(
    row.away ||
    row.awayTeam,
  );

  if (!matchId || !home || !away) {
    return null;
  }

  return Object.freeze({
    matchId,
    home,
    away,
    leagueSlug:
      clean(row.leagueSlug),
    leagueName:
      clean(
        row.leagueName ||
        row.competition,
      ),
    kickoffUtc:
      clean(
        row.kickoffUtc ||
        row.kickoffLocal,
      ),
  });
}

export function buildP0CP4ExpectedMatchView({
  dayKey,
  fixturesAll,
  recordedAt,
  source = "fixtures-all",
} = {}) {
  const normalizedDayKey =
    assertDayKey(dayKey);
  const input =
    assertFixturesAll(fixturesAll);
  const normalizedRecordedAt =
    assertRecordedAt(recordedAt);
  const normalizedSource =
    clean(source);

  if (!normalizedSource) {
    throw new Error(
      "p0c_p4_expected_match_source_invalid",
    );
  }

  const matches = [];
  const matchIds = new Set();

  for (const row of input.matches) {
    const normalized =
      normalizeMatch(
        row,
        normalizedDayKey,
      );

    if (!normalized) {
      continue;
    }

    if (matchIds.has(normalized.matchId)) {
      throw new Error(
        `p0c_p4_expected_match_duplicate_id:${normalized.matchId}`,
      );
    }

    matchIds.add(normalized.matchId);
    matches.push(normalized);
  }

  return Object.freeze({
    schema:
      P0C_P4_EXPECTED_MATCH_VIEW_SCHEMA,
    dayKey:
      normalizedDayKey,
    recordedAt:
      normalizedRecordedAt,
    source:
      normalizedSource,
    matchCount:
      matches.length,
    matches:
      Object.freeze(matches),
  });
}

export function buildP0CP4ExpectedMatchViewFromExisting({
  dayKey,
  fixturesAll,
  existingArtifact,
} = {}) {
  if (
    !existingArtifact ||
    typeof existingArtifact !== "object" ||
    Array.isArray(existingArtifact)
  ) {
    throw new Error(
      "p0c_p4_expected_match_existing_artifact_invalid",
    );
  }

  if (
    clean(existingArtifact.dayKey) !==
    assertDayKey(dayKey)
  ) {
    throw new Error(
      "p0c_p4_expected_match_existing_day_mismatch",
    );
  }

  return buildP0CP4ExpectedMatchView({
    dayKey,
    fixturesAll,
    recordedAt:
      existingArtifact.recordedAt,
    source:
      existingArtifact.source ||
      "fixtures-all",
  });
}
