import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { buildTeamGeoDay } from "./build-team-geo-day.js";
import { applyTeamGeoSeedsDay } from "./apply-team-geo-seeds-day.js";
import { bootstrapTeamGeoFromWikidata } from "./bootstrap-team-geo-from-wikidata.js";
import { classifyTeamGeoBootstrapOutput } from "./classify-team-geo-bootstrap-output.js";
import { importTeamGeoBatch } from "./import-team-geo-batch.js";

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function resolveDataPath(...parts) {
  return path.join(rootDir(), "data", ...parts);
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInteger(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function parseArgs(argv) {
  const args = {
    dayKey: null,
    minCoverage: 80,
    bootstrapLimit: 40,
    delayMs: 900,
    rowTimeoutMs: 16000,
    noBootstrap: false,
    failBelowThreshold: false
  };

  for (const arg of argv) {
    if (arg === "--no-bootstrap") {
      args.noBootstrap = true;
      continue;
    }

    if (arg === "--fail-below-threshold") {
      args.failBelowThreshold = true;
      continue;
    }

    if (arg.startsWith("--min-coverage=")) {
      args.minCoverage = toNumber(arg.split("=")[1], args.minCoverage);
      continue;
    }

    if (arg.startsWith("--limit=")) {
      args.bootstrapLimit = toInteger(Number(arg.split("=")[1]), args.bootstrapLimit);
      continue;
    }

    if (arg.startsWith("--delay-ms=")) {
      args.delayMs = toInteger(Number(arg.split("=")[1]), args.delayMs);
      continue;
    }

    if (arg.startsWith("--row-timeout-ms=")) {
      args.rowTimeoutMs = toInteger(Number(arg.split("=")[1]), args.rowTimeoutMs);
      continue;
    }

    if (!args.dayKey) {
      args.dayKey = arg;
    }
  }

  return args;
}

function bootstrapOutputFile(dayKey) {
  return resolveDataPath("team-geo", "_bootstrap", `${dayKey}.wikidata.json`);
}

function summaryFile(dayKey) {
  return resolveDataPath("team-geo", "_reports", `${dayKey}.enrichment-summary.json`);
}

async function importIfAny(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      label,
      skipped: true,
      reason: "file_not_found",
      filePath
    };
  }

  const rows = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      label,
      skipped: true,
      reason: "empty_import_file",
      filePath,
      total: Array.isArray(rows) ? rows.length : null
    };
  }

  const result = await importTeamGeoBatch(filePath);

  return {
    label,
    skipped: false,
    filePath,
    total: result.total,
    writtenCount: result.writtenCount,
    skippedCount: result.skippedCount
  };
}

