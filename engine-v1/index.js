import express from "express";
import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import { athensDayKey, shiftDay, athensDayFromKickoff } from "./core/daykey.js";
import { ingestDay } from "./jobs/ingest-day.js";
import { finalizeDayIfSafe } from "./jobs/finalize-day.js";
import { auditWindow } from "./jobs/audit-window.js";
import { discoverActiveLeagues } from "./jobs/discover-active-leagues.js";
import { monitorActiveLeagues } from "./jobs/monitor-active-leagues.js";
import { runDailyCycle } from "./jobs/run-daily-cycle.js";
import { discoverWindow } from "./jobs/discover-window.js";
import { getFixtureById } from "./storage/json-db.js";
import { buildValueDay } from "./core/build-value-day.js";
import { buildDetailsDay } from "./jobs/build-details-day.js";
import { getDetailsPayload, enrichSnapshotWithAssessment } from "./api/details.js";
import { resolveDataPath } from "./storage/data-root.js";
import {
  normalizeDisplayTeam,
  canonicalDisplayTeamName,
  statusRankFromParts,
  filterByPanelMode,
  partitionDisplaySupplementsByFixtureIdentity,
  selectAuthoritativeDisplayUniverse
} from "./core/display-contract.js";
import { buildMatchIntelligence } from "./core/build-match-intelligence.js";
import { getDeployedOddsSnapshot, getDeployedOddsDay, getAssessmentRows } from "./storage/odds-memory-db.js";
import { getLeagueMetaMap } from "./source-discovery/league-awareness-service.js";
import { isDisabledLeague } from "./source-discovery/disabled-leagues.js";
import { fetchMultiBookmakerOdds, prefetchUpcomingOdds } from "./jobs/fetch-multi-bookmaker-odds.js";
import { fetchOddsApiIoDay, createOddsApiIoBudget } from "./jobs/fetch-oddsapiio-odds.js";
import { overlayFlashscoreLive } from "./odds/flashscore-live-overlay.js";
import { resolveOddsForFixtures } from "./odds/odds-fixture-bridge.js";
import { normTeam } from "./odds/multi-odds-merge.js";
import { buildStandingsBlock } from "./core/details-rich-blocks.js";
import { computeMatchdayAxis, isLeagueIntegrityGreen } from "./core/matchday-axis.js";
import { applyTrustedLeaguePresentation } from "./core/league-display-identity.js";
import { overlayResultsTruth } from "./core/results-truth-overlay.js";
import { verifyStuckLiveFinals } from "./core/live-ft-verifier.js";
import { currentSeason } from "./core/season.js";
import { validateDeploySnapshotManifest } from "./core/deploy-snapshot-release-contract.js";
import { validatePlanCShadowExportPayload } from "./value/plan-c-shadow-export.js";
import {
  requestTimeDisplayOverlaysEnabled,
  reusableDisplayRevision,
  reusableRuntimeDisplayEntry
} from "./core/runtime-display-policy.js";
import {
  VALUE_EXPORT_PLAN_ORDER,
  buildValueExportReport,
  comparisonToValueExportDay,
  fallbackPlanAToValueExportDay,
  valueExportCsvRecords
} from "./core/value-export-report.js";
import { teamPairMatches } from "./core/team-identity.js";
import {
  parseAcquisitionSkippedSlugs,
  skippedSlugsContextOnly
} from "./system-health/skipped-slug-policy.js";
import {
  collectRuntimeArtifactIssues,
  classifyRuntimeSystemHealth
} from "./system-health/runtime-report-policy.js";
import {
  collectValueSettlementIssues
} from "./system-health/value-settlement-policy.js";
import {
  collectActiveCompetitionCompletenessIssues
} from "./system-health/active-competition-completeness-policy.js";
import {
  reconcilePublicSystemHealth
} from "./system-health/public-mirror-policy.js";
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3010;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OPS_JOBS = new Map();
const OPS_JOB_MAX_LOG = 16000;
const PROCESS_STARTED_AT = new Date().toISOString();


app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Cron-Secret");

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
    ref: job.ref || null,
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

function latestRunningJob(type, dayKey, ref = null) {
  for (const job of OPS_JOBS.values()) {
    if (
      job.type === type &&
      job.dayKey === dayKey &&
      (ref === null || job.ref === ref) &&
      ["queued", "running"].includes(job.status)
    ) {
      return job;
    }
  }

  return null;
}

