function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === 0) return value;
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function toIntegerScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99) return null;
  return number;
}

function scoreFromObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const home = toIntegerScore(firstNonEmpty(
    value.home,
    value.homeScore,
    value.scoreHome,
    value.homeGoals,
    value.h
  ));

  const away = toIntegerScore(firstNonEmpty(
    value.away,
    value.awayScore,
    value.scoreAway,
    value.awayGoals,
    value.a
  ));

  if (home === null || away === null) return null;

  return { home, away };
}

function scorePairFromMatch(match) {
  if (!match) return null;

  const home = toIntegerScore(match[1]);
  const away = toIntegerScore(match[2]);

  if (home === null || away === null) return null;

  // Text-extracted FT scores must not be inferred from timestamps or page-build numbers.
  if (home > 20 || away > 20) return null;

  return { home, away };
}

function scoreFromText(value) {
  const text = cleanText(value);
  if (!text) return null;

  const finalContextPatterns = [
    /\bfinal\s+score\b[^\d]{0,120}(\d{1,2})\s*[-–—:]\s*(\d{1,2})\b/i,
    /\bfull[ -]?time\b[^\d]{0,120}(\d{1,2})\s*[-–—:]\s*(\d{1,2})\b/i,
    /\bft\b[^\d]{0,120}(\d{1,2})\s*[-–—:]\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*[-–—:]\s*(\d{1,2})\b.{0,180}\bfinal\s+score\b/i,
    /\b(\d{1,2})\s*[-–—:]\s*(\d{1,2})\b.{0,180}\bfull[ -]?time\b/i,
    /\b(\d{1,2})\s*[-–—:]\s*(\d{1,2})\b.{0,180}\bft\b/i
  ];

  for (const pattern of finalContextPatterns) {
    const score = scorePairFromMatch(text.match(pattern));
    if (score) return score;
  }

  const genericPatterns = [
    // Generic extraction excludes colon to avoid treating timestamps like 19:29 as scores.
    /\b(\d{1,2})\s*[-–—]\s*(\d{1,2})\b/,
    /\bhome\s+(\d{1,2})\s+away\s+(\d{1,2})\b/i,
    /\b(\d{1,2})\s+v\s+(\d{1,2})\b/i
  ];

  for (const pattern of genericPatterns) {
    const score = scorePairFromMatch(text.match(pattern));
    if (score) return score;
  }

  return null;
}

function extractScore(row) {
  return scoreFromObject(row?.score) ||
    scoreFromObject(row?.result) ||
    scoreFromObject(row?.finalScore) ||
    scoreFromObject(row?.fullTimeScore) ||
    scoreFromObject(row?.ftScore) ||
    scoreFromText(row?.scoreText) ||
    scoreFromText(row?.resultText) ||
    scoreFromText(row?.title) ||
    scoreFromText(row?.text) ||
    null;
}

function extractStatusText(row) {
  return cleanText(firstNonEmpty(
    row?.statusText,
    row?.status,
    row?.matchStatus,
    row?.state,
    row?.phase,
    row?.title,
    row?.text
  ));
}

function extractDate(row, watchRow) {
  return firstNonEmpty(
    row?.date,
    row?.day,
    row?.matchDate,
    row?.kickoffDate,
    row?.kickoffUtc,
    watchRow?.date,
    watchRow?.day,
    watchRow?.dayKey,
    watchRow?.utcDate,
    watchRow?.kickoffUtc
  );
}

function extractLeagueSlug(row, watchRow) {
  return firstNonEmpty(
    row?.leagueSlug,
    row?.competitionSlug,
    row?.league,
    watchRow?.leagueSlug,
    watchRow?.competitionSlug,
    watchRow?.league
  );
}

function extractTeam(row, watchRow, side) {
  const homeKeys = [
    row?.homeTeam,
    row?.home,
    row?.homeName,
    row?.teamHome,
    watchRow?.homeTeam,
    watchRow?.home,
    watchRow?.homeName
  ];

  const awayKeys = [
    row?.awayTeam,
    row?.away,
    row?.awayName,
    row?.teamAway,
    watchRow?.awayTeam,
    watchRow?.away,
    watchRow?.awayName
  ];

  return cleanText(firstNonEmpty(...(side === "home" ? homeKeys : awayKeys)));
}

function sourceFromReliability(row) {
  const identity = row?.reliability?.identity || row?.sourceReliability?.identity || row?.identity || null;

  return {
    sourceName: firstNonEmpty(
      row?.sourceName,
      row?.source,
      row?.sourceKey,
      identity?.sourceName,
      row?.sourceDescriptor?.sourceKey
    ),
    sourceUrl: firstNonEmpty(
      row?.sourceUrl,
      row?.url,
      identity?.sourceUrl,
      row?.sourceDescriptor?.sourceUrl
    ),
    sourceType: firstNonEmpty(
      row?.sourceType,
      row?.type,
      row?.sourceTier,
      row?.reliability?.tier,
      row?.sourceReliability?.tier,
      row?.tier,
      identity?.sourceType,
      row?.sourceDescriptor?.sourceType
    )
  };
}

