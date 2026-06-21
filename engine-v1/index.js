import express from "express";
import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import { athensDayKey, shiftDay } from "./core/daykey.js";
import { ingestDay } from "./jobs/ingest-day.js";
import { finalizeDayIfSafe } from "./jobs/finalize-day.js";
import { auditWindow } from "./jobs/audit-window.js";
import { discoverActiveLeagues } from "./jobs/discover-active-leagues.js";
import { monitorActiveLeagues } from "./jobs/monitor-active-leagues.js";
import { runDailyCycle } from "./jobs/run-daily-cycle.js";
import { discoverWindow } from "./jobs/discover-window.js";
import { buildFixturesRuntime } from "./api/fixtures-runtime.js";
import { getFixtureById } from "./storage/json-db.js";
import { buildValueDay } from "./core/build-value-day.js";
import { buildDetailsDay } from "./jobs/build-details-day.js";
import { getDetailsPayload } from "./api/details.js";
import { resolveDataPath } from "./storage/data-root.js";
import { buildMatchIntelligence } from "./core/build-match-intelligence.js";
import { getOddsSnapshot, getOddsForDay, readOdds } from "./storage/odds-memory-db.js";
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3010;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OPS_JOBS = new Map();
const OPS_JOB_MAX_LOG = 16000;


app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});


function nowIso() {
  return new Date().toISOString();
}

function trimLog(value) {
  const s = String(value || "");
  if (s.length <= OPS_JOB_MAX_LOG) return s;
  return s.slice(s.length - OPS_JOB_MAX_LOG);
}

function publicJob(job) {
  if (!job) return null;

  return {
    id: job.id,
    type: job.type,
    dayKey: job.dayKey,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || null,
    runtimeMs: job.finishedAt
      ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
      : Date.now() - new Date(job.startedAt).getTime(),
    exitCode: job.exitCode ?? null,
    signal: job.signal || null,
    pid: job.pid || null,
    command: job.command,
    args: job.args,
    stdoutTail: job.stdoutTail || "",
    stderrTail: job.stderrTail || "",
    result: job.result || null,
    error: job.error || null
  };
}

function latestRunningJob(type, dayKey) {
  for (const job of OPS_JOBS.values()) {
    if (
      job.type === type &&
      job.dayKey === dayKey &&
      ["queued", "running"].includes(job.status)
    ) {
      return job;
    }
  }

  return null;
}

function startOpsChildJob({ type, dayKey, command, args, cwd }) {
  const existing = latestRunningJob(type, dayKey);

  if (existing) {
    return {
      created: false,
      job: existing
    };
  }

  const id = `${type}:${dayKey}:${Date.now()}`;

  const job = {
    id,
    type,
    dayKey,
    status: "queued",
    startedAt: nowIso(),
    finishedAt: null,
    exitCode: null,
    signal: null,
    pid: null,
    command,
    args,
    cwd,
    stdoutTail: "",
    stderrTail: "",
    result: null,
    error: null
  };

  OPS_JOBS.set(id, job);

  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  job.status = "running";
  job.pid = child.pid;

  child.stdout.on("data", chunk => {
    const text = chunk.toString();
    job.stdoutTail = trimLog((job.stdoutTail || "") + text);
    process.stdout.write(`[ops:${id}:stdout] ${text}`);
  });

  child.stderr.on("data", chunk => {
    const text = chunk.toString();
    job.stderrTail = trimLog((job.stderrTail || "") + text);
    process.stderr.write(`[ops:${id}:stderr] ${text}`);
  });

  child.on("error", err => {
    job.status = "failed";
    job.error = String(err?.message || err);
    job.finishedAt = nowIso();
  });

  child.on("close", (code, signal) => {
    job.exitCode = code;
    job.signal = signal || null;
    job.finishedAt = nowIso();
    job.status = code === 0 ? "succeeded" : "failed";

    const out = String(job.stdoutTail || "").trim();
    const jsonStart = out.lastIndexOf("{");

    if (jsonStart >= 0) {
      try {
        job.result = JSON.parse(out.slice(jsonStart));
      } catch {
        job.result = null;
      }
    }
  });

  return {
    created: true,
    job
  };
}

function startBuildDetailsJob(dayKey, { rebuild = false } = {}) {
  const args = [
    path.join(__dirname, "jobs", "build-details-day.js"),
    dayKey
  ];

  if (rebuild) args.push("--rebuild");

  return startOpsChildJob({
    type: "build-details",
    dayKey,
    command: process.execPath,
    args,
    cwd: __dirname
  });
}

function startValueBuildJob(dayKey, { rebuild = false } = {}) {
  const code = `
    import { buildValueDay } from "./core/build-value-day.js";
    const dayKey = process.argv[1];
    const rebuild = process.argv.includes("--rebuild");
    const result = await buildValueDay(dayKey, { rebuild });
    console.log(JSON.stringify(result));
  `;

  const args = ["--input-type=module", "-e", code, dayKey];

  if (rebuild) args.push("--rebuild");

  return startOpsChildJob({
    type: "value-build",
    dayKey,
    command: process.execPath,
    args,
    cwd: __dirname
  });
}

