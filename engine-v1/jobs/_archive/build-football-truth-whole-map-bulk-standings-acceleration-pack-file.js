import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-bulk-standings-acceleration-pack-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-bulk-standings-acceleration-pack-2026-06-16.json"
);

const canonicalCandidateDir = path.join(
  "data",
  "football-truth",
  "_state",
  "canonical-standings-candidates"
);

const searchRoots = [
  path.join("data", "football-truth"),
  path.join("engine-v1", "jobs")
];

const suppressed = new Set(["afg.1", "afg.2", "afg.cup", "pak.1", "pak.2", "pak.cup"]);
const completedCanonicalCandidateSlugs = new Set(["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"]);
const forceIncludeIfPresent = ["ger.1", "ger.2", "ger.3", "ger.cup"];
const maxBulkTargets = 80;

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

function readTextSafe(filePath, maxBytes = 8_000_000) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > maxBytes) return { ok: false, skipped: true, reason: "file_too_large", size: stat.size };
    return { ok: true, text: fs.readFileSync(filePath, "utf8"), size: stat.size };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function findCompetitionObjects(value, rows = []) {
  if (Array.isArray(value)) {
    for (const item of value) findCompetitionObjects(item, rows);
  } else if (value && typeof value === "object") {
    if (typeof value.competitionSlug === "string") rows.push(value);
    for (const child of Object.values(value)) findCompetitionObjects(child, rows);
  }
  return rows;
}

function normalizeType(row) {
  const raw = String(row.competitionType ?? row.type ?? row.kind ?? row.category ?? "").toLowerCase();
  if (raw.includes("league")) return "league";
  if (raw.includes("cup")) return "cup";
  if (String(row.competitionSlug ?? "").endsWith(".cup")) return "cup";
  return raw || "unknown";
}

function normalizeRegion(row) {
  return String(row.region ?? row.confederation ?? row.continent ?? row.zone ?? "unknown").toLowerCase();
}

function labelOf(row) {
  return row.competitionLabel ?? row.label ?? row.name ?? row.competitionName ?? row.title ?? row.competitionSlug;
}

function countryCodeOf(slug) {
  return String(slug).split(".")[0];
}

function rowText(row) {
  return JSON.stringify(row).toLowerCase();
}

function providerSignal(row) {
  const text = rowText(row);
  if (text.includes("sportomedia")) return "sportomedia";
  if (text.includes("bundesliga")) return "bundesliga_official";
  if (text.includes("laliga")) return "laliga_official";
  if (text.includes("ntf") || text.includes("eliteserien") || text.includes("obos-ligaen")) return "norway_ntf";
  if (text.includes("spfl") || text.includes("opta")) return "spfl_opta";
  if (text.includes("loi") || text.includes("sseairtricity") || text.includes("extratime")) return "loi";
  if (text.includes("torneopal")) return "torneopal";
  if (text.includes("fifa")) return "fifa";
  if (text.includes("official") || text.includes("standings") || text.includes("table")) return "official_or_standings_signal";
  return "unknown";
}

function sourceQualityScore(filePath, rows) {
  const lower = filePath.toLowerCase();
  let score = 0;
  const uniqueSlugs = new Set(rows.map((row) => row.competitionSlug)).size;
  score += uniqueSlugs;
  if (lower.includes("full-competition-map") || lower.includes("competition-map-inventory")) score += 1000;
  if (lower.includes("inventory")) score += 300;
  if (lower.includes("provider-discovery")) score += 150;
  if (lower.includes("_state")) score -= 400;
  if (lower.includes("canonical-standings-candidates")) score -= 800;
  if (lower.includes("standings-candidates")) score -= 300;
  return score;
}

function discoverUniverseSources() {
  const jsonFiles = searchRoots.flatMap((root) => walkFiles(root, (file) => file.endsWith(".json"), 4000));
  const sourceRows = [];

  for (const file of jsonFiles) {
    const read = readTextSafe(file);
    if (!read.ok) continue;

    try {
      const json = JSON.parse(read.text);
      const rows = findCompetitionObjects(json);
      const uniqueSlugs = new Set(rows.map((row) => row.competitionSlug)).size;
      if (uniqueSlugs >= 20) {
        sourceRows.push({
          file,
          sha256: sha256Text(read.text),
          fileSize: read.size,
          competitionObjectCount: rows.length,
          uniqueCompetitionSlugCount: uniqueSlugs,
          qualityScore: sourceQualityScore(file, rows),
          rows
        });
      }
    } catch {
      continue;
    }
  }

  sourceRows.sort((a, b) => b.qualityScore - a.qualityScore || b.uniqueCompetitionSlugCount - a.uniqueCompetitionSlugCount);
  return sourceRows;
}

