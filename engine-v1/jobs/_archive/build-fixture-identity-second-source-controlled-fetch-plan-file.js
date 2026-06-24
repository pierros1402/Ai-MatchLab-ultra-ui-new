#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

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

    if (arg === "--self-test") {
      args.selfTest = true;
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
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-identity-second-source-controlled-fetch-plan.json";
  }

  return args;
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/build-fixture-identity-second-source-controlled-fetch-plan-file.js --date YYYY-MM-DD --input <validated-url-resolutions.json> --output <fetch-plan.json>",
    "",
    "Purpose:",
    "  Build a controlled fetch plan from validated fixture identity second-source URL resolutions.",
    "",
    "Important:",
    "  This job does not fetch URLs.",
    "  This job does not resolve URLs.",
    "  This job does not apply review decisions.",
    "  This job does not write canonical fixtures, deploy snapshots, value data, or details.",
    "",
    "Guarantees:",
    "  - sourceFetch: false",
    "  - noFetch: true",
    "  - noUrlFetch: true",
    "  - fetchRequiresAllowFetchInLaterStage: true",
    "  - noReviewDecisionApplied: true",
    "  - noCanonicalPromotion: true",
    "  - canonicalWrites: 0",
    "  - productionWrite: false",
    "  - dryRun: true"
  ].join("\n"));
}

function defaultOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.controlled-fetch-plan.json`);
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
  fs.writeFileSync(abs, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
}

function normalizeDate(value) {
  const text = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Invalid date: ${text || "<empty>"}`);
  }
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

