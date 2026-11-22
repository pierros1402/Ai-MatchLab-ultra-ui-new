import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workflowPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.github/workflows/odds-refresh.yml"
);
const workflow = fs.readFileSync(workflowPath, "utf8");

function step(name) {
  const anchor = `      - name: ${name}\n`;
  const start = workflow.indexOf(anchor);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const end = workflow.indexOf("\n      - name:", start + anchor.length);
  return {
    start,
    body: workflow.slice(start, end === -1 ? undefined : end)
  };
}

test("certified model checkpoint precedes external bookmaker collection", () => {
  const producer = step("Run gated odds refresh");
  const checkpoint = step("Persist certified assessment checkpoint before bookmaker collection");
  const multi = step("Capture multi-bookmaker odds on the durable GitHub writer");
  const multiCommit = step("Commit odds snapshot if changed");
  const coverage = step("Enforce assessment coverage after durable snapshot checkpoint");
  assert.ok(producer.start < checkpoint.start);
  assert.ok(checkpoint.start < multi.start);
  assert.ok(multi.start < multiCommit.start);
  assert.ok(multiCommit.start < coverage.start);
});

test("early checkpoint has its own strict staged boundary and durable push", () => {
  const { body } = step("Persist certified assessment checkpoint before bookmaker collection");
  assert.match(body, /set -euo pipefail/);
  assert.match(body, /git restore --staged \. \|\| true/);
  assert.match(body, /git add "\$ODDS_FILE"/);
  assert.match(body, /git add "\$FIXTURES_FILE"/);
  assert.match(body, /guard-staged-data-boundary\.js/);
  assert.match(body, /--label=odds-assessment-pre-bookmaker-checkpoint/);
  assert.match(body, /--allow=.*deploy-snapshots/);
  assert.doesNotMatch(body, /data\/multi-odds/);
  assert.match(body, /git commit -m "Checkpoint certified model assessments/);
  assert.match(body, /bash tools\/git-push-rebase-retry\.sh/);
});

test("incomplete assessments remain a failing final gate", () => {
  const producer = step("Run gated odds refresh").body;
  const coverage = step("Enforce assessment coverage after durable snapshot checkpoint").body;
  assert.match(producer, /--checkpoint-incomplete-coverage/);
  assert.match(producer, /ODDS_COVERAGE_STATUS_FILE/);
  assert.match(coverage, /result\.ok !== true \|\| result\.coverageGate !== null/);
  assert.match(coverage, /process\.exit\(1\)/);
});
