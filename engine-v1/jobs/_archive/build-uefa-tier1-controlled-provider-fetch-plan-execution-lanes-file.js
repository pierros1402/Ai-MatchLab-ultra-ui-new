import fs from "fs";
import path from "path";

function asText(value) {
  return String(value ?? "").trim();
}

function readJson(filePath, label) {
  if (!filePath) throw new Error(`${label} path is required`);
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return args;
}

function rowsOf(data) {
  return Array.isArray(data?.fetchPlanRows) ? data.fetchPlanRows : [];
}

function unique(values) {
  return [...new Set(values.map(asText).filter(Boolean))].sort();
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function laneFor(row) {
  const mode = asText(row.fetchMode);
  const provider = asText(row.providerFamily);
  const request = row.providerRequest || {};

  if (provider === "ksi_season_route" && request.method === "GET" && asText(request.url)) {
    return {
      executionLane: "direct_url_fetch_ready",
      nextAction: "run_controlled_get_snapshot_fetch_with_explicit_allow_fetch",
      reason: "Existing official KSI season route has a concrete GET URL."
    };
  }

  if (provider === "sportomedia_graphql_widget") {
    return {
      executionLane: "graphql_operation_discovery_required",
      nextAction: "discover_or_define_sportomedia_fixture_query_before_fetch",
      reason: "GraphQL endpoint and variables are known, but operation/query is not defined yet."
    };
  }

  if (provider === "spfl_opta_widget") {
    return {
      executionLane: "opta_widget_endpoint_discovery_required",
      nextAction: "derive_opta_widget_request_from_widget_attrs_or_fetch_widget_payload_with_explicit_allow_fetch",
      reason: "Opta widget attrs are known, but concrete widget endpoint/request is not materialized yet."
    };
  }

  if (provider === "leagueofireland_data_competition_widget") {
    return {
      executionLane: "leagueofireland_ajax_endpoint_discovery_required",
      nextAction: "derive_leagueofireland_ajax_endpoint_from_widget_loader_before_fetch",
      reason: "Widget params are known, but concrete AJAX endpoint is not materialized yet."
    };
  }

  return {
    executionLane: "manual_review_required",
    nextAction: "manual_provider_fetch_plan_review",
    reason: `Unsupported or incomplete fetch row: ${provider}/${mode}`
  };
}

function buildReport({ fetchPlan, targetDate }) {
  const inputRows = rowsOf(fetchPlan);

  const laneRows = inputRows.map((row) => {
    const lane = laneFor(row);

    return {
      taskId: row.taskId,
      competitionSlug: row.competitionSlug,
      leagueSlug: row.leagueSlug,
      targetDate,
      providerFamily: row.providerFamily,
      fetchMode: row.fetchMode,
      sourceUrl: row.sourceUrl,
      providerRequest: row.providerRequest,
      acceptanceCriteria: row.acceptanceCriteria,
      executionLane: lane.executionLane,
      nextAction: lane.nextAction,
      reason: lane.reason,
      gates: {
        ...(row.gates || {}),
        sourceFetch: false,
        noSearch: true,
        noFetch: true,
        noUrlFetch: true,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true,
        diagnosticOnly: true
      }
    };
  });

  const directUrlFetchReadyRows = laneRows.filter((row) => row.executionLane === "direct_url_fetch_ready");
  const endpointDiscoveryRequiredRows = laneRows.filter((row) => row.executionLane !== "direct_url_fetch_ready");

  const summary = {
    targetDate,
    inputFetchPlanRowCount: inputRows.length,
    laneRowCount: laneRows.length,
    byExecutionLane: countBy(laneRows, "executionLane"),
    byNextAction: countBy(laneRows, "nextAction"),
    directUrlReadyCount: directUrlFetchReadyRows.length,
    directUrlReadySlugs: unique(directUrlFetchReadyRows.map((row) => row.competitionSlug)),
    endpointDiscoveryRequiredCount: endpointDiscoveryRequiredRows.length,
    endpointDiscoveryRequiredSlugs: unique(endpointDiscoveryRequiredRows.map((row) => row.competitionSlug)),
    sourceFetch: false,
    noSearch: true,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  return {
    schema: "ai-matchlab.uefa-tier1-controlled-provider-fetch-plan-execution-lanes.v1",
    job: "build-uefa-tier1-controlled-provider-fetch-plan-execution-lanes-file",
    mode: "read_only_execution_lane_splitter_from_controlled_provider_fetch_plan",
    summary,
    rows: laneRows,
    directUrlFetchReadyRows,
    endpointDiscoveryRequiredRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyExistingControlledProviderFetchPlan: true,
      noProviderFetchPerformed: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function selfTest() {
  const fetchPlan = {
    fetchPlanRows: [
      {
        taskId: "isl.1:ksi:1",
        competitionSlug: "isl.1",
        leagueSlug: "isl.1",
        providerFamily: "ksi_season_route",
        fetchMode: "http_get_existing_official_season_route",
        sourceUrl: "https://www.ksi.is/oll-mot/?name=besta&season=2026&pageSize=10",
        providerRequest: {
          method: "GET",
          url: "https://www.ksi.is/oll-mot/?name=besta&season=2026&pageSize=10"
        }
      },
      {
        taskId: "swe.1:sportomedia-graphql:1",
        competitionSlug: "swe.1",
        leagueSlug: "swe.1",
        providerFamily: "sportomedia_graphql_widget",
        fetchMode: "controlled_graphql_fetch_requires_explicit_allow_fetch",
        providerRequest: {
          method: "POST",
          url: "https://gql.sportomedia.se/graphql",
          variables: {
            league: "allsvenskan",
            season: "2026"
          }
        }
      }
    ]
  };

  const report = buildReport({ fetchPlan, targetDate: "2026-06-09" });

  if (report.summary.laneRowCount !== 2) {
    throw new Error(`Expected 2 lane rows, got ${report.summary.laneRowCount}`);
  }

  if (report.summary.directUrlReadyCount !== 1) {
    throw new Error(`Expected 1 direct URL ready row, got ${report.summary.directUrlReadyCount}`);
  }

  if (report.summary.endpointDiscoveryRequiredCount !== 1) {
    throw new Error(`Expected 1 endpoint discovery row, got ${report.summary.endpointDiscoveryRequiredCount}`);
  }

  if (report.guarantees.sourceFetch !== false || report.guarantees.noFetch !== true) {
    throw new Error("Read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "build-uefa-tier1-controlled-provider-fetch-plan-execution-lanes-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args["self-test"]) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  const inputPath = args.input || args["fetch-plan"];
  const outputPath = args.output;
  const targetDate = asText(args["target-date"] || args.date || "2026-06-09");

  if (!outputPath) throw new Error("--output is required");

  const fetchPlan = readJson(inputPath, "controlled provider fetch plan");
  const report = buildReport({ fetchPlan, targetDate });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    output: outputPath,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
