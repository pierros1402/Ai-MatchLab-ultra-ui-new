import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

test("staged results-memory preservation is fail-closed and opt-in only", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("./guard-staged-data-boundary.js", import.meta.url)), "utf8");
  assert.match(source, /hasFlag\("enforce-results-preservation"\)/);
  assert.match(source, /inspectResultsMemoryPreservation\(before, after\)/);
  assert.match(source, /status === "A" \? \{ teams: \{\} \} : JSON\.parse\(git\(\["show", `HEAD:\$\{p\}`\]\)\)/);
  assert.match(source, /git\(\["show", `:\$\{p\}`\]\)/);
  assert.match(source, /results_memory_preservation_unverifiable/);
  assert.match(source, /enforceResultsPreservation && \["A", "M"\]\.includes\(statusLetter\)/);
  assert.doesNotMatch(source, /allow-results-memory-shrink/);
});

test("Daily writer enforces results-memory preservation before any commit or push", () => {
  const workflow = fs.readFileSync(
    fileURLToPath(new URL("../../.github/workflows/daily-autonomous.yml", import.meta.url)),
    "utf8"
  );
  const stage = workflow.indexOf("node engine-v1/jobs/guard-staged-data-boundary.js");
  const enforcement = workflow.indexOf("--enforce-results-preservation", stage);
  const commit = workflow.indexOf('git commit -m "Daily autonomous run', stage);
  const push = workflow.indexOf("bash tools/git-push-rebase-retry.sh", stage);
  assert.ok(stage >= 0 && enforcement > stage, "Daily preservation guard must be enabled");
  assert.ok(commit > enforcement, "guard must precede commit");
  assert.ok(push > commit, "commit must precede push");
  assert.equal(workflow.indexOf("--enforce-results-preservation", enforcement + 1), -1);
});

test("Intraday authoritative checkpoint denies canonical row shrink before commit", () => {
  const workflow = fs.readFileSync(
    fileURLToPath(new URL("../../.github/workflows/intraday-deploy-snapshot-refresh.yml", import.meta.url)),
    "utf8"
  );
  const guard = fs.readFileSync(fileURLToPath(new URL("./guard-staged-data-boundary.js", import.meta.url)), "utf8");
  const checkpoint = workflow.indexOf("--label=intraday-authoritative-truth-checkpoint");
  const preservation = workflow.lastIndexOf("--enforce-canonical-row-preservation", checkpoint);
  const commit = workflow.indexOf('git commit -m "Persist intraday canonical truth', checkpoint);
  assert.ok(preservation >= 0 && checkpoint > preservation && commit > checkpoint);
  assert.match(guard, /canonical_row_count_regression/);
  assert.match(guard, /canonical_row_preservation_unverifiable/);
  assert.match(guard, /current\.length < previous\.length/);
});

test("canonical staged guard rejects missing identities and changed terminal evidence", () => {
  const guard = fs.readFileSync(fileURLToPath(new URL("./guard-staged-data-boundary.js", import.meta.url)), "utf8");
  for (const expected of [
    "canonical_identity_unverifiable",
    "canonical_identity_missing",
    "canonical_verified_terminal_mutation",
    "new Set(priorIds).size !== priorIds.length",
    "new Set(nextIds).size !== nextIds.length",
    "if (terminal(row))"
  ]) {
    assert.ok(guard.includes(expected), "missing fail-closed condition: " + expected);
  }
});

test("Daily and Intraday publication activate canonical and verified-final gates", () => {
  const daily = fs.readFileSync(fileURLToPath(new URL("../../.github/workflows/daily-autonomous.yml", import.meta.url)), "utf8");
  const intraday = fs.readFileSync(fileURLToPath(new URL("../../.github/workflows/intraday-deploy-snapshot-refresh.yml", import.meta.url)), "utf8");
  const start = daily.indexOf("node engine-v1/jobs/guard-staged-data-boundary.js");
  const boundary = daily.indexOf("--allow=", start);
  assert.ok(start >= 0 && boundary > start);
  const command = daily.slice(start, boundary);
  assert.ok(command.includes("--enforce-verified-final-preservation"));
  assert.ok(command.includes("--enforce-canonical-row-preservation"));
  const publicCheckpoint = intraday.split("\n").find(line => line.includes("--label=intraday-public-truth-checkpoint"));
  assert.ok(publicCheckpoint?.includes("--enforce-canonical-row-preservation"));
});
