#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const FETCH_JOB = "engine-v1/jobs/fetch-final-result-source-url-snapshots-file.js";
const PREPARE_JOB = "engine-v1/jobs/prepare-final-result-evidence-rows-from-source-snapshots-file.js";
const EXTRACT_VERIFY_JOB = "engine-v1/jobs/extract-build-and-verify-final-result-evidence-file.js";

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    allowFetch: false,
    limit: 3,
    timeoutMs: 8000,
    maxBytes: 250000,
    maxTextChars: 12000,
    keepIntermediate: false,
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

    if (arg === "--max-text-chars") {
      args.maxTextChars = readPositiveInteger(argv[++i], "--max-text-chars");
      continue;
    }

    if (arg.startsWith("--max-text-chars=")) {
      args.maxTextChars = readPositiveInteger(arg.slice("--max-text-chars=".length), "--max-text-chars");
      continue;
    }

    if (arg === "--keep-intermediate") {
      args.keepIntermediate = true;
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
    "  node engine-v1/jobs/run-final-result-source-snapshot-evidence-diagnostic-file.js --input <source-snapshots-or-validated-urls.json> [--output <report.json>]",
    "",
    "Input shapes supported:",
    "  { fetchedSourceSnapshots }",
    "  { sourceSnapshots }",
    "  { snapshots }",
    "  output from validate-final-result-source-url-resolutions-file.js",
    "",
    "Fetch is blocked by default. If the input is validatedResolvedSourceUrls, use --allow-fetch explicitly.",
    "",
    "Pipeline:",
    "  validatedResolvedSourceUrls --allow-fetch -> fetch-final-result-source-url-snapshots-file.js",
    "  fetchedSourceSnapshots -> prepare-final-result-evidence-rows-from-source-snapshots-file.js",
    "  preparedRows -> extract-build-and-verify-final-result-evidence-file.js",
    "",
    "Options:",
    "  --allow-fetch",
    "  --limit=<n>",
    "  --timeout-ms=<n>",
    "  --max-bytes=<n>",
    "  --max-text-chars=<n>",
    "  --keep-intermediate",
    "",
    "Guarantees:",
    "  - read-only diagnostic wrapper",
    "  - canonicalWrites: 0",
    "  - no final truth production decision",
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

function hasOwnArray(input, key) {
  return Array.isArray(input?.[key]);
}

function rowLooksLikeSnapshot(row) {
  if (!row || typeof row !== "object") return false;
  return Boolean(
    row.body?.text ||
    row.text ||
    row.html ||
    row.content ||
    row.finalUrl ||
    row.requestedUrl
  );
}

function rowLooksLikeUrlResolution(row) {
  if (!row || typeof row !== "object") return false;
  return Boolean(
    row.resolvedUrl ||
    row.url ||
    row.finalUrl ||
    row.sourceUrl ||
    row.candidateUrl
  );
}

function detectInputMode(input) {
  if (!input || typeof input !== "object") {
    throw new Error("input must be a JSON object");
  }

  if (
    hasOwnArray(input, "fetchedSourceSnapshots") ||
    hasOwnArray(input, "sourceSnapshots") ||
    hasOwnArray(input, "snapshots")
  ) {
    return "fetchedSourceSnapshots";
  }

  if (
    hasOwnArray(input, "validatedResolvedSourceUrls") ||
    hasOwnArray(input, "validatedUrls")
  ) {
    return "validatedResolvedSourceUrls";
  }

  if (Array.isArray(input.rows)) {
    if (input.rows.some(rowLooksLikeSnapshot)) return "fetchedSourceSnapshots";
    if (input.rows.some(rowLooksLikeUrlResolution)) return "validatedResolvedSourceUrls";
  }

  throw new Error("unsupported input shape: expected fetchedSourceSnapshots/sourceSnapshots/snapshots or validatedResolvedSourceUrls/validatedUrls");
}

function runNodeJob(relativeScript, jobArgs, options = {}) {
  const allowedExitCodes = options.allowedExitCodes || [0];
  const scriptPath = path.resolve(REPO_ROOT, relativeScript);

  const result = spawnSync(process.execPath, [scriptPath, ...jobArgs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });

  const exitCode = result.status === null ? 1 : result.status;

  if (result.error) {
    throw result.error;
  }

  if (!allowedExitCodes.includes(exitCode)) {
    const message = [
      `${relativeScript} failed with exit code ${exitCode}`,
      result.stderr ? `stderr:\n${result.stderr}` : "",
      result.stdout ? `stdout:\n${result.stdout}` : ""
    ].filter(Boolean).join("\n\n");
    throw new Error(message);
  }

  return {
    job: relativeScript,
    exitCode,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}

function defaultOutputPath() {
  return path.join(
    REPO_ROOT,
    "data",
    "football-truth",
    "_diagnostics",
    "final-result-source-snapshot-evidence-diagnostic.json"
  );
}

function countFirstArray(value, keys) {
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key].length;
  }
  return 0;
}