function intParam(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolParam(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}


function shouldIncludeValuePick(p) {
  const market = String(p?.market ?? p?.marketName ?? "").trim();
  const scoreNum = Number(p?.score);

  if (!Number.isFinite(scoreNum)) return false;

  if (market === "Over / Under 1.5") {
    return scoreNum >= 0.70;
  }

  if (market === "Over / Under 3.5") {
    return scoreNum >= 0.64;
  }

  if (market === "BTTS") {
    return scoreNum >= 0.64;
  }

  if (market === "1X2") {
    return scoreNum >= 0.64;
  }

  if (market === "Over / Under 2.5") {
    return scoreNum >= 0.58;
  }

  return false;
}

function csvEscape(value) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function dateRange(from, to) {
  const out = [];
  const [fy, fm, fd] = String(from).split("-").map(Number);
  const [ty, tm, td] = String(to).split("-").map(Number);

  const start = new Date(Date.UTC(fy, fm - 1, fd, 12, 0, 0));
  const end = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }

  return out;
}

function readJsonFileSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function truthyEnv(value) {
  const s = String(value || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isRenderRuntime() {
  return Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL);
}

function snapshotOnlyMode() {
  return String(process.env.APP_MODE || "").trim().toUpperCase() === "SNAPSHOT_ONLY" ||
    truthyEnv(process.env.AIML_SNAPSHOT_ONLY);
}

function allowRuntimeBuilds() {
  return truthyEnv(process.env.ALLOW_RUNTIME_BUILDS) || truthyEnv(process.env.AIML_ALLOW_RUNTIME_BUILDS);
}

function runtimeBuildsDisabled() {
  return snapshotOnlyMode() || (isRenderRuntime() && !allowRuntimeBuilds());
}

function deploySnapshotRoot(dayKey) {
  return resolveDataPath("deploy-snapshots", String(dayKey));
}

function deploySnapshotLatestFile() {
  return resolveDataPath("deploy-snapshots", "latest.json");
}

function readDeploySnapshotLatest() {
  return readJsonFileSafe(deploySnapshotLatestFile(), null);
}

function deploySnapshotManifestFile(dayKey) {
  return path.join(deploySnapshotRoot(dayKey), "manifest.json");
}

function readDeploySnapshotManifest(dayKey) {
  return readJsonFileSafe(deploySnapshotManifestFile(dayKey), null);
}

function deploySnapshotExists(dayKey) {
  return Boolean(readDeploySnapshotManifest(dayKey)?.ok);
}

function resolveSnapshotDate(requestedDate = "") {
  const explicit = String(requestedDate || "").trim();

  // If the caller asks for a specific date, never silently fall back to latest.
  // Missing explicit snapshots must surface as not_found/empty for that date.
  if (explicit) {
    return explicit;
  }

  const latest = readDeploySnapshotLatest();
  const latestDate = String(latest?.date || "").trim();

  if (latestDate && deploySnapshotExists(latestDate)) {
    return latestDate;
  }

  return latestDate || "";
}

function readDeploySnapshotValue(dayKey) {
  const filePath = path.join(deploySnapshotRoot(dayKey), "value.json");
  return readJsonFileSafe(filePath, null);
}

function readDeploySnapshotFixtures(dayKey) {
  const filePath = path.join(deploySnapshotRoot(dayKey), "fixtures.json");
  return readJsonFileSafe(filePath, null);
}

function readDeploySnapshotDetail(dayKey, matchId) {
  const filePath = path.join(deploySnapshotRoot(dayKey), "details", `${String(matchId)}.json`);
  return readJsonFileSafe(filePath, null);
}

function snapshotValueResponse(dayKey) {
  const resolvedDate = resolveSnapshotDate(dayKey);
  const payload = resolvedDate ? readDeploySnapshotValue(resolvedDate) : null;
  const manifest = resolvedDate ? readDeploySnapshotManifest(resolvedDate) : null;

  if (!payload) {
    return {
      ok: false,
      error: "snapshot_value_not_found",
      date: resolvedDate || String(dayKey || ""),
      source: "snapshot"
    };
  }

  const picks = Array.isArray(payload?.picks) ? payload.picks : [];

  return {
    ...payload,
    ok: payload?.ok !== false,
    date: resolvedDate,
    count: picks.length,
    picks,
    source: "snapshot",
    snapshot: {
      date: resolvedDate,
      generatedAt: manifest?.generatedAt || null,
      hash: manifest?.hash || null,
      valueCount: picks.length,
      detailsCount: Number(manifest?.counts?.details || 0),
      fixturesCount: Number(manifest?.counts?.fixtures || 0)
    }
  };
}

function readPositiveHoursEnv(name, fallback) {
  const n = Number(process.env[name] || fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function snapshotLiveStaleThresholdHours(match = null) {
  const text = snapshotStatusText(match);

  if (
    text.includes("FIRST_HALF") ||
    text.includes("STATUS_FIRST_HALF") ||
    text.includes("1ST_HALF")
  ) {
    return readPositiveHoursEnv("AIML_STALE_FIRST_HALF_HOURS", 1.35);
  }

  if (
    text.includes("HALF_TIME") ||
    text.includes("HALFTIME") ||
    text.includes("STATUS_HALFTIME") ||
    text === "HT"
  ) {
    return readPositiveHoursEnv("AIML_STALE_HALF_TIME_HOURS", 1.75);
  }

  if (
    text.includes("SECOND_HALF") ||
    text.includes("STATUS_SECOND_HALF") ||
    text.includes("2ND_HALF")
  ) {
    return readPositiveHoursEnv("AIML_STALE_SECOND_HALF_HOURS", 2.15);
  }

  return readPositiveHoursEnv("AIML_STALE_LIVE_HOURS", 2.25);
}

function snapshotPreStaleThresholdHours() {
  return readPositiveHoursEnv("AIML_STALE_PRE_HOURS", 0.75);
}

function snapshotStatusText(match) {
  return [
    match?.status,
    match?.rawStatus,
    match?.statusType,
    match?.statusName,
    match?.state,
    match?.phase
  ]
    .filter(Boolean)
    .map(value => String(value).trim().toUpperCase())
    .join(" ");
}

function isSnapshotLiveLikeStatus(match) {
  const text = snapshotStatusText(match);

  return (
    text.includes("LIVE") ||
    text.includes("IN_PROGRESS") ||
    text.includes("FIRST_HALF") ||
    text.includes("SECOND_HALF") ||
    text.includes("HALFTIME") ||
    text.includes("STATUS_FIRST_HALF") ||
    text.includes("STATUS_SECOND_HALF") ||
    text.includes("STATUS_HALFTIME")
  );
}

function snapshotKickoffMs(match) {
  const value =
    match?.kickoffUtc ||
    match?.date ||
    match?.startTime ||
    match?.startUtc ||
    null;

  const ms = Date.parse(String(value || ""));

  return Number.isFinite(ms) ? ms : null;
}

function parseSnapshotMinute(value) {
  const match = String(value || "").trim().match(/(\d{1,3})/);
  if (!match) return null;

  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function snapshotExpectedMinuteFromKickoffAge(ageMinutes) {
  if (!Number.isFinite(ageMinutes)) return null;

  if (ageMinutes <= 45) return Math.max(0, ageMinutes);
  if (ageMinutes <= 60) return 45;

  return Math.min(120, ageMinutes - 15);
}

function snapshotLiveMinuteLag(match, nowMs = Date.now()) {
  if (!isSnapshotLiveLikeStatus(match)) return null;

  const kickoffMs = snapshotKickoffMs(match);
  if (!Number.isFinite(kickoffMs)) return null;

  const sourceMinute = parseSnapshotMinute(match?.minute);
  if (!Number.isFinite(sourceMinute)) return null;

  const ageMinutes = (nowMs - kickoffMs) / 60000;
  const expectedMinute = snapshotExpectedMinuteFromKickoffAge(ageMinutes);
  if (!Number.isFinite(expectedMinute)) return null;

  return {
    sourceMinute,
    expectedMinute,
    minuteLag: expectedMinute - sourceMinute,
    ageMinutes
  };
}

function isSnapshotLiveMinuteLagStaleMatch(match, nowMs = Date.now()) {
  const lag = snapshotLiveMinuteLag(match, nowMs);
  if (!lag) return false;

  const minAgeMinutes = Number(process.env.AIML_STALE_LIVE_MINUTE_LAG_MIN_AGE_MINUTES || 95);
  const maxSourceMinute = Number(process.env.AIML_STALE_LIVE_MINUTE_LAG_MAX_SOURCE_MINUTE || 80);
  const minLagMinutes = Number(process.env.AIML_STALE_LIVE_MINUTE_LAG_MINUTES || 25);

  return (
    Number.isFinite(minAgeMinutes) &&
    Number.isFinite(maxSourceMinute) &&
    Number.isFinite(minLagMinutes) &&
    lag.ageMinutes >= minAgeMinutes &&
    lag.sourceMinute < maxSourceMinute &&
    lag.minuteLag >= minLagMinutes
  );
}

function isSnapshotStaleLiveMatch(match, nowMs = Date.now()) {
  if (!isSnapshotLiveLikeStatus(match)) return false;

  const kickoffMs = snapshotKickoffMs(match);
  if (!Number.isFinite(kickoffMs)) return false;

  const ageHours = (nowMs - kickoffMs) / 36e5;

  return (
    ageHours >= snapshotLiveStaleThresholdHours(match) ||
    isSnapshotLiveMinuteLagStaleMatch(match, nowMs)
  );
}

function isSnapshotPreLikeStatus(match) {
  const text = snapshotStatusText(match);

  return (
    text.includes("PRE") ||
    text.includes("SCHEDULED") ||
    text.includes("STATUS_SCHEDULED") ||
    text.includes("NOT_STARTED")
  );
}

function isSnapshotStalePreMatch(match, nowMs = Date.now()) {
  if (!isSnapshotPreLikeStatus(match)) return false;

  const kickoffMs = snapshotKickoffMs(match);
  if (!Number.isFinite(kickoffMs)) return false;

  const ageHours = (nowMs - kickoffMs) / 36e5;

  return ageHours >= snapshotPreStaleThresholdHours();
}

function sanitizeSnapshotRuntimeMatch(match, nowMs = Date.now()) {
  if (!match || typeof match !== "object") return match;

  const kickoffMs = snapshotKickoffMs(match);
  const ageHours = Number.isFinite(kickoffMs)
    ? Math.round(((nowMs - kickoffMs) / 36e5) * 100) / 100
    : null;

  if (isSnapshotStaleLiveMatch(match, nowMs)) {
    const minuteLag = snapshotLiveMinuteLag(match, nowMs);
    const staleLiveReason = isSnapshotLiveMinuteLagStaleMatch(match, nowMs)
      ? "snapshot_live_minute_lag_too_high"
      : "snapshot_live_status_too_old_for_kickoff";

    return {
      ...match,
      status: "STALE_LIVE",
      rawStatus: match.rawStatus || match.status || null,
      statusType: "STALE_LIVE",
      statusName: "Stale live snapshot",
      phase: "STALE_LIVE",
      live: false,
      isLive: false,
      staleLive: true,
      staleLiveReason,
      staleLiveAgeHours: ageHours,
      staleLiveThresholdHours: snapshotLiveStaleThresholdHours(match),
      staleLiveSourceMinute: minuteLag?.sourceMinute ?? null,
      staleLiveExpectedMinute: Number.isFinite(minuteLag?.expectedMinute)
        ? Math.round(minuteLag.expectedMinute * 10) / 10
        : null,
      staleLiveMinuteLag: Number.isFinite(minuteLag?.minuteLag)
        ? Math.round(minuteLag.minuteLag * 10) / 10
        : null,
      sourceStatus: match.status || null,
      sourceStatusType: match.statusType || null,
      sourcePhase: match.phase || null
    };
  }

  if (isSnapshotStalePreMatch(match, nowMs)) {
    return {
      ...match,
      status: "STALE_PRE",
      rawStatus: match.rawStatus || match.status || null,
      statusType: "STALE_PRE",
      statusName: "Stale scheduled snapshot",
      phase: "STALE_PRE",
      live: false,
      isLive: false,
      stalePre: true,
      stalePreReason: "snapshot_scheduled_status_too_old_for_kickoff",
      stalePreAgeHours: ageHours,
      stalePreThresholdHours: snapshotPreStaleThresholdHours(),
      sourceStatus: match.status || null,
      sourceStatusType: match.statusType || null,
      sourcePhase: match.phase || null
    };
  }

  return match;
}

function snapshotFixturesRuntimeResponse(mode, dayKey) {
  const resolvedDate = resolveSnapshotDate(dayKey);
  const payload = resolvedDate ? readDeploySnapshotFixtures(resolvedDate) : null;
  const manifest = resolvedDate ? readDeploySnapshotManifest(resolvedDate) : null;

  if (!payload) {
    return {
      ok: false,
      error: "snapshot_fixtures_not_found",
      mode,
      date: resolvedDate || String(dayKey || ""),
      source: "snapshot"
    };
  }

  const rawMatches = Array.isArray(payload?.fixtures)
    ? payload.fixtures
    : Array.isArray(payload?.matches)
      ? payload.matches
      : Array.isArray(payload)
        ? payload
        : [];

  const matches = rawMatches.map(match => sanitizeSnapshotRuntimeMatch(match));

  return {
    ok: true,
    mode,
    date: resolvedDate,
    count: matches.length,
    matches,
    source: "snapshot",
    snapshot: {
      date: resolvedDate,
      generatedAt: manifest?.generatedAt || null,
      hash: manifest?.hash || null,
      valueCount: Number(manifest?.counts?.valuePicks || 0),
      detailsCount: Number(manifest?.counts?.details || 0),
      fixturesCount: matches.length
    }
  };
}

function snapshotDetailsResponse(matchId, requestedDate = "") {
  const datesToTry = [];

  const explicitDate = String(requestedDate || "").trim();
  if (explicitDate) datesToTry.push(explicitDate);

  const latestDate = resolveSnapshotDate(explicitDate);
  if (latestDate && !datesToTry.includes(latestDate)) datesToTry.push(latestDate);

  const snapshotsRoot = resolveDataPath("deploy-snapshots");

  try {
    if (fs.existsSync(snapshotsRoot)) {
      const discoveredDates = fs.readdirSync(snapshotsRoot)
        .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
        .sort()
        .reverse();

      for (const date of discoveredDates) {
        if (!datesToTry.includes(date)) datesToTry.push(date);
      }
    }
  } catch {
    // ignore discovery errors and use explicit/latest candidates
  }

  for (const date of datesToTry) {
    const detail = readDeploySnapshotDetail(date, matchId);
    if (!detail) continue;

    const valuePayload = readDeploySnapshotValue(date);
    const picks = Array.isArray(valuePayload?.picks)
      ? valuePayload.picks.filter(p => String(p?.matchId) === String(matchId))
      : [];

    const manifest = readDeploySnapshotManifest(date);

    return {
      ok: true,
      matchId: String(matchId),
      dayKey: date,
      basic: detail?.basic || detail?.fixture || {
        matchId: String(matchId),
        leagueSlug: detail?.leagueSlug || null,
        leagueName: detail?.leagueName || null,
        homeTeam: detail?.homeTeam || null,
        awayTeam: detail?.awayTeam || null,
        kickoffUtc: detail?.kickoffUtc || null,
        status: detail?.status || null
      },
      value: picks,
      snapshot: detail,
      source: "snapshot",
      meta: {
        hasSnapshot: true,
        hasValue: picks.length > 0,
        isLive: String(detail?.basic?.status || detail?.status || "").toUpperCase() === "LIVE",
        isFinal: String(detail?.basic?.status || detail?.status || "").toUpperCase() === "FT",
        version: "details-api-v1-snapshot",
        snapshot: {
          date,
          generatedAt: manifest?.generatedAt || null,
          hash: manifest?.hash || null,
          valueCount: Number(manifest?.counts?.valuePicks || 0),
          detailsCount: Number(manifest?.counts?.details || 0),
          fixturesCount: Number(manifest?.counts?.fixtures || 0)
        }
      }
    };
  }

  return {
    ok: false,
    error: "snapshot_detail_not_found",
    matchId: String(matchId),
    source: "snapshot"
  };
}

function rejectRuntimeBuild(res, endpoint, dayKey) {
  res.status(403).json({
    ok: false,
    error: "runtime_build_disabled",
    endpoint,
    date: String(dayKey || ""),
    message: "Runtime builds are disabled in snapshot/Render mode. Build locally or in GitHub Actions, export deploy snapshot, then redeploy/read snapshot.",
    source: "snapshot_guard"
  });
}




app.get("/ops/job-status", (req, res) => {
  const id = String(req.query.id || "");

  if (id) {
    const job = OPS_JOBS.get(id);

    if (!job) {
      res.status(404).json({
        ok: false,
        error: "job_not_found",
        id
      });
      return;
    }

    res.json({
      ok: true,
      job: publicJob(job)
    });
    return;
  }

  const jobs = Array.from(OPS_JOBS.values())
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, 20)
    .map(publicJob);

  res.json({
    ok: true,
    count: jobs.length,
    jobs
  });
});

app.get("/ops/build-details-async", (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const rebuild = boolParam(req.query.rebuild, false);

  if (runtimeBuildsDisabled()) {
    return rejectRuntimeBuild(res, "/ops/build-details-async", dayKey);
  }

  const { created, job } = startBuildDetailsJob(dayKey, { rebuild });

  res.json({
    ok: true,
    accepted: true,
    created,
    job: publicJob(job)
  });
});

app.get("/ops/value-build-async", (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const rebuild = boolParam(req.query.rebuild, false);

  if (runtimeBuildsDisabled()) {
    return rejectRuntimeBuild(res, "/ops/value-build-async", dayKey);
  }

  const { created, job } = startValueBuildJob(dayKey, { rebuild });

  res.json({
    ok: true,
    accepted: true,
    created,
    job: publicJob(job)
  });
});

app.get("/deploy-snapshot/latest", (_req, res) => {
  const latest = readDeploySnapshotLatest();

  if (!latest) {
    res.status(404).json({
      ok: false,
      error: "deploy_snapshot_latest_not_found",
      source: "snapshot"
    });
    return;
  }

  res.json({
    ...latest,
    source: "snapshot"
  });
});

app.get("/deploy-snapshot", (req, res) => {
  const requestedDate = String(req.query.date || "");
  const date = resolveSnapshotDate(requestedDate);
  const manifest = date ? readDeploySnapshotManifest(date) : null;

  if (!manifest) {
    res.status(404).json({
      ok: false,
      error: "deploy_snapshot_not_found",
      date: requestedDate,
      source: "snapshot"
    });
    return;
  }

  res.json({
    ok: true,
    source: "snapshot",
    date,
    manifest
  });
});

app.get("/debug/deploy-snapshot", (req, res) => {
  const requestedDate = String(req.query.date || "");
  const date = resolveSnapshotDate(requestedDate);
  const manifest = date ? readDeploySnapshotManifest(date) : null;
  const value = date ? readDeploySnapshotValue(date) : null;
  const fixtures = date ? readDeploySnapshotFixtures(date) : null;

  if (!manifest) {
    res.status(404).json({
      ok: false,
      error: "deploy_snapshot_not_found",
      date: requestedDate,
      source: "snapshot"
    });
    return;
  }

  res.json({
    ok: true,
    source: "snapshot",
    date,
    generatedAt: manifest?.generatedAt || null,
    hash: manifest?.hash || null,
    counts: manifest?.counts || null,
    coverage: manifest?.coverage || null,
    sizes: manifest?.sizes || null,
    files: {
      manifest: fileInfoSafe("deploy-snapshots", date, "manifest.json"),
      fixtures: fileInfoSafe("deploy-snapshots", date, "fixtures.json"),
      value: fileInfoSafe("deploy-snapshots", date, "value.json"),
      detailsDir: dirInfoSafe("deploy-snapshots", date, "details")
    },
    runtime: {
      appMode: process.env.APP_MODE || null,
      snapshotOnlyMode: snapshotOnlyMode(),
      render: isRenderRuntime(),
      runtimeBuildsDisabled: runtimeBuildsDisabled(),
      allowRuntimeBuilds: allowRuntimeBuilds()
    },
    payloadCounts: {
      fixtures: Array.isArray(fixtures?.fixtures) ? fixtures.fixtures.length : 0,
      valuePicks: Array.isArray(value?.picks) ? value.picks.length : 0
    }
  });
});
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "engine-v1" });
});

