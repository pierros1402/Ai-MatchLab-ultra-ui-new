#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE =
  "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09";

const DEFAULT_INPUT = path.join(
  DEFAULT_BASE,
  "uefa-tier1-controlled-provider-fetch-plan-execution-lanes-from-source-job-2026-06-09.json"
);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input") {
      args.input = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--output") {
      args.output = argv[index + 1] || "";
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.input) throw new Error("Missing required --input");
  if (!args.output) throw new Error("Missing required --output");

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function unique(values) {
  return [...new Set(values.map(asText).filter(Boolean))].sort();
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireZero(value, label) {
  if (value !== 0) {
    throw new Error(`${label}: expected 0, got ${JSON.stringify(value)}`);
  }
}

function providerRequest(row) {
  return row?.providerRequest || {};
}

function requiredParams(row) {
  return providerRequest(row).requiredParams || {};
}

function widgetAttrs(row) {
  return providerRequest(row).widgetAttrs || {};
}

function variables(row) {
  return providerRequest(row).variables || {};
}

function hasLoiExecutableParams(row) {
  const params = requiredParams(row);

  return Boolean(
    asText(params.bid) &&
      asText(params.cid) &&
      asText(params.competition) &&
      asText(params.template) &&
      asText(params.target)
  );
}

function loiTask(row, index) {
  const params = requiredParams(row);

  return {
    taskId: `${row.leagueSlug}:leagueofireland:${asText(params.template)}:${asText(params.bid) || "missing_bid"}:${index}`,
    competitionSlug: asText(row.leagueSlug),
    providerFamily: asText(row.providerFamily),
    executionLane: asText(row.executionLane),
    sourceUrl: asText(row.sourceUrl),
    discoveryMethod: "derive_ajax_endpoint_from_leagueofireland_widget_loader",
    method: "GET",
    readiness: hasLoiExecutableParams(row)
      ? "source_page_fetch_then_ajax_endpoint_derivation_ready"
      : "blocked_missing_bid_or_cid_in_widget_params",
    requiredParams: {
      bid: asText(params.bid),
      cid: asText(params.cid),
      competition: asText(params.competition),
      limit: asText(params.limit),
      paginate: asText(params.paginate),
      template: asText(params.template),
      target: asText(params.target),
    },
    nextAction: hasLoiExecutableParams(row)
      ? "controlled_fetch_source_page_and_extract_widget_loader_ajax_endpoint"
      : "ignore_incomplete_duplicate_unless_source_page_reconfirms_missing_ids",
    sourceFetchRequiredLater: hasLoiExecutableParams(row),
    noSearchRequired: true,
  };
}

function spflTask(row) {
  const attrs = widgetAttrs(row);

  return {
    taskId: `${row.leagueSlug}:spfl:opta:competition:${asText(attrs.competition)}:season:${asText(attrs.season)}`,
    competitionSlug: asText(row.leagueSlug),
    providerFamily: asText(row.providerFamily),
    executionLane: asText(row.executionLane),
    sourceUrl: asText(row.sourceUrl),
    discoveryMethod: "derive_opta_widget_request_from_secure_widget_cloud_opta_attrs",
    method: "GET",
    readiness: "widget_attrs_available_endpoint_derivation_required",
    widgetAttrs: {
      widget: asText(attrs.widget),
      competition: asText(attrs.competition),
      season: asText(attrs.season),
      matchStatus: asText(attrs.matchStatus),
      grouping: asText(attrs.grouping),
      dateFormat: asText(attrs.dateFormat),
    },
    nextAction: "controlled_fetch_source_page_or_widget_payload_to_resolve_opta_endpoint",
    sourceFetchRequiredLater: true,
    noSearchRequired: true,
  };
}

function sportomediaTask(row) {
  const request = providerRequest(row);
  const vars = variables(row);

  return {
    taskId: `${row.leagueSlug}:sportomedia:gql:${asText(vars.league)}:${asText(vars.season)}`,
    competitionSlug: asText(row.leagueSlug),
    providerFamily: asText(row.providerFamily),
    executionLane: asText(row.executionLane),
    sourceUrl: asText(row.sourceUrl),
    discoveryMethod: "define_or_discover_sportomedia_fixture_graphql_operation",
    method: "POST",
    graphqlUrl: asText(request.url),
    readiness: "graphql_endpoint_and_variables_available_operation_discovery_required",
    variables: {
      league: asText(vars.league),
      season: asText(vars.season),
    },
    nextAction: "controlled_fetch_site_bundle_or_define_fixture_matches_query_before_post",
    sourceFetchRequiredLater: true,
    noSearchRequired: true,
  };
}

function buildOutput(input) {
  const rows = asArray(input.rows);
  requireEqual(rows.length, 11, "input rows.length");

  const nonKsiRows = rows.filter((row) => asText(row.leagueSlug) !== "isl.1");
  requireEqual(nonKsiRows.length, 10, "non-KSI rows.length");

  const slugs = unique(nonKsiRows.map((row) => row.leagueSlug));
  requireEqual(JSON.stringify(slugs), JSON.stringify(["irl.1", "irl.2", "sco.1", "sco.2", "swe.1", "swe.2"]), "endpoint discovery slugs");

  const providerCounts = countBy(nonKsiRows, "providerFamily");
  requireEqual(providerCounts.leagueofireland_data_competition_widget, 6, "LOI provider row count");
  requireEqual(providerCounts.spfl_opta_widget, 2, "SPFL provider row count");
  requireEqual(providerCounts.sportomedia_graphql_widget, 2, "Sportomedia provider row count");

  const loiRows = nonKsiRows.filter((row) => row.providerFamily === "leagueofireland_data_competition_widget");
  const spflRows = nonKsiRows.filter((row) => row.providerFamily === "spfl_opta_widget");
  const sportomediaRows = nonKsiRows.filter((row) => row.providerFamily === "sportomedia_graphql_widget");

  const loiDiscoveryRows = loiRows.map(loiTask);
  const spflDiscoveryRows = spflRows.map(spflTask);
  const sportomediaDiscoveryRows = sportomediaRows.map(sportomediaTask);

  const discoveryRows = [
    ...loiDiscoveryRows,
    ...spflDiscoveryRows,
    ...sportomediaDiscoveryRows,
  ];

  const executableDiscoveryRows = discoveryRows.filter((row) => row.sourceFetchRequiredLater === true);
  const blockedOrIncompleteRows = discoveryRows.filter((row) => row.sourceFetchRequiredLater !== true);

  requireEqual(discoveryRows.length, 10, "discoveryRows.length");
  requireEqual(executableDiscoveryRows.length, 7, "executableDiscoveryRows.length");
  requireEqual(blockedOrIncompleteRows.length, 3, "blockedOrIncompleteRows.length");

  requireZero(input?.summary?.canonicalWrites, "input summary.canonicalWrites");
  requireEqual(input?.summary?.productionWrite, false, "input summary.productionWrite");

  return {
    ok: true,
    job: "build-uefa-tier1-provider-endpoint-discovery-plan-file",
    mode: "read_only_provider_endpoint_discovery_planning",
    generatedAt: new Date().toISOString(),
    schema: {
      name: "uefa_tier1_provider_endpoint_discovery_plan",
      version: 1,
    },
    summary: {
      inputLaneRowCount: rows.length,
      endpointDiscoveryInputRowCount: nonKsiRows.length,
      endpointDiscoverySlugCount: slugs.length,
      endpointDiscoverySlugs: slugs,
      discoveryRowCount: discoveryRows.length,
      executableDiscoveryRowCount: executableDiscoveryRows.length,
      blockedOrIncompleteDiscoveryRowCount: blockedOrIncompleteRows.length,
      byProviderFamily: providerCounts,
      byExecutionLane: countBy(nonKsiRows, "executionLane"),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
    },
    discoveryRows,
    executableDiscoveryRows,
    blockedOrIncompleteRows,
    providerBatches: [
      {
        providerFamily: "leagueofireland_data_competition_widget",
        slugs: unique(loiRows.map((row) => row.leagueSlug)),
        rowCount: loiRows.length,
        executableRowCount: loiDiscoveryRows.filter((row) => row.sourceFetchRequiredLater === true).length,
        nextAction: "controlled_fetch_unique_LOI_source_pages_then_derive_ajax_endpoint_from_widget_loader",
      },
      {
        providerFamily: "spfl_opta_widget",
        slugs: unique(spflRows.map((row) => row.leagueSlug)),
        rowCount: spflRows.length,
        executableRowCount: spflDiscoveryRows.length,
        nextAction: "controlled_fetch_SPFL_source_pages_or_widget_payloads_then_derive_opta_endpoint",
      },
      {
        providerFamily: "sportomedia_graphql_widget",
        slugs: unique(sportomediaRows.map((row) => row.leagueSlug)),
        rowCount: sportomediaRows.length,
        executableRowCount: sportomediaDiscoveryRows.length,
        nextAction: "controlled_fetch_site_bundle_or_define_graphql_fixture_operation_for_two_leagues",
      },
    ],
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyExistingLocalDiagnostics: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true,
    },
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const output = buildOutput(input);

  writeJson(args.output, output);

  console.log(
    JSON.stringify(
      {
        ok: output.ok,
        output: args.output,
        summary: output.summary,
        providerBatches: output.providerBatches,
        guarantees: output.guarantees,
      },
      null,
      2
    )
  );
}

main();
