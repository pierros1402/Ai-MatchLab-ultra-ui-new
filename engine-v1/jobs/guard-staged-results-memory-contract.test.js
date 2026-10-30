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
  assert.match(guard, /canonical_identity_unverifiable/);
  assert.match(guard, /canonical_identity_missing/);
  assert.match(guard, /canonical_verified_terminal_mutation/);
  assert.match(guard, /new Set\(priorIds\)\.size !== priorIds\.length/);
  assert.match(guard, /new Set\(nextIds\)\.size !== nextIds\.length/);
  assert.match(guard, /if \(terminal\(row\)\)/);
});
