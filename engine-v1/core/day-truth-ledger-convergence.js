function clean(value) {
  return String(value ?? "").trim();
}

function portableDataPath(value) {
  const raw =
    clean(value)
      .replaceAll("\\", "/");

  if (!raw) {
    return null;
  }

  if (raw.startsWith("data/")) {
    return raw;
  }

  const marker = "/data/";
  const index =
    raw.lastIndexOf(marker);

  return index >= 0
    ? raw.slice(index + 1)
    : raw;
}

function uniqueSorted(values) {
  return [
    ...new Set(
      (
        Array.isArray(values)
          ? values
          : []
      )
        .map(clean)
        .filter(Boolean)
    )
  ].sort();
}

function fixtureId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.fixtureId ||
    row?.id
  );
}

function settlementRowId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.fixtureId ||
    row?.matchKeys?.[0]
  );
}

function countDuplicates(values) {
  const counts =
    new Map();

  for (
    const raw of
    Array.isArray(values)
      ? values
      : []
  ) {
    const value =
      clean(raw);

    if (!value) {
      continue;
    }

    counts.set(
      value,
      (counts.get(value) || 0) + 1
    );
  }

  return [
    ...counts.entries()
  ]
    .filter(
      ([, count]) =>
        count > 1
    )
    .map(
      ([value]) =>
        value
    )
    .sort();
}

function difference(
  left,
  right
) {
  const rightSet =
    new Set(right);

  return uniqueSorted(
    left.filter(
      value =>
        !rightSet.has(value)
    )
  );
}

function exactSettlementSummary(
  rows
) {
  const sourceRows =
    Array.isArray(rows)
      ? rows
      : [];

  const normalized =
    sourceRows.map(
      row =>
        clean(
          row?.result
        ).toUpperCase()
    );

  const count =
    result =>
      normalized.filter(
        value =>
          value === result
      ).length;

  const winRows =
    count("WIN");

  const lossRows =
    count("LOSS");

  const voidRows =
    count("VOID");

  const unresolvedRows =
    count("UNRESOLVED");

  const settledRows =
    winRows +
    lossRows +
    voidRows;

  return {
    totalRows:
      sourceRows.length,

    settledRows,
    unresolvedRows,
    winRows,
    lossRows,
    voidRows,

    unknownRows:
      sourceRows.length -
      settledRows -
      unresolvedRows
  };
}

export const DAY_TRUTH_DOWNSTREAM_STATE =
  Object.freeze({
    NOT_OBSERVED:
      "NOT_OBSERVED",

    PRESENT_CONVERGED:
      "PRESENT_CONVERGED",

    PRESENT_PARTIAL:
      "PRESENT_PARTIAL",

    PRESENT_UNRESOLVED:
      "PRESENT_UNRESOLVED",

    PRESENT_CONFLICT:
      "PRESENT_CONFLICT"
  });

export const DAY_TRUTH_DOWNSTREAM_OVERALL_STATE =
  Object.freeze({
    NOT_OBSERVED:
      "NOT_OBSERVED",

    PARTIALLY_OBSERVED:
      "PARTIALLY_OBSERVED",

    CONVERGED:
      "CONVERGED",

    INCOMPLETE:
      "INCOMPLETE",

    CONFLICT:
      "CONFLICT"
  });

