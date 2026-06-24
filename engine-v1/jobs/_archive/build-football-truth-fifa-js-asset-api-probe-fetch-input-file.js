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
  return [...new Set(values.filter(Boolean).map(asText).filter(Boolean))];
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function buildFetchInputRows(input) {
  const rows = [];
  const extracted = input.extractedConfig || {};
  const scriptUrls = unique(extracted.selectedScriptUrls || []);
  const serviceApiUrls = unique(extracted.serviceApiUrls || []);

  scriptUrls.forEach((url, index) => {
    rows.push({
      fetchInputId: `fifa-js-asset:${String(index + 1).padStart(3, "0")}`,
      competitionSlug: "fifa.shared",
      leagueSlug: "fifa.shared",
      sourceFamily: "fifa_js_api_recovery",
      candidateUrl: url,
      expectedHost: hostOf(url),
      fetchPurpose: url.includes("main.") ? "fifa_static_main_bundle_probe" : "fifa_bridge_script_probe",
      assetRole: url.includes("main.") ? "main_app_bundle" : "bridge_or_runtime_asset",
      probePolicy: {
        explicitAllowFetchRequired: true,
        assetProbeDoesNotEqualTruth: true,
        endpointDiscoveryOnly: true,
        noCanonicalWriteFromProbeInput: true
      },
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    });
  });

  serviceApiUrls.forEach((url, index) => {
    rows.push({
      fetchInputId: `fifa-service-api-base:${String(index + 1).padStart(3, "0")}`,
      competitionSlug: "fifa.shared",
      leagueSlug: "fifa.shared",
      sourceFamily: "fifa_js_api_recovery",
      candidateUrl: url,
      expectedHost: hostOf(url),
      fetchPurpose: "fifa_service_api_base_probe",
      assetRole: "service_api_base_not_truth_endpoint",
      probePolicy: {
        explicitAllowFetchRequired: true,
        serviceApiBaseDoesNotEqualTruthEndpoint: true,
        endpointDiscoveryOnly: true,
        noCanonicalWriteFromProbeInput: true
      },
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    });
  });

  return rows;
}

function buildPlan(input, options = {}) {
  const fetchInputRows = buildFetchInputRows(input);

  const byHost = {};
  const byPurpose = {};
  for (const row of fetchInputRows) {
    byHost[row.expectedHost] = (byHost[row.expectedHost] || 0) + 1;
    byPurpose[row.fetchPurpose] = (byPurpose[row.fetchPurpose] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-fifa-js-asset-api-probe-fetch-input-file",
    mode: "read_only_fifa_js_asset_api_probe_fetch_input",
    generatedAt: new Date().toISOString(),
    date: asText(options.date),
    sourceRecoveryPlanJob: asText(input.job),
    summary: {
      fetchInputRowCount: fetchInputRows.length,
      hostCount: Object.keys(byHost).length,
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byHost,
      byPurpose
    },
    fetchInputRows,
    nextStagePlan: {
      fetch: "run metadata-preserving scoped fetch with --allow-fetch",
      inspect: "search fetched JS/API text for concrete FIFA endpoint paths and query shapes",
      truthReview: "no activity/restart truth until endpoint output validates competition identity and dates"
    },
    policy: {
      noSearch: true,
      noFetchInThisJob: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromThisPlan: true,
      serviceApiBaseDoesNotEqualTruthEndpoint: true,
      jsAssetDoesNotEqualTruth: true,
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
  const report = buildPlan({
    job: "self",
    extractedConfig: {
      serviceApiUrls: ["https://cxm-api.fifa.com/fifaplusweb/api"],
      selectedScriptUrls: [
        "https://www.fifa.com/smt-base-bridge.min.js?v=x",
        "https://www.fifa.com/static/js/main.abc.js"
      ]
    }
  }, { date: "2026-06-12" });

  if (report.summary.fetchInputRowCount !== 3) throw new Error("expected 3 fetch input rows");
  if (report.summary.byHost["www.fifa.com"] !== 2) throw new Error("expected 2 www.fifa.com rows");
  if (report.summary.byHost["cxm-api.fifa.com"] !== 1) throw new Error("expected 1 cxm-api row");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-fifa-js-asset-api-probe-fetch-input-file",
      summary: report.summary,
      fetchInputRows: report.fetchInputRows,
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
    job: "build-football-truth-fifa-js-asset-api-probe-fetch-input-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}