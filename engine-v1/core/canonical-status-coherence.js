import { hasMatchStateConflict } from "./non-played-state.js";

function clean(value) {
  return String(value ?? "").trim();
}

export function canonicalRowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function conflictRecord({ path = "", index, row, surface }) {
  return {
    path: clean(path) || null,
    index,
    matchId: clean(row?.canonicalId || row?.matchId || row?.id) || null,
    surface,
    status: row?.status ?? null,
    statusType: row?.statusType ?? null,
    rawStatus: row?.rawStatus ?? null,
    operationalState: row?.operationalState ?? null
  };
}

export function findCanonicalStatusConflicts(payload, { path = "" } = {}) {
  const rows = canonicalRowsFromPayload(payload);
  const conflicts = [];

  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") return;

    if (hasMatchStateConflict(row)) {
      conflicts.push(conflictRecord({ path, index, row, surface: "canonical" }));
    }

    const observation = row?.authoritativeTerminalWriteback?.observation;
    if (observation && typeof observation === "object" && hasMatchStateConflict(observation)) {
      conflicts.push(
        conflictRecord({
          path,
          index,
          row: {
            ...observation,
            canonicalId: row?.canonicalId,
            matchId: row?.matchId,
            id: row?.id
          },
          surface: "authoritativeTerminalWriteback.observation"
        })
      );
    }
  });

  return conflicts;
}

export function assertCanonicalStatusCoherence(payload, options = {}) {
  const conflicts = findCanonicalStatusConflicts(payload, options);
  if (conflicts.length > 0) {
    const error = new Error(`canonical_status_coherence_failed:${conflicts.length}`);
    error.conflicts = conflicts;
    throw error;
  }
  return true;
}