function startOpsChildJob({ type, dayKey, ref = null, command, args, cwd }) {
  const existing = latestRunningJob(type, dayKey, ref);

  if (existing) {
    return {
      created: false,
      job: existing
    };
  }

  const id = `${type}:${dayKey}:${ref ? String(ref).slice(0, 12) + ":" : ""}${Date.now()}`;

  const job = {
    id,
    type,
    dayKey,
    ref,
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

    const lines = String(job.stdoutTail || "")
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        job.result = JSON.parse(lines[index]);
        break;
      } catch {
        // Keep scanning earlier complete lines.
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

function startSnapshotSyncJob(dayKey, ref) {
  const args = [
    path.join(__dirname, "jobs", "sync-deploy-snapshot-from-github.js"),
    `--day=${dayKey}`,
    `--ref=${ref}`
  ];

  return startOpsChildJob({
    type: "snapshot-sync",
    dayKey,
    ref,
    command: process.execPath,
    args,
    cwd: __dirname
  });
}

function startPlanCShadowSyncJob(dayKey, ref) {
  const args = [
    path.join(__dirname, "jobs", "sync-plan-c-shadow-from-github.js"),
    `--day=${dayKey}`,
    `--ref=${ref}`
  ];

  return startOpsChildJob({
    type: "plan-c-shadow-sync",
    dayKey,
    ref,
    command: process.execPath,
    args,
    cwd: __dirname
  });
}

function startValueComparisonSyncJob(dayKey, ref) {
  const args = [
    path.join(
      __dirname,
      "jobs",
      "sync-deploy-snapshot-from-github.js"
    ),
    `--day=${dayKey}`,
    `--ref=${ref}`,
    "--comparison-only"
  ];

  return startOpsChildJob({
    type: "value-comparison-sync",
    dayKey,
    ref,
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

function runtimeSnapshotSyncStateFile() {
  return resolveDataPath("deploy-snapshots", "runtime-sync-state.json");
}

function readRuntimeSnapshotSyncState() {
  return readJsonFileSafe(runtimeSnapshotSyncStateFile(), null);
}

function deployedGitCommit() {
  const value = String(
    process.env.RENDER_GIT_COMMIT ||
    process.env.GIT_COMMIT ||
    process.env.COMMIT_SHA ||
    ""
  ).trim().toLowerCase();

  return /^[0-9a-f]{40}$/u.test(value) ? value : null;
}

function deploySnapshotManifestFile(dayKey) {
  return path.join(deploySnapshotRoot(dayKey), "manifest.json");
}

function deploySnapshotRuntimeArtifactFile(dayKey, name) {
  return path.join(deploySnapshotRoot(dayKey), "runtime", name);
}

function preferRuntimeReleaseArtifact(dayKey, name, fallbackPath) {
  const releasePath = deploySnapshotRuntimeArtifactFile(dayKey, name);
  return fs.existsSync(releasePath) ? releasePath : fallbackPath;
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

function readValidatedPlanCShadowCandidate(dayKey, filePath) {
  const payload = readJsonFileSafe(filePath, null);
  if (!payload) return null;
  const validation = validatePlanCShadowExportPayload(payload, dayKey);
  return validation.ok ? payload : null;
}

function readAvailablePlanCShadow(dayKey) {
  const candidates = [
    { source: "snapshot", file: path.join(deploySnapshotRoot(dayKey), "plan-c-shadow.json") },
    { source: "shadow_runtime_release", file: resolveDataPath("runtime-releases", "plan-c-shadow", dayKey, "plan-c-shadow.json") },
    { source: "shadow_source", file: resolveDataPath("plan-c-shadow", `${dayKey}.json`) }
  ];
  let unavailable = null;
  for (const candidate of candidates) {
    const payload = readValidatedPlanCShadowCandidate(dayKey, candidate.file);
    if (!payload) continue;
    if (payload.available === true) return { payload, source: candidate.source };
    unavailable ||= { payload, source: candidate.source };
  }
  return unavailable;
}

function readDeploySnapshotFixtures(dayKey) {
  const filePath = path.join(deploySnapshotRoot(dayKey), "fixtures.json");
  return readJsonFileSafe(filePath, null);
}

function readDeploySnapshotOdds(dayKey) {
  const filePath = path.join(deploySnapshotRoot(dayKey), "odds.json");
  return readJsonFileSafe(filePath, null);
}

// Resolve a possibly-provider matchId to the canonical id the detail file is
// keyed under. The export job aligns fixtures.json matchId → canonicalId (07-14
// hotfix) and keeps the original provider id in providerMatchId, so a client
// still holding a provider id (numeric ESPN, sourceMatchId) can be mapped here.
// Defense-in-depth for readDeploySnapshotDetail — details are canonical-keyed.
function resolveSnapshotDetailId(dayKey, matchId) {
  const id = String(matchId || "");
  try {
    const fj = readJsonFileSafe(path.join(deploySnapshotRoot(dayKey), "fixtures.json"), null);
    const rows = Array.isArray(fj) ? fj : (fj?.fixtures || fj?.matches || []);
    for (const r of rows) {
      const cands = [r?.providerMatchId, r?.sourceMatchId, r?.sourceId, r?.matchId, r?.canonicalId]
        .map(x => String(x || ""));
      if (cands.includes(id)) return String(r?.canonicalId || r?.matchId || id);
    }
  } catch { /* no fixtures.json → cannot remap */ }
  return null;
}

function readDeploySnapshotDetail(dayKey, matchId) {
  const filePath = path.join(deploySnapshotRoot(dayKey), "details", `${String(matchId)}.json`);
  const direct = readJsonFileSafe(filePath, null);
  if (direct) return direct;

  // Fallback: the requested id may be a provider id while details are keyed by
  // canonicalId. Remap via fixtures.json and retry once.
  const canonical = resolveSnapshotDetailId(dayKey, matchId);
  if (canonical && canonical !== String(matchId)) {
    return readJsonFileSafe(
      path.join(deploySnapshotRoot(dayKey), "details", `${canonical}.json`),
      null
    );
  }
  return null;
}

function snapshotValueResponse(dayKey) {
  const resolvedDate = resolveSnapshotDate(dayKey);
  const payload = resolvedDate ? readDeploySnapshotValue(resolvedDate) : null;
  const manifest = resolvedDate ? readDeploySnapshotManifest(resolvedDate) : null;

  if (!payload) {
    // Partial / not-yet-built day (e.g. a day whose slate is odds-only leagues
    // with no value coverage, or before the daily run produced value.json).
    // Return a CLEAN empty result — NOT a 404 — so the value panel shows an empty
    // state instead of hanging forever on its "Analyzing…" placeholder (the value
    // adapter drops non-2xx responses and emits nothing). `coverage:"none"` is the
    // explicit partial-day signal; `reason` preserves the old error for ops.
    return {
      ok: true,
      date: resolvedDate || String(dayKey || ""),
      count: 0,
      total: 0,
      picks: [],
      source: "snapshot",
      coverage: "none",
      reason: "snapshot_value_not_found"
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
    coverage: "complete",
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

const SNAPSHOT_RUNTIME_SLUG_ALIASES = {
  "fifa.world_cup": "fifa.world",
  "fifa.world_cup_qual": "fifa.world_qual",
};

function canonicalSnapshotRuntimeSlug(slug) {
  const raw = String(slug || "").trim();
  return SNAPSHOT_RUNTIME_SLUG_ALIASES[raw] || raw;
}

function snapshotRuntimeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.matches)) return payload.matches;
  return [];
}

function normalizeSnapshotRuntimeText(value) {
  return normalizeDisplayTeam(value);
}

function snapshotRuntimeKickoffKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const ts = Date.parse(raw);
  if (Number.isFinite(ts)) return String(ts);

  return raw.slice(0, 16);
}

function terminalMinuteSuggestsExtraTime(match) {
  const statusBlob = String([
    match?.status,
    match?.rawStatus,
    match?.statusType,
    match?.statusName
  ].filter(Boolean).join(" ")).toUpperCase();

  if (/(^|[^A-Z])AET([^A-Z]|$)/.test(statusBlob)) return true;

  const minuteText = String(match?.minute ?? "").trim();
  const minute = Number.parseInt(minuteText.replace(/[^0-9].*$/u, ""), 10);
  const terminal = statusRankFromParts(
    match?.status,
    match?.rawStatus,
    match?.statusType,
    match?.statusName
  ) === 50;

  return terminal && Number.isFinite(minute) && minute >= 120;
}

function withKnockoutScoreNamespaces(match) {
  const scoreHome = match?.scoreHome ?? match?.homeScore ?? null;
  const scoreAway = match?.scoreAway ?? match?.awayScore ?? null;
  const regulationScore = match?.regulationScore || match?.fullTimeScore || null;
  let afterExtraTimeScore = match?.afterExtraTimeScore || null;
  let decidedBy = match?.decidedBy || null;

  // A 120-minute terminal score is an AET total, not a regulation FT score.
  // Preserve it in its own namespace. Never invent the unknown 90-minute score.
  if (
    !afterExtraTimeScore &&
    scoreHome != null &&
    scoreAway != null &&
    terminalMinuteSuggestsExtraTime(match)
  ) {
    afterExtraTimeScore = { home: scoreHome, away: scoreAway };
    decidedBy = decidedBy || "AET";
  }

  return { regulationScore, afterExtraTimeScore, decidedBy };
}

function normalizeSnapshotRuntimeMatch(match, fallbackSource) {
  const leagueSlug = canonicalSnapshotRuntimeSlug(match?.leagueSlug || match?.league || "");
  const knockout = withKnockoutScoreNamespaces(match);

  return {
    ...match,
    matchId: String(match?.matchId || match?.id || ""),
    homeTeam: canonicalDisplayTeamName(match?.homeTeam || match?.home || ""),
    awayTeam: canonicalDisplayTeamName(match?.awayTeam || match?.away || ""),
    kickoffUtc: match?.kickoffUtc || match?.kickoff || "",
    status: match?.status || match?.statusType || "PRE",
    rawStatus: match?.rawStatus || match?.status || "",
    statusType: match?.statusType || match?.status || "",
    statusName: match?.statusName || "",
    leagueSlug,
    leagueName: match?.leagueName || "",
    scoreHome: match?.scoreHome ?? match?.homeScore ?? null,
    scoreAway: match?.scoreAway ?? match?.awayScore ?? null,
    regulationScore: knockout.regulationScore,
    afterExtraTimeScore: knockout.afterExtraTimeScore,
    penalties: match?.penalties || null,
    decidedBy: knockout.decidedBy,
    minute: match?.minute ?? null,
    source: match?.source || fallbackSource,
  };
}

function snapshotRuntimeDedupeKey(match) {
  const leagueSlug = canonicalSnapshotRuntimeSlug(match?.leagueSlug || "");
  const home = normalizeSnapshotRuntimeText(match?.homeTeam || match?.home);
  const away = normalizeSnapshotRuntimeText(match?.awayTeam || match?.away);
  const kickoff = snapshotRuntimeKickoffKey(match?.kickoffUtc || match?.kickoff);

  return [leagueSlug, home, away, kickoff].join("|");
}

function addSnapshotRuntimeMatch(target, seen, match) {
  const normalized = normalizeSnapshotRuntimeMatch(match, "snapshot");
  if (!normalized.matchId || !normalized.homeTeam) return false;

  const key = snapshotRuntimeDedupeKey(normalized);
  if (key && seen.has(key)) return false;

  if (key) seen.add(key);
  target.push(sanitizeSnapshotRuntimeMatch(normalized));
  return true;
}

function buildSnapshotRuntimeMatches(resolvedDate) {
  const fixturesPayload = readDeploySnapshotFixtures(resolvedDate);
  if (!fixturesPayload) return null;

  const oddsPayload = readDeploySnapshotOdds(resolvedDate);
  const fixtureRows = snapshotRuntimeRows(fixturesPayload);
  const oddsRows = snapshotRuntimeRows(oddsPayload);

  const matches = [];
  const seen = new Set();

  for (const row of fixtureRows) {
    const normalized = normalizeSnapshotRuntimeMatch(row, "snapshot-fixtures");
    addSnapshotRuntimeMatch(matches, seen, normalized);
  }

  // odds.json is market enrichment only. Exact fixture membership is required;
  // orphan odds rows are audited and ignored rather than converted into PRE/FT
  // fixtures by elapsed-time or results overlays.
  const oddsMembership =
    partitionDisplaySupplementsByFixtureIdentity(fixtureRows, oddsRows);

  return {
    matches,
    fixtureCount: fixtureRows.length,
    oddsCount: oddsRows.length,
    oddsSupplementCount: 0,
    oddsMatchedFixtureCount: oddsMembership.matched.length,
    oddsOrphanRowsIgnored: oddsMembership.ignored.length,
  };
}

function snapshotFixturesRuntimeResponse(mode, dayKey) {
  const resolvedDate = resolveSnapshotDate(dayKey);
  const runtimeBuild = resolvedDate ? buildSnapshotRuntimeMatches(resolvedDate) : null;
  const manifest = resolvedDate ? readDeploySnapshotManifest(resolvedDate) : null;

  if (!runtimeBuild) {
    return {
      ok: false,
      error: "snapshot_fixtures_not_found",
      mode,
      date: resolvedDate || String(dayKey || ""),
      source: "snapshot"
    };
  }

  const matches = runtimeBuild.matches;

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
      fixturesCount: matches.length,
      baseFixturesCount: runtimeBuild.fixtureCount,
      oddsRowsCount: runtimeBuild.oddsCount,
      oddsSupplementCount: runtimeBuild.oddsSupplementCount,
      oddsMatchedFixtureCount: runtimeBuild.oddsMatchedFixtureCount,
      oddsOrphanRowsIgnored: runtimeBuild.oddsOrphanRowsIgnored
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

    // Serve-time standings overlay: the baked block is frozen at build time and
    // can be stale (bra.2 sat 4 matchdays behind) or plain wrong (a knockout
    // competition with an accumulated-results "table"). Recompute the block from
    // the live store — buildStandingsBlock carries the cup gate and the
    // integrity gate — and apply it when it is more restrictive (cup → empty)
    // or strictly FRESHER than the baked one. Never replace a newer baked table
    // with an older store (the store only updates on deploy; details rebuild daily).
    const detailSlug = String(detail?.basic?.leagueSlug || "");
    if (detailSlug && detail?.standings) {
      try {
        const live = buildStandingsBlock(detailSlug);
        const bakedAt = Date.parse(detail.standings?.updatedAt || "") || 0;
        const liveAt = Date.parse(live?.updatedAt || "") || 0;
        if (live?.reason === "not_league_competition") {
          detail.standings = live; // cups never show a table, baked or not
        } else if (live?.status === "ready" && liveAt > bakedAt) {
          detail.standings = live;
        }
      } catch { /* keep the baked block on any overlay failure */ }
    }

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

// Runtime snapshot mirror. The web process NEVER performs the sync itself:
// an authenticated request starts a child process that assembles and validates
// an immutable commit-pinned release before atomically promoting it.
function snapshotSyncEnabled() {
  return isRenderRuntime() || truthyEnv(process.env.ALLOW_SNAPSHOT_SYNC);
}

function authorizeCronRequest(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ ok: false, error: "cron_secret_not_configured" });
    return false;
  }
  if (req.headers["x-cron-secret"] !== secret) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

app.get("/ops/sync-snapshot", (_req, res) => {
  res.status(405).json({
    ok: false,
    error: "method_not_allowed",
    requiredMethod: "POST",
    contract: "authenticated_commit_pinned_child_process"
  });
});

app.post("/ops/sync-snapshot", (req, res) => {
  if (!snapshotSyncEnabled()) {
    return res.status(403).json({ ok: false, reason: "snapshot_sync_disabled" });
  }
  if (!authorizeCronRequest(req, res)) return;

  const dayKey = String(req.query.date || "").slice(0, 10);
  const ref = String(req.query.ref || "").trim().toLowerCase();

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    return res.status(400).json({ ok: false, error: "invalid_day_key" });
  }
  if (!/^[0-9a-f]{40}$/u.test(ref)) {
    return res.status(400).json({ ok: false, error: "immutable_ref_required" });
  }

  const { created, job } = startSnapshotSyncJob(dayKey, ref);
  return res.status(202).json({
    ok: true,
    accepted: true,
    created,
    job: publicJob(job)
  });
});

app.get("/ops/sync-snapshot/status", (req, res) => {
  if (!authorizeCronRequest(req, res)) return;
  const id = String(req.query.id || "");
  const job = OPS_JOBS.get(id);
  if (!job || job.type !== "snapshot-sync") {
    return res.status(404).json({ ok: false, error: "snapshot_sync_job_not_found" });
  }
  return res.json({ ok: true, job: publicJob(job) });
});

app.get("/ops/sync-plan-c-shadow", (_req, res) => {
  res.status(405).json({
    ok: false,
    error: "method_not_allowed",
    requiredMethod: "POST",
    contract: "authenticated_commit_pinned_shadow_child_process"
  });
});

app.post("/ops/sync-plan-c-shadow", (req, res) => {
  if (!snapshotSyncEnabled()) {
    return res.status(403).json({ ok: false, reason: "snapshot_sync_disabled" });
  }
  if (!authorizeCronRequest(req, res)) return;
  const dayKey = String(req.query.date || "").slice(0, 10);
  const ref = String(req.query.ref || "").trim().toLowerCase();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    return res.status(400).json({ ok: false, error: "invalid_day_key" });
  }
  if (!/^[0-9a-f]{40}$/u.test(ref)) {
    return res.status(400).json({ ok: false, error: "immutable_ref_required" });
  }
  const { created, job } = startPlanCShadowSyncJob(dayKey, ref);
  return res.status(202).json({ ok: true, accepted: true, created, job: publicJob(job) });
});

app.get("/ops/sync-plan-c-shadow/status", (req, res) => {
  if (!authorizeCronRequest(req, res)) return;
  const id = String(req.query.id || "");
  const job = OPS_JOBS.get(id);
  if (!job || job.type !== "plan-c-shadow-sync") {
    return res.status(404).json({ ok: false, error: "plan_c_shadow_sync_job_not_found" });
  }
  return res.json({ ok: true, job: publicJob(job) });
});


app.get("/ops/sync-value-comparison", (_req, res) => {
  res.status(405).json({
    ok: false,
    error: "method_not_allowed",
    requiredMethod: "POST",
    contract: "authenticated_commit_pinned_comparison_child_process"
  });
});

app.post("/ops/sync-value-comparison", (req, res) => {
  if (!snapshotSyncEnabled()) {
    return res.status(403).json({
      ok: false,
      reason: "snapshot_sync_disabled"
    });
  }

  if (!authorizeCronRequest(req, res)) return;

  const dayKey =
    String(req.query.date || "").slice(0, 10);

  const ref =
    String(req.query.ref || "")
      .trim()
      .toLowerCase();

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    return res.status(400).json({
      ok: false,
      error: "invalid_day_key"
    });
  }

  if (!/^[0-9a-f]{40}$/u.test(ref)) {
    return res.status(400).json({
      ok: false,
      error: "immutable_ref_required"
    });
  }

  const { created, job } =
    startValueComparisonSyncJob(
      dayKey,
      ref
    );

  return res.status(202).json({
    ok: true,
    accepted: true,
    created,
    job: publicJob(job)
  });
});

app.get("/ops/sync-value-comparison/status", (req, res) => {
  if (!authorizeCronRequest(req, res)) return;

  const id =
    String(req.query.id || "");

  const job =
    OPS_JOBS.get(id);

  if (
    !job ||
    job.type !== "value-comparison-sync"
  ) {
    return res.status(404).json({
      ok: false,
      error: "value_comparison_sync_job_not_found"
    });
  }

  return res.json({
    ok: true,
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

app.get("/release", (_req, res) => {
  const latest = readDeploySnapshotLatest();
  const runtimeSync = readRuntimeSnapshotSyncState();

  res.json({
    ok: true,
    service: "engine-v1",
    gitCommit: deployedGitCommit(),
    processStartedAt: PROCESS_STARTED_AT,
    runtimeDisplay: {
      requestTimeOverlaysEnabled: runtimeRequestOverlaysEnabled(),
      cacheContract: "manifest-revision"
    },
    latestSnapshot: latest
      ? {
          date: latest.date || null,
          hash: latest.hash || null,
          generatedAt: latest.generatedAt || null
        }
      : null,
    runtimeSync: runtimeSync
      ? {
          updatedAt: runtimeSync.updatedAt || null,
          latestDay: runtimeSync.latestDay || null,
          latestRef: runtimeSync.latestRef || null
        }
      : null
  });
});

app.get("/ready", (_req, res) => {
  const day = athensDayKey();
  const latest = readDeploySnapshotLatest();
  const manifest = readDeploySnapshotManifest(day);
  const validation = manifest
    ? validateDeploySnapshotManifest(manifest, day)
    : { ok: false, errors: ["manifest_missing"] };

  const latestMatches = Boolean(
    latest &&
    String(latest.date || "") === day &&
    String(latest.hash || "").toLowerCase() === String(manifest?.hash || "").toLowerCase()
  );
  const ready = validation.ok && latestMatches;

  res.status(ready ? 200 : 503).json({
    ok: ready,
    ready,
    service: "engine-v1",
    day,
    gitCommit: deployedGitCommit(),
    manifestHash: manifest?.hash || null,
    latestDay: latest?.date || null,
    latestHash: latest?.hash || null,
    errors: [
      ...(validation.errors || []),
      ...(latestMatches ? [] : ["latest_pointer_mismatch"])
    ]
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

app.get("/plan-c-shadow", (req, res) => {
  const requestedDate = String(req.query.date || "");
  if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/u.test(requestedDate)) {
    return res.status(400).json({ ok: false, available: false, error: "invalid_day_key" });
  }
  const dates = requestedDate
    ? [requestedDate]
    : [...new Set([athensDayKey(), resolveSnapshotDate("")].filter(Boolean))];
  let date = dates[0] || "";
  let loaded = null;
  for (const candidateDate of dates) {
    const candidate = readAvailablePlanCShadow(candidateDate);
    if (candidate) {
      date = candidateDate;
      loaded = candidate;
      break;
    }
  }

  if (!loaded) {
    res.status(404).json({
      ok: false,
      available: false,
      error: "plan_c_shadow_snapshot_not_found",
      date: requestedDate,
      source: "snapshot"
    });
    return;
  }

  res.json({
    ...loaded.payload,
    source: loaded.source
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
      planCShadow: fileInfoSafe("deploy-snapshots", date, "plan-c-shadow.json"),
      planCShadowAudit: fileInfoSafe("deploy-snapshots", date, "plan-c-shadow-audit.json"),
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
      valuePicks: Array.isArray(value?.picks) ? value.picks.length : 0,
      planCShadowPredictions: Number(manifest?.counts?.planCShadowPredictions || 0),
      planCShadowPicks: Number(manifest?.counts?.planCShadowPicks || 0)
    }
  });
});
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "engine-v1",
    season: currentSeason()
  });
});


function systemHealthReadJson(file) {
  try {
    if (!fs.existsSync(file)) {
      return { exists: false, ok: false, path: file, data: null, error: "missing" };
    }
    return {
      exists: true,
      ok: true,
      path: file,
      data: JSON.parse(fs.readFileSync(file, "utf8")),
      error: null
    };
  } catch (err) {
    return {
      exists: true,
      ok: false,
      path: file,
      data: null,
      error: String(err?.message || err)
    };
  }
}

function systemHealthIssue(severity, source, type, message, details = {}) {
  return { severity, source, type, message, details };
}


function systemHealthIssueCounts(issues) {
  const out = { error: 0, warning: 0, info: 0 };
  for (const issue of issues || []) {
    if (out[issue.severity] != null) out[issue.severity] += 1;
  }
  return out;
}

function systemHealthRelativeArtifact(file) {
  return String(file || "").replace(/\\/g, "/").split("/data/").pop() || String(file || "");
}

function systemHealthNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function systemHealthBuildWarningIsContextOnly(text) {
  const raw = String(text || "");
  if (!raw.startsWith("acquisition_skipped_slugs:")) return false;
  return skippedSlugsContextOnly(parseAcquisitionSkippedSlugs(raw));
}

function systemHealthInvariantWarningIssue(w) {
  const type = w?.type || "invariant_warning";

  if (type === "coverage_floor_drop") {
    const actualFixtures = systemHealthNumber(w?.actualFixtures);
    const effectiveFloor = systemHealthNumber(w?.effectiveFloor);
    const effectiveFloorMet = actualFixtures !== null
      && effectiveFloor !== null
      && actualFixtures >= effectiveFloor;

    return systemHealthIssue(
      effectiveFloorMet ? "info" : "warning",
      "invariant-report",
      type,
      effectiveFloorMet
        ? "Canonical fixtures are below static floor but meet the effective floor."
        : (w?.reason || "Canonical fixture count is below the effective floor."),
      {
        ...w,
        effectiveFloorMet
      }
    );
  }

  return systemHealthIssue(
    "warning",
    "invariant-report",
    type,
    w?.reason || "Invariant warning.",
    w
  );
}

function systemHealthBuildWarning(text) {
  const raw = String(text || "");
  if (raw.startsWith("acquisition_skipped_slugs:")) {
    const slugs = parseAcquisitionSkippedSlugs(raw);
    const contextOnly = skippedSlugsContextOnly(slugs);

    return systemHealthIssue(
      contextOnly ? "info" : "warning",
      "build-report",
      "acquisition_skipped_slugs",
      contextOnly
        ? "Acquisition skipped only known out-of-scope/context slugs."
        : "Acquisition skipped slugs during fixture acquisition.",
      { slugs, raw, contextOnly }
    );
  }

  return systemHealthIssue("warning", "build-report", "build_warning", raw, { raw });
}

function buildSystemHealthReport(day) {
  const checkedNow = new Date().toISOString();

  const files = {
    buildReport: preferRuntimeReleaseArtifact(
      day,
      "build-report.json",
      resolveDataPath("build-reports", day + ".json")
    ),
    invariant: resolveDataPath("deploy-snapshots", day, "invariant-report.json"),
    freshness: resolveDataPath("deploy-snapshots", day, "freshness-report.json"),
    manifest: resolveDataPath("deploy-snapshots", day, "manifest.json"),
    valueAudit: resolveDataPath("deploy-snapshots", day, "value-audit.json"),
    value: resolveDataPath("deploy-snapshots", day, "value.json"),
    valueComparison: preferRuntimeReleaseArtifact(
      day,
      "value-comparison.json",
      resolveDataPath("value-comparison", day + ".json")
    )
  };

  const read = {};
  for (const [key, artifact] of Object.entries(files)) {
    read[key] = systemHealthReadJson(artifact);
  }

  const issues = collectRuntimeArtifactIssues(read, {
    relativeArtifact: systemHealthRelativeArtifact
  });

  const buildReport = read.buildReport.data;
  const invariant = read.invariant.data;
  const freshness = read.freshness.data;
  const manifest = read.manifest.data;
  const valueAudit = read.valueAudit.data;
  const value = read.value.data;
  const valueComparison = read.valueComparison.data;
  const coverageReadiness =
    systemHealthReadJson(
      resolveDataPath(
        "coverage-readiness",
        day + ".json"
      )
    ).data;

  if (invariant) {
    for (const b of invariant.blocked || []) {
      issues.push(systemHealthIssue(
        "error",
        "invariant-report",
        b.type || "invariant_blocked",
        "Snapshot invariant blocked the build.",
        b
      ));
    }

    for (const a of invariant.autoFixed || []) {
      issues.push(systemHealthIssue(
        "warning",
        "invariant-report",
        "auto_fixed_" + (a.type || "issue"),
        "Invariant check auto-fixed a snapshot/detail issue.",
        a
      ));
    }

    for (const w of invariant.warnings || []) {
      issues.push(systemHealthInvariantWarningIssue(w));
    }

    if (invariant.ok === false) {
      issues.push(systemHealthIssue(
        "error",
        "invariant-report",
        "invariant_not_ok",
        "Invariant report marked the snapshot as not OK.",
        { ok: invariant.ok }
      ));
    }

    if (invariant.valueSafe === false) {
      issues.push(systemHealthIssue(
        "error",
        "invariant-report",
        "value_unsafe",
        "Invariant report marked Value output as unsafe.",
        { valueSafe: invariant.valueSafe, valueCount: invariant.valueCount }
      ));
    }
  }

  if (buildReport) {
    for (const failure of buildReport.hardFailures || []) {
      issues.push(systemHealthIssue(
        "error",
        "build-report",
        "build_hard_failure",
        String(failure),
        { failure }
      ));
    }

    const buildWarnings = Array.isArray(buildReport.warnings) ? buildReport.warnings : [];
    const buildWarningsContextOnly = buildWarnings.length > 0
      && buildWarnings.every(systemHealthBuildWarningIsContextOnly);

    for (const warning of buildWarnings) {
      issues.push(systemHealthBuildWarning(warning));
    }

    if (buildReport.clean === false) {
      issues.push(systemHealthIssue(
        "error",
        "build-report",
        "build_not_clean",
        "Build report is not clean.",
        { clean: buildReport.clean, cleanStrict: buildReport.cleanStrict }
      ));
    } else if (buildReport.cleanStrict === false) {
      issues.push(systemHealthIssue(
        buildWarningsContextOnly ? "info" : "warning",
        "build-report",
        "build_not_strict_clean",
        buildWarningsContextOnly
          ? "Build report is clean; strict-clean is false only because of contextual warnings."
          : "Build report is clean but not strict-clean.",
        {
          clean: buildReport.clean,
          cleanStrict: buildReport.cleanStrict,
          contextOnlyWarnings: buildWarningsContextOnly
        }
      ));
    }

    const failedFetches = Number(buildReport.acquisition?.failedFetches || 0);
    if (failedFetches > 0) {
      issues.push(systemHealthIssue(
        "warning",
        "build-report",
        "acquisition_failed_fetches",
        "Fixture acquisition had failed provider fetches.",
        { failedFetches }
      ));
    }

  }

  issues.push(...collectValueSettlementIssues({
    dayKey: day,
    todayDayKey: athensDayKey(),
    buildReport,
    valueComparison
  }));

  issues.push(
    ...collectActiveCompetitionCompletenessIssues({
      dayKey: day,
      coverageReadiness
    })
  );

  if (freshness) {
    if (freshness.ok === false) {
      issues.push(systemHealthIssue(
        "error",
        "freshness-report",
        "freshness_not_ok",
        "Freshness gate failed.",
        { reasons: freshness.reasons || [] }
      ));
    }

    for (const reason of freshness.reasons || []) {
      issues.push(systemHealthIssue(
        "error",
        "freshness-report",
        "freshness_reason",
        String(reason),
        { reason }
      ));
    }

    for (const stale of freshness.staleInputs || []) {
      issues.push(systemHealthIssue(
        "error",
        "freshness-report",
        "stale_input",
        "Snapshot input is stale.",
        stale
      ));
    }

    for (const stale of freshness.staleDerivedArtifacts || []) {
      issues.push(systemHealthIssue(
        "error",
        "freshness-report",
        "stale_derived_artifact",
        "Derived artifact is stale.",
        stale
      ));
    }

    for (const skipped of freshness.skippedInputs || []) {
      issues.push(systemHealthIssue(
        "info",
        "freshness-report",
        "skipped_freshness_input",
        "Freshness input was skipped.",
        skipped
      ));
    }
  }

  if (manifest) {
    if (manifest.ok === false) {
      issues.push(systemHealthIssue(
        "error",
        "manifest",
        "manifest_not_ok",
        "Snapshot manifest is not OK.",
        { ok: manifest.ok }
      ));
    }

    const counts = manifest.counts || {};

    if (Number(counts.detailsMissingForFixtures || 0) > 0 || (manifest.detailsMissingForFixtures || []).length > 0) {
      issues.push(systemHealthIssue(
        "error",
        "manifest",
        "details_missing_for_fixtures",
        "Visible fixtures are missing detail files.",
        {
          count: counts.detailsMissingForFixtures,
          matches: manifest.detailsMissingForFixtures || []
        }
      ));
    }

    if (Number(counts.orphanDetailsRemoved || 0) > 0 || (manifest.orphanDetailsRemoved || []).length > 0) {
      issues.push(systemHealthIssue(
        "warning",
        "manifest",
        "orphan_details_removed",
        "Snapshot export removed orphan detail files.",
        {
          count: counts.orphanDetailsRemoved,
          files: manifest.orphanDetailsRemoved || []
        }
      ));
    }

    if (Number(manifest.snapshotRescuedCount || 0) > 0) {
      issues.push(systemHealthIssue(
        "warning",
        "manifest",
        "snapshot_rescued_rows",
        "Snapshot contains rescued rows that did not come from canonical fixtures.",
        {
          snapshotRescuedCount: manifest.snapshotRescuedCount,
          snapshotRescuedLeagues: manifest.snapshotRescuedLeagues || []
        }
      ));
    }

    if (manifest.valueGate?.ok === false) {
      issues.push(systemHealthIssue(
        "error",
        "manifest",
        "value_gate_failed",
        "Manifest Value gate failed.",
        manifest.valueGate
      ));
    }

    if (manifest.valueGate?.valueFreshAgainstCanonical === false) {
      issues.push(systemHealthIssue(
        "error",
        "manifest",
        "value_stale_against_canonical",
        "Production Value artifact is stale against canonical fixtures.",
        manifest.valueGate
      ));
    }

    if (
      manifest.fixtureJsonCount != null &&
      manifest.canonicalFixtureCount != null &&
      Number(manifest.fixtureJsonCount) !== Number(manifest.canonicalFixtureCount)
    ) {
      issues.push(systemHealthIssue(
        "error",
        "manifest",
        "fixture_canonical_count_mismatch",
        "Published fixture count differs from canonical fixture count.",
        {
          fixtureJsonCount: manifest.fixtureJsonCount,
          canonicalFixtureCount: manifest.canonicalFixtureCount
        }
      ));
    }
  }

  if (value) {
    if (value.ok === false) {
      issues.push(systemHealthIssue(
        "error",
        "value",
        "value_not_ok",
        "Production Value artifact is not OK.",
        { ok: value.ok }
      ));
    }

    if (Array.isArray(value.picks) && value.count != null && Number(value.count) !== value.picks.length) {
      issues.push(systemHealthIssue(
        "error",
        "value",
        "value_count_array_mismatch",
        "Value declared count does not match picks length.",
        { declaredCount: value.count, actualCount: value.picks.length }
      ));
    }
  }

  if (valueAudit) {
    if (valueAudit.ok === false) {
      issues.push(systemHealthIssue(
        "error",
        "value-audit",
        "value_audit_not_ok",
        "Value audit is not OK.",
        { ok: valueAudit.ok }
      ));
    }

    if (valueAudit.sourceContract?.canonicalOnly === false) {
      issues.push(systemHealthIssue(
        "error",
        "value-audit",
        "value_not_canonical_only",
        "Value audit says production Value was not canonical-only.",
        valueAudit.sourceContract
      ));
    }

    if (valueAudit.sourceContract?.deploySnapshotInput === true) {
      issues.push(systemHealthIssue(
        "error",
        "value-audit",
        "value_used_deploy_snapshot_input",
        "Value audit says production Value used deploy snapshot input.",
        valueAudit.sourceContract
      ));
    }

    const candidateMarkets = Number(valueAudit.universe?.candidateMarkets || 0);
    const valueCount = Number(value?.count || 0);

    if (valueCount === 0 && candidateMarkets === 0) {
      issues.push(systemHealthIssue(
        "info",
        "value-audit",
        "production_value_zero_candidates",
        "Production Value produced zero picks because zero candidate markets were generated.",
        {
          fixturesSeen: valueAudit.universe?.fixturesSeen,
          eligibleEvaluated: valueAudit.universe?.eligibleEvaluated,
          candidateMarkets,
          approved: valueAudit.universe?.approved
        }
      ));
    }
  }

  if (valueComparison) {
    const requiredPlans = ["A", "A2", "B", "B2"];
    const presentPlans = requiredPlans.filter(
      key =>
        valueComparison.plans?.[key] &&
        typeof valueComparison.plans[key] === "object"
    );
    const missingPlans = requiredPlans.filter(
      key => !presentPlans.includes(key)
    );

    if (missingPlans.length > 0) {
      issues.push(systemHealthIssue(
        "error",
        "value-comparison",
        "four_plan_comparison_incomplete",
        "Value comparison is missing one or more required plans.",
        {
          requiredPlans,
          presentPlans,
          missingPlans
        }
      ));
    }

    issues.push(systemHealthIssue(
      "info",
      "value-comparison",
      "value_plan_comparison_summary",
      "Four-plan Value comparison artifact is available.",
      {
        complete: missingPlans.length === 0,
        requiredPlans,
        presentPlans,
        missingPlans,
        planA: valueComparison.plans?.A
          ? {
              count: valueComparison.plans.A.count,
              summary: valueComparison.plans.A.summary
            }
          : null,
        planA2: valueComparison.plans?.A2
          ? {
              count: valueComparison.plans.A2.count,
              summary: valueComparison.plans.A2.summary
            }
          : null,
        planB: valueComparison.plans?.B
          ? {
              count: valueComparison.plans.B.count,
              summary: valueComparison.plans.B.summary
            }
          : null,
        planB2: valueComparison.plans?.B2
          ? {
              count: valueComparison.plans.B2.count,
              summary: valueComparison.plans.B2.summary
            }
          : null
      }
    ));
  }

  const runtimeState = classifyRuntimeSystemHealth({
    issues,
    invariant
  });

  const dynamicReport = {
    ok: runtimeState.ok,
    severity: runtimeState.severity,
    status: runtimeState.status,
    issueCounts: systemHealthIssueCounts(issues),
    issues,
    dayKey: day,
    checkedAt: invariant?.checkedAt || buildReport?.generatedAt || checkedNow,
    manifestGeneratedAt: invariant?.manifestGeneratedAt || freshness?.manifestGeneratedAt || manifest?.generatedAt || null,

    valueSafe: runtimeState.valueSafe,
    valueCount: invariant?.valueCount ?? value?.count ?? null,
    autoFixed: invariant?.autoFixed || [],
    warnings: invariant?.warnings || [],
    blocked: invariant?.blocked || [],

    artifacts: {
      buildReport: { exists: read.buildReport.exists, ok: read.buildReport.ok, path: systemHealthRelativeArtifact(read.buildReport.path), generatedAt: buildReport?.generatedAt || null },
      invariant: { exists: read.invariant.exists, ok: read.invariant.ok, path: systemHealthRelativeArtifact(read.invariant.path), checkedAt: invariant?.checkedAt || null },
      freshness: { exists: read.freshness.exists, ok: read.freshness.ok, path: systemHealthRelativeArtifact(read.freshness.path), generatedAt: freshness?.generatedAt || null },
      manifest: { exists: read.manifest.exists, ok: read.manifest.ok, path: systemHealthRelativeArtifact(read.manifest.path), generatedAt: manifest?.generatedAt || null },
      valueAudit: { exists: read.valueAudit.exists, ok: read.valueAudit.ok, path: systemHealthRelativeArtifact(read.valueAudit.path), generatedAt: valueAudit?.generatedAt || null },
      value: { exists: read.value.exists, ok: read.value.ok, path: systemHealthRelativeArtifact(read.value.path), updatedAt: value?.updatedAt || null },
      valueComparison: { exists: read.valueComparison.exists, ok: read.valueComparison.ok, path: systemHealthRelativeArtifact(read.valueComparison.path), generatedAt: valueComparison?.generatedAt || null }
    },

    summaries: {
      build: buildReport ? {
        clean: buildReport.clean,
        cleanStrict: buildReport.cleanStrict,
        hardFailures: buildReport.hardFailures || [],
        warnings: buildReport.warnings || [],
        universe: buildReport.universe || null,
        acquisition: buildReport.acquisition || null
      } : null,
      freshness: freshness ? {
        ok: freshness.ok,
        reasons: freshness.reasons || [],
        staleInputs: freshness.staleInputs || [],
        staleDerivedArtifacts: freshness.staleDerivedArtifacts || [],
        missingRequiredArtifacts:
          freshness.missingRequiredArtifacts || [],
        fourPlanContract:
          freshness.fourPlanContract || null,
        skippedInputs: freshness.skippedInputs || []
      } : null,
      manifest: manifest ? {
        ok: manifest.ok,
        counts: manifest.counts || null,
        fixtureJsonCount: manifest.fixtureJsonCount,
        canonicalFixtureCount: manifest.canonicalFixtureCount,
        snapshotRescuedCount: manifest.snapshotRescuedCount,
        snapshotRescuedLeagues: manifest.snapshotRescuedLeagues || [],
        valueGate: manifest.valueGate || null,
        coverage: manifest.coverage || null
      } : null,
      value: {
        production: value ? { ok: value.ok, source: value.source, count: value.count } : null,
        audit: valueAudit ? {
          ok: valueAudit.ok,
          policyVersion: valueAudit.policyVersion,
          source: valueAudit.source,
          sourceContract: valueAudit.sourceContract || null,
          universe: valueAudit.universe || null
        } : null,
        comparison: valueComparison ? {
          ok: valueComparison.ok,
          schema: valueComparison.schema,
          plans: valueComparison.plans ? {
            A: valueComparison.plans.A
              ? {
                  count: valueComparison.plans.A.count,
                  summary: valueComparison.plans.A.summary
                }
              : null,
            A2: valueComparison.plans.A2
              ? {
                  count: valueComparison.plans.A2.count,
                  summary: valueComparison.plans.A2.summary
                }
              : null,
            B: valueComparison.plans.B
              ? {
                  count: valueComparison.plans.B.count,
                  summary: valueComparison.plans.B.summary
                }
              : null,
            B2: valueComparison.plans.B2
              ? {
                  count: valueComparison.plans.B2.count,
                  summary: valueComparison.plans.B2.summary
                }
              : null
          } : null
        } : null
      },
      settlement: buildReport?.settlement || null
    }
  };

  const alertArtifact = readJsonFileSafe(
    preferRuntimeReleaseArtifact(
      day,
      "system-health-alerts.json",
      resolveDataPath("system-health", day + ".json")
    ),
    null
  );

  return reconcilePublicSystemHealth({
    dayKey: day,
    dynamicReport,
    alertArtifact
  });
}

app.get("/system-health-alerts", (req, res) => {
  const explicitDay = String(req.query.day || "").slice(0, 10);
  if (explicitDay && !/^\d{4}-\d{2}-\d{2}$/u.test(explicitDay)) {
    return res.status(400).json({ ok: false, error: "invalid_day_key" });
  }

  const file = explicitDay
    ? preferRuntimeReleaseArtifact(
        explicitDay,
        "system-health-alerts.json",
        resolveDataPath("system-health", `${explicitDay}.json`)
      )
    : resolveDataPath("system-health", "latest.json");
  const payload = readJsonFileSafe(file, null);

  if (!payload) {
    return res.status(404).json({
      ok: false,
      error: "system_health_alerts_not_found",
      dayKey: explicitDay || null
    });
  }

  if (explicitDay && String(payload.dayKey || "") !== explicitDay) {
    return res.status(409).json({
      ok: false,
      error: "system_health_alert_day_mismatch",
      requestedDay: explicitDay,
      artifactDay: payload.dayKey || null
    });
  }

  return res.json(payload);
});

app.get("/system-health", (req, res) => {
  try {
    const day = String(req.query.day || athensDayKey()).slice(0, 10);
    res.json(buildSystemHealthReport(day));
  } catch (err) {
    res.status(500).json({
      ok: false,
      severity: "error",
      status: "error",
      issues: [
        systemHealthIssue(
          "error",
          "system-health",
          "system_health_endpoint_failed",
          "System Health endpoint failed while building diagnostics.",
          { error: String(err?.message || err) }
        )
      ],
      error: String(err?.message || err)
    });
  }
});

// ── Autonomous fixtures merge (DISPLAY ONLY) ────────────────────────────────────
// Appends our comprehensive Flashscore fixtures (data/deploy-snapshots/{today}/
// fixtures-all.json, which carries the 3-day window) to the runtime response,
// deduped against canonical matches by team names. This NEVER writes to the
// canonical json-db / details, so the value engine and its prerequisites are
// untouched — these rows are tagged source:"flashscore" for the UI only.
// Display dedupe key — delegates to the shared contract so every endpoint
// normalizes team names identically (see engine-v1/core/display-contract.js).
function fxNormTeam(s) {
  return normalizeDisplayTeam(s);
}
function readFixturesAllSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(resolveDataPath("deploy-snapshots", athensDayKey(), "fixtures-all.json"), "utf8"));
  } catch {
    return null;
  }
}
function readLeagueState() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "league-memory", "state.json"), "utf8"));
  } catch {
    return {};
  }
}


