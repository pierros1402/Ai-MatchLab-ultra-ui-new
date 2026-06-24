#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function cleanString(value) {
  return String(value || "").trim();
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing --input");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return Math.floor(number);
}

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    allowFetch: false,
    limit: 10,
    timeoutMs: 12000,
    maxBytes: 500000,
    selfTest: false,
    help: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }
    if (arg === "--allow-fetch") {
      args.allowFetch = true;
      continue;
    }
    if (arg === "--input") {
      args.input = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--input=")) {
      args.input = cleanString(arg.slice("--input=".length));
      continue;
    }
    if (arg === "--output") {
      args.output = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--output=")) {
      args.output = cleanString(arg.slice("--output=".length));
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

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/fetch-fixture-identity-second-source-controlled-fetch-plan-snapshots-file.js --input <controlled-fetch-plan.json> --output <snapshots.json>",
    "",
    "Fetch is blocked by default. Use --allow-fetch explicitly to download URLs."
  ].join("\n");
}

function normalizeUrl(value) {
  const url = cleanString(value);
  if (!/^https?:\/\//i.test(url)) return "";
  return url;
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function plainTextFromHtml(html) {
  return cleanString(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFetchPlanRows(input) {
  const rows = Array.isArray(input?.fetchPlanRows)
    ? input.fetchPlanRows
    : Array.isArray(input?.rows)
      ? input.rows
      : Array.isArray(input)
        ? input
        : [];

  return rows
    .map((row, index) => ({
      index,
      taskId: cleanString(row?.taskId),
      leagueSlug: cleanString(row?.leagueSlug),
      name: cleanString(row?.name || row?.leagueName),
      targetDate: cleanString(row?.targetDate || row?.dayKey || row?.date),
      homeTeam: cleanString(row?.homeTeam),
      awayTeam: cleanString(row?.awayTeam),
      resolvedUrl: normalizeUrl(row?.resolvedUrl),
      sourceName: cleanString(row?.sourceName),
      sourceType: cleanString(row?.sourceType),
      host: hostFromUrl(row?.resolvedUrl),
      validationState: cleanString(row?.validationState),
      sourceFetchState: cleanString(row?.sourceFetchState || "planned_not_fetched"),
      fetchRequiresAllowFetch: row?.fetchRequiresAllowFetch !== false,
      canonicalWrites: 0,
      productionWrite: false
    }))
    .filter((row) => row.resolvedUrl);
}

function blockedFetch(row, index, reason) {
  return {
    index,
    taskId: row?.taskId || "",
    leagueSlug: row?.leagueSlug || "",
    name: row?.name || "",
    targetDate: row?.targetDate || "",
    resolvedUrl: row?.resolvedUrl || "",
    host: row?.host || hostFromUrl(row?.resolvedUrl),
    sourceName: row?.sourceName || "",
    sourceType: row?.sourceType || "",
    fetchState: "not_fetched",
    reason,
    canonicalWrites: 0,
    productionWrite: false
  };
}

async function fetchOne(row, index, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const startedAt = new Date().toISOString();

  try {
    const response = await fetch(row.resolvedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Ai-MatchLab fixture identity second-source diagnostic/1.0",
        "accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"
      }
    });

    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    const limitedBody = body.slice(0, options.maxBytes);

    return {
      ok: true,
      snapshot: {
        index,
        taskId: row.taskId,
        leagueSlug: row.leagueSlug,
        name: row.name,
        targetDate: row.targetDate,
        homeTeam: row.homeTeam,
        awayTeam: row.awayTeam,
        sourceName: row.sourceName,
        sourceType: row.sourceType,
        sourceUrl: row.resolvedUrl,
        resolvedUrl: response.url || row.resolvedUrl,
        host: hostFromUrl(response.url || row.resolvedUrl),
        fetchedAt: new Date().toISOString(),
        startedAt,
        http: {
          status: response.status,
          ok: response.ok,
          finalUrl: response.url || row.resolvedUrl,
          contentType
        },
        rawText: limitedBody,
        plainText: plainTextFromHtml(limitedBody).slice(0, 200000),
        sourceFetchState: "fetched_second_source_snapshot",
        canonicalWrites: 0,
        productionWrite: false
      }
    };
  } catch (error) {
    return {
      ok: false,
      rejected: {
        ...blockedFetch(row, index, error?.name === "AbortError" ? "fetch_timeout" : "fetch_failed"),
        error: error?.message || String(error)
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

function summarize(fetchedSecondSourceSnapshots, rejectedFetches, rows, options) {
  const byHost = {};
  const byStatus = {};
  const byRejectReason = {};

  for (const row of fetchedSecondSourceSnapshots) {
    byHost[row.host || "unknown"] = (byHost[row.host || "unknown"] || 0) + 1;
    byStatus[String(row.http?.status || "unknown")] = (byStatus[String(row.http?.status || "unknown")] || 0) + 1;
  }

  for (const row of rejectedFetches) {
    byRejectReason[row.reason || "unknown"] = (byRejectReason[row.reason || "unknown"] || 0) + 1;
  }

  return {
    inputFetchPlanRowCount: rows.length,
    processedCount: Math.min(rows.length, options.limit),
    fetchedCount: fetchedSecondSourceSnapshots.length,
    rejectedFetchCount: rejectedFetches.length,
    allowFetch: options.allowFetch === true,
    sourceFetch: fetchedSecondSourceSnapshots.length > 0,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    byHost,
    byStatus,
    byRejectReason
  };
}

async function buildReport(input, options = {}) {
  const allRows = normalizeFetchPlanRows(input);
  const rows = allRows.slice(0, options.limit);
  const fetchedSecondSourceSnapshots = [];
  const rejectedFetches = [];

  if (options.allowFetch !== true) {
    for (let i = 0; i < rows.length; i += 1) {
      rejectedFetches.push(blockedFetch(rows[i], i, "blocked_fetch_requires_allow_fetch"));
    }
  } else {
    for (let i = 0; i < rows.length; i += 1) {
      const result = await fetchOne(rows[i], i, options);
      if (result.ok) fetchedSecondSourceSnapshots.push(result.snapshot);
      else rejectedFetches.push(result.rejected);
    }
  }

  return {
    ok: true,
    job: "fetch-fixture-identity-second-source-controlled-fetch-plan-snapshots-file",
    mode: "fixture_identity_second_source_controlled_fetch_diagnostic",
    input: {
      path: options.inputPath || null,
      fetchPlanRowCount: allRows.length,
      processedCount: rows.length,
      limit: options.limit,
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
      allowFetch: options.allowFetch === true
    },
    summary: summarize(fetchedSecondSourceSnapshots, rejectedFetches, allRows, options),
    guarantees: {
      diagnosticOnly: true,
      fetchRequiresAllowFetch: true,
      allowFetch: options.allowFetch === true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      noProductionWrite: true,
      noFixtureWrite: true,
      noHistoryWrite: true,
      noValueWrite: true,
      noDetailsWrite: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    fetchedSecondSourceSnapshots,
    rejectedFetches
  };
}

function selfTestInput() {
  return {
    fetchPlanRows: [
      {
        taskId: "fixture_identity_second_source_search:2026-05-31:bel.1:01:resolve",
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-31",
        homeTeam: "Gent",
        awayTeam: "Genk",
        resolvedUrl: "https://example.com/gent-genk",
        sourceName: "Example",
        sourceType: "official_club",
        validationState: "validated_fixture_identity_second_source_resolved_url",
        sourceFetchState: "planned_not_fetched",
        fetchRequiresAllowFetch: true
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

  if (report.summary.fetchedCount !== 0 || report.summary.rejectedFetchCount !== 1) {
    throw new Error("self-test failed: fetch must be blocked without --allow-fetch");
  }

  if (report.rejectedFetches[0]?.reason !== "blocked_fetch_requires_allow_fetch") {
    throw new Error("self-test failed: expected blocked_fetch_requires_allow_fetch");
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false || report.guarantees.dryRun !== true) {
    throw new Error("self-test failed: write safety guarantees missing");
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

  if (args.output) {
    writeJson(args.output, report);
  }

  console.log(JSON.stringify({
    ok: report.ok,
    job: report.job,
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "fetch-fixture-identity-second-source-controlled-fetch-plan-snapshots-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  }, null, 2));
  process.exitCode = 1;
});