export async function runTeamGeoEnrichmentDay(dayKey, options = {}) {
  if (!dayKey) {
    throw new Error("runTeamGeoEnrichmentDay: missing dayKey");
  }

  const minCoverage = toNumber(options.minCoverage, 80);
  const bootstrapLimit = toInteger(options.bootstrapLimit, 40);
  const delayMs = toInteger(options.delayMs, 900);
  const rowTimeoutMs = toInteger(options.rowTimeoutMs, 16000);
  const noBootstrap = Boolean(options.noBootstrap);
  const failBelowThreshold = Boolean(options.failBelowThreshold);

  console.log("[run-team-geo-enrichment-day] build:initial", { dayKey });
  const initial = await buildTeamGeoDay(dayKey);

  console.log("[run-team-geo-enrichment-day] seeds:apply", { dayKey });
  const seeds = await applyTeamGeoSeedsDay(dayKey);

  console.log("[run-team-geo-enrichment-day] build:after-seeds", { dayKey });
  let afterSeeds = await buildTeamGeoDay(dayKey);

  let bootstrap = null;
  let classify = null;
  let imports = [];

  const shouldBootstrap =
    !noBootstrap &&
    afterSeeds.totalTeams > 0 &&
    afterSeeds.coveragePct < minCoverage &&
    afterSeeds.missingCount > 0 &&
    bootstrapLimit > 0;

  if (shouldBootstrap) {
    const inputFile = afterSeeds.importFile;
    const outputFile = bootstrapOutputFile(dayKey);

    console.log("[run-team-geo-enrichment-day] bootstrap:start", {
      dayKey,
      inputFile,
      outputFile,
      limit: bootstrapLimit,
      delayMs,
      rowTimeoutMs
    });

    bootstrap = await bootstrapTeamGeoFromWikidata({
      inputFile,
      outputFile,
      limit: bootstrapLimit,
      delayMs,
      rowTimeoutMs,
      checkpointEvery: 5,
      resume: true
    });

    console.log("[run-team-geo-enrichment-day] bootstrap:done", bootstrap);

    classify = await classifyTeamGeoBootstrapOutput(outputFile);

    console.log("[run-team-geo-enrichment-day] classify:done", {
      completeCount: classify.completeCount,
      safePartialCount: classify.safePartialCount,
      unresolvedCount: classify.unresolvedCount
    });

    imports = [
      await importIfAny(classify.completeImportFile, "complete"),
      await importIfAny(classify.safePartialImportFile, "safe_partial")
    ];

    console.log("[run-team-geo-enrichment-day] imports:done", imports);
  } else {
    console.log("[run-team-geo-enrichment-day] bootstrap:skip", {
      dayKey,
      noBootstrap,
      coveragePct: afterSeeds.coveragePct,
      minCoverage,
      missingCount: afterSeeds.missingCount,
      bootstrapLimit
    });
  }

  console.log("[run-team-geo-enrichment-day] build:final", { dayKey });
  const finalReport = await buildTeamGeoDay(dayKey);

  const ok = finalReport.coveragePct >= minCoverage || finalReport.totalTeams === 0;

  const summary = {
    ok,
    warning: ok ? null : "geo_coverage_below_threshold",
    dayKey,
    minCoverage,
    generatedAt: new Date().toISOString(),
    initial: {
      totalTeams: initial.totalTeams,
      existingCount: initial.existingCount,
      missingCount: initial.missingCount,
      coveragePct: initial.coveragePct
    },
    seeds: {
      seedCount: seeds.seedCount,
      appliedCount: seeds.appliedCount,
      unresolvedCount: seeds.unresolvedCount,
      before: seeds.before,
      after: seeds.after
    },
    bootstrap,
    classify,
    imports,
    final: {
      totalTeams: finalReport.totalTeams,
      existingCount: finalReport.existingCount,
      missingCount: finalReport.missingCount,
      coveragePct: finalReport.coveragePct,
      reportFile: finalReport.file,
      importFile: finalReport.importFile
    }
  };

  const out = summaryFile(dayKey);
  writeJson(out, summary);

  console.log("[run-team-geo-enrichment-day] summary", {
    ok: summary.ok,
    warning: summary.warning,
    dayKey,
    initialCoverage: summary.initial.coveragePct,
    finalCoverage: summary.final.coveragePct,
    finalMissing: summary.final.missingCount,
    file: out
  });

  if (!ok && failBelowThreshold) {
    throw new Error(
      `geo coverage below threshold: ${finalReport.coveragePct}% < ${minCoverage}%`
    );
  }

  return summary;
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.dayKey) {
    console.error("[run-team-geo-enrichment-day] cli:fatal missing dayKey");
    process.exit(1);
  }

  console.log("[run-team-geo-enrichment-day] cli:start", args);

  runTeamGeoEnrichmentDay(args.dayKey, args)
    .then(result => {
      console.log("[run-team-geo-enrichment-day] cli:done", {
        ok: result.ok,
        warning: result.warning,
        dayKey: result.dayKey,
        initialCoverage: result.initial.coveragePct,
        finalCoverage: result.final.coveragePct,
        finalMissing: result.final.missingCount,
        summaryFile: summaryFile(result.dayKey)
      });
      process.exit(0);
    })
    .catch(err => {
      console.error("[run-team-geo-enrichment-day] cli:fatal", err);
      process.exit(1);
    });
}
