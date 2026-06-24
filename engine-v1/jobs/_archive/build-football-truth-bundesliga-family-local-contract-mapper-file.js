#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const TARGET_FAMILY = "bundesliga";
const TARGET_SLUGS = ["ger.1", "ger.2"];

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/configured-reusable-family-viability-decision-board-2026-06-14/configured-reusable-family-viability-decision-board-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/bundesliga-family-local-contract-mapper-2026-06-14/bundesliga-family-local-contract-mapper-2026-06-14.json";

const MAX_FILE_BYTES = 2_000_000;

const SCAN_ROOTS = [
  "engine-v1/jobs",
  "engine-v1/lib",
  "engine-v1/src",
  "engine-v1/config",
  "engine-v1/_shared",
  "data/football-truth",
  "data"
];

const SKIP_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
  "__pycache__"
]);

const ALLOWED_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonl",
  ".txt",
  ".md",
  ".csv",
  ".ts"
]);

const ROLE_TERMS = {
  route: [
    "bundesliga",
    "official-route",
    "official_route",
    "official route",
    "required_source",
    "requiredsource",
    "sourceurl",
    "source_url",
    "official_standings",
    "bundesliga_official_standings_table",
    "dfb",
    "dfl",
    "route"
  ],
  standings: [
    "standings",
    "standing",
    "table",
    "rank",
    "position",
    "played",
    "points",
    "pts",
    "expected_table_rows",
    "expectedtablerows",
    "18",
    "promotion-plan",
    "promotion_plan"
  ],
  fixture: [
    "fixture",
    "fixtures",
    "match",
    "matches",
    "kickoff",
    "kick_off",
    "match_date",
    "matchdate",
    "result",
    "results"
  ],
  seasonState: [
    "season_state",
    "seasonstate",
    "season-state",
    "active",
    "completed",
    "inactive",
    "restart",
    "start_date",
    "startdate",
    "current_season",
    "currentseason",
    "season"
  ],
  writeRisk: [
    "canonical",
    "write",
    "writer",
    "promotion",
    "production",
    "fixtures.json",
    "observations.json",
    "source-reliability.json"
  ]
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

function countBy(values) {
  const counts = {};
  for (const value of values) {
    const key = String(value || "__missing__").trim() || "__missing__";
    counts[key] = (counts[key] || 0) + 1;
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

function normalizePath(filePath) {
  return String(filePath || "").replaceAll("\\", "/");
}

function classifyPath(filePath) {
  const p = normalizePath(filePath).toLowerCase();

  if (p.includes("/_diagnostics/")) return "generated_diagnostic_context";
  if (p.includes("/_legacy/")) return "legacy_data_context";
  if (p.startsWith("engine-v1/jobs/")) return "source_job_candidate";
  if (p.startsWith("engine-v1/lib/")) return "source_library_candidate";
  if (p.startsWith("engine-v1/src/")) return "source_runtime_candidate";
  if (p.startsWith("engine-v1/config/")) return "source_config_candidate";
  if (p.startsWith("engine-v1/_shared/")) return "source_shared_candidate";
  if (p.startsWith("data/football-truth/")) return "football_truth_data_candidate";
  if (p.startsWith("data/")) return "data_file_candidate";

  return "other_local_file_candidate";
}

function isSourceClass(pathClass) {
  return [
    "source_job_candidate",
    "source_library_candidate",
    "source_runtime_candidate",
    "source_config_candidate",
    "source_shared_candidate"
  ].includes(pathClass);
}

function isDiagnosticOrLegacy(pathClass) {
  return pathClass === "generated_diagnostic_context" || pathClass === "legacy_data_context";
}

function walkFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;

      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_FILE_BYTES) continue;

      files.push({
        path: normalizePath(fullPath),
        sizeBytes: stat.size,
        ext
      });
    }
  }

  walk(rootDir);
  return files;
}

