#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const ALLOWED_SOURCE_TYPES = new Set([
  "official_league",
  "official_federation",
  "official_competition",
  "official_club",
  "trusted_provider",
  "other"
]);

const ALLOWED_RESOLVED_BY = new Set([
  "manual",
  "external_search",
  "operator",
  "diagnostic"
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: null,
    output: null,
    date: null,
    requireComplete: false,
    selfTest: false,
    pretty: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input" && argv[i + 1]) {
      args.input = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--input=")) {
      args.input = cleanString(arg.slice("--input=".length));
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--output=")) {
      args.output = cleanString(arg.slice("--output=".length));
      continue;
    }

    if (arg === "--date" && argv[i + 1]) {
      args.date = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--date=")) {
      args.date = cleanString(arg.slice("--date=".length));
      continue;
    }

    if (arg === "--require-complete") {
      args.requireComplete = true;
      continue;
    }

    if (arg === "--compact") {
      args.pretty = false;
      continue;
    }

    if (arg === "--pretty") {
      args.pretty = true;
      continue;
    }

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) {
    throw new Error("missing required --input");
  }

  if (!args.output) {
    args.output = args.input
      ? defaultOutputPath(args.input)
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-identity-second-source-url-resolutions.validation.json";
  }

  return args;
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/validate-fixture-identity-second-source-url-resolutions-file.js --date YYYY-MM-DD --input <url-resolution-tasks.json> --output <validation.json>",
    "",
    "Options:",
    "  --require-complete  Treat pending/null resolvedUrl rows as errors.",
    "",
    "Purpose:",
    "  Validate fixture identity second-source URL resolution rows before any fetch/evidence stage.",
    "",
    "Guarantees:",
    "  - read-only diagnostic",
    "  - no fetch",
    "  - no URL fetch",
    "  - no URL resolution side effects",
    "  - no review decision applied",
    "  - no canonical promotion",
    "  - canonicalWrites: 0",
    "  - productionWrite: false",
    "  - dryRun: true"
  ].join("\n"));
}

function defaultOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.validation.json`);
}

function resolvePath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath) {
  const abs = resolvePath(filePath);
  if (!abs) throw new Error("missing required --input");
  return JSON.parse(fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value, pretty = true) {
  const abs = resolvePath(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
}

function normalizeDate(value) {
  const text = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return text;
}

function normalizeUrl(value) {
  const raw = cleanString(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function hostnameOf(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return "";

  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function hostKeys(value) {
  const host = hostnameOf(value || "");
  if (!host) return new Set();

  const keys = new Set([host]);
  if (host.startsWith("www.")) {
    keys.add(host.slice(4));
  } else {
    keys.add(`www.${host}`);
  }

  return keys;
}

function sameHost(a, b) {
  const aKeys = hostKeys(a);
  const bKeys = hostKeys(b);

  for (const key of aKeys) {
    if (bKeys.has(key)) return true;
  }

  return false;
}

function readOnlyGuarantees() {
  return {
    sourceFetch: false,
    noFetch: true,
    noUrlFetch: true,
    noUrlResolutionSideEffects: true,
    noReviewDecisionApplied: true,
    noCanonicalPromotion: true,
    canonicalWrites: 0,
    deploySnapshotWrites: false,
    valueWrites: false,
    detailsWrites: false,
    productionWrite: false,
    dryRun: true
  };
}

function normalizeResolutionTasks(input) {
  if (Array.isArray(input?.resolutionTasks)) return input.resolutionTasks;
  if (Array.isArray(input?.tasks)) return input.tasks;
  return [];
}

function normalizeUrlResolutionRows(input) {
  if (Array.isArray(input?.urlResolutions)) return input.urlResolutions;
  if (Array.isArray(input?.urlResolutionTemplate)) return input.urlResolutionTemplate;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input?.resolutions)) return input.resolutions;
  return [];
}

function taskMapById(tasks) {
  const map = new Map();

  for (const task of tasks) {
    const taskId = cleanString(task?.taskId);
    if (taskId) map.set(taskId, task);
  }

  return map;
}

function pushIssue(list, row, code, message, extra = {}) {
  list.push({
    code,
    message,
    taskId: cleanString(row?.taskId),
    searchTargetId: cleanString(row?.searchTargetId),
    leagueSlug: cleanString(row?.leagueSlug),
    name: cleanString(row?.name),
    targetDate: cleanString(row?.targetDate),
    ...extra
  });
}

function validateResolvedRow(row, index, taskById, options, errors, warnings, acceptedRows, rejectedRows, stats) {
  const taskId = cleanString(row?.taskId);
  const searchTargetId = cleanString(row?.searchTargetId);
  const leagueSlug = cleanString(row?.leagueSlug);
  const targetDate = cleanString(row?.targetDate);
  const resolvedUrlRaw = cleanString(row?.resolvedUrl || row?.url || row?.sourceUrl);
  const resolvedUrl = normalizeUrl(resolvedUrlRaw);
  const sourceName = cleanString(row?.sourceName);
  const sourceType = cleanString(row?.sourceType).toLowerCase();
  const resolvedBy = cleanString(row?.resolvedBy).toLowerCase();
  const reviewerNotes = cleanString(row?.reviewerNotes || row?.notes);

  const task = taskById.get(taskId) || null;
  const rowErrors = [];
  const rowWarnings = [];

  stats.inputResolutionRowCount += 1;

  if (!taskId) rowErrors.push("missing_task_id");
  if (taskId && !task) rowErrors.push("unknown_task_id");

  if (!searchTargetId) rowErrors.push("missing_search_target_id");
  if (task && searchTargetId && searchTargetId !== cleanString(task.searchTargetId)) {
    rowErrors.push("search_target_id_mismatch");
  }

  if (!leagueSlug) rowErrors.push("missing_league_slug");
  if (task && leagueSlug && leagueSlug !== cleanString(task.leagueSlug)) {
    rowErrors.push("league_slug_mismatch");
  }

  if (!normalizeDate(targetDate)) rowErrors.push("invalid_target_date");
  if (options.date && targetDate !== options.date) {
    rowErrors.push("target_date_mismatch");
  }
  if (task && targetDate && targetDate !== cleanString(task.targetDate)) {
    rowErrors.push("task_target_date_mismatch");
  }

  if (!resolvedUrlRaw) {
    stats.pendingResolutionCount += 1;

    if (options.requireComplete) {
      rowErrors.push("pending_resolved_url");
    } else {
      rowWarnings.push("pending_resolved_url");
    }
  } else if (!resolvedUrl) {
    rowErrors.push("invalid_or_missing_http_url");
  }

  if (resolvedUrl) {
    if (!sourceName) rowWarnings.push("missing_source_name");

    if (!sourceType) {
      rowErrors.push("missing_source_type");
    } else if (!ALLOWED_SOURCE_TYPES.has(sourceType)) {
      rowErrors.push("invalid_source_type");
    }

    if (!resolvedBy) {
      rowErrors.push("missing_resolved_by");
    } else if (!ALLOWED_RESOLVED_BY.has(resolvedBy)) {
      rowErrors.push("invalid_resolved_by");
    }

    const excludedHosts = asArray(task?.policy?.excludedHosts).map(cleanString).filter(Boolean);
    const matchedExcludedHost = excludedHosts.find((host) => sameHost(resolvedUrl, `https://${host}`));

    if (matchedExcludedHost) {
      rowErrors.push("resolved_url_uses_excluded_host");
    }

    if (!reviewerNotes) {
      rowWarnings.push("missing_reviewer_notes");
    }
  }

  for (const code of rowErrors) {
    pushIssue(errors, row, code, issueMessage(code), {
      rowIndex: index,
      resolvedUrl: resolvedUrl || null
    });
  }

  for (const code of rowWarnings) {
    pushIssue(warnings, row, code, issueMessage(code), {
      rowIndex: index,
      resolvedUrl: resolvedUrl || null
    });
  }

  const normalized = {
    index,
    taskId,
    searchTargetId,
    leagueSlug,
    name: cleanString(row?.name || task?.name),
    targetDate,
    query: cleanString(row?.query || task?.query || task?.resolution?.query),
    sourceName,
    sourceType: sourceType || null,
    resolvedBy: resolvedBy || null,
    resolvedUrl: resolvedUrl || null,
    host: resolvedUrl ? hostnameOf(resolvedUrl) : null,
    reviewerNotes,
    matchedTask: task ? {
      taskId: cleanString(task.taskId),
      searchTargetId: cleanString(task.searchTargetId),
      leagueSlug: cleanString(task.leagueSlug),
      targetDate: cleanString(task.targetDate),
      query: cleanString(task.query || task?.resolution?.query),
      excludedHosts: asArray(task?.policy?.excludedHosts).map(cleanString).filter(Boolean)
    } : null,
    errors: rowErrors,
    warnings: rowWarnings,
    canonicalWrites: 0
  };

  if (rowErrors.length === 0 && resolvedUrl) {
    stats.acceptedResolvedUrlCount += 1;
    acceptedRows.push({
      ...normalized,
      validationState: "validated_fixture_identity_second_source_resolved_url",
      sourceFetchState: "not_fetched",
      sourceEvidenceState: "not_prepared",
      reviewDecisionState: "not_decided",
      canonicalPromotionState: "blocked"
    });
    return;
  }

  if (rowErrors.length > 0) {
    stats.rejectedResolutionCount += 1;
    rejectedRows.push({
      ...normalized,
      validationState: "rejected_fixture_identity_second_source_resolved_url"
    });
  }
}

