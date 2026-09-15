import fs from "node:fs";

import {
  resolveDataPath
} from "../storage/data-root.js";

import {
  canonicalFixturesForDay
} from "./day-fixture-universe.js";

const DAY_KEY_RE =
  /^20\d{2}-\d{2}-\d{2}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function assertDayKey(value) {
  const dayKey =
    clean(value);

  if (!DAY_KEY_RE.test(dayKey)) {
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
    ).replace(/^\uFEFF/u, "")
  );
}

function rowsFrom(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return [];
  }

  for (const key of [
    "fixtures",
    "matches",
    "rows",
    "items"
  ]) {
    if (
      Array.isArray(
        payload[key]
      )
    ) {
      return payload[key];
    }
  }

  return [];
}

function fixtureId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.fixtureId ||
    row?.id
  );
}

function jsonFilesInDirectory(
  directory
) {
  if (
    !fs.existsSync(directory)
  ) {
    return [];
  }

  return fs
    .readdirSync(
      directory,
      {
        withFileTypes: true
      }
    )
    .filter(
      entry =>
        entry.isFile() &&
        entry.name.endsWith(
          ".json"
        )
    )
    .map(
      entry =>
        entry.name
    )
    .sort();
}

export function readVerifiedFinalRowsForDay(
  dayKey
) {
  const exactDayKey =
    assertDayKey(dayKey);

  const directory =
    resolveDataPath(
      "final-results",
      exactDayKey
    );

  const files =
    jsonFilesInDirectory(
      directory
    );

  const rows = [];

  for (const name of files) {
    const payload =
      readJsonStrict(
        resolveDataPath(
          "final-results",
          exactDayKey,
          name
        )
      );

    const nested =
      rowsFrom(payload);

    if (nested.length) {
      rows.push(
        ...nested
      );
      continue;
    }

    if (
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload)
    ) {
      rows.push(payload);
    }
  }

  return {
    directoryExists:
      fs.existsSync(directory),

    fileCount:
      files.length,

    rows
  };
}

export function readPublicationObservationForDay(
  dayKey
) {
  const exactDayKey =
    assertDayKey(dayKey);

  const file =
    resolveDataPath(
      "deploy-snapshots",
      exactDayKey,
      "fixtures.json"
    );

  if (!fs.existsSync(file)) {
    return {
      observed: false,
      file,
      fixtureRows: 0,
      fixtureIds: []
    };
  }

  const payload =
    readJsonStrict(file);

  const rows =
    rowsFrom(payload);

  const fixtureIds =
    rows
      .map(fixtureId)
      .filter(Boolean);

  return {
    observed: true,
    file,
    fixtureRows:
      rows.length,
    fixtureIds
  };
}

export function readSystemHealthObservationForDay(
  dayKey
) {
  const exactDayKey =
    assertDayKey(dayKey);

  const file =
    resolveDataPath(
      "system-health",
      `${exactDayKey}.json`
    );

  if (!fs.existsSync(file)) {
    return {
      observed: false,
      file,
      payload: null
    };
  }

  return {
    observed: true,
    file,
    payload:
      readJsonStrict(file)
  };
}

export function readDayTruthLedgerInputs(
  dayKey,
  {
    includePublication = true,
    includeSystemHealth = true
  } = {}
) {
  const exactDayKey =
    assertDayKey(dayKey);

  /*
   * Do not interpret a missing canonical directory as
   * a legitimate empty football day.
   *
   * Absence of the authority source is a source failure,
   * not EMPTY truth.
   */
  const canonicalDirectory =
    resolveDataPath(
      "canonical-fixtures",
      exactDayKey
    );

  if (
    !fs.existsSync(
      canonicalDirectory
    )
  ) {
    throw new Error(
      `canonical_fixture_authority_missing:${exactDayKey}`
    );
  }

  /*
   * Membership is deliberately loaded through the
   * production day-fixture universe boundary, not by
   * independently reimplementing canonical membership.
   */
  const canonicalRows =
    canonicalFixturesForDay(
      exactDayKey
    );

  if (
    !Array.isArray(
      canonicalRows
    )
  ) {
    throw new Error(
      `canonical_fixture_authority_invalid:${exactDayKey}`
    );
  }

  const verifiedFinal =
    readVerifiedFinalRowsForDay(
      exactDayKey
    );

  const publication =
    includePublication
      ? readPublicationObservationForDay(
          exactDayKey
        )
      : {
          observed: false,
          file: null,
          fixtureRows: 0,
          fixtureIds: []
        };

  const systemHealth =
    includeSystemHealth
      ? readSystemHealthObservationForDay(
          exactDayKey
        )
      : {
          observed: false,
          file: null,
          payload: null
        };

  const downstream = {};

  if (publication.observed) {
    downstream.publication = {
      fixtureIds:
        publication.fixtureIds
    };
  }

  if (systemHealth.observed) {
    downstream.systemHealth =
      systemHealth.payload;
  }

  return {
    dayKey:
      exactDayKey,

    canonicalRows,

    verifiedFinalRows:
      verifiedFinal.rows,

    downstream,

    provenance: {
      canonical: {
        source:
          `data/canonical-fixtures/${exactDayKey}`,

        loader:
          "canonicalFixturesForDay",

        authorityBoundary:
          "day-fixture-universe"
      },

      verifiedFinal: {
        source:
          `data/final-results/${exactDayKey}`,

        fileCount:
          verifiedFinal.fileCount
      },

      downstream: {
        publication:
          publication.observed
            ? `data/deploy-snapshots/${exactDayKey}/fixtures.json`
            : null,

        systemHealth:
          systemHealth.observed
            ? `data/system-health/${exactDayKey}.json`
            : null
      }
    },

    sourceSummary: {
      canonicalAuthorityPresent:
        true,

      canonicalLoader:
        "canonicalFixturesForDay",

      canonicalRows:
        canonicalRows.length,

      verifiedFinalDirectoryExists:
        verifiedFinal
          .directoryExists,

      verifiedFinalFiles:
        verifiedFinal.fileCount,

      verifiedFinalRows:
        verifiedFinal.rows.length,

      publicationObserved:
        publication.observed,

      publicationFixtureRows:
        publication.fixtureRows,

      publicationUniqueFixtureIds:
        new Set(
          publication.fixtureIds
        ).size,

      systemHealthObserved:
        systemHealth.observed
    }
  };
}
