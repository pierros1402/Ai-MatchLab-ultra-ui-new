#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/configured-reusable-family-batch-review-board-2026-06-14/configured-reusable-family-batch-review-board-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/trusted-fetch-review-route-local-contract-review-2026-06-14/trusted-fetch-review-route-local-contract-review-2026-06-14.json";

const TARGET_FAMILY = "trusted_fetch_review_route";
const MAX_FILE_BYTES = 2_000_000;

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

const SCAN_ROOTS = [
  "engine-v1/jobs",
  "engine-v1/lib",
  "engine-v1/src",
  "engine-v1/config",
  "engine-v1/_shared",
  "data/football-truth",
  "data"
];

const TERM_GROUPS = {
  route: [
    "route",
    "sourceurl",
    "source_url",
    "url",
    "official",
    "trusted",
    "fetch",
    "adapter",
    "selector",
    "provider",
    "endpoint"
  ],
  fixture: [
    "fixture",
    "fixtures",
    "match",
    "matches",
    "kickoff",
    "kick_off",
    "matchdate",
    "match_date",
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
    "pts",
    "wins",
    "losses"
  ],
  seasonState: [
    "seasonstate",
    "season_state",
    "season-state",
    "active",
    "completed",
    "inactive",
    "restart",
    "startdate",
    "start_date",
    "currentseason",
    "current_season"
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

function prefixOf(slug) {
  const match = String(slug || "").match(/^([a-z]{2,3})\./i);
  return match ? match[1].toLowerCase() : "__missing_prefix__";
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error(`Missing configured reusable board summary key: ${key}`);
  if (summary[key] !== expected) {
    throw new Error(`Configured reusable board guardrail failed: ${key} expected ${expected}, got ${summary[key]}`);
  }
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
        path: fullPath.replaceAll("\\", "/"),
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
    for (const file of walkFiles(root)) {
      byPath.set(file.path, file);
    }
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
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

function collectTermHits(windowText) {
  const lower = windowText.toLowerCase();
  const hits = {};

  for (const [group, terms] of Object.entries(TERM_GROUPS)) {
    hits[group] = terms.filter((term) => lower.includes(term));
  }

  return hits;
}

function scanFileForSlug(file, slug) {
  const content = fs.readFileSync(file.path, "utf8");
  const lower = content.toLowerCase();
  const needle = slug.toLowerCase();

  const occurrenceCount = countOccurrences(lower, needle);
  if (occurrenceCount === 0) return null;

  const windows = [];
  let index = 0;

  while (windows.length < 8) {
    const found = lower.indexOf(needle, index);
    if (found === -1) break;

    const start = Math.max(0, found - 350);
    const end = Math.min(content.length, found + 350);
    const windowText = content.slice(start, end);
    const termHits = collectTermHits(windowText);

    windows.push({
      offset: found,
      termHits,
      hasRouteTerms: termHits.route.length > 0,
      hasFixtureTerms: termHits.fixture.length > 0,
      hasStandingsTerms: termHits.standings.length > 0,
      hasSeasonStateTerms: termHits.seasonState.length > 0
    });

    index = found + needle.length;
  }

  return {
    path: file.path,
    sizeBytes: file.sizeBytes,
    occurrenceCount,
    hasRouteTerms: windows.some((window) => window.hasRouteTerms),
    hasFixtureTerms: windows.some((window) => window.hasFixtureTerms),
    hasStandingsTerms: windows.some((window) => window.hasStandingsTerms),
    hasSeasonStateTerms: windows.some((window) => window.hasSeasonStateTerms),
    matchedTermGroups: {
      route: uniqueSorted(windows.flatMap((window) => window.termHits.route)),
      fixture: uniqueSorted(windows.flatMap((window) => window.termHits.fixture)),
      standings: uniqueSorted(windows.flatMap((window) => window.termHits.standings)),
      seasonState: uniqueSorted(windows.flatMap((window) => window.termHits.seasonState))
    }
  };
}

function classifyRow(fileHits) {
  const routeFileCount = fileHits.filter((hit) => hit.hasRouteTerms).length;
  const fixtureFileCount = fileHits.filter((hit) => hit.hasFixtureTerms).length;
  const standingsFileCount = fileHits.filter((hit) => hit.hasStandingsTerms).length;
  const seasonStateFileCount = fileHits.filter((hit) => hit.hasSeasonStateTerms).length;

  if (routeFileCount > 0 && fixtureFileCount > 0 && standingsFileCount > 0 && seasonStateFileCount > 0) {
    return "local_three_signal_candidate_needs_family_contract_validation_no_write";
  }

  if (routeFileCount > 0 && fixtureFileCount > 0 && standingsFileCount > 0) {
    return "local_fixture_standings_candidate_needs_independent_season_state_review_no_write";
  }

  if (routeFileCount > 0 && (fixtureFileCount > 0 || standingsFileCount > 0 || seasonStateFileCount > 0)) {
    return "local_route_candidate_needs_contract_mapping_no_write";
  }

  if (routeFileCount > 0) {
    return "local_route_mention_only_needs_evidence_mapping_no_write";
  }

  if (fileHits.length > 0) {
    return "local_slug_mentions_without_route_contract_terms_no_write";
  }

  return "no_local_contract_evidence_found_in_scan_no_write";
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

  const firstBatch = board.firstRecommendedBatch;
  if (!firstBatch) throw new Error("Missing firstRecommendedBatch in configured reusable family board");
  if (firstBatch.reusableFamily !== TARGET_FAMILY) {
    throw new Error(`Expected first recommended family ${TARGET_FAMILY}, got ${firstBatch.reusableFamily}`);
  }

  const targetSlugs = uniqueSorted(firstBatch.competitionSlugs || []);
  if (targetSlugs.length !== 23) {
    throw new Error(`Expected 23 target competition slugs for ${TARGET_FAMILY}, got ${targetSlugs.length}`);
  }

  const candidateFiles = collectCandidateFiles();

  const reviewRows = targetSlugs.map((slug) => {
    const fileHits = [];

    for (const file of candidateFiles) {
      const hit = scanFileForSlug(file, slug);
      if (hit) fileHits.push(hit);
    }

    const routeFileCount = fileHits.filter((hit) => hit.hasRouteTerms).length;
    const fixtureFileCount = fileHits.filter((hit) => hit.hasFixtureTerms).length;
    const standingsFileCount = fileHits.filter((hit) => hit.hasStandingsTerms).length;
    const seasonStateFileCount = fileHits.filter((hit) => hit.hasSeasonStateTerms).length;

    return {
      competitionSlug: slug,
      slugPrefix: prefixOf(slug),
      reusableFamily: TARGET_FAMILY,
      localMentionFileCount: fileHits.length,
      routeCandidateFileCount: routeFileCount,
      fixtureCandidateFileCount: fixtureFileCount,
      standingsCandidateFileCount: standingsFileCount,
      seasonStateCandidateFileCount: seasonStateFileCount,
      localContractShapeCandidate: classifyRow(fileHits),
      contractConfirmedByThisBoard: false,
      activeAssertedByThisBoard: false,
      inactiveAssertedByThisBoard: false,
      completedAssertedByThisBoard: false,
      canonicalWriteEligibleNow: false,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      topLocalEvidenceFiles: fileHits
        .sort((a, b) => {
          const scoreA =
            Number(a.hasRouteTerms) * 4 +
            Number(a.hasFixtureTerms) * 3 +
            Number(a.hasStandingsTerms) * 3 +
            Number(a.hasSeasonStateTerms) * 2 +
            Math.min(a.occurrenceCount, 10);

          const scoreB =
            Number(b.hasRouteTerms) * 4 +
            Number(b.hasFixtureTerms) * 3 +
            Number(b.hasStandingsTerms) * 3 +
            Number(b.hasSeasonStateTerms) * 2 +
            Math.min(b.occurrenceCount, 10);

          if (scoreB !== scoreA) return scoreB - scoreA;
          return a.path.localeCompare(b.path);
        })
        .slice(0, 12)
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-trusted-fetch-review-route-local-contract-review-file",
    mode: "source_only_local_contract_review_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      configuredReusableFamilyBatchReviewBoard: args.input,
      sourceBoardJob: board.job || null,
      firstRecommendedReviewBatchId: firstBatch.reviewBatchId,
      reusableFamily: TARGET_FAMILY
    },
    scanScope: {
      roots: SCAN_ROOTS,
      allowedExtensions: [...ALLOWED_EXTENSIONS].sort(),
      skippedDirNames: [...SKIP_DIR_NAMES].sort(),
      maxFileBytes: MAX_FILE_BYTES,
      scannedFileCount: candidateFiles.length
    },
    summary: {
      retainedRawMapCompetitionCount: summary.retainedRawMapCompetitionCount,
      competitionCount: summary.competitionCount,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,

      reusableFamily: TARGET_FAMILY,
      targetCompetitionCount: targetSlugs.length,
      localMentionedCompetitionCount: reviewRows.filter((row) => row.localMentionFileCount > 0).length,
      routeCandidateCompetitionCount: reviewRows.filter((row) => row.routeCandidateFileCount > 0).length,
      fixtureCandidateCompetitionCount: reviewRows.filter((row) => row.fixtureCandidateFileCount > 0).length,
      standingsCandidateCompetitionCount: reviewRows.filter((row) => row.standingsCandidateFileCount > 0).length,
      seasonStateCandidateCompetitionCount: reviewRows.filter((row) => row.seasonStateCandidateFileCount > 0).length,
      localThreeSignalCandidateCompetitionCount: reviewRows.filter((row) =>
        row.localContractShapeCandidate === "local_three_signal_candidate_needs_family_contract_validation_no_write"
      ).length,

      contractConfirmedByThisBoardCount: 0,
      familyApplicabilityAssertedByThisBoardCount: 0,
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

      recommendedNextLane: "build_trusted_fetch_review_route_family_contract_mapper_from_local_candidates"
    },
    counts: {
      bySlugPrefix: countBy(reviewRows.map((row) => row.slugPrefix)),
      byLocalContractShapeCandidate: countBy(reviewRows.map((row) => row.localContractShapeCandidate))
    },
    guardrails: [
      "This board scans only local repo/source/diagnostic files.",
      "It does not run live fetch.",
      "It does not run search.",
      "It does not write canonical or production data.",
      "It does not assert active, inactive, completed, or actionable status.",
      "Local slug mentions are not evidence by themselves.",
      "Route/fixture/standings/season-state term co-occurrence is only a candidate for later family contract mapping.",
      "No match today must not imply inactive.",
      "Match status must not be used as season state."
    ],
    targetCompetitionSlugs: targetSlugs,
    reviewRows
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
    localMentionedCompetitionCount: output.summary.localMentionedCompetitionCount,
    routeCandidateCompetitionCount: output.summary.routeCandidateCompetitionCount,
    fixtureCandidateCompetitionCount: output.summary.fixtureCandidateCompetitionCount,
    standingsCandidateCompetitionCount: output.summary.standingsCandidateCompetitionCount,
    seasonStateCandidateCompetitionCount: output.summary.seasonStateCandidateCompetitionCount,
    localThreeSignalCandidateCompetitionCount: output.summary.localThreeSignalCandidateCompetitionCount,
    contractConfirmedByThisBoardCount: output.summary.contractConfirmedByThisBoardCount,
    familyApplicabilityAssertedByThisBoardCount: output.summary.familyApplicabilityAssertedByThisBoardCount,
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