function canonicalCoverage() {
  const files = walkFiles(canonicalCandidateDir, (file) => file.endsWith(".json"), 200);
  const rows = [];

  for (const file of files) {
    const read = readTextSafe(file);
    if (!read.ok) continue;
    try {
      const json = JSON.parse(read.text);
      for (const row of findCompetitionObjects(json)) {
        rows.push(row);
      }
    } catch {
      continue;
    }
  }

  return rows.reduce((acc, row) => {
    acc[row.competitionSlug] = (acc[row.competitionSlug] ?? 0) + 1;
    return acc;
  }, {});
}

function dedupeBySlug(rows) {
  const map = new Map();
  for (const row of rows) {
    const slug = row.competitionSlug;
    if (!slug || map.has(slug)) continue;
    map.set(slug, row);
  }
  return [...map.values()].sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)));
}

function priorityScore(row, covered) {
  const slug = row.competitionSlug;
  const type = normalizeType(row);
  const countryCode = countryCodeOf(slug);
  const provider = providerSignal(row);
  let score = 0;

  if (type === "league") score += 1000;
  if (type === "cup") score += 150;
  if (covered[slug]) score -= 5000;
  if (completedCanonicalCandidateSlugs.has(slug)) score -= 5000;
  if (suppressed.has(slug)) score -= 10000;

  if (forceIncludeIfPresent.includes(slug)) score += 2500;

  if (countryCode === "ger") score += 900;
  if (["eng", "fra", "ita", "ned", "por", "bel", "aut", "sui", "den", "fin", "irl", "sco"].includes(countryCode)) score += 550;
  if (["arg", "bra", "usa", "mex", "jpn", "kor", "aus"].includes(countryCode)) score += 350;

  if (provider !== "unknown") score += 400;
  if (provider === "official_or_standings_signal") score += 150;

  return score;
}