function displaySlugVariants(slug, aliases = {}) {
  const s = String(slug || "").trim();
  if (!s) return [];
  const out = new Set([s]);
  const canonical = aliases[s] || s;
  if (canonical) out.add(canonical);
  for (const [alias, target] of Object.entries(aliases || {})) {
    if (target === s || target === canonical) out.add(alias);
  }
  return [...out].filter(Boolean);
}

function displayLeagueIsDisabled(slug, aliases = {}) {
  return displaySlugVariants(slug, aliases).some(v => isDisabledLeague(v));
}

function hasDisplayRealOddsMarket(row) {
  const markets = row?.aiAssessment?.markets || row?.markets || null;
  if (!markets || typeof markets !== "object") return false;
  return Object.values(markets).some(block => {
    const odds = block?.odds || block;
    if (!odds || typeof odds !== "object") return false;
    return Object.values(odds).some(v => Number.isFinite(Number(v)) && Number(v) > 1);
  });
}

function isDisplayApprovedSupplementLeague(slug, leagueMeta, aliases = {}) {
  if (displayLeagueIsDisabled(slug, aliases)) return false;
  const variants = displaySlugVariants(slug, aliases);

  // Supplement rows may enrich curated registry leagues, but they must not
  // rediscover arbitrary Flashscore/friendly/lower/out-of-scope rows.
  if (variants.some(v => /^fs\./u.test(v))) return false;
  if (variants.some(v => /(?:^|[._-])(friendly|friendlies|club-friendly|copa-chile|usl-league-two)(?:$|[._-])/iu.test(v))) return false;

  return variants.some(v => Boolean(leagueMeta?.[v]));
}

