import fs from "node:fs";
import { athensDayKey } from "../core/daykey.js";
import { ensurePlanAObservationDay, isPlanAObservationDay, readPlanAObservationDay } from "./plan-a-observation.js";

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
