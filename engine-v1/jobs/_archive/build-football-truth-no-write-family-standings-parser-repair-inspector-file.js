#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  parserInput: "data/football-truth/_diagnostics/no-write-family-structured-stats-parser-normalizer-2026-06-14/no-write-family-structured-stats-parser-normalizer-2026-06-14.json",
  snapshotInput: "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-family-standings-parser-repair-inspector-2026-06-14/no-write-family-standings-parser-repair-inspector-2026-06-14.json"
};

const EXPECTED_REPAIR_SLUGS = ["esp.1", "esp.2", "swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--parser-input") args.parserInput = argv[++i];
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

function uniqueSorted(values) {
  return [...new Set(values.filter((v) => v !== null && v !== undefined).map((v) => String(v).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === "" ? "__missing__" : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
}

function validateParserRun(input) {
  const s = input.summary || {};
  assertSummary(s, "familyStructuredStatsParserNormalizerCompetitionCount", 6);
  assertSummary(s, "familyStructuredStatsParserNormalizerReadyCount", 2);
  assertSummary(s, "familyStructuredStatsParserNormalizerNeedsRepairCount", 4);
  assertSummary(s, "rowLevelStandingRowsExtractedCompetitionCount", 2);
  assertSummary(s, "rowLevelFixtureResultRowsExtractedCompetitionCount", 4);
  assertSummary(s, "qualityGateReadyForClassifierCount", 0);
  assertSummary(s, "qualityGateReadyForCanonicalWriteCount", 0);
  assertSummary(s, "qualityGateReadyForTruthAssertionCount", 0);
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
  assertSummary(s, "rowLevelStatsExtractionTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.parserRows) ? input.parserRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 parserRows.");
  return rows;
}

function validateSnapshotRun(input) {
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
  return rows;
}

function getRaw(snapshot) {
  return String(snapshot.rawText || snapshot.text || snapshot.body || snapshot.textPreview || "");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(raw, regex) {
  const matches = String(raw || "").match(regex);
  return matches ? matches.length : 0;
}

function sampleMatches(raw, regex, limit = 12) {
  const out = [];
  let match;
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  while ((match = re.exec(String(raw || ""))) !== null && out.length < limit) {
    out.push(match[0].slice(0, 220));
  }
  return out;
}

function contextAround(raw, patterns, limit = 12) {
  const text = stripHtml(raw);
  const lower = text.toLowerCase();
  const out = [];

  for (const pattern of patterns) {
    let index = lower.indexOf(pattern.toLowerCase());
    while (index >= 0 && out.length < limit) {
      out.push({
        pattern,
        context: text.slice(Math.max(0, index - 220), Math.min(text.length, index + 420))
      });
      index = lower.indexOf(pattern.toLowerCase(), index + pattern.length);
    }
    if (out.length >= limit) break;
  }

  return out;
}

function extractScriptDiagnostics(raw) {
  const scripts = [];
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(String(raw || ""))) !== null && scripts.length < 50) {
    const attrs = String(match[1] || "");
    const body = String(match[2] || "").trim();
    scripts.push({
      attrs: attrs.slice(0, 220),
      length: body.length,
      hasNextData: /__NEXT_DATA__/i.test(attrs + body),
      hasStandingsKeyword: /(standing|standings|table|clasificaci[oó]n|rank|points|pts|played|team)/i.test(body),
      head: body.slice(0, 260)
    });
  }

  return scripts;
}

function extractTableDiagnostics(raw) {
  const tables = [];
  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(String(raw || ""))) !== null && tables.length < 20) {
    const table = tableMatch[0];
    const rows = [];
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;

    while ((trMatch = trRegex.exec(table)) !== null && rows.length < 8) {
      const cells = [];
      const cellRegex = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(trMatch[1])) !== null && cells.length < 16) {
        const text = stripHtml(cellMatch[1]);
        if (text) cells.push(text);
      }
      if (cells.length) rows.push(cells);
    }

    tables.push({
      tableHtmlLength: table.length,
      rowSampleCount: rows.length,
      rowSamples: rows
    });
  }

  return tables;
}

