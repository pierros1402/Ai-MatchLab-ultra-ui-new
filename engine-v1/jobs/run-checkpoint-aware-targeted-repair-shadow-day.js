import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  resolveDataPath
} from "../storage/data-root.js";

import {
  CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT,
  buildCheckpointAwareTargetedRepairShadow,
  evaluateCanonicalSuppressedAliasObservation,
  evaluatePublishedDetailsParity
} from "../core/checkpoint-aware-targeted-repair-shadow.js";

import {
  applyProductionIdentityMembershipGate,
  canonicalFixturesForDay
} from "../core/day-fixture-universe.js";

import {
  getProductionIdentityResolver
} from "../core/production-identity-resolver-runtime.js";

import {
  verifyDetailsValueMirrorDay
} from "./verify-details-value-mirror-day.js";

function readJsonSafe(
  file,
  fallback = null
) {
  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  }
  catch {
    return fallback;
  }
}

export function athensCalendarDayKey(
  now =
    new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Europe/Athens",
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit"
      }
    )
      .formatToParts(
        now
      );

  const values =
    Object.fromEntries(
      parts
        .filter(
          part =>
            [
              "year",
              "month",
              "day"
            ].includes(
              part.type
            )
        )
        .map(
          part =>
            [
              part.type,
              part.value
            ]
        )
    );

  return [
    values.year,
    values.month,
    values.day
  ].join("-");
}

export function observeCanonicalSuppressedAliasForShadow({
  dayKey,
  dataPath =
    resolveDataPath,
  resolverFactory =
    getProductionIdentityResolver,
  canonicalRowsForDay =
    canonicalFixturesForDay,
  membershipGate =
    applyProductionIdentityMembershipGate
} = {}) {
  const canonicalDir =
    dataPath(
      "canonical-fixtures",
      dayKey
    );

  if (
    !fs.existsSync(
      canonicalDir
    )
  ) {
    return evaluateCanonicalSuppressedAliasObservation({
      observationAvailable:
        false,
      reason:
        "canonical_fixture_directory_unavailable"
    });
  }

  try {
    const resolver =
      resolverFactory();

    const rawSuppressedFixtureIds = [];

    for (
      const file of
        fs
          .readdirSync(
            canonicalDir
          )
          .filter(
            name =>
              name.endsWith(
                ".json"
              )
          )
          .sort()
    ) {
      const slug =
        path.basename(
          file,
          ".json"
        );

      const payload =
        readJsonSafe(
          path.join(
            canonicalDir,
            file
          ),
          null
        );

      const rows =
        Array.isArray(
          payload?.fixtures
        )
          ? payload.fixtures
          : [];

      const rawGate =
        membershipGate(
          rows.map(
            row => ({
              ...row,
              leagueSlug:
                row?.leagueSlug ||
                slug
            })
          ),
          {
            resolver
          }
        );

      rawSuppressedFixtureIds.push(
        ...(
          rawGate
            ?.diagnostics
            ?.suppressedFixtureIds ||
          []
        )
      );
    }

    const canonicalRows =
      canonicalRowsForDay(
        dayKey
      );

    const fixedPoint =
      membershipGate(
        canonicalRows,
        {
          resolver
        }
      );

    return evaluateCanonicalSuppressedAliasObservation({
      observationAvailable:
        true,
      rawSuppressedFixtureIds,
      postGateSuppressedFixtureIds:
        fixedPoint
          ?.diagnostics
          ?.suppressedFixtureIds ||
        []
    });
  }
  catch (error) {
    return evaluateCanonicalSuppressedAliasObservation({
      observationAvailable:
        true,
      readError:
        String(
          error?.message ||
          error ||
          "unknown_canonical_suppressed_alias_observation_error"
        )
    });
  }
}

