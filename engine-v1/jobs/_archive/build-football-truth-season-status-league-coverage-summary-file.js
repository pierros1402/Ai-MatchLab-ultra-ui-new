import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    inventory: "",
    seeds: "",
    expanded: "",
    fetched: "",
    classified: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();
    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--inventory") args.inventory = String(argv[++i] || "").trim();
    else if (arg.startsWith("--inventory=")) args.inventory = arg.slice("--inventory=".length);
    else if (arg === "--seeds") args.seeds = String(argv[++i] || "").trim();
    else if (arg.startsWith("--seeds=")) args.seeds = arg.slice("--seeds=".length);
    else if (arg === "--expanded") args.expanded = String(argv[++i] || "").trim();
    else if (arg.startsWith("--expanded=")) args.expanded = arg.slice("--expanded=".length);
    else if (arg === "--fetched") args.fetched = String(argv[++i] || "").trim();
    else if (arg.startsWith("--fetched=")) args.fetched = arg.slice("--fetched=".length);
    else if (arg === "--classified") args.classified = String(argv[++i] || "").trim();
    else if (arg.startsWith("--classified=")) args.classified = arg.slice("--classified=".length);
    else if (arg === "--output") args.output = String(argv[++i] || "").trim();
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.output) throw new Error("--output is required");
  if (!args.selfTest && !args.classified) throw new Error("--classified is required");

  return args;
}

