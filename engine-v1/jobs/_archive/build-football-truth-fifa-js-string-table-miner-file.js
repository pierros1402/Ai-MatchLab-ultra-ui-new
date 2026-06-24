#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value);
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
  return [...new Set(values.filter(Boolean).map(String))];
}

function compact(value) {
  return asText(value).replace(/\s+/g, " ").trim();
}

function contextAround(text, index, radius = 900) {
  const start = Math.max(0, index - radius);
  const length = Math.min(text.length - start, radius * 2);
  return compact(text.slice(start, start + length)).slice(0, 2200);
}

function extractStrings(rawText) {
  const rows = [];
  const regex = /["'`]([^"'`\\]{2,500})["'`]/g;

  for (const match of rawText.matchAll(regex)) {
    const value = match[1];
    const lower = value.toLowerCase();

    const isRelevant =
      lower.includes("fifaplusweb") ||
      lower.includes("fifacxmsearch") ||
      lower.includes("api") ||
      lower.includes("match") ||
      lower.includes("standing") ||
      lower.includes("schedule") ||
      lower.includes("competition") ||
      lower.includes("tournament") ||
      lower.includes("group") ||
      lower.includes("worldcup") ||
      lower.includes("club-world-cup") ||
      lower.includes("canadamexicousa2026") ||
      lower.includes("usa-2025");

    if (!isRelevant) continue;

    rows.push({
      value,
      lower,
      index: match.index ?? 0
    });
  }

  return rows;
}

function classifyString(value) {
  const lower = value.toLowerCase();

  if (lower.includes("fifaplusweb/api") || lower.includes("fifacxmsearch/api")) return "api_base_or_api_path";
  if (/^https?:\/\//i.test(value)) return "absolute_url";
  if (lower.startsWith("/api/") || lower.startsWith("/fifaplusweb")) return "relative_api_path";
  if (lower.includes("matchrail")) return "matchrail_term";
  if (lower.includes("match")) return "match_term_or_path";
  if (lower.includes("standing")) return "standings_term_or_path";
  if (lower.includes("schedule")) return "schedule_term_or_path";
  if (lower.includes("competition")) return "competition_term_or_path";
  if (lower.includes("tournament")) return "tournament_term_or_path";
  if (lower.includes("group")) return "group_term_or_path";
  if (lower.includes("worldcup") || lower.includes("club-world-cup") || lower.includes("usa-2025")) return "route_token";
  if (lower.includes("api")) return "api_term";

  return "other_relevant_string";
}

function scoreString(value, context) {
  const lower = `${value} ${context}`.toLowerCase();
  let score = 0;

  if (lower.includes("fifaplusweb/api")) score += 5;
  if (lower.includes("fetch(")) score += 4;
  if (lower.includes("usequery")) score += 3;
  if (lower.includes("match")) score += 3;
  if (lower.includes("schedule")) score += 3;
  if (lower.includes("standing")) score += 3;
  if (lower.includes("competition")) score += 2;
  if (lower.includes("tournament")) score += 2;
  if (lower.includes("canadamexicousa2026") || lower.includes("club-world-cup") || lower.includes("usa-2025")) score += 2;
  if (value.length < 4) score -= 2;

  return score;
}

function buildStringRows(snapshots) {
  const rows = [];

  for (const snapshot of snapshots) {
    const rawText = asText(snapshot.rawText);
    const fetchInputId = asText(snapshot.fetchInputId);

    if (!rawText) continue;

    const extracted = extractStrings(rawText);

    for (const item of extracted) {
      const context = contextAround(rawText, item.index);
      const stringClass = classifyString(item.value);

      rows.push({
        stringRowId: `${fetchInputId}:string:${String(rows.length + 1).padStart(5, "0")}`,
        sourceFetchInputId: fetchInputId,
        sourceCandidateUrl: asText(snapshot.candidateUrl),
        sourceHostname: asText(snapshot.hostname),
        stringClass,
        value: item.value,
        index: item.index,
        score: scoreString(item.value, context),
        context,
        endpointTruthState: "string_only_not_truth",
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
    }
  }

  const seen = new Set();
  const deduped = [];

  for (const row of rows) {
    const key = `${row.sourceFetchInputId}|${row.stringClass}|${row.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value));
}

function buildPlan(input, options = {}) {
  const snapshots = asArray(input.fetchedSourceSnapshots);
  if (!snapshots.length) throw new Error("No fetchedSourceSnapshots found in input.");

  const stringRows = buildStringRows(snapshots);

  const byStringClass = {};
  const bySourceFetchInputId = {};
  for (const row of stringRows) {
    byStringClass[row.stringClass] = (byStringClass[row.stringClass] || 0) + 1;
    bySourceFetchInputId[row.sourceFetchInputId] = (bySourceFetchInputId[row.sourceFetchInputId] || 0) + 1;
  }

  const topEndpointLikeRows = stringRows.filter((row) => {
    return row.score >= 6 || [
      "api_base_or_api_path",
      "relative_api_path",
      "absolute_url"
    ].includes(row.stringClass);
  }).slice(0, 120);

  return {
    ok: true,
    job: "build-football-truth-fifa-js-string-table-miner-file",
    mode: "read_only_fifa_js_string_table_mining",
    generatedAt: new Date().toISOString(),
    date: asText(options.date),
    sourceSnapshotJob: asText(input.job),
    summary: {
      inputSnapshotCount: snapshots.length,
      stringRowCount: stringRows.length,
      topEndpointLikeRowCount: topEndpointLikeRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byStringClass,
      bySourceFetchInputId
    },
    topEndpointLikeRows,
    stringRows,
    nextStagePlan: {
      inspectTopEndpointLikeRows: true,
      buildConcreteEndpointProbeInputOnlyIfPathAndParametersAreRecoverable: true,
      noTruthPromotionFromStringMining: true
    },
    policy: {
      noSearch: true,
      noFetchInThisJob: true,
      noUrlFetch: true,
      stringOnlyDoesNotEqualTruth: true,
      endpointCandidateDoesNotEqualTruth: true,
      concreteEndpointFetchRequiresExplicitAllowFetch: true,
      noCanonicalPromotion: true,
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
  const rawText = 'const SERVICE_API="https://cxm-api.fifa.com/fifaplusweb/api"; const path="/matches?competition=abc"; const key="MatchRail";';
  const report = buildPlan({
    job: "self",
    fetchedSourceSnapshots: [
      {
        fetchInputId: "fifa-js-asset:002",
        candidateUrl: "https://www.fifa.com/static/js/main.abc.js",
        hostname: "www.fifa.com",
        rawText
      }
    ]
  }, { date: "2026-06-12" });

  if (report.summary.stringRowCount < 2) throw new Error("expected string rows");
  if (report.summary.topEndpointLikeRowCount < 1) throw new Error("expected top endpoint-like rows");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-fifa-js-string-table-miner-file",
      summary: report.summary,
      topEndpointLikeRows: report.topEndpointLikeRows.slice(0, 20),
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
    topEndpointLikeRows: report.topEndpointLikeRows.slice(0, 30),
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-fifa-js-string-table-miner-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}