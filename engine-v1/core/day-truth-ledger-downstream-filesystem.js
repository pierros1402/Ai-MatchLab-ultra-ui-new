import fs from "node:fs";
import path from "node:path";

import {
  getProjectRoot,
  resolveDataPath
} from "../storage/data-root.js";

import {
  currentSeason
} from "./season.js";

const REQUIRED_PLANS =
  Object.freeze([
    "A",
    "A2",
    "B",
    "B2"
  ]);

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function assertDayKey(value) {
  const dayKey =
    clean(value);

  if (
    !/^20\d{2}-\d{2}-\d{2}$/u
      .test(dayKey)
  ) {
    throw new Error(
      `invalid_day_key:${dayKey || "<empty>"}`
    );
  }

  const [
    year,
    month,
    day
  ] =
    dayKey
      .split("-")
      .map(Number);

  const parsed =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    parsed.getUTCFullYear() !==
      year ||
    parsed.getUTCMonth() + 1 !==
      month ||
    parsed.getUTCDate() !==
      day
  ) {
    throw new Error(
      `invalid_day_key:${dayKey}`
    );
  }

  return dayKey;
}

function readJsonStrict(file) {
  return JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    ).replace(
      /^\uFEFF/u,
      ""
    )
  );
}

function fixtureId(row) {
  return clean(
    row?.id ||
    row?.canonicalId ||
    row?.matchId ||
    row?.fixtureId
  );
}

