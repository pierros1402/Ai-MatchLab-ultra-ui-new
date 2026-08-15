import fs from "node:fs";
import path from "node:path";
import {
  pathToFileURL
} from "node:url";

import {
  fixturesForSnapshotDay
} from "../core/day-fixture-universe.js";

import {
  applyAuthoritativeTerminalWriteback
} from "../core/authoritative-terminal-writeback.js";

import {
  assertCanonicalStatusCoherence
} from "../core/canonical-status-coherence.js";

import {
  resolveDataPath
} from "../storage/data-root.js";

function clean(value) {
  return String(value ?? "").trim();
}

function readJsonSafe(file) {
  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  }
  catch {
    return null;
  }
}

function writeJsonStable(file, payload) {
  fs.writeFileSync(
    file,
    JSON.stringify(
      payload,
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function providerIdOf(row) {
  return clean(
    row?.providerMatchId ||
    row?.sourceId ||
    row?.sourceMatchId ||
    (
      /^\d+$/u.test(
        clean(row?.matchId)
      )
        ? row?.matchId
        : ""
    )
  );
}

function candidateIndex(rows) {
  const index =
    new Map();

  for (
    const row of
    Array.isArray(rows)
      ? rows
      : []
  ) {
    const providerId =
      providerIdOf(row);

    if (!providerId) {
      continue;
    }

    const existing =
      index.get(providerId);

    if (existing) {
      index.set(
        providerId,
        null
      );

      continue;
    }

    if (
      !index.has(providerId)
    ) {
      index.set(
        providerId,
        row
      );
    }
  }

  return index;
}

export function promoteAuthoritativeTerminalOverlaysDay(
  dayKey,
  options = {}
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u
      .test(clean(dayKey))
  ) {
    throw new Error(
      "invalid_day_key"
    );
  }

  const canonicalDir =
    resolveDataPath(
      "canonical-fixtures",
      dayKey
    );

  const universe =
    options.universe ||
    fixturesForSnapshotDay(
      dayKey
    );

  const overlayRows =
    Array.isArray(
      universe?.fixtures
    )
      ? universe.fixtures
      : [];

  const byProviderId =
    candidateIndex(
      overlayRows
    );

  const report = {
    ok: true,
    schema:
      "ai-matchlab.authoritative-terminal-overlay-promotion.v1",
    dayKey,
    generatedAt:
      new Date().toISOString(),
    scannedLeagueCount:
      0,
    scannedCanonicalRows:
      0,
    candidateRows:
      0,
    promotedRows:
      0,
    unchangedRows:
      0,
    rejectedRows:
      0,
    ambiguousProviderIds:
      0,
    byReason: {},
    promoted: []
  };

  if (
    !fs.existsSync(
      canonicalDir
    )
  ) {
    return report;
  }

  const files =
    fs.readdirSync(
      canonicalDir
    )
      .filter(name =>
        name.endsWith(".json")
      )
      .sort();

  for (const name of files) {
    const file =
      path.join(
        canonicalDir,
        name
      );

    const payload =
      readJsonSafe(file);

    if (
      !payload ||
      !Array.isArray(
        payload.fixtures
      )
    ) {
      continue;
    }

    report.scannedLeagueCount++;

    let changed =
      false;

    const nextFixtures =
      payload.fixtures.map(
        canonicalRow => {
          report.scannedCanonicalRows++;

          const providerId =
            providerIdOf(
              canonicalRow
            );

          if (!providerId) {
            return canonicalRow;
          }

          if (
            byProviderId.has(
              providerId
            ) &&
            byProviderId.get(
              providerId
            ) === null
          ) {
            report.ambiguousProviderIds++;
            return canonicalRow;
          }

          const observationRow =
            byProviderId.get(
              providerId
            );

          if (!observationRow) {
            return canonicalRow;
          }

          report.candidateRows++;

          const result =
            applyAuthoritativeTerminalWriteback({
              canonicalRow,
              observationRow,
              dayKey,
              promotedAt:
                report.generatedAt
            });

          if (!result.decision.ok) {
            report.rejectedRows++;

            const reason =
              result.decision.reason ||
              "unknown";

            report.byReason[reason] =
              Number(
                report.byReason[reason] ||
                0
              ) + 1;

            return canonicalRow;
          }

          if (!result.changed) {
            report.unchangedRows++;
            return canonicalRow;
          }

          changed =
            true;

          report.promotedRows++;

          report.promoted.push({
            canonicalId:
              canonicalRow?.canonicalId ||
              canonicalRow?.matchId ||
              null,

            providerMatchId:
              providerId,

            leagueSlug:
              canonicalRow?.leagueSlug ||
              payload?.leagueSlug ||
              name.replace(
                /\.json$/u,
                ""
              ),

            homeTeam:
              canonicalRow?.homeTeam ||
              null,

            awayTeam:
              canonicalRow?.awayTeam ||
              null,

            score:
              `${result.row.scoreHome}-${result.row.scoreAway}`
          });

          return result.row;
        }
      );

    if (
      changed &&
      options.write !== false
    ) {
      const nextPayload = {
        ...payload,
        fixtures:
          nextFixtures,
        sourceMeta: {
          ...(
            payload?.sourceMeta &&
            typeof payload.sourceMeta ===
              "object"
              ? payload.sourceMeta
              : {}
          ),

          authoritativeTerminalOverlayPromotion: {
            schema:
              report.schema,
            promotedAt:
              report.generatedAt,
            exactProviderIdOnly:
              true,
            orderedTeamIdentityRequired:
              true,
            athensDayRequired:
              true,
            explicitTerminalStatusRequired:
              true,
            numericScoreRequired:
              true,
            heuristicIdentity:
              false
          }
        }
      };

      assertCanonicalStatusCoherence(
        nextPayload,
        {
          path:
            file
        }
      );

      writeJsonStable(
        file,
        nextPayload
      );
    }
  }

  return report;
}

const entryUrl =
  process.argv[1]
    ? pathToFileURL(
        process.argv[1]
      ).href
    : null;

if (entryUrl === import.meta.url) {
  const dayKey =
    process.argv.find(arg =>
      arg.startsWith("--date=")
    )
      ?.split("=")[1] ||
    process.argv
      .slice(2)
      .find(arg =>
        /^\d{4}-\d{2}-\d{2}$/u
          .test(arg)
      );

  const dryRun =
    process.argv.includes(
      "--dry-run"
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/u
      .test(clean(dayKey))
  ) {
    console.error(
      "Usage: node engine-v1/jobs/promote-authoritative-terminal-overlays-day.js --date=YYYY-MM-DD [--dry-run]"
    );

    process.exit(1);
  }

  const report =
    promoteAuthoritativeTerminalOverlaysDay(
      dayKey,
      {
        write:
          !dryRun
      }
    );

  console.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );
}
