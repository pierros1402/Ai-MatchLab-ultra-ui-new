import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath } from "../storage/data-root.js";
import { auditFinalizationReadinessDay } from "./audit-finalization-readiness-day.js";

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

function asArray(payload, keys = []) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
}

function fixtureId(row) {
  return String(row?.matchId ?? row?.id ?? row?.fixtureId ?? "");
}

function leagueOf(row, fallback = null) {
  return row?.leagueSlug ?? row?.league ?? row?.competitionSlug ?? fallback;
}

function statusBucket(row) {
  return [
    row?.status,
    row?.operationalState,
    row?.state,
    row?.statusType,
    row?.rawStatus,
    row?.sourceStatus,
    row?.sourceStatusType
  ]
    .map(v => String(v || "").trim().toUpperCase())
    .filter(Boolean)
    .join(" ");
}

function isFinalLike(row) {
  return /\b(FT|FULL_TIME|STATUS_FULL_TIME|FINAL|STATUS_FINAL|STATUS_FINAL_AET|AET|PEN|POSTPONED|CANCELLED|CANCELED|ABANDONED|WO|WALKOVER)\b/i.test(statusBucket(row));
}

function isOpenLike(row) {
  if (isFinalLike(row)) return false;

  const bucket = statusBucket(row);
  if (!bucket) return true;

  return /\b(PRE|SCHEDULED|STATUS_SCHEDULED|UNKNOWN|STALE|LIVE|FIRST_HALF|SECOND_HALF|HALF_TIME|IN_PROGRESS|STATUS_IN_PROGRESS|EXTRA_TIME)\b/i.test(bucket);
}

function teamName(row, side) {
  if (side === "home") return row?.home ?? row?.homeTeam ?? row?.homeName ?? null;
  return row?.away ?? row?.awayTeam ?? row?.awayName ?? null;
}

