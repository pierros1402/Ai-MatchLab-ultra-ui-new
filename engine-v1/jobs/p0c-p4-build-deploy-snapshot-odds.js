import crypto from "crypto";

export const P0C_P4_DEPLOY_SNAPSHOT_ODDS_SCHEMA =
  "ai-matchlab.p0c-p4-deploy-snapshot-odds.v1";

export const P0C_P4_DEPLOY_SNAPSHOT_ODDS_SOURCE =
  "autonomous-odds-capture";

function clean(value) {
  return String(value ?? "").trim();
}

function assertDayKey(value) {
  const dayKey =
    clean(value);

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    throw new Error(
      "p0c_p4_deploy_snapshot_odds_day_key_invalid",
    );
  }

  return dayKey;
}

function assertGeneratedAt(value) {
  const generatedAt =
    clean(value);

  if (
    !generatedAt ||
    Number.isNaN(
      Date.parse(generatedAt),
    )
  ) {
    throw new Error(
      "p0c_p4_deploy_snapshot_odds_generated_at_invalid",
    );
  }

  return generatedAt;
}

function assertMatches(value) {
  if (!Array.isArray(value)) {
    throw new Error(
      "p0c_p4_deploy_snapshot_odds_matches_invalid",
    );
  }

  return value.map(
    (row, index) => {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row)
      ) {
        throw new Error(
          `p0c_p4_deploy_snapshot_odds_match_invalid:${index}`,
        );
      }

      return row;
    },
  );
}

function assertCount(value) {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      "p0c_p4_deploy_snapshot_odds_count_invalid",
    );
  }

  return value;
}

export function computeP0CP4DeploySnapshotOddsContentHash(
  matches,
) {
  const checkedMatches =
    assertMatches(matches);

  const stable =
    checkedMatches.map(match => ({
      matchId:
        match.matchId,
      leagueSlug:
        match.leagueSlug,
      competition:
        match.competition,
      home:
        match.home,
      away:
        match.away,
      dayKey:
        match.dayKey,
      kickoffUtc:
        match.kickoffUtc ||
        match.kickoffLocal,
      market:
        match.market,
      ai:
        match.aiAssessment?.odds ||
        null,
    }));

  return crypto
    .createHash("sha1")
    .update(
      JSON.stringify(stable),
    )
    .digest("hex");
}

export function buildP0CP4DeploySnapshotOdds({
  dayKey,
  generatedAt,
  oddsDay,
} = {}) {
  const normalizedDayKey =
    assertDayKey(dayKey);

  const normalizedGeneratedAt =
    assertGeneratedAt(generatedAt);

  if (
    !oddsDay ||
    typeof oddsDay !== "object" ||
    Array.isArray(oddsDay)
  ) {
    throw new Error(
      "p0c_p4_deploy_snapshot_odds_day_invalid",
    );
  }

  const sourceMatches =
    assertMatches(
      oddsDay.matches,
    );

  const count =
    assertCount(
      oddsDay.count,
    );

  const matches =
    sourceMatches.map(
      match => ({
        ...match,
      }),
    );

  return Object.freeze({
    ok:
      true,
    date:
      normalizedDayKey,
    generatedAt:
      normalizedGeneratedAt,
    source:
      P0C_P4_DEPLOY_SNAPSHOT_ODDS_SOURCE,
    hash:
      computeP0CP4DeploySnapshotOddsContentHash(
        matches,
      ),
    count,
    matches:
      Object.freeze(matches),
  });
}

export function buildP0CP4DeploySnapshotOddsFromMatches({
  dayKey,
  generatedAt,
  matches,
} = {}) {
  const checkedMatches =
    assertMatches(matches);

  return buildP0CP4DeploySnapshotOdds({
    dayKey,
    generatedAt,
    oddsDay: {
      count:
        checkedMatches.length,
      matches:
        checkedMatches,
    },
  });
}
