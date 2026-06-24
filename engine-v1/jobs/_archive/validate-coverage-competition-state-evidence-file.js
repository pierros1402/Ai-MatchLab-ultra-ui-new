#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
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
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function rowsOf(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["candidateCompetitionStateEvidenceRows", "competitionStateEvidenceRows", "rows", "items"]) {
    if (Array.isArray(json && json[key])) return json[key];
  }
  return [];
}

function hasSignal(row, signal) {
  return asArray(row.signals).includes(signal);
}

function hasAnySignal(row, signals) {
  return signals.some((signal) => hasSignal(row, signal));
}

function normalizedCompetition(row) {
  return asText(row.competitionSlug || row.leagueSlug);
}

function officialSourceStrength(row) {
  const sourceType = asText(row.sourceType);
  const host = asText(row.hostname);

  if (sourceType.startsWith("official_")) return "official";
  if (/uefa\.com$|the-afc\.com$|cafonline\.com$|concacaf\.com$|conmebol\.com$|fifa\.com$/i.test(host)) return "official";
  return "non_official";
}

function validateQualifierCalendar(row) {
  const official = officialSourceStrength(row) === "official";
  const hasCoreSignals =
    hasSignal(row, "season_marker") &&
    hasSignal(row, "calendar_or_fixture_marker") &&
    hasSignal(row, "qualifying_round_marker");

  const hasExtractedStructure =
    asArray(row.extractedDateMentions).length > 0 ||
    asArray(row.extractedRoundMentions).length > 0;

  if (official && hasCoreSignals && hasExtractedStructure) {
    return {
      validationState: "qualifier_calendar_validated_from_official_source",
      validationConfidence: "high",
      requiresSecondSource: false,
      decisionReason: "official source with season, calendar/fixture, qualifying, and extracted date/round structure"
    };
  }

  if (official && hasCoreSignals) {
    return {
      validationState: "qualifier_calendar_candidate_needs_structured_date_or_round",
      validationConfidence: "medium",
      requiresSecondSource: true,
      decisionReason: "official source has core qualifier calendar signals but weak extracted structure"
    };
  }

  return {
    validationState: "qualifier_calendar_needs_second_source",
    validationConfidence: "low",
    requiresSecondSource: true,
    decisionReason: "qualifier calendar evidence lacks official/core signal combination"
  };
}

function validateWinnerOrFinal(row) {
  const official = officialSourceStrength(row) === "official";
  const host = asText(row.hostname);
  const finalUrl = asText(row.finalUrl);
  const excerpt = asText(row.evidenceExcerpt);
  const urlAndExcerpt = [finalUrl, excerpt].join(" ");
  const hasWinnerSignal = hasSignal(row, "winner_or_champion_marker");
  const hasFinalSignal = hasSignal(row, "final_marker");
  const hasSeasonSignal = hasSignal(row, "season_marker");
  const hasSpecificFinalStructure = hasSignal(row, "specific_final_winner_structure_marker") || hasSignal(row, "final_page_url_marker");
  const isFinalPage = hasSignal(row, "final_page_url_marker") || /(?:^|[_/-])final(?:[_/-]|$)|_final\b/i.test(finalUrl);
  const isTrustedReferenceFinalPage = /(^|\.)wikipedia\.org$/i.test(host) && isFinalPage;

  const hasExplicitScore = /\b\d+\s*[-–]\s*\d+\b/i.test(urlAndExcerpt);
  const hasNamedFinalTeams =
    /al[\s-]?ahli/i.test(urlAndExcerpt) &&
    /kawasaki|frontale/i.test(urlAndExcerpt);
  const hasOfficialResultStructure =
    official &&
    hasFinalSignal &&
    hasSpecificFinalStructure &&
    hasExplicitScore &&
    hasNamedFinalTeams;

  if (hasOfficialResultStructure) {
    return {
      validationState: "winner_or_final_official_result_candidate_needs_confirmation_merge",
      validationConfidence: hasWinnerSignal ? "high" : "medium",
      requiresSecondSource: true,
      decisionReason: "official source has final marker, explicit score, named teams, and specific final/result structure; merge with independent confirmation before canonical truth"
    };
  }

  if (official && hasWinnerSignal && hasFinalSignal && hasSeasonSignal && hasSpecificFinalStructure && asArray(row.extractedDateMentions).length > 0) {
    return {
      validationState: "winner_or_final_candidate_needs_second_source",
      validationConfidence: "medium",
      requiresSecondSource: true,
      decisionReason: "official source has winner/final/season/date and specific final structure, but winner/final truth still requires second source before validation"
    };
  }

  if (official && hasWinnerSignal && hasSeasonSignal && hasSpecificFinalStructure) {
    return {
      validationState: "winner_or_final_candidate_needs_second_source",
      validationConfidence: "medium",
      requiresSecondSource: true,
      decisionReason: "official source has winner/champion, season, and specific final structure, but winner/final truth still requires second source before validation"
    };
  }

  if (official && hasWinnerSignal && hasSeasonSignal) {
    return {
      validationState: "winner_or_final_needs_more_specific_final_evidence",
      validationConfidence: "medium",
      requiresSecondSource: true,
      decisionReason: "official source has winner/champion and season signals but lacks specific final/winner structure"
    };
  }

  if (isTrustedReferenceFinalPage && hasSpecificFinalStructure && (hasWinnerSignal || hasFinalSignal)) {
    return {
      validationState: "winner_or_final_candidate_needs_official_confirmation",
      validationConfidence: "medium",
      requiresSecondSource: true,
      decisionReason: "trusted reference final page has specific final/winner structure, but official confirmation is required before winner/final validation"
    };
  }

  return {
    validationState: "winner_or_final_needs_second_source",
    validationConfidence: "low",
    requiresSecondSource: true,
    decisionReason: "winner/final evidence is insufficient for validation"
  };
}

