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
    maxTextChars: 12000,
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

    if (arg === "--max-text-chars") {
      args.maxTextChars = readPositiveInteger(argv[++i], "--max-text-chars");
      continue;
    }

    if (arg.startsWith("--max-text-chars=")) {
      args.maxTextChars = readPositiveInteger(arg.slice("--max-text-chars=".length), "--max-text-chars");
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
    "  node engine-v1/jobs/prepare-final-result-evidence-rows-from-source-snapshots-file.js --input <source-snapshots.json> [--output <prepared.json>]",
    "",
    "Input shape:",
    "  output from fetch-final-result-source-url-snapshots-file.js",
    "",
    "Purpose:",
    "  Convert fetchedSourceSnapshots into preparedRows for the final-result evidence extractor.",
    "",
    "Guarantees:",
    "  - read-only diagnostic",
    "  - no fetch",
    "  - no evidence extraction",
    "  - no final truth decision",
    "  - canonicalWrites: 0",
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeSnapshots(input) {
  if (Array.isArray(input?.fetchedSourceSnapshots)) return input.fetchedSourceSnapshots;
  if (Array.isArray(input?.sourceSnapshots)) return input.sourceSnapshots;
  if (Array.isArray(input?.snapshots)) return input.snapshots;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input)) return input;
  return [];
}

function truncateText(text, maxTextChars) {
  const value = String(text || "");
  if (value.length <= maxTextChars) {
    return {
      text: value,
      truncated: false
    };
  }

  return {
    text: value.slice(0, maxTextChars),
    truncated: true
  };
}

function textFromSnapshot(snapshot) {
  return cleanString(
    snapshot?.body?.text ||
    snapshot?.text ||
    snapshot?.html ||
    snapshot?.content ||
    ""
  );
}

function inferTitle(snapshot) {
  const sourceName = cleanString(snapshot?.sourceName);
  const url = cleanString(snapshot?.finalUrl || snapshot?.requestedUrl);

  if (sourceName && url) return sourceName + " - " + url;
  if (sourceName) return sourceName;
  if (url) return url;
  return "Final result source snapshot";
}

function inferFinalSignal(text, snapshot) {
  const statusText = cleanString(snapshot?.status || snapshot?.statusText || snapshot?.body?.statusText);
  const haystack = [
    statusText,
    text,
    snapshot?.title,
    snapshot?.body?.title
  ].map(cleanString).filter(Boolean).join(" \n ").toLowerCase();

  const hasFinalSignal =
    /\bft\b/.test(haystack) ||
    /\bfull[ -]?time\b/.test(haystack) ||
    /\bfull time\b/.test(haystack) ||
    /\bfinal score\b/.test(haystack) ||
    /\bfinal result\b/.test(haystack) ||
    /\bended\b/.test(haystack) ||
    /\bafter full time\b/.test(haystack);

  if (!hasFinalSignal) {
    return {
      status: statusText || "UNKNOWN",
      final: false,
      reason: "no_final_signal_hint"
    };
  }

  return {
    status: "FT",
    final: true,
    reason: "final_signal_hint_from_snapshot_text"
  };
}

