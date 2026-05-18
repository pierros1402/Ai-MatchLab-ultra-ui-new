function normalizeScore(score) {
  if (!score || typeof score !== "object") return null;

  const home = Number(score.home);
  const away = Number(score.away);

  if (!Number.isInteger(home) || !Number.isInteger(away)) return null;
  if (home < 0 || away < 0) return null;

  return { home, away };
}

function scoreKey(score) {
  const normalized = normalizeScore(score);
  if (!normalized) return null;
  return `${normalized.home}-${normalized.away}`;
}

function normalizeSourceKey(row) {
  const direct =
    row?.sourceKey ||
    row?.sourceId ||
    row?.source ||
    row?.url ||
    row?.provider ||
    row?.sourceName ||
    "";

  return String(direct || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function isOfficialValidatedEvidence(row) {
  return row?.verdict === "validated_evidence" &&
    row?.sourceTier === "official" &&
    scoreKey(row.score);
}

function isReliableValidatedEvidence(row, reliableTiers) {
  return row?.verdict === "validated_evidence" &&
    reliableTiers.has(String(row?.sourceTier || "")) &&
    scoreKey(row.score);
}

function uniqueIndependentSources(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = normalizeSourceKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function summarizeEvidence(rows) {
  return rows.map(row => ({
    verdict: row?.verdict || "unknown",
    confidence: Number.isFinite(Number(row?.confidence)) ? Number(row.confidence) : null,
    sourceTier: row?.sourceTier || "unknown",
    sourceKey: normalizeSourceKey(row),
    score: normalizeScore(row?.score),
    reasons: Array.isArray(row?.reasons) ? row.reasons : [],
    rejects: Array.isArray(row?.rejects) ? row.rejects : []
  }));
}

export function verifyFinalResultEvidence(watchRow, evidenceRows, options = {}) {
  const rows = Array.isArray(evidenceRows) ? evidenceRows : [];
  const reliableTiers = new Set(options.reliableTiers || ["official", "trusted", "provider"]);
  const consensusMinSources = Number.isInteger(options.consensusMinSources)
    ? options.consensusMinSources
    : 2;

  const validated = rows.filter(row => row?.verdict === "validated_evidence" && scoreKey(row.score));
  const reviewOrWeak = rows.filter(row => row?.verdict === "review_evidence" || row?.verdict === "weak_evidence");
  const rejected = rows.filter(row => row?.verdict === "rejected_evidence");

  if (!validated.length) {
    return {
      ok: false,
      verdict: "needs_more_evidence",
      verifiedFinalResult: null,
      reason: "no_validated_evidence",
      watchRow: watchRow || null,
      counts: {
        evidenceRows: rows.length,
        validatedEvidence: validated.length,
        reviewOrWeakEvidence: reviewOrWeak.length,
        rejectedEvidence: rejected.length
      },
      evidence: summarizeEvidence(rows)
    };
  }

  const scoreGroups = new Map();
  for (const row of validated) {
    const key = scoreKey(row.score);
    if (!scoreGroups.has(key)) scoreGroups.set(key, []);
    scoreGroups.get(key).push(row);
  }

  if (scoreGroups.size > 1) {
    return {
      ok: false,
      verdict: "conflict",
      verifiedFinalResult: null,
      reason: "validated_evidence_score_conflict",
      watchRow: watchRow || null,
      conflicts: Array.from(scoreGroups.entries()).map(([key, group]) => ({
        scoreKey: key,
        count: group.length,
        sources: uniqueIndependentSources(group).map(normalizeSourceKey)
      })),
      counts: {
        evidenceRows: rows.length,
        validatedEvidence: validated.length,
        reviewOrWeakEvidence: reviewOrWeak.length,
        rejectedEvidence: rejected.length
      },
      evidence: summarizeEvidence(rows)
    };
  }

  const [onlyScoreKey, sameScoreRows] = Array.from(scoreGroups.entries())[0];
  const officialRows = sameScoreRows.filter(isOfficialValidatedEvidence);

  if (officialRows.length >= 1) {
    const bestOfficial = officialRows
      .slice()
      .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0];

    return {
      ok: true,
      verdict: "verified_final_result",
      verifiedFinalResult: {
        score: normalizeScore(bestOfficial.score),
        scoreKey: onlyScoreKey,
        verificationMode: "official_source",
        confidence: 1,
        sourceTier: "official",
        sourceKey: normalizeSourceKey(bestOfficial),
        evidenceCount: sameScoreRows.length,
        independentSourceCount: uniqueIndependentSources(sameScoreRows).length
      },
      watchRow: watchRow || null,
      counts: {
        evidenceRows: rows.length,
        validatedEvidence: validated.length,
        reviewOrWeakEvidence: reviewOrWeak.length,
        rejectedEvidence: rejected.length
      },
      evidence: summarizeEvidence(rows)
    };
  }

  const reliableRows = sameScoreRows.filter(row => isReliableValidatedEvidence(row, reliableTiers));
  const independentReliableRows = uniqueIndependentSources(reliableRows);

  if (independentReliableRows.length >= consensusMinSources) {
    const averageConfidence = independentReliableRows.reduce((sum, row) => {
      return sum + Number(row.confidence || 0);
    }, 0) / independentReliableRows.length;

    return {
      ok: true,
      verdict: "verified_final_result",
      verifiedFinalResult: {
        score: normalizeScore(independentReliableRows[0].score),
        scoreKey: onlyScoreKey,
        verificationMode: "independent_consensus",
        confidence: Number(Math.min(0.99, averageConfidence).toFixed(3)),
        sourceTier: "consensus",
        sourceKey: independentReliableRows.map(normalizeSourceKey).join("|"),
        evidenceCount: sameScoreRows.length,
        independentSourceCount: independentReliableRows.length
      },
      watchRow: watchRow || null,
      counts: {
        evidenceRows: rows.length,
        validatedEvidence: validated.length,
        reviewOrWeakEvidence: reviewOrWeak.length,
        rejectedEvidence: rejected.length
      },
      evidence: summarizeEvidence(rows)
    };
  }

  return {
    ok: false,
    verdict: "needs_more_evidence",
    verifiedFinalResult: null,
    reason: "insufficient_official_or_consensus_evidence",
    watchRow: watchRow || null,
    counts: {
      evidenceRows: rows.length,
      validatedEvidence: validated.length,
      reviewOrWeakEvidence: reviewOrWeak.length,
      rejectedEvidence: rejected.length,
      independentReliableEvidence: independentReliableRows.length,
      consensusMinSources
    },
    evidence: summarizeEvidence(rows)
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runSelfTest() {
  const watchRow = {
    fixtureId: "fixture-1",
    date: "2026-05-18",
    homeTeam: "Home FC",
    awayTeam: "Away FC"
  };

  const official = verifyFinalResultEvidence(watchRow, [
    {
      verdict: "validated_evidence",
      sourceTier: "official",
      sourceKey: "home-fc-official",
      confidence: 1,
      score: { home: 2, away: 1 }
    }
  ]);

  assert(official.verdict === "verified_final_result", "official evidence should verify");
  assert(official.verifiedFinalResult.scoreKey === "2-1", "official score key mismatch");
  assert(official.verifiedFinalResult.verificationMode === "official_source", "official mode mismatch");

  const consensus = verifyFinalResultEvidence(watchRow, [
    {
      verdict: "validated_evidence",
      sourceTier: "trusted",
      sourceKey: "trusted-source-a",
      confidence: 0.88,
      score: { home: 1, away: 1 }
    },
    {
      verdict: "validated_evidence",
      sourceTier: "provider",
      sourceKey: "provider-source-b",
      confidence: 0.84,
      score: { home: 1, away: 1 }
    }
  ]);

  assert(consensus.verdict === "verified_final_result", "independent consensus should verify");
  assert(consensus.verifiedFinalResult.scoreKey === "1-1", "consensus score key mismatch");
  assert(consensus.verifiedFinalResult.verificationMode === "independent_consensus", "consensus mode mismatch");

  const conflict = verifyFinalResultEvidence(watchRow, [
    {
      verdict: "validated_evidence",
      sourceTier: "trusted",
      sourceKey: "trusted-source-a",
      confidence: 0.88,
      score: { home: 2, away: 0 }
    },
    {
      verdict: "validated_evidence",
      sourceTier: "provider",
      sourceKey: "provider-source-b",
      confidence: 0.84,
      score: { home: 2, away: 1 }
    }
  ]);

  assert(conflict.verdict === "conflict", "conflicting validated evidence should conflict");
  assert(conflict.ok === false, "conflict must not verify");

  const weak = verifyFinalResultEvidence(watchRow, [
    {
      verdict: "weak_evidence",
      sourceTier: "unknown",
      sourceKey: "weak-source",
      confidence: 0.4,
      score: { home: 3, away: 2 }
    }
  ]);

  assert(weak.verdict === "needs_more_evidence", "weak evidence must not verify");
  assert(weak.ok === false, "weak evidence must not be ok");

  const rejected = verifyFinalResultEvidence(watchRow, [
    {
      verdict: "rejected_evidence",
      sourceTier: "official",
      sourceKey: "wrong-team-source",
      confidence: 0,
      score: { home: 4, away: 0 },
      rejects: ["team_mismatch"]
    }
  ]);

  assert(rejected.verdict === "needs_more_evidence", "rejected evidence must not verify");
  assert(rejected.ok === false, "rejected evidence must not be ok");

  console.log(JSON.stringify({
    ok: true,
    selfTest: "final-result-verifier",
    cases: [
      official.verdict,
      consensus.verdict,
      conflict.verdict,
      weak.verdict,
      rejected.verdict
    ]
  }, null, 2));
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
}
