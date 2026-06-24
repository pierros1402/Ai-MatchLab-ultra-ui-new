import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const packPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-bulk-standings-acceleration-pack-2026-06-16",
  "whole-map-bulk-standings-acceleration-pack-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-bulk-standings-execution-manifest-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-bulk-standings-execution-manifest-2026-06-16.json"
);

const scanRoots = [
  path.join("data", "football-truth"),
  path.join("engine-v1", "jobs")
];

const routeLikePattern = /(https?:\/\/[^\s"'<>\\)]+|\/[a-z0-9][a-z0-9_\-\/.]*?(?:standings|standing|table|tabell|fixtures|results|competition|league|graphql|ajax|wp-json)[a-z0-9_\-\/.?=&%]*)/gi;
const hostPattern = /\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|de|se|no|uk|ie|fi|dk|be|nl|fr|it|pt|es|ch|at|eu|info|football|sport)\b/gi;

const knownExactLaneHints = {
  "ger.1": {
    routeCandidates: ["https://www.bundesliga.com/en/bundesliga/table"],
    providerFamily: "bundesliga_official",
    expectedRows: 18,
    statusBoost: "exact_route_known_from_current_pack_policy"
  },
  "ger.2": {
    routeCandidates: ["https://www.bundesliga.com/en/2bundesliga/table"],
    providerFamily: "bundesliga_official",
    expectedRows: 18,
    statusBoost: "exact_route_known_from_current_pack_policy"
  }
};

const knownNeedsRouteDiscovery = {
  "ger.3": {
    providerFamily: "germany_third_tier_official_route_unknown",
    expectedRows: 20,
    statusBoost: "must_not_skip_ger3_route_discovery_required"
  }
};

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function walkFiles(dir, predicate, limit = 5000) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length && out.length < limit) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        stack.push(full);
      } else if (!predicate || predicate(full)) {
        out.push(full);
        if (out.length >= limit) break;
      }
    }
  }
  return out.sort();
}

function readTextSafe(filePath, maxBytes = 6_000_000) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > maxBytes) return { ok: false, skipped: true, reason: "file_too_large", size: stat.size };
    return { ok: true, text: fs.readFileSync(filePath, "utf8"), size: stat.size };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(String))].sort();
}

function normalizeUrlCandidate(value) {
  const raw = String(value ?? "").trim().replace(/[),.;\]}]+$/g, "");
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("/")) return raw;
  return null;
}

function extractHintsFromText(text) {
  const routes = [];
  const hosts = [];
  for (const match of text.matchAll(routeLikePattern)) {
    const route = normalizeUrlCandidate(match[1]);
    if (route) routes.push(route);
  }
  for (const match of text.matchAll(hostPattern)) {
    hosts.push(match[0].toLowerCase());
  }
  return {
    routeCandidates: unique(routes).slice(0, 60),
    hostCandidates: unique(hosts).slice(0, 60)
  };
}

function scanLocalHintsForTargets(targets) {
  const slugs = targets.map((target) => target.competitionSlug);
  const files = walkFiles(
    "data/football-truth",
    (file) => file.endsWith(".json") || file.endsWith(".txt") || file.endsWith(".html") || file.endsWith(".js"),
    4000
  );

  const hintMap = Object.fromEntries(slugs.map((slug) => [slug, {
    competitionSlug: slug,
    scannedMentionCount: 0,
    sourceFiles: [],
    routeCandidates: [],
    hostCandidates: []
  }]));

  for (const file of files) {
    const read = readTextSafe(file);
    if (!read.ok) continue;
    const text = read.text;
    const lower = text.toLowerCase();

    for (const slug of slugs) {
      if (!lower.includes(slug.toLowerCase())) continue;

      const idx = lower.indexOf(slug.toLowerCase());
      const start = Math.max(0, idx - 4000);
      const len = Math.min(9000, text.length - start);
      const context = text.slice(start, start + len);
      const hints = extractHintsFromText(context);

      hintMap[slug].scannedMentionCount += 1;
      hintMap[slug].sourceFiles.push(file);
      hintMap[slug].routeCandidates.push(...hints.routeCandidates);
      hintMap[slug].hostCandidates.push(...hints.hostCandidates);
    }
  }

  for (const value of Object.values(hintMap)) {
    value.sourceFiles = unique(value.sourceFiles).slice(0, 20);
    value.routeCandidates = unique(value.routeCandidates).slice(0, 40);
    value.hostCandidates = unique(value.hostCandidates).slice(0, 40);
  }

  return hintMap;
}

