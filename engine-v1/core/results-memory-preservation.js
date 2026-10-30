// Pure, source-only preservation primitive. No Git or data writes.
function id(value) { return String(value ?? "").trim(); }
function score(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}
function records(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      !payload.teams || typeof payload.teams !== "object" || Array.isArray(payload.teams)) {
    throw new Error("results_memory_invalid_shape");
  }
  const out = new Map();
  for (const [team, entries] of Object.entries(payload.teams)) {
    if (!Array.isArray(entries)) throw new Error("results_memory_invalid_entries");
    for (const row of entries) {
      if (!row || typeof row !== "object") throw new Error("results_memory_invalid_record");
      if ((row.gf !== undefined && row.gf !== null && row.gf !== "" && score(row.gf) === null) ||
          (row.ga !== undefined && row.ga !== null && row.ga !== "" && score(row.ga) === null)) {
        throw new Error("results_memory_invalid_score");
      }
      const matchId = id(row.matchId);
      if (!matchId || !["H", "A"].includes(row.ha)) throw new Error("results_memory_unbound_identity");
      const key = JSON.stringify([team, row.ha, matchId]);
      if (out.has(key)) throw new Error("results_memory_duplicate_identity");
      out.set(key, row);
    }
  }
  return out;
}
export function inspectResultsMemoryPreservation(before, after) {
  const oldRows = records(before), newRows = records(after);
  const violations = [];
  for (const [key, oldRow] of oldRows) {
    const current = newRows.get(key);
    if (!current) { violations.push({ reason: "missing_existing_record", identity: key }); continue; }
    if (["W", "D", "L"].includes(oldRow.res) && current.res !== oldRow.res) {
      violations.push({ reason: "existing_result_changed_without_adjudication", identity: key });
    }
    const oldHome = score(oldRow.gf), oldAway = score(oldRow.ga);
    const newHome = score(current.gf), newAway = score(current.ga);
    if (oldHome !== null && oldAway !== null &&
        (newHome !== oldHome || newAway !== oldAway)) {
      violations.push({ reason: "existing_score_changed_without_adjudication", identity: key });
    }
  }
  return { ok: violations.length === 0, priorRows: oldRows.size,
    candidateRows: newRows.size, violations };
}
