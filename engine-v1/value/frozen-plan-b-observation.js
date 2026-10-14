import fs from "node:fs";

// A later canonical universe cannot invalidate the existence of an original
// observation. Preserve the pair; publication may reject its coverage separately.
export function readFrozenPlanBObservation({ dayKey, outputMode, observationFile, auditFile }) {
  const present = [observationFile, auditFile].map(file => fs.existsSync(file));
  if (!present.some(Boolean)) return null;
  const invalid = () => { throw new Error("invalid_frozen_plan_b_observation_preserved"); };
  if (!present.every(Boolean)) return invalid();
  let plan, audit;
  try {
    plan = JSON.parse(fs.readFileSync(observationFile, "utf8"));
    audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
  } catch { return invalid(); }
  if (plan?.date !== dayKey || plan?.outputMode !== outputMode || !Array.isArray(plan?.picks) ||
      !Number.isInteger(plan?.count) || plan.count !== plan.picks.length ||
      plan?.sourceContract?.canonicalFixtureUniverseRequired !== true ||
      plan?.sourceContract?.oddsMemoryCanCreateFixture !== false ||
      audit?.date !== dayKey || audit?.ok !== true) return invalid();
  return plan;
}
