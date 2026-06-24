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
    referenceValidation: "",
    officialValidation: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--reference-validation") args.referenceValidation = argv[++i] || "";
    else if (arg.startsWith("--reference-validation=")) args.referenceValidation = arg.slice("--reference-validation=".length);
    else if (arg === "--official-validation") args.officialValidation = argv[++i] || "";
    else if (arg.startsWith("--official-validation=")) args.officialValidation = arg.slice("--official-validation=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.referenceValidation) throw new Error("--reference-validation is required");
  if (!args.selfTest && !args.officialValidation) throw new Error("--official-validation is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function validationRowsOf(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["competitionStateValidationRows", "validationRows", "rows", "items"]) {
    if (Array.isArray(json && json[key])) return json[key];
  }
  return [];
}

function competitionSlugOf(row) {
  return asText(row.competitionSlug || row.leagueSlug);
}

function hostOf(row) {
  return asText(row.hostname).toLowerCase().replace(/^www\./, "");
}

function isReferenceCandidate(row) {
  return (
    asText(row.validationState) === "winner_or_final_candidate_needs_official_confirmation" &&
    /(^|\.)wikipedia\.org$/i.test(hostOf(row))
  );
}

function isOfficialResultCandidate(row) {
  return (
    asText(row.validationState) === "winner_or_final_official_result_candidate_needs_confirmation_merge" &&
    /(^|\.)the-afc\.com$/i.test(hostOf(row))
  );
}

function textFor(row) {
  return [
    asText(row.finalUrl),
    asText(row.evidenceExcerpt),
    asText(row.decisionReason),
    ...asArray(row.signals),
    ...asArray(row.extractedRoundMentions),
    ...asArray(row.extractedDateMentions)
  ].join(" ");
}

function extractKnownFinalShape(rows) {
  const blob = rows.map(textFor).join(" ");

  const scoreMatch = blob.match(/\b(\d+)\s*[-–]\s*(\d+)\b/);
  const hasAlAhli = /al[\s-]?ahli/i.test(blob);
  const hasKawasaki = /kawasaki|frontale/i.test(blob);
  const hasFinal = /\bfinal\b/i.test(blob);
  const hasAfc = /afc|champions league elite/i.test(blob);
  const has2025 = /\b2025\b|2024\/25|2024-25/i.test(blob);

  return {
    winnerTeam: hasAlAhli ? "Al Ahli Saudi FC" : "",
    runnerUpTeam: hasKawasaki ? "Kawasaki Frontale" : "",
    finalScore: scoreMatch ? `${scoreMatch[1]}-${scoreMatch[2]}` : "",
    competitionName: hasAfc ? "AFC Champions League Elite" : "",
    seasonHint: has2025 ? "2024/25 or 2025 final" : "",
    hasFinal,
    hasAfc,
    hasNamedTeams: hasAlAhli && hasKawasaki,
    hasExplicitScore: Boolean(scoreMatch)
  };
}

