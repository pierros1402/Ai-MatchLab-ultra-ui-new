const count = n => Number.isSafeInteger(n) && n >= 0;
const digest = value => /^[a-f0-9]{64}$/u.test(value ?? "");

/** Accept only producer-supplied rows for this exact date and canonical universe. */
export async function verifyReadinessEvidence(envelope, date, summary, crypto = globalThis.crypto) {
  if (envelope?.schema !== "ai-matchlab.value-readiness-evidence.v1" ||
      envelope.date !== date || !digest(envelope.sha256) || typeof envelope.json !== "string" ||
      !digest(envelope.fixtureUniverseHash) || !crypto?.subtle) return null;
  const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(envelope.json)));
  if (Array.from(hashBytes, byte => byte.toString(16).padStart(2, "0")).join("") !== envelope.sha256) return null;
  let report;
  try { report = JSON.parse(envelope.json); } catch { return null; }
  if (report?.schema !== "ai-matchlab.value-data-readiness.v1" || report.date !== date ||
      report.generatedAt !== summary?.checkedAt || report.fixtureUniverse?.hash !== envelope.fixtureUniverseHash ||
      report.fixtureUniverse?.source !== "canonical_fixtures" || !Array.isArray(report.rows) ||
      !Array.isArray(report.fixtureUniverse.canonicalIds)) return null;
  const ids = new Set(report.fixtureUniverse.canonicalIds);
  if (ids.size !== report.fixtureUniverse.canonicalIds.length || ids.size !== report.fixtureUniverse.count ||
      ids.size !== report.rows.length) return null;
  const counts = { fixtures: report.rows.length, ready: 0, insufficient: 0, applicable: 0 };
  const reasons = new Map();
  for (const row of report.rows) {
    if (!ids.delete(row?.canonicalId) || typeof row.leagueSlug !== "string" ||
        !Array.isArray(row.reasons) || !row.reasons.every(reason => typeof reason === "string") ||
        new Set(row.reasons).size !== row.reasons.length) return null;
    // A row cannot be complete and incomplete simultaneously; reject false-green evidence.
    if ((row.status === "READY" && row.reasons.length !== 0) ||
        (row.status === "INSUFFICIENT_DATA" && row.reasons.length === 0) ||
        (row.status === "NOT_APPLICABLE" && row.reasons.length !== 0)) return null;
    if (row.status === "NOT_APPLICABLE") continue;
    if (row.status !== "READY" && row.status !== "INSUFFICIENT_DATA") return null;
    counts.applicable++;
    counts[row.status === "READY" ? "ready" : "insufficient"]++;
    for (const reason of row.reasons) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  if (!Object.keys(counts).every(k => count(summary?.[k]) &&
      counts[k] === summary[k] && counts[k] === report.summary?.[k])) return null;
  for (const reported of [report.summary.byReason, summary.byReason]) {
    if (Object.keys(reported ?? {}).length !== reasons.size ||
        [...reasons].some(([reason, n]) => reported?.[reason] !== n)) return null;
  }
  return { date, sha256: envelope.sha256, rows: report.rows, counts,
    dimensions: { readiness: report.status, officialCoverage: "UNVERIFIED",
      officialSeasonCompleteness: "UNVERIFIED", standingsIntegrity: "PER_FIXTURE_OBSERVATION" } };
}
