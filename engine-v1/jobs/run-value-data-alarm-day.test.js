import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runValueDataAlarmDay } from "./run-value-data-alarm-day.js";
test("catch-up research rejects invalid or unbounded league limits before work", async () => {
  for (const maxResearchLeagues of [0, -1, 13, 1.5, NaN]) {
    await assert.rejects(runValueDataAlarmDay("2099-10-04", { maxResearchLeagues }), /invalid_research_league_limit/);
  }
});
test("team research is consumed in the same cycle but raw findings cannot close an incident", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-team-cycle-"));
  const day = "2099-10-04", nowMs = Date.parse(`${day}T08:00Z`);
  const fixture = { canonicalId: "cid_team_cycle", leagueSlug: "egy.2", homeTeam: "A", awayTeam: "B",
    kickoffUtc: `${day}T14:00Z`, providerIds: { flashscore: "match001" } };
  const candidateFile = path.join(root, day, "egy.2.team-native01.egy.2.results.research.json");
  let produced = 0, researched = 0;
  const dependencies = { queueRoot: root, fixtures: () => [fixture], assessments: () => [], standings: () => ({ ok: false }),
    supplement: () => {
      produced++;
      if (produced === 2) assert.ok(fs.existsSync(candidateFile), "second production pass must see persisted research");
      return { assessmentRowsWritten: 0, unavailableEvidence: [{ canonicalId: fixture.canonicalId, homeSample: 1, awaySample: 6 }] };
    }, primarySearch: async () => ({ ok: true }), search: async () => ({ status: "NO_SOURCE" }),
    resultsSearch: async () => ({ rows: [], upcomingAnchors: [{ leagueSlug: "egy.2", providerMatchId: "match001",
      kickoffUtc: fixture.kickoffUtc, home: "A", away: "B", homeProviderTeamId: "native01", homeProviderTeamSlug: "team-a" }] }),
    teamHistorySearch: async () => {
      researched++;
      return { status: "TEAM_RESULTS_AWAIT_CANONICAL_FINAL_VALIDATION", documents: [{ leagueSlug: "egy.2", rows: [{ providerMatchId: "result01" }] }] };
    } };
  try {
    const result = await runValueDataAlarmDay(day, { write: true, research: true, nowMs, lookAheadDays: 0, dependencies });
    assert.equal(produced, 2);
    assert.equal(researched, 1, "consumption must not recursively perform another acquisition");
    assert.equal(result.report.postResearchReevaluation, true);
    assert.equal(result.report.futureOpen, 1);
    assert.notEqual(result.queue.incidents[fixture.canonicalId].status, "RESOLVED");
    assert.equal(result.report.days[0].joined, 0);
    assert.equal(result.report.teamHistoryResearch[0].attempts.length, 1);
    assert.ok(result.queue.teamHistoryAttempts["egy.2|native01"]);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true });
  }
});

test("alarm scans previous-day readiness for the next week, persists before research, and retains failures across days", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-alarm-test-"));
  const id = "cid_alarm_future_20991004";
  const fixtures = day => day === "2099-10-04" ? [{ canonicalId: id, leagueSlug: "egy.2", homeTeam: "A", awayTeam: "B", kickoffUtc: "2099-10-04T10:00Z" }] : [];
  let calls = 0;
  const dependencies = { queueRoot: root, fixtures, assessments: () => [], standings: () => ({ ok: false, validation: { issues: ["TEAM_COUNT_AUTHORITY_MISSING"] } }),
    resultsSearch: async () => ({ status: "RESULTS_AWAIT_IDENTITY_VALIDATION", rows: [{ providerMatchId: "abcdefgh" }] }),
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
    assert.equal(Object.values(applied.queue.research)[0].result.recentResults.rows, 1);
    assert.equal(applied.report.generatedAt, new Date(options.nowMs).toISOString());
    assert.ok(fs.existsSync(path.join(root, "2099-10-01", "egy.2.results.research.json")));
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
    assert.equal(restored.report.days.find(row => row.day === "2099-10-04").joined, 1);
    assert.equal(restored.report.days.find(row => row.day === "2099-10-04").joinedBefore, 0);
    const unpersisted = { ...generated, persistedOdds: () => ({ matches: [] }) };
    const notUsed = await runValueDataAlarmDay("2099-10-01", { ...options, dependencies: unpersisted, write: true });
    assert.notEqual(notUsed.queue.incidents[id].status, "RESOLVED", "producer success cannot close an incident when the persisted input is still missing");
    const broken = await runValueDataAlarmDay("2099-10-01", { ...options, write: true,
      dependencies: { ...dependencies, supplement: () => { throw new Error("producer_broken"); } } });
    assert.equal(broken.report.acquisitionErrors[0].error, "producer_broken");
    const durable = JSON.parse(fs.readFileSync(path.join(root, "queue.json")));
    assert.equal(durable.incidents[id].lastProductionError.error, "producer_broken");
    assert.notEqual(durable.incidents[id].status, "RESOLVED");
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true });
  }
});
