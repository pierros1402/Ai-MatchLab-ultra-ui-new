#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  probeInput: "data/football-truth/_diagnostics/no-write-sportomedia-remaining-standings-parser-gap-2026-06-14/no-write-sportomedia-remaining-standings-parser-gap-2026-06-14.json",
  snapshotInput: "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-sportomedia-official-standings-payload-shape-inspector-2026-06-14/no-write-sportomedia-official-standings-payload-shape-inspector-2026-06-14.json"
};

const SPORTOMEDIA_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--probe-input") args.probeInput = argv[++i];
    else if (arg === "--snapshot-input") args.snapshotInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }
  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === "" ? "__missing__" : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function validateProbe(input) {
  const s = input.summary || {};
  assertSummary(s, "sportomediaRemainingGapProbeCompetitionCount", 2);
  assertSummary(s, "sportomediaRemainingGapRepairedCandidateCount", 0);
  assertSummary(s, "sportomediaRemainingGapStillNeedsManualPayloadShapeReviewCount", 2);
  assertSummary(s, "sportomediaStandingRowsExtractedCompetitionCount", 0);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "activeAssertedCount", 0);
  assertSummary(s, "inactiveAssertedCount", 0);
  assertSummary(s, "completedAssertedCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.probeRows) ? input.probeRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 probeRows.");
  return rows;
}

function validateSnapshots(input) {
  const s = input.summary || {};
  assertSummary(s, "finalScopedControlledRouteAcquisitionRunCompetitionCount", 6);
  assertSummary(s, "finalScopedControlledRouteAcquisitionRunTargetCount", 18);
  assertSummary(s, "fetchedSourceSnapshotCount", 18);
  assertSummary(s, "fetchedOkSnapshotCount", 18);
  assertSummary(s, "searchExecutedCount", 0);
  assertSummary(s, "broadSearchExecutedCount", 0);
  assertSummary(s, "classifierExecutedCount", 0);
  assertSummary(s, "canonicalWriteExecutedCount", 0);
  assertSummary(s, "productionWriteExecutedCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [];
  if (rows.length !== 18) throw new Error("Expected 18 fetchedSourceSnapshots.");

  for (const row of rows) {
    if (row.fetchStatus !== "fetched_ok" || row.status !== 200 || row.ok !== true) {
      throw new Error(row.competitionSlug + " " + row.routeKind + ": snapshot must be fetched_ok HTTP 200.");
    }
  }

  return rows;
}

function getRaw(snapshot) {
  return String(snapshot.rawText || snapshot.text || snapshot.body || snapshot.textPreview || "");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&aring;/gi, "å")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Aring;/g, "Å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö");
}

