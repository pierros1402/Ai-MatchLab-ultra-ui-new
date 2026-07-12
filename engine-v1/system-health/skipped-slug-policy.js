const KNOWN_CONTEXT_SKIPPED_SLUGS = new Set([
  "arg.3",
  "arg.copa",
  "can.w.nsl",
  "chi.copa_chi",
  "usa.nwsl",
  "usa.usl.1",
  "usa.usl.l1",
  "usa.usl.l1.cup"
]);

export function parseAcquisitionSkippedSlugs(raw) {
  return String(raw || "")
    .replace(/^acquisition_skipped_slugs:/, "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

export function isKnownContextSkippedSlug(slug) {
  const normalized = String(slug || "").trim().toLowerCase();

  if (!normalized) return false;
  if (normalized.startsWith("fs.")) return true;
  if (normalized.startsWith("club.")) return true;
  if (normalized.includes("friendly")) return true;
  if (normalized.includes("u19") || normalized.includes("u20") || normalized.includes("reserve")) {
    return true;
  }

  return KNOWN_CONTEXT_SKIPPED_SLUGS.has(normalized);
}

export function filterActionableSkippedSlugs(slugs) {
  return (Array.isArray(slugs) ? slugs : [])
    .map((slug) => String(slug || "").trim())
    .filter(Boolean)
    .filter((slug) => !isKnownContextSkippedSlug(slug));
}

export function skippedSlugsContextOnly(slugs) {
  const normalized = (Array.isArray(slugs) ? slugs : [])
    .map((slug) => String(slug || "").trim())
    .filter(Boolean);

  return normalized.length > 0 && filterActionableSkippedSlugs(normalized).length === 0;
}

export function buildAcquisitionSkippedSlugsWarning(slugs) {
  const actionable = filterActionableSkippedSlugs(slugs);
  if (actionable.length === 0) return null;
  return `acquisition_skipped_slugs:${actionable.join(",")}`;
}
