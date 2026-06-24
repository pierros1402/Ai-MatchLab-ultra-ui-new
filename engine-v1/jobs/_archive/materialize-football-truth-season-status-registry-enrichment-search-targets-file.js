import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    limit: 0,
    includeGeneric: true,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = String(argv[++i] || "").trim();
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = String(argv[++i] || "").trim();
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--limit") args.limit = Number(argv[++i] || 0);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--missing-only") args.includeGeneric = false;
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 0;
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
  return asText(row.competitionName || row.leagueName || row.name || row.displayName || slugOf(row));
}

function familyOf(row) {
  return asText(row.competitionFamily || row.family || row.coverageFamily);
}

function typeOf(row) {
  return asText(row.competitionType || row.type || row.coverageType);
}

function countryOf(row) {
  return asText(row.country || row.coverageCountry);
}

function regionOf(row) {
  return asText(row.region || row.coverageRegion);
}

function tierOf(row) {
  const value = row.tier ?? row.coverageTier ?? "";
  return value === "" || value == null ? "" : String(value);
}

function priorityOf(row) {
  return asText(row.priority || row.inventoryPriority || "unknown");
}

function normalizeHost(host) {
  return asText(host).toLowerCase().replace(/^www\./, "");
}

function isCupOrContinental(row) {
  const family = familyOf(row).toLowerCase();
  const type = typeOf(row).toLowerCase();

  return family.includes("cup") ||
    family.includes("continental") ||
    family.includes("global") ||
    type === "cup" ||
    type === "continental" ||
    type === "global";
}

function baseIntentTerms(row) {
  if (isCupOrContinental(row)) {
    return "official fixtures results calendar schedule rounds final winner";
  }

  return "official fixtures results calendar schedule standings table";
}

function missingOfficialQueries(row) {
  const name = nameOf(row);
  const country = countryOf(row);
  const season = "2025-2026";
  const terms = baseIntentTerms(row);

  const base = [name, country, season, terms].filter(Boolean).join(" ");
  const federation = [country, name, "official competition fixtures results standings"].filter(Boolean).join(" ");

  return [
    base,
    federation
  ].filter(Boolean);
}

function genericHostQueries(row) {
  const name = nameOf(row);
  const season = "2025-2026";
  const terms = baseIntentTerms(row);
  const hosts = Array.isArray(row.officialRegistryHostnames) ? row.officialRegistryHostnames.map(normalizeHost).filter(Boolean) : [];

  return hosts.flatMap((host) => [
    `${host} ${name} ${season} ${terms}`,
    `${host} ${name} fixtures calendar standings results`
  ]);
}

