import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkpointDailyPlanA } from "./daily-plan-a-checkpoint.js";
import { ensurePlanAObservationAtPaths } from "./plan-a-observation.js";

test("scheduled full cycle fits the Athens admission and midnight budget in both seasons", () => {
  const workflow = fs.readFileSync(new URL("../../.github/workflows/daily-deploy-snapshot.yml", import.meta.url), "utf8");
  const [, minute, hour] = workflow.match(/cron: "(\d+) (\d+) \* \* \*"/);
  const budget = Number(workflow.match(/^    timeout-minutes: (\d+)$/m)[1]);
  for (const date of ["2026-01-15", "2026-07-15"]) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(`${date}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00Z`));
    const start = Number(parts.find(p => p.type === "hour").value) * 60 + Number(parts.find(p => p.type === "minute").value);
    assert.ok(start >= 1050 && start <= 1130, `${date}: scheduled run must be admitted`);
    assert.ok(start + budget <= 1430, `${date}: full budget must end before midnight`);
    assert.ok(budget >= 240, "observed four-hour incident run must fit the full budget");
  }
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