app.get("/fixtures-runtime", (req, res) => {
  try {
    const mode = String(req.query.mode || "today");
    const dayKey = String(req.query.date || athensDayKey());

    if (snapshotOnlyMode()) {
      const snapshotResult = snapshotFixturesRuntimeResponse(mode, dayKey);

      if (snapshotResult.ok) {
        res.json(snapshotResult);
        return;
      }
    }

    const rows = buildFixturesRuntime(mode, dayKey);

    res.json({
      ok: true,
      mode,
      date: dayKey,
      count: rows.length,
      matches: rows,
      source: "runtime"
    });
  } catch (err) {
    console.error("[fixtures-runtime] failed", err?.message || err);

    if (runtimeBuildsDisabled()) {
      const mode = String(req.query.mode || "today");
      const dayKey = String(req.query.date || athensDayKey());
      const snapshotResult = snapshotFixturesRuntimeResponse(mode, dayKey);

      if (snapshotResult.ok) {
        res.json(snapshotResult);
        return;
      }
    }

    res.status(503).json({
      ok: false,
      error: "fixtures_runtime_unavailable",
      message: String(err?.message || err)
    });
  }
});




function fileInfoSafe(...parts) {
  const filePath = resolveDataPath(...parts);

  try {
    if (!fs.existsSync(filePath)) {
      return {
        exists: false,
        path: filePath,
        bytes: 0,
        mb: 0
      };
    }

    const stat = fs.statSync(filePath);

    return {
      exists: true,
      path: filePath,
      bytes: stat.size,
      mb: Number((stat.size / 1024 / 1024).toFixed(2))
    };
  } catch (err) {
    return {
      exists: false,
      path: filePath,
      error: String(err?.message || err)
    };
  }
}