function readOnlyGuarantees() {
  return {
    sourceFetch: false,
    noFetch: true,
    noUrlFetch: true,
    noUrlResolutionSideEffects: true,
    fetchRequiresAllowFetchInLaterStage: true,
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

function acceptedRows(input) {
  return asArray(input?.acceptedResolvedUrls)
    .filter((row) => normalizeUrl(row?.resolvedUrl));
}

function pendingWarnings(input) {
  return asArray(input?.warnings)
    .filter((row) => cleanString(row?.code) === "pending_resolved_url");
}

function rejectedRows(input) {
  return asArray(input?.rejectedResolutions);
}

function fetchPlanRow(row, index) {
  const resolvedUrl = normalizeUrl(row?.resolvedUrl);

  return {
    fetchPlanId: `fixture_identity_second_source_fetch:${cleanString(row?.targetDate)}:${cleanString(row?.leagueSlug)}:${String(index + 1).padStart(3, "0")}`,
    taskId: cleanString(row?.taskId),
    searchTargetId: cleanString(row?.searchTargetId),
    leagueSlug: cleanString(row?.leagueSlug),
    name: cleanString(row?.name),
    targetDate: cleanString(row?.targetDate),
    query: cleanString(row?.query),
    resolvedUrl,
    hostname: hostnameOf(resolvedUrl),
    sourceName: cleanString(row?.sourceName),
    sourceType: cleanString(row?.sourceType),
    resolvedBy: cleanString(row?.resolvedBy),
    reviewerNotes: cleanString(row?.reviewerNotes),
    sourceFetchState: "planned_not_fetched",
    fetchRequiresAllowFetch: true,
    acceptedForControlledFetch: true,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function pendingRow(row) {
  return {
    taskId: cleanString(row?.taskId),
    searchTargetId: cleanString(row?.searchTargetId),
    leagueSlug: cleanString(row?.leagueSlug),
    name: cleanString(row?.name),
    targetDate: cleanString(row?.targetDate),
    blockedReason: "pending_resolved_url",
    sourceFetchState: "blocked_pending_url_resolution",
    fetchRequiresAllowFetch: true,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function rejectedRow(row) {
  return {
    taskId: cleanString(row?.taskId),
    searchTargetId: cleanString(row?.searchTargetId),
    leagueSlug: cleanString(row?.leagueSlug),
    name: cleanString(row?.name),
    targetDate: cleanString(row?.targetDate),
    resolvedUrl: normalizeUrl(row?.resolvedUrl),
    blockedReason: asArray(row?.errors).join(",") || "rejected_url_resolution",
    sourceFetchState: "blocked_rejected_url_resolution",
    fetchRequiresAllowFetch: true,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function summarize(fetchPlanRows, blockedPendingRows, blockedRejectedRows, input) {
  const byLeague = {};

  for (const row of [...fetchPlanRows, ...blockedPendingRows, ...blockedRejectedRows]) {
    const slug = cleanString(row.leagueSlug) || "unknown";
    if (!byLeague[slug]) {
      byLeague[slug] = {
        name: cleanString(row.name),
        targetDate: cleanString(row.targetDate),
        fetchPlanCount: 0,
        blockedPendingCount: 0,
        blockedRejectedCount: 0
      };
    }

    if (row.sourceFetchState === "planned_not_fetched") byLeague[slug].fetchPlanCount += 1;
    if (row.sourceFetchState === "blocked_pending_url_resolution") byLeague[slug].blockedPendingCount += 1;
    if (row.sourceFetchState === "blocked_rejected_url_resolution") byLeague[slug].blockedRejectedCount += 1;
  }

  return {
    inputResolutionTaskCount: Number(input?.summary?.inputResolutionTaskCount ?? 0),
    inputResolutionRowCount: Number(input?.summary?.inputResolutionRowCount ?? 0),
    acceptedResolvedUrlCount: fetchPlanRows.length,
    fetchPlanCount: fetchPlanRows.length,
    blockedPendingCount: blockedPendingRows.length,
    blockedRejectedCount: blockedRejectedRows.length,
    readyForFetchCount: fetchPlanRows.length,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    byLeague
  };
}

function validateInput(input, options) {
  const summary = input?.summary || {};

  if (input?.ok !== true) {
    throw new Error("Input validation report must have ok=true.");
  }

  if (options.date) {
    const targetDate = cleanString(input?.targetDate);
    if (targetDate && targetDate !== options.date) {
      throw new Error(`Input targetDate mismatch: expected ${options.date}, got ${targetDate}`);
    }
  }

  if (Number(summary?.errorCount ?? 0) !== 0) {
    throw new Error("Input validation report has errors; refusing to build fetch plan.");
  }

  if (Number(summary?.canonicalWrites ?? 0) !== 0 || summary?.productionWrite === true) {
    throw new Error("Unsafe input validation report: writes detected.");
  }
}

function buildReport(input, options = {}) {
  validateInput(input, options);

  const accepted = acceptedRows(input);
  const pending = pendingWarnings(input);
  const rejected = rejectedRows(input);

  const fetchPlanRows = accepted.map(fetchPlanRow);
  const blockedPendingRows = pending.map(pendingRow);
  const blockedRejectedRows = rejected.map(rejectedRow);

  return {
    ok: true,
    job: "build-fixture-identity-second-source-controlled-fetch-plan-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_second_source_controlled_fetch_plan",
    sourceInput: options.inputPath || null,
    targetDate: options.date || cleanString(input?.targetDate) || null,
    canonicalWrites: 0,
    summary: summarize(fetchPlanRows, blockedPendingRows, blockedRejectedRows, input),
    guarantees: readOnlyGuarantees(),
    fetchPlanRows,
    blockedPendingRows,
    blockedRejectedRows,
    notes: [
      "This report only builds a controlled fetch plan from already validated URL resolutions.",
      "It does not fetch URLs.",
      "A later fetch stage must require explicit --allow-fetch.",
      "Pending URL resolutions are blocked from fetch.",
      "Rejected URL resolutions are blocked from fetch.",
      "No canonical fixture, deploy snapshot, value, or details writes are performed."
    ]
  };
}

function selfTestInput() {
  return {
    ok: true,
    targetDate: "2026-05-22",
    summary: {
      inputResolutionTaskCount: 2,
      inputResolutionRowCount: 2,
      acceptedResolvedUrlCount: 1,
      rejectedResolutionCount: 0,
      pendingResolutionCount: 1,
      errorCount: 0,
      warningCount: 1,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    acceptedResolvedUrls: [
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
    ],
    rejectedResolutions: [],
    warnings: [
      {
        code: "pending_resolved_url",
        taskId: "fixture_identity_second_source_search:2026-05-22:esp.1:01:resolve",
        searchTargetId: "fixture_identity_second_source_search:2026-05-22:esp.1:01",
        leagueSlug: "esp.1",
        name: "Spanish LaLiga",
        targetDate: "2026-05-22"
      }
    ]
  };
}

function main() {
  const args = parseArgs();

  const date = args.date ? normalizeDate(args.date) : null;
  const input = args.selfTest ? selfTestInput() : readJson(args.input);
  const report = buildReport(input, {
    inputPath: args.selfTest ? "self-test" : args.input,
    date
  });

  writeJson(args.output, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    output: args.output,
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();