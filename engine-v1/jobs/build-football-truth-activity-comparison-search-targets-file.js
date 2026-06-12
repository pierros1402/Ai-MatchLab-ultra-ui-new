import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    registry: "workers/_shared/leagues-registry.js",
    coverage: "workers/_shared/leagues-coverage.js",
    output: "",
    date: "",
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      args.input = argv[++index] || "";
      continue;
    }

    if (arg === "--registry") {
      args.registry = argv[++index] || "";
      continue;
    }

    if (arg === "--coverage") {
      args.coverage = argv[++index] || "";
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++index] || "";
      continue;
    }

    if (arg === "--date") {
      args.date = argv[++index] || "";
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function selectRows(obj, names) {
  for (const name of names) {
    if (Array.isArray(obj?.[name])) return obj[name];
  }
  return [];
}

function parseLeagueRegistry(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const map = new Map();
  const regex = /"([^"]+)"\s*:\s*"([^"]+)"/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    map.set(match[1], match[2]);
  }

  return map;
}

function parseLeagueCoverage(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const map = new Map();
  const rowRegex = /\{\s*slug:\s*"([^"]+)"\s*,\s*tier:\s*([0-9.]+)\s*,\s*trust:\s*([0-9.]+)\s*,\s*type:\s*"([^"]+)"\s*,\s*region:\s*"([^"]+)"\s*,\s*country:\s*"([^"]+)"\s*\}/g;

  let match;
  while ((match = rowRegex.exec(text)) !== null) {
    map.set(match[1], {
      slug: match[1],
      tier: Number(match[2]),
      trust: Number(match[3]),
      type: match[4],
      region: match[5],
      country: match[6]
    });
  }

  return map;
}