function dirInfoSafe(...parts) {
  const dirPath = resolveDataPath(...parts);

  try {
    if (!fs.existsSync(dirPath)) {
      return {
        exists: false,
        path: dirPath,
        fileCount: 0
      };
    }

    const files = fs.readdirSync(dirPath)
      .filter(name => name.endsWith(".json"));

    return {
      exists: true,
      path: dirPath,
      fileCount: files.length,
      sample: files.slice(0, 10)
    };
  } catch (err) {
    return {
      exists: false,
      path: dirPath,
      error: String(err?.message || err)
    };
  }
}

app.get("/debug/value-inputs", (req, res) => {
  const date = String(req.query.date || athensDayKey());
  const season = String(req.query.season || "2025-2026");

  res.json({
    ok: true,
    date,
    season,
    cwd: process.cwd(),
    inputs: {
      fixtures: fileInfoSafe("fixtures.json"),
      valueFile: fileInfoSafe("value", `${date}.json`),
      detailsDir: dirInfoSafe("details", date),
      modelPriors: fileInfoSafe("model-priors", `${season}.json`),
      history: fileInfoSafe("history", `${season}.json`),
      historyIndexTeamForm: fileInfoSafe("history-index", "team-form", `${season}.json`),
      historyIndexMatchups: fileInfoSafe("history-index", "matchups", `${season}.json`),
      observations: fileInfoSafe("observations.json")
    }
  });
});

