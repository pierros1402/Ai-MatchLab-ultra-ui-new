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
  return asText(value).replace(/\s+/g, " ").trim();
}

function lowerText(row) {
  return normalizeText([
    row?.title,
    row?.candidateUrl,
    row?.finalUrl,
    row?.plainText
  ].map(asText).join(" ")).toLowerCase();
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function extractDateSignals(text) {
  const signals = new Set();

  for (const match of text.matchAll(/\b20[2-3][0-9][-/\.](0?[1-9]|1[0-2])[-/\.](0?[1-9]|[12][0-9]|3[01])\b/g)) {
    signals.add(match[0]);
  }

  for (const match of text.matchAll(/\b(0?[1-9]|[12][0-9]|3[01])[-/\.](0?[1-9]|1[0-2])[-/\.](20[2-3][0-9])\b/g)) {
    signals.add(match[0]);
  }

  for (const match of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+[0-3]?[0-9],?\s+20[2-3][0-9]\b/gi)) {
    signals.add(match[0]);
  }

  for (const match of text.matchAll(/\b[0-3]?[0-9]\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+20[2-3][0-9]\b/gi)) {
    signals.add(match[0]);
  }

  return [...signals].slice(0, 20);
}

function activityTermsForLeague(leagueSlug) {
  const common = [
    "fixture", "fixtures", "match", "matches", "schedule", "result", "results",
    "today", "tomorrow", "upcoming", "live", "standings", "table", "round"
  ];

  const byLeague = {
    "fin.1": ["ottelut", "tulokset", "sarjataulukko", "veikkausliiga", "liiga"],
    "fin.2": ["ottelut", "tulokset", "sarjataulukko", "ykkösliiga", "ykkosliiga"],
    "irl.1": ["league of ireland", "premier division", "fixtures", "results"],
    "irl.2": ["league of ireland", "first division", "fixtures", "results"],
    "isl.1": ["leikir", "úrslit", "ksi", "besta deild"],
    "per.1": ["liga 1", "partidos", "resultados", "fixture"]
  };

  return [...common, ...(byLeague[leagueSlug] || [])];
}

