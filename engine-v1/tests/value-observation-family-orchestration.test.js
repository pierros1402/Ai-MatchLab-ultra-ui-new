import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const refreshPath = "engine-v1/jobs/refresh-value-artifacts-day.js";
const workflowPath = ".github/workflows/daily-deploy-snapshot.yml";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

test("Value refresh freezes Plan B and adjusted observations on current/historical days", () => {
  const source = read(refreshPath);

  for (const signal of [
    "shouldFreezeAdjustedValueObservations",
    "freezeObservationFamily",
    "missing_or_invalid_frozen_plan_b_observation",
    "frozenObservation: true",
    "calendarDay: athensDayKey()"
  ]) {
    assert.ok(source.includes(signal), `missing refresh freeze signal: ${signal}`);
  }

  const freezeDecision = source.indexOf("const freezeObservationFamily");
  const planBRead = source.indexOf('resolveDataPath("value-plans", date, "plan-b.json")');
  const adjustedBuild = source.indexOf("const adjustedPlans = await buildValueA2B2Day");

  assert.ok(freezeDecision >= 0);
  assert.ok(planBRead > freezeDecision);
  assert.ok(adjustedBuild > planBRead);
});

test("daily build refreshes canonical assessment coverage before snapshot export", () => {
  const workflow = read(workflowPath);

  const coverageRefresh = workflow.indexOf(
    "Refresh canonical model assessment coverage for Value Plans B/B2"
  );
  const exportSnapshot = workflow.indexOf("- name: Export deploy snapshot");

  assert.ok(coverageRefresh >= 0, "coverage refresh step missing");
  assert.ok(exportSnapshot >= 0, "snapshot export step missing");
  assert.ok(
    coverageRefresh < exportSnapshot,
    "assessment coverage refresh must run before snapshot export"
  );

  assert.ok(
    workflow.includes('refresh-model-assessment-coverage-day.js "$DAY_KEY" --gate'),
    "coverage refresh must be a hard gate"
  );
});

test("daily build binds canonical assessment coverage to B/B2 joins before comparison", () => {
  const workflow = read(workflowPath);

  const strongGate = workflow.indexOf(
    "Enforce canonical assessment coverage for Value Plans B/B2"
  );
  const comparison = workflow.indexOf("- name: Build cumulative value comparison");

  assert.ok(strongGate >= 0, "strong B/B2 assessment coverage gate missing");
  assert.ok(comparison >= 0, "cumulative comparison step missing");
  assert.ok(
    strongGate < comparison,
    "strong assessment coverage gate must run before cumulative comparison"
  );

  for (const signal of [
    "expectedCanonicalAssessmentRows",
    "assessmentRows < expected",
    "joinedMatches < expected"
  ]) {
    assert.ok(workflow.includes(signal), `missing strong coverage signal: ${signal}`);
  }
});
