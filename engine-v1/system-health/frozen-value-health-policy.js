import { isFrozenValueGateReleaseSafe } from "../core/frozen-value-release-contract.js";

export function collectFrozenValueHealthIssues(gate) {
  const issues = [];
  const issue = (severity, type, message) => ({ severity, source: "manifest", type, message, details: gate });
  if (gate?.ok === false) {
    issues.push(issue("error", "value_gate_failed", "Manifest Value gate failed."));
  }
  if (gate?.valueFreshAgainstCanonical === false) {
    // Preserve explicit failure and require complete evidence before classifying frozen age as informational.
    const safe = gate.ok === true && gate.dayBound === true && gate.canonicalSourceBound === true &&
      gate.orphanPickCount === 0 && gate.missingMatchIdPickCount === 0 &&
      isFrozenValueGateReleaseSafe(gate);
    issues.push(safe
      ? issue("info", "frozen_value_age_preserved", "Frozen Value artifact predates canonical updates and satisfies the frozen release contract.")
      : issue("error", "value_stale_against_canonical", "Production Value artifact is stale against canonical fixtures."));
  }
  return issues;
}