function issueMessage(code) {
  const messages = {
    missing_task_id: "Resolution row is missing taskId.",
    unknown_task_id: "Resolution row taskId does not match a resolution task.",
    missing_search_target_id: "Resolution row is missing searchTargetId.",
    search_target_id_mismatch: "Resolution row searchTargetId does not match the matched task.",
    missing_league_slug: "Resolution row is missing leagueSlug.",
    league_slug_mismatch: "Resolution row leagueSlug does not match the matched task.",
    invalid_target_date: "Resolution row targetDate must be YYYY-MM-DD.",
    target_date_mismatch: "Resolution row targetDate does not match --date.",
    task_target_date_mismatch: "Resolution row targetDate does not match the matched task.",
    pending_resolved_url: "resolvedUrl is pending/null.",
    invalid_or_missing_http_url: "resolvedUrl must be a valid http(s) URL.",
    missing_source_name: "sourceName is recommended for resolved URLs.",
    missing_source_type: "Resolved URL requires sourceType.",
    invalid_source_type: "sourceType is not allowed.",
    missing_resolved_by: "Resolved URL requires resolvedBy.",
    invalid_resolved_by: "resolvedBy is not allowed.",
    resolved_url_uses_excluded_host: "resolvedUrl uses an excluded host and cannot be the independent second source.",
    missing_reviewer_notes: "reviewerNotes are recommended for resolved URLs."
  };

  return messages[code] || code;
}

function validate(input, options = {}) {
  const tasks = normalizeResolutionTasks(input);
  const rows = normalizeUrlResolutionRows(input);
  const taskById = taskMapById(tasks);

  const errors = [];
  const warnings = [];
  const acceptedResolvedUrls = [];
  const rejectedResolutions = [];

  const stats = {
    inputResolutionTaskCount: tasks.length,
    inputResolutionRowCount: 0,
    acceptedResolvedUrlCount: 0,
    rejectedResolutionCount: 0,
    pendingResolutionCount: 0
  };

  if (tasks.length === 0) {
    errors.push({
      code: "missing_resolution_tasks",
      message: "Input must contain resolutionTasks[]."
    });
  }

  if (rows.length === 0) {
    errors.push({
      code: "missing_url_resolution_rows",
      message: "Input must contain urlResolutionTemplate[], urlResolutions[], rows[], or resolutions[]."
    });
  }

  rows.forEach((row, index) => {
    validateResolvedRow(row, index, taskById, options, errors, warnings, acceptedResolvedUrls, rejectedResolutions, stats);
  });

  return {
    ok: errors.length === 0,
    job: "validate-fixture-identity-second-source-url-resolutions-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_second_source_url_resolution_validation",
    sourceInput: options.inputPath || null,
    targetDate: options.date || null,
    requireComplete: Boolean(options.requireComplete),
    summary: {
      inputResolutionTaskCount: stats.inputResolutionTaskCount,
      inputResolutionRowCount: stats.inputResolutionRowCount,
      acceptedResolvedUrlCount: stats.acceptedResolvedUrlCount,
      rejectedResolutionCount: stats.rejectedResolutionCount,
      pendingResolutionCount: stats.pendingResolutionCount,
      errorCount: errors.length,
      warningCount: warnings.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: readOnlyGuarantees(),
    acceptedResolvedUrls,
    rejectedResolutions,
    errors,
    warnings
  };
}

function selfTestInput() {
  return {
    resolutionTasks: [
      {
        taskId: "fixture_identity_second_source_search:2026-05-22:bel.1:01:resolve",
        searchTargetId: "fixture_identity_second_source_search:2026-05-22:bel.1:01",
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        query: "\"Belgian Pro League\" \"2026-05-22\" fixtures",
        policy: {
          excludedHosts: ["www.betexplorer.com"]
        }
      }
    ],
    urlResolutionTemplate: [
      {
        taskId: "fixture_identity_second_source_search:2026-05-22:bel.1:01:resolve",
        searchTargetId: "fixture_identity_second_source_search:2026-05-22:bel.1:01",
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        query: "\"Belgian Pro League\" \"2026-05-22\" fixtures",
        resolvedUrl: "https://www.proleague.be/en/jpl/calendar",
        sourceName: "Pro League",
        sourceType: "official_league",
        resolvedBy: "diagnostic",
        reviewerNotes: "Official league calendar."
      }
    ]
  };
}

function main() {
  const args = parseArgs();

  const input = args.selfTest ? selfTestInput() : readJson(args.input);
  const report = validate(input, {
    inputPath: args.selfTest ? "self-test" : args.input,
    date: args.date ? normalizeDate(args.date) : null,
    requireComplete: args.requireComplete
  });

  writeJson(args.output, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    output: args.output,
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();