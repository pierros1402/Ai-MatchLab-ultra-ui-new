import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { ESPN_BASE, leagueName } from "../config.js";
import { normalizeFixture } from "../core/normalize.js";
import { dedupeLeagueDayFixtures } from "../core/fixture-dedup.js";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function isValidDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value));
}

function espnDateFromDayKey(dayKey) {
  return String(dayKey || "").replace(/-/g, "");
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, payload) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function canonicalDir(dayKey) {
  return resolveDataPath("canonical-fixtures", dayKey);
}

function canonicalLeagueFile(dayKey, slug) {
  return resolveDataPath("canonical-fixtures", dayKey, String(slug) + ".json");
}

function readCanonicalLeague(dayKey, slug) {
  const file = canonicalLeagueFile(dayKey, slug);
  const payload = readJson(file, null);

  if (!payload || !Array.isArray(payload.fixtures)) {
    return {
      dayKey,
      leagueSlug: slug,
      leagueName: leagueName(slug),
      updatedAt: null,
      count: 0,
      sourceMeta: {},
      fixtures: []
    };
  }

  return payload;
}

function writeCanonicalLeague(dayKey, slug, fixtures, sourceMeta = {}) {
  const cleanFixtures = fixtures
    .filter(Boolean)
    .sort((a, b) => String(a?.kickoffUtc || "").localeCompare(String(b?.kickoffUtc || "")) ||
      String(a?.matchId || "").localeCompare(String(b?.matchId || "")));

  const payload = {
    dayKey,
    leagueSlug: slug,
    leagueName: leagueName(slug),
    updatedAt: new Date().toISOString(),
    count: cleanFixtures.length,
    sourceMeta,
    fixtures: cleanFixtures
  };

  writeJson(canonicalLeagueFile(dayKey, slug), payload);
  return payload;
}

function meaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function stableFixtureId(row) {
  return normalizeText(row?.matchId || row?.sourceMatchId || row?.sourceId || row?.id);
}

function statusBucket(row) {
  return [
    row?.status,
    row?.statusType,
    row?.rawStatus,
    row?.sourceStatus,
    row?.sourceStatusType
  ].map(normalizeText).filter(Boolean).join(" ").toUpperCase();
}

function isFinalLike(row) {
  return /\b(FT|FULL_TIME|STATUS_FULL_TIME|FINAL|STATUS_FINAL|STATUS_FINAL_AET|AET|POST)\b/i.test(statusBucket(row));
}

function isRefreshCandidate(row, now = new Date(), options = {}) {
  if (!row || isFinalLike(row)) return false;

  const bucket = statusBucket(row);
  const staleOrLive = /\b(STALE|LIVE|FIRST_HALF|SECOND_HALF|HALF_TIME|IN_PROGRESS|STATUS_IN_PROGRESS|UNKNOWN)\b/i.test(bucket);
  const preLike = /\b(PRE|SCHEDULED|STATUS_SCHEDULED|UNKNOWN)\b/i.test(bucket);

  if (staleOrLive) return true;

  if (options.includeAllOpenStates && preLike) {
    return true;
  }

  const kickoff = row?.kickoffUtc ? new Date(row.kickoffUtc) : null;
  if (!kickoff || Number.isNaN(kickoff.getTime())) {
    return preLike;
  }

  const hoursFromKickoff = (kickoff.getTime() - now.getTime()) / 3600000;

  // Elapsed time only controls whether the trusted provider is re-checked.
  // It must never promote a fixture to FT. Keep every past open fixture
  // eligible until an authoritative provider supplies a terminal state.
  return preLike && hoursFromKickoff <= 3;
}