function stripHtml(raw) {
  return decodeEntities(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sampleMatches(raw, regex, limit = 20) {
  const out = [];
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  let match;
  while ((match = re.exec(String(raw || ""))) !== null && out.length < limit) {
    out.push({
      index: match.index,
      value: match[0].slice(0, 500)
    });
  }
  return out;
}

function countMatches(raw, regex) {
  const m = String(raw || "").match(regex);
  return m ? m.length : 0;
}

function keywordContexts(raw, keywords, limit = 80) {
  const text = stripHtml(raw);
  const lower = text.toLowerCase();
  const out = [];

  for (const keyword of keywords) {
    const k = keyword.toLowerCase();
    let index = lower.indexOf(k);
    while (index >= 0 && out.length < limit) {
      out.push({
        keyword,
        index,
        context: text.slice(Math.max(0, index - 500), Math.min(text.length, index + 1200))
      });
      index = lower.indexOf(k, index + Math.max(k.length, 1));
    }
    if (out.length >= limit) break;
  }

  return out;
}

function extractScripts(raw) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;

  while ((match = re.exec(String(raw || ""))) !== null && scripts.length < 80) {
    const attrs = String(match[1] || "");
    const body = String(match[2] || "").trim();
    const joined = attrs + "\n" + body;

    scripts.push({
      scriptIndex: index,
      attrs: attrs.slice(0, 400),
      bodyLength: body.length,
      hasTypename: /__typename/.test(body),
      hasGraphql: /graphql|GraphQL/.test(body),
      hasApollo: /apollo|__APOLLO/i.test(body),
      hasNextData: /__NEXT_DATA__/.test(attrs + body),
      hasNuxt: /__NUXT__|nuxt/i.test(body),
      hasStandingsKeyword: /(standing|standings|tabell|table|points|poäng|poang|played|spelade|team|club|lag)/i.test(joined),
      keywordCounts: {
        standing: countMatches(joined, /standing/gi),
        standings: countMatches(joined, /standings/gi),
        tabell: countMatches(joined, /tabell/gi),
        team: countMatches(joined, /team/gi),
        club: countMatches(joined, /club/gi),
        points: countMatches(joined, /points|pts|poäng|poang/gi),
        played: countMatches(joined, /played|spelade|matches/gi),
        typename: countMatches(joined, /__typename/g)
      },
      head: body.slice(0, 800),
      standingsContexts: keywordContexts(body, ["standings", "standing", "tabell", "poäng", "poang", "played", "spelade", "team", "club", "lag"], 8)
    });

    index += 1;
  }

  return scripts;
}

function extractDataAttributes(raw) {
  const attrs = [];
  const re = /\b(data-[a-zA-Z0-9_-]+|aria-label|title|class|id)=["']([^"']{0,1000})["']/g;
  let match;

  while ((match = re.exec(String(raw || ""))) !== null && attrs.length < 300) {
    const name = match[1];
    const value = decodeEntities(match[2]);
    if (
      /(standing|standings|tabell|table|points|poäng|poang|played|spelade|team|club|lag|rank|position)/i.test(name + " " + value) ||
      ["data-react-props", "data-props", "data-state", "data-testid", "class", "id"].includes(name)
    ) {
      attrs.push({
        index: match.index,
        name,
        value: value.slice(0, 500)
      });
    }
  }

  return attrs;
}

function extractTables(raw) {
  const tables = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  let tableIndex = 0;

  while ((tableMatch = tableRe.exec(String(raw || ""))) !== null && tables.length < 20) {
    const table = tableMatch[0];
    const rows = [];
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;

    while ((trMatch = trRe.exec(table)) !== null && rows.length < 12) {
      const cells = [];
      const cellRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let cellMatch;
      while ((cellMatch = cellRe.exec(trMatch[1])) !== null && cells.length < 20) {
        const cell = stripHtml(cellMatch[1]);
        if (cell) cells.push(cell);
      }
      if (cells.length) rows.push(cells);
    }

    tables.push({
      tableIndex,
      tableHtmlLength: table.length,
      rowSampleCount: rows.length,
      rowSamples: rows
    });

    tableIndex += 1;
  }

  return tables;
}

function extractLikelyJsonFragments(raw) {
  const fragments = [];
  const sources = [];

  sources.push({ source: "raw", text: String(raw || "") });

  const scripts = extractScripts(raw);
  for (const script of scripts) {
    sources.push({ source: "script_" + script.scriptIndex, text: script.head + "\n" + JSON.stringify(script.standingsContexts) });
  }

  const rawString = String(raw || "");
  const scriptBodyRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let bodyMatch;
  let scriptIndex = 0;
  while ((bodyMatch = scriptBodyRe.exec(rawString)) !== null && scriptIndex < 80) {
    sources.push({ source: "script_body_" + scriptIndex, text: String(bodyMatch[1] || "") });
    scriptIndex += 1;
  }

  for (const source of sources) {
    const text = decodeEntities(source.text);
    const keywordIndexes = [];

    for (const keyword of ["standings", "standing", "tabell", "poäng", "poang", "played", "spelade", "team", "club", "lag", "__typename"]) {
      const lower = text.toLowerCase();
      let idx = lower.indexOf(keyword.toLowerCase());
      while (idx >= 0 && keywordIndexes.length < 100) {
        keywordIndexes.push({ keyword, idx });
        idx = lower.indexOf(keyword.toLowerCase(), idx + keyword.length);
      }
    }

    for (const hit of keywordIndexes.slice(0, 40)) {
      fragments.push({
        source: source.source,
        keyword: hit.keyword,
        index: hit.idx,
        fragment: text.slice(Math.max(0, hit.idx - 1200), Math.min(text.length, hit.idx + 2200))
      });
      if (fragments.length >= 120) break;
    }

    if (fragments.length >= 120) break;
  }

  return fragments;
}

function buildRow(snapshot) {
  const raw = getRaw(snapshot);
  const plain = stripHtml(raw);
  const scripts = extractScripts(raw);
  const attrs = extractDataAttributes(raw);
  const tables = extractTables(raw);
  const jsonFragments = extractLikelyJsonFragments(raw);

  const keywordList = [
    "standings",
    "standing",
    "leagueTable",
    "table",
    "tabell",
    "tabellen",
    "poäng",
    "poang",
    "spelade",
    "vunna",
    "oavgjorda",
    "förlorade",
    "forlorade",
    "målskillnad",
    "malskillnad",
    "team",
    "club",
    "lag",
    "__typename",
    "GraphQL",
    "graphql",
    "Apollo",
    "__APOLLO",
    "__NEXT_DATA__",
    "__NUXT__"
  ];

  const payloadShape =
    scripts.some((s) => s.hasApollo || s.hasTypename || s.hasGraphql)
      ? "script_hydration_or_graphql_like"
      : tables.length > 0
        ? "html_table_like"
        : jsonFragments.length > 0
          ? "keyword_payload_fragment_like"
          : "plain_text_or_client_runtime_only";

  const parserRecommendation =
    payloadShape === "script_hydration_or_graphql_like"
      ? "build_targeted_sportomedia_script_payload_parser_from_fragments"
      : payloadShape === "html_table_like"
        ? "build_targeted_sportomedia_html_table_parser"
        : payloadShape === "keyword_payload_fragment_like"
          ? "build_targeted_sportomedia_keyword_fragment_parser"
          : "sportomedia_standings_may_require_route_config_or_client_api_endpoint_review";

  return {
    competitionSlug: snapshot.competitionSlug,
    reusableFamily: snapshot.reusableFamily,
    routeKind: snapshot.routeKind,
    sourceUrl: snapshot.sourceUrl,
    finalUrl: snapshot.finalUrl,
    fetchStatus: snapshot.fetchStatus,
    status: snapshot.status,
    rawTextLength: snapshot.rawTextLength,
    storedTextLength: snapshot.storedTextLength,
    storedTextSha256: snapshot.storedTextSha256,

    payloadShape,
    parserRecommendation,

    counts: {
      scriptCount: scripts.length,
      scriptsWithStandingsKeywordCount: scripts.filter((s) => s.hasStandingsKeyword).length,
      scriptsWithTypenameCount: scripts.filter((s) => s.hasTypename).length,
      scriptsWithGraphqlCount: scripts.filter((s) => s.hasGraphql).length,
      scriptsWithApolloCount: scripts.filter((s) => s.hasApollo).length,
      dataAttributeCandidateCount: attrs.length,
      tableCount: tables.length,
      likelyJsonFragmentCount: jsonFragments.length,
      rawStandingsKeywordCount: countMatches(raw, /standing|standings|tabell|tabellen/gi),
      rawPointsKeywordCount: countMatches(raw, /points|pts|poäng|poang/gi),
      rawPlayedKeywordCount: countMatches(raw, /played|spelade|matches/gi),
      rawTeamKeywordCount: countMatches(raw, /team|club|lag/gi),
      plainTextLength: plain.length
    },

    plainTextHead: plain.slice(0, 2500),
    keywordContexts: keywordContexts(raw, keywordList, 50),
    scriptSummaries: scripts.slice(0, 20),
    dataAttributeSamples: attrs.slice(0, 80),
    tableSamples: tables.slice(0, 10),
    likelyJsonFragments: jsonFragments.slice(0, 80),
    classSamples: sampleMatches(raw, /class=["'][^"']{1,240}["']/gi, 80),
    urlSamples: sampleMatches(raw, /https?:\/\/[^"' <>()]+/gi, 80),

    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    seasonStateTruthAssertedNow: false,
    payloadShapeIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep: parserRecommendation,
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const probe = readJson(args.probeInput);
  validateProbe(probe);

  const snapshotRun = readJson(args.snapshotInput);
  const snapshots = validateSnapshots(snapshotRun);

  const sportomediaStandingsSnapshots = snapshots
    .filter((row) => SPORTOMEDIA_SLUGS.includes(row.competitionSlug) && row.routeKind === "official_standings")
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  if (sportomediaStandingsSnapshots.length !== 2) {
    throw new Error("Expected exactly 2 Sportomedia official_standings snapshots.");
  }

  const inspectorRows = sportomediaStandingsSnapshots.map(buildRow);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "inspect-football-truth-no-write-sportomedia-official-standings-payload-shape-file",
    mode: "inspect_no_write_sportomedia_official_standings_payload_shape_from_existing_snapshots_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      sportomediaRemainingStandingsParserGapProbe: args.probeInput,
      finalScopedControlledRouteAcquisitionRun: args.snapshotInput
    },
    summary: {
      sportomediaPayloadShapeInspectorCompetitionCount: inspectorRows.length,
      sportomediaOfficialStandingsSnapshotCount: sportomediaStandingsSnapshots.length,

      scriptHydrationOrGraphqlLikeCount: inspectorRows.filter((row) => row.payloadShape === "script_hydration_or_graphql_like").length,
      htmlTableLikeCount: inspectorRows.filter((row) => row.payloadShape === "html_table_like").length,
      keywordPayloadFragmentLikeCount: inspectorRows.filter((row) => row.payloadShape === "keyword_payload_fragment_like").length,
      plainTextOrClientRuntimeOnlyCount: inspectorRows.filter((row) => row.payloadShape === "plain_text_or_client_runtime_only").length,

      totalScriptCount: inspectorRows.reduce((sum, row) => sum + row.counts.scriptCount, 0),
      totalScriptsWithStandingsKeywordCount: inspectorRows.reduce((sum, row) => sum + row.counts.scriptsWithStandingsKeywordCount, 0),
      totalScriptsWithTypenameCount: inspectorRows.reduce((sum, row) => sum + row.counts.scriptsWithTypenameCount, 0),
      totalScriptsWithGraphqlCount: inspectorRows.reduce((sum, row) => sum + row.counts.scriptsWithGraphqlCount, 0),
      totalScriptsWithApolloCount: inspectorRows.reduce((sum, row) => sum + row.counts.scriptsWithApolloCount, 0),
      totalDataAttributeCandidateCount: inspectorRows.reduce((sum, row) => sum + row.counts.dataAttributeCandidateCount, 0),
      totalTableCount: inspectorRows.reduce((sum, row) => sum + row.counts.tableCount, 0),
      totalLikelyJsonFragmentCount: inspectorRows.reduce((sum, row) => sum + row.counts.likelyJsonFragmentCount, 0),

      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      classifierExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      seasonStateTruthAssertedCount: 0,
      payloadShapeTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane: inspectorRows.some((row) => row.payloadShape !== "plain_text_or_client_runtime_only")
        ? "build_targeted_sportomedia_payload_shape_parser"
        : "review_sportomedia_route_config_or_client_api_endpoint_from_existing_snapshot"
    },
    counts: {
      byPayloadShape: countBy(inspectorRows, "payloadShape"),
      byParserRecommendation: countBy(inspectorRows, "parserRecommendation"),
      byNextAllowedStep: countBy(inspectorRows, "nextAllowedStep")
    },
    guardrails: [
      "This inspector reads already-acquired Sportomedia official_standings snapshots only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not classify season state.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Payload-shape diagnostics are not truth assertions.",
      "Missing row candidates does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    inspectorRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    sportomediaPayloadShapeInspectorCompetitionCount: output.summary.sportomediaPayloadShapeInspectorCompetitionCount,
    sportomediaOfficialStandingsSnapshotCount: output.summary.sportomediaOfficialStandingsSnapshotCount,
    scriptHydrationOrGraphqlLikeCount: output.summary.scriptHydrationOrGraphqlLikeCount,
    htmlTableLikeCount: output.summary.htmlTableLikeCount,
    keywordPayloadFragmentLikeCount: output.summary.keywordPayloadFragmentLikeCount,
    plainTextOrClientRuntimeOnlyCount: output.summary.plainTextOrClientRuntimeOnlyCount,
    totalScriptCount: output.summary.totalScriptCount,
    totalScriptsWithStandingsKeywordCount: output.summary.totalScriptsWithStandingsKeywordCount,
    totalScriptsWithTypenameCount: output.summary.totalScriptsWithTypenameCount,
    totalScriptsWithGraphqlCount: output.summary.totalScriptsWithGraphqlCount,
    totalScriptsWithApolloCount: output.summary.totalScriptsWithApolloCount,
    totalDataAttributeCandidateCount: output.summary.totalDataAttributeCandidateCount,
    totalTableCount: output.summary.totalTableCount,
    totalLikelyJsonFragmentCount: output.summary.totalLikelyJsonFragmentCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
    payloadShapeTruthCount: output.summary.payloadShapeTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
