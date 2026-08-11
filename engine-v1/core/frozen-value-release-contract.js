function clean(value) {
  return String(value ?? "").trim();
}

function fixtureIdentitySet(fixtures) {
  const ids = new Set();
  for (const fixture of Array.isArray(fixtures) ? fixtures : []) {
    for (const value of [
      fixture?.canonicalId,
      fixture?.matchId,
      fixture?.providerMatchId,
      fixture?.sourceMatchId,
      fixture?.sourceId,
      fixture?.matchKey
    ]) {
      const id = clean(value);
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function evaluateFrozenValueFixtureBinding({
  preserveSnapshotValueBytes = false,
  dayKey = "",
  valueArtifact = null,
  fixtures = []
} = {}) {
  if (preserveSnapshotValueBytes !== true) {
    return Object.freeze({
      mode: "current_value",
      frozenIdentityBound: false,
      releaseSafe: false,
      frozenPickCount: 0,
      orphanPickCount: 0,
      orphanPickIds: Object.freeze([]),
      missingMatchIdPickCount: 0,
      missingMatchIdPickIndexes: Object.freeze([]),
      dayBound: false,
      canonicalSourceBound: false
    });
  }

  const picks = Array.isArray(valueArtifact?.picks) ? valueArtifact.picks : [];
  const fixtureIds = fixtureIdentitySet(fixtures);
  const orphanPickIds = [];
  const missingMatchIdPickIndexes = [];

  for (let index = 0; index < picks.length; index += 1) {
    const matchId = clean(picks[index]?.matchId);
    if (!matchId) {
      missingMatchIdPickIndexes.push(index);
      continue;
    }
    if (!fixtureIds.has(matchId)) orphanPickIds.push(matchId);
  }

  const expectedDay = clean(dayKey);
  const artifactDay = clean(valueArtifact?.date);
  const dayBound = Boolean(expectedDay) && artifactDay === expectedDay;
  const canonicalSourceBound = clean(valueArtifact?.source) === "canonical_fixtures";
  const coherentCount = Number.isInteger(valueArtifact?.count) &&
    valueArtifact.count >= 0 && valueArtifact.count === picks.length;
  const frozenIdentityBound = Boolean(
    valueArtifact && typeof valueArtifact === "object" &&
    coherentCount && dayBound && canonicalSourceBound &&
    missingMatchIdPickIndexes.length === 0 && orphanPickIds.length === 0
  );

  return Object.freeze({
    mode: "frozen_snapshot",
    frozenIdentityBound,
    releaseSafe: frozenIdentityBound,
    frozenPickCount: picks.length,
    orphanPickCount: orphanPickIds.length,
    orphanPickIds: Object.freeze([...orphanPickIds]),
    missingMatchIdPickCount: missingMatchIdPickIndexes.length,
    missingMatchIdPickIndexes: Object.freeze([...missingMatchIdPickIndexes]),
    dayBound,
    canonicalSourceBound
  });
}

export function isFrozenValueGateReleaseSafe(gate) {
  return Boolean(
    gate && typeof gate === "object" &&
    gate.mode === "frozen_snapshot" &&
    gate.frozenIdentityBound === true &&
    gate.frozenReleaseSafe === true &&
    Number(gate.orphanPickCount || 0) === 0 &&
    Number(gate.missingMatchIdPickCount || 0) === 0
  );
}
