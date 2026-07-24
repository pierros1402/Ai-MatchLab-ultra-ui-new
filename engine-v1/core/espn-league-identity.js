const ESPN_PROVIDER_TO_CANONICAL_SLUG = Object.freeze({
  "sco.cis": "sco.tennents",
  "uefa.champions_qual": "uefa.champions",
  "uefa.europa_qual": "uefa.europa",
  "uefa.europa.conf_qual": "uefa.europa.conf"
});

function normalizeSlug(value) {
  return String(value || "").trim();
}

function isEspnSource(row) {
  const source = normalizeSlug(
    row?.source ||
    row?.provider ||
    row?.adapterId
  ).toLowerCase();

  return source === "espn" || source.startsWith("espn_");
}

export function canonicalEspnLeagueSlug(providerSlug) {
  const safeProviderSlug = normalizeSlug(providerSlug);
  return ESPN_PROVIDER_TO_CANONICAL_SLUG[safeProviderSlug] || safeProviderSlug;
}

export function espnProviderFetchSlugs(canonicalSlug, fixtures = []) {
  const safeCanonicalSlug = normalizeSlug(canonicalSlug);
  if (!safeCanonicalSlug) return [];

  const out = new Set([safeCanonicalSlug]);
  const espnRows = (Array.isArray(fixtures) ? fixtures : [])
    .filter(isEspnSource);

  for (const row of espnRows) {
    const explicitProviderSlug = normalizeSlug(row?.providerLeagueSlug);
    if (explicitProviderSlug) out.add(explicitProviderSlug);
  }

  if (espnRows.some(row => !normalizeSlug(row?.providerLeagueSlug))) {
    for (const [providerSlug, mappedCanonicalSlug] of Object.entries(
      ESPN_PROVIDER_TO_CANONICAL_SLUG
    )) {
      if (mappedCanonicalSlug === safeCanonicalSlug) {
        out.add(providerSlug);
      }
    }
  }

  return [...out];
}
