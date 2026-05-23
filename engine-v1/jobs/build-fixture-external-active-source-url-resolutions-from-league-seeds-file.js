import fs from "node:fs";
import path from "node:path";

const ALLOWED_SOURCE_TYPES = new Set([
  "official_federation_fixture_list",
  "official_league_fixture_list",
  "official_competition_fixture_list",
  "official_club_fixture_cross_check",
  "trusted_structured_provider_cross_check",
  "official_or_high_trust_fixture_source"
]);

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    tasks: null,
    seeds: null,
    output: null,
    maxSeedsPerLeague: 3,
    pretty: true,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--tasks" && argv[i + 1]) {
      out.tasks = String(argv[++i]).trim();
      continue;
    }

    if (arg.startsWith("--tasks=")) {
      out.tasks = arg.slice("--tasks=".length).trim();
      continue;
    }

    if (arg === "--seeds" && argv[i + 1]) {
      out.seeds = String(argv[++i]).trim();
      continue;
    }

    if (arg.startsWith("--seeds=")) {
      out.seeds = arg.slice("--seeds=".length).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      out.output = String(argv[++i]).trim();
      continue;
    }

    if (arg.startsWith("--output=")) {
      out.output = arg.slice("--output=".length).trim();
      continue;
    }

    if (arg === "--max-seeds-per-league" && argv[i + 1]) {
      out.maxSeedsPerLeague = readPositiveInteger(argv[++i], "--max-seeds-per-league");
      continue;
    }

    if (arg.startsWith("--max-seeds-per-league=")) {
      out.maxSeedsPerLeague = readPositiveInteger(arg.slice("--max-seeds-per-league=".length), "--max-seeds-per-league");
      continue;
    }

    if (arg === "--compact") {
      out.pretty = false;
      continue;
    }

    if (arg === "--self-test") {
      out.selfTest = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!out.selfTest && !out.tasks) {
    throw new Error("missing required --tasks");
  }

  if (!out.output) {
    out.output = out.tasks
      ? defaultOutputPath(out.tasks)
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-external-active-source-url-resolutions-from-league-seeds.json";
  }

  return out;
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/build-fixture-external-active-source-url-resolutions-from-league-seeds-file.js --tasks <source-url-resolution-tasks.json> --seeds <league-source-seeds.json> --output <url-resolutions.json>",
    "",
    "Seed input shape:",
    "  { leagueSeeds: [{ leagueSlug, resolvedUrl, sourceType, externallyActive, fixtureCountFound, missingFromSnapshot, sourceTitle, reviewerNotes }] }",
    "",
    "If --seeds is omitted, the job emits leagueSeedTemplate[] only.",
    "",
    "Guarantees:",
    "  - sourceFetch: false",
    "  - noUrlFetch: true",
    "  - noReviewDecision: true",
    "  - canonicalWrites: 0",
    "  - productionWrite: false"
  ].join("\n"));
}

function readPositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return number;
}

