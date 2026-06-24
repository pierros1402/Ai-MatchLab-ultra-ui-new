#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg === "--date") args.date = argv[++i] || "";
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function routePathCandidatesFor(slug) {
  if (slug === "fifa.world_cup") {
    return [
      "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026",
      "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/matches",
      "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/groups",
      "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings",
      "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/qualifiers",
      "https://inside.fifa.com/tournaments/mens/worldcup/canadamexicousa2026"
    ];
  }

  if (slug === "fifa.club_world_cup") {
    return [
      "https://www.fifa.com/en/tournaments/mens/club-world-cup/usa-2025",
      "https://www.fifa.com/en/tournaments/mens/club-world-cup/usa-2025/matches",
      "https://www.fifa.com/en/tournaments/mens/club-world-cup/usa-2025/groups",
      "https://www.fifa.com/en/tournaments/mens/club-world-cup/usa-2025/standings",
      "https://www.fifa.com/en/tournaments/mens/club-world-cup/usa-2025/teams",
      "https://inside.fifa.com/tournaments/mens/club-world-cup/usa-2025"
    ];
  }

  return [];
}

function fetchPurposeFor(url) {
  const lower = url.toLowerCase();
  if (lower.includes("/matches")) return "official_matches_probe";
  if (lower.includes("/groups") || lower.includes("/standings")) return "official_group_or_standings_probe";
  if (lower.includes("/qualifiers")) return "official_qualifier_context_probe";
  if (lower.includes("/teams")) return "official_teams_context_probe";
  if (lower.includes("inside.fifa.com")) return "official_context_probe";
  return "official_tournament_home_probe";
}

function buildFetchInputRows(routeRecoveryRows) {
  const rows = [];

  for (const recoveryRow of routeRecoveryRows) {
    const slug = asText(recoveryRow.competitionSlug);
    const urls = routePathCandidatesFor(slug);

    urls.forEach((candidateUrl, index) => {
      const host = new URL(candidateUrl).hostname;

      rows.push({
        fetchInputId: `${slug}:fifa-official-probe:${String(index + 1).padStart(3, "0")}`,
        competitionSlug: slug,
        leagueSlug: slug,
        competitionName: asText(recoveryRow.competitionName),
        tournamentKind: asText(recoveryRow.tournamentKind),
        sourceLane: "fifa_official_lane",
        routeRecoveryRowId: asText(recoveryRow.routeRecoveryRowId),
        candidateUrl,
        expectedHost: host,
        hostRole: host === "www.fifa.com" ? "preferred_official_host" : "official_context_host",
        fetchPurpose: fetchPurposeFor(candidateUrl),
        requiredEvidence: recoveryRow.requiredEvidence || {},
        probePolicy: {
          explicitAllowFetchRequired: true,
          routeProbeDoesNotEqualTruth: true,
          officialHostScopedOnly: true,
          noSearchProviderRetry: true,
          noCanonicalWriteFromProbeInput: true,
          secondaryReferenceAllowedForComparisonOnly: true
        },
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
    });
  }

  return rows;
}

function buildPlan(input, options = {}) {
  const routeRecoveryRows = asArray(input.routeRecoveryRows);
  const unsupportedRows = routeRecoveryRows.filter((row) => {
    const slug = asText(row.competitionSlug);
    return !["fifa.world_cup", "fifa.club_world_cup"].includes(slug);
  });

  if (unsupportedRows.length) {
    throw new Error(`Unsupported FIFA route recovery slugs: ${unsupportedRows.map((row) => asText(row.competitionSlug)).join(", ")}`);
  }

  const fetchInputRows = buildFetchInputRows(routeRecoveryRows);
  const byCompetition = {};
  const byHost = {};
  const byFetchPurpose = {};

  for (const row of fetchInputRows) {
    byCompetition[row.competitionSlug] = (byCompetition[row.competitionSlug] || 0) + 1;
    byHost[row.expectedHost] = (byHost[row.expectedHost] || 0) + 1;
    byFetchPurpose[row.fetchPurpose] = (byFetchPurpose[row.fetchPurpose] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-fifa-official-route-probe-fetch-input-file",
    mode: "read_only_fifa_official_route_probe_fetch_input",
    generatedAt: new Date().toISOString(),
    date: asText(options.date),
    sourceRecoveryPlanJob: asText(input.job),
    summary: {
      routeRecoveryRowCount: routeRecoveryRows.length,
      fetchInputRowCount: fetchInputRows.length,
      competitionCount: Object.keys(byCompetition).length,
      hostCount: Object.keys(byHost).length,
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byCompetition,
      byHost,
      byFetchPurpose
    },
    fetchInputRows,
    nextStagePlan: {
      fetch: "run metadata-preserving scoped FIFA official route probe fetch only with --allow-fetch",
      extraction: "extract official schedule/date/group evidence from successful FIFA snapshots",
      truthReview: "promote activity/restart state only after official FIFA evidence validates competition and date window"
    },
    policy: {
      noSearch: true,
      noFetchInThisJob: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromThisPlan: true,
      fetchRequiresExplicitAllowFetch: true,
      routeProbeDoesNotEqualTruth: true,
      officialHostScopedOnly: true,
      noFixtureWrites: true,
      noResultWrites: true,
      noStandingWrites: true,
      noSourceReliabilityMutation: true,
      productionWrite: false,
      dryRun: true
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
    job: "self",
    routeRecoveryRows: [
      {
        routeRecoveryRowId: "fifa-official-route:001",
        competitionSlug: "fifa.world_cup",
        competitionName: "FIFA World Cup",
        tournamentKind: "mens_world_cup"
      },
      {
        routeRecoveryRowId: "fifa-official-route:002",
        competitionSlug: "fifa.club_world_cup",
        competitionName: "FIFA Club World Cup",
        tournamentKind: "mens_club_world_cup"
      }
    ]
  }, { date: "2026-06-12" });

  if (report.summary.fetchInputRowCount !== 12) throw new Error("expected 12 FIFA fetch input rows");
  if (report.summary.byCompetition["fifa.world_cup"] !== 6) throw new Error("expected 6 World Cup routes");
  if (report.summary.byCompetition["fifa.club_world_cup"] !== 6) throw new Error("expected 6 Club World Cup routes");
  if (report.summary.sourceFetch !== false) throw new Error("must not fetch in this job");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-fifa-official-route-probe-fetch-input-file",
      summary: report.summary,
      sampleFetchInputRows: report.fetchInputRows.slice(0, 4),
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildPlan(readJson(args.input), { date: args.date });
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
    job: "build-football-truth-fifa-official-route-probe-fetch-input-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}