export function observePublishedDetailsParityForShadow({
  dayKey,
  dataPath =
    resolveDataPath
} = {}) {
  const snapshotDir =
    dataPath(
      "deploy-snapshots",
      dayKey
    );

  const manifest =
    readJsonSafe(
      path.join(
        snapshotDir,
        "manifest.json"
      )
    );

  if (!manifest) {
    return evaluatePublishedDetailsParity({
      observationAvailable:
        false,
      reason:
        "published_manifest_unavailable"
    });
  }

  const fixturesPayload =
    readJsonSafe(
      path.join(
        snapshotDir,
        "fixtures.json"
      )
    );

  const fixtures =
    Array.isArray(
      fixturesPayload?.fixtures
    )
      ? fixturesPayload.fixtures
      : (
          Array.isArray(
            fixturesPayload
          )
            ? fixturesPayload
            : null
        );

  if (
    !Array.isArray(
      fixtures
    )
  ) {
    return evaluatePublishedDetailsParity({
      manifest,
      fixtures:
        [],
      detailFiles:
        [],
      observationAvailable:
        true
    });
  }

  const detailsDir =
    path.join(
      snapshotDir,
      "details"
    );

  const detailFiles =
    fs.existsSync(
      detailsDir
    )
      ? fs
          .readdirSync(
            detailsDir
          )
          .filter(
            name =>
              name.endsWith(
                ".json"
              )
          )
          .sort()
      : [];

  return evaluatePublishedDetailsParity({
    manifest,
    fixtures,
    detailFiles,
    observationAvailable:
      true
  });
}

export function observeDetailsMirrorForShadow({
  dayKey,
  context,
  dataPath =
    resolveDataPath,
  verifyDetailsMirror =
    verifyDetailsValueMirrorDay
} = {}) {
  const normalizedContext =
    String(
      context || ""
    )
      .trim()
      .toLowerCase();

  const sourceDetailsDir =
    dataPath(
      "details",
      dayKey
    );

  const sourceDetailsAvailable =
    fs.existsSync(
      sourceDetailsDir
    );

  if (
    normalizedContext ===
      CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT.DAILY &&
    !sourceDetailsAvailable
  ) {
    return {
      sourceDetailsAvailable:
        false,

      detailsMirror: {
        observationAvailable:
          true,
        ok:
          false,
        violations: [
          {
            code:
              "source_details_tree_missing_in_daily_context"
          }
        ],
        reason:
          "daily_source_details_required",
        readError:
          null
      }
    };
  }

  if (
    normalizedContext !==
      CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT.DAILY
  ) {
    return {
      sourceDetailsAvailable,

      detailsMirror: {
        observationAvailable:
          false,
        ok:
          null,
        violations:
          [],
        reason:
          sourceDetailsAvailable
            ? "source_mirror_not_required_for_context"
            : "source_details_tree_unavailable_for_context",
        readError:
          null
      }
    };
  }

  try {
    const result =
      verifyDetailsMirror(
        dayKey
      );

    return {
      sourceDetailsAvailable:
        true,

      detailsMirror: {
        ...result,
        observationAvailable:
          true,
        reason:
          null,
        readError:
          null
      }
    };
  }
  catch (error) {
    return {
      sourceDetailsAvailable:
        true,

      detailsMirror: {
        observationAvailable:
          true,
        ok:
          false,
        violations:
          [],
        reason:
          "details_mirror_verifier_error",
        readError:
          String(
            error?.message ||
            error ||
            "unknown_details_mirror_error"
          )
      }
    };
  }
}

