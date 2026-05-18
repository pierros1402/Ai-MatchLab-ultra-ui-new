import { validateFinalResultEvidence } from "./result-evidence-validator.js";

function normalizeRawEvidenceRows(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.rawEvidenceRows)) return input.rawEvidenceRows;
  if (Array.isArray(input.evidenceRows)) return input.evidenceRows;
  if (Array.isArray(input.candidates)) return input.candidates;
  return [];
}

function normalizeEvidenceForValidator(rawEvidence) {
  const out = {
    ...(rawEvidence || {})
  };

  if (out.sourceType == null && out.type == null && out.sourceTier != null) {
    out.sourceType = out.sourceTier;
  }

  if (out.sourceName == null && out.source == null && out.sourceKey != null) {
    out.sourceName = out.sourceKey;
  }

  if (out.sourceUrl == null && out.url == null && out.sourceLink != null) {
    out.sourceUrl = out.sourceLink;
  }

  return out;
}

function summarizeByVerdict(rows) {
  const out = {};
  for (const row of rows) {
    const key = row?.verdict || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function extractScoreKey(row) {
  const home = Number(row?.score?.home);
  const away = Number(row?.score?.away);

  if (!Number.isInteger(home) || !Number.isInteger(away)) return null;
  if (home < 0 || away < 0) return null;

  return `${home}-${away}`;
}

function summarizeScoreGroups(rows) {
  const groups = {};

  for (const row of rows) {
    const key = extractScoreKey(row);
    if (!key) continue;

    if (!groups[key]) {
      groups[key] = {
        scoreKey: key,
        count: 0,
        verdicts: {},
        sourceTiers: {}
      };
    }

    groups[key].count += 1;
    groups[key].verdicts[row.verdict || "unknown"] = (groups[key].verdicts[row.verdict || "unknown"] || 0) + 1;
    groups[key].sourceTiers[row.sourceTier || "unknown"] = (groups[key].sourceTiers[row.sourceTier || "unknown"] || 0) + 1;
  }

  return Object.values(groups);
}

export function buildFinalResultEvidencePackage(watchRow, rawEvidenceInput, options = {}) {
  const rawEvidenceRows = normalizeRawEvidenceRows(rawEvidenceInput);

  const evidenceRows = rawEvidenceRows.map((rawEvidence, index) => {
    const normalizedEvidence = normalizeEvidenceForValidator(rawEvidence);
    const validated = validateFinalResultEvidence(watchRow, normalizedEvidence, options);
    return {
      index,
      ...validated,
      rawEvidence,
      normalizedEvidence
    };
  });

  const byVerdict = summarizeByVerdict(evidenceRows);
  const scoreGroups = summarizeScoreGroups(evidenceRows);

  return {
    ok: true,
    mode: "read_only_evidence_build",
    canonicalWrites: 0,
    watchRow: watchRow || null,
    rawEvidenceCount: rawEvidenceRows.length,
    evidenceRows,
    summary: {
      byVerdict,
      scoreGroups,
      hasValidatedEvidence: (byVerdict.validated_evidence || 0) > 0,
      hasConflictCandidate: scoreGroups.filter(group => {
        return (group.verdicts.validated_evidence || 0) > 0;
      }).length > 1
    }
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
    leagueSlug: "test.1",
    homeTeam: "Home FC",
    awayTeam: "Away FC"
  };

  const report = buildFinalResultEvidencePackage(watchRow, [
    {
      sourceType: "official",
      sourceKey: "home-official",
      homeTeam: "Home FC",
      awayTeam: "Away FC",
      date: "2026-05-18",
      leagueSlug: "test.1",
      statusText: "Full Time",
      score: { home: 2, away: 1 }
    },
    {
      sourceType: "unknown",
      sourceKey: "weak-source",
      homeTeam: "Home FC",
      awayTeam: "Away FC",
      date: "2026-05-18",
      leagueSlug: "test.1",
      statusText: "scheduled",
      score: { home: 2, away: 1 }
    },
    {
      sourceType: "official",
      sourceKey: "wrong-team",
      homeTeam: "Other FC",
      awayTeam: "Away FC",
      date: "2026-05-18",
      leagueSlug: "test.1",
      statusText: "Full Time",
      score: { home: 4, away: 0 }
    }
  ]);

  assert(report.ok === true, "report should be ok");
  assert(report.canonicalWrites === 0, "builder must not write canonical data");
  assert(report.rawEvidenceCount === 3, "raw evidence count mismatch");
  assert(report.summary.byVerdict.validated_evidence === 1, "expected 1 validated evidence row");
  assert(report.summary.byVerdict.review_evidence === 1, "expected 1 review evidence row");
  assert(report.summary.byVerdict.rejected_evidence === 1, "expected 1 rejected evidence row");
  assert(report.summary.hasValidatedEvidence === true, "expected validated evidence flag");

  console.log(JSON.stringify({
    ok: true,
    selfTest: "result-evidence-builder",
    canonicalWrites: report.canonicalWrites,
    rawEvidenceCount: report.rawEvidenceCount,
    byVerdict: report.summary.byVerdict
  }, null, 2));
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
}
