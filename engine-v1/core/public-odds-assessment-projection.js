/** Public read boundary only. Never mutate stored odds, provenance, or historical assessments. */
import { assessPublicationIdentity } from "./assessment-publication-identity.js";

const identity = row => String(row?.canonicalId || row?.matchId || "").trim();

export function projectPublicOddsRow(row, fixtures = [], dayKey = null, { duplicateIdentity = false } = {}) {
  if (!row || typeof row !== "object") return row;
  if (!row.aiAssessment) return row;
  const sameDay = Boolean(dayKey && row.dayKey === dayKey);
  const authorized = !duplicateIdentity && sameDay &&
    assessPublicationIdentity(row, fixtures).status === "publish";
  return authorized ? row : { ...row, aiAssessment: null };
}

export function projectPublicOddsRows(rows = [], fixtures = [], dayKey = null) {
  if (!Array.isArray(rows)) return [];
  // Duplicate identities are ambiguous, regardless of row ordering or model origin.
  const occurrences = new Map();
  for (const row of rows) {
    const key = identity(row);
    if (key) occurrences.set(key, (occurrences.get(key) || 0) + 1);
  }
  return rows.map(row => projectPublicOddsRow(row, fixtures, dayKey, {
    duplicateIdentity: (occurrences.get(identity(row)) || 0) > 1
  }));
}
