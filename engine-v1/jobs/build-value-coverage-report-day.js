import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { athensDayKey } from "../core/daykey.js";
import { buildMatchIntelligence } from "../core/build-match-intelligence.js";
import {
  evaluateMatchValue,
  loadValueIndexes,
  loadModelPriors
} from "../core/value-engine-v1.js";
import { getFixturesByDay } from "../storage/json-db.js";
import { resolveDataPath } from "../storage/data-root.js";
import { currentSeason } from "../core/season.js";

const DEFAULT_SEASON = currentSeason();

function readJsonSafe(file, fallback = null) {
  try {
    if (!fsSync.existsSync(file)) return fallback;
    return JSON.parse(fsSync.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readDeploySnapshotFixturesByDay(dayKey) {
  const filePath = resolveDataPath("deploy-snapshots", dayKey, "fixtures.json");
  const payload = readJsonSafe(filePath, null);
  const rows = Array.isArray(payload?.fixtures)
    ? payload.fixtures
    : Array.isArray(payload)
      ? payload
      : [];

  return rows
    .filter(row => String(row?.dayKey || row?.date || "").slice(0, 10) === String(dayKey))
    .sort((a, b) => String(a.kickoffUtc || a.kickoff || "").localeCompare(String(b.kickoffUtc || b.kickoff || "")));
}

function readDetailsForValueCoverage(dayKey, matchId) {
  const canonicalFile = resolveDataPath("details", dayKey, `${matchId}.json`);
  const canonical = readJsonSafe(canonicalFile, null);

  if (canonical) {
    return canonical;
  }

  const snapshotFile = resolveDataPath("deploy-snapshots", dayKey, "details", `${matchId}.json`);
  return readJsonSafe(snapshotFile, null);
}

function isPlayable(match) {
  if (!match) return false;
  if (!match.homeTeam || !match.awayTeam) return false;
  if (!match.kickoffUtc) return false;

  const status = String(match.status || "").toUpperCase();
  if (status.includes("POSTPONED")) return false;
  if (status.includes("CANCELLED")) return false;

  return true;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function classifyMinimumSample(sample) {
  const minRequired = safeNumber(sample?.minRequiredRecentMatches, 3);
  const homeBelowMin = safeNumber(sample?.homeBlendedSample, 0) < minRequired;
  const awayBelowMin = safeNumber(sample?.awayBlendedSample, 0) < minRequired;
  const homeHasPrior = safeNumber(sample?.homePriorSample, 0) > 0;
  const awayHasPrior = safeNumber(sample?.awayPriorSample, 0) > 0;
  const homeHasRaw = safeNumber(sample?.homeRawSample, 0) > 0;
  const awayHasRaw = safeNumber(sample?.awayRawSample, 0) > 0;

  if (homeBelowMin && awayBelowMin && !homeHasRaw && !awayHasRaw && !homeHasPrior && !awayHasPrior) {
    return "missing_both_team_history_and_priors";
  }

  if ((homeBelowMin && !homeHasRaw && !homeHasPrior) || (awayBelowMin && !awayHasRaw && !awayHasPrior)) {
    return "missing_team_history_and_prior";
  }

  if ((homeBelowMin && homeHasPrior) || (awayBelowMin && awayHasPrior)) {
    return "low_recent_sample_prior_backed";
  }

  if (homeBelowMin || awayBelowMin) {
    return "low_recent_sample";
  }

  return "unknown_minimum_sample_null";
}

function countBy(rows, keyFn) {
  const out = {};

  for (const row of rows) {
    const key = keyFn(row);
    out[key] = Number(out[key] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  );
}

function buildMarketRejectionDiagnostics(value) {
  if (!value) return null;

  const signals = Array.isArray(value?.signals) ? value.signals : [];
  const hasSignal = (name) => signals.includes(name);
  const hasAnySignal = (names) => names.some(name => hasSignal(name));

  const confidence = Number(value?.confidence ?? 0);
  const expectedTotalGoals = Number(value?.meta?.expectedTotalGoals ?? 0);

  const over15 = Number(value?.over15Score ?? -1);
  const over25 = Number(value?.over25Score ?? -1);
  const over35 = Number(value?.over35Score ?? -1);
  const btts = Number(value?.bttsScore ?? -1);

  const homeWinScore = Number(value?.homeWinScore ?? -1);
  const drawScore = Number(value?.drawScore ?? -1);
  const awayWinScore = Number(value?.awayWinScore ?? -1);

  const hasGoalSupport = hasAnySignal([
    "over25_support",
    "mutual_attack_profile",
    "matchup_goals_history",
    "ai_h2h_overlean"
  ]);

  const hasStrongGoalSupport = hasAnySignal([
    "mutual_attack_profile",
    "matchup_goals_history",
    "ai_h2h_overlean"
  ]);

  const hasBttsSupport = hasAnySignal([
    "btts_support",
    "mutual_attack_profile"
  ]);

  const hasGoalsBlocker = hasAnySignal([
    "defensive_profile",
    "under25_lean"
  ]);

  const hasBttsBlocker = hasAnySignal([
    "defensive_profile",
    "btts_no_lean",
    "under25_lean"
  ]);

  const diagnostics = {};

  const homeAwayFinite = Number.isFinite(homeWinScore) && Number.isFinite(awayWinScore);
  const bestSide = homeAwayFinite && homeWinScore >= awayWinScore ? "HOME" : homeAwayFinite ? "AWAY" : null;
  const best1x2 = homeAwayFinite ? Math.max(homeWinScore, awayWinScore) : null;
  const second1x2 = homeAwayFinite ? Math.min(homeWinScore, awayWinScore) : null;
  const gap1x2 = homeAwayFinite ? best1x2 - second1x2 : null;

  const sideHasNegativeFormSignal =
    bestSide === "HOME"
      ? hasAnySignal([
          "home_form_decay",
          "ai_form_home_negative",
          "ai_form_home_poor"
        ])
      : bestSide === "AWAY"
        ? hasAnySignal([
            "away_form_decay",
            "ai_form_away_negative",
            "ai_form_away_poor"
          ])
        : false;

  const oneX2Reasons = [];

  if (!homeAwayFinite) oneX2Reasons.push("missing_home_away_scores");
  if (homeAwayFinite && best1x2 < 0.68) oneX2Reasons.push("best_below_0.68");
  if (homeAwayFinite && gap1x2 < 0.10) oneX2Reasons.push("gap_below_0.10");
  if (confidence < 0.42) oneX2Reasons.push("confidence_below_0.42");
  if (sideHasNegativeFormSignal) oneX2Reasons.push("side_negative_form");

  diagnostics["1X2"] = {
    eligible: oneX2Reasons.length === 0,
    pick: bestSide,
    score: best1x2,
    gap: gap1x2,
    drawScore: Number.isFinite(drawScore) ? drawScore : null,
    reasons: oneX2Reasons
  };

  const qualifiesOver25 =
    over25 >= 0.65 &&
    expectedTotalGoals >= 2.75 &&
    hasGoalSupport &&
    !hasGoalsBlocker &&
    confidence >= 0.44;

  const over15Reasons = [];
  if (over15 < 0.70) over15Reasons.push("score_below_0.70");
  if (qualifiesOver25) over15Reasons.push("suppressed_by_over25");
  if (hasGoalsBlocker) over15Reasons.push("goals_blocker");
  if (confidence < 0.40) over15Reasons.push("confidence_below_0.40");

  diagnostics["Over / Under 1.5"] = {
    eligible: over15Reasons.length === 0,
    pick: "Over 1.5",
    score: over15,
    reasons: over15Reasons
  };

  const over25Reasons = [];
  if (over25 < 0.65) over25Reasons.push("score_below_0.65");
  if (expectedTotalGoals < 2.75) over25Reasons.push("expected_goals_below_2.75");
  if (!hasGoalSupport) over25Reasons.push("missing_goal_support");
  if (hasGoalsBlocker) over25Reasons.push("goals_blocker");
  if (confidence < 0.44) over25Reasons.push("confidence_below_0.44");

  diagnostics["Over / Under 2.5"] = {
    eligible: over25Reasons.length === 0,
    pick: "Over 2.5",
    score: over25,
    expectedTotalGoals,
    reasons: over25Reasons
  };

  const over35Reasons = [];
  if (over35 < 0.74) over35Reasons.push("score_below_0.74");
  if (!hasStrongGoalSupport) over35Reasons.push("missing_strong_goal_support");
  if (hasGoalsBlocker) over35Reasons.push("goals_blocker");
  if (confidence < 0.48) over35Reasons.push("confidence_below_0.48");

  diagnostics["Over / Under 3.5"] = {
    eligible: over35Reasons.length === 0,
    pick: "Over 3.5",
    score: over35,
    reasons: over35Reasons
  };

  const bttsReasons = [];
  if (btts < 0.68) bttsReasons.push("score_below_0.68");
  if (!hasBttsSupport) bttsReasons.push("missing_btts_support");
  if (hasBttsBlocker) bttsReasons.push("btts_blocker");
  if (confidence < 0.45) bttsReasons.push("confidence_below_0.45");

  diagnostics.BTTS = {
    eligible: bttsReasons.length === 0,
    pick: "BTTS YES",
    score: btts,
    reasons: bttsReasons
  };

  return diagnostics;
}

export async function buildValueCoverageReportDay(dayKey = athensDayKey(), options = {}) {
  const season = String(options.season || DEFAULT_SEASON);
  const canonicalMatches = getFixturesByDay(dayKey);
  const snapshotFallbackMatches = canonicalMatches.length === 0
    ? readDeploySnapshotFixturesByDay(dayKey)
    : [];

  const sourceMatches = canonicalMatches.length > 0
    ? canonicalMatches
    : snapshotFallbackMatches;

  const inputSource = canonicalMatches.length > 0
    ? "canonical_fixtures"
    : snapshotFallbackMatches.length > 0
      ? "deploy_snapshot_fixtures_fallback"
      : "empty";

  if (canonicalMatches.length === 0 && snapshotFallbackMatches.length > 0) {
    console.log("[value-coverage] using deploy snapshot fixture fallback", {
      dayKey,
      sourceMatches: snapshotFallbackMatches.length
    });
  }

  const playable = sourceMatches.filter(isPlayable);

  const [indexes, priors] = await Promise.all([
    loadValueIndexes(season),
    loadModelPriors(season)
  ]);

  const rows = [];
  const startedAt = new Date().toISOString();

  for (const match of playable) {
    const details = readDetailsForValueCoverage(dayKey, match.matchId);

    let intelligence = null;
    let intelligenceError = null;

    try {
      intelligence = await buildMatchIntelligence(match, { season });
    } catch (error) {
      intelligenceError = error?.message || String(error);
    }

    let value = null;
    let valueError = null;

    try {
      const competitionContext = details?.researchedFacts?.competitionContext || null;
      const competitionData = competitionContext?.data || {};

      value = await evaluateMatchValue(
        {
          ...match,
          kickoff: match.kickoffUtc,
          season,
          contextIntelligence: {
            ...competitionData,
            competitionContext,
            refereeProfile: details?.researchedFacts?.refereeProfile || null,
            teamNews: details?.researchedFacts?.teamNews || null,
            expectedLineups: details?.researchedFacts?.expectedLineups || null,
            headToHead: details?.researchedFacts?.headToHead || null,
            formGuide: details?.researchedFacts?.formGuide || null,
            matchProfile: details?.researchedFacts?.matchProfile || null,
            signals: details?.aiContext?.signals || [],
            matchIntelligence: intelligence
          }
        },
        {
          season,
          indexes,
          priors,
          returnNullDiagnostics: true
        }
      );
    } catch (error) {
      valueError = error?.message || String(error);
    }

    const diagnostic = value?.__valueNullDiagnostic === true ? value : null;
    const minimumSample = diagnostic?.minimumRecentSample || null;

    rows.push({
      matchId: match.matchId,
      leagueSlug: match.leagueSlug || null,
      homeTeam: match.homeTeam || null,
      awayTeam: match.awayTeam || null,
      status: match.status || null,
      kickoffUtc: match.kickoffUtc || null,
      detailsFound: !!details,
      intelligenceOk: !!intelligence,
      intelligenceError,
      valueReturned: !!value && !diagnostic,
      valueError,
      nullReason: diagnostic?.reason || (!value && !valueError ? "unknown_null" : null),
      nullClass: diagnostic?.reason === "minimum_recent_sample"
        ? classifyMinimumSample(minimumSample)
        : null,
      minimumSample,
      valuePreview: value && !diagnostic
        ? {
            confidence: value.confidence ?? null,
            homeWinScore: value.homeWinScore ?? null,
            drawScore: value.drawScore ?? null,
            awayWinScore: value.awayWinScore ?? null,
            over15Score: value.over15Score ?? null,
            over25Score: value.over25Score ?? null,
            bttsScore: value.bttsScore ?? null,
            signals: Array.isArray(value.signals) ? value.signals : [],
            marketDiagnostics: buildMarketRejectionDiagnostics(value)
          }
        : null
    });
  }

  const nullRows = rows.filter(row => row.nullReason);
  const valueRows = rows.filter(row => row.valueReturned);

  const report = {
    ok: true,
    dayKey,
    season,
    generatedAt: new Date().toISOString(),
    startedAt,
    source: {
      inputSource,
      canonicalMatches: canonicalMatches.length,
      snapshotFallbackMatches: snapshotFallbackMatches.length,
      sourceMatches: sourceMatches.length,
      playable: playable.length
    },
    counts: {
      totalRows: rows.length,
      detailsFound: rows.filter(row => row.detailsFound).length,
      intelligenceOk: rows.filter(row => row.intelligenceOk).length,
      valueReturned: valueRows.length,
      valueNull: nullRows.length,
      valueFailed: rows.filter(row => row.valueError).length,
      minimumRecentSampleNull: rows.filter(row => row.nullReason === "minimum_recent_sample").length
    },
    breakdown: {
      nullByReason: countBy(nullRows, row => row.nullReason || "none"),
      nullByClass: countBy(nullRows, row => row.nullClass || "none"),
      nullByLeague: countBy(nullRows, row => row.leagueSlug || "unknown"),
      returnedByLeague: countBy(valueRows, row => row.leagueSlug || "unknown")
    },
    rows
  };

  const outDir = resolveDataPath("value", "_coverage-reports");
  await fs.mkdir(outDir, { recursive: true });

  const outFile = path.join(outDir, `${dayKey}.json`);
  await fs.writeFile(outFile, JSON.stringify(report, null, 2) + "\n", "utf8");

  return {
    ok: true,
    dayKey,
    season,
    file: outFile,
    counts: report.counts,
    breakdown: report.breakdown
  };
}

const entryUrl = globalThis.process?.argv?.[1]
  ? pathToFileURL(globalThis.process.argv[1]).href
  : null;

if (entryUrl === import.meta.url) {
  const dayKey = globalThis.process?.argv?.[2] || athensDayKey();

  buildValueCoverageReportDay(dayKey)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
