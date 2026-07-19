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
  const canonicalByKey = indexCanonicalFixtures(canonicalFixtures);

  const fixturesById = new Map();
  for (const fixture of fixtures) {
    const id = rowId(fixture);
    if (id) fixturesById.set(id, fixture);
  }

  const rawTargets = allFixtures ? fixtures : valuePicks;

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

    const target = {
      matchId: id,
      leagueSlug: leagueSlug(fixture) || leagueSlug(row),
      leagueName: clean(fixture?.leagueName || fixture?.competitionName || row?.leagueName || row?.competitionName),
      country: clean(fixture?.country || row?.country),
      homeTeam: homeName(fixture) || homeName(row),
      awayTeam: awayName(fixture) || awayName(row),
      kickoffUtc: clean(fixture?.kickoffUtc || row?.kickoffUtc),
      source: allFixtures ? "deploy_snapshot_fixtures" : "deploy_snapshot_value_picks",
      canonicalFixture
    };

    if (!target.homeTeam || !target.awayTeam) continue;
    targetsById.set(id, target);
  }

  return {
    fixturesPath,
    valuePath,
    fixtureRows: fixtures.length,
    valueRows: valuePicks.length,
    canonicalRows: canonicalFixtures.length,
    targets: [...targetsById.values()]
  };
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

    return (
      athensDayFromUtc(
        row?.kickoffUtc
      ) === dayKey
    );
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
  const wouldRetract = [];
  const retracted = [];
  const retractionBlocked = [];

  for (const target of targetSource.targets) {
    const found = findFlashscoreMatch(target, sourceRows, safeDayKey);

    let payload = null;
    let resolutionMethod = "";
    let fallbackReason = "";

    if (found.ok) {
      payload = buildVerifiedFinalResult(safeDayKey, target, found.row);
      resolutionMethod = "flashscore_same_day_exact_team_match";
    } else if (found.reason === "no_exact_flashscore_match") {
      const fallback = resolveCanonicalEspnFinalFallback(target, safeDayKey);

      if (fallback.ok) {
        payload = buildCanonicalEspnVerifiedFinalResult(
          safeDayKey,
          target,
          fallback
        );
        resolutionMethod = "canonical_espn_terminal_final";
      } else {
        fallbackReason = fallback.reason;
      }
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
        conflicts.push({
          matchId: target.matchId,
          existingScore,
          newScore: payload.scoreKey,
          filePath
        });
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

  return {
    ok: conflicts.length === 0,
    stage: options.write === true
      ? "verified_final_results_export_completed"
      : "verified_final_results_export_dry_run",
    dayKey: safeDayKey,
    generatedAt: new Date().toISOString(),
    mode: targetSource.allFixtures ? "all_fixtures" : "value_picks",
    inputs: {
      fixturesPath: targetSource.fixturesPath,
      valuePath: targetSource.valuePath,
      offsets: options.offsets || [0]
    },
    summary: {
      fixtureRows: targetSource.fixtureRows,
      valueRows: targetSource.valueRows,
      canonicalRows: targetSource.canonicalRows,
      targetRows: targetSource.targets.length,
      flashscoreRows: sourceRows.length,
      flashscoreRowsWithScore: sourceRows.filter(isScored).length,
      wouldWrite: wouldWrite.length,
      written: written.length,
      existing: existingRows.length,
      wouldRetract: wouldRetract.length,
      retracted: retracted.length,
      retractionBlocked: retractionBlocked.length,
      unresolved: unresolved.length,
      conflicts: conflicts.length,
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
    conflicts,
    guarantees: {
      canonicalWrites: 0,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultsWrites: options.write === true,
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
