import test from "node:test";
import assert from "node:assert/strict";
import { fetchHistoryArchiveTip } from "./history-archive-transport.js";
const sha = "a".repeat(40), branch = "codex/history-archive";
const advertisement = `${sha}\trefs/heads/${branch}\n`;

test("exact shallow tip fetch has finite attempts and cannot update checkout refs or FETCH_HEAD", () => {
  const calls = [];
  assert.equal(fetchHistoryArchiveTip({ remote: "origin", branch, run(args, options) {
    calls.push({ args, options });
    return args[0] === "ls-remote" ? advertisement : args[0] === "rev-parse" ? sha : "";
  } }), sha);
  assert.deepEqual(calls[1].args, ["-c", "fetch.negotiationAlgorithm=noop", "fetch", "--quiet", "--filter=blob:none", "--depth=1", "--no-tags", "--no-write-fetch-head", "--refmap=", "origin", sha]);
  assert.ok(calls.every(c => c.options.timeout > 0 && c.options.timeout <= 90_000));
});

test("transient fetch failure re-advertises and retries the new exact tip", () => {
  let failed = false, advertisements = 0;
  const next = "b".repeat(40);
  assert.equal(fetchHistoryArchiveTip({ remote: "origin", branch, run(args) {
    if (args[0] === "ls-remote") return `${++advertisements === 1 ? sha : next}\trefs/heads/${branch}`;
    if (args.includes("fetch") && !failed) { failed = true; throw Error("history_preservation_git_failed:fetch:ECONNRESET"); }
    return args[0] === "rev-parse" ? next : "";
  } }), next);
  assert.equal(advertisements, 2);
});

test("timeouts exhaust a shared budget rather than restarting it on each retry", () => {
  let time = 0, calls = 0;
  assert.throws(() => fetchHistoryArchiveTip({ remote: "origin", branch, budgetMs: 100, now: () => time, run(args, options) {
    calls++; assert.equal(options.timeout, 100); time += 100;
    throw Error("history_preservation_git_failed:ls-remote:ETIMEDOUT");
  } }), /budget_exhausted/);
  assert.equal(calls, 1);
});

test("permanent failures stop after three attempts and identity errors are never retried", () => {
  let calls = 0;
  assert.throws(() => fetchHistoryArchiveTip({ remote: "origin", branch, run() { calls++; throw Error("history_preservation_git_failed:ls-remote:128"); } }), /git_failed/);
  assert.equal(calls, 3);
  for (const response of ["bad", `${sha}\trefs/heads/main`, `${advertisement}${advertisement}`]) {
    calls = 0;
    assert.throws(() => fetchHistoryArchiveTip({ remote: "origin", branch, run() { calls++; return response; } }), /tip_invalid/);
    assert.equal(calls, 1);
  }
  assert.equal(fetchHistoryArchiveTip({ remote: "origin", branch, run: () => "" }), null);
});
