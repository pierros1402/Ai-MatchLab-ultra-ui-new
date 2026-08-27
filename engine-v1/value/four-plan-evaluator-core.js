export const FOUR_PLAN_EVALUATOR_SCHEMA =
  "ai-matchlab.value-four-plan-evaluator-core.v1";

export const FOUR_PLAN_IDS =
  Object.freeze([
    "A",
    "A2",
    "B",
    "B2"
  ]);

export const FOUR_PLAN_PROBABILITY_FIELDS =
  Object.freeze({
    A: "score",
    A2: "score",
    B: "modelProb",
    B2: "modelProb"
  });

export const FOUR_PLAN_EVALUATOR_CONTRACT =
  Object.freeze({
    fullFixtureUniverseProbabilityScoringSupported: false,

    selectedPickProbabilityScoringRequires: Object.freeze([
      "valid_event_probability",
      "first_observed_pre_kickoff",
      "comparison_row_matched",
      "settled_binary_outcome"
    ]),

    commonSelectedProbabilityComparisonRequires: Object.freeze([
      "same_selected_event_slot",
      "all_four_plans_present",
      "exact_fixture_universe",
      "plan_a_first_freeze_proven",
      "all_four_rows_proper_score_eligible",
      "identical_binary_outcome"
    ]),

    confidenceUsedAsEventProbability: false,
    retrospectiveForecastRebuildAllowed: false,
    frozenObservationMutationAllowed: false
  });

const LOG_EPSILON = 1e-15;
const CALIBRATION_BIN_WIDTH = 0.1;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const text =
    value.trim();

  if (!text) {
    return null;
  }

  const number =
    Number(text);

  return Number.isFinite(number)
    ? number
    : null;
}

function safeRatio(
  numerator,
  denominator
) {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }

  return numerator / denominator;
}

function mean(values) {
  const numeric =
    values.filter(
      Number.isFinite
    );

  if (!numeric.length) {
    return null;
  }

  return (
    numeric.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    numeric.length
  );
}

function round(
  value,
  digits = 6
) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor =
    10 ** digits;

  return (
    Math.round(
      value * factor
    ) /
    factor
  );
}

export function isValidEventProbability(
  value
) {
  const probability =
    finiteNumber(value);

  return Boolean(
    probability !== null &&
    probability >= 0 &&
    probability <= 1
  );
}

function validBinaryOutcome(value) {
  return (
    value === 0 ||
    value === 1
  );
}

export function binaryBrierScore(
  probability,
  outcome
) {
  if (
    !isValidEventProbability(
      probability
    ) ||
    !validBinaryOutcome(
      outcome
    )
  ) {
    return null;
  }

  return (
    Number(probability) -
    outcome
  ) ** 2;
}

export function binaryLogLoss(
  probability,
  outcome
) {
  if (
    !isValidEventProbability(
      probability
    ) ||
    !validBinaryOutcome(
      outcome
    )
  ) {
    return null;
  }

  const p =
    Math.min(
      1 - LOG_EPSILON,
      Math.max(
        LOG_EPSILON,
        Number(probability)
      )
    );

  return -(
    outcome * Math.log(p) +
    (1 - outcome) *
      Math.log(1 - p)
  );
}

function normalizedPlan(value) {
  const plan =
    clean(value).toUpperCase();

  if (
    !FOUR_PLAN_IDS.includes(plan)
  ) {
    throw new Error(
      `four_plan_evaluator_invalid_plan:${plan || "missing"}`
    );
  }

  return plan;
}

function normalizedResult(value) {
  const result =
    clean(value).toUpperCase();

  if (
    [
      "WIN",
      "LOSS",
      "VOID",
      "UNRESOLVED",
      "UNSUPPORTED"
    ].includes(result)
  ) {
    return result;
  }

  return "MISSING";
}

export function binaryOutcomeFromResult(
  value
) {
  const result =
    normalizedResult(value);

  if (result === "WIN") {
    return 1;
  }

  if (result === "LOSS") {
    return 0;
  }

  return null;
}

function normalizedToken(value) {
  return clean(value)
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/gu,
      ""
    );
}

function normalizedMarket(value) {
  const token =
    normalizedToken(value);

  if (
    token === "OU15" ||
    token.includes(
      "OVERUNDER15"
    )
  ) {
    return "OU15";
  }

  if (
    token === "OU25" ||
    token.includes(
      "OVERUNDER25"
    )
  ) {
    return "OU25";
  }

  if (
    token === "OU35" ||
    token.includes(
      "OVERUNDER35"
    )
  ) {
    return "OU35";
  }

  if (
    token === "BTTS" ||
    token.includes(
      "BOTHTEAMSTOSCORE"
    )
  ) {
    return "BTTS";
  }

  if (
    token === "1X2" ||
    token.includes(
      "MATCHWINNER"
    ) ||
    token.includes(
      "FULLTIMERESULT"
    )
  ) {
    return "1X2";
  }

  if (
    token === "DC" ||
    token.includes(
      "DOUBLECHANCE"
    )
  ) {
    return "DC";
  }

  return token || "UNKNOWN";
}

