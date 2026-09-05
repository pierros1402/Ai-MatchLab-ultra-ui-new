/**
 * day-fixture-universe.js
 *
 * SINGLE SOURCE OF TRUTH for "which fixtures exist on a given day".
 *
 * Both the deploy-snapshot export (what gets published) and the details builder
 * (what gets a detail page) MUST resolve the day's fixtures through this module.
 * Previously each computed its own set — the export used the canonical UNION
 * while build-details-day picked runtime-XOR-canonical by row count — so a
 * canonical-only fixture (e.g. a Flashscore-only match) could be published
 * without ever reaching the details builder (audit 2026-07-06: Náutico v
 * Juventude, bra.2, had no detail). Keeping one function guarantees the two can
 * never diverge again.
 */

import fs from "fs";
import path from "path";
import { resolveDataPath } from "../storage/data-root.js";
import { dedupeLeagueDayFixtures } from "./fixture-dedup.js";
import { buildCanonicalId } from "./canonical-id.js";
import { isDisabledLeague } from "../source-discovery/disabled-leagues.js";
import { athensDayFromKickoff } from "./daykey.js";
import { canonicalTeamName } from "../storage/team-aliases-db.js";
import {
  getProductionIdentityResolver
} from "./production-identity-resolver-runtime.js";
import {
  MATCH_STATE_CLASS,
  classifyMatchState
} from "./non-played-state.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function normalizeMatchId(value) {
  return String(value ?? "").trim();
}

export function repositoryFixtureIdForRow(row) {
  return normalizeMatchId(
    row?.canonicalId ||
    row?.matchId
  );
}

function applyManagedIdentityOverlay(
  row,
  resolution
) {
  for (const [field, expected] of [
    [
      "homeGlobalClubId",
      resolution.homeGlobalClubId
    ],
    [
      "awayGlobalClubId",
      resolution.awayGlobalClubId
    ]
  ]) {
    const existing =
      normalizeMatchId(
        row?.[field]
      );

    if (
      existing &&
      existing !== expected
    ) {
      throw new Error(
        `production_identity_overlay_conflict:${field}:${repositoryFixtureIdForRow(row)}`
      );
    }
  }

  return {
    ...row,

    homeGlobalClubId:
      resolution.homeGlobalClubId,

    awayGlobalClubId:
      resolution.awayGlobalClubId
  };
}