function rowPriorityScore(row) {
  const tier = Number(tierOf(row) || 99);
  const priority = priorityOf(row);
  const state = asText(row.officialRegistryCoverageState);

  let score = 0;

  if (priority === "ft_repair_and_season_status") score += 500;
  if (priority === "fixture_acquisition_and_season_status") score += 420;

  if (state === "missing_official_registry_candidate") score += 160;
  if (state === "has_only_generic_official_registry_candidate") score += 120;

  if (tier === 1) score += 90;
  else if (tier === 2) score += 60;
  else if (tier === 3) score += 35;

  if (regionOf(row) === "europe") score += 25;
  if (regionOf(row) === "americas") score += 15;

  return score;
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [
      row.competitionSlug,
      row.targetType,
      row.query
    ].join("|").toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function buildSearchTargets(input, options = {}) {
  const missingRows = Array.isArray(input?.missingOfficialRegistryRows) ? input.missingOfficialRegistryRows : [];
  const genericRows = options.includeGeneric === false
    ? []
    : Array.isArray(input?.genericOnlyOfficialRegistryRows)
      ? input.genericOnlyOfficialRegistryRows
      : [];

  const targets = [];

  for (const row of missingRows) {
    const slug = slugOf(row);
    if (!slug) continue;

    for (const [index, query] of missingOfficialQueries(row).entries()) {
      targets.push({
        searchTargetId: `${slug}::season_status_registry_enrichment::missing_official::${index + 1}`,
        targetType: "season-status-official-registry-missing",
        enrichmentState: "missing_official_registry_candidate",
        competitionSlug: slug,
        leagueSlug: slug,
        competitionName: nameOf(row),
        country: countryOf(row),
        region: regionOf(row),
        competitionFamily: familyOf(row),
        competitionType: typeOf(row),
        tier: tierOf(row),
        priority: priorityOf(row),
        priorityScore: rowPriorityScore(row),
        query,
        expectedSourceFamily: "official_league_or_competition",
        desiredUrlClass: "fixture_calendar_or_competition_specific",
        acceptanceCriteria: {
          mustBeOfficialLeagueCompetitionOrFederationDomain: true,
          mustExposeFixturesCalendarResultsStandingsOrCompetitionPages: true,
          mustNotBeGenericNewsOnly: true,
          mustNotBeSearchEngineResult: true,
          mustNotBeThirdPartyScoresOnly: true
        },
        sourceFetch: false,
        noSearch: true,
        noFetch: true,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
    }
  }

  for (const row of genericRows) {
    const slug = slugOf(row);
    if (!slug) continue;

    for (const [index, query] of genericHostQueries(row).entries()) {
      targets.push({
        searchTargetId: `${slug}::season_status_registry_enrichment::generic_host::${index + 1}`,
        targetType: "season-status-official-registry-generic-host",
        enrichmentState: "has_only_generic_official_registry_candidate",
        competitionSlug: slug,
        leagueSlug: slug,
        competitionName: nameOf(row),
        country: countryOf(row),
        region: regionOf(row),
        competitionFamily: familyOf(row),
        competitionType: typeOf(row),
        tier: tierOf(row),
        priority: priorityOf(row),
        priorityScore: rowPriorityScore(row),
        officialRegistryHostnames: Array.isArray(row.officialRegistryHostnames) ? row.officialRegistryHostnames : [],
        officialRegistryUrlClasses: Array.isArray(row.officialRegistryUrlClasses) ? row.officialRegistryUrlClasses : [],
        query,
        expectedSourceFamily: "official_league_or_competition",
        desiredUrlClass: "fixture_calendar_or_competition_specific",
        acceptanceCriteria: {
          mustStayOnKnownOfficialHost: true,
          mustExposeFixturesCalendarResultsStandingsOrCompetitionPages: true,
          mustNotBeGenericNewsOnly: true,
          mustNotBeSearchEngineResult: true,
          mustNotBeThirdPartyScoresOnly: true
        },
        sourceFetch: false,
        noSearch: true,
        noFetch: true,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
    }
  }

  const deduped = dedupeRows(targets)
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      if (a.region !== b.region) return String(a.region).localeCompare(String(b.region));
      if (a.country !== b.country) return String(a.country).localeCompare(String(b.country));
      return String(a.competitionSlug).localeCompare(String(b.competitionSlug));
    });

  const limit = Number(options.limit || 0);
  return limit > 0 ? deduped.slice(0, limit) : deduped;
}

function groupBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport(input, options = {}) {
  const searchTargetRows = buildSearchTargets(input, options);

  return {
    ok: true,
    job: "materialize-football-truth-season-status-registry-enrichment-search-targets-file",
    mode: "read_only_season_status_registry_enrichment_search_target_materialization",
    generatedAt: new Date().toISOString(),
    options: {
      limit: Number(options.limit || 0),
      includeGeneric: options.includeGeneric !== false
    },
    summary: {
      sourceMissingOfficialRegistryRows: Array.isArray(input?.missingOfficialRegistryRows) ? input.missingOfficialRegistryRows.length : 0,
      sourceGenericOnlyOfficialRegistryRows: Array.isArray(input?.genericOnlyOfficialRegistryRows) ? input.genericOnlyOfficialRegistryRows.length : 0,
      searchTargetCount: searchTargetRows.length,
      byTargetType: groupBy(searchTargetRows, "targetType"),
      byRegion: groupBy(searchTargetRows, "region"),
      byCountry: groupBy(searchTargetRows, "country"),
      byCompetitionFamily: groupBy(searchTargetRows, "competitionFamily"),
      byTier: groupBy(searchTargetRows, "tier"),
      byPriority: groupBy(searchTargetRows, "priority"),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      inputOnlyFromCoverageGapReport: true,
      noWebSearch: true,
      noSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noRegistryWrites: true,
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
      "This job does not search or fetch.",
      "It turns season-status official-registry coverage gaps into batch search targets.",
      "The targets are league/competition-level, not team-news tasks."
    ],
    searchTargetRows,
    targetRows: searchTargetRows
  };
}

function runSelfTest() {
  const input = {
    missingOfficialRegistryRows: [
      {
        competitionSlug: "bel.1",
        competitionName: "Belgian Pro League",
        country: "belgium",
        region: "europe",
        competitionFamily: "domestic_league",
        competitionType: "league",
        tier: "1",
        priority: "ft_repair_and_season_status",
        officialRegistryCoverageState: "missing_official_registry_candidate"
      }
    ],
    genericOnlyOfficialRegistryRows: [
      {
        competitionSlug: "eng.1",
        competitionName: "Premier League",
        country: "england",
        region: "europe",
        competitionFamily: "domestic_league",
        competitionType: "league",
        tier: "1",
        priority: "ft_repair_and_season_status",
        officialRegistryCoverageState: "has_only_generic_official_registry_candidate",
        officialRegistryHostnames: ["premierleague.com"],
        officialRegistryUrlClasses: ["news_or_media"]
      }
    ]
  };

  const report = buildReport(input, { limit: 10 });

  if (report.summary.searchTargetCount !== 4) throw new Error("expected four search targets");
  if (report.summary.byTargetType["season-status-official-registry-missing"] !== 2) throw new Error("expected two missing official targets");
  if (report.summary.byTargetType["season-status-official-registry-generic-host"] !== 2) throw new Error("expected two generic host targets");
  if (!report.searchTargetRows.find((row) => row.competitionSlug === "bel.1" && /official fixtures results calendar/i.test(row.query))) {
    throw new Error("expected Belgian Pro League official registry query");
  }
  if (!report.searchTargetRows.find((row) => row.competitionSlug === "eng.1" && /premierleague\.com/i.test(row.query))) {
    throw new Error("expected host-biased Premier League query");
  }
  if (report.guarantees.noSearch !== true || report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "materialize-football-truth-season-status-registry-enrichment-search-targets-file",
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

  const report = buildReport(readJson(args.input), {
    limit: args.limit,
    includeGeneric: args.includeGeneric
  });

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