function collectTargetLeagues(dayKey, options = {}) {
  const dir = canonicalDir(dayKey);
  const now = options.now instanceof Date ? options.now : new Date();
  const out = new Map();

  if (!fs.existsSync(dir)) return [];

  for (const name of fs.readdirSync(dir).filter(x => x.endsWith(".json")).sort()) {
    const slug = name.replace(/\.json$/i, "");
    const payload = readCanonicalLeague(dayKey, slug);
    const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];
    const candidates = fixtures.filter(row => isRefreshCandidate(row, now, options));

    if (candidates.length > 0) {
      out.set(slug, {
        slug,
        candidateCount: candidates.length,
        fixtureCount: fixtures.length
      });
    }
  }

  return [...out.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function collectFlashscoreTargetLeagues(dayKey) {
  const dir = canonicalDir(dayKey);
  const out = [];

  if (!fs.existsSync(dir)) {
    return out;
  }

  for (
    const name of fs
      .readdirSync(dir)
      .filter(value => value.endsWith(".json"))
      .sort()
  ) {
    const slug = name.replace(/\.json$/i, "");
    const payload = readCanonicalLeague(dayKey, slug);

    const fixtures = Array.isArray(payload?.fixtures)
      ? payload.fixtures
      : [];

    const candidates = fixtures.filter(row => {
      const source = normalizeText(row?.source).toLowerCase();

      const providerMatchId = normalizeText(
        row?.sourceId ||
        row?.sourceMatchId
      );

      return (
        source === "flashscore" &&
        Boolean(providerMatchId) &&
        !isFinalLike(row)
      );
    });

    if (candidates.length === 0) {
      continue;
    }

    out.push({
      slug,
      candidateCount: candidates.length,
      fixtureCount: fixtures.length
    });
  }

  return out.sort((a, b) =>
    a.slug.localeCompare(b.slug)
  );
}

async function fetchJson(url, label) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 Ai-MatchLab live status refresh",
      "accept": "application/json,text/plain,*/*"
    }
  });

  if (!res.ok) {
    await res.body?.cancel?.();
    throw new Error(String(label || "fetch") + " http_" + res.status);
  }

  return res.json();
}

function normalizeSourceRows(events, slug, dayKey) {
  const byId = new Map();

  for (const event of Array.isArray(events) ? events : []) {
    const normalized = normalizeFixture(event, slug);
    if (!normalized) continue;

    const fixtureDay = normalizeText(normalized.dayKey);
    if (fixtureDay !== dayKey) continue;

    const id = stableFixtureId(normalized);
    if (!id) continue;

    byId.set(id, {
      matchId: normalized.matchId,
      matchKey: normalized.matchKey,
      canonicalId: normalized.canonicalId || null,
      source: normalized.source || "espn_direct_league_status",
      sourceId: normalized.sourceId || normalized.sourceMatchId || normalized.matchId,
      sourceMatchId: normalized.sourceMatchId || normalized.sourceId || normalized.matchId,
      leagueSlug: normalized.leagueSlug || slug,
      leagueName: normalized.leagueName || leagueName(slug),
      dayKey: normalized.dayKey,
      fetchedDayKey: dayKey,
      kickoffUtc: normalized.kickoffUtc,
      homeTeam: normalized.homeTeam,
      awayTeam: normalized.awayTeam,
      scoreHome: normalized.scoreHome,
      scoreAway: normalized.scoreAway,
      status: normalized.status,
      statusType: normalized.statusType,
      rawStatus: normalized.rawStatus,
      minute: normalized.minute,
      venue: normalized.venue,
      lastSeenAt: new Date().toISOString()
    });
  }

  return byId;
}

function mergeStatusRow(previous, incoming) {
  const merged = { ...previous };

  for (const key of [
    "matchId",
    "matchKey",
    "source",
    "sourceId",
    "sourceMatchId",
    "leagueSlug",
    "leagueName",
    "dayKey",
    "fetchedDayKey",
    "kickoffUtc",
    "homeTeam",
    "awayTeam",
    "scoreHome",
    "scoreAway",
    "status",
    "statusType",
    "rawStatus",
    "minute",
    "venue",
    "lastSeenAt"
  ]) {
    if (meaningful(incoming?.[key])) {
      merged[key] = incoming[key];
    }
  }

  return merged;
}

function rowStatusSignature(row) {
  return JSON.stringify({
    status: row?.status ?? null,
    statusType: row?.statusType ?? null,
    rawStatus: row?.rawStatus ?? null,
    minute: row?.minute ?? null,
    scoreHome: row?.scoreHome ?? null,
    scoreAway: row?.scoreAway ?? null
  });
}


function athensDayFromUtc(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-CA", {
    timeZone: "Europe/Athens"
  });
}

function isExactFlashscoreFinalRow(row, dayKey) {
  if (row?.finished !== true) return false;
  if (normalizeText(row?.statusCode) !== "3") return false;

  const scoreHome = Number(row?.scoreHome);
  const scoreAway = Number(row?.scoreAway);

  if (!Number.isFinite(scoreHome) || !Number.isFinite(scoreAway)) {
    return false;
  }

  const sourceDay = athensDayFromUtc(row?.kickoffUtc);

  return !sourceDay || sourceDay === dayKey;
}