export function applyProductionIdentityMembershipGate(
  rows,
  {
    resolver =
      getProductionIdentityResolver()
  } = {}
) {
  if (
    !resolver ||
    typeof resolver.resolveFixtureId !==
      "function"
  ) {
    throw new Error(
      "production_identity_resolver_required"
    );
  }

  const sourceRows =
    Array.isArray(rows)
      ? rows
      : [];

  const inspected =
    sourceRows.map(row => {
      const repositoryFixtureId =
        repositoryFixtureIdForRow(row);

      const resolution =
        repositoryFixtureId
          ? resolver.resolveFixtureId(
              repositoryFixtureId
            )
          : {
              ok: false,
              status:
                "UNKNOWN_FIXTURE_ID"
            };

      return {
        row,
        repositoryFixtureId,
        resolution
      };
    });

  const retainedTargetsPresent =
    new Set(
      inspected
        .filter(item =>
          item.resolution?.ok &&
          item.resolution?.sourceRole ===
            "retained"
        )
        .map(item =>
          item.resolution.resolvedFixtureId
        )
    );

  const outputRows = [];
  const diagnostics = {
    inputRows:
      sourceRows.length,

    outputRows: 0,

    unmanagedRows: 0,

    managedRetainedRows: 0,

    managedSuppressedRows: 0,

    suppressedWithRetainedTarget: 0,

    suppressedWithoutRetainedTarget: 0,

    identityOverlayRows: 0,

    suppressedFixtureIds: [],

    suppressedWithoutTargetFixtureIds: []
  };

  for (const item of inspected) {
    const resolution =
      item.resolution;

    if (!resolution?.ok) {
      if (
        resolution?.status !==
          "UNKNOWN_FIXTURE_ID"
      ) {
        throw new Error(
          `production_identity_resolution_failed:${item.repositoryFixtureId || "missing"}:${resolution?.status || "unknown"}`
        );
      }

      diagnostics.unmanagedRows += 1;
      outputRows.push(item.row);
      continue;
    }

    if (
      resolution.sourceRole ===
        "retained"
    ) {
      diagnostics
        .managedRetainedRows += 1;

      diagnostics
        .identityOverlayRows += 1;

      outputRows.push(
        applyManagedIdentityOverlay(
          item.row,
          resolution
        )
      );

      continue;
    }

    if (
      resolution.sourceRole ===
        "suppressed_lineage_alias"
    ) {
      diagnostics
        .managedSuppressedRows += 1;

      diagnostics
        .suppressedFixtureIds.push(
          item.repositoryFixtureId
        );

      if (
        retainedTargetsPresent.has(
          resolution.resolvedFixtureId
        )
      ) {
        diagnostics
          .suppressedWithRetainedTarget += 1;
      }
      else {
        diagnostics
          .suppressedWithoutRetainedTarget += 1;

        diagnostics
          .suppressedWithoutTargetFixtureIds
          .push(
            item.repositoryFixtureId
          );
      }

      continue;
    }

    throw new Error(
      `production_identity_source_role_invalid:${item.repositoryFixtureId}:${resolution.sourceRole}`
    );
  }

  diagnostics.outputRows =
    outputRows.length;

  diagnostics.suppressedFixtureIds.sort();
  diagnostics
    .suppressedWithoutTargetFixtureIds
    .sort();

  return {
    rows: outputRows,
    diagnostics
  };
}

// Collapse cross-source duplicates per league (same real match under two
// canonical IDs / matchIds from different providers) for a mixed-league row set.
function dedupeRowsPerLeague(rows) {
  const identityResolver =
    getProductionIdentityResolver();
  const byLeague = new Map();
  for (const row of rows) {
    const slug = String(row?.leagueSlug || "unknown");
    if (!byLeague.has(slug)) byLeague.set(slug, []);
    byLeague.get(slug).push(row);
  }

  const out = [];
  for (const [slug, leagueRows] of byLeague) {
    out.push(...dedupeLeagueDayFixtures(
      leagueRows,
      { slug, identityResolver }
    ).rows);
  }
  return out;
}

function isDisabledFixtureRow(row) {
  return isDisabledLeague(row?.leagueSlug);
}

function kickoffValue(row) {
  return (
    row?.kickoffUtc ||
    row?.kickoff ||
    row?.date ||
    row?.startTime ||
    null
  );
}

export function fixtureBelongsToAthensDay(
  row,
  dayKey
) {
  const target =
    String(dayKey || "").trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/u
      .test(target)
  ) {
    return false;
  }

  const kickoff =
    kickoffValue(row);

  if (!kickoff) {
    return false;
  }

  const parsed =
    new Date(kickoff);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return false;
  }

  try {
    return (
      athensDayFromKickoff(
        parsed.toISOString()
      ) === target
    );
  }
  catch {
    return false;
  }
}

export function canonicalizeFixtureDisplayNames(
  row
) {
  if (!row) {
    return row;
  }

  const leagueSlug =
    String(row?.leagueSlug || "")
      .trim();

  if (!leagueSlug) {
    return row;
  }

  const homeTeam =
    canonicalTeamName(
      leagueSlug,
      row?.homeTeam
    ) ||
    row?.homeTeam;

  const awayTeam =
    canonicalTeamName(
      leagueSlug,
      row?.awayTeam
    ) ||
    row?.awayTeam;

  if (
    homeTeam === row?.homeTeam &&
    awayTeam === row?.awayTeam
  ) {
    return row;
  }

  return {
    ...row,
    homeTeam,
    awayTeam
  };
}

