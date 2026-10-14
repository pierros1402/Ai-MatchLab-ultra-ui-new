import path from "node:path";
import { pathToFileURL } from "node:url";
import { athensDayKey, shiftDay } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";
import { checkpointHistoryIfRequired, writeHistoryJsonAtomic } from "../storage/history-preservation.js";
import { fetchMultiBookmakerOdds } from "./fetch-multi-bookmaker-odds.js";
import { fetchOddsApiIoDay, createOddsApiIoBudget } from "./fetch-oddsapiio-odds.js";

export function collectionStatus(result) {
  if (result?.reason === "no_key") return "MISSING_PROVIDER_KEY";
  if (result?.reason === "no_fixtures") return "NO_FIXTURES_IN_INPUT";
  if (result?.limitHit) return "INCOMPLETE_PROVIDER_RATE_LIMIT";
  if (result?.budgetExhausted) return "INCOMPLETE_REQUEST_BUDGET";
  if (result?.ok === false || result?.requestFailures > 0) return "PROVIDER_FAILED";
  if (result?.unmatchedFixtures > 0) return "INCOMPLETE_PROVIDER_COVERAGE";
  if (result?.missingMarkets > 0) return "INCOMPLETE_ODDS_DATA";
  if (result?.fetched === 0 && result?.skipped > 0) return "FRESH_CACHE";
  if (result?.reason === "no_provider_events" || result?.matched === 0) return "NO_PROVIDER_MATCHES";
  if (result?.ok === true) return "COLLECTION_COMPLETED";
  return "UNKNOWN_PROVIDER_OUTCOME";
}

// A successful request with an empty/missing fixture universe does not prove
// that there were no games or that every required input was available.
const completeStatuses = new Set(["FRESH_CACHE", "COLLECTION_COMPLETED"]);
const safeSummary = result => Object.fromEntries([
  "ok", "reason", "errorCode", "fetched", "skipped", "matched", "total", "expectedFixtures", "unmatchedFixtures", "unattemptedFixtures", "requestFailures", "missingMarkets", "limitHit", "budgetExhausted", "requestsUsed"
].filter(key => result?.[key] !== undefined).map(key => [key, result[key]]));

/** Capture display-only odds on a durable writer. Never execute value/assessment
 * models or rewrite a past date with live provider data. */
export async function refreshDurableMultiOdds(dayKey = athensDayKey(), {
  today = athensDayKey, daysAhead = 6,
  papi = fetchMultiBookmakerOdds, io = fetchOddsApiIoDay,
  createBudget = createOddsApiIoBudget, checkpoint = checkpointHistoryIfRequired,
  writeAudit = writeHistoryJsonAtomic,
  auditFile = null, runId = process.env.GITHUB_RUN_ID || "local",
  attempt = process.env.GITHUB_RUN_ATTEMPT || "1"
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey) || !Number.isFinite(Date.parse(`${dayKey}T12:00:00Z`)) ||
    new Date(`${dayKey}T12:00:00Z`).toISOString().slice(0, 10) !== dayKey || dayKey < today()) throw new Error("live_odds_historical_replay_forbidden");
  if (!Number.isInteger(daysAhead) || daysAhead < 0 || daysAhead > 6) throw new Error("invalid_odds_prefetch_horizon");
  if (!/^[a-zA-Z0-9._-]+$/u.test(runId) || !/^[a-zA-Z0-9._-]+$/u.test(attempt)) throw new Error("invalid_odds_run_identity");
  const file = auditFile || resolveDataPath("ingest-state", "multi-odds", dayKey, `${runId}-${attempt}.json`);
  const audit = { schema: "ai-matchlab.durable-multi-odds.v1", dayKey, runId, attempt,
    scope: "display_odds_collection_only", valueExecution: null, historicalReplay: false,
    startedAt: new Date().toISOString(), status: "RUNNING", stages: [] };
  const persist = stage => {
    writeAudit(file, audit);
    const receipt = checkpoint(dayKey, stage);
    if (receipt?.ok !== true) throw new Error("odds_durability_not_acknowledged");
  };
  // Do not call providers if the durable writer is unavailable/disabled.
  persist("multi-odds-started");
  const budget = createBudget();
  const collect = async (provider, date, fetcher) => {
    let result;
    try { result = await fetcher(date, budget); }
    catch (error) { result = { ok: false, reason: "provider_request_failed", errorCode: error?.code || error?.name || "Error" }; }
    audit.stages.push({ provider, date, status: collectionStatus(result), result: safeSummary(result), capturedAt: new Date().toISOString() });
    writeAudit(file, audit);
  };
  await collect("oddspapi", dayKey, papi);
  persist("multi-odds-oddspapi-captured");
  await collect("oddsapiio", dayKey, io);
  persist("multi-odds-current-day-captured");
  for (let offset = 1; offset <= daysAhead; offset++) {
    await collect("oddsapiio", shiftDay(dayKey, offset), io);
  }
  const fatal = audit.stages.some(stage => ["PROVIDER_FAILED", "MISSING_PROVIDER_KEY", "UNKNOWN_PROVIDER_OUTCOME"].includes(stage.status));
  audit.dataComplete = audit.stages.every(stage => completeStatuses.has(stage.status));
  audit.status = fatal ? "FAILED" : audit.dataComplete ? "COMPLETED" : "INCOMPLETE";
  audit.completedAt = new Date().toISOString();
  persist("multi-odds-finished");
  if (fatal) throw Object.assign(new Error("durable_multi_odds_provider_failed"), { auditFile: file });
  return { ok: true, dataComplete: audit.dataComplete, status: audit.status, dayKey, auditFile: file, stages: audit.stages, requestsUsed: budget.used,
    scope: audit.scope, valueExecution: null };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  refreshDurableMultiOdds(process.argv[2] || process.env.DAY_KEY || athensDayKey())
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error("[durable-multi-odds]", error.message); process.exitCode = 1; });
}
