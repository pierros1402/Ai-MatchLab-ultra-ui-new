import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planHistoryProtection, HISTORY_REPOSITORY } from "../core/history-protection-watchdog.js";
import { inspectHistoryProtection } from "../jobs/run-history-protection-watchdog.js";
const nowMs = Date.parse("2099-10-17T00:00:00Z"), hour = 3600000;
const ago = n => new Date(nowMs - n * hour).toISOString();
const locator = { schema: "ai-matchlab.history-locator.v1", dayKey: "2099-10-17", runId: "123", attempt: "1", stage: "workflow-final", fingerprint: "a".repeat(64), capturedAt: ago(1), manifestPath: "checkpoints/2099-10-17/123/1/workflow-final/manifest.json" };
const run = (overrides = {}) => ({ id: 123, head_branch: "main", head_repository: { full_name: HISTORY_REPOSITORY }, path: ".github/workflows/history-preservation-canary.yml", status: "completed", conclusion: "success", created_at: ago(2), run_started_at: ago(2), ...overrides });
const plan = overrides => planHistoryProtection({ nowMs, locator, manifestAvailable: true, runs: [run()], ...overrides });

test("healthy requires fresh archive metadata AND a recent successful main restore", () => {
  assert.equal(plan().status, "HEALTHY");
  assert.equal(plan({ runs: [run({ conclusion: "failure" })] }).status, "BLOCKED_COOLDOWN");
  assert.equal(plan({ locator: null }).status, "BLOCKED_COOLDOWN");
  assert.equal(plan({ manifestAvailable: false }).status, "BLOCKED_COOLDOWN");
});
test("overdue drill dispatches existing-byte canary, not a prediction or data repair", () => {
  const p = plan({ runs: [run({ created_at: ago(25), run_started_at: ago(25) })] });
  assert.equal(p.action, "DISPATCH_CANARY"); assert.deepEqual(p.reasons, ["RESTORE_DRILL_OVERDUE"]);
  assert.equal(p.historicalReplay, false); assert.equal(p.frozenForecastMutationAuthorized, false);
  assert.equal(p.allProducerInputsPreservedCertified, false); assert.equal(p.publicationAuthorized, false);
});
test("stale or missing archive requests bounded preservation after cooldown", () => {
  const runs = [run({ run_started_at: ago(7) })];
  assert.equal(plan({ locator: { ...locator, capturedAt: ago(4) }, runs }).action, "DISPATCH_CANARY");
  assert.equal(plan({ locator: null, runs }).action, "DISPATCH_CANARY");
});
test("active run suppresses duplicates; a stuck canary blocks and is not cancelled", () => {
  const active = run({ status: "in_progress", conclusion: null, run_started_at: ago(.25) });
  assert.equal(plan({ runs: [active] }).status, "WAITING_FOR_RESTORE");
  const stuck = plan({ runs: [{ ...active, run_started_at: ago(1) }] });
  assert.equal(stuck.status, "BLOCKED"); assert.equal(stuck.action, "WAIT");
  assert.ok(stuck.reasons.includes("RESTORE_DRILL_STUCK"));
});
test("failed canary cools down six hours, even if last success is old", () => {
  const failed = run({ conclusion: "failure", run_started_at: ago(1) });
  assert.equal(plan({ runs: [failed] }).status, "BLOCKED_COOLDOWN");
  assert.equal(plan({ runs: [{ ...failed, run_started_at: ago(7) }] }).action, "DISPATCH_CANARY");
});
test("an old rerun uses attempt start, never the old run creation timestamp", () => {
  assert.equal(plan({ runs: [run({ created_at: ago(200), run_started_at: ago(.5) })] }).status, "HEALTHY");
});
test("foreign branches and repositories cannot certify a healthy restore", () => {
  assert.equal(plan({ runs: [run({ head_branch: "other" })] }).action, "DISPATCH_CANARY");
  assert.equal(plan({ runs: [run({ head_repository: { full_name: "other/repo" } })] }).action, "DISPATCH_CANARY");
});
test("malformed/future metadata and unexpected workflows fail closed", () => {
  assert.throws(() => plan({ locator: { ...locator, capturedAt: "invalid" } }), /clock/);
  assert.throws(() => plan({ locator: { ...locator, capturedAt: ago(-1) } }), /clock/);
  assert.throws(() => plan({ locator: { ...locator, manifestPath: "../../secret" } }), /locator/);
  assert.throws(() => plan({ runs: [run({ path: ".github/workflows/daily-deploy-snapshot.yml" })] }), /canary_run/);
  assert.throws(() => plan({ runs: [run({ run_started_at: "bad" })] }), /clock/);
});

