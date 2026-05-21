import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    start: null,
    days: 3,
    snapshotRef: null,
    priority: "P2",
    maxRows: 25,
    maxTargets: null,
    outputDir: null,
    outputPrefix: null,
    validate: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if ((arg === "--start" || arg === "--date") && argv[i + 1]) {
      out.start = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--days" && argv[i + 1]) {
      out.days = Number.parseInt(String(argv[++i]).trim(), 10);
      continue;
    }

    if ((arg === "--snapshot-ref" || arg === "--git-ref") && argv[i + 1]) {
      out.snapshotRef = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--priority" && argv[i + 1]) {
      out.priority = String(argv[++i]).trim().toUpperCase();
      continue;
    }

    if (arg === "--max-rows" && argv[i + 1]) {
      out.maxRows = Number.parseInt(String(argv[++i]).trim(), 10);
      continue;
    }

    if (arg === "--max-targets" && argv[i + 1]) {
      out.maxTargets = Number.parseInt(String(argv[++i]).trim(), 10);
      continue;
    }

    if (arg === "--output-dir" && argv[i + 1]) {
      out.outputDir = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--output-prefix" && argv[i + 1]) {
      out.outputPrefix = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--validate") {
      out.validate = true;
      continue;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(out.start || ""))) {
    throw new Error("--start YYYY-MM-DD is required");
  }

  if (!Number.isFinite(out.days) || out.days < 1 || out.days > 14) {
    throw new Error("--days must be between 1 and 14");
  }

  if (!["P0", "P1", "P2", "P3"].includes(out.priority)) {
    throw new Error("--priority must be one of P0, P1, P2, P3");
  }

  if (!Number.isFinite(out.maxRows) || out.maxRows < 1 || out.maxRows > 500) {
    throw new Error("--max-rows must be between 1 and 500");
  }

  if (out.maxTargets != null && (!Number.isFinite(out.maxTargets) || out.maxTargets < out.maxRows)) {
    throw new Error("--max-targets must be >= --max-rows");
  }

  if (!out.maxTargets) {
    out.maxTargets = out.maxRows;
  }

  if (!out.outputDir) {
    out.outputDir = "data/football-truth/_diagnostics/fixture-acquisition-stability";
  }

  if (!out.outputPrefix) {
    out.outputPrefix = `${out.start}.external-active-league.${out.priority}.sample`;
  }

  return out;
}

function runNode(args) {
  const stdout = execFileSync(process.execPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return stdout.trim() ? JSON.parse(stdout) : null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function jobPath(fileName) {
  return path.join(__dirname, fileName);
}

async function main() {
  const options = parseArgs();

  fs.mkdirSync(options.outputDir, { recursive: true });

  const discoveryPath = path.join(options.outputDir, `${options.outputPrefix}.discovery-workset.json`);
  const resolutionPath = path.join(options.outputDir, `${options.outputPrefix}.resolution-targets.json`);
  const reviewPath = path.join(options.outputDir, `${options.outputPrefix}.review-pack.json`);
  const validationPath = path.join(options.outputDir, `${options.outputPrefix}.review-pack.validation.json`);

  const discoveryArgs = [
    jobPath("build-fixture-external-active-league-discovery-workset.js"),
    "--start",
    options.start,
    "--days",
    String(options.days),
    "--output",
    discoveryPath
  ];

  if (options.snapshotRef) {
    discoveryArgs.push("--snapshot-ref", options.snapshotRef);
  }

  const discoveryRun = runNode(discoveryArgs);

  const resolutionRun = runNode([
    jobPath("build-fixture-external-active-league-resolution-targets-file.js"),
    "--input",
    discoveryPath,
    "--priority",
    options.priority,
    "--max-targets",
    String(options.maxTargets),
    "--output",
    resolutionPath
  ]);

  const reviewRun = runNode([
    jobPath("build-fixture-external-active-league-review-pack-file.js"),
    "--input",
    resolutionPath,
    "--priority",
    options.priority,
    "--max-rows",
    String(options.maxRows),
    "--output",
    reviewPath
  ]);

  let validationRun = null;
  if (options.validate) {
    validationRun = runNode([
      jobPath("validate-fixture-external-active-league-review-pack-file.js"),
      "--input",
      reviewPath,
      "--output",
      validationPath
    ]);
  }

  const discovery = readJson(discoveryPath);
  const resolution = readJson(resolutionPath);
  const review = readJson(reviewPath);
  const validation = options.validate ? readJson(validationPath) : null;

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    options,
    paths: {
      discoveryPath,
      resolutionPath,
      reviewPath,
      validationPath: options.validate ? validationPath : null
    },
    runs: {
      discovery: discoveryRun,
      resolution: resolutionRun,
      review: reviewRun,
      validation: validationRun
    },
    summary: {
      discovery: discovery.summary || null,
      resolution: resolution.summary || null,
      review: review.summary || null,
      validation: validation?.summary || null
    },
    notes: [
      "This materializer is read-only.",
      "It orchestrates discovery, resolution targets, review pack creation, and optional validation.",
      "It does not fetch sources and does not prove external fixture activity.",
      "Outputs are diagnostic/review artifacts only and must not be treated as canonical acquisition writes."
    ],
    guarantees: {
      sourceFetch: false,
      discoveredExternally: false,
      canonicalWrites: 0,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    }
  };

  console.log(JSON.stringify({
    ok: report.ok,
    paths: report.paths,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});