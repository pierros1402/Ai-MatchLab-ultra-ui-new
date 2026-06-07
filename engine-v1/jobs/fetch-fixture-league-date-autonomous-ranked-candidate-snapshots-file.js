#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    allowFetch: false,
    limit: 10,
    timeoutMs: 12000,
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

    if (arg === "--input") {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--output") {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--limit") {
      args.limit = Number(argv[++i]);
      continue;
    }

    if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[++i]);
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function readJson(filePath, label) {
  if (!filePath) throw new Error(`missing ${label} path`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing output path");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeUrl(value) {
  const raw = asText(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
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

function arrayFromInput(input) {
  if (Array.isArray(input?.fetchTaskRows)) return input.fetchTaskRows;
  if (Array.isArray(input?.rankedCandidateUrlRows)) return input.rankedCandidateUrlRows;
  if (Array.isArray(input?.readyForFetchRows)) {
    return input.readyForFetchRows.filter((row) => row?.readyForFetch === true);
  }
  if (Array.isArray(input?.candidateUrlRows)) return input.candidateUrlRows;
  if (Array.isArray(input?.rows)) return input.rows;
  return [];
}
function candidateUrlOf(row) {
  return normalizeUrl(row?.candidateUrl || row?.url || row?.resolvedUrl);
}

function buildBlockedReport(input, reason, options = {}) {
  const rows = arrayFromInput(input);
  return {
    ok: true,
    job: "fetch-fixture-league-date-autonomous-ranked-candidate-snapshots-file",
    mode: "read_only_autonomous_ranked_candidate_snapshot_fetch",
    generatedAt: new Date().toISOString(),
    status: "blocked",
    summary: {
      inputCandidateUrlCount: rows.length,
      selectedCandidateUrlCount: 0,
      fetchedSnapshotCount: 0,
      rejectedCandidateCount: 0,
      blockedReason: reason,
      allowFetch: options.allowFetch === true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedRankedCandidates: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    fetchedSourceSnapshots: [],
    rejectedRows: []
  };
}

function selectCandidates(input, options = {}) {
  const rows = arrayFromInput(input);
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : 10;
  const selected = [];
  const rejected = [];
  const seen = new Set();

  rows.forEach((row, index) => {
    const candidateUrl = candidateUrlOf(row);
    const base = {
      inputIndex: index,
      leagueSlug: asText(row.leagueSlug),
      name: asText(row.name || row.leagueName),
      dayKey: asText(row.dayKey || row.targetDate),
      candidateUrl,
      hostname: hostnameOf(candidateUrl),
      title: asText(row.title),
      sourceFamily: asText(row.sourceFamily || row.expectedSourceFamily),
      sourceId: asText(row.sourceId),
      sourceCandidateType: asText(row.sourceCandidateType || row.type),
      type: asText(row.type),
      trustTier: asText(row.trustTier),
      compositeScore: Number(row.compositeScore ?? row.score ?? 0),
      searchTargetId: asText(row.searchTargetId),
      query: asText(row.query),
      truthRole: asText(row.truthRole),
      sourceClass: asText(row.sourceClass),
      reviewerDecision: asText(row.reviewerDecision),
      readyForFetch: row.readyForFetch === true,
      fetchPurpose: asText(row.fetchPurpose),
      fetchTaskId: asText(row.fetchTaskId),
      sourceTaskId: asText(row.sourceTaskId),
      finalUrl: asText(row.finalUrl)
    };

    if (!candidateUrl) {
      rejected.push({ ...base, rejectionReason: "missing_or_invalid_candidate_url" });
      return;
    }

    if (seen.has(candidateUrl)) {
      rejected.push({ ...base, rejectionReason: "duplicate_candidate_url" });
      return;
    }

    seen.add(candidateUrl);

    if (selected.length < limit) {
      selected.push(base);
    } else {
      rejected.push({ ...base, rejectionReason: "over_limit" });
    }
  });

  return { selected, rejected, inputCount: rows.length };
}

function plainTextFromHtml(html) {
  return asText(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchOne(row, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? Math.floor(options.timeoutMs) : 12000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = new Date().toISOString();

  try {
    const response = await fetch(row.candidateUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Ai-MatchLab autonomous fixture acquisition diagnostic/1.0",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5"
      }
    });

    const finalUrl = response.url || row.candidateUrl;
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    return {
      ...row,
      resolvedUrl: row.candidateUrl,
      finalUrl,
      status: response.status,
      ok: response.ok,
      fetchedAt: new Date().toISOString(),
      startedAt,
      http: {
        status: response.status,
        ok: response.ok,
        finalUrl,
        contentType,
        bytes: Buffer.byteLength(text, "utf8")
      },
      contentType,
      rawText: text.slice(0, 500000),
      plainText: plainTextFromHtml(text).slice(0, 200000),
      canonicalWrites: 0,
      productionWrite: false
    };
  } catch (error) {
    return {
      ...row,
      resolvedUrl: row.candidateUrl,
      finalUrl: "",
      status: 0,
      ok: false,
      fetchedAt: new Date().toISOString(),
      startedAt,
      fetchError: error && error.name === "AbortError" ? "fetch_timeout" : asText(error?.message || error),
      http: {
        status: 0,
        ok: false,
        finalUrl: "",
        contentType: "",
        bytes: 0
      },
      rawText: "",
      plainText: "",
      canonicalWrites: 0,
      productionWrite: false
    };
  } finally {
    clearTimeout(timer);
  }
}

async function buildReport(input, options = {}) {
  if (options.allowFetch !== true) {
    return buildBlockedReport(input, "missing_allow_fetch", options);
  }

  const { selected, rejected, inputCount } = selectCandidates(input, options);
  const fetchedSourceSnapshots = [];

  for (const row of selected) {
    fetchedSourceSnapshots.push(await fetchOne(row, options));
  }

  const byStatus = {};
  const byHostname = {};
  for (const snapshot of fetchedSourceSnapshots) {
    const status = String(snapshot.status ?? "unknown");
    byStatus[status] = (byStatus[status] || 0) + 1;
    const hostname = snapshot.hostname || hostnameOf(snapshot.finalUrl || snapshot.resolvedUrl);
    byHostname[hostname] = (byHostname[hostname] || 0) + 1;
  }

  return {
    ok: true,
    job: "fetch-fixture-league-date-autonomous-ranked-candidate-snapshots-file",
    mode: "read_only_autonomous_ranked_candidate_snapshot_fetch",
    generatedAt: new Date().toISOString(),
    status: "fetched",
    summary: {
      inputCandidateUrlCount: inputCount,
      selectedCandidateUrlCount: selected.length,
      fetchedSnapshotCount: fetchedSourceSnapshots.length,
      rejectedCandidateCount: rejected.length,
      allowFetch: true,
      sourceFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byStatus,
      byHostname
    },
    guarantees: {
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: true,
      noFetch: false,
      noUrlFetch: false,
      usesOnlyProvidedRankedCandidates: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    fetchedSourceSnapshots,
    rejectedRows: rejected
  };
}

function selfTestInput() {
  return {
    rankedCandidateUrlRows: [
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        dayKey: "2026-05-22",
        candidateUrl: "https://example.test/fixtures",
        hostname: "example.test",
        title: "Belgian Pro League fixtures",
        sourceFamily: "official_league",
        compositeScore: 88
      }
    ]
  };
}

function selfTestReadyRowsInput() {
  return {
    readyForFetchRows: [
      {
        leagueSlug: "afc.champions",
        name: "AFC Champions League Elite",
        dayKey: "2026-05-22",
        targetDate: "2026-05-22",
        resolvedUrl: "https://example.test/afc-fixtures",
        title: "AFC Champions League Elite fixtures",
        sourceFamily: "official_league",
        compositeScore: 100,
        truthRole: "primary_candidate_after_fetch_evidence",
        sourceClass: "official_governing_or_competition_operator",
        reviewerDecision: "candidate_official_url_pending_fetch",
        readyForFetch: true,
        fetchPurpose: "fixture_league_date_candidate_url_snapshot"
      },
      {
        leagueSlug: "bad.1",
        name: "Bad League",
        dayKey: "2026-05-22",
        resolvedUrl: "https://example.test/not-ready",
        readyForFetch: false
      }
    ]
  };
}

function selfTestFetchTaskRowsInput() {
  return {
    fetchTaskRows: [
      {
        fetchTaskId: "uefa.champions::fixture_source_fetch::001",
        sourceTaskId: "uefa.champions::fixture_discovery::01",
        leagueSlug: "uefa.champions",
        name: "UEFA Champions League",
        dayKey: "2026-06-03",
        candidateUrl: "https://example.test/uefa-fixtures",
        finalUrl: "https://example.test/uefa-fixtures",
        title: "UEFA Champions League fixtures",
        sourceClass: "official_governing_or_competition_operator",
        truthRole: "primary_candidate_after_fetch_evidence",
        compositeScore: 64,
        fetchPurpose: "fixture_discovery_source_snapshot"
      }
    ]
  };
}
async function selfTest() {
  const blocked = await buildReport(selfTestInput(), { allowFetch: false, limit: 1, timeoutMs: 10 });

  if (blocked.summary.blockedReason !== "missing_allow_fetch") {
    throw new Error("self-test failed: expected missing_allow_fetch block");
  }

  if (blocked.guarantees.sourceFetch !== false || blocked.guarantees.noFetch !== true) {
    throw new Error("self-test failed: blocked report must not fetch");
  }

  const selected = selectCandidates(selfTestInput(), { limit: 1 });
  if (selected.selected.length !== 1) {
    throw new Error("self-test failed: expected one selected candidate");
  }

  const readySelected = selectCandidates(selfTestReadyRowsInput(), { limit: 10 });
  if (readySelected.inputCount !== 1) {
    throw new Error(`self-test failed: expected one ready input row, got ${readySelected.inputCount}`);
  }
  if (readySelected.selected.length !== 1) {
    throw new Error("self-test failed: expected one selected ready-for-fetch row");
  }
  if (readySelected.selected[0].candidateUrl !== "https://example.test/afc-fixtures") {
    throw new Error("self-test failed: expected resolvedUrl to become candidateUrl");
  }
  if (readySelected.selected[0].truthRole !== "primary_candidate_after_fetch_evidence") {
    throw new Error("self-test failed: expected truthRole metadata to be preserved");
  }
  if (readySelected.selected[0].readyForFetch !== true) {
    throw new Error("self-test failed: expected readyForFetch metadata to be preserved");
  }

  const fetchTaskSelected = selectCandidates(selfTestFetchTaskRowsInput(), { limit: 10 });
  if (fetchTaskSelected.inputCount !== 1) {
    throw new Error(`self-test failed: expected one fetchTaskRows input row, got ${fetchTaskSelected.inputCount}`);
  }
  if (fetchTaskSelected.selected.length !== 1) {
    throw new Error("self-test failed: expected one selected fetch task row");
  }
  if (fetchTaskSelected.selected[0].candidateUrl !== "https://example.test/uefa-fixtures") {
    throw new Error("self-test failed: expected fetchTaskRows candidateUrl to be selected");
  }
  if (fetchTaskSelected.selected[0].fetchTaskId !== "uefa.champions::fixture_source_fetch::001") {
    throw new Error("self-test failed: expected fetchTaskId metadata to be preserved");
  }
  if (fetchTaskSelected.selected[0].finalUrl !== "https://example.test/uefa-fixtures") {
    throw new Error("self-test failed: expected finalUrl metadata to be preserved");
  }

  return {
    ok: true,
    selfTest: "fetch-fixture-league-date-autonomous-ranked-candidate-snapshots-file",
    summary: blocked.summary,
    guarantees: blocked.guarantees
  };
}
async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const result = await selfTest();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!args.input) throw new Error("missing --input");
  if (!args.output) throw new Error("missing --output");

  const input = readJson(args.input, "input");
  const report = await buildReport(input, {
    allowFetch: args.allowFetch,
    limit: args.limit,
    timeoutMs: args.timeoutMs
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: args.output,
    status: report.status,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});