export function extractFinalResultEvidenceRow(input, options = {}) {
  const row = input?.row || input?.preparedRow || input || {};
  const watchRow = input?.watchRow || options.watchRow || row?.watchRow || {};

  const source = sourceFromReliability(row);
  const score = extractScore(row);
  const statusText = extractStatusText(row);

  const evidence = {
    sourceName: source.sourceName || null,
    sourceUrl: source.sourceUrl || null,
    sourceType: source.sourceType || null,
    homeTeam: extractTeam(row, watchRow, "home") || null,
    awayTeam: extractTeam(row, watchRow, "away") || null,
    date: extractDate(row, watchRow) || null,
    leagueSlug: extractLeagueSlug(row, watchRow) || null,
    statusText: statusText || null,
    score,
    raw: options.includeRaw === true ? row : undefined
  };

  if (evidence.raw === undefined) {
    delete evidence.raw;
  }

  const missing = [];
  if (!evidence.sourceName && !evidence.sourceUrl && !evidence.sourceType) missing.push("source_identity");
  if (!evidence.homeTeam) missing.push("home_team");
  if (!evidence.awayTeam) missing.push("away_team");
  if (!evidence.date) missing.push("date");
  if (!evidence.score) missing.push("score");

  return {
    ok: missing.length === 0,
    verdict: missing.length === 0 ? "raw_evidence_ready" : "raw_evidence_incomplete",
    missing,
    canonicalWrites: 0,
    evidence
  };
}

export function extractFinalResultEvidenceRows(input, options = {}) {
  const watchRow = input?.watchRow || options.watchRow || null;
  const rows = Array.isArray(input)
    ? input
    : Array.isArray(input?.rows)
      ? input.rows
      : Array.isArray(input?.preparedRows)
        ? input.preparedRows
        : Array.isArray(input?.sources)
          ? input.sources
          : [];

  const results = rows.map((row, index) => ({
    index,
    ...extractFinalResultEvidenceRow({ row, watchRow }, options)
  }));

  const byVerdict = {};
  for (const result of results) {
    byVerdict[result.verdict] = (byVerdict[result.verdict] || 0) + 1;
  }

  return {
    ok: true,
    mode: "read_only_result_evidence_extraction",
    canonicalWrites: 0,
    inputRows: rows.length,
    readyRows: results.filter(row => row.ok === true).length,
    incompleteRows: results.filter(row => row.ok !== true).length,
    byVerdict,
    rawEvidenceRows: results.filter(row => row.ok === true).map(row => row.evidence),
    results,
    guarantees: {
      noFetch: true,
      noVerification: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0
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
    day: "2026-05-18",
    leagueSlug: "test.1",
    homeTeam: "Home FC",
    awayTeam: "Away FC"
  };

  const report = extractFinalResultEvidenceRows({
    watchRow,
    preparedRows: [
      {
        sourceName: "Home Official",
        sourceType: "official",
        statusText: "Full Time",
        scoreText: "2-1"
      },
      {
        sourceUrl: "https://www.espn.com/soccer/match/_/gameId/123",
        sourceType: "provider",
        result: { home: 2, away: 1 },
        status: "FT"
      },
      {
        sourceName: "Incomplete Source",
        statusText: "Full Time"
      }
    ]
  });

  assert(report.canonicalWrites === 0, "extractor must not write canonical data");
  assert(report.inputRows === 3, "input row count mismatch");
  assert(report.readyRows === 2, "expected 2 ready rows");
  assert(report.incompleteRows === 1, "expected 1 incomplete row");
  assert(report.rawEvidenceRows.length === 2, "raw evidence row count mismatch");
  assert(report.rawEvidenceRows[0].score.home === 2, "home score mismatch");
  assert(report.rawEvidenceRows[0].score.away === 1, "away score mismatch");
  assert(report.rawEvidenceRows[0].homeTeam === "Home FC", "home team fallback mismatch");
  assert(report.rawEvidenceRows[0].awayTeam === "Away FC", "away team fallback mismatch");
  assert(report.guarantees.noFetch === true, "extractor must not fetch");
  assert(report.guarantees.noVerification === true, "extractor must not verify");

  console.log(JSON.stringify({
    ok: true,
    selfTest: "result-evidence-extractor",
    canonicalWrites: report.canonicalWrites,
    inputRows: report.inputRows,
    readyRows: report.readyRows,
    incompleteRows: report.incompleteRows,
    byVerdict: report.byVerdict,
    guarantees: report.guarantees
  }, null, 2));
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
}
