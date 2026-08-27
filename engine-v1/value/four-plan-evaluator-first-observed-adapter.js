import fs from "node:fs";
import path from "node:path";
import {
  execFileSync
} from "node:child_process";

import {
  planAObservationSignature
} from "./plan-a-observation.js";

import {
  FOUR_PLAN_IDS,
  FOUR_PLAN_PROBABILITY_FIELDS,
  evaluateFourPlanRows,
  isValidEventProbability
} from "./four-plan-evaluator-core.js";

export const FOUR_PLAN_FIRST_OBSERVED_ADAPTER_SCHEMA =
  "ai-matchlab.value-four-plan-first-observed-adapter.v1";

const PLAN_FILES =
  Object.freeze({
    A: "plan-a.json",
    A2: "plan-a2.json",
    B: "plan-b.json",
    B2: "plan-b2.json"
  });

const AUDIT_FILES =
  Object.freeze({
    A: "plan-a-audit.json",
    A2: "plan-a2-audit.json",
    B: "plan-b-audit.json",
    B2: "plan-b2-audit.json"
  });

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function validDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/u
    .test(
      clean(value)
    );
}

function parseTime(value) {
  if (!value) {
    return null;
  }

  const ms =
    Date.parse(
      String(value)
    );

  return Number.isFinite(ms)
    ? ms
    : null;
}

function gitRead(
  repoRoot,
  args,
  {
    allowFail = false
  } = {}
) {
  try {
    return execFileSync(
      "git",
      [
        "-C",
        repoRoot,
        ...args
      ],
      {
        encoding: "utf8",
        stdio: [
          "ignore",
          "pipe",
          "pipe"
        ],
        maxBuffer:
          64 *
          1024 *
          1024
      }
    ).trim();
  } catch (error) {
    if (allowFail) {
      return "";
    }

    const stderr =
      clean(
        error?.stderr
      );

    throw new Error(
      [
        "four_plan_first_observed_git_failed",
        ...args,
        stderr
      ]
        .filter(Boolean)
        .join(":")
    );
  }
}

function readJsonFile(
  filePath
) {
  try {
    return JSON.parse(
      fs.readFileSync(
        filePath,
        "utf8"
      )
    );
  } catch {
    return null;
  }
}

function readJsonAt(
  repoRoot,
  commit,
  repoPath
) {
  if (
    !commit ||
    !repoPath
  ) {
    return null;
  }

  const raw =
    gitRead(
      repoRoot,
      [
        "show",
        `${commit}:${repoPath}`
      ],
      {
        allowFail: true
      }
    );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function firstObservedArtifact(
  repoRoot,
  repoPath
) {
  const raw =
    gitRead(
      repoRoot,
      [
        "log",
        "--reverse",
        "--diff-filter=A",
        "--format=%H%x09%cI",
        "--",
        repoPath
      ],
      {
        allowFail: true
      }
    );

  if (!raw) {
    return null;
  }

  const firstLine =
    raw
      .split(/\r?\n/u)
      .map(
        line =>
          line.trim()
      )
      .find(Boolean);

  if (!firstLine) {
    return null;
  }

  const tab =
    firstLine.indexOf(
      "\t"
    );

  if (tab <= 0) {
    return null;
  }

  const commit =
    firstLine
      .slice(0, tab)
      .trim();

  const committedAt =
    firstLine
      .slice(tab + 1)
      .trim();

  if (
    !/^[a-f0-9]{40}$/iu
      .test(commit) ||
    parseTime(committedAt) === null
  ) {
    return null;
  }

  return {
    commit,
    committedAt
  };
}

function rowsFromPayload(
  payload
) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  for (
    const key
    of [
      "picks",
      "valuePicks",
      "rows",
      "items"
    ]
  ) {
    if (
      Array.isArray(
        payload?.[key]
      )
    ) {
      return payload[key];
    }
  }

  return [];
}

function canonicalId(row) {
  return clean(
    row?.canonicalMatchId ||
    row?.canonicalId ||
    row?.matchId ||
    row?.id ||
    row?.fixtureId ||
    row?.eventId ||
    row?.gameId
  );
}

