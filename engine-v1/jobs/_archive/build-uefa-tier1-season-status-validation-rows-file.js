import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

function asText(value) {
  return String(value ?? "").trim();
}

function readJson(filePath, label) {
  if (!filePath) throw new Error(`${label} path is required`);
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    inventory: "",
    selected: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--inventory") args.inventory = argv[++i] || "";
    else if (arg.startsWith("--inventory=")) args.inventory = arg.slice("--inventory=".length);
    else if (arg === "--selected") args.selected = argv[++i] || "";
    else if (arg.startsWith("--selected=")) args.selected = arg.slice("--selected=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.inventory) throw new Error("--inventory is required");
  if (!args.selfTest && !args.selected) throw new Error("--selected is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function rowsFrom(data) {
  if (Array.isArray(data)) return data;
  return data.rows || data.selectedRows || data.selectedEvidenceRows || data.evidenceRows || data.items || [];
}

function usableUrl(row) {
  return asText(
    row.sourceUrl ||
    row.finalUrl ||
    row.url ||
    row.selectedUrl ||
    row.evidenceUrl ||
    row.candidateUrl
  );
}

function buildReport({ inventory, selected, inventoryPath = "", selectedPath = "" }) {
  const boardRows = rowsFrom(inventory);
  const selectedRows = Array.isArray(selected)
    ? selected
    : (selected.selectedRows || selected.rows || selected.selectedEvidenceRows || selected.evidenceRows || selected.items || []);

  const boardBySlug = new Map();
  for (const row of boardRows) {
    const slug = asText(row.competitionSlug || row.leagueSlug);
    if (slug) boardBySlug.set(slug, row);
  }

  const seasonStatusValidationRows = [];
  const skippedSelectedRows = [];

  for (const evidence of selectedRows) {
    const competitionSlug = asText(evidence.competitionSlug || evidence.leagueSlug);
    const sourceUrl = usableUrl(evidence);

    if (!competitionSlug || !sourceUrl) {
      skippedSelectedRows.push({
        competitionSlug,
        reason: !competitionSlug ? "missing_competition_slug" : "missing_source_url",
        evidenceKeys: evidence && typeof evidence === "object" ? Object.keys(evidence) : []
      });
      continue;
    }

    const boardRow = boardBySlug.get(competitionSlug) || {};

    seasonStatusValidationRows.push({
      competitionSlug,
      leagueSlug: competitionSlug,
      competitionName: asText(boardRow.competitionName || evidence.competitionName),
      validationState: "season_calendar_validated_from_official_source",
      validationConfidence: "high",
      requiresSecondSource: false,
      evidenceType: "season_status_calendar_evidence",
      evidenceState: asText(evidence.evidenceState || "selected_official_calendar_evidence_url"),
      sourceType: "official",
      fetchPurpose: asText(evidence.evidenceNeed || "competition_calendar"),
      hostname: asText(evidence.hostname),
      finalUrl: sourceUrl,
      sourceUrl,
      targetDate: "2026-06-09",
      seasonKey: asText(evidence.seasonLabel),
      signalScore: Number(evidence.selectorScore || 0),
      decisionReason: [
        "adapted from validated Tier 1 official route selectedRows evidence",
        asText(evidence.seasonLabel),
        Array.isArray(evidence.selectorReasons) ? evidence.selectorReasons.join(",") : ""
      ].filter(Boolean).join(" | "),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    });
  }

  const coveredSlugs = [...new Set(seasonStatusValidationRows.map((row) => row.competitionSlug))].sort();
  const bySlug = {};
  for (const row of seasonStatusValidationRows) {
    bySlug[row.competitionSlug] = (bySlug[row.competitionSlug] || 0) + 1;
  }

  const missingBoardSlugs = coveredSlugs.filter((slug) => !boardBySlug.has(slug));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "build-uefa-tier1-season-status-validation-rows-file",
    mode: "adapter_from_selected_calendar_evidence_rows",
    sourceInventory: inventoryPath,
    sourceSelected: selectedPath,
    summary: {
      boardRowCount: boardRows.length,
      selectedRowsCount: selectedRows.length,
      seasonStatusValidationRowCount: seasonStatusValidationRows.length,
      coveredSlugCount: coveredSlugs.length,
      missingBoardSlugCount: missingBoardSlugs.length,
      skippedSelectedRowCount: skippedSelectedRows.length,
      bySlug
    },
    coveredSlugs,
    missingBoardSlugs,
    skippedSelectedRows,
    seasonStatusValidationRows,
    guarantees: {
      noSearch: true,
      noFetch: true,
      sourceFetch: false,
      noUrlFetch: true,
      usesOnlyProvidedInventoryAndSelectedRows: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    canonicalWrites: 0,
    productionWrite: false
  };
}

function assertReport(report, expected = {}) {
  if (report.guarantees.noSearch !== true) throw new Error("noSearch guarantee failed");
  if (report.guarantees.noFetch !== true) throw new Error("noFetch guarantee failed");
  if (report.guarantees.sourceFetch !== false) throw new Error("sourceFetch guarantee failed");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("canonicalWrites guarantee failed");
  if (report.guarantees.productionWrite !== false) throw new Error("productionWrite guarantee failed");
  if (report.canonicalWrites !== 0 || report.productionWrite !== false) throw new Error("top-level write guarantees failed");

  if (report.summary.missingBoardSlugCount !== 0) {
    throw new Error(`selected slugs missing from board: ${report.missingBoardSlugs.join(", ")}`);
  }

  if (report.summary.skippedSelectedRowCount !== 0) {
    throw new Error(`skipped selected rows: ${report.summary.skippedSelectedRowCount}`);
  }

  if (expected.boardRowCount !== undefined && report.summary.boardRowCount !== expected.boardRowCount) {
    throw new Error(`expected ${expected.boardRowCount} board rows, got ${report.summary.boardRowCount}`);
  }

  if (expected.selectedRowsCount !== undefined && report.summary.selectedRowsCount !== expected.selectedRowsCount) {
    throw new Error(`expected ${expected.selectedRowsCount} selected rows, got ${report.summary.selectedRowsCount}`);
  }

  if (expected.validationRowCount !== undefined && report.summary.seasonStatusValidationRowCount !== expected.validationRowCount) {
    throw new Error(`expected ${expected.validationRowCount} validation rows, got ${report.summary.seasonStatusValidationRowCount}`);
  }

  if (expected.coveredSlugCount !== undefined && report.summary.coveredSlugCount !== expected.coveredSlugCount) {
    throw new Error(`expected ${expected.coveredSlugCount} covered slugs, got ${report.summary.coveredSlugCount}`);
  }
}

function runSelfTest() {
  const inventory = {
    rows: [
      { competitionSlug: "aut.1", competitionName: "Austrian Bundesliga" },
      { competitionSlug: "uefa.europa", competitionName: "UEFA Europa League" },
      { competitionSlug: "test.none", competitionName: "No Evidence League" }
    ]
  };

  const selected = {
    selectedRows: [
      {
        competitionSlug: "aut.1",
        hostname: "bundesliga.at",
        sourceUrl: "https://www.bundesliga.at/de/bundesliga/spielplan",
        seasonLabel: "2025/26_or_2026_detected_from_official_body_signals",
        selectorScore: 95,
        selectorReasons: ["validated_tier1_official_route", "full_body_available"],
        evidenceNeed: "competition_calendar",
        evidenceState: "selected_official_calendar_evidence_url"
      },
      {
        competitionSlug: "uefa.europa",
        hostname: "uefa.com",
        sourceUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        seasonLabel: "2025/26_or_2026_detected_from_official_body_signals",
        selectorScore: 90,
        selectorReasons: ["validated_tier1_official_route", "fixtures_or_results_route"],
        evidenceNeed: "competition_calendar",
        evidenceState: "selected_official_calendar_evidence_url"
      }
    ]
  };

  const report = buildReport({ inventory, selected, inventoryPath: "self-test-inventory", selectedPath: "self-test-selected" });

  assertReport(report, {
    boardRowCount: 3,
    selectedRowsCount: 2,
    validationRowCount: 2,
    coveredSlugCount: 2
  });

  if (report.seasonStatusValidationRows.some((row) => row.validationState !== "season_calendar_validated_from_official_source")) {
    throw new Error("self-test validationState failed");
  }

  if (report.seasonStatusValidationRows.some((row) => row.requiresSecondSource !== false)) {
    throw new Error("self-test requiresSecondSource failed");
  }

  return {
    ok: true,
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const inventory = readJson(args.inventory, "inventory");
  const selected = readJson(args.selected, "selected");
  const report = buildReport({
    inventory,
    selected,
    inventoryPath: args.inventory,
    selectedPath: args.selected
  });

  assertReport(report);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

export {
  buildReport,
  parseArgs,
  runSelfTest
};

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}
