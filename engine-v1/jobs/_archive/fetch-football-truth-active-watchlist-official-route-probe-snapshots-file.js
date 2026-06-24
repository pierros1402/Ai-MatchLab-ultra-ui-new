#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing --input");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    allowFetch: false,
    limit: 40,
    timeoutMs: 15000,
    maxBytes: 500000,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = asText(argv[i]);

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--allow-fetch") {
      args.allowFetch = true;
      continue;
    }

    if (arg === "--input") {
      args.input = asText(argv[++i]);
      continue;
    }

    if (arg === "--output") {
      args.output = asText(argv[++i]);
      continue;
    }

    if (arg === "--limit") {
      args.limit = Number(argv[++i] || 40);
      continue;
    }

    if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[++i] || 15000);
      continue;
    }

    if (arg === "--max-bytes") {
      args.maxBytes = Number(argv[++i] || 500000);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function normalizeUrl(value) {
  const raw = asText(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
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

function plainTextFromHtml(html) {
  return asText(html)
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

function inputRows(input) {
  if (Array.isArray(input?.fetchInputRows)) return input.fetchInputRows;
  if (Array.isArray(input?.candidateUrlRows)) return input.candidateUrlRows;
  if (Array.isArray(input?.snapshotTargetRows)) return input.snapshotTargetRows;
  if (Array.isArray(input?.rows)) return input.rows;
  return [];
}

function buildBlockedReport(input, reason, options) {
  const rows = inputRows(input);

  return {
    ok: true,
    job: "fetch-football-truth-active-watchlist-official-route-probe-snapshots-file",
    mode: "metadata_preserving_official_route_probe_snapshot_fetch",
    status: "blocked",
    generatedAt: new Date().toISOString(),
    summary: {
      inputRowCount: rows.length,
      selectedRowCount: 0,
      fetchedSnapshotCount: 0,
      rejectedRowCount: 0,
      blockedReason: reason,
      allowFetch: options.allowFetch === true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    fetchedSourceSnapshots: [],
    rejectedRows: [],
    guarantees: {
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      preservesCompetitionMetadataPerInputRow: true,
      dedupeByFetchInputIdNotUrl: true,
      usesOnlyProvidedCandidateUrls: true,
      inventedUrls: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selectRows(input, limit) {
  const rows = inputRows(input);
  const selected = [];
  const rejectedRows = [];
  const seenIds = new Set();

  for (const row of rows) {
    const fetchInputId = asText(row.fetchInputId || row.sourceTaskId || row.routeCandidateId);
    const candidateUrl = normalizeUrl(row.candidateUrl || row.sourceUrl || row.checkedSourceUrl || row.url);
    const leagueSlug = asText(row.leagueSlug || row.competitionSlug);

    if (!fetchInputId) {
      rejectedRows.push({ ...row, reason: "missing_fetch_input_id", canonicalWrites: 0, productionWrite: false });
      continue;
    }

    if (seenIds.has(fetchInputId)) {
      rejectedRows.push({ ...row, reason: "duplicate_fetch_input_id", canonicalWrites: 0, productionWrite: false });
      continue;
    }

    if (!candidateUrl) {
      rejectedRows.push({ ...row, reason: "missing_candidate_url", canonicalWrites: 0, productionWrite: false });
      continue;
    }

    if (!leagueSlug) {
      rejectedRows.push({ ...row, reason: "missing_league_slug", canonicalWrites: 0, productionWrite: false });
      continue;
    }

    seenIds.add(fetchInputId);

    selected.push({
      ...row,
      fetchInputId,
      leagueSlug,
      competitionSlug: asText(row.competitionSlug || leagueSlug),
      candidateUrl,
      hostname: hostnameOf(candidateUrl)
    });
  }

  return {
    selected: selected.slice(0, Math.max(0, limit)),
    rejectedRows
  };
}

async function fetchSnapshot(row, options) {
  const startedAt = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    const response = await fetch(row.candidateUrl, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AiMatchLabFootballTruth/1.0; +https://ai-matchlab.local/diagnostic-fetch)"
      }
    });

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";
    const rawText = (await response.text()).slice(0, options.maxBytes);
    const plainText = plainTextFromHtml(rawText);
    const finalUrl = normalizeUrl(response.url || row.candidateUrl) || row.candidateUrl;

    const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? plainTextFromHtml(titleMatch[1]) : "";

    return {
      fetchInputId: row.fetchInputId,
      leagueSlug: row.leagueSlug,
      competitionSlug: row.competitionSlug,
      host: asText(row.host || row.hostname),
      hostname: hostnameOf(finalUrl) || row.hostname,
      candidateUrl: row.candidateUrl,
      sourceUrl: asText(row.sourceUrl || row.candidateUrl),
      checkedSourceUrl: asText(row.checkedSourceUrl || row.candidateUrl),
      finalUrl,
      routeSource: asText(row.routeSource),
      routePurposes: Array.isArray(row.routePurposes) ? row.routePurposes : [],
      fetchPurpose: asText(row.fetchPurpose),
      priority: Number(row.priority || 0),
      status: response.status,
      httpStatus: response.status,
      ok: response.ok,
      contentType,
      title,
      rawText,
      plainText,
      rawTextLength: rawText.length,
      plainTextLength: plainText.length,
      startedAt,
      fetchedAt: new Date().toISOString(),
      fetchRequiresExplicitAllowFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false
    };
  } catch (error) {
    return {
      fetchInputId: row.fetchInputId,
      leagueSlug: row.leagueSlug,
      competitionSlug: row.competitionSlug,
      host: asText(row.host || row.hostname),
      hostname: row.hostname,
      candidateUrl: row.candidateUrl,
      sourceUrl: asText(row.sourceUrl || row.candidateUrl),
      checkedSourceUrl: asText(row.checkedSourceUrl || row.candidateUrl),
      finalUrl: row.candidateUrl,
      routeSource: asText(row.routeSource),
      routePurposes: Array.isArray(row.routePurposes) ? row.routePurposes : [],
      fetchPurpose: asText(row.fetchPurpose),
      priority: Number(row.priority || 0),
      status: "fetch_error",
      httpStatus: 0,
      ok: false,
      error: error?.name === "AbortError" ? "timeout" : (error?.message || String(error)),
      rawText: "",
      plainText: "",
      rawTextLength: 0,
      plainTextLength: 0,
      startedAt,
      fetchedAt: new Date().toISOString(),
      fetchRequiresExplicitAllowFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false
    };
  }
}

async function buildReport(input, options) {
  if (options.allowFetch !== true) {
    return buildBlockedReport(input, "missing_explicit_allow_fetch", options);
  }

  const { selected, rejectedRows } = selectRows(input, options.limit);
  const fetchedSourceSnapshots = [];

  for (const row of selected) {
    fetchedSourceSnapshots.push(await fetchSnapshot(row, options));
  }

  const byStatus = {};
  const byLeagueSlug = {};
  const byHostname = {};

  for (const row of fetchedSourceSnapshots) {
    byStatus[String(row.status)] = (byStatus[String(row.status)] || 0) + 1;
    byLeagueSlug[row.leagueSlug] = (byLeagueSlug[row.leagueSlug] || 0) + 1;
    byHostname[row.hostname] = (byHostname[row.hostname] || 0) + 1;
  }

  return {
    ok: true,
    job: "fetch-football-truth-active-watchlist-official-route-probe-snapshots-file",
    mode: "metadata_preserving_official_route_probe_snapshot_fetch",
    status: "fetched",
    generatedAt: new Date().toISOString(),
    summary: {
      inputRowCount: inputRows(input).length,
      selectedRowCount: selected.length,
      fetchedSnapshotCount: fetchedSourceSnapshots.length,
      rejectedRowCount: rejectedRows.length,
      allowFetch: true,
      sourceFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byStatus,
      byLeagueSlug,
      byHostname
    },
    fetchedSourceSnapshots,
    rejectedRows,
    guarantees: {
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: true,
      noFetch: false,
      noUrlFetch: false,
      preservesCompetitionMetadataPerInputRow: true,
      dedupeByFetchInputIdNotUrl: true,
      usesOnlyProvidedCandidateUrls: true,
      inventedUrls: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

async function selfTest() {
  const input = {
    fetchInputRows: [
      {
        fetchInputId: "a",
        competitionSlug: "abc.1",
        leagueSlug: "abc.1",
        candidateUrl: "https://example.test/fixtures",
        host: "example.test"
      },
      {
        fetchInputId: "b",
        competitionSlug: "abc.2",
        leagueSlug: "abc.2",
        candidateUrl: "https://example.test/fixtures",
        host: "example.test"
      }
    ]
  };

  const blocked = await buildReport(input, { allowFetch: false, limit: 10, timeoutMs: 10, maxBytes: 1000 });
  if (blocked.summary.selectedRowCount !== 0) throw new Error("blocked mode must not select rows");
  if (blocked.guarantees.noFetch !== true) throw new Error("blocked mode must not fetch");

  const selected = selectRows(input, 10).selected;
  if (selected.length !== 2) throw new Error("same URL must be kept for distinct fetchInputId rows");
  if (selected[0].leagueSlug === selected[1].leagueSlug) throw new Error("leagueSlug metadata must be preserved");

  return blocked;
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = await selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "fetch-football-truth-active-watchlist-official-route-probe-snapshots-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = await buildReport(input, {
    allowFetch: args.allowFetch,
    limit: Number.isFinite(args.limit) ? args.limit : 40,
    timeoutMs: Number.isFinite(args.timeoutMs) ? args.timeoutMs : 15000,
    maxBytes: Number.isFinite(args.maxBytes) ? args.maxBytes : 500000
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    status: report.status,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "fetch-football-truth-active-watchlist-official-route-probe-snapshots-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});