function apiFixture({ runs = [], missing = false, badManifest = false, total = runs.length, fail = false } = {}) {
  const calls = [];
  const request = async (endpoint, options = {}) => {
    calls.push({ endpoint, options });
    if (fail) throw new Error("network_unavailable");
    if (options.method === "POST") return null;
    if (endpoint.includes("/git/ref/")) return missing ? null : { ref: "refs/heads/codex/history-archive", object: { type: "commit", sha: "b".repeat(40) } };
    if (endpoint.includes("/contents/latest-checkpoint.json")) return { type: "file", path: "latest-checkpoint.json", size: 500, encoding: "base64", content: Buffer.from(JSON.stringify(locator)).toString("base64") };
    if (endpoint.includes("/contents/checkpoints/")) return { type: "file", path: locator.manifestPath, size: 20000000, sha: badManifest ? "bad" : "c".repeat(40) };
    const page = Number(endpoint.match(/page=(\d+)$/)[1]);
    return { total_count: total, workflow_runs: runs.slice((page - 1) * 100, page * 100) };
  };
  return { calls, request };
}
test("dry-run uses immutable archive ref and never dispatches", async () => {
  const f = apiFixture(); const report = await inspectHistoryProtection({ request: f.request, nowMs });
  assert.equal(report.action, "DISPATCH_CANARY"); assert.equal(report.dispatched, false);
  assert.ok(f.calls.filter(c => c.endpoint.includes("/contents/")).every(c => c.endpoint.endsWith(`ref=${"b".repeat(40)}`)));
  assert.ok(f.calls.every(c => !c.options.method));
});
test("apply has exactly one allowlisted main canary POST with Athens day", async () => {
  const f = apiFixture(); const report = await inspectHistoryProtection({ request: f.request, nowMs, apply: true });
  const posts = f.calls.filter(c => c.options.method === "POST"); assert.equal(posts.length, 1);
  assert.ok(posts[0].endpoint.endsWith("history-preservation-canary.yml/dispatches"));
  assert.deepEqual(posts[0].options.body, { ref: "main", inputs: { dayKey: "2099-10-17" } });
  assert.equal(report.status, "RESTORE_REQUESTED"); assert.equal(report.recentSuccessfulRestore, false);
});
test("missing archive can be re-preserved, but corrupt metadata/network cannot authorize dispatch", async () => {
  const missing = apiFixture({ missing: true });
  assert.equal((await inspectHistoryProtection({ request: missing.request, nowMs, apply: true })).dispatched, true);
  for (const opts of [{ fail: true }, { badManifest: true }, { total: 2 }]) {
    const f = apiFixture(opts);
    await assert.rejects(inspectHistoryProtection({ request: f.request, nowMs, apply: true }));
    assert.ok(f.calls.every(c => c.options.method !== "POST"));
  }
});
test("pagination includes an active canary on a later page", async () => {
  const runs = Array.from({ length: 101 }, (_, i) => run({ id: i + 1, run_started_at: ago(25) }));
  runs[100] = run({ id: 101, status: "queued", conclusion: null, run_started_at: ago(.25) });
  const f = apiFixture({ runs }); const result = await inspectHistoryProtection({ request: f.request, nowMs, apply: true });
  assert.equal(result.action, "WAIT"); assert.equal(result.dispatched, false);
});
test("truncation and duplicate IDs never authorize a retry", async () => {
  for (const f of [apiFixture({ total: 1001 }), apiFixture({ runs: [run(), run()] })]) {
    await assert.rejects(inspectHistoryProtection({ request: f.request, nowMs, apply: true }), /incomplete/);
    assert.ok(f.calls.every(c => c.options.method !== "POST"));
  }
});
test("workflow uses the existing schedule, isolated read-only checkout and no publication secret", () => {
  const yaml = fs.readFileSync(new URL("../../.github/workflows/publication-watchdog.yml", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const job = yaml.split("  history-protection:\n")[1].split("  publication-watchdog:\n")[0];
  assert.ok(job.includes("contents: read")); assert.ok(job.includes("persist-credentials: false"));
  assert.ok(job.includes("run-history-protection-watchdog.js --apply")); assert.ok(!job.includes("CRON_SECRET"));
  assert.ok(job.includes("node --test engine-v1/tests/history-protection-watchdog.test.js"));
  assert.ok(job.includes(".github/workflows"));
  assert.equal((yaml.match(/cron:/g) || []).length, 1);
});
