import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  execFileSync
} from "node:child_process";
import test from "node:test";

import {
  planAObservationSignature
} from "./plan-a-observation.js";

import {
  buildFirstObservedFourPlanEvaluation
} from "./four-plan-evaluator-first-observed-adapter.js";

function runGit(
  repo,
  args,
  env = {}
) {
  return execFileSync(
    "git",
    [
      "-C",
      repo,
      ...args
    ],
    {
      encoding: "utf8",
      stdio: [
        "ignore",
        "pipe",
        "pipe"
      ],
      env: {
        ...process.env,
        ...env
      }
    }
  ).trim();
}

function writeJson(
  repo,
  relative,
  payload
) {
  const file =
    path.join(
      repo,
      ...relative.split("/")
    );

  fs.mkdirSync(
    path.dirname(file),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    file,
    `${JSON.stringify(
      payload,
      null,
      2
    )}\n`,
    "utf8"
  );
}

function commitAll(
  repo,
  message,
  committedAt
) {
  runGit(
    repo,
    [
      "add",
      "."
    ]
  );

  runGit(
    repo,
    [
      "commit",
      "-q",
      "-m",
      message
    ],
    {
      GIT_AUTHOR_DATE:
        committedAt,
      GIT_COMMITTER_DATE:
        committedAt
    }
  );

  return runGit(
    repo,
    [
      "rev-parse",
      "HEAD"
    ]
  );
}

function makeRepo() {
  const repo =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "aiml-four-plan-adapter-"
      )
    );

  runGit(
    repo,
    [
      "init",
      "-q"
    ]
  );

  runGit(
    repo,
    [
      "config",
      "user.email",
      "test@example.invalid"
    ]
  );

  runGit(
    repo,
    [
      "config",
      "user.name",
      "AI MatchLab Test"
    ]
  );

  return repo;
}

function universe(
  id,
  hashChar = "a"
) {
  return {
    schema:
      "ai-matchlab.value-fixture-universe.v1",

    source:
      "canonical_fixtures",

    count: 1,

    hash:
      hashChar.repeat(64),

    canonicalIds: [
      id
    ]
  };
}

function pick({
  id,
  kickoff,
  probabilityField,
  probability
}) {
  return {
    matchId:
      id,

    canonicalId:
      id,

    leagueSlug:
      "test.1",

    kickoff,

    market:
      "OU25",

    pick:
      "OVER",

    band:
      "HIGH",

    [
      probabilityField
    ]:
      probability
  };
}

