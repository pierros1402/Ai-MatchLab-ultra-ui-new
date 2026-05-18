import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildFinalResultEvidencePackage } from "../football-truth/result-evidence-builder.js";

function parseArgs(argv) {
  const out = {
    input: null,
    output: null,
    pretty: true,
    requireOfficial: false
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
    "  node engine-v1/jobs/build-final-result-evidence-file.js --input <raw-evidence.json> [--output <evidence-package.json>]",
    "",
    "Input JSON shapes supported:",
    "  1) { \"watchRow\": {...}, \"rawEvidenceRows\": [...] }",
    "  2) { \"watchRow\": {...}, \"evidenceRows\": [...] }",
    "  3) { \"watchRow\": {...}, \"candidates\": [...] }",
    "",
    "This job is read-only. It does not fetch, verify final truth, promote canonical data, or write fixtures/value/history/standings/details."
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

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "build-final-result-evidence-file",
    mode: "read_only_evidence_build",
    canonicalWrites: 0,
    requireOfficial: options.requireOfficial === true,
    inputRawEvidenceRows: normalized.rawEvidenceRows.length,
    evidencePackage
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
    byVerdict: report.evidencePackage?.summary?.byVerdict || {},
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
    requireOfficial: args.requireOfficial
  });

  writeReport(report, args.output, args.pretty);

  const byVerdict = report.evidencePackage?.summary?.byVerdict || {};
  if ((byVerdict.rejected_evidence || 0) > 0) {
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
      job: "build-final-result-evidence-file"
    }, null, 2));
    process.exitCode = 1;
  }
}
