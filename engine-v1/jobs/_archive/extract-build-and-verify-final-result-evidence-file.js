#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractFinalResultEvidenceRows } from "../football-truth/result-evidence-extractor.js";
import { buildFinalResultEvidencePackage } from "../football-truth/result-evidence-builder.js";
import { verifyFinalResultEvidence } from "../football-truth/final-result-verifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    pretty: true,
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--output") {
      args.output = argv[++i];
    } else if (arg === "--compact") {
      args.pretty = false;
    } else if (arg === "--pretty") {
      args.pretty = true;
    } else if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/extract-build-and-verify-final-result-evidence-file.js --input <prepared-evidence.json> [--output <report.json>]",
    "",
    "Input shapes supported:",
    "  { watchRow, preparedRows }",
    "  { watchRow, rows }",
    "  { cases: [{ watchRow, preparedRows }] }",
    "",
    "Guarantees:",
    "  - read-only diagnostic",
    "  - no fetch",
    "  - canonicalWrites: 0",
    "  - no canonical promotion",
    "  - no production repair",
    "  - no fixture/history/value/details writes",
    "",
    "Exit codes:",
    "  0 verified_final_result",
    "  1 needs_more_evidence",
    "  2 conflict",
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

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeCases(input) {
  if (!input || typeof input !== "object") {
    throw new Error("input must be a JSON object");
  }

  if (Array.isArray(input.cases)) {
    return input.cases.map((row, index) => normalizeCase(row, index));
  }

  return [normalizeCase(input, 0)];
}

function normalizeCase(input, index) {
  if (!input || typeof input !== "object") {
    throw new Error(`case[${index}] must be an object`);
  }

  const watchRow = input.watchRow || input.match || input.fixture || null;
  if (!watchRow || typeof watchRow !== "object") {
    throw new Error(`case[${index}] missing watchRow`);
  }

  const preparedRows = firstArray(
    input.preparedRows,
    input.rows,
    input.sourceRows,
    input.classifiedRows,
    input.reliableRows,
    input.preparedEvidenceRows
  );

  return {
    index,
    watchRow,
    preparedRows
  };
}

function unwrapRows(value, preferredKeys) {
  if (Array.isArray(value)) return value;

  if (value && typeof value === "object") {
    for (const key of preferredKeys) {
      if (Array.isArray(value[key])) return value[key];
    }
  }

  return [];
}

function normalizeVerifierEvidenceRows(evidencePackage, rawEvidenceRows) {
  const packageRows = unwrapRows(evidencePackage, [
    "validatedEvidenceRows",
    "validEvidenceRows",
    "acceptedEvidenceRows",
    "evidenceRows",
    "validatedRows",
    "rows"
  ]);

  if (packageRows.length > 0) return packageRows;
  return rawEvidenceRows;
}

function normalizeVerdict(verification) {
  const value = String(
    verification?.verdict ||
    verification?.status ||
    verification?.finalVerdict ||
    verification?.decision ||
    ""
  ).trim();

  if (value) return value;

  if (verification?.verifiedFinalResult || verification?.verified_final_result) {
    return "verified_final_result";
  }

  if (verification?.conflict || verification?.hasConflict) {
    return "conflict";
  }

  return "needs_more_evidence";
}

function exitCodeForReport(report) {
  const caseVerdicts = Array.isArray(report.cases)
    ? report.cases.map((row) => row.verdict)
    : [report.verdict];

  if (caseVerdicts.some((verdict) => String(verdict).toLowerCase() === "conflict")) {
    return 2;
  }

  if (caseVerdicts.length > 0 && caseVerdicts.every((verdict) => String(verdict).toLowerCase() === "verified_final_result")) {
    return 0;
  }

  return 1;
}

function buildOneCase(inputCase) {
  const extractorInput = {
    watchRow: inputCase.watchRow,
    preparedRows: inputCase.preparedRows,
    rows: inputCase.preparedRows
  };

  const extractionResult = extractFinalResultEvidenceRows(extractorInput, {
    noFetch: true,
    readOnly: true
  });

  const rawEvidenceRows = unwrapRows(extractionResult, [
    "rawEvidenceRows",
    "evidenceRows",
    "rows"
  ]);

  const evidencePackage = buildFinalResultEvidencePackage(inputCase.watchRow, rawEvidenceRows, {
    noFetch: true,
    readOnly: true
  });

  const verifierEvidenceRows = normalizeVerifierEvidenceRows(evidencePackage, rawEvidenceRows);

  const verification = verifyFinalResultEvidence(inputCase.watchRow, verifierEvidenceRows, {
    noFetch: true,
    readOnly: true
  });

  const verdict = normalizeVerdict(verification);

  return {
    index: inputCase.index,
    matchId: inputCase.watchRow.matchId || inputCase.watchRow.id || null,
    day: inputCase.watchRow.day || inputCase.watchRow.date || null,
    teams: {
      home: inputCase.watchRow.homeTeam || inputCase.watchRow.home || inputCase.watchRow.homeName || null,
      away: inputCase.watchRow.awayTeam || inputCase.watchRow.away || inputCase.watchRow.awayName || null
    },
    counts: {
      preparedRows: inputCase.preparedRows.length,
      rawEvidenceRows: rawEvidenceRows.length,
      verifierEvidenceRows: verifierEvidenceRows.length
    },
    verdict,
    extractionResult,
    evidencePackage,
    verification
  };
}

