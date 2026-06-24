#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false,
    maxPerLeague: 4
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--max-per-league" && argv[i + 1]) {
      args.maxPerLeague = Number(argv[++i]);
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  if (!Number.isFinite(args.maxPerLeague) || args.maxPerLeague < 1) {
    throw new Error("--max-per-league must be a positive number");
  }

  return args;
}

function resolveRepoPath(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
}

function readJson(filePath, label) {
  const resolved = resolveRepoPath(filePath);
  if (!resolved) throw new Error(`missing --${label}`);
  if (!fs.existsSync(resolved)) throw new Error(`missing ${label} file: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolved;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeSlug(value) {
  return asText(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function normalizeHost(value) {
  return asText(value).replace(/^www\./i, "").toLowerCase();
}

function hostnameFromUrl(value) {
  try {
    return new URL(asText(value)).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function pickAcceptedRows(input) {
  const direct = asArray(input.acceptedSecondSourceCandidateRows);
  if (direct.length) return direct;

  const nested = asArray(input.report?.acceptedSecondSourceCandidateRows);
  if (nested.length) return nested;

  return [];
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = asText(row[field]) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function limitPerLeague(rows, maxPerLeague) {
  const sorted = [...rows].sort((a, b) => asNumber(b.rankScore, 0) - asNumber(a.rankScore, 0));
  const counts = new Map();
  const out = [];

  for (const row of sorted) {
    const league = asText(row.missingLeagueSlug || row.leagueSlug);
    const count = counts.get(league) || 0;
    if (count >= maxPerLeague) continue;
    counts.set(league, count + 1);
    out.push(row);
  }

  return out;
}

function normalizeFetchTask(row, index) {
  const missingLeagueSlug = asText(row.missingLeagueSlug || row.leagueSlug);
  const countryPrefix = asText(row.countryPrefix || missingLeagueSlug.split(".")[0]);
  const sourceUrl = asText(row.url || row.sourceUrl || row.finalUrl);
  const hostname = normalizeHost(row.hostname || hostnameFromUrl(sourceUrl));
  const rankScore = asNumber(row.rankScore, 0);
  const missingRequiredFields = [];

  if (!missingLeagueSlug) missingRequiredFields.push("missingLeagueSlug");
  if (!countryPrefix) missingRequiredFields.push("countryPrefix");
  if (!sourceUrl) missingRequiredFields.push("sourceUrl");
  if (!hostname) missingRequiredFields.push("hostname");
  if (asArray(row.excludedHosts).map(normalizeHost).includes(hostname)) {
    missingRequiredFields.push("hostname_is_excluded_primary_source");
  }

  const fetchEligibilityState = missingRequiredFields.length
    ? "blocked_second_source_fetch_task_missing_required_fields"
    : "eligible_for_controlled_standings_second_source_snapshot_fetch";

  const taskId = [
    "standings-second-source-fetch",
    safeSlug(missingLeagueSlug || "missing-league"),
    safeSlug(hostname || "missing-host"),
    String(index + 1).padStart(4, "0")
  ].join(":");

  return {
    taskId,
    parentRankState: asText(row.rankState),
    taskType: "standings_second_source_snapshot_fetch",
    missingLeagueSlug,
    leagueSlug: missingLeagueSlug,
    countryPrefix,
    hostname,
    sourceUrl,
    finalUrl: sourceUrl,
    title: asText(row.title),
    snippet: asText(row.snippet),
    searchTargetQuery: asText(row.searchTargetQuery),
    rankScore,
    scoreReasons: asArray(row.scoreReasons).map(asText).filter(Boolean),
    rejectionReasons: asArray(row.rejectionReasons).map(asText).filter(Boolean),
    excludedHosts: asArray(row.excludedHosts).map(normalizeHost).filter(Boolean),
    proposedPath: asText(row.proposedPath),
    proposedTableRowCount: asNumber(row.proposedTableRowCount, 0),
    warningCount: asNumber(row.warningCount, 0),
    fetchEligibilityState,
    missingRequiredFields,
    nextRequiredAction: fetchEligibilityState === "eligible_for_controlled_standings_second_source_snapshot_fetch"
      ? "run_controlled_snapshot_fetch_with_explicit_allow_fetch"
      : "repair_second_source_fetch_task_before_fetch",
    requiredFetchMode: "explicit_allow_fetch_only",
    sourceFetch: false,
    noFetch: true,
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(input, options = {}) {
  const acceptedRows = pickAcceptedRows(input);
  const selectedRows = limitPerLeague(acceptedRows, options.maxPerLeague);
  const fetchTaskRows = selectedRows.map(normalizeFetchTask);
  const eligibleFetchTaskRows = fetchTaskRows.filter(
    (row) => row.fetchEligibilityState === "eligible_for_controlled_standings_second_source_snapshot_fetch"
  );
  const blockedFetchTaskRows = fetchTaskRows.filter(
    (row) => row.fetchEligibilityState !== "eligible_for_controlled_standings_second_source_snapshot_fetch"
  );

  return {
    ok: true,
    job: "materialize-standings-second-source-fetch-tasks-file",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      sourceJob: asText(input.job),
      sourceGeneratedAt: asText(input.generatedAt),
      acceptedSecondSourceCandidateRowCount: acceptedRows.length,
      selectedSecondSourceCandidateRowCount: selectedRows.length,
      maxPerLeague: options.maxPerLeague
    },
    summary: {
      acceptedSecondSourceCandidateRowCount: acceptedRows.length,
      selectedSecondSourceCandidateRowCount: selectedRows.length,
      fetchTaskRowCount: fetchTaskRows.length,
      eligibleFetchTaskRowCount: eligibleFetchTaskRows.length,
      blockedFetchTaskRowCount: blockedFetchTaskRows.length,
      uniqueLeagueCount: new Set(fetchTaskRows.map((row) => row.missingLeagueSlug).filter(Boolean)).size,
      byFetchEligibilityState: countBy(fetchTaskRows, "fetchEligibilityState"),
      byLeague: countBy(fetchTaskRows, "missingLeagueSlug"),
      byHostname: countBy(fetchTaskRows, "hostname"),
      standingsWriteAllowedNowCount: 0,
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false
    },
    secondSourceFetchTaskRows: fetchTaskRows,
    fetchTaskRows,
    eligibleFetchTaskRows,
    blockedFetchTaskRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true,
      readinessBlocked: true,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false,
      diagnosticOnly: true
    },
    notes: [
      "This job only materializes controlled second-source snapshot fetch tasks.",
      "No URL fetch is performed by this job.",
      "A later fetch job must require explicit --allow-fetch.",
      "No standings writer or promotion is allowed from this report."
    ],
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false,
    selfTest: Boolean(options.selfTest)
  };
}

function selfTestInput() {
  return {
    ok: true,
    job: "rank-standings-second-source-search-results-file",
    acceptedSecondSourceCandidateRows: [
      {
        leagueSlug: "bel.2",
        missingLeagueSlug: "bel.2",
        countryPrefix: "bel",
        hostname: "flashscore.com",
        title: "Challenger Pro League Standings - Football/Belgium",
        url: "https://www.flashscore.com/football/belgium/challenger-pro-league/standings/",
        searchTargetQuery: "Challenger Pro League standings",
        rankScore: 110,
        rankState: "accepted_second_source_candidate",
        scoreReasons: ["league_term_match"],
        excludedHosts: ["proleague.be"],
        proposedPath: "data/standings/bel.2.json",
        proposedTableRowCount: 17,
        warningCount: 0,
        sourceFetch: false,
        noFetch: true,
        standingsWriteAllowedNow: false,
        canonicalWrites: 0,
        productionWrite: false
      },
      {
        leagueSlug: "bel.2",
        missingLeagueSlug: "bel.2",
        countryPrefix: "bel",
        hostname: "proleague.be",
        title: "Bad excluded primary",
        url: "https://www.proleague.be/cpl-ranking",
        rankScore: 99,
        rankState: "accepted_second_source_candidate",
        excludedHosts: ["proleague.be"],
        proposedPath: "data/standings/bel.2.json",
        proposedTableRowCount: 17
      }
    ]
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = buildReport(selfTestInput(), {
      selfTest: true,
      maxPerLeague: args.maxPerLeague
    });

    if (report.summary.fetchTaskRowCount !== 2) {
      throw new Error(`self-test expected 2 fetch tasks, got ${report.summary.fetchTaskRowCount}`);
    }

    if (report.summary.eligibleFetchTaskRowCount !== 1) {
      throw new Error(`self-test expected 1 eligible fetch task, got ${report.summary.eligibleFetchTaskRowCount}`);
    }

    if (report.summary.blockedFetchTaskRowCount !== 1) {
      throw new Error(`self-test expected 1 blocked fetch task, got ${report.summary.blockedFetchTaskRowCount}`);
    }

    if (report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0) {
      throw new Error("self-test safety guarantees failed");
    }

    console.log(JSON.stringify({
      ok: true,
      selfTest: "materialize-standings-second-source-fetch-tasks-file",
      summary: report.summary,
      eligibleFetchTaskRows: report.eligibleFetchTaskRows,
      blockedFetchTaskRows: report.blockedFetchTaskRows,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const outputPath = args.output || "data/football-truth/_diagnostics/same-prefix-missing-standings/standings-second-source-fetch-tasks.json";
  const report = buildReport(input, args);
  const resolvedOutput = writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, resolvedOutput).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "materialize-standings-second-source-fetch-tasks-file",
    error: error?.message || String(error),
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});