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
  return Array.isArray(data?.rows) ? data.rows : [];
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

function firstParam(row, predicate) {
  return (row.providerParams || []).find(predicate) || null;
}

function paramsBy(row, predicate) {
  return (row.providerParams || []).filter(predicate);
}

function buildLeagueOfIrelandTasks(row) {
  const slug = asText(row.competitionSlug);

  const preferredTemplates = slug === "irl.1"
    ? ["full_fixture"]
    : ["sidebar_fixture", "sidebar_result", "full_fixture"];

  const params = paramsBy(row, (param) =>
    param.providerFamily === "leagueofireland_data_competition_widget" &&
    asText(param.competition) &&
    preferredTemplates.includes(asText(param.template))
  );

  const uniqueParams = [];
  const seen = new Set();

  for (const param of params) {
    const key = `${param.competition}|${param.template}|${param.bid}|${param.cid}|${param.limit}|${param.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueParams.push(param);
  }

  return uniqueParams.map((param, index) => ({
    taskId: `${slug}:leagueofireland:${index + 1}`,
    competitionSlug: slug,
    leagueSlug: slug,
    providerFamily: "leagueofireland_data_competition_widget",
    fetchPlanState: "ready_for_controlled_provider_fetch",
    fetchMode: "http_get_or_ajax_widget_endpoint_discovery_required",
    sourceUrl: asText(param.sourceUrl) || (row.urls || [])[0] || "",
    providerRequest: {
      method: "GET",
      endpointDiscovery: "derive_from_leagueofireland_widget_loader",
      requiredParams: {
        bid: asText(param.bid),
        cid: asText(param.cid),
        competition: asText(param.competition),
        limit: asText(param.limit || "20"),
        paginate: asText(param.paginate || "1"),
        template: asText(param.template),
        target: asText(param.target)
      }
    },
    acceptanceCriteria: {
      mustContainFixtureOrResultRows: true,
      mustContainCompetition: asText(param.competition),
      mustNotUseCanonicalWrites: true
    },
    evidence: {
      rawProviderParam: param
    }
  }));
}

function buildKsiTasks(row) {
  const slug = asText(row.competitionSlug);

  const param = firstParam(row, (item) =>
    item.providerFamily === "ksi_season_route" &&
    asText(item.name) === "besta" &&
    asText(item.season) === "2026"
  ) || firstParam(row, (item) =>
    item.providerFamily === "ksi_season_route" &&
    asText(item.name) &&
    asText(item.season) === "2026"
  );

  if (!param) return [];

  return [{
    taskId: `${slug}:ksi:1`,
    competitionSlug: slug,
    leagueSlug: slug,
    providerFamily: "ksi_season_route",
    fetchPlanState: "ready_for_controlled_provider_fetch",
    fetchMode: "http_get_existing_official_season_route",
    sourceUrl: asText(param.href),
    providerRequest: {
      method: "GET",
      url: asText(param.href),
      requiredParams: {
        name: asText(param.name),
        season: asText(param.season),
        pageSize: asText(param.pageSize || "10")
      }
    },
    acceptanceCriteria: {
      mustContainFixtureOrResultRows: true,
      mustContainSeason: "2026",
      mustNotUseCanonicalWrites: true
    },
    evidence: {
      rawProviderParam: param
    }
  }];
}

function buildSpflTasks(row) {
  const slug = asText(row.competitionSlug);

  const params = paramsBy(row, (param) =>
    param.providerFamily === "spfl_opta_widget" &&
    asText(param.widget) === "fixtures" &&
    asText(param.competition) &&
    asText(param.season)
  );

  const preferredCompetition =
    slug === "sco.1" ? "14" :
    slug === "sco.2" ? "91" :
    "";

  const preferred = params.find((param) => asText(param.competition) === preferredCompetition) || params[0];
  if (!preferred) return [];

  return [{
    taskId: `${slug}:spfl-opta:1`,
    competitionSlug: slug,
    leagueSlug: slug,
    providerFamily: "spfl_opta_widget",
    fetchPlanState: "ready_for_controlled_provider_fetch",
    fetchMode: "controlled_opta_widget_fetch_requires_explicit_allow_fetch",
    sourceUrl: asText(preferred.sourceUrl) || (row.urls || [])[0] || "",
    providerRequest: {
      method: "GET",
      endpointDiscovery: "derive_from_secure_widget_cloud_opta_v3_widget_attrs",
      widgetAttrs: {
        widget: "fixtures",
        competition: asText(preferred.competition),
        season: asText(preferred.season),
        matchStatus: asText(preferred.matchStatus || "fixture"),
        grouping: asText(preferred.grouping || "date"),
        dateFormat: asText(preferred.dateFormat || "dddd D MMMM YYYY")
      }
    },
    acceptanceCriteria: {
      mustContainFixtureRows: true,
      mustContainCompetition: asText(preferred.competition),
      mustContainSeason: asText(preferred.season),
      mustNotUseCanonicalWrites: true
    },
    evidence: {
      rawProviderParam: preferred
    }
  }];
}

function buildSportomediaTasks(row) {
  const slug = asText(row.competitionSlug);

  const gql = firstParam(row, (param) =>
    param.providerFamily === "sportomedia_graphql_widget" &&
    asText(param.gqlURI)
  );

  const page = firstParam(row, (param) =>
    param.providerFamily === "sportomedia_graphql_widget" &&
    asText(param.league) &&
    asText(param.season)
  );

  if (!gql || !page) return [];

  return [{
    taskId: `${slug}:sportomedia-graphql:1`,
    competitionSlug: slug,
    leagueSlug: slug,
    providerFamily: "sportomedia_graphql_widget",
    fetchPlanState: "ready_for_controlled_provider_fetch",
    fetchMode: "controlled_graphql_fetch_requires_explicit_allow_fetch",
    sourceUrl: asText(page.sourceUrl || gql.sourceUrl) || (row.urls || [])[0] || "",
    providerRequest: {
      method: "POST",
      url: asText(gql.gqlURI),
      endpointDiscovery: "use_discovered_gql_uri_and_page_data_league_season",
      variables: {
        league: asText(page.league),
        season: asText(page.season)
      },
      operationDiscovery: "derive_fixture_matches_query_from_site_bundle_or_graphql_introspection_if_allowed_later"
    },
    acceptanceCriteria: {
      mustContainFixtureRows: true,
      mustContainLeague: asText(page.league),
      mustContainSeason: asText(page.season),
      mustNotUseCanonicalWrites: true
    },
    evidence: {
      rawGqlParam: gql,
      rawPageParam: page
    }
  }];
}

function buildTasksForRow(row) {
  const providerFamily = asText(row.providerFamily);

  if (row.parameterState !== "provider_params_ready") {
    return [{
      taskId: `${asText(row.competitionSlug)}:blocked:missing-provider-params`,
      competitionSlug: asText(row.competitionSlug),
      leagueSlug: asText(row.competitionSlug),
      providerFamily,
      fetchPlanState: "blocked_missing_provider_params",
      fetchMode: "blocked_no_fetch",
      reason: "Provider param audit did not mark this row provider_params_ready."
    }];
  }

  if (providerFamily === "leagueofireland_data_competition_widget") return buildLeagueOfIrelandTasks(row);
  if (providerFamily === "ksi_season_route") return buildKsiTasks(row);
  if (providerFamily === "spfl_opta_widget") return buildSpflTasks(row);
  if (providerFamily === "sportomedia_graphql_widget") return buildSportomediaTasks(row);

  return [{
    taskId: `${asText(row.competitionSlug)}:blocked:unsupported-provider-family`,
    competitionSlug: asText(row.competitionSlug),
    leagueSlug: asText(row.competitionSlug),
    providerFamily,
    fetchPlanState: "blocked_unsupported_provider_family",
    fetchMode: "blocked_no_fetch",
    reason: `Unsupported provider family: ${providerFamily}`
  }];
}

function withGates(task) {
  return {
    ...task,
    gates: {
      requiresExplicitAllowFetchForExecution: true,
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
}

function buildReport({ paramAudit, targetDate }) {
  const inputRows = rowsOf(paramAudit);

  const fetchPlanRows = inputRows
    .flatMap((row) => buildTasksForRow(row))
    .map((row) => ({
      ...withGates(row),
      targetDate
    }));

  const readyRows = fetchPlanRows.filter((row) => row.fetchPlanState === "ready_for_controlled_provider_fetch");
  const blockedRows = fetchPlanRows.filter((row) => row.fetchPlanState !== "ready_for_controlled_provider_fetch");

  const summary = {
    targetDate,
    inputParamAuditRowCount: inputRows.length,
    fetchPlanRowCount: fetchPlanRows.length,
    readyFetchPlanRowCount: readyRows.length,
    blockedFetchPlanRowCount: blockedRows.length,
    readyCompetitionSlugCount: unique(readyRows.map((row) => row.competitionSlug)).length,
    readyCompetitionSlugs: unique(readyRows.map((row) => row.competitionSlug)),
    blockedCompetitionSlugs: unique(blockedRows.map((row) => row.competitionSlug)),
    byProviderFamily: countBy(fetchPlanRows, "providerFamily"),
    byFetchPlanState: countBy(fetchPlanRows, "fetchPlanState"),
    byFetchMode: countBy(fetchPlanRows, "fetchMode"),
    sourceFetch: false,
    noSearch: true,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  return {
    schema: "ai-matchlab.uefa-tier1-controlled-provider-fetch-plan.v1",
    job: "build-uefa-tier1-controlled-provider-fetch-plan-file",
    mode: "read_only_controlled_provider_fetch_plan_materializer",
    summary,
    fetchPlanRows,
    readyFetchPlanRows: readyRows,
    blockedRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyExistingProviderParamAudit: true,
      noProviderFetchPerformed: true,
      requiresExplicitAllowFetchForExecution: true,
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
  const paramAudit = {
    rows: [
      {
        competitionSlug: "irl.1",
        providerFamily: "leagueofireland_data_competition_widget",
        parameterState: "provider_params_ready",
        providerParams: [{
          providerFamily: "leagueofireland_data_competition_widget",
          sourceUrl: "https://example.test/fixtures",
          bid: "23256",
          cid: "337",
          competition: "1",
          limit: "20",
          paginate: "1",
          template: "full_fixture",
          target: ".fixture__items--23256"
        }]
      },
      {
        competitionSlug: "sco.1",
        providerFamily: "spfl_opta_widget",
        parameterState: "provider_params_ready",
        providerParams: [{
          providerFamily: "spfl_opta_widget",
          sourceUrl: "https://example.test/fixtures",
          widget: "fixtures",
          competition: "14",
          season: "2025",
          matchStatus: "fixture",
          grouping: "date",
          dateFormat: "dddd D MMMM YYYY"
        }]
      },
      {
        competitionSlug: "swe.1",
        providerFamily: "sportomedia_graphql_widget",
        parameterState: "provider_params_ready",
        providerParams: [
          {
            providerFamily: "sportomedia_graphql_widget",
            gqlURI: "https://gql.example.test/graphql"
          },
          {
            providerFamily: "sportomedia_graphql_widget",
            league: "allsvenskan",
            season: "2026"
          }
        ]
      }
    ]
  };

  const report = buildReport({ paramAudit, targetDate: "2026-06-09" });

  if (report.summary.inputParamAuditRowCount !== 3) {
    throw new Error(`Expected 3 input rows, got ${report.summary.inputParamAuditRowCount}`);
  }

  if (report.summary.blockedFetchPlanRowCount !== 0) {
    throw new Error(`Expected 0 blocked rows, got ${report.summary.blockedFetchPlanRowCount}`);
  }

  if (report.summary.readyCompetitionSlugCount !== 3) {
    throw new Error(`Expected 3 ready slugs, got ${report.summary.readyCompetitionSlugCount}`);
  }

  if (report.guarantees.sourceFetch !== false || report.guarantees.noFetch !== true) {
    throw new Error("Read-only fetch guarantees failed");
  }

  return {
    ok: true,
    selfTest: "build-uefa-tier1-controlled-provider-fetch-plan-file",
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

  const paramAuditPath = args["param-audit"];
  const outputPath = args.output;
  const targetDate = asText(args["target-date"] || args.date || "2026-06-09");

  if (!outputPath) throw new Error("--output is required");

  const paramAudit = readJson(paramAuditPath, "provider param audit");
  const report = buildReport({ paramAudit, targetDate });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    output: outputPath,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
