#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getOfficialRouteEntry } from "./lib/football-truth-season-calendar-official-route-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    perLeagueLimit: 3,
    officialOnly: false,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--per-league-limit") args.perLeagueLimit = Number(argv[++i] || 0);
    else if (arg.startsWith("--per-league-limit=")) args.perLeagueLimit = Number(arg.slice("--per-league-limit=".length));
    else if (arg === "--official-only") args.officialOnly = true;
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.perLeagueLimit = Number.isFinite(args.perLeagueLimit) && args.perLeagueLimit > 0
    ? Math.floor(args.perLeagueLimit)
    : 0;

  return args;
}

function rankedRowsOf(input) {
  if (Array.isArray(input)) return input;
  for (const key of ["rankedCandidateRows", "rankedCandidateUrlRows", "candidateUrlRows", "rows", "items"]) {
    if (Array.isArray(input && input[key])) return input[key];
  }
  return [];
}

function sourcePriority(row) {
  const sourceClass = asText(row.sourceClass);
  const truthRole = asText(row.truthRole);
  if (sourceClass === "official_governing_or_competition_operator") return 1;
  if (truthRole === "primary_candidate_after_fetch_evidence") return 2;
  if (sourceClass === "trusted_independent_fixture_listing") return 3;
  if (sourceClass === "supplemental_scoreboard_or_media") return 4;
  return 9;
}

function sortRows(rows) {
  return [...rows].sort((a, b) =>
    sourcePriority(a) - sourcePriority(b) ||
    candidateScoreFor(b) - candidateScoreFor(a) ||
    asText(a.leagueSlug).localeCompare(asText(b.leagueSlug)) ||
    candidateUrlFor(a).localeCompare(candidateUrlFor(b))
  );
}

function limitPerLeague(rows, limit) {
  if (!limit) return sortRows(rows);

  const out = [];
  const counts = new Map();

  for (const row of sortRows(rows)) {
    const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
    const count = counts.get(leagueSlug) || 0;
    if (count >= limit) continue;
    counts.set(leagueSlug, count + 1);
    out.push(row);
  }

  return out;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function candidateUrlFor(row) {
  return asText(row.candidateUrl || row.url || row.sourceUrl || row.resolvedUrl || row.finalUrl);
}

function candidateScoreFor(row) {
  const value = Number(row.compositeScore ?? row.score ?? row.strictScore ?? row.officialHostScore ?? 0);
  return Number.isFinite(value) ? value : 0;
}
const AUTHORITY_RULES = [
  { prefix: "eng.1", hosts: [/premierleague\.com$/i] },
  { prefix: "eng.2", hosts: [/efl\.com$/i] },
  { prefix: "eng.3", hosts: [/efl\.com$/i] },
  { prefix: "eng.4", hosts: [/efl\.com$/i] },
  { prefix: "eng.league_cup", hosts: [/efl\.com$/i] },
  { prefix: "ger.1", hosts: [/bundesliga\.com$/i] },
  { prefix: "ger.2", hosts: [/bundesliga\.com$/i] },
  { prefix: "gre.1", hosts: [/slgr\.gr$/i] },
  { prefix: "uefa.champions", hosts: [/uefa\.com$/i] }
];

function authorityRuleForLeagueSlug(slug) {
  const value = asText(slug).toLowerCase();
  return AUTHORITY_RULES
    .filter((rule) => value === rule.prefix || value.startsWith(rule.prefix + "."))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0] || null;
}

function officialRouteHostsForLeagueSlug(slug) {
  const entry = getOfficialRouteEntry(slug);
  if (!entry || !Array.isArray(entry.hosts)) return [];
  return entry.hosts.map((host) => asText(host).toLowerCase().replace(/^www\./, "")).filter(Boolean);
}

function isAuthorityHostForLeague(row) {
  const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
  const candidateUrl = candidateUrlFor(row);
  const hostname = (asText(row.hostname) || hostnameOf(candidateUrl)).toLowerCase().replace(/^www\./, "");

  const registryHosts = officialRouteHostsForLeagueSlug(leagueSlug);
  if (registryHosts.length > 0) {
    return registryHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  }

  const rule = authorityRuleForLeagueSlug(leagueSlug);
  if (!rule) return false;
  return rule.hosts.some((pattern) => pattern.test(hostname));
}

