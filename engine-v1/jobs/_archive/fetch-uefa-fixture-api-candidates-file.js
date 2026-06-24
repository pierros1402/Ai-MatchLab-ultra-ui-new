#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    allowFetch: false,
    limit: 1,
    timeoutMs: 8000,
    apiFamily: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--allow-fetch") args.allowFetch = true;
    else if (arg === "--limit") args.limit = Number(argv[++i] || 0);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++i] || 0);
    else if (arg.startsWith("--timeout-ms=")) args.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    else if (arg === "--api-family") args.apiFamily = argv[++i] || "";
    else if (arg.startsWith("--api-family=")) args.apiFamily = arg.slice("--api-family=".length);
    else if (arg === "--self-test") args.selfTest = true;
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 1;
  args.timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? Math.floor(args.timeoutMs) : 8000;

  return args;
}

function apiCandidateRowsOf(input) {
  if (Array.isArray(input?.apiCandidateRows)) return input.apiCandidateRows;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input)) return input;
  return [];
}

function normalizeHeaders(headers) {
  const out = {
    "accept": "application/json,text/plain,*/*",
    "user-agent": "Ai-MatchLab-FixtureTruthDiagnostic/1.0"
  };

  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      const name = asText(key).toLowerCase();
      const textValue = asText(value);
      if (!name || !textValue) continue;
      out[name] = textValue;
    }
  }

  return out;
}

function selectCandidates(input, options = {}) {
  const apiFamily = asText(options.apiFamily);
  const rows = apiCandidateRowsOf(input);
  const eligible = rows.filter((row) => {
    if (!asText(row.candidateUrl)) return false;
    if (row.sourceFetch === true || Number(row.canonicalWrites || 0) > 0 || row.productionWrite === true) return false;
    if (apiFamily && asText(row.apiFamily) !== apiFamily) return false;
    return true;
  });

  const selected = eligible.slice(0, options.limit || 1);

  return {
    inputCount: rows.length,
    eligibleCount: eligible.length,
    selected
  };
}

function blockedReport(input, options = {}) {
  const selected = selectCandidates(input, options);

  return {
    ok: true,
    status: "blocked",
    blockedReason: "missing_allow_fetch",
    job: "fetch-uefa-fixture-api-candidates-file",
    generatedAt: new Date().toISOString(),
    summary: {
      inputApiCandidateCount: selected.inputCount,
      eligibleApiCandidateCount: selected.eligibleCount,
      selectedApiCandidateCount: 0,
      fetchedApiSnapshotCount: 0,
      blockedReason: "missing_allow_fetch",
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    fetchedApiSnapshots: [],
    guarantees: {
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

async function fetchOne(row, index, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(row.candidateUrl, {
      method: "GET",
      headers: normalizeHeaders(row.requiredHeaders),
      signal: controller.signal,
      redirect: "follow"
    });

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    return {
      apiSnapshotId: `${asText(row.apiCandidateId) || "uefa-api"}::snapshot::${String(index + 1).padStart(3, "0")}`,
      apiCandidateId: asText(row.apiCandidateId),
      leagueSlug: asText(row.leagueSlug),
      apiFamily: asText(row.apiFamily),
      confidence: asText(row.confidence),
      candidateUrl: asText(row.candidateUrl),
      finalUrl: response.url || asText(row.candidateUrl),
      hostname: (() => {
        try { return new URL(response.url || row.candidateUrl).hostname.toLowerCase(); }
        catch { return ""; }
      })(),
      status: response.status,
      ok: response.ok,
      contentType,
      bytes: Buffer.byteLength(text, "utf8"),
      textLength: text.length,
      rawText: text,
      fetchedAt: new Date().toISOString(),
      sourceFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  } catch (error) {
    return {
      apiSnapshotId: `${asText(row.apiCandidateId) || "uefa-api"}::snapshot::${String(index + 1).padStart(3, "0")}`,
      apiCandidateId: asText(row.apiCandidateId),
      leagueSlug: asText(row.leagueSlug),
      apiFamily: asText(row.apiFamily),
      candidateUrl: asText(row.candidateUrl),
      status: "fetch_failed",
      ok: false,
      fetchError: error && error.name === "AbortError" ? "fetch_timeout" : asText(error?.message || error),
      fetchedAt: new Date().toISOString(),
      sourceFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  } finally {
    clearTimeout(timer);
  }
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

async function buildReport(input, options = {}) {
  if (!options.allowFetch) return blockedReport(input, options);

  const selected = selectCandidates(input, options);
  const fetchedApiSnapshots = [];

  for (let i = 0; i < selected.selected.length; i += 1) {
    fetchedApiSnapshots.push(await fetchOne(selected.selected[i], i, options));
  }

  return {
    ok: true,
    status: "fetched",
    job: "fetch-uefa-fixture-api-candidates-file",
    generatedAt: new Date().toISOString(),
    summary: {
      inputApiCandidateCount: selected.inputCount,
      eligibleApiCandidateCount: selected.eligibleCount,
      selectedApiCandidateCount: selected.selected.length,
      fetchedApiSnapshotCount: fetchedApiSnapshots.length,
      byStatus: countBy(fetchedApiSnapshots, "status"),
      byApiFamily: countBy(fetchedApiSnapshots, "apiFamily"),
      sourceFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    fetchedApiSnapshots,
    guarantees: {
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

async function selfTest() {
  const input = {
    apiCandidateRows: [
      {
        apiCandidateId: "uefa.champions::match-api-competition-season-matches::001",
        leagueSlug: "uefa.champions",
        apiFamily: "match-api-competition-season-matches",
        candidateUrl: "https://example.test/api",
        requiredHeaders: { "x-api-key": "test-key" },
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false
      }
    ]
  };

  const blocked = await buildReport(input, { allowFetch: false, limit: 1, timeoutMs: 10 });
  if (blocked.status !== "blocked") throw new Error("expected blocked status without allow fetch");
  if (blocked.summary.inputApiCandidateCount !== 1) throw new Error("expected one input API candidate");
  if (blocked.summary.fetchedApiSnapshotCount !== 0) throw new Error("blocked mode must not fetch");
  if (blocked.guarantees.sourceFetch !== false || blocked.guarantees.noFetch !== true) {
    throw new Error("blocked guarantees failed");
  }

  const selected = selectCandidates(input, { limit: 1, apiFamily: "match-api-competition-season-matches" });
  if (selected.selected.length !== 1) throw new Error("expected selected API candidate");
  if (selected.selected[0].requiredHeaders["x-api-key"] !== "test-key") {
    throw new Error("expected requiredHeaders to be preserved");
  }

  return {
    ok: true,
    selfTest: "fetch-uefa-fixture-api-candidates-file",
    summary: blocked.summary,
    guarantees: blocked.guarantees
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(await selfTest(), null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = await buildReport(input, {
    allowFetch: args.allowFetch,
    limit: args.limit,
    timeoutMs: args.timeoutMs,
    apiFamily: args.apiFamily
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    status: report.status,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { buildReport, selectCandidates };