function normalizedPick(value) {
  const token =
    normalizedToken(value);

  if (token.includes("OVER")) {
    return "OVER";
  }

  if (token.includes("UNDER")) {
    return "UNDER";
  }

  if (
    token === "BTTSYES" ||
    token === "YES"
  ) {
    return "YES";
  }

  if (
    token === "BTTSNO" ||
    token === "NO"
  ) {
    return "NO";
  }

  if (
    token === "HOME" ||
    token === "1"
  ) {
    return "HOME";
  }

  if (
    token === "AWAY" ||
    token === "2"
  ) {
    return "AWAY";
  }

  if (
    token === "DRAW" ||
    token === "X"
  ) {
    return "DRAW";
  }

  if (
    [
      "1X",
      "X2",
      "12"
    ].includes(token)
  ) {
    return token;
  }

  return token || "UNKNOWN";
}

function normalizedBand(value) {
  const band =
    clean(value).toUpperCase();

  return band || "UNSPECIFIED";
}

function normalizedRow(
  row,
  index
) {
  const plan =
    normalizedPlan(
      row?.plan
    );

  const result =
    normalizedResult(
      row?.result
    );

  const probability =
    isValidEventProbability(
      row?.probability
    )
      ? Number(
          row.probability
        )
      : null;

  const outcome =
    binaryOutcomeFromResult(
      result
    );

  const comparisonMatched =
    row?.comparisonMatched === true;

  const preKickoffProven =
    row?.preKickoffProven === true;

  const properScoreEligible =
    Boolean(
      probability !== null &&
      preKickoffProven &&
      comparisonMatched &&
      validBinaryOutcome(
        outcome
      )
    );

  const brier =
    properScoreEligible
      ? binaryBrierScore(
          probability,
          outcome
        )
      : null;

  const logLoss =
    properScoreEligible
      ? binaryLogLoss(
          probability,
          outcome
        )
      : null;

  const day =
    clean(row?.day);

  const canonicalMatchId =
    clean(
      row?.canonicalMatchId ||
      row?.matchId
    );

  const market =
    normalizedMarket(
      row?.market
    );

  const pick =
    normalizedPick(
      row?.pick
    );

  const slotKey =
    (
      day &&
      canonicalMatchId &&
      market !== "UNKNOWN" &&
      pick !== "UNKNOWN"
    )
      ? [
          day,
          canonicalMatchId,
          market,
          pick
        ].join("|")
      : null;

  return {
    index,
    plan,
    day,
    canonicalMatchId,

    leagueSlug:
      clean(
        row?.leagueSlug ||
        row?.league
      ) || "unknown",

    market,
    pick,

    band:
      normalizedBand(
        row?.band
      ),

    probability,
    validProbability:
      probability !== null,

    result,
    outcome,

    comparisonMatched,
    preKickoffProven,

    universeExact:
      row?.universeExact === true,

    planAFreezeProven:
      row?.planAFreezeProven === true,

    properScoreEligible,

    brier,
    logLoss,

    slotKey
  };
}

function calibrationRows(
  rows
) {
  const properRows =
    rows.filter(
      row =>
        row.properScoreEligible
    );

  const bins =
    Array.from(
      { length: 10 },
      (_, index) => ({
        index,
        min:
          index *
          CALIBRATION_BIN_WIDTH,

        max:
          (index + 1) *
          CALIBRATION_BIN_WIDTH,

        rows: []
      })
    );

  for (const row of properRows) {
    const index =
      Math.min(
        9,
        Math.floor(
          row.probability /
          CALIBRATION_BIN_WIDTH
        )
      );

    bins[index]
      .rows
      .push(row);
  }

  return bins
    .filter(
      bin =>
        bin.rows.length > 0
    )
    .map(bin => {
      const meanProbability =
        mean(
          bin.rows.map(
            row =>
              row.probability
          )
        );

      const observedRate =
        mean(
          bin.rows.map(
            row =>
              row.outcome
          )
        );

      return {
        bin:
          `${bin.min.toFixed(1)}-${bin.max.toFixed(1)}`,

        count:
          bin.rows.length,

        meanProbability:
          round(
            meanProbability
          ),

        observedRate:
          round(
            observedRate
          ),

        calibrationGap:
          round(
            meanProbability -
            observedRate
          ),

        brier:
          round(
            mean(
              bin.rows.map(
                row =>
                  row.brier
              )
            )
          ),

        logLoss:
          round(
            mean(
              bin.rows.map(
                row =>
                  row.logLoss
              )
            )
          )
      };
    });
}