function normalizeScoreValue(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function matchDayKeyFromIso(value) {
  const d = new Date(value || "");
  if (!Number.isFinite(d.getTime())) return "";
  return athensDayKey(d);
}

function resultCandidateSlugs(slug) {
  const raw = String(slug || "");
  const canonical = FX_SLUG_ALIASES[raw] || raw;
  return Array.from(new Set([raw, canonical].filter(Boolean)));
}

function readResultsMemoryFile(slug, cache) {
  const key = String(slug || "");
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  try {
    const p = resolveDataPath("league-memory", "results", `${key}.json`);
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    cache.set(key, data);
    return data;
  } catch {
    cache.set(key, null);
    return null;
  }
}

function resultEntryMatchesFixture(entry, fixture, requestedDay, expectedHa) {
  if (!entry || !fixture) return false;
  if (String(entry.ha || "").toUpperCase() !== expectedHa) return false;
  if (requestedDay && matchDayKeyFromIso(entry.date) !== requestedDay) return false;

  const oppNorm = fxNormTeam(entry.opp);
  const expectedOpp = expectedHa === "H" ? fixture.awayTeam : fixture.homeTeam;
  if (!oppNorm || !expectedOpp) return false;

  return oppNorm === fxNormTeam(expectedOpp);
}

function findResultForFixture(fixture, requestedDay, cache) {
  const homeNorm = fxNormTeam(fixture?.homeTeam);
  const awayNorm = fxNormTeam(fixture?.awayTeam);
  if (!homeNorm || !awayNorm) return null;

  for (const slug of resultCandidateSlugs(fixture?.leagueSlug)) {
    const data = readResultsMemoryFile(slug, cache);
    if (!data || !data.teams) continue;

    for (const [teamName, entries] of Object.entries(data.teams)) {
      if (!Array.isArray(entries)) continue;
      const teamNorm = fxNormTeam(teamName);

      if (teamNorm === homeNorm) {
        for (const entry of entries) {
          if (!resultEntryMatchesFixture(entry, fixture, requestedDay, "H")) continue;
          const scoreHome = normalizeScoreValue(entry.gf);
          const scoreAway = normalizeScoreValue(entry.ga);
          if (scoreHome == null || scoreAway == null) continue;
          return {
            matchId: entry.matchId || fixture.matchId,
            scoreHome,
            scoreAway,
            resultDate: entry.date || null,
            source: "league-memory/results",
          };
        }
      }

      if (teamNorm === awayNorm) {
        for (const entry of entries) {
          if (!resultEntryMatchesFixture(entry, fixture, requestedDay, "A")) continue;
          const awayGoals = normalizeScoreValue(entry.gf);
          const homeGoals = normalizeScoreValue(entry.ga);
          if (homeGoals == null || awayGoals == null) continue;
          return {
            matchId: entry.matchId || fixture.matchId,
            scoreHome: homeGoals,
            scoreAway: awayGoals,
            resultDate: entry.date || null,
            source: "league-memory/results",
          };
        }
      }
    }
  }

  return null;
}

function overlayTruthResults(matches, requestedDay) {
  const cache = new Map();

  return (Array.isArray(matches) ? matches : []).map(match => {
    const truth = findResultForFixture(match, requestedDay, cache);
    if (!truth) return match;

    return {
      ...match,
      status: "FT",
      rawStatus: match.rawStatus || match.status || "",
      statusType: match.statusType || "FT",
      scoreHome: truth.scoreHome,
      scoreAway: truth.scoreAway,
      truthSource: truth.source,
      truthMatchId: truth.matchId,
      truthDate: truth.resultDate,
    };
  });
}

// Status authority rank — delegates to the shared contract (token-aware, so a
// concatenated blob like "FT SECOND_HALF FT" correctly ranks FINAL, not LIVE).
function dateMatchStatusRank(match) {
  return statusRankFromParts(match?.status, match?.rawStatus, match?.statusType, match?.statusName);
}

function hasDateMatchScore(match) {
  return match?.scoreHome != null && match?.scoreAway != null;
}

function dateMatchDedupeKey(match, requestedDay) {
  const slug = FX_SLUG_ALIASES[String(match?.leagueSlug || "")] || String(match?.leagueSlug || "");
  const home = fxNormTeam(match?.homeTeam);
  const away = fxNormTeam(match?.awayTeam);
  const kickoff = String(match?.kickoffUtc || "");
  const kickoffMinute = kickoff ? kickoff.slice(0, 16) : "";
  const day = matchDayKeyFromIso(kickoff) || requestedDay || "";
  return `${slug}|${home}|${away}|${day}|${kickoffMinute}`;
}

function dateMatchSourceAuthority(match) {
  // A terminal result promoted by the provider-ID writeback contract is the
  // strongest row. For otherwise equivalent cross-provider rows, ESPN is the
  // primary result authority; Flashscore remains a discovery/live supplement.
  if (match?.authoritativeTerminalWriteback?.identityContract?.exactProviderId === true) return 3;
  if (match?.truthSource) return 2;
  const source = String(match?.source || "").toLowerCase();
  if (source.includes("espn") || /^\d+$/.test(String(match?.sourceId || ""))) return 1;
  return 0;
}

function compareDateMatchQuality(a, b) {
  const ar = dateMatchStatusRank(a);
  const br = dateMatchStatusRank(b);
  if (ar !== br) return br - ar;

  const as = hasDateMatchScore(a) ? 1 : 0;
  const bs = hasDateMatchScore(b) ? 1 : 0;
  if (as !== bs) return bs - as;

  const aa = dateMatchSourceAuthority(a);
  const ba = dateMatchSourceAuthority(b);
  if (aa !== ba) return ba - aa;

  const al = a?.leagueName ? 1 : 0;
  const bl = b?.leagueName ? 1 : 0;
  if (al !== bl) return bl - al;

  return 0;
}

function sameDisplayFixture(a, b, requestedDay) {
  const slugA = FX_SLUG_ALIASES[String(a?.leagueSlug || "")] || String(a?.leagueSlug || "");
  const slugB = FX_SLUG_ALIASES[String(b?.leagueSlug || "")] || String(b?.leagueSlug || "");
  if (!slugA || slugA !== slugB) return false;

  const dayA = matchDayKeyFromIso(a?.kickoffUtc) || requestedDay || "";
  const dayB = matchDayKeyFromIso(b?.kickoffUtc) || requestedDay || "";
  if (dayA !== dayB) return false;

  const ta = Date.parse(a?.kickoffUtc || "");
  const tb = Date.parse(b?.kickoffUtc || "");
  if (Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) > 6 * 60 * 60 * 1000) {
    return false;
  }

  return (
    teamPairMatches(a?.homeTeam, a?.awayTeam, b?.homeTeam, b?.awayTeam) ||
    (
      fxNormTeam(a?.homeTeam) === fxNormTeam(b?.homeTeam) &&
      fxNormTeam(a?.awayTeam) === fxNormTeam(b?.awayTeam)
    )
  );
}

function dedupeDateMatches(matches, requestedDay) {
  const kept = [];

  for (const match of Array.isArray(matches) ? matches : []) {
    if (!match?.matchId || !match?.homeTeam) continue;

    const exactKey = dateMatchDedupeKey(match, requestedDay);
    const existingIndex = kept.findIndex(existing =>
      dateMatchDedupeKey(existing, requestedDay) === exactKey ||
      sameDisplayFixture(existing, match, requestedDay)
    );

    if (existingIndex === -1) {
      kept.push(match);
      continue;
    }

    if (compareDateMatchQuality(kept[existingIndex], match) > 0) {
      kept[existingIndex] = match;
    }
  }

  return kept.sort((a, b) => (a.kickoffUtc > b.kickoffUtc ? 1 : -1));
}

// Athens-day ownership: a match belongs to exactly ONE calendar day — the Athens
// day of its kickoff instant. Cross-midnight kickoffs (22:00–23:59 UTC) were being
// double-bucketed: the correct row on its Athens day (where it gets FT), PLUS a
// phantom SCHEDULED copy on the adjacent UTC day (a second source spelled the
// teams slightly differently, so same-day dedupe never merged them). The stored
// dayKey/canonicalId can carry the wrong day, so we judge from the kickoff instant
// itself (DST-safe via the Athens TZ). Rows with no/invalid kickoff are KEPT — we
// never drop a match we cannot place.
function athensDayForRow(row) {
  const ko = row?.kickoffUtc;
  if (!ko || !Number.isFinite(Date.parse(ko))) return null;
  try { return athensDayFromKickoff(ko); } catch { return null; }
}

function filterToAthensDayOwnership(matches, requestedDay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(requestedDay || ""))) return matches || [];
  return (Array.isArray(matches) ? matches : []).filter(m => {
    const day = athensDayForRow(m);
    return !day || day === requestedDay;
  });
}

function reconcileDateMatchesForDisplay(matches, requestedDay) {
  const owned = filterToAthensDayOwnership(matches, requestedDay);
  return dedupeDateMatches(overlayTruthResults(owned, requestedDay), requestedDay);
}
// Slug aliases: old BetExplorer slugs that map to ESPN canonical slugs
const FX_SLUG_ALIASES = {
  "fifa.world_cup":      "fifa.world",
  "fifa.world_cup_qual": "fifa.world_qual",
};

