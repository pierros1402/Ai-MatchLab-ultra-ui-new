#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    allowFetch: false,
    limit: 3,
    timeoutMs: 8000,
    maxBytes: 250000,
    pretty: true,
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input") {
      args.input = argv[++i];
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++i];
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--allow-fetch") {
      args.allowFetch = true;
      continue;
    }

    if (arg === "--limit") {
      args.limit = readPositiveInteger(argv[++i], "--limit");
      continue;
    }

    if (arg.startsWith("--limit=")) {
      args.limit = readPositiveInteger(arg.slice("--limit=".length), "--limit");
      continue;
    }

    if (arg === "--timeout-ms") {
      args.timeoutMs = readPositiveInteger(argv[++i], "--timeout-ms");
      continue;
    }

    if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = readPositiveInteger(arg.slice("--timeout-ms=".length), "--timeout-ms");
      continue;
    }

    if (arg === "--max-bytes") {
      args.maxBytes = readPositiveInteger(argv[++i], "--max-bytes");
      continue;
    }

    if (arg.startsWith("--max-bytes=")) {
      args.maxBytes = readPositiveInteger(arg.slice("--max-bytes=".length), "--max-bytes");
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
      args.help = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return args;
}

function readPositiveInteger(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be an integer >= 1`);
  }
  return n;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/fetch-final-result-source-url-snapshots-file.js --input <validated-url-resolutions.json> [--output <snapshots.json>]",
    "",
    "Fetch is blocked by default. Use --allow-fetch explicitly to download URLs.",
    "",
    "Options:",
    "  --allow-fetch",
    "  --limit=<n>",
    "  --timeout-ms=<n>",
    "  --max-bytes=<n>",
    "",
    "Input shape:",
    "  output from validate-final-result-source-url-resolutions-file.js",
    "",
    "Guarantees:",
    "  - diagnostic output only",
    "  - canonicalWrites: 0",
    "  - no final truth decision",
    "  - no canonical promotion",
    "  - no production repair",
    "  - no fixture/history/value/details writes",
    ""
  ].join("\n");
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

function writeJson(filePath, value, pretty) {
  const abs = resolvePath(filePath);
  if (!abs) return;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  return String(value || "").trim();
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
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function truncateText(value, maxBytes) {
  const text = String(value || "");
  const buffer = Buffer.from(text, "utf8");

  if (buffer.length <= maxBytes) {
    return {
      text,
      bytes: buffer.length,
      truncated: false
    };
  }

  const sliced = buffer.subarray(0, maxBytes).toString("utf8");
  return {
    text: sliced,
    bytes: Buffer.byteLength(sliced, "utf8"),
    truncated: true
  };
}

function normalizeValidatedUrls(input) {
  if (Array.isArray(input?.validatedResolvedSourceUrls)) return input.validatedResolvedSourceUrls;
  if (Array.isArray(input?.validatedUrls)) return input.validatedUrls;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input)) return input;
  return [];
}

function buildBlockedFetch(row, index, reason) {
  return {
    index,
    taskId: cleanString(row?.taskId),
    matchId: cleanString(row?.matchId),
    day: cleanString(row?.day),
    leagueSlug: cleanString(row?.leagueSlug),
    sourceName: cleanString(row?.sourceName),
    sourceType: cleanString(row?.sourceType),
    resolvedUrl: normalizeUrl(row?.resolvedUrl),
    host: hostnameOf(row?.resolvedUrl),
    fetchState: "not_fetched",
    reason,
    canonicalWrites: 0
  };
}

async function fetchOne(row, index, options) {
  const resolvedUrl = normalizeUrl(row?.resolvedUrl);

  if (!resolvedUrl) {
    return {
      ok: false,
      rejected: buildBlockedFetch(row, index, "invalid_or_missing_http_url")
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(resolvedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Ai-MatchLab-FT-Diagnostic/1.0",
        "accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"
      }
    });

    const contentType = response.headers.get("content-type") || "";
    const finalUrl = response.url || resolvedUrl;
    const rawText = await response.text();
    const truncated = truncateText(rawText, options.maxBytes);

    return {
      ok: true,
      snapshot: {
        index,
        taskId: cleanString(row?.taskId),
        matchId: cleanString(row?.matchId),
        day: cleanString(row?.day),
        leagueSlug: cleanString(row?.leagueSlug),
        sourceName: cleanString(row?.sourceName),
        sourceType: cleanString(row?.sourceType),
        resolvedBy: cleanString(row?.resolvedBy),
        requestedUrl: resolvedUrl,
        finalUrl,
        host: hostnameOf(finalUrl),
        fetchedAt: new Date().toISOString(),
        fetchState: "fetched_diagnostic_snapshot",
        http: {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          contentType
        },
        body: {
          text: truncated.text,
          bytes: truncated.bytes,
          truncated: truncated.truncated,
          sha256: sha256(truncated.text)
        },
        matchedTask: row?.matchedTask || null,
        preparedEvidenceState: "not_prepared",
        finalTruthDecisionState: "not_decided",
        canonicalPromotionState: "blocked",
        canonicalWrites: 0
      }
    };
  } catch (err) {
    return {
      ok: false,
      rejected: {
        ...buildBlockedFetch(row, index, err?.name === "AbortError" ? "fetch_timeout" : "fetch_failed"),
        error: err && err.message ? err.message : String(err)
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(fetchedSourceSnapshots, rejectedFetches) {
  const byHost = {};
  const byStatus = {};
  const byRejectReason = {};
  const bySourceType = {};

  for (const row of fetchedSourceSnapshots) {
    byHost[row.host || "unknown"] = (byHost[row.host || "unknown"] || 0) + 1;
    byStatus[String(row.http?.status || "unknown")] = (byStatus[String(row.http?.status || "unknown")] || 0) + 1;
    bySourceType[row.sourceType || "unknown"] = (bySourceType[row.sourceType || "unknown"] || 0) + 1;
  }

  for (const row of rejectedFetches) {
    byRejectReason[row.reason || "unknown"] = (byRejectReason[row.reason || "unknown"] || 0) + 1;
  }

  return {
    fetchedCount: fetchedSourceSnapshots.length,
    rejectedFetchCount: rejectedFetches.length,
    byHost,
    byStatus,
    bySourceType,
    byRejectReason
  };
}

async function buildReport(input, options = {}) {
  const rows = normalizeValidatedUrls(input).slice(0, options.limit);
  const fetchedSourceSnapshots = [];
  const rejectedFetches = [];

  if (!options.allowFetch) {
    for (let i = 0; i < rows.length; i += 1) {
      rejectedFetches.push(buildBlockedFetch(rows[i], i, "blocked_fetch_requires_allow_fetch"));
    }
  } else {
    for (let i = 0; i < rows.length; i += 1) {
      const result = await fetchOne(rows[i], i, options);
      if (result.ok) {
        fetchedSourceSnapshots.push(result.snapshot);
      } else {
        rejectedFetches.push(result.rejected);
      }
    }
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "fetch-final-result-source-url-snapshots-file",
    mode: "controlled_url_fetch_diagnostic",
    canonicalWrites: 0,
    input: {
      path: options.inputPath || null,
      validatedUrlCount: normalizeValidatedUrls(input).length,
      processedCount: rows.length,
      limit: options.limit,
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
      allowFetch: options.allowFetch
    },
    summary: summarize(fetchedSourceSnapshots, rejectedFetches),
    guarantees: {
      diagnosticOnly: true,
      fetchRequiresAllowFetch: true,
      allowFetch: options.allowFetch,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      noProductionRepair: true,
      noFixtureWrite: true,
      noHistoryWrite: true,
      noValueWrite: true,
      noDetailsWrite: true,
      canonicalWrites: 0
    },
    fetchedSourceSnapshots,
    rejectedFetches
  };
}

function selfTestInput() {
  return {
    validatedResolvedSourceUrls: [
      {
        taskId: "task-1",
        matchId: "self-test-1",
        day: "2026-05-18",
        leagueSlug: "test.1",
        sourceName: "Example Diagnostic Source",
        sourceType: "trusted",
        resolvedBy: "diagnostic",
        resolvedUrl: "https://example.com/final-result-diagnostic",
        matchedTask: {
          taskId: "task-1",
          query: "\"Alpha FC\" \"Beta FC\" final score",
          intent: "exact_match_final_result"
        },
        fetchState: "not_fetched",
        finalTruthDecisionState: "not_decided",
        canonicalPromotionState: "blocked"
      }
    ]
  };
}

async function runSelfTest() {
  const report = await buildReport(selfTestInput(), {
    inputPath: "self-test",
    allowFetch: false,
    limit: 1,
    timeoutMs: 1000,
    maxBytes: 1000
  });

  if (report.canonicalWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("self-test failed: canonicalWrites must be 0");
  }

  if (report.summary.fetchedCount !== 0 || report.summary.rejectedFetchCount !== 1) {
    throw new Error("self-test failed: fetch must be blocked without --allow-fetch");
  }

  if (report.rejectedFetches[0].reason !== "blocked_fetch_requires_allow_fetch") {
    throw new Error("self-test failed: expected blocked_fetch_requires_allow_fetch");
  }

  if (!report.guarantees.fetchRequiresAllowFetch || report.guarantees.allowFetch !== false || !report.guarantees.noFinalTruthDecision || !report.guarantees.noCanonicalPromotion) {
    throw new Error("self-test failed: safety guarantees missing");
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(usage());
    return;
  }

  const report = args.selfTest
    ? await runSelfTest()
    : await buildReport(readJson(args.input), {
        inputPath: args.input,
        allowFetch: args.allowFetch,
        limit: args.limit,
        timeoutMs: args.timeoutMs,
        maxBytes: args.maxBytes
      });

  const outputPath = args.output || "data/football-truth/_diagnostics/final-result-source-url-snapshots.json";
  writeJson(outputPath, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    job: report.job,
    output: outputPath,
    fetchedCount: report.summary.fetchedCount,
    rejectedFetchCount: report.summary.rejectedFetchCount,
    allowFetch: report.guarantees.allowFetch,
    canonicalWrites: report.canonicalWrites,
    noFinalTruthDecision: report.guarantees.noFinalTruthDecision,
    noCanonicalPromotion: report.guarantees.noCanonicalPromotion
  }, null, 2));

  if (!report.guarantees.allowFetch && report.summary.rejectedFetchCount > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    job: "fetch-final-result-source-url-snapshots-file",
    error: err && err.message ? err.message : String(err),
    canonicalWrites: 0,
    noFinalTruthDecision: true,
    noCanonicalPromotion: true
  }, null, 2));
  process.exitCode = 1;
}
