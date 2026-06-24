#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  if (!filePath) throw new Error("input path is required");
  if (!fs.existsSync(filePath)) throw new Error(`input not found: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
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

function rowsOf(input) {
  if (Array.isArray(input)) return input;
  for (const key of ["seasonStatusEvidenceRows", "evidenceRows", "rows", "items"]) {
    if (Array.isArray(input?.[key])) return input[key];
  }
  return [];
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function officialSourceStrength(row) {
  const sourceType = asText(row.sourceType).toLowerCase();
  const sourceClass = asText(row.sourceClass).toLowerCase();
  const fetchPurpose = asText(row.fetchPurpose).toLowerCase();
  const host = asText(row.hostname).replace(/^www\./, "");

  if (sourceType.startsWith("season_status_official") || sourceType.startsWith("official_")) return "official";
  if (sourceClass.includes("official") || sourceClass.includes("competition_operator") || sourceClass.includes("governing")) return "official";
  if (fetchPurpose === "season_activity_status_calendar" && /uefa\.com$|fifa\.com$|the-afc\.com$|cafonline\.com$|concacaf\.com$|conmebol\.com$|eliteserien\.no$|fotball\.no$|premierleague\.com$/i.test(host)) return "official";
  if (/uefa\.com$|fifa\.com$|the-afc\.com$|cafonline\.com$|concacaf\.com$|conmebol\.com$|eliteserien\.no$|fotball\.no$|premierleague\.com$/i.test(host)) return "official";
  return "non_official";
}

function hasCalendarSignals(row) {
  return row.fixturesSignal === true ||
    row.calendarSignal === true ||
    row.seasonLabelVisible === true ||
    row.restartSignal === true ||
    row.officialCompetitionSignal === true ||
    Number(row.signalScore || 0) >= 2;
}

function validateRow(row) {
  const official = officialSourceStrength(row) === "official";
  const signalScore = Number(row.signalScore || 0);
  const hasSignals = hasCalendarSignals(row);
  const status = row.status == null ? null : Number(row.status);
  const extractionState = asText(row.extractionState || row.validationState);
  const sourceUrl = asText(row.finalUrl || row.sourceUrl || row.resolvedUrl);

  let decision;
  if (status && status >= 400) {
    decision = {
      validationState: "season_status_evidence_rejected_http_status",
      validationConfidence: "low",
      requiresSecondSource: true,
      decisionReason: `source returned HTTP ${status}`
    };
  } else if (official && extractionState === "candidate_season_status_calendar_evidence_needs_validation" && hasSignals && signalScore >= 3) {
    decision = {
      validationState: "season_calendar_validated_from_official_source",
      validationConfidence: "high",
      requiresSecondSource: false,
      decisionReason: "official source has season/calendar or fixture/result signals sufficient for season-status validation"
    };
  } else if (official && extractionState === "candidate_season_status_calendar_evidence_needs_validation" && hasSignals && signalScore >= 2) {
    decision = {
      validationState: "season_calendar_validated_from_official_source",
      validationConfidence: "medium",
      requiresSecondSource: false,
      decisionReason: "official governing/operator source has two independent season/calendar or fixture/result signals sufficient for route-surface validation"
    };
  } else if (official && hasSignals) {
    decision = {
      validationState: "season_calendar_candidate_needs_more_specific_evidence",
      validationConfidence: "medium",
      requiresSecondSource: true,
      decisionReason: "official source has season-status signals but evidence is not strong enough for one-source validation"
    };
  } else if (!official && hasSignals) {
    decision = {
      validationState: "season_calendar_candidate_needs_official_confirmation",
      validationConfidence: "medium",
      requiresSecondSource: true,
      decisionReason: "non-official source has season-status signals but needs official confirmation"
    };
  } else {
    decision = {
      validationState: "season_status_needs_more_specific_evidence",
      validationConfidence: "low",
      requiresSecondSource: true,
      decisionReason: "season-status evidence lacks sufficient calendar/activity signals"
    };
  }

  return {
    competitionSlug: asText(row.competitionSlug || row.leagueSlug),
    leagueSlug: asText(row.leagueSlug || row.competitionSlug),
    competitionName: asText(row.competitionName || row.name),
    targetDate: asText(row.targetDate || row.dayKey),
    dayKey: asText(row.dayKey || row.targetDate),
    seasonKey: asText(row.seasonKey),
    evidenceType: "season_status_calendar_evidence",
    evidenceState: extractionState,
    evidenceConfidence: signalScore >= 3 ? "high" : signalScore >= 2 ? "medium" : "low",
    validationState: decision.validationState,
    validationConfidence: decision.validationConfidence,
    requiresSecondSource: decision.requiresSecondSource,
    decisionReason: decision.decisionReason,
    sourceType: asText(row.sourceType),
    fetchPurpose: asText(row.fetchPurpose),
    hostname: asText(row.hostname),
    finalUrl: sourceUrl,
    sourceUrl,
    status,
    signalScore,
    fixturesSignal: row.fixturesSignal === true,
    calendarSignal: row.calendarSignal === true,
    seasonLabelVisible: row.seasonLabelVisible === true,
    restartSignal: row.restartSignal === true,
    noFixtureSignal: row.noFixtureSignal === true,
    officialCompetitionSignal: row.officialCompetitionSignal === true,
    evidenceTextSnippet: asText(row.evidenceTextSnippet),
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildReport(input, inputPath = "") {
  const rows = rowsOf(input);
  const validationRows = rows.map(validateRow);
  const validatedRows = validationRows.filter((row) => row.validationState === "season_calendar_validated_from_official_source");
  const secondSourceRows = validationRows.filter((row) => row.requiresSecondSource === true);

  return {
    ok: true,
    job: "validate-football-truth-season-status-evidence-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    summary: {
      inputEvidenceRowCount: rows.length,
      validationRowCount: validationRows.length,
      validatedOfficialRowCount: validatedRows.length,
      requiresSecondSourceCount: secondSourceRows.length,
      byValidationState: countBy(validationRows, "validationState"),
      byCompetition: countBy(validationRows, "competitionSlug"),
      byHost: countBy(validationRows, "hostname"),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    seasonStatusValidationRows: validationRows,
    validatedSeasonStatusEvidenceRows: validationRows,
    validatedSeasonStatusRows: validatedRows,
    secondSourceRequiredRows: secondSourceRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedEvidenceRows: true,
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

function runSelfTest() {
  const input = {
    seasonStatusEvidenceRows: [
      {
        leagueSlug: "uefa.europa",
        competitionSlug: "uefa.europa",
        competitionName: "UEFA Europa League",
        targetDate: "2026-06-03",
        seasonKey: "2025-2026",
        sourceType: "season_status_official_primary",
        fetchPurpose: "season_activity_status_calendar",
        hostname: "www.uefa.com",
        finalUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        status: 200,
        extractionState: "candidate_season_status_calendar_evidence_needs_validation",
        fixturesSignal: true,
        seasonLabelVisible: true,
        officialCompetitionSignal: true,
        signalScore: 3,
        evidenceTextSnippet: "Fixtures & results UEFA Europa League 2025/26 official competition calendar."
      },
      {
        leagueSlug: "cro.1",
        competitionSlug: "cro.1",
        competitionName: "SuperSport HNL",
        sourceType: "season_status_official_primary",
        sourceClass: "official_governing_or_competition_operator",
        fetchPurpose: "season_activity_status_calendar",
        hostname: "hnl.hr",
        finalUrl: "https://hnl.hr/raspored/",
        extractionState: "candidate_season_status_calendar_evidence_needs_validation",
        fixturesSignal: true,
        officialCompetitionSignal: true,
        signalScore: 2,
        evidenceTextSnippet: "SuperSport HNL Raspored i rezultati Ljestvica official competition route surface."
      },
      {
        leagueSlug: "eng.1",
        competitionSlug: "eng.1",
        competitionName: "Premier League",
        hostname: "example.com",
        status: 200,
        extractionState: "candidate_season_status_calendar_evidence_needs_validation",
        fixturesSignal: true,
        signalScore: 1
      },
      {
        leagueSlug: "test.no-signals",
        competitionSlug: "test.no-signals",
        competitionName: "No Signal League",
        hostname: "example.org",
        status: 200,
        extractionState: "candidate_season_status_calendar_evidence_needs_validation",
        signalScore: 0
      }
    ]
  };

  const report = buildReport(input, "self-test");

  if (report.summary.inputEvidenceRowCount !== 4) throw new Error("expected four input evidence rows");
  if (report.summary.validationRowCount !== 4) throw new Error("expected four validation rows");
  if (report.summary.validatedOfficialRowCount !== 2) throw new Error("expected two official validated season calendar rows");
  if (report.summary.requiresSecondSourceCount !== 2) throw new Error("expected two second-source rows");
  const twoSignalOfficialRow = report.validatedSeasonStatusRows.find((row) => row.leagueSlug === "cro.1");
  if (!twoSignalOfficialRow) throw new Error("missing official two-signal validated row");
  if (twoSignalOfficialRow.validationConfidence !== "medium") throw new Error("expected official two-signal row to validate with medium confidence");
  if (!report.summary.byValidationState.season_calendar_validated_from_official_source) throw new Error("missing official validated state");
  if (!report.summary.byValidationState.season_calendar_candidate_needs_official_confirmation) throw new Error("missing official-confirmation state");
  if (!report.summary.byValidationState.season_status_needs_more_specific_evidence) throw new Error("missing needs-more-specific state");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "validate-football-truth-season-status-evidence-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = buildReport(input, args.input);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport, validateRow };
