#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE =
  "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09";

const DEFAULT_INPUT = path.join(
  DEFAULT_BASE,
  "uefa-tier1-provider-endpoint-discovery-plan-from-source-job-2026-06-09.json"
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

function normalizeUrl(value) {
  const raw = asText(value);

  if (!raw) return "";

  const url = new URL(raw);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${raw}`);
  }

  url.hash = "";
  return url.toString();
}

function hostnameOf(value) {
  return new URL(value).hostname.toLowerCase();
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

function validateInput(input) {
  requireTrue(input.ok, "input ok");
  requireEqual(input.summary?.endpointDiscoveryInputRowCount, 10, "input endpointDiscoveryInputRowCount");
  requireEqual(input.summary?.endpointDiscoverySlugCount, 6, "input endpointDiscoverySlugCount");
  requireEqual(input.summary?.discoveryRowCount, 10, "input discoveryRowCount");
  requireEqual(input.summary?.executableDiscoveryRowCount, 7, "input executableDiscoveryRowCount");
  requireEqual(input.summary?.blockedOrIncompleteDiscoveryRowCount, 3, "input blockedOrIncompleteDiscoveryRowCount");
  requireTrue(input.guarantees?.noSearch, "input guarantees.noSearch");
  requireTrue(input.guarantees?.noFetch, "input guarantees.noFetch");
  requireZero(input.guarantees?.canonicalWrites, "input guarantees.canonicalWrites");
  requireFalse(input.guarantees?.productionWrite, "input guarantees.productionWrite");

  const executableRows = asArray(input.executableDiscoveryRows);
  requireEqual(executableRows.length, 7, "executableDiscoveryRows.length");

  return executableRows;
}

function fetchPurposeFor(row) {
  if (row.providerFamily === "leagueofireland_data_competition_widget") {
    return "leagueofireland_source_page_for_ajax_endpoint_derivation";
  }

  if (row.providerFamily === "spfl_opta_widget") {
    return "spfl_source_page_for_opta_widget_endpoint_derivation";
  }

  if (row.providerFamily === "sportomedia_graphql_widget") {
    return "sportomedia_source_page_for_graphql_operation_discovery";
  }

  return "provider_source_page_for_endpoint_discovery";
}

function buildFetchTaskRows(executableRows) {
  const byUrl = new Map();

  for (const row of executableRows) {
    const candidateUrl = normalizeUrl(row.sourceUrl);
    const existing = byUrl.get(candidateUrl);

    const slug = asText(row.competitionSlug);
    const providerFamily = asText(row.providerFamily);

    const derivedFromDiscoveryTaskIds = [
      ...(existing?.derivedFromDiscoveryTaskIds || []),
      asText(row.taskId),
    ].filter(Boolean);

    const leagueSlugs = unique([
      ...(existing?.leagueSlugs || []),
      slug,
    ]);

    byUrl.set(candidateUrl, {
      leagueSlug: leagueSlugs.join(","),
      leagueSlugs,
      providerFamily,
      sourceFamily: providerFamily,
      sourceCandidateType: "official_provider_source_page_for_endpoint_discovery",
      type: "official_provider_source_page",
      trustTier: "official_primary",
      candidateUrl,
      finalUrl: candidateUrl,
      resolvedUrl: candidateUrl,
      hostname: hostnameOf(candidateUrl),
      title: `${providerFamily} endpoint discovery source page`,
      truthRole: "season_status_provider_endpoint_discovery_source_page",
      sourceClass: "official_provider_route",
      reviewerDecision: "ready_for_controlled_fetch",
      readyForFetch: true,
      fetchPurpose: fetchPurposeFor(row),
      sourceFetchRequiredLater: true,
      noSearchRequired: true,
      derivedFromDiscoveryTaskIds: unique(derivedFromDiscoveryTaskIds),
    });
  }

  return [...byUrl.values()].sort((left, right) => {
    const providerCompare = left.providerFamily.localeCompare(right.providerFamily, "en");
    if (providerCompare !== 0) return providerCompare;
    return left.candidateUrl.localeCompare(right.candidateUrl, "en");
  });
}

function buildOutput(input) {
  const executableRows = validateInput(input);
  const fetchTaskRows = buildFetchTaskRows(executableRows);

  requireEqual(fetchTaskRows.length, 6, "fetchTaskRows.length");

  const slugs = unique(fetchTaskRows.flatMap((row) => row.leagueSlugs));
  requireEqual(JSON.stringify(slugs), JSON.stringify(["irl.1", "irl.2", "sco.1", "sco.2", "swe.1", "swe.2"]), "source-page fetch slugs");

  const byProviderFamily = countBy(fetchTaskRows, "providerFamily");
  requireEqual(byProviderFamily.leagueofireland_data_competition_widget, 2, "LOI unique source page count");
  requireEqual(byProviderFamily.spfl_opta_widget, 2, "SPFL unique source page count");
  requireEqual(byProviderFamily.sportomedia_graphql_widget, 2, "Sportomedia unique source page count");

  return {
    ok: true,
    job: "build-uefa-tier1-provider-source-page-fetch-input-file",
    mode: "read_only_provider_source_page_fetch_input_planning",
    generatedAt: new Date().toISOString(),
    schema: {
      name: "uefa_tier1_provider_source_page_fetch_input",
      version: 1,
    },
    summary: {
      inputExecutableDiscoveryRowCount: executableRows.length,
      fetchTaskRowCount: fetchTaskRows.length,
      sourcePageSlugCount: slugs.length,
      sourcePageSlugs: slugs,
      byProviderFamily,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
    },
    fetchTaskRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyExistingLocalDiagnostics: true,
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
  const input = readJson(args.input);
  const output = buildOutput(input);

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
