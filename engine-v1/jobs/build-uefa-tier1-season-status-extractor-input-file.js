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
    selected: "",
    fetched: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--selected") args.selected = argv[++i] || "";
    else if (arg.startsWith("--selected=")) args.selected = arg.slice("--selected=".length);
    else if (arg === "--fetched") args.fetched = argv[++i] || "";
    else if (arg.startsWith("--fetched=")) args.fetched = arg.slice("--fetched=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.selected) throw new Error("--selected is required");
  if (!args.selfTest && !args.fetched) throw new Error("--fetched is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function rowsFrom(data, keys = []) {
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return data?.rows || data?.items || [];
}

function urlOf(row) {
  return asText(
    row?.finalUrl ||
    row?.resolvedUrl ||
    row?.sourceUrl ||
    row?.candidateUrl ||
    row?.url ||
    row?.http?.finalUrl
  );
}

function normalizedUrl(value) {
  return asText(value)
    .replace(/\/+$/, "")
    .toLowerCase();
}

function slugOf(row) {
  return asText(row?.leagueSlug || row?.competitionSlug || row?.slug);
}

function textLength(row) {
  const values = [
    row?.rawText,
    row?.rawHtml,
    row?.rawBody,
    row?.html,
    row?.bodyText,
    row?.body,
    row?.text,
    row?.plainText,
    row?.responseBody,
    row?.content,
    row?.snapshotBody,
    row?.fullBody
  ].filter((value) => typeof value === "string");

  return values.length ? Math.max(...values.map((value) => value.length)) : 0;
}

function selectedKey(row) {
  return `${slugOf(row)}::${normalizedUrl(urlOf(row))}`;
}

function buildReport({ selected, fetched, selectedPath = "", fetchedPath = "" }) {
  const selectedRows = rowsFrom(selected, ["selectedRows", "rows", "items"]);
  const snapshots = rowsFrom(fetched, [
    "fetchedSourceSnapshots",
    "rows",
    "items",
    "snapshots",
    "sourceSnapshots"
  ]);

  const selectedKeys = new Set(selectedRows.map(selectedKey));

  const matchedSnapshots = snapshots.filter((snapshot) => selectedKeys.has(selectedKey(snapshot)));

  const matchedSelectedKeys = new Set(matchedSnapshots.map(selectedKey));

  const missingSelectedRows = selectedRows.filter((row) => !matchedSelectedKeys.has(selectedKey(row)));

  const classifiedRows = selectedRows.map((row, index) => ({
    taskId: `uefa-tier1-selected-season-status-${String(index + 1).padStart(3, "0")}`,
    leagueSlug: slugOf(row),
    competitionSlug: asText(row.competitionSlug || row.leagueSlug),
    competitionName: asText(row.competitionName),
    fetchPurpose: "season_activity_status_calendar",
    classification: "candidate_league_season_activity_evidence_needs_validation",
    finalUrl: urlOf(row),
    resolvedUrl: urlOf(row),
    candidateUrl: asText(row.candidateUrl || row.sourceUrl || row.finalUrl),
    sourceUrl: urlOf(row),
    hostname: asText(row.hostname),
    status: 200,
    fixtureLanguageVisible: true,
    routeRole: asText(row.routeRole),
    evidenceNeed: asText(row.evidenceNeed),
    selectorScore: Number(row.selectorScore || 0),
    selectorReasons: Array.isArray(row.selectorReasons) ? row.selectorReasons : [],
    seasonLabel: asText(row.seasonLabel),
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  }));

  const selectedSlugs = [...new Set(selectedRows.map(slugOf).filter(Boolean))].sort();

  const bySlug = {};
  for (const row of selectedRows) {
    const slug = slugOf(row);
    if (slug) bySlug[slug] = (bySlug[slug] || 0) + 1;
  }

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "build-uefa-tier1-season-status-extractor-input-file",
    mode: "read_only_extractor_input_from_selected_uefa_tier1_rows_and_existing_fullbody_snapshots",
    inputFiles: {
      selected: selectedPath,
      fetchedSnapshots: fetchedPath
    },
    summary: {
      selectedRowCount: selectedRows.length,
      selectedSlugCount: selectedSlugs.length,
      fetchedSnapshotCount: snapshots.length,
      matchedFullBodySnapshotCount: matchedSnapshots.length,
      matchedFullBodySnapshotWithTextCount: matchedSnapshots.filter((row) => textLength(row) > 0).length,
      missingSelectedSnapshotCount: missingSelectedRows.length,
      classifiedRowCount: classifiedRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false,
      noWebSearch: true
    },
    selectedSlugs,
    bySlug,
    missingSelectedRows: missingSelectedRows.map((row) => ({
      slug: slugOf(row),
      url: urlOf(row),
      hostname: asText(row.hostname),
      routeRole: asText(row.routeRole)
    })),
    classifiedRows,
    fetchedSourceSnapshots: matchedSnapshots,
    guarantees: {
      noWebSearch: true,
      noSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyExistingFetchedSnapshots: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    canonicalWrites: 0,
    productionWrite: false
  };

  return report;
}

function assertReport(report, expected = {}) {
  if (report.guarantees.noWebSearch !== true) throw new Error("noWebSearch guarantee failed");
  if (report.guarantees.noSearch !== true) throw new Error("noSearch guarantee failed");
  if (report.guarantees.noFetch !== true) throw new Error("noFetch guarantee failed");
  if (report.guarantees.sourceFetch !== false) throw new Error("sourceFetch guarantee failed");
  if (report.guarantees.noUrlFetch !== true) throw new Error("noUrlFetch guarantee failed");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("canonicalWrites guarantee failed");
  if (report.guarantees.productionWrite !== false) throw new Error("productionWrite guarantee failed");
  if (report.canonicalWrites !== 0 || report.productionWrite !== false) throw new Error("top-level write guarantees failed");

  if (report.summary.missingSelectedSnapshotCount !== 0) {
    throw new Error(`missing selected snapshot rows: ${report.summary.missingSelectedSnapshotCount}`);
  }

  if (report.summary.matchedFullBodySnapshotCount !== report.summary.selectedRowCount) {
    throw new Error(`expected matched snapshots to equal selected rows, got ${report.summary.matchedFullBodySnapshotCount}/${report.summary.selectedRowCount}`);
  }

  if (report.summary.matchedFullBodySnapshotWithTextCount !== report.summary.selectedRowCount) {
    throw new Error(`expected matched full-body text snapshots to equal selected rows, got ${report.summary.matchedFullBodySnapshotWithTextCount}/${report.summary.selectedRowCount}`);
  }

  if (expected.selectedRowCount !== undefined && report.summary.selectedRowCount !== expected.selectedRowCount) {
    throw new Error(`expected ${expected.selectedRowCount} selected rows, got ${report.summary.selectedRowCount}`);
  }

  if (expected.selectedSlugCount !== undefined && report.summary.selectedSlugCount !== expected.selectedSlugCount) {
    throw new Error(`expected ${expected.selectedSlugCount} selected slugs, got ${report.summary.selectedSlugCount}`);
  }

  if (expected.fetchedSnapshotCount !== undefined && report.summary.fetchedSnapshotCount !== expected.fetchedSnapshotCount) {
    throw new Error(`expected ${expected.fetchedSnapshotCount} fetched snapshots, got ${report.summary.fetchedSnapshotCount}`);
  }
}

function runSelfTest() {
  const selected = {
    selectedRows: [
      {
        leagueSlug: "aut.1",
        competitionSlug: "aut.1",
        competitionName: "Austrian Bundesliga",
        hostname: "bundesliga.at",
        sourceUrl: "https://www.bundesliga.at/de/bundesliga/spielplan",
        candidateUrl: "https://www.bundesliga.at/de/bundesliga/spielplan",
        finalUrl: "https://www.bundesliga.at/de/bundesliga/spielplan",
        seasonLabel: "2025/26_or_2026_detected_from_official_body_signals",
        selectorScore: 95,
        selectorReasons: ["validated_tier1_official_route", "full_body_available"],
        evidenceNeed: "competition_calendar",
        routeRole: "fixtures_or_results_route"
      },
      {
        leagueSlug: "uefa.europa",
        competitionSlug: "uefa.europa",
        competitionName: "UEFA Europa League",
        hostname: "uefa.com",
        sourceUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        candidateUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        finalUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        seasonLabel: "2025/26_or_2026_detected_from_official_body_signals",
        selectorScore: 95,
        selectorReasons: ["validated_tier1_official_route", "full_body_available"],
        evidenceNeed: "competition_calendar",
        routeRole: "fixtures_or_results_route"
      }
    ]
  };

  const fetched = {
    fetchedSourceSnapshots: [
      {
        leagueSlug: "aut.1",
        candidateUrl: "https://www.bundesliga.at/de/bundesliga/spielplan",
        finalUrl: "https://www.bundesliga.at/de/bundesliga/spielplan",
        hostname: "www.bundesliga.at",
        http: { status: 200, finalUrl: "https://www.bundesliga.at/de/bundesliga/spielplan" },
        plainText: "Spielplan Tabelle Bundesliga 2026"
      },
      {
        leagueSlug: "uefa.europa",
        candidateUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        finalUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        hostname: "www.uefa.com",
        http: { status: 200, finalUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/" },
        plainText: "Fixtures & results UEFA Europa League 2025/26 official competition calendar"
      }
    ]
  };

  const report = buildReport({ selected, fetched, selectedPath: "self-test-selected.json", fetchedPath: "self-test-fetched.json" });

  assertReport(report, {
    selectedRowCount: 2,
    selectedSlugCount: 2,
    fetchedSnapshotCount: 2
  });

  if (report.classifiedRows.length !== 2) throw new Error("expected 2 classified rows");
  if (report.fetchedSourceSnapshots.length !== 2) throw new Error("expected 2 fetched snapshots");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = runSelfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-uefa-tier1-season-status-extractor-input-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const selected = readJson(args.selected, "selected");
  const fetched = readJson(args.fetched, "fetched");

  const report = buildReport({
    selected,
    fetched,
    selectedPath: args.selected,
    fetchedPath: args.fetched
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

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}

export {
  buildReport,
  assertReport
};
