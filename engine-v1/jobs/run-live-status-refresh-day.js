import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { ESPN_BASE, leagueName } from "../config.js";
import { normalizeFixture } from "../core/normalize.js";
import { buildCanonicalId } from "../core/canonical-id.js";
import { dedupeLeagueDayFixtures } from "../core/fixture-dedup.js";
import { getProductionIdentityResolver } from "../core/production-identity-resolver-runtime.js";
import { teamPairMatches } from "../core/team-identity.js";
import { espnProviderFetchSlugs } from "../core/espn-league-identity.js";
import { FINAL_SCORE_REVISION_POLICY } from "../core/final-score-revision-backlog.js";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import {
  listApprovedFlashscoreNonPlayedDecisions,
  resolveVerifiedFlashscoreNonPlayedDecision
} from "../source-discovery/flashscore-nonplayed-decisions.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { syncCanonicalFixturesToJsonDbDay } from "./sync-canonical-fixtures-to-json-db-day.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function isValidDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value));
}

function currentAthensDayKey(now = new Date()) {
  const date =
    now instanceof Date
      ? now
      : new Date(now);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "invalid Athens reference time"
    );
  }

  return date.toLocaleDateString(
    "en-CA",
    {
      timeZone:
        "Europe/Athens"
    }
  );
}

function dayNumber(dayKey) {
  const value =
    normalizeText(dayKey);

  if (!isValidDayKey(value)) {
    return null;
  }

  const parsed =
    Date.parse(
      `${value}T12:00:00.000Z`
    );

  return Number.isFinite(parsed)
    ? Math.floor(
        parsed /
        (24 * 60 * 60 * 1000)
      )
    : null;
}