function exactFixtureAliases(row) {
  const aliases =
    new Set();

  for (const key of [
    "canonicalId",
    "matchId",
    "sourceId",
    "sourceMatchId",
    "providerMatchId"
  ]) {
    const value =
      normalizeMatchId(
        row?.[key]
      );

    if (value) {
      aliases.add(value);
    }
  }

  return [
    ...aliases
  ];
}

function canonicalRowIdentity(row) {
  return normalizeMatchId(
    row?.canonicalId ||
    row?.matchId
  );
}

function buildUniqueCanonicalAliasIndex(
  rows
) {
  const byAlias =
    new Map();

  const ambiguousAliases =
    new Set();

  for (const row of rows) {
    for (
      const alias of
      exactFixtureAliases(row)
    ) {
      if (
        ambiguousAliases.has(alias)
      ) {
        continue;
      }

      const existing =
        byAlias.get(alias);

      if (!existing) {
        byAlias.set(
          alias,
          row
        );

        continue;
      }

      if (
        canonicalRowIdentity(existing) !==
        canonicalRowIdentity(row)
      ) {
        byAlias.delete(alias);
        ambiguousAliases.add(alias);
      }
    }
  }

  return {
    byAlias,
    ambiguousAliases
  };
}

function runtimeFreshness(row) {
  const numeric =
    Number(row?.updatedAt);

  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const parsed =
    Date.parse(
      String(
        row?.updatedAt ||
        row?.lastSeenAt ||
        ""
      )
    );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

const CANONICAL_RUNTIME_TRUTH_LOCKS = new Set([
  MATCH_STATE_CLASS.PRE_KICKOFF_NON_PLAYED,
  MATCH_STATE_CLASS.PLAY_INTERRUPTED,
  MATCH_STATE_CLASS.TEMPORARY_DELAY,
  MATCH_STATE_CLASS.RESULT_INVALIDATED,
  MATCH_STATE_CLASS.PLAYED_FINAL
]);

const CANONICAL_RUNTIME_TRUTH_FIELDS = Object.freeze([
  "status",
  "rawStatus",
  "statusType",
  "sourceStatus",
  "sourceStatusType",
  "providerStatus",
  "providerStatusType",
  "statusName",
  "operationalState",
  "scoreHome",
  "scoreAway",
  "homeScore",
  "awayScore",
  "minute",
  "penalties",
  "decidedBy"
]);

function applyCanonicalTruthFirewall(canonical, runtime) {
  const overlay = { ...(runtime || {}) };
  const canonicalState = classifyMatchState(canonical);

  if (!CANONICAL_RUNTIME_TRUTH_LOCKS.has(canonicalState)) {
    return overlay;
  }

  for (const field of CANONICAL_RUNTIME_TRUTH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(canonical || {}, field)) {
      overlay[field] = canonical[field];
    } else {
      delete overlay[field];
    }
  }

  if (canonicalState === MATCH_STATE_CLASS.PRE_KICKOFF_NON_PLAYED) {
    if (!Object.prototype.hasOwnProperty.call(canonical || {}, "finalized") && Number(overlay.finalized) === 1) {
      delete overlay.finalized;
    }

    if (!Object.prototype.hasOwnProperty.call(canonical || {}, "state") && String(overlay.state || "").trim().toUpperCase() === "FINAL") {
      delete overlay.state;
    }

    overlay.isDisplayLive = false;
    overlay.isDisplayPre = false;
    overlay.isDisplayFinal = false;
  }

  if (canonicalState === MATCH_STATE_CLASS.PLAYED_FINAL) {
    overlay.isDisplayLive = false;
    overlay.isDisplayPre = false;
    overlay.isDisplayFinal = true;
  }

  return overlay;
}