function deriveVerdict(report) {
  const caseVerdicts = asArray(report?.cases)
    .map((row) => String(row?.verdict || row?.status || "").trim())
    .filter(Boolean);

  if (caseVerdicts.length > 0) {
    if (caseVerdicts.some((verdict) => verdict.toLowerCase() === "conflict")) return "conflict";
    if (caseVerdicts.every((verdict) => verdict.toLowerCase() === "verified_final_result")) return "verified_final_result";
    return "needs_more_evidence";
  }

  const direct = String(report?.verdict || report?.status || report?.finalVerdict || "").trim();
  if (!direct || direct.toLowerCase() === "multi_case") return "needs_more_evidence";
  return direct;
}

function finalExitCodeForVerdict(verdict) {
  const normalized = String(verdict || "").toLowerCase();
  if (normalized === "verified_final_result") return 0;
  if (normalized === "conflict") return 2;
  return 1;
}

function buildGuarantees(fetchRan, allowFetch) {
  return {
    readOnlyDiagnostic: true,
    canonicalWrites: 0,
    noFinalTruthProductionDecision: true,
    noCanonicalPromotion: true,
    noProductionRepair: true,
    noFixtureWrite: true,
    noHistoryWrite: true,
    noValueWrite: true,
    noDetailsWrite: true,
    fetchOptInRequired: true,
    fetchRan,
    fetchAllowed: allowFetch
  };
}

