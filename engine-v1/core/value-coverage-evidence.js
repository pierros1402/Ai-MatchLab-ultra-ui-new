function objectOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

export function normalizeValueCoverageEvidence(report, dayKey, sourcePath = null) {
  const date = String(dayKey || "");
  const input = objectOrNull(report);

  if (!input) {
    return {
      present: false,
      dayKey: date,
      sourcePath,
      generatedAt: null,
      source: null,
      counts: null,
      breakdown: null,
      rows: []
    };
  }

  return {
    present: true,
    dayKey: String(input.dayKey || date),
    sourcePath,
    generatedAt: input.generatedAt || null,
    source: objectOrNull(input.source),
    counts: objectOrNull(input.counts),
    breakdown: objectOrNull(input.breakdown),
    rows: Array.isArray(input.rows) ? input.rows : []
  };
}

export function summarizeValueCoverageEvidence(evidence) {
  const e = objectOrNull(evidence) || {};
  const source = objectOrNull(e.source) || {};
  const counts = objectOrNull(e.counts) || {};

  return {
    present: e.present === true,
    inputSource: source.inputSource || null,
    canonicalMatches: Number(source.canonicalMatches || 0),
    sourceMatches: Number(source.sourceMatches || 0),
    playable: Number(source.playable || 0),
    totalRows: Number(counts.totalRows || 0),
    detailsFound: Number(counts.detailsFound || 0),
    intelligenceOk: Number(counts.intelligenceOk || 0),
    valueReturned: Number(counts.valueReturned || 0),
    valueNull: Number(counts.valueNull || 0),
    valueFailed: Number(counts.valueFailed || 0),
    minimumRecentSampleNull: Number(counts.minimumRecentSampleNull || 0)
  };
}