function scoreValue(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickCompetitors(summary) {
  const competition = summary?.header?.competitions?.[0];
  const competitors = competition?.competitors || summary?.boxscore?.teams || [];

  return competitors.map(c => ({
    homeAway: c.homeAway || c.team?.homeAway || null,
    id: c.id || c.team?.id || null,
    name: c.team?.displayName || c.team?.shortDisplayName || c.team?.name || c.displayName || c.name || null,
    score: scoreValue(c.score),
    winner: c.winner ?? null
  }));
}

function eventStatus(summary) {
  const competition = summary?.header?.competitions?.[0];
  const st = competition?.status || summary?.status || {};
  const type = st?.type || {};

  return {
    name: type?.name || null,
    state: type?.state || null,
    completed: type?.completed ?? st?.completed ?? null,
    description: type?.description || null,
    detail: type?.detail || type?.shortDetail || st?.displayClock || null
  };
}

function extractFinalScore(summary) {
  const status = eventStatus(summary);
  const competitors = pickCompetitors(summary);

  const statusText = [
    status.name,
    status.state,
    status.description,
    status.detail
  ].map(v => String(v || "")).join(" ");

  const completed =
    status.completed === true ||
    /\b(STATUS_FINAL|STATUS_FULL_TIME|FINAL|FULL_TIME|FT|AET|PEN)\b/i.test(statusText);

  if (!completed) {
    return {
      ok: false,
      reason: "event_not_completed",
      status,
      competitors
    };
  }

  const home = competitors.find(c => String(c.homeAway || "").toLowerCase() === "home");
  const away = competitors.find(c => String(c.homeAway || "").toLowerCase() === "away");

  if (!home || !away) {
    return {
      ok: false,
      reason: "missing_home_away_competitors",
      status,
      competitors
    };
  }

  if (!Number.isFinite(home.score) || !Number.isFinite(away.score)) {
    return {
      ok: false,
      reason: "missing_final_score",
      status,
      competitors
    };
  }

  return {
    ok: true,
    status,
    competitors,
    scoreHome: home.score,
    scoreAway: away.score,
    homeName: home.name,
    awayName: away.name
  };
}

async function fetchEventSummary(leagueSlug, eventId, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 15000);
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(leagueSlug)}/summary?event=${encodeURIComponent(eventId)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 Ai-MatchLab final-score-repair"
      }
    });

    const text = await res.text();

    if (!res.ok) {
      return {
        ok: false,
        url,
        httpStatus: res.status,
        reason: "http_error",
        error: text.slice(0, 300)
      };
    }

    try {
      return {
        ok: true,
        url,
        httpStatus: res.status,
        json: JSON.parse(text)
      };
    } catch (err) {
      return {
        ok: false,
        url,
        httpStatus: res.status,
        reason: "json_parse_failed",
        error: err.message,
        body: text.slice(0, 300)
      };
    }
  } catch (err) {
    return {
      ok: false,
      url,
      httpStatus: null,
      reason: "fetch_failed",
      error: `${err.name}: ${err.message}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readCanonicalLeagueFiles(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  const files = [];

  if (!fs.existsSync(dir)) {
    return { dir, files };
  }

  for (const name of fs.readdirSync(dir).filter(x => x.endsWith(".json")).sort()) {
    const filePath = path.join(dir, name);
    const payload = readJsonSafe(filePath, null);
    const rows = asArray(payload, ["fixtures", "rows", "items"]);
    const leagueSlug = path.basename(name, ".json");

    files.push({
      leagueSlug,
      filePath,
      payload,
      rows
    });
  }

  return { dir, files };
}

function rowPatch(row, finalScore, meta = {}) {
  const patched = {
    ...row,
    status: "FT",
    operationalState: "FT",
    state: "FT",
    scoreHome: finalScore.scoreHome,
    scoreAway: finalScore.scoreAway,
    homeScore: finalScore.scoreHome,
    awayScore: finalScore.scoreAway,
    finalScoreReconciled: true,
    finalScoreReconciledAt: meta.reconciledAt,
    finalScoreReconciledSource: "espn_event_summary",
    finalScoreReconciledReason: meta.reason || "event_summary_fallback"
  };

  patched.sourceMeta = {
    ...(row?.sourceMeta || {}),
    finalScoreReconciliation: {
      source: "espn_event_summary",
      reconciledAt: meta.reconciledAt,
      reason: meta.reason || "event_summary_fallback",
      status: finalScore.status,
      homeName: finalScore.homeName,
      awayName: finalScore.awayName
    }
  };

  return patched;
}

export async function reconcileFinalScoresFromEventSummaryDay(dayKey, options = {}) {
  const write = Boolean(options.write);
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : Infinity;
  const reason = options.reason || "event_summary_fallback";
  const reconciledAt = new Date().toISOString();

  const auditBefore = auditFinalizationReadinessDay(dayKey);
  const canonical = readCanonicalLeagueFiles(dayKey);

  const candidates = [];

  for (const leagueFile of canonical.files) {
    for (let index = 0; index < leagueFile.rows.length; index += 1) {
      const row = leagueFile.rows[index];
      const id = fixtureId(row);

      if (!id || !isOpenLike(row)) continue;

      candidates.push({
        id,
        leagueSlug: leagueOf(row, leagueFile.leagueSlug),
        filePath: leagueFile.filePath,
        leagueFile,
        index,
        row
      });
    }
  }

  const limitedCandidates = candidates.slice(0, limit);
  const byFile = new Map();
  const checked = [];
  const updated = [];
  const unresolved = [];

  for (const item of limitedCandidates) {
    const fetchResult = await fetchEventSummary(item.leagueSlug, item.id, options);

    if (!fetchResult.ok) {
      unresolved.push({
        id: item.id,
        league: item.leagueSlug,
        home: teamName(item.row, "home"),
        away: teamName(item.row, "away"),
        status: statusBucket(item.row),
        reason: fetchResult.reason,
        error: fetchResult.error || null,
        httpStatus: fetchResult.httpStatus
      });

      checked.push({
        id: item.id,
        league: item.leagueSlug,
        ok: false,
        reason: fetchResult.reason
      });

      continue;
    }

    const finalScore = extractFinalScore(fetchResult.json);

    if (!finalScore.ok) {
      unresolved.push({
        id: item.id,
        league: item.leagueSlug,
        home: teamName(item.row, "home"),
        away: teamName(item.row, "away"),
        status: statusBucket(item.row),
        reason: finalScore.reason,
        eventStatus: finalScore.status,
        competitors: finalScore.competitors
      });

      checked.push({
        id: item.id,
        league: item.leagueSlug,
        ok: false,
        reason: finalScore.reason
      });

      continue;
    }

    const patched = rowPatch(item.row, finalScore, {
      reconciledAt,
      reason
    });

    item.leagueFile.rows[item.index] = patched;

    if (!byFile.has(item.filePath)) {
      byFile.set(item.filePath, item.leagueFile);
    }

    updated.push({
      id: item.id,
      league: item.leagueSlug,
      home: teamName(item.row, "home"),
      away: teamName(item.row, "away"),
      scoreHome: finalScore.scoreHome,
      scoreAway: finalScore.scoreAway,
      eventHome: finalScore.homeName,
      eventAway: finalScore.awayName,
      previousStatus: statusBucket(item.row),
      newStatus: "FT"
    });

    checked.push({
      id: item.id,
      league: item.leagueSlug,
      ok: true,
      scoreHome: finalScore.scoreHome,
      scoreAway: finalScore.scoreAway
    });
  }

  if (write) {
    for (const leagueFile of byFile.values()) {
      const payload = {
        ...(leagueFile.payload && typeof leagueFile.payload === "object" && !Array.isArray(leagueFile.payload)
          ? leagueFile.payload
          : {}),
        ok: true,
        dayKey,
        leagueSlug: leagueFile.leagueSlug,
        fixtures: leagueFile.rows,
        updatedAt: reconciledAt,
        finalScoreReconciliation: {
          source: "espn_event_summary",
          reconciledAt,
          reason,
          updatedRows: updated.filter(x => x.league === leagueFile.leagueSlug).length
        }
      };

      writeJsonPretty(leagueFile.filePath, payload);
    }
  }

  const auditAfter = write ? auditFinalizationReadinessDay(dayKey) : null;

  const report = {
    ok: true,
    dayKey,
    write,
    source: "espn_event_summary",
    checked: checked.length,
    candidates: candidates.length,
    limitedCandidates: limitedCandidates.length,
    updated: updated.length,
    unresolved: unresolved.length,
    filesTouched: byFile.size,
    auditBefore: {
      fixtures: auditBefore.fixtures,
      terminal: auditBefore.terminal,
      open: auditBefore.open,
      safeToFinalizeStats: auditBefore.safeToFinalizeStats,
      openByStatus: auditBefore.openByStatus,
      openByLeague: auditBefore.openByLeague
    },
    auditAfter: auditAfter
      ? {
          fixtures: auditAfter.fixtures,
          terminal: auditAfter.terminal,
          open: auditAfter.open,
          safeToFinalizeStats: auditAfter.safeToFinalizeStats,
          openByStatus: auditAfter.openByStatus,
          openByLeague: auditAfter.openByLeague
        }
      : null,
    updatedRows: updated,
    unresolvedRows: unresolved
  };

  const reportDir = resolveDataPath("finalization-repair-reports");
  const reportFile = path.join(reportDir, `${dayKey}-event-summary${write ? "" : "-dry-run"}.json`);
  writeJsonPretty(reportFile, report);

  return {
    ...report,
    reportFile
  };
}

function parseArgs(argv) {
  const out = {
    dayKey: null,
    write: false,
    limit: Infinity
  };

  for (const arg of argv) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
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

    if (arg.startsWith("--limit=")) {
      out.limit = Number(arg.slice("--limit=".length));
      continue;
    }
  }

  return out;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.dayKey) {
    console.error(JSON.stringify({
      ok: false,
      reason: "missing_day",
      usage: "node engine-v1/jobs/reconcile-final-scores-from-event-summary-day.js --date=YYYY-MM-DD [--write]"
    }, null, 2));
    process.exitCode = 1;
  } else {
    const result = await reconcileFinalScoresFromEventSummaryDay(args.dayKey, args);
    console.log(JSON.stringify(result, null, 2));

    if (result.unresolved > 0) {
      process.exitCode = 2;
    }
  }
}
