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
    tasks: "",
    output: "",
    selfTest: false,
    maxAcceptedPerLeague: 4
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

    if (arg === "--tasks" && argv[i + 1]) {
      args.tasks = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--max-accepted-per-league" && argv[i + 1]) {
      args.maxAcceptedPerLeague = Number(argv[++i]);
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  if (!Number.isFinite(args.maxAcceptedPerLeague) || args.maxAcceptedPerLeague < 1) {
    throw new Error("--max-accepted-per-league must be a positive number");
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

function hostnameFromUrl(value) {
  try {
    return new URL(asText(value)).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeHost(value) {
  return asText(value).replace(/^www\./i, "").toLowerCase();
}

function pickSearchRows(input) {
  const direct = asArray(input.searchResultRows);
  if (direct.length) return direct;

  const nested = asArray(input.report?.searchResultRows);
  if (nested.length) return nested;

  return [];
}

function pickTaskRows(input) {
  const direct = asArray(input.taskRows);
  if (direct.length) return direct;

  const second = asArray(input.secondSourceSearchTaskRows);
  if (second.length) return second;

  const nested = asArray(input.report?.taskRows);
  if (nested.length) return nested;

  return [];
}

function taskContextByLeague(tasksInput) {
  const map = new Map();

  for (const task of pickTaskRows(tasksInput)) {
    const league = asText(task.missingLeagueSlug || task.leagueSlug);
    if (!league) continue;

    map.set(league, {
      leagueSlug: league,
      countryPrefix: asText(task.countryPrefix),
      missingTier: task.missingTier ?? null,
      excludedHosts: asArray(task.excludedHosts).map(normalizeHost).filter(Boolean),
      excludedSourceUrls: asArray(task.excludedSourceUrls).map(asText).filter(Boolean),
      proposedPath: asText(task.proposedPath),
      proposedTableRowCount: asNumber(task.proposedTableRowCount, 0),
      warningCount: asNumber(task.warningCount, 0)
    });
  }

  return map;
}

function leagueLabels(leagueSlug) {
  const labels = {
    "aut.2": {
      countryTerms: ["austria", "austrian", "österreich"],
      leagueTerms: ["2. liga", "admiral 2. liga", "austria 2 liga"],
      rejectTerms: ["portugal", "liga portugal", "bundesliga 2", "2. bundesliga", "germany", "german", "france", "spain", "italy"]
    },
    "bel.2": {
      countryTerms: ["belgium", "belgian", "belgië", "belgique"],
      leagueTerms: ["challenger pro league", "first division b", "division b", "belgium 2"],
      rejectTerms: ["pro league ranking official website excluded primary placeholder"]
    }
  };

  return labels[leagueSlug] || {
    countryTerms: [],
    leagueTerms: [leagueSlug],
    rejectTerms: []
  };
}

function hostQuality(hostname) {
  const host = normalizeHost(hostname);

  if (/flashscore\./.test(host)) return { score: 32, label: "trusted_live_scores_standings_host" };
  if (host === "sofascore.com") return { score: 28, label: "trusted_live_scores_standings_host" };
  if (host === "worldfootball.net") return { score: 24, label: "trusted_historical_standings_host" };
  if (host === "globalsportsarchive.com") return { score: 22, label: "structured_sports_archive_host" };
  if (host === "365scores.com") return { score: 18, label: "sports_scores_standings_host" };
  if (host === "statsbet.org") return { score: 10, label: "supplemental_stats_host" };
  if (host === "tribuna.com") return { score: 6, label: "low_priority_news_or_fan_host" };
  if (host === "standingsnow.com") return { score: 4, label: "generic_standings_host" };

  return { score: 8, label: "unclassified_second_source_host" };
}

function includesAny(haystack, terms) {
  const text = asText(haystack).toLowerCase();
  return terms.some((term) => term && text.includes(term.toLowerCase()));
}

function rankSearchRow(row, context) {
  const leagueSlug = asText(row.missingLeagueSlug || row.leagueSlug);
  const labels = leagueLabels(leagueSlug);
  const hostname = normalizeHost(row.hostname || hostnameFromUrl(row.url));
  const title = asText(row.title);
  const url = asText(row.url);
  const snippet = asText(row.snippet || row.description);
  const query = asText(row.searchTargetQuery || row.query);
  const haystack = `${title} ${url} ${snippet} ${query}`.toLowerCase();

  const rejectionReasons = [];
  const scoreReasons = [];

  if (!leagueSlug) rejectionReasons.push("missing_league_slug");
  if (!hostname) rejectionReasons.push("missing_hostname");
  if (!url) rejectionReasons.push("missing_url");

  const excludedHosts = asArray(context?.excludedHosts).map(normalizeHost);
  if (excludedHosts.includes(hostname)) {
    rejectionReasons.push("excluded_primary_source_host");
  }

  if (includesAny(haystack, labels.rejectTerms)) {
    rejectionReasons.push("wrong_country_or_league_collision");
  }

  const hasLeagueTerm = includesAny(haystack, labels.leagueTerms);
  const hasCountryTerm = includesAny(haystack, labels.countryTerms);
  const hasStandingsTerm = /standings|ranking|table|tabelle|klassement/i.test(haystack);

  if (!hasStandingsTerm) rejectionReasons.push("missing_standings_table_intent");

  if (leagueSlug === "aut.2" && !hasLeagueTerm && !hasCountryTerm) {
    rejectionReasons.push("missing_austria_2_liga_context");
  }

  if (leagueSlug === "bel.2" && !hasLeagueTerm && !hasCountryTerm) {
    rejectionReasons.push("missing_belgium_challenger_context");
  }

  let score = 0;

  if (hasLeagueTerm) {
    score += 35;
    scoreReasons.push("league_term_match");
  }

  if (hasCountryTerm) {
    score += 18;
    scoreReasons.push("country_context_match");
  }

  if (hasStandingsTerm) {
    score += 20;
    scoreReasons.push("standings_term_match");
  }

  const hq = hostQuality(hostname);
  score += hq.score;
  scoreReasons.push(hq.label);

  if (/official|league|federation/i.test(haystack)) {
    score += 5;
    scoreReasons.push("official_or_league_word");
  }

  if (/fixtures|results only|news|transfer/i.test(haystack) && !hasStandingsTerm) {
    rejectionReasons.push("non_standings_result");
  }

  if (rejectionReasons.length > 0) {
    score = Math.min(score, 49);
  }

  const accepted = rejectionReasons.length === 0 && score >= 60;

  return {
    leagueSlug,
    missingLeagueSlug: leagueSlug,
    countryPrefix: asText(row.countryPrefix || context?.countryPrefix),
    hostname,
    title,
    url,
    snippet,
    searchTargetQuery: query,
    rankScore: score,
    rankState: accepted
      ? "accepted_second_source_candidate"
      : "rejected_second_source_candidate",
    scoreReasons,
    rejectionReasons,
    excludedHosts,
    proposedPath: asText(context?.proposedPath),
    proposedTableRowCount: asNumber(context?.proposedTableRowCount, 0),
    warningCount: asNumber(context?.warningCount, 0),
    sourceFetch: false,
    noFetch: true,
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function dedupeAccepted(rows) {
  const out = [];
  const seen = new Set();

  for (const row of rows) {
    const key = `${row.leagueSlug}|${row.hostname}|${row.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = asText(row[field]) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function buildReport(searchInput, tasksInput, options = {}) {
  const searchRows = pickSearchRows(searchInput);
  const contextByLeague = taskContextByLeague(tasksInput);

  const rankedRows = searchRows.map((row) => {
    const league = asText(row.missingLeagueSlug || row.leagueSlug);
    return rankSearchRow(row, contextByLeague.get(league));
  });

  const acceptedAll = rankedRows
    .filter((row) => row.rankState === "accepted_second_source_candidate")
    .sort((a, b) => b.rankScore - a.rankScore);

  const acceptedLimited = [];
  const acceptedCountByLeague = new Map();

  for (const row of dedupeAccepted(acceptedAll)) {
    const count = acceptedCountByLeague.get(row.leagueSlug) || 0;
    if (count >= options.maxAcceptedPerLeague) continue;
    acceptedCountByLeague.set(row.leagueSlug, count + 1);
    acceptedLimited.push(row);
  }

  const acceptedKeys = new Set(acceptedLimited.map((row) => `${row.leagueSlug}|${row.hostname}|${row.url}`));
  const rejectedRows = rankedRows.filter((row) => {
    const key = `${row.leagueSlug}|${row.hostname}|${row.url}`;
    return row.rankState !== "accepted_second_source_candidate" || !acceptedKeys.has(key);
  });

  return {
    ok: true,
    job: "rank-standings-second-source-search-results-file",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      sourceJob: asText(searchInput.job),
      sourceGeneratedAt: asText(searchInput.generatedAt),
      searchResultRowCount: searchRows.length,
      taskContextLeagueCount: contextByLeague.size
    },
    summary: {
      searchResultRowCount: searchRows.length,
      rankedSearchResultRowCount: rankedRows.length,
      acceptedSecondSourceCandidateRowCount: acceptedLimited.length,
      rejectedSecondSourceCandidateRowCount: rejectedRows.length,
      acceptedLeagueCount: new Set(acceptedLimited.map((row) => row.leagueSlug)).size,
      rejectedExcludedPrimaryHostCount: rejectedRows.filter((row) => row.rejectionReasons.includes("excluded_primary_source_host")).length,
      rejectedWrongLeagueCollisionCount: rejectedRows.filter((row) => row.rejectionReasons.includes("wrong_country_or_league_collision")).length,
      byAcceptedLeague: countBy(acceptedLimited, "leagueSlug"),
      byAcceptedHostname: countBy(acceptedLimited, "hostname"),
      standingsWriteAllowedNowCount: 0,
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false
    },
    acceptedSecondSourceCandidateRows: acceptedLimited,
    rejectedSecondSourceCandidateRows: rejectedRows,
    rankedSecondSourceSearchResultRows: rankedRows,
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
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false,
    selfTest: Boolean(options.selfTest)
  };
}

function selfTestSearchInput() {
  return {
    ok: true,
    job: "collect-same-prefix-missing-standings-search-results-file",
    searchResultRows: [
      {
        missingLeagueSlug: "bel.2",
        countryPrefix: "bel",
        hostname: "proleague.be",
        title: "Challenger Pro League Ranking | Pro League | Official Website",
        url: "https://www.proleague.be/cpl-ranking",
        searchTargetQuery: "Challenger Pro League standings"
      },
      {
        missingLeagueSlug: "bel.2",
        countryPrefix: "bel",
        hostname: "flashscore.com",
        title: "Challenger Pro League 2025/2026 Standings - Football/Belgium",
        url: "https://www.flashscore.com/football/belgium/challenger-pro-league/standings/",
        searchTargetQuery: "Challenger Pro League standings"
      },
      {
        missingLeagueSlug: "aut.2",
        countryPrefix: "aut",
        hostname: "standingsnow.com",
        title: "Liga Portugal 2 Standings & Table 2026",
        url: "https://standingsnow.com/portugal/liga-portugal-2",
        searchTargetQuery: "2. Liga standings"
      },
      {
        missingLeagueSlug: "aut.2",
        countryPrefix: "aut",
        hostname: "flashscore.com",
        title: "2. Liga 2025/2026 Standings - Football/Austria",
        url: "https://www.flashscore.com/football/austria/2-liga/standings/",
        searchTargetQuery: "Austria 2 Liga standings"
      }
    ]
  };
}

function selfTestTasksInput() {
  return {
    ok: true,
    job: "materialize-standings-second-source-search-tasks-file",
    taskRows: [
      {
        missingLeagueSlug: "bel.2",
        leagueSlug: "bel.2",
        countryPrefix: "bel",
        proposedPath: "data/standings/bel.2.json",
        proposedTableRowCount: 17,
        excludedHosts: ["proleague.be"],
        warningCount: 0
      },
      {
        missingLeagueSlug: "aut.2",
        leagueSlug: "aut.2",
        countryPrefix: "aut",
        proposedPath: "data/standings/aut.2.json",
        proposedTableRowCount: 15,
        excludedHosts: ["2liga.at"],
        warningCount: 1
      }
    ]
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = buildReport(selfTestSearchInput(), selfTestTasksInput(), {
      selfTest: true,
      maxAcceptedPerLeague: args.maxAcceptedPerLeague
    });

    if (report.summary.acceptedSecondSourceCandidateRowCount !== 2) {
      throw new Error(`self-test expected 2 accepted candidates, got ${report.summary.acceptedSecondSourceCandidateRowCount}`);
    }

    if (report.summary.rejectedExcludedPrimaryHostCount !== 1) {
      throw new Error("self-test expected excluded primary host rejection");
    }

    if (report.summary.rejectedWrongLeagueCollisionCount !== 1) {
      throw new Error("self-test expected wrong-league collision rejection");
    }

    if (report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0) {
      throw new Error("self-test safety guarantees failed");
    }

    console.log(JSON.stringify({
      ok: true,
      selfTest: "rank-standings-second-source-search-results-file",
      summary: report.summary,
      accepted: report.acceptedSecondSourceCandidateRows,
      rejected: report.rejectedSecondSourceCandidateRows.map((row) => ({
        leagueSlug: row.leagueSlug,
        hostname: row.hostname,
        title: row.title,
        rejectionReasons: row.rejectionReasons
      })),
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const searchInput = readJson(args.input, "input");
  const tasksInput = readJson(args.tasks, "tasks");
  const outputPath = args.output || "data/football-truth/_diagnostics/same-prefix-missing-standings/standings-second-source-ranked-search-results.json";
  const report = buildReport(searchInput, tasksInput, args);
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
    job: "rank-standings-second-source-search-results-file",
    error: error?.message || String(error),
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});