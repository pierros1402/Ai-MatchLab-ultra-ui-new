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
    selfTest: false
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

    throw new Error(`Unknown or incomplete argument: ${arg}`);
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

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();

  for (const value of asArray(values)) {
    const text = asText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }

  return out;
}

function pickAcceptedCandidateRows(input) {
  const direct = asArray(input.acceptedCandidateRows);
  if (direct.length) return direct;

  const nested = asArray(input.report?.acceptedCandidateRows);
  if (nested.length) return nested;

  const rankedRows = asArray(input.rankedRows);
  if (rankedRows.length) {
    return rankedRows.filter((row) => asText(row.candidateDecision) === "accepted");
  }

  const rows = asArray(input.rows);
  if (rows.length) {
    return rows.filter((row) => asText(row.candidateDecision) === "accepted");
  }

  return [];
}

function normalizeTask(row, index) {
  const missingLeagueSlug = asText(row.missingLeagueSlug || row.leagueSlug);
  const countryPrefix = asText(row.countryPrefix || missingLeagueSlug.split(".")[0]);
  const sourceCandidateUrl = asText(row.sourceCandidateUrl || row.url || row.href);
  const hostname = asText(row.hostname || row.host);
  const title = asText(row.title);
  const snippet = asText(row.snippet || row.description);
  const candidateScore = asNumber(row.candidateScore, 0);
  const rank = asNumber(row.rank, index + 1);
  const positiveReasons = uniqueStrings(row.positiveReasons);
  const rejectionReasons = uniqueStrings(row.rejectionReasons);

  const missingRequiredFields = [];
  if (!missingLeagueSlug) missingRequiredFields.push("missingLeagueSlug");
  if (!sourceCandidateUrl) missingRequiredFields.push("sourceCandidateUrl");

  const fetchEligibilityState = missingRequiredFields.length
    ? "blocked_missing_required_fetch_task_fields"
    : "eligible_for_controlled_standings_source_snapshot_fetch";

  return {
    taskId: [
      "standings-source",
      missingLeagueSlug || "missing-league",
      String(index + 1).padStart(4, "0")
    ].join(":"),
    missingLeagueSlug,
    countryPrefix,
    sourceCandidateUrl,
    url: sourceCandidateUrl,
    hostname,
    title,
    snippet,
    candidateScore,
    rank,
    candidateDecision: asText(row.candidateDecision || "accepted"),
    positiveReasons,
    rejectionReasons,
    missingRequiredFields,
    fetchEligibilityState,
    nextRequiredAction: fetchEligibilityState === "eligible_for_controlled_standings_source_snapshot_fetch"
      ? "controlled_snapshot_fetch_requires_explicit_allow_fetch"
      : "fix_fetch_task_required_fields_before_fetch",
    sourceFetch: false,
    noFetch: true,
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = asText(row[field]) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function buildReport(input, options = {}) {
  const acceptedCandidateRows = pickAcceptedCandidateRows(input);
  const fetchTaskRows = acceptedCandidateRows.map(normalizeTask);
  const eligibleFetchTaskRows = fetchTaskRows.filter(
    (row) => row.fetchEligibilityState === "eligible_for_controlled_standings_source_snapshot_fetch"
  );
  const blockedFetchTaskRows = fetchTaskRows.filter(
    (row) => row.fetchEligibilityState !== "eligible_for_controlled_standings_source_snapshot_fetch"
  );

  const summary = {
    acceptedCandidateRowCount: acceptedCandidateRows.length,
    fetchTaskRowCount: fetchTaskRows.length,
    eligibleFetchTaskRowCount: eligibleFetchTaskRows.length,
    blockedFetchTaskRowCount: blockedFetchTaskRows.length,
    uniqueLeagueCount: new Set(fetchTaskRows.map((row) => row.missingLeagueSlug).filter(Boolean)).size,
    byFetchEligibilityState: countBy(fetchTaskRows, "fetchEligibilityState")
  };

  return {
    ok: true,
    job: "materialize-same-prefix-missing-standings-source-fetch-tasks-file",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      sourceJob: asText(input.job),
      sourceGeneratedAt: asText(input.generatedAt),
      sourceAcceptedCandidateRowCount: asNumber(input.summary?.acceptedCandidateCount, acceptedCandidateRows.length)
    },
    summary,
    fetchTaskRows,
    eligibleFetchTaskRows,
    blockedFetchTaskRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      readOnly: true
    },
    canonicalWrites: 0,
    productionWrite: false,
    selfTest: Boolean(options.selfTest)
  };
}

function selfTestInput() {
  return {
    ok: true,
    job: "rank-same-prefix-missing-standings-search-results-file",
    generatedAt: "2026-06-02T00:00:00.000Z",
    summary: {
      acceptedCandidateCount: 2
    },
    acceptedCandidateRows: [
      {
        missingLeagueSlug: "aut.2",
        countryPrefix: "aut",
        url: "https://www.flashscore.com/football/austria/2-liga/standings/",
        hostname: "www.flashscore.com",
        title: "2. Liga 2025/2026 standings",
        snippet: "Austria 2. Liga table and standings",
        candidateScore: 85,
        rank: 1,
        candidateDecision: "accepted",
        positiveReasons: ["trusted_standings_host", "country_signal", "league_signal", "standings_signal"],
        rejectionReasons: []
      },
      {
        missingLeagueSlug: "bel.2",
        countryPrefix: "bel",
        url: "https://www.soccerway.com/national/belgium/second-division/",
        hostname: "www.soccerway.com",
        title: "Belgium Challenger Pro League standings",
        snippet: "Belgium second division standings",
        candidateScore: 78,
        rank: 2,
        candidateDecision: "accepted",
        positiveReasons: ["trusted_standings_host", "country_signal", "league_signal", "standings_signal"],
        rejectionReasons: []
      }
    ]
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = buildReport(selfTestInput(), { selfTest: true });

    if (report.summary.fetchTaskRowCount !== 2) {
      throw new Error(`self-test expected 2 fetch tasks, got ${report.summary.fetchTaskRowCount}`);
    }

    if (report.summary.eligibleFetchTaskRowCount !== 2) {
      throw new Error(`self-test expected 2 eligible fetch tasks, got ${report.summary.eligibleFetchTaskRowCount}`);
    }

    if (report.guarantees.sourceFetch !== false || report.guarantees.noFetch !== true) {
      throw new Error("self-test read-only fetch guarantees failed");
    }

    console.log(JSON.stringify({
      ok: true,
      selfTest: "materialize-same-prefix-missing-standings-source-fetch-tasks-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const outputPath = args.output || "data/football-truth/_diagnostics/same-prefix-missing-standings/source-fetch-tasks.json";
  const report = buildReport(input);
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
    job: "materialize-same-prefix-missing-standings-source-fetch-tasks-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});