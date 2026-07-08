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

// Collapse cross-source duplicates per league (same real match under two
// canonical IDs / matchIds from different providers) for a mixed-league row set.
function dedupeRowsPerLeague(rows) {
  const byLeague = new Map();
  for (const row of rows) {
    const slug = String(row?.leagueSlug || "unknown");
    if (!byLeague.has(slug)) byLeague.set(slug, []);
    byLeague.get(slug).push(row);
  }

  const out = [];
  for (const [slug, leagueRows] of byLeague) {
    out.push(...dedupeLeagueDayFixtures(leagueRows, { slug }).rows);
  }
  return out;
}

function isDisabledFixtureRow(row) {
  return isDisabledLeague(row?.leagueSlug);
}

function dayFixtures(fixturesPayload, dayKey) {
  const fixtures = Array.isArray(fixturesPayload?.fixtures)
    ? fixturesPayload.fixtures
    : Array.isArray(fixturesPayload)
      ? fixturesPayload
      : [];

  const rows = fixtures
    .filter(row => String(row?.dayKey || "") === String(dayKey))
    .filter(row => !isDisabledFixtureRow(row));

  return dedupeRowsPerLeague(rows)
    .sort((a, b) => String(a?.kickoffUtc || "").localeCompare(String(b?.kickoffUtc || "")));
}

function canonicalFixturesForDay(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  const rows = [];
  const seen = new Set();

  if (!fs.existsSync(dir)) {
    return rows;
  }

  for (const file of fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort()) {
    const slug = path.basename(file, ".json");
    if (isDisabledLeague(slug)) {
      continue;
    }

    const payload = readJsonSafe(path.join(dir, file), null);
    const rawFixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];

    // Defense-in-depth: collapse cross-source duplicates even if a stale store
    // file predates write-time dedup (same match under two canonical IDs).
    const fixtures = dedupeLeagueDayFixtures(rawFixtures, {
      slug
    }).rows.filter(row => !isDisabledFixtureRow({ ...row, leagueSlug: row?.leagueSlug || slug }));

    for (const fixture of fixtures) {
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
 * The authoritative published fixture universe for a day: canonical ∪ runtime,
 * deduped per league, plus a shrink guard that rescues whole leagues absent
 * from a fresh (possibly source-degraded) universe. Returns metadata alongside
 * the rows so the export manifest can report counts.
 */
export function fixturesForSnapshotDay(dayKey) {
  const fixturesPayload = readJsonSafe(resolveDataPath("fixtures.json"), { fixtures: [] });
  const fixturesFromCanonical = canonicalFixturesForDay(dayKey);
  const fixturesFromMain = backfillCanonicalIds(
    dayFixtures(fixturesPayload, dayKey),
    fixturesFromCanonical,
    dayKey
  );
  const canonicalFixtureCount = fixturesFromCanonical.length;
  const fixtureJsonCount = fixturesFromMain.length;

  // UNION of runtime + canonical (dedup collapses same-match rows; runtime
  // first so its fresher status/score wins ties). Picking one source XOR the
  // other dropped rows the winner lacked — e.g. canonical-only FT rows next
  // to runtime-only Flashscore-league rows on the same day.
  const union = dedupeRowsPerLeague([...fixturesFromMain, ...fixturesFromCanonical]);

  // Day-universe shrink guard. A transient source failure on one runner must
  // never shrink the published day: on 2026-07-05 an intraday refresh whose
  // Flashscore harvest failed exported a 79-row universe over a 94-row
  // snapshot and deleted 19 mar.1/mar.2/eth.1/tan.1 details as "orphans".
  // Rescue is per-LEAGUE (league entirely missing from the fresh universe),
  // so intentionally pruning a single phantom row keeps working.
  const existingSnapshot = readJsonSafe(
    path.join(resolveDataPath("deploy-snapshots", dayKey), "fixtures.json"),
    null
  );
  const snapshotRows = (Array.isArray(existingSnapshot?.fixtures) ? existingSnapshot.fixtures : [])
    .filter(row => String(row?.dayKey || existingSnapshot?.date || "") === String(dayKey))
    .filter(row => !isDisabledFixtureRow(row));

  const freshLeagues = new Set(union.map(row => String(row?.leagueSlug || "")));
  const rescuedRows = snapshotRows.filter(
    row => !freshLeagues.has(String(row?.leagueSlug || ""))
  );
  const rescuedLeagues = [...new Set(rescuedRows.map(row => String(row?.leagueSlug || "")))];

  if (rescuedRows.length) {
    console.warn("[day-fixture-universe] day-universe shrink guard: rescuing leagues absent from fresh universe", {
      dayKey,
      rescuedLeagues,
      rescuedCount: rescuedRows.length
    });
  }

  const fixtures = dedupeRowsPerLeague([...union, ...rescuedRows])
    .sort((a, b) => String(a?.kickoffUtc || "").localeCompare(String(b?.kickoffUtc || "")));

  return {
    source: "union",
    canonicalFixtureCount,
    fixtureJsonCount,
    snapshotRescuedCount: rescuedRows.length,
    snapshotRescuedLeagues: rescuedLeagues,
    fixtures
  };
}

/**
 * Convenience: just the published fixture rows for a day. This is the set the
 * details builder must iterate so every publishable fixture gets a detail.
 */
export function resolveDayFixtureRows(dayKey) {
  return fixturesForSnapshotDay(dayKey).fixtures;
}
