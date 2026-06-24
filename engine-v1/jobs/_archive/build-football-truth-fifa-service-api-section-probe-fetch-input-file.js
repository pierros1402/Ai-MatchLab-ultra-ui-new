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

function safeUrlJoin(baseUrl, relativePath) {
  const base = asText(baseUrl).replace(/\/+$/u, "");
  const rel = asText(relativePath).replace(/^\/+/u, "");
  return `${base}/${rel}`;
}

function withLocale(url, locale = "en") {
  const parsed = new URL(url);
  parsed.searchParams.set("locale", locale);
  return parsed.toString();
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(asText).filter(Boolean))];
}

function candidateEntryIdsForRecoveryRow(row) {
  const competitionSlug = asText(row.competitionSlug || row.leagueSlug);
  const routeToken = asText(row.routeToken);
  const seasonToken = asText(row.seasonToken);
  const tournamentSlug = asText(row.tournamentSlug);

  const candidates = [];

  if (competitionSlug === "fifa.club_world_cup") {
    candidates.push("club-world-cup");
    candidates.push("usa-2025");
    candidates.push("club-world-cup-usa-2025");
    candidates.push("fifa-club-world-cup-2025");
  }

  if (competitionSlug === "fifa.world_cup") {
    candidates.push("worldcup");
    candidates.push("canadamexicousa2026");
    candidates.push("worldcup-canadamexicousa2026");
    candidates.push("fifa-world-cup-2026");
  }

  candidates.push(routeToken);
  candidates.push(seasonToken);
  candidates.push(tournamentSlug);

  return unique(candidates);
}

