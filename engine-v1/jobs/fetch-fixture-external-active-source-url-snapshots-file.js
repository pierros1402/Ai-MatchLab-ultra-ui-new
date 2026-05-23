import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: null,
    output: null,
    allowFetch: false,
    timeoutMs: 8000,
    maxBytes: 250000,
    limit: 100,
    pretty: true,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i]).trim();
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i]).trim();
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length).trim();
      continue;
    }

    if (arg === "--allow-fetch") {
      args.allowFetch = true;
      continue;
    }

    if (arg === "--timeout-ms" && argv[i + 1]) {
      args.timeoutMs = readPositiveInteger(argv[++i], "--timeout-ms");
      continue;
    }

    if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = readPositiveInteger(arg.slice("--timeout-ms=".length), "--timeout-ms");
      continue;
    }

    if (arg === "--max-bytes" && argv[i + 1]) {
      args.maxBytes = readPositiveInteger(argv[++i], "--max-bytes");
      continue;
    }

    if (arg.startsWith("--max-bytes=")) {
      args.maxBytes = readPositiveInteger(arg.slice("--max-bytes=".length), "--max-bytes");
      continue;
    }

    if (arg === "--limit" && argv[i + 1]) {
      args.limit = readPositiveInteger(argv[++i], "--limit");
      continue;
    }

    if (arg.startsWith("--limit=")) {
      args.limit = readPositiveInteger(arg.slice("--limit=".length), "--limit");
      continue;
    }

    if (arg === "--compact") {
      args.pretty = false;
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
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-external-active-source-url-snapshots.json";
  }

  return args;
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/fetch-fixture-external-active-source-url-snapshots-file.js --input <validated-source-url-resolutions.json> --output <snapshots.json>",
    "",
    "Fetch is blocked by default. Use --allow-fetch explicitly to download URLs.",
    "",
    "Options:",
    "  --allow-fetch",
    "  --timeout-ms <n>",
    "  --max-bytes <n>",
    "  --limit <n>",
    "",
    "Guarantees:",
    "  - fetchRequiresAllowFetch: true",
    "  - canonicalWrites: 0",
    "  - noReviewDecision: true",
    "  - noCanonicalPromotion: true",
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
  return path.join(parsed.dir, `${parsed.name}.source-url-snapshots.json`);
}

function readJson(filePath) {
  const abs = resolvePath(filePath);
  if (!abs) throw new Error("missing required --input");
  return JSON.parse(fs.readFileSync(abs, "utf8"));
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

function hostnameOf(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
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
    bytes: Buffer.from(sliced, "utf8").length,
    truncated: true
  };
}

function extractRows(input) {
  if (Array.isArray(input?.readyForFetchRows)) return input.readyForFetchRows;
  if (Array.isArray(input?.validSourceUrlResolutions)) {
    return input.validSourceUrlResolutions.filter((row) => row?.readyForFetch === true);
  }
  if (Array.isArray(input?.validatedRows)) {
    return input.validatedRows.filter((row) => row?.readyForFetch === true);
  }
  if (Array.isArray(input)) {
    return input.filter((row) => row?.readyForFetch === true || row?.validationState === "valid_source_url_resolution");
  }

  throw new Error("Input must contain readyForFetchRows[], validSourceUrlResolutions[], validatedRows[], or be an array.");
}

function normalizeRow(row, index) {
  return {
    index,
    taskId: cleanString(row?.taskId) || `ready-for-fetch:${index}`,
    leagueSlug: cleanString(row?.leagueSlug),
    name: cleanString(row?.name),
    country: cleanString(row?.country),
    dayKey: cleanString(row?.dayKey),
    searchQuery: cleanString(row?.searchQuery),
    resolvedUrl: normalizeUrl(row?.resolvedUrl),
    sourceType: cleanString(row?.sourceType),
    sourceTitle: cleanString(row?.sourceTitle),
    externallyActive: normalizeBoolean(row?.externallyActive),
    fixtureCountFound: normalizeNumber(row?.fixtureCountFound),
    missingFromSnapshot: normalizeBoolean(row?.missingFromSnapshot),
    reviewerNotes: cleanString(row?.reviewerNotes),
    validationState: cleanString(row?.validationState),
    readyForFetch: row?.readyForFetch === true
  };
}