function fetchRow(row, index) {
  const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
  const candidateUrl = candidateUrlFor(row);
  const hostname = asText(row.hostname) || hostnameOf(candidateUrl);

  return {
    fetchTaskId: `${leagueSlug}::fixture_source_fetch::${String(index + 1).padStart(3, "0")}`,
    sourceTaskId: asText(row.searchTargetId || row.targetId || ""),
    targetType: "global-season-state-fixture-source-fetch",
    worksetBucket: "needsFixtures",
    leagueSlug,
    competitionSlug: leagueSlug,
    competitionName: asText(row.name || row.competitionName),
    dayKey: asText(row.dayKey || row.targetDate),
    candidateUrl,
    finalUrl: candidateUrl,
    hostname,
    sourceClass: asText(row.sourceClass),
    truthRole: asText(row.truthRole),
    compositeScore: candidateScoreFor(row),
    surfaceQuality: asText(row.surfaceQuality),
    sourceSignals: row.sourceSignals || [],
    scoreReasons: row.scoreReasons || row.rankReasons || [],
    fetchPurpose: "fixture_discovery_source_snapshot",
    expectedEvidence: [
      "fixture list",
      "match schedule",
      "results or scoreboard surface",
      "league/competition-specific fixture evidence"
    ],
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport(input, { inputPath = "", perLeagueLimit = 3, officialOnly = false } = {}) {
  const rankedRows = rankedRowsOf(input);

  const eligibleRows = rankedRows.filter((row) => {
    const candidateUrl = candidateUrlFor(row);
    if (!candidateUrl) return false;
    if (row.sourceFetch === true || row.canonicalWrites > 0 || row.productionWrite === true) return false;
    if (asText(row.truthRole) === "not_truth_ready") return false;
    if (asText(row.sourceClass) === "low_priority_or_non_truth_surface") return false;
    if (candidateScoreFor(row) <= 0) return false;
    if (officialOnly) {
      if (!isAuthorityHostForLeague(row)) return false;
    }
    return true;
  });

  const selectedRows = limitPerLeague(eligibleRows, perLeagueLimit);
  const fetchTaskRows = selectedRows.map(fetchRow);

  return {
    ok: true,
    job: "build-global-season-state-fixture-fetch-input-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    options: {
      perLeagueLimit,
      officialOnly
    },
    summary: {
      rankedCandidateInputCount: rankedRows.length,
      eligibleFetchCandidateCount: eligibleRows.length,
      fetchTaskCount: fetchTaskRows.length,
      byLeague: countBy(fetchTaskRows, "leagueSlug"),
      byHost: countBy(fetchTaskRows, "hostname"),
      bySourceClass: countBy(fetchTaskRows, "sourceClass"),
      byTruthRole: countBy(fetchTaskRows, "truthRole"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    fetchTaskRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedRankedCandidateUrls: true,
      inventedUrls: false,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const input = {
    rankedCandidateUrlRows: [
      {
        leagueSlug: "uefa.champions",
        candidateUrl: "https://www.uefa.com/uefachampionsleague/fixtures-results/",
        hostname: "uefa.com",
        sourceClass: "official_governing_or_competition_operator",
        truthRole: "primary_candidate_after_fetch_evidence",
        compositeScore: 61,
        surfaceQuality: "fixture_surface_candidate",
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false
      },
      {
        leagueSlug: "uefa.champions",
        candidateUrl: "https://www.espn.com/soccer/schedule/_/league/uefa.champions",
        hostname: "espn.com",
        sourceClass: "supplemental_scoreboard_or_media",
        truthRole: "supplemental_crosscheck_only",
        compositeScore: 8,
        surfaceQuality: "fixture_surface_candidate",
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false
      },
      {
        leagueSlug: "eng.1",
        candidateUrl: "https://www.slgr.gr/el/schedule/",
        hostname: "slgr.gr",
        sourceClass: "official_governing_or_competition_operator",
        truthRole: "primary_candidate_after_fetch_evidence",
        compositeScore: 70,
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false
      },
      {
        leagueSlug: "ger.1",
        candidateUrl: "https://www.bundesliga.com/en/bundesliga",
        hostname: "bundesliga.com",
        sourceClass: "season_activity_calendar_candidate",
        truthRole: "season_activity_candidate_after_fetch_evidence",
        compositeScore: 58,
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false
      },
      {
        leagueSlug: "bad.1",
        candidateUrl: "https://example.test/noise",
        hostname: "example.test",
        sourceClass: "low_priority_or_non_truth_surface",
        truthRole: "not_truth_ready",
        compositeScore: 0,
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false
      },
      {
        leagueSlug: "bel.2",
        candidateUrl: "https://www.proleague.be/cpl-kalender",
        hostname: "proleague.be",
        sourceClass: "official_governing_or_competition_operator",
        truthRole: "primary_candidate_after_fetch_evidence",
        compositeScore: 72,
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false
      },
      {
        leagueSlug: "aut.2",
        candidateUrl: "https://www.laliga.com/en-GB/laliga-hypermotion/calendar",
        hostname: "laliga.com",
        sourceClass: "official_governing_or_competition_operator",
        truthRole: "primary_candidate_after_fetch_evidence",
        compositeScore: 80,
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test", perLeagueLimit: 2 });
  if (report.summary.rankedCandidateInputCount !== 7) throw new Error("expected 7 ranked input rows");
  if (report.summary.eligibleFetchCandidateCount !== 6) throw new Error("expected 6 eligible rows");
  if (report.summary.fetchTaskCount !== 6) throw new Error("expected 6 fetch tasks");
  if (report.guarantees.sourceFetch !== false || report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  const officialOnly = buildReport(input, { inputPath: "self-test", perLeagueLimit: 2, officialOnly: true });
  if (officialOnly.summary.fetchTaskCount !== 3) throw new Error("expected 3 official-only fetch tasks");
  if (officialOnly.fetchTaskRows.some((row) => row.leagueSlug === "eng.1" && row.hostname === "slgr.gr")) {
    throw new Error("wrong-league official host must be blocked");
  }
  if (!officialOnly.fetchTaskRows.some((row) => row.leagueSlug === "ger.1" && row.hostname === "bundesliga.com")) {
    throw new Error("authority-host season activity candidate must pass official-only");
  }
  if (!officialOnly.fetchTaskRows.some((row) => row.leagueSlug === "bel.2" && row.hostname === "proleague.be")) {
    throw new Error("official route registry host must pass official-only");
  }
  if (officialOnly.fetchTaskRows.some((row) => row.leagueSlug === "aut.2" && row.hostname === "laliga.com")) {
    throw new Error("wrong registry authority host must be blocked");
  }

  return {
    ok: true,
    selfTest: "build-global-season-state-fixture-fetch-input-file",
    summary: report.summary,
    officialOnlySummary: officialOnly.summary,
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
    inputPath: args.input,
    perLeagueLimit: args.perLeagueLimit,
    officialOnly: args.officialOnly
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport };
