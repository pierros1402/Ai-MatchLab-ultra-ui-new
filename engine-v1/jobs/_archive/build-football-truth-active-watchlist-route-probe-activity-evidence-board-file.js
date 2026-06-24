import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
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
  const args = {
    input: "",
    output: "",
    date: "",
    selfTest: false
  };

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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isHttp200(row) {
  return Number(row?.httpStatus ?? row?.status) === 200 || String(row?.status) === "200";
}

function isHttp404(row) {
  return Number(row?.httpStatus ?? row?.status) === 404 || String(row?.status) === "404";
}

function textOf(row) {
  return [
    row?.title,
    row?.candidateUrl,
    row?.finalUrl,
    row?.plainText
  ].map(asText).join(" ").toLowerCase();
}

function routePurposeList(row) {
  return asArray(row?.routePurposes).map(asText).filter(Boolean);
}

function evidenceFlags(row) {
  const text = textOf(row);
  const purposes = routePurposeList(row);

  return {
    hasFixtureRoute: purposes.includes("fixtures") || /fixture|fixtures|match|matches|schedule/.test(text),
    hasResultRoute: purposes.includes("results") || /result|results/.test(text),
    hasStandingRoute: purposes.includes("standings") || /standing|standings|table|tables/.test(text),
    mentions2026: /\b2026\b/.test(text),
    mentionsTodayOrCurrent: /\btoday\b|\bcurrent\b|\blive\b|\bupcoming\b|tänään|ottelut|fixtures|matches|results/.test(text),
    hasNonTrivialText: asText(row?.plainText).length >= 200
  };
}

function compactSnapshot(row) {
  const flags = evidenceFlags(row);

  return {
    fetchInputId: asText(row.fetchInputId),
    leagueSlug: asText(row.leagueSlug || row.competitionSlug),
    competitionSlug: asText(row.competitionSlug || row.leagueSlug),
    host: asText(row.host || row.hostname),
    hostname: asText(row.hostname),
    candidateUrl: asText(row.candidateUrl),
    finalUrl: asText(row.finalUrl),
    fetchPurpose: asText(row.fetchPurpose),
    routePurposes: routePurposeList(row),
    status: row.status,
    httpStatus: Number(row.httpStatus || row.status || 0),
    ok: row.ok === true,
    title: asText(row.title),
    plainTextLength: Number(row.plainTextLength || asText(row.plainText).length || 0),
    rawTextLength: Number(row.rawTextLength || asText(row.rawText).length || 0),
    flags
  };
}

