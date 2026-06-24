import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing --input");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { input: "", output: "", date: "", selfTest: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = asText(argv[i]);

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      args.input = asText(argv[++i]);
      continue;
    }

    if (arg === "--output") {
      args.output = asText(argv[++i]);
      continue;
    }

    if (arg === "--date") {
      args.date = asText(argv[++i]);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function isHttp200(row) {
  return Number(row?.httpStatus ?? row?.status) === 200 || String(row?.status) === "200";
}

function normalizeText(value) {
  return asText(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textForExtraction(row) {
  return normalizeText([
    row?.title,
    row?.candidateUrl,
    row?.finalUrl,
    row?.plainText
  ].map(asText).join(" "));
}

function lower(value) {
  return asText(value).toLowerCase();
}

const DATE_PATTERNS = [
  /\b20[2-3][0-9][-/\.](0?[1-9]|1[0-2])[-/\.](0?[1-9]|[12][0-9]|3[01])\b/g,
  /\b(0?[1-9]|[12][0-9]|3[01])[-/\.](0?[1-9]|1[0-2])[-/\.](20[2-3][0-9])\b/g,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+[0-3]?[0-9],?\s+20[2-3][0-9]\b/gi,
  /\b[0-3]?[0-9]\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+20[2-3][0-9]\b/gi,
  /\b[0-3]?[0-9]\.[0-1]?[0-9]\.20[2-3][0-9]\b/g
];

function extractDateSignals(text) {
  const signals = [];

  for (const pattern of DATE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      signals.push({
        value: match[0],
        index: match.index || 0
      });
    }
  }

  const seen = new Set();
  return signals
    .sort((a, b) => a.index - b.index)
    .filter((item) => {
      const key = item.value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
}

function termListForLeague(leagueSlug) {
  const common = [
    "fixture", "fixtures", "match", "matches", "schedule", "result", "results",
    "round", "venue", "kick off", "kickoff", "vs", " v "
  ];

  const leagueTerms = {
    "fin.1": ["ottelut", "tulokset", "veikkausliiga", "liiga", "kierros"],
    "fin.2": ["ottelut", "tulokset", "ykkösliiga", "ykkosliiga", "kierros"],
    "irl.1": ["league of ireland", "premier division", "fixtures", "results"],
    "irl.2": ["league of ireland", "first division", "fixtures", "results"],
    "isl.1": ["leikir", "úrslit", "ksi", "besta deild"],
    "per.1": ["liga 1", "partidos", "resultados", "fixture"]
  };

  return [...common, ...(leagueTerms[leagueSlug] || [])];
}

function matchedTerms(text, leagueSlug) {
  const lc = lower(text);
  return termListForLeague(leagueSlug)
    .filter((term) => lc.includes(term.toLowerCase()))
    .slice(0, 30);
}

function snippetAround(text, index, width = 180) {
  const start = Math.max(0, index - width);
  const end = Math.min(text.length, index + width);
  return normalizeText(text.slice(start, end));
}

function extractTermContexts(text, leagueSlug) {
  const lc = lower(text);
  const terms = termListForLeague(leagueSlug);
  const rows = [];
  const seen = new Set();

  for (const term of terms) {
    const idx = lc.indexOf(term.toLowerCase());
    if (idx < 0) continue;

    const snippet = snippetAround(text, idx);
    const key = snippet.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      matchedTerm: term,
      snippet
    });

    if (rows.length >= 10) break;
  }

  return rows;
}

function classifySnapshot(row) {
  const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
  const text = textForExtraction(row);
  const dates = extractDateSignals(text);
  const terms = matchedTerms(text, leagueSlug);
  const termContexts = extractTermContexts(text, leagueSlug);

  const hasFixtureOrResultTerm = terms.some((term) =>
    /fixture|fixtures|match|matches|schedule|result|results|ottelut|tulokset|partidos|resultados|leikir|úrslit/i.test(term)
  );

  const eventCandidateRows = dates.slice(0, 20).map((dateSignal, index) => ({
    eventCandidateId: [
      asText(row.fetchInputId || "snapshot"),
      String(index + 1).padStart(3, "0")
    ].join(":"),
    leagueSlug,
    competitionSlug: asText(row.competitionSlug || leagueSlug),
    host: asText(row.host || row.hostname),
    hostname: asText(row.hostname),
    sourceUrl: asText(row.finalUrl || row.candidateUrl),
    dateSignal: dateSignal.value,
    contextSnippet: snippetAround(text, dateSignal.index),
    matchedTerms: terms,
    extractionState: "date_context_candidate_needs_review",
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  }));

  let snapshotStructuredState = "not_accessible_or_not_processed";
  if (isHttp200(row)) {
    if (eventCandidateRows.length > 0 && hasFixtureOrResultTerm) {
      snapshotStructuredState = "structured_date_activity_candidates_found";
    } else if (hasFixtureOrResultTerm || termContexts.length > 0) {
      snapshotStructuredState = "activity_terms_found_without_date_structure";
    } else {
      snapshotStructuredState = "accessible_no_structured_activity_signal";
    }
  }

  return {
    fetchInputId: asText(row.fetchInputId),
    leagueSlug,
    competitionSlug: asText(row.competitionSlug || leagueSlug),
    host: asText(row.host || row.hostname),
    hostname: asText(row.hostname),
    candidateUrl: asText(row.candidateUrl),
    finalUrl: asText(row.finalUrl),
    fetchPurpose: asText(row.fetchPurpose),
    status: row.status,
    httpStatus: Number(row.httpStatus || row.status || 0),
    ok: row.ok === true,
    title: asText(row.title),
    plainTextLength: Number(row.plainTextLength || text.length || 0),
    matchedTerms: terms,
    dateSignals: dates.map((item) => item.value),
    termContexts,
    eventCandidateRows,
    snapshotStructuredState,
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function classifyLeague(snapshotRows) {
  const leagueSlug = asText(snapshotRows[0]?.leagueSlug || snapshotRows[0]?.competitionSlug);
  const http200Rows = snapshotRows.filter((row) => row.httpStatus === 200 || row.status === 200 || row.status === "200");
  const eventRows = snapshotRows.flatMap((row) => asArray(row.eventCandidateRows));
  const structuredRows = snapshotRows.filter((row) => row.snapshotStructuredState === "structured_date_activity_candidates_found");
  const termOnlyRows = snapshotRows.filter((row) => row.snapshotStructuredState === "activity_terms_found_without_date_structure");

  let structuredActivityState = "no_accessible_structured_activity_evidence";
  let recommendedNextAction = "specific_route_recovery_or_provider_adapter_needed";

  if (structuredRows.length > 0 && eventRows.length > 0) {
    structuredActivityState = "structured_activity_candidates_found_needs_validation";
    recommendedNextAction = "validate_candidate_events_against_league_identity_read_only";
  } else if (termOnlyRows.length > 0) {
    structuredActivityState = "activity_terms_found_but_no_date_structure";
    recommendedNextAction = "inspect_html_or_build_provider_specific_normalizer";
  }

  return {
    leagueSlug,
    competitionSlug: asText(snapshotRows[0]?.competitionSlug || leagueSlug),
    snapshotCount: snapshotRows.length,
    http200Count: http200Rows.length,
    structuredSnapshotCount: structuredRows.length,
    termOnlySnapshotCount: termOnlyRows.length,
    eventCandidateCount: eventRows.length,
    structuredActivityState,
    recommendedNextAction,
    bestEventCandidates: eventRows.slice(0, 10),
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(input, date) {
  const snapshots = asArray(input?.fetchedSourceSnapshots);
  const snapshotStructuredRows = snapshots
    .filter(isHttp200)
    .map(classifySnapshot);

  const byLeague = new Map();

  for (const row of snapshotStructuredRows) {
    const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
    if (!leagueSlug) continue;
    if (!byLeague.has(leagueSlug)) byLeague.set(leagueSlug, []);
    byLeague.get(leagueSlug).push(row);
  }

  const leagueStructuredRows = [...byLeague.values()]
    .map(classifyLeague)
    .sort((a, b) => a.leagueSlug.localeCompare(b.leagueSlug));

  const allEventCandidates = snapshotStructuredRows.flatMap((row) => asArray(row.eventCandidateRows));

  const byStructuredActivityState = {};
  for (const row of leagueStructuredRows) {
    byStructuredActivityState[row.structuredActivityState] = (byStructuredActivityState[row.structuredActivityState] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-active-watchlist-structured-activity-evidence-file",
    mode: "read_only_structured_activity_evidence_extraction",
    generatedAt: new Date().toISOString(),
    date,
    sourceSummary: input.summary || {},
    summary: {
      inputSnapshotCount: snapshots.length,
      http200InputSnapshotCount: snapshots.filter(isHttp200).length,
      processedHttp200SnapshotCount: snapshotStructuredRows.length,
      leagueStructuredEvidenceCount: leagueStructuredRows.length,
      eventCandidateCount: allEventCandidates.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byStructuredActivityState
    },
    leagueStructuredRows,
    snapshotStructuredRows,
    eventCandidateRows: allEventCandidates,
    policy: {
      structuredCandidateDoesNotEqualTruth: true,
      validationRequiredBeforeActivityTruth: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromStructuredCandidates: true,
      noSearch: true,
      noFetchInThisJob: true
    },
    guarantees: {
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const report = buildReport({
    fetchedSourceSnapshots: [
      {
        fetchInputId: "a",
        leagueSlug: "abc.1",
        competitionSlug: "abc.1",
        hostname: "www.abc.test",
        candidateUrl: "https://www.abc.test/fixtures",
        finalUrl: "https://www.abc.test/fixtures",
        fetchPurpose: "fixture_activity_probe",
        status: 200,
        httpStatus: 200,
        ok: true,
        plainText: "Fixtures 2026 upcoming matches 14 June 2026 Team A vs Team B result table"
      },
      {
        fetchInputId: "b",
        leagueSlug: "abc.2",
        competitionSlug: "abc.2",
        hostname: "www.abc-two.test",
        candidateUrl: "https://www.abc-two.test/fixtures",
        finalUrl: "https://www.abc-two.test/fixtures",
        status: 404,
        httpStatus: 404,
        ok: false,
        plainText: ""
      }
    ]
  }, "2026-06-12");

  if (report.summary.processedHttp200SnapshotCount !== 1) throw new Error("expected one processed HTTP 200 snapshot");
  if (report.summary.eventCandidateCount < 1) throw new Error("expected structured event candidate");
  if (report.summary.canonicalWrites !== 0) throw new Error("must not write canonical");
  if (report.guarantees.noFetch !== true) throw new Error("extractor must not fetch");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-active-watchlist-structured-activity-evidence-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildReport(readJson(args.input), args.date);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-active-watchlist-structured-activity-evidence-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}