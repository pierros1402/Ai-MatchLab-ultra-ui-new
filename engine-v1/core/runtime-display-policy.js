function parseExplicitBoolean(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return null;
}

/**
 * Public snapshot services must never perform network or truth-store overlays
 * inside an HTTP request. Those overlays belong in the publication pipeline.
 * Local/runtime development may opt in explicitly.
 */
export function requestTimeDisplayOverlaysEnabled({
  renderRuntime = false,
  snapshotOnly = false,
  explicitValue = null
} = {}) {
  const rawExplicit = String(explicitValue ?? "").trim();
  if (rawExplicit) {
    return parseExplicitBoolean(rawExplicit) === true;
  }
  return !renderRuntime && !snapshotOnly;
}

/**
 * The immutable display base is valid until the promoted manifest revision
 * changes. A wall-clock TTL recreates the same expensive universe even when
 * the underlying release is byte-identical.
 */
export function reusableDisplayRevision(hit, revision) {
  return Boolean(
    hit &&
    hit.value &&
    String(hit.revision || "") === String(revision || "")
  );
}

/**
 * In-flight runtime promises are always reusable. Completed overlay promises
 * are reusable only for their bounded live TTL; snapshot-only results are
 * revision-bound and therefore reusable without a time expiry.
 */
export function reusableRuntimeDisplayEntry(hit, {
  revision,
  overlaysEnabled,
  now = Date.now(),
  overlayTtlMs = 12000
} = {}) {
  if (!hit || String(hit.revision || "") !== String(revision || "")) return false;
  if (!hit.completedAt) return Boolean(hit.promise);
  if (!overlaysEnabled) return Boolean(hit.promise);
  return Boolean(hit.promise) && (now - Number(hit.completedAt)) < overlayTtlMs;
}