app.get("/value-picks", async (req, res) => {
  const date = String(req.query.date || athensDayKey());
  const rebuild = boolParam(req.query.rebuild, false);

  if (runtimeBuildsDisabled()) {
    if (rebuild) {
      return rejectRuntimeBuild(res, "/value-picks?rebuild=true", date);
    }

    const snapshotResult = snapshotValueResponse(date);

    if (snapshotResult.ok) {
      res.json(snapshotResult);
      return;
    }

    res.status(404).json(snapshotResult);
    return;
  }

  if (!rebuild) {
    const snapshotResult = snapshotValueResponse(date);

    if (snapshotOnlyMode() && snapshotResult.ok) {
      res.json(snapshotResult);
      return;
    }
  }

  const result = await buildValueDay(date, { rebuild });
  res.json({
    ...result,
    source: "runtime"
  });
});

app.get("/value-export/range", async (req, res) => {
  const from = String(req.query.from || athensDayKey());
  const to = String(req.query.to || from);
  const format = String(req.query.format || "csv").toLowerCase();
  const days = dateRange(from, to);
  const rebuild = boolParam(req.query.rebuild, false);

  if (runtimeBuildsDisabled() && rebuild) {
    return rejectRuntimeBuild(res, "/value-export/range?rebuild=true", from);
  }

  const rows = [];

  for (const date of days) {
    let result = null;

    if (runtimeBuildsDisabled()) {
      result = snapshotValueResponse(date);
    } else {
      result = await buildValueDay(date, { rebuild });
    }

    const picks = Array.isArray(result?.picks) ? result.picks : [];
    const filtered = picks.filter(shouldIncludeValuePick);

    for (const p of filtered) {
      rows.push({
        date,
        kickoff: p.kickoff,
        league: p.leagueSlug,
        home: p.homeTeam,
        away: p.awayTeam,
        market: p.market,
        pick: p.pick,
        score: p.score,
        confidence: p.confidence,
        result: p.result ?? null,
        source: result?.source || null
      });
    }
  }

if (format === "json") {
  return res.json({
    ok: true,
    from,
    to,
    count: rows.length,
    picks: rows
  });
}

if (format === "xlsx") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Value Picks");

  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Kickoff", key: "kickoff", width: 22 },
    { header: "League", key: "league", width: 16 },
    { header: "Home", key: "home", width: 24 },
    { header: "Away", key: "away", width: 24 },
    { header: "Market", key: "market", width: 20 },
    { header: "Pick", key: "pick", width: 16 },
    { header: "Score", key: "score", width: 10 },
    { header: "Confidence", key: "confidence", width: 12 },
    { header: "Result", key: "result", width: 12 },
    { header: "Source", key: "source", width: 14 }
  ];

  for (const row of rows) {
    sheet.addRow({
      date: row.date,
      kickoff: row.kickoff,
      league: row.league,
      home: row.home,
      away: row.away,
      market: row.market,
      pick: row.pick,
      score: Number(row.score),
      confidence: Number(row.confidence),
      result: row.result || "",
      source: row.source || ""
    });
  }

  // Header style
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  // Alignment by column
  ["A", "B", "C", "F", "G", "H", "I", "J", "K"].forEach((col) => {
    sheet.getColumn(col).alignment = {
      vertical: "middle",
      horizontal: "center"
    };
  });

  ["D", "E"].forEach((col) => {
    sheet.getColumn(col).alignment = {
      vertical: "middle",
      horizontal: "left"
    };
  });

  // Number formatting
  sheet.getColumn("H").numFmt = "0.000";
  sheet.getColumn("I").numFmt = "0.000";

  // Freeze header
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  // Auto filter
  sheet.autoFilter = {
    from: "A1",
    to: "K1"
  };

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="value-picks-${from}_to_${to}.xlsx"`
  );

  await workbook.xlsx.write(res);
  return res.end();
}

if (format !== "csv") {
  return res.json({
    ok: true,
    from,
    to,
    count: rows.length,
    picks: rows
  });
}

  const header = [
    "date",
    "kickoff",
    "league",
    "home",
    "away",
    "market",
    "pick",
    "score",
    "confidence",
    "result",
    "source"
  ];

  const lines = [header.join(",")];

  for (const row of rows) {
    lines.push([
      row.date,
      row.kickoff,
      row.league,
      csvEscape(row.home),
      csvEscape(row.away),
      csvEscape(row.market),
      csvEscape(row.pick),
      row.score,
      row.confidence,
      csvEscape(row.result || ""),
      csvEscape(row.source || "")
    ].join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="value-picks-${from}_to_${to}.csv"`
  );

  res.send(lines.join("\n"));
});

