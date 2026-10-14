import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { collectionStatus, refreshDurableMultiOdds } from "../jobs/refresh-durable-multi-odds.js";
import { requestOddsPapiJson } from "../jobs/fetch-multi-bookmaker-odds.js";
import { requestOddsApiIoJson, createOddsApiIoBudget } from "../jobs/fetch-oddsapiio-odds.js";
import { preserveHistoryCheckpoint, restoreHistoryCheckpoint } from "../storage/history-preservation.js";
import { recordHistoryWorkflowState } from "../jobs/record-history-workflow-state.js";

const wait = async () => {};
const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const defaults = {
  today: () => "2026-10-14", daysAhead: 0, runId: "test", attempt: "1",
  checkpoint: () => ({ ok: true }), writeAudit: () => {},
  papi: async () => ({ ok: true, fetched: 1, matched: 1 }),
  io: async () => ({ ok: true, fetched: 1, matched: 1 })
};

test("HTTP failure cannot masquerade as an empty provider fixture response or expose a key", async () => {
  await assert.rejects(requestOddsPapiJson("/fixtures?sportId=10", {
    apiKey: "private-test-key", wait, fetchImpl: async () => response(500, [])
  }), error => error.code === "provider_http_failed" && !error.message.includes("private-test-key"));
  assert.deepEqual(await requestOddsPapiJson("/fixtures?sportId=10", {
    apiKey: "private-test-key", wait, fetchImpl: async () => response(200, [])
  }), []);
  let count = 0;
  await assert.rejects(requestOddsPapiJson("/fixtures?sportId=10", {
    wait, fetchImpl: async () => { count++; return response(429, {}); }
  }), error => error.httpStatus === 429);
  assert.equal(count, 2);
});

test("IO rate limits, network failures and supported fallback are distinct", async () => {
  const limited = createOddsApiIoBudget(2);
  assert.equal(await requestOddsApiIoJson("/events?sport=football", limited, {}, {
    wait, fetchImpl: async () => response(429, [])
  }), null);
  assert.equal(limited.limitHit, true); assert.equal(limited.remaining, 0); assert.equal(limited.requestFailures, 1);
  const failed = createOddsApiIoBudget(2);
  await requestOddsApiIoJson("/events?sport=football", failed, {}, {
    wait, fetchImpl: async () => { throw new Error("private-test-key"); }
  });
  assert.equal(failed.requestFailures, 1);
  const fallback = createOddsApiIoBudget(2), meta = { allowUnsupported: true };
  await requestOddsApiIoJson("/odds/multi?eventIds=1", fallback, meta, {
    wait, fetchImpl: async () => response(403, {})
  });
  assert.equal(meta.status, 403); assert.equal(fallback.requestFailures || 0, 0);
});

test("past-day live collection is rejected before a provider or audit is touched", async () => {
  let calls = 0;
  await assert.rejects(refreshDurableMultiOdds("2026-08-19", {
    ...defaults, papi: async () => { calls++; }, writeAudit: () => { calls++; }
  }), /historical_replay_forbidden/);
  assert.equal(calls, 0);
});

test("provider calls require an acknowledged durable writer", async () => {
  let calls = 0;
  await assert.rejects(refreshDurableMultiOdds("2026-10-14", {
    ...defaults, checkpoint: () => ({ enabled: false }), papi: async () => { calls++; }
  }), /durability_not_acknowledged/);
  assert.equal(calls, 0);
});

test("input absence, fresh cache, missing markets and provider failure are never value outcomes", async () => {
  assert.equal(collectionStatus({ ok: false, reason: "no_fixtures" }), "NO_FIXTURES_IN_INPUT");
  assert.equal(collectionStatus({ ok: true, fetched: 0, skipped: 4, matched: 0 }), "FRESH_CACHE");
  assert.equal(collectionStatus({ ok: true, fetched: 0, matched: 0 }), "NO_PROVIDER_MATCHES");
  assert.equal(collectionStatus({ ok: true, missingMarkets: 2 }), "INCOMPLETE_ODDS_DATA");
  assert.equal(collectionStatus({ ok: false, reason: "no_key" }), "MISSING_PROVIDER_KEY");
  assert.equal(collectionStatus({ ok: false, requestFailures: 1, budgetExhausted: true }), "PROVIDER_FAILED");
  const result = await refreshDurableMultiOdds("2026-10-14", {
    ...defaults, papi: async () => ({ ok: false, reason: "no_fixtures" }),
    io: async () => ({ ok: true, fetched: 0, skipped: 4 })
  });
  assert.equal(result.valueExecution, null);
  assert.equal(result.dataComplete, false);
});

