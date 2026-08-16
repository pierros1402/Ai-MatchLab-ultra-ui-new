export function intradayPublicationFixtureId(row) {
  return String(
    row?.canonicalId ||
    row?.matchId ||
    ""
  ).trim();
}

function collectFixtureIds(rows = []) {
  const ids = [];
  const missingIndexes = [];
  const seen = new Set();
  const duplicateIds = new Set();

  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    const id = intradayPublicationFixtureId(row);

    if (!id) {
      missingIndexes.push(index);
      continue;
    }

    if (seen.has(id)) {
      duplicateIds.add(id);
      continue;
    }

    seen.add(id);
    ids.push(id);
  }

  return {
    ids,
    idSet: seen,
    missingIndexes,
    duplicateIds: [...duplicateIds].sort()
  };
}

export function resolveIntradayPublishedUniverse({
  publishedFixtures = [],
  currentFixtures = [],
  publishedDetailIds = []
} = {}) {
  const published = collectFixtureIds(publishedFixtures);
  const current = collectFixtureIds(currentFixtures);
  const detailIds = new Set(
    (Array.isArray(publishedDetailIds) ? publishedDetailIds : [])
      .map(value => String(value || "").trim())
      .filter(Boolean)
  );

  const missingCurrentFixtureIds = published.ids
    .filter(id => !current.idSet.has(id))
    .sort();

  const missingPublishedDetailIds = published.ids
    .filter(id => !detailIds.has(id))
    .sort();

  const deferredFixtureIds = current.ids
    .filter(id => !published.idSet.has(id))
    .sort();

  let reason = null;

  if (published.ids.length === 0 && current.ids.length > 0) {
    reason = "published_fixture_universe_missing";
  } else if (published.missingIndexes.length > 0) {
    reason = "published_fixture_id_missing";
  } else if (current.missingIndexes.length > 0) {
    reason = "current_fixture_id_missing";
  } else if (published.duplicateIds.length > 0) {
    reason = "published_fixture_id_duplicate";
  } else if (current.duplicateIds.length > 0) {
    reason = "current_fixture_id_duplicate";
  } else if (missingCurrentFixtureIds.length > 0) {
    reason = "published_fixture_missing_from_current_universe";
  } else if (missingPublishedDetailIds.length > 0) {
    reason = "published_fixture_detail_missing";
  }

  return {
    ok: reason === null,
    reason,
    publishedFixtureCount: published.ids.length,
    currentFixtureCount: current.ids.length,
    allowedFixtureIds: published.ids,
    deferredFixtureIds,
    missingCurrentFixtureIds,
    missingPublishedDetailIds,
    publishedMissingIdIndexes: published.missingIndexes,
    currentMissingIdIndexes: current.missingIndexes,
    publishedDuplicateIds: published.duplicateIds,
    currentDuplicateIds: current.duplicateIds
  };
}
