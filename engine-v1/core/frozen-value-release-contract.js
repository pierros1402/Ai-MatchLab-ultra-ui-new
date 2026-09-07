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

export function isFrozenPlanAPublication(
  valueArtifact
) {
  return Boolean(
    valueArtifact &&
    typeof valueArtifact ===
      "object" &&
    valueArtifact?.immutable ===
      true &&
    clean(
      valueArtifact?.planId
    ) === "plan-a" &&
    clean(
      valueArtifact?.outputMode
    ) ===
      "plan-a-observation" &&
    clean(
      valueArtifact
        ?.publicationAuthority
    ) ===
      "frozen_plan_a_observation"
  );
}

function verifiedRecoveryFixtureUniverse(
  valueArtifact
) {
  const primary =
    valueArtifact?.fixtureUniverse;

  const sourceContractUniverse =
    valueArtifact?.sourceContract
      ?.fixtureUniverse;

  if (
    !primary ||
    typeof primary !== "object" ||
    !sourceContractUniverse ||
    typeof sourceContractUniverse !==
      "object"
  ) {
    return null;
  }

  const primaryIds =
    Array.isArray(primary?.canonicalIds)
      ? primary.canonicalIds.map(clean)
      : [];

  const sourceIds =
    Array.isArray(
      sourceContractUniverse
        ?.canonicalIds
    )
      ? sourceContractUniverse
          .canonicalIds
          .map(clean)
      : [];

  const count =
    Number(primary?.count);

  const uniquePrimaryIds =
    new Set(primaryIds);

  const contractInternallyBound =
    clean(primary?.schema) ===
      "ai-matchlab.value-fixture-universe.v1" &&
    clean(primary?.source) ===
      "canonical_fixtures" &&
    Number.isInteger(count) &&
    count >= 0 &&
    primaryIds.length === count &&
    primaryIds.every(Boolean) &&
    uniquePrimaryIds.size ===
      primaryIds.length &&
    /^[a-f0-9]{64}$/i.test(
      clean(primary?.hash)
    ) &&
    clean(
      sourceContractUniverse?.schema
    ) === clean(primary?.schema) &&
    clean(
      sourceContractUniverse?.source
    ) === "canonical_fixtures" &&
    Number(
      sourceContractUniverse?.count
    ) === count &&
    clean(
      sourceContractUniverse?.hash
    ) === clean(primary?.hash) &&
    JSON.stringify(sourceIds) ===
      JSON.stringify(primaryIds);

  if (!contractInternallyBound) {
    return null;
  }

  return Object.freeze({
    schema: clean(primary.schema),
    source: "canonical_fixtures",
    count,
    hash: clean(primary.hash),
    canonicalIds:
      Object.freeze([...primaryIds])
  });
}

function canonicalPublishedFixtureSet(
  fixtures
) {
  const rows =
    Array.isArray(fixtures)
      ? fixtures
      : [];

  const canonicalIds =
    rows.map(
      row => clean(row?.canonicalId)
    );

  const set =
    new Set(canonicalIds);

  return {
    rowCount: rows.length,
    complete:
      canonicalIds.every(Boolean),
    unique:
      set.size === canonicalIds.length,
    ids: set
  };
}

function verifiedHistoricalRecoveryContract(
  valueArtifact,
  dayKey = ""
) {
  const expectedDay =
    clean(dayKey);

  const artifactDay =
    clean(valueArtifact?.date);

  const universe =
    verifiedRecoveryFixtureUniverse(
      valueArtifact
    );

  const valid =
    Boolean(
      valueArtifact &&
      typeof valueArtifact ===
        "object" &&
      valueArtifact?.ok === true &&
      clean(valueArtifact?.schema) ===
        "ai-matchlab.value-plan-a-observation.v1" &&
      clean(valueArtifact?.source) ===
        "historical_missing_observation_recovery_sentinel" &&
      clean(valueArtifact?.planId) ===
        "plan-a" &&
      clean(valueArtifact?.outputMode) ===
        "plan-a-observation" &&
      valueArtifact?.immutable === true &&
      clean(
        valueArtifact
          ?.publicationAuthority
      ) ===
        "frozen_plan_a_observation" &&
      Number(valueArtifact?.count) ===
        0 &&
      Array.isArray(
        valueArtifact?.picks
      ) &&
      valueArtifact.picks.length ===
        0 &&
      Number(
        valueArtifact
          ?.recoveryContract
          ?.version
      ) === 1 &&
      clean(
        valueArtifact
          ?.recoveryContract
          ?.mode
      ) ===
        "historical_missing_observation_zero_pick_sentinel" &&
      valueArtifact
        ?.recoveryContract
        ?.authenticPayloadRecovered ===
        false &&
      valueArtifact
        ?.recoveryContract
        ?.retrospectivePredictionGeneration ===
        false &&
      valueArtifact
        ?.recoveryContract
        ?.inventedHistoricalPicks ===
        false &&
      valueArtifact
        ?.sourceContract
        ?.recoveryObservation ===
        true &&
      valueArtifact
        ?.sourceContract
        ?.retrospectiveModelOutputUsed ===
        false &&
      valueArtifact
        ?.sourceContract
        ?.deploySnapshotUsedAsFinalTruth ===
        false &&
      valueArtifact
        ?.sourceContract
        ?.observationImmutable ===
        true &&
      clean(
        valueArtifact
          ?.sourceContract
          ?.observationInputArtifact
      ) ===
        "recovery-contract:no-authentic-original-plan-a-payload" &&
      clean(
        valueArtifact?.provenance?.kind
      ) ===
        "historical_missing_observation_recovery_sentinel" &&
      clean(
        valueArtifact
          ?.provenance
          ?.sourcePath
      ) ===
        "recovery-contract:no-authentic-original-plan-a-payload" &&
      (
        clean(
          valueArtifact?.provenance?.reason
        ) ===
          "original_plan_a_payload_unavailable" ||
        clean(
          valueArtifact?.provenance?.reason
        ) ===
          "original_plan_a_payload_unavailable_in_recovery_source"
      ) &&
      valueArtifact
        ?.provenance
        ?.retrospectiveModelRebuild ===
        false &&
      valueArtifact
        ?.provenance
        ?.inventedHistoricalPicks ===
        false &&
      universe &&
      (
        !expectedDay ||
        artifactDay === expectedDay
      )
    );

  if (!valid) return null;

  return Object.freeze({
    dayKey: artifactDay,
    universe
  });
}