function titleCaseCountry(value) {
  return asText(value)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildQuery(target, name, coverage) {
  const layer = asText(target.comparisonLayer);
  const country = titleCaseCountry(coverage?.country || target.countryCode);
  const countryPart = country ? ` ${country}` : "";
  const display = name || asText(target.competitionSlug);

  if (layer === "primary_official_truth") {
    return `"${display}"${countryPart} football official fixtures standings results schedule season status`;
  }

  return `"${display}"${countryPart} football fixtures standings results schedule Soccerway Flashscore Sofascore FotMob Transfermarkt`;
}

function buildRunnerTarget(target, index, registry, coverageMap) {
  const slug = asText(target.competitionSlug);
  const name = registry.get(slug) || slug;
  const coverage = coverageMap.get(slug) || null;
  const layer = asText(target.comparisonLayer);

  return {
    searchTargetId: [
      asText(target.dayKey) || "unknown-day",
      slug,
      layer || "comparison",
      String(index + 1).padStart(3, "0")
    ].join(":"),
    competitionSlug: slug,
    leagueSlug: slug,
    competitionType: asText(target.competitionType || coverage?.type),
    countryCode: asText(target.countryCode),
    countryName: titleCaseCountry(coverage?.country || target.countryCode),
    region: asText(coverage?.region),
    tier: coverage?.tier ?? null,
    trust: coverage?.trust ?? null,
    displayName: name,
    name,
    comparisonLayer: layer,
    expectedSourceFamily: asText(target.expectedSourceFamily),
    sourceUse: asText(target.sourceUse),
    mayPromoteCanonical: false,
    query: buildQuery(target, name, coverage),
    originalQuery: asText(target.query),
    mappingSource: coverage ? "workers_registry_and_coverage" : "workers_registry_only_or_slug_fallback",
    mappingTruthStatus: "search_bias_only_not_canonical_truth",
    sourceTruthStatus: "unverified_search_target_only",
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildTargets({ batch, registry, coverageMap, date }) {
  const selectedTargetRows = selectRows(batch, ["selectedTargetRows"]);
  const searchTargetRows = selectedTargetRows.map((target, index) =>
    buildRunnerTarget(target, index, registry, coverageMap)
  );

  const byLayer = {};
  const byCompetition = {};
  const byMappingSource = {};
  const missingNameSlugs = new Set();
  const missingCoverageSlugs = new Set();

  for (const row of searchTargetRows) {
    byLayer[row.comparisonLayer] = (byLayer[row.comparisonLayer] || 0) + 1;
    byCompetition[row.competitionSlug] = (byCompetition[row.competitionSlug] || 0) + 1;
    byMappingSource[row.mappingSource] = (byMappingSource[row.mappingSource] || 0) + 1;

    if (row.displayName === row.competitionSlug) missingNameSlugs.add(row.competitionSlug);
    if (!coverageMap.has(row.competitionSlug)) missingCoverageSlugs.add(row.competitionSlug);
  }

  return {
    ok: true,
    job: "build-football-truth-activity-comparison-search-targets-file",
    mode: "read_only_workers_backed_activity_comparison_search_targets",
    generatedAt: new Date().toISOString(),
    date,
    sourceBatch: {
      job: asText(batch.job),
      mode: asText(batch.mode),
      summary: batch.summary || {}
    },
    summary: {
      selectedTargetInputCount: selectedTargetRows.length,
      searchTargetRowCount: searchTargetRows.length,
      competitionCount: Object.keys(byCompetition).length,
      officialTruthTargetCount: byLayer.primary_official_truth || 0,
      secondaryReferenceComparisonTargetCount: byLayer.secondary_reference_comparison || 0,
      registryNameMissingCompetitionCount: missingNameSlugs.size,
      coverageMissingCompetitionCount: missingCoverageSlugs.size,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byLayer,
    byCompetition,
    byMappingSource,
    missingNameSlugs: Array.from(missingNameSlugs).sort(),
    missingCoverageSlugs: Array.from(missingCoverageSlugs).sort(),
    policy: {
      workersRegistryUsedForSearchBiasOnly: true,
      workersCoverageUsedForSearchBiasOnly: true,
      mappingDoesNotPromoteCanonicalTruth: true,
      secondaryReferenceMayNotPromoteCanonical: true,
      noFetch: true,
      noCanonicalPromotion: true,
      zeroResultDoesNotImplyAbsence: true
    },
    searchTargetRows,
    guarantees: {
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const registry = new Map([
    ["eng.1", "Premier League"]
  ]);
  const coverageMap = new Map([
    ["eng.1", { country: "england", region: "europe", type: "league", tier: 1, trust: 1 }]
  ]);
  const batch = {
    selectedTargetRows: [
      {
        competitionSlug: "eng.1",
        countryCode: "eng",
        competitionType: "league",
        dayKey: "2026-06-12",
        comparisonLayer: "primary_official_truth",
        expectedSourceFamily: "official_league"
      },
      {
        competitionSlug: "eng.1",
        countryCode: "eng",
        competitionType: "league",
        dayKey: "2026-06-12",
        comparisonLayer: "secondary_reference_comparison",
        expectedSourceFamily: "reference"
      }
    ]
  };

  const report = buildTargets({ batch, registry, coverageMap, date: "2026-06-12" });

  if (report.summary.searchTargetRowCount !== 2) throw new Error("expected two search targets");
  if (!report.searchTargetRows[0].query.includes("Premier League")) throw new Error("expected readable league name");
  if (!report.searchTargetRows[0].query.includes("England")) throw new Error("expected readable country");
  if (report.searchTargetRows[0].mayPromoteCanonical !== false) throw new Error("must not promote canonical");
  if (report.guarantees.noSearch !== true || report.guarantees.noFetch !== true) throw new Error("expected read-only guarantees");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-activity-comparison-search-targets-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.registry) throw new Error("--registry is required");
  if (!args.coverage) throw new Error("--coverage is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildTargets({
    batch: readJson(args.input),
    registry: parseLeagueRegistry(args.registry),
    coverageMap: parseLeagueCoverage(args.coverage),
    date: args.date
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-activity-comparison-search-targets-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}