function buildBlockedFetch(row, index, reason) {
  return {
    index,
    taskId: row.taskId,
    leagueSlug: row.leagueSlug,
    name: row.name,
    country: row.country,
    dayKey: row.dayKey,
    resolvedUrl: row.resolvedUrl,
    sourceType: row.sourceType,
    sourceTitle: row.sourceTitle,
    fetchState: "not_fetched",
    reason,
    canonicalWrites: 0,
    productionWrite: false
  };
}

async function fetchOne(row, index, options) {
  if (!row.resolvedUrl) {
    return {
      rejected: buildBlockedFetch(row, index, "invalid_or_missing_http_url")
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(row.resolvedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Ai-MatchLab-Fixture-External-Active-Diagnostic/1.0",
        "accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"
      }
    });

    const rawText = await response.text();
    const truncated = truncateText(rawText, options.maxBytes);
    const fetchedAt = new Date().toISOString();

    return {
      snapshot: {
        index,
        taskId: row.taskId,
        leagueSlug: row.leagueSlug,
        name: row.name,
        country: row.country,
        dayKey: row.dayKey,
        searchQuery: row.searchQuery,
        resolvedUrl: row.resolvedUrl,
        hostname: hostnameOf(row.resolvedUrl),
        sourceType: row.sourceType,
        sourceTitle: row.sourceTitle,
        externallyActive: row.externallyActive,
        fixtureCountFound: row.fixtureCountFound,
        missingFromSnapshot: row.missingFromSnapshot,
        reviewerNotes: row.reviewerNotes,
        fetchedAt,
        fetchState: "fetched_diagnostic_snapshot",
        http: {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          finalUrl: response.url,
          contentType: response.headers.get("content-type") || "",
          bytes: truncated.bytes,
          truncated: truncated.truncated,
          text: truncated.text,
          sha256: sha256(truncated.text)
        },
        states: {
          evidenceState: "snapshot_fetched_not_prepared",
          reviewDecisionState: "not_decided",
          canonicalPromotionState: "blocked"
        },
        canonicalWrites: 0,
        productionWrite: false
      }
    };
  } catch (err) {
    return {
      rejected: {
        ...buildBlockedFetch(row, index, err?.name === "AbortError" ? "fetch_timeout" : "fetch_failed"),
        errorName: cleanString(err?.name),
        errorMessage: cleanString(err?.message)
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(fetchedSourceSnapshots, rejectedFetches, readyRows, options) {
  const byStatus = {};
  const byRejectedReason = {};
  const byLeague = {};

  for (const row of fetchedSourceSnapshots) {
    const status = String(row.http?.status || "unknown");
    byStatus[status] = (byStatus[status] || 0) + 1;

    if (!byLeague[row.leagueSlug]) byLeague[row.leagueSlug] = { ready: 0, fetched: 0, rejected: 0 };
    byLeague[row.leagueSlug].fetched += 1;
  }

  for (const row of rejectedFetches) {
    byRejectedReason[row.reason] = (byRejectedReason[row.reason] || 0) + 1;

    if (!byLeague[row.leagueSlug]) byLeague[row.leagueSlug] = { ready: 0, fetched: 0, rejected: 0 };
    byLeague[row.leagueSlug].rejected += 1;
  }

  for (const row of readyRows) {
    if (!byLeague[row.leagueSlug]) byLeague[row.leagueSlug] = { ready: 0, fetched: 0, rejected: 0 };
    byLeague[row.leagueSlug].ready += 1;
  }

  return {
    readyForFetchCount: readyRows.length,
    fetchedSnapshotCount: fetchedSourceSnapshots.length,
    rejectedFetchCount: rejectedFetches.length,
    allowFetch: options.allowFetch,
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes,
    limit: options.limit,
    byStatus,
    byRejectedReason,
    byLeague
  };
}

async function buildReport(input, options = {}) {
  const readyRows = extractRows(input)
    .map((row, index) => normalizeRow(row, index))
    .slice(0, options.limit);

  const fetchedSourceSnapshots = [];
  const rejectedFetches = [];

  if (!options.allowFetch) {
    for (let i = 0; i < readyRows.length; i += 1) {
      rejectedFetches.push(buildBlockedFetch(readyRows[i], i, "blocked_fetch_requires_allow_fetch"));
    }
  } else {
    for (let i = 0; i < readyRows.length; i += 1) {
      const result = await fetchOne(readyRows[i], i, options);

      if (result.snapshot) {
        fetchedSourceSnapshots.push(result.snapshot);
      } else {
        rejectedFetches.push(result.rejected);
      }
    }
  }

  return {
    ok: true,
    job: "fetch-fixture-external-active-source-url-snapshots-file",
    generatedAt: new Date().toISOString(),
    mode: "controlled_fixture_external_active_url_fetch_diagnostic",
    sourceInput: options.inputPath || null,
    canonicalWrites: 0,
    options: {
      allowFetch: options.allowFetch,
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
      limit: options.limit
    },
    summary: summarize(fetchedSourceSnapshots, rejectedFetches, readyRows, options),
    guarantees: {
      fetchRequiresAllowFetch: true,
      allowFetch: options.allowFetch,
      noFetchWithoutAllowFetch: !options.allowFetch,
      noReviewDecision: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    },
    fetchedSourceSnapshots,
    rejectedFetches,
    notes: [
      "This job fetches diagnostic source snapshots only when --allow-fetch is explicitly set.",
      "It consumes only readyForFetchRows or valid rows marked readyForFetch.",
      "It does not prepare evidence, decide externallyActive, fill reviewFields, or write canonical fixtures.",
      "When readyForFetchRows is empty, the safe expected result is fetchedSnapshotCount=0 and rejectedFetchCount=0."
    ]
  };
}

function selfTestInput() {
  return {
    readyForFetchRows: [
      {
        taskId: "fixture_external_active_source_url_resolution:2026-05-22:est.1:01",
        leagueSlug: "est.1",
        name: "Estonian Meistriliiga",
        country: "estonia",
        dayKey: "2026-05-22",
        searchQuery: "\"Estonian Meistriliiga\" fixtures 2026-05-22",
        resolvedUrl: "https://example.com/fixtures",
        sourceType: "official_federation_fixture_list",
        sourceTitle: "Synthetic official fixtures",
        externallyActive: true,
        fixtureCountFound: 1,
        missingFromSnapshot: true,
        validationState: "valid_source_url_resolution",
        readyForFetch: true
      }
    ]
  };
}

async function runSelfTest() {
  const report = await buildReport(selfTestInput(), {
    inputPath: "self-test",
    allowFetch: false,
    timeoutMs: 1000,
    maxBytes: 2000,
    limit: 10
  });

  if (report.canonicalWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("self-test failed: canonicalWrites must be 0");
  }

  if (report.summary.readyForFetchCount !== 1) {
    throw new Error("self-test failed: expected one ready-for-fetch row");
  }

  if (report.summary.fetchedSnapshotCount !== 0 || report.summary.rejectedFetchCount !== 1) {
    throw new Error("self-test failed: fetch must be blocked without --allow-fetch");
  }

  if (report.rejectedFetches[0]?.reason !== "blocked_fetch_requires_allow_fetch") {
    throw new Error("self-test failed: expected blocked_fetch_requires_allow_fetch");
  }

  if (!report.guarantees.fetchRequiresAllowFetch || report.guarantees.allowFetch !== false) {
    throw new Error("self-test failed: fetch guard missing");
  }

  if (!report.guarantees.noReviewDecision || !report.guarantees.noCanonicalPromotion) {
    throw new Error("self-test failed: decision/promotion guards missing");
  }

  return report;
}

async function main() {
  const args = parseArgs();

  const report = args.selfTest
    ? await runSelfTest()
    : await buildReport(readJson(args.input), {
        inputPath: args.input,
        allowFetch: args.allowFetch,
        timeoutMs: args.timeoutMs,
        maxBytes: args.maxBytes,
        limit: args.limit
      });

  writeJson(args.output, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));

  if (!report.guarantees.allowFetch && report.summary.rejectedFetchCount > 0) {
    console.log("Fetch blocked. Re-run with --allow-fetch only after reviewing readyForFetchRows.");
  }
}

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    job: "fetch-fixture-external-active-source-url-snapshots-file",
    error: err?.message || String(err),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exit(1);
});