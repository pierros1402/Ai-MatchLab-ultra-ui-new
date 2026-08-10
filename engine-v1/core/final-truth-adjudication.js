import crypto from "node:crypto";

export const FINAL_TRUTH_ADJUDICATION_SCHEMA =
  "ai-matchlab.final-truth-adjudication.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function strictScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function normalizedEvidenceKey(row) {
  return [
    clean(row?.authority).toLowerCase(),
    clean(row?.providerMatchId).toLowerCase(),
    clean(row?.reference).toLowerCase(),
  ].join("|");
}

export function deterministicAdjudicationId(entry = {}) {
  const evidence = Array.isArray(entry?.evidence)
    ? entry.evidence
        .map(row => normalizedEvidenceKey(row))
        .filter(Boolean)
        .sort()
    : [];
  const key = JSON.stringify({
    dayKey: clean(entry?.dayKey),
    matchId: clean(entry?.matchId),
    homeTeam: clean(entry?.homeTeam),
    awayTeam: clean(entry?.awayTeam),
    homeScore: strictScore(entry?.homeScore),
    awayScore: strictScore(entry?.awayScore),
    evidence,
  });
  return `adj_${crypto.createHash("sha256").update(key, "utf8").digest("hex").slice(0, 24)}`;
}

export function validateFinalTruthAdjudication(entry = {}) {
  const errors = [];
  const dayKey = clean(entry?.dayKey);
  const matchId = clean(entry?.matchId);
  const homeTeam = clean(entry?.homeTeam);
  const awayTeam = clean(entry?.awayTeam);
  const homeScore = strictScore(entry?.homeScore);
  const awayScore = strictScore(entry?.awayScore);
  const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];

  if (entry?.schema !== FINAL_TRUTH_ADJUDICATION_SCHEMA) errors.push("INVALID_SCHEMA");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) errors.push("INVALID_DAY_KEY");
  if (!matchId) errors.push("MISSING_MATCH_ID");
  if (!homeTeam || !awayTeam) errors.push("MISSING_TEAM_PAIR");
  if (homeScore === null || awayScore === null) errors.push("INVALID_SCORE");
  if (clean(entry?.state) !== "APPROVED_FOR_RECOVERY") errors.push("NOT_APPROVED_FOR_RECOVERY");

  const usableEvidence = evidence.filter(row => {
    const authority = clean(row?.authority);
    const reference = clean(row?.reference || row?.providerMatchId || row?.note);
    return Boolean(authority && reference);
  });
  const uniqueEvidence = new Set(usableEvidence.map(normalizedEvidenceKey));
  if (usableEvidence.length < 2 || uniqueEvidence.size < 2) {
    errors.push("INSUFFICIENT_INDEPENDENT_EVIDENCE");
  }

  const expectedId = deterministicAdjudicationId({
    ...entry,
    dayKey,
    matchId,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    evidence: usableEvidence,
  });
  const adjudicationId = clean(entry?.adjudicationId);
  if (!adjudicationId) errors.push("MISSING_ADJUDICATION_ID");
  else if (adjudicationId !== expectedId) errors.push("ADJUDICATION_ID_MISMATCH");

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      ...entry,
      dayKey,
      matchId,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      evidence: usableEvidence,
      adjudicationId: expectedId,
    },
  };
}

export function adjudicationContract(entry, appliedAt = new Date().toISOString()) {
  const checked = validateFinalTruthAdjudication(entry);
  if (!checked.ok) {
    const error = new Error(`invalid_final_truth_adjudication:${checked.errors.join(",")}`);
    error.validation = checked;
    throw error;
  }
  const row = checked.normalized;
  return {
    schema: FINAL_TRUTH_ADJUDICATION_SCHEMA,
    adjudicationId: row.adjudicationId,
    state: "APPLIED",
    appliedAt,
    dayKey: row.dayKey,
    matchId: row.matchId,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    correctedScore: {
      home: row.homeScore,
      away: row.awayScore,
      scoreKey: `${row.homeScore}-${row.awayScore}`,
    },
    reason: clean(row?.reason) || "manual_versioned_truth_adjudication",
    evidencePolicy: clean(row?.evidencePolicy) || "two_source_manual_adjudication",
    evidenceRecoveredFromPriorRepairSession:
      row?.evidenceRecoveredFromPriorRepairSession === true,
    evidence: row.evidence,
    silentOverwriteForbidden: true,
    oddsUsed: false,
  };
}