app.get("/ingest", async (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const result = await ingestDay(dayKey);
  res.json({ ok: true, ...result });
});

app.get("/finalize", async (req, res) => {
  const dayKey = String(req.query.date || shiftDay(athensDayKey(), -1));
  const result = await finalizeDayIfSafe(dayKey);
  res.json(result);
});

app.get("/audit-window", async (req, res) => {
  const baseDay = String(req.query.date || athensDayKey());

  const result = await auditWindow({
    baseDay,
    daysBack: intParam(req.query.daysBack, 1),
    daysForward: intParam(req.query.daysForward, 1),
    includeMatches: boolParam(req.query.includeMatches, false),
    leagueLimit: intParam(req.query.leagueLimit, 0),
    concurrency: intParam(req.query.concurrency, 8),
    nonZeroOnly: boolParam(req.query.nonZeroOnly, true)
  });

  res.json({ ok: true, ...result });
});

app.get("/match", (req, res) => {
  const id = String(req.query.id || "");

  if (!id) {
    res.status(400).json({ ok: false, error: "missing_id" });
    return;
  }

  const match = getFixtureById(id);

  if (!match) {
    res.status(404).json({ ok: false, error: "match_not_found" });
    return;
  }

  res.json({
    ok: true,
    match
  });
});

// ─── Odds (autonomous AI capture: real bookmaker odds + our assessment) ──────────

