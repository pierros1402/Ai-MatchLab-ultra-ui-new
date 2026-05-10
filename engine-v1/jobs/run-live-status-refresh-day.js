import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { ESPN_BASE, leagueName } from "../config.js";
import { normalizeFixture } from "../core/normalize.js";
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

function isRefreshCandidate(row, now = new Date()) {
  if (!row || isFinalLike(row)) return false;

  const bucket = statusBucket(row);
  const staleOrLive = /\b(STALE|LIVE|FIRST_HALF|SECOND_HALF|HALF_TIME|IN_PROGRESS|STATUS_IN_PROGRESS)\b/i.test(bucket);
  const preLike = /\b(PRE|SCHEDULED|STATUS_SCHEDULED)\b/i.test(bucket);

  if (staleOrLive) return true;

  const kickoff = row?.kickoffUtc ? new Date(row.kickoffUtc) : null;
  if (!kickoff || Number.isNaN(kickoff.getTime())) {
    return preLike;
  }

  const hoursFromKickoff = (kickoff.getTime() - now.getTime()) / 3600000;

  return preLike && hoursFromKickoff <= 3 && hoursFromKickoff >= -8;
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
    const candidates = fixtures.filter(row => isRefreshCandidate(row, now));

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

export async function runLiveStatusRefreshDay(dayKey, options = {}) {
  const safeDayKey = normalizeText(dayKey);

  if (!isValidDayKey(safeDayKey)) {
    throw new Error("invalid dayKey: " + dayKey);
  }

  const startedAt = new Date().toISOString();
  const targetLeagues = collectTargetLeagues(safeDayKey, options);

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
    writtenLeagueCount: 0,
    byLeague: [],
    errors: []
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
      let changed = false;

      const nextFixtures = (Array.isArray(current.fixtures) ? current.fixtures : []).map(row => {
        const id = stableFixtureId(row);
        const incoming = id ? sourceById.get(id) : null;
        if (!incoming) return row;

        leagueStats.matchedRows++;
        stats.matchedRows++;

        const before = rowStatusSignature(row);
        const merged = mergeStatusRow(row, incoming);
        const after = rowStatusSignature(merged);

        if (before !== after) {
          changed = true;
          leagueStats.changedRows++;
          stats.changedRows++;
        }

        return merged;
      });

      if (changed) {
        writeCanonicalLeague(safeDayKey, slug, nextFixtures, {
          acquisitionProvider: "espn_direct_league_status",
          requestedLeagueSlug: slug,
          requestedDayKey: safeDayKey,
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