function buildPreparedRow(snapshot, index, options = {}) {
  const rawText = textFromSnapshot(snapshot);
  const truncated = truncateText(rawText, options.maxTextChars || 12000);
  const sourceType = cleanString(snapshot?.sourceType || "trusted");
  const sourceName = cleanString(snapshot?.sourceName || snapshot?.host || "unknown_source");
  const requestedUrl = cleanString(snapshot?.requestedUrl || snapshot?.url || snapshot?.resolvedUrl);
  const finalUrl = cleanString(snapshot?.finalUrl || requestedUrl);
  const homeTeam = cleanString(snapshot?.homeTeam || snapshot?.teams?.home || snapshot?.matchedTask?.homeTeam);
  const awayTeam = cleanString(snapshot?.awayTeam || snapshot?.teams?.away || snapshot?.matchedTask?.awayTeam);
  const finalSignal = inferFinalSignal(truncated.text, snapshot);

  return {
    index,
    source: sourceType,
    sourceKey: cleanString(snapshot?.taskId || snapshot?.sourceKey || sourceType + ":" + sourceName + ":" + index),
    sourceName,
    sourceType,
    sourceUrl: finalUrl,
    requestedUrl,
    host: cleanString(snapshot?.host),
    title: inferTitle(snapshot),
    text: truncated.text,
    textSha256: sha256(truncated.text),
    textTruncated: truncated.truncated,
    status: finalSignal.status,
    final: finalSignal.final,
    finalSignalHint: finalSignal.reason,
    score: snapshot?.score || null,
    day: cleanString(snapshot?.day),
    leagueSlug: cleanString(snapshot?.leagueSlug),
    matchId: cleanString(snapshot?.matchId),
    homeTeam,
    awayTeam,
    matchedTask: snapshot?.matchedTask || null,
    http: snapshot?.http || null,
    fetchedAt: cleanString(snapshot?.fetchedAt),
    fetchedSnapshotState: cleanString(snapshot?.fetchState || "fetched_diagnostic_snapshot"),
    preparedEvidenceState: "prepared_from_fetched_source_snapshot",
    finalTruthDecisionState: "not_decided",
    canonicalPromotionState: "blocked",
    canonicalWrites: 0
  };
}

function groupByMatch(preparedRows) {
  const map = new Map();

  for (const row of preparedRows) {
    const key = row.matchId || "unknown-match:" + row.index;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }

  return [...map.entries()].map(([matchId, rows], index) => {
    const first = rows[0] || {};
    return {
      index,
      watchRow: {
        matchId,
        day: cleanString(first.day),
        leagueSlug: cleanString(first.leagueSlug),
        homeTeam: cleanString(first.homeTeam),
        awayTeam: cleanString(first.awayTeam),
        sourcePreparedFromSnapshot: true
      },
      preparedRows: rows
    };
  });
}

function summarize(preparedRows, rejectedSnapshots, cases) {
  const bySourceType = {};
  const byHost = {};
  const byRejectReason = {};

  for (const row of preparedRows) {
    bySourceType[row.sourceType || "unknown"] = (bySourceType[row.sourceType || "unknown"] || 0) + 1;
    byHost[row.host || "unknown"] = (byHost[row.host || "unknown"] || 0) + 1;
  }

  for (const row of rejectedSnapshots) {
    byRejectReason[row.reason || "unknown"] = (byRejectReason[row.reason || "unknown"] || 0) + 1;
  }

  return {
    caseCount: cases.length,
    preparedRowCount: preparedRows.length,
    rejectedSnapshotCount: rejectedSnapshots.length,
    bySourceType,
    byHost,
    byRejectReason
  };
}

function buildReport(input, options = {}) {
  const snapshots = normalizeSnapshots(input);
  const preparedRows = [];
  const rejectedSnapshots = [];

  snapshots.forEach((snapshot, index) => {
    const text = textFromSnapshot(snapshot);
    const fetchState = cleanString(snapshot?.fetchState);

    if (fetchState && fetchState !== "fetched_diagnostic_snapshot") {
      rejectedSnapshots.push({
        index,
        taskId: cleanString(snapshot?.taskId),
        matchId: cleanString(snapshot?.matchId),
        reason: "snapshot_not_fetched_diagnostic_snapshot",
        fetchState,
        canonicalWrites: 0
      });
      return;
    }

    if (!text) {
      rejectedSnapshots.push({
        index,
        taskId: cleanString(snapshot?.taskId),
        matchId: cleanString(snapshot?.matchId),
        reason: "missing_snapshot_text",
        canonicalWrites: 0
      });
      return;
    }

    preparedRows.push(buildPreparedRow(snapshot, index, options));
  });

  const cases = groupByMatch(preparedRows);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "prepare-final-result-evidence-rows-from-source-snapshots-file",
    mode: "read_only_prepare_evidence_rows_from_source_snapshots",
    canonicalWrites: 0,
    input: {
      path: options.inputPath || null,
      sourceSnapshotCount: snapshots.length,
      maxTextChars: options.maxTextChars
    },
    summary: summarize(preparedRows, rejectedSnapshots, cases),
    guarantees: {
      noFetch: true,
      noEvidenceExtraction: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      noProductionRepair: true,
      noFixtureWrite: true,
      noHistoryWrite: true,
      noValueWrite: true,
      noDetailsWrite: true,
      canonicalWrites: 0
    },
    cases,
    preparedRows,
    rejectedSnapshots
  };
}