// Per-match snapshot in the shape the frontend odds bridge expects.
function oddsHandler(req, res) {
  const matchId = String(req.query.matchId || req.query.id || "");
  const market = String(req.query.market || "1X2");
  if (!matchId) {
    res.status(400).json({ ok: false, error: "missing_matchId" });
    return;
  }
  const snap = getOddsSnapshot(matchId, market);
  const full = readOdds(matchId);
  res.json({ ...snap, aiAssessment: full?.aiAssessment || null });
}
app.get("/odds", oddsHandler);
app.get("/api/odds", oddsHandler);

// Whole-day picture: every captured fixture with market odds + AI assessment.
app.get("/odds/day", (req, res) => {
  const date = String(req.query.date || athensDayKey());
  res.json(getOddsForDay(date));
});

app.get("/match-intelligence", async (req, res) => {
  const id = String(req.query.id || "");

  if (!id) {
    res.status(400).json({ ok: false, error: "missing_id" });
    return;
  }

  try {
    const fixture = getFixtureById(id);

    if (!fixture) {
      res.status(404).json({ ok: false, error: "match_not_found" });
      return;
    }

    const result = await buildMatchIntelligence(fixture);

    res.json(result);
  } catch (err) {
    console.error("[match-intelligence] failed", err?.message || err);

    res.status(500).json({
      ok: false,
      error: "match_intelligence_failed",
      message: String(err?.message || err)
    });
  }
});