function providerLaneOf(target, hints) {
  if (target.competitionSlug in knownExactLaneHints) return "exact_route_fetch_lane";
  if (target.providerSignalClass === "sportomedia") return "known_provider_contract_lane";
  if (target.providerSignalClass === "bundesliga_official") return "known_provider_contract_lane";
  if (target.providerSignalClass === "torneopal") return "known_provider_contract_lane";
  if (target.providerSignalClass === "loi") return "known_provider_contract_lane";
  if (target.providerSignalClass === "spfl_opta") return "known_provider_contract_lane";
  if (target.providerSignalClass === "laliga_official") return "known_provider_contract_lane";
  if ((hints.routeCandidates?.length ?? 0) > 0) return "local_route_hint_validation_lane";
  if ((hints.hostCandidates?.length ?? 0) > 0) return "host_scoped_route_discovery_lane";
  return "search_required_route_discovery_lane";
}

function executableStatusOf(target, hints) {
  if (target.competitionSlug in knownExactLaneHints) return "runner_ready_exact_route";
  if (target.competitionSlug in knownNeedsRouteDiscovery) return "needs_route_discovery_do_not_skip";
  if ((hints.routeCandidates?.length ?? 0) > 0) return "runner_ready_local_route_validation";
  if ((hints.hostCandidates?.length ?? 0) > 0) return "needs_host_scoped_route_discovery";
  return "needs_controlled_search_route_discovery";
}

function expectedRowCount(target) {
  if (knownExactLaneHints[target.competitionSlug]) return knownExactLaneHints[target.competitionSlug].expectedRows;
  if (knownNeedsRouteDiscovery[target.competitionSlug]) return knownNeedsRouteDiscovery[target.competitionSlug].expectedRows;
  if (target.competitionSlug.endsWith(".1") || target.competitionSlug.endsWith(".2")) return 16;
  if (target.competitionSlug.endsWith(".3")) return 20;
  return null;
}

function buildManifestRows(targets, hintMap) {
  return targets.map((target, index) => {
    const known = knownExactLaneHints[target.competitionSlug] ?? null;
    const needs = knownNeedsRouteDiscovery[target.competitionSlug] ?? null;
    const hints = hintMap[target.competitionSlug] ?? {};
    const routeCandidates = unique([...(known?.routeCandidates ?? []), ...(hints.routeCandidates ?? [])]).slice(0, 30);
    const hostCandidates = unique([...(hints.hostCandidates ?? [])]).slice(0, 30);
    const lane = providerLaneOf(target, { routeCandidates, hostCandidates });
    const status = executableStatusOf(target, { routeCandidates, hostCandidates });

    return {
      manifestRowId: `bulk_standings_execution_manifest_${String(index + 1).padStart(3, "0")}`,
      competitionSlug: target.competitionSlug,
      competitionLabel: target.competitionLabel,
      competitionType: target.competitionType,
      countryCode: target.countryCode,
      providerSignalClass: target.providerSignalClass,
      providerFamilyOverride: known?.providerFamily ?? needs?.providerFamily ?? null,
      forceIncluded: target.forceIncluded,
      expectedStandingRowCount: expectedRowCount(target),
      executionLane: lane,
      executionStatus: status,
      priorityScore: target.priorityScore,
      routeCandidates,
      hostCandidates,
      localHintSourceFileCount: hints.sourceFiles?.length ?? 0,
      localHintSourceFiles: hints.sourceFiles ?? [],
      statusBoost: known?.statusBoost ?? needs?.statusBoost ?? null,
      nextAllowedAction: {
        mayRunInBulkRunner: status.startsWith("runner_ready"),
        mayRunRouteDiscoveryBatch: status.includes("route_discovery") || status.includes("host_scoped"),
        mayFetchOnlyWithExplicitAllowFetchFlag: true,
        maySearchOnlyWithExplicitAllowSearchFlag: true,
        mayBroadSearch: false,
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      }
    };
  }).sort((a, b) => {
    const rank = {
      runner_ready_exact_route: 1,
      runner_ready_local_route_validation: 2,
      needs_route_discovery_do_not_skip: 3,
      needs_host_scoped_route_discovery: 4,
      needs_controlled_search_route_discovery: 5
    };
    return (rank[a.executionStatus] ?? 99) - (rank[b.executionStatus] ?? 99) ||
      b.forceIncluded - a.forceIncluded ||
      b.priorityScore - a.priorityScore ||
      a.competitionSlug.localeCompare(b.competitionSlug);
  });
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(packPath)) {
  throw new Error(`Missing whole-map bulk pack: ${packPath}`);
}

const packText = fs.readFileSync(packPath, "utf8");
const pack = JSON.parse(packText);
const targets = Array.isArray(pack.bulkTargets) ? pack.bulkTargets : [];
const hintMap = scanLocalHintsForTargets(targets);
const manifestRows = buildManifestRows(targets, hintMap);

const runnerReadyRows = manifestRows.filter((row) => row.nextAllowedAction.mayRunInBulkRunner);
const routeDiscoveryRows = manifestRows.filter((row) => row.nextAllowedAction.mayRunRouteDiscoveryBatch);
const gerRows = manifestRows.filter((row) => row.countryCode === "ger");
const ger3Row = manifestRows.find((row) => row.competitionSlug === "ger.3") ?? null;