function normalizedToken(
  value
) {
  return clean(value)
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/gu,
      ""
    );
}

function normalizedMarket(
  value
) {
  const token =
    normalizedToken(
      value
    );

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

  return token;
}

function normalizedPick(
  value
) {
  const token =
    normalizedToken(
      value
    );

  if (
    token.includes(
      "OVER"
    )
  ) {
    return "OVER";
  }

  if (
    token.includes(
      "UNDER"
    )
  ) {
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

  return token;
}

function selectedSlotKey(
  day,
  row
) {
  const id =
    canonicalId(row);

  const market =
    normalizedMarket(
      row?.market ||
      row?.marketName ||
      row?.type
    );

  const pick =
    normalizedPick(
      row?.pick ||
      row?.selection ||
      row?.prediction ||
      row?.side ||
      row?.outcome
    );

  if (
    !validDay(day) ||
    !id ||
    !market ||
    !pick
  ) {
    return null;
  }

  return [
    day,
    id,
    market,
    pick
  ].join("|");
}

function fixtureUniverseFrom(
  payload
) {
  if (!payload) {
    return null;
  }

  const candidates = [
    payload?.fixtureUniverse,
    payload?.sourceContract
      ?.fixtureUniverse,
    payload?.membership
      ?.fixtureUniverse
  ];

  for (
    const value
    of candidates
  ) {
    if (!value) {
      continue;
    }

    const count =
      Number(
        value?.count
      );

    const hash =
      clean(
        value?.hash
      ).toLowerCase();

    const canonicalIds =
      Array.isArray(
        value?.canonicalIds
      )
        ? value
            .canonicalIds
            .map(clean)
            .filter(Boolean)
            .sort()
        : [];

    if (
      Number.isInteger(count) &&
      count >= 0 &&
      /^[a-f0-9]{64}$/u
        .test(hash) &&
      canonicalIds.length === count
    ) {
      return {
        count,
        hash,
        canonicalIds,
        idKey:
          canonicalIds.join("|")
      };
    }
  }

  return null;
}

function sameFixtureUniverse(
  values
) {
  if (
    values.length !== 4 ||
    values.some(
      value =>
        !value
    )
  ) {
    return false;
  }

  const [
    first,
    ...rest
  ] = values;

  return rest.every(
    value =>
      value.count ===
        first.count &&
      value.hash ===
        first.hash &&
      value.idKey ===
        first.idKey
  );
}

function sourcePayloadMatchesPlanA(
  observation,
  source
) {
  if (
    !observation ||
    !source
  ) {
    return false;
  }

  for (
    const field
    of [
      "date",
      "source",
      "createdAt",
      "updatedAt",
      "count"
    ]
  ) {
    if (
      String(
        observation?.[field] ??
        ""
      ) !==
      String(
        source?.[field] ??
        ""
      )
    ) {
      return false;
    }
  }

  return (
    JSON.stringify(
      rowsFromPayload(
        observation
      )
    ) ===
    JSON.stringify(
      rowsFromPayload(
        source
      )
    )
  );
}

function planAFreezeEvidence({
  repoRoot,
  day,
  firstObserved,
  plan,
  audit
}) {
  if (
    !firstObserved ||
    !plan
  ) {
    return {
      proven: false,
      universe: null,
      reason:
        "missing_first_observed_plan_a"
    };
  }

  const source =
    readJsonAt(
      repoRoot,
      firstObserved.commit,
      `data/deploy-snapshots/${day}/value.json`
    );

  const valueAudit =
    readJsonAt(
      repoRoot,
      firstObserved.commit,
      `data/deploy-snapshots/${day}/value-audit.json`
    );

  const universe =
    fixtureUniverseFrom(
      valueAudit
    );

  const declaredSignature =
    clean(
      plan?.observationSignature
    ).toLowerCase();

  const computedSignature =
    planAObservationSignature(
      day,
      plan
    );

  const signatureExact =
    /^[a-f0-9]{64}$/u
      .test(
        declaredSignature
      ) &&
    declaredSignature ===
      computedSignature;

  const payloadExact =
    sourcePayloadMatchesPlanA(
      plan,
      source
    );

  const frozenAt =
    parseTime(
      plan?.frozenAt
    );

  const auditGeneratedAt =
    parseTime(
      valueAudit?.generatedAt
    );

  const timestampCoherent =
    frozenAt !== null &&
    auditGeneratedAt !== null &&
    Math.abs(
      frozenAt -
      auditGeneratedAt
    ) <= 5000;

  const auditDateExact =
    !audit ||
    clean(audit?.date) === day;

  const proven =
    Boolean(
      signatureExact &&
      payloadExact &&
      timestampCoherent &&
      universe &&
      auditDateExact
    );

  return {
    proven,
    universe,

    reason:
      proven
        ? null
        : "plan_a_first_freeze_not_proven",

    checks: {
      signatureExact,
      payloadExact,
      timestampCoherent,
      universePresent:
        Boolean(universe),
      auditDateExact
    }
  };
}

function explicitForecastTime(
  planKey,
  plan,
  audit
) {
  const candidates =
    planKey === "A"
      ? [
          plan?.frozenAt,
          plan?.generatedAt,
          audit?.generatedAt
        ]
      : [
          plan?.generatedAt,
          audit?.generatedAt,
          plan?.frozenAt
        ];

  for (
    const candidate
    of candidates
  ) {
    const ms =
      parseTime(
        candidate
      );

    if (ms !== null) {
      return {
        ms,
        iso:
          new Date(ms)
            .toISOString()
      };
    }
  }

  return {
    ms: null,
    iso: null
  };
}

function kickoffTime(
  row
) {
  for (
    const candidate
    of [
      row?.kickoff,
      row?.kickoffUtc,
      row?.startTime,
      row?.startUtc
    ]
  ) {
    const ms =
      parseTime(
        candidate
      );

    if (ms !== null) {
      return ms;
    }
  }

  return null;
}

function preKickoffProof({
  sourceRow,
  firstObserved,
  explicitTime
}) {
  const kickoff =
    kickoffTime(
      sourceRow
    );

  const commitMs =
    parseTime(
      firstObserved?.committedAt
    );

  const explicitMs =
    explicitTime?.ms ??
    null;

  if (
    kickoff === null ||
    commitMs === null
  ) {
    return {
      proven: false,
      reason:
        "missing_kickoff_or_first_commit_time"
    };
  }

  if (
    commitMs > kickoff
  ) {
    return {
      proven: false,
      reason:
        "first_git_observation_after_kickoff"
    };
  }

  if (
    explicitMs !== null &&
    explicitMs > kickoff
  ) {
    return {
      proven: false,
      reason:
        "artifact_timestamp_after_kickoff"
    };
  }

  return {
    proven: true,
    reason: null
  };
}

function comparisonIndex(
  day,
  planComparison
) {
  const byKey =
    new Map();

  const ambiguous =
    new Set();

  for (
    const row
    of rowsFromPayload(
      planComparison
    )
  ) {
    const key =
      selectedSlotKey(
        day,
        row
      );

    if (!key) {
      continue;
    }

    if (
      ambiguous.has(key)
    ) {
      continue;
    }

    if (
      byKey.has(key)
    ) {
      byKey.delete(key);
      ambiguous.add(key);
      continue;
    }

    byKey.set(
      key,
      row
    );
  }

  return {
    byKey,
    ambiguous
  };
}

function discoverDays({
  repoRoot,
  startDay,
  endDay,
  days
}) {
  if (
    Array.isArray(days)
  ) {
    return [
      ...new Set(
        days
          .map(clean)
          .filter(validDay)
      )
    ]
      .filter(
        day =>
          !startDay ||
          day >= startDay
      )
      .filter(
        day =>
          !endDay ||
          day <= endDay
      )
      .sort();
  }

  const dir =
    path.join(
      repoRoot,
      "data",
      "value-comparison"
    );

  if (
    !fs.existsSync(dir)
  ) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter(
      name =>
        /^\d{4}-\d{2}-\d{2}\.json$/u
          .test(name)
    )
    .map(
      name =>
        name.slice(
          0,
          -5
        )
    )
    .filter(
      day =>
        !startDay ||
        day >= startDay
    )
    .filter(
      day =>
        !endDay ||
        day <= endDay
    )
    .sort();
}

export function buildFirstObservedFourPlanEvaluation({
  repoRoot,
  startDay = "2026-07-28",
  endDay = null,
  days = null
} = {}) {
  const root =
    path.resolve(
      clean(repoRoot)
    );

  if (
    !root ||
    !fs.existsSync(root)
  ) {
    throw new Error(
      "four_plan_first_observed_repo_root_missing"
    );
  }

  if (
    startDay &&
    !validDay(startDay)
  ) {
    throw new Error(
      "four_plan_first_observed_start_day_invalid"
    );
  }

  if (
    endDay &&
    !validDay(endDay)
  ) {
    throw new Error(
      "four_plan_first_observed_end_day_invalid"
    );
  }

  const evaluationDays =
    discoverDays({
      repoRoot: root,
      startDay,
      endDay,
      days
    });

  const rows = [];
  const daySummary = [];

  for (
    const day
    of evaluationDays
  ) {
    const comparisonPath =
      path.join(
        root,
        "data",
        "value-comparison",
        `${day}.json`
      );

    const comparison =
      readJsonFile(
        comparisonPath
      );

    if (!comparison?.plans) {
      daySummary.push({
        day,
        comparisonAvailable: false,
        allFourFirstObserved: false,
        planAFreezeProven: false,
        universeExact: false,
        rows: 0
      });

      continue;
    }

    const firstObserved = {};
    const observedPlans = {};
    const observedAudits = {};
    const universes = {};

    for (
      const planKey
      of FOUR_PLAN_IDS
    ) {
      const planRepoPath =
        `data/value-plans/${day}/${PLAN_FILES[planKey]}`;

      const auditRepoPath =
        `data/value-plans/${day}/${AUDIT_FILES[planKey]}`;

      const first =
        firstObservedArtifact(
          root,
          planRepoPath
        );

      firstObserved[planKey] =
        first;

      if (!first) {
        observedPlans[planKey] =
          null;

        observedAudits[planKey] =
          null;

        universes[planKey] =
          null;

        continue;
      }

      const plan =
        readJsonAt(
          root,
          first.commit,
          planRepoPath
        );

      const audit =
        readJsonAt(
          root,
          first.commit,
          auditRepoPath
        );

      observedPlans[planKey] =
        plan;

      observedAudits[planKey] =
        audit;

      universes[planKey] =
        fixtureUniverseFrom(
          plan
        ) ||
        fixtureUniverseFrom(
          audit
        );
    }

    const planAFreeze =
      planAFreezeEvidence({
        repoRoot: root,
        day,
        firstObserved:
          firstObserved.A,
        plan:
          observedPlans.A,
        audit:
          observedAudits.A
      });

    universes.A =
      planAFreeze.universe;

    const allFourFirstObserved =
      FOUR_PLAN_IDS.every(
        planKey =>
          Boolean(
            firstObserved[planKey] &&
            observedPlans[planKey]
          )
      );

    const universeExact =
      allFourFirstObserved &&
      sameFixtureUniverse(
        FOUR_PLAN_IDS.map(
          planKey =>
            universes[planKey]
        )
      );

    let dayRowCount = 0;

    const planCounts = {};

    for (
      const planKey
      of FOUR_PLAN_IDS
    ) {
      const plan =
        observedPlans[planKey];

      const sourceRows =
        rowsFromPayload(
          plan
        );

      const comparisonPlan =
        comparison?.plans?.[
          planKey
        ];

      const index =
        comparisonIndex(
          day,
          comparisonPlan
        );

      const explicitTime =
        explicitForecastTime(
          planKey,
          plan,
          observedAudits[
            planKey
          ]
        );

      let matched = 0;
      let preKickoff = 0;
      let validProbability = 0;

      for (
        const sourceRow
        of sourceRows
      ) {
        const key =
          selectedSlotKey(
            day,
            sourceRow
          );

        const ambiguous =
          key
            ? index
                .ambiguous
                .has(key)
            : false;

        const comparisonRow =
          key &&
          !ambiguous
            ? (
                index
                  .byKey
                  .get(key) ||
                null
              )
            : null;

        const probabilityField =
          FOUR_PLAN_PROBABILITY_FIELDS[
            planKey
          ];

        const probability =
          sourceRow?.[
            probabilityField
          ] ?? null;

        const timing =
          preKickoffProof({
            sourceRow,
            firstObserved:
              firstObserved[
                planKey
              ],
            explicitTime
          });

        if (comparisonRow) {
          matched++;
        }

        if (timing.proven) {
          preKickoff++;
        }

        if (
          isValidEventProbability(
            probability
          )
        ) {
          validProbability++;
        }

        const sourceCanonicalId =
          canonicalId(
            sourceRow
          );

        rows.push({
          plan:
            planKey,

          day,

          canonicalMatchId:
            sourceCanonicalId,

          leagueSlug:
            clean(
              sourceRow?.leagueSlug ||
              sourceRow?.league
            ),

          market:
            sourceRow?.market ||
            sourceRow?.marketName ||
            sourceRow?.type ||
            null,

          pick:
            sourceRow?.pick ||
            sourceRow?.selection ||
            sourceRow?.prediction ||
            sourceRow?.side ||
            sourceRow?.outcome ||
            null,

          band:
            sourceRow?.band ??
            null,

          probability,

          result:
            comparisonRow
              ?.result ??
            "MISSING",

          preKickoffProven:
            timing.proven,

          comparisonMatched:
            Boolean(
              comparisonRow
            ),

          universeExact,

          planAFreezeProven:
            planAFreeze.proven,

          provenance: {
            firstObservedCommit:
              firstObserved[
                planKey
              ]?.commit ??
              null,

            firstObservedCommittedAt:
              firstObserved[
                planKey
              ]?.committedAt ??
              null,

            explicitForecastAt:
              explicitTime.iso,

            timingReason:
              timing.reason,

            probabilityField,

            sourcePath:
              `data/value-plans/${day}/${PLAN_FILES[planKey]}`,

            comparisonPath:
              `data/value-comparison/${day}.json`,

            comparisonSlotAmbiguous:
              ambiguous
          }
        });

        dayRowCount++;
      }

      planCounts[
        planKey
      ] = {
        sourceRows:
          sourceRows.length,

        validProbability,
        preKickoffProven:
          preKickoff,

        comparisonMatched:
          matched,

        firstObservedCommit:
          firstObserved[
            planKey
          ]?.commit ??
          null
      };
    }

    daySummary.push({
      day,

      comparisonAvailable:
        true,

      allFourFirstObserved,

      planAFreezeProven:
        planAFreeze.proven,

      planAFreezeChecks:
        planAFreeze.checks ??
        null,

      universeExact,

      universeHashes:
        Object.fromEntries(
          FOUR_PLAN_IDS.map(
            planKey => [
              planKey,
              universes[
                planKey
              ]?.hash ??
              null
            ]
          )
        ),

      rows:
        dayRowCount,

      plans:
        planCounts
    });
  }

  const evaluation =
    evaluateFourPlanRows(
      rows
    );

  return {
    ok: true,

    schema:
      FOUR_PLAN_FIRST_OBSERVED_ADAPTER_SCHEMA,

    sourceContract: {
      readOnly: true,

      firstObservedAuthority:
        "git_first_add_commit",

      retrospectiveForecastRebuildAllowed:
        false,

      frozenObservationMutationAllowed:
        false,

      currentComparisonUse:
        "settlement_join_only",

      confidenceUsedAsEventProbability:
        false,

      fullFixtureUniverseProbabilityScoringSupported:
        false,

      planAFreezeRequires:
        [
          "first_observed_plan_a",
          "exact_observation_signature",
          "first_freeze_source_payload_match",
          "contemporaneous_value_audit",
          "fixture_universe_present"
        ]
    },

    range: {
      startDay,
      endDay,
      dayCount:
        evaluationDays.length
    },

    daySummary,
    rows,
    evaluation
  };
}

export default {
  FOUR_PLAN_FIRST_OBSERVED_ADAPTER_SCHEMA,
  firstObservedArtifact,
  buildFirstObservedFourPlanEvaluation
};