function extractDataAttributeDiagnostics(raw) {
  return {
    dataReactPropsCount: countMatches(raw, /data-react-props=/gi),
    dataPropsCount: countMatches(raw, /data-props=/gi),
    jsonLdCount: countMatches(raw, /application\/ld\+json/gi),
    nextDataCount: countMatches(raw, /__NEXT_DATA__/gi),
    apolloStateCount: countMatches(raw, /__APOLLO_STATE__/gi),
    graphqlCount: countMatches(raw, /graphql|GraphQL|__typename/gi),
    standingsKeywordCount: countMatches(raw, /standings?|standing|table|clasificaci[oó]n|tabell|tabellen|rank|points|pts|played/gi),
    teamKeywordCount: countMatches(raw, /team|club|equipo|lag|participant|competitor/gi)
  };
}

function inferRepairStrategy(family, raw) {
  const lower = String(raw || "").toLowerCase();

  if (family === "laliga") {
    if (lower.includes("__next_data__")) return "laliga_next_data_or_hydration_standings_parser";
    if (lower.includes("clasificación") || lower.includes("clasificacion")) return "laliga_span_div_text_window_standings_parser";
    return "laliga_official_standings_route_specific_parser";
  }

  if (family === "sportomedia") {
    if (lower.includes("__typename") || lower.includes("graphql")) return "sportomedia_graphql_hydration_standings_parser";
    if (lower.includes("tabellen") || lower.includes("poäng") || lower.includes("poang")) return "sportomedia_swedish_text_window_standings_parser";
    return "sportomedia_official_standings_route_specific_parser";
  }

  return "family_specific_standings_route_parser";
}

