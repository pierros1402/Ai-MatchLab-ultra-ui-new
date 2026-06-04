import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getTeamNewsSourcesForTask } from "../ai-match-intelligence/team-news-source-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    bucket: "seasonStatus",
    limit: 0,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = String(argv[++i] || "").trim();
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = String(argv[++i] || "").trim();
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--bucket") args.bucket = String(argv[++i] || "").trim();
    else if (arg.startsWith("--bucket=")) args.bucket = arg.slice("--bucket=".length);
    else if (arg === "--limit") args.limit = Number(argv[++i] || 0);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 0;
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(repoRoot, filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeWhitespace(value) {
  return asText(value).replace(/\s+/g, " ").trim();
}

function normalizeUrl(value) {
  const raw = asText(value);
  if (!raw) return "";

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function hostnameOf(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return "";

  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function competitionSlug(row) {
  return asText(row.competitionSlug || row.leagueSlug || row.targetLeagueSlug || row.slug);
}

function competitionName(row) {
  return normalizeWhitespace(row.competitionName || row.leagueName || row.name || row.displayName);
}

function worksetBucket(row) {
  return asText(row.worksetBucket || row.bucket || row.stateBucket || row.targetBucket);
}

function competitionFamily(row) {
  return asText(row.competitionFamily || row.family || row.coverageFamily || row.type);
}

function seasonLabel(row) {
  return normalizeWhitespace(row.seasonLabel || row.seasonKey || row.season || row.targetSeason || "2025-2026");
}

function targetDate(row) {
  return asText(row.dayKey || row.targetDate || row.date || row.asOfDate);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function collectArrays(value, arrays = [], depth = 0) {
  if (depth > 4 || !value) return arrays;

  if (Array.isArray(value)) {
    arrays.push(value);
    return arrays;
  }

  if (!isObject(value)) return arrays;

  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      if (/(work|row|item|inventory|competition|league|state)/i.test(key)) arrays.push(child);
      continue;
    }

    if (isObject(child)) collectArrays(child, arrays, depth + 1);
  }

  return arrays;
}

function rowsFromInput(input, bucket) {
  const arrays = [];

  if (Array.isArray(input)) arrays.push(input);

  for (const key of [
    "workRows",
    "footballTruthWorkRows",
    "stateWorkRows",
    "worksetRows",
    "inventoryRows",
    "rows",
    "items"
  ]) {
    if (Array.isArray(input?.[key])) arrays.push(input[key]);
  }

  for (const key of ["buckets", "worksets", "byBucket", "worksetBuckets"]) {
    if (Array.isArray(input?.[key]?.[bucket])) arrays.push(input[key][bucket]);
  }

  for (const arr of collectArrays(input)) arrays.push(arr);

  const seen = new Set();
  const rows = [];

  for (const arr of arrays) {
    for (const row of arr) {
      if (!isObject(row)) continue;

      const slug = competitionSlug(row);
      if (!slug) continue;

      const rowBucket = worksetBucket(row);
      if (bucket && rowBucket && rowBucket !== bucket) continue;

      const key = [
        slug,
        competitionName(row),
        rowBucket,
        targetDate(row),
        seasonLabel(row)
      ].join("|");

      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  return rows;
}

function isLeagueLevelOfficialSource(source) {
  const type = asText(source?.type).toLowerCase();
  const trustTier = asText(source?.trustTier).toLowerCase();

  if (trustTier !== "league") return false;

  return [
    "league_news",
    "competition_news",
    "site_search"
  ].includes(type);
}

function officialRegistrySourcesForRow(row) {
  const slug = competitionSlug(row);
  if (!slug) return [];

  const sources = getTeamNewsSourcesForTask({
    leagueSlug: slug,
    team: ""
  });

  const seen = new Set();
  const out = [];

  for (const source of Array.isArray(sources) ? sources : []) {
    if (!isLeagueLevelOfficialSource(source)) continue;

    const candidateUrl = normalizeUrl(source.url);
    const hostname = hostnameOf(candidateUrl);
    if (!candidateUrl || !hostname) continue;

    const dedupeKey = `${slug}|${candidateUrl.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      candidateUrl,
      hostname,
      source
    });
  }

  return out;
}

function materializeRows(input, options = {}) {
  const bucket = asText(options.bucket || "seasonStatus");
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : 0;
  const inputRows = rowsFromInput(input, bucket);

  const out = [];
  const rejectedRows = [];
  const seen = new Set();

  for (const row of inputRows) {
    const slug = competitionSlug(row);
    const name = competitionName(row);
    const sources = officialRegistrySourcesForRow(row);

    if (!sources.length) {
      rejectedRows.push({
        leagueSlug: slug,
        competitionSlug: slug,
        name,
        competitionName: name,
        rejectionReason: "missing_league_level_official_registry_source",
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
      continue;
    }

    for (const item of sources) {
      const source = item.source;
      const dedupeKey = `${slug}|${item.candidateUrl.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      if (limit > 0 && out.length >= limit) {
        rejectedRows.push({
          leagueSlug: slug,
          competitionSlug: slug,
          name,
          competitionName: name,
          candidateUrl: item.candidateUrl,
          hostname: item.hostname,
          rejectionReason: "over_limit",
          canonicalWrites: 0,
          productionWrite: false,
          dryRun: true
        });
        continue;
      }

      out.push({
        leagueSlug: slug,
        targetLeagueSlug: slug,
        competitionSlug: slug,
        name,
        leagueName: name,
        competitionName: name,
        competitionFamily: competitionFamily(row),
        competitionType: asText(row.competitionType || row.coverageType),
        country: asText(row.country || row.coverageCountry),
        region: asText(row.region || row.coverageRegion),
        tier: row.tier ?? row.coverageTier ?? null,
        trust: row.trust ?? row.coverageTrust ?? null,
        dayKey: targetDate(row),
        targetDate: targetDate(row),
        seasonKey: seasonLabel(row),
        seasonLabel: seasonLabel(row),

        candidateUrl: item.candidateUrl,
        resolvedUrl: item.candidateUrl,
        finalUrl: item.candidateUrl,
        hostname: item.hostname,
        title: normalizeWhitespace(source.label || `${name} official registry source`),

        sourceFamily: "official_league",
        expectedSourceFamily: "official_league",
        sourceClass: "official_governing_or_competition_operator",
        truthRole: "primary_candidate_after_registry_evidence",
        reviewerDecision: "candidate_official_url_pending_fetch",
        readyForFetch: true,
        fetchPurpose: "season_status_official_registry_candidate_snapshot",
        validationIntent: "season_status_official_registry_candidate",
        targetType: "official-registry-seed",
        sourceType: "season_status_official_registry_seed",
        worksetBucket: bucket,

        compositeScore: 100,
        manualCandidateUrlUsed: false,
        inventedUrls: false,
        resultSource: "team_news_source_registry",

        officialRegistrySource: {
          id: source.id || null,
          label: source.label || null,
          type: source.type || null,
          trustTier: source.trustTier || null,
          url: source.url || null,
          hostname: item.hostname
        },

        searchTargetId: `${slug}::season_status::official-registry-seed::${item.hostname}`,
        fetchTaskId: `${slug}::season_status_official_registry_fetch::${item.hostname}`,
        sourceTaskId: `${slug}::season_status_official_registry_source::${item.hostname}`,

        sourceFetch: false,
        fetchState: "not_fetched",
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true,
        dedupeKey
      });
    }
  }

  return {
    inputRows,
    rankedCandidateUrlRows: out,
    rejectedRows
  };
}

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = asText(typeof fn === "function" ? fn(row) : row[fn]) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function buildReport(input, options = {}) {
  const { inputRows, rankedCandidateUrlRows, rejectedRows } = materializeRows(input, options);

  return {
    ok: true,
    job: "materialize-football-truth-season-status-official-registry-candidate-urls-file",
    mode: "read_only_official_registry_seeded_candidate_url_materialization",
    generatedAt: new Date().toISOString(),
    options: {
      bucket: asText(options.bucket || "seasonStatus"),
      limit: Number(options.limit || 0)
    },
    summary: {
      inputWorkRowCount: inputRows.length,
      candidateUrlCount: rankedCandidateUrlRows.length,
      rejectedRowCount: rejectedRows.length,
      byLeague: countBy(rankedCandidateUrlRows, "leagueSlug"),
      byHostname: countBy(rankedCandidateUrlRows, "hostname"),
      bySourceType: countBy(rankedCandidateUrlRows, (row) => row.officialRegistrySource?.type),
      bySourceTrustTier: countBy(rankedCandidateUrlRows, (row) => row.officialRegistrySource?.trustTier),
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      usesOnlyExistingTeamNewsSourceRegistry: true,
      noWebSearch: true,
      noSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    notes: [
      "This job does not search or fetch.",
      "It materializes candidate URLs only from the existing team-news source registry.",
      "The output is shaped as rankedCandidateUrlRows so the controlled fetcher can consume it with explicit --allow-fetch."
    ],
    rankedCandidateUrlRows,
    candidateUrlRows: rankedCandidateUrlRows,
    rejectedRows
  };
}

function runSelfTest() {
  const input = {
    workRows: [
      {
        leagueSlug: "eng.1",
        competitionName: "Premier League",
        competitionFamily: "domestic_league",
        worksetBucket: "seasonStatus",
        seasonKey: "2025-2026",
        dayKey: "2026-06-03",
        country: "England",
        tier: 1,
        trust: 1
      },
      {
        leagueSlug: "uefa.champions",
        competitionName: "UEFA Champions League",
        competitionFamily: "continental_or_global",
        worksetBucket: "seasonStatus",
        seasonKey: "2025-2026",
        dayKey: "2026-06-03",
        region: "Europe",
        tier: 1,
        trust: 1
      },
      {
        leagueSlug: "missing.registry.test",
        competitionName: "Missing Registry Test",
        competitionFamily: "domestic_league",
        worksetBucket: "seasonStatus"
      }
    ]
  };

  const report = buildReport(input, { bucket: "seasonStatus", limit: 10 });

  if (report.summary.inputWorkRowCount !== 3) throw new Error("expected three input rows");
  if (report.summary.candidateUrlCount < 2) throw new Error("expected at least two registry candidate URLs");
  if (!report.rankedCandidateUrlRows.find((row) => row.leagueSlug === "eng.1")) throw new Error("expected eng.1 registry seed");
  if (!report.rankedCandidateUrlRows.find((row) => row.leagueSlug === "uefa.champions")) throw new Error("expected UEFA registry seed");
  if (report.rankedCandidateUrlRows.some((row) => row.officialRegistrySource?.trustTier !== "league")) {
    throw new Error("expected only league-level registry sources");
  }
  if (report.rankedCandidateUrlRows.some((row) => !row.readyForFetch || !row.candidateUrl)) {
    throw new Error("expected ready fetch candidate URLs");
  }
  if (report.guarantees.sourceFetch !== false || report.guarantees.noSearch !== true || report.guarantees.noFetch !== true) {
    throw new Error("read-only guarantees failed");
  }
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("write guarantees failed");
  }

  return {
    ok: true,
    selfTest: "materialize-football-truth-season-status-official-registry-candidate-urls-file",
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

  const input = readJson(args.input);
  const report = buildReport(input, {
    bucket: args.bucket,
    limit: args.limit
  });

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