function mergeFlashscoreFixtures(result, requestedDay) {
  const snap = readFixturesAllSnapshot();
  if (!snap || !Array.isArray(snap.matches)) return result;

  const base = Array.isArray(result.matches) ? result.matches : [];
  const seen = new Set(base.map(m => `${fxNormTeam(m.home ?? m.homeTeam)}|${fxNormTeam(m.away ?? m.awayTeam)}`));

  // Build set of league slugs already in the canonical response (both ESPN and BetExplorer names)
  const baseSlugs = new Set();
  for (const m of base) {
    const s = String(m.leagueSlug || "");
    baseSlugs.add(s);
    const alias = FX_SLUG_ALIASES[s];
    if (alias) baseSlugs.add(alias);
    // Reverse: if canonical is in base, also block old alias
    for (const [old, canonical] of Object.entries(FX_SLUG_ALIASES)) {
      if (canonical === s) baseSlugs.add(old);
    }
  }

  // Read league state once; skip leagues the calendar classifies as finished/disabled
  const leagueState = readLeagueState();

  const extra = [];
  for (const m of snap.matches) {
    if (m.dayKey !== requestedDay) continue;
    // Never surface a partial row: a malformed fixtures-all generation could
    // carry blank team names, which would render as "? – ?" in a panel.
    if (!m.home || !m.away) continue;
    // Skip if this league is already covered by the canonical response
    const slug = String(m.leagueSlug || "");
    const canonical = FX_SLUG_ALIASES[slug] || slug;
    if (baseSlugs.has(slug) || baseSlugs.has(canonical)) continue;
    // Skip if league-memory says the league is finished or disabled
    const st = leagueState[slug] || leagueState[canonical];
    if (st && (st.state === "finished" || st.state === "disabled")) continue;
    // Skip if team pair already seen
    const key = `${fxNormTeam(m.home)}|${fxNormTeam(m.away)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A snapshot is a schedule — never assert live/finished here (the live worker
    // owns real-time status). Force SCHEDULED so old/derived statuses like
    // "LIVE_OR_DONE" can't make finished matches look live.
    extra.push({ ...m, status: "SCHEDULED", statusType: "SCHEDULED", live: false, isLive: false });
  }
  if (!extra.length) return result;

  return { ...result, matches: [...base, ...extra], count: base.length + extra.length, flashscoreAdded: extra.length };
}

// Best-effort overlay budget: an external overlay (Flashscore/ESPN) must NEVER
// block the response. If it does not resolve within budgetMs, abort its fetch tree
// and serve `fallback`. The abort signal is propagated through Flashscore and ESPN
// so a timeout cannot leave sockets/promises accumulating behind the response.
// Circuit breaker: on Render's datacenter IP the Flashscore/ESPN overlay fetches
// never complete — every request paid the FULL budget (4s + 4s = 8s serial) only
// to fall back to base rows anyway, and left a hung socket/promise leaking behind.
// After a few consecutive timeouts/failures we OPEN the breaker for a cooldown and
// skip the doomed overlay entirely (serve the fallback in ~0ms, no fetch, no leak).
// One probe is allowed through after the cooldown, so live self-heals wherever the
// feed actually responds. Serving the fallback is identical to the old timeout path,
// so live-truth rules are unchanged — we just stop waiting 8s to reach the same answer.
const overlayBreaker = new Map(); // label -> { fails, openUntil }
const OVERLAY_BREAKER_TRIP = 2;
const OVERLAY_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;

function markOverlayOk(label) {
  overlayBreaker.set(label, { fails: 0, openUntil: 0 });
}

function markOverlayFail(label) {
  const b = overlayBreaker.get(label) || { fails: 0, openUntil: 0 };
  b.fails += 1;
  if (b.fails >= OVERLAY_BREAKER_TRIP) {
    b.openUntil = Date.now() + OVERLAY_BREAKER_COOLDOWN_MS;
  }
  overlayBreaker.set(label, b);
}

function overlayWithBudget(label, budgetMs, fallback, run) {
  const breaker = overlayBreaker.get(label);
  if (breaker && breaker.openUntil > Date.now()) {
    return Promise.resolve(fallback);
  }

  const controller = new AbortController();
  let timer = null;
  let completed = false;

  return new Promise(resolve => {
    const finish = value => {
      if (completed) return;
      completed = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    timer = setTimeout(() => {
      controller.abort(new Error(`overlay_budget_exceeded:${label}`));
      markOverlayFail(label);
      console.warn(`[overlay-budget] ${label} exceeded ${budgetMs}ms — aborted and serving base rows`);
      finish(fallback);
    }, budgetMs);

    Promise.resolve()
      .then(() => run(controller.signal))
      .then(value => {
        if (completed) return;
        markOverlayOk(label);
        finish(value);
      })
      .catch(error => {
        if (completed) return;
        markOverlayFail(label);
        console.warn(`[overlay-budget] ${label} failed`, String(error?.message || error));
        finish(fallback);
      });
  });
}

app.get("/fixtures-runtime", async (req, res) => {
  const mode = String(req.query.mode || "today");
  const dayKey = String(req.query.date || athensDayKey()).slice(0, 10);

  try {
    const runtimeDisplay = await buildRuntimeDisplayMatchesForDate(dayKey);
    const { source, matches, membership, runtimeOverlay = null } = runtimeDisplay;
    const filtered = filterByPanelMode(matches, mode);

    return res.json({
      ok: true,
      date: dayKey,
      mode,
      source,
      count: filtered.length,
      matches: filtered,
      membership,
      runtimeOverlay
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      date: dayKey,
      mode,
      error: String(error?.message || error)
    });
  }
});


function fileInfoSafe(...parts) {
  const filePath = resolveDataPath(...parts);

  try {
    if (!fs.existsSync(filePath)) {
      return { exists: false, path: filePath, bytes: 0, mb: 0 };
    }
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      path: filePath,
      bytes: stat.size,
      mb: Number((stat.size / 1024 / 1024).toFixed(2))
    };
  } catch (error) {
    return { exists: false, path: filePath, error: String(error?.message || error) };
  }
}

function dirInfoSafe(...parts) {
  const dirPath = resolveDataPath(...parts);

  try {
    if (!fs.existsSync(dirPath)) {
      return { exists: false, path: dirPath, fileCount: 0 };
    }
    const files = fs.readdirSync(dirPath).filter(name => name.endsWith(".json"));
    return {
      exists: true,
      path: dirPath,
      fileCount: files.length,
      sample: files.slice(0, 10)
    };
  } catch (error) {
    return { exists: false, path: dirPath, error: String(error?.message || error) };
  }
}

app.get("/debug/value-inputs", (req, res) => {
  const date = String(req.query.date || athensDayKey());
  const season = String(req.query.season || currentSeason());

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

function readValueComparisonArtifact(date) {
  const file = preferRuntimeReleaseArtifact(
    date,
    "value-comparison.json",
    resolveDataPath("value-comparison", `${date}.json`)
  );
  if (!fs.existsSync(file)) {
    return { ok: false, reason: "value_comparison_not_found", file };
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return {
      ok: false,
      reason: "value_comparison_json_invalid",
      file,
      error: error?.message || String(error)
    };
  }

  const requiredPlans =
    ["A", "A2", "B", "B2"];

  const ordinaryComparisonValid =
    requiredPlans.every(
      planKey =>
        payload?.plans?.[planKey] &&
        typeof payload.plans[planKey] === "object"
    );

  const unrecoverablePlanAGapValid = Boolean(
    payload?.comparisonEligible === false &&
    payload?.planAAvailability?.status === "unrecoverable" &&
    typeof payload?.planAAvailability?.reason === "string" &&
    payload.planAAvailability.reason.trim().length > 0 &&
    payload?.plans?.A === null &&
    ["A2", "B", "B2"].every(
      planKey =>
        payload?.plans?.[planKey] &&
        typeof payload.plans[planKey] === "object"
    )
  );

  if (
    payload?.ok !== true ||
    payload?.date !== date ||
    (!ordinaryComparisonValid && !unrecoverablePlanAGapValid)
  ) {
    return { ok: false, reason: "value_comparison_payload_invalid", file };
  }

  return { ok: true, file, payload };
}

app.get("/value-comparison", (req, res) => {
  const date = String(req.query.date || athensDayKey());
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return res.status(400).json({
      ok: false,
      reason: "invalid_day_key",
      date
    });
  }

  const artifact = readValueComparisonArtifact(date);
  if (!artifact.ok) {
    const status = artifact.reason === "value_comparison_json_invalid"
      || artifact.reason === "value_comparison_payload_invalid"
      ? 500
      : 404;
    return res.status(status).json({
      ok: false,
      date,
      reason: artifact.reason,
      source: "value-comparison-release-artifact"
    });
  }

  return res.json({
    ...artifact.payload,
    source: "value-comparison-release-artifact",
    runtimeMirror: {
      localArtifact: true,
      requestTimeNetworkFetch: false
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

// Map a value pick's market + selection onto the AI-priced ("current market")
// odds carried in deploy-snapshots/<date>/odds.json (aiAssessment.markets).
// Firewall-safe: this is DISPLAY only — odds never feed the value engine.
const VALUE_EXPORT_MARKET_KEYS = {
  OU15: "OU15", "Over / Under 1.5": "OU15",
  OU25: "OU25", "Over / Under 2.5": "OU25",
  OU35: "OU35", "Over / Under 3.5": "OU35",
  BTTS: "BTTS",
  "1X2": "1X2",
  DC: "DC", "Double Chance": "DC"
};

function valueExportOddsSide(marketKey, pick) {
  const p = String(pick || "").toUpperCase().trim();
  if (marketKey === "OU15" || marketKey === "OU25" || marketKey === "OU35") {
    if (p.includes("OVER")) return "over";
    if (p.includes("UNDER")) return "under";
    return null;
  }
  if (marketKey === "BTTS") {
    if (p.includes("YES")) return "yes";
    if (p.includes("NO")) return "no";
    return null;
  }
  if (marketKey === "1X2") {
    if (p === "1" || p === "HOME") return "home";
    if (p === "X" || p === "DRAW") return "draw";
    if (p === "2" || p === "AWAY") return "away";
    return null;
  }
  if (marketKey === "DC") {
    if (["1X", "X2", "12"].includes(p)) return p;
    return null;
  }
  return null;
}

function loadValueExportOddsMap(date) {
  const map = new Map();
  try {
    const file = resolveDataPath("deploy-snapshots", date, "odds.json");
    if (!fs.existsSync(file)) return map;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const m of parsed?.matches || []) {
      const markets = m?.aiAssessment?.markets;
      if (!markets) continue;
      const entry = { markets, kickoff: m?.kickoffUtc || null };
      for (const id of [m?.matchId, m?.canonicalId]) {
        if (id) map.set(String(id), entry);
      }
    }
  } catch {
    /* odds are optional — export still works without them */
  }
  return map;
}

function resolveValueExportOdds(oddsEntry, market, marketName, pick) {
  const markets = oddsEntry?.markets;
  if (!markets) return null;
  const key =
    VALUE_EXPORT_MARKET_KEYS[market] ||
    VALUE_EXPORT_MARKET_KEYS[marketName] ||
    market;
  const block = markets[key];
  if (!block?.odds) return null;
  const side = valueExportOddsSide(key, pick);
  if (!side) return null;
  const v = Number(block.odds[side]);
  return Number.isFinite(v) ? v : null;
}

// Load all four settled plans from value-comparison/<date>.json. A present
// comparison artifact is authoritative for Value export: invalid JSON must be
// surfaced, never silently replaced by the production snapshot.
function loadValueExportComparisonDay(date) {
  const artifact =
    readValueComparisonArtifact(date);

  if (!artifact.ok) {
    return {
      ok: false,
      issue: {
        code:
          artifact.reason === "value_comparison_not_found"
            ? "VALUE_EXPORT_COMPARISON_NOT_FOUND"
            : "VALUE_EXPORT_COMPARISON_INVALID",
        date,
        artifact:
          artifact.file || null,
        message:
          artifact.reason ||
          "value_comparison_invalid"
      }
    };
  }

  return {
    ok: true,
    day:
      comparisonToValueExportDay({
        date,
        comparison:
          artifact.payload,
        source:
          "value_comparison_release_artifact"
      })
  };
}


function valueExportSourcePicks(result) {
  if (Array.isArray(result?.picks)) return result.picks;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.valuePicks)) return result.valuePicks;
  if (Array.isArray(result?.data?.picks)) return result.data.picks;
  return [];
}

function valueExportDecorateDay(day, oddsMap) {
  for (const plan of VALUE_EXPORT_PLAN_ORDER) {
    const planDay = day?.plans?.[plan.key];
    if (!planDay?.available || !Array.isArray(planDay.picks)) continue;

    planDay.picks = planDay.picks.map(row => {
      const matchId = row.matchId || row.canonicalMatchId;
      const oddsEntry = oddsMap.get(String(matchId));
      const resolvedOdds = resolveValueExportOdds(
        oddsEntry,
        row.market,
        null,
        row.pick
      );

      return {
        ...row,
        kickoff: row.kickoff || oddsEntry?.kickoff || null,
        oddsDecimal:
          row.oddsDecimal !== null &&
          row.oddsDecimal !== undefined &&
          row.oddsDecimal !== "" &&
          Number.isFinite(Number(row.oddsDecimal))
            ? Number(row.oddsDecimal)
            : resolvedOdds
      };
    });
  }

  return day;
}

function valueExportPercent(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function valueExportFinalScore(row) {
  return row.finalScore || "";
}

function styleValueExportTitle(sheet, rowNumber, text, columnCount = 16) {
  sheet.mergeCells(rowNumber, 1, rowNumber, columnCount);
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = text;
  cell.font = { bold: true, size: 14 };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(rowNumber).height = 22;
}

function styleValueExportHeader(row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

function addValueExportTableHeader(sheet, values) {
  const row = sheet.addRow(values);
  styleValueExportHeader(row);
  return row;
}

function setValueExportPercentCell(row, columnNumber) {
  const cell = row.getCell(columnNumber);
  if (cell.value !== null && cell.value !== undefined && cell.value !== "") {
    cell.numFmt = "0.00%";
  }
}

function addValueExportPlanSection(sheet, plan) {
  styleValueExportTitle(sheet, sheet.rowCount + 1, `${plan.label} — Picks`);
  addValueExportTableHeader(sheet, [
    "Date", "Kickoff", "Country", "League", "Home", "Away", "Market", "Pick",
    "Model Score", "Confidence", "Market Prob", "AI Fair Odds", "Display Odds",
    "Final Score", "Result", "Source"
  ]);

  if (plan.picks.length === 0) {
    sheet.addRow(["No picks in selected range"]);
  } else {
    for (const row of plan.picks) {
      const added = sheet.addRow([
        row.date,
        row.kickoff,
        row.country || "",
        row.leagueName || row.leagueSlug || "",
        row.homeTeam || "",
        row.awayTeam || "",
        row.marketLabel || row.market || "",
        row.selectionLabel || row.pick || "",
        row.score ?? "",
        row.confidence ?? "",
        row.marketProb ?? "",
        row.aiFairOdds ?? "",
        row.oddsDecimal ?? "",
        valueExportFinalScore(row),
        row.result,
        row.source || ""
      ]);
      for (const column of [9, 10, 11, 12, 13]) {
        added.getCell(column).numFmt = column >= 12 ? "0.00" : "0.000";
      }
    }
  }

  sheet.addRow([]);
  styleValueExportTitle(sheet, sheet.rowCount + 1, `${plan.label} — Daily Summary`);
  addValueExportTableHeader(sheet, [
    "Date", "Status", "Picks", "Wins", "Losses", "Voids", "Unresolved",
    "Unsupported", "Win %"
  ]);
  for (const row of plan.daily) {
    const added = sheet.addRow([
      row.date,
      row.status,
      row.picks,
      row.wins,
      row.losses,
      row.voids,
      row.unresolved,
      row.unsupported,
      valueExportPercent(row.winRate)
    ]);
    setValueExportPercentCell(added, 9);
  }

  sheet.addRow([]);
  styleValueExportTitle(sheet, sheet.rowCount + 1, `${plan.label} — Selected Range Summary`);
  addValueExportTableHeader(sheet, [
    "From", "To", "Available Days", "Not Available Days", "Picks", "Wins",
    "Losses", "Voids", "Unresolved", "Unsupported", "Win %"
  ]);
  const rangeRow = sheet.addRow([
    plan.range.from,
    plan.range.to,
    plan.range.availableDays,
    plan.range.notAvailableDays,
    plan.range.picks,
    plan.range.wins,
    plan.range.losses,
    plan.range.voids,
    plan.range.unresolved,
    plan.range.unsupported,
    valueExportPercent(plan.range.winRate)
  ]);
  setValueExportPercentCell(rangeRow, 11);

  sheet.addRow([]);
  styleValueExportTitle(sheet, sheet.rowCount + 1, `${plan.label} — Market Breakdown`);
  addValueExportTableHeader(sheet, [
    "Market", "Selection", "Picks", "Wins", "Losses", "Voids", "Unresolved",
    "Unsupported", "Win %"
  ]);
  if (plan.markets.length === 0) {
    sheet.addRow(["No markets in selected range"]);
  } else {
    for (const row of plan.markets) {
      const added = sheet.addRow([
        row.market,
        row.selection,
        row.picks,
        row.wins,
        row.losses,
        row.voids,
        row.unresolved,
        row.unsupported,
        valueExportPercent(row.winRate)
      ]);
      setValueExportPercentCell(added, 9);
    }
  }

  sheet.addRow([]);
  sheet.addRow([]);
}

function valueExportKickoffTime(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const timeOnly = raw.match(/^(\d{2}):(\d{2})(?::\d{2})?$/u);
  if (timeOnly) return `${timeOnly[1]}:${timeOnly[2]}`;

  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return raw;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function valueExportMatchLabel(row) {
  const home = String(row?.homeTeam || "").trim();
  const away = String(row?.awayTeam || "").trim();
  return [home, away].filter(Boolean).join(" – ");
}

function addCompactDailyValuePicks(sheet, report) {
  styleValueExportTitle(sheet, sheet.rowCount + 1, `Value Picks — ${report.from}`, 11);
  addValueExportTableHeader(sheet, [
    "Plan", "Country", "League", "Match", "Kickoff", "Pick",
    "Model Score", "Confidence", "Display Odds", "Final Score", "Result"
  ]);

  let rowCount = 0;
  for (const planKey of report.planOrder) {
    const plan = report.plans[planKey];
    for (const row of plan.picks) {
      const added = sheet.addRow([
        plan.label,
        row.country || "",
        row.leagueName || row.leagueSlug || "",
        valueExportMatchLabel(row),
        valueExportKickoffTime(row.kickoff),
        row.selectionLabel || row.pick || "",
        row.score ?? "",
        row.confidence ?? "",
        row.oddsDecimal ?? "",
        valueExportFinalScore(row),
        row.result || ""
      ]);
      added.getCell(7).numFmt = "0.000";
      if (typeof added.getCell(8).value === "number") added.getCell(8).numFmt = "0.000";
      added.getCell(9).numFmt = "0.00";
      rowCount += 1;
    }
  }

  if (rowCount === 0) {
    const row = sheet.addRow(["No picks for selected day"]);
    sheet.mergeCells(row.number, 1, row.number, 11);
  }
}

function addCompactDailyPlanAnalysis(sheet, plan) {
  const summary = plan.daily[0] || {
    status: "NOT_AVAILABLE",
    picks: 0,
    wins: 0,
    losses: 0,
    voids: 0,
    unresolved: 0,
    unsupported: 0,
    winRate: null
  };

  styleValueExportTitle(sheet, sheet.rowCount + 1, `${plan.label} — Analysis`, 11);
  addValueExportTableHeader(sheet, [
    "Status", "Picks", "Wins", "Losses", "Voids", "Unresolved",
    "Unsupported", "Win %"
  ]);
  const summaryRow = sheet.addRow([
    summary.status,
    summary.picks,
    summary.wins,
    summary.losses,
    summary.voids,
    summary.unresolved,
    summary.unsupported,
    valueExportPercent(summary.winRate)
  ]);
  setValueExportPercentCell(summaryRow, 8);

  sheet.addRow([]);
  addValueExportTableHeader(sheet, [
    "Market", "Pick", "Picks", "Wins", "Losses", "Voids", "Unresolved",
    "Unsupported", "Win %"
  ]);
  if (plan.markets.length === 0) {
    sheet.addRow(["No picks for selected day"]);
  } else {
    for (const row of plan.markets) {
      const added = sheet.addRow([
        row.market,
        row.selection,
        row.picks,
        row.wins,
        row.losses,
        row.voids,
        row.unresolved,
        row.unsupported,
        valueExportPercent(row.winRate)
      ]);
      setValueExportPercentCell(added, 9);
    }
  }

  sheet.addRow([]);
}

function configureCompactDailyValueExportSheet(sheet) {
  const widths = [12, 16, 24, 38, 10, 20, 13, 13, 13, 13, 12];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
    sheet.getColumn(index + 1).alignment = {
      vertical: "middle",
      horizontal: [2, 3, 4, 6].includes(index + 1) ? "left" : "center"
    };
  });

  sheet.views = [{ state: "frozen", ySplit: 2 }];
}

function configureValueExportSheet(sheet) {
  const widths = [14, 22, 16, 22, 24, 24, 22, 18, 13, 13, 13, 13, 13, 13, 12, 24];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
    sheet.getColumn(index + 1).alignment = {
      vertical: "middle",
      horizontal: [5, 6].includes(index + 1) ? "left" : "center"
    };
  });

  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function valueExportCsvHeader() {
  return [
    "recordType", "plan", "date", "from", "to", "status", "market", "selection",
    "kickoff", "country", "league", "home", "away", "picks", "wins", "losses",
    "voids", "unresolved", "unsupported", "winRate", "modelScore", "confidence",
    "marketProb", "aiFairOdds", "odds", "finalScore", "result", "source"
  ];
}

function valueExportCsvLine(record) {
  const summary = record.recordType !== "PICK";
  return [
    record.recordType,
    record.planLabel || "",
    record.date || "",
    record.from || "",
    record.to || "",
    record.status || "",
    record.market || record.marketLabel || "",
    record.selection || record.selectionLabel || "",
    record.kickoff || "",
    record.country || "",
    record.leagueName || record.leagueSlug || "",
    record.homeTeam || "",
    record.awayTeam || "",
    summary ? record.picks ?? "" : "",
    summary ? record.wins ?? "" : "",
    summary ? record.losses ?? "" : "",
    summary ? record.voids ?? "" : "",
    summary ? record.unresolved ?? "" : "",
    summary ? record.unsupported ?? "" : "",
    summary && record.winRate !== null ? record.winRate : "",
    summary ? "" : record.score ?? "",
    summary ? "" : record.confidence ?? "",
    summary ? "" : record.marketProb ?? "",
    summary ? "" : record.aiFairOdds ?? "",
    summary ? "" : record.oddsDecimal ?? "",
    summary ? "" : valueExportFinalScore(record),
    summary ? "" : record.result || "",
    summary ? "" : record.source || ""
  ].map(csvEscape).join(",");
}

app.get("/value-export/range", async (req, res) => {
  const from = String(req.query.from || athensDayKey());
  const to = String(req.query.to || from);
  const format = String(req.query.format || "csv").toLowerCase();
  const days = dateRange(from, to);
  const rebuild = boolParam(req.query.rebuild, false);

  if (runtimeBuildsDisabled() && rebuild) {
    return rejectRuntimeBuild(res, "/value-export/range?rebuild=true", from);
  }

  const dayRecords = [];
  const sourceIssues = [];

  for (const date of days) {
    const oddsMap = loadValueExportOddsMap(date);
    const comparisonResult = !rebuild ? loadValueExportComparisonDay(date) : null;

    if (comparisonResult?.ok === false) {
      sourceIssues.push(comparisonResult.issue);
      continue;
    }

    if (comparisonResult?.ok === true) {
      dayRecords.push(valueExportDecorateDay(comparisonResult.day, oddsMap));
      continue;
    }

    let result = null;
    if (!rebuild) {
      const snapshotResult = snapshotValueResponse(date);
      if (snapshotResult?.ok) result = snapshotResult;
    }

    if (!result) {
      result = runtimeBuildsDisabled()
        ? snapshotValueResponse(date)
        : await buildValueDay(date, { rebuild });
    }

    if (!result?.ok && !Array.isArray(result?.picks)) {
      sourceIssues.push({
        code: "VALUE_EXPORT_DAY_SOURCE_MISSING",
        date,
        message: String(result?.reason || "value source unavailable").trim()
      });
      continue;
    }

    const day = fallbackPlanAToValueExportDay({
      date,
      picks: valueExportSourcePicks(result),
      source: result?.source || "snapshot_value"
    });
    dayRecords.push(valueExportDecorateDay(day, oddsMap));
  }

  if (sourceIssues.length > 0) {
    return res.status(409).json({
      ok: false,
      reason: "value_export_source_invalid",
      from,
      to,
      issues: sourceIssues
    });
  }

  const report = buildValueExportReport({
    from,
    to,
    days,
    dayRecords,
    today: athensDayKey()
  });

  if (format === "json") {
    return res.json({
      ...report,
      count: report.totalRows,
      picks: report.planOrder.flatMap(planKey => report.plans[planKey].picks)
    });
  }

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Value Report");
    const compactDaily = from === to;

    if (compactDaily) {
      configureCompactDailyValueExportSheet(sheet);
      addCompactDailyValuePicks(sheet, report);
      sheet.addRow([]);
      styleValueExportTitle(sheet, sheet.rowCount + 1, "Plan Analysis", 11);
      sheet.addRow([]);
      for (const planKey of report.planOrder) {
        addCompactDailyPlanAnalysis(sheet, report.plans[planKey]);
      }
    } else {
      configureValueExportSheet(sheet);
      for (const planKey of report.planOrder) {
        addValueExportPlanSection(sheet, report.plans[planKey]);
      }
    }

    styleValueExportTitle(sheet, sheet.rowCount + 1, "Integrity", compactDaily ? 11 : 16);
    addValueExportTableHeader(sheet, ["Status", "Issue Count", "Code", "Date", "Plan", "Details"]);
    if (report.integrity.issues.length === 0) {
      sheet.addRow([report.integrity.status, 0, "", "", "", ""]);
    } else {
      for (const issue of report.integrity.issues) {
        sheet.addRow([
          report.integrity.status,
          report.integrity.issues.length,
          issue.code,
          issue.date || "",
          issue.plan || "",
          JSON.stringify(issue)
        ]);
      }
    }

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
    return res.json(report);
  }

  const records = valueExportCsvRecords(report);
  const lines = [valueExportCsvHeader().map(csvEscape).join(",")];
  for (const record of records) lines.push(valueExportCsvLine(record));

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="value-picks-${from}_to_${to}.csv"`
  );
  res.send(lines.join("\n"));
});