function buildHistoryConvergence(
  ledger,
  observation = {}
) {
  const expectedIds =
    uniqueSorted(
      ledger.fixtures
        .filter(
          row =>
            row?.decision
              ?.historyEligible ===
            true
        )
        .map(fixtureId)
    );

  if (
    observation
      ?.observed !==
    true
  ) {
    return {
      state:
        DAY_TRUTH_DOWNSTREAM_STATE
          .NOT_OBSERVED,

      observed:
        false,

      sourceExists:
        Boolean(
          observation
            ?.sourceExists
        ),

      sourcePath:
        portableDataPath(
          observation?.file
        ),

      expectedEligibleRows:
        expectedIds.length,

      persistedRows:
        0,

      missingEligibleFixtureIds:
        expectedIds,

      unexpectedFixtureIds:
        [],

      duplicateFixtureIds:
        [],

      invalidTruthContractFixtureIds:
        [],

      structuralIssues:
        uniqueSorted(
          observation
            ?.structuralIssues ||
          []
        )
    };
  }

  const rawPersistedIds =
    (
      observation
        ?.fixtureIds ||
      []
    )
      .map(clean)
      .filter(Boolean);

  const persistedIds =
    uniqueSorted(
      rawPersistedIds
    );

  const missing =
    difference(
      expectedIds,
      persistedIds
    );

  const unexpected =
    difference(
      persistedIds,
      expectedIds
    );

  const duplicates =
    uniqueSorted([
      ...(
        observation
          ?.duplicateFixtureIds ||
        []
      ),
      ...countDuplicates(
        rawPersistedIds
      )
    ]);

  const invalidTruth =
    uniqueSorted(
      observation
        ?.invalidTruthContractFixtureIds ||
      []
    );

  const structuralIssues =
    uniqueSorted(
      observation
        ?.structuralIssues ||
      []
    );

  const conflict =
    unexpected.length > 0 ||
    duplicates.length > 0 ||
    invalidTruth.length > 0 ||
    structuralIssues.length > 0;

  const state =
    conflict
      ? DAY_TRUTH_DOWNSTREAM_STATE
          .PRESENT_CONFLICT

      : missing.length > 0
        ? DAY_TRUTH_DOWNSTREAM_STATE
            .PRESENT_PARTIAL

        : DAY_TRUTH_DOWNSTREAM_STATE
            .PRESENT_CONVERGED;

  return {
    state,

    observed:
      true,

    sourceExists:
      Boolean(
        observation
          ?.sourceExists
      ),

    sourcePath:
      portableDataPath(
        observation?.file
      ),

    expectedEligibleRows:
      expectedIds.length,

    persistedRows:
      Number(
        observation
          ?.rowCount ??
        rawPersistedIds.length
      ),

    missingEligibleFixtureIds:
      missing,

    unexpectedFixtureIds:
      unexpected,

    duplicateFixtureIds:
      duplicates,

    invalidTruthContractFixtureIds:
      invalidTruth,

    structuralIssues
  };
}

function buildPublicationConvergence(
  ledger,
  observation = {}
) {
  const canonicalIds =
    uniqueSorted(
      ledger.fixtures
        .map(fixtureId)
    );

  if (
    observation
      ?.observed !==
    true
  ) {
    return {
      state:
        DAY_TRUTH_DOWNSTREAM_STATE
          .NOT_OBSERVED,

      observed:
        false,

      sourcePath:
        portableDataPath(
          observation?.file
        ),

      canonicalRows:
        canonicalIds.length,

      publishedRows:
        0,

      missingCanonicalFixtureIds:
        canonicalIds,

      extraPublishedFixtureIds:
        [],

      duplicatePublishedFixtureIds:
        []
    };
  }

  const rawPublishedIds =
    (
      observation
        ?.fixtureIds ||
      []
    )
      .map(clean)
      .filter(Boolean);

  const publishedIds =
    uniqueSorted(
      rawPublishedIds
    );

  const duplicates =
    countDuplicates(
      rawPublishedIds
    );

  const missing =
    difference(
      canonicalIds,
      publishedIds
    );

  const extra =
    difference(
      publishedIds,
      canonicalIds
    );

  const state =
    duplicates.length > 0 ||
    extra.length > 0
      ? DAY_TRUTH_DOWNSTREAM_STATE
          .PRESENT_CONFLICT

      : missing.length > 0
        ? DAY_TRUTH_DOWNSTREAM_STATE
            .PRESENT_PARTIAL

        : DAY_TRUTH_DOWNSTREAM_STATE
            .PRESENT_CONVERGED;

  return {
    state,

    observed:
      true,

    sourcePath:
      portableDataPath(
        observation?.file
      ),

    canonicalRows:
      canonicalIds.length,

    publishedRows:
      Number(
        observation
          ?.fixtureRows ??
        rawPublishedIds.length
      ),

    missingCanonicalFixtureIds:
      missing,

    extraPublishedFixtureIds:
      extra,

    duplicatePublishedFixtureIds:
      duplicates
  };
}