test("available quota-limited data is preserved and explicitly incomplete", async () => {
  let captured;
  const result = await refreshDurableMultiOdds("2026-10-14", {
    ...defaults, io: async () => ({ ok: true, fetched: 2, budgetExhausted: true }),
    writeAudit: (_file, audit) => { captured = structuredClone(audit); }
  });
  assert.equal(result.status, "INCOMPLETE"); assert.equal(result.dataComplete, false);
  assert.equal(captured.status, "INCOMPLETE"); assert.equal(captured.valueExecution, null);
});

test("provider HTTP cause survives durable audit without copying secret error text", async () => {
  let captured;
  const invoke = status => refreshDurableMultiOdds("2026-10-14", {
    ...defaults, papi: async () => { throw Object.assign(new Error("https://provider?apiKey=private-test-key"), { code: "provider_http_failed", httpStatus: status }); },
    writeAudit: (_file, audit) => { captured = structuredClone(audit); }
  });
  await assert.rejects(invoke(403), /provider_failed/);
  assert.equal(captured.status, "FAILED");
  assert.equal(captured.stages[0].result.httpStatus, 403);
  assert.equal(JSON.stringify(captured).includes("private-test-key"), false);
  const limited = await invoke(429);
  assert.equal(limited.status, "INCOMPLETE");
  assert.equal(limited.stages[0].status, "INCOMPLETE_PROVIDER_RATE_LIMIT");
  assert.equal(limited.stages[0].result.httpStatus, 429);
});

test("a later provider failure retains earlier original odds on a real independent archive", async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "durable-odds-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, "source"), remote = path.join(temp, "archive.git"); fs.mkdirSync(root);
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  git(["init", "-b", "main"]); git(["config", "user.name", "Test"]); git(["config", "user.email", "test@example.invalid"]);
  fs.writeFileSync(path.join(root, "source.txt"), "baseline"); git(["add", "."]); git(["commit", "-m", "baseline"]);
  git(["init", "--bare", remote]); git(["remote", "add", "origin", remote]);
  fs.mkdirSync(path.join(root, "data/multi-odds"), { recursive: true });
  const receipts = [], auditFile = path.join(root, "data/ingest-state/multi-odds/test.json");
  await assert.rejects(refreshDurableMultiOdds("2026-10-14", {
    ...defaults, auditFile, writeAudit: undefined,
    checkpoint: (dayKey, stage) => {
      const receipt = preserveHistoryCheckpoint({ root, dayKey, stage, runId: "test" }); receipts.push({ stage, ...receipt }); return receipt;
    },
    papi: async () => { fs.writeFileSync(path.join(root, "data/multi-odds/2026-10-14.json"), '{"opening":2.1}'); return { ok: true, fetched: 1 }; },
    io: async () => { throw new Error("provider unreachable"); }
  }), /provider_failed/);
  assert.equal(JSON.parse(fs.readFileSync(auditFile)).status, "FAILED");
  const earlier = receipts.find(receipt => receipt.stage === "multi-odds-oddspapi-captured");
  restoreHistoryCheckpoint({ root, ref: receipts.at(-1).archiveCommit, manifestPath: earlier.manifestPath, destination: path.join(temp, "restored") });
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp, "restored/data/multi-odds/2026-10-14.json"))).opening, 2.1);
});

test("a failed upstream job is recorded permanently without inventing run completion or zero picks", t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "history-state-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const destination = path.join(temp, "state.json");
  recordHistoryWorkflowState({ dayKey: "2026-10-14", runId: "123", attempt: "1", upstreamJobStatus: "failure", destination });
  const record = JSON.parse(fs.readFileSync(destination));
  assert.equal(record.upstreamJobStatus, "failure");
  assert.equal(record.runConclusion, null);
  assert.equal(record.valueExecutionOutcome, "not_inferred");
  assert.equal(record.statusScope, "job_before_history_cleanup");
  assert.throws(() => recordHistoryWorkflowState({ dayKey: "2026-10-14", runId: "123", upstreamJobStatus: "COMPLETE_ZERO_PICKS", destination }), /invalid_upstream_job_status/);
});
