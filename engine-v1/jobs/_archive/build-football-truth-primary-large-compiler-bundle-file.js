#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/master-compiler-lane-quality-gate-2026-06-14/master-compiler-lane-quality-gate-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/primary-large-compiler-bundle-2026-06-14/primary-large-compiler-bundle-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;

const PRIMARY_LANES = [
  "source_authority_template_compiler_lane",
  "existing_signal_truth_review_compiler_lane"
];

const EXPECTED = {
  source_authority_template_compiler_lane: {
    competitions: 372,
    groupingRows: 193,
    gateStatus: "passed_ready_for_large_source_authority_template_compiler"
  },
  existing_signal_truth_review_compiler_lane: {
    competitions: 101,
    groupingRows: 80,
    gateStatus: "passed_ready_for_large_existing_signal_truth_review_compiler"
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function uniqueSorted(values) {
  return [...new Set(
    values
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error(`Missing summary key: ${key}`);
  if (summary[key] !== expected) {
    throw new Error(`Guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function prefixRegion(prefix) {
  const europe = new Set([
    "alb","and","arm","aut","aze","bel","bih","blr","bul","cro","cyp","cze","den","eng","esp","est",
    "fin","fra","fro","geo","ger","gib","gre","hun","irl","isl","isr","ita","kaz","kos","lie","ltu",
    "lux","lva","mda","mkd","mlt","mne","ned","nir","nor","pol","por","rou","rus","sco","smr","srb",
    "sui","svk","svn","swe","tur","ukr","wal"
  ]);

  const americas = new Set([
    "arg","aru","atg","bah","ber","blz","bol","bra","brb","can","cay","chi","col","crc","cub","cuw",
    "dma","dom","ecu","grn","gua","guy","hai","hon","jam","mex","nca","pan","par","per","pur","skn",
    "slv","sur","tca","tri","uru","usa","ven","vgb","vir"
  ]);

  const africa = new Set([
    "alg","ang","bdi","ben","bfa","bot","caf","cam","cgo","cha","civ","cmr","cod","com","cpv","cta",
    "dji","egy","eqg","eri","eth","gab","gam","gha","gnb","gui","ken","lbr","lby","les","mad","mar",
    "mli","moz","mri","mtn","mwi","nam","nga","nig","rsa","rwa","sen","sey","sle","som","ssd","stp",
    "sud","swz","tan","tog","tun","uga","zam","zim"
  ]);

  const asia = new Set([
    "afg","ban","bhr","bhu","bru","chn","hkg","idn","ind","irn","irq","jor","jpn","kgz","kor","ksa",
    "kuw","lao","lib","mac","mdv","mng","mya","mys","nep","oma","pak","phi","ple","prk","qat","sgp",
    "sri","syr","tha","tjk","tkm","tls","tpe","uae","uzb","vie","yem"
  ]);

  const oceania = new Set([
    "asa","aus","cok","fij","gum","ncl","nzl","ofc","png","sam","sol","tah","tga","van"
  ]);

  if (europe.has(prefix)) return "europe";
  if (americas.has(prefix)) return "americas";
  if (africa.has(prefix)) return "africa";
  if (asia.has(prefix)) return "asia";
  if (oceania.has(prefix)) return "oceania";
  if (prefix === "afc") return "continental_asia";
  return "unknown_region";
}

function assertCompilerRowGuardrails(row, lane) {
  const key = row.compilerGroupingKey || "__missing_grouping_key__";

  if (row.sourceOnly !== true) throw new Error(`${lane}/${key}: sourceOnly must be true`);
  if (row.fetchAllowedNow !== false) throw new Error(`${lane}/${key}: fetchAllowedNow must be false`);
  if (row.searchAllowedNow !== false) throw new Error(`${lane}/${key}: searchAllowedNow must be false`);
  if (row.broadSearchAllowedNow !== false) throw new Error(`${lane}/${key}: broadSearchAllowedNow must be false`);
  if (row.zeroResultMayImplyAbsence !== false) throw new Error(`${lane}/${key}: zeroResultMayImplyAbsence must be false`);
  if (row.canonicalWriteEligibleNow !== false) throw new Error(`${lane}/${key}: canonicalWriteEligibleNow must be false`);
  if (row.productionWrite !== false) throw new Error(`${lane}/${key}: productionWrite must be false`);
  if (row.truthAssertionsAllowedNow !== false) throw new Error(`${lane}/${key}: truthAssertionsAllowedNow must be false`);
  if (row.activeAssertedNow !== false) throw new Error(`${lane}/${key}: activeAssertedNow must be false`);
  if (row.inactiveAssertedNow !== false) throw new Error(`${lane}/${key}: inactiveAssertedNow must be false`);
  if (row.completedAssertedNow !== false) throw new Error(`${lane}/${key}: completedAssertedNow must be false`);

  if (!Array.isArray(row.competitionSlugs) || row.competitionSlugs.length < 1) {
    throw new Error(`${lane}/${key}: competitionSlugs must be non-empty`);
  }
}

function buildSourceAuthorityCompiledRows(compilerRows) {
  return compilerRows.map((row) => {
    assertCompilerRowGuardrails(row, "source_authority_template_compiler_lane");

    const slugPrefixes = uniqueSorted(row.slugPrefixes || []);
    const regions = uniqueSorted(slugPrefixes.map(prefixRegion));
    const competitionSlugs = uniqueSorted(row.competitionSlugs || []);

    return {
      primaryCompilerLane: "source_authority_template_compiler_lane",
      compilerGroupingKey: row.compilerGroupingKey,
      sourceAuthorityTemplateKey: `source_authority_template::${slugPrefixes.join("_") || "unknown"}`,
      sourceAuthorityTemplateStatus: "compiled_template_requirements_no_discovery_execution",
      competitionCount: competitionSlugs.length,
      competitionSlugs,
      slugPrefixes,
      regions,
      requiredEvidenceRoles: uniqueSorted(row.requiredEvidenceRoles || []),
      requiredTemplateSections: [
        "competition_identity",
        "official_or_high_trust_source_authority",
        "fixture_route_candidate",
        "standings_route_candidate",
        "season_state_route_candidate",
        "restart_or_start_date_policy_for_completed_inactive_near_finish",
        "search_health_gate_before_any_controlled_discovery",
        "zero_result_not_absence"
      ],
      nextSourceOnlyAction: "prepare_source_authority_template_candidate_matrix_no_fetch_no_search",
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      truthAssertionsAllowedNow: false,
      activeAssertedNow: false,
      inactiveAssertedNow: false,
      completedAssertedNow: false
    };
  }).sort((a, b) => {
    if (a.regions.join(",") !== b.regions.join(",")) return a.regions.join(",").localeCompare(b.regions.join(","));
    if (a.slugPrefixes.join(",") !== b.slugPrefixes.join(",")) return a.slugPrefixes.join(",").localeCompare(b.slugPrefixes.join(","));
    return a.compilerGroupingKey.localeCompare(b.compilerGroupingKey);
  });
}

function buildExistingSignalCompiledRows(compilerRows) {
  return compilerRows.map((row) => {
    assertCompilerRowGuardrails(row, "existing_signal_truth_review_compiler_lane");

    const slugPrefixes = uniqueSorted(row.slugPrefixes || []);
    const regions = uniqueSorted(slugPrefixes.map(prefixRegion));
    const competitionSlugs = uniqueSorted(row.competitionSlugs || []);

    return {
      primaryCompilerLane: "existing_signal_truth_review_compiler_lane",
      compilerGroupingKey: row.compilerGroupingKey,
      existingSignalReviewKey: `existing_signal_truth_review::${slugPrefixes.join("_") || "unknown"}`,
      existingSignalReviewStatus: "compiled_truth_review_requirements_no_truth_assertion",
      competitionCount: competitionSlugs.length,
      competitionSlugs,
      slugPrefixes,
      regions,
      requiredEvidenceRoles: uniqueSorted(row.requiredEvidenceRoles || []),
      requiredReviewSections: [
        "existing_signal_source_trace",
        "route_evidence_trace",
        "fixture_or_result_signal_trace",
        "standings_signal_trace",
        "season_state_signal_trace",
        "truth_gap_classification",
        "canonical_write_gate_status",
        "restart_or_start_date_need_when_completed_inactive_near_finish"
      ],
      nextSourceOnlyAction: "prepare_existing_signal_truth_gap_matrix_no_fetch_no_search",
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      truthAssertionsAllowedNow: false,
      activeAssertedNow: false,
      inactiveAssertedNow: false,
      completedAssertedNow: false
    };
  }).sort((a, b) => {
    if (a.regions.join(",") !== b.regions.join(",")) return a.regions.join(",").localeCompare(b.regions.join(","));
    if (a.slugPrefixes.join(",") !== b.slugPrefixes.join(",")) return a.slugPrefixes.join(",").localeCompare(b.slugPrefixes.join(","));
    return a.compilerGroupingKey.localeCompare(b.compilerGroupingKey);
  });
}

function validateAndReadLane(qualityGateRows, lane) {
  const gateRow = qualityGateRows.find((row) => row.interpreterLane === lane);
  if (!gateRow) throw new Error(`Missing quality gate row for ${lane}`);

  const expected = EXPECTED[lane];
  if (gateRow.qualityGateStatus !== expected.gateStatus) {
    throw new Error(`${lane}: expected gate status ${expected.gateStatus}, got ${gateRow.qualityGateStatus}`);
  }

  if (gateRow.competitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} competitions, got ${gateRow.competitionCount}`);
  }

  if (gateRow.compilerGroupingRowCount !== expected.groupingRows) {
    throw new Error(`${lane}: expected ${expected.groupingRows} grouping rows, got ${gateRow.compilerGroupingRowCount}`);
  }

  if (!fs.existsSync(gateRow.inputFile)) throw new Error(`${lane}: missing input file ${gateRow.inputFile}`);

  const laneFile = readJson(gateRow.inputFile);
  const compilerRows = Array.isArray(laneFile.compilerRows) ? laneFile.compilerRows : [];
  const summary = laneFile.summary || {};

  if (summary.interpreterLane !== lane) throw new Error(`${lane}: lane file interpreter mismatch`);
  if (summary.compilerGroupingRowCount !== expected.groupingRows) {
    throw new Error(`${lane}: lane file expected ${expected.groupingRows} grouping rows, got ${summary.compilerGroupingRowCount}`);
  }
  if (summary.competitionCount !== expected.competitions) {
    throw new Error(`${lane}: lane file expected ${expected.competitions} competitions, got ${summary.competitionCount}`);
  }
  if (compilerRows.length !== expected.groupingRows) {
    throw new Error(`${lane}: compilerRows expected ${expected.groupingRows}, got ${compilerRows.length}`);
  }

  const slugs = uniqueSorted(compilerRows.flatMap((row) => row.competitionSlugs || []));
  if (slugs.length !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique slugs, got ${slugs.length}`);
  }

  return { gateRow, laneFile, compilerRows, slugs };
}

function writeLaneOutput({ outputDir, date, lane, compiledRows }) {
  const uniqueSlugs = uniqueSorted(compiledRows.flatMap((row) => row.competitionSlugs || []));
  const filePath = path.join(
    outputDir,
    `primary-large-compiler-output-${lane}-${date}.json`
  ).replaceAll("\\", "/");

  const output = {
    generatedAt: new Date().toISOString(),
    date,
    job: "build-football-truth-primary-large-compiler-bundle-file",
    mode: "source_only_primary_large_compiler_lane_output_no_fetch_no_search_no_writes_no_truth_assertions",
    primaryCompilerLane: lane,
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    summary: {
      primaryCompilerLane: lane,
      compiledRowCount: compiledRows.length,
      compiledCompetitionCount: uniqueSlugs.length,
      compiledUniqueCompetitionCount: uniqueSlugs.length,
      slugPrefixCount: uniqueSorted(compiledRows.flatMap((row) => row.slugPrefixes || [])).length,
      regionCount: uniqueSorted(compiledRows.flatMap((row) => row.regions || [])).length,
      requiredEvidenceRoleCount: uniqueSorted(compiledRows.flatMap((row) => row.requiredEvidenceRoles || [])).length,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false
    },
    counts: {
      byRegion: countBy(compiledRows.flatMap((row) => row.regions.map((region) => ({ region }))), "region"),
      byNextSourceOnlyAction: countBy(compiledRows, "nextSourceOnlyAction")
    },
    guardrails: [
      "This is a primary large compiler output only.",
      "No fetch/search/write/truth assertion is performed.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "Completed/inactive/near-finish competitions require trusted restart/start evidence when available before daily scheduling decisions."
    ],
    compiledRows
  };

  fs.writeFileSync(filePath, stableJson(output));

  return {
    primaryCompilerLane: lane,
    outputFile: filePath,
    compiledRowCount: compiledRows.length,
    compiledCompetitionCount: uniqueSlugs.length,
    compiledUniqueCompetitionCount: uniqueSlugs.length,
    slugPrefixCount: output.summary.slugPrefixCount,
    regionCount: output.summary.regionCount,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    zeroResultMayImplyAbsence: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const gate = readJson(args.input);
  const summary = gate.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", SCOPE_ACCOUNTING_NO_ACTION_COUNT);
  assertSummary(summary, "qualityGateLaneCount", 8);
  assertSummary(summary, "qualityGatePassedLaneCount", 8);
  assertSummary(summary, "qualityGateBlockedLaneCount", 0);
  assertSummary(summary, "qualityGateCompilerGroupingRowCount", 281);
  assertSummary(summary, "qualityGateCompetitionReferenceCount", 515);
  assertSummary(summary, "sourceAuthorityTemplateCompetitionCount", 372);
  assertSummary(summary, "sourceAuthorityTemplateGroupingRowCount", 193);
  assertSummary(summary, "existingSignalTruthReviewCompetitionCount", 101);
  assertSummary(summary, "existingSignalTruthReviewGroupingRowCount", 80);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "actionableConfirmedNowCount", 0);
  assertSummary(summary, "contractConfirmedNowCount", 0);
  assertSummary(summary, "validatedRouteMapCount", 0);
  assertSummary(summary, "validatedFixtureContractCount", 0);
  assertSummary(summary, "validatedStandingsContractCount", 0);
  assertSummary(summary, "validatedSeasonStateContractCount", 0);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "zeroResultMayImplyAbsenceCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const qualityGateRows = Array.isArray(gate.qualityGateRows) ? gate.qualityGateRows : [];
  if (qualityGateRows.length !== 8) throw new Error(`Expected 8 qualityGateRows, got ${qualityGateRows.length}`);

  const sourceAuthority = validateAndReadLane(qualityGateRows, "source_authority_template_compiler_lane");
  const existingSignal = validateAndReadLane(qualityGateRows, "existing_signal_truth_review_compiler_lane");

  const sourceAuthorityCompiledRows = buildSourceAuthorityCompiledRows(sourceAuthority.compilerRows);
  const existingSignalCompiledRows = buildExistingSignalCompiledRows(existingSignal.compilerRows);

  if (sourceAuthorityCompiledRows.length !== 193) {
    throw new Error(`Expected 193 source authority compiled rows, got ${sourceAuthorityCompiledRows.length}`);
  }

  if (existingSignalCompiledRows.length !== 80) {
    throw new Error(`Expected 80 existing signal compiled rows, got ${existingSignalCompiledRows.length}`);
  }

  const primaryCompiledSlugs = uniqueSorted([
    ...sourceAuthorityCompiledRows.flatMap((row) => row.competitionSlugs),
    ...existingSignalCompiledRows.flatMap((row) => row.competitionSlugs)
  ]);

  if (primaryCompiledSlugs.length !== 473) {
    throw new Error(`Expected 473 unique primary compiled slugs, got ${primaryCompiledSlugs.length}`);
  }

  const outputDir = path.dirname(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const sourceAuthorityOutput = writeLaneOutput({
    outputDir,
    date: args.date,
    lane: "source_authority_template_compiler_lane",
    compiledRows: sourceAuthorityCompiledRows
  });

  const existingSignalOutput = writeLaneOutput({
    outputDir,
    date: args.date,
    lane: "existing_signal_truth_review_compiler_lane",
    compiledRows: existingSignalCompiledRows
  });

  const primaryCompilerOutputFiles = [sourceAuthorityOutput, existingSignalOutput];

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-primary-large-compiler-bundle-file",
    mode: "source_only_primary_large_compiler_bundle_for_source_authority_372_and_existing_signal_101_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      masterCompilerLaneQualityGate: args.input,
      sourceAuthorityTemplateCompilerLaneInput: sourceAuthority.gateRow.inputFile,
      existingSignalTruthReviewCompilerLaneInput: existingSignal.gateRow.inputFile
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      primaryCompilerLaneCount: 2,
      primaryCompilerOutputFileCount: primaryCompilerOutputFiles.length,
      primaryCompiledRowCount: sourceAuthorityCompiledRows.length + existingSignalCompiledRows.length,
      primaryCompiledUniqueCompetitionCount: primaryCompiledSlugs.length,

      sourceAuthorityTemplateCompiledCompetitionCount: sourceAuthorityOutput.compiledCompetitionCount,
      sourceAuthorityTemplateCompiledRowCount: sourceAuthorityOutput.compiledRowCount,
      existingSignalTruthReviewCompiledCompetitionCount: existingSignalOutput.compiledCompetitionCount,
      existingSignalTruthReviewCompiledRowCount: existingSignalOutput.compiledRowCount,

      remainingFollowupLaneCompetitionCount: ACTIVE_COMPETITION_COUNT - primaryCompiledSlugs.length,

      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,
      actionableConfirmedNowCount: 0,
      contractConfirmedNowCount: 0,
      validatedRouteMapCount: 0,
      validatedFixtureContractCount: 0,
      validatedStandingsContractCount: 0,
      validatedSeasonStateContractCount: 0,

      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane: "run_source_only_primary_large_compiler_quality_gate_then_source_authority_template_candidate_matrix"
    },
    counts: {
      byPrimaryCompilerLane: countBy([
        ...sourceAuthorityCompiledRows,
        ...existingSignalCompiledRows
      ], "primaryCompilerLane"),
      bySourceAuthorityRegion: countBy(sourceAuthorityCompiledRows.flatMap((row) => row.regions.map((region) => ({ region }))), "region"),
      byExistingSignalRegion: countBy(existingSignalCompiledRows.flatMap((row) => row.regions.map((region) => ({ region }))), "region")
    },
    guardrails: [
      "This bundle compiles the two primary large compiler lanes together.",
      "It covers 473 unique competitions: 372 source-authority and 101 existing-signal.",
      "It does not execute fetch/search/write.",
      "It does not assert source discovery, actionable scope, contracts, route, fixture, standings, season-state, active, inactive, or completed truth.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "The 42 non-primary active competitions remain in follow-up lanes, not dropped."
    ],
    primaryCompilerOutputFiles,
    sourceAuthorityCompiledRows,
    existingSignalCompiledRows
  };

  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    primaryCompilerLaneCount: output.summary.primaryCompilerLaneCount,
    primaryCompilerOutputFileCount: output.summary.primaryCompilerOutputFileCount,
    primaryCompiledRowCount: output.summary.primaryCompiledRowCount,
    primaryCompiledUniqueCompetitionCount: output.summary.primaryCompiledUniqueCompetitionCount,
    sourceAuthorityTemplateCompiledCompetitionCount: output.summary.sourceAuthorityTemplateCompiledCompetitionCount,
    sourceAuthorityTemplateCompiledRowCount: output.summary.sourceAuthorityTemplateCompiledRowCount,
    existingSignalTruthReviewCompiledCompetitionCount: output.summary.existingSignalTruthReviewCompiledCompetitionCount,
    existingSignalTruthReviewCompiledRowCount: output.summary.existingSignalTruthReviewCompiledRowCount,
    remainingFollowupLaneCompetitionCount: output.summary.remainingFollowupLaneCompetitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    actionableConfirmedNowCount: output.summary.actionableConfirmedNowCount,
    contractConfirmedNowCount: output.summary.contractConfirmedNowCount,
    validatedRouteMapCount: output.summary.validatedRouteMapCount,
    validatedFixtureContractCount: output.summary.validatedFixtureContractCount,
    validatedStandingsContractCount: output.summary.validatedStandingsContractCount,
    validatedSeasonStateContractCount: output.summary.validatedSeasonStateContractCount,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    zeroResultMayImplyAbsenceCount: output.summary.zeroResultMayImplyAbsenceCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