function resolvePath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function defaultOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.url-resolutions-from-league-seeds.json`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolvePath(filePath), "utf8"));
}

function writeJson(filePath, value, pretty = true) {
  const abs = resolvePath(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeUrl(value) {
  const raw = cleanString(value);

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function extractCases(tasksReport) {
  if (Array.isArray(tasksReport?.cases)) return tasksReport.cases;
  throw new Error("Tasks input must contain cases[].");
}

function extractSeeds(seedInput) {
  if (!seedInput) return [];
  if (Array.isArray(seedInput?.leagueSeeds)) return seedInput.leagueSeeds;
  if (Array.isArray(seedInput?.seeds)) return seedInput.seeds;
  if (Array.isArray(seedInput)) return seedInput;
  throw new Error("Seeds input must contain leagueSeeds[], seeds[], or be an array.");
}

function firstTaskOf(oneCase) {
  return asArray(oneCase?.resolutionTasks)[0] || null;
}

function buildLeagueSeedTemplate(oneCase) {
  const task = firstTaskOf(oneCase);

  return {
    leagueSlug: cleanString(oneCase?.leagueSlug),
    name: cleanString(oneCase?.name),
    country: cleanString(oneCase?.country),
    dayKey: cleanString(oneCase?.dayKey),
    taskCount: asArray(oneCase?.resolutionTasks).length,
    primaryTaskId: cleanString(task?.taskId),
    primarySearchQuery: cleanString(task?.searchQuery),
    sourceResolutionMode: cleanString(task?.sourceResolutionMode),
    preferredSourceHints: asArray(task?.preferredSourceHints).map(cleanString).filter(Boolean),
    acceptanceRules: asArray(task?.acceptanceRules).map(cleanString).filter(Boolean),
    seedFieldsToFill: {
      resolvedUrl: null,
      sourceType: "official_federation_fixture_list",
      sourceTitle: "",
      externallyActive: null,
      fixtureCountFound: null,
      missingFromSnapshot: true,
      reviewerNotes: ""
    }
  };
}

function normalizeSeed(seed, index) {
  return {
    index,
    leagueSlug: cleanString(seed?.leagueSlug),
    resolvedUrl: normalizeUrl(seed?.resolvedUrl),
    sourceType: cleanString(seed?.sourceType),
    sourceTitle: cleanString(seed?.sourceTitle),
    externallyActive: normalizeBoolean(seed?.externallyActive),
    fixtureCountFound: normalizeNumber(seed?.fixtureCountFound),
    missingFromSnapshot: normalizeBoolean(seed?.missingFromSnapshot),
    reviewerNotes: cleanString(seed?.reviewerNotes)
  };
}

function validateSeed(seed) {
  const errors = [];
  const warnings = [];

  if (!seed.leagueSlug) errors.push("missing_league_slug");
  if (!seed.resolvedUrl) errors.push("missing_or_invalid_resolved_url");
  if (!seed.sourceType) errors.push("missing_source_type");
  if (seed.sourceType && !ALLOWED_SOURCE_TYPES.has(seed.sourceType)) warnings.push("source_type_not_in_allowed_set");
  if (seed.externallyActive !== true && seed.externallyActive !== false) errors.push("externally_active_must_be_boolean");
  if (seed.fixtureCountFound === null || !Number.isInteger(seed.fixtureCountFound) || seed.fixtureCountFound < 0) {
    errors.push("fixture_count_found_must_be_non_negative_integer");
  }
  if (seed.missingFromSnapshot !== true && seed.missingFromSnapshot !== false) errors.push("missing_from_snapshot_must_be_boolean");
  if (seed.externallyActive === true && Number.isInteger(seed.fixtureCountFound) && seed.fixtureCountFound < 1) {
    errors.push("active_seed_requires_positive_fixture_count");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

function groupSeedsByLeague(seeds, maxSeedsPerLeague) {
  const byLeague = new Map();

  for (const rawSeed of seeds) {
    const seed = normalizeSeed(rawSeed, byLeague.size);
    if (!seed.leagueSlug) continue;

    if (!byLeague.has(seed.leagueSlug)) byLeague.set(seed.leagueSlug, []);
    const rows = byLeague.get(seed.leagueSlug);

    if (rows.length < maxSeedsPerLeague) {
      rows.push(seed);
    }
  }

  return byLeague;
}

function buildResolutionFromSeed(oneCase, seed, seedIndex) {
  const task = firstTaskOf(oneCase);
  const validation = validateSeed(seed);

  return {
    taskId: seedIndex === 0
      ? cleanString(task?.taskId) || `fixture_external_active_source_url_resolution:${oneCase.dayKey}:${oneCase.leagueSlug}:seed`
      : `${cleanString(task?.taskId) || `fixture_external_active_source_url_resolution:${oneCase.dayKey}:${oneCase.leagueSlug}:seed`}:seed${seedIndex + 1}`,
    leagueSlug: cleanString(oneCase?.leagueSlug),
    name: cleanString(oneCase?.name),
    country: cleanString(oneCase?.country),
    dayKey: cleanString(oneCase?.dayKey),
    searchQuery: cleanString(task?.searchQuery),
    resolvedUrl: seed.resolvedUrl,
    sourceType: seed.sourceType,
    sourceTitle: seed.sourceTitle,
    externallyActive: seed.externallyActive,
    fixtureCountFound: seed.fixtureCountFound,
    missingFromSnapshot: seed.missingFromSnapshot,
    reviewerNotes: seed.reviewerNotes,
    resolutionState: validation.ok ? "seeded_resolution_ready_for_validation" : "seeded_resolution_invalid",
    seedValidation: validation
  };
}

function summarize(cases, seeds, urlResolutions, missingSeedLeagues, invalidSeedRows) {
  return {
    caseCount: cases.length,
    seedInputCount: seeds.length,
    urlResolutionCount: urlResolutions.length,
    missingSeedLeagueCount: missingSeedLeagues.length,
    invalidSeedRowCount: invalidSeedRows.length,
    readyForValidatorCount: urlResolutions.filter((row) => row.resolutionState === "seeded_resolution_ready_for_validation").length
  };
}

function buildReport(tasksReport, seedInput, options = {}) {
  const cases = extractCases(tasksReport);
  const seedTemplate = cases.map(buildLeagueSeedTemplate);
  const seeds = extractSeeds(seedInput);
  const seedsByLeague = groupSeedsByLeague(seeds, options.maxSeedsPerLeague || 3);

  const urlResolutions = [];
  const missingSeedLeagues = [];
  const invalidSeedRows = [];

  for (const oneCase of cases) {
    const leagueSlug = cleanString(oneCase?.leagueSlug);
    const leagueSeeds = seedsByLeague.get(leagueSlug) || [];

    if (leagueSeeds.length === 0) {
      missingSeedLeagues.push({
        leagueSlug,
        name: cleanString(oneCase?.name),
        country: cleanString(oneCase?.country),
        dayKey: cleanString(oneCase?.dayKey),
        reason: "no_league_seed_supplied"
      });
      continue;
    }

    leagueSeeds.forEach((seed, seedIndex) => {
      const row = buildResolutionFromSeed(oneCase, seed, seedIndex);
      urlResolutions.push(row);

      if (row.seedValidation.ok !== true) {
        invalidSeedRows.push(row);
      }
    });
  }

  return {
    ok: true,
    job: "build-fixture-external-active-source-url-resolutions-from-league-seeds-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_external_active_url_resolution_seed_adapter",
    sourceInput: {
      tasks: options.tasksPath || null,
      seeds: options.seedsPath || null
    },
    canonicalWrites: 0,
    summary: summarize(cases, seeds, urlResolutions, missingSeedLeagues, invalidSeedRows),
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noReviewDecision: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    },
    leagueSeedTemplate: seedTemplate,
    urlResolutions,
    missingSeedLeagues,
    invalidSeedRows,
    notes: [
      "This job adapts league-level URL seeds into validator-compatible urlResolutions[].",
      "It does not fetch URLs.",
      "It does not decide external activity beyond copying reviewed seed fields.",
      "The output must still pass validate-fixture-external-active-source-url-resolutions-file.js.",
      "League source seeds are not canonical fixture rows."
    ]
  };
}

function selfTestTasks() {
  return {
    cases: [
      {
        leagueSlug: "est.1",
        name: "Estonian Meistriliiga",
        country: "estonia",
        dayKey: "2026-05-22",
        resolutionTasks: [
          {
            taskId: "fixture_external_active_source_url_resolution:2026-05-22:est.1:01",
            searchQuery: "\"Estonian Meistriliiga\" fixtures 2026-05-22",
            sourceResolutionMode: "official_federation_fixture_list",
            preferredSourceHints: ["official federation competition page"],
            acceptanceRules: ["Evidence must be date-specific for the requested dayKey."]
          }
        ]
      },
      {
        leagueSlug: "fro.1",
        name: "Faroe Islands Premier League",
        country: "faroe islands",
        dayKey: "2026-05-22",
        resolutionTasks: [
          {
            taskId: "fixture_external_active_source_url_resolution:2026-05-22:fro.1:01",
            searchQuery: "\"Faroe Islands Premier League\" fixtures 2026-05-22",
            sourceResolutionMode: "official_league_fixture_list",
            preferredSourceHints: ["official league schedule page"],
            acceptanceRules: ["Evidence must be date-specific for the requested dayKey."]
          }
        ]
      }
    ]
  };
}

function selfTestSeeds() {
  return {
    leagueSeeds: [
      {
        leagueSlug: "est.1",
        resolvedUrl: "https://example.com/fixtures",
        sourceType: "official_federation_fixture_list",
        sourceTitle: "Official fixtures",
        externallyActive: true,
        fixtureCountFound: 2,
        missingFromSnapshot: true,
        reviewerNotes: "Synthetic seed."
      }
    ]
  };
}

function runSelfTest() {
  const report = buildReport(selfTestTasks(), selfTestSeeds(), {
    tasksPath: "self-test-tasks",
    seedsPath: "self-test-seeds",
    maxSeedsPerLeague: 3
  });

  if (report.summary.caseCount !== 2) throw new Error("self-test failed: expected 2 cases");
  if (report.summary.seedInputCount !== 1) throw new Error("self-test failed: expected 1 seed");
  if (report.summary.urlResolutionCount !== 1) throw new Error("self-test failed: expected 1 urlResolution");
  if (report.summary.missingSeedLeagueCount !== 1) throw new Error("self-test failed: expected 1 missing seed league");
  if (report.summary.readyForValidatorCount !== 1) throw new Error("self-test failed: expected 1 ready-for-validator row");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("self-test failed: unsafe guarantees");
  }

  return report;
}

function main() {
  const args = parseArgs();

  const report = args.selfTest
    ? runSelfTest()
    : buildReport(
        readJson(args.tasks),
        args.seeds ? readJson(args.seeds) : null,
        {
          tasksPath: args.tasks,
          seedsPath: args.seeds,
          maxSeedsPerLeague: args.maxSeedsPerLeague
        }
      );

  writeJson(args.output, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();