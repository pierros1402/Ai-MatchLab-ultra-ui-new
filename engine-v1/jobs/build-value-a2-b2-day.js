import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { buildValueDay } from "../core/build-value-day.js";
import { deriveValueFromOdds } from "./derive-value-from-odds.js";

export async function buildValueA2B2Day(dayKey) {
  const dir = resolveDataPath("value-plans", dayKey);
  ensureDir(dir);
  const planA2 = await buildValueDay(dayKey, {
    rebuild: true,
    opponentAdjusted: true,
    outputPath: resolveDataPath("value-plans", dayKey, "plan-a2.json"),
    auditPath: resolveDataPath("value-plans", dayKey, "plan-a2-audit.json")
  });
  const planB2 = deriveValueFromOdds(dayKey, { outputMode: "plan-b2-observation" });
  return { ok: planA2?.ok === true && planB2?.ok === true, date: dayKey, plans: { A2: planA2, B2: planB2 } };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const dayKey = process.argv.slice(2).find(v => /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (!dayKey) throw new Error("A valid YYYY-MM-DD day is required.");
  buildValueA2B2Day(dayKey).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
