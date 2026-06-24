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
    maxPerCompetition: 8,
    maxPerHost: 4,
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      args.input = argv[++index] || "";
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++index] || "";
      continue;
    }

    if (arg === "--date") {
      args.date = argv[++index] || "";
      continue;
    }

    if (arg === "--max-per-competition") {
      args.maxPerCompetition = Number(argv[++index] || 8);
      continue;
    }

    if (arg === "--max-per-host") {
      args.maxPerHost = Number(argv[++index] || 4);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function normalizeUrl(url) {
  const text = asText(url);
  if (!/^https?:\/\//i.test(text)) return "";
  try {
    const parsed = new URL(text);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function routePurposeList(row) {
  return Array.isArray(row?.routePurposes) ? row.routePurposes.map(asText).filter(Boolean) : [];
}

function routePriority(row) {
  const url = asText(row.candidateUrl).toLowerCase();
  const source = asText(row.routeSource);
  const purposes = routePurposeList(row);

  if (source === "evidence_context_url") return 0;
  if (/\/fixtures?\/?$|\/matches?\/?$|\/schedule\/?$/.test(url)) return 1;
  if (/\/results?\/?$/.test(url)) return 2;
  if (/\/standings?\/?$|\/tables?\/?$/.test(url)) return 3;
  if (/\/competitions?\/?$|\/leagues?\/?$/.test(url)) return 4;
  if (purposes.includes("route_probe")) return 5;
  return 9;
}

function fetchPurpose(row) {
  const purposes = routePurposeList(row);
  if (purposes.includes("fixtures")) return "fixture_activity_probe";
  if (purposes.includes("results")) return "result_activity_probe";
  if (purposes.includes("standings")) return "standings_activity_probe";
  if (purposes.includes("season_activity")) return "season_activity_probe";
  return "official_route_probe";
}

function stableKey(row) {
  return [
    asText(row.competitionSlug),
    asText(row.host),
    normalizeUrl(row.candidateUrl).toLowerCase()
  ].join("|");
}

function buildInput({ plan, date, maxPerCompetition, maxPerHost }) {
  const routeRows = Array.isArray(plan?.routeCandidateRows) ? plan.routeCandidateRows : [];
  const needsDiscovery = Array.isArray(plan?.needsOfficialHostDiscoveryRows) ? plan.needsOfficialHostDiscoveryRows : [];

  const unique = [];
  const seen = new Set();

  for (const row of routeRows) {
    const candidateUrl = normalizeUrl(row.candidateUrl);
    if (!candidateUrl) continue;
    if (asText(row.hostTruthStatus) !== "evidence_derived_candidate_official_host") continue;

    const key = stableKey({ ...row, candidateUrl });
    if (seen.has(key)) continue;
    seen.add(key);

    unique.push({
      ...row,
      candidateUrl,
      priority: routePriority(row),
      fetchPurpose: fetchPurpose(row)
    });
  }

  unique.sort((a, b) => {
    if (asText(a.competitionSlug) !== asText(b.competitionSlug)) {
      return asText(a.competitionSlug).localeCompare(asText(b.competitionSlug));
    }
    if (asText(a.host) !== asText(b.host)) return asText(a.host).localeCompare(asText(b.host));
    if (a.priority !== b.priority) return a.priority - b.priority;
    return asText(a.candidateUrl).length - asText(b.candidateUrl).length;
  });

  const selected = [];
  const perCompetition = new Map();
  const perHost = new Map();

  for (const row of unique) {
    const competitionSlug = asText(row.competitionSlug);
    const host = asText(row.host);
    const competitionCount = perCompetition.get(competitionSlug) || 0;
    const hostKey = `${competitionSlug}|${host}`;
    const hostCount = perHost.get(hostKey) || 0;

    if (competitionCount >= maxPerCompetition) continue;
    if (hostCount >= maxPerHost) continue;

    perCompetition.set(competitionSlug, competitionCount + 1);
    perHost.set(hostKey, hostCount + 1);

    selected.push({
      fetchInputId: [
        date || "unknown-day",
        competitionSlug,
        host,
        String(selected.length + 1).padStart(4, "0")
      ].join(":"),
      competitionSlug,
      leagueSlug: competitionSlug,
      host,
      candidateUrl: row.candidateUrl,
      sourceUrl: row.candidateUrl,
      checkedSourceUrl: row.candidateUrl,
      routeSource: row.routeSource,
      routePurposes: routePurposeList(row),
      fetchPurpose: row.fetchPurpose,
      priority: row.priority,
      fetchRequiresExplicitAllowFetch: true,
      noCanonicalPromotion: true,
      mayPromoteCanonical: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    });
  }

  const byCompetition = {};
  const byHost = {};
  const byFetchPurpose = {};

  for (const row of selected) {
    byCompetition[row.competitionSlug] = (byCompetition[row.competitionSlug] || 0) + 1;
    byHost[row.host] = (byHost[row.host] || 0) + 1;
    byFetchPurpose[row.fetchPurpose] = (byFetchPurpose[row.fetchPurpose] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-active-watchlist-official-route-probe-fetch-input-file",
    mode: "read_only_controlled_official_route_probe_fetch_input",
    generatedAt: new Date().toISOString(),
    date,
    sourceSummary: plan.summary || {},
    summary: {
      sourceRouteCandidateCount: routeRows.length,
      selectedFetchInputCount: selected.length,
      competitionCount: Object.keys(byCompetition).length,
      needsOfficialHostDiscoveryCount: needsDiscovery.length,
      maxPerCompetition,
      maxPerHost,
      fetchRequiresExplicitAllowFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byCompetition,
    byHost,
    byFetchPurpose,
    fetchInputRows: selected,
    candidateUrlRows: selected,
    snapshotTargetRows: selected,
    needsOfficialHostDiscoveryRows: needsDiscovery,
    policy: {
      selectorOnly: true,
      noFetchInThisJob: true,
      fetchRequiresExplicitAllowFetch: true,
      routeProbeDoesNotEqualTruth: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromRouteProbe: true,
      searchProviderNotUsed: true
    },
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
  const report = buildInput({
    date: "2026-06-12",
    maxPerCompetition: 3,
    maxPerHost: 2,
    plan: {
      routeCandidateRows: [
        {
          competitionSlug: "abc.1",
          host: "www.abc.example.com",
          candidateUrl: "https://www.abc.example.com",
          routeSource: "generic_shallow_official_host_route_seed",
          routePurposes: ["route_probe"],
          hostTruthStatus: "evidence_derived_candidate_official_host"
        },
        {
          competitionSlug: "abc.1",
          host: "www.abc.example.com",
          candidateUrl: "https://www.abc.example.com/fixtures",
          routeSource: "generic_shallow_official_host_route_seed",
          routePurposes: ["fixtures"],
          hostTruthStatus: "evidence_derived_candidate_official_host"
        },
        {
          competitionSlug: "abc.1",
          host: "www.flashscore.com",
          candidateUrl: "https://www.flashscore.com/football/abc",
          routeSource: "generic_shallow_official_host_route_seed",
          routePurposes: ["fixtures"],
          hostTruthStatus: "secondary_reference_only"
        }
      ],
      needsOfficialHostDiscoveryRows: []
    }
  });

  if (report.summary.selectedFetchInputCount !== 2) throw new Error("expected two official fetch inputs");
  if (report.fetchInputRows.some((row) => row.host === "www.flashscore.com")) throw new Error("secondary host must not be selected");
  if (!report.fetchInputRows.every((row) => row.fetchRequiresExplicitAllowFetch === true)) throw new Error("fetch must require explicit allow");
  if (report.guarantees.noFetch !== true) throw new Error("selector must not fetch");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-active-watchlist-official-route-probe-fetch-input-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildInput({
    plan: readJson(args.input),
    date: args.date,
    maxPerCompetition: Number.isFinite(args.maxPerCompetition) ? args.maxPerCompetition : 8,
    maxPerHost: Number.isFinite(args.maxPerHost) ? args.maxPerHost : 4
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
    job: "build-football-truth-active-watchlist-official-route-probe-fetch-input-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}