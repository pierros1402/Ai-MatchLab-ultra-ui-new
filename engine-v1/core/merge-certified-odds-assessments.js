/** Keep previously certified model evidence without suppressing new certified rows.
 * No model is generated or moved across a different fixture identity.
 */
export function mergeCertifiedOddsAssessments(existingRows, candidateRows, canonicalFixtures, classify) {
  if (!Array.isArray(existingRows) || !Array.isArray(candidateRows) ||
      !Array.isArray(canonicalFixtures) || typeof classify !== "function")
    throw new Error("invalid_certified_merge_inputs");
  const candidates = candidateRows.map(row => ({...row}));
  const canonical = new Map();
  for (const f of canonicalFixtures) {
    const id = String(f?.canonicalId || "").trim();
    if (!id || canonical.has(id)) throw new Error("non_unique_merge_canonical_identity");
    canonical.set(id, f);
  }
  const certified = row => classify([row], canonicalFixtures).publishable.length === 1;
  const id = row => String(row?.canonicalId || "").trim();
  const hasModel = row => row?.aiAssessment?.markets &&
    typeof row.aiAssessment.markets === "object" && Object.keys(row.aiAssessment.markets).length > 0;
  const grouped = new Map();
  for (let i=0; i<candidates.length; i++) {
    const key = id(candidates[i]);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(i);
  }
  const previousCertified = new Map();
  for (const row of existingRows) {
    const key = id(row);
    if (!key || !canonical.has(key) || !hasModel(row) || !certified(row)) continue;
    if (previousCertified.has(key)) throw new Error(`duplicate_previous_certified_identity:${key}`);
    previousCertified.set(key, row);
  }
  let carriedRows = 0, restoredModels = 0, retainedCertifiedPriorRows = 0;
  for (const [key, prior] of previousCertified) {
    const matches = grouped.get(key) || [];
    if (matches.length > 1) throw new Error(`ambiguous_candidate_identity:${key}`);
    if (!matches.length) {
      candidates.push({...prior});
      carriedRows++;
      continue;
    }
    const index = matches[0], current = candidates[index];
    if (hasModel(current)) {
      if (!certified(current)) throw new Error(`uncertified_candidate_assessment:${key}`);
      continue;
    }
    const identityDrift = ["dayKey", "leagueSlug", "home", "away", "kickoffUtc"].some(
      field => String(current[field] ?? "") !== String(prior[field] ?? "")
    );
    const providerDrift =
      JSON.stringify(current.providerIds || {}) !== JSON.stringify(prior.providerIds || {});
    if (identityDrift || providerDrift) {
      // The current unverified row must not donate bookmaker markets or team
      // identity to a previously certified model. Keep the entire prior row
      // intact in the derived snapshot; original current odds memory is untouched.
      candidates[index] = {...prior};
      retainedCertifiedPriorRows++;
      continue;
    }
    const proposed = {...current, aiAssessment: prior.aiAssessment};
    if (!certified(proposed)) {
      candidates[index] = {...prior};
      retainedCertifiedPriorRows++;
      continue;
    }
    candidates[index] = proposed;
    restoredModels++;
  }
  return {matches: candidates, carriedRows, restoredModels, retainedCertifiedPriorRows};
}
