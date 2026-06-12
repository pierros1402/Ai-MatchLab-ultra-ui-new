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
  const args = { input: "", output: "", date: "", selfTest: false };

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

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function normalizeHost(host) {
  return asText(host)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/g, "")
    .replace(/[),.;:'"<>]+$/g, "");
}

function normalizeUrl(url) {
  const text = asText(url).replace(/\s+/g, "");
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) return "";
  try {
    const parsed = new URL(text);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function hostFromUrl(url) {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

function extractUrlsFromText(text) {
  const value = asText(text);
  const urls = new Set();
  const re = /https?:\/\/[^\s"'<>),]+/gi;
  let match;

  while ((match = re.exec(value)) !== null) {
    const url = normalizeUrl(match[0]);
    if (url) urls.add(url);
  }

  return Array.from(urls);
}

function candidatePathSeedsForPurpose() {
  return [
    "",
    "/",
    "/fixtures",
    "/fixtures/",
    "/matches",
    "/matches/",
    "/results",
    "/results/",
    "/standings",
    "/standings/",
    "/tables",
    "/tables/",
    "/competitions",
    "/competitions/",
    "/leagues",
    "/leagues/",
    "/schedule",
    "/schedule/"
  ];
}

function urlForHostAndPath(host, pathPart) {
  const cleanHost = normalizeHost(host);
  if (!cleanHost) return "";
  const cleanPath = asText(pathPart);
  return normalizeUrl(`https://${cleanHost}${cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`}`);
}

function classifyRoutePurpose(url) {
  const lower = asText(url).toLowerCase();
  const purposes = [];
  if (/fixture|match|schedule/.test(lower)) purposes.push("fixtures");
  if (/result/.test(lower)) purposes.push("results");
  if (/standing|table|league-table/.test(lower)) purposes.push("standings");
  if (/competition|league|season|tournament/.test(lower)) purposes.push("season_activity");
  if (purposes.length < 1) purposes.push("route_probe");
  return purposes;
}

function stableDedupeKey(row) {
  return [
    row.competitionSlug,
    row.host,
    row.candidateUrl.toLowerCase(),
    row.routeSource
  ].join("|");
}

function buildPlan({ input, date }) {
  const hostBoards = Array.isArray(input?.hostBoards) ? input.hostBoards : [];
  const needsOfficialHostDiscoveryRows = Array.isArray(input?.needsOfficialHostDiscoveryRows)
    ? input.needsOfficialHostDiscoveryRows
    : [];

  const candidateRows = [];
  const selectedOfficialHostRows = [];

  for (const board of hostBoards) {
    const competitionSlug = asText(board.competitionSlug);
    const selectedHosts = Array.isArray(board.selectedHosts) ? board.selectedHosts : [];

    for (const hostRow of selectedHosts) {
      const host = normalizeHost(hostRow.host);
      const status = asText(hostRow.hostTruthStatus);

      if (status !== "evidence_derived_candidate_official_host") continue;
      if (!host) continue;

      selectedOfficialHostRows.push({
        competitionSlug,
        host,
        hostTruthStatus: status,
        evidenceCount: Number(hostRow.evidenceCount || 0),
        sourceNames: Array.isArray(hostRow.sourceNames) ? hostRow.sourceNames : [],
        score: Number(hostRow.score || 0)
      });

      const contextUrls = extractUrlsFromText(hostRow.sampleContext || "")
        .filter((url) => hostFromUrl(url) === host);

      for (const url of contextUrls) {
        candidateRows.push({
          competitionSlug,
          host,
          candidateUrl: url,
          routeSource: "evidence_context_url",
          routePurposes: classifyRoutePurpose(url),
          hostTruthStatus: status,
          fetchRequiresExplicitAllowFetch: true,
          mayPromoteCanonical: false,
          canonicalWrites: 0,
          productionWrite: false,
          dryRun: true
        });
      }

      for (const pathSeed of candidatePathSeedsForPurpose()) {
        const url = urlForHostAndPath(host, pathSeed);
        if (!url) continue;

        candidateRows.push({
          competitionSlug,
          host,
          candidateUrl: url,
          routeSource: "generic_shallow_official_host_route_seed",
          routePurposes: classifyRoutePurpose(url),
          hostTruthStatus: status,
          fetchRequiresExplicitAllowFetch: true,
          mayPromoteCanonical: false,
          canonicalWrites: 0,
          productionWrite: false,
          dryRun: true
        });
      }
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const row of candidateRows) {
    const key = stableDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);

    deduped.push({
      routeCandidateId: [
        date || "unknown-day",
        row.competitionSlug,
        row.host,
        String(deduped.length + 1).padStart(4, "0")
      ].join(":"),
      ...row
    });
  }

  const byCompetition = {};
  const byHost = {};
  const byRouteSource = {};

  for (const row of deduped) {
    byCompetition[row.competitionSlug] = (byCompetition[row.competitionSlug] || 0) + 1;
    byHost[row.host] = (byHost[row.host] || 0) + 1;
    byRouteSource[row.routeSource] = (byRouteSource[row.routeSource] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-active-watchlist-official-source-route-recovery-plan-file",
    mode: "read_only_active_watchlist_official_source_route_recovery_plan",
    generatedAt: new Date().toISOString(),
    date,
    sourceSummary: input.summary || {},
    summary: {
      selectedOfficialHostCount: selectedOfficialHostRows.length,
      routeCandidateCount: deduped.length,
      needsOfficialHostDiscoveryCount: needsOfficialHostDiscoveryRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byCompetition,
    byHost,
    byRouteSource,
    selectedOfficialHostRows,
    needsOfficialHostDiscoveryRows,
    routeCandidateRows: deduped,
    policy: {
      noProviderSearchRetry: true,
      searchProviderFailedGate: true,
      routeCandidateDoesNotEqualTruth: true,
      fetchRequiresExplicitAllowFetch: true,
      noFetchInThisJob: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromUnverifiedRoutes: true
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
  const report = buildPlan({
    date: "2026-06-12",
    input: {
      summary: { invalidSelectedHostCount: 0 },
      hostBoards: [
        {
          competitionSlug: "abc.1",
          selectedHosts: [
            {
              host: "www.abc-league.example.com",
              hostTruthStatus: "evidence_derived_candidate_official_host",
              evidenceCount: 2,
              sourceNames: ["full_map"],
              score: 7,
              sampleContext: "sourceUrl https://www.abc-league.example.com/fixtures official league"
            },
            {
              host: "www.flashscore.com",
              hostTruthStatus: "secondary_reference_only",
              evidenceCount: 2,
              sourceNames: ["controlled_search_results"],
              score: 2
            }
          ]
        }
      ],
      needsOfficialHostDiscoveryRows: []
    }
  });

  if (report.summary.selectedOfficialHostCount !== 1) throw new Error("expected one official host");
  if (report.summary.routeCandidateCount < 2) throw new Error("expected route candidates");
  if (report.routeCandidateRows.some((row) => row.host === "www.flashscore.com")) {
    throw new Error("secondary references must not be route recovery official hosts");
  }
  if (report.guarantees.noFetch !== true || report.guarantees.noSearch !== true) {
    throw new Error("expected read-only guarantees");
  }

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-active-watchlist-official-source-route-recovery-plan-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildPlan({
    input: readJson(args.input),
    date: args.date
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
    job: "build-football-truth-active-watchlist-official-source-route-recovery-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}