function properScoringSummary(
  rows
) {
  const properRows =
    rows.filter(
      row =>
        row.properScoreEligible
    );

  const clusters =
    new Map();

  for (const row of properRows) {
    const key =
      [
        row.day,
        row.canonicalMatchId
      ].join("|");

    if (!clusters.has(key)) {
      clusters.set(
        key,
        []
      );
    }

    clusters
      .get(key)
      .push(row);
  }

  const clusterBrier = [];
  const clusterLogLoss = [];

  for (
    const clusterRows
    of clusters.values()
  ) {
    clusterBrier.push(
      mean(
        clusterRows.map(
          row =>
            row.brier
        )
      )
    );

    clusterLogLoss.push(
      mean(
        clusterRows.map(
          row =>
            row.logLoss
        )
      )
    );
  }

  return {
    pickLevel: {
      count:
        properRows.length,

      brier:
        round(
          mean(
            properRows.map(
              row =>
                row.brier
            )
          )
        ),

      logLoss:
        round(
          mean(
            properRows.map(
              row =>
                row.logLoss
            )
          )
        )
    },

    matchClusterLevel: {
      count:
        clusters.size,

      brier:
        round(
          mean(
            clusterBrier
          )
        ),

      logLoss:
        round(
          mean(
            clusterLogLoss
          )
        )
    },

    calibration:
      calibrationRows(
        properRows
      )
  };
}

function baseSummary(
  rows
) {
  const wins =
    rows.filter(
      row =>
        row.result === "WIN"
    ).length;

  const losses =
    rows.filter(
      row =>
        row.result === "LOSS"
    ).length;

  const voids =
    rows.filter(
      row =>
        row.result === "VOID"
    ).length;

  const unresolved =
    rows.filter(
      row =>
        row.result ===
          "UNRESOLVED"
    ).length;

  const unsupported =
    rows.filter(
      row =>
        row.result ===
          "UNSUPPORTED"
    ).length;

  const missingResult =
    rows.filter(
      row =>
        row.result ===
          "MISSING"
    ).length;

  const settled =
    wins + losses;

  const terminalClassified =
    settled +
    voids +
    unsupported;

  const validProbability =
    rows.filter(
      row =>
        row.validProbability
    ).length;

  const preKickoffProven =
    rows.filter(
      row =>
        row.preKickoffProven
    ).length;

  const comparisonMatched =
    rows.filter(
      row =>
        row.comparisonMatched
    ).length;

  const properScoreEligible =
    rows.filter(
      row =>
        row.properScoreEligible
    ).length;

  return {
    counts: {
      rows:
        rows.length,

      validProbability,
      preKickoffProven,
      comparisonMatched,

      settled,
      wins,
      losses,
      void:
        voids,
      unresolved,
      unsupported,
      resultMissing:
        missingResult,

      terminalClassified,
      properScoreEligible
    },

    coverage: {
      validProbabilityRate:
        round(
          safeRatio(
            validProbability,
            rows.length
          )
        ),

      preKickoffProofRate:
        round(
          safeRatio(
            preKickoffProven,
            rows.length
          )
        ),

      comparisonMatchRate:
        round(
          safeRatio(
            comparisonMatched,
            rows.length
          )
        ),

      properScoreEligibilityRate:
        round(
          safeRatio(
            properScoreEligible,
            rows.length
          )
        )
    },

    settlement: {
      settledRate:
        round(
          safeRatio(
            settled,
            rows.length
          )
        ),

      terminalClassifiedRate:
        round(
          safeRatio(
            terminalClassified,
            rows.length
          )
        ),

      unresolvedRate:
        round(
          safeRatio(
            unresolved,
            rows.length
          )
        )
    },

    selectionQuality: {
      hitRate:
        round(
          safeRatio(
            wins,
            settled
          )
        )
    },

    properScoring:
      properScoringSummary(
        rows
      )
  };
}

function groupSummary(
  rows,
  keyGetter
) {
  const groups =
    new Map();

  for (const row of rows) {
    const key =
      clean(
        keyGetter(row)
      ) || "unknown";

    if (!groups.has(key)) {
      groups.set(
        key,
        []
      );
    }

    groups
      .get(key)
      .push(row);
  }

  return Object.fromEntries(
    [...groups.entries()]
      .sort(
        ([left], [right]) =>
          left.localeCompare(
            right
          )
      )
      .map(
        ([key, groupRows]) => [
          key,
          baseSummary(
            groupRows
          )
        ]
      )
  );
}

function planSummary(
  rows,
  plan
) {
  const planRows =
    rows.filter(
      row =>
        row.plan === plan
    );

  return {
    plan,

    probabilityField:
      FOUR_PLAN_PROBABILITY_FIELDS[
        plan
      ],

    ...baseSummary(
      planRows
    ),

    byMarket:
      groupSummary(
        planRows,
        row =>
          row.market
      ),

    byLeague:
      groupSummary(
        planRows,
        row =>
          row.leagueSlug
      ),

    byBand:
      groupSummary(
        planRows,
        row =>
          row.band
      )
  };
}

