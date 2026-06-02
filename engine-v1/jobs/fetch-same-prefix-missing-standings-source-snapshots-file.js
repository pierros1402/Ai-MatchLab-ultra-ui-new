#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_CHARS = 200000;
const DEFAULT_USER_AGENT = [
  "Mozilla/5.0",
  "(compatible; AiMatchLabFootballTruth/1.0;",
  "+https://ai-matchlab.local/diagnostic-fetch)"
].join(" ");

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    allowFetch: false,
    limit: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxChars: DEFAULT_MAX_CHARS,
    userAgent: DEFAULT_USER_AGENT,
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--allow-fetch") {
      args.allowFetch = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[++i]);
      continue;
    }

    if (arg === "--timeout-ms" && argv[i + 1]) {
      args.timeoutMs = Number(argv[++i]);
      continue;
    }

    if (arg === "--max-chars" && argv[i + 1]) {
      args.maxChars = Number(argv[++i]);
      continue;
    }

    if (arg === "--user-agent" && argv[i + 1]) {
      args.userAgent = String(argv[++i] || "").trim();
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  if (!Number.isFinite(args.limit) || args.limit < 0) {
    throw new Error("--limit must be a non-negative number");
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) {
    throw new Error("--timeout-ms must be a number >= 1000");
  }

  if (!Number.isFinite(args.maxChars) || args.maxChars < 1000) {
    throw new Error("--max-chars must be a number >= 1000");
  }

  return args;
}

function resolveRepoPath(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
}

