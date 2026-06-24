import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    date: "",
    limitCompetitions: 25,
    includeCups: false,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      args.input = argv[++i] || "";
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++i] || "";
      continue;
    }

    if (arg === "--date") {
      args.date = argv[++i] || "";
      continue;
    }

    if (arg === "--limit-competitions") {
      args.limitCompetitions = Number(argv[++i] || 25);
      continue;
    }

    if (arg === "--include-cups") {
      args.includeCups = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.limitCompetitions) || args.limitCompetitions < 1) {
    throw new Error("--limit-competitions must be a positive number");
  }

  return args;
}

function selectRows(obj, names) {
  for (const name of names) {
    if (Array.isArray(obj?.[name])) return obj[name];
  }
  return [];
}

function isHighPriorityBucket(row) {
  return asText(row.inventoryBucket) === "signals_available_needs_truth_review";
}

function isLeague(row) {
  return asText(row.competitionType) === "league";
}

function isCup(row) {
  return asText(row.competitionType) === "cup";
}

function countryCodeOf(row) {
  const direct = asText(row.countryCode);
  if (direct) return direct;

  const slug = asText(row.competitionSlug);
  const idx = slug.indexOf(".");
  return idx > 0 ? slug.slice(0, idx) : slug;
}

const EUROPE_PRIORITY = new Set([
  "eng", "esp", "ita", "fra", "ger", "por", "ned", "bel", "aut", "den", "tur",
  "gre", "sui", "rou", "cyp", "cro", "cze", "isl", "bul", "sco", "irl",
  "nor", "swe", "fin", "pol", "ser", "ukr", "svn", "svk", "hun"
]);

const GLOBAL_HIGH_VALUE = new Set([
  "bra", "arg", "usa", "mex", "jpn", "kor", "ksa", "chn", "aus", "can"
]);

function regionPriority(row) {
  const country = countryCodeOf(row);

  if (EUROPE_PRIORITY.has(country)) return 3000;
  if (GLOBAL_HIGH_VALUE.has(country)) return 2000;

  return 0;
}

function bucketPriority(row) {
  const bucket = asText(row.inventoryBucket);

  if (bucket === "signals_available_needs_truth_review") return 3000;
  if (bucket === "full_map_missing_required_data") return 1000;
  if (bucket === "discovered_no_actionable_signal") return 100;

  return 0;
}

function typePriority(row) {
  if (isLeague(row)) return 2000;
  if (isCup(row)) return 500;
  return 0;
}

function scoreRow(row) {
  return (
    typePriority(row) +
    bucketPriority(row) +
    regionPriority(row) +
    Number(row.priorityScore || 0) +
    Math.min(Number(row.fixtureSignals || 0), 500) +
    Math.min(Number(row.standingSignals || 0), 300) +
    Math.min(Number(row.providerCount || 0), 100)
  );
}

