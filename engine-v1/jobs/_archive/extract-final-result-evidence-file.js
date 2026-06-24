import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractFinalResultEvidenceRows } from "../football-truth/result-evidence-extractor.js";

function parseArgs(argv) {
  const out = {
    input: null,
    output: null,
    pretty: true,
    includeRaw: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input") {
      out.input = argv[++i] || null;
    } else if (arg === "--output") {
      out.output = argv[++i] || null;
    } else if (arg === "--include-raw") {
      out.includeRaw = true;
    } else if (arg === "--compact") {
      out.pretty = false;
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
    "  node engine-v1/jobs/extract-final-result-evidence-file.js --input <prepared-rows.json> [--output <extraction-report.json>]",
    "",
    "Input JSON shapes supported:",
    "  1) [ {...preparedRow...}, ... ]",
    "  2) { \"preparedRows\": [...] }",
    "  3) { \"rows\": [...] }",
    "  4) { \"sources\": [...] }",
    "  5) { \"watchRow\": {...}, \"preparedRows\": [...] }",
    "",
    "This job is read-only. It does not fetch pages, verify evidence, decide final truth, promote canonical data, or write fixtures/value/history/standings/details."
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

function buildReport(input, options = {}) {
  const extraction = extractFinalResultEvidenceRows(input, {
    includeRaw: options.includeRaw
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "extract-final-result-evidence-file",
    mode: "read_only_result_evidence_extraction",
    canonicalWrites: 0,
    extraction,
    rawEvidenceRows: extraction.rawEvidenceRows,
    guarantees: {
      noFetch: true,
      noVerification: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0
    }
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
    ok: report.ok,
    wrote: resolved,
    inputRows: report.extraction?.inputRows || 0,
    readyRows: report.extraction?.readyRows || 0,
    incompleteRows: report.extraction?.incompleteRows || 0,
    rawEvidenceRows: report.rawEvidenceRows?.length || 0,
    byVerdict: report.extraction?.byVerdict || {},
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
    includeRaw: args.includeRaw
  });

  writeReport(report, args.output, args.pretty);

  if ((report.extraction?.incompleteRows || 0) > 0) {
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
      job: "extract-final-result-evidence-file"
    }, null, 2));
    process.exitCode = 1;
  }
}
