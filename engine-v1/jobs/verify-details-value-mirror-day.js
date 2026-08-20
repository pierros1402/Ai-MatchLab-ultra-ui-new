import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAN_A_OBSERVATION_SCHEMA,
  isPlanAObservationDay,
  planAObservationSignature,
  rowsFromPlanAPayload
} from "../value/plan-a-observation.js";

import {
  resolveDataPath
} from "../storage/data-root.js";

function clean(value) {
  return String(value ?? "").trim();
}

function readJson(file) {
  if (!fs.existsSync(file)) {
    return {
      exists: false,
      payload: null,
      error: null
    };
  }

  try {
    return {
      exists: true,
      payload: JSON.parse(
        fs.readFileSync(file, "utf8")
      ),
      error: null
    };
  }
  catch (error) {
    return {
      exists: true,
      payload: null,
      error:
        error?.message ||
        String(error)
    };
  }
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (
    !value ||
    typeof value !== "object"
  ) {
    return value;
  }

  const out = {};

  for (
    const key of
    Object.keys(value).sort()
  ) {
    out[key] =
      stableValue(value[key]);
  }

  return out;
}

function normalizedRows(value) {
  return (
    Array.isArray(value)
      ? value
      : []
  )
    .map(row =>
      JSON.stringify(
        stableValue(row)
      )
    )
    .sort();
}

function sameRows(a, b) {
  return (
    JSON.stringify(normalizedRows(a)) ===
    JSON.stringify(normalizedRows(b))
  );
}

function fixtureIds(fixture) {
  return new Set(
    [
      fixture?.canonicalId,
      fixture?.matchId,
      fixture?.sourceMatchId,
      fixture?.providerMatchId,
      fixture?.sourceId,
      fixture?.matchKey
    ]
      .map(clean)
      .filter(Boolean)
  );
}

function pickMatchesFixture(
  pick,
  fixture
) {
  const ids = fixtureIds(fixture);

  return [
    pick?.canonicalId,
    pick?.matchId
  ]
    .map(clean)
    .filter(Boolean)
    .some(id => ids.has(id));
}

function detailFileName(fixture) {
  const id =
    clean(fixture?.canonicalId) ||
    clean(fixture?.matchId);

  return id
    ? `${id}.json`
    : "";
}

function validateObservation(
  dayKey,
  observation
) {
  if (
    !observation ||
    typeof observation !== "object" ||
    Array.isArray(observation)
  ) {
    return {
      ok: false,
      reason:
        "plan_a_observation_not_object"
    };
  }

  if (
    observation.schema !==
    PLAN_A_OBSERVATION_SCHEMA
  ) {
    return {
      ok: false,
      reason:
        "plan_a_observation_schema_invalid"
    };
  }

  if (
    clean(observation.date) !==
    clean(dayKey)
  ) {
    return {
      ok: false,
      reason:
        "plan_a_observation_date_mismatch"
    };
  }

  if (
    observation.immutable !== true
  ) {
    return {
      ok: false,
      reason:
        "plan_a_observation_not_immutable"
    };
  }

  const picks =
    rowsFromPlanAPayload(
      observation
    );

  if (
    Number(observation.count) !==
    picks.length
  ) {
    return {
      ok: false,
      reason:
        "plan_a_observation_count_mismatch"
    };
  }

  const computed =
    planAObservationSignature(
      dayKey,
      observation
    );

  const declared =
    clean(
      observation.observationSignature
    ).toLowerCase();

  if (
    !/^[a-f0-9]{64}$/u.test(
      declared
    ) ||
    declared !== computed
  ) {
    return {
      ok: false,
      reason:
        "plan_a_observation_signature_invalid",
      declared,
      computed
    };
  }

  return {
    ok: true,
    picks,
    signature: computed
  };
}

function publicationAuthorityForDay(
  dayKey,
  currentValue,
  dataPath
) {
  if (
    !isPlanAObservationDay(dayKey)
  ) {
    return {
      ok: true,
      authority:
        "current_value_artifact",
      payload: currentValue
    };
  }

  const observationFile =
    dataPath(
      "value-plans",
      dayKey,
      "plan-a.json"
    );

  const observationState =
    readJson(observationFile);

  if (observationState.error) {
    return {
      ok: false,
      reason:
        "plan_a_observation_invalid_json",
      observationFile,
      error:
        observationState.error
    };
  }

  if (observationState.exists) {
    const validation =
      validateObservation(
        dayKey,
        observationState.payload
      );

    if (!validation.ok) {
      return {
        ok: false,
        observationFile,
        ...validation
      };
    }

    return {
      ok: true,
      authority:
        "frozen_plan_a_observation",
      payload:
        observationState.payload,
      signature:
        validation.signature,
      observationFile
    };
  }

  return {
    ok: true,
    authority:
      "current_value_artifact_first_freeze",
    payload: currentValue,
    observationFile
  };
}

