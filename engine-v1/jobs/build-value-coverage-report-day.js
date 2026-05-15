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

const DEFAULT_SEASON = "2025-2026";

function readJsonSafe(file, fallback = null) {
  try {
    if (!fsSync.existsSync(file)) return fallback;
    return JSON.parse(fsSync.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
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

export async function buildValueCoverageReportDay(dayKey = athensDayKey(), options = {}) {
  const season = String(options.season || DEFAULT_SEASON);
  const sourceMatches = getFixturesByDay(dayKey);
  const playable = sourceMatches.filter(isPlayable);

  const [indexes, priors] = await Promise.all([
    loadValueIndexes(season),
    loadModelPriors(season)
  ]);

  const rows = [];
  const startedAt = new Date().toISOString();

  for (const match of playable) {
    const detailFile = resolveDataPath("details", dayKey, `${match.matchId}.json`);
    const details = readJsonSafe(detailFile, null);

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
            signals: Array.isArray(value.signals) ? value.signals : []
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