function runSelfTest() {
  const input = {
    fetchedSourceSnapshots: [
      {
        taskId: "snapshot-task-1",
        matchId: "self-test-1",
        day: "2026-05-18",
        leagueSlug: "test.1",
        homeTeam: "Alpha FC",
        awayTeam: "Beta FC",
        sourceName: "Example Diagnostic Source",
        sourceType: "trusted",
        requestedUrl: "https://example.com/report",
        finalUrl: "https://example.com/report",
        host: "example.com",
        fetchedAt: "2026-05-18T12:00:00.000Z",
        fetchState: "fetched_diagnostic_snapshot",
        http: {
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "text/html"
        },
        body: {
          text: "Full time: Alpha FC 2-1 Beta FC.",
          bytes: 34,
          truncated: false,
          sha256: "self-test"
        },
        matchedTask: {
          taskId: "snapshot-task-1",
          query: "\"Alpha FC\" \"Beta FC\" final score",
          intent: "exact_match_final_result",
          homeTeam: "Alpha FC",
          awayTeam: "Beta FC"
        },
        preparedEvidenceState: "not_prepared",
        finalTruthDecisionState: "not_decided",
        canonicalPromotionState: "blocked",
        canonicalWrites: 0
      }
    ]
  };

  const report = buildReport(input, {
    inputPath: "self-test",
    maxTextChars: 12000
  });

  if (report.canonicalWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("self-test failed: canonicalWrites must be 0");
  }

  if (!report.guarantees.noFetch || !report.guarantees.noEvidenceExtraction || !report.guarantees.noFinalTruthDecision || !report.guarantees.noCanonicalPromotion) {
    throw new Error("self-test failed: guarantees missing");
  }

  if (report.summary.preparedRowCount !== 1 || report.summary.rejectedSnapshotCount !== 0) {
    throw new Error("self-test failed: expected one prepared row and zero rejected snapshots");
  }

  if (report.preparedRows[0].preparedEvidenceState !== "prepared_from_fetched_source_snapshot") {
    throw new Error("self-test failed: prepared row state mismatch");
  }

  if (report.preparedRows[0].status !== "FT" || report.preparedRows[0].final !== true) {
    throw new Error("self-test failed: final signal was not inferred safely");
  }

  if (report.preparedRows[0].homeTeam !== "Alpha FC" || report.preparedRows[0].awayTeam !== "Beta FC") {
    throw new Error("self-test failed: team names were not propagated");
  }

  if (report.cases[0].watchRow.homeTeam !== "Alpha FC" || report.cases[0].watchRow.awayTeam !== "Beta FC") {
    throw new Error("self-test failed: watchRow team names were not propagated");
  }

  return report;
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(usage());
    return;
  }

  const report = args.selfTest
    ? runSelfTest()
    : buildReport(readJson(args.input), {
        inputPath: args.input,
        maxTextChars: args.maxTextChars
      });

  const outputPath = args.output || "data/football-truth/_diagnostics/final-result-prepared-evidence-rows.json";
  writeJson(outputPath, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    job: report.job,
    output: outputPath,
    preparedRowCount: report.summary.preparedRowCount,
    rejectedSnapshotCount: report.summary.rejectedSnapshotCount,
    caseCount: report.summary.caseCount,
    canonicalWrites: report.canonicalWrites,
    noFetch: report.guarantees.noFetch,
    noEvidenceExtraction: report.guarantees.noEvidenceExtraction,
    noFinalTruthDecision: report.guarantees.noFinalTruthDecision,
    noCanonicalPromotion: report.guarantees.noCanonicalPromotion
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    job: "prepare-final-result-evidence-rows-from-source-snapshots-file",
    error: err && err.message ? err.message : String(err),
    canonicalWrites: 0,
    noFetch: true,
    noEvidenceExtraction: true,
    noFinalTruthDecision: true,
    noCanonicalPromotion: true
  }, null, 2));
  process.exitCode = 1;
}