function installDay(
  repo,
  {
    day = "2026-08-01",
    id = "m1",
    kickoff =
      "2026-08-01T12:00:00.000Z",
    forecastAt =
      "2026-08-01T08:00:00.000Z",
    commitAt =
      "2026-08-01T08:05:00.000Z",
    b2UniverseHashChar = "a",
    badPlanASignature = false,
    omitComparisonPlan = null
  } = {}
) {
  const baseUniverse =
    universe(
      id,
      "a"
    );

  const b2Universe =
    universe(
      id,
      b2UniverseHashChar
    );

  const aPick =
    pick({
      id,
      kickoff,
      probabilityField:
        "score",
      probability:
        0.80
    });

  const a2Pick =
    pick({
      id,
      kickoff,
      probabilityField:
        "score",
      probability:
        0.78
    });

  const bPick =
    pick({
      id,
      kickoff,
      probabilityField:
        "modelProb",
      probability:
        0.82
    });

  const b2Pick =
    pick({
      id,
      kickoff,
      probabilityField:
        "modelProb",
      probability:
        0.79
    });

  const sourceA = {
    ok: true,
    date: day,
    source:
      "canonical_fixtures",
    createdAt:
      forecastAt,
    updatedAt:
      forecastAt,
    count: 1,
    picks: [
      aPick
    ]
  };

  const planA = {
    ...sourceA,

    schema:
      "ai-matchlab.value-plan-a-observation.v1",

    planId:
      "plan-a",

    outputMode:
      "plan-a-observation",

    immutable:
      true,

    frozenAt:
      forecastAt,

    observationSignature:
      ""
  };

  planA.observationSignature =
    planAObservationSignature(
      day,
      planA
    );

  if (badPlanASignature) {
    planA.observationSignature =
      "f".repeat(64);
  }

  const planA2 = {
    ok: true,
    date: day,
    planId:
      "plan-a2",
    outputMode:
      "plan-a2-observation",
    generatedAt:
      forecastAt,
    count: 1,
    picks: [
      a2Pick
    ]
  };

  const planB = {
    ok: true,
    date: day,
    planId:
      "plan-b",
    outputMode:
      "plan-b-observation",
    generatedAt:
      forecastAt,
    count: 1,
    picks: [
      bPick
    ],
    sourceContract: {
      fixtureUniverse:
        baseUniverse
    }
  };

  const planB2 = {
    ok: true,
    date: day,
    planId:
      "plan-b2",
    outputMode:
      "plan-b2-observation",
    generatedAt:
      forecastAt,
    count: 1,
    picks: [
      b2Pick
    ],
    sourceContract: {
      fixtureUniverse:
        b2Universe
    }
  };

  writeJson(
    repo,
    `data/deploy-snapshots/${day}/value.json`,
    sourceA
  );

  writeJson(
    repo,
    `data/deploy-snapshots/${day}/value-audit.json`,
    {
      ok: true,
      date: day,
      generatedAt:
        forecastAt,
      fixtureUniverse:
        baseUniverse
    }
  );

  writeJson(
    repo,
    `data/value-plans/${day}/plan-a.json`,
    planA
  );

  writeJson(
    repo,
    `data/value-plans/${day}/plan-a-audit.json`,
    {
      ok: true,
      date: day,
      generatedAt:
        forecastAt
    }
  );

  writeJson(
    repo,
    `data/value-plans/${day}/plan-a2.json`,
    planA2
  );

  writeJson(
    repo,
    `data/value-plans/${day}/plan-a2-audit.json`,
    {
      ok: true,
      date: day,
      planId:
        "plan-a2",
      generatedAt:
        forecastAt,
      fixtureUniverse:
        baseUniverse
    }
  );

  writeJson(
    repo,
    `data/value-plans/${day}/plan-b.json`,
    planB
  );

  writeJson(
    repo,
    `data/value-plans/${day}/plan-b-audit.json`,
    {
      ok: true,
      date: day,
      generatedAt:
        forecastAt,
      membership: {
        fixtureUniverse:
          baseUniverse
      }
    }
  );

  writeJson(
    repo,
    `data/value-plans/${day}/plan-b2.json`,
    planB2
  );

  writeJson(
    repo,
    `data/value-plans/${day}/plan-b2-audit.json`,
    {
      ok: true,
      date: day,
      generatedAt:
        forecastAt,
      membership: {
        fixtureUniverse:
          b2Universe
      }
    }
  );

  const comparisonPlans = {};

  for (
    const [
      planKey,
      probability
    ]
    of [
      [
        "A",
        0.80
      ],
      [
        "A2",
        0.78
      ],
      [
        "B",
        0.82
      ],
      [
        "B2",
        0.79
      ]
    ]
  ) {
    comparisonPlans[
      planKey
    ] = {
      picks:
        planKey ===
          omitComparisonPlan
          ? []
          : [
              {
                canonicalMatchId:
                  id,

                matchId:
                  id,

                leagueSlug:
                  "test.1",

                kickoff,

                market:
                  "OU25",

                pick:
                  "OVER",

                band:
                  "HIGH",

                score:
                  probability,

                result:
                  "WIN"
              }
            ]
    };
  }

  writeJson(
    repo,
    `data/value-comparison/${day}.json`,
    {
      ok: true,
      date: day,
      plans:
        comparisonPlans
    }
  );

  const firstCommit =
    commitAll(
      repo,
      "first observations",
      commitAt
    );

  return {
    day,
    id,
    kickoff,
    forecastAt,
    firstCommit
  };
}