export function isVerifiedHistoricalRecoverySentinel(
  valueArtifact,
  dayKey = ""
) {
  return Boolean(
    verifiedHistoricalRecoveryContract(
      valueArtifact,
      dayKey
    )
  );
}

export function evaluateFrozenValueFixtureBinding({
  preserveSnapshotValueBytes = false,
  frozenPublicationAuthority = false,
  dayKey = "",
  valueArtifact = null,
  fixtures = []
} = {}) {
  if (
    preserveSnapshotValueBytes !==
      true &&
    frozenPublicationAuthority !==
      true
  ) {
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
      canonicalSourceBound: false,
      recoveryContractBound: false,
      recoveryPublishedUniverseBound: false
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

  const recoveryCandidate =
    clean(valueArtifact?.source) ===
      "historical_missing_observation_recovery_sentinel";

  const recoveryContract =
    recoveryCandidate
      ? verifiedHistoricalRecoveryContract(
          valueArtifact,
          dayKey
        )
      : null;

  const recoveryContractBound =
    Boolean(recoveryContract);

  const publishedFixtureSet =
    recoveryCandidate
      ? canonicalPublishedFixtureSet(
          fixtures
        )
      : null;

  const recoveryPublishedUniverseBound =
    Boolean(
      recoveryContract &&
      publishedFixtureSet &&
      publishedFixtureSet.complete &&
      publishedFixtureSet.unique &&
      publishedFixtureSet.rowCount ===
        recoveryContract.universe.count &&
      publishedFixtureSet.ids.size ===
        recoveryContract.universe.count &&
      recoveryContract.universe
        .canonicalIds
        .every(
          id =>
            publishedFixtureSet.ids.has(id)
        )
    );

  const canonicalSourceBound =
    recoveryCandidate
      ? recoveryContractBound
      : clean(valueArtifact?.source) ===
          "canonical_fixtures";

  const coherentCount =
    Number.isInteger(valueArtifact?.count) &&
    valueArtifact.count >= 0 &&
    valueArtifact.count === picks.length;

  const frozenIdentityBound =
    recoveryCandidate
      ? Boolean(
          valueArtifact &&
          typeof valueArtifact === "object" &&
          coherentCount &&
          dayBound &&
          canonicalSourceBound &&
          recoveryContractBound &&
          recoveryPublishedUniverseBound &&
          missingMatchIdPickIndexes.length === 0 &&
          orphanPickIds.length === 0
        )
      : Boolean(
          valueArtifact &&
          typeof valueArtifact === "object" &&
          coherentCount &&
          dayBound &&
          canonicalSourceBound &&
          missingMatchIdPickIndexes.length === 0 &&
          orphanPickIds.length === 0
        );

  return Object.freeze({
    mode:
      recoveryCandidate
        ? "historical_recovery_sentinel"
        : "frozen_snapshot",
    frozenIdentityBound,
    releaseSafe: frozenIdentityBound,
    frozenPickCount: picks.length,
    orphanPickCount: orphanPickIds.length,
    orphanPickIds: Object.freeze([...orphanPickIds]),
    missingMatchIdPickCount: missingMatchIdPickIndexes.length,
    missingMatchIdPickIndexes: Object.freeze([...missingMatchIdPickIndexes]),
    dayBound,
    canonicalSourceBound,
    recoveryContractBound,
    recoveryPublishedUniverseBound
  });
}

export function isFrozenValueGateReleaseSafe(gate) {
  const mode =
    clean(gate?.mode);

  const modeSafe =
    mode === "frozen_snapshot" ||
    (
      mode ===
        "historical_recovery_sentinel" &&
      gate?.recoveryContractBound ===
        true &&
      gate?.recoveryPublishedUniverseBound ===
        true
    );

  return Boolean(
    gate && typeof gate === "object" &&
    modeSafe &&
    gate.frozenIdentityBound === true &&
    gate.frozenReleaseSafe === true &&
    Number(gate.orphanPickCount || 0) === 0 &&
    Number(gate.missingMatchIdPickCount || 0) === 0
  );
}
