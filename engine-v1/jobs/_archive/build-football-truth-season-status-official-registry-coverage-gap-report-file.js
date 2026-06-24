import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { leagueName } from "../../workers/_shared/leagues-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    inventory: "",
    candidates: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--inventory") args.inventory = String(argv[++i] || "").trim();
    else if (arg.startsWith("--inventory=")) args.inventory = arg.slice("--inventory=".length);
    else if (arg === "--candidates") args.candidates = String(argv[++i] || "").trim();
    else if (arg.startsWith("--candidates=")) args.candidates = arg.slice("--candidates=".length);
    else if (arg === "--output") args.output = String(argv[++i] || "").trim();
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.inventory) throw new Error("--inventory is required");
  if (!args.selfTest && !args.candidates) throw new Error("--candidates is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(repoRoot, filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function slugOf(row) {
  return asText(row.competitionSlug || row.leagueSlug || row.targetLeagueSlug || row.slug);
}

function nameOf(row) {
  return asText(row.competitionName || row.leagueName || row.name || row.displayName);
}

function familyOf(row) {
  return asText(row.competitionFamily || row.family || row.coverageFamily || row.competitionType || row.coverageType);
}

function countryOf(row) {
  return asText(row.country || row.coverageCountry || row.countryName || row.region);
}

function tierOf(row) {
  const value = row.tier ?? row.coverageTier ?? row.domesticTier ?? "";
  return value === "" || value == null ? "" : String(value);
}

function priorityOf(row) {
  return asText(row.inventoryPriority || row.priority || row.routingPriority || row.worksetPriority || "unknown");
}

function coverageFamilyFromType(value, country) {
  const type = asText(value).toLowerCase();

  if (type === "league") return country ? "domestic_league" : "continental_or_global";
  if (type === "cup") return country ? "domestic_cup" : "continental_or_global";
  if (type === "continental" || type === "global") return "continental_or_global";

  return "";
}

function coverageMetadataBySlug() {
  const out = new Map();

  for (const row of Array.isArray(LEAGUES_COVERAGE) ? LEAGUES_COVERAGE : []) {
    const slug = asText(row?.slug || row?.leagueSlug || row?.competitionSlug);
    if (!slug) continue;

    const country = asText(row.country);
    const type = asText(row.type);
    const family = coverageFamilyFromType(type, country);

    out.set(slug, {
      leagueSlug: slug,
      competitionSlug: slug,
      competitionName: leagueName(slug),
      country,
      region: asText(row.region),
      competitionFamily: family,
      competitionType: type,
      tier: row.tier ?? "",
      trust: row.trust ?? ""
    });
  }

  return out;
}

function mergedMetadata(row, candidateRows, coverageBySlug) {
  const slug = slugOf(row);
  const coverage = coverageBySlug.get(slug) || {};
  const candidate = Array.isArray(candidateRows) && candidateRows.length ? candidateRows[0] : {};

  const country = asText(coverage.country || candidate.country || candidate.coverageCountry || row.country || row.coverageCountry || row.countryName);
  const region = asText(coverage.region || candidate.region || candidate.coverageRegion || row.region || row.coverageRegion);
  const type = asText(coverage.competitionType || candidate.competitionType || candidate.coverageType || row.competitionType || row.coverageType);
  const family = asText(coverage.competitionFamily || candidate.competitionFamily || candidate.family || candidate.coverageFamily || row.competitionFamily || row.family || row.coverageFamily || coverageFamilyFromType(type, country));
  const tier = coverage.tier ?? candidate.tier ?? candidate.coverageTier ?? row.tier ?? row.coverageTier ?? row.domesticTier ?? "";
  const trust = coverage.trust ?? candidate.trust ?? candidate.coverageTrust ?? row.trust ?? row.coverageTrust ?? "";

  return {
    competitionName: nameOf(row) || asText(candidate.competitionName || candidate.leagueName || coverage.competitionName),
    country,
    region,
    competitionFamily: family,
    competitionType: type,
    tier: tier === "" || tier == null ? "" : String(tier),
    trust: trust === "" || trust == null ? "" : String(trust)
  };
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function collectArrays(value, arrays = [], depth = 0) {
  if (depth > 4 || !value) return arrays;

  if (Array.isArray(value)) {
    arrays.push(value);
    return arrays;
  }

  if (!isObject(value)) return arrays;

  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      if (/(inventory|work|row|league|competition|state|item)/i.test(key)) arrays.push(child);
      continue;
    }

    if (isObject(child)) collectArrays(child, arrays, depth + 1);
  }

  return arrays;
}