function inspectDetailsTree({
  kind,
  dir,
  fixtures,
  publicationPicks
}) {
  const violations = [];

  const actualFiles =
    fs.existsSync(dir)
      ? fs.readdirSync(dir)
          .filter(name =>
            name.endsWith(".json")
          )
          .sort()
      : [];

  const expectedFiles =
    fixtures
      .map(detailFileName)
      .filter(Boolean)
      .sort();

  const expectedSet =
    new Set(expectedFiles);

  const extraFiles =
    actualFiles.filter(
      name => !expectedSet.has(name)
    );

  const actualSet =
    new Set(actualFiles);

  const missingFiles =
    expectedFiles.filter(
      name => !actualSet.has(name)
    );

  for (const file of extraFiles) {
    violations.push({
      code:
        `${kind}_detail_extra_file`,
      file
    });
  }

  for (const file of missingFiles) {
    violations.push({
      code:
        `${kind}_detail_missing_file`,
      file
    });
  }

  let valuePickCount = 0;
  let detailsWithValue = 0;

  for (const fixture of fixtures) {
    const file =
      detailFileName(fixture);

    if (
      !file ||
      !actualSet.has(file)
    ) {
      continue;
    }

    const state =
      readJson(
        path.join(dir, file)
      );

    if (
      !state.exists ||
      state.error ||
      !state.payload
    ) {
      violations.push({
        code:
          `${kind}_detail_invalid_json`,
        file,
        error:
          state.error || null
      });

      continue;
    }

    const expected =
      publicationPicks.filter(
        pick =>
          pickMatchesFixture(
            pick,
            fixture
          )
      );

    const actual =
      Array.isArray(
        state.payload?.value
      )
        ? state.payload.value
        : [];

    valuePickCount +=
      actual.length;

    if (actual.length > 0) {
      detailsWithValue += 1;
    }

    if (
      !sameRows(
        expected,
        actual
      )
    ) {
      violations.push({
        code:
          `${kind}_detail_value_mismatch`,
        file,
        expectedPicks:
          expected.length,
        actualPicks:
          actual.length
      });
    }

    const summaryCount =
      Number(
        state.payload
          ?.valueSummary
          ?.count ?? 0
      );

    if (
      summaryCount !==
      expected.length
    ) {
      violations.push({
        code:
          `${kind}_detail_value_summary_mismatch`,
        file,
        expected:
          expected.length,
        actual:
          summaryCount
      });
    }
  }

  return {
    files: actualFiles.length,
    expectedFiles:
      expectedFiles.length,
    valuePickCount,
    detailsWithValue,
    violations
  };
}

