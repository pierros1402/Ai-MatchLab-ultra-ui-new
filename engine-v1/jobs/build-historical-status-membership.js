const idOf = row => String(row?.canonicalId || row?.matchId || "");
const final = row => ["FT", "FINAL", "STATUS_FINAL"].includes(
  String(row?.status || "").toUpperCase()
);

const sameScore = (a, b) =>
  a?.scoreHome === b?.scoreHome &&
  a?.scoreAway === b?.scoreAway;

export function buildHistoricalStatusMembership({
  published,
  canonical,
  plan,
  results = new Map()
}) {
  if (!Array.isArray(published) ||
      !Array.isArray(canonical) ||
      !plan ||
      !Array.isArray(plan.fixtureIds) ||
      !Array.isArray(plan.upgrades) ||
      !Array.isArray(plan.retainedReschedules)) {
    throw Error("historical_membership_invalid_input");
  }

  const originalIds = published.map(idOf);
  if (originalIds.some(id => !id) ||
      new Set(originalIds).size !== originalIds.length ||
      JSON.stringify(originalIds) !== JSON.stringify(plan.fixtureIds)) {
    throw Error("historical_membership_published_binding_invalid");
  }

  const current = new Map();
  for (const row of canonical) {
    const id = idOf(row);
    if (!id || current.has(id)) {
      throw Error("historical_membership_canonical_duplicate");
    }
    current.set(id, row);
  }

  const carry = new Set(plan.retainedReschedules.map(x => x.originalId));
  const upgrades = new Set(plan.upgrades);

  if (carry.size !== plan.retainedReschedules.length) {
    const unique = new Set(plan.retainedReschedules.map(x => x.originalId));
    if (unique.size !== carry.size) {
      throw Error("historical_membership_invalid_carry");
    }
  }

  const output = [];
  const carried = [];
  const upgraded = [];

  for (const previous of published) {
    const id = idOf(previous);
    const next = current.get(id);

    if (carry.has(id)) {
      if (next || upgrades.has(id) || final(previous)) {
        throw Error("historical_membership_carry_conflict:" + id);
      }

      const matches = plan.retainedReschedules.filter(x =>
        x.originalId === id &&
        x.originalDay === previous.dayKey &&
        String(x.providerId) === String(previous.sourceId) &&
        x.candidateId &&
        x.candidateDay > x.originalDay
      );

      if (!matches.length) {
        throw Error("historical_membership_carry_unbound:" + id);
      }

      output.push(structuredClone(previous));
      carried.push(id);
      continue;
    }

    if (!next) {
      throw Error("historical_membership_missing_current:" + id);
    }

    if (previous.homeTeam !== next.homeTeam ||
        previous.awayTeam !== next.awayTeam ||
        previous.leagueSlug !== next.leagueSlug) {
      throw Error("historical_membership_identity_conflict:" + id);
    }

    if (upgrades.has(id)) {
      const truth = results.get(id);
      if (!final(next) ||
          truth?.verifiedFinalTruth !== true ||
          truth.matchId !== id ||
          !sameScore(next, truth)) {
        throw Error("historical_membership_final_unverified:" + id);
      }
      output.push(structuredClone(next));
      upgraded.push(id);
      continue;
    }

    if (final(previous) &&
        (!final(next) || !sameScore(previous, next))) {
      throw Error("historical_membership_terminal_rewrite:" + id);
    }

    output.push(structuredClone(previous));
  }

  if (JSON.stringify(output.map(idOf)) !== JSON.stringify(originalIds)) {
    throw Error("historical_membership_changed");
  }

  return {
    fixtures: output,
    fixtureIds: originalIds,
    carried,
    upgraded,
    changed: upgraded.length > 0,
    publicationAuthorized: false
  };
}