export function mergeCanonicalWithRuntimeOverlay(
  canonicalRows,
  runtimeRows,
  dayKey
) {
  const canonicalFixtures =
    dedupeRowsPerLeague(
      (
        Array.isArray(canonicalRows)
          ? canonicalRows
          : []
      )
        .filter(row =>
          fixtureBelongsToAthensDay(
            row,
            dayKey
          )
        )
        .map(row =>
          canonicalizeFixtureDisplayNames({
            ...row,
            dayKey
          })
        )
    );

  const canonicalIndex =
    buildUniqueCanonicalAliasIndex(
      canonicalFixtures
    );

  const overlayByCanonicalId =
    new Map();

  const runtimeOnlyRows = [];
  const ambiguousRuntimeRows = [];
  const outsideTargetDayRows = [];

  for (
    const rawRow of
    Array.isArray(runtimeRows)
      ? runtimeRows
      : []
  ) {
    if (
      !fixtureBelongsToAthensDay(
        rawRow,
        dayKey
      )
    ) {
      outsideTargetDayRows.push(
        rawRow
      );

      continue;
    }

    const matches =
      new Map();

    for (
      const alias of
      exactFixtureAliases(rawRow)
    ) {
      if (
        canonicalIndex
          .ambiguousAliases
          .has(alias)
      ) {
        continue;
      }

      const canonical =
        canonicalIndex
          .byAlias
          .get(alias);

      const identity =
        canonicalRowIdentity(
          canonical
        );

      if (
        canonical &&
        identity
      ) {
        matches.set(
          identity,
          canonical
        );
      }
    }

    if (matches.size === 0) {
      runtimeOnlyRows.push(rawRow);
      continue;
    }

    if (matches.size !== 1) {
      ambiguousRuntimeRows.push(rawRow);
      continue;
    }

    const [
      canonicalId,
      canonical
    ] =
      matches.entries().next().value;

    const candidate = {
      ...rawRow,
      canonicalId:
        canonical?.canonicalId ||
        canonicalId,

      dayKey
    };

    const previous =
      overlayByCanonicalId
        .get(canonicalId);

    if (
      !previous ||
      runtimeFreshness(candidate) >=
        runtimeFreshness(previous)
    ) {
      overlayByCanonicalId.set(
        canonicalId,
        candidate
      );
    }
  }

  let runtimeOverlayCount = 0;

  const fixtures =
    canonicalFixtures
      .map(canonical => {
        const identity =
          canonicalRowIdentity(
            canonical
          );

        const runtime =
          overlayByCanonicalId
            .get(identity);

        if (!runtime) {
          return canonical;
        }

        runtimeOverlayCount += 1;

        const runtimeOverlay =
          applyCanonicalTruthFirewall(
            canonical,
            runtime
          );

        return canonicalizeFixtureDisplayNames({
          ...canonical,
          ...runtimeOverlay,

          canonicalId:
            canonical?.canonicalId ||
            identity,

          matchId:
            canonical?.matchId ||
            runtime?.matchId ||
            identity,

          leagueSlug:
            canonical?.leagueSlug,

          leagueName:
            canonical?.leagueName ||
            runtime?.leagueName,

          dayKey,

          kickoffUtc:
            canonical?.kickoffUtc ||
            runtime?.kickoffUtc,

          homeTeam:
            canonical?.homeTeam,

          awayTeam:
            canonical?.awayTeam
        });
      })
      .sort((a, b) =>
        String(
          a?.kickoffUtc || ""
        ).localeCompare(
          String(
            b?.kickoffUtc || ""
          )
        )
      );

  return {
    fixtures,
    runtimeOverlayCount,

    runtimeOnlyExcludedCount:
      runtimeOnlyRows.length,

    runtimeOnlyExcludedIds:
      runtimeOnlyRows
        .map(row =>
          normalizeMatchId(
            row?.canonicalId ||
            row?.matchId
          )
        )
        .filter(Boolean)
        .sort(),

    outsideTargetDayRuntimeCount:
      outsideTargetDayRows.length,

    outsideTargetDayRuntimeIds:
      outsideTargetDayRows
        .map(row =>
          normalizeMatchId(
            row?.canonicalId ||
            row?.matchId
          )
        )
        .filter(Boolean)
        .sort(),

    ambiguousRuntimeCount:
      ambiguousRuntimeRows.length,

    ambiguousCanonicalAliasCount:
      canonicalIndex
        .ambiguousAliases
        .size
  };
}

