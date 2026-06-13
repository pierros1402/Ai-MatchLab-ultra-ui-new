#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_DATE = "2026-06-13";
const DEFAULT_REVIEW_BOARD =
  "data/football-truth/_diagnostics/scoped-active-today-trusted-fixture-fetch-input-review-board-2026-06-13/scoped-active-today-trusted-fixture-fetch-input-review-board-2026-06-13.json";

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    reviewBoard: DEFAULT_REVIEW_BOARD,
    output: null,
    allowFetch: false,
    timeoutMs: 20000
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--review-board") args.reviewBoard = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else if (arg === "--allow-fetch") args.allowFetch = true;
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `scoped-active-today-trusted-fixture-fetch-snapshots-${args.date}`,
      `scoped-active-today-trusted-fixture-fetch-snapshots-${args.date}.json`
    );
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function sha256(text) {
  return crypto.createHash("sha256").update(text || "").digest("hex");
}

function sanitizeFilePart(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function textPreview(text, maxLength = 2000) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function approvedCandidateReviews(reviewRows) {
  const rows = [];

  for (const row of reviewRows) {
    if (![
      "ready_for_scoped_fetch_approval",
      "ready_for_landing_fetch_only"
    ].includes(row.rowReviewStatus)) {
      continue;
    }

    for (const candidate of row.candidateReviews || []) {
      if (!["ready", "landing_fetch_only"].includes(candidate.approvalReadiness)) continue;

      rows.push({
        competitionSlug: row.competitionSlug,
        competitionName: row.competitionName || "",
        providerHint: row.providerHint,
        refreshClass: row.refreshClass,
        presentInAthensOracle: Boolean(row.presentInAthensOracle),
        oracleExpectedActiveToday: Boolean(row.oracleExpectedActiveToday),
        rowReviewStatus: row.rowReviewStatus,
        rowApprovalScope: row.rowApprovalScope,
        candidateId: candidate.candidateId,
        fetchUrl: candidate.fetchUrl,
        routeClass: candidate.routeClass,
        adapterHint: candidate.adapterHint || "",
        approvalReadiness: candidate.approvalReadiness,
        candidateSource: candidate.candidateSource || "",
        requiresAdapter: Boolean(candidate.requiresAdapter)
      });
    }
  }

  return rows;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Ai-MatchLab-FootballTruth/1.0 scoped-truth-diagnostic",
        "Accept": "text/html,application/json,text/plain,*/*"
      }
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") || "",
      rawText: text,
      error: ""
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      statusText: "",
      finalUrl: url,
      contentType: "",
      rawText: "",
      error: `${error?.name || "Error"}: ${error?.message || String(error)}`
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.allowFetch) {
    throw new Error("Refusing to fetch without explicit --allow-fetch.");
  }

  const reviewBoard = readJson(args.reviewBoard);
  const reviewRows = Array.isArray(reviewBoard.reviewRows) ? reviewBoard.reviewRows : [];
  const candidates = approvedCandidateReviews(reviewRows);

  const outDir = path.dirname(args.output);
  const snapshotDir = path.join(outDir, "snapshots");
  fs.mkdirSync(snapshotDir, { recursive: true });

  const fetchRows = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const startedAt = new Date().toISOString();

    console.error(`[${i + 1}/${candidates.length}] fetch ${candidate.competitionSlug} ${candidate.fetchUrl}`);

    const result = await fetchWithTimeout(candidate.fetchUrl, args.timeoutMs);
    const completedAt = new Date().toISOString();

    const snapshotBase = `${String(i + 1).padStart(3, "0")}__${sanitizeFilePart(candidate.competitionSlug)}__${sanitizeFilePart(candidate.providerHint)}__${sanitizeFilePart(candidate.routeClass)}`;
    const rawSnapshotPath = path.join(snapshotDir, `${snapshotBase}.txt`);
    const metaSnapshotPath = path.join(snapshotDir, `${snapshotBase}.meta.json`);

    fs.writeFileSync(rawSnapshotPath, result.rawText || "", "utf8");

    const meta = {
      ...candidate,
      startedAt,
      completedAt,
      fetchOk: result.ok,
      status: result.status,
      statusText: result.statusText,
      finalUrl: result.finalUrl,
      contentType: result.contentType,
      rawTextLength: result.rawText.length,
      rawTextSha256: sha256(result.rawText),
      plainTextPreview: textPreview(result.rawText),
      error: result.error,
      rawSnapshotPath
    };

    fs.writeFileSync(metaSnapshotPath, `${stableJson(meta)}\n`, "utf8");

    fetchRows.push({
      ...meta,
      metaSnapshotPath
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "fetch-football-truth-scoped-active-today-trusted-fixture-snapshots-file",
    mode: "scoped_fetch_snapshots_only_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: true,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    allowFetch: true,
    dryRun: false,
    inputs: {
      reviewBoard: args.reviewBoard,
      reviewRowCount: reviewRows.length,
      approvedCandidateCount: candidates.length,
      timeoutMs: args.timeoutMs
    },
    summary: {
      approvedCandidateCount: candidates.length,
      fetchRowCount: fetchRows.length,
      fetchOkCount: fetchRows.filter((row) => row.fetchOk).length,
      fetchFailedCount: fetchRows.filter((row) => !row.fetchOk).length,
      status2xxCount: fetchRows.filter((row) => Number(row.status) >= 200 && Number(row.status) < 300).length,
      status3xxFinalCount: fetchRows.filter((row) => Number(row.status) >= 300 && Number(row.status) < 400).length,
      status4xxCount: fetchRows.filter((row) => Number(row.status) >= 400 && Number(row.status) < 500).length,
      status5xxCount: fetchRows.filter((row) => Number(row.status) >= 500 && Number(row.status) < 600).length,
      athensOracleFetchRowsCount: fetchRows.filter((row) => row.presentInAthensOracle).length,
      scopedReadyFetchRowsCount: fetchRows.filter((row) => row.approvalReadiness === "ready").length,
      landingOnlyFetchRowsCount: fetchRows.filter((row) => row.approvalReadiness === "landing_fetch_only").length,
      canonicalWriteEligibleNowCount: 0,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_fetch_snapshot_review_board_before_any_extraction_or_canonical_write"
    },
    counts: {
      byStatus: countBy(fetchRows, "status"),
      byFetchOk: countBy(fetchRows, "fetchOk"),
      byRouteClass: countBy(fetchRows, "routeClass"),
      byApprovalReadiness: countBy(fetchRows, "approvalReadiness"),
      byProviderHint: countBy(fetchRows, "providerHint")
    },
    guardrails: [
      "This run fetched scoped diagnostic snapshots only.",
      "No search provider was used.",
      "No canonical file was written.",
      "No production file was written.",
      "HTTP 200 does not imply fixture truth.",
      "Landing-only snapshots must not be treated as fixture truth without follow-up link extraction and validation.",
      "A separate snapshot review board is required before extraction or canonical writes."
    ],
    fetchRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`, "utf8");

  console.log(JSON.stringify({
    output: args.output,
    approvedCandidateCount: output.summary.approvedCandidateCount,
    fetchRowCount: output.summary.fetchRowCount,
    fetchOkCount: output.summary.fetchOkCount,
    fetchFailedCount: output.summary.fetchFailedCount,
    status2xxCount: output.summary.status2xxCount,
    status4xxCount: output.summary.status4xxCount,
    status5xxCount: output.summary.status5xxCount,
    athensOracleFetchRowsCount: output.summary.athensOracleFetchRowsCount,
    scopedReadyFetchRowsCount: output.summary.scopedReadyFetchRowsCount,
    landingOnlyFetchRowsCount: output.summary.landingOnlyFetchRowsCount,
    canonicalWriteEligibleNowCount: 0,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
