#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeWhitespace(value) {
  return asText(value).replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return normalizeWhitespace(asText(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

function readJson(filePath, label) {
  if (!filePath) throw new Error(`${label} path is required`);
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function statusOf(snapshot) {
  if (snapshot?.http?.status != null) return Number(snapshot.http.status);
  if (snapshot?.status != null && /^\d+$/.test(String(snapshot.status))) return Number(snapshot.status);
  return null;
}

function textOf(snapshot) {
  return asText(
    snapshot?.plainText ||
    snapshot?.text ||
    snapshot?.bodyText ||
    snapshot?.body ||
    snapshot?.html ||
    snapshot?.http?.body ||
    snapshot?.http?.text
  );
}

function sourceUrlOf(row, snapshot) {
  return asText(
    row?.finalUrl ||
    row?.resolvedUrl ||
    row?.sourceUrl ||
    snapshot?.http?.finalUrl ||
    snapshot?.finalUrl ||
    snapshot?.resolvedUrl ||
    snapshot?.candidateUrl ||
    snapshot?.url
  );
}

function hostnameOf(row, snapshot) {
  const explicit = asText(row?.hostname || snapshot?.hostname || snapshot?.host);
  if (explicit) return explicit;
  try {
    return new URL(sourceUrlOf(row, snapshot)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function snapshotKey(snapshot) {
  return [
    asText(snapshot.taskId),
    asText(snapshot.leagueSlug || snapshot.competitionSlug),
    sourceUrlOf({}, snapshot),
    asText(snapshot.dayKey || snapshot.targetDate)
  ].join("::");
}

function classifiedKey(row) {
  return [
    asText(row.taskId),
    asText(row.leagueSlug || row.competitionSlug),
    sourceUrlOf(row, {}),
    asText(row.dayKey || row.targetDate)
  ].join("::");
}

function selectRows(input) {
  const rows = Array.isArray(input?.classifiedRows) ? input.classifiedRows : [];
  return rows.filter((row) => row.classification === "candidate_league_season_activity_evidence_needs_validation");
}

function snapshotsByKey(input) {
  const out = new Map();
  const snapshots = Array.isArray(input?.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [];
  for (const snapshot of snapshots) out.set(snapshotKey(snapshot), snapshot);
  return out;
}

function fallbackSnapshot(row, input) {
  const snapshots = Array.isArray(input?.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [];
  const rowLeague = asText(row.leagueSlug || row.competitionSlug);
  const rowUrl = sourceUrlOf(row, {});
  return snapshots.find((snapshot) => {
    const sameLeague = asText(snapshot.leagueSlug || snapshot.competitionSlug) === rowLeague;
    const sameUrl = !rowUrl || sourceUrlOf({}, snapshot) === rowUrl;
    return sameLeague && sameUrl;
  }) || {};
}

function sentenceAround(text, regex) {
  const match = regex.exec(text);
  if (!match) return "";
  const start = Math.max(0, match.index - 180);
  const end = Math.min(text.length, match.index + 320);
  return normalizeWhitespace(text.slice(start, end));
}

function signalFlags(plainText) {
  const text = normalizeWhitespace(plainText);
  const lower = text.toLowerCase();

  const fixturesSignal = /\b(fixtures?|matches|schedule|games|results)\b/i.test(text);
  const calendarSignal = /\b(calendar|dates?|matchday|round|qualifying|qualification|draw)\b/i.test(text);
  const seasonLabelVisible = /\b20\d{2}\s*[-/]\s*\d{2,4}\b|\bseason\b/i.test(text);
  const restartSignal = /\b(restart|starts?|begins?|opening match|kick-?off|commences|returns)\b/i.test(text);
  const noFixtureSignal = /\b(no fixtures?|no matches?|not scheduled|schedule not available|fixtures? to be confirmed)\b/i.test(text);
  const officialCompetitionSignal = /\b(official|competition|league|cup|champions league|europa league|fixtures? & results)\b/i.test(text);

  return {
    fixturesSignal,
    calendarSignal,
    seasonLabelVisible,
    restartSignal,
    noFixtureSignal,
    officialCompetitionSignal,
    signalScore: [fixturesSignal, calendarSignal, seasonLabelVisible, restartSignal, noFixtureSignal, officialCompetitionSignal].filter(Boolean).length,
    bestEvidenceSnippet:
      sentenceAround(text, /\b(fixtures? & results|fixtures?|schedule|calendar|matchday|qualifying|season|restart|starts?|begins?)\b/i) ||
      text.slice(0, 600),
    lowerLength: lower.length
  };
}

function evidenceRow(row, snapshot) {
  const plainText = stripHtml(textOf(snapshot));
  const signals = signalFlags(plainText);
  const status = statusOf(snapshot);
  const sourceUrl = sourceUrlOf(row, snapshot);

  const extractionState = status && status >= 400
    ? "rejected_candidate_http_status"
    : signals.signalScore >= 2
      ? "candidate_season_status_calendar_evidence_needs_validation"
      : "season_status_snapshot_needs_manual_review";

  return {
    taskId: asText(row.taskId || snapshot.taskId),
    leagueSlug: asText(row.leagueSlug || row.competitionSlug || snapshot.leagueSlug || snapshot.competitionSlug),
    competitionSlug: asText(row.competitionSlug || row.leagueSlug || snapshot.competitionSlug || snapshot.leagueSlug),
    name: asText(row.name || row.competitionName || snapshot.name || snapshot.competitionName),
    competitionName: asText(row.competitionName || row.name || snapshot.competitionName || snapshot.name),
    competitionFamily: asText(row.competitionFamily || snapshot.competitionFamily),
    targetDate: asText(row.targetDate || row.dayKey || snapshot.targetDate || snapshot.dayKey),
    dayKey: asText(row.dayKey || row.targetDate || snapshot.dayKey || snapshot.targetDate),
    seasonKey: asText(row.seasonKey || snapshot.seasonKey),
    sourceType: asText(row.sourceType || snapshot.sourceType),
    fetchPurpose: asText(row.fetchPurpose || snapshot.fetchPurpose || row.sourceType || snapshot.sourceType),
    validationIntent: asText(row.validationIntent || snapshot.validationIntent),
    classification: asText(row.classification),
    sourceUrl,
    finalUrl: sourceUrlOf(row, snapshot),
    hostname: hostnameOf(row, snapshot),
    status,
    contentType: asText(row.contentType || snapshot.contentType || snapshot.http?.contentType),
    bytes: Number(row.bytes || snapshot.bytes || snapshot.http?.bytes || 0),
    fixtureLanguageVisible: row.fixtureLanguageVisible === true,
    targetDateVisible: row.targetDateVisible === true,
    explicitNoFixtureEvidence: row.explicitNoFixtureEvidence === true,
    fixturesSignal: signals.fixturesSignal,
    calendarSignal: signals.calendarSignal,
    seasonLabelVisible: signals.seasonLabelVisible,
    restartSignal: signals.restartSignal,
    noFixtureSignal: signals.noFixtureSignal,
    officialCompetitionSignal: signals.officialCompetitionSignal,
    signalScore: signals.signalScore,
    evidenceTextSnippet: signals.bestEvidenceSnippet.slice(0, 900),
    acceptedForSeasonStatusEvidence: false,
    validationState: extractionState,
    extractionState,
    reason: extractionState === "candidate_season_status_calendar_evidence_needs_validation"
      ? "season_calendar_or_activity_signals_found_needs_validation"
      : extractionState === "rejected_candidate_http_status"
        ? `http_status_${status ?? "missing"}`
        : "insufficient_season_status_signals_needs_manual_review",
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildReport(input, options = {}) {
  const rows = selectRows(input);
  const byKey = snapshotsByKey(input);
  const seasonStatusEvidenceRows = rows.map((row) => {
    const snapshot = byKey.get(classifiedKey(row)) || fallbackSnapshot(row, input);
    return evidenceRow(row, snapshot);
  });

  const byExtractionState = {};
  const byLeague = {};
  for (const row of seasonStatusEvidenceRows) {
    byExtractionState[row.extractionState] = (byExtractionState[row.extractionState] || 0) + 1;
    byLeague[row.leagueSlug || "unknown"] = {
      competitionName: row.competitionName || row.name,
      targetDate: row.targetDate,
      seasonKey: row.seasonKey,
      extractionState: row.extractionState,
      signalScore: row.signalScore,
      hostname: row.hostname
    };
  }

  return {
    ok: true,
    job: "extract-football-truth-season-status-evidence-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_football_truth_season_status_evidence_extraction",
    sourceInput: options.input || "",
    summary: {
      inputClassifiedRowCount: Array.isArray(input?.classifiedRows) ? input.classifiedRows.length : 0,
      selectedSeasonActivityRowCount: rows.length,
      extractedRowCount: seasonStatusEvidenceRows.length,
      candidateSeasonStatusEvidenceCount: seasonStatusEvidenceRows.filter((row) => row.extractionState === "candidate_season_status_calendar_evidence_needs_validation").length,
      manualReviewCount: seasonStatusEvidenceRows.filter((row) => row.extractionState === "season_status_snapshot_needs_manual_review").length,
      rejectedHttpStatusCount: seasonStatusEvidenceRows.filter((row) => row.extractionState === "rejected_candidate_http_status").length,
      acceptedForSeasonStatusEvidenceCount: seasonStatusEvidenceRows.filter((row) => row.acceptedForSeasonStatusEvidence === true).length,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byExtractionState,
    byLeague,
    seasonStatusEvidenceRows,
    evidenceRows: seasonStatusEvidenceRows,
    fetchedSourceSnapshots: Array.isArray(input?.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [],
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedClassifiedSnapshots: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    canonicalWrites: 0,
    productionWrite: false
  };
}

function selfTest() {
  const input = {
    classifiedRows: [
      {
        taskId: "uefa",
        leagueSlug: "uefa.europa",
        competitionSlug: "uefa.europa",
        name: "UEFA Europa League",
        competitionName: "UEFA Europa League",
        dayKey: "2026-06-03",
        targetDate: "2026-06-03",
        seasonKey: "2025-2026",
        sourceType: "season_status_official_primary",
        fetchPurpose: "season_activity_status_calendar",
        classification: "candidate_league_season_activity_evidence_needs_validation",
        finalUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        hostname: "uefa.com",
        status: 200,
        fixtureLanguageVisible: true
      },
      {
        taskId: "fixture",
        leagueSlug: "eng.1",
        classification: "candidate_fixture_evidence_needs_validation"
      }
    ],
    fetchedSourceSnapshots: [
      {
        taskId: "uefa",
        leagueSlug: "uefa.europa",
        competitionSlug: "uefa.europa",
        name: "UEFA Europa League",
        dayKey: "2026-06-03",
        seasonKey: "2025-2026",
        sourceType: "season_status_official_primary",
        fetchPurpose: "season_activity_status_calendar",
        candidateUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        hostname: "uefa.com",
        http: {
          status: 200,
          finalUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
          bytes: 1200,
          contentType: "text/html"
        },
        plainText: "Fixtures & results UEFA Europa League 2025/26 official competition calendar matchday schedule qualifying season."
      }
    ]
  };

  const report = buildReport(input, { input: "self-test" });

  if (report.summary.inputClassifiedRowCount !== 2) throw new Error("expected two classified input rows");
  if (report.summary.selectedSeasonActivityRowCount !== 1) throw new Error("expected one selected season activity row");
  if (report.summary.candidateSeasonStatusEvidenceCount !== 1) throw new Error("expected one candidate season status evidence row");
  if (report.summary.acceptedForSeasonStatusEvidenceCount !== 0) throw new Error("expected no accepted final review decision");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "extract-football-truth-season-status-evidence-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const report = buildReport(input, { input: args.input });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();