import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildFinalResultEvidencePackage } from "../football-truth/result-evidence-builder.js";
import { verifyFinalResultEvidence } from "../football-truth/final-result-verifier.js";

function parseArgs(argv) {
  const out = {
    input: null,
    output: null,
    pretty: true,
    requireOfficial: false,
    consensusMinSources: 2
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input") {
      out.input = argv[++i] || null;
    } else if (arg === "--output") {
      out.output = argv[++i] || null;
    } else if (arg === "--compact") {
      out.pretty = false;
    } else if (arg === "--require-official") {
      out.requireOfficial = true;
    } else if (arg === "--consensus-min-sources") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 2) {
        throw new Error("--consensus-min-sources must be an integer >= 2");
      }
      out.consensusMinSources = value;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/build-and-verify-final-result-evidence-file.js --input <raw-evidence.json> [--output <combined-report.json>]",
    "",
    "Input JSON shapes supported:",
    "  1) { \"watchRow\": {...}, \"rawEvidenceRows\": [...] }",
    "  2) { \"watchRow\": {...}, \"evidenceRows\": [...] }",
    "  3) { \"watchRow\": {...}, \"candidates\": [...] }",
    "",
    "This job is read-only. It builds evidence, verifies only against evidence rules, and does not write canonical fixtures/value/history/standings/details."
  ].join("\n");
}

function readJson(filePath) {
  if (!filePath) {
    throw new Error("Missing required --input <file>");
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Input file not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, "");

  return {
    resolved,
    json: JSON.parse(raw)
  };
}

function normalizeInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Input JSON must be an object with watchRow and rawEvidenceRows/evidenceRows/candidates");
  }

  const rows = Array.isArray(input.rawEvidenceRows)
    ? input.rawEvidenceRows
    : Array.isArray(input.evidenceRows)
      ? input.evidenceRows
      : Array.isArray(input.candidates)
        ? input.candidates
        : null;

  if (!Array.isArray(rows)) {
    throw new Error("Input JSON missing rawEvidenceRows/evidenceRows/candidates array");
  }

  return {
    watchRow: input.watchRow || input.fixture || null,
    rawEvidenceRows: rows
  };
}

function buildReport(input, options = {}) {
  const normalized = normalizeInput(input);

  const evidencePackage = buildFinalResultEvidencePackage(
    normalized.watchRow,
    normalized.rawEvidenceRows,
    {
      requireOfficial: options.requireOfficial === true
    }
  );

  const verification = verifyFinalResultEvidence(
    normalized.watchRow,
    evidencePackage.evidenceRows,
    {
      consensusMinSources: options.consensusMinSources
    }
  );

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "build-and-verify-final-result-evidence-file",
    mode: "read_only_evidence_build_and_verify",
    canonicalWrites: 0,
    requireOfficial: options.requireOfficial === true,
    consensusMinSources: options.consensusMinSources,
    inputRawEvidenceRows: normalized.rawEvidenceRows.length,
    evidenceSummary: evidencePackage.summary,
    verificationSummary: {
      verdict: verification.verdict,
      ok: verification.ok,
      reason: verification.reason || null,
      verifiedFinalResult: verification.verifiedFinalResult,
      counts: verification.counts,
      conflicts: verification.conflicts || []
    },
    evidencePackage,
    verification
  };
}

function writeReport(report, outputPath, pretty) {
  const body = JSON.stringify(report, null, pretty ? 2 : 0) + "\n";

  if (!outputPath) {
    process.stdout.write(body);
    return;
  }

  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, body, "utf8");
  console.log(JSON.stringify({
    ok: true,
    wrote: resolved,
    inputRawEvidenceRows: report.inputRawEvidenceRows,
    evidenceByVerdict: report.evidenceSummary?.byVerdict || {},
    verificationVerdict: report.verificationSummary?.verdict || null,
    canonicalWrites: report.canonicalWrites
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(usage());
    return;
  }

  const input = readJson(args.input);
  const report = buildReport(input.json, {
    requireOfficial: args.requireOfficial,
    consensusMinSources: args.consensusMinSources
  });

  writeReport(report, args.output, args.pretty);

  if (report.verificationSummary?.verdict === "conflict") {
    process.exitCode = 2;
  } else if (report.verificationSummary?.verdict === "needs_more_evidence") {
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error?.message || String(error),
      job: "build-and-verify-final-result-evidence-file"
    }, null, 2));
    process.exitCode = 1;
  }
}
