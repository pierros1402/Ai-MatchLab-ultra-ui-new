import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const validationPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-extraction-validation-${today}`,
  `official-host-extraction-validation-${today}.json`
);

const validationRowsPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-extraction-validation-${today}`,
  `official-host-extraction-validation-rows-${today}.jsonl`
);

const inspectionPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-proof-inspection-${today}`,
  `official-host-proof-inspection-${today}.json`
);

const outputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `extraction-validation-failure-root-cause-board-${today}`
);

const outputPath = path.join(outputDir, `extraction-validation-failure-root-cause-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `extraction-validation-failure-root-cause-board-rows-${today}.jsonl`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function classify(row) {
  const summaries = Array.isArray(row.candidateSummaries) ? row.candidateSummaries : [];
  const bestSummary = summaries[0] || {};
  const expectedRows = row.expectedRows;
  const extracted = row.bestExtractedRowCount || bestSummary.parsedRowCount || 0;
  const pointsPass = row.bestPointsArithmeticPassCount || bestSummary.pointsArithmeticPassCount || 0;
  const playedPass = row.bestPlayedArithmeticPassCount || bestSummary.playedArithmeticPassCount || 0;
  const teamSignals = row.bestTeamSignalCount || bestSummary.teamSignalCount || 0;
  const title = row.title || "";
  const url = row.finalUrl || row.candidateUrl || "";

  let rootCause = "unknown_failure";
  let recommendedLane = "manual_review_low_priority";
  let reusableFamilyCandidate = false;
  let priority = 99;
  const signals = [];

  if (row.bestValidationPassed === true) {
    rootCause = "validated";
    recommendedLane = "proof_candidate_board_after_explicit_approval_gate";
    reusableFamilyCandidate = true;
    priority = 1;
    signals.push("validation_passed");
  } else if (row.extractionMode === "html_table" && expectedRows && extracted > expectedRows && pointsPass >= expectedRows) {
    rootCause = "parser_overextracts_multiple_tables_or_groups";
    recommendedLane = "family_parser_tightening";
    reusableFamilyCandidate = true;
    priority = 2;
    signals.push("overextracts_but_arithmetic_present");
  } else if (row.extractionMode === "html_table" && expectedRows && extracted < expectedRows && extracted >= Math.ceil(expectedRows * 0.5)) {
    rootCause = "parser_underextracts_team_name_or_table_shape";
    recommendedLane = "family_parser_tightening";
    reusableFamilyCandidate = true;
    priority = 3;
    signals.push("partial_rows_present");
  } else if (row.extractionMode === "html_table" && expectedRows && extracted === expectedRows && pointsPass < Math.ceil(expectedRows * 0.6)) {
    rootCause = "column_mapping_or_points_parser_failure";
    recommendedLane = "family_parser_tightening";
    reusableFamilyCandidate = true;
    priority = 3;
    signals.push("row_count_ok_but_arithmetic_fails");
  } else if (row.extractionMode === "json" && row.candidateTableOrArrayCount > 0 && extracted > 0) {
    rootCause = "json_key_mapping_failure_or_current_scope";
    recommendedLane = "json_family_key_mapper";
    reusableFamilyCandidate = true;
    priority = 4;
    signals.push("json_arrays_present");
  } else if (row.extractionMode === "html_table" && row.candidateTableOrArrayCount > 0 && extracted === 0) {
    rootCause = "table_present_but_parser_no_rows";
    recommendedLane = "family_parser_tightening";
    reusableFamilyCandidate = true;
    priority = 4;
    signals.push("tables_present_no_parsed_rows");
  } else if (/women/i.test(title) || /women/i.test(url)) {
    rootCause = "wrong_gender_route";
    recommendedLane = "park_wrong_competition_identity";
    priority = 90;
    signals.push("gender_mismatch");
  } else {
    rootCause = "route_or_render_not_ready";
    recommendedLane = "browser_render_or_endpoint_followup";
    priority = 5;
    signals.push("needs_render_or_endpoint");
  }

  const familyKey = row.slug?.startsWith("aut.") ? "austria_bundesliga_next_table_family"
    : row.slug === "mex.1" ? "ligamx_html_stats_family"
    : row.slug === "aus.1" ? "aleagues_ladder_family"
    : row.slug === "nor.1" ? "ntf_eliteserien_table_family"
    : row.slug === "kor.1" ? "kleague_rank_api_family"
    : "unclassified_family";

  return {
    rootCause,
    recommendedLane,
    reusableFamilyCandidate,
    familyKey,
    priority,
    signals
  };
}

await fs.mkdir(outputDir, { recursive: true });

const validation = JSON.parse(await fs.readFile(validationPath, "utf8"));
const inspection = JSON.parse(await fs.readFile(inspectionPath, "utf8"));
const rows = parseJsonl(await fs.readFile(validationRowsPath, "utf8"));

