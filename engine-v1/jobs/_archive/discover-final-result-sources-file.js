import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverFinalResultSources } from "../football-truth/source-discovery.js";

function parseArgs(argv) {
  const out = {
    input: null,
    output: null,
    pretty: true,
    maxSearchDescriptors: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input") {
      out.input = argv[++i] || null;
    } else if (arg === "--output") {
      out.output = argv[++i] || null;
    } else if (arg === "--compact") {
      out.pretty = false;
    } else if (arg === "--max-search-descriptors") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--max-search-descriptors must be an integer >= 0");
      }
      out.maxSearchDescriptors = value;
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
    "  node engine-v1/jobs/discover-final-result-sources-file.js --input <watch-row.json> [--output <source-discovery-report.json>]",
    "",
    "Input JSON shapes supported:",
    "  1) { \"watchRow\": {...} }",
    "  2) { \"fixture\": {...} }",
    "  3) direct watch row object with homeTeam/awayTeam fields",
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

function normalizeWatchRow(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Input JSON must be an object");
  }

  return input.watchRow || input.fixture || input;
}

function buildReport(input, options = {}) {
  const watchRow = normalizeWatchRow(input);
  const discovery = discoverFinalResultSources(watchRow, {
    maxSearchDescriptors: options.maxSearchDescriptors
  });

  return {
    ok: discovery.ok,
    generatedAt: new Date().toISOString(),
    job: "discover-final-result-sources-file",
    mode: "read_only_source_discovery",
    canonicalWrites: 0,
    discovery
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
    verdict: report.discovery?.verdict || null,
    sourceDescriptors: report.discovery?.counts?.sourceDescriptors || 0,
    searchDescriptors: report.discovery?.counts?.searchDescriptors || 0,
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
    maxSearchDescriptors: args.maxSearchDescriptors
  });

  writeReport(report, args.output, args.pretty);

  if (report.ok !== true) {
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
      job: "discover-final-result-sources-file"
    }, null, 2));
    process.exitCode = 1;
  }
}