function commonSelectedSummary(
  rows
) {
  const groups =
    new Map();

  let unkeyedRows = 0;

  for (const row of rows) {
    if (!row.slotKey) {
      unkeyedRows++;
      continue;
    }

    if (!groups.has(row.slotKey)) {
      groups.set(
        row.slotKey,
        []
      );
    }

    groups
      .get(row.slotKey)
      .push(row);
  }

  let commonSelectedSlotCount = 0;
  let strictScoreableSlotCount = 0;
  let ambiguousSlotCount = 0;

  const rejectionFlags = {
    exactUniverseMissing: 0,
    planAFreezeMissing: 0,
    properScoreEligibilityMissing: 0,
    outcomeMismatch: 0
  };

  const strictRows =
    Object.fromEntries(
      FOUR_PLAN_IDS.map(
        plan => [
          plan,
          []
        ]
      )
    );

  for (
    const groupRows
    of groups.values()
  ) {
    const byPlan =
      new Map();

    let duplicate =
      false;

    for (const row of groupRows) {
      if (
        byPlan.has(
          row.plan
        )
      ) {
        duplicate =
          true;
        break;
      }

      byPlan.set(
        row.plan,
        row
      );
    }

    if (duplicate) {
      ambiguousSlotCount++;
      continue;
    }

    const allFour =
      FOUR_PLAN_IDS.every(
        plan =>
          byPlan.has(plan)
      );

    if (!allFour) {
      continue;
    }

    commonSelectedSlotCount++;

    const fourRows =
      FOUR_PLAN_IDS.map(
        plan =>
          byPlan.get(plan)
      );

    const exactUniverse =
      fourRows.every(
        row =>
          row.universeExact
      );

    const planAFreeze =
      fourRows.every(
        row =>
          row.planAFreezeProven
      );

    const properEligible =
      fourRows.every(
        row =>
          row.properScoreEligible
      );

    const outcomes =
      fourRows.map(
        row =>
          row.outcome
      );

    const sameOutcome =
      outcomes.every(
        outcome =>
          outcome === outcomes[0]
      );

    if (!exactUniverse) {
      rejectionFlags
        .exactUniverseMissing++;
    }

    if (!planAFreeze) {
      rejectionFlags
        .planAFreezeMissing++;
    }

    if (!properEligible) {
      rejectionFlags
        .properScoreEligibilityMissing++;
    }

    if (!sameOutcome) {
      rejectionFlags
        .outcomeMismatch++;
    }

    if (
      !exactUniverse ||
      !planAFreeze ||
      !properEligible ||
      !sameOutcome
    ) {
      continue;
    }

    strictScoreableSlotCount++;

    for (const row of fourRows) {
      strictRows[
        row.plan
      ].push(row);
    }
  }

  return {
    commonSelectedSlotCount,
    strictScoreableSlotCount,
    ambiguousSlotCount,
    unkeyedRows,
    rejectionFlags,

    plans:
      Object.fromEntries(
        FOUR_PLAN_IDS.map(
          plan => [
            plan,
            {
              probabilityField:
                FOUR_PLAN_PROBABILITY_FIELDS[
                  plan
                ],

              properScoring:
                properScoringSummary(
                  strictRows[plan]
                )
            }
          ]
        )
      )
  };
}

export function evaluateFourPlanRows(
  inputRows = []
) {
  if (!Array.isArray(inputRows)) {
    throw new Error(
      "four_plan_evaluator_rows_must_be_array"
    );
  }

  const rows =
    inputRows.map(
      (row, index) =>
        normalizedRow(
          row,
          index
        )
    );

  return {
    ok: true,

    schema:
      FOUR_PLAN_EVALUATOR_SCHEMA,

    contract:
      FOUR_PLAN_EVALUATOR_CONTRACT,

    input: {
      rows:
        rows.length,

      plans:
        [...FOUR_PLAN_IDS]
    },

    plans:
      Object.fromEntries(
        FOUR_PLAN_IDS.map(
          plan => [
            plan,
            planSummary(
              rows,
              plan
            )
          ]
        )
      ),

    commonSelected:
      commonSelectedSummary(
        rows
      )
  };
}

export default {
  FOUR_PLAN_EVALUATOR_SCHEMA,
  FOUR_PLAN_IDS,
  FOUR_PLAN_PROBABILITY_FIELDS,
  FOUR_PLAN_EVALUATOR_CONTRACT,
  isValidEventProbability,
  binaryOutcomeFromResult,
  binaryBrierScore,
  binaryLogLoss,
  evaluateFourPlanRows
};