function duplicateIds(values) {
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

function samePlanSet(values) {
  const normalized =
    [
      ...new Set(
        (
          Array.isArray(values)
            ? values
            : []
        )
          .map(
            value =>
              clean(value)
                .toUpperCase()
          )
          .filter(Boolean)
      )
    ].sort();

  return (
    JSON.stringify(
      normalized
    ) ===
    JSON.stringify(
      [...REQUIRED_PLANS]
        .sort()
    )
  );
}

function historyTruthContractValid(
  row
) {
  const contract =
    row?.truthContract;

  return (
    contract
      ?.canonicalIdExact ===
      true &&

    contract
      ?.athensDayExact ===
      true &&

    contract
      ?.orderedTeamPairMatched ===
      true &&

    contract
      ?.canonicalPlayedTerminal ===
      true &&

    contract
      ?.exactScoreParity ===
      true &&

    contract
      ?.verifiedFinalTruth ===
      true
  );
}

function repoArtifactPath(
  relativePath
) {
  const value =
    clean(relativePath);

  if (!value) {
    return null;
  }

  return path.isAbsolute(
    value
  )
    ? value
    : path.resolve(
        getProjectRoot(),
        value
      );
}

function settlementResultSummary(
  rows
) {
  const sourceRows =
    Array.isArray(rows)
      ? rows
      : [];

  const results =
    sourceRows.map(
      row =>
        clean(
          row?.result
        ).toUpperCase()
    );

  const count =
    result =>
      results.filter(
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

export function readHistoryObservationForDay(
  dayKey
) {
  const exactDayKey =
    assertDayKey(dayKey);

  const season =
    currentSeason(
      new Date(
        `${exactDayKey}T12:00:00.000Z`
      )
    );

  const file =
    resolveDataPath(
      "history",
      `${season}.json`
    );

  if (!fs.existsSync(file)) {
    return {
      observed:
        false,

      sourceExists:
        false,

      file,
      season,

      dayEntryCount:
        0,

      rowCount:
        0,

      fixtureIds:
        [],

      duplicateFixtureIds:
        [],

      invalidTruthContractFixtureIds:
        [],

      structuralIssues:
        []
    };
  }

  const payload =
    readJsonStrict(file);

  const days =
    Array.isArray(
      payload?.days
    )
      ? payload.days
      : [];

  const dayEntries =
    days.filter(
      day =>
        clean(
          day?.dayKey
        ) ===
        exactDayKey
    );

  if (
    dayEntries.length ===
    0
  ) {
    return {
      observed:
        false,

      sourceExists:
        true,

      file,
      season,

      dayEntryCount:
        0,

      rowCount:
        0,

      fixtureIds:
        [],

      duplicateFixtureIds:
        [],

      invalidTruthContractFixtureIds:
        [],

      structuralIssues:
        []
    };
  }

  const rows =
    dayEntries
      .flatMap(
        day =>
          Array.isArray(
            day?.rows
          )
            ? day.rows
            : []
      );

  const ids =
    rows.map(
      fixtureId
    );

  const structuralIssues =
    [];

  if (
    dayEntries.length !==
    1
  ) {
    structuralIssues.push(
      "history_day_entry_cardinality_invalid"
    );
  }

  for (
    const [
      index,
      row
    ] of rows.entries()
  ) {
    if (!fixtureId(row)) {
      structuralIssues.push(
        `history_row_missing_fixture_id:${index}`
      );
    }
  }

  for (
    const entry of
    dayEntries
  ) {
    const entryRows =
      Array.isArray(
        entry?.rows
      )
        ? entry.rows
        : [];

    if (
      Number(
        entry?.matchCount
      ) !==
      entryRows.length
    ) {
      structuralIssues.push(
        "history_match_count_mismatch"
      );
    }
  }

  const invalidTruthContractFixtureIds =
    rows
      .filter(
        row =>
          !historyTruthContractValid(
            row
          )
      )
      .map(
        (row, index) =>
          fixtureId(row) ||
          `<missing:${index}>`
      )
      .sort();

  return {
    observed:
      true,

    sourceExists:
      true,

    file,
    season,

    dayEntryCount:
      dayEntries.length,

    rowCount:
      rows.length,

    fixtureIds:
      ids.filter(Boolean),

    duplicateFixtureIds:
      duplicateIds(ids),

    invalidTruthContractFixtureIds,

    structuralIssues:
      [
        ...new Set(
          structuralIssues
        )
      ].sort()
  };
}

export function readSettlementObservationForDay(
  dayKey
) {
  const exactDayKey =
    assertDayKey(dayKey);

  const bundlePath =
    resolveDataPath(
      "football-truth",
      "_diagnostics",
      "value-settlement-daily-cycle",
      `${exactDayKey}.four-plan-settlement-bundle.json`
    );

  const aggregateSummaryPath =
    resolveDataPath(
      "football-truth",
      "_settlement-summaries",
      `${exactDayKey}.value-settlement-summary.json`
    );

  const bundleExists =
    fs.existsSync(
      bundlePath
    );

  const aggregateSummaryExists =
    fs.existsSync(
      aggregateSummaryPath
    );

  if (
    !bundleExists &&
    !aggregateSummaryExists
  ) {
    return {
      observed:
        false,

      bundleExists:
        false,

      aggregateSummaryExists:
        false,

      bundlePath,
      aggregateSummaryPath,

      rows:
        [],

      structuralIssues:
        []
    };
  }

  const structuralIssues =
    [];

  const bundle =
    bundleExists
      ? readJsonStrict(
          bundlePath
        )
      : null;

  const summary =
    aggregateSummaryExists
      ? readJsonStrict(
          aggregateSummaryPath
        )
      : null;

  if (!bundleExists) {
    structuralIssues.push(
      "settlement_bundle_missing"
    );
  }

  if (
    !aggregateSummaryExists
  ) {
    structuralIssues.push(
      "settlement_aggregate_summary_missing"
    );
  }

  if (bundle) {
    if (
      bundle?.schema !==
      "ai-matchlab.four-plan-settlement-bundle.v1"
    ) {
      structuralIssues.push(
        "settlement_bundle_schema_invalid"
      );
    }

    if (
      bundle?.stage !==
        "four_plan_settlement_bundle_ready" ||
      bundle?.ok !== true
    ) {
      structuralIssues.push(
        "settlement_bundle_not_ready"
      );
    }

    if (
      clean(
        bundle?.dayKey
      ) !==
      exactDayKey
    ) {
      structuralIssues.push(
        "settlement_bundle_day_mismatch"
      );
    }

    if (
      !samePlanSet(
        bundle?.requiredPlans
      ) ||
      !samePlanSet(
        bundle?.presentPlans
      )
    ) {
      structuralIssues.push(
        "settlement_bundle_plan_set_invalid"
      );
    }

    if (
      Array.isArray(
        bundle?.missingPlans
      ) &&
      bundle
        .missingPlans
        .length !==
      0
    ) {
      structuralIssues.push(
        "settlement_bundle_missing_plans"
      );
    }

    if (
      bundle
        ?.guarantees
        ?.verifiedFinalTruthRequired !==
      true
    ) {
      structuralIssues.push(
        "settlement_bundle_verified_final_contract_missing"
      );
    }

    if (
      bundle
        ?.guarantees
        ?.fourPlanComplete !==
      true
    ) {
      structuralIssues.push(
        "settlement_bundle_four_plan_contract_missing"
      );
    }

    for (
      const planKey of
      REQUIRED_PLANS
    ) {
      const plan =
        bundle?.plans?.[planKey];

      if (
        !plan ||
        typeof plan !==
        "object"
      ) {
        structuralIssues.push(
          `settlement_bundle_plan_entry_missing:${planKey}`
        );

        continue;
      }

      for (
        const field of [
          "reportPath",
          "summaryPath"
        ]
      ) {
        const artifact =
          repoArtifactPath(
            plan?.[field]
          );

        if (
          !artifact ||
          !fs.existsSync(
            artifact
          )
        ) {
          structuralIssues.push(
            `settlement_plan_artifact_missing:${planKey}:${field}`
          );
        }
      }
    }
  }

  const rows =
    Array.isArray(
      summary?.rows
    )
      ? summary.rows
      : [];

  const computed =
    settlementResultSummary(
      rows
    );

  if (summary) {
    if (
      summary?.schema !==
      "ai-matchlab.value-settlement-summary.v2"
    ) {
      structuralIssues.push(
        "settlement_summary_schema_invalid"
      );
    }

    if (
      summary?.stage !==
        "four_plan_value_settlement_summary_ready" ||
      summary?.ok !== true
    ) {
      structuralIssues.push(
        "settlement_summary_not_ready"
      );
    }

    if (
      clean(
        summary?.dayKey
      ) !==
      exactDayKey
    ) {
      structuralIssues.push(
        "settlement_summary_day_mismatch"
      );
    }

    if (
      clean(
        summary?.planKey
      ).toUpperCase() !==
      "FOUR_PLAN"
    ) {
      structuralIssues.push(
        "settlement_summary_plan_key_invalid"
      );
    }

    if (
      !samePlanSet(
        summary?.requiredPlans
      )
    ) {
      structuralIssues.push(
        "settlement_summary_plan_set_invalid"
      );
    }

    if (
      !Array.isArray(
        summary?.rows
      )
    ) {
      structuralIssues.push(
        "settlement_summary_rows_missing"
      );
    }

    if (
      summary
        ?.source
        ?.requiresVerifiedFinalTruth !==
      true
    ) {
      structuralIssues.push(
        "settlement_summary_verified_final_contract_missing"
      );
    }

    if (
      summary
        ?.guarantees
        ?.trackedSummaryArtifact !==
      true
    ) {
      structuralIssues.push(
        "settlement_summary_tracking_contract_missing"
      );
    }

    for (
      const key of [
        "totalRows",
        "settledRows",
        "unresolvedRows",
        "winRows",
        "lossRows",
        "voidRows",
        "unknownRows"
      ]
    ) {
      if (
        Number(
          summary
            ?.summary
            ?.[key]
        ) !==
        computed[key]
      ) {
        structuralIssues.push(
          `settlement_summary_count_mismatch:${key}`
        );
      }
    }
  }

  if (
    bundle &&
    summary
  ) {
    for (
      const key of [
        "totalRows",
        "settledRows",
        "unresolvedRows",
        "winRows",
        "lossRows",
        "voidRows",
        "unknownRows"
      ]
    ) {
      if (
        Number(
          bundle
            ?.aggregate
            ?.[key]
        ) !==
        Number(
          summary
            ?.summary
            ?.[key]
        )
      ) {
        structuralIssues.push(
          `settlement_bundle_summary_mismatch:${key}`
        );
      }
    }
  }

  return {
    observed:
      true,

    bundleExists,
    aggregateSummaryExists,
    bundlePath,
    aggregateSummaryPath,
    rows,

    structuralIssues:
      [
        ...new Set(
          structuralIssues
        )
      ].sort()
  };
}