function inventoryRowsFrom(input) {
  const arrays = [];

  if (Array.isArray(input)) arrays.push(input);

  for (const key of [
    "inventoryRows",
    "workRows",
    "footballTruthWorkRows",
    "stateWorkRows",
    "worksetRows",
    "rows",
    "items"
  ]) {
    if (Array.isArray(input?.[key])) arrays.push(input[key]);
  }

  for (const arr of collectArrays(input)) arrays.push(arr);

  const seen = new Set();
  const rows = [];

  for (const arr of arrays) {
    for (const row of arr) {
      if (!isObject(row)) continue;

      const slug = slugOf(row);
      if (!slug) continue;

      if (seen.has(slug)) continue;
      seen.add(slug);
      rows.push(row);
    }
  }

  return rows;
}

function candidateRowsFrom(input) {
  const arrays = [];

  if (Array.isArray(input)) arrays.push(input);

  for (const key of [
    "rankedCandidateUrlRows",
    "candidateUrlRows",
    "readyForFetchRows",
    "fetchTaskRows",
    "rows",
    "items"
  ]) {
    if (Array.isArray(input?.[key])) arrays.push(input[key]);
  }

  const rows = [];
  const seen = new Set();

  for (const arr of arrays) {
    for (const row of arr) {
      if (!isObject(row)) continue;

      const slug = slugOf(row);
      const url = asText(row.candidateUrl || row.resolvedUrl || row.finalUrl || row.url);
      if (!slug || !url) continue;

      const key = `${slug}|${url.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  return rows;
}

function urlClass(row) {
  const url = asText(row.candidateUrl || row.resolvedUrl || row.finalUrl || row.url).toLowerCase();
  const sourceType = asText(row.officialRegistrySource?.type || row.sourceType).toLowerCase();

  if (/(fixture|fixtures|schedule|calendar|match-centre|matches|results|standings|table|competition|competitions)/i.test(url)) {
    return "fixture_calendar_or_competition_specific";
  }

  if (sourceType === "site_search" || /(\?s=|\/search\/|\bsearch\b)/i.test(url)) {
    return "site_search";
  }

  if (/(news|nieuws|nyheter|noticias|actualites|media|press)/i.test(url)) {
    return "news_or_media";
  }

  if (/^https?:\/\/[^/]+\/?$/i.test(url)) {
    return "homepage";
  }

  return "generic_official_page";
}

function groupBy(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = asText(typeof keyFn === "function" ? keyFn(row) : row[keyFn]) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function buildReport(inventoryInput, candidateInput) {
  const inventoryRows = inventoryRowsFrom(inventoryInput);
  const candidateRows = candidateRowsFrom(candidateInput);
  const coverageBySlug = coverageMetadataBySlug();

  const candidatesBySlug = new Map();
  for (const row of candidateRows) {
    const slug = slugOf(row);
    if (!candidatesBySlug.has(slug)) candidatesBySlug.set(slug, []);
    candidatesBySlug.get(slug).push(row);
  }

  const coverageRows = inventoryRows.map((row) => {
    const slug = slugOf(row);
    const candidates = candidatesBySlug.get(slug) || [];
    const metadata = mergedMetadata(row, candidates, coverageBySlug);
    const classes = [...new Set(candidates.map(urlClass))].sort();
    const hasCandidate = candidates.length > 0;
    const hasFixtureSpecificCandidate = classes.includes("fixture_calendar_or_competition_specific");
    const hasOnlyGenericCandidate = hasCandidate && !hasFixtureSpecificCandidate;

    return {
      competitionSlug: slug,
      leagueSlug: slug,
      competitionName: metadata.competitionName,
      country: metadata.country,
      region: metadata.region,
      competitionFamily: metadata.competitionFamily,
      competitionType: metadata.competitionType,
      tier: metadata.tier,
      trust: metadata.trust,
      priority: priorityOf(row),
      officialRegistryCandidateCount: candidates.length,
      officialRegistryHostnames: [...new Set(candidates.map((candidate) => asText(candidate.hostname)).filter(Boolean))].sort(),
      officialRegistryUrlClasses: classes,
      officialRegistryCoverageState: hasFixtureSpecificCandidate
        ? "has_fixture_calendar_or_competition_specific_official_registry_candidate"
        : hasCandidate
          ? "has_only_generic_official_registry_candidate"
          : "missing_official_registry_candidate",
      needsRegistryEnrichment: !hasFixtureSpecificCandidate,
      needsOfficialDiscovery: !hasCandidate,
      needsFixtureSpecificUrlDiscovery: hasOnlyGenericCandidate,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  });

  const missingOfficialRegistryRows = coverageRows.filter((row) => row.needsOfficialDiscovery);
  const genericOnlyRows = coverageRows.filter((row) => row.needsFixtureSpecificUrlDiscovery);
  const fixtureSpecificRows = coverageRows.filter((row) => row.officialRegistryCoverageState === "has_fixture_calendar_or_competition_specific_official_registry_candidate");

  return {
    ok: true,
    job: "build-football-truth-season-status-official-registry-coverage-gap-report-file",
    mode: "read_only_official_registry_coverage_gap_report",
    generatedAt: new Date().toISOString(),
    summary: {
      inventoryRowCount: inventoryRows.length,
      candidateInputRowCount: candidateRows.length,
      withOfficialRegistryCandidateCount: coverageRows.filter((row) => row.officialRegistryCandidateCount > 0).length,
      missingOfficialRegistryCandidateCount: missingOfficialRegistryRows.length,
      genericOnlyOfficialRegistryCandidateCount: genericOnlyRows.length,
      fixtureSpecificOfficialRegistryCandidateCount: fixtureSpecificRows.length,
      needsRegistryEnrichmentCount: coverageRows.filter((row) => row.needsRegistryEnrichment).length,
      byCoverageState: groupBy(coverageRows, "officialRegistryCoverageState"),
      byCountry: groupBy(coverageRows, "country"),
      byRegion: groupBy(coverageRows, "region"),
      byCompetitionFamily: groupBy(coverageRows, "competitionFamily"),
      byCompetitionType: groupBy(coverageRows, "competitionType"),
      byTier: groupBy(coverageRows, "tier"),
      byPriority: groupBy(coverageRows, "priority"),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noWebSearch: true,
      noSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
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
    notes: [
      "This report does not discover, search, fetch, or write production data.",
      "It compares inventory/workset rows against already materialized official registry candidate URLs.",
      "Rows marked needsOfficialDiscovery should be handled by batch official-source discovery, not manual per-league editing."
    ],
    coverageRows,
    missingOfficialRegistryRows,
    genericOnlyOfficialRegistryRows: genericOnlyRows,
    fixtureSpecificOfficialRegistryRows: fixtureSpecificRows
  };
}

function runSelfTest() {
  const inventory = {
    inventoryRows: [
      { leagueSlug: "eng.1", competitionName: "Premier League", country: "England", competitionFamily: "domestic_league", tier: 1 },
      { leagueSlug: "esp.1", competitionName: "LaLiga", country: "Spain", competitionFamily: "domestic_league", tier: 1 },
      { leagueSlug: "missing.1", competitionName: "Missing League", country: "Nowhere", competitionFamily: "domestic_league", tier: 1 }
    ]
  };

  const candidates = {
    rankedCandidateUrlRows: [
      { leagueSlug: "eng.1", candidateUrl: "https://www.premierleague.com/en/fixtures", hostname: "premierleague.com" },
      { leagueSlug: "esp.1", candidateUrl: "https://www.laliga.com/en-GB/news", hostname: "laliga.com", officialRegistrySource: { type: "league_news" } }
    ]
  };

  const report = buildReport(inventory, candidates);

  if (report.summary.inventoryRowCount !== 3) throw new Error("expected three inventory rows");
  if (report.summary.withOfficialRegistryCandidateCount !== 2) throw new Error("expected two competitions with candidates");
  if (report.summary.missingOfficialRegistryCandidateCount !== 1) throw new Error("expected one missing official registry candidate");
  if (report.summary.genericOnlyOfficialRegistryCandidateCount !== 1) throw new Error("expected one generic-only official registry candidate");
  if (report.summary.fixtureSpecificOfficialRegistryCandidateCount !== 1) throw new Error("expected one fixture-specific candidate");
  if (!report.coverageRows.find((row) => row.leagueSlug === "eng.1" && row.country === "england" && row.competitionFamily === "domestic_league")) {
    throw new Error("expected coverage metadata join for eng.1");
  }
  if (report.guarantees.noSearch !== true || report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "build-football-truth-season-status-official-registry-coverage-gap-report-file",
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

  const report = buildReport(readJson(args.inventory), readJson(args.candidates));
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    job: report.job,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();