export function resolveFlashscoreRefreshOffsets(
  requestedDayKey,
  approvedDecisions = [],
  referenceDayKey =
    currentAthensDayKey()
) {
  const requestedDay =
    normalizeText(
      requestedDayKey
    );

  const referenceDay =
    normalizeText(
      referenceDayKey
    );

  const requestedNumber =
    dayNumber(requestedDay);

  const referenceNumber =
    dayNumber(referenceDay);

  if (
    requestedNumber === null ||
    referenceNumber === null
  ) {
    throw new Error(
      "invalid_flashscore_refresh_day"
    );
  }

  const evidenceDays =
    (
      Array.isArray(approvedDecisions)
        ? approvedDecisions
        : []
    )
      .filter(decision =>
        normalizeText(
          decision?.dayKey
        ) === requestedDay
      )
      .map(decision =>
        normalizeText(
          decision?.evidenceDayKey
        )
      )
      .filter(isValidDayKey);

  const targetDays = [
    requestedDay,
    ...evidenceDays
  ];

  return [
    ...new Set(
      targetDays.map(dayKey => {
        const targetNumber =
          dayNumber(dayKey);

        if (targetNumber === null) {
          throw new Error(
            "invalid_flashscore_evidence_day"
          );
        }

        return (
          targetNumber -
          referenceNumber
        );
      })
    )
  ].sort(
    (left, right) =>
      left - right
  );
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
  // Canonical rows expose canonicalId through matchId. Exact provider refresh,
  // wrong-day occurrence checks and source fetch maps must instead key on the
  // source-scoped provider identity whenever it exists.
  return normalizeText(
    row?.sourceMatchId ||
    row?.sourceId ||
    row?.providerMatchId ||
    row?.matchId ||
    row?.id
  );
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

export function isEspnRefreshCandidate(
  row,
  now = new Date(),
  options = {}
) {
  const source =
    normalizeText(
      row?.source
    ).toLowerCase();

  const providerMatchId =
    normalizeText(
      row?.sourceId ||
      row?.sourceMatchId ||
      row?.matchId
    );

  return (
    source.startsWith("espn") &&
    Boolean(providerMatchId) &&
    isRefreshCandidate(
      row,
      now,
      options
    )
  );
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
    const candidates =
      fixtures.filter(row =>
        isEspnRefreshCandidate(
          row,
          now,
          options
        )
      );

    if (candidates.length > 0) {
      out.set(slug, {
        slug,
        candidateCount: candidates.length,
        fixtureCount: fixtures.length,
        providerFetchSlugs: espnProviderFetchSlugs(slug, candidates)
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

export function normalizeSourceRows(
  events,
  providerSlug,
  dayKey,
  options = {}
) {
  const byId = new Map();
  const canonicalSlug =
    normalizeText(options.canonicalSlug) ||
    normalizeText(providerSlug);

  for (const event of Array.isArray(events) ? events : []) {
    const normalized = normalizeFixture(event, providerSlug);
    if (!normalized) continue;

    const fixtureDay = normalizeText(normalized.dayKey);
    if (fixtureDay !== dayKey) continue;

    const id = stableFixtureId(normalized);
    if (!id) continue;

    const canonicalId = buildCanonicalId(
      canonicalSlug,
      normalized.homeTeam,
      normalized.awayTeam,
      normalized.dayKey || dayKey
    );

    byId.set(id, {
      matchId: canonicalId,
      matchKey: normalized.matchKey,
      canonicalId,
      source: normalized.source || "espn_direct_league_status",
      sourceId: normalized.sourceId || normalized.sourceMatchId || normalized.matchId,
      sourceMatchId: normalized.sourceMatchId || normalized.sourceId || normalized.matchId,
      providerLeagueSlug: normalizeText(providerSlug) || null,
      leagueSlug: canonicalSlug,
      leagueName: leagueName(canonicalSlug),
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

export function resolveEspnExactEventOccurrence(
  payload,
  providerSlug,
  requestedDayKey,
  options = {}
) {
  const canonicalSlug =
    normalizeText(options.canonicalSlug) ||
    normalizeText(providerSlug);

  const header =
    payload?.header &&
    typeof payload.header === "object"
      ? payload.header
      : {};

  const competition =
    Array.isArray(header?.competitions)
      ? header.competitions[0]
      : null;

  const providerMatchId =
    normalizeText(
      header?.id ||
      competition?.id
    );

  if (
    !providerMatchId ||
    !competition
  ) {
    return {
      kind: "invalid",
      providerMatchId:
        providerMatchId || null,
      authoritativeDayKey: null,
      incoming: null,
      reason:
        "missing_exact_event_identity"
    };
  }

  const event = {
    id:
      providerMatchId,

    date:
      competition?.date ||
      header?.date ||
      null,

    competitions: [
      competition
    ]
  };

  const normalized =
    normalizeFixture(
      event,
      providerSlug
    );

  const authoritativeDayKey =
    normalizeText(
      normalized?.dayKey
    );

  if (
    !normalized ||
    !isValidDayKey(
      authoritativeDayKey
    )
  ) {
    return {
      kind: "invalid",
      providerMatchId,
      authoritativeDayKey:
        authoritativeDayKey || null,
      incoming: null,
      reason:
        "invalid_authoritative_event_day"
    };
  }

  const normalizedRows =
    normalizeSourceRows(
      [event],
      providerSlug,
      authoritativeDayKey,
      {
        canonicalSlug
      }
    );

  const authoritativeRow =
    normalizedRows.get(
      providerMatchId
    ) || null;

  if (
    !authoritativeRow ||
    stableFixtureId(
      authoritativeRow
    ) !== providerMatchId
  ) {
    return {
      kind: "invalid",
      providerMatchId,
      authoritativeDayKey,
      incoming: null,
      reason:
        "exact_event_normalization_failed"
    };
  }

  const evidence = {
    providerMatchId,
    providerLeagueSlug:
      normalizeText(providerSlug) ||
      null,
    authoritativeDayKey,
    kickoffUtc:
      authoritativeRow?.kickoffUtc ||
      null,
    status:
      authoritativeRow?.status ||
      null,
    statusType:
      authoritativeRow?.statusType ||
      null,
    rawStatus:
      authoritativeRow?.rawStatus ||
      null,

    homeTeam:
      authoritativeRow?.homeTeam ||
      null,

    awayTeam:
      authoritativeRow?.awayTeam ||
      null
  };

  if (
    authoritativeDayKey !==
    normalizeText(requestedDayKey)
  ) {
    return {
      kind: "other_day",
      providerMatchId,
      authoritativeDayKey,
      incoming: null,
      evidence
    };
  }

  return {
    kind: "same_day",
    providerMatchId,
    authoritativeDayKey,
    incoming:
      authoritativeRow,
    evidence
  };
}

export function canRemoveEspnWrongDayCanonicalRow(
  canonicalRow,
  wrongDayEvidence
) {
  const canonicalProviderId =
    stableFixtureId(
      canonicalRow
    );

  const evidenceProviderId =
    normalizeText(
      wrongDayEvidence
        ?.providerMatchId
    );

  if (
    !canonicalProviderId ||
    !evidenceProviderId ||
    canonicalProviderId !==
      evidenceProviderId
  ) {
    return false;
  }

  return teamPairMatches(
    canonicalRow?.homeTeam,
    canonicalRow?.awayTeam,
    wrongDayEvidence?.homeTeam,
    wrongDayEvidence?.awayTeam
  );
}

export function mergeStatusRow(
  previous,
  incoming
) {
  const merged = {
    ...previous
  };

  const mutableStatusFields = [
    "providerLeagueSlug",
    "fetchedDayKey",
    "status",
    "statusType",
    "rawStatus",
    "operationalState",
    "minute",
    "scoreHome",
    "scoreAway",
    "penalties",
    "decidedBy",
    "lastSeenAt"
  ];

  for (
    const key of
    mutableStatusFields
  ) {
    if (
      meaningful(
        incoming?.[key]
      )
    ) {
      merged[key] =
        incoming[key];
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

function strictFlashscoreScore(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const score = Number(value);

  if (
    !Number.isInteger(score) ||
    score < 0
  ) {
    return null;
  }

  return score;
}

export function isExactFlashscoreFinalRow(
  row,
  dayKey,
  nowMs = Date.now()
) {
  if (row?.finished !== true) return false;
  if (row?.playedFinal !== true) return false;
  if (row?.nonPlayedTerminal === true) return false;

  if (
    normalizeText(row?.statusCode) !== "3"
  ) {
    return false;
  }

  const scoreHome =
    strictFlashscoreScore(
      row?.scoreHome
    );

  const scoreAway =
    strictFlashscoreScore(
      row?.scoreAway
    );

  if (
    scoreHome === null ||
    scoreAway === null
  ) {
    return false;
  }

  const kickoffMs = Date.parse(
    normalizeText(row?.kickoffUtc)
  );

  if (
    !Number.isFinite(kickoffMs) ||
    kickoffMs > nowMs
  ) {
    return false;
  }

  const sourceDay =
    athensDayFromUtc(
      row?.kickoffUtc
    );

  return (
    !sourceDay ||
    sourceDay === dayKey
  );
}

export function mergeFlashscoreTargetLeaguesWithApprovedDecisions(
  baseTargetLeagues,
  dayKey
) {
  const requestedDay =
    normalizeText(dayKey);

  const bySlug =
    new Map();

  for (
    const target
    of (
      Array.isArray(
        baseTargetLeagues
      )
        ? baseTargetLeagues
        : []
    )
  ) {
    const slug =
      normalizeText(
        typeof target === "string"
          ? target
          : target?.slug
      );

    if (!slug) {
      continue;
    }

    const normalizedTarget =
      target &&
      typeof target === "object" &&
      !Array.isArray(target)
        ? {
            ...target,
            slug
          }
        : {
            slug,
            candidateCount: 0,
            fixtureCount: 0
          };

    bySlug.set(
      slug,
      normalizedTarget
    );
  }

  const approvedDecisions =
    listApprovedFlashscoreNonPlayedDecisions()
      .filter(decision =>
        normalizeText(
          decision?.dayKey
        ) === requestedDay
      );

  for (
    const decision
    of approvedDecisions
  ) {
    const slug =
      normalizeText(
        decision?.leagueSlug
      );

    if (!slug) {
      continue;
    }

    const previous =
      bySlug.get(slug);

    const previousDecisionIds =
      Array.isArray(
        previous?.approvedDecisionIds
      )
        ? previous
            .approvedDecisionIds
        : [];

    const approvedDecisionIds = [
      ...new Set([
        ...previousDecisionIds,
        normalizeText(
          decision?.decisionId
        )
      ].filter(Boolean))
    ].sort();

    bySlug.set(
      slug,
      {
        ...(previous || {
          slug,
          candidateCount: 0,
          fixtureCount: 0
        }),

        slug,

        forcedByApprovedDecision:
          true,

        approvedDecisionCount:
          approvedDecisionIds.length,

        approvedDecisionIds
      }
    );
  }

  return [
    ...bySlug.values()
  ].sort((a, b) =>
    a.slug.localeCompare(
      b.slug
    )
  );
}

export function isFlashscoreNonPlayedTerminalEvidence(
  row,
  dayKey
) {
  if (
    row?.nonPlayedTerminal !== true ||
    row?.playedFinal === true ||
    row?.finished === true
  ) {
    return false;
  }

  if (
    normalizeText(
      row?.statusCode
    ) !== "3" ||
    normalizeText(
      row?.statusDetailCode
    ) !== "4"
  ) {
    return false;
  }

  if (
    strictFlashscoreScore(
      row?.scoreHome
    ) !== null ||
    strictFlashscoreScore(
      row?.scoreAway
    ) !== null
  ) {
    return false;
  }

  const sourceDay =
    athensDayFromUtc(
      row?.kickoffUtc
    );

  return (
    Boolean(sourceDay) &&
    sourceDay === dayKey
  );
}

export function resolveFlashscoreNonPlayedDecisionForRows(
  row,
  dayKey,
  canonicalRow
) {
  return resolveVerifiedFlashscoreNonPlayedDecision({
    dayKey,
    canonicalId:
      canonicalRow?.canonicalId ||
      canonicalRow?.matchId,
    leagueSlug: canonicalRow?.leagueSlug,
    providerMatchId: row?.matchId,
    canonicalSource: canonicalRow?.source,
    canonicalProviderMatchId:
      canonicalRow?.sourceId ||
      canonicalRow?.sourceMatchId,
    canonicalHomeTeam: canonicalRow?.homeTeam,
    canonicalAwayTeam: canonicalRow?.awayTeam,
    canonicalKickoffUtc: canonicalRow?.kickoffUtc,
    canonicalStatus: canonicalRow?.status,
    canonicalRawStatus: canonicalRow?.rawStatus,
    canonicalStatusType: canonicalRow?.statusType,
    canonicalScoreHome: canonicalRow?.scoreHome,
    canonicalScoreAway: canonicalRow?.scoreAway,
    sourceHomeTeam: row?.home,
    sourceAwayTeam: row?.away,
    sourceKickoffUtc: row?.kickoffUtc,
    statusCode: row?.statusCode,
    statusDetailCode: row?.statusDetailCode,
    nonPlayedTerminal: row?.nonPlayedTerminal,
    playedFinal: row?.playedFinal,
    finished: row?.finished,
    scoreHome: row?.scoreHome,
    scoreAway: row?.scoreAway
  });
}

export function isExactFlashscorePostponedRow(
  row,
  dayKey,
  canonicalRow
) {
  const decision =
    resolveFlashscoreNonPlayedDecisionForRows(
      row,
      dayKey,
      canonicalRow
    );

  if (!decision) {
    return false;
  }

  const evidenceDayKey =
    decision.evidenceDayKey ||
    dayKey;

  if (
    !isFlashscoreNonPlayedTerminalEvidence(
      row,
      evidenceDayKey
    )
  ) {
    return false;
  }

  if (
    decision.evidenceKickoffUtc &&
    Date.parse(
      normalizeText(row?.kickoffUtc)
    ) !==
      Date.parse(
        decision.evidenceKickoffUtc
      )
  ) {
    return false;
  }

  return (
    decision.providerMatchId ===
      normalizeText(row?.matchId) &&
    decision.requiredProviderEvidence
      ?.statusCode ===
      normalizeText(row?.statusCode) &&
    decision.requiredProviderEvidence
      ?.statusDetailCode ===
      normalizeText(
        row?.statusDetailCode
      )
  );
}

export function buildFlashscorePostponedIncoming(
  previous,
  sourceRow,
  dayKey = previous?.dayKey
) {
  const providerMatchId =
    normalizeText(
      sourceRow?.matchId
    );

  const decision =
    resolveFlashscoreNonPlayedDecisionForRows(
      sourceRow,
      dayKey,
      previous
    );

  const evidenceDayKey =
    decision?.evidenceDayKey ||
    dayKey;

  const evidenceKickoffMatches =
    !decision?.evidenceKickoffUtc ||
    Date.parse(
      normalizeText(sourceRow?.kickoffUtc)
    ) ===
      Date.parse(
        decision.evidenceKickoffUtc
      );

  if (
    !decision ||
    !evidenceKickoffMatches ||
    !isFlashscoreNonPlayedTerminalEvidence(
      sourceRow,
      evidenceDayKey
    )
  ) {
    throw new Error(
      "unverified_flashscore_nonplayed_status_mutation"
    );
  }

  const correctedAt =
    new Date().toISOString();

  const status =
    decision.resolvedStatus;

  return {
    ...previous,

    source: "flashscore",
    sourceId: providerMatchId,
    sourceMatchId: providerMatchId,

    scoreHome: null,
    scoreAway: null,
    penalties: null,
    decidedBy: null,

    status,
    statusType: status,
    rawStatus: status,
    minute: null,

    lastSeenAt: correctedAt,

    statusCorrection: {
      correctedAt,
      decisionId:
        decision.decisionId,

      policyVersion:
        decision.policyVersion,

      correctedFrom: {
        status:
          previous?.status ??
          null,

        statusType:
          previous?.statusType ??
          null,

        rawStatus:
          previous?.rawStatus ??
          null,

        minute:
          previous?.minute ??
          null,

        scoreHome:
          previous?.scoreHome ??
          null,

        scoreAway:
          previous?.scoreAway ??
          null
      },

      correctedTo: {
        status,
        statusType: status,
        rawStatus: status,
        minute: null,
        scoreHome: null,
        scoreAway: null
      },

      reason:
        "verified_flashscore_nonplayed_decision",

      decisionBasis:
        decision.decisionBasis,

      decisionMode:
        decision.decisionMode ||
        "approved_occurrence",

      providerEvidence: {
        provider:
          decision.provider,

        providerMatchId,

        home:
          normalizeText(
            sourceRow?.home
          ),

        away:
          normalizeText(
            sourceRow?.away
          ),

        kickoffUtc:
          normalizeText(
            sourceRow?.kickoffUtc
          ),

        canonicalSource:
          normalizeText(
            previous?.source
          ),

        canonicalProviderMatchId:
          normalizeText(
            previous?.sourceId ||
            previous?.sourceMatchId
          ),

        statusCode:
          normalizeText(
            sourceRow?.statusCode
          ),

        statusDetailCode:
          normalizeText(
            sourceRow
              ?.statusDetailCode
          ),

        playedFinal:
          sourceRow?.playedFinal ===
          true,

        finished:
          sourceRow?.finished ===
          true,

        nonPlayedTerminal:
          sourceRow
            ?.nonPlayedTerminal ===
          true,

        scoreHome:
          sourceRow?.scoreHome ??
          null,

        scoreAway:
          sourceRow?.scoreAway ??
          null
      }
    }
  };
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

    scoreHome: strictFlashscoreScore(sourceRow.scoreHome),
    scoreAway: strictFlashscoreScore(sourceRow.scoreAway),

    status: "FT",
    statusType: "STATUS_FINAL",
    rawStatus: "STATUS_FINAL",
    minute: "FT",

    lastSeenAt: new Date().toISOString()
  };
}

function finalScoreKey(value) {
  const direct = normalizeText(
    value?.scoreKey ||
    value?.finalScore?.scoreKey
  );
  if (direct) return direct;

  const home = Number(
    value?.scoreHome ??
    value?.homeScore ??
    value?.finalScore?.homeScore
  );
  const away = Number(
    value?.scoreAway ??
    value?.awayScore ??
    value?.finalScore?.awayScore
  );

  return Number.isInteger(home) && home >= 0 && Number.isInteger(away) && away >= 0
    ? `${home}-${away}`
    : "";
}

export function resolveApprovedFlashscoreFinalScoreRevision(
  canonicalRow,
  sourceRow,
  finalArtifact,
  dayKey
) {
  if (!isFinalLike(canonicalRow)) {
    return { ok: false, reason: "canonical_not_final" };
  }
  if (normalizeText(canonicalRow?.source).toLowerCase() !== "flashscore") {
    return { ok: false, reason: "canonical_not_flashscore" };
  }

  const providerMatchId = normalizeText(
    canonicalRow?.sourceId || canonicalRow?.sourceMatchId
  );
  if (!providerMatchId || normalizeText(sourceRow?.matchId) !== providerMatchId) {
    return { ok: false, reason: "provider_id_mismatch" };
  }
  if (!isExactFlashscoreFinalRow(sourceRow, dayKey)) {
    return { ok: false, reason: "source_not_exact_terminal" };
  }
  if (finalArtifact?.verifiedFinalTruth !== true) {
    return { ok: false, reason: "verified_final_artifact_required" };
  }
  if (normalizeText(finalArtifact?.matchId) !== normalizeText(canonicalRow?.canonicalId || canonicalRow?.matchId)) {
    return { ok: false, reason: "canonical_id_mismatch" };
  }

  const revision = finalArtifact?.terminalScoreRevision;
  if (
    revision?.policyVersion !== FINAL_SCORE_REVISION_POLICY.policyVersion ||
    revision?.state !== "APPLIED" ||
    normalizeText(revision?.provider).toLowerCase() !== "flashscore" ||
    normalizeText(revision?.providerMatchId) !== providerMatchId ||
    Number(revision?.observationCount || 0) < FINAL_SCORE_REVISION_POLICY.minStableObservations ||
    Number(revision?.stableForMs || 0) < FINAL_SCORE_REVISION_POLICY.minStableMs
  ) {
    return { ok: false, reason: "mature_revision_proof_required" };
  }

  if (!teamPairMatches(
    canonicalRow?.homeTeam,
    canonicalRow?.awayTeam,
    finalArtifact?.homeTeam,
    finalArtifact?.awayTeam
  )) {
    return { ok: false, reason: "team_pair_mismatch" };
  }

  const canonicalKickoff = Date.parse(normalizeText(canonicalRow?.kickoffUtc));
  const artifactKickoff = Date.parse(normalizeText(finalArtifact?.kickoffUtc));
  if (
    !Number.isFinite(canonicalKickoff) ||
    !Number.isFinite(artifactKickoff) ||
    Math.abs(canonicalKickoff - artifactKickoff) > 60_000
  ) {
    return { ok: false, reason: "kickoff_mismatch" };
  }

  const canonicalScore = finalScoreKey(canonicalRow);
  const sourceScore = finalScoreKey({
    scoreHome: sourceRow?.scoreHome,
    scoreAway: sourceRow?.scoreAway
  });
  const artifactScore = finalScoreKey(finalArtifact);

  if (!canonicalScore || !sourceScore || !artifactScore) {
    return { ok: false, reason: "numeric_score_required" };
  }
  if (canonicalScore === sourceScore) {
    return { ok: false, reason: "no_score_revision" };
  }
  if (
    artifactScore !== sourceScore ||
    normalizeText(revision?.previousScore) !== canonicalScore ||
    normalizeText(revision?.correctedScore) !== sourceScore
  ) {
    return { ok: false, reason: "revision_score_proof_mismatch" };
  }

  return {
    ok: true,
    providerMatchId,
    previousScore: canonicalScore,
    correctedScore: sourceScore,
    revision
  };
}

export function finalizeLiveStatusRefreshStats(
  stats
) {
  const errors =
    Array.isArray(stats?.errors)
      ? stats.errors
      : [];

  const failedLeagueCount =
    Number(
      stats?.failedLeagueCount || 0
    );

  const flashscoreFailed =
    stats?.flashscoreFinalRefresh
      ?.attempted === true &&
    stats?.flashscoreFinalRefresh
      ?.ok !== true;

  stats.ok =
    errors.length === 0 &&
    failedLeagueCount === 0 &&
    !flashscoreFailed;

  return stats;
}

export async function runLiveStatusRefreshDay(dayKey, options = {}) {
  const safeDayKey = normalizeText(dayKey);

  if (!isValidDayKey(safeDayKey)) {
    throw new Error("invalid dayKey: " + dayKey);
  }

  const startedAt = new Date().toISOString();

  const targetLeagues =
    collectTargetLeagues(
      safeDayKey,
      options
    );

  const approvedNonPlayedDecisions =
    listApprovedFlashscoreNonPlayedDecisions()
      .filter(decision =>
        normalizeText(
          decision?.dayKey
        ) === safeDayKey
      );

  const flashscoreTargetLeagues =
    mergeFlashscoreTargetLeaguesWithApprovedDecisions(
      collectFlashscoreTargetLeagues(
        safeDayKey
      ),
      safeDayKey
    );

  const flashscoreOffsets =
    resolveFlashscoreRefreshOffsets(
      safeDayKey,
      approvedNonPlayedDecisions,
      currentAthensDayKey(
        options?.now ||
        new Date()
      )
    );

  const approvedEvidenceDayKeys =
    new Set([
      safeDayKey,

      ...approvedNonPlayedDecisions
        .map(decision =>
          normalizeText(
            decision?.evidenceDayKey
          )
        )
        .filter(isValidDayKey)
    ]);

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
    offsets:
      flashscoreOffsets,
    targetLeagueCount: flashscoreTargetLeagues.length,
    targetLeagues: flashscoreTargetLeagues,
    sourceRows: 0,
    finishedRows: 0,
    postponedRows: 0,
    exactIdCandidates: 0,
    exactIdMatches: 0,
    postponedExactIdMatches: 0,
    finalScoreRevisionAppliedRows: 0,
    unapprovedNonPlayedMatches: 0,
    changedRows: 0,
    writtenLeagueCount: 0,
    attempts: [],
    missingFromFeedSourceIds: [],
    notFinishedSourceIds: [],
    error: null
  };

  for (const target of targetLeagues) {
    const slug = target.slug;
    const providerFetchSlugs = Array.isArray(target?.providerFetchSlugs) &&
      target.providerFetchSlugs.length > 0
      ? target.providerFetchSlugs
      : [slug];

    const leagueStats = {
      slug,
      leagueName: leagueName(slug),
      candidateCount: target.candidateCount,
      fixtureCount: target.fixtureCount,
      providerFetchSlugs,
      providerFetches: [],
      ok: false,
      sourceEvents: 0,
      sourceRows: 0,
      matchedRows: 0,
      changedRows: 0,
      appendedRows: 0,
      exactIdFallbackCandidates: 0,
      exactIdFallbackMatches: 0,
      adjacentFetches: [],
      exactSummaryCandidates: 0,
      exactSummarySameDayMatches: 0,
      exactSummaryWrongDayMatches: 0,
      exactSummaryWrongDayRemovedRows: 0,
      exactSummaryWrongDayIdentityRejectedRows: 0,
      exactSummaryFetches: [],
      written: false,
      error: null
    };

    try {
      const sourceById = new Map();
      let successfulProviderFetches = 0;

      for (const providerSlug of providerFetchSlugs) {
        const url = ESPN_BASE + "/" + providerSlug +
          "/scoreboard?dates=" + espnDateFromDayKey(safeDayKey);

        try {
          const source = await fetchJson(
            url,
            "espn_direct_league_status_" + providerSlug
          );
          const events = Array.isArray(source?.events) ? source.events : [];
          const providerRows = normalizeSourceRows(
            events,
            providerSlug,
            safeDayKey,
            { canonicalSlug: slug }
          );

          for (const [id, row] of providerRows) {
            sourceById.set(id, row);
          }

          successfulProviderFetches++;
          leagueStats.sourceEvents += events.length;
          stats.sourceEventCount += events.length;
          leagueStats.providerFetches.push({
            providerSlug,
            ok: true,
            events: events.length,
            rows: providerRows.size,
            error: null
          });
        } catch (err) {
          leagueStats.providerFetches.push({
            providerSlug,
            ok: false,
            events: 0,
            rows: 0,
            error: err?.message || String(err)
          });
        }
      }

      if (successfulProviderFetches === 0) {
        throw new Error("all_espn_provider_fetches_failed");
      }

      leagueStats.ok = true;
      leagueStats.sourceRows = sourceById.size;

      stats.fetchedLeagueCount++;
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
          for (const providerSlug of providerFetchSlugs) {
            const adjacentUrl =
              ESPN_BASE +
              "/" +
              providerSlug +
              "/scoreboard?dates=" +
              espnDateFromDayKey(sourceDayKey);

            try {
              const adjacentSource =
                await fetchJson(
                  adjacentUrl,
                  "espn_exact_id_adjacent_" +
                    providerSlug +
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
                  providerSlug,
                  safeDayKey,
                  { canonicalSlug: slug }
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
                providerSlug,
                dayKey: sourceDayKey,
                ok: true,
                events:
                  adjacentEvents.length,
                matched
              });
            }
            catch (err) {
              leagueStats.adjacentFetches.push({
                providerSlug,
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

          if (
            missingExactIds.size === 0
          ) {
            break;
          }
        }
      }

      const wrongDayExactIds =
        new Map();

      leagueStats.exactSummaryCandidates =
        missingExactIds.size;

      if (missingExactIds.size > 0) {
        for (
          const id of [
            ...missingExactIds
          ]
        ) {
          for (
            const providerSlug of
            providerFetchSlugs
          ) {
            const summaryUrl =
              ESPN_BASE +
              "/" +
              providerSlug +
              "/summary?event=" +
              encodeURIComponent(id);

            try {
              const summaryPayload =
                await fetchJson(
                  summaryUrl,
                  "espn_exact_event_summary_" +
                    providerSlug +
                    "_" +
                    id
                );

              const occurrence =
                resolveEspnExactEventOccurrence(
                  summaryPayload,
                  providerSlug,
                  safeDayKey,
                  {
                    canonicalSlug:
                      slug
                  }
                );

              leagueStats
                .exactSummaryFetches
                .push({
                  providerSlug,
                  providerMatchId:
                    id,
                  ok:
                    true,
                  kind:
                    occurrence.kind,
                  authoritativeDayKey:
                    occurrence
                      .authoritativeDayKey ||
                    null,
                  reason:
                    occurrence.reason ||
                    null
                });

              if (
                occurrence.kind ===
                  "same_day" &&
                occurrence.incoming
              ) {
                sourceById.set(
                  id,
                  occurrence.incoming
                );

                missingExactIds.delete(
                  id
                );

                leagueStats
                  .exactSummarySameDayMatches++;

                break;
              }

              if (
                occurrence.kind ===
                "other_day"
              ) {
                wrongDayExactIds.set(
                  id,
                  occurrence.evidence
                );

                missingExactIds.delete(
                  id
                );

                leagueStats
                  .exactSummaryWrongDayMatches++;

                break;
              }
            }
            catch (err) {
              leagueStats
                .exactSummaryFetches
                .push({
                  providerSlug,
                  providerMatchId:
                    id,
                  ok:
                    false,
                  kind:
                    null,
                  authoritativeDayKey:
                    null,
                  error:
                    err?.message ||
                    String(err)
                });
            }
          }
        }
      }

      let changed = false;
      const matchedIds = new Set();

      const currentFixtures =
        Array.isArray(current.fixtures)
          ? current.fixtures
          : [];

      const wrongDayIdRows =
        currentFixtures.filter(row => {
          const id =
            stableFixtureId(row);

          return (
            Boolean(id) &&
            wrongDayExactIds.has(id)
          );
        });

      const wrongDayRows =
        wrongDayIdRows.filter(row => {
          const id =
            stableFixtureId(row);

          const evidence =
            id
              ? wrongDayExactIds.get(id)
              : null;

          return (
            Boolean(evidence) &&
            canRemoveEspnWrongDayCanonicalRow(
              row,
              evidence
            )
          );
        });

      leagueStats
        .exactSummaryWrongDayIdentityRejectedRows +=
          wrongDayIdRows.length -
          wrongDayRows.length;

      if (wrongDayRows.length > 0) {
        changed = true;

        leagueStats
          .exactSummaryWrongDayRemovedRows +=
            wrongDayRows.length;

        stats.changedRows +=
          wrongDayRows.length;

        leagueStats.changedRows +=
          wrongDayRows.length;
      }

      let nextFixtures =
        currentFixtures
          .filter(row => {
            const id =
              stableFixtureId(row);

            const evidence =
              id
                ? wrongDayExactIds.get(id)
                : null;

            return !(
              Boolean(evidence) &&
              canRemoveEspnWrongDayCanonicalRow(
                row,
                evidence
              )
            );
          })
          .map(row => {
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
        const deduped = dedupeLeagueDayFixtures(nextFixtures, {
          slug,
          identityResolver: getProductionIdentityResolver()
        });
        nextFixtures = deduped.rows;

        writeCanonicalLeague(safeDayKey, slug, nextFixtures, {
          acquisitionProvider: "espn_direct_league_status",
          requestedLeagueSlug: slug,
          requestedDayKey: safeDayKey,

          providerFetchSlugs,

          exactIdAdjacentDateFallback: {
            candidates:
              leagueStats.exactIdFallbackCandidates,
            matches:
              leagueStats.exactIdFallbackMatches,
            fetches:
              leagueStats.adjacentFetches
          },

          exactEventSummaryReconciliation: {
            candidates:
              leagueStats.exactSummaryCandidates,

            sameDayMatches:
              leagueStats
                .exactSummarySameDayMatches,

            wrongDayMatches:
              leagueStats
                .exactSummaryWrongDayMatches,

            wrongDayRemovedRows:
              leagueStats
                .exactSummaryWrongDayRemovedRows,

            wrongDayIdentityRejectedRows:
              leagueStats
                .exactSummaryWrongDayIdentityRejectedRows,

            fetches:
              leagueStats
                .exactSummaryFetches,

            policy: {
              exactProviderIdOnly:
                true,
              authoritativeEventDayOnly:
                true,
              teamIdentityRequired:
                true,
              homeAwayOrientationRequired:
                true,
              crossDayStatusPromotion:
                false,
              heuristicFinalPromotion:
                false
            }
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
      const feed =
        await fetchFlashscoreFixtures({
          offsets:
            flashscoreOffsets
        });

      const sourceRows = Array.isArray(feed?.rows)
        ? feed.rows
        : [];

      const finishedRows = sourceRows.filter(row =>
        isExactFlashscoreFinalRow(row, safeDayKey)
      );

      const postponedRows =
        sourceRows.filter(row =>
          [
            ...approvedEvidenceDayKeys
          ].some(evidenceDayKey =>
            isFlashscoreNonPlayedTerminalEvidence(
              row,
              evidenceDayKey
            )
          )
        );

      flashscoreStats.ok = Boolean(feed?.ok);
      flashscoreStats.sourceRows = sourceRows.length;
      flashscoreStats.finishedRows = finishedRows.length;
      flashscoreStats.postponedRows = postponedRows.length;
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

      const postponedByProviderId = new Map();

      for (const row of postponedRows) {
        const providerMatchId =
          normalizeText(
            row?.matchId
          );

        if (!providerMatchId) continue;

        postponedByProviderId.set(
          providerMatchId,
          row
        );
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
            canonicalSource !== "flashscore"
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

          const postponedRow =
            postponedByProviderId.get(
              providerMatchId
            );

          if (
            postponedRow &&
            isExactFlashscorePostponedRow(
              postponedRow,
              safeDayKey,
              row
            )
          ) {
            flashscoreStats.exactIdMatches++;
            flashscoreStats.postponedExactIdMatches++;

            const corrected =
              buildFlashscorePostponedIncoming(
                row,
                postponedRow,
                safeDayKey
              );

            const before =
              rowStatusSignature(row);

            const after =
              rowStatusSignature(corrected);

            if (before === after) {
              return row;
            }

            leagueChanged = true;
            leagueChangedRows++;

            flashscoreStats.changedRows++;
            stats.changedRows++;

            stats.changedFixtures.push(
              corrected
            );

            return corrected;
          }

          if (postponedRow) {
            flashscoreStats
              .unapprovedNonPlayedMatches++;
          }

          const sourceRow =
            finalByProviderId.get(providerMatchId);

          /*
           * A current canonical final is normally immutable. The only played-
           * score exception is a mature same-provider terminal revision that
           * has already passed the persistent final-result conflict policy.
           * This is intentionally a one-way correction: an unproven feed
           * disagreement still leaves the frozen canonical FT untouched.
           */
          if (isFinalLike(row)) {
            if (!sourceRow) {
              return row;
            }

            const finalResultArtifact = readJson(
              resolveDataPath(
                "final-results",
                safeDayKey,
                `${normalizeText(row?.canonicalId || row?.matchId)}.json`
              ),
              null
            );
            const revision = resolveApprovedFlashscoreFinalScoreRevision(
              row,
              sourceRow,
              finalResultArtifact,
              safeDayKey
            );

            if (!revision.ok) {
              return row;
            }

            const merged = {
              ...mergeStatusRow(
                row,
                buildFlashscoreFinalIncoming(row, sourceRow)
              ),
              terminalScoreRevision: {
                policyVersion: revision.revision.policyVersion,
                state: "CANONICAL_APPLIED",
                appliedAt: new Date().toISOString(),
                provider: "flashscore",
                providerMatchId,
                previousScore: revision.previousScore,
                correctedScore: revision.correctedScore,
                finalResultRevisionAppliedAt: revision.revision.appliedAt || null
              }
            };

            const before = rowStatusSignature(row);
            const after = rowStatusSignature(merged);

            if (before === after) {
              return row;
            }

            leagueChanged = true;
            leagueChangedRows++;
            flashscoreStats.exactIdMatches++;
            flashscoreStats.finalScoreRevisionAppliedRows++;
            flashscoreStats.changedRows++;
            stats.changedRows++;
            stats.changedFixtures.push(merged);

            return merged;
          }

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
          {
            slug,
            identityResolver: getProductionIdentityResolver()
          }
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

  // Canonical status writes above are the authoritative truth. Keep the runtime
  // fixture DB in the same state before any caller can rebuild details or a
  // deploy snapshot; otherwise stale runtime status fields can be overlaid onto
  // newer canonical non-played/final truth and create a false state conflict.
  const canonicalRuntimeSync =
    syncCanonicalFixturesToJsonDbDay(
      safeDayKey,
      { write: true }
    );

  if (canonicalRuntimeSync?.ok !== true) {
    throw new Error(
      "live_status_canonical_runtime_sync_failed"
    );
  }

  stats.canonicalRuntimeSync = {
    ok: true,
    rawRows:
      canonicalRuntimeSync.rawRows ?? 0,
    acceptedRows:
      canonicalRuntimeSync.acceptedRows ?? 0,
    inserted:
      canonicalRuntimeSync.inserted ?? 0,
    updated:
      canonicalRuntimeSync.updated ?? 0,
    unchanged:
      canonicalRuntimeSync.unchanged ?? 0
  };

  stats.finishedAt =
    new Date().toISOString();

  return finalizeLiveStatusRefreshStats(
    stats
  );
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

export function parseLiveStatusRefreshCliArgs(args = []) {
  const values = Array.isArray(args) ? args.map(value => String(value || "").trim()) : [];
  const dayKey = values.find(value => isValidDayKey(value)) || values.find(value => value && !value.startsWith("--")) || "";

  return {
    dayKey,
    options: {
      appendNewFixtures: values.includes("--append-new-fixtures"),
      includeAllOpenStates: values.includes("--include-all-open-states")
    }
  };
}

if (isCli) {
  const cli = parseLiveStatusRefreshCliArgs(process.argv.slice(2));
  runLiveStatusRefreshDay(cli.dayKey, cli.options)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