// Export OUR AI assessment (form-aware fair odds) per match × market, with the
// yes/no verification from settlement — independent of the value run.
app.get("/assessment-export/range", async (req, res) => {
  const from = String(req.query.from || athensDayKey());
  const to = String(req.query.to || from);
  const format = String(req.query.format || "csv").toLowerCase();
  const days = dateRange(from, to);

  const rows = [];
  for (const date of days) {
    for (const r of getAssessmentRows(date)) rows.push(r);
  }

  if (format === "json") {
    return res.json({ ok: true, from, to, count: rows.length, rows });
  }

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("AI Assessment");
    sheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Kickoff", key: "kickoff", width: 22 },
      { header: "League", key: "league", width: 14 },
      { header: "Home", key: "home", width: 24 },
      { header: "Away", key: "away", width: 24 },
      { header: "Market", key: "market", width: 10 },
      { header: "Pick", key: "pick", width: 10 },
      { header: "Odds", key: "odds", width: 10 },
      { header: "Prob", key: "prob", width: 10 },
      { header: "Actual", key: "actual", width: 10 },
      { header: "Verified", key: "verified", width: 10 }
    ];
    for (const row of rows) {
      sheet.addRow({
        date: row.date, kickoff: row.kickoff, league: row.league,
        home: row.home, away: row.away, market: row.market, pick: row.pick,
        odds: row.odds != null ? Number(row.odds) : "",
        prob: row.prob != null ? Number(row.prob) : "",
        actual: row.actual || "", verified: row.verified || ""
      });
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "K1" };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="ai-assessment-${from}_to_${to}.xlsx"`);
    await workbook.xlsx.write(res);
    return res.end();
  }

  const header = ["date", "kickoff", "league", "home", "away", "market", "pick", "odds", "prob", "actual", "verified"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([
      row.date, row.kickoff, row.league, csvEscape(row.home), csvEscape(row.away),
      row.market, row.pick, row.odds ?? "", row.prob ?? "", row.actual || "", row.verified || ""
    ].join(","));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ai-assessment-${from}_to_${to}.csv"`);
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
  const date = String(req.query.date || athensDayKey());
  if (!matchId) {
    res.status(400).json({ ok: false, error: "missing_matchId" });
    return;
  }
  const direct = getDeployedOddsSnapshot(matchId, market, date);
  if (direct && direct.aiAssessment) {
    res.json(direct);
    return;
  }
  // Bridge fallback: the requested id is an ESPN fixture cid while odds.json is
  // keyed by Flashscore cids, so the exact lookup above misses. The display
  // universe already reconciled the two (odds-fixture-bridge) and is cached, so
  // reuse its resolved assessment rather than bridging again here.
  try {
    const uni = buildDisplayMatchesForDate(date);
    const m = (uni?.matches || []).find(x => String(x.matchId) === matchId);
    if (m?.aiAssessment) {
      res.json({ ...direct, ok: true, matchId, market, aiAssessment: m.aiAssessment, reconciled: true });
      return;
    }
  } catch { /* fall through to the direct (empty) result */ }
  res.json(direct);
}
app.get("/odds", oddsHandler);
app.get("/api/odds", oddsHandler);

