#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE =
  "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09";

const DEFAULT_RUNTIME_INPUT = path.join(
  DEFAULT_BASE,
  "uefa-tier1-provider-source-page-runtime-config-inspection-2026-06-09.json"
);

const DEFAULT_DEEP_INPUT = path.join(
  DEFAULT_BASE,
  "uefa-tier1-provider-endpoint-deep-inspection-2026-06-09.json"
);

function parseArgs(argv) {
  const args = {
    runtimeInput: DEFAULT_RUNTIME_INPUT,
    deepInput: DEFAULT_DEEP_INPUT,
    output: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--runtime-input") {
      args.runtimeInput = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--deep-input") {
      args.deepInput = argv[index + 1] || "";
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

  if (!args.runtimeInput) throw new Error("Missing required --runtime-input");
  if (!args.deepInput) throw new Error("Missing required --deep-input");
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

function unique(values) {
  return [...new Set(values.map(asText).filter(Boolean))].sort();
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireTrue(value, label) {
  if (value !== true) {
    throw new Error(`${label}: expected true, got ${JSON.stringify(value)}`);
  }
}

function requireFalse(value, label) {
  if (value !== false) {
    throw new Error(`${label}: expected false, got ${JSON.stringify(value)}`);
  }
}

function requireZero(value, label) {
  if (value !== 0) {
    throw new Error(`${label}: expected 0, got ${JSON.stringify(value)}`);
  }
}

function parseAttrs(attrText) {
  const attrs = {};
  const regex = /([A-Za-z0-9_:-]+)=["']([^"']*)["']/g;
  let match = regex.exec(attrText);

  while (match) {
    attrs[match[1]] = match[2];
    match = regex.exec(attrText);
  }

  return attrs;
}

function routeLabel(finalUrl) {
  const text = asText(finalUrl).toLowerCase();

  if (text.includes("/league/premiership/fixtures")) return "premiership";
  if (text.includes("/league/championship/fixtures")) return "championship";

  return "";
}

function expectedCompetitionForSlug(slug) {
  if (slug === "sco.1") return "14";
  if (slug === "sco.2") return "91";
  return "";
}

function validateInputs(runtimeInput, deepInput) {
  requireTrue(runtimeInput.ok, "runtime input ok");
  requireEqual(runtimeInput.summary?.inputFetchedSnapshotCount, 6, "runtime fetched source page count");
  requireEqual(runtimeInput.summary?.bySourceFamily?.spfl_opta_widget, 2, "runtime SPFL row count");
  requireEqual(runtimeInput.summary?.spflWidgetNames?.[0], "fixtures", "runtime SPFL widget name");
  requireEqual(runtimeInput.summary?.spflPageSeasonIds?.[0], "2025", "runtime SPFL season id");
  requireTrue(runtimeInput.guarantees?.noSearch, "runtime guarantees.noSearch");
  requireTrue(runtimeInput.guarantees?.noFetch, "runtime guarantees.noFetch");
  requireFalse(runtimeInput.guarantees?.inventedUrls, "runtime guarantees.inventedUrls");
  requireZero(runtimeInput.guarantees?.canonicalWrites, "runtime guarantees.canonicalWrites");
  requireFalse(runtimeInput.guarantees?.productionWrite, "runtime guarantees.productionWrite");

  requireTrue(deepInput.ok, "deep input ok");
  requireEqual(deepInput.summary?.bySourceFamily?.spfl_opta_widget, 2, "deep SPFL row count");
  requireEqual(asArray(deepInput.summary?.spflSubscriptionIds).length, 1, "deep SPFL subscription id count");
  requireEqual(deepInput.summary?.spflSubscriptionIds?.[0], "6168f63f472b647228f09f2377b25cac", "deep SPFL subscription id");
  requireTrue(deepInput.guarantees?.noSearch, "deep guarantees.noSearch");
  requireTrue(deepInput.guarantees?.noFetch, "deep guarantees.noFetch");
  requireFalse(deepInput.guarantees?.inventedUrls, "deep guarantees.inventedUrls");
  requireZero(deepInput.guarantees?.canonicalWrites, "deep guarantees.canonicalWrites");
  requireFalse(deepInput.guarantees?.productionWrite, "deep guarantees.productionWrite");
}

function buildCandidateRows(runtimeInput, subscriptionId) {
  const rows = [];

  for (const pageRow of asArray(runtimeInput.rows)) {
    if (pageRow.sourceFamily !== "spfl_opta_widget") continue;

    const leagueSlug = asText(pageRow.leagueSlug);
    const finalUrl = asText(pageRow.finalUrl);
    const route = routeLabel(finalUrl);

    for (const attrText of asArray(pageRow.spfl?.optaWidgetAttrs)) {
      const attrs = parseAttrs(attrText);

      rows.push({
        competitionSlug: leagueSlug,
        sourceFamily: "spfl_opta_widget",
        sourceProvider: "opta_widget_cloud",
        sourceKind: "official_spfl_page_opta_widget_attrs",
        finalUrl,
        routeLabel: route,
        widget: asText(attrs.widget),
        competitionId: asText(attrs.competition),
        seasonId: asText(attrs.season),
        sport: asText(attrs.sport),
        template: asText(attrs.template),
        matchStatus: asText(attrs.match_status),
        showTitle: asText(attrs.show_title),
        live: asText(attrs.live),
        orderBy: asText(attrs.order_by),
        subscriptionId,
        attrText,
        isPrimaryLeagueWidget:
          asText(attrs.widget) === "fixtures" &&
          asText(attrs.sport) === "football" &&
          asText(attrs.season) === "2025" &&
          asText(attrs.show_title) === "false",
      });
    }
  }

  return rows.sort((left, right) => {
    const slugCompare = left.competitionSlug.localeCompare(right.competitionSlug, "en");
    if (slugCompare !== 0) return slugCompare;

    return left.competitionId.localeCompare(right.competitionId, "en");
  });
}

function buildOutput(runtimeInput, deepInput) {
  validateInputs(runtimeInput, deepInput);

  const subscriptionId = asText(deepInput.summary.spflSubscriptionIds[0]);
  const candidateRows = buildCandidateRows(runtimeInput, subscriptionId);
  requireEqual(candidateRows.length, 4, "SPFL widget candidate row count");

  const primaryRows = candidateRows.filter((row) => row.isPrimaryLeagueWidget);
  requireEqual(primaryRows.length, 2, "SPFL primary widget row count");

  for (const row of primaryRows) {
    requireEqual(row.competitionId, expectedCompetitionForSlug(row.competitionSlug), `primary competition id for ${row.competitionSlug}`);
  }

  const secondaryRows = candidateRows.filter((row) => !row.isPrimaryLeagueWidget);

  const byCompetition = Object.fromEntries(
    primaryRows.map((row) => [
      row.competitionSlug,
      {
        providerFamily: "spfl_opta_widget",
        routeLabel: row.routeLabel,
        finalUrl: row.finalUrl,
        competitionId: row.competitionId,
        seasonId: row.seasonId,
        widget: row.widget,
        sport: row.sport,
        subscriptionId: row.subscriptionId,
        primarySelectionReason: "fixtures football widget on exact SPFL league fixtures page with show_title=false",
        secondaryCompetitionIdsOnPage: secondaryRows
          .filter((secondary) => secondary.competitionSlug === row.competitionSlug)
          .map((secondary) => secondary.competitionId)
          .sort(),
        readyForControlledOptaWidgetFetch: true,
      },
    ])
  );

  requireEqual(byCompetition["sco.1"]?.competitionId, "14", "sco.1 primary competition id");
  requireEqual(byCompetition["sco.2"]?.competitionId, "91", "sco.2 primary competition id");
  requireEqual(byCompetition["sco.1"]?.seasonId, "2025", "sco.1 season id");
  requireEqual(byCompetition["sco.2"]?.seasonId, "2025", "sco.2 season id");
  requireEqual(byCompetition["sco.1"]?.secondaryCompetitionIdsOnPage?.[0], "697", "sco.1 secondary competition id");
  requireEqual(byCompetition["sco.2"]?.secondaryCompetitionIdsOnPage?.[0], "498", "sco.2 secondary competition id");

  return {
    ok: true,
    job: "build-uefa-spfl-opta-widget-mapping-file",
    mode: "read_only_spfl_opta_widget_mapping",
    generatedAt: new Date().toISOString(),
    schema: {
      name: "uefa_spfl_opta_widget_mapping",
      version: 1,
    },
    summary: {
      inputSpflSourcePageRowCount: 2,
      widgetCandidateRowCount: candidateRows.length,
      primaryWidgetRowCount: primaryRows.length,
      secondaryWidgetRowCount: secondaryRows.length,
      mappedSlugCount: Object.keys(byCompetition).length,
      mappedSlugs: unique(primaryRows.map((row) => row.competitionSlug)),
      byCompetition,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
    },
    widgetCandidateRows: candidateRows,
    primaryWidgetRows: primaryRows,
    secondaryWidgetRows: secondaryRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyFetchedSpflSourcePagesAndFetchedProviderScriptDiagnostics: true,
      inventedUrls: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true,
    },
  };
}

function main() {
  const args = parseArgs(process.argv);
  const runtimeInput = readJson(args.runtimeInput);
  const deepInput = readJson(args.deepInput);
  const output = buildOutput(runtimeInput, deepInput);

  writeJson(args.output, output);

  console.log(
    JSON.stringify(
      {
        ok: output.ok,
        output: args.output,
        summary: output.summary,
        guarantees: output.guarantees,
      },
      null,
      2
    )
  );
}

main();