function buildSettlementConvergence(
  ledger,
  observation = {}
) {
  if (
    observation
      ?.observed !==
    true
  ) {
    return {
      state:
        DAY_TRUTH_DOWNSTREAM_STATE
          .NOT_OBSERVED,

      observed:
        false,

      bundlePath:
        portableDataPath(
          observation?.bundlePath
        ),

      aggregateSummaryPath:
        portableDataPath(
          observation
            ?.aggregateSummaryPath
        ),

      ...exactSettlementSummary(
        []
      ),

      orphanSettlementRows:
        [],

      incompatibleSettlementRows:
        [],

      structurallyInvalidRows:
        [],

      structuralIssues:
        uniqueSorted(
          observation
            ?.structuralIssues ||
          []
        )
    };
  }

  const byId =
    new Map(
      ledger.fixtures
        .map(
          row => [
            fixtureId(row),
            row
          ]
        )
    );

  const rows =
    Array.isArray(
      observation?.rows
    )
      ? observation.rows
      : [];

  const structuralIssues =
    uniqueSorted(
      observation
        ?.structuralIssues ||
      []
    );

  const orphanSettlementRows =
    [];

  const incompatibleSettlementRows =
    [];

  const structurallyInvalidRows =
    [];

  for (
    let index = 0;
    index < rows.length;
    index++
  ) {
    const row =
      rows[index];

    const id =
      settlementRowId(row);

    const result =
      clean(
        row?.result
      ).toUpperCase();

    if (
      !id ||
      ![
        "WIN",
        "LOSS",
        "VOID",
        "UNRESOLVED"
      ].includes(result)
    ) {
      structurallyInvalidRows
        .push({
          rowIndex:
            index,

          canonicalId:
            id || null,

          result:
            result || null,

          reason:
            !id
              ? "settlement_row_missing_fixture_id"
              : "settlement_row_result_invalid"
        });

      continue;
    }

    const fixture =
      byId.get(id);

    if (!fixture) {
      orphanSettlementRows
        .push({
          rowIndex:
            index,

          canonicalId:
            id,

          result,

          reason:
            "settlement_row_missing_canonical_membership"
        });

      continue;
    }

    if (
      (
        result === "WIN" ||
        result === "LOSS"
      ) &&
      fixture
        ?.decision
        ?.scoredSettlementEligible !==
      true
    ) {
      incompatibleSettlementRows
        .push({
          rowIndex:
            index,

          canonicalId:
            id,

          result,

          reason:
            "scored_settlement_without_verified_played_final"
        });

      continue;
    }

    if (
      result === "VOID" &&
      fixture
        ?.decision
        ?.voidSettlementEligible !==
      true
    ) {
      incompatibleSettlementRows
        .push({
          rowIndex:
            index,

          canonicalId:
            id,

          result,

          reason:
            "void_settlement_without_nonplayed_terminal_truth"
        });
    }
  }

  const summary =
    exactSettlementSummary(
      rows
    );

  const hasConflict =
    structuralIssues.length > 0 ||
    orphanSettlementRows.length > 0 ||
    incompatibleSettlementRows.length > 0 ||
    structurallyInvalidRows.length > 0 ||
    summary.unknownRows > 0;

  const state =
    hasConflict
      ? DAY_TRUTH_DOWNSTREAM_STATE
          .PRESENT_CONFLICT

      : summary.unresolvedRows > 0
        ? DAY_TRUTH_DOWNSTREAM_STATE
            .PRESENT_UNRESOLVED

        : DAY_TRUTH_DOWNSTREAM_STATE
            .PRESENT_CONVERGED;

  return {
    state,

    observed:
      true,

    bundlePath:
      portableDataPath(
        observation?.bundlePath
      ),

    aggregateSummaryPath:
      portableDataPath(
        observation
          ?.aggregateSummaryPath
      ),

    ...summary,

    orphanSettlementRows,
    incompatibleSettlementRows,
    structurallyInvalidRows,
    structuralIssues
  };
}