export function runCheckpointAwareTargetedRepairShadowDay({
  dayKey,
  remoteHead,
  context =
    CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT.STATIC,
  generatedAt =
    new Date().toISOString(),
  now =
    new Date()
} = {}) {
  const snapshotDir =
    resolveDataPath(
      "deploy-snapshots",
      dayKey
    );

  const manifest =
    readJsonSafe(
      path.join(
        snapshotDir,
        "manifest.json"
      )
    );

  const freshness =
    readJsonSafe(
      path.join(
        snapshotDir,
        "freshness-report.json"
      )
    );

  const buildReport =
    readJsonSafe(
      resolveDataPath(
        "build-reports",
        `${dayKey}.json`
      )
    );

  const normalizedContext =
    String(
      context || ""
    )
      .trim()
      .toLowerCase();

  if (
    !Object.values(
      CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT
    )
      .includes(
        normalizedContext
      )
  ) {
    throw new Error(
      `invalid_shadow_context:${normalizedContext || "missing"}`
    );
  }

  const canonicalSuppressedAliasObservation =
    observeCanonicalSuppressedAliasForShadow({
      dayKey
    });

  const publishedDetailsParity =
    observePublishedDetailsParityForShadow({
      dayKey
    });

  const detailsObservation =
    observeDetailsMirrorForShadow({
      dayKey,
      context:
        normalizedContext
    });

  const detailsMirror =
    detailsObservation
      .detailsMirror;

  const shadow =
    buildCheckpointAwareTargetedRepairShadow({
      dayKey,
      currentDayKey:
        athensCalendarDayKey(
          now
        ),
      generatedAt,
      remoteHead,
      manifest,
      freshness,
      buildReport,
      detailsMirror,
      publishedDetailsParity,
      canonicalSuppressedAliasObservation
    });

  return {
    ...shadow,

    context:
      normalizedContext,

    productionDetailsContract: {
      publishedFixtureDetailBijectionRequired:
        true,

      sourceDetailsRequired:
        normalizedContext ===
          CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT.DAILY,

      publishedDetailsParity
    },

    productionIdentityContract: {
      suppressedAliasesMustNotSurviveCanonicalMembershipGate:
        true,

      canonicalSuppressedAliasObservation
    },

    observationCapabilities: {
      detailsValueMirrorSourceTree:
        detailsObservation
          .sourceDetailsAvailable,

      temporarilyUnobservableFailureClasses: [
        ...(
          detailsMirror
            .observationAvailable ===
              true
            ? []
            : [
                "DETAILS_VALUE_MIRROR_SOURCE_DETAIL_EXTRA_FILE"
              ]
        ),

        ...(
          canonicalSuppressedAliasObservation
            .observationAvailable ===
              true
            ? []
            : [
                "CANONICAL_SUPPRESSED_ALIAS_PRESENT"
              ]
        )
      ]
    },

    inputDiagnostics: {
      manifestPresent:
        Boolean(
          manifest
        ),

      freshnessPresent:
        Boolean(
          freshness
        ),

      buildReportPresent:
        Boolean(
          buildReport
        ),

      sourceDetailsAvailable:
        detailsObservation
          .sourceDetailsAvailable,

      canonicalSuppressedAliasObservationAvailable:
        canonicalSuppressedAliasObservation
          .observationAvailable ===
            true,

      canonicalSuppressedAliasObservationOk:
        canonicalSuppressedAliasObservation
          .ok ??
        null,

      canonicalRawSuppressedAliasCount:
        canonicalSuppressedAliasObservation
          .rawSuppressedAliasCount ??
        null,

      canonicalPostGateSuppressedAliasCount:
        canonicalSuppressedAliasObservation
          .postGateSuppressedAliasCount ??
        null,

      canonicalSuppressedAliasReadError:
        canonicalSuppressedAliasObservation
          .readError ??
        null,

      publishedDetailsParityObservationAvailable:
        publishedDetailsParity
          .observationAvailable ===
            true,

      publishedDetailsParityOk:
        publishedDetailsParity
          .ok ??
        null,

      detailsMirrorObservationAvailable:
        detailsMirror
          .observationAvailable ===
            true,

      detailsMirrorEvaluated:
        detailsMirror
          .observationAvailable ===
            true &&
        !detailsMirror
          .readError,

      detailsMirrorOk:
        detailsMirror
          .ok ??
        null,

      detailsMirrorObservationReason:
        detailsMirror
          .reason ??
        null,

      detailsMirrorReadError:
        detailsMirror
          .readError ??
        null
    }
  };
}

function parseArg(
  name
) {
  const prefix =
    `--${name}=`;

  const value =
    process.argv
      .slice(2)
      .find(
        arg =>
          arg.startsWith(
            prefix
          )
      );

  return value
    ? value
        .slice(
          prefix.length
        )
        .trim()
    : "";
}

const entryUrl =
  process.argv[1]
    ? pathToFileURL(
        process.argv[1]
      ).href
    : null;

if (
  entryUrl ===
    import.meta.url
) {
  const dayKey =
    parseArg(
      "date"
    ) ||
    process.argv
      .slice(2)
      .find(
        arg =>
          /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(
            arg
          )
      ) ||
    "";

  const remoteHead =
    parseArg(
      "remote-head"
    );

  const context =
    parseArg(
      "context"
    ) ||
    CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT.STATIC;

  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(
      dayKey
    )
  ) {
    console.error(
      "Usage: node engine-v1/jobs/run-checkpoint-aware-targeted-repair-shadow-day.js --date=YYYY-MM-DD [--remote-head=<40-char-sha>] [--context=daily|intraday|static]"
    );

    process.exit(1);
  }

  const report =
    runCheckpointAwareTargetedRepairShadowDay({
      dayKey,
      remoteHead,
      context
    });

  console.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );
}