test(
  "reads first Git observation even after a later plan mutation",
  () => {
    const repo =
      makeRepo();

    try {
      const setup =
        installDay(repo);

      const planBPath =
        path.join(
          repo,
          "data",
          "value-plans",
          setup.day,
          "plan-b.json"
        );

      const later =
        JSON.parse(
          fs.readFileSync(
            planBPath,
            "utf8"
          )
        );

      later.picks[0]
        .modelProb = 0.10;

      fs.writeFileSync(
        planBPath,
        `${JSON.stringify(
          later,
          null,
          2
        )}\n`,
        "utf8"
      );

      commitAll(
        repo,
        "later mutation",
        "2026-08-01T10:00:00.000Z"
      );

      const result =
        buildFirstObservedFourPlanEvaluation({
          repoRoot:
            repo,
          startDay:
            setup.day,
          endDay:
            setup.day
        });

      assert.equal(
        result.ok,
        true
      );

      assert.equal(
        result.rows.length,
        4
      );

      const b =
        result.rows.find(
          row =>
            row.plan === "B"
        );

      assert.ok(b);

      assert.equal(
        b.probability,
        0.82
      );

      assert.equal(
        b.provenance
          .firstObservedCommit,
        setup.firstCommit
      );

      assert.equal(
        result.evaluation
          .commonSelected
          .strictScoreableSlotCount,
        1
      );
    } finally {
      fs.rmSync(
        repo,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "first Git observation after kickoff fails closed",
  () => {
    const repo =
      makeRepo();

    try {
      const setup =
        installDay(
          repo,
          {
            commitAt:
              "2026-08-01T13:00:00.000Z"
          }
        );

      const result =
        buildFirstObservedFourPlanEvaluation({
          repoRoot:
            repo,
          days: [
            setup.day
          ]
        });

      assert.equal(
        result.rows.length,
        4
      );

      assert.equal(
        result.rows.filter(
          row =>
            row.preKickoffProven
        ).length,
        0
      );

      for (
        const planKey
        of [
          "A",
          "A2",
          "B",
          "B2"
        ]
      ) {
        assert.equal(
          result.evaluation
            .plans[planKey]
            .counts
            .properScoreEligible,
          0
        );
      }
    } finally {
      fs.rmSync(
        repo,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "fixture-universe mismatch excludes strict common comparison",
  () => {
    const repo =
      makeRepo();

    try {
      const setup =
        installDay(
          repo,
          {
            b2UniverseHashChar:
              "b"
          }
        );

      const result =
        buildFirstObservedFourPlanEvaluation({
          repoRoot:
            repo,
          days: [
            setup.day
          ]
        });

      assert.equal(
        result.daySummary[0]
          .universeExact,
        false
      );

      assert.equal(
        result.evaluation
          .commonSelected
          .commonSelectedSlotCount,
        1
      );

      assert.equal(
        result.evaluation
          .commonSelected
          .strictScoreableSlotCount,
        0
      );

      assert.equal(
        result.evaluation
          .commonSelected
          .rejectionFlags
          .exactUniverseMissing,
        1
      );

      for (
        const planKey
        of [
          "A",
          "A2",
          "B",
          "B2"
        ]
      ) {
        assert.equal(
          result.evaluation
            .plans[planKey]
            .counts
            .properScoreEligible,
          1
        );
      }
    } finally {
      fs.rmSync(
        repo,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "invalid Plan A signature excludes strict common comparison",
  () => {
    const repo =
      makeRepo();

    try {
      const setup =
        installDay(
          repo,
          {
            badPlanASignature:
              true
          }
        );

      const result =
        buildFirstObservedFourPlanEvaluation({
          repoRoot:
            repo,
          days: [
            setup.day
          ]
        });

      assert.equal(
        result.daySummary[0]
          .planAFreezeProven,
        false
      );

      assert.equal(
        result.daySummary[0]
          .universeExact,
        true
      );

      assert.equal(
        result.evaluation
          .commonSelected
          .commonSelectedSlotCount,
        1
      );

      assert.equal(
        result.evaluation
          .commonSelected
          .strictScoreableSlotCount,
        0
      );

      assert.equal(
        result.evaluation
          .commonSelected
          .rejectionFlags
          .planAFreezeMissing,
        1
      );
    } finally {
      fs.rmSync(
        repo,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "missing comparison settlement row never enters proper scoring",
  () => {
    const repo =
      makeRepo();

    try {
      const setup =
        installDay(
          repo,
          {
            omitComparisonPlan:
              "B2"
          }
        );

      const result =
        buildFirstObservedFourPlanEvaluation({
          repoRoot:
            repo,
          days: [
            setup.day
          ]
        });

      const b2 =
        result.rows.find(
          row =>
            row.plan === "B2"
        );

      assert.ok(b2);

      assert.equal(
        b2.comparisonMatched,
        false
      );

      assert.equal(
        b2.result,
        "MISSING"
      );

      assert.equal(
        result.evaluation
          .plans.B2
          .counts
          .properScoreEligible,
        0
      );

      assert.equal(
        result.evaluation
          .commonSelected
          .strictScoreableSlotCount,
        0
      );
    } finally {
      fs.rmSync(
        repo,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);