// Afternoon refresh: re-fetch OddsPapi odds to capture line movement / delta.
// Called by Render cron at ~14:00 Athens time (before most EU evening matches).
app.post("/api/refresh-multi-odds", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ ok: false, error: "cron_secret_not_configured" });
  }

  const provided = req.headers["x-cron-secret"];
  if (provided !== secret) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const date = String(req.query.date || athensDayKey());
  const doPrefetch = req.query.prefetch !== "0"; // default: also prefetch next 6 days
  try {
    const oddsBudget = createOddsApiIoBudget();
    const r1 = await fetchMultiBookmakerOdds(date);
    const r2 = await fetchOddsApiIoDay(date, oddsBudget);
    // Fire-and-forget: the D+1..D+6 prefetch can take minutes, don't block response.
    // Shares the request budget with the day fetch above (free-tier hourly cap).
    if (doPrefetch) {
      prefetchUpcomingOdds(date, 6, oddsBudget).catch(e => console.error("[prefetch] error:", e?.message || e));
    }
    res.json({ ok: true, date, oddspapi: r1, oddsApiIo: r2, prefetch: { ok: true, started: doPrefetch } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Matches for any date: deploy snapshot → canonical-fixtures fallback.
// Returns { date, matches: [{ matchId, homeTeam, awayTeam, kickoffUtc, status, leagueSlug, scoreHome, scoreAway }] }
// ── Shared display-match universe builder ──────────────────────────────────
// THE single authority for "which matches exist for a day" — intended for BOTH
// /api/matches-for-date and /fixtures-runtime so the two can never disagree.
// Layers sources per the display contract (engine-v1/core/display-contract.js):
// fixtures.json (ESPN canonical) → odds.json → fixtures-all.json, then reconciles
// via truth-overlay + quality-aware dedupe. Attaches the frozen `assessment`
// (value) as a strictly separate block — odds NEVER feed value (odds↔value
// Display universe = senior MEN's football only. Youth (U14–U23) and women's
// competitions are excluded — they are not in our curated map and pollute the
// panels. Reserve/B/II sides are KEPT (they play in men's divisions we show,
// e.g. kaz.2, ltu.2). Detection is by unambiguous markers on team names OR the
// league/competition slug. Deliberately NOT filtering "junior(s)"/"academy":
// several senior men's clubs carry those (Boca Juniors, Atlético Junior, …).
const DISPLAY_EXCLUDE_MARKERS = new Set([
  "w", "women", "womens", "fem", "femin", "feminin", "feminine", "feminina",
  "feminines", "ladies",
  "u14", "u15", "u16", "u17", "u18", "u19", "u20", "u21", "u22", "u23",
]);
function displayHasExcludedMarker(text) {
  const tokens = String(text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // deburr (féminin → feminin)
    .replace(/\bu[\s-]?(1[4-9]|2[0-3])\b/g, "u$1")       // "U-19"/"U 19" → "u19"
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const t of tokens) if (DISPLAY_EXCLUDE_MARKERS.has(t)) return true;
  return false;
}
function isCuratedSeniorDisplayLeagueRow(m) {
  const slug = String(m?.leagueSlug || "").trim();
  if (!slug) return false;
  const aliases = {
    "fifa.world_cup": "fifa.world",
    "fifa.world_cup_qual": "fifa.world_qual",
  };
  return isDisplayApprovedSupplementLeague(slug, getLeagueMetaMap(), aliases);
}

function isYouthOrWomenRow(m) {
  // Youth/women competition rows are excluded by league/competition identity.
  if (displayHasExcludedMarker(m.leagueSlug) ||
      displayHasExcludedMarker(m.competition) ||
      displayHasExcludedMarker(m.leagueName)) {
    return true;
  }

  // Reserve/B/II/U21 sides are allowed when they play inside a curated senior
  // league that the product intentionally covers, e.g. est.2 / Esiliiga.
  if (isCuratedSeniorDisplayLeagueRow(m)) return false;

  return displayHasExcludedMarker(m.homeTeam || m.home) ||
         displayHasExcludedMarker(m.awayTeam || m.away);
}
const MISCLASSIFIED_KINGS_WORLD_CLUB_TEAMS = new Set([
  "alpak", "atleticoparceros", "desimpain", "dr7", "furia", "fwz",
  "karasu", "lacapital", "lostroncos", "norules", "porcinos", "stallions"
]);
function isMisclassifiedKingsWorldClubRow(m) {
  const slug = FX_SLUG_ALIASES[String(m?.leagueSlug || "")] || String(m?.leagueSlug || "");
  if (slug !== "fifa.world") return false;
  const home = fxNormTeam(m?.homeTeam || m?.home);
  const away = fxNormTeam(m?.awayTeam || m?.away);
  return MISCLASSIFIED_KINGS_WORLD_CLUB_TEAMS.has(home) ||
         MISCLASSIFIED_KINGS_WORLD_CLUB_TEAMS.has(away);
}
function excludeOutOfScopeDisplayRows(matches) {
  return Array.isArray(matches)
    ? matches.filter(m => !isYouthOrWomenRow(m) && !isMisclassifiedKingsWorldClubRow(m))
    : matches;
}

// ── Display-only supplemental league metadata ───────────────────────────────
// Some rows carry a leagueSlug the coverage registry does not know (Flashscore
// supplemental leagues `fs.<country>.<league>` and a few micro ESPN slugs). Left
// unresolved they render as a raw slug ("nca.1", "fs.usa.mls-next-pro") with no
// country — but the product rule is "country before the league". This resolves a
// country + friendly name for display ONLY; it NEVER feeds LEAGUES_COVERAGE or
// acquisition, so adding names here cannot move the coverage floor or fetch plan.
const SUPPLEMENTAL_LEAGUE_META = {
  "nca.1": { country: "Nicaragua", name: "Primera División", tier: 1 },
  "sle.1": { country: "Sierra Leone", name: "Premier League", tier: 1 },
};
// Country segments that title-case wrong (acronyms / naming), plus league-word
// acronyms kept uppercase so "mls-next-pro" reads "MLS Next Pro".
const FS_COUNTRY_FIXUPS = { usa: "USA", uae: "UAE", drc: "DR Congo", world: "International" };
const FS_ACRONYMS = new Set(["mls", "usl", "npl", "fc", "sc", "afc", "act", "ii", "u23", "u21", "u20", "u19"]);
function fsTitleCase(seg) {
  return String(seg || "")
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map(w => FS_ACRONYMS.has(w.toLowerCase())
      ? w.toUpperCase()
      : w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function resolveSupplementalLeagueMeta(slug) {
  const s = String(slug || "");
  if (SUPPLEMENTAL_LEAGUE_META[s]) return SUPPLEMENTAL_LEAGUE_META[s];
  if (s.startsWith("fs.")) {
    const parts = s.slice(3).split(".");
    if (parts.length >= 2 && parts[0]) {
      const country = FS_COUNTRY_FIXUPS[parts[0].toLowerCase()] || fsTitleCase(parts[0]);
      return { country, name: fsTitleCase(parts.slice(1).join(" ")) || null, tier: null };
    }
  }
  return null;
}

// firewall). Returns { source, matches }; does NOT apply the request-time live
// overlay — callers own that so it stays a same-day request-time concern.
// buildDisplayMatchesForDate re-reads and re-parses several large JSON snapshots
// (assessments, fixtures, odds, fixtures-all) and re-joins league metadata on EVERY
// call. On Render's throttled 0.1-CPU instance those synchronous reads block the
// event loop, so a burst of requests (15s poll × multiple panels/tabs) could stall
// even the trivial /health route and trip a restart. The underlying snapshot only
// changes only when the promoted manifest revision changes, so memoize the built
// universe against that revision instead of a wall-clock TTL. Public snapshot
// services serve this immutable base directly; live/truth overlays are publication
// work, never request-time work.
const __displayUniverseCache = new Map(); // date -> { revision, value }

function snapshotRevisionForDay(day) {
  try {
    const file = deploySnapshotManifestFile(day);
    const stat = fs.statSync(file);
    return `${stat.size}:${Math.trunc(stat.mtimeMs)}`;
  } catch {
    return "missing";
  }
}

function buildDisplayMatchesForDate(date) {
  const key = String(date || "");
  const revision = snapshotRevisionForDay(key);
  const hit = __displayUniverseCache.get(key);
  if (reusableDisplayRevision(hit, revision)) {
    return hit.value;
  }

  const value = buildDisplayMatchesForDateUncached(date);
  __displayUniverseCache.set(key, { revision, value });

  if (__displayUniverseCache.size > 8) {
    const oldestKey = __displayUniverseCache.keys().next().value;
    if (oldestKey !== undefined) __displayUniverseCache.delete(oldestKey);
  }
  return value;
}

const __runtimeDisplayCache = new Map(); // date -> { revision, promise, completedAt }
const RUNTIME_DISPLAY_OVERLAY_TTL_MS = 12000;

function runtimeRequestOverlaysEnabled() {
  return requestTimeDisplayOverlaysEnabled({
    renderRuntime: isRenderRuntime(),
    snapshotOnly: snapshotOnlyMode(),
    explicitValue: process.env.AIML_REQUEST_TIME_OVERLAYS
  });
}

async function buildRuntimeDisplayMatchesForDate(date) {
  const key = String(date || "");
  const now = Date.now();
  const revision = snapshotRevisionForDay(key);
  const overlaysEnabled = runtimeRequestOverlaysEnabled();
  const hit = __runtimeDisplayCache.get(key);
  if (reusableRuntimeDisplayEntry(hit, {
    revision,
    overlaysEnabled,
    now,
    overlayTtlMs: RUNTIME_DISPLAY_OVERLAY_TTL_MS
  })) {
    return hit.promise;
  }

  const entry = { revision, promise: null, completedAt: null };
  const promise = (async () => {
    const baseUniverse = buildDisplayMatchesForDate(key);
    const base = baseUniverse.matches;

    if (!overlaysEnabled) {
      return {
        ...baseUniverse,
        matches: base,
        runtimeOverlay: {
          enabled: false,
          source: "published-snapshot",
          requestTimeNetwork: false,
          requestTimeTruthScan: false
        }
      };
    }

    let matches = await overlayWithBudget(
      "shared-display:flashscore-live",
      4000,
      base,
      signal => overlayFlashscoreLive(base, key, { signal })
    );
    matches = overlayResultsTruth(matches, key);
    const beforeVerify = matches;
    matches = await overlayWithBudget(
      "shared-display:ft-verify",
      4000,
      beforeVerify,
      signal => verifyStuckLiveFinals(beforeVerify, key, { signal })
    );

    return {
      ...baseUniverse,
      matches,
      runtimeOverlay: {
        enabled: true,
        source: "request-time-overlay",
        requestTimeNetwork: true,
        requestTimeTruthScan: true
      }
    };
  })();

  entry.promise = promise;
  __runtimeDisplayCache.set(key, entry);
  promise.then(() => {
    const current = __runtimeDisplayCache.get(key);
    if (current === entry) current.completedAt = Date.now();
  }).catch(() => {
    const current = __runtimeDisplayCache.get(key);
    if (current === entry) __runtimeDisplayCache.delete(key);
  });
  return promise;
}


// Map an odds.json entry's frozen aiAssessment into the same `assessment` shape
// attachAssessment produces from data/assessments, so a fixture reconciled to a
// Flashscore odds row exposes the SAME contract the frontend already reads. The
// 1X2 probs double as open/current (a single frozen capture, no revision).
function assessmentFromOddsEntry(entry) {
  const ai = entry?.aiAssessment;
  if (!ai || !ai.markets) return null;
  const p = ai.markets?.["1X2"]?.probs || null;
  const probs = p ? { home: p.home, draw: p.draw, away: p.away } : null;
  return {
    openedAt:          entry.updatedAt || null,
    assessedAt:        entry.updatedAt || null,
    revised:           false,
    openAssessment:    probs,
    currentAssessment: probs,
    markets:           ai.markets,
    model:             ai.model || null,
    reconciledFrom:    "flashscore_odds_bridge" // audit breadcrumb: joined by bridge, not exact id
  };
}

function buildDisplayMatchesForDateUncached(date) {
  // Load AI assessments for this date (if available) — keyed by matchId
  let assessmentMap = {};
  try {
    const ap = resolveDataPath("assessments", `${date}.json`);
    assessmentMap = JSON.parse(fs.readFileSync(ap, "utf8")).matches || {};
  } catch { /**/ }

  // League → { country, tier } from the awareness registry, so the UI can group
  // by country (active panel) and show the country before the league (today
  // panel). Registry uses ESPN slugs; map the BetExplorer aliases across.
  const leagueMeta = getLeagueMetaMap();
  const COUNTRY_SLUG_ALIASES = {
    "fifa.world_cup": "fifa.world",
    "fifa.world_cup_qual": "fifa.world_qual",
  };
  function resolveLeagueMeta(slug) {
    const s = String(slug || "");
    return leagueMeta[s] || leagueMeta[COUNTRY_SLUG_ALIASES[s] || s] || resolveSupplementalLeagueMeta(s) || null;
  }

  // Per-league current matchday (round) for the "Χώρα – Λίγκα · Αγων.N" label,
  // memoized per slug (computeMatchdayAxis reads standings from disk). Surfaced
  // ONLY when league integrity is green — the same trustworthy-standings gate the
  // rich details/standings block uses — so a corrupt/cumulative table can never
  // print a bogus round. Cups/friendlies have no standings and correctly get null
  // (no round label). This is the axis matchday, not the ledger's per-fixture
  // round; today's fixtures are the league's current round by definition.
  const matchdayCache = new Map();
  function leagueMatchday(slug) {
    const s = String(slug || "");
    if (!s) return null;
    if (matchdayCache.has(s)) return matchdayCache.get(s);
    let md = null;
    try {
      if (isLeagueIntegrityGreen(s)) md = computeMatchdayAxis(s).matchday ?? null;
    } catch { /* standings absent/unreadable → no label */ }
    matchdayCache.set(s, md);
    return md;
  }

  function attachCountry(m) {
    const meta = resolveLeagueMeta(m.leagueSlug);
    const matchday = leagueMatchday(m.leagueSlug);

    return applyTrustedLeaguePresentation(
      m,
      meta,
      matchday
    );
  }

  function attachAssessment(rawMatch) {
    const m = attachCountry(rawMatch);
    const a = assessmentMap[String(m.matchId)] || null;
    if (!a) return m;
    return {
      ...m,
      assessment: {
        openedAt:          a.openedAt,
        assessedAt:        a.assessedAt,
        revised:           a.revised || false,
        openAssessment:    a.openAssessment,    // { home, draw, away } probs at first capture
        currentAssessment: a.currentAssessment, // { home, draw, away } probs now
        markets:           a.markets,           // all markets (1X2, OU25, BTTS…)
        model:             a.model,
      }
    };
  }

  // 1. fixtures.json (ESPN scores/FT) + odds.json supplement for leagues not in fixtures.
  //    fixtures.json uses ESPN slugs (e.g. "fifa.world"), odds.json uses BetExplorer slugs
  //    (e.g. "fifa.world_cup") — matchIds differ, so dedup by league slug + known aliases.
  {
    // Map old BetExplorer slugs → canonical ESPN slugs (same competition, different naming)
    const SLUG_ALIASES = {
      "fifa.world_cup": "fifa.world",
      "fifa.world_cup_qual": "fifa.world_qual",
    };

    let fixtureMatches = [];
  let fixtureSlugs = new Set();
  let snapshotFixtureArtifactLoaded = false;

    try {
      const fp = resolveDataPath("deploy-snapshots", date, "fixtures.json");
      const fj = JSON.parse(
      fs.readFileSync(fp, "utf8")
    );
    snapshotFixtureArtifactLoaded = true;
      fixtureMatches = (Array.isArray(fj) ? fj : (fj.fixtures || fj.matches || []))
        .map(m => attachAssessment({
          matchId:    String(m.matchId || m.id || ""),
          homeTeam:   canonicalDisplayTeamName(m.homeTeam || m.home || ""),
          awayTeam:   canonicalDisplayTeamName(m.awayTeam || m.away || ""),
          kickoffUtc: m.kickoffUtc || m.kickoff || "",
          status:     m.status || "PRE",
          leagueSlug: m.leagueSlug || "",
          leagueName: m.leagueName || "",
          scoreHome:  m.scoreHome ?? null,
          scoreAway:  m.scoreAway ?? null,
          ...withKnockoutScoreNamespaces(m),
          penalties: m.penalties || null,
          rawStatus: m.rawStatus || null,
          statusType: m.statusType || null,
          source: m.source || null,
          sourceId: m.sourceId || m.sourceMatchId || null,
          authoritativeTerminalWriteback: m.authoritativeTerminalWriteback || null,
        })).filter(m => m.matchId && m.homeTeam);
      // Build set of all slugs already covered by fixtures.json (both directions of aliases)
      for (const m of fixtureMatches) {
        const s = m.leagueSlug;
        fixtureSlugs.add(s);
        // Add reverse alias: if "fifa.world" is in fixtures, also block "fifa.world_cup" from odds
        for (const [alias, canonical] of Object.entries(SLUG_ALIASES)) {
          if (canonical === s) fixtureSlugs.add(alias);
          if (alias === s) fixtureSlugs.add(canonical);
        }
      }
    } catch { /**/ }

    let oddsMatches = [];
    let oddsRawMatches = [];
    try {
      const op = resolveDataPath("deploy-snapshots", date, "odds.json");
      const oj = JSON.parse(fs.readFileSync(op, "utf8"));
      oddsRawMatches = Array.isArray(oj.matches) ? oj.matches : [];
      oddsMatches = (oj.matches || [])
        .map(m => attachAssessment({
          matchId:    String(m.matchId || ""),
          homeTeam:   canonicalDisplayTeamName(m.homeTeam || m.home || ""),
          awayTeam:   canonicalDisplayTeamName(m.awayTeam || m.away || ""),
          kickoffUtc: m.kickoffUtc || m.kickoff || "",
          status:     m.status || "PRE",
          leagueSlug: m.leagueSlug || "",
          leagueName: m.leagueName || "",
          scoreHome:  m.scoreHome ?? null,
          scoreAway:  m.scoreAway ?? null,
          aiAssessment: m.aiAssessment || null,
          markets: m.markets || null,
        }))
        // Exclude any league already covered by fixtures.json (same or aliased slug)
        // and never let odds become a broad fixture-discovery source.
        .filter(m => {
          if (!m.matchId || !m.homeTeam) return false;
          const slug = String(m.leagueSlug || "");
          const canonical = SLUG_ALIASES[slug] || slug;
          if (fixtureSlugs.has(slug) || fixtureSlugs.has(canonical)) return false;
          if (!hasDisplayRealOddsMarket(m)) return false;
          return isDisplayApprovedSupplementLeague(slug, leagueMeta, SLUG_ALIASES);
        });
    } catch { /**/ }

    // 1b. Reconcile the two identity universes. The odds.json assessment lives
    // under Flashscore identity (slug fs.*, names "Ayr"/"KuPS (Fin)") while the
    // fixtures are ESPN identity — so their canonical ids differ and an exact-id
    // join reached almost none of a cup-heavy day. Bridge them matchId-agnostic
    // (kickoff + team-token overlap on both sides) and attach the FROZEN
    // assessment onto the fixture the UI already shows. Display-only: never mints
    // a fixture, never feeds value (odds↔value firewall). Only fills fixtures that
    // don't already carry an assessment from data/assessments.
    if (oddsRawMatches.length && fixtureMatches.length) {
      try {
        const needy = fixtureMatches.filter(m => !m.assessment);
        const { byFixtureId } = resolveOddsForFixtures(needy, oddsRawMatches);
        if (byFixtureId.size) {
          fixtureMatches = fixtureMatches.map(m => {
            const entry = byFixtureId.get(String(m.matchId));
            if (!entry) return m;
            const assessment = assessmentFromOddsEntry(entry);
            if (!assessment) return m;
            return { ...m, assessment, aiAssessment: entry.aiAssessment || null };
          });
        }
      } catch { /* bridge is best-effort display enrichment */ }
    }

    // 1c. fixtures-all.json — supplement with active leagues not covered by
    //     fixtures.json or odds.json (e.g. swe.2, kaz.1, est.1, isl.1…).
    //     Dedup by slug AND by normalised team pair to avoid duplicates.
    let fixturesAllMatches = [];
    try {
      // fixtures-all.json lives in TODAY's snapshot dir (rolling 3-day window).
      const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
      for (const key of [todayKey, (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString("en-CA", { timeZone: "Europe/Athens" }); })()] ) {
        const fap = resolveDataPath("deploy-snapshots", key, "fixtures-all.json");
        if (!fs.existsSync(fap)) continue;
        const faj = JSON.parse(fs.readFileSync(fap, "utf8"));
        const leagueState = readLeagueState();
        const seenTeams = new Set([...fixtureMatches, ...oddsMatches].map(m =>
          `${fxNormTeam(m.homeTeam)}|${fxNormTeam(m.awayTeam)}`
        ));
        const supplementSlugs = new Set(oddsMatches.flatMap(m =>
          displaySlugVariants(m.leagueSlug, SLUG_ALIASES)
        ));
        fixturesAllMatches = (faj.matches || [])
          .filter(m => {
            if (m.dayKey !== date) return false;
            if (!(m.home || m.homeTeam) || !(m.away || m.awayTeam)) return false;
            const slug = String(m.leagueSlug || "");
            const canonical = SLUG_ALIASES[slug] || slug;
            if (fixtureSlugs.has(slug) || fixtureSlugs.has(canonical)) return false;
            if (supplementSlugs.has(slug) || supplementSlugs.has(canonical)) return false;
            if (!isDisplayApprovedSupplementLeague(slug, leagueMeta, SLUG_ALIASES)) return false;
            const st = leagueState[slug] || leagueState[canonical];
            if (st && (st.state === "finished" || st.state === "disabled")) return false;
            const teamKey = `${fxNormTeam(m.home)}|${fxNormTeam(m.away)}`;
            if (seenTeams.has(teamKey)) return false;
            seenTeams.add(teamKey);
            fixtureSlugs.add(slug);
            return true;
          })
          .map(m => attachAssessment({
            matchId:    String(m.id || m.matchId || ""),
            homeTeam:   m.home || m.homeTeam || "",
            awayTeam:   m.away || m.awayTeam || "",
            kickoffUtc: m.kickoffUtc || "",
            status:     "PRE",
            leagueSlug: m.leagueSlug || "",
            leagueName: m.leagueName || m.competition || "",
            scoreHome:  null,
            scoreAway:  null,
          })).filter(m => m.matchId && m.homeTeam && m.awayTeam);
        break;
      }
    } catch { /**/ }

    const displayUniverse =
    selectAuthoritativeDisplayUniverse(
      fixtureMatches,
      oddsRawMatches,
      fixturesAllMatches
    );

  const merged =
    reconcileDateMatchesForDisplay(
      displayUniverse.matches,
      date
    );

  if (snapshotFixtureArtifactLoaded) {
    return {
      source: "snapshot",
      matches: excludeOutOfScopeDisplayRows(merged),
      membership: displayUniverse.membership
    };
  }
  }

  // 2. Fallback: canonical-fixtures (for future dates without snapshot yet)
  try {
    const dir = resolveDataPath("canonical-fixtures", date);
    if (fs.existsSync(dir)) {
      const matches = fs.readdirSync(dir)
        .filter(f => f.endsWith(".json"))
        .flatMap(f => {
          try {
            const j = JSON.parse(fs.readFileSync(path.join(resolveDataPath("canonical-fixtures", date), f), "utf8"));
            return (j.fixtures || []).map(m => attachAssessment({
              matchId:    String(m.matchId || ""),
              homeTeam:   canonicalDisplayTeamName(m.homeTeam || ""),
              awayTeam:   canonicalDisplayTeamName(m.awayTeam || ""),
              kickoffUtc: m.kickoffUtc || "",
              status:     m.status || "PRE",
              leagueSlug: m.leagueSlug || "",
              leagueName: m.leagueName || "",
              scoreHome:  m.scoreHome ?? null,
              scoreAway:  m.scoreAway ?? null,
              ...withKnockoutScoreNamespaces(m),
              penalties: m.penalties || null,
              rawStatus: m.rawStatus || null,
              statusType: m.statusType || null,
              source: m.source || null,
              sourceId: m.sourceId || m.sourceMatchId || null,
              authoritativeTerminalWriteback: m.authoritativeTerminalWriteback || null,
            })).filter(m => m.matchId && m.homeTeam);
          } catch { return []; }
        });
      const reconciled = reconcileDateMatchesForDisplay(matches, date);
      if (reconciled.length) return { source: "canonical", matches: excludeOutOfScopeDisplayRows(reconciled) };
    }
  } catch { /**/ }

  // 3. fixtures-all is enrichment-only and cannot create match existence.
  return {
    source: "none",
    matches: [],
    membership: {
      authoritativeSource: "none",
      authoritativeFixtureCount: 0,
      supplementsMayCreateFixture: false
    }
  };
}

app.get("/api/matches-for-date", async (req, res) => {
  const date = String(req.query.date || athensDayKey()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ ok: false, error: "invalid_date" });
  }

  try {
    const { source, matches, membership } = await buildRuntimeDisplayMatchesForDate(date);
    return res.json({
      ok: true,
      date,
      source,
      matches,
      membership
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      date,
      error: String(error?.message || error)
    });
  }
});

// All prefetched/fetched odds for a date — used by Opening Tracker panel.
// Returns { date, updatedAt, matches: { matchId: { home, away, openedAt, fetchedAt, markets } } }
app.get("/api/multi-odds-day", (req, res) => {
  const date = String(req.query.date || athensDayKey()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: "invalid_date" });
  try {
    const p = resolveDataPath("multi-odds", `${date}.json`);
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    res.json({ ok: true, ...j });
  } catch {
    res.json({ ok: true, date, matches: {} });
  }
});

// Per-bookmaker multi-source odds: { greek, european, asian, betfair } panels
app.get("/api/multi-odds", (req, res) => {
  const matchId = String(req.query.matchId || req.query.id || "");
  const date    = String(req.query.date || athensDayKey());
  if (!matchId) return res.status(400).json({ ok: false, error: "missing_matchId" });
  try {
    const p = resolveDataPath("multi-odds", `${date}.json`);
    const daily = JSON.parse(fs.readFileSync(p, "utf8"));
    const matches = daily?.matches || {};
    let rec = matches[matchId] || null;

    // The store is keyed by the PROVIDER id captured at write time, while the
    // UI now asks with the canonical cid (fixtures.json matchId alignment).
    // Bridge via the day's fixture row: any of its ids → provider key, then
    // fall back to a normalized team-name match (identity-agnostic, the same
    // way the store writer paired fixtures with provider events).
    let fixtureRow = null;
    if (!rec) {
      const fj = readJsonFileSafe(path.join(deploySnapshotRoot(date), "fixtures.json"), null);
      const rows = Array.isArray(fj) ? fj : (fj?.fixtures || fj?.matches || []);
      fixtureRow = rows.find(r =>
        [r?.canonicalId, r?.matchId, r?.providerMatchId, r?.sourceMatchId, r?.sourceId]
          .some(x => String(x || "") === matchId)
      ) || null;
      for (const alt of [fixtureRow?.providerMatchId, fixtureRow?.sourceMatchId, fixtureRow?.sourceId]) {
        const key = String(alt || "").trim();
        if (key && matches[key]) { rec = matches[key]; break; }
      }
    }
    if (!rec && fixtureRow) {
      const h = normTeam(fixtureRow.homeTeam || fixtureRow.home);
      const a = normTeam(fixtureRow.awayTeam || fixtureRow.away);
      if (h && a) {
        rec = Object.values(matches).find(m => normTeam(m?.home) === h && normTeam(m?.away) === a) || null;
      }
    }

    if (!rec) return res.json({ ok: false, matchId, date, reason: "not_found" });
    res.json({ ok: true, matchId, date, ...rec });
  } catch {
    res.json({ ok: false, matchId, date, reason: "not_found" });
  }
});

// Dynamic league catalogue — same shape as the generated static UI catalogue,
// built live from league-awareness (disabled leagues filtered, newly-promoted
// leagues included automatically). UI navigation + league-binding prefer this.
const REGION_TO_CONTINENT = {
  europe: "EU", africa: "AF", asia: "AS",
  concacaf: "NA", americas: "SA", oceania: "OC",
  international: "IN", world: "IN"
};
app.get("/api/leagues", (_req, res) => {
  try {
    const meta = getLeagueMetaMap();
    // Group by continent → country → leagues.
    const byContinent = {};
    for (const [slug, m] of Object.entries(meta)) {
      if (isDisabledLeague(slug)) continue;
      const continent = REGION_TO_CONTINENT[m.region] || "EU";
      const country = m.country || "Unknown";
      if (!byContinent[continent]) byContinent[continent] = {};
      if (!byContinent[continent][country]) byContinent[continent][country] = [];
      byContinent[continent][country].push({ league_id: slug, display_name: m.name || slug, tier: m.tier || null });
    }
    // Shape into the array format navigation.js expects.
    const result = {};
    for (const [continent, countries] of Object.entries(byContinent)) {
      result[continent] = Object.entries(countries).map(([country_name, leagues]) => ({
        country_name,
        leagues: leagues.sort((a, b) => (a.tier || 99) - (b.tier || 99))
      })).sort((a, b) => a.country_name.localeCompare(b.country_name));
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Whole-day picture: every captured fixture with market odds + AI assessment.
app.get("/odds/day", (req, res) => {
  const date = String(req.query.date || athensDayKey());
  res.json(getDeployedOddsDay(date));
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
        // Enrich the pre-built snapshot with our assessment/referee/discipline too.
        snapshotResult.snapshot = enrichSnapshotWithAssessment(
          snapshotResult.snapshot, id,
          snapshotResult.basic?.leagueSlug, snapshotResult.basic?.homeTeam, snapshotResult.basic?.awayTeam,
          snapshotResult.basic?.leagueName
        );
        res.json(snapshotResult);
        return;
      }

      // No pre-built snapshot detail (our autonomous fs_* matches) — serve the
      // odds-memory-based assessment / referee / discipline instead of 404.
      const fallback = await getDetailsPayload(id, { rebuild: false });
      if (fallback?.ok) {
        res.json({ ...fallback, source: "odds-memory" });
        return;
      }

      // Last resort: match exists in fixtures-all.json but has no odds-memory record yet.
      // Enrich with form/standings/player-usage/discipline so the panel isn't empty.
      const fixturesAllSnap = readFixturesAllSnapshot();
      if (fixturesAllSnap) {
        const fxMatch = (fixturesAllSnap.matches || []).find(m => String(m.id || m.matchId) === id);
        if (fxMatch) {
          const basic = {
            matchId: id,
            homeTeam: fxMatch.home || fxMatch.homeTeam || "",
            awayTeam: fxMatch.away || fxMatch.awayTeam || "",
            leagueSlug: fxMatch.leagueSlug || "",
            leagueName: fxMatch.leagueName || fxMatch.competition || "",
            kickoffUtc: fxMatch.kickoffUtc || "",
            status: fxMatch.status || "PRE",
          };
          const enriched = enrichSnapshotWithAssessment(
            { basic }, id, basic.leagueSlug, basic.homeTeam, basic.awayTeam, basic.leagueName
          );
          return res.json({
            ok: true,
            matchId: id,
            source: "fixtures-all",
            dayKey: fxMatch.dayKey || null,
            basic,
            assessment: enriched.assessment || null,
            discipline: enriched.discipline || null,
            snapshot: enriched,
          });
        }
      }

      // Honest coverage contract (audit P1): say WHY there is no detail
      // instead of a bare not-found the UI renders as a silent blank. A
      // canonical fixture without a detail file is a pipeline gap (tracked in
      // manifest.detailsMissingForFixtures); anything else reaching this point
      // is supplement-only existence or an unknown id — details are never
      // built for those by design.
      const contractDate = date || athensDayKey();
      const snapFixtures = readDeploySnapshotFixtures(contractDate);
      const canonicalHit = (Array.isArray(snapFixtures?.fixtures) ? snapFixtures.fixtures : [])
        .some(fx => String(fx?.canonicalId || "") === id || String(fx?.matchId || "") === id);

      res.status(404).json({
        ok: false,
        error: "details_unavailable",
        reason: canonicalHit ? "missing_detail_for_canonical_fixture" : "supplemental_or_unknown_match",
        matchId: id,
        date: contractDate,
        source: "snapshot"
      });
      return;
    }

    if (!rebuild && snapshotOnlyMode()) {
      const snapshotResult = snapshotDetailsResponse(id, date);

      if (snapshotResult.ok) {
        snapshotResult.snapshot = enrichSnapshotWithAssessment(
          snapshotResult.snapshot, id,
          snapshotResult.basic?.leagueSlug, snapshotResult.basic?.homeTeam, snapshotResult.basic?.awayTeam,
          snapshotResult.basic?.leagueName
        );
        res.json(snapshotResult);
        return;
      }
    }

    const result = await getDetailsPayload(id, { rebuild });

    if (!result?.ok) {
      if (result?.error === "match_not_found") {
        // Same honest coverage contract as the snapshot branch: classify the
        // miss so the UI can explain it instead of a silent blank.
        const contractDate = date || athensDayKey();
        const snapFixtures = readDeploySnapshotFixtures(contractDate);
        const canonicalHit = (Array.isArray(snapFixtures?.fixtures) ? snapFixtures.fixtures : [])
          .some(fx => String(fx?.canonicalId || "") === id || String(fx?.matchId || "") === id);

        res.status(404).json({
          ok: false,
          error: "details_unavailable",
          reason: canonicalHit ? "missing_detail_for_canonical_fixture" : "supplemental_or_unknown_match",
          matchId: id,
          date: contractDate,
          source: "runtime"
        });
        return;
      }

      res.status(400).json(result);
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

if (runtimeBuildsDisabled() || snapshotOnlyMode()) {
  const prewarmDay = athensDayKey();
  const prewarmStartedAt = Date.now();
  try {
    buildDisplayMatchesForDate(prewarmDay);
    console.log(`[display-cache] prewarmed ${prewarmDay} in ${Date.now() - prewarmStartedAt}ms`);
  } catch (error) {
    console.warn("[display-cache] prewarm failed", String(error?.message || error));
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`engine-v1 listening on ${PORT}`);
  console.log("[snapshot-sync] boot sync disabled; releases are promoted only by authenticated commit-pinned workflow jobs");
});
