import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkpointDailyPlanA, dailyPublicationAdmission } from "./daily-plan-a-checkpoint.js";
import { ensurePlanAObservationAtPaths } from "./plan-a-observation.js";

test("scheduled full cycle fits the Athens admission and midnight budget in both seasons", () => {
  const workflow = fs.readFileSync(new URL("../../.github/workflows/daily-deploy-snapshot.yml", import.meta.url), "utf8");
  const [, minute, hour] = workflow.match(/cron: "(\d+) (\d+) \* \* \*"/);
  const budget = Number(workflow.match(/^    timeout-minutes: (\d+)$/m)[1]);
  for (const date of ["2026-01-15", "2026-07-15"]) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(`${date}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00Z`));
    const start = Number(parts.find(p => p.type === "hour").value) * 60 + Number(parts.find(p => p.type === "minute").value);
    assert.ok(start >= 1020 && start <= 1130, `${date}: scheduled run must be admitted`);
    assert.ok(start + 10 <= 1130, `${date}: a ten-minute cold checkout must still be admitted`);
    assert.ok(start + 10 + budget <= 1430, `${date}: checkout and full budget must end before midnight`);
    assert.ok(budget >= 240, "observed four-hour incident run must fit the full budget");
  }
});

test("watchdog next-day fallback has the same full-cycle midnight budget", () => {
  const daily = fs.readFileSync(new URL("../../.github/workflows/daily-deploy-snapshot.yml", import.meta.url), "utf8");
  const watchdog = fs.readFileSync(new URL("../../.github/workflows/publication-watchdog.yml", import.meta.url), "utf8");
  const budget = Number(daily.match(/^    timeout-minutes: (\d+)$/m)[1]);
  const start = Number(watchdog.match(/ATHENS_TOTAL_MINUTES\}" -ge (\d+)/)[1]);
  const end = Number(watchdog.match(/ATHENS_TOTAL_MINUTES\}" -le (\d+)/)[1]);
  assert.ok(start <= end);
  assert.ok(end + budget <= 1430, "watchdog must leave the full Daily budget before midnight");
});

test("a next-day manual dispatch delayed in the writer queue cannot start past its full budget", () => {
  const today = "2026-11-01", day = "2026-11-02";
  assert.equal(dailyPublicationAdmission(day, { today, minuteOfDay: 1130 }).admitted, true);
  assert.equal(dailyPublicationAdmission(day, { today, minuteOfDay: 1131 }).admitted, false);
  assert.equal(dailyPublicationAdmission(day, { today, minuteOfDay: 1200 }).reason, "next_day_full_cycle_deadline_missed");
  assert.equal(dailyPublicationAdmission(today, { today, minuteOfDay: 1439 }).admitted, true);
  assert.throws(() => dailyPublicationAdmission("2026-11-03", { today, minuteOfDay: 600 }), /outside_next_day_window/);
});

test("first production output survives midnight and later candidates without rewriting signed bytes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-daily-freeze-"));
  const observationFile = path.join(root, "plan-a.json"), auditFile = path.join(root, "audit.json");
  const day = "2026-10-31";
  const read = () => ({ file: observationFile, ok: fs.existsSync(observationFile) });
  const ensure = (dayKey, sourcePayload, options) => ensurePlanAObservationAtPaths({
    dayKey, sourcePayload, observationFile, auditFile, ...options
  });
  const payload = { ok: true, date: day, source: "canonical_fixtures", picks: [{ matchId: "cid-1", market: "1X2", pick: "HOME" }] };
  try {
    const first = checkpointDailyPlanA(day, payload, { today: day, read, ensure });
    assert.equal(first.created, true);
    const bytes = fs.readFileSync(observationFile);
    const later = checkpointDailyPlanA(day, { ...payload, picks: [] }, { today: "2026-11-01", read, ensure });
    assert.equal(later.preservedExisting, true);
    assert.equal(later.conflict, true);
    assert.deepEqual(fs.readFileSync(observationFile), bytes);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("closed day with no original observation cannot be reconstructed", () => {
  let writes = 0;
  assert.throws(() => checkpointDailyPlanA("2026-10-31", { ok: true, date: "2026-10-31", picks: [] }, {
    today: "2026-11-01", read: () => ({ file: "absent", ok: false }), exists: () => false,
    ensure: () => { writes++; }
  }), /missing_historical_plan_a_observation/);
  assert.equal(writes, 0);
});

test("invalid stored observation and unsuccessful/wrong-day candidates fail before writes", () => {
  const day = "2026-11-01";
  const base = { today: day, read: () => ({ file: "absent", ok: false }), exists: () => false,
    ensure: () => { throw Error("unexpected_write"); } };
  for (const payload of [{ ok: false, date: day, picks: [] }, { ok: true, date: "2026-11-02", picks: [] }]) {
    assert.throws(() => checkpointDailyPlanA(day, payload, base), /invalid_daily_plan_a_checkpoint_payload/);
  }
  assert.throws(() => checkpointDailyPlanA(day, undefined, { ...base, exists: () => true }), /invalid_existing_plan_a_observation/);
});

