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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function absolutizeAssetUrl(src) {
  const value = asText(src);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `https://www.fifa.com${value}`;
  return `https://www.fifa.com/${value}`;
}

function extractScriptSrcs(html) {
  const out = [];
  const matches = html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
  for (const match of matches) out.push(match[1]);
  return unique(out);
}

function extractHrefValues(html) {
  const out = [];
  const matches = html.matchAll(/href=["']([^"']+)["']/gi);
  for (const match of matches) out.push(match[1]);
  return unique(out);
}

function extractServiceApiUrls(html) {
  const out = [];

  const patterns = [
    /"SERVICE_API_URL"\s*:\s*"([^"]+)"/g,
    /SERVICE_API_URL['"]?\s*[:=]\s*["']([^"']+)["']/g
  ];

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) out.push(match[1]);
  }

  return unique(out);
}

function extractEnabledFeatures(html) {
  const out = [];
  const match = /"ENABLED_FEATURES"\s*:\s*"([^"]+)"/.exec(html);
  if (!match) return out;

  for (const feature of match[1].split(",")) {
    const cleaned = asText(feature);
    if (cleaned) out.push(cleaned);
  }

  return unique(out);
}

function routeTokenForCompetition(slug) {
  if (slug === "fifa.world_cup") return "canadamexicousa2026";
  if (slug === "fifa.club_world_cup") return "usa-2025";
  return "";
}

function tournamentSlugForCompetition(slug) {
  if (slug === "fifa.world_cup") return "worldcup";
  if (slug === "fifa.club_world_cup") return "club-world-cup";
  return "";
}

function buildSnapshotAuditRows(snapshots) {
  return snapshots.map((row) => {
    const html = asText(row.rawText);
    const scriptSrcs = extractScriptSrcs(html);
    const hrefValues = extractHrefValues(html);
    const serviceApiUrls = extractServiceApiUrls(html);
    const enabledFeatures = extractEnabledFeatures(html);

    return {
      fetchInputId: asText(row.fetchInputId),
      competitionSlug: asText(row.competitionSlug),
      leagueSlug: asText(row.leagueSlug || row.competitionSlug),
      fetchPurpose: asText(row.fetchPurpose),
      candidateUrl: asText(row.candidateUrl),
      finalUrl: asText(row.finalUrl),
      hostname: asText(row.hostname),
      status: row.status ?? row.httpStatus ?? null,
      contentType: asText(row.contentType),
      rawTextLength: html.length,
      plainTextLength: asText(row.plainText).length,
      serviceApiUrls,
      enabledFeatures,
      scriptSrcs: scriptSrcs.map(absolutizeAssetUrl),
      hrefValues,
      markerFlags: {
        hasServiceApiUrl: serviceApiUrls.length > 0,
        hasEnabledFeatures: enabledFeatures.length > 0,
        hasStaticMainBundle: scriptSrcs.some((src) => src.includes("/static/js/main.")),
        hasSmtBridge: scriptSrcs.some((src) => src.includes("smt-base-bridge")),
        hasMatchesToken: html.toLowerCase().includes("matches"),
        hasStandingsToken: html.toLowerCase().includes("standings"),
        hasGroupsToken: html.toLowerCase().includes("groups"),
        hasTournamentToken: html.toLowerCase().includes("tournament")
      }
    };
  });
}

function buildApiRecoveryRows(snapshotAuditRows) {
  const byCompetition = new Map();

  for (const row of snapshotAuditRows) {
    const slug = row.competitionSlug;
    if (!byCompetition.has(slug)) byCompetition.set(slug, []);
    byCompetition.get(slug).push(row);
  }

  const rows = [];

  for (const [competitionSlug, compRows] of byCompetition.entries()) {
    const serviceApiUrls = unique(compRows.flatMap((row) => row.serviceApiUrls));
    const scriptUrls = unique(compRows.flatMap((row) => row.scriptSrcs));
    const enabledFeatures = unique(compRows.flatMap((row) => row.enabledFeatures));
    const routeToken = routeTokenForCompetition(competitionSlug);
    const tournamentSlug = tournamentSlugForCompetition(competitionSlug);

    rows.push({
      apiRecoveryRowId: `fifa-js-api:${competitionSlug}`,
      competitionSlug,
      leagueSlug: competitionSlug,
      sourceFamily: "fifa_js_api_recovery",
      routeToken,
      tournamentSlug,
      serviceApiUrls,
      selectedServiceApiUrl: serviceApiUrls[0] || "",
      scriptUrls,
      selectedScriptUrls: scriptUrls.filter((src) => {
        return src.includes("/static/js/main.") || src.includes("smt-base-bridge");
      }),
      enabledFeatures,
      candidateEvidenceSignals: {
        hasServiceApiUrl: serviceApiUrls.length > 0,
        hasStaticMainBundle: scriptUrls.some((src) => src.includes("/static/js/main.")),
        hasStandingsFeature: enabledFeatures.some((feature) => feature.toLowerCase().includes("standings")),
        hasMatchRailFeature: enabledFeatures.some((feature) => feature.toLowerCase().includes("matchrail")),
        routeTokenFoundInFetchedUrls: compRows.some((row) => row.finalUrl.includes(routeToken) || row.candidateUrl.includes(routeToken))
      },
      requiredNextEvidence: {
        fetchStaticJsOrApiMetadata: true,
        discoverConcreteApiEndpoints: true,
        verifyCompetitionIdentity: true,
        extractOfficialMatchScheduleOrTournamentDateWindow: true,
        secondaryReferenceAllowedForComparisonOnly: true
      },
      nextRequiredAction: "build_fifa_js_asset_or_api_probe_fetch_input_read_only",
      writePolicy: {
        noCanonicalWriteFromThisPlan: true,
        noFixtureWrites: true,
        noResultWrites: true,
        noStandingWrites: true,
        noSourceReliabilityMutation: true
      },
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    });
  }

  return rows.sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));
}

