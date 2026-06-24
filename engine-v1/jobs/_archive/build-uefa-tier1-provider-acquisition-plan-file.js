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

function indexBySlug(rows) {
  const out = new Map();

  for (const row of rows) {
    const slug = asText(row.slug || row.competitionSlug || row.leagueSlug);
    if (!slug) continue;
    out.set(slug, row);
  }

  return out;
}

function inferProviderFamily(row) {
  const hosts = unique(row.hosts || []);
  const bySignal = row.bySignal || {};
  const joinedHosts = hosts.join(",");

  if (bySignal.loi_data_competition_widget || joinedHosts.includes("leagueofireland.ie")) {
    return "leagueofireland_data_competition_widget";
  }

  if (bySignal.ksi_season_link || joinedHosts.includes("ksi.is")) {
    return "ksi_season_route";
  }

  if (bySignal.spfl_opta_widget || joinedHosts.includes("spfl.co.uk")) {
    return "spfl_opta_widget";
  }

  if (bySignal.sef_graphql_endpoint || joinedHosts.includes("allsvenskan.se") || joinedHosts.includes("superettan.se")) {
    return "sportomedia_graphql_widget";
  }

  if (joinedHosts.includes("uefa.com")) {
    return "uefa_match_listing_payload";
  }

  if (joinedHosts.includes("superliga.dk") || joinedHosts.includes("dbu.dk")) {
    return "dbu_superliga_nuxt_payload";
  }

  if (joinedHosts.includes("eredivisie.nl")) {
    return "eredivisie_route_manual_review";
  }

  if (joinedHosts.includes("obos-ligaen.no")) {
    return "obos_ligaen_route_manual_review";
  }

  if (joinedHosts.includes("2liga.at")) {
    return "austrian_2liga_route_manual_review";
  }

  return hosts[0] || "unknown_provider";
}

function normalizeProviderAwareState(row) {
  return asText(row?.providerAwareDecision?.classifierInputState);
}

function normalizeStrictDecision(row) {
  return asText(row?.finalDecision);
}

function decidePlanState(providerAwareRow, strictRow) {
  const providerAwareState = normalizeProviderAwareState(providerAwareRow);
  const strictDecision = normalizeStrictDecision(strictRow);

  if (providerAwareState === "structured_fixture_calendar_ready") {
    return {
      planState: "local_structured_fixture_calendar_ready",
      recommendedNextAction: "classify_season_state_from_local_structured_fixture_calendar",
      executionMode: "no_fetch_local_classification_candidate",
      reason: providerAwareRow?.providerAwareDecision?.reason || "Structured fixture calendar exists in local extracted evidence."
    };
  }

  if (providerAwareState === "usable_date_range_ready") {
    return {
      planState: "local_usable_date_range_ready",
      recommendedNextAction: "classify_season_state_from_local_usable_provider_date_range",
      executionMode: "no_fetch_local_classification_candidate",
      reason: providerAwareRow?.providerAwareDecision?.reason || "Usable provider-aware date range exists in local snapshot evidence."
    };
  }

  if (providerAwareState === "single_usable_date_review") {
    return {
      planState: "local_single_date_review",
      recommendedNextAction: "review_single_date_then_classify_competition_specific_state",
      executionMode: "no_fetch_local_review_candidate",
      reason: providerAwareRow?.providerAwareDecision?.reason || "Single usable date exists and needs competition-specific interpretation."
    };
  }

  if (strictDecision === "provider_api_or_widget_acquisition_needed") {
    return {
      planState: "controlled_provider_api_or_widget_fetch_plan_required",
      recommendedNextAction: "build_controlled_provider_api_or_widget_fetch_plan",
      executionMode: "controlled_fetch_plan_only_requires_explicit_allow_fetch_later",
      reason: "Existing local HTML exposes provider/widget/API configuration but not full local fixture dates."
    };
  }

  if (strictDecision === "local_payload_date_parser_candidate") {
    return {
      planState: "local_payload_parser_review_required",
      recommendedNextAction: "review_or_build_provider_specific_local_payload_parser_before_classification",
      executionMode: "no_fetch_local_parser_review_candidate",
      reason: "Strict carrier audit found payload-like local content, but it still needs provider-specific parsing/rejection before state classification."
    };
  }

  return {
    planState: "manual_provider_route_review_required",
    recommendedNextAction: "manual_provider_route_review_or_new_controlled_discovery",
    executionMode: "blocked_no_fetch",
    reason: "No structured local fixture evidence and no actionable provider API/widget carrier was confirmed."
  };
}