function buildBulkTargets(universeRows, covered) {
  const candidates = dedupeBySlug(universeRows)
    .filter((row) => !suppressed.has(row.competitionSlug))
    .filter((row) => !completedCanonicalCandidateSlugs.has(row.competitionSlug))
    .filter((row) => !covered[row.competitionSlug])
    .filter((row) => normalizeType(row) === "league" || forceIncludeIfPresent.includes(row.competitionSlug))
    .map((row) => ({
      competitionSlug: row.competitionSlug,
      competitionLabel: labelOf(row),
      competitionType: normalizeType(row),
      region: normalizeRegion(row),
      countryCode: countryCodeOf(row.competitionSlug),
      providerSignalClass: providerSignal(row),
      priorityScore: priorityScore(row, covered),
      forceIncluded: forceIncludeIfPresent.includes(row.competitionSlug),
      rawSourceHints: {
        sourceUrl: row.sourceUrl ?? row.url ?? row.officialUrl ?? null,
        officialHost: row.officialHost ?? row.officialHintHost ?? row.host ?? null,
        seasonState: row.seasonState ?? row.season_state ?? row.status ?? null
      }
    }))
    .filter((row) => row.priorityScore > -1000)
    .sort((a, b) => b.forceIncluded - a.forceIncluded || b.priorityScore - a.priorityScore || a.competitionSlug.localeCompare(b.competitionSlug));

  const forced = candidates.filter((row) => row.forceIncluded);
  const rest = candidates.filter((row) => !row.forceIncluded);
  const selectedMap = new Map();

  for (const row of [...forced, ...rest]) {
    if (selectedMap.size >= maxBulkTargets && !row.forceIncluded) continue;
    selectedMap.set(row.competitionSlug, {
      ...row,
      bulkPackStatus: "ready_for_bulk_standings_discovery_or_extraction_lane",
      nextAllowedAction: {
        mayBuildBulkNoWriteRunner: true,
        mayFetchOnlyWithExplicitAllowFetchFlag: true,
        maySearchOnlyWithExplicitAllowSearchFlag: true,
        mayBroadSearch: false,
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      }
    });
  }

  return [...selectedMap.values()].sort((a, b) => b.forceIncluded - a.forceIncluded || b.priorityScore - a.priorityScore || a.competitionSlug.localeCompare(b.competitionSlug));
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

const sources = discoverUniverseSources();
const bestSource = sources[0] ?? null;
const universeRows = bestSource ? dedupeBySlug(bestSource.rows) : [];
const covered = canonicalCoverage();
const bulkTargets = buildBulkTargets(universeRows, covered);
const gerTargets = bulkTargets.filter((row) => row.countryCode === "ger");
const forcePresence = Object.fromEntries(forceIncludeIfPresent.map((slug) => [slug, universeRows.some((row) => row.competitionSlug === slug)]));
const forceSelected = Object.fromEntries(forceIncludeIfPresent.map((slug) => [slug, bulkTargets.some((row) => row.competitionSlug === slug)]));

const checks = [];
check(checks, "universeSourceFound", Boolean(bestSource), { source: bestSource?.file ?? null });
check(checks, "universeHasLargeSlugCount", universeRows.length >= 300, { actual: universeRows.length, expectedAtLeast: 300 });
check(checks, "bulkTargetsAtLeastForty", bulkTargets.length >= 40, { actual: bulkTargets.length, expectedAtLeast: 40 });
check(checks, "bulkTargetsNotOneCountryOnly", new Set(bulkTargets.map((row) => row.countryCode)).size >= 10, { countryCount: new Set(bulkTargets.map((row) => row.countryCode)).size });
check(checks, "germanyTargetsIncluded", gerTargets.length >= 2, { germanyTargets: gerTargets.map((row) => row.competitionSlug) });
check(checks, "ger3HandledIfPresent", forcePresence["ger.3"] ? forceSelected["ger.3"] === true : true, { ger3Present: forcePresence["ger.3"], ger3Selected: forceSelected["ger.3"] });
check(checks, "completedCanonicalCandidatesExcluded", [...completedCanonicalCandidateSlugs].every((slug) => !bulkTargets.some((row) => row.competitionSlug === slug)));
check(checks, "suppressedExcluded", [...suppressed].every((slug) => !bulkTargets.some((row) => row.competitionSlug === slug)));
check(checks, "noFetchSearchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-whole-map-bulk-standings-acceleration-pack-file",
  generatedAtUtc: new Date().toISOString(),
  policy: {
    packOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    nextRunnerMustBeBatchOriented: true,
    oneCountryAtATimeRejected: true
  },
  sourceCandidates: sources.slice(0, 12).map((source) => ({
    file: source.file,
    sha256: source.sha256,
    fileSize: source.fileSize,
    competitionObjectCount: source.competitionObjectCount,
    uniqueCompetitionSlugCount: source.uniqueCompetitionSlugCount,
    qualityScore: source.qualityScore
  })),
  selectedUniverseSource: bestSource ? {
    file: bestSource.file,
    sha256: bestSource.sha256,
    fileSize: bestSource.fileSize,
    uniqueCompetitionSlugCount: bestSource.uniqueCompetitionSlugCount,
    qualityScore: bestSource.qualityScore
  } : null,
  canonicalCandidateCoverage: {
    coveredCompetitionCount: Object.keys(covered).length,
    rowsByCompetition: Object.fromEntries(Object.entries(covered).sort(([a], [b]) => a.localeCompare(b)))
  },
  forcePresence,
  forceSelected,
  summary: {
    wholeMapBulkStandingsAccelerationPackStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    selectedUniverseCompetitionCount: universeRows.length,
    bulkTargetCount: bulkTargets.length,
    bulkTargetCountryCount: new Set(bulkTargets.map((row) => row.countryCode)).size,
    bulkTargetsByCountry: countBy(bulkTargets, "countryCode"),
    bulkTargetsByProviderSignalClass: countBy(bulkTargets, "providerSignalClass"),
    germanyBulkTargetCount: gerTargets.length,
    germanyBulkTargets: gerTargets.map((row) => row.competitionSlug),
    ger3PresentInUniverse: forcePresence["ger.3"],
    ger3SelectedInBulkPack: forceSelected["ger.3"],
    maxBulkTargets,
    mayBuildWholeMapBulkStandingsDiscoveryRunnerCount: bulkTargets.length >= 40 ? 1 : 0,
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
  bulkTargets
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  wholeMapBulkStandingsAccelerationPackStatus: output.summary.wholeMapBulkStandingsAccelerationPackStatus,
  selectedUniverseCompetitionCount: output.summary.selectedUniverseCompetitionCount,
  bulkTargetCount: output.summary.bulkTargetCount,
  bulkTargetCountryCount: output.summary.bulkTargetCountryCount,
  germanyBulkTargets: output.summary.germanyBulkTargets,
  ger3PresentInUniverse: output.summary.ger3PresentInUniverse,
  ger3SelectedInBulkPack: output.summary.ger3SelectedInBulkPack,
  bulkTargetsByProviderSignalClass: output.summary.bulkTargetsByProviderSignalClass,
  mayBuildWholeMapBulkStandingsDiscoveryRunnerCount: output.summary.mayBuildWholeMapBulkStandingsDiscoveryRunnerCount,
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
