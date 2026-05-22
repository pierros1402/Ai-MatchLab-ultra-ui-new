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

const BLOCKED_SCOREBOARD_ONLY_TYPES = new Set([
  "scoreboard_only",
  "scoreboard-only",
  "generic_scoreboard",
  "aggregator_scoreboard_only"
]);

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    input: null,
    output: null,
    pretty: true,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input" && argv[i + 1]) {
      out.input = String(argv[++i]).trim();
      continue;
    }

    if (arg.startsWith("--input=")) {
      out.input = arg.slice("--input=".length).trim();
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

  if (!out.selfTest && !out.input) {
    throw new Error("missing required --input");
  }

  if (!out.output) {
    out.output = out.input
      ? defaultOutputPath(out.input)
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-external-active-source-url-resolutions.validation.json";
  }

  return out;
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/validate-fixture-external-active-source-url-resolutions-file.js --input <source-url-resolution-tasks-or-filled-resolutions.json> --output <validation-report.json>",
    "",
    "Inputs:",
    "  - source URL resolution task report containing urlResolutionsTemplate:[]",
    "  - filled resolution file containing urlResolutions:[] or resolutions:[]",
    "",
    "Guarantees:",
    "  - sourceFetch: false",
    "  - no URL fetch",
    "  - no review decision",
    "  - canonicalWrites: 0",
    "  - productionWrite: false"
  ].join("\n"));
}