function buildReport(input, options = {}) {
  const cases = normalizeCases(input).map(buildOneCase);
  const verdictCounts = cases.reduce((acc, row) => {
    acc[row.verdict] = (acc[row.verdict] || 0) + 1;
    return acc;
  }, {});

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "extract-build-and-verify-final-result-evidence-file",
    mode: "read_only_diagnostic",
    guarantees: {
      canonicalWrites: 0,
      noFetch: true,
      noCanonicalPromotion: true,
      noProductionRepair: true,
      noFixtureWrite: true,
      noHistoryWrite: true,
      noValueWrite: true,
      noDetailsWrite: true
    },
    input: {
      path: options.inputPath || null,
      caseCount: cases.length
    },
    summary: {
      caseCount: cases.length,
      verdictCounts
    },
    verdict: cases.length === 1 ? cases[0].verdict : "multi_case",
    cases
  };

  report.exitCode = exitCodeForReport(report);
  return report;
}

function runSelfTest() {
  const input = {
    watchRow: {
      matchId: "self-test-1",
      day: "2026-05-18",
      leagueSlug: "test.1",
      homeTeam: "Alpha FC",
      awayTeam: "Beta FC"
    },
    preparedRows: [
      {
        source: "official",
        sourceKey: "official-alpha",
        sourceTier: "official",
        title: "Alpha FC 2-1 Beta FC",
        text: "Full time: Alpha FC 2-1 Beta FC.",
        status: "FT",
        final: true,
        score: { home: 2, away: 1 },
        homeTeam: "Alpha FC",
        awayTeam: "Beta FC",
        day: "2026-05-18",
        leagueSlug: "test.1"
      },
      {
        source: "reliable",
        sourceKey: "reliable-beta",
        sourceTier: "reliable",
        title: "Alpha FC beat Beta FC 2-1",
        text: "Final score Alpha FC 2-1 Beta FC.",
        status: "FT",
        final: true,
        score: { home: 2, away: 1 },
        homeTeam: "Alpha FC",
        awayTeam: "Beta FC",
        day: "2026-05-18",
        leagueSlug: "test.1"
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test" });

  if (report.guarantees.canonicalWrites !== 0) {
    throw new Error("self-test failed: canonicalWrites must be 0");
  }

  if (!report.guarantees.noFetch || !report.guarantees.noCanonicalPromotion) {
    throw new Error("self-test failed: read-only guarantees missing");
  }

  if (report.summary.caseCount !== 1) {
    throw new Error("self-test failed: expected one case");
  }

  if (report.cases[0].counts.rawEvidenceRows < 1) {
    throw new Error("self-test failed: expected raw evidence rows");
  }

  return report;
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(usage());
    return;
  }

  let report;
  if (args.selfTest) {
    report = runSelfTest();
  } else {
    const input = readJson(args.input);
    report = buildReport(input, { inputPath: args.input });
  }

  const outputPath = args.output || "data/football-truth/_diagnostics/extract-build-and-verify-final-result-evidence-file.json";
  writeJson(outputPath, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    job: report.job,
    output: outputPath,
    caseCount: report.summary.caseCount,
    verdict: report.verdict,
    verdictCounts: report.summary.verdictCounts,
    exitCode: report.exitCode,
    canonicalWrites: report.guarantees.canonicalWrites,
    noFetch: report.guarantees.noFetch,
    noCanonicalPromotion: report.guarantees.noCanonicalPromotion
  }, null, 2));

  process.exitCode = report.exitCode;
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    job: "extract-build-and-verify-final-result-evidence-file",
    error: err && err.message ? err.message : String(err),
    canonicalWrites: 0,
    noFetch: true,
    noCanonicalPromotion: true
  }, null, 2));
  process.exitCode = 1;
}