function dayFixtures(
  fixturesPayload,
  dayKey
) {
  const fixtures =
    Array.isArray(
      fixturesPayload?.fixtures
    )
      ? fixturesPayload.fixtures
      : Array.isArray(
          fixturesPayload
        )
        ? fixturesPayload
        : [];

  const rows =
    fixtures
      .filter(row =>
        fixtureBelongsToAthensDay(
          row,
          dayKey
        )
      )
      .filter(row =>
        !isDisabledFixtureRow(row)
      )
      .map(
        canonicalizeFixtureDisplayNames
      );

  return dedupeRowsPerLeague(rows)
    .sort((a, b) =>
      String(
        a?.kickoffUtc || ""
      ).localeCompare(
        String(
          b?.kickoffUtc || ""
        )
      )
    );
}

export function backfillCanonicalFixtureIds(
  rows,
  dayKey
) {
  const canonicalOwners =
    new Map();

  return (
    Array.isArray(rows)
      ? rows
      : []
  ).map(row => {
    const existingCanonicalId =
      normalizeMatchId(
        row?.canonicalId
      );

    const matchId =
      normalizeMatchId(
        row?.matchId ||
        row?.sourceMatchId ||
        row?.sourceId ||
        row?.matchKey ||
        row?.id
      );

    const identityDay =
      String(
        dayKey ||
        row?.dayKey ||
        ""
      ).trim();

    const canonicalId =
      existingCanonicalId ||
      normalizeMatchId(
        buildCanonicalId(
          row?.leagueSlug,
          row?.homeTeam,
          row?.awayTeam,
          identityDay
        )
      );

    if (!canonicalId) {
      return row;
    }

    if (matchId) {
      const existingOwner =
        canonicalOwners.get(
          canonicalId
        );

      if (
        existingOwner &&
        existingOwner !== matchId
      ) {
        throw new Error(
          "canonical_fixture_identity_collision:" +
          identityDay + ":" +
          canonicalId + ":" +
          existingOwner + ":" +
          matchId
        );
      }

      canonicalOwners.set(
        canonicalId,
        matchId
      );
    }

    if (existingCanonicalId) {
      return row;
    }

    return {
      ...row,
      canonicalId
    };
  });
}

export function canonicalFixturesForDay(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  const rows = [];
  const seen = new Set();

  if (!fs.existsSync(dir)) {
    return rows;
  }

  const identityResolver =
    getProductionIdentityResolver();

  for (const file of fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort()) {
    const slug = path.basename(file, ".json");
    if (isDisabledLeague(slug)) {
      continue;
    }

    const payload = readJsonSafe(path.join(dir, file), null);
    const rawFixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];

    const identityGate =
      applyProductionIdentityMembershipGate(
        rawFixtures.map(row => ({
          ...row,

          leagueSlug:
            row?.leagueSlug ||
            slug
        })),
        {
          resolver:
            identityResolver
        }
      );

    // Defense-in-depth: resolve finalized retained/suppressed identities before
    // generic semantic dedup. Generic dedup remains unchanged and cannot become
    // an identity authority.
    const fixtures =
      dedupeLeagueDayFixtures(
        identityGate.rows,
        {
          slug,
          identityResolver
        }
      )
        .rows
        .filter(row =>
          !isDisabledFixtureRow(row)
        )
        .filter(row =>
          fixtureBelongsToAthensDay(
            row,
            dayKey
          )
        )
        .map(
          canonicalizeFixtureDisplayNames
        );


    for (
      const fixture of
      backfillCanonicalFixtureIds(
        fixtures,
        dayKey
      )
    ) {
      const matchId = normalizeMatchId(
        fixture?.matchId ||
        fixture?.sourceMatchId ||
        fixture?.sourceId ||
        fixture?.matchKey ||
        fixture?.id
      );

      if (!matchId || seen.has(matchId)) {
        continue;
      }

      seen.add(matchId);
      rows.push({
        ...fixture,
        matchId
      });
    }
  }

  return rows.sort((a, b) => {
    const ka = String(a?.kickoffUtc || a?.date || a?.startTime || "");
    const kb = String(b?.kickoffUtc || b?.date || b?.startTime || "");
    if (ka !== kb) return ka.localeCompare(kb);
    return String(a?.matchId || "").localeCompare(String(b?.matchId || ""));
  });
}

