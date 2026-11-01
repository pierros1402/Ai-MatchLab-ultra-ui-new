import fs from "node:fs";
import { athensDayKey, shiftDay } from "../core/daykey.js";
import { ensurePlanAObservationDay, isPlanAObservationDay, readPlanAObservationDay } from "./plan-a-observation.js";

export function dailyPublicationAdmission(day, {
  now = new Date(), today = athensDayKey(now), minuteOfDay = null, budgetMinutes = 300
} = {}) {
  if (day <= today) return { admitted: true, mode: "current_or_historical_recovery" };
  if (day !== shiftDay(today, 1)) throw Error("daily_future_publication_outside_next_day_window");
  if (minuteOfDay === null) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    minuteOfDay = Number(parts.find(p => p.type === "hour").value) * 60 + Number(parts.find(p => p.type === "minute").value);
  }
  return {
    admitted: minuteOfDay + budgetMinutes <= 1430,
    mode: "next_day_prepublication",
    reason: minuteOfDay + budgetMinutes <= 1430 ? null : "next_day_full_cycle_deadline_missed"
  };
}

// A late pipeline must never invent a first observation for a closed day.
export function checkpointDailyPlanA(day, payload, {
  today = athensDayKey(), read = readPlanAObservationDay,
  exists = fs.existsSync, ensure = ensurePlanAObservationDay
} = {}) {
  if (!isPlanAObservationDay(day)) return { ok: true, required: false };
  const existing = read(day);
  const present = exists(existing.file);
  if (present && !existing.ok) throw new Error("invalid_existing_plan_a_observation");
  if (!present && day < today) throw new Error("missing_historical_plan_a_observation");
  if (payload === undefined) return { ok: true, required: true, preservedExisting: present };
  if (payload?.ok !== true || payload.date !== day || !Array.isArray(payload.picks)) {
    throw new Error("invalid_daily_plan_a_checkpoint_payload");
  }
  const result = ensure(day, payload, {
    sourcePath: `data/value/${day}.json`,
    provenance: {
      kind: "daily_cycle_first_value_output",
      note: "Freeze the first successful production output before downstream enrichment and midnight rollover."
    }
  });
  if (result?.ok !== true) throw new Error(result?.reason || "daily_plan_a_checkpoint_failed");
  return result;
}