export function verifyDetailsValueMirrorDay(
  dayKey,
  options = {}
) {
  const day =
    clean(dayKey);

  const dataPath =
    typeof options.resolveDataPath ===
      "function"
      ? options.resolveDataPath
      : resolveDataPath;

  const violations = [];

  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      day
    )
  ) {
    return {
      ok: false,
      dayKey: day,
      authority: null,
      violations: [
        {
          code:
            "invalid_day_key"
        }
      ]
    };
  }

  const currentValueState =
    readJson(
      dataPath(
        "value",
        `${day}.json`
      )
    );

  if (
    !currentValueState.exists
  ) {
    violations.push({
      code:
        "production_value_missing"
    });
  }
  else if (
    currentValueState.error
  ) {
    violations.push({
      code:
        "production_value_invalid_json",
      error:
        currentValueState.error
    });
  }

  const publication =
    publicationAuthorityForDay(
      day,
      currentValueState.payload,
      dataPath
    );

  if (!publication.ok) {
    violations.push({
      code:
        "plan_a_publication_authority_invalid",
      reason:
        publication.reason || null
    });
  }

  const publicationPicks =
    publication.ok
      ? rowsFromPlanAPayload(
          publication.payload
        )
      : [];

  const missingPickIdentity =
    publicationPicks.filter(
      pick =>
        !clean(pick?.canonicalId) &&
        !clean(pick?.matchId)
    );

  if (
    missingPickIdentity.length
  ) {
    violations.push({
      code:
        "publication_pick_missing_identity",
      count:
        missingPickIdentity.length
    });
  }

  const fixtureState =
    readJson(
      dataPath(
        "deploy-snapshots",
        day,
        "fixtures.json"
      )
    );

  const fixtures =
    Array.isArray(
      fixtureState.payload?.fixtures
    )
      ? fixtureState.payload.fixtures
      : [];

  if (
    !fixtureState.exists ||
    fixtureState.error
  ) {
    violations.push({
      code:
        "snapshot_fixtures_invalid",
      error:
        fixtureState.error || null
    });
  }

  const publicationOrphans =
    publicationPicks.filter(
      pick =>
        !fixtures.some(
          fixture =>
            pickMatchesFixture(
              pick,
              fixture
            )
        )
    );

  if (
    publicationOrphans.length
  ) {
    violations.push({
      code:
        "publication_pick_outside_snapshot_fixture_universe",
      count:
        publicationOrphans.length
    });
  }

  const snapshotValueState =
    readJson(
      dataPath(
        "deploy-snapshots",
        day,
        "value.json"
      )
    );

  if (
    !snapshotValueState.exists ||
    snapshotValueState.error
  ) {
    violations.push({
      code:
        "snapshot_value_invalid",
      error:
        snapshotValueState.error || null
    });
  }
  else {
    const snapshotPicks =
      rowsFromPlanAPayload(
        snapshotValueState.payload
      );

    if (
      !sameRows(
        publicationPicks,
        snapshotPicks
      )
    ) {
      violations.push({
        code:
          "snapshot_value_publication_mismatch",
        publicationPicks:
          publicationPicks.length,
        snapshotPicks:
          snapshotPicks.length
      });
    }

    if (
      Number(
        snapshotValueState
          .payload?.count ??
        snapshotPicks.length
      ) !== snapshotPicks.length
    ) {
      violations.push({
        code:
          "snapshot_value_count_mismatch"
      });
    }

    if (
      clean(
        snapshotValueState
          .payload
          ?.publicationAuthority
      ) !==
      clean(
        publication.authority
      )
    ) {
      violations.push({
        code:
          "snapshot_value_publication_authority_mismatch",
        expected:
          publication.authority ||
          null,
        actual:
          snapshotValueState
            .payload
            ?.publicationAuthority ||
          null
      });
    }
  }

  const source =
    inspectDetailsTree({
      kind: "source",
      dir:
        dataPath(
          "details",
          day
        ),
      fixtures,
      publicationPicks
    });

  const snapshot =
    inspectDetailsTree({
      kind: "snapshot",
      dir:
        dataPath(
          "deploy-snapshots",
          day,
          "details"
        ),
      fixtures,
      publicationPicks
    });

  violations.push(
    ...source.violations,
    ...snapshot.violations
  );

  const manifestState =
    readJson(
      dataPath(
        "deploy-snapshots",
        day,
        "manifest.json"
      )
    );

  const manifest =
    manifestState.payload;

  if (
    !manifestState.exists ||
    manifestState.error
  ) {
    violations.push({
      code:
        "manifest_invalid",
      error:
        manifestState.error || null
    });
  }
  else {
    const fixtureMatchesWithValue =
      fixtures.filter(
        fixture =>
          publicationPicks.some(
            pick =>
              pickMatchesFixture(
                pick,
                fixture
              )
          )
      ).length;

    if (
      Number(
        manifest
          ?.counts
          ?.valuePicks ?? -1
      ) !== publicationPicks.length
    ) {
      violations.push({
        code:
          "manifest_value_pick_count_mismatch",
        expected:
          publicationPicks.length,
        actual:
          manifest
            ?.counts
            ?.valuePicks ??
          null
      });
    }

    if (
      Number(
        manifest
          ?.coverage
          ?.detailsWithValue ?? -1
      ) !== fixtureMatchesWithValue
    ) {
      violations.push({
        code:
          "manifest_details_with_value_mismatch",
        expected:
          fixtureMatchesWithValue,
        actual:
          manifest
            ?.coverage
            ?.detailsWithValue ??
          null
      });
    }

    if (
      Number(
        manifest
          ?.counts
          ?.details ?? -1
      ) !== fixtures.length
    ) {
      violations.push({
        code:
          "manifest_detail_count_vs_fixture_universe_mismatch",
        expected:
          fixtures.length,
        actual:
          manifest
            ?.counts
            ?.details ??
          null
      });
    }
  }

  return {
    ok:
      violations.length === 0,

    dayKey: day,

    checkedAt:
      new Date().toISOString(),

    authority:
      publication.authority ||
      null,

    publicationSignature:
      publication.signature ||
      (
        publication.ok &&
        publication.payload
          ? planAObservationSignature(
              day,
              publication.payload
            )
          : null
      ),

    counts: {
      fixtures:
        fixtures.length,

      publicationPicks:
        publicationPicks.length,

      sourceDetails:
        source.files,

      snapshotDetails:
        snapshot.files,

      sourceValuePicks:
        source.valuePickCount,

      snapshotValuePicks:
        snapshot.valuePickCount,

      sourceDetailsWithValue:
        source.detailsWithValue,

      snapshotDetailsWithValue:
        snapshot.detailsWithValue
    },

    violations
  };
}

function parseArgs(
  argv =
    process.argv.slice(2)
) {
  let dayKey = "";
  let gate = false;

  for (const arg of argv) {
    if (
      /^\d{4}-\d{2}-\d{2}$/u.test(arg)
    ) {
      dayKey = arg;
      continue;
    }

    if (
      arg.startsWith("--date=")
    ) {
      dayKey =
        arg.slice(
          "--date=".length
        );

      continue;
    }

    if (arg === "--gate") {
      gate = true;
      continue;
    }

    throw new Error(
      `Unknown argument: ${arg}`
    );
  }

  return {
    dayKey,
    gate
  };
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url);

if (isCli) {
  try {
    const {
      dayKey,
      gate
    } = parseArgs();

    const report =
      verifyDetailsValueMirrorDay(
        dayKey
      );

    console.log(
      JSON.stringify(
        report,
        null,
        2
      )
    );

    if (
      gate &&
      !report.ok
    ) {
      process.exitCode = 1;
    }
  }
  catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          stage:
            "verify_details_value_mirror_failed",
          error:
            error?.message ||
            String(error)
        },
        null,
        2
      )
    );

    process.exitCode = 1;
  }
}