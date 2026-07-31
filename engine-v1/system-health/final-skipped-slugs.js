export function reconcileSkippedSlugSample(sample, admission) {
  const source = sample && typeof sample === "object"
    ? sample
    : {};

  const admitted = new Set(
    [
      ...(Array.isArray(admission?.admittedSlugs)
        ? admission.admittedSlugs
        : []),
      ...(Array.isArray(admission?.decisions)
        ? admission.decisions
            .filter(row => row?.classification === "admitted")
            .map(row => row?.slug)
        : [])
    ]
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );

  return Object.fromEntries(
    Object.entries(source)
      .filter(([slug]) => !admitted.has(String(slug || "").trim().toLowerCase()))
      .sort(([left], [right]) => left.localeCompare(right))
  );
}
