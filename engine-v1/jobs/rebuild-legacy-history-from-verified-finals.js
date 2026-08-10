import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { currentSeason } from "../core/season.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { getProductionIdentityResolver } from "../core/production-identity-resolver-runtime.js";
import { semanticTeamKey } from "./audit-history-semantic-integrity.js";
import { resolveDataPath } from "../storage/data-root.js";

const KICKOFF_TOLERANCE_MS = 6 * 60 * 60 * 1000;

function clean(value) {
  return String(value ?? "").trim();
}

function strictScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function finalScoreOf(row) {
  const h = strictScore(row?.homeScore ?? row?.scoreHome ?? row?.finalScore?.homeScore ?? row?.finalScore?.home);
  const a = strictScore(row?.awayScore ?? row?.scoreAway ?? row?.finalScore?.awayScore ?? row?.finalScore?.away);
  return h === null || a === null ? null : { home: h, away: a };
}

function hasVerifiedFinalVerdict(row) {
  if (row?.verifiedFinalTruth !== true) return false;
  const values = [
    row?.finalTruthVerdict,
    row?.verdict,
    row?.verification?.finalTruthVerdict,
    row?.verification?.verdict,
    row?.verification?.state,
    row?.settlement?.finalTruthVerdict,
    row?.settlement?.state,
  ].map(value => clean(value).toLowerCase()).filter(Boolean);
  return values.some(value => [
    "verified_final_result",
    "verified_final_result_truth",
    "manual_two_source_final_score_validated",
    "manual_official_url_validated",
  ].includes(value));
}

function dayFromRow(row) {
  const explicit = clean(row?.dayKey || row?.date);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(explicit)) return explicit;
  const kickoff = clean(row?.kickoffUtc || row?.kickoff || row?.startTime);
  if (!kickoff) return "";
  try {
    return athensDayFromKickoff(kickoff);
  } catch {
    return "";
  }
}

function seasonFromDay(dayKey) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return currentSeason(new Date(Date.UTC(year, month - 1, day || 1)));
}

function terminalStatus(row) {
  const values = [
    row?.status,
    row?.statusType,
    row?.rawStatus,
    ...(Array.isArray(row?.sources) ? row.sources.flatMap(source => [source?.status, source?.statusType, source?.rawStatus]) : []),
  ].map(value => clean(value).toUpperCase()).filter(Boolean);
  if (values.some(value => value.includes("PEN"))) return "PEN";
  if (values.some(value => value.includes("AET") || value.includes("EXTRA_TIME"))) return "AET";
  return "FT";
}

function outcome(home, away) {
  return home > away ? "HOME" : home < away ? "AWAY" : "DRAW";
}

function semanticDescriptor(row) {
  const slug = clean(row?.leagueSlug || "unknown");
  const home = semanticTeamKey(slug, row?.homeTeam);
  const away = semanticTeamKey(slug, row?.awayTeam);
  const kickoffMs = Date.parse(clean(row?.kickoffUtc || row?.kickoff));
  return { slug, home, away, kickoffMs };
}

function semanticCollision(left, right) {
  const a = semanticDescriptor(left);
  const b = semanticDescriptor(right);
  if (a.slug !== b.slug) return false;
  if (!Number.isFinite(a.kickoffMs) || !Number.isFinite(b.kickoffMs)) return false;
  if (Math.abs(a.kickoffMs - b.kickoffMs) > KICKOFF_TOLERANCE_MS) return false;
  return a.home === b.home && a.away === b.away;
}

