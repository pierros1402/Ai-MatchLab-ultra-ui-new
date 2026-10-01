import { hasModelAssessment } from "../core/plan-b-canonical-membership.js";

export const ASSESSMENT_IDENTITY_FIELDS = [
  "sourceId", "sourceMatchId", "providerMatchId", "providerIds", "canonicalAliases", "sources"
];

export function assessmentIdentityFields(row = {}) {
  return Object.fromEntries(ASSESSMENT_IDENTITY_FIELDS
    .filter(key => row[key] !== undefined)
    .map(key => [key, row[key]]));
}

// Ephemeral runners can have a small fresh set and a complementary persisted set.
// Union by exact identity; never join by team names or drop one set by row count.
export function mergeAssessmentReadView(liveRows = [], persistedRows = [], dayKey = null) {
  const byId = new Map();
  const unidentified = [];
  for (const row of persistedRows) {
    if (dayKey && row?.dayKey && row.dayKey !== dayKey) continue;
    const id = String(row?.canonicalId || row?.matchId || "").trim();
    if (!id) { unidentified.push(row); continue; }
    // Keep conflicting duplicate assessments visible to the fail-closed join.
    if (byId.has(id)) unidentified.push(row);
    else byId.set(id, row);
  }
  const seenLive = new Set();
  for (const row of liveRows) {
    if (dayKey && row?.dayKey && row.dayKey !== dayKey) continue;
    const id = String(row?.canonicalId || row?.matchId || "").trim();
    if (!id) { unidentified.push(row); continue; }
    const prior = byId.get(id);
    if (seenLive.has(id)) { unidentified.push(row); continue; }
    seenLive.add(id);
    byId.set(id, prior ? {
      ...prior,
      ...row,
      aiAssessment: hasModelAssessment(row) ? row.aiAssessment : prior.aiAssessment
    } : row);
  }
  const matches = [...byId.values(), ...unidentified];
  const liveIds = new Set(liveRows.filter(hasModelAssessment).map(row => String(row.canonicalId || row.matchId || "")));
  const persistedUsed = matches.some(row => hasModelAssessment(row) && !liveIds.has(String(row.canonicalId || row.matchId || "")));
  return {
    matches,
    source: persistedUsed
      ? liveIds.size > 0 ? "live_store_with_deploy_snapshot_assessments" : "deploy_snapshot_assessment_fallback"
      : "live_store",
    assessmentRows: matches.filter(hasModelAssessment).length
  };
}