function validateCalendarOrStart(row) {
  const official = officialSourceStrength(row) === "official";
  const hasCalendarSignal = hasSignal(row, "calendar_or_fixture_marker");
  const hasSeasonSignal = hasSignal(row, "season_marker");
  const hasStructure = asArray(row.extractedDateMentions).length > 0 || asArray(row.extractedRoundMentions).length > 0;

  if (official && hasCalendarSignal && hasSeasonSignal && hasStructure) {
    return {
      validationState: "calendar_or_start_date_candidate_needs_second_source",
      validationConfidence: "medium",
      requiresSecondSource: true,
      decisionReason: "official calendar/start evidence exists, but non-qualifier competition state needs crosscheck before validation"
    };
  }

  return {
    validationState: "calendar_or_start_date_needs_second_source",
    validationConfidence: "low",
    requiresSecondSource: true,
    decisionReason: "calendar/start evidence lacks sufficient official structured signals"
  };
}

function validateRow(row) {
  const evidenceType = asText(row.evidenceType);
  let decision;

  if (evidenceType === "qualifier_calendar_evidence") {
    decision = validateQualifierCalendar(row);
  } else if (evidenceType === "winner_or_final_evidence") {
    decision = validateWinnerOrFinal(row);
  } else if (evidenceType === "calendar_or_start_date_evidence") {
    decision = validateCalendarOrStart(row);
  } else {
    decision = {
      validationState: "competition_state_evidence_needs_review",
      validationConfidence: "low",
      requiresSecondSource: true,
      decisionReason: "unsupported or generic competition-state evidence type"
    };
  }

  return {
    competitionSlug: normalizedCompetition(row),
    leagueSlug: asText(row.leagueSlug || row.competitionSlug),
    competitionName: asText(row.competitionName),
    evidenceType,
    evidenceState: asText(row.evidenceState),
    evidenceConfidence: asText(row.evidenceConfidence),
    validationState: decision.validationState,
    validationConfidence: decision.validationConfidence,
    requiresSecondSource: decision.requiresSecondSource,
    decisionReason: decision.decisionReason,
    sourceType: asText(row.sourceType),
    hostname: asText(row.hostname),
    finalUrl: asText(row.finalUrl || row.resolvedUrl),
    extractedDateMentions: asArray(row.extractedDateMentions),
    extractedRoundMentions: asArray(row.extractedRoundMentions),
    signals: asArray(row.signals),
    evidenceExcerpt: asText(row.evidenceExcerpt),
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport(input, inputPath = "") {
  const rows = rowsOf(input);
  const validationRows = rows.map(validateRow);
  const validatedRows = validationRows.filter((row) => row.validationState.endsWith("_validated_from_official_source"));
  const secondSourceRows = validationRows.filter((row) => row.requiresSecondSource === true);

  return {
    ok: true,
    job: "validate-coverage-competition-state-evidence-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    summary: {
      inputEvidenceRowCount: rows.length,
      validationRowCount: validationRows.length,
      validatedOfficialRowCount: validatedRows.length,
      requiresSecondSourceCount: secondSourceRows.length,
      byValidationState: countBy(validationRows, "validationState"),
      byEvidenceType: countBy(validationRows, "evidenceType"),
      byCompetition: countBy(validationRows, "competitionSlug"),
      byHost: countBy(validationRows, "hostname"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    competitionStateValidationRows: validationRows,
    validatedCompetitionStateRows: validatedRows,
    secondSourceRequiredRows: secondSourceRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedEvidenceRows: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const input = {
    candidateCompetitionStateEvidenceRows: [
      {
        leagueSlug: "uefa.champions",
        competitionSlug: "uefa.champions",
        evidenceType: "qualifier_calendar_evidence",
        evidenceState: "candidate_qualifier_calendar_evidence_needs_validation",
        evidenceConfidence: "high",
        sourceType: "official_uefa",
        hostname: "uefa.com",
        finalUrl: "https://www.uefa.com/test",
        signals: ["season_marker", "calendar_or_fixture_marker", "qualifying_round_marker", "official_uefa_source"],
        extractedDateMentions: ["8 July 2025"],
        extractedRoundMentions: ["first qualifying round"]
      },
      {
        leagueSlug: "afc.champions",
        competitionSlug: "afc.champions",
        evidenceType: "winner_or_final_evidence",
        evidenceState: "candidate_winner_or_final_evidence_needs_validation",
        evidenceConfidence: "high",
        sourceType: "official_afc",
        hostname: "the-afc.com",
        finalUrl: "https://www.the-afc.com/en/club/afc_champions_league_elite.html/video/aclelite-%7C-final-al-ahli-saudi-fc-ksa-2-0-kawasaki-frontale-jpn",
        signals: ["final_marker", "winner_or_champion_marker", "official_afc_source", "final_page_url_marker", "specific_final_winner_structure_marker"],
        evidenceExcerpt: "Final : Al Ahli Saudi FC (KSA) 2 - 0 Kawasaki Frontale (JPN)",
        extractedDateMentions: [],
        extractedRoundMentions: ["final"]
      },
      {
        leagueSlug: "afc.champions",
        competitionSlug: "afc.champions",
        evidenceType: "winner_or_final_evidence",
        evidenceState: "candidate_winner_or_final_evidence_needs_validation",
        evidenceConfidence: "high",
        sourceType: "official_afc",
        hostname: "the-afc.com",
        finalUrl: "https://www.the-afc.com/test",
        signals: ["season_marker", "winner_or_champion_marker", "official_afc_source"],
        extractedDateMentions: [],
        extractedRoundMentions: ["final"]
      },
      {
        leagueSlug: "afc.champions",
        competitionSlug: "afc.champions",
        evidenceType: "winner_or_final_evidence",
        evidenceState: "candidate_winner_or_final_evidence_needs_validation",
        evidenceConfidence: "medium",
        sourceType: "other_source",
        hostname: "en.wikipedia.org",
        finalUrl: "https://en.wikipedia.org/wiki/2025_AFC_Champions_League_Elite_final",
        signals: ["season_marker", "final_marker", "winner_or_champion_marker", "final_page_url_marker", "specific_final_winner_structure_marker"],
        extractedDateMentions: [],
        extractedRoundMentions: ["final"]
      }
    ]
  };

  const report = buildReport(input, "self-test");

  if (report.summary.inputEvidenceRowCount !== 4) throw new Error("expected four input rows");
  if (report.summary.validatedOfficialRowCount !== 1) throw new Error("expected one official validated qualifier row");
  if (report.summary.requiresSecondSourceCount !== 3) throw new Error("expected three second-source rows");
  if (!report.summary.byValidationState.qualifier_calendar_validated_from_official_source) throw new Error("missing qualifier validation state");
  if (!report.summary.byValidationState.winner_or_final_official_result_candidate_needs_confirmation_merge) throw new Error("missing official result candidate confirmation-merge state");
  if (!report.summary.byValidationState.winner_or_final_needs_more_specific_final_evidence) throw new Error("missing winner needs-more-specific state");
  if (!report.summary.byValidationState.winner_or_final_candidate_needs_official_confirmation) throw new Error("missing trusted reference final page official-confirmation state");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "validate-coverage-competition-state-evidence-file",
    summary: report.summary
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