export function buildLegacyVerifiedHistoryDay({
  dayKey,
  finalResultRows = [],
  resolver = null,
  rebuiltAt = Date.now(),
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(clean(dayKey))) {
    return { ok: false, reason: "invalid_day_key", dayKey, rows: [], errors: [] };
  }

  const errors = [];
  const accepted = [];
  const byId = new Map();

  for (const row of finalResultRows) {
    const id = clean(row?.matchId || row?.canonicalId || row?.id);
    if (!id) {
      errors.push({ reason: "verified_final_match_id_required" });
      continue;
    }
    if (byId.has(id)) {
      errors.push({ reason: "verified_final_identity_duplicate", matchId: id });
      continue;
    }
    if (!hasVerifiedFinalVerdict(row)) {
      errors.push({ reason: "verified_final_contract_required", matchId: id });
      continue;
    }
    if (dayFromRow(row) !== dayKey) {
      errors.push({ reason: "verified_final_day_mismatch", matchId: id, actualDay: dayFromRow(row) || null });
      continue;
    }
    const score = finalScoreOf(row);
    if (!score) {
      errors.push({ reason: "verified_final_numeric_score_required", matchId: id });
      continue;
    }
    const homeTeam = clean(row?.homeTeam);
    const awayTeam = clean(row?.awayTeam);
    const leagueSlug = clean(row?.leagueSlug);
    const kickoff = clean(row?.kickoffUtc || row?.kickoff);
    const kickoffMs = Date.parse(kickoff);
    if (!homeTeam || !awayTeam || !leagueSlug || !Number.isFinite(kickoffMs)) {
      errors.push({ reason: "verified_final_identity_fields_required", matchId: id });
      continue;
    }
    try {
      if (athensDayFromKickoff(kickoff) !== dayKey) {
        errors.push({ reason: "verified_final_kickoff_day_mismatch", matchId: id });
        continue;
      }
    } catch {
      errors.push({ reason: "verified_final_kickoff_invalid", matchId: id });
      continue;
    }

    const resolution = resolver?.resolveFixtureId?.(id) || null;
    if (resolution?.ok && resolution.sourceRole === "suppressed_lineage_alias") {
      errors.push({
        reason: "suppressed_verified_final_alias_not_reconciled",
        matchId: id,
        retainedFixtureId: resolution.resolvedFixtureId,
      });
      continue;
    }
    if (resolution?.ok && clean(resolution.resolvedFixtureId) !== id) {
      errors.push({ reason: "verified_final_identity_resolution_mismatch", matchId: id, resolvedFixtureId: resolution.resolvedFixtureId });
      continue;
    }

    const candidate = {
      id,
      season: seasonFromDay(dayKey),
      dayKey,
      kickoff,
      kickoff_ms: kickoffMs,
      leagueSlug,
      leagueName: clean(row?.leagueName),
      homeTeam,
      awayTeam,
      scoreHome: score.home,
      scoreAway: score.away,
      status: terminalStatus(row),
      minute: "FT",
      outcome: outcome(score.home, score.away),
      source: clean(row?.source) || "verified-final",
      rebuiltAt,
      competitionType: row?.competitionType || null,
      leagueTier: row?.leagueTier ?? null,
      leagueTrust: row?.leagueTrust ?? null,
      phase: row?.phase || "regular",
      truthContract: {
        schema: "ai-matchlab.history-legacy-verified-final.v1",
        canonicalStoreUnavailableForDay: true,
        verifiedFinalTruth: true,
        identityResolverChecked: Boolean(resolver),
        suppressedAliasesForbidden: true,
        semanticDuplicatesForbidden: true,
        numericScoreRequired: true,
        nullScoreCoercionForbidden: true,
        athensDayExact: true,
      },
    };

    for (const prior of accepted) {
      if (!semanticCollision(prior, candidate)) continue;
      errors.push({
        reason:
          prior.scoreHome === candidate.scoreHome && prior.scoreAway === candidate.scoreAway
            ? "legacy_semantic_duplicate_not_reconciled"
            : "legacy_semantic_score_conflict",
        matchId: id,
        otherMatchId: prior.id,
        score: `${candidate.scoreHome}-${candidate.scoreAway}`,
        otherScore: `${prior.scoreHome}-${prior.scoreAway}`,
      });
    }

    byId.set(id, candidate);
    accepted.push(candidate);
  }

  accepted.sort((a, b) => a.kickoff_ms - b.kickoff_ms || a.id.localeCompare(b.id));
  return {
    ok: errors.length === 0 && accepted.length > 0,
    reason: errors.length ? "legacy_history_truth_validation_failed" : accepted.length ? null : "no_verified_final_rows",
    dayKey,
    season: seasonFromDay(dayKey),
    verifiedFinalCount: finalResultRows.length,
    acceptedRows: accepted.length,
    errors,
    rows: accepted,
  };
}

function loadFinalRows(dayKey, finalRoot) {
  const dir = path.join(finalRoot, dayKey);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

function replaceHistoryDay(dayKey, build, historyRoot) {
  const filePath = path.join(historyRoot, `${build.season}.json`);
  let payload = { season: build.season, days: [] };
  if (fs.existsSync(filePath)) payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const days = Array.isArray(payload?.days) ? payload.days.filter(day => clean(day?.dayKey) !== dayKey) : [];
  days.push({ dayKey, matchCount: build.rows.length, rows: build.rows, updatedAt: Date.now() });
  days.sort((a, b) => clean(a?.dayKey).localeCompare(clean(b?.dayKey)));
  writeJsonAtomic(filePath, { ...payload, season: build.season, days });
  return filePath;
}

export function rebuildLegacyHistoryRange({
  days,
  write = false,
  finalRoot = resolveDataPath("final-results"),
  historyRoot = resolveDataPath("history"),
  resolver = getProductionIdentityResolver(),
} = {}) {
  const dayKeys = Array.isArray(days) ? days : [];
  const reports = [];
  for (const dayKey of dayKeys) {
    const finalRows = loadFinalRows(dayKey, finalRoot);
    const build = buildLegacyVerifiedHistoryDay({ dayKey, finalResultRows: finalRows, resolver });
    reports.push(build);
  }
  const failed = reports.filter(report => !report.ok);
  if (failed.length || !write) {
    return {
      schema: "ai-matchlab.legacy-history-range-rebuild.v1",
      ok: failed.length === 0,
      writeApplied: false,
      days: dayKeys,
      reports,
    };
  }
  const written = reports.map(report => ({ dayKey: report.dayKey, historyPath: replaceHistoryDay(report.dayKey, report, historyRoot), rows: report.rows.length }));
  return {
    schema: "ai-matchlab.legacy-history-range-rebuild.v1",
    ok: true,
    writeApplied: true,
    days: dayKeys,
    written,
    reports,
  };
}

function parseArgs(argv) {
  const out = { days: [], write: false };
  for (const token of argv) {
    if (token === "--write") out.write = true;
    else if (/^\d{4}-\d{2}-\d{2}$/u.test(token)) out.days.push(token);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.days.length) throw new Error("usage: rebuild-legacy-history-from-verified-finals.js YYYY-MM-DD [...] [--write]");
    const result = rebuildLegacyHistoryRange(args);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}