function readJsonMaybe(filePath) {
  if (!filePath) return {};
  const resolved = path.resolve(repoRoot, filePath);
  if (!fs.existsSync(resolved)) return {};
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(repoRoot, filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rowsFromAny(input, names) {
  for (const name of names) {
    if (Array.isArray(input?.[name])) return input[name];
  }
  return [];
}

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function slugOf(row) {
  return asText(row.leagueSlug || row.competitionSlug || row.slug);
}

function nameOf(row) {
  return asText(row.competitionName || row.name || row.leagueName || slugOf(row));
}

function isSeasonEvidence(row) {
  const text = [
    row.classification,
    row.sourceClass,
    row.truthRole,
    row.validationIntent,
    row.fetchPurpose,
    row.finalUrl,
    row.candidateUrl
  ].map(asText).join(" ").toLowerCase();

  return /season_activity|season-status|fixture|fixtures|schedule|calendar|spielplan|standings|table|tabelle|results|match-calendar/.test(text);
}

function isFetchedOk(row) {
  return row.ok === true || Number(row.status) === 200 || Number(row.http?.status) === 200;
}

function summarize(args) {
  const inventory = readJsonMaybe(args.inventory);
  const seeds = readJsonMaybe(args.seeds);
  const expanded = readJsonMaybe(args.expanded);
  const fetched = readJsonMaybe(args.fetched);
  const classified = readJsonMaybe(args.classified);

  const inventoryRows = rowsFromAny(inventory, ["inventoryRows", "competitionRows", "rows"]);
  const seedRows = rowsFromAny(seeds, ["fetchedSourceSnapshots", "rankedCandidateUrlRows", "candidateUrlRows", "rows"]);
  const expandedRows = rowsFromAny(expanded, ["rankedCandidateUrlRows", "candidateUrlRows", "rows"]);
  const fetchedRows = rowsFromAny(fetched, ["fetchedSourceSnapshots", "rows"]);
  const classifiedRows = rowsFromAny(classified, ["classifiedRows", "classifiedSourceSnapshots", "sourceCandidateSnapshotRows", "rows", "candidateRows"]);

  const bySlug = new Map();

  function get(slug) {
    if (!bySlug.has(slug)) {
      bySlug.set(slug, {
        leagueSlug: slug,
        competitionName: slug,
        inventorySeen: false,
        officialSeedCount: 0,
        expandedLinkCount: 0,
        fetchedOkCount: 0,
        classifiedRowCount: 0,
        seasonActivityEvidenceCount: 0,
        sampleUrls: []
      });
    }
    return bySlug.get(slug);
  }

  for (const row of inventoryRows) {
    const slug = slugOf(row);
    if (!slug) continue;
    const item = get(slug);
    item.inventorySeen = true;
    item.competitionName = nameOf(row);
  }

  for (const row of seedRows) {
    const slug = slugOf(row);
    if (!slug) continue;
    const item = get(slug);
    item.officialSeedCount += 1;
    if (item.competitionName === slug) item.competitionName = nameOf(row);
  }

  for (const row of expandedRows) {
    const slug = slugOf(row);
    if (!slug) continue;
    const item = get(slug);
    item.expandedLinkCount += 1;
    if (item.competitionName === slug) item.competitionName = nameOf(row);
    const url = asText(row.finalUrl || row.candidateUrl);
    if (url && item.sampleUrls.length < 5) item.sampleUrls.push(url);
  }

  for (const row of fetchedRows) {
    const slug = slugOf(row);
    if (!slug) continue;
    const item = get(slug);
    if (isFetchedOk(row)) item.fetchedOkCount += 1;
    if (item.competitionName === slug) item.competitionName = nameOf(row);
  }

  for (const row of classifiedRows) {
    const slug = slugOf(row);
    if (!slug) continue;
    const item = get(slug);
    item.classifiedRowCount += 1;
    if (isSeasonEvidence(row)) item.seasonActivityEvidenceCount += 1;
    if (item.competitionName === slug) item.competitionName = nameOf(row);
    const url = asText(row.finalUrl || row.candidateUrl);
    if (url && item.sampleUrls.length < 5) item.sampleUrls.push(url);
  }

  const leagueCoverageRows = [...bySlug.values()]
    .map((row) => {
      let coverageState = "missing";
      if (row.seasonActivityEvidenceCount > 0) coverageState = "has_classified_season_activity_evidence";
      else if (row.classifiedRowCount > 0) coverageState = "has_classified_non_season_rows";
      else if (row.fetchedOkCount > 0) coverageState = "has_fetched_official_or_expanded_pages";
      else if (row.expandedLinkCount > 0) coverageState = "has_expanded_links_not_fetched";
      else if (row.officialSeedCount > 0) coverageState = "has_official_seed_only";

      return { ...row, coverageState };
    })
    .sort((a, b) => a.leagueSlug.localeCompare(b.leagueSlug));

  const summary = {
    inventoryLeagueCount: inventoryRows.length,
    officialSeedLeagueCount: new Set(seedRows.map(slugOf).filter(Boolean)).size,
    expandedLinkLeagueCount: new Set(expandedRows.map(slugOf).filter(Boolean)).size,
    fetchedOkLeagueCount: new Set(fetchedRows.filter(isFetchedOk).map(slugOf).filter(Boolean)).size,
    classifiedLeagueCount: new Set(classifiedRows.map(slugOf).filter(Boolean)).size,
    seasonActivityEvidenceLeagueCount: leagueCoverageRows.filter((row) => row.seasonActivityEvidenceCount > 0).length,
    seasonActivityEvidenceRowCount: leagueCoverageRows.reduce((sum, row) => sum + row.seasonActivityEvidenceCount, 0),
    byCoverageState: leagueCoverageRows.reduce((acc, row) => {
      acc[row.coverageState] = (acc[row.coverageState] || 0) + 1;
      return acc;
    }, {}),
    sourceFetch: false,
    noFetch: true,
    noUrlFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  return {
    ok: true,
    job: "build-football-truth-season-status-league-coverage-summary-file",
    mode: "read_only_league_level_coverage_summary",
    generatedAt: new Date().toISOString(),
    summary,
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noRegistryWrites: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    leagueCoverageRows
  };
}

function runSelfTest() {
  const tmp = path.join(repoRoot, "data", "football-truth", "_diagnostics", "_selftest-season-status-summary.json");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });

  fs.writeFileSync(tmp, JSON.stringify({
    classifiedRows: [
      {
        leagueSlug: "aut.1",
        competitionName: "Austrian Bundesliga",
        classification: "candidate_league_season_activity_evidence_needs_validation",
        finalUrl: "https://www.bundesliga.at/de/spielplan"
      },
      {
        leagueSlug: "den.1",
        competitionName: "Danish Superliga",
        classification: "candidate_league_season_activity_evidence_needs_validation",
        finalUrl: "https://superliga.dk/stilling"
      }
    ]
  }, null, 2), "utf8");

  const tested = summarize({ classified: path.relative(repoRoot, tmp) });
  fs.unlinkSync(tmp);

  if (tested.summary.seasonActivityEvidenceLeagueCount !== 2) throw new Error("expected two covered leagues");
  if (tested.summary.seasonActivityEvidenceRowCount !== 2) throw new Error("expected two evidence rows");
  if (tested.guarantees.canonicalWrites !== 0 || tested.guarantees.noFetch !== true) throw new Error("guarantees failed");

  return {
    ok: true,
    selfTest: "build-football-truth-season-status-league-coverage-summary-file",
    summary: tested.summary,
    guarantees: tested.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const report = summarize(args);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    job: report.job,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();