function buildRepairRow(parserRow, snapshots) {
  const standingsSnapshot = snapshots.find((row) => row.competitionSlug === parserRow.competitionSlug && row.routeKind === "official_standings");
  if (!standingsSnapshot) {
    throw new Error(parserRow.competitionSlug + ": missing official_standings snapshot for repair inspector.");
  }

  const raw = getRaw(standingsSnapshot);
  const text = stripHtml(raw);
  const tableDiagnostics = extractTableDiagnostics(raw);
  const scriptDiagnostics = extractScriptDiagnostics(raw);
  const dataDiagnostics = extractDataAttributeDiagnostics(raw);

  const family = parserRow.reusableFamily;
  const keywordContexts =
    family === "laliga"
      ? contextAround(raw, ["clasificación", "clasificacion", "puntos", "pts", "equipo", "jugados", "ganados", "empatados", "perdidos"], 16)
      : contextAround(raw, ["tabellen", "poäng", "poang", "spelade", "vunna", "oavgjorda", "förlorade", "forlorade", "målskillnad", "lag"], 16);

  const likelyRepairStrategy = inferRepairStrategy(family, raw);

  return {
    competitionSlug: parserRow.competitionSlug,
    reusableFamily: family,
    parserNormalizerStatus: parserRow.parserNormalizerStatus,
    standingRowCandidateCountBeforeRepair: parserRow.standingRowCandidateCount,
    fixtureResultRowCandidateCountBeforeRepair: parserRow.fixtureResultRowCandidateCount,
    repairTarget: true,
    repairReason: "official_standings_snapshot_available_but_generic_parser_extracted_zero_standing_rows",
    likelyRepairStrategy,

    standingsSnapshot: {
      routeKind: standingsSnapshot.routeKind,
      sourceUrl: standingsSnapshot.sourceUrl,
      finalUrl: standingsSnapshot.finalUrl,
      fetchStatus: standingsSnapshot.fetchStatus,
      status: standingsSnapshot.status,
      rawTextLength: standingsSnapshot.rawTextLength,
      storedTextLength: standingsSnapshot.storedTextLength,
      storedTextSha256: standingsSnapshot.storedTextSha256
    },

    diagnostics: {
      plainTextLength: text.length,
      tableCount: tableDiagnostics.length,
      scriptCount: scriptDiagnostics.length,
      dataDiagnostics,
      tableDiagnostics: tableDiagnostics.slice(0, 6),
      scriptDiagnostics: scriptDiagnostics.slice(0, 12),
      keywordContexts,
      cssClassSamples: sampleMatches(raw, /class=["'][^"']{1,160}["']/gi, 20),
      dataAttributeSamples: sampleMatches(raw, /data-[a-z0-9_-]+=["'][^"']{0,220}["']/gi, 20)
    },

    parserRepairMayUseExistingSnapshotOnly: true,
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
    rowLevelStatsExtractionTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep: "repair_no_write_family_structured_stats_parser_normalizer_with_route_specific_standings_parser",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const parserRun = readJson(args.parserInput);
  const parserRows = validateParserRun(parserRun);

  const snapshotRun = readJson(args.snapshotInput);
  const snapshots = validateSnapshotRun(snapshotRun);

  const repairTargets = parserRows
    .filter((row) => row.standingRowCandidateCount === 0)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const repairSlugs = uniqueSorted(repairTargets.map((row) => row.competitionSlug));
  if (JSON.stringify(repairSlugs) !== JSON.stringify(EXPECTED_REPAIR_SLUGS)) {
    throw new Error("Unexpected repair slugs: " + repairSlugs.join(", "));
  }

  const repairRows = repairTargets.map((row) => buildRepairRow(row, snapshots));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-family-standings-parser-repair-inspector-file",
    mode: "inspect_no_write_family_specific_standings_parser_repair_needs_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      familyStructuredStatsParserNormalizer: args.parserInput,
      finalScopedControlledRouteAcquisitionRun: args.snapshotInput
    },
    summary: {
      standingsParserRepairInspectorCompetitionCount: repairRows.length,
      repairTargetCompetitionCount: repairRows.length,
      laligaRepairTargetCount: repairRows.filter((row) => row.reusableFamily === "laliga").length,
      sportomediaRepairTargetCount: repairRows.filter((row) => row.reusableFamily === "sportomedia").length,
      officialStandingsSnapshotAvailableCount: repairRows.filter((row) => row.standingsSnapshot.fetchStatus === "fetched_ok" && row.standingsSnapshot.status === 200).length,
      routeSpecificRepairStrategyCount: repairRows.length,

      parserRepairMayUseExistingSnapshotOnlyCount: repairRows.filter((row) => row.parserRepairMayUseExistingSnapshotOnly).length,
      readyToRepairParserSourceCount: repairRows.length,

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
      rowLevelStatsExtractionTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane: "repair_no_write_family_structured_stats_parser_normalizer_with_route_specific_standings_parser"
    },
    counts: {
      byReusableFamily: countBy(repairRows, "reusableFamily"),
      byLikelyRepairStrategy: countBy(repairRows, "likelyRepairStrategy"),
      byNextAllowedStep: countBy(repairRows, "nextAllowedStep")
    },
    guardrails: [
      "This inspector reads existing parser diagnostics and already-acquired snapshots only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not classify season state.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Zero standing rows from a generic parser is a parser gap, not evidence absence.",
      "Missing row candidates does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    repairRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    standingsParserRepairInspectorCompetitionCount: output.summary.standingsParserRepairInspectorCompetitionCount,
    repairTargetCompetitionCount: output.summary.repairTargetCompetitionCount,
    laligaRepairTargetCount: output.summary.laligaRepairTargetCount,
    sportomediaRepairTargetCount: output.summary.sportomediaRepairTargetCount,
    officialStandingsSnapshotAvailableCount: output.summary.officialStandingsSnapshotAvailableCount,
    routeSpecificRepairStrategyCount: output.summary.routeSpecificRepairStrategyCount,
    parserRepairMayUseExistingSnapshotOnlyCount: output.summary.parserRepairMayUseExistingSnapshotOnlyCount,
    readyToRepairParserSourceCount: output.summary.readyToRepairParserSourceCount,
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
    rowLevelStatsExtractionTruthCount: output.summary.rowLevelStatsExtractionTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