function buildPlan(input, options = {}) {
  const snapshots = asArray(input.fetchedSourceSnapshots);
  if (!snapshots.length) throw new Error("No fetchedSourceSnapshots found in input.");

  const snapshotAuditRows = buildSnapshotAuditRows(snapshots);
  const apiRecoveryRows = buildApiRecoveryRows(snapshotAuditRows);

  const serviceApiUrls = unique(snapshotAuditRows.flatMap((row) => row.serviceApiUrls));
  const scriptUrls = unique(snapshotAuditRows.flatMap((row) => row.scriptSrcs));
  const enabledFeatures = unique(snapshotAuditRows.flatMap((row) => row.enabledFeatures));

  return {
    ok: true,
    job: "build-football-truth-fifa-js-api-recovery-plan-file",
    mode: "read_only_fifa_js_api_recovery_plan",
    generatedAt: new Date().toISOString(),
    date: asText(options.date),
    sourceSnapshotJob: asText(input.job),
    summary: {
      inputSnapshotCount: snapshots.length,
      snapshotAuditRowCount: snapshotAuditRows.length,
      apiRecoveryRowCount: apiRecoveryRows.length,
      serviceApiUrlCount: serviceApiUrls.length,
      scriptUrlCount: scriptUrls.length,
      selectedScriptUrlCount: unique(apiRecoveryRows.flatMap((row) => row.selectedScriptUrls)).length,
      enabledFeatureCount: enabledFeatures.length,
      plainTextZeroCount: snapshotAuditRows.filter((row) => row.plainTextLength === 0).length,
      rawHtmlShellCount: snapshotAuditRows.filter((row) => row.rawTextLength > 0).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      serviceApiUrls
    },
    snapshotAuditRows,
    apiRecoveryRows,
    extractedConfig: {
      serviceApiUrls,
      selectedServiceApiUrl: serviceApiUrls[0] || "",
      selectedScriptUrls: unique(apiRecoveryRows.flatMap((row) => row.selectedScriptUrls)),
      enabledFeatures
    },
    nextStagePlan: {
      jsAssetProbe: "fetch selected FIFA app/static JS assets only after explicit allow-fetch",
      apiDiscovery: "inspect JS/API metadata for concrete official schedule, matches, groups or standings endpoints",
      truthReview: "do not promote FIFA activity/restart state until official API or embedded data validates dates and competition identity"
    },
    policy: {
      noSearch: true,
      noFetchInThisJob: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromThisPlan: true,
      fifaHtmlShellDoesNotEqualTruth: true,
      serviceApiUrlDoesNotEqualEndpointTruth: true,
      explicitAllowFetchRequiredForNextProbe: true,
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
  const html = '<html><script>window["fp.env"]={"SERVICE_API_URL":"https://cxm-api.fifa.com/fifaplusweb/api","ENABLED_FEATURES":"FIFA20Standings,FIFA20MatchRail"}</script><script src="/static/js/main.abc.js"></script></html>';

  const report = buildPlan({
    job: "self",
    fetchedSourceSnapshots: [
      {
        fetchInputId: "fifa.world_cup:fifa-official-probe:001",
        competitionSlug: "fifa.world_cup",
        leagueSlug: "fifa.world_cup",
        fetchPurpose: "official_tournament_home_probe",
        candidateUrl: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026",
        finalUrl: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026",
        hostname: "www.fifa.com",
        status: 200,
        contentType: "text/html",
        rawText: html,
        plainText: ""
      }
    ]
  }, { date: "2026-06-12" });

  if (report.summary.apiRecoveryRowCount !== 1) throw new Error("expected one API recovery row");
  if (report.summary.serviceApiUrlCount !== 1) throw new Error("expected one service API URL");
  if (report.extractedConfig.selectedServiceApiUrl !== "https://cxm-api.fifa.com/fifaplusweb/api") {
    throw new Error("service API URL extraction failed");
  }
  if (report.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-fifa-js-api-recovery-plan-file",
      summary: report.summary,
      apiRecoveryRows: report.apiRecoveryRows,
      extractedConfig: report.extractedConfig,
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
    extractedConfig: report.extractedConfig,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-fifa-js-api-recovery-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}