function readJson(filePath, label) {
  const resolved = resolveRepoPath(filePath);
  if (!resolved) throw new Error(`missing --${label}`);
  if (!fs.existsSync(resolved)) throw new Error(`missing ${label} file: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolved;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickFetchTaskRows(input) {
  const direct = asArray(input.fetchTaskRows);
  if (direct.length) return direct;

  const nested = asArray(input.report?.fetchTaskRows);
  if (nested.length) return nested;

  const eligible = asArray(input.eligibleFetchTaskRows);
  if (eligible.length) return eligible;

  return [];
}

function isEligibleTask(task) {
  return (
    asText(task.fetchEligibilityState) === "eligible_for_controlled_standings_source_snapshot_fetch" &&
    asText(task.url || task.sourceCandidateUrl) &&
    asText(task.missingLeagueSlug)
  );
}

function normalizeUrl(value) {
  const text = asText(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function createBlockedSnapshotRow(task, index, reason) {
  const url = normalizeUrl(task.url || task.sourceCandidateUrl);

  return {
    snapshotId: [
      "standings-source-snapshot",
      asText(task.missingLeagueSlug) || "missing-league",
      String(index + 1).padStart(4, "0")
    ].join(":"),
    taskId: asText(task.taskId),
    missingLeagueSlug: asText(task.missingLeagueSlug),
    countryPrefix: asText(task.countryPrefix),
    sourceCandidateUrl: url,
    url,
    hostname: asText(task.hostname),
    title: asText(task.title),
    candidateScore: asNumber(task.candidateScore, 0),
    rank: asNumber(task.rank, index + 1),
    fetchStatus: reason,
    fetchAllowed: false,
    fetchedAt: "",
    httpStatus: null,
    okStatus: false,
    finalUrl: "",
    contentType: "",
    responseCharCount: 0,
    clipped: false,
    bodyText: "",
    error: "",
    sourceFetch: false,
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": options.userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    const rawText = await response.text();
    const clipped = rawText.length > options.maxChars;
    const bodyText = clipped ? rawText.slice(0, options.maxChars) : rawText;

    return {
      ok: true,
      response,
      bodyText,
      responseCharCount: rawText.length,
      clipped
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function createFetchedSnapshotRow(task, index, options) {
  const url = normalizeUrl(task.url || task.sourceCandidateUrl);

  if (!isEligibleTask(task)) {
    return createBlockedSnapshotRow(task, index, "blocked_ineligible_fetch_task");
  }

  if (!url) {
    return createBlockedSnapshotRow(task, index, "blocked_invalid_url");
  }

  if (!options.allowFetch) {
    return createBlockedSnapshotRow(task, index, "fetch_not_allowed_requires_explicit_allow_fetch");
  }

  const baseRow = {
    snapshotId: [
      "standings-source-snapshot",
      asText(task.missingLeagueSlug),
      String(index + 1).padStart(4, "0")
    ].join(":"),
    taskId: asText(task.taskId),
    missingLeagueSlug: asText(task.missingLeagueSlug),
    countryPrefix: asText(task.countryPrefix),
    sourceCandidateUrl: url,
    url,
    hostname: asText(task.hostname),
    title: asText(task.title),
    candidateScore: asNumber(task.candidateScore, 0),
    rank: asNumber(task.rank, index + 1),
    fetchAllowed: true,
    fetchedAt: new Date().toISOString(),
    sourceFetch: true,
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  };

  try {
    const fetched = await fetchWithTimeout(url, options);
    const response = fetched.response;

    return {
      ...baseRow,
      fetchStatus: "fetched",
      httpStatus: response.status,
      okStatus: response.ok,
      finalUrl: response.url || url,
      contentType: response.headers.get("content-type") || "",
      responseCharCount: fetched.responseCharCount,
      clipped: fetched.clipped,
      bodyText: fetched.bodyText,
      error: ""
    };
  } catch (error) {
    return {
      ...baseRow,
      fetchStatus: "fetch_failed",
      httpStatus: null,
      okStatus: false,
      finalUrl: "",
      contentType: "",
      responseCharCount: 0,
      clipped: false,
      bodyText: "",
      error: error?.name === "AbortError"
        ? `fetch_timeout_after_${options.timeoutMs}_ms`
        : (error?.message || String(error))
    };
  }
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = asText(row[field]) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

async function buildReport(input, options = {}) {
  const allTaskRows = pickFetchTaskRows(input);
  const eligibleRows = allTaskRows.filter(isEligibleTask);
  const selectedRows = options.limit > 0 ? eligibleRows.slice(0, options.limit) : eligibleRows;

  const fetchedSourceSnapshotRows = [];
  for (let i = 0; i < selectedRows.length; i += 1) {
    fetchedSourceSnapshotRows.push(await createFetchedSnapshotRow(selectedRows[i], i, options));
  }

  const fetchedCount = fetchedSourceSnapshotRows.filter((row) => row.fetchStatus === "fetched").length;
  const okHttpCount = fetchedSourceSnapshotRows.filter((row) => row.fetchStatus === "fetched" && row.okStatus).length;
  const failedFetchCount = fetchedSourceSnapshotRows.filter((row) => row.fetchStatus === "fetch_failed").length;
  const blockedFetchCount = fetchedSourceSnapshotRows.filter((row) => row.fetchStatus !== "fetched" && row.fetchStatus !== "fetch_failed").length;

  return {
    ok: true,
    job: "fetch-same-prefix-missing-standings-source-snapshots-file",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      sourceJob: asText(input.job),
      sourceGeneratedAt: asText(input.generatedAt),
      inputFetchTaskRowCount: allTaskRows.length,
      eligibleInputFetchTaskRowCount: eligibleRows.length
    },
    summary: {
      selectedFetchTaskRowCount: selectedRows.length,
      fetchedSourceSnapshotRowCount: fetchedSourceSnapshotRows.length,
      fetchedCount,
      okHttpCount,
      failedFetchCount,
      blockedFetchCount,
      byFetchStatus: countBy(fetchedSourceSnapshotRows, "fetchStatus"),
      byHttpStatus: countBy(fetchedSourceSnapshotRows, "httpStatus"),
      byMissingLeagueSlug: countBy(fetchedSourceSnapshotRows, "missingLeagueSlug"),
      sourceFetch: Boolean(options.allowFetch),
      standingsWriteAllowedNowCount: 0,
      canonicalWrites: 0,
      productionWrite: false
    },
    fetchedSourceSnapshotRows,
    guarantees: {
      failClosedWithoutAllowFetch: true,
      sourceFetch: Boolean(options.allowFetch),
      noStandingsWrites: true,
      noCanonicalPromotion: true,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false,
      diagnosticOnly: true
    },
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false,
    selfTest: Boolean(options.selfTest)
  };
}

function selfTestInput() {
  return {
    ok: true,
    job: "materialize-same-prefix-missing-standings-source-fetch-tasks-file",
    generatedAt: "2026-06-02T00:00:00.000Z",
    fetchTaskRows: [
      {
        taskId: "standings-source:aut.2:0001",
        missingLeagueSlug: "aut.2",
        countryPrefix: "aut",
        sourceCandidateUrl: "https://www.example.com/austria-2-liga-standings",
        url: "https://www.example.com/austria-2-liga-standings",
        hostname: "www.example.com",
        title: "Austria 2 Liga Standings",
        candidateScore: 88,
        rank: 1,
        fetchEligibilityState: "eligible_for_controlled_standings_source_snapshot_fetch",
        standingsWriteAllowedNow: false,
        canonicalWrites: 0,
        productionWrite: false
      }
    ]
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = await buildReport(selfTestInput(), {
      ...args,
      allowFetch: false,
      selfTest: true
    });

    if (report.summary.selectedFetchTaskRowCount !== 1) {
      throw new Error(`self-test expected 1 selected task, got ${report.summary.selectedFetchTaskRowCount}`);
    }

    if (report.summary.fetchedCount !== 0) {
      throw new Error(`self-test expected 0 fetched rows without --allow-fetch, got ${report.summary.fetchedCount}`);
    }

    if (report.summary.blockedFetchCount !== 1) {
      throw new Error(`self-test expected 1 blocked fetch row, got ${report.summary.blockedFetchCount}`);
    }

    if (report.guarantees.sourceFetch !== false || report.guarantees.standingsWriteAllowedNow !== false) {
      throw new Error("self-test read-only/fail-closed guarantees failed");
    }

    console.log(JSON.stringify({
      ok: true,
      selfTest: "fetch-same-prefix-missing-standings-source-snapshots-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const outputPath = args.output || "data/football-truth/_diagnostics/same-prefix-missing-standings/fetched-source-snapshots.json";
  const report = await buildReport(input, args);
  const resolvedOutput = writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, resolvedOutput).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "fetch-same-prefix-missing-standings-source-snapshots-file",
    error: error?.message || String(error),
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});