function resolvePath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function defaultOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.validated-source-url-resolutions.json`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolvePath(filePath), "utf8"));
}

function writeJson(filePath, value, pretty = true) {
  const abs = resolvePath(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
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

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function extractResolutionRows(input) {
  if (Array.isArray(input?.urlResolutions)) return input.urlResolutions;
  if (Array.isArray(input?.resolutions)) return input.resolutions;
  if (Array.isArray(input?.urlResolutionsTemplate)) return input.urlResolutionsTemplate;
  if (Array.isArray(input)) return input;

  throw new Error("Input must contain urlResolutions[], resolutions[], urlResolutionsTemplate[], or be an array.");
}

function normalizeRow(row, index) {
  return {
    index,
    taskId: cleanString(row?.taskId) || `resolution:${index}`,
    leagueSlug: cleanString(row?.leagueSlug),
    name: cleanString(row?.name),
    country: cleanString(row?.country),
    dayKey: cleanString(row?.dayKey),
    searchQuery: cleanString(row?.searchQuery),
    resolvedUrl: cleanString(row?.resolvedUrl),
    sourceType: cleanString(row?.sourceType),
    sourceTitle: cleanString(row?.sourceTitle),
    externallyActive: normalizeBoolean(row?.externallyActive),
    fixtureCountFound: normalizeNumber(row?.fixtureCountFound),
    missingFromSnapshot: normalizeBoolean(row?.missingFromSnapshot),
    reviewerNotes: cleanString(row?.reviewerNotes),
    resolutionState: cleanString(row?.resolutionState || "pending")
  };
}

function sourceTypeState(sourceType) {
  const lowered = cleanString(sourceType).toLowerCase();

  if (!lowered) return "missing_source_type";
  if (BLOCKED_SCOREBOARD_ONLY_TYPES.has(lowered)) return "blocked_scoreboard_only_source_type";
  if (ALLOWED_SOURCE_TYPES.has(lowered)) return "allowed_source_type";

  return "unknown_source_type";
}

function validateRow(row) {
  const errors = [];
  const warnings = [];

  if (!row.taskId) errors.push("missing_task_id");
  if (!row.leagueSlug) errors.push("missing_league_slug");
  if (!row.dayKey) errors.push("missing_day_key");
  if (!row.searchQuery) warnings.push("missing_search_query");

  const hasResolutionAttempt =
    Boolean(row.resolvedUrl) ||
    Boolean(row.sourceType) ||
    row.externallyActive !== null ||
    row.fixtureCountFound !== null ||
    row.missingFromSnapshot !== null ||
    Boolean(row.sourceTitle) ||
    Boolean(row.reviewerNotes);

  if (!hasResolutionAttempt) {
    return {
      ...row,
      validationState: "pending_resolution",
      readyForFetch: false,
      readyForReviewDecision: false,
      sourceTypeState: sourceTypeState(row.sourceType),
      errors,
      warnings,
      blockedReasons: ["resolution_not_filled"]
    };
  }

  if (!row.resolvedUrl) errors.push("missing_resolved_url");
  if (row.resolvedUrl && !isHttpUrl(row.resolvedUrl)) errors.push("invalid_resolved_url");
  if (!row.sourceType) errors.push("missing_source_type");

  const typeState = sourceTypeState(row.sourceType);
  if (typeState === "blocked_scoreboard_only_source_type") {
    errors.push("scoreboard_only_source_type_not_value_ready");
  } else if (typeState === "unknown_source_type") {
    warnings.push("unknown_source_type_requires_review");
  }

  if (row.externallyActive !== true && row.externallyActive !== false) {
    errors.push("externally_active_must_be_boolean");
  }

  if (row.fixtureCountFound === null || !Number.isInteger(row.fixtureCountFound) || row.fixtureCountFound < 0) {
    errors.push("fixture_count_found_must_be_non_negative_integer");
  }

  if (row.missingFromSnapshot !== true && row.missingFromSnapshot !== false) {
    errors.push("missing_from_snapshot_must_be_boolean");
  }

  if (row.externallyActive === true && Number.isInteger(row.fixtureCountFound) && row.fixtureCountFound < 1) {
    errors.push("active_league_requires_positive_fixture_count");
  }

  if (row.externallyActive === false && Number.isInteger(row.fixtureCountFound) && row.fixtureCountFound > 0) {
    warnings.push("inactive_with_positive_fixture_count_requires_review");
  }

  const readyForFetch = errors.length === 0 && Boolean(row.resolvedUrl) && typeState !== "blocked_scoreboard_only_source_type";

  return {
    ...row,
    validationState: errors.length === 0 ? "valid_source_url_resolution" : "invalid_source_url_resolution",
    readyForFetch,
    readyForReviewDecision: false,
    sourceTypeState: typeState,
    errors,
    warnings,
    blockedReasons: errors
  };
}

function summarize(validatedRows) {
  const byValidationState = {};
  const bySourceTypeState = {};
  const byLeague = {};
  let readyForFetchCount = 0;
  let validResolutionCount = 0;
  let invalidResolutionCount = 0;
  let pendingResolutionCount = 0;

  for (const row of validatedRows) {
    byValidationState[row.validationState] = (byValidationState[row.validationState] || 0) + 1;
    bySourceTypeState[row.sourceTypeState] = (bySourceTypeState[row.sourceTypeState] || 0) + 1;

    if (!byLeague[row.leagueSlug]) {
      byLeague[row.leagueSlug] = {
        total: 0,
        pending: 0,
        valid: 0,
        invalid: 0,
        readyForFetch: 0
      };
    }

    byLeague[row.leagueSlug].total += 1;

    if (row.validationState === "pending_resolution") {
      pendingResolutionCount += 1;
      byLeague[row.leagueSlug].pending += 1;
    } else if (row.validationState === "valid_source_url_resolution") {
      validResolutionCount += 1;
      byLeague[row.leagueSlug].valid += 1;
    } else {
      invalidResolutionCount += 1;
      byLeague[row.leagueSlug].invalid += 1;
    }

    if (row.readyForFetch) {
      readyForFetchCount += 1;
      byLeague[row.leagueSlug].readyForFetch += 1;
    }
  }

  return {
    inputRowCount: validatedRows.length,
    pendingResolutionCount,
    validResolutionCount,
    invalidResolutionCount,
    readyForFetchCount,
    readyForReviewDecisionCount: 0,
    byValidationState,
    bySourceTypeState,
    byLeague
  };
}

function buildReport(input, options = {}) {
  const rows = extractResolutionRows(input).map((row, index) => validateRow(normalizeRow(row, index)));
  const summary = summarize(rows);

  return {
    ok: true,
    job: "validate-fixture-external-active-source-url-resolutions-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_external_active_source_url_resolution_validator",
    sourceInput: options.inputPath || null,
    canonicalWrites: 0,
    summary,
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
    validatedRows: rows,
    validSourceUrlResolutions: rows.filter((row) => row.validationState === "valid_source_url_resolution"),
    readyForFetchRows: rows.filter((row) => row.readyForFetch),
    notes: [
      "This job validates source URL resolution rows only.",
      "It does not fetch URLs.",
      "It does not fill sourceUrls/sourceTypes in review packs.",
      "It does not decide externallyActive or create review decisions.",
      "It does not write canonical fixtures."
    ]
  };
}

function runSelfTest() {
  const input = {
    urlResolutions: [
      {
        taskId: "fixture_external_active_source_url_resolution:2026-05-22:est.1:01",
        leagueSlug: "est.1",
        name: "Estonian Meistriliiga",
        country: "estonia",
        dayKey: "2026-05-22",
        searchQuery: "\"Estonian Meistriliiga\" fixtures 2026-05-22",
        resolvedUrl: "https://example.com/fixtures",
        sourceType: "official_federation_fixture_list",
        sourceTitle: "Official fixtures",
        externallyActive: true,
        fixtureCountFound: 2,
        missingFromSnapshot: true,
        reviewerNotes: "Synthetic valid source URL resolution."
      },
      {
        taskId: "fixture_external_active_source_url_resolution:2026-05-22:fro.1:01",
        leagueSlug: "fro.1",
        name: "Faroe Islands Premier League",
        country: "faroe islands",
        dayKey: "2026-05-22",
        searchQuery: "\"Faroe Islands Premier League\" fixtures 2026-05-22",
        resolvedUrl: "",
        sourceType: "",
        externallyActive: null,
        fixtureCountFound: null,
        missingFromSnapshot: null
      },
      {
        taskId: "fixture_external_active_source_url_resolution:2026-05-22:alb.1:01",
        leagueSlug: "alb.1",
        name: "Albanian Superliga",
        country: "albania",
        dayKey: "2026-05-22",
        searchQuery: "\"Albanian Superliga\" fixtures 2026-05-22",
        resolvedUrl: "not a url",
        sourceType: "scoreboard_only",
        externallyActive: true,
        fixtureCountFound: 1,
        missingFromSnapshot: true
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test" });

  if (report.summary.inputRowCount !== 3) {
    throw new Error("self-test failed: expected 3 rows");
  }

  if (report.summary.validResolutionCount !== 1) {
    throw new Error("self-test failed: expected 1 valid resolution");
  }

  if (report.summary.pendingResolutionCount !== 1) {
    throw new Error("self-test failed: expected 1 pending resolution");
  }

  if (report.summary.invalidResolutionCount !== 1) {
    throw new Error("self-test failed: expected 1 invalid resolution");
  }

  if (report.summary.readyForFetchCount !== 1) {
    throw new Error("self-test failed: expected 1 ready-for-fetch row");
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("self-test failed: unsafe guarantees");
  }

  return report;
}

function main() {
  const options = parseArgs();

  const report = options.selfTest
    ? runSelfTest()
    : buildReport(readJson(options.input), { inputPath: options.input });

  writeJson(options.output, report, options.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    output: options.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();