// Rows that only ESPN observed can reach the runtime fixtures DB without a
// canonicalId (numeric matchId). Details/value/UI all join on canonicalId, so
// backfill it from the canonical store (exact) or recompute it (same
// deterministic function acquisition used on the same provider names).
function backfillCanonicalIds(rows, canonicalRows, dayKey) {
  const cidBySourceId = new Map();
  for (const row of canonicalRows) {
    const cid = String(row?.canonicalId || "").trim();
    if (!cid) continue;
    for (const key of [row?.matchId, row?.sourceMatchId, row?.sourceId]) {
      const id = normalizeMatchId(key);
      if (id && !id.startsWith("cid_")) cidBySourceId.set(id, cid);
    }
  }

  return rows.map(row => {
    if (String(row?.canonicalId || "").trim()) return row;

    const matchId = normalizeMatchId(row?.matchId);
    if (matchId.startsWith("cid_")) {
      return { ...row, canonicalId: matchId };
    }

    const canonicalId =
      cidBySourceId.get(matchId) ||
      cidBySourceId.get(normalizeMatchId(row?.sourceMatchId)) ||
      buildCanonicalId(row?.leagueSlug, row?.homeTeam, row?.awayTeam, row?.dayKey || dayKey) ||
      null;

    return canonicalId ? { ...row, canonicalId } : row;
  });
}

/**
 * Authoritative published fixture universe.
 *
 * Membership is canonical-only. Runtime rows may update status/score only when
 * an exact canonical/provider identity resolves to one canonical fixture.
 * Runtime-only rows and archived snapshot rescue rows never create fixtures.
 */
export function fixturesForSnapshotDay(
  dayKey
) {
  const fixturesPayload =
    readJsonSafe(
      resolveDataPath(
        "fixtures.json"
      ),
      {
        fixtures: []
      }
    );

  const fixturesFromCanonical =
    canonicalFixturesForDay(
      dayKey
    );

  const fixturesFromMain =
    backfillCanonicalIds(
      dayFixtures(
        fixturesPayload,
        dayKey
      ),
      fixturesFromCanonical,
      dayKey
    );

  const merged =
    mergeCanonicalWithRuntimeOverlay(
      fixturesFromCanonical,
      fixturesFromMain,
      dayKey
    );

  return {
    source:
      "canonical_with_runtime_overlay",

    canonicalFixtureCount:
      fixturesFromCanonical.length,

    sourceFixtureJsonCount:
      fixturesFromMain.length,

    fixtureJsonCount:
      merged.fixtures.length,

    snapshotRescuedCount: 0,
    snapshotRescuedLeagues: [],

    runtimeOverlayCount:
      merged.runtimeOverlayCount,

    runtimeOnlyExcludedCount:
      merged.runtimeOnlyExcludedCount,

    runtimeOnlyExcludedIds:
      merged.runtimeOnlyExcludedIds,

    outsideTargetDayRuntimeCount:
      merged
        .outsideTargetDayRuntimeCount,

    outsideTargetDayRuntimeIds:
      merged
        .outsideTargetDayRuntimeIds,

    ambiguousRuntimeCount:
      merged.ambiguousRuntimeCount,

    ambiguousCanonicalAliasCount:
      merged
        .ambiguousCanonicalAliasCount,

    fixtures:
      merged.fixtures
  };
}

/**
 * Convenience: just the published fixture rows for a day. This is the set the
 * details builder must iterate so every publishable fixture gets a detail.
 */
export function resolveDayFixtureRows(dayKey) {
  return fixturesForSnapshotDay(dayKey).fixtures;
}
