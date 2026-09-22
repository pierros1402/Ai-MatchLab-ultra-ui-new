import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  resolveDataPath
} from "../storage/data-root.js";

import {
  buildCheckpointAwareTargetedRepairShadow
} from "../core/checkpoint-aware-targeted-repair-shadow.js";

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

export function runCheckpointAwareTargetedRepairShadowDay({
  dayKey,
  remoteHead,
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

  let detailsMirror = null;
  let detailsMirrorReadError = null;

  try {
    detailsMirror =
      verifyDetailsValueMirrorDay(
        dayKey
      );
  }
  catch (error) {
    detailsMirrorReadError =
      String(
        error?.message ||
        error ||
        "unknown_details_mirror_error"
      );
  }

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
      detailsMirror
    });

  return {
    ...shadow,

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

      detailsMirrorEvaluated:
        Boolean(
          detailsMirror
        ),

      detailsMirrorOk:
        detailsMirror?.ok ??
        null,

      detailsMirrorReadError
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

  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(
      dayKey
    )
  ) {
    console.error(
      "Usage: node engine-v1/jobs/run-checkpoint-aware-targeted-repair-shadow-day.js --date=YYYY-MM-DD [--remote-head=<40-char-sha>]"
    );

    process.exit(1);
  }

  const report =
    runCheckpointAwareTargetedRepairShadowDay({
      dayKey,
      remoteHead
    });

  console.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );
}
