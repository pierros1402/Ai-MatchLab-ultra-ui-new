import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runValueDataAlarmDay } from "./run-value-data-alarm-day.js";
test("alarm scans previous-day readiness for the next week, persists before research, and retains failures across days", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-alarm-test-"));
  const id = "cid_alarm_future_20991004";
  const fixtures = day => day === "2099-10-04" ? [{ canonicalId: id, leagueSlug: "egy.2", homeTeam: "A", awayTeam: "B", kickoffUtc: "2099-10-04T10:00Z" }] : [];
  let calls = 0;
  const dependencies = { queueRoot: root, fixtures, assessments: () => [], standings: () => ({ ok: false, validation: { issues: ["TEAM_COUNT_AUTHORITY_MISSING"] } }),
    supplement: () => ({ assessmentRowsWritten: 0 }), primarySearch: async options => { assert.deepEqual(options.leagues, ["egy.2"]); return { ok: false, error: "primary_unavailable" }; }, search: async () => {
      calls++;
      const queue = JSON.parse(fs.readFileSync(path.join(root, "queue.json")));
      assert.ok(queue.incidents[id], "alarm must exist before the source search starts");
      throw new Error("provider_unavailable");
    } };
  try {
    const options = { dependencies, nowMs: Date.parse("2099-10-01T08:00Z") };
    const dry = await runValueDataAlarmDay("2099-10-01", options);
    assert.equal(dry.report.days.length, 8);
    assert.equal(dry.report.futureOpen, 1);
    assert.equal(dry.report.readinessComplete, false);
    assert.equal(fs.readdirSync(root).length, 0);
    const applied = await runValueDataAlarmDay("2099-10-01", { ...options, write: true, research: true });
    assert.equal(calls, 1);
    assert.equal(applied.queue.incidents[id].status, "DATA_SEARCH_REQUIRED");
    assert.equal(Object.values(applied.queue.research)[0].result.status, "SOURCE_SEARCH_FAILED");
    assert.equal(Object.values(applied.queue.research)[0].result.primarySource.error, "primary_unavailable");
    await runValueDataAlarmDay("2099-10-01", { ...options, write: true, research: true });
    assert.equal(calls, 1, "backoff must prevent repeated source requests on every five-minute tick");
    const rollover = await runValueDataAlarmDay("2099-10-10", { ...options, write: true, research: true, nowMs: Date.parse("2099-10-10T08:00Z") });
    assert.ok(rollover.queue.incidents[id], "the next day cannot erase an unresolved old fixture");
    assert.equal(rollover.queue.incidents[id].status, "HISTORICAL_GAP_OPEN");
    const generated = { ...dependencies, supplement: () => ({ assessmentRowsWritten: 1 }), exportOdds: async () => ({ ok: true, changed: true }),
      persistedOdds: () => ({ matches: [{ canonicalId: id, dayKey: "2099-10-04", aiAssessment: { markets: { OU25: { probs: { over: 0.64 } } } } }] }) };
    const restored = await runValueDataAlarmDay("2099-10-01", { ...options, dependencies: generated, write: true });
    assert.equal(restored.queue.incidents[id].status, "RESOLVED");
    assert.deepEqual(restored.report.oddsWrittenDays, ["2099-10-04"]);
    const unpersisted = { ...generated, persistedOdds: () => ({ matches: [] }) };
    const notUsed = await runValueDataAlarmDay("2099-10-01", { ...options, dependencies: unpersisted, write: true });
    assert.notEqual(notUsed.queue.incidents[id].status, "RESOLVED", "producer success cannot close an incident when the persisted input is still missing");
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true });
  }
});