function buildPlan(input, options = {}) {
  const serviceApiBase =
    asArray(input.serviceApiUrls)[0] ||
    asText(input?.summary?.serviceApiUrls?.[0]) ||
    "https://cxm-api.fifa.com/fifaplusweb/api";

  const recoveryRows = asArray(input.apiRecoveryRows);
  if (!recoveryRows.length) throw new Error("No apiRecoveryRows found in FIFA JS/API recovery plan.");

  const fetchInputRows = [];
  const candidateEntryIdRows = [];

  for (const row of recoveryRows) {
    const competitionSlug = asText(row.competitionSlug || row.leagueSlug);
    const routeToken = asText(row.routeToken);
    const seasonToken = asText(row.seasonToken);
    const tournamentSlug = asText(row.tournamentSlug);
    const candidateEntryIds = candidateEntryIdsForRecoveryRow(row);

    for (const candidateEntryId of candidateEntryIds) {
      candidateEntryIdRows.push({
        competitionSlug,
        candidateEntryId,
        routeToken,
        seasonToken,
        tournamentSlug,
        candidateSource: "route_token_or_season_token_hypothesis",
        candidateTruthState: "hypothesis_only_not_truth",
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });

      const sectionUrl = withLocale(
        safeUrlJoin(serviceApiBase, `/sections/competitionSeasonSummary/${candidateEntryId}`),
        "en"
      );

      const dataUrl = withLocale(
        safeUrlJoin(serviceApiBase, `/data/competitionSeasonSummaryData/${candidateEntryId}`),
        "en"
      );

      fetchInputRows.push({
        fetchInputId: `fifa-service-section:${String(fetchInputRows.length + 1).padStart(3, "0")}`,
        competitionSlug,
        leagueSlug: competitionSlug,
        sourceFamily: "fifa_service_api_section_probe",
        serviceApiBase,
        candidateEntryId,
        candidateUrl: sectionUrl,
        expectedHost: "cxm-api.fifa.com",
        fetchPurpose: "competition_season_summary_section_probe",
        expectedRouteToken: routeToken,
        expectedSeasonToken: seasonToken,
        expectedTournamentSlug: tournamentSlug,
        probePolicy: {
          explicitAllowFetchRequired: true,
          sectionProbeOnly: true,
          candidateEntryIdIsHypothesisOnly: true,
          responseMustContainCompetitionSeasonSummaryShape: true,
          responseDoesNotEqualTruthUntilValidated: true,
          noCanonicalWriteFromProbeInput: true
        },
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });

      fetchInputRows.push({
        fetchInputId: `fifa-service-section:${String(fetchInputRows.length + 1).padStart(3, "0")}`,
        competitionSlug,
        leagueSlug: competitionSlug,
        sourceFamily: "fifa_service_api_section_probe",
        serviceApiBase,
        candidateEntryId,
        candidateUrl: dataUrl,
        expectedHost: "cxm-api.fifa.com",
        fetchPurpose: "competition_season_summary_data_probe",
        expectedRouteToken: routeToken,
        expectedSeasonToken: seasonToken,
        expectedTournamentSlug: tournamentSlug,
        probePolicy: {
          explicitAllowFetchRequired: true,
          dataProbeOnly: true,
          candidateEntryIdIsHypothesisOnly: true,
          responseMustContainStatsAndInfoShape: true,
          responseDoesNotEqualTruthUntilValidated: true,
          noCanonicalWriteFromProbeInput: true
        },
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
    }
  }

  const byCompetition = {};
  const byPurpose = {};
  for (const row of fetchInputRows) {
    byCompetition[row.competitionSlug] = (byCompetition[row.competitionSlug] || 0) + 1;
    byPurpose[row.fetchPurpose] = (byPurpose[row.fetchPurpose] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-fifa-service-api-section-probe-fetch-input-file",
    mode: "read_only_fifa_service_api_section_probe_fetch_input",
    generatedAt: new Date().toISOString(),
    date: asText(options.date),
    sourceRecoveryPlanJob: asText(input.job),
    summary: {
      recoveryRowCount: recoveryRows.length,
      candidateEntryIdRowCount: candidateEntryIdRows.length,
      fetchInputRowCount: fetchInputRows.length,
      serviceApiBase,
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byCompetition,
      byPurpose
    },
    candidateEntryIdRows,
    fetchInputRows,
    nextStagePlan: {
      gatedFetch: "run scoped metadata-preserving fetch with --allow-fetch only after explicit approval",
      review: "accept only 200 JSON responses with competitionSeasonSummary or competitionSeasonSummaryData shape",
      reject: "404, HTML shell, empty response, or generic config response",
      truthExtraction: "no activity/restart/fixture truth promotion from probe response until shape and competition identity are validated"
    },
    policy: {
      noSearchProvider: true,
      noFetchInThisJob: true,
      noUrlFetch: true,
      candidateEntryIdIsHypothesisOnly: true,
      explicitAllowFetchRequiredForNextProbe: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noResultWrites: true,
      noStandingWrites: true,
      noSourceReliabilityMutation: true,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noSearchProvider: true,
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
    serviceApiUrls: ["https://cxm-api.fifa.com/fifaplusweb/api"],
    apiRecoveryRows: [
      {
        competitionSlug: "fifa.club_world_cup",
        routeToken: "usa-2025",
        tournamentSlug: "club-world-cup"
      },
      {
        competitionSlug: "fifa.world_cup",
        routeToken: "canadamexicousa2026",
        tournamentSlug: "worldcup"
      }
    ]
  }, { date: "2026-06-12" });

  if (report.summary.recoveryRowCount !== 2) throw new Error("expected 2 recovery rows");
  if (report.summary.candidateEntryIdRowCount < 6) throw new Error("expected candidate entry ids");
  if (report.summary.fetchInputRowCount !== report.summary.candidateEntryIdRowCount * 2) throw new Error("expected section and data probes per candidate");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-fifa-service-api-section-probe-fetch-input-file",
      summary: report.summary,
      fetchInputRows: report.fetchInputRows.slice(0, 12),
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
    fetchInputRows: report.fetchInputRows.slice(0, 20),
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-fifa-service-api-section-probe-fetch-input-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}