function scoreSnapshot(row) {
  const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
  const text = lowerText(row);
  const terms = activityTermsForLeague(leagueSlug);
  const matchedTerms = terms.filter((term) => text.includes(term.toLowerCase()));
  const dateSignals = extractDateSignals(text);

  const signalCounts = {
    fixtureTerms: countMatches(text, /\bfixture(s)?\b|\bmatch(es)?\b|\bschedule\b|ottelut|partidos|leikir/g),
    resultTerms: countMatches(text, /\bresult(s)?\b|tulokset|resultados|úrslit/g),
    standingsTerms: countMatches(text, /\bstanding(s)?\b|\btable(s)?\b|sarjataulukko/g),
    currentYearMentions: countMatches(text, /\b2026\b/g),
    dateSignalCount: dateSignals.length
  };

  let score = 0;
  if (isHttp200(row)) score += 5;
  if (normalizeText(row.plainText).length >= 200) score += 2;
  if (signalCounts.fixtureTerms > 0) score += 3;
  if (signalCounts.resultTerms > 0) score += 2;
  if (signalCounts.currentYearMentions > 0) score += 3;
  if (signalCounts.dateSignalCount > 0) score += 2;
  if (matchedTerms.length > 0) score += Math.min(4, matchedTerms.length);

  let snapshotSignalState = "not_accessible";
  if (isHttp200(row)) {
    snapshotSignalState = score >= 10
      ? "candidate_activity_signal_detected"
      : "accessible_but_weak_or_no_activity_signal";
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
    plainTextLength: Number(row.plainTextLength || normalizeText(row.plainText).length || 0),
    matchedTerms: matchedTerms.slice(0, 20),
    dateSignals,
    signalCounts,
    activitySignalScore: score,
    snapshotSignalState,
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function classifyLeague(rows) {
  const leagueSlug = asText(rows[0]?.leagueSlug || rows[0]?.competitionSlug);
  const http200Rows = rows.filter((row) => row.httpStatus === 200 || row.status === 200 || row.status === "200");
  const candidateRows = rows.filter((row) => row.snapshotSignalState === "candidate_activity_signal_detected");
  const weakRows = rows.filter((row) => row.snapshotSignalState === "accessible_but_weak_or_no_activity_signal");

  const bestScore = rows.reduce((max, row) => Math.max(max, Number(row.activitySignalScore || 0)), 0);
  const bestRows = rows
    .slice()
    .sort((a, b) => Number(b.activitySignalScore || 0) - Number(a.activitySignalScore || 0))
    .slice(0, 5);

  let activitySignalState = "no_accessible_route_activity_signal";
  let recommendedNextAction = "specific_official_route_recovery_or_adapter_needed";

  if (candidateRows.length > 0) {
    activitySignalState = "candidate_activity_signal_detected_needs_structured_normalization";
    recommendedNextAction = "build_structured_fixture_result_normalizer_read_only";
  } else if (weakRows.length > 0) {
    activitySignalState = "accessible_route_but_activity_signal_weak";
    recommendedNextAction = "inspect_accessible_route_content_or_specific_adapter";
  }

  return {
    leagueSlug,
    competitionSlug: asText(rows[0]?.competitionSlug || leagueSlug),
    fetchedSnapshotCount: rows.length,
    http200Count: http200Rows.length,
    candidateActivitySignalSnapshotCount: candidateRows.length,
    weakAccessibleSnapshotCount: weakRows.length,
    bestActivitySignalScore: bestScore,
    activitySignalState,
    recommendedNextAction,
    bestRows: bestRows.map((row) => ({
      fetchInputId: row.fetchInputId,
      hostname: row.hostname,
      finalUrl: row.finalUrl,
      fetchPurpose: row.fetchPurpose,
      httpStatus: row.httpStatus,
      activitySignalScore: row.activitySignalScore,
      snapshotSignalState: row.snapshotSignalState,
      matchedTerms: row.matchedTerms,
      dateSignals: row.dateSignals,
      plainTextLength: row.plainTextLength
    })),
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(input, date) {
  const snapshots = asArray(input?.fetchedSourceSnapshots);
  const snapshotSignalRows = snapshots.map(scoreSnapshot);

  const byLeague = new Map();
  for (const row of snapshotSignalRows) {
    const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
    if (!leagueSlug) continue;
    if (!byLeague.has(leagueSlug)) byLeague.set(leagueSlug, []);
    byLeague.get(leagueSlug).push(row);
  }

  const leagueActivitySignalRows = [...byLeague.values()]
    .map(classifyLeague)
    .sort((a, b) => a.leagueSlug.localeCompare(b.leagueSlug));

  const byActivitySignalState = {};
  for (const row of leagueActivitySignalRows) {
    byActivitySignalState[row.activitySignalState] = (byActivitySignalState[row.activitySignalState] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-active-watchlist-normalized-activity-signals-file",
    mode: "read_only_normalized_activity_signal_extraction",
    generatedAt: new Date().toISOString(),
    date,
    sourceSummary: input.summary || {},
    summary: {
      inputSnapshotCount: snapshots.length,
      snapshotSignalRowCount: snapshotSignalRows.length,
      leagueActivitySignalCount: leagueActivitySignalRows.length,
      candidateActivitySignalLeagueCount: leagueActivitySignalRows.filter((row) => row.activitySignalState === "candidate_activity_signal_detected_needs_structured_normalization").length,
      weakAccessibleLeagueCount: leagueActivitySignalRows.filter((row) => row.activitySignalState === "accessible_route_but_activity_signal_weak").length,
      noAccessibleRouteSignalLeagueCount: leagueActivitySignalRows.filter((row) => row.activitySignalState === "no_accessible_route_activity_signal").length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byActivitySignalState
    },
    leagueActivitySignalRows,
    snapshotSignalRows,
    policy: {
      signalDoesNotEqualTruth: true,
      activeTruthRequiresStructuredFixtureOrResultExtraction: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromSignals: true,
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
        plainText: "Fixtures 2026 upcoming matches June 14 2026 results table"
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

  if (report.summary.leagueActivitySignalCount !== 2) throw new Error("expected two league rows");
  if (report.summary.candidateActivitySignalLeagueCount !== 1) throw new Error("expected one candidate signal league");
  if (report.guarantees.noFetch !== true) throw new Error("extractor must not fetch");
  if (report.leagueActivitySignalRows.some((row) => row.mayPromoteCanonical !== false)) throw new Error("must not promote canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-active-watchlist-normalized-activity-signals-file",
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
    job: "build-football-truth-active-watchlist-normalized-activity-signals-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}