function collectCandidateFiles() {
  const byPath = new Map();

  for (const root of SCAN_ROOTS) {
    for (const file of walkFiles(root)) byPath.set(file.path, file);
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function collectRoleHits(text) {
  const lower = text.toLowerCase();
  const hits = {};

  for (const [role, terms] of Object.entries(ROLE_TERMS)) {
    hits[role] = terms.filter((term) => lower.includes(term.toLowerCase()));
  }

  return hits;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;

  while (true) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count += 1;
    index = found + needle.length;
  }

  return count;
}

function scanFile(file, slugs) {
  const content = fs.readFileSync(file.path, "utf8");
  const lower = content.toLowerCase();

  const slugHits = slugs
    .map((slug) => ({
      slug,
      occurrenceCount: countOccurrences(lower, slug.toLowerCase())
    }))
    .filter((hit) => hit.occurrenceCount > 0);

  const hasBundesligaTerm = includesAny(lower, ["bundesliga", "dfl", "german", "germany"]);
  const hasFamilyTerm = includesAny(lower, ["bundesliga_official_standings_table", "official-route", "official_route", "expected_table_rows"]);

  if (slugHits.length === 0 && !hasBundesligaTerm && !hasFamilyTerm) return null;

  const roleHits = collectRoleHits(content);

  const roles = Object.entries(roleHits)
    .filter(([, terms]) => terms.length > 0)
    .map(([role]) => role)
    .sort();

  if (slugHits.length === 0 && roles.length < 2) return null;

  return {
    path: file.path,
    sizeBytes: file.sizeBytes,
    pathClass: classifyPath(file.path),
    supportedCompetitionSlugs: uniqueSorted(slugHits.map((hit) => hit.slug)),
    supportedCompetitionCount: uniqueSorted(slugHits.map((hit) => hit.slug)).length,
    roles,
    roleHits,
    totalSlugOccurrenceCount: slugHits.reduce((sum, hit) => sum + hit.occurrenceCount, 0),
    hasBundesligaTerm,
    hasFamilyTerm
  };
}

function classifyEvidenceFile(hit) {
  const hasRoute = hit.roles.includes("route");
  const hasStandings = hit.roles.includes("standings");
  const hasFixture = hit.roles.includes("fixture");
  const hasSeasonState = hit.roles.includes("seasonState");

  if (isDiagnosticOrLegacy(hit.pathClass)) {
    return "diagnostic_or_legacy_context_not_contract";
  }

  if (isSourceClass(hit.pathClass) && hasRoute && hasStandings && hit.supportedCompetitionCount >= 2) {
    return "source_standings_contract_mapper_candidate_no_write";
  }

  if (isSourceClass(hit.pathClass) && hasRoute && hasFixture && hasStandings && hasSeasonState && hit.supportedCompetitionCount >= 2) {
    return "source_full_contract_mapper_candidate_no_write";
  }

  if (isSourceClass(hit.pathClass) && hasRoute && hasFixture && hit.supportedCompetitionCount >= 1) {
    return "source_fixture_route_candidate_needs_contract_validation_no_write";
  }

  if (isSourceClass(hit.pathClass) && hasRoute && hasSeasonState && hit.supportedCompetitionCount >= 1) {
    return "source_season_state_route_candidate_needs_contract_validation_no_write";
  }

  if (isSourceClass(hit.pathClass) && hasRoute) {
    return "source_route_mention_candidate_needs_role_mapping_no_write";
  }

  if (hit.pathClass === "football_truth_data_candidate" || hit.pathClass === "data_file_candidate") {
    return "data_context_candidate_needs_source_traceback_no_write";
  }

  return "local_reference_not_contract";
}

function scoreEvidence(hit) {
  let score = 0;

  if (isSourceClass(hit.pathClass)) score += 30;
  if (hit.pathClass === "football_truth_data_candidate") score += 12;
  if (hit.pathClass === "data_file_candidate") score += 6;
  if (isDiagnosticOrLegacy(hit.pathClass)) score -= 20;

  if (hit.roles.includes("route")) score += 10;
  if (hit.roles.includes("standings")) score += 12;
  if (hit.roles.includes("fixture")) score += 7;
  if (hit.roles.includes("seasonState")) score += 7;
  if (hit.roles.includes("writeRisk")) score -= 4;

  if (hit.hasFamilyTerm) score += 10;
  if (hit.hasBundesligaTerm) score += 5;
  if (hit.supportedCompetitionCount >= 2) score += 8;

  score += Math.min(hit.totalSlugOccurrenceCount, 20);

  return score;
}

function classifyCompetition(slug, evidenceFiles) {
  const sourceFiles = evidenceFiles.filter((file) => isSourceClass(file.pathClass));
  const sourceStandingsContract = sourceFiles.filter((file) =>
    file.evidenceClass === "source_standings_contract_mapper_candidate_no_write"
  );

  const sourceFullContract = sourceFiles.filter((file) =>
    file.evidenceClass === "source_full_contract_mapper_candidate_no_write"
  );

  const sourceFixtureCandidates = sourceFiles.filter((file) =>
    file.evidenceClass === "source_fixture_route_candidate_needs_contract_validation_no_write"
  );

  const sourceSeasonStateCandidates = sourceFiles.filter((file) =>
    file.evidenceClass === "source_season_state_route_candidate_needs_contract_validation_no_write"
  );

  if (sourceFullContract.length > 0) {
    return "source_full_contract_candidate_needs_strict_validation_no_write";
  }

  if (sourceStandingsContract.length > 0 && sourceFixtureCandidates.length === 0 && sourceSeasonStateCandidates.length === 0) {
    return "source_standings_contract_only_needs_fixture_and_season_state_contracts_no_write";
  }

  if (sourceStandingsContract.length > 0) {
    return "source_standings_contract_plus_partial_contract_candidates_no_write";
  }

  if (sourceFiles.length > 0) {
    return "source_mentions_without_confirmed_contract_no_write";
  }

  if (evidenceFiles.length > 0) {
    return "diagnostic_or_data_context_only_needs_source_traceback_no_write";
  }

  return "no_local_mapper_evidence_no_write";
}

function compactEvidence(file) {
  return {
    path: file.path,
    pathClass: file.pathClass,
    evidenceClass: file.evidenceClass,
    evidenceScore: file.evidenceScore,
    supportedCompetitionSlugs: file.supportedCompetitionSlugs,
    roles: file.roles,
    roleHits: file.roleHits,
    hasBundesligaTerm: file.hasBundesligaTerm,
    hasFamilyTerm: file.hasFamilyTerm
  };
}

function main() {
  const args = parseArgs(process.argv);
  const board = readJson(args.input);
  const summary = board.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", 689);
  assertSummary(summary, "competitionCount", 689);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "configuredReusableFamilyApplyCompetitionCount", 31);
  assertSummary(summary, "blockedNotConfirmedFamilyCount", 1);
  assertSummary(summary, "blockedNotConfirmedCompetitionCount", 23);
  assertSummary(summary, "pendingFamilyMapperReviewCount", 4);
  assertSummary(summary, "pendingFamilyMapperCompetitionCount", 8);
  assertSummary(summary, "contractConfirmedByThisBoardCount", 0);
  assertSummary(summary, "familyApplicabilityAssertedByThisBoardCount", 0);
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

  if (summary.nextRecommendedReusableFamily !== TARGET_FAMILY) {
    throw new Error(`Expected next recommended reusable family ${TARGET_FAMILY}, got ${summary.nextRecommendedReusableFamily}`);
  }

  const nextSlugs = uniqueSorted(summary.nextRecommendedCompetitionSlugs || []);
  if (JSON.stringify(nextSlugs) !== JSON.stringify(TARGET_SLUGS)) {
    throw new Error(`Expected next slugs ${TARGET_SLUGS.join(",")}, got ${nextSlugs.join(",")}`);
  }

  const candidateFiles = collectCandidateFiles();
  const evidenceFiles = candidateFiles
    .map((file) => scanFile(file, TARGET_SLUGS))
    .filter(Boolean)
    .map((hit) => {
      const evidenceClass = classifyEvidenceFile(hit);
      return {
        ...hit,
        evidenceClass,
        evidenceScore: scoreEvidence({ ...hit, evidenceClass })
      };
    })
    .sort((a, b) => {
      if (b.evidenceScore !== a.evidenceScore) return b.evidenceScore - a.evidenceScore;
      return a.path.localeCompare(b.path);
    });

  const competitionRows = TARGET_SLUGS.map((slug) => {
    const filesForSlug = evidenceFiles.filter((file) =>
      file.supportedCompetitionSlugs.includes(slug) ||
      (file.hasBundesligaTerm && file.supportedCompetitionSlugs.length === 0)
    );

    const sourceFilesForSlug = filesForSlug.filter((file) => isSourceClass(file.pathClass));
    const standingsContractFiles = sourceFilesForSlug.filter((file) =>
      file.evidenceClass === "source_standings_contract_mapper_candidate_no_write"
    );
    const fixtureContractFiles = sourceFilesForSlug.filter((file) =>
      file.evidenceClass === "source_fixture_route_candidate_needs_contract_validation_no_write" ||
      file.evidenceClass === "source_full_contract_mapper_candidate_no_write"
    );
    const seasonStateContractFiles = sourceFilesForSlug.filter((file) =>
      file.evidenceClass === "source_season_state_route_candidate_needs_contract_validation_no_write" ||
      file.evidenceClass === "source_full_contract_mapper_candidate_no_write"
    );

    return {
      competitionSlug: slug,
      reusableFamily: TARGET_FAMILY,
      mapperCandidateClass: classifyCompetition(slug, filesForSlug),
      localEvidenceFileCount: filesForSlug.length,
      sourceEvidenceFileCount: sourceFilesForSlug.length,
      sourceStandingsContractCandidateFileCount: standingsContractFiles.length,
      sourceFixtureContractCandidateFileCount: fixtureContractFiles.length,
      sourceSeasonStateContractCandidateFileCount: seasonStateContractFiles.length,
      contractConfirmedByThisMapper: false,
      standingsContractCandidateByThisMapper: standingsContractFiles.length > 0,
      fixtureContractCandidateByThisMapper: fixtureContractFiles.length > 0,
      seasonStateContractCandidateByThisMapper: seasonStateContractFiles.length > 0,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      activeAssertedByThisMapper: false,
      inactiveAssertedByThisMapper: false,
      completedAssertedByThisMapper: false,
      topEvidenceFiles: filesForSlug.slice(0, 12).map(compactEvidence)
    };
  });

  const sourceEvidenceFiles = evidenceFiles.filter((file) => isSourceClass(file.pathClass));
  const sourceStandingsContractFiles = sourceEvidenceFiles.filter((file) =>
    file.evidenceClass === "source_standings_contract_mapper_candidate_no_write"
  );
  const sourceFullContractFiles = sourceEvidenceFiles.filter((file) =>
    file.evidenceClass === "source_full_contract_mapper_candidate_no_write"
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-bundesliga-family-local-contract-mapper-file",
    mode: "source_only_bundesliga_family_local_contract_mapper_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      configuredReusableFamilyViabilityDecisionBoard: args.input,
      reusableFamily: TARGET_FAMILY,
      targetCompetitionSlugs: TARGET_SLUGS
    },
    scanScope: {
      roots: SCAN_ROOTS,
      scannedFileCount: candidateFiles.length,
      maxFileBytes: MAX_FILE_BYTES
    },
    summary: {
      retainedRawMapCompetitionCount: summary.retainedRawMapCompetitionCount,
      competitionCount: summary.competitionCount,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,

      reusableFamily: TARGET_FAMILY,
      targetCompetitionCount: TARGET_SLUGS.length,
      targetCompetitionSlugs: TARGET_SLUGS,

      localEvidenceFileCount: evidenceFiles.length,
      sourceEvidenceFileCount: sourceEvidenceFiles.length,
      sourceStandingsContractCandidateFileCount: sourceStandingsContractFiles.length,
      sourceFullContractCandidateFileCount: sourceFullContractFiles.length,
      sourceFixtureContractCandidateFileCount: sourceEvidenceFiles.filter((file) =>
        file.evidenceClass === "source_fixture_route_candidate_needs_contract_validation_no_write" ||
        file.evidenceClass === "source_full_contract_mapper_candidate_no_write"
      ).length,
      sourceSeasonStateContractCandidateFileCount: sourceEvidenceFiles.filter((file) =>
        file.evidenceClass === "source_season_state_route_candidate_needs_contract_validation_no_write" ||
        file.evidenceClass === "source_full_contract_mapper_candidate_no_write"
      ).length,

      standingsContractCandidateCompetitionCount: competitionRows.filter((row) =>
        row.sourceStandingsContractCandidateFileCount > 0
      ).length,
      fixtureContractCandidateCompetitionCount: competitionRows.filter((row) =>
        row.sourceFixtureContractCandidateFileCount > 0
      ).length,
      seasonStateContractCandidateCompetitionCount: competitionRows.filter((row) =>
        row.sourceSeasonStateContractCandidateFileCount > 0
      ).length,

      contractConfirmedByThisMapperCount: 0,
      familyApplicabilityAssertedByThisMapperCount: 0,
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

      recommendedNextLane: "build_bundesliga_standings_contract_validation_board_source_only_no_write"
    },
    counts: {
      byEvidenceClass: countBy(evidenceFiles.map((file) => file.evidenceClass)),
      byPathClass: countBy(evidenceFiles.map((file) => file.pathClass)),
      byMapperCandidateClass: countBy(competitionRows.map((row) => row.mapperCandidateClass))
    },
    guardrails: [
      "This mapper only scans local files.",
      "This mapper does not run fetch or search.",
      "This mapper does not write canonical or production data.",
      "This mapper does not assert active, inactive, completed, or actionable status.",
      "A standings contract candidate is not a full family contract.",
      "Fixture and season-state contracts must be validated separately.",
      "No match today must not imply inactive.",
      "Match status must not be used as season state."
    ],
    topSourceEvidenceFiles: sourceEvidenceFiles.slice(0, 30).map(compactEvidence),
    topAllEvidenceFiles: evidenceFiles.slice(0, 40).map(compactEvidence),
    competitionRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    scannedFileCount: output.scanScope.scannedFileCount,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    reusableFamily: output.summary.reusableFamily,
    targetCompetitionCount: output.summary.targetCompetitionCount,
    targetCompetitionSlugs: output.summary.targetCompetitionSlugs,
    localEvidenceFileCount: output.summary.localEvidenceFileCount,
    sourceEvidenceFileCount: output.summary.sourceEvidenceFileCount,
    sourceStandingsContractCandidateFileCount: output.summary.sourceStandingsContractCandidateFileCount,
    sourceFullContractCandidateFileCount: output.summary.sourceFullContractCandidateFileCount,
    sourceFixtureContractCandidateFileCount: output.summary.sourceFixtureContractCandidateFileCount,
    sourceSeasonStateContractCandidateFileCount: output.summary.sourceSeasonStateContractCandidateFileCount,
    standingsContractCandidateCompetitionCount: output.summary.standingsContractCandidateCompetitionCount,
    fixtureContractCandidateCompetitionCount: output.summary.fixtureContractCandidateCompetitionCount,
    seasonStateContractCandidateCompetitionCount: output.summary.seasonStateContractCandidateCompetitionCount,
    contractConfirmedByThisMapperCount: output.summary.contractConfirmedByThisMapperCount,
    familyApplicabilityAssertedByThisMapperCount: output.summary.familyApplicabilityAssertedByThisMapperCount,
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
