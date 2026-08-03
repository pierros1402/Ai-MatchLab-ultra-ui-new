export const P0C_P4_DEPLOY_SNAPSHOT_FIXTURES_SCHEMA =
  "ai-matchlab.p0c-p4-deploy-snapshot-fixtures.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function assertDayKey(value) {
  const dayKey = clean(value);

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    throw new Error(
      "p0c_p4_deploy_snapshot_fixtures_day_key_invalid",
    );
  }

  return dayKey;
}

function assertRowArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(
      `p0c_p4_deploy_snapshot_fixtures_${name}_invalid`,
    );
  }

  return value;
}

function identityKeys(row) {
  return [
    row?.canonicalId,
    row?.id,
    row?.matchId,
    row?.providerMatchId,
    row?.sourceMatchId,
    row?.sourceId,
    row?.matchKey,
  ]
    .map(clean)
    .filter(Boolean);
}

function normalizedProviderRound(row) {
  const providerRound =
    row?.providerRound;

  if (
    !providerRound ||
    providerRound.verified !== true ||
    !Number.isInteger(
      providerRound.roundNumber,
    )
  ) {
    return null;
  }

  return Object.freeze({
    status:
      providerRound.status ||
      "ready",
    verified:
      true,
    reason:
      providerRound.reason ||
      null,
    source:
      providerRound.source ||
      "flashscore_match_page",
    roundNumber:
      providerRound.roundNumber,
    roundLabel:
      providerRound.roundLabel ||
      `Round ${providerRound.roundNumber}`,
  });
}

function enrichFromDisplayRows(
  fixtureRows,
  displayRows,
) {
  if (!displayRows.length) {
    return fixtureRows.map(row => ({
      ...row,
    }));
  }

  const byIdentity =
    new Map();

  for (const displayRow of displayRows) {
    if (
      !displayRow ||
      typeof displayRow !== "object" ||
      Array.isArray(displayRow)
    ) {
      continue;
    }

    for (
      const key of
      identityKeys(displayRow)
    ) {
      if (!byIdentity.has(key)) {
        byIdentity.set(
          key,
          displayRow,
        );
      }
    }
  }

  return fixtureRows.map(row => {
    let displayRow =
      null;

    for (
      const key of
      identityKeys(row)
    ) {
      if (byIdentity.has(key)) {
        displayRow =
          byIdentity.get(key);

        break;
      }
    }

    const providerRound =
      normalizedProviderRound(
        displayRow,
      );

    if (!providerRound) {
      return {
        ...row,
      };
    }

    return {
      ...row,
      providerRound,
      roundNumber:
        providerRound.roundNumber,
      roundLabel:
        providerRound.roundLabel,
    };
  });
}

function alignPublicFixtureIdentity(row) {
  const canonicalId =
    clean(row?.canonicalId);

  const matchId =
    clean(row?.matchId);

  if (
    !canonicalId ||
    matchId === canonicalId
  ) {
    return {
      ...row,
    };
  }

  return {
    ...row,
    matchId:
      canonicalId,
    providerMatchId:
      row?.providerMatchId ||
      row?.matchId ||
      row?.sourceMatchId ||
      null,
  };
}

function publicIdentity(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.id,
  );
}

export function buildP0CP4DeploySnapshotFixtures({
  dayKey,
  fixtureRows,
  displayRows = [],
} = {}) {
  const normalizedDayKey =
    assertDayKey(dayKey);

  const sourceRows =
    assertRowArray(
      fixtureRows,
      "fixture_rows",
    );

  const sourceDisplayRows =
    assertRowArray(
      displayRows,
      "display_rows",
    );

  const checkedRows =
    sourceRows.map(
      (row, index) => {
        if (
          !row ||
          typeof row !== "object" ||
          Array.isArray(row)
        ) {
          throw new Error(
            `p0c_p4_deploy_snapshot_fixtures_row_invalid:${index}`,
          );
        }

        const rowDayKey =
          clean(row.dayKey);

        if (
          rowDayKey &&
          rowDayKey !== normalizedDayKey
        ) {
          throw new Error(
            `p0c_p4_deploy_snapshot_fixtures_day_mismatch:${index}:${rowDayKey}`,
          );
        }

        return row;
      },
    );

  const enrichedRows =
    enrichFromDisplayRows(
      checkedRows,
      sourceDisplayRows,
    );

  const fixtures =
    enrichedRows.map(
      alignPublicFixtureIdentity,
    );

  const identities =
    new Set();

  for (
    let index = 0;
    index < fixtures.length;
    index += 1
  ) {
    const identity =
      publicIdentity(
        fixtures[index],
      );

    if (!identity) {
      throw new Error(
        `p0c_p4_deploy_snapshot_fixtures_identity_missing:${index}`,
      );
    }

    if (identities.has(identity)) {
      throw new Error(
        `p0c_p4_deploy_snapshot_fixtures_duplicate_identity:${identity}`,
      );
    }

    identities.add(identity);
  }

  return Object.freeze({
    ok:
      true,
    date:
      normalizedDayKey,
    count:
      fixtures.length,
    fixtures:
      Object.freeze(fixtures),
  });
}

export function buildP0CP4DeploySnapshotFixturesFromArtifacts({
  dayKey,
  fixtureUniverse,
  fixturesAll,
} = {}) {
  if (
    !fixtureUniverse ||
    typeof fixtureUniverse !== "object" ||
    Array.isArray(fixtureUniverse) ||
    !Array.isArray(
      fixtureUniverse.fixtures,
    )
  ) {
    throw new Error(
      "p0c_p4_deploy_snapshot_fixtures_universe_invalid",
    );
  }

  if (
    !fixturesAll ||
    typeof fixturesAll !== "object" ||
    Array.isArray(fixturesAll) ||
    !Array.isArray(
      fixturesAll.matches,
    )
  ) {
    throw new Error(
      "p0c_p4_deploy_snapshot_fixtures_fixtures_all_invalid",
    );
  }

  return buildP0CP4DeploySnapshotFixtures({
    dayKey,
    fixtureRows:
      fixtureUniverse.fixtures,
    displayRows:
      fixturesAll.matches,
  });
}