function classifyLeague(rows) {
  const fetchedCount = rows.length;
  const http200Rows = rows.filter(isHttp200);
  const http404Rows = rows.filter(isHttp404);

  const accessibleHosts = [...new Set(http200Rows.map((row) => asText(row.hostname || row.host)).filter(Boolean))];
  const accessibleUrls = http200Rows.map((row) => asText(row.finalUrl || row.candidateUrl)).filter(Boolean);

  const routePurposeCounts = {};
  const flagCounts = {
    hasFixtureRoute: 0,
    hasResultRoute: 0,
    hasStandingRoute: 0,
    mentions2026: 0,
    mentionsTodayOrCurrent: 0,
    hasNonTrivialText: 0
  };

  for (const row of http200Rows) {
    for (const purpose of routePurposeList(row)) {
      routePurposeCounts[purpose] = (routePurposeCounts[purpose] || 0) + 1;
    }

    const flags = evidenceFlags(row);
    for (const key of Object.keys(flagCounts)) {
      if (flags[key]) flagCounts[key] += 1;
    }
  }

  let routeProbeState = "no_accessible_official_route_in_probe";
  let activityEvidenceState = "activity_unknown_needs_better_route_or_normalizer";
  let recommendedNextAction = "specific_official_route_recovery_or_adapter_needed";

  if (http200Rows.length > 0) {
    routeProbeState = "official_route_accessible";
    activityEvidenceState = "official_route_accessible_but_activity_not_yet_proven";
    recommendedNextAction = "build_content_normalizer_or_specific_route_adapter_before_activity_truth";
  }

  if (http200Rows.length > 0 && flagCounts.hasNonTrivialText > 0 && (flagCounts.hasFixtureRoute > 0 || flagCounts.hasResultRoute > 0)) {
    activityEvidenceState = "candidate_activity_evidence_available_needs_normalized_extraction";
    recommendedNextAction = "extract_normalized_fixture_result_activity_signals_read_only";
  }

  return {
    leagueSlug: asText(rows[0]?.leagueSlug || rows[0]?.competitionSlug),
    competitionSlug: asText(rows[0]?.competitionSlug || rows[0]?.leagueSlug),
    fetchedCount,
    http200Count: http200Rows.length,
    http404Count: http404Rows.length,
    accessibleHostCount: accessibleHosts.length,
    accessibleHosts,
    accessibleUrls,
    routePurposeCounts,
    flagCounts,
    routeProbeState,
    activityEvidenceState,
    recommendedNextAction,
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildBoard(input, date) {
  const snapshots = asArray(input?.fetchedSourceSnapshots);
  const compactRows = snapshots.map(compactSnapshot);

  const byLeague = new Map();
  for (const row of compactRows) {
    const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
    if (!leagueSlug) continue;
    if (!byLeague.has(leagueSlug)) byLeague.set(leagueSlug, []);
    byLeague.get(leagueSlug).push(row);
  }

  const leagueEvidenceRows = [...byLeague.values()]
    .map(classifyLeague)
    .sort((a, b) => a.leagueSlug.localeCompare(b.leagueSlug));

  const summaryByState = {};
  for (const row of leagueEvidenceRows) {
    summaryByState[row.activityEvidenceState] = (summaryByState[row.activityEvidenceState] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-active-watchlist-route-probe-activity-evidence-board-file",
    mode: "read_only_route_probe_activity_evidence_board",
    generatedAt: new Date().toISOString(),
    date,
    sourceSummary: input.summary || {},
    summary: {
      inputSnapshotCount: snapshots.length,
      compactSnapshotCount: compactRows.length,
      leagueEvidenceCount: leagueEvidenceRows.length,
      http200SnapshotCount: compactRows.filter((row) => row.httpStatus === 200 || row.status === 200 || row.status === "200").length,
      http404SnapshotCount: compactRows.filter((row) => row.httpStatus === 404 || row.status === 404 || row.status === "404").length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byActivityEvidenceState: summaryByState
    },
    leagueEvidenceRows,
    compactSnapshotRows: compactRows,
    policy: {
      routeProbeDoesNotEqualTruth: true,
      http200DoesNotEqualActiveLeague: true,
      activityTruthRequiresNormalizedExtraction: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromRouteProbe: true,
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
  const report = buildBoard({
    summary: { fetchedSnapshotCount: 2 },
    fetchedSourceSnapshots: [
      {
        fetchInputId: "a",
        leagueSlug: "abc.1",
        competitionSlug: "abc.1",
        hostname: "www.abc.test",
        candidateUrl: "https://www.abc.test/fixtures",
        finalUrl: "https://www.abc.test/fixtures",
        fetchPurpose: "fixture_activity_probe",
        routePurposes: ["fixtures"],
        status: 200,
        httpStatus: 200,
        ok: true,
        plainText: "Fixtures 2026 upcoming matches"
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

  if (report.summary.leagueEvidenceCount !== 2) throw new Error("expected two league evidence rows");
  if (report.leagueEvidenceRows.find((row) => row.leagueSlug === "abc.1")?.routeProbeState !== "official_route_accessible") {
    throw new Error("expected accessible route state");
  }
  if (report.leagueEvidenceRows.some((row) => row.mayPromoteCanonical !== false)) {
    throw new Error("must not promote canonical");
  }
  if (report.guarantees.noFetch !== true) throw new Error("board builder must not fetch");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-active-watchlist-route-probe-activity-evidence-board-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildBoard(readJson(args.input), args.date);
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
    job: "build-football-truth-active-watchlist-route-probe-activity-evidence-board-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}