function cleanupDirectory(dirPath) {
  if (!dirPath) return;
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function runPipeline(inputPath, outputPath, args) {
  const input = readJson(inputPath);
  const inputMode = detectInputMode(input);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-ft-source-snapshot-evidence-"));
  const snapshotsPath = path.join(tempDir, "source-snapshots.json");
  const preparedPath = path.join(tempDir, "prepared-evidence-rows.json");
  const verificationPath = path.join(tempDir, "extract-build-verify-report.json");

  const stages = {
    fetch: {
      ran: false,
      exitCode: null
    },
    prepare: null,
    extractBuildVerify: null
  };

  try {
    if (inputMode === "validatedResolvedSourceUrls") {
      if (!args.allowFetch) {
        throw new Error("input contains validatedResolvedSourceUrls; refusing to fetch without explicit --allow-fetch");
      }

      stages.fetch = {
        ran: true,
        ...runNodeJob(FETCH_JOB, [
          "--input", resolvePath(inputPath),
          "--output", snapshotsPath,
          "--allow-fetch",
          "--limit", String(args.limit),
          "--timeout-ms", String(args.timeoutMs),
          "--max-bytes", String(args.maxBytes),
          args.pretty ? "--pretty" : "--compact"
        ])
      };
    } else {
      fs.copyFileSync(resolvePath(inputPath), snapshotsPath);
    }

    stages.prepare = runNodeJob(PREPARE_JOB, [
      "--input", snapshotsPath,
      "--output", preparedPath,
      "--max-text-chars", String(args.maxTextChars),
      args.pretty ? "--pretty" : "--compact"
    ]);

    stages.extractBuildVerify = runNodeJob(EXTRACT_VERIFY_JOB, [
      "--input", preparedPath,
      "--output", verificationPath,
      args.pretty ? "--pretty" : "--compact"
    ], {
      allowedExitCodes: [0, 1, 2]
    });

    const sourceSnapshotReport = readJson(snapshotsPath);
    const preparedReport = readJson(preparedPath);
    const verificationReport = readJson(verificationPath);

    const verdict = deriveVerdict(verificationReport);
    const finalExitCode = finalExitCodeForVerdict(verdict);

    const report = {
      ok: finalExitCode === 0,
      job: "run-final-result-source-snapshot-evidence-diagnostic-file.js",
      generatedAt: new Date().toISOString(),
      inputMode,
      verdict,
      exitCode: finalExitCode,
      counts: {
        fetchedSourceSnapshots: countFirstArray(sourceSnapshotReport, [
          "fetchedSourceSnapshots",
          "sourceSnapshots",
          "snapshots",
          "rows"
        ]),
        rejectedFetches: countFirstArray(sourceSnapshotReport, [
          "rejectedFetches",
          "fetchRejected",
          "rejectedRows"
        ]),
        preparedRows: countFirstArray(preparedReport, [
          "preparedRows",
          "rows",
          "preparedEvidenceRows"
        ]),
        rejectedSnapshots: countFirstArray(preparedReport, [
          "rejectedSnapshots",
          "rejectedRows",
          "rejected"
        ]),
        cases: Array.isArray(verificationReport?.cases) ? verificationReport.cases.length : 1
      },
      stages,
      guarantees: buildGuarantees(stages.fetch.ran, args.allowFetch),
      reports: {
        prepared: preparedReport,
        verification: verificationReport
      }
    };

    if (args.keepIntermediate) {
      const keepDir = path.join(
        REPO_ROOT,
        "data",
        "football-truth",
        "_diagnostics",
        "_intermediate",
        `source-snapshot-evidence-${Date.now()}`
      );
      fs.mkdirSync(keepDir, { recursive: true });
      fs.copyFileSync(snapshotsPath, path.join(keepDir, "source-snapshots.json"));
      fs.copyFileSync(preparedPath, path.join(keepDir, "prepared-evidence-rows.json"));
      fs.copyFileSync(verificationPath, path.join(keepDir, "extract-build-verify-report.json"));
      report.intermediateDir = path.relative(REPO_ROOT, keepDir).replace(/\\/g, "/");
    }

    writeJson(outputPath || defaultOutputPath(), report, args.pretty);
    return report;
  } finally {
    cleanupDirectory(tempDir);
  }
}

function selfTestInput() {
  const watchRow = {
    matchId: "self-test-alpha-beta",
    homeTeam: "Alpha FC",
    awayTeam: "Beta FC",
    league: "Self Test League",
    kickoff: "2026-05-18T18:00:00Z"
  };

  return {
    fetchedSourceSnapshots: [
      {
        requestedUrl: "https://official.example.test/match/alpha-beta",
        finalUrl: "https://official.example.test/match/alpha-beta",
        sourceName: "Official Alpha FC",
        sourceTier: "official",
        homeTeam: "Alpha FC",
        awayTeam: "Beta FC",
        matchedTask: {
          watchRow
        },
        body: {
          text: "Full time. Alpha FC 2-1 Beta FC. Final score: Alpha FC 2, Beta FC 1."
        }
      },
      {
        requestedUrl: "https://trusted.example.test/results/alpha-beta",
        finalUrl: "https://trusted.example.test/results/alpha-beta",
        sourceName: "Trusted Results Provider",
        sourceTier: "trusted",
        homeTeam: "Alpha FC",
        awayTeam: "Beta FC",
        matchedTask: {
          watchRow
        },
        body: {
          text: "FT result: Alpha FC 2 Beta FC 1. Final result confirmed after full time."
        }
      }
    ]
  };
}

function runSelfTest(args) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-ft-source-snapshot-evidence-self-test-"));
  const inputPath = path.join(tempDir, "input.json");
  const outputPath = path.join(tempDir, "output.json");

  try {
    writeJson(inputPath, selfTestInput(), true);

    const report = runPipeline(inputPath, outputPath, {
      ...args,
      allowFetch: false,
      pretty: true,
      keepIntermediate: false
    });

    if (report.guarantees.canonicalWrites !== 0) {
      throw new Error("self-test failed: canonicalWrites guarantee is not 0");
    }

    if (report.guarantees.fetchRan !== false) {
      throw new Error("self-test failed: fetchedSourceSnapshots input should not run fetch");
    }

    if (!["verified_final_result", "needs_more_evidence"].includes(String(report.verdict))) {
      throw new Error(`self-test failed: unexpected verdict ${report.verdict}`);
    }

    console.log(JSON.stringify({
      ok: true,
      verdict: report.verdict,
      exitCode: report.exitCode,
      fetchedSourceSnapshots: report.counts.fetchedSourceSnapshots,
      preparedRows: report.counts.preparedRows,
      guarantees: report.guarantees
    }, null, 2));

    return 0;
  } finally {
    cleanupDirectory(tempDir);
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(usage());
    return 0;
  }

  if (args.selfTest) {
    return runSelfTest(args);
  }

  if (!args.input) {
    throw new Error("missing required --input");
  }

  const outputPath = args.output || defaultOutputPath();
  const report = runPipeline(args.input, outputPath, args);
  return report.exitCode;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 3;
}