app.get("/details", async (req, res) => {
  const id = String(req.query.id || "");
  const date = String(req.query.date || "");
  const rebuild = boolParam(req.query.rebuild, false);

  if (!id) {
    res.status(400).json({ ok: false, error: "missing_id" });
    return;
  }

  try {
    if (runtimeBuildsDisabled()) {
      if (rebuild) {
        return rejectRuntimeBuild(res, "/details?rebuild=true", date);
      }

      const snapshotResult = snapshotDetailsResponse(id, date);

      if (snapshotResult.ok) {
        res.json(snapshotResult);
        return;
      }

      res.status(404).json(snapshotResult);
      return;
    }

    if (!rebuild && snapshotOnlyMode()) {
      const snapshotResult = snapshotDetailsResponse(id, date);

      if (snapshotResult.ok) {
        res.json(snapshotResult);
        return;
      }
    }

    const result = await getDetailsPayload(id, { rebuild });

    if (!result?.ok) {
      const status = result?.error === "match_not_found" ? 404 : 400;
      res.status(status).json(result);
      return;
    }

    res.json({
      ...result,
      source: "runtime"
    });
  } catch (err) {
    console.error("[details] failed", err?.message || err);

    res.status(500).json({
      ok: false,
      error: "details_failed",
      message: String(err?.message || err)
    });
  }
});

app.get("/build-details", async (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const rebuild = boolParam(req.query.rebuild, false);

  if (runtimeBuildsDisabled()) {
    return rejectRuntimeBuild(res, "/build-details", dayKey);
  }

  const result = await buildDetailsDay(dayKey, { rebuild });
  res.json(result);
});

app.get("/discover-active-leagues", async (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const result = await discoverActiveLeagues(dayKey);
  res.json({ ok: true, ...result });
});

app.get("/monitor-active-leagues", async (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const result = await monitorActiveLeagues(dayKey);
  res.json(result);
});

app.get("/run-daily-cycle", async (req, res) => {
  const dayKey = String(req.query.date || athensDayKey());
  const doFinalize = boolParam(req.query.finalize, true);
  const daysForward = intParam(req.query.daysForward, 2);

  if (runtimeBuildsDisabled()) {
    return rejectRuntimeBuild(res, "/run-daily-cycle", dayKey);
  }

  const result = await runDailyCycle({
    dayKey,
    doFinalize,
    daysForward
  });

  res.json(result);
});

app.get("/discover-window", async (req, res) => {
  const baseDay = String(req.query.date || athensDayKey());

  const result = await discoverWindow({
    baseDay,
    daysBack: intParam(req.query.daysBack, 0),
    daysForward: intParam(req.query.daysForward, 3)
  });

  res.json(result);
});

const command = process.argv[2];

if (command === "ingest-today") {
  const result = await ingestDay(athensDayKey());
  console.log(result);
  process.exit(0);
}

if (command === "build-details") {
  const result = await buildDetailsDay(athensDayKey(), { rebuild: false });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "ingest-yesterday") {
  const result = await ingestDay(shiftDay(athensDayKey(), -1));
  console.log(result);
  process.exit(0);
}

if (command === "finalize-yesterday") {
  const result = await finalizeDayIfSafe(shiftDay(athensDayKey(), -1));
  console.log(result);
  process.exit(0);
}

if (command === "audit-window") {
  const result = await auditWindow({
    baseDay: athensDayKey(),
    daysBack: 1,
    daysForward: 1,
    includeMatches: false,
    leagueLimit: 0,
    concurrency: 8,
    nonZeroOnly: true
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "discover-active-leagues") {
  const result = await discoverActiveLeagues(athensDayKey());
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "monitor-active-leagues") {
  const result = await monitorActiveLeagues(athensDayKey());
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "run-daily-cycle") {
  const result = await runDailyCycle({
    dayKey: athensDayKey(),
    doFinalize: false
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "discover-window") {
  const result = await discoverWindow({
    baseDay: athensDayKey(),
    daysBack: 0,
    daysForward: 3
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`engine-v1 listening on ${PORT}`);
});