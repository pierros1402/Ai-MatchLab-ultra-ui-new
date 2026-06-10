#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE =
  "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09";

const DEFAULT_INPUT = path.join(
  DEFAULT_BASE,
  "uefa-tier1-provider-source-page-fetched-snapshots-2026-06-09.json"
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

function snapshotText(snapshot) {
  for (const field of ["rawText", "plainText", "bodyText", "html", "text", "body", "rawBody"]) {
    const text = asText(snapshot?.[field]);
    if (text) return text;
  }

  return "";
}

function absoluteUrl(src, finalUrl) {
  const value = asText(src);
  if (!value) return "";

  if (value.startsWith("//")) return `https:${value}`;

  try {
    return new URL(value, finalUrl).toString();
  } catch {
    return "";
  }
}

function scriptUrlsFromHtml(html, finalUrl) {
  const urls = [];
  const regex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match = regex.exec(html);

  while (match) {
    const url = absoluteUrl(match[1], finalUrl);
    if (url) urls.push(url);
    match = regex.exec(html);
  }

  return unique(urls);
}

function extractAttrs(fragment) {
  const attrs = {};
  const regex = /\s(data-[a-z0-9_-]+)=["']([^"']*)["']/gi;
  let match = regex.exec(fragment);

  while (match) {
    attrs[match[1].replace(/^data-/, "")] = match[2];
    match = regex.exec(fragment);
  }

  return attrs;
}

function extractLoiRows(snapshot, html) {
  const rows = [];
  const blockRegex = /<div[^>]+class=["'][^"']*(fixture__items|comet-fixtures-sidebar|comet-results-sidebar)[^"']*["'][^>]*>/gi;
  let match = blockRegex.exec(html);

  while (match) {
    const fragment = match[0];
    const attrs = extractAttrs(fragment);

    if (!attrs.bid || !attrs.cid || !attrs.competition || !attrs.template || !attrs.target) {
      match = blockRegex.exec(html);
      continue;
    }

    rows.push({
      taskId: `${snapshot.leagueSlug}:loi:${attrs.template}:${attrs.bid}:${attrs.cid}:${attrs.competition}`,
      competitionSlug: asText(snapshot.leagueSlug),
      providerFamily: "leagueofireland_data_competition_widget",
      carrierType: "html_data_attrs",
      readiness: "ajax_params_extracted_from_source_html",
      sourceUrl: asText(snapshot.finalUrl),
      ajaxEndpointDiscovery: "requires_script_or_network_endpoint_confirmation",
      method: "GET",
      requiredParams: {
        bid: asText(attrs.bid),
        cid: asText(attrs.cid),
        competition: asText(attrs.competition),
        limit: asText(attrs.limit),
        paginate: asText(attrs.paginate),
        template: asText(attrs.template),
        target: asText(attrs.target),
      },
      nextAction: "derive_or_confirm_LOI_ajax_endpoint_from_comet_or_opta_fixture_script",
      sourceFetchRequiredLater: false,
      scriptFetchRequiredLater: true,
      noSearchRequired: true,
    });

    match = blockRegex.exec(html);
  }

  return rows;
}

function extractSpflRows(snapshot, html) {
  const scriptUrls = scriptUrlsFromHtml(html, snapshot.finalUrl);
  const relevantScripts = scriptUrls.filter((url) =>
    /secure\.widget\.cloud\.opta\.net\/v3\/v3\.opta-widgets\.js|spfl\.co\.uk\/assets\/js\/app\.bundle\.js/i.test(url)
  );

  return relevantScripts.map((url) => ({
    taskId: `${snapshot.leagueSlug}:spfl:script:${url}`,
    competitionSlug: asText(snapshot.leagueSlug),
    providerFamily: "spfl_opta_widget",
    carrierType: "script_src",
    readiness: "script_candidate_for_opta_endpoint_discovery",
    sourceUrl: asText(snapshot.finalUrl),
    candidateUrl: url,
    method: "GET",
    nextAction: "controlled_fetch_script_and_extract_opta_widget_endpoint_or_embedded_widget_attrs",
    sourceFetchRequiredLater: false,
    scriptFetchRequiredLater: true,
    noSearchRequired: true,
  }));
}

function extractSportomediaRows(snapshot, html) {
  const scriptUrls = scriptUrlsFromHtml(html, snapshot.finalUrl);
  const relevantScripts = scriptUrls.filter((url) =>
    /\/wp-content\/themes\/sef-leagues\/build\/main\.js/i.test(url)
  );

  return relevantScripts.map((url) => ({
    taskId: `${snapshot.leagueSlug}:sportomedia:script:${url}`,
    competitionSlug: asText(snapshot.leagueSlug),
    providerFamily: "sportomedia_graphql_widget",
    carrierType: "script_src",
    readiness: "main_js_candidate_for_graphql_operation_discovery",
    sourceUrl: asText(snapshot.finalUrl),
    candidateUrl: url,
    method: "GET",
    graphqlEndpointCandidate: "https://gql.sportomedia.se/graphql",
    variables: {
      league: snapshot.leagueSlug === "swe.1" ? "allsvenskan" : "superettan",
      season: "2026",
    },
    nextAction: "controlled_fetch_main_js_and_extract_fixture_graphql_operation",
    sourceFetchRequiredLater: false,
    scriptFetchRequiredLater: true,
    noSearchRequired: true,
  }));
}

function buildOutput(input) {
  requireTrue(input.ok, "input ok");
  requireEqual(input.summary?.fetchedSnapshotCount, 6, "input fetchedSnapshotCount");
  requireEqual(input.summary?.rejectedCandidateCount, 0, "input rejectedCandidateCount");
  requireZero(input.summary?.canonicalWrites, "input canonicalWrites");
  requireFalse(input.summary?.productionWrite, "input productionWrite");
  requireTrue(input.guarantees?.usesOnlyProvidedRankedCandidates, "input usesOnlyProvidedRankedCandidates");
  requireFalse(input.guarantees?.inventedUrls, "input inventedUrls");

  const snapshots = asArray(input.fetchedSourceSnapshots);
  requireEqual(snapshots.length, 6, "fetchedSourceSnapshots.length");

  const extractionRows = [];

  for (const snapshot of snapshots) {
    const html = snapshotText(snapshot);
    if (!html) {
      throw new Error(`Missing snapshot text for ${snapshot.leagueSlug}`);
    }

    if (snapshot.sourceFamily === "leagueofireland_data_competition_widget") {
      extractionRows.push(...extractLoiRows(snapshot, html));
    }

    if (snapshot.sourceFamily === "spfl_opta_widget") {
      extractionRows.push(...extractSpflRows(snapshot, html));
    }

    if (snapshot.sourceFamily === "sportomedia_graphql_widget") {
      extractionRows.push(...extractSportomediaRows(snapshot, html));
    }
  }

  const slugs = unique(extractionRows.map((row) => row.competitionSlug));
  const loiRows = extractionRows.filter((row) => row.providerFamily === "leagueofireland_data_competition_widget");
  const spflRows = extractionRows.filter((row) => row.providerFamily === "spfl_opta_widget");
  const sportomediaRows = extractionRows.filter((row) => row.providerFamily === "sportomedia_graphql_widget");

  requireEqual(JSON.stringify(slugs), JSON.stringify(["irl.1", "irl.2", "sco.1", "sco.2", "swe.1", "swe.2"]), "extraction slugs");
  requireEqual(loiRows.length >= 3, true, "LOI extracted row minimum");
  requireEqual(spflRows.length, 4, "SPFL script row count");
  requireEqual(sportomediaRows.length, 2, "Sportomedia main.js row count");

  return {
    ok: true,
    job: "build-uefa-tier1-provider-carrier-extraction-file",
    mode: "read_only_provider_carrier_extraction_from_fetched_html",
    generatedAt: new Date().toISOString(),
    schema: {
      name: "uefa_tier1_provider_carrier_extraction",
      version: 1,
    },
    summary: {
      inputFetchedSnapshotCount: snapshots.length,
      carrierExtractionRowCount: extractionRows.length,
      carrierExtractionSlugCount: slugs.length,
      carrierExtractionSlugs: slugs,
      byProviderFamily: {
        leagueofireland_data_competition_widget: loiRows.length,
        spfl_opta_widget: spflRows.length,
        sportomedia_graphql_widget: sportomediaRows.length,
      },
      loiAjaxParamRowCount: loiRows.length,
      scriptFetchCandidateRowCount: spflRows.length + sportomediaRows.length,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
    },
    extractionRows,
    loiAjaxParamRows: loiRows,
    scriptFetchCandidateRows: [...spflRows, ...sportomediaRows],
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyFetchedSourcePageSnapshots: true,
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
