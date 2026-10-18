// Explicit competition identities only. Never infer a replacement league from
// token overlap, team spelling or a missing provider path.
export function domesticCompetitionNameContradiction(country, name) {
  const c = String(country || '').toLowerCase().replace(/[ _-]+/g, ' ');
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (/\b(?:women|women's|womens|female|youth|junior|primavera|reserves?|development|u[- ]?(?:1[4-9]|2[0-3])|under[- ]?(?:1[4-9]|2[0-3]))\b/i.test(n) || /^Premier League 2(?:\b|$)/i.test(n)) return 'NON_SENIOR_MENS_COMPETITION';
  if (c === 'england' && /^(?:(?:Southern|Isthmian|Northern Premier) League|National League (?:North|South))(?:\b|$)/i.test(n)) return 'OUT_OF_COVERAGE_ENGLISH_REGIONAL_LEAGUE';
  if (c === 'italy' && /^Serie [CD](?:\b|$)/i.test(n)) return 'OUT_OF_COVERAGE_ITALIAN_LOWER_DIVISION';
  if (c === 'poland' && /^(?:II|III|IV) Liga(?:\b|$)/i.test(n)) return 'OUT_OF_COVERAGE_POLISH_LOWER_DIVISION';
  if (c === 'turkey' && /^[23]\.\s*Lig(?:\b|$)/i.test(n)) return 'OUT_OF_COVERAGE_TURKISH_LOWER_DIVISION';
  return null;
}