function buildPlan({ providerAware, strictProvider, targetDate }) {
  const providerAwareRows = rowsOf(providerAware);
  const strictRows = rowsOf(strictProvider);

  const providerAwareBySlug = indexBySlug(providerAwareRows);
  const strictBySlug = indexBySlug(strictRows);

  const slugs = unique([
    ...providerAwareBySlug.keys(),
    ...strictBySlug.keys()
  ]);

  const planRows = slugs.map((slug) => {
    const providerAwareRow = providerAwareBySlug.get(slug) || null;
    const strictRow = strictBySlug.get(slug) || null;
    const decision = decidePlanState(providerAwareRow, strictRow);

    const providerAwareDecision = providerAwareRow?.providerAwareDecision || {};
    const hosts = unique(strictRow?.hosts || providerAwareRow?.hosts || []);
    const urls = unique(strictRow?.urls || providerAwareRow?.urls || []);

    const row = {
      competitionSlug: slug,
      leagueSlug: slug,
      targetDate,
      planState: decision.planState,
      recommendedNextAction: decision.recommendedNextAction,
      executionMode: decision.executionMode,
      providerFamily: inferProviderFamily(strictRow || providerAwareRow || {}),
      providerAwareInputState: normalizeProviderAwareState(providerAwareRow),
      strictProviderDecision: normalizeStrictDecision(strictRow),
      hosts,
      urls,
      reason: decision.reason,
      localEvidence: {
        usableUniqueDateCount: Number(providerAwareDecision.usableUniqueDateCount || 0),
        firstUsableDate: asText(providerAwareDecision.firstUsableDate),
        lastUsableDate: asText(providerAwareDecision.lastUsableDate),
        rejectedUniqueDateCount: Number(providerAwareDecision.rejectedUniqueDateCount || 0),
        structuredFixtureRowCount: Array.isArray(providerAwareRow?.structuredFixtureRows)
          ? providerAwareRow.structuredFixtureRows.reduce((sum, item) => sum + Number(item.parsedFixtureRowCount || 0), 0)
          : 0,
        usableDateSamples: (providerAwareDecision.usableDateSamples || []).slice(0, 5),
        rejectedDateSamples: (providerAwareDecision.rejectedDateSamples || []).slice(0, 3)
      },
      providerCarrierEvidence: {
        realDatePayloadCount: Number(strictRow?.realDatePayloadCount || 0),
        apiOrWidgetConfigCount: Number(strictRow?.apiOrWidgetConfigCount || 0),
        bySignal: strictRow?.bySignal || {},
        realDatePayloadSamples: (strictRow?.realDatePayloadSamples || []).slice(0, 5),
        apiOrWidgetConfigSamples: (strictRow?.apiOrWidgetConfigSamples || []).slice(0, 5)
      },
      gates: {
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

    return row;
  });

  const controlledProviderFetchCandidates = planRows.filter(
    (row) => row.planState === "controlled_provider_api_or_widget_fetch_plan_required"
  );

  const localClassificationCandidates = planRows.filter((row) =>
    [
      "local_structured_fixture_calendar_ready",
      "local_usable_date_range_ready"
    ].includes(row.planState)
  );

  const localReviewCandidates = planRows.filter((row) =>
    [
      "local_single_date_review",
      "local_payload_parser_review_required"
    ].includes(row.planState)
  );

  const blockedRows = planRows.filter(
    (row) => row.planState === "manual_provider_route_review_required"
  );

  const summary = {
    targetDate,
    providerAwareInputRowCount: providerAwareRows.length,
    strictProviderInputRowCount: strictRows.length,
    planRowCount: planRows.length,
    byPlanState: countBy(planRows, "planState"),
    byRecommendedNextAction: countBy(planRows, "recommendedNextAction"),
    controlledProviderFetchCandidateCount: controlledProviderFetchCandidates.length,
    controlledProviderFetchCandidateSlugs: controlledProviderFetchCandidates.map((row) => row.competitionSlug).sort(),
    localClassificationCandidateCount: localClassificationCandidates.length,
    localClassificationCandidateSlugs: localClassificationCandidates.map((row) => row.competitionSlug).sort(),
    localReviewCandidateCount: localReviewCandidates.length,
    localReviewCandidateSlugs: localReviewCandidates.map((row) => row.competitionSlug).sort(),
    blockedManualReviewCount: blockedRows.length,
    blockedManualReviewSlugs: blockedRows.map((row) => row.competitionSlug).sort(),
    sourceFetch: false,
    noSearch: true,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  return {
    schema: "ai-matchlab.uefa-tier1-provider-acquisition-plan.v1",
    job: "build-uefa-tier1-provider-acquisition-plan-file",
    mode: "read_only_provider_acquisition_plan_from_existing_local_audits",
    summary,
    providerAcquisitionPlanRows: planRows,
    controlledProviderFetchCandidates,
    localClassificationCandidates,
    localReviewCandidates,
    blockedRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyExistingLocalDiagnosticAudits: true,
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
  const providerAware = {
    rows: [
      {
        slug: "nor.1",
        providerAwareDecision: {
          classifierInputState: "structured_fixture_calendar_ready",
          reason: "Structured fixture parser produced 150 rows.",
          usableUniqueDateCount: 0
        },
        structuredFixtureRows: [{ parsedFixtureRowCount: 150 }]
      },
      {
        slug: "irl.1",
        providerAwareDecision: {
          classifierInputState: "manual_review_needed",
          reason: "No local dates."
        }
      }
    ]
  };

  const strictProvider = {
    rows: [
      {
        slug: "irl.1",
        hosts: ["leagueofireland.ie"],
        urls: ["https://example.test/fixtures"],
        finalDecision: "provider_api_or_widget_acquisition_needed",
        apiOrWidgetConfigCount: 1,
        bySignal: { loi_data_competition_widget: 1 }
      },
      {
        slug: "aut.2",
        hosts: ["2liga.at"],
        urls: ["https://example.test/spielplan"],
        finalDecision: "blocked_no_actionable_carrier"
      }
    ]
  };

  const report = buildPlan({
    providerAware,
    strictProvider,
    targetDate: "2026-06-09"
  });

  if (report.summary.planRowCount !== 3) {
    throw new Error(`Expected 3 plan rows, got ${report.summary.planRowCount}`);
  }

  if (report.summary.controlledProviderFetchCandidateCount !== 1) {
    throw new Error("Expected one controlled provider fetch candidate");
  }

  if (report.summary.localClassificationCandidateCount !== 1) {
    throw new Error("Expected one local classification candidate");
  }

  if (report.summary.blockedManualReviewCount !== 1) {
    throw new Error("Expected one blocked manual review row");
  }

  if (report.guarantees.sourceFetch !== false || report.guarantees.canonicalWrites !== 0) {
    throw new Error("Read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "build-uefa-tier1-provider-acquisition-plan-file",
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

  const providerAwarePath = args["provider-aware"];
  const strictProviderPath = args["strict-provider"];
  const outputPath = args.output;
  const targetDate = asText(args["target-date"] || args.date || "2026-06-09");

  if (!outputPath) throw new Error("--output is required");

  const providerAware = readJson(providerAwarePath, "provider-aware audit");
  const strictProvider = readJson(strictProviderPath, "strict provider audit");

  const report = buildPlan({
    providerAware,
    strictProvider,
    targetDate
  });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    output: outputPath,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
