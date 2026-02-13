import { normalizeInput } from "./normalize.js";
import { computeCoverage } from "./coverage.js";
import { identityModel } from "./identity.model.js";
import { strengthModel } from "./strength.model.js";
import { stateModel } from "./state.model.js";
import { pressureModel } from "./pressure.model.js";
import { riskModel } from "./risk.model.js";
import { scenarioModel } from "./scenario.model.js";
import { consistencyModel } from "./consistency.model.js";
import { confidenceModel } from "./confidence.model.js";

export function runAiEngine(rawInput) {
  const normalized = normalizeInput(rawInput);
  const coverage = computeCoverage(normalized);

  const identity = identityModel(normalized, coverage);
  const strength = strengthModel(normalized, coverage);
  const state = stateModel(normalized, coverage);
  const pressure = pressureModel(normalized, identity, state);
  const consistency = consistencyModel(normalized);
  const risk = riskModel(normalized, strength, state, consistency);
  const scenario = scenarioModel(strength, state, risk, consistency);
  const confidence = confidenceModel(coverage, risk);

  return {
    ok: true,
    ts: Date.now(),
    coverage,
    identity,
    strength,
    state,
    pressure,
    risk,
    scenario,
    consistency,
    confidence
  };
}