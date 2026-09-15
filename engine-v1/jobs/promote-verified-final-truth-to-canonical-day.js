import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { athensDayFromKickoff } from "../core/daykey.js";
import { sameTeamName } from "../core/fixture-dedup.js";
import { classifyMatchState, MATCH_STATE_CLASS } from "../core/non-played-state.js";
import { assertCanonicalStatusCoherence } from "../core/canonical-status-coherence.js";
import { resolveDataPath } from "../storage/data-root.js";

const VERIFIED_FINAL_VERDICTS = new Set([
  "verified_final_result",
  "verified_final_result_truth",
  "manual_two_source_final_score_validated",
  "manual_official_url_validated"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function strictScore(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function finalScoreOf(row) {
  const homeCandidates = [
    row?.homeScore,
    row?.scoreHome,
    row?.finalScore?.homeScore,
    row?.finalScore?.home
  ].filter(value => value !== undefined && value !== null && !(typeof value === "string" && value.trim() === ""));
  const awayCandidates = [
    row?.awayScore,
    row?.scoreAway,
    row?.finalScore?.awayScore,
    row?.finalScore?.away
  ].filter(value => value !== undefined && value !== null && !(typeof value === "string" && value.trim() === ""));

  if (!homeCandidates.length || !awayCandidates.length) return null;
  const home = homeCandidates.map(strictScore);
  const away = awayCandidates.map(strictScore);
  if (home.some(value => value === null) || away.some(value => value === null)) return null;
  if (new Set(home).size !== 1 || new Set(away).size !== 1) return null;
  return { home: home[0], away: away[0] };
}

function verdictsOf(row) {
  return [
    row?.finalTruthVerdict,
    row?.verdict,
    row?.verification?.finalTruthVerdict,
    row?.verification?.verdict,
    row?.verification?.state,
    row?.settlement?.finalTruthVerdict,
    row?.settlement?.state
  ].map(value => clean(value).toLowerCase()).filter(Boolean);
}

function hasVerifiedFinalVerdict(row) {
  return row?.verifiedFinalTruth === true && verdictsOf(row).some(value => VERIFIED_FINAL_VERDICTS.has(value));
}

function kickoffOf(row) {
  return clean(row?.kickoffUtc || row?.kickoff || row?.startUtc || row?.startTime);
}

function dayOf(row) {
  const explicit = clean(row?.dayKey || row?.date);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(explicit)) return explicit;
  const kickoff = kickoffOf(row);
  if (!kickoff) return "";
  try {
    return athensDayFromKickoff(new Date(kickoff).toISOString());
  } catch {
    return "";
  }
}

function teamMatches(slug, left, right) {
  return sameTeamName(slug, left, right) || sameTeamName(slug, right, left);
}

export function exactProviderIdsOf(row) {
  const ids = [];
  const push = value => {
    const normalized = clean(value);
    if (normalized && !ids.includes(normalized)) ids.push(normalized);
  };

  push(row?.providerMatchId);
  push(row?.sourceId);
  push(row?.sourceMatchId);
  if (/^\d+$/u.test(clean(row?.matchId))) push(row?.matchId);

  if (row?.providerIds && typeof row.providerIds === "object") {
    for (const value of Object.values(row.providerIds)) {
      if (Array.isArray(value)) {
        for (const item of value) push(item);
      } else {
        push(value);
      }
    }
  }

  return ids;
}

function evidenceProviderId(row) {
  return clean(row?.providerMatchId || row?.sourceId || row?.sourceMatchId || row?.matchId);
}

export function evaluateVerifiedFinalCanonicalConvergence({ canonicalRow, finalResultRow, finalResultPath = null, dayKey } = {}) {
  const expectedDay = clean(dayKey);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(expectedDay)) return { ok: false, reason: "invalid_day_key" };

  const canonicalId = clean(canonicalRow?.canonicalId || canonicalRow?.matchId);
  const finalId = clean(finalResultRow?.matchId);
  if (!canonicalId || !finalId || canonicalId !== finalId) return { ok: false, reason: "exact_canonical_id_required" };
  if (!hasVerifiedFinalVerdict(finalResultRow)) return { ok: false, reason: "verified_final_contract_required" };
  if (dayOf(canonicalRow) !== expectedDay || dayOf(finalResultRow) !== expectedDay) return { ok: false, reason: "athens_day_mismatch" };

  const canonicalState = classifyMatchState(canonicalRow);
  if (canonicalState === MATCH_STATE_CLASS.PLAYED_FINAL) return { ok: false, reason: "canonical_already_played_final", canonicalState };
  if (canonicalState !== MATCH_STATE_CLASS.PRE_KICKOFF_SCHEDULED) return { ok: false, reason: "canonical_state_not_eligible", canonicalState };

  if (
    canonicalRow?.scoreHome !== null && canonicalRow?.scoreHome !== undefined ||
    canonicalRow?.scoreAway !== null && canonicalRow?.scoreAway !== undefined
  ) {
    return { ok: false, reason: "canonical_pre_terminal_score_present", canonicalState };
  }

  const score = finalScoreOf(finalResultRow);
  if (!score) return { ok: false, reason: "verified_final_numeric_score_required", canonicalState };

  const slug = clean(canonicalRow?.leagueSlug || finalResultRow?.leagueSlug);
  if (
    !teamMatches(slug, canonicalRow?.homeTeam, finalResultRow?.homeTeam) ||
    !teamMatches(slug, canonicalRow?.awayTeam, finalResultRow?.awayTeam)
  ) {
    return { ok: false, reason: "ordered_team_identity_mismatch", canonicalState };
  }

  const canonicalProviderIds = exactProviderIdsOf(canonicalRow);
  if (!canonicalProviderIds.length) return { ok: false, reason: "canonical_exact_provider_identity_required", canonicalState };

  const sourceRows = Array.isArray(finalResultRow?.sources) ? finalResultRow.sources : [];
  const matchedSources = sourceRows.filter(source => {
    const providerId = evidenceProviderId(source);
    return providerId && canonicalProviderIds.includes(providerId);
  });

  if (!matchedSources.length) {
    return { ok: false, reason: "exact_provider_id_intersection_required", canonicalState, canonicalProviderIds };
  }

  const matchedProviderIds = [];
  for (const source of matchedSources) {
    const providerId = evidenceProviderId(source);
    if (!matchedProviderIds.includes(providerId)) matchedProviderIds.push(providerId);
    if (source?.finished !== true && source?.playedFinal !== true) {
      return { ok: false, reason: "matched_provider_explicit_final_required", canonicalState, matchedProviderIds };
    }
    const sourceHome = strictScore(source?.scoreHome);
    const sourceAway = strictScore(source?.scoreAway);
    if (sourceHome === null || sourceAway === null || sourceHome !== score.home || sourceAway !== score.away) {
      return { ok: false, reason: "matched_provider_score_mismatch", canonicalState, matchedProviderIds };
    }
    if (dayOf(source) !== expectedDay) {
      return { ok: false, reason: "matched_provider_day_mismatch", canonicalState, matchedProviderIds };
    }
  }

  matchedProviderIds.sort();
  const promotedAt = new Date().toISOString();
  const nextRow = {
    ...canonicalRow,
    status: "FT",
    statusType: "STATUS_FINAL",
    rawStatus: "STATUS_FULL_TIME",
    operationalState: "TERMINAL_CONFIRMED",
    minute: "FT",
    scoreHome: score.home,
    scoreAway: score.away,
    penalties: finalResultRow?.penalties ?? canonicalRow?.penalties ?? null,
    decidedBy: finalResultRow?.decidedBy ?? canonicalRow?.decidedBy ?? null,
    lastSeenAt: promotedAt,
    authoritativeTerminalWriteback: {
      schema: "ai-matchlab.authoritative-terminal-writeback.v1",
      promotedAt,
      provider: "verified-final-result",
      providerMatchId: matchedProviderIds[0],
      dayKey: expectedDay,
      identityContract: {
        exactCanonicalId: true,
        exactProviderId: true,
        providerIdSetIntersection: true,
        athensDay: true,
        orderedTeamPair: true,
        explicitTerminalStatus: true,
        numericScore: true,
        heuristicIdentity: false
      },
      observation: {
        status: "FT",
        statusType: "STATUS_FINAL",
        rawStatus: "STATUS_FULL_TIME",
        scoreHome: score.home,
        scoreAway: score.away
      }
    },
    verifiedFinalCanonicalConvergence: {
      schema: "ai-matchlab.verified-final-canonical-convergence.v1",
      promotedAt,
      verifiedFinalArtifact: finalResultPath,
      verifiedFinalVerdict: clean(finalResultRow?.finalTruthVerdict || finalResultRow?.verdict),
      matchedProviderIds,
      scoreKey: `${score.home}-${score.away}`,
      guarantees: {
        exactCanonicalId: true,
        exactProviderIdIntersection: true,
        sameAthensDay: true,
        orderedTeamPair: true,
        verifiedFinalTruth: true,
        matchedProviderExplicitFinal: true,
        exactScoreParity: true,
        canonicalScheduledOnly: true,
        protectedNonPlayedStateNeverOverwritten: true,
        heuristicIdentity: false,
        elapsedTimeInference: false
      }
    }
  };

  return { ok: true, reason: null, canonicalState, matchedProviderIds, score, row: nextRow };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonAtomic(file, payload) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
}

export function promoteVerifiedFinalTruthToCanonicalDay(dayKey, { write = true } = {}) {
  const expectedDay = clean(dayKey);
  const report = {
    ok: true,
    schema: "ai-matchlab.verified-final-canonical-convergence-report.v1",
    dayKey: expectedDay,
    generatedAt: new Date().toISOString(),
    scannedFinalResults: 0,
    eligibleCanonicalRows: 0,
    promotedRows: 0,
    unchangedRows: 0,
    rejectedRows: 0,
    byReason: {},
    promoted: [],
    readErrors: []
  };

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(expectedDay)) return { ...report, ok: false, reason: "invalid_day_key" };
  const canonicalDir = resolveDataPath("canonical-fixtures", expectedDay);
  const finalDir = resolveDataPath("final-results", expectedDay);
  if (!fs.existsSync(canonicalDir)) return { ...report, ok: false, reason: "canonical_day_missing" };
  if (!fs.existsSync(finalDir)) return { ...report, ok: true, reason: "final_results_day_missing" };

  const canonicalById = new Map();
  const duplicateCanonicalIds = new Set();
  const payloads = new Map();

  for (const name of fs.readdirSync(canonicalDir).filter(name => name.endsWith(".json")).sort()) {
    const file = path.join(canonicalDir, name);
    let payload;
    try {
      payload = readJson(file);
    } catch (error) {
      report.readErrors.push({ path: file, reason: error?.message || String(error) });
      continue;
    }
    if (!payload || !Array.isArray(payload.fixtures)) continue;
    payloads.set(file, payload);
    for (let index = 0; index < payload.fixtures.length; index++) {
      const row = payload.fixtures[index];
      const id = clean(row?.canonicalId || row?.matchId);
      if (!id) continue;
      if (canonicalById.has(id)) {
        duplicateCanonicalIds.add(id);
        canonicalById.delete(id);
        continue;
      }
      if (!duplicateCanonicalIds.has(id)) canonicalById.set(id, { file, index, row });
    }
  }

  const changedFiles = new Set();
  for (const name of fs.readdirSync(finalDir).filter(name => name.endsWith(".json")).sort()) {
    const file = path.join(finalDir, name);
    let finalResult;
    try {
      finalResult = readJson(file);
    } catch (error) {
      report.readErrors.push({ path: file, reason: error?.message || String(error) });
      continue;
    }
    report.scannedFinalResults++;
    const id = clean(finalResult?.matchId);
    if (!id) {
      report.rejectedRows++;
      report.byReason.verified_final_match_id_required = Number(report.byReason.verified_final_match_id_required || 0) + 1;
      continue;
    }
    if (duplicateCanonicalIds.has(id)) {
      report.rejectedRows++;
      report.byReason.canonical_identity_duplicate = Number(report.byReason.canonical_identity_duplicate || 0) + 1;
      continue;
    }
    const target = canonicalById.get(id);
    if (!target) {
      report.unchangedRows++;
      continue;
    }

    const state = classifyMatchState(target.row);
    if (state === MATCH_STATE_CLASS.PLAYED_FINAL) {
      report.unchangedRows++;
      continue;
    }
    report.eligibleCanonicalRows++;

    const result = evaluateVerifiedFinalCanonicalConvergence({
      canonicalRow: target.row,
      finalResultRow: finalResult,
      finalResultPath: path.relative(process.cwd(), file).replaceAll(path.sep, "/"),
      dayKey: expectedDay
    });

    if (!result.ok) {
      report.rejectedRows++;
      report.byReason[result.reason] = Number(report.byReason[result.reason] || 0) + 1;
      continue;
    }

    const payload = payloads.get(target.file);
    payload.fixtures[target.index] = result.row;
    payload.updatedAt = report.generatedAt;
    payload.sourceMeta = {
      ...(payload.sourceMeta && typeof payload.sourceMeta === "object" ? payload.sourceMeta : {}),
      verifiedFinalCanonicalConvergence: {
        schema: report.schema,
        convergedAt: report.generatedAt,
        exactCanonicalIdRequired: true,
        exactProviderIdIntersectionRequired: true,
        heuristicIdentity: false
      }
    };
    changedFiles.add(target.file);
    report.promotedRows++;
    report.promoted.push({
      matchId: id,
      leagueSlug: result.row?.leagueSlug || null,
      homeTeam: result.row?.homeTeam || null,
      awayTeam: result.row?.awayTeam || null,
      score: `${result.score.home}-${result.score.away}`,
      matchedProviderIds: result.matchedProviderIds,
      verifiedFinalArtifact: path.relative(process.cwd(), file).replaceAll(path.sep, "/")
    });
  }

  if (report.readErrors.length) return { ...report, ok: false, reason: "artifact_read_error" };

  if (write) {
    for (const file of [...changedFiles].sort()) {
      const payload = payloads.get(file);
      assertCanonicalStatusCoherence(payload, { path: file });
      writeJsonAtomic(file, payload);
    }
  }

  return report;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const dayKey = process.argv.find(arg => arg.startsWith("--date="))?.split("=")[1]
    || process.argv.slice(2).find(arg => /^\d{4}-\d{2}-\d{2}$/u.test(arg));
  const dryRun = process.argv.includes("--dry-run");
  const report = promoteVerifiedFinalTruthToCanonicalDay(dayKey, { write: !dryRun });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