function buildFlashscoreFinalIncoming(previous, sourceRow) {
  const providerMatchId = normalizeText(sourceRow?.matchId);

  return {
    source: "flashscore",
    sourceId: providerMatchId,
    sourceMatchId: providerMatchId,

    leagueSlug: previous?.leagueSlug || null,
    leagueName:
      previous?.leagueName ||
      sourceRow?.leagueName ||
      null,

    dayKey: previous?.dayKey || null,
    fetchedDayKey:
      previous?.fetchedDayKey ||
      previous?.dayKey ||
      null,

    kickoffUtc:
      previous?.kickoffUtc ||
      sourceRow?.kickoffUtc ||
      null,

    homeTeam:
      previous?.homeTeam ||
      sourceRow?.home ||
      null,

    awayTeam:
      previous?.awayTeam ||
      sourceRow?.away ||
      null,

    scoreHome: Number(sourceRow.scoreHome),
    scoreAway: Number(sourceRow.scoreAway),

    status: "FT",
    statusType: "STATUS_FINAL",
    rawStatus: "STATUS_FINAL",
    minute: "FT",

    lastSeenAt: new Date().toISOString()
  };
}

export async function runLiveStatusRefreshDay(dayKey, options = {}) {
  const safeDayKey = normalizeText(dayKey);

  if (!isValidDayKey(safeDayKey)) {
    throw new Error("invalid dayKey: " + dayKey);
  }

  const startedAt = new Date().toISOString();
  const targetLeagues = collectTargetLeagues(safeDayKey, options);
  const flashscoreTargetLeagues =
    collectFlashscoreTargetLeagues(safeDayKey);

  const stats = {
    ok: true,
    dayKey: safeDayKey,
    startedAt,
    finishedAt: null,
    targetLeagueCount: targetLeagues.length,
    targetLeagues,
    fetchedLeagueCount: 0,
    failedLeagueCount: 0,
    sourceEventCount: 0,
    sourceRows: 0,
    matchedRows: 0,
    changedRows: 0,
    appendedRows: 0,
    writtenLeagueCount: 0,
    byLeague: [],
    errors: [],
    // Fixtures whose status changed this run — used by intraday to patch details.basic
    changedFixtures: []
  };


  stats.flashscoreFinalRefresh = {
    attempted: false,
    ok: false,
    offsets: [0],
    targetLeagueCount: flashscoreTargetLeagues.length,
    targetLeagues: flashscoreTargetLeagues,
    sourceRows: 0,
    finishedRows: 0,
    exactIdCandidates: 0,
    exactIdMatches: 0,
    changedRows: 0,
    writtenLeagueCount: 0,
    attempts: [],
    missingFromFeedSourceIds: [],
    notFinishedSourceIds: [],
    error: null
  };

  for (const target of targetLeagues) {
    const slug = target.slug;
    const url = ESPN_BASE + "/" + slug + "/scoreboard?dates=" + espnDateFromDayKey(safeDayKey);

    const leagueStats = {
      slug,
      leagueName: leagueName(slug),
      candidateCount: target.candidateCount,
      fixtureCount: target.fixtureCount,
      ok: false,
      sourceEvents: 0,
      sourceRows: 0,
      matchedRows: 0,
      changedRows: 0,
      appendedRows: 0,
      exactIdFallbackCandidates: 0,
      exactIdFallbackMatches: 0,
      adjacentFetches: [],
      written: false,
      error: null
    };

    try {
      const source = await fetchJson(url, "espn_direct_league_status_" + slug);
      const events = Array.isArray(source?.events) ? source.events : [];
      const sourceById = normalizeSourceRows(events, slug, safeDayKey);

      leagueStats.ok = true;
      leagueStats.sourceEvents = events.length;
      leagueStats.sourceRows = sourceById.size;

      stats.fetchedLeagueCount++;
      stats.sourceEventCount += events.length;
      stats.sourceRows += sourceById.size;

      const current = readCanonicalLeague(safeDayKey, slug);

      // ESPN may file a UTC-midnight fixture under the neighbouring
      // scoreboard date. Only exact canonical ESPN source IDs are recovered.
      // normalizeSourceRows() still enforces the requested Athens day.
      const missingExactIds = new Set(
        (
          Array.isArray(current?.fixtures)
            ? current.fixtures
            : []
        )
          .filter(row => {
            const source = normalizeText(
              row?.source
            ).toLowerCase();

            const id = stableFixtureId(row);

            return (
              source === "espn" &&
              !isFinalLike(row) &&
              Boolean(id) &&
              !sourceById.has(id)
            );
          })
          .map(row => stableFixtureId(row))
          .filter(Boolean)
      );

      leagueStats.exactIdFallbackCandidates =
        missingExactIds.size;

      if (missingExactIds.size > 0) {
        const adjacentDayKeys = [-1, 1].map(offset => {
          const date = new Date(
            `${safeDayKey}T12:00:00.000Z`
          );

          date.setUTCDate(
            date.getUTCDate() + offset
          );

          return date
            .toISOString()
            .slice(0, 10);
        });

        for (
          const sourceDayKey of adjacentDayKeys
        ) {
          const adjacentUrl =
            ESPN_BASE +
            "/" +
            slug +
            "/scoreboard?dates=" +
            espnDateFromDayKey(sourceDayKey);

          try {
            const adjacentSource =
              await fetchJson(
                adjacentUrl,
                "espn_exact_id_adjacent_" +
                  slug +
                  "_" +
                  sourceDayKey
              );

            const adjacentEvents =
              Array.isArray(
                adjacentSource?.events
              )
                ? adjacentSource.events
                : [];

            const adjacentById =
              normalizeSourceRows(
                adjacentEvents,
                slug,
                safeDayKey
              );

            let matched = 0;

            for (
              const id of [
                ...missingExactIds
              ]
            ) {
              const incoming =
                adjacentById.get(id);

              if (!incoming) {
                continue;
              }

              sourceById.set(
                id,
                incoming
              );

              missingExactIds.delete(id);
              matched++;

              leagueStats
                .exactIdFallbackMatches++;
            }

            leagueStats.sourceEvents +=
              adjacentEvents.length;

            leagueStats.sourceRows +=
              matched;

            stats.sourceEventCount +=
              adjacentEvents.length;

            stats.sourceRows +=
              matched;

            leagueStats.adjacentFetches.push({
              dayKey: sourceDayKey,
              ok: true,
              events:
                adjacentEvents.length,
              matched
            });
          }
          catch (err) {
            leagueStats.adjacentFetches.push({
              dayKey: sourceDayKey,
              ok: false,
              events: 0,
              matched: 0,
              error:
                err?.message ||
                String(err)
            });
          }

          if (
            missingExactIds.size === 0
          ) {
            break;
          }
        }
      }

      let changed = false;
      const matchedIds = new Set();

      let nextFixtures = (Array.isArray(current.fixtures) ? current.fixtures : []).map(row => {
        const id = stableFixtureId(row);
        const incoming = id ? sourceById.get(id) : null;
        if (!incoming) return row;

        matchedIds.add(id);
        leagueStats.matchedRows++;
        stats.matchedRows++;

        const before = rowStatusSignature(row);
        const merged = mergeStatusRow(row, incoming);
        const after = rowStatusSignature(merged);

        if (before !== after) {
          changed = true;
          leagueStats.changedRows++;
          stats.changedRows++;
          // Record the full updated row so intraday can patch details.basic
          stats.changedFixtures.push(merged);
        }

        return merged;
      });

      // Targeted late-fixture acquisition (intraday): the scoreboard was
      // already fetched for the status refresh — rows it lists for THIS day
      // that canonical lacks are late-added fixtures the status-only intraday
      // used to miss until the nightly full pass. Zero extra fetches; the
      // dedupe below collapses cross-source name variants so an ESPN row
      // never duplicates an existing Flashscore row of the same match.
      if (options.appendNewFixtures) {
        for (const [id, row] of sourceById) {
          if (matchedIds.has(id)) continue;
          nextFixtures.push({ ...row, firstSeenAt: row.lastSeenAt });
          leagueStats.appendedRows++;
          stats.appendedRows++;
          changed = true;
        }
      }

      if (changed) {
        const deduped = dedupeLeagueDayFixtures(nextFixtures, { slug });
        nextFixtures = deduped.rows;

        writeCanonicalLeague(safeDayKey, slug, nextFixtures, {
          acquisitionProvider: "espn_direct_league_status",
          requestedLeagueSlug: slug,
          requestedDayKey: safeDayKey,

          exactIdAdjacentDateFallback: {
            candidates:
              leagueStats.exactIdFallbackCandidates,
            matches:
              leagueStats.exactIdFallbackMatches,
            fetches:
              leagueStats.adjacentFetches
          },

          mergedAt: new Date().toISOString(),
          mode: "targeted_live_status_refresh"
        });

        leagueStats.written = true;
        stats.writtenLeagueCount++;
      }
    } catch (err) {
      leagueStats.error = String(err?.message || err);
      stats.failedLeagueCount++;
      stats.errors.push({ slug, error: leagueStats.error });
    }

    stats.byLeague.push(leagueStats);
  }


  const flashscoreStats = stats.flashscoreFinalRefresh;

  if (flashscoreTargetLeagues.length > 0) {
    flashscoreStats.attempted = true;

    try {
      const feed = await fetchFlashscoreFixtures({
        offsets: [0]
      });

      const sourceRows = Array.isArray(feed?.rows)
        ? feed.rows
        : [];

      const finishedRows = sourceRows.filter(row =>
        isExactFlashscoreFinalRow(row, safeDayKey)
      );

      flashscoreStats.ok = Boolean(feed?.ok);
      flashscoreStats.sourceRows = sourceRows.length;
      flashscoreStats.finishedRows = finishedRows.length;
      flashscoreStats.attempts = Array.isArray(feed?.attempts)
        ? feed.attempts
        : [];

      const sourceByProviderId = new Map();

      for (const row of sourceRows) {
        const providerMatchId = normalizeText(row?.matchId);
        if (!providerMatchId) continue;

        sourceByProviderId.set(providerMatchId, row);
      }

      const finalByProviderId = new Map();

      for (const row of finishedRows) {
        const providerMatchId = normalizeText(row?.matchId);
        if (!providerMatchId) continue;

        finalByProviderId.set(providerMatchId, row);
      }

      const missingFromFeedSourceIds = new Set();
      const notFinishedSourceIds = new Set();

      const writtenLeagueSlugs = new Set(
        stats.byLeague
          .filter(row => row?.written)
          .map(row => normalizeText(row?.slug))
          .filter(Boolean)
      );

      for (const target of flashscoreTargetLeagues) {
        const slug = target.slug;
        const current = readCanonicalLeague(safeDayKey, slug);

        const currentFixtures = Array.isArray(current?.fixtures)
          ? current.fixtures
          : [];

        let leagueChanged = false;
        let leagueChangedRows = 0;

        const nextFixtures = currentFixtures.map(row => {
          const canonicalSource = normalizeText(row?.source)
            .toLowerCase();

          if (
            canonicalSource !== "flashscore" ||
            isFinalLike(row)
          ) {
            return row;
          }

          const providerMatchId = normalizeText(
            row?.sourceId ||
            row?.sourceMatchId
          );

          if (!providerMatchId) {
            return row;
          }

          flashscoreStats.exactIdCandidates++;

          const observedRow =
            sourceByProviderId.get(providerMatchId);

          if (!observedRow) {
            missingFromFeedSourceIds.add(providerMatchId);
            return row;
          }

          const sourceRow =
            finalByProviderId.get(providerMatchId);

          if (!sourceRow) {
            notFinishedSourceIds.add(providerMatchId);
            return row;
          }

          flashscoreStats.exactIdMatches++;

          const merged = mergeStatusRow(
            row,
            buildFlashscoreFinalIncoming(row, sourceRow)
          );

          const before = rowStatusSignature(row);
          const after = rowStatusSignature(merged);

          if (before === after) {
            return row;
          }

          leagueChanged = true;
          leagueChangedRows++;

          flashscoreStats.changedRows++;
          stats.changedRows++;
          stats.changedFixtures.push(merged);

          return merged;
        });

        if (!leagueChanged) {
          continue;
        }

        const deduped = dedupeLeagueDayFixtures(
          nextFixtures,
          { slug }
        );

        const previousSourceMeta =
          current?.sourceMeta &&
          typeof current.sourceMeta === "object"
            ? current.sourceMeta
            : {};

        writeCanonicalLeague(
          safeDayKey,
          slug,
          deduped.rows,
          {
            ...previousSourceMeta,

            flashscoreFinalRefresh: {
              matchedBy: "exact_source_id",
              requestedDayKey: safeDayKey,
              offsets: [0],
              changedRows: leagueChangedRows,
              mergedAt: new Date().toISOString()
            }
          }
        );

        writtenLeagueSlugs.add(slug);
        flashscoreStats.writtenLeagueCount++;
      }

      stats.writtenLeagueCount =
        writtenLeagueSlugs.size;

      flashscoreStats.missingFromFeedSourceIds = [
        ...missingFromFeedSourceIds
      ]
        .sort()
        .slice(0, 100);

      flashscoreStats.notFinishedSourceIds = [
        ...notFinishedSourceIds
      ]
        .sort()
        .slice(0, 100);
    } catch (err) {
      flashscoreStats.ok = false;
      flashscoreStats.error = String(
        err?.message || err
      );

      stats.errors.push({
        slug: "flashscore_exact_final_refresh",
        error: flashscoreStats.error
      });
    }
  }

  stats.finishedAt = new Date().toISOString();
  return stats;
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  runLiveStatusRefreshDay(process.argv[2])
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
