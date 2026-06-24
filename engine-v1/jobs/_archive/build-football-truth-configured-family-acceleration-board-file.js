#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_VIABILITY =
  "data/football-truth/_diagnostics/configured-reusable-family-viability-decision-board-2026-06-14/configured-reusable-family-viability-decision-board-2026-06-14.json";

const DEFAULT_BUNDESLIGA_MAPPER =
  "data/football-truth/_diagnostics/bundesliga-family-local-contract-mapper-2026-06-14/bundesliga-family-local-contract-mapper-2026-06-14.json";

const DEFAULT_TRUSTED_FETCH_MAPPER =
  "data/football-truth/_diagnostics/trusted-fetch-review-route-family-contract-mapper-2026-06-14/trusted-fetch-review-route-family-contract-mapper-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/configured-family-acceleration-board-2026-06-14/configured-family-acceleration-board-2026-06-14.json";

const MAX_FILE_BYTES = 2_000_000;

const SOURCE_SCAN_ROOTS = [
  "engine-v1/jobs",
  "engine-v1/lib",
  "engine-v1/src",
  "engine-v1/config",
  "engine-v1/_shared"
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

const FAMILY_KEYWORDS = {
  bundesliga: [
    "bundesliga",
    "germany",
    "german",
    "dfl",
    "dfb",
    "ger.1",
    "ger.2",
    "bundesliga_official_standings_table"
  ],
  laliga: [
    "laliga",
    "la liga",
    "spain",
    "spanish",
    "esp.1",
    "esp.2",
    "laliga_official",
    "laliga_api"
  ],
  norway_ntf: [
    "norway_ntf",
    "ntf",
    "norway",
    "norwegian",
    "eliteserien",
    "obos",
    "nor.1",
    "nor.2"
  ],
  sportomedia: [
    "sportomedia",
    "sweden",
    "swedish",
    "allsvenskan",
    "superettan",
    "swe.1",
    "swe.2",
    "graphql"
  ],
  trusted_fetch_review_route: [
    "trusted_fetch_review_route"
  ]
};

const ROLE_KEYWORDS = {
  route: [
    "route",
    "official",
    "sourceurl",
    "source_url",
    "provider",
    "adapter",
    "endpoint",
    "selector",
    "required_source",
    "requiredsource"
  ],
  fixture: [
    "fixture",
    "fixtures",
    "match",
    "matches",
    "kickoff",
    "kick_off",
    "result",
    "results"
  ],
  standings: [
    "standing",
    "standings",
    "table",
    "rank",
    "position",
    "played",
    "points",
    "pts"
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
    "current_season"
  ],
  validator: [
    "validator",
    "contract",
    "normalizer",
    "normalized",
    "evidence",
    "promotion-plan",
    "promotion_plan"
  ]
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    viability: DEFAULT_VIABILITY,
    bundesligaMapper: DEFAULT_BUNDESLIGA_MAPPER,
    trustedFetchMapper: DEFAULT_TRUSTED_FETCH_MAPPER,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--viability") args.viability = argv[++i];
    else if (arg === "--bundesliga-mapper") args.bundesligaMapper = argv[++i];
    else if (arg === "--trusted-fetch-mapper") args.trustedFetchMapper = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
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

function collectSourceFiles() {
  const byPath = new Map();

  for (const root of SOURCE_SCAN_ROOTS) {
    for (const file of walkFiles(root)) byPath.set(file.path, file);
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function includesAny(lower, terms) {
  return terms.some((term) => lower.includes(String(term).toLowerCase()));
}

function hitsFor(lower, terms) {
  return terms.filter((term) => lower.includes(String(term).toLowerCase()));
}

function scanSourceFilesByFamily(sourceFiles, familyRows) {
  const familyNames = uniqueSorted(familyRows.map((row) => row.reusableFamily));
  const rows = [];

  for (const file of sourceFiles) {
    const content = fs.readFileSync(file.path, "utf8");
    const lower = content.toLowerCase();

    for (const family of familyNames) {
      const familyTerms = FAMILY_KEYWORDS[family] || [family];
      const familyHits = hitsFor(lower, familyTerms);
      if (familyHits.length === 0) continue;

      const roleHits = {};
      for (const [role, terms] of Object.entries(ROLE_KEYWORDS)) {
        roleHits[role] = hitsFor(lower, terms);
      }

      const roles = Object.entries(roleHits)
        .filter(([, terms]) => terms.length > 0)
        .map(([role]) => role)
        .sort();

      if (roles.length === 0) continue;

      rows.push({
        family,
        path: file.path,
        sizeBytes: file.sizeBytes,
        familyHits,
        roles,
        roleHits
      });
    }
  }

  return rows;
}

function scoreFamilySourceHit(hit) {
  let score = 0;

  if (hit.roles.includes("route")) score += 8;
  if (hit.roles.includes("fixture")) score += 6;
  if (hit.roles.includes("standings")) score += 7;
  if (hit.roles.includes("seasonState")) score += 5;
  if (hit.roles.includes("validator")) score += 8;

  score += Math.min(hit.familyHits.length, 8);

  const p = hit.path.toLowerCase();
  if (p.includes("normaliz")) score += 8;
  if (p.includes("validator")) score += 8;
  if (p.includes("contract")) score += 6;
  if (p.includes("promotion")) score += 4;
  if (p.includes("mapper")) score -= 2;

  return score;
}

function rolesAcrossHits(hits) {
  return uniqueSorted(hits.flatMap((hit) => hit.roles));
}

function classifyFamily(row, hits, existingMappers) {
  const family = row.reusableFamily;
  const roles = rolesAcrossHits(hits);
  const sourceHitCount = hits.length;

  if (family === "trusted_fetch_review_route") {
    return {
      accelerationDecision: "blocked_not_confirmed_no_source_contract_traceback",
      decisionReason: "prior mapper showed zero source evidence and all competitions diagnostic echo only",
      batchLane: "blocked_until_upstream_source_traceback",
      priority: 900
    };
  }

  if (family === "bundesliga" && existingMappers.bundesliga) {
    const s = existingMappers.bundesliga.summary || {};
    return {
      accelerationDecision: "standings_first_contract_candidate_batch_not_full_contract",
      decisionReason: "Bundesliga mapper found source standings candidates for ger.1/ger.2 but no season-state contract candidate",
      batchLane: "standings_contract_validation_batch",
      priority: 20,
      mapperSummary: {
        sourceStandingsContractCandidateFileCount: s.sourceStandingsContractCandidateFileCount,
        sourceFixtureContractCandidateFileCount: s.sourceFixtureContractCandidateFileCount,
        sourceSeasonStateContractCandidateFileCount: s.sourceSeasonStateContractCandidateFileCount,
        standingsContractCandidateCompetitionCount: s.standingsContractCandidateCompetitionCount,
        fixtureContractCandidateCompetitionCount: s.fixtureContractCandidateCompetitionCount,
        seasonStateContractCandidateCompetitionCount: s.seasonStateContractCandidateCompetitionCount
      }
    };
  }

  if (roles.includes("route") && roles.includes("fixture") && roles.includes("standings") && roles.includes("seasonState")) {
    return {
      accelerationDecision: "source_role_complete_family_candidate_needs_batch_validator",
      decisionReason: "source scan found route, fixture, standings, and season-state roles for this family",
      batchLane: "full_contract_candidate_batch_validator_source_only",
      priority: 10
    };
  }

  if (roles.includes("route") && roles.includes("fixture") && roles.includes("standings")) {
    return {
      accelerationDecision: "fixture_standings_family_candidate_needs_season_state_source",
      decisionReason: "source scan found route, fixture, and standings roles but no season-state role",
      batchLane: "fixture_standings_contract_batch_then_season_state_gap",
      priority: 30
    };
  }

  if (roles.includes("route") && roles.includes("standings")) {
    return {
      accelerationDecision: "standings_route_family_candidate_needs_fixture_and_season_state_source",
      decisionReason: "source scan found route and standings roles only",
      batchLane: "standings_contract_validation_batch",
      priority: 40
    };
  }

  if (roles.includes("route") && roles.includes("fixture")) {
    return {
      accelerationDecision: "fixture_route_family_candidate_needs_standings_and_season_state_source",
      decisionReason: "source scan found route and fixture roles only",
      batchLane: "fixture_contract_validation_batch",
      priority: 50
    };
  }

  if (sourceHitCount > 0) {
    return {
      accelerationDecision: "source_mentions_need_template_review_before_validator",
      decisionReason: "source scan found family mentions but insufficient contract roles",
      batchLane: "source_template_review_batch",
      priority: 70
    };
  }

  return {
    accelerationDecision: "no_source_template_found_in_acceleration_scan",
    decisionReason: "one-pass source scan did not find useful family source template evidence",
    batchLane: "defer_or_source_traceback_required",
    priority: 100
  };
}

function main() {
  const args = parseArgs(process.argv);
  const viability = readJson(args.viability);
  const bundesligaMapper = readJsonIfExists(args.bundesligaMapper);
  const trustedFetchMapper = readJsonIfExists(args.trustedFetchMapper);

  const summary = viability.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", 689);
  assertSummary(summary, "competitionCount", 689);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "configuredReusableFamilyApplyCompetitionCount", 31);
  assertSummary(summary, "configuredReusableFamilyApplyBatchCount", 5);
  assertSummary(summary, "blockedNotConfirmedFamilyCount", 1);
  assertSummary(summary, "blockedNotConfirmedCompetitionCount", 23);
  assertSummary(summary, "pendingFamilyMapperReviewCount", 4);
  assertSummary(summary, "pendingFamilyMapperCompetitionCount", 8);
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

  const decisionRows = Array.isArray(viability.decisionRows) ? viability.decisionRows : [];
  if (decisionRows.length !== 5) throw new Error(`Expected 5 configured family decision rows, got ${decisionRows.length}`);

  const sourceFiles = collectSourceFiles();
  const sourceHits = scanSourceFilesByFamily(sourceFiles, decisionRows);

  const existingMappers = {
    bundesliga: bundesligaMapper,
    trustedFetch: trustedFetchMapper
  };

  const familyRows = decisionRows.map((row) => {
    const family = row.reusableFamily;
    const hits = sourceHits
      .filter((hit) => hit.family === family)
      .map((hit) => ({
        ...hit,
        score: scoreFamilySourceHit(hit)
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.path.localeCompare(b.path);
      });

    const classification = classifyFamily(row, hits, existingMappers);

    return {
      reusableFamily: family,
      competitionCount: row.competitionCount,
      competitionSlugs: row.competitionSlugs || [],
      priorViabilityDecision: row.viabilityDecision,
      accelerationDecision: classification.accelerationDecision,
      decisionReason: classification.decisionReason,
      batchLane: classification.batchLane,
      priority: classification.priority,
      rolesFoundAcrossSourceFiles: rolesAcrossHits(hits),
      sourceFamilyHitFileCount: hits.length,
      topSourceFamilyHits: hits.slice(0, 12).map((hit) => ({
        path: hit.path,
        score: hit.score,
        familyHits: hit.familyHits,
        roles: hit.roles,
        roleHits: hit.roleHits
      })),
      mapperSummary: classification.mapperSummary || null,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    };
  }).sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (b.competitionCount !== a.competitionCount) return b.competitionCount - a.competitionCount;
    return a.reusableFamily.localeCompare(b.reusableFamily);
  });

  const executableRows = familyRows.filter((row) =>
    row.accelerationDecision !== "blocked_not_confirmed_no_source_contract_traceback" &&
    row.accelerationDecision !== "no_source_template_found_in_acceleration_scan" &&
    row.accelerationDecision !== "source_mentions_need_template_review_before_validator"
  );

  const blockedRows = familyRows.filter((row) =>
    row.accelerationDecision === "blocked_not_confirmed_no_source_contract_traceback"
  );

  const nextBatch = executableRows[0] || null;

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-configured-family-acceleration-board-file",
    mode: "source_only_one_pass_configured_family_acceleration_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      viability: args.viability,
      bundesligaMapper: fs.existsSync(args.bundesligaMapper) ? args.bundesligaMapper : null,
      trustedFetchMapper: fs.existsSync(args.trustedFetchMapper) ? args.trustedFetchMapper : null
    },
    scanScope: {
      sourceScanRoots: SOURCE_SCAN_ROOTS,
      scannedSourceFileCount: sourceFiles.length,
      maxFileBytes: MAX_FILE_BYTES
    },
    summary: {
      retainedRawMapCompetitionCount: summary.retainedRawMapCompetitionCount,
      competitionCount: summary.competitionCount,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,

      configuredReusableFamilyApplyCompetitionCount: summary.configuredReusableFamilyApplyCompetitionCount,
      configuredReusableFamilyApplyBatchCount: summary.configuredReusableFamilyApplyBatchCount,
      familyDecisionCount: familyRows.length,
      blockedNotConfirmedFamilyCount: blockedRows.length,
      blockedNotConfirmedCompetitionCount: uniqueSorted(blockedRows.flatMap((row) => row.competitionSlugs)).length,
      executableCandidateFamilyCount: executableRows.length,
      executableCandidateCompetitionCount: uniqueSorted(executableRows.flatMap((row) => row.competitionSlugs)).length,

      onePassSourceFamilyHitFileCount: sourceHits.length,
      nextRecommendedBatchLane: nextBatch ? nextBatch.batchLane : null,
      nextRecommendedReusableFamily: nextBatch ? nextBatch.reusableFamily : null,
      nextRecommendedCompetitionCount: nextBatch ? nextBatch.competitionCount : 0,
      nextRecommendedCompetitionSlugs: nextBatch ? nextBatch.competitionSlugs : [],

      contractConfirmedByThisBoardCount: 0,
      familyApplicabilityAssertedByThisBoardCount: 0,
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

      recommendedNextLane: "build_generic_configured_family_batch_validator_for_next_batch_lane_not_one_family_mapper"
    },
    counts: {
      byAccelerationDecision: countBy(familyRows.map((row) => row.accelerationDecision)),
      byBatchLane: countBy(familyRows.map((row) => row.batchLane)),
      byReusableFamily: countBy(familyRows.map((row) => row.reusableFamily))
    },
    guardrails: [
      "This board replaces one-family mapper iteration with one-pass configured family acceleration.",
      "It scans source files only, not legacy data or generated diagnostics.",
      "It does not run fetch or search.",
      "It does not write canonical or production data.",
      "It does not confirm contract applicability.",
      "It does not assert active, inactive, completed, or actionable status.",
      "trusted_fetch_review_route remains blocked/not-confirmed.",
      "Bundesliga remains standings-first candidate, not full contract.",
      "Next step must be a generic batch validator by lane, not another bespoke family mapper."
    ],
    nextBatch,
    blockedRows,
    executableRows,
    familyRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    scannedSourceFileCount: output.scanScope.scannedSourceFileCount,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    configuredReusableFamilyApplyCompetitionCount: output.summary.configuredReusableFamilyApplyCompetitionCount,
    configuredReusableFamilyApplyBatchCount: output.summary.configuredReusableFamilyApplyBatchCount,
    familyDecisionCount: output.summary.familyDecisionCount,
    blockedNotConfirmedFamilyCount: output.summary.blockedNotConfirmedFamilyCount,
    blockedNotConfirmedCompetitionCount: output.summary.blockedNotConfirmedCompetitionCount,
    executableCandidateFamilyCount: output.summary.executableCandidateFamilyCount,
    executableCandidateCompetitionCount: output.summary.executableCandidateCompetitionCount,
    onePassSourceFamilyHitFileCount: output.summary.onePassSourceFamilyHitFileCount,
    nextRecommendedBatchLane: output.summary.nextRecommendedBatchLane,
    nextRecommendedReusableFamily: output.summary.nextRecommendedReusableFamily,
    nextRecommendedCompetitionCount: output.summary.nextRecommendedCompetitionCount,
    nextRecommendedCompetitionSlugs: output.summary.nextRecommendedCompetitionSlugs,
    contractConfirmedByThisBoardCount: output.summary.contractConfirmedByThisBoardCount,
    familyApplicabilityAssertedByThisBoardCount: output.summary.familyApplicabilityAssertedByThisBoardCount,
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