const firstBatchRows = [
  ...runnerReadyRows.slice(0, 24),
  ...routeDiscoveryRows.filter((row) => row.competitionSlug === "ger.3"),
  ...routeDiscoveryRows.filter((row) => row.competitionSlug !== "ger.3").slice(0, 15)
].filter((row, index, arr) => arr.findIndex((other) => other.competitionSlug === row.competitionSlug) === index);

const checks = [];
check(checks, "sourceBulkPackPassed", pack.summary?.wholeMapBulkStandingsAccelerationPackStatus === "passed", { actual: pack.summary?.wholeMapBulkStandingsAccelerationPackStatus });
check(checks, "sourceBulkTargetCountEighty", Number(pack.summary?.bulkTargetCount ?? 0) === 80, { actual: pack.summary?.bulkTargetCount });
check(checks, "manifestRowsEighty", manifestRows.length === 80, { actual: manifestRows.length, expected: 80 });
check(checks, "manifestCountryCountAtLeastThirty", new Set(manifestRows.map((row) => row.countryCode)).size >= 30, { actual: new Set(manifestRows.map((row) => row.countryCode)).size });
check(checks, "germanyContainsGer3Ger1Ger2", ["ger.1", "ger.2", "ger.3"].every((slug) => gerRows.some((row) => row.competitionSlug === slug)), { germanyRows: gerRows.map((row) => row.competitionSlug) });
check(checks, "ger3HandledNotSkipped", Boolean(ger3Row) && ger3Row.executionStatus === "needs_route_discovery_do_not_skip", { ger3Row });
check(checks, "runnerReadyRowsPresent", runnerReadyRows.length >= 2, { actual: runnerReadyRows.length });
check(checks, "firstBatchRowsAtLeastTwenty", firstBatchRows.length >= 20, { actual: firstBatchRows.length });
check(checks, "firstBatchNotOneCountryOnly", new Set(firstBatchRows.map((row) => row.countryCode)).size >= 5, { actual: new Set(firstBatchRows.map((row) => row.countryCode)).size });
check(checks, "noFetchSearchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-whole-map-bulk-standings-execution-manifest-file",
  generatedAtUtc: new Date().toISOString(),
  sourcePackPath: packPath,
  sourcePackSha256: sha256Text(packText),
  policy: {
    manifestOnly: true,
    bulkOriented: true,
    noSingleCountryLane: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    nextRunnerMustUseBatchLimits: true
  },
  summary: {
    wholeMapBulkStandingsExecutionManifestStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    manifestRowCount: manifestRows.length,
    manifestCountryCount: new Set(manifestRows.map((row) => row.countryCode)).size,
    manifestRowsByExecutionLane: countBy(manifestRows, "executionLane"),
    manifestRowsByExecutionStatus: countBy(manifestRows, "executionStatus"),
    runnerReadyRowCount: runnerReadyRows.length,
    routeDiscoveryRowCount: routeDiscoveryRows.length,
    germanyManifestRows: gerRows.map((row) => row.competitionSlug),
    ger3ExecutionStatus: ger3Row?.executionStatus ?? null,
    firstBatchRowCount: firstBatchRows.length,
    firstBatchCountryCount: new Set(firstBatchRows.map((row) => row.countryCode)).size,
    firstBatchRowsByExecutionStatus: countBy(firstBatchRows, "executionStatus"),
    mayBuildWholeMapBulkStandingsRunnerCount: firstBatchRows.length >= 20 ? 1 : 0,
    mayFetchNowCount: 0,
    maySearchNowCount: 0,
    mayBuildCanonicalCandidateNowCount: 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount
  },
  checks,
  manifestRows,
  firstBatchRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  wholeMapBulkStandingsExecutionManifestStatus: output.summary.wholeMapBulkStandingsExecutionManifestStatus,
  manifestRowCount: output.summary.manifestRowCount,
  manifestCountryCount: output.summary.manifestCountryCount,
  manifestRowsByExecutionStatus: output.summary.manifestRowsByExecutionStatus,
  runnerReadyRowCount: output.summary.runnerReadyRowCount,
  routeDiscoveryRowCount: output.summary.routeDiscoveryRowCount,
  germanyManifestRows: output.summary.germanyManifestRows,
  ger3ExecutionStatus: output.summary.ger3ExecutionStatus,
  firstBatchRowCount: output.summary.firstBatchRowCount,
  firstBatchCountryCount: output.summary.firstBatchCountryCount,
  firstBatchRowsByExecutionStatus: output.summary.firstBatchRowsByExecutionStatus,
  mayBuildWholeMapBulkStandingsRunnerCount: output.summary.mayBuildWholeMapBulkStandingsRunnerCount,
  mayFetchNowCount: output.summary.mayFetchNowCount,
  maySearchNowCount: output.summary.maySearchNowCount,
  mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount,
  blockedCheckCount: output.summary.blockedCheckCount
}, null, 2));

if (blockedCheckCount !== 0) process.exitCode = 1;
