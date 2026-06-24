import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyFinalResultSources } from "../football-truth/source-reliability.js";

function parseArgs(argv) {
  const out = {
    input: null,
    output: null,
    pretty: true
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input") {
      out.input = argv[++i] || null;
    } else if (arg === "--output") {
      out.output = argv[++i] || null;
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
    "  node engine-v1/jobs/classify-final-result-sources-file.js --input <sources.json> [--output <reliability-report.json>]",
    "",
    "Input JSON shapes supported:",
    "  1) [ {...source...}, ... ]",
    "  2) { \"sources\": [...] }",
    "  3) { \"sourceDescriptors\": [...] }",
    "  4) { \"discovery\": { \"sourceDescriptors\": [...] } }",
    "",
    "This job is read-only. It does not fetch pages, decide final truth, promote canonical data, or write fixtures/value/history/standings/details."
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

function normalizeSources(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.sources)) return input.sources;
  if (Array.isArray(input?.sourceDescriptors)) return input.sourceDescriptors;
  if (Array.isArray(input?.discovery?.sourceDescriptors)) return input.discovery.sourceDescriptors;
  if (Array.isArray(input?.result?.sourceDescriptors)) return input.result.sourceDescriptors;

  throw new Error("Input JSON missing sources/sourceDescriptors array");
}

function buildReport(input) {
  const sources = normalizeSources(input);
  const classification = classifyFinalResultSources(sources);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "classify-final-result-sources-file",
    mode: "read_only_source_reliability_classification",
    canonicalWrites: 0,
    inputSources: sources.length,
    classification,
    guarantees: {
      noFetch: true,
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
    inputSources: report.inputSources,
    byTier: report.classification?.byTier || {},
    byVerdict: report.classification?.byVerdict || {},
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
  const report = buildReport(input.json);

  writeReport(report, args.output, args.pretty);

  const rejectedCount = report.classification?.byTier?.rejected || 0;
  if (rejectedCount > 0) {
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
      job: "classify-final-result-sources-file"
    }, null, 2));
    process.exitCode = 1;
  }
}