function buildSystemHealthObservation(
  observation = {}
) {
  if (
    observation
      ?.observed !==
    true
  ) {
    return {
      observed:
        false,

      state:
        "NOT_OBSERVED",

      sourcePath:
        portableDataPath(
          observation?.file
        ),

      severity:
        null,

      alert:
        null,

      activeIssueCount:
        null,

      actionableIssueCount:
        null
    };
  }

  const payload =
    observation?.payload ||
    {};

  const severity =
    clean(
      payload?.severity ||
      payload?.status
    ).toLowerCase() ||
    null;

  const state =
    severity === "error"
      ? "OBSERVED_ERROR"

      : severity === "warning"
        ? "OBSERVED_WARNING"

        : severity === "info"
          ? "OBSERVED_INFO"

          : "OBSERVED_UNKNOWN";

  const integerOrNull =
    value => {
      const numeric =
        Number(value);

      return (
        Number.isInteger(
          numeric
        ) &&
        numeric >= 0
      )
        ? numeric
        : null;
    };

  return {
    observed:
      true,

    state,

    sourcePath:
      portableDataPath(
        observation?.file
      ),

    severity,

    alert:
      typeof payload?.alert ===
      "boolean"
        ? payload.alert
        : null,

    activeIssueCount:
      integerOrNull(
        payload?.activeIssueCount
      ),

    actionableIssueCount:
      integerOrNull(
        payload?.actionableIssueCount
      )
  };
}

function overallState(
  history,
  settlement,
  publication
) {
  const states = [
    history.state,
    settlement.state,
    publication.state
  ];

  if (
    states.includes(
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_CONFLICT
    )
  ) {
    return DAY_TRUTH_DOWNSTREAM_OVERALL_STATE
      .CONFLICT;
  }

  if (
    states.includes(
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_PARTIAL
    ) ||
    states.includes(
      DAY_TRUTH_DOWNSTREAM_STATE
        .PRESENT_UNRESOLVED
    )
  ) {
    return DAY_TRUTH_DOWNSTREAM_OVERALL_STATE
      .INCOMPLETE;
  }

  const observed =
    [
      history,
      settlement,
      publication
    ]
      .filter(
        item =>
          item.observed === true
      )
      .length;

  if (observed === 0) {
    return DAY_TRUTH_DOWNSTREAM_OVERALL_STATE
      .NOT_OBSERVED;
  }

  if (observed < 3) {
    return DAY_TRUTH_DOWNSTREAM_OVERALL_STATE
      .PARTIALLY_OBSERVED;
  }

  return DAY_TRUTH_DOWNSTREAM_OVERALL_STATE
    .CONVERGED;
}

export function buildDayTruthLedgerDownstreamConvergence({
  ledger,
  historyObservation = {},
  settlementObservation = {},
  publicationObservation = {},
  systemHealthObservation = {}
} = {}) {
  if (
    !ledger ||
    !Array.isArray(
      ledger.fixtures
    )
  ) {
    throw new Error(
      "day_truth_ledger_required"
    );
  }

  const history =
    buildHistoryConvergence(
      ledger,
      historyObservation
    );

  const settlement =
    buildSettlementConvergence(
      ledger,
      settlementObservation
    );

  const publication =
    buildPublicationConvergence(
      ledger,
      publicationObservation
    );

  const systemHealth =
    buildSystemHealthObservation(
      systemHealthObservation
    );

  return {
    overallState:
      overallState(
        history,
        settlement,
        publication
      ),

    truthFingerprint:
      clean(
        ledger
          .truthFingerprint
      ) ||
      null,

    history,
    settlement,
    publication,
    systemHealth,

    authority: {
      footballTruthMutable:
        false,

      downstreamMutationAuthorized:
        false,

      repairAuthorized:
        false,

      observationsAffectTruthFingerprint:
        false
    }
  };
}