const boardRows = rows.map(row => {
  const c = classify(row);
  return {
    slug: row.slug,
    sourceLeague: row.sourceLeague,
    candidateUrl: row.finalUrl || row.candidateUrl,
    extractionMode: row.extractionMode,
    status: row.status,
    title: row.title,
    expectedRows: row.expectedRows,
    bestExtractedRowCount: row.bestExtractedRowCount,
    bestSeasonLabel: row.bestSeasonLabel,
    bestRowCountPass: row.bestRowCountPass,
    bestTeamSignalCount: row.bestTeamSignalCount,
    bestTeamSignalPass: row.bestTeamSignalPass,
    bestPlayedArithmeticPassCount: row.bestPlayedArithmeticPassCount,
    bestPointsArithmeticPassCount: row.bestPointsArithmeticPassCount,
    bestGdArithmeticPassCount: row.bestGdArithmeticPassCount,
    bestValidationPassed: row.bestValidationPassed,
    candidateTableOrArrayCount: row.candidateTableOrArrayCount,
    candidateSummariesPreview: (row.candidateSummaries || []).slice(0, 3),
    acceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true,
    ...c
  };
}).sort((a, b) => a.priority - b.priority || a.slug.localeCompare(b.slug) || a.candidateUrl.localeCompare(b.candidateUrl));

const byFamily = {};
for (const familyKey of [...new Set(boardRows.map(row => row.familyKey))].sort()) {
  const familyRows = boardRows.filter(row => row.familyKey === familyKey);
  byFamily[familyKey] = {
    rowCount: familyRows.length,
    slugCount: new Set(familyRows.map(row => row.slug)).size,
    validatedCount: familyRows.filter(row => row.rootCause === "validated").length,
    reusableRepairCandidateCount: familyRows.filter(row => row.reusableFamilyCandidate).length,
    recommendedLanes: [...new Set(familyRows.map(row => row.recommendedLane))],
    slugs: [...new Set(familyRows.map(row => row.slug))],
    topRows: familyRows.slice(0, 8).map(row => ({
      slug: row.slug,
      rootCause: row.rootCause,
      recommendedLane: row.recommendedLane,
      candidateUrl: row.candidateUrl,
      expectedRows: row.expectedRows,
      bestExtractedRowCount: row.bestExtractedRowCount,
      bestPointsArithmeticPassCount: row.bestPointsArithmeticPassCount,
      bestTeamSignalCount: row.bestTeamSignalCount,
      bestValidationPassed: row.bestValidationPassed
    }))
  };
}

const reusableRepairFamilies = Object.entries(byFamily)
  .filter(([, value]) => value.reusableRepairCandidateCount > 0)
  .map(([familyKey, value]) => ({
    familyKey,
    rowCount: value.rowCount,
    slugCount: value.slugCount,
    validatedCount: value.validatedCount,
    reusableRepairCandidateCount: value.reusableRepairCandidateCount,
    recommendedLanes: value.recommendedLanes,
    slugs: value.slugs
  }))
  .sort((a, b) => b.reusableRepairCandidateCount - a.reusableRepairCandidateCount || a.familyKey.localeCompare(b.familyKey));

const report = {
  status: "passed",
  runner: "extraction_validation_failure_root_cause_board",
  contractVersion: 1,
  purpose: "Classify exact extraction validation results into reusable family repairs versus parks. No fetch/search/canonical/truth/production writes.",
  inputValidationPath: path.relative(root, validationPath).replaceAll("\\", "/"),
  inputValidationRowsPath: path.relative(root, validationRowsPath).replaceAll("\\", "/"),
  inputInspectionPath: path.relative(root, inspectionPath).replaceAll("\\", "/"),
  inputValidationSha256: await sha256(validationPath),
  inputValidationRowsSha256: await sha256(validationRowsPath),
  inputInspectionSha256: await sha256(inspectionPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  sourceValidationSummary: validation.summary,
  sourceInspectionSummary: {
    inspectedTargetCount: inspection.summary.inspectedTargetCount,
    nextExtractionTargetCount: inspection.summary.nextExtractionTargets?.length || 0,
    nextExtractionSlugs: [...new Set((inspection.summary.nextExtractionTargets || []).map(row => row.slug))]
  },
  summary: {
    inputValidationRowCount: rows.length,
    boardRowCount: boardRows.length,
    validatedRowCount: boardRows.filter(row => row.rootCause === "validated").length,
    validatedSlugCount: new Set(boardRows.filter(row => row.rootCause === "validated").map(row => row.slug)).size,
    reusableFamilyCandidateRowCount: boardRows.filter(row => row.reusableFamilyCandidate).length,
    reusableRepairFamilyCount: reusableRepairFamilies.length,
    parkedWrongIdentityCount: boardRows.filter(row => row.rootCause === "wrong_gender_route").length,
    needsRenderOrEndpointCount: boardRows.filter(row => row.rootCause === "route_or_render_not_ready").length,
    reusableRepairFamilies,
    recommendedNextLane: "Stop broad per-site probing. Build reusable family repair/extractor lanes from this board, starting with austria_bundesliga_next_table_family, then ntf_eliteserien_table_family / kleague_rank_api_family only if family-level reuse exists.",
    acceptedNowCount: 0
  },
  byFamily
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, boardRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary
}, null, 2));
