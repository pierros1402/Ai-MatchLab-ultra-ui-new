import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { buildValueDay } from "../core/build-value-day.js";
import { deriveValueFromOdds } from "./derive-value-from-odds.js";

function validDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""));
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function shouldFreezeAdjustedValueObservations(
  dayKey,
  calendarDay = athensDayKey()
) {
  return Boolean(
    validDay(dayKey) &&
    validDay(calendarDay) &&
    String(dayKey) <= String(calendarDay)
  );
}

function validFrozenA2(dayKey, plan, audit) {
  const picks = Array.isArray(plan?.picks) ? plan.picks : null;
  const count = Number(plan?.count);
  const fixtureUniverse = audit?.fixtureUniverse || null;

  return Boolean(
    String(plan?.date || "") === dayKey &&
    picks &&
    Number.isInteger(count) &&
    count === picks.length &&
    audit?.ok === true &&
    String(audit?.date || "") === dayKey &&
    String(audit?.planId || "") === "plan-a2" &&
    fixtureUniverse &&
    Number.isInteger(Number(fixtureUniverse?.count)) &&
    String(fixtureUniverse?.hash || "").trim()
  );
}

function validFrozenB2(dayKey, plan, audit) {
  const picks = Array.isArray(plan?.picks) ? plan.picks : null;
  const count = Number(plan?.count);
  const fixtureUniverse =
    plan?.sourceContract?.fixtureUniverse ||
    audit?.membership?.fixtureUniverse ||
    null;

  return Boolean(
    plan?.ok === true &&
    String(plan?.date || "") === dayKey &&
    String(plan?.planId || "") === "plan-b2" &&
    String(plan?.outputMode || "") === "plan-b2-observation" &&
    picks &&
    Number.isInteger(count) &&
    count === picks.length &&
    audit?.ok === true &&
    String(audit?.date || "") === dayKey &&
    fixtureUniverse &&
    Number.isInteger(Number(fixtureUniverse?.count)) &&
    String(fixtureUniverse?.hash || "").trim()
  );
}

export function readFrozenAdjustedValueObservations(dayKey) {
  const dir = resolveDataPath("value-plans", dayKey);
  const planA2 = readJsonSafe(path.join(dir, "plan-a2.json"));
  const auditA2 = readJsonSafe(path.join(dir, "plan-a2-audit.json"));
  const planB2 = readJsonSafe(path.join(dir, "plan-b2.json"));
  const auditB2 = readJsonSafe(path.join(dir, "plan-b2-audit.json"));

  return {
    A2: validFrozenA2(dayKey, planA2, auditA2)
      ? { ...planA2, fixtureUniverse: auditA2.fixtureUniverse, frozenObservation: true }
      : null,
    B2: validFrozenB2(dayKey, planB2, auditB2)
      ? { ...planB2, frozenObservation: true }
      : null
  };
}

export async function buildValueA2B2Day(dayKey, options = {}) {
  const dir = resolveDataPath("value-plans", dayKey);
  ensureDir(dir);

  const calendarDay = String(options.calendarDay || athensDayKey());
  const freezeObservations = shouldFreezeAdjustedValueObservations(
    dayKey,
    calendarDay
  );

  const readFrozen = options.readFrozen || readFrozenAdjustedValueObservations;
  const buildValue = options.buildValue || buildValueDay;
  const deriveValue = options.deriveValue || deriveValueFromOdds;

  if (freezeObservations) {
    const frozen = readFrozen(dayKey) || {};

    if (!frozen.A2 || !frozen.B2) {
      return {
        ok: false,
        date: dayKey,
        freezeObservations: true,
        reason: "missing_or_invalid_frozen_adjusted_value_observation",
        missing: [
          !frozen.A2 ? "A2" : null,
          !frozen.B2 ? "B2" : null
        ].filter(Boolean),
        plans: {
          A2: frozen.A2 || null,
          B2: frozen.B2 || null
        }
      };
    }

    return {
      ok: true,
      date: dayKey,
      freezeObservations: true,
      preservedExisting: true,
      plans: {
        A2: {
          ...frozen.A2,
          ok: true
        },
        B2: frozen.B2
      }
    };
  }

  const planA2 = await buildValue(dayKey, {
    rebuild: true,
    opponentAdjusted: true,
    outputPath: resolveDataPath("value-plans", dayKey, "plan-a2.json"),
    auditPath: resolveDataPath("value-plans", dayKey, "plan-a2-audit.json")
  });

  const planB2 = deriveValue(dayKey, {
    freeze: false,
    outputMode: "plan-b2-observation"
  });

  return {
    ok: planA2?.ok === true && planB2?.ok === true,
    date: dayKey,
    freezeObservations: false,
    preservedExisting: false,
    plans: {
      A2: planA2,
      B2: planB2
    }
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const dayKey = process.argv.slice(2).find(v => /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (!dayKey) throw new Error("A valid YYYY-MM-DD day is required.");
  buildValueA2B2Day(dayKey)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
