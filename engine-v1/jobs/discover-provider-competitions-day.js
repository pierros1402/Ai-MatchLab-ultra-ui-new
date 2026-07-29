/**
 * Daily provider-wide competition discovery.
 *
 * Reads the complete Flashscore fixture window instead of iterating only known
 * canonical league seeds. Every unique provider competition is recorded.
 *
 * Resolved competitions may be used by downstream systems through their
 * canonical slug. Excluded and candidate competitions remain non-publishable.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  athensDayKey
} from "../core/daykey.js";

import {
  resolveDataPath
} from "../storage/data-root.js";

import {
  fetchFlashscoreFixtures
} from "../odds/flashscore-fixtures-source.js";

import {
  resolveFlashscoreCompetitionIdentity
} from "../core/flashscore-competition-identity.js";

export const DEFAULT_DISCOVERY_OFFSETS =
  Object.freeze([
    -1,
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14
  ]);

function clean(value) {
  return String(value || "").trim();
}

function validIso(value) {
  const text = clean(value);

  if (!text) return null;

  const ms = Date.parse(text);

  return Number.isFinite(ms)
    ? new Date(ms).toISOString()
    : null;
}

function providerCompetitionId(row) {
  return clean(
    row?.leagueId ||
    row?.tournamentId ||
    row?.competitionId
  ) || null;
}

function providerSourceId(row) {
  return clean(
    row?.matchId ||
    row?.sourceId ||
    row?.id
  ) || null;
}

function identityKey(row) {
  return [
    "flashscore",
    providerCompetitionId(row) || "",
    clean(row?.leaguePath).toLowerCase(),
    clean(row?.country).toLowerCase(),
    clean(row?.leagueName).toLowerCase()
  ].join("|");
}

function classificationFor(identity) {
  if (
    identity?.status === "resolved" &&
    identity?.canonicalSlug
  ) {
    return {
      classification: "known_active",
      reasonCode:
        identity.reasonCode ||
        "resolved_provider_identity",
      canonicalSlug:
        identity.canonicalSlug,
      publicationEligible: true,
      acquisitionEligible: true
    };
  }

  if (identity?.status === "excluded") {
    return {
      classification: "out_of_scope",
      reasonCode:
        identity.reasonCode ||
        "explicit_scope_exclusion",
      canonicalSlug: null,
      publicationEligible: false,
      acquisitionEligible: false
    };
  }

  return {
    classification: "candidate",
    reasonCode:
      identity?.reasonCode ||
      "unresolved_provider_identity",
    canonicalSlug: null,
    publicationEligible: false,
    acquisitionEligible: false
  };
}

function stableCompetitionRow(row) {
  return {
    provider:
      row.provider,

    providerCompetitionId:
      row.providerCompetitionId,

    providerPath:
      row.providerPath,

    providerCountry:
      row.providerCountry,

    providerName:
      row.providerName,

    classification:
      row.classification,

    reasonCode:
      row.reasonCode,

    canonicalSlug:
      row.canonicalSlug,

    publicationEligible:
      row.publicationEligible,

    acquisitionEligible:
      row.acquisitionEligible,

    fixtureCount:
      row.fixtureCount,

    firstKickoffUtc:
      row.firstKickoffUtc,

    lastKickoffUtc:
      row.lastKickoffUtc,

    sourceIds:
      row.sourceIds,

    sampleFixtures:
      row.sampleFixtures
  };
}

function contentHash(competitions) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        competitions.map(
          stableCompetitionRow
        )
      )
    )
    .digest("hex");
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(
        filePath,
        "utf8"
      )
    );
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(
    path.dirname(filePath),
    { recursive: true }
  );

  const temporary =
    filePath +
    `.tmp-${process.pid}-${Date.now()}`;

  fs.writeFileSync(
    temporary,
    JSON.stringify(
      value,
      null,
      2
    ),
    "utf8"
  );

  fs.renameSync(
    temporary,
    filePath
  );
}

export function buildProviderCompetitionDiscovery({
  dayKey,
  rows = [],
  previousRegistry = null,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const groups = new Map();

  for (const row of rows) {
    const key = identityKey(row);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
  }

  const competitions = [];

  for (const groupedRows of groups.values()) {
    const first = groupedRows[0] || {};

    const identity =
      resolveFlashscoreCompetitionIdentity({
        country:
          first?.country,
        leagueName:
          first?.leagueName,
        leaguePath:
          first?.leaguePath,
        providerCompetitionId:
          providerCompetitionId(first)
      });

    const classification =
      classificationFor(identity);

    const kickoffs =
      groupedRows
        .map(row =>
          validIso(row?.kickoffUtc)
        )
        .filter(Boolean)
        .sort();

    const sourceIds = [
      ...new Set(
        groupedRows
          .map(providerSourceId)
          .filter(Boolean)
      )
    ].sort();

    const sampleFixtures =
      groupedRows
        .slice()
        .sort((a, b) =>
          String(a?.kickoffUtc || "")
            .localeCompare(
              String(b?.kickoffUtc || "")
            )
        )
        .slice(0, 5)
        .map(row => ({
          sourceId:
            providerSourceId(row),
          home:
            clean(row?.home) || null,
          away:
            clean(row?.away) || null,
          kickoffUtc:
            validIso(row?.kickoffUtc)
        }));

    competitions.push({
      provider: "flashscore",

      providerCompetitionId:
        providerCompetitionId(first),

      providerPath:
        clean(first?.leaguePath) ||
        null,

      providerCountry:
        clean(first?.country) ||
        null,

      providerName:
        clean(first?.leagueName) ||
        null,

      classification:
        classification.classification,

      reasonCode:
        classification.reasonCode,

      canonicalSlug:
        classification.canonicalSlug,

      publicationEligible:
        classification.publicationEligible,

      acquisitionEligible:
        classification.acquisitionEligible,

      fixtureCount:
        groupedRows.length,

      firstKickoffUtc:
        kickoffs[0] || null,

      lastKickoffUtc:
        kickoffs.at(-1) || null,

      sourceIds,

      sampleFixtures
    });
  }

  competitions.sort((a, b) =>
    [
      a.providerCountry,
      a.providerName,
      a.providerPath,
      a.providerCompetitionId
    ]
      .map(value =>
        String(value || "")
      )
      .join("|")
      .localeCompare(
        [
          b.providerCountry,
          b.providerName,
          b.providerPath,
          b.providerCompetitionId
        ]
          .map(value =>
            String(value || "")
          )
          .join("|")
      )
  );

  const registryByKey =
    new Map();

  for (
    const row of
    Array.isArray(
      previousRegistry?.competitions
    )
      ? previousRegistry.competitions
      : []
  ) {
    const key = [
      row?.provider || "",
      row?.providerCompetitionId || "",
      row?.providerPath || "",
      row?.providerCountry || "",
      row?.providerName || ""
    ]
      .map(value =>
        String(value).toLowerCase()
      )
      .join("|");

    registryByKey.set(
      key,
      { ...row }
    );
  }

  for (const row of competitions) {
    const key = [
      row.provider,
      row.providerCompetitionId || "",
      row.providerPath || "",
      row.providerCountry || "",
      row.providerName || ""
    ]
      .map(value =>
        String(value).toLowerCase()
      )
      .join("|");

    const previous =
      registryByKey.get(key);

    registryByKey.set(key, {
      ...row,

      firstObservedDay:
        previous?.firstObservedDay ||
        dayKey,

      lastObservedDay:
        dayKey,

      observationDays:
        Number(
          previous?.observationDays ||
          0
        ) + 1,

      totalObservedFixtures:
        Number(
          previous?.totalObservedFixtures ||
          0
        ) +
        Number(
          row.fixtureCount ||
          0
        )
    });
  }

  const registryCompetitions =
    [...registryByKey.values()]
      .sort((a, b) =>
        [
          a.providerCountry,
          a.providerName,
          a.providerPath,
          a.providerCompetitionId
        ]
          .map(value =>
            String(value || "")
          )
          .join("|")
          .localeCompare(
            [
              b.providerCountry,
              b.providerName,
              b.providerPath,
              b.providerCompetitionId
            ]
              .map(value =>
                String(value || "")
              )
              .join("|")
          )
      );

  const summary = {
    fixtureRowCount:
      rows.length,

    competitionCount:
      competitions.length,

    resolvedCompetitionCount:
      competitions.filter(row =>
        row.classification ===
        "known_active"
      ).length,

    excludedCompetitionCount:
      competitions.filter(row =>
        row.classification ===
        "out_of_scope"
      ).length,

    candidateCompetitionCount:
      competitions.filter(row =>
        row.classification ===
        "candidate"
      ).length,

    publishableCompetitionCount:
      competitions.filter(row =>
        row.publicationEligible
      ).length
  };

  const artifact = {
    schema:
      "ai-matchlab.provider-competition-discovery.v1",

    ok: true,
    dayKey,
    generatedAt,
    provider: "flashscore",
    summary,
    hash:
      contentHash(competitions),
    competitions
  };

  const registry = {
    schema:
      "ai-matchlab.provider-competition-registry.v1",

    ok: true,
    provider: "flashscore",
    updatedAt:
      generatedAt,

    competitionCount:
      registryCompetitions.length,

    competitions:
      registryCompetitions
  };

  return {
    artifact,
    registry
  };
}

export async function discoverProviderCompetitionsDay(
  dayKey = athensDayKey(),
  options = {}
) {
  const {
    offsets =
      DEFAULT_DISCOVERY_OFFSETS,

    fetchFixtures =
      fetchFlashscoreFixtures,

    write = true,

    generatedAt =
      new Date().toISOString(),

    discoveryFile =
      resolveDataPath(
        "competition-discovery",
        `${dayKey}.json`
      ),

    registryFile =
      resolveDataPath(
        "provider-competition-registry",
        "flashscore.json"
      )
  } = options;

  const feed =
    await fetchFixtures({
      offsets: [...offsets]
    });

  const rows =
    Array.isArray(feed?.rows)
      ? feed.rows
      : [];

  const previousRegistry =
    readJson(
      registryFile,
      {
        schema:
          "ai-matchlab.provider-competition-registry.v1",
        ok: true,
        provider: "flashscore",
        competitions: []
      }
    );

  const {
    artifact,
    registry
  } =
    buildProviderCompetitionDiscovery({
      dayKey,
      rows,
      previousRegistry,
      generatedAt
    });

  if (write) {
    writeJsonAtomic(
      discoveryFile,
      artifact
    );

    writeJsonAtomic(
      registryFile,
      registry
    );
  }

  return {
    ok: true,
    dayKey,
    offsets: [...offsets],
    discoveryFile:
      write
        ? discoveryFile
        : null,
    registryFile:
      write
        ? registryFile
        : null,
    summary:
      artifact.summary,
    artifact,
    registry
  };
}
