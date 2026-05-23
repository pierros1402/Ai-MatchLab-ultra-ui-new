import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: null,
    output: null,
    pretty: true,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i]).trim();
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i]).trim();
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length).trim();
      continue;
    }

    if (arg === "--compact") {
      args.pretty = false;
      continue;
    }

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) {
    throw new Error("missing required --input");
  }

  if (!args.output) {
    args.output = args.input
      ? defaultOutputPath(args.input)
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-external-active-source-evidence.json";
  }

  return args;
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/prepare-fixture-external-active-source-evidence-file.js --input <source-url-snapshots.json> --output <evidence.json>",
    "",
    "Guarantees:",
    "  - sourceFetch: false",
    "  - noUrlFetch: true",
    "  - noReviewDecision: true",
    "  - noCanonicalPromotion: true",
    "  - canonicalWrites: 0",
    "  - productionWrite: false"
  ].join("\n"));
}

function resolvePath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function defaultOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.prepared-source-evidence.json`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolvePath(filePath), "utf8"));
}

function writeJson(filePath, value, pretty = true) {
  const abs = resolvePath(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lowerText(value) {
  return cleanString(value).toLowerCase();
}

function extractSnapshots(input) {
  if (Array.isArray(input?.fetchedSourceSnapshots)) return input.fetchedSourceSnapshots;
  if (Array.isArray(input?.sourceSnapshots)) return input.sourceSnapshots;
  if (Array.isArray(input?.snapshots)) return input.snapshots;
  if (Array.isArray(input)) return input;

  throw new Error("Input must contain fetchedSourceSnapshots[], sourceSnapshots[], snapshots[], or be an array.");
}

function normalizeSnapshot(snapshot, index) {
  const http = snapshot?.http || {};

  return {
    index,
    taskId: cleanString(snapshot?.taskId) || `snapshot:${index}`,
    leagueSlug: cleanString(snapshot?.leagueSlug),
    name: cleanString(snapshot?.name),
    country: cleanString(snapshot?.country),
    dayKey: cleanString(snapshot?.dayKey),
    searchQuery: cleanString(snapshot?.searchQuery),
    resolvedUrl: cleanString(snapshot?.resolvedUrl),
    hostname: cleanString(snapshot?.hostname),
    sourceType: cleanString(snapshot?.sourceType),
    sourceTitle: cleanString(snapshot?.sourceTitle),
    externallyActive: normalizeBoolean(snapshot?.externallyActive),
    fixtureCountFound: normalizeNumber(snapshot?.fixtureCountFound),
    missingFromSnapshot: normalizeBoolean(snapshot?.missingFromSnapshot),
    reviewerNotes: cleanString(snapshot?.reviewerNotes),
    fetchedAt: cleanString(snapshot?.fetchedAt),
    fetchState: cleanString(snapshot?.fetchState),
    http: {
      ok: normalizeBoolean(http?.ok),
      status: normalizeNumber(http?.status),
      statusText: cleanString(http?.statusText),
      finalUrl: cleanString(http?.finalUrl),
      contentType: cleanString(http?.contentType),
      bytes: normalizeNumber(http?.bytes),
      truncated: normalizeBoolean(http?.truncated),
      text: cleanString(http?.text),
      sha256: cleanString(http?.sha256)
    }
  };
}

function countTextMatches(text, patterns) {
  const lowered = lowerText(text);
  let count = 0;

  for (const pattern of patterns) {
    if (lowered.includes(pattern)) count += 1;
  }

  return count;
}

function evidenceSignals(snapshot) {
  const text = snapshot.http.text || "";
  const lowered = lowerText(text);
  const day = lowerText(snapshot.dayKey);
  const league = lowerText(snapshot.name);
  const slug = lowerText(snapshot.leagueSlug);

  const dateSignals = [];
  if (day && lowered.includes(day)) dateSignals.push("contains_day_key_iso");

  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const compactDay = day.replaceAll("-", "/");
  if (compactDay && lowered.includes(compactDay)) dateSignals.push("contains_day_key_slash");

  if (dateParts) {
    const [, year, month, date] = dateParts;
    const monthDayDash = `${month}-${date}`;
    const monthDaySlash = `${month}/${date}`;
    const dateMonthSlash = `${date}/${month}`;
    const dateMonthDash = `${date}-${month}`;
    const yearMonthDayCompact = `${year}${month}${date}`;
    const monthNames = [
      "",
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december"
    ];
    const monthName = monthNames[Number(month)] || "";

    if (lowered.includes(year) && lowered.includes(monthDayDash)) {
      dateSignals.push("contains_year_and_month_day_dash");
    }

    if (lowered.includes(year) && lowered.includes(monthDaySlash)) {
      dateSignals.push("contains_year_and_month_day_slash");
    }

    if (lowered.includes(dateMonthSlash)) {
      dateSignals.push("contains_date_month_slash");
    }

    if (lowered.includes(dateMonthDash)) {
      dateSignals.push("contains_date_month_dash");
    }

    if (lowered.includes(yearMonthDayCompact)) {
      dateSignals.push("contains_day_key_compact");
    }

    if (monthName && lowered.includes(monthName) && lowered.includes(date)) {
      dateSignals.push("contains_month_name_and_day");
    }
  }

  const leagueSignals = [];
  if (league && lowered.includes(league)) leagueSignals.push("contains_league_name");
  if (slug && lowered.includes(slug)) leagueSignals.push("contains_league_slug");

  const fixtureWordPatterns = [
    "fixture",
    "fixtures",
    "match",
    "matches",
    "schedule",
    "programme",
    "calendar",
    "results",
    "round",
    "matchday"
  ];

  const inactivePatterns = [
    "no fixtures",
    "no matches",
    "no games",
    "no events",
    "not scheduled",
    "postponed"
  ];

  const officialPatterns = [
    "federation",
    "football association",
    "official",
    "league",
    "competition",
    "fixtures"
  ];

  return {
    dateSignals,
    leagueSignals,
    fixtureWordSignalCount: countTextMatches(text, fixtureWordPatterns),
    inactiveSignalCount: countTextMatches(text, inactivePatterns),
    officialContextSignalCount: countTextMatches(text, officialPatterns),
    hasDateSignal: dateSignals.length > 0,
    hasLeagueSignal: leagueSignals.length > 0,
    hasFixtureLanguage: countTextMatches(text, fixtureWordPatterns) > 0,
    hasInactiveLanguage: countTextMatches(text, inactivePatterns) > 0
  };
}

function evidenceStateForSnapshot(snapshot, signals) {
  if (snapshot.http.ok !== true) return "http_not_ok";
  if (!snapshot.http.text) return "empty_snapshot_text";
  if (!signals.hasDateSignal) return "missing_date_signal";
  if (!signals.hasFixtureLanguage && !signals.hasInactiveLanguage) return "missing_fixture_language";
  return "source_snapshot_evidence_prepared";
}

function prepareEvidenceRow(snapshot) {
  const signals = evidenceSignals(snapshot);
  const evidenceState = evidenceStateForSnapshot(snapshot, signals);

  return {
    evidenceId: `fixture_external_active_source_evidence:${snapshot.dayKey || "unknown-day"}:${snapshot.leagueSlug || "unknown-league"}:${snapshot.index}`,
    taskId: snapshot.taskId,
    leagueSlug: snapshot.leagueSlug,
    name: snapshot.name,
    country: snapshot.country,
    dayKey: snapshot.dayKey,
    sourceType: snapshot.sourceType,
    sourceTitle: snapshot.sourceTitle,
    resolvedUrl: snapshot.resolvedUrl,
    finalUrl: snapshot.http.finalUrl,
    hostname: snapshot.hostname,
    fetchedAt: snapshot.fetchedAt,
    httpStatus: snapshot.http.status,
    httpOk: snapshot.http.ok,
    contentType: snapshot.http.contentType,
    textBytes: snapshot.http.bytes,
    textSha256: snapshot.http.sha256,
    textTruncated: snapshot.http.truncated,
    externallyActiveFromResolution: snapshot.externallyActive,
    fixtureCountFoundFromResolution: snapshot.fixtureCountFound,
    missingFromSnapshotFromResolution: snapshot.missingFromSnapshot,
    reviewerNotes: snapshot.reviewerNotes,
    signals,
    evidenceState,
    readyForReviewDecision: evidenceState === "source_snapshot_evidence_prepared",
    reviewDecisionState: "not_decided",
    canonicalPromotionState: "blocked",
    canonicalWrites: 0,
    productionWrite: false
  };
}

function summarize(evidenceRows) {
  const byEvidenceState = {};
  const byLeague = {};
  let readyForReviewDecisionCount = 0;

  for (const row of evidenceRows) {
    byEvidenceState[row.evidenceState] = (byEvidenceState[row.evidenceState] || 0) + 1;

    if (!byLeague[row.leagueSlug]) {
      byLeague[row.leagueSlug] = {
        total: 0,
        readyForReviewDecision: 0,
        states: {}
      };
    }

    byLeague[row.leagueSlug].total += 1;
    byLeague[row.leagueSlug].states[row.evidenceState] = (byLeague[row.leagueSlug].states[row.evidenceState] || 0) + 1;

    if (row.readyForReviewDecision) {
      readyForReviewDecisionCount += 1;
      byLeague[row.leagueSlug].readyForReviewDecision += 1;
    }
  }

  return {
    snapshotCount: evidenceRows.length,
    evidenceRowCount: evidenceRows.length,
    readyForReviewDecisionCount,
    byEvidenceState,
    byLeague
  };
}

function buildReport(input, options = {}) {
  const snapshots = extractSnapshots(input).map((snapshot, index) => normalizeSnapshot(snapshot, index));
  const evidenceRows = snapshots.map((snapshot) => prepareEvidenceRow(snapshot));

  return {
    ok: true,
    job: "prepare-fixture-external-active-source-evidence-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_external_active_source_evidence_preparer",
    sourceInput: options.inputPath || null,
    canonicalWrites: 0,
    summary: summarize(evidenceRows),
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noReviewDecision: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    },
    evidenceRows,
    readyForReviewDecisionRows: evidenceRows.filter((row) => row.readyForReviewDecision),
    notes: [
      "This job prepares source evidence rows from already fetched diagnostic snapshots.",
      "It does not fetch URLs.",
      "It does not decide externallyActive or fill review pack source fields.",
      "It does not write canonical fixtures.",
      "readyForReviewDecision means evidence can be inspected by a later decision builder, not that a decision has been made."
    ]
  };
}

function selfTestInput() {
  return {
    fetchedSourceSnapshots: [
      {
        taskId: "fixture_external_active_source_url_resolution:2026-05-22:est.1:01",
        leagueSlug: "est.1",
        name: "Estonian Meistriliiga",
        country: "estonia",
        dayKey: "2026-05-22",
        resolvedUrl: "https://example.com/fixtures",
        hostname: "example.com",
        sourceType: "official_federation_fixture_list",
        sourceTitle: "Official fixtures",
        externallyActive: true,
        fixtureCountFound: 2,
        missingFromSnapshot: true,
        reviewerNotes: "Synthetic official evidence.",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        fetchState: "fetched_diagnostic_snapshot",
        http: {
          ok: true,
          status: 200,
          statusText: "OK",
          finalUrl: "https://example.com/fixtures",
          contentType: "text/html",
          bytes: 200,
          truncated: false,
          sha256: "synthetic",
          text: "Official federation fixtures for Estonian Meistriliiga on 2026-05-22. Matches scheduled."
        }
      },
      {
        taskId: "fixture_external_active_source_url_resolution:2026-05-22:fro.1:01",
        leagueSlug: "fro.1",
        name: "Faroe Islands Premier League",
        country: "faroe islands",
        dayKey: "2026-05-22",
        resolvedUrl: "https://example.com/fro",
        hostname: "example.com",
        sourceType: "official_league_fixture_list",
        sourceTitle: "Official fixtures",
        externallyActive: true,
        fixtureCountFound: 1,
        missingFromSnapshot: true,
        fetchedAt: "2026-05-22T00:00:00.000Z",
        fetchState: "fetched_diagnostic_snapshot",
        http: {
          ok: true,
          status: 200,
          statusText: "OK",
          finalUrl: "https://example.com/fro",
          contentType: "text/html",
          bytes: 50,
          truncated: false,
          sha256: "synthetic",
          text: "Faroe Islands Premier League schedule, but no ISO date here."
        }
      }
    ]
  };
}

function runSelfTest() {
  const report = buildReport(selfTestInput(), { inputPath: "self-test" });

  if (report.summary.snapshotCount !== 2 || report.summary.evidenceRowCount !== 2) {
    throw new Error("self-test failed: expected 2 evidence rows");
  }

  if (report.summary.readyForReviewDecisionCount !== 1) {
    throw new Error("self-test failed: expected 1 ready evidence row");
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("self-test failed: unsafe guarantees");
  }

  if (!report.guarantees.noFetch || !report.guarantees.noUrlFetch || !report.guarantees.noReviewDecision) {
    throw new Error("self-test failed: missing read-only guarantees");
  }

  return report;
}

function main() {
  const args = parseArgs();

  const report = args.selfTest
    ? runSelfTest()
    : buildReport(readJson(args.input), { inputPath: args.input });

  writeJson(args.output, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();