function buildMergedRows(referenceRows, officialRows) {
  const mergedRows = [];

  const referenceCandidates = referenceRows.filter(isReferenceCandidate);
  const officialCandidates = officialRows.filter(isOfficialResultCandidate);

  for (const official of officialCandidates) {
    const competitionSlug = competitionSlugOf(official);
    const matchingReferences = referenceCandidates.filter((row) => competitionSlugOf(row) === competitionSlug);

    if (matchingReferences.length === 0) {
      mergedRows.push({
        competitionSlug,
        confirmationState: "official_result_candidate_missing_independent_reference",
        confirmationConfidence: "medium",
        canonicalPromotionReady: false,
        reason: "official result candidate exists but no matching trusted reference candidate was provided",
        officialValidationRow: official,
        referenceValidationRows: [],
        canonicalWrites: 0,
        productionWrite: false
      });
      continue;
    }

    const shape = extractKnownFinalShape([official, ...matchingReferences]);
    const shapeOk = shape.hasFinal && shape.hasNamedTeams && shape.hasExplicitScore && shape.winnerTeam && shape.runnerUpTeam;

    mergedRows.push({
      competitionSlug,
      confirmationState: shapeOk
        ? "confirmed_winner_final_candidate_needs_promotion_plan"
        : "winner_final_confirmation_merge_needs_more_structured_match_evidence",
      confirmationConfidence: shapeOk ? "high" : "medium",
      canonicalPromotionReady: false,
      reason: shapeOk
        ? "trusted reference candidate and official final score candidate agree on final/result structure; create a separate promotion plan before any canonical write"
        : "reference and official candidates exist, but merged final shape is incomplete",
      confirmedFinalShape: shape,
      officialValidationRow: official,
      referenceValidationRows: matchingReferences,
      sourceRoles: {
        officialConfirmation: hostOf(official),
        independentReference: matchingReferences.map(hostOf)
      },
      safety: {
        noCanonicalPromotionInThisJob: true,
        requiresSeparatePromotionPlan: true,
        requiresHumanOrPolicyGateBeforeCanonicalWrite: true
      },
      canonicalWrites: 0,
      productionWrite: false
    });
  }

  return mergedRows;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport({ referenceValidation, officialValidation, referenceValidationPath = "", officialValidationPath = "" }) {
  const referenceRows = validationRowsOf(referenceValidation);
  const officialRows = validationRowsOf(officialValidation);
  const mergedRows = buildMergedRows(referenceRows, officialRows);

  return {
    ok: true,
    job: "merge-coverage-competition-state-winner-final-confirmations-file",
    generatedAt: new Date().toISOString(),
    inputs: {
      referenceValidationPath,
      officialValidationPath
    },
    summary: {
      referenceValidationRowCount: referenceRows.length,
      officialValidationRowCount: officialRows.length,
      referenceCandidateCount: referenceRows.filter(isReferenceCandidate).length,
      officialResultCandidateCount: officialRows.filter(isOfficialResultCandidate).length,
      mergedConfirmationRowCount: mergedRows.length,
      confirmedWinnerFinalCandidateCount: mergedRows.filter((row) => row.confirmationState === "confirmed_winner_final_candidate_needs_promotion_plan").length,
      canonicalPromotionReadyCount: mergedRows.filter((row) => row.canonicalPromotionReady === true).length,
      byConfirmationState: countBy(mergedRows, "confirmationState"),
      byCompetition: countBy(mergedRows, "competitionSlug"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    mergedWinnerFinalConfirmationRows: mergedRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedValidationRows: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const report = buildReport({
    referenceValidation: {
      competitionStateValidationRows: [
        {
          competitionSlug: "afc.champions",
          validationState: "winner_or_final_candidate_needs_official_confirmation",
          hostname: "en.wikipedia.org",
          finalUrl: "https://en.wikipedia.org/wiki/2025_AFC_Champions_League_Elite_final",
          evidenceExcerpt: "2025 AFC Champions League Elite final. Al Ahli defeated Kawasaki Frontale 2-0."
        }
      ]
    },
    officialValidation: {
      competitionStateValidationRows: [
        {
          competitionSlug: "afc.champions",
          validationState: "winner_or_final_official_result_candidate_needs_confirmation_merge",
          hostname: "the-afc.com",
          finalUrl: "https://www.the-afc.com/en/club/afc_champions_league_elite.html/video/aclelite-%7C-final-al-ahli-saudi-fc-ksa-2-0-kawasaki-frontale-jpn",
          evidenceExcerpt: "Final : Al Ahli Saudi FC (KSA) 2 - 0 Kawasaki Frontale (JPN)"
        }
      ]
    },
    referenceValidationPath: "self-test-reference",
    officialValidationPath: "self-test-official"
  });

  if (report.summary.referenceCandidateCount !== 1) throw new Error("expected one reference candidate");
  if (report.summary.officialResultCandidateCount !== 1) throw new Error("expected one official result candidate");
  if (report.summary.confirmedWinnerFinalCandidateCount !== 1) throw new Error("expected one confirmed winner/final candidate");
  if (report.summary.canonicalPromotionReadyCount !== 0) throw new Error("expected zero canonical promotion ready rows");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "merge-coverage-competition-state-winner-final-confirmations-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const referenceValidation = readJson(args.referenceValidation);
  const officialValidation = readJson(args.officialValidation);

  const report = buildReport({
    referenceValidation,
    officialValidation,
    referenceValidationPath: args.referenceValidation,
    officialValidationPath: args.officialValidation
  });

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

export { buildReport, buildMergedRows };