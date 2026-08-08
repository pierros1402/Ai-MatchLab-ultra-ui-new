import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import {
  resolveApprovedFlashscoreNonPlayedDecision
} from "../source-discovery/flashscore-nonplayed-decisions.js";
import { resolveDataPath } from "../storage/data-root.js";
import { teamPairMatches } from "../core/team-identity.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import { verifiedFinalVetoReason } from "../core/non-played-state.js";
import {
  bindProductionResultIdentity,
  bindVerifiedFinalResultIdentity,
} from "../core/production-result-identity-binding.js";
import {
  buildAutoCorrectedFinalPayload,
  buildFinalScoreConflictBacklog,
  isAutoCorrectableFlashscoreRevision,
  markBacklogAutoCorrected
} from "../core/final-score-revision-backlog.js";

function clean(value) {
  return String(value ?? "").trim();
}

function norm(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonPretty(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function rowsFromPayload(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  for (const key of ["fixtures", "matches", "items", "rows", "picks", "valuePicks"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
}

function rowId(row) {
  return clean(row?.matchId || row?.canonicalId || row?.fixtureId || row?.id);
}

function homeName(row) {
  return clean(row?.homeTeam || row?.home || row?.homeName);
}

function awayName(row) {
  return clean(row?.awayTeam || row?.away || row?.awayName);
}

function leagueSlug(row) {
  return clean(row?.leagueSlug || row?.league || row?.competitionSlug);
}

function canonicalLookupKeys(row) {
  return [
    row?.canonicalId,
    row?.matchId,
    row?.sourceMatchId,
    row?.sourceId,
    row?.providerMatchId,
    row?.fixtureId,
    row?.id
  ]
    .map(clean)
    .filter(Boolean);
}

function indexCanonicalFixtures(rows = []) {
  const byKey = new Map();

  for (const row of rows) {
    for (const key of canonicalLookupKeys(row)) {
      if (!byKey.has(key)) byKey.set(key, row);
    }
  }

  return byKey;
}

function findCanonicalFixture(row, byKey) {
  for (const key of canonicalLookupKeys(row)) {
    const found = byKey.get(key);
    if (found) return found;
  }

  return null;
}

function canonicalEspnProviderId(row) {
  const providerId = clean(
    row?.sourceMatchId ||
    row?.sourceId ||
    row?.matchId
  );

  return /^\d+$/u.test(providerId) ? providerId : "";
}

function hasCanonicalTerminalStatus(row) {
  const status = clean(row?.status).toUpperCase();

  return new Set([
    "FT",
    "FINAL",
    "FULL_TIME",
    "STATUS_FINAL",
    "STATUS_FULL_TIME"
  ]).has(status);
}

function hasExplicitEspnTerminalStatus(row) {
  const providerStatusValues = [
    row?.rawStatus,
    row?.statusType
  ]
    .map(value => clean(value).toUpperCase())
    .filter(Boolean);

  const exactProviderTerminal = new Set([
    "FT",
    "FINAL",
    "FULL_TIME",
    "STATUS_FINAL",
    "STATUS_FULL_TIME",
    "STATUS_FINAL_AET",
    "STATUS_FINAL_PEN",
    "STATUS_FULL_TIME_AET",
    "STATUS_FULL_TIME_PEN"
  ]);

  return providerStatusValues.some(value =>
    exactProviderTerminal.has(value)
  );
}

function canonicalScore(row) {
  const rawHomeScore = row?.scoreHome ?? row?.homeScore;
  const rawAwayScore = row?.scoreAway ?? row?.awayScore;

  if (
    rawHomeScore === null ||
    rawHomeScore === undefined ||
    rawHomeScore === "" ||
    rawAwayScore === null ||
    rawAwayScore === undefined ||
    rawAwayScore === ""
  ) {
    return null;
  }

  const homeScore = Number(rawHomeScore);
  const awayScore = Number(rawAwayScore);

  if (
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    return null;
  }

  return {
    homeScore,
    awayScore,
    scoreKey: `${homeScore}-${awayScore}`
  };
}

function athensDayFromUtc(value) {
  const raw = clean(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
}

function parseArgs(argv) {
  const out = {
    dayKey: "",
    write: false,
    allFixtures: false,
    offsets: [0],
    valuePath: ""
  };

  for (const arg of argv) {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(arg)) {
      out.dayKey = arg;
      continue;
    }

    if (arg.startsWith("--date=")) {
      out.dayKey = arg.slice("--date=".length);
      continue;
    }

    if (arg === "--write") {
      out.write = true;
      continue;
    }

    if (arg === "--all-fixtures") {
      out.allFixtures = true;
      continue;
    }

    if (arg.startsWith("--offsets=")) {
      out.offsets = arg
        .slice("--offsets=".length)
        .split(",")
        .map(v => Number(v.trim()))
        .filter(Number.isFinite);
      continue;
    }

    if (arg.startsWith("--value-path=")) {
      out.valuePath = arg.slice("--value-path=".length);
      continue;
    }
  }

  return out;
}

function buildTargets(dayKey, { allFixtures = false, valuePathOverride = "" } = {}) {
  const fixturesPath = resolveDataPath("deploy-snapshots", dayKey, "fixtures.json");
  const valuePath = valuePathOverride
    ? path.resolve(valuePathOverride)
    : resolveDataPath("deploy-snapshots", dayKey, "value.json");

  const fixtures = rowsFromPayload(readJsonSafe(fixturesPath, null), ["fixtures", "matches"]);
  const valuePicks = rowsFromPayload(readJsonSafe(valuePath, null), ["picks", "valuePicks", "rows"]);
  const canonicalFixtures = canonicalFixturesForDay(dayKey);

  const canonicalFixtureIds =
    new Set(
      canonicalFixtures
        .map(row =>
          clean(
            row?.canonicalId ||
            row?.matchId,
          ),
        )
        .filter(Boolean),
    );

  const canonicalByKey = indexCanonicalFixtures(canonicalFixtures);

  const fixturesById = new Map();
  for (const fixture of fixtures) {
    const id = rowId(fixture);
    if (id) fixturesById.set(id, fixture);
  }

  const allFixtureRows =
    allFixtures && fixtures.length === 0
      ? canonicalFixtures
      : fixtures;

  const rawTargets =
    allFixtures
      ? allFixtureRows
      : valuePicks;

  const targetSource =
    allFixtures
      ? (
          fixtures.length > 0
            ? "deploy_snapshot_fixtures"
            : "canonical_fixtures_fallback"
        )
      : "deploy_snapshot_value_picks";

  const targetsById = new Map();

  for (const row of rawTargets) {
    const id = rowId(row);
    if (!id) continue;

    const fixture = fixturesById.get(id) || row;
    const canonicalFixture =
      findCanonicalFixture(fixture, canonicalByKey) ||
      findCanonicalFixture(row, canonicalByKey) ||
      canonicalByKey.get(id) ||
      null;

    const canonicalMatchId =
      clean(
        canonicalFixture?.canonicalId
      );

    const targetMatchId =
      canonicalMatchId || id;

    const providerMatchId =
      clean(
        canonicalFixture?.providerMatchId ||
        canonicalFixture?.sourceMatchId ||
        canonicalFixture?.sourceId ||
        (
          id !== targetMatchId
            ? id
            : ""
        )
      );

    const target = {
      matchId: targetMatchId,
      canonicalId:
        canonicalMatchId ||
        targetMatchId,
      providerMatchId,
      leagueSlug:
        leagueSlug(canonicalFixture) ||
        leagueSlug(fixture) ||
        leagueSlug(row),
      leagueName:
        clean(
          canonicalFixture?.leagueName ||
          canonicalFixture?.competitionName ||
          fixture?.leagueName ||
          fixture?.competitionName ||
          row?.leagueName ||
          row?.competitionName
        ),
      country:
        clean(
          canonicalFixture?.country ||
          fixture?.country ||
          row?.country
        ),
      homeTeam:
        homeName(canonicalFixture) ||
        homeName(fixture) ||
        homeName(row),
      awayTeam:
        awayName(canonicalFixture) ||
        awayName(fixture) ||
        awayName(row),
      kickoffUtc:
        clean(
          canonicalFixture?.kickoffUtc ||
          fixture?.kickoffUtc ||
          row?.kickoffUtc
        ),
      source: targetSource,
      canonicalFixture
    };

    if (
      !target.matchId ||
      !target.homeTeam ||
      !target.awayTeam
    ) {
      continue;
    }

    const identity =
      bindProductionResultIdentity(
        target,
        {
          canonicalFixtureIds,
          requireCanonicalMembership:
            true,
        },
      );

    const resolvedTarget =
      identity.managed
        ? identity.row
        : target;

    targetsById.set(
      resolvedTarget.matchId,
      resolvedTarget
    );
  }

  return {
    allFixtures,
    targetSource,
    fixturesPath,
    valuePath,
    fixtureRows: fixtures.length,
    valueRows: valuePicks.length,
    canonicalRows: canonicalFixtures.length,
    targetRowsFromCanonicalFallback:
      allFixtures &&
      fixtures.length === 0
        ? rawTargets.length
        : 0,
    targets: [...targetsById.values()]
  };
}

export function resolveVerifiedFinalExportCompletion({
  write = false,
  conflictCount = 0
} = {}) {
  const conflicts = Math.max(0, Number(conflictCount) || 0);
  const truthComplete = conflicts === 0;
  const conflictsIsolated = write === true && conflicts > 0;

  return {
    ok: truthComplete || conflictsIsolated,
    truthComplete,
    conflictsIsolated
  };
}

export function bindVerifiedFinalResultPayloadIdentity(
  payload,
  options = {},
) {
  return bindVerifiedFinalResultIdentity(
    payload,
    options,
  );
}

function sourceScoreKey(row) {
  return `${Number(row.scoreHome)}-${Number(row.scoreAway)}`;
}

function strictSourceScore(value) {
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

export function isScored(
  row,
  nowMs = Date.now()
) {
  if (row?.finished !== true) return false;
  if (row?.playedFinal !== true) return false;
  if (row?.nonPlayedTerminal === true) return false;

  if (clean(row?.statusCode) !== "3") {
    return false;
  }

  const homeScore =
    strictSourceScore(
      row?.scoreHome
    );

  const awayScore =
    strictSourceScore(
      row?.scoreAway
    );

  if (
    homeScore === null ||
    awayScore === null
  ) {
    return false;
  }

  const kickoffMs = Date.parse(
    clean(row?.kickoffUtc)
  );

  if (
    !Number.isFinite(kickoffMs) ||
    kickoffMs > nowMs
  ) {
    return false;
  }

  return true;
}

export function findExactFlashscorePostponedMatch(
  target,
  sourceRows,
  dayKey
) {
  const canonicalId =
    clean(
      target?.canonicalId ||
      target?.matchId
    );

  const decision =
    resolveApprovedFlashscoreNonPlayedDecision({
      dayKey,
      canonicalId
    });

  if (!decision) {
    return {
      ok: false,
      reason:
        "no_approved_nonplayed_decision",
      candidates: []
    };
  }

  const exactRows = (
    Array.isArray(sourceRows)
      ? sourceRows
      : []
  ).filter(row => {
    if (
      clean(row?.matchId) !==
      decision.providerMatchId
    ) {
      return false;
    }

    if (
      row?.nonPlayedTerminal !== true ||
      row?.playedFinal === true ||
      row?.finished === true
    ) {
      return false;
    }

    if (
      clean(row?.statusCode) !==
        decision
          .requiredProviderEvidence
          .statusCode ||
      clean(
        row?.statusDetailCode
      ) !==
        decision
          .requiredProviderEvidence
          .statusDetailCode
    ) {
      return false;
    }

    if (
      strictSourceScore(
        row?.scoreHome
      ) !== null ||
      strictSourceScore(
        row?.scoreAway
      ) !== null
    ) {
      return false;
    }

    const evidenceDayKey =
      decision.evidenceDayKey ||
      dayKey;

    if (
      athensDayFromUtc(
        row?.kickoffUtc
      ) !== evidenceDayKey
    ) {
      return false;
    }

    if (
      decision.evidenceKickoffUtc &&
      Date.parse(
        clean(row?.kickoffUtc)
      ) !==
        Date.parse(
          decision.evidenceKickoffUtc
        )
    ) {
      return false;
    }

    return true;
  });

  if (exactRows.length !== 1) {
    return {
      ok: false,

      reason:
        exactRows.length === 0
          ? "approved_nonplayed_source_row_missing"
          : "approved_nonplayed_source_row_ambiguous",

      candidates:
        exactRows.map(row => ({
          providerMatchId:
            clean(row?.matchId),

          home:
            clean(row?.home),

          away:
            clean(row?.away),

          kickoffUtc:
            clean(row?.kickoffUtc)
        }))
    };
  }

  return {
    ok: true,
    row: exactRows[0],
    decision,
    matchTier:
      "immutable_decision_exact_provider_id"
  };
}

export function shouldRetractExistingFlashscoreFinal(
  existing,
  target,
  sourceRow,
  decision
) {
  if (
    !existing ||
    existing?.verifiedFinalTruth !== true ||
    !decision
  ) {
    return false;
  }

  const canonicalId =
    clean(
      target?.canonicalId ||
      target?.matchId
    );

  if (
    canonicalId !==
    decision.canonicalId
  ) {
    return false;
  }

  const flashscoreSource =
    Array.isArray(existing?.sources)
      ? existing.sources.find(row =>
          clean(row?.provider)
            .toLowerCase() ===
          "flashscore"
        )
      : null;

  if (!flashscoreSource) {
    return false;
  }

  const existingProviderId =
    clean(
      flashscoreSource
        ?.providerMatchId
    );

  const observedProviderId =
    clean(
      sourceRow?.matchId
    );

  return (
    existingProviderId ===
      decision.providerMatchId &&
    observedProviderId ===
      decision.providerMatchId
  );
}

function findFlashscoreMatch(target, sourceRows, dayKey) {
  // Scored rows on the same Athens day are the only settlement candidates.
  const pool = sourceRows.filter(row => {
    if (!isScored(row)) return false;
    const sourceDay = athensDayFromUtc(row?.kickoffUtc);
    if (sourceDay && sourceDay !== dayKey) return false;
    return true;
  });

  // Tier 1 — exact normalized-name equality (original path; fast, unambiguous).
  let candidates = pool.filter(row =>
    norm(row?.home) === norm(target.homeTeam) &&
    norm(row?.away) === norm(target.awayTeam)
  );
  let matchTier = "exact";

  // Tier 2 (additive) — only when exact matched nothing, fall back to the shared
  // fuzzy identity matcher (token subset + squad-marker safety). This closes the
  // verify false-negatives ("America MG" vs "América Mineiro", "Keflavik" vs
  // "Keflavík ÍF") without ever overriding a clean exact hit. Uniqueness is
  // still required below, so an ambiguous fuzzy hit stays unresolved.
  if (candidates.length === 0) {
    candidates = pool.filter(row =>
      teamPairMatches(target.homeTeam, target.awayTeam, row?.home, row?.away)
    );
    matchTier = "token";
  }

  if (candidates.length !== 1) {
    return {
      ok: false,
      reason: candidates.length === 0 ? "no_exact_flashscore_match" : "ambiguous_exact_flashscore_matches",
      candidates: candidates.map(row => ({
        providerMatchId: clean(row.matchId),
        country: clean(row.country),
        leagueName: clean(row.leagueName),
        leaguePath: clean(row.leaguePath),
        home: clean(row.home),
        away: clean(row.away),
        scoreHome: row.scoreHome ?? null,
        scoreAway: row.scoreAway ?? null,
        kickoffUtc: clean(row.kickoffUtc)
      }))
    };
  }

  return {
    ok: true,
    row: candidates[0],
    matchTier
  };
}

function buildVerifiedFinalResult(dayKey, target, sourceRow) {
  const homeScore = Number(sourceRow.scoreHome);
  const awayScore = Number(sourceRow.scoreAway);
  const scoreKey = `${homeScore}-${awayScore}`;
  const generatedAt = new Date().toISOString();

  return {
    schema: "ai-matchlab.verified-final-result.v1",
    verifiedFinalTruth: true,
    date: dayKey,
    dayKey,
    matchId: target.matchId,
    leagueSlug: target.leagueSlug,
    leagueName: target.leagueName || clean(sourceRow.leagueName),
    country: target.country || clean(sourceRow.country),
    homeTeam: target.homeTeam,
    awayTeam: target.awayTeam,
    homeScore,
    awayScore,
    scoreHome: homeScore,
    scoreAway: awayScore,
    finalScore: {
      homeScore,
      awayScore,
      home: homeScore,
      away: awayScore,
      scoreKey
    },
    scoreKey,
    kickoffUtc: target.kickoffUtc || clean(sourceRow.kickoffUtc),
    finalTruthVerdict: "verified_final_result",
    verdict: "verified_final_result",
    sourceCount: 1,
    independentSourceCount: 1,
    source: "flashscore_same_day_exact_team_match",
    sources: [
      {
        provider: "flashscore",
        providerMatchId: clean(sourceRow.matchId),
        country: clean(sourceRow.country),
        leagueName: clean(sourceRow.leagueName),
        leaguePath: clean(sourceRow.leaguePath),
        home: clean(sourceRow.home),
        away: clean(sourceRow.away),
        scoreHome: homeScore,
        scoreAway: awayScore,
        kickoffUtc: clean(sourceRow.kickoffUtc),
        scoreKey
      }
    ],
    verification: {
      verdict: "verified_final_result",
      finalTruthVerdict: "verified_final_result",
      state: "verified_final_result",
      method: "flashscore_same_day_exact_team_match",
      sourceCount: 1,
      independentSourceCount: 1,
      generatedAt
    },
    settlement: {
      finalTruthVerdict: "verified_final_result",
      state: "verified_final_result"
    },
    generatedAt
  };
}

export function resolveCanonicalEspnFinalFallback(target, dayKey) {
  const row = target?.canonicalFixture;

  if (!row) {
    return { ok: false, reason: "canonical_fixture_missing" };
  }

  if (clean(row?.canonicalId) !== clean(target?.matchId)) {
    return {
      ok: false,
      reason: "canonical_id_mismatch",
      canonicalId: clean(row?.canonicalId)
    };
  }

  if (clean(row?.source).toLowerCase() !== "espn") {
    return {
      ok: false,
      reason: "canonical_source_not_espn",
      source: clean(row?.source)
    };
  }

  const providerMatchId = canonicalEspnProviderId(row);

  if (!providerMatchId) {
    return {
      ok: false,
      reason: "canonical_espn_provider_id_invalid"
    };
  }

  if (!hasCanonicalTerminalStatus(row)) {
    return {
      ok: false,
      reason: "canonical_espn_status_not_terminal",
      status: clean(row?.status)
    };
  }

  if (!hasExplicitEspnTerminalStatus(row)) {
    return {
      ok: false,
      reason: "canonical_espn_not_explicit_terminal",
      status: clean(row?.status),
      rawStatus: clean(row?.rawStatus),
      statusType: clean(row?.statusType),
      operationalState: clean(row?.operationalState)
    };
  }

  const score = canonicalScore(row);

  if (!score) {
    return {
      ok: false,
      reason: "canonical_espn_final_score_invalid"
    };
  }

  if (
    !teamPairMatches(
      target?.homeTeam,
      target?.awayTeam,
      homeName(row),
      awayName(row)
    )
  ) {
    return {
      ok: false,
      reason: "canonical_espn_team_pair_mismatch"
    };
  }

  const canonicalDay = clean(row?.dayKey);

  if (canonicalDay && canonicalDay !== dayKey) {
    return {
      ok: false,
      reason: "canonical_espn_day_key_mismatch",
      canonicalDay
    };
  }

  const kickoffUtc = clean(row?.kickoffUtc);
  const kickoffDay = athensDayFromUtc(kickoffUtc);

  if (!kickoffUtc || !kickoffDay || kickoffDay !== dayKey) {
    return {
      ok: false,
      reason: "canonical_espn_kickoff_day_mismatch",
      kickoffUtc,
      kickoffDay
    };
  }

  const observedAt = clean(row?.lastSeenAt || row?.updatedAt);

  if (!observedAt || Number.isNaN(new Date(observedAt).getTime())) {
    return {
      ok: false,
      reason: "canonical_espn_terminal_observation_missing"
    };
  }

  return {
    ok: true,
    row,
    providerMatchId,
    observedAt,
    ...score
  };
}

export function resolveTerminalScoreConvergence({
  target,
  dayKey,
  flashscoreMatch
} = {}) {
  if (
    !flashscoreMatch?.ok ||
    !flashscoreMatch?.row
  ) {
    return {
      state:
        "flashscore_unavailable",
      reason:
        flashscoreMatch?.reason ||
        "flashscore_match_missing"
    };
  }

  const flashscoreHome =
    exactIntegerScore(
      flashscoreMatch.row?.scoreHome
    );

  const flashscoreAway =
    exactIntegerScore(
      flashscoreMatch.row?.scoreAway
    );

  if (
    flashscoreHome === null ||
    flashscoreAway === null
  ) {
    return {
      state:
        "flashscore_invalid_score",
      reason:
        "flashscore_terminal_score_invalid"
    };
  }

  const flashscoreScoreKey =
    flashscoreHome +
    "-" +
    flashscoreAway;

  const canonicalSource =
    clean(
      target?.canonicalFixture?.source
    ).toLowerCase();

  if (canonicalSource !== "espn") {
    return {
      state:
        "flashscore_only",
      reason:
        "canonical_espn_terminal_unavailable",
      flashscoreHome,
      flashscoreAway,
      flashscoreScoreKey
    };
  }

  const canonical =
    resolveCanonicalEspnFinalFallback(
      target,
      dayKey
    );

  if (!canonical.ok) {
    return {
      state:
        "flashscore_only",
      reason:
        canonical.reason,
      flashscoreHome,
      flashscoreAway,
      flashscoreScoreKey
    };
  }

  if (
    canonical.scoreKey !==
    flashscoreScoreKey
  ) {
    return {
      state:
        "pending_recheck",
      reason:
        "terminal_score_conflict_pending_recheck",
      flashscoreHome,
      flashscoreAway,
      flashscoreScoreKey,
      canonicalHome:
        canonical.homeScore,
      canonicalAway:
        canonical.awayScore,
      canonicalScoreKey:
        canonical.scoreKey,
      canonical
    };
  }

  return {
    state:
      "converged",
    reason:
      "terminal_score_sources_converged",
    flashscoreHome,
    flashscoreAway,
    flashscoreScoreKey,
    canonicalHome:
      canonical.homeScore,
    canonicalAway:
      canonical.awayScore,
    canonicalScoreKey:
      canonical.scoreKey,
    canonical
  };
}

export function buildConvergedVerifiedFinalResult(
  dayKey,
  target,
  flashscoreRow,
  convergence
) {
  const payload =
    buildCanonicalEspnVerifiedFinalResult(
      dayKey,
      target,
      convergence.canonical
    );

  const flashscoreSource = {
    provider:
      "flashscore",
    providerMatchId:
      clean(
        flashscoreRow?.matchId
      ),
    country:
      clean(
        flashscoreRow?.country
      ),
    leagueName:
      clean(
        flashscoreRow?.leagueName
      ),
    leaguePath:
      clean(
        flashscoreRow?.leaguePath
      ),
    home:
      clean(
        flashscoreRow?.home
      ),
    away:
      clean(
        flashscoreRow?.away
      ),
    scoreHome:
      convergence.flashscoreHome,
    scoreAway:
      convergence.flashscoreAway,
    kickoffUtc:
      clean(
        flashscoreRow?.kickoffUtc
      ),
    scoreKey:
      convergence.flashscoreScoreKey
  };

  payload.source =
    "terminal_score_sources_converged";

  payload.sourceCount =
    2;

  payload.independentSourceCount =
    2;

  payload.sources = [
    ...payload.sources,
    flashscoreSource
  ];

  payload.verification = {
    ...payload.verification,

    method:
      "terminal_score_sources_converged",

    sourceCount:
      2,

    independentSourceCount:
      2,

    checks: {
      ...payload.verification?.checks,

      canonicalEspnTerminal:
        true,

      flashscoreSameDayTeamMatch:
        true,

      terminalScoresConverged:
        true
    }
  };

  payload.settlement = {
    ...payload.settlement,

    convergenceRequired:
      true,

    convergenceState:
      "converged"
  };

  return payload;
}

export function buildCanonicalEspnVerifiedFinalResult(
  dayKey,
  target,
  resolved
) {
  const sourceRow = resolved.row;
  const generatedAt = new Date().toISOString();

  return {
    schema: "ai-matchlab.verified-final-result.v1",
    verifiedFinalTruth: true,
    date: dayKey,
    dayKey,
    matchId: target.matchId,
    leagueSlug: target.leagueSlug || leagueSlug(sourceRow),
    leagueName: target.leagueName || clean(sourceRow?.leagueName),
    country: target.country || clean(sourceRow?.country),
    homeTeam: target.homeTeam,
    awayTeam: target.awayTeam,
    homeScore: resolved.homeScore,
    awayScore: resolved.awayScore,
    scoreHome: resolved.homeScore,
    scoreAway: resolved.awayScore,
    finalScore: {
      homeScore: resolved.homeScore,
      awayScore: resolved.awayScore,
      home: resolved.homeScore,
      away: resolved.awayScore,
      scoreKey: resolved.scoreKey
    },
    scoreKey: resolved.scoreKey,
    kickoffUtc: clean(sourceRow?.kickoffUtc),
    finalTruthVerdict: "verified_final_result",
    verdict: "verified_final_result",
    sourceCount: 1,
    independentSourceCount: 1,
    source: "canonical_espn_terminal_final",
    sources: [
      {
        provider: "espn",
        providerMatchId: resolved.providerMatchId,
        canonicalId: clean(sourceRow?.canonicalId),
        leagueName: clean(sourceRow?.leagueName),
        home: homeName(sourceRow),
        away: awayName(sourceRow),
        scoreHome: resolved.homeScore,
        scoreAway: resolved.awayScore,
        kickoffUtc: clean(sourceRow?.kickoffUtc),
        rawStatus: clean(sourceRow?.rawStatus),
        statusType: clean(sourceRow?.statusType),
        terminalObservedAt: resolved.observedAt,
        scoreKey: resolved.scoreKey
      }
    ],
    verification: {
      verdict: "verified_final_result",
      finalTruthVerdict: "verified_final_result",
      state: "verified_final_result",
      method: "canonical_espn_terminal_final",
      authority: "canonical_fixture_store",
      sourceCount: 1,
      independentSourceCount: 1,
      checks: {
        canonicalIdExact: true,
        provider: "espn",
        providerMatchIdValid: true,
        explicitTerminalStatus: true,
        numericNonNegativeScore: true,
        teamPairMatched: true,
        athensDayMatched: true,
        terminalObservationPresent: true,
        flashscoreFinishedMatchAbsent: true
      },
      generatedAt
    },
    settlement: {
      finalTruthVerdict: "verified_final_result",
      state: "verified_final_result"
    },
    generatedAt
  };
}


export function resolveCanonicalFlashscoreFinalFallback(
  target,
  dayKey
) {
  const row =
    target?.canonicalFixture;

  if (!row) {
    return {
      ok: false,
      reason:
        "canonical_fixture_missing"
    };
  }

  if (
    clean(row?.canonicalId) !==
    clean(target?.matchId)
  ) {
    return {
      ok: false,
      reason:
        "canonical_id_mismatch",
      canonicalId:
        clean(row?.canonicalId)
    };
  }

  if (
    clean(row?.source)
      .toLowerCase() !==
    "flashscore"
  ) {
    return {
      ok: false,
      reason:
        "canonical_source_not_flashscore",
      source:
        clean(row?.source)
    };
  }

  const providerMatchId =
    clean(
      row?.sourceMatchId ||
      row?.sourceId
    );

  if (
    !/^[A-Za-z0-9]{6,32}$/u
      .test(providerMatchId)
  ) {
    return {
      ok: false,
      reason:
        "canonical_flashscore_provider_id_invalid"
    };
  }

  if (!hasCanonicalTerminalStatus(row)) {
    return {
      ok: false,
      reason:
        "canonical_flashscore_status_not_terminal",
      status:
        clean(row?.status)
    };
  }

  if (!hasExplicitEspnTerminalStatus(row)) {
    return {
      ok: false,
      reason:
        "canonical_flashscore_not_explicit_terminal",
      status:
        clean(row?.status),
      rawStatus:
        clean(row?.rawStatus),
      statusType:
        clean(row?.statusType),
      operationalState:
        clean(row?.operationalState)
    };
  }

  const score =
    canonicalScore(row);

  if (!score) {
    return {
      ok: false,
      reason:
        "canonical_flashscore_final_score_invalid"
    };
  }

  if (
    !teamPairMatches(
      target?.homeTeam,
      target?.awayTeam,
      homeName(row),
      awayName(row)
    )
  ) {
    return {
      ok: false,
      reason:
        "canonical_flashscore_team_pair_mismatch"
    };
  }

  const canonicalDay =
    clean(row?.dayKey);

  if (
    canonicalDay &&
    canonicalDay !== dayKey
  ) {
    return {
      ok: false,
      reason:
        "canonical_flashscore_day_key_mismatch",
      canonicalDay
    };
  }

  const kickoffUtc =
    clean(row?.kickoffUtc);

  const kickoffDay =
    athensDayFromUtc(kickoffUtc);

  if (
    !kickoffUtc ||
    !kickoffDay ||
    kickoffDay !== dayKey
  ) {
    return {
      ok: false,
      reason:
        "canonical_flashscore_kickoff_day_mismatch",
      kickoffUtc,
      kickoffDay
    };
  }

  const observedAt =
    clean(
      row?.lastSeenAt ||
      row?.updatedAt
    );

  if (
    !observedAt ||
    Number.isNaN(
      new Date(observedAt).getTime()
    )
  ) {
    return {
      ok: false,
      reason:
        "canonical_flashscore_terminal_observation_missing"
    };
  }

  return {
    ok: true,
    row,
    providerMatchId,
    observedAt,
    ...score
  };
}

export function buildCanonicalFlashscoreVerifiedFinalResult(
  dayKey,
  target,
  resolved
) {
  const sourceRow =
    resolved.row;

  const generatedAt =
    new Date().toISOString();

  return {
    schema:
      "ai-matchlab.verified-final-result.v1",

    verifiedFinalTruth: true,
    date: dayKey,
    dayKey,

    matchId:
      target.matchId,

    leagueSlug:
      target.leagueSlug ||
      leagueSlug(sourceRow),

    leagueName:
      target.leagueName ||
      clean(sourceRow?.leagueName),

    country:
      target.country ||
      clean(sourceRow?.country),

    homeTeam:
      target.homeTeam,

    awayTeam:
      target.awayTeam,

    homeScore:
      resolved.homeScore,

    awayScore:
      resolved.awayScore,

    scoreHome:
      resolved.homeScore,

    scoreAway:
      resolved.awayScore,

    finalScore: {
      homeScore:
        resolved.homeScore,

      awayScore:
        resolved.awayScore,

      home:
        resolved.homeScore,

      away:
        resolved.awayScore,

      scoreKey:
        resolved.scoreKey
    },

    scoreKey:
      resolved.scoreKey,

    kickoffUtc:
      clean(sourceRow?.kickoffUtc),

    finalTruthVerdict:
      "verified_final_result",

    verdict:
      "verified_final_result",

    sourceCount: 1,
    independentSourceCount: 1,

    source:
      "canonical_flashscore_terminal_final",

    sources: [
      {
        provider:
          "flashscore",

        providerMatchId:
          resolved.providerMatchId,

        canonicalId:
          clean(
            sourceRow?.canonicalId
          ),

        leagueName:
          clean(
            sourceRow?.leagueName
          ),

        home:
          homeName(sourceRow),

        away:
          awayName(sourceRow),

        scoreHome:
          resolved.homeScore,

        scoreAway:
          resolved.awayScore,

        kickoffUtc:
          clean(
            sourceRow?.kickoffUtc
          ),

        rawStatus:
          clean(
            sourceRow?.rawStatus
          ),

        statusType:
          clean(
            sourceRow?.statusType
          ),

        terminalObservedAt:
          resolved.observedAt,

        scoreKey:
          resolved.scoreKey
      }
    ],

    verification: {
      verdict:
        "verified_final_result",

      finalTruthVerdict:
        "verified_final_result",

      state:
        "verified_final_result",

      method:
        "canonical_flashscore_terminal_final",

      authority:
        "canonical_fixture_store",

      sourceCount: 1,
      independentSourceCount: 1,

      checks: {
        canonicalIdExact: true,
        provider:
          "flashscore",

        providerMatchIdValid: true,
        explicitTerminalStatus: true,
        numericNonNegativeScore: true,
        teamPairMatched: true,
        athensDayMatched: true,
        terminalObservationPresent: true,
        liveFlashscoreScoredMatchAbsent: true
      },

      generatedAt
    },

    settlement: {
      finalTruthVerdict:
        "verified_final_result",

      state:
        "verified_final_result"
    },

    generatedAt
  };
}

export function hasCanonicalPreKickoffNonPlayedVeto(target) {
  return verifiedFinalVetoReason(
    target?.canonicalFixture ||
    null
  ) !== null;
}


function exactIntegerScore(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number >= 0
  )
    ? number
    : null;
}

function artifactScore(existing) {
  const home =
    exactIntegerScore(
      existing?.homeScore ??
      existing?.scoreHome ??
      existing?.finalScore?.homeScore ??
      existing?.finalScore?.home
    );

  const away =
    exactIntegerScore(
      existing?.awayScore ??
      existing?.scoreAway ??
      existing?.finalScore?.awayScore ??
      existing?.finalScore?.away
    );

  if (
    home === null ||
    away === null
  ) {
    return null;
  }

  const expectedKey =
    home + "-" + away;

  const declaredKeys = [
    clean(existing?.scoreKey),
    clean(existing?.finalScore?.scoreKey),
    clean(existing?.sources?.[0]?.scoreKey)
  ].filter(Boolean);

  if (
    declaredKeys.some(
      value => value !== expectedKey
    )
  ) {
    return null;
  }

  return {
    homeScore: home,
    awayScore: away,
    scoreKey: expectedKey
  };
}

function isExactFlashscoreVerifiedArtifact(
  existing,
  target,
  dayKey
) {
  if (
    !existing ||
    existing?.verifiedFinalTruth !== true ||
    clean(existing?.source) !==
      "flashscore_same_day_exact_team_match" ||
    clean(existing?.dayKey) !==
      clean(dayKey) ||
    clean(existing?.matchId) !==
      clean(target?.matchId)
  ) {
    return false;
  }

  const sources =
    Array.isArray(existing?.sources)
      ? existing.sources
      : [];

  if (
    sources.length !== 1 ||
    clean(sources[0]?.provider)
      .toLowerCase() !==
      "flashscore" ||
    !clean(sources[0]?.providerMatchId)
  ) {
    return false;
  }

  if (
    !teamPairMatches(
      target?.homeTeam,
      target?.awayTeam,
      existing?.homeTeam,
      existing?.awayTeam
    ) ||
    !teamPairMatches(
      target?.homeTeam,
      target?.awayTeam,
      sources[0]?.home,
      sources[0]?.away
    )
  ) {
    return false;
  }

  const existingKickoff =
    clean(existing?.kickoffUtc);

  const targetKickoff =
    clean(target?.kickoffUtc);

  if (
    !existingKickoff ||
    !targetKickoff ||
    Number.isNaN(
      new Date(existingKickoff).getTime()
    ) ||
    Number.isNaN(
      new Date(targetKickoff).getTime()
    ) ||
    new Date(existingKickoff).getTime() !==
      new Date(targetKickoff).getTime()
  ) {
    return false;
  }

  return artifactScore(existing) !== null;
}

function hasExactFinalPenaltyStatus(row) {
  return [
    row?.rawStatus,
    row?.statusType,
    row?.operationalState
  ].some(
    value =>
      clean(value).toUpperCase() ===
      "STATUS_FINAL_PEN"
  );
}

export function resolvePenaltyWinnerMarkerConflict({
  existing,
  target,
  candidatePayload,
  dayKey
} = {}) {
  if (
    !isExactFlashscoreVerifiedArtifact(
      existing,
      target,
      dayKey
    )
  ) {
    return {
      ok: false,
      reason:
        "existing_not_exact_flashscore_verified_artifact"
    };
  }

  const canonical =
    target?.canonicalFixture ||
    null;

  if (
    !canonical ||
    clean(canonical?.source)
      .toLowerCase() !==
      "espn" ||
    !hasExactFinalPenaltyStatus(canonical)
  ) {
    return {
      ok: false,
      reason:
        "canonical_not_exact_espn_final_pen"
    };
  }

  const resolved =
    resolveCanonicalEspnFinalFallback(
      target,
      dayKey
    );

  if (!resolved.ok) {
    return {
      ok: false,
      reason:
        "canonical_espn_resolution_failed",
      canonicalReason:
        resolved.reason
    };
  }

  if (
    resolved.homeScore !==
      resolved.awayScore
  ) {
    return {
      ok: false,
      reason:
        "canonical_final_pen_score_not_tied"
    };
  }

  if (
    !candidatePayload ||
    clean(candidatePayload?.scoreKey) !==
      resolved.scoreKey
  ) {
    return {
      ok: false,
      reason:
        "candidate_score_disagrees_with_canonical"
    };
  }

  const previous =
    artifactScore(existing);

  if (!previous) {
    return {
      ok: false,
      reason:
        "existing_score_invalid"
    };
  }

  const homeWinnerMarker =
    previous.homeScore ===
      resolved.homeScore + 1 &&
    previous.awayScore ===
      resolved.awayScore;

  const awayWinnerMarker =
    previous.homeScore ===
      resolved.homeScore &&
    previous.awayScore ===
      resolved.awayScore + 1;

  if (
    !homeWinnerMarker &&
    !awayWinnerMarker
  ) {
    return {
      ok: false,
      reason:
        "existing_score_not_single_penalty_winner_marker"
    };
  }

  const replacementPayload =
    buildCanonicalEspnVerifiedFinalResult(
      dayKey,
      target,
      resolved
    );

  replacementPayload.verification = {
    ...replacementPayload.verification,

    method:
      "canonical_espn_final_pen_score_correction",

    checks: {
      ...replacementPayload.verification.checks,

      explicitFinalPenaltyStatus:
        true,

      canonicalTiedScore:
        true,

      existingExactFlashscoreArtifact:
        true,

      singlePenaltyWinnerMarkerRemoved:
        true
    },

    replacedArtifact: {
      source:
        clean(existing?.source),

      provider:
        clean(
          existing?.sources?.[0]?.provider
        ),

      providerMatchId:
        clean(
          existing?.sources?.[0]
            ?.providerMatchId
        ),

      scoreKey:
        previous.scoreKey
    }
  };

  replacementPayload.source =
    "canonical_espn_final_pen_score_correction";

  replacementPayload.settlement = {
    ...replacementPayload.settlement,

    scoreSemantics:
      "played_score_excluding_penalty_shootout"
  };

  return {
    ok: true,

    reason:
      "single_penalty_winner_marker_replaced",

    previousScore:
      previous,

    canonicalScore: {
      homeScore:
        resolved.homeScore,

      awayScore:
        resolved.awayScore,

      scoreKey:
        resolved.scoreKey
    },

    replacementPayload
  };
}

export async function exportVerifiedFinalResultsDay(dayKey, options = {}) {
  const safeDayKey = clean(dayKey);

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(safeDayKey)) {
    return { ok: false, reason: "invalid_day_key", dayKey };
  }

  const targetSource = buildTargets(safeDayKey, {
    allFixtures: options.allFixtures === true,
    valuePathOverride: options.valuePath || ""
  });

  const feed = await fetchFlashscoreFixtures({
    offsets: Array.isArray(options.offsets) && options.offsets.length ? options.offsets : [0]
  });

  const sourceRows = Array.isArray(feed?.rows) ? feed.rows : [];
  const outputDir = resolveDataPath("final-results", safeDayKey);

  const written = [];
  const wouldWrite = [];
  const existingRows = [];
  const unresolved = [];
  const conflicts = [];
  const terminalScoreRevisionCandidates = new Map();
  const correctedPenaltyScores = [];
  const wouldCorrectPenaltyScores = [];
  const wouldRetract = [];
  const retracted = [];
  const retractionBlocked = [];

  for (const target of targetSource.targets) {
    const canonicalVetoReason =
      verifiedFinalVetoReason(
        target?.canonicalFixture ||
        null
      );

    const found = canonicalVetoReason
      ? {
          ok: false,
          reason: canonicalVetoReason
        }
      : findFlashscoreMatch(target, sourceRows, safeDayKey);

    let payload = null;
    let resolutionMethod = "";
    let fallbackReason = "";

    if (found.ok) {
      const convergence =
        resolveTerminalScoreConvergence({
          target,
          dayKey:
            safeDayKey,
          flashscoreMatch:
            found
        });

      if (
        convergence.state ===
        "pending_recheck"
      ) {
        const pendingFilePath =
          path.join(
            outputDir,
            `${target.matchId}.json`
          );

        const pendingExisting =
          readJsonSafe(
            pendingFilePath,
            null
          );

        let retraction =
          null;

        if (
          pendingExisting &&
          isExactFlashscoreVerifiedArtifact(
            pendingExisting,
            target,
            safeDayKey
          )
        ) {
          const previousScore =
            artifactScore(
              pendingExisting
            );

          const retractionRow = {
            matchId:
              target.matchId,

            homeTeam:
              target.homeTeam,

            awayTeam:
              target.awayTeam,

            filePath:
              pendingFilePath,

            evidence:
              "terminal_score_conflict_pending_recheck",

            previousScore:
              previousScore?.scoreKey ||
              null
          };

          if (options.write === true) {
            fs.unlinkSync(
              pendingFilePath
            );

            retracted.push(
              retractionRow
            );

            retraction =
              "retracted";
          } else {
            wouldRetract.push(
              retractionRow
            );

            retraction =
              "would_retract";
          }
        }

        unresolved.push({
          matchId:
            target.matchId,

          homeTeam:
            target.homeTeam,

          awayTeam:
            target.awayTeam,

          reason:
            convergence.reason,

          recheckRequired:
            true,

          retryPolicy:
            "next_intraday_export_run",

          flashscore: {
            providerMatchId:
              clean(
                found.row?.matchId
              ),

            scoreKey:
              convergence
                .flashscoreScoreKey
          },

          canonical: {
            provider:
              "espn",

            providerMatchId:
              convergence
                .canonical
                ?.providerMatchId ||
              null,

            scoreKey:
              convergence
                .canonicalScoreKey
          },

          retraction
        });

        continue;
      }

      if (
        convergence.state ===
        "converged"
      ) {
        payload =
          buildConvergedVerifiedFinalResult(
            safeDayKey,
            target,
            found.row,
            convergence
          );

        resolutionMethod =
          "terminal_score_sources_converged";
      } else {
        payload =
          buildVerifiedFinalResult(
            safeDayKey,
            target,
            found.row
          );

        resolutionMethod =
          "flashscore_same_day_exact_team_match";
      }
    } else if (
      found.reason ===
      "no_exact_flashscore_match"
    ) {
      const canonicalSource =
        clean(
          target?.canonicalFixture
            ?.source
        ).toLowerCase();

      let fallback = {
        ok: false,
        reason:
          "canonical_source_unsupported"
      };

      if (canonicalSource === "espn") {
        fallback =
          resolveCanonicalEspnFinalFallback(
            target,
            safeDayKey
          );

        if (fallback.ok) {
          payload =
            buildCanonicalEspnVerifiedFinalResult(
              safeDayKey,
              target,
              fallback
            );

          resolutionMethod =
            "canonical_espn_terminal_final";
        }
      }
      else if (
        canonicalSource ===
        "flashscore"
      ) {
        fallback =
          resolveCanonicalFlashscoreFinalFallback(
            target,
            safeDayKey
          );

        if (fallback.ok) {
          payload =
            buildCanonicalFlashscoreVerifiedFinalResult(
              safeDayKey,
              target,
              fallback
            );

          resolutionMethod =
            "canonical_flashscore_terminal_final";
        }
      }

      if (!fallback.ok) {
        fallbackReason =
          fallback.reason;
      }
    }

    if (payload) {
      payload =
        bindVerifiedFinalResultPayloadIdentity(
          payload,
        );
    }

    if (!payload) {
      const postponed =
        findExactFlashscorePostponedMatch(
          target,
          sourceRows,
          safeDayKey
        );

      const staleFilePath =
        path.join(
          outputDir,
          `${target.matchId}.json`
        );

      const staleExisting =
        readJsonSafe(
          staleFilePath,
          null
        );

      let retraction = null;

      if (postponed.ok && staleExisting) {
        const retractable =
          shouldRetractExistingFlashscoreFinal(
            staleExisting,
            target,
            postponed.row,
            postponed.decision
          );

        const row = {
          matchId:
            target.matchId,

          homeTeam:
            target.homeTeam,

          awayTeam:
            target.awayTeam,

          providerMatchId:
            clean(
              postponed.row?.matchId
            ),

          evidence:
            "approved_flashscore_nonplayed_decision",

          decisionId:
            postponed
              .decision
              .decisionId,

          filePath:
            staleFilePath
        };

        if (!retractable) {
          retractionBlocked.push(row);

          conflicts.push({
            ...row,
            type:
              "verified_final_retraction_blocked",
            reason:
              "existing_final_not_exact_flashscore_artifact"
          });

          retraction = "blocked";
        } else if (options.write === true) {
          fs.unlinkSync(staleFilePath);
          retracted.push(row);
          retraction = "retracted";
        } else {
          wouldRetract.push(row);
          retraction = "would_retract";
        }
      }

      unresolved.push({
        matchId: target.matchId,
        homeTeam: target.homeTeam,
        awayTeam: target.awayTeam,

        reason:
          postponed.ok
            ? "flashscore_exact_postponed_non_played"
            : found.reason,

        candidates:
          postponed.ok
            ? [
                {
                  providerMatchId:
                    clean(
                      postponed.row?.matchId
                    ),

                  home:
                    clean(
                      postponed.row?.home
                    ),

                  away:
                    clean(
                      postponed.row?.away
                    ),

                  kickoffUtc:
                    clean(
                      postponed.row?.kickoffUtc
                    )
                }
              ]
            : found.candidates,

        canonicalFallbackReason:
          fallbackReason || null,

        retraction
      });

      continue;
    }

    const filePath = path.join(outputDir, `${target.matchId}.json`);
    const existing = readJsonSafe(filePath, null);

    const row = {
      matchId: target.matchId,
      homeTeam: target.homeTeam,
      awayTeam: target.awayTeam,
      scoreKey: payload.scoreKey,
      provider: clean(payload?.sources?.[0]?.provider),
      providerMatchId: clean(payload?.sources?.[0]?.providerMatchId),
      resolutionMethod,
      filePath
    };

    if (existing) {
      const existingScore = clean(existing.scoreKey || existing?.finalScore?.scoreKey || `${existing.homeScore ?? existing.scoreHome}-${existing.awayScore ?? existing.scoreAway}`);
      if (existingScore && existingScore !== payload.scoreKey) {
        const penaltyCorrection =
          resolvePenaltyWinnerMarkerConflict({
            existing,
            target,
            candidatePayload:
              payload,
            dayKey:
              safeDayKey
          });

        if (penaltyCorrection.ok) {
          const correctionRow = {
            ...row,

            previousScore:
              penaltyCorrection
                .previousScore
                .scoreKey,

            correctedScore:
              penaltyCorrection
                .canonicalScore
                .scoreKey,

            correctionReason:
              penaltyCorrection.reason
          };

          if (options.write === true) {
            writeJsonPretty(
              filePath,
              penaltyCorrection
                .replacementPayload
            );

            correctedPenaltyScores.push(
              correctionRow
            );
          } else {
            wouldCorrectPenaltyScores.push(
              correctionRow
            );
          }

          continue;
        }

        const conflictRow = {
          matchId: target.matchId,
          homeTeam: target.homeTeam,
          awayTeam: target.awayTeam,
          existingScore,
          newScore: payload.scoreKey,
          provider: row.provider || null,
          providerMatchId: row.providerMatchId || null,
          filePath,
          penaltyCorrectionReason:
            penaltyCorrection.reason,
          autoCorrectionEligible:
            isAutoCorrectableFlashscoreRevision({
              existingArtifact: existing,
              target,
              candidatePayload: payload
            })
        };

        conflicts.push(conflictRow);
        terminalScoreRevisionCandidates.set(
          target.matchId,
          {
            existingArtifact: existing,
            target,
            candidatePayload: payload,
            conflictRow
          }
        );
        continue;
      }

      existingRows.push({
        ...row,
        existingScore: existingScore || payload.scoreKey
      });
      continue;
    }

    if (options.write === true) {
      writeJsonPretty(filePath, payload);
      written.push(row);
    } else {
      wouldWrite.push(row);
    }
  }

  let finalScoreConflictBacklog = null;
  let finalScoreConflictBacklogPath = null;
  const correctedTerminalScores = [];
  const wouldCorrectTerminalScores = [];
  const correctedTerminalIds = new Set();

  if (targetSource.allFixtures) {
    finalScoreConflictBacklogPath = resolveDataPath(
      "final-result-conflicts",
      `${safeDayKey}.json`
    );

    const previousBacklog = readJsonSafe(
      finalScoreConflictBacklogPath,
      null
    );
    const revisionNowMs = Date.now();

    finalScoreConflictBacklog = buildFinalScoreConflictBacklog({
      dayKey: safeDayKey,
      previousBacklog,
      conflicts,
      nowMs: revisionNowMs
    });

    for (const entry of finalScoreConflictBacklog.activeConflicts) {
      if (entry.state !== "READY_FOR_AUTO_CORRECTION") continue;

      const candidate = terminalScoreRevisionCandidates.get(entry.matchId);
      if (!candidate) continue;
      if (!isAutoCorrectableFlashscoreRevision(candidate)) continue;

      const replacementPayload = buildAutoCorrectedFinalPayload(
        candidate.candidatePayload,
        candidate.existingArtifact,
        entry,
        revisionNowMs
      );
      const correctionRow = {
        matchId: entry.matchId,
        homeTeam: entry.homeTeam,
        awayTeam: entry.awayTeam,
        previousScore: entry.existingScore,
        correctedScore: entry.newScore,
        provider: entry.provider,
        providerMatchId: entry.providerMatchId,
        observationCount: entry.observationCount,
        stableForMs: entry.stableForMs,
        filePath: candidate.conflictRow.filePath,
        correctionReason: "stable_same_provider_terminal_revision"
      };

      if (options.write === true) {
        writeJsonPretty(candidate.conflictRow.filePath, replacementPayload);
        correctedTerminalScores.push(correctionRow);
        correctedTerminalIds.add(entry.matchId);
      } else {
        wouldCorrectTerminalScores.push(correctionRow);
      }
    }

    if (correctedTerminalScores.length > 0) {
      finalScoreConflictBacklog = markBacklogAutoCorrected(
        finalScoreConflictBacklog,
        correctedTerminalScores,
        revisionNowMs
      );
    }

    if (options.write === true) {
      writeJsonPretty(
        finalScoreConflictBacklogPath,
        finalScoreConflictBacklog
      );
    }
  }

  const remainingConflicts = conflicts.filter(
    row => !correctedTerminalIds.has(row.matchId)
  );
  const completion = resolveVerifiedFinalExportCompletion({
    write: options.write === true,
    conflictCount: remainingConflicts.length
  });

  return {
    ok: completion.ok,
    truthComplete: completion.truthComplete,
    conflictsIsolated: completion.conflictsIsolated,
    stage: options.write === true
      ? "verified_final_results_export_completed"
      : "verified_final_results_export_dry_run",
    dayKey: safeDayKey,
    generatedAt: new Date().toISOString(),
    mode: targetSource.allFixtures ? "all_fixtures" : "value_picks",
    inputs: {
      targetSource: targetSource.targetSource,
      fixturesPath: targetSource.fixturesPath,
      valuePath: targetSource.valuePath,
      offsets: options.offsets || [0]
    },
    summary: {
      fixtureRows: targetSource.fixtureRows,
      valueRows: targetSource.valueRows,
      canonicalRows: targetSource.canonicalRows,
      targetRows: targetSource.targets.length,
      targetRowsFromCanonicalFallback:
        targetSource.targetRowsFromCanonicalFallback,
      flashscoreRows: sourceRows.length,
      flashscoreRowsWithScore: sourceRows.filter(isScored).length,
      wouldWrite: wouldWrite.length,
      written: written.length,
      existing: existingRows.length,
      wouldRetract: wouldRetract.length,
      retracted: retracted.length,
      retractionBlocked: retractionBlocked.length,
      unresolved: unresolved.length,
      conflictsDetected: conflicts.length,
      conflicts: remainingConflicts.length,
      correctedTerminalScores:
        correctedTerminalScores.length,
      wouldCorrectTerminalScores:
        wouldCorrectTerminalScores.length,
      correctedPenaltyScores:
        correctedPenaltyScores.length,
      wouldCorrectPenaltyScores:
        wouldCorrectPenaltyScores.length,
      canonicalEspnFallbackWouldWrite: wouldWrite.filter(
        row => row.resolutionMethod === "canonical_espn_terminal_final"
      ).length,
      canonicalEspnFallbackWritten: written.filter(
        row => row.resolutionMethod === "canonical_espn_terminal_final"
      ).length,
      canonicalEspnFallbackExisting: existingRows.filter(
        row => row.resolutionMethod === "canonical_espn_terminal_final"
      ).length
    },
    wouldWrite,
    written,
    existing: existingRows,
    wouldRetract,
    retracted,
    retractionBlocked,
    unresolved,
    conflicts: remainingConflicts,
    detectedConflicts: conflicts,
    correctedPenaltyScores,
    wouldCorrectPenaltyScores,
    correctedTerminalScores,
    wouldCorrectTerminalScores,
    finalScoreConflictBacklog: finalScoreConflictBacklog
      ? {
          path: finalScoreConflictBacklogPath,
          persisted: options.write === true,
          summary: finalScoreConflictBacklog.summary,
          policyVersion: finalScoreConflictBacklog.policyVersion
        }
      : null,
    guarantees: {
      canonicalWrites: 0,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultsWrites: options.write === true,
      perMatchScoreConflictIsolation: true,
      scoreConflictBacklogPersistentOnAllFixturesWrite:
        targetSource.allFixtures && options.write === true,
      unresolvedScoreConflictNeverOverwritesVerifiedFinal: true,
      requiresExactTeamPairMatch: true,
      requiresNumericScore: true,
      canonicalEspnFallback: {
        sourceMustBeEspn: true,
        canonicalIdMustMatch: true,
        providerMatchIdMustBeNumeric: true,
        explicitTerminalStatusRequired: true,
        numericNonNegativeScoreRequired: true,
        teamPairMatchRequired: true,
        athensDayMatchRequired: true,
        terminalObservationRequired: true,
        allowedOnlyWhenFlashscoreFinishedMatchAbsent: true
      },
      acceptedFinalTruthVerdict: "verified_final_result"
    }
  };
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.dayKey) {
    console.error(JSON.stringify({
      ok: false,
      reason: "missing_day",
      usage: "node engine-v1/jobs/export-verified-final-results-day.js --date=YYYY-MM-DD [--write] [--all-fixtures] [--offsets=0,-1] [--value-path=data/value-plans/YYYY-MM-DD/plan-b.json]"
    }, null, 2));
    process.exitCode = 2;
  } else {
    exportVerifiedFinalResultsDay(args.dayKey, args)
      .then(result => {
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) process.exitCode = 1;
      })
      .catch(error => {
        console.error(error);
        process.exitCode = 1;
      });
  }
}