function buildBatch({ plan, date, limitCompetitions, includeCups }) {
  const unknownRows = selectRows(plan, ["unknownRows"]);
  const comparisonTargetRows = selectRows(plan, ["comparisonTargetRows"]);

  const targetRowsBySlug = new Map();
  for (const target of comparisonTargetRows) {
    const slug = asText(target.competitionSlug);
    if (!slug) continue;

    if (!targetRowsBySlug.has(slug)) {
      targetRowsBySlug.set(slug, []);
    }

    targetRowsBySlug.get(slug).push(target);
  }

  const eligibleRows = unknownRows
    .filter((row) => isLeague(row) || (includeCups && isCup(row)))
    .map((row) => ({
      ...row,
      batchPriorityScore: scoreRow(row),
      highPriorityBucket: isHighPriorityBucket(row),
      europePriority: EUROPE_PRIORITY.has(countryCodeOf(row)),
      globalHighValuePriority: GLOBAL_HIGH_VALUE.has(countryCodeOf(row))
    }))
    .sort((a, b) => {
      if (b.batchPriorityScore !== a.batchPriorityScore) return b.batchPriorityScore - a.batchPriorityScore;
      return asText(a.competitionSlug).localeCompare(asText(b.competitionSlug));
    });

  const selectedCompetitionRows = eligibleRows.slice(0, limitCompetitions);

  const selectedTargetRows = [];
  for (const row of selectedCompetitionRows) {
    const slug = asText(row.competitionSlug);
    const targets = targetRowsBySlug.get(slug) || [];

    const official = targets.find((target) => asText(target.comparisonLayer) === "primary_official_truth");
    const secondary = targets.find((target) => asText(target.comparisonLayer) === "secondary_reference_comparison");

    if (official) selectedTargetRows.push(official);
    if (secondary) selectedTargetRows.push(secondary);
  }

  const officialTargetRows = selectedTargetRows.filter((row) => asText(row.comparisonLayer) === "primary_official_truth");
  const secondaryTargetRows = selectedTargetRows.filter((row) => asText(row.comparisonLayer) === "secondary_reference_comparison");

  const byCountry = {};
  const byBucket = {};
  const byType = {};

  for (const row of selectedCompetitionRows) {
    const country = countryCodeOf(row) || "unknown";
    const bucket = asText(row.inventoryBucket) || "unknown";
    const type = asText(row.competitionType) || "unknown";

    byCountry[country] = (byCountry[country] || 0) + 1;
    byBucket[bucket] = (byBucket[bucket] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-full-map-activity-state-comparison-batch-file",
    mode: "read_only_full_map_activity_state_comparison_batch",
    generatedAt: new Date().toISOString(),
    date,
    sourcePlan: {
      job: asText(plan.job),
      mode: asText(plan.mode),
      summary: plan.summary || {}
    },
    selectionPolicy: {
      limitCompetitions,
      includeCups,
      selectedFromUnknownRowsOnly: true,
      preferLeagues: true,
      preferSignalsAvailableNeedsTruthReview: true,
      preferEuropeAndHighValueMarkets: true,
      requireOfficialAndSecondaryTargetPair: true,
      noSearch: true,
      noFetch: true,
      noCanonicalPromotion: true
    },
    summary: {
      sourceUnknownRowsCount: unknownRows.length,
      eligibleCompetitionCount: eligibleRows.length,
      selectedCompetitionCount: selectedCompetitionRows.length,
      selectedTargetRowCount: selectedTargetRows.length,
      officialTruthTargetCount: officialTargetRows.length,
      secondaryReferenceComparisonTargetCount: secondaryTargetRows.length,
      expectedSearchCountIfApprovedLater: selectedTargetRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byCountry,
    byBucket,
    byType,
    selectedCompetitionRows,
    selectedTargetRows,
    officialTargetRows,
    secondaryTargetRows,
    nextSteps: [
      "Review selectedCompetitionRows before any search.",
      "If approved, run a small controlled search batch only for selectedTargetRows.",
      "Classify agreement between official and secondary reference.",
      "Do not infer absence from zero results.",
      "Do not write canonical from this batch."
    ],
    guarantees: {
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const plan = {
    unknownRows: [
      { competitionSlug: "eng.1", countryCode: "eng", competitionType: "league", inventoryBucket: "signals_available_needs_truth_review", priorityScore: 100 },
      { competitionSlug: "bra.1", countryCode: "bra", competitionType: "league", inventoryBucket: "signals_available_needs_truth_review", priorityScore: 100 },
      { competitionSlug: "abc.cup", countryCode: "abc", competitionType: "cup", inventoryBucket: "signals_available_needs_truth_review", priorityScore: 100 }
    ],
    comparisonTargetRows: [
      { competitionSlug: "eng.1", comparisonLayer: "primary_official_truth" },
      { competitionSlug: "eng.1", comparisonLayer: "secondary_reference_comparison" },
      { competitionSlug: "bra.1", comparisonLayer: "primary_official_truth" },
      { competitionSlug: "bra.1", comparisonLayer: "secondary_reference_comparison" },
      { competitionSlug: "abc.cup", comparisonLayer: "primary_official_truth" },
      { competitionSlug: "abc.cup", comparisonLayer: "secondary_reference_comparison" }
    ]
  };

  const report = buildBatch({
    plan,
    date: "2026-06-12",
    limitCompetitions: 2,
    includeCups: false
  });

  if (report.summary.selectedCompetitionCount !== 2) throw new Error("expected two selected competitions");
  if (report.summary.selectedTargetRowCount !== 4) throw new Error("expected target pair per competition");
  if (report.selectedCompetitionRows.some((row) => row.competitionType === "cup")) throw new Error("cups should be excluded by default");
  if (report.guarantees.noSearch !== true || report.guarantees.noFetch !== true) throw new Error("expected read-only guarantees");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-full-map-activity-state-comparison-batch-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildBatch({
    plan: readJson(args.input),
    date: args.date,
    limitCompetitions: args.limitCompetitions,
    includeCups: args.includeCups
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-full-map-activity-state-comparison-batch-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}