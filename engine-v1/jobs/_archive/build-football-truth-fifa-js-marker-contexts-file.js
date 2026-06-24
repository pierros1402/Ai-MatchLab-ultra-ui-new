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
    radius: 1800,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg === "--date") args.date = argv[++i] || "";
    else if (arg === "--radius") args.radius = Number(argv[++i] || 1800);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.radius) || args.radius < 200) {
    throw new Error(`Invalid --radius: ${args.radius}`);
  }

  return args;
}

function compact(value) {
  return asText(value).replace(/\s+/g, " ");
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function contextAround(text, index, radius) {
  const start = Math.max(0, index - radius);
  const length = Math.min(text.length - start, radius * 2);
  return {
    start,
    end: start + length,
    text: text.slice(start, start + length)
  };
}

function countRegex(text, regex) {
  return [...text.matchAll(regex)].length;
}

function extractFetchLikeSnippets(contextText) {
  const snippets = [];
  const patterns = [
    /fetch\((.{0,500})/g,
    /axios\.get\((.{0,500})/g,
    /useQuery\((.{0,700})/g,
    /createApi\((.{0,700})/g,
    /baseQuery(.{0,700})/g,
    /SERVICE_API(.{0,700})/g,
    /REACT_APP_SERVICE_API(.{0,700})/g,
    /fifaplusweb\/api(.{0,700})/g
  ];

  for (const pattern of patterns) {
    for (const match of contextText.matchAll(pattern)) {
      snippets.push(compact(match[0]).slice(0, 900));
    }
  }

  return unique(snippets).slice(0, 20);
}

function extractQuotedPathFragments(contextText) {
  const fragments = [];
  const quoted = contextText.matchAll(/["'`]([^"'`]{3,320})["'`]/g);

  for (const match of quoted) {
    const value = match[1];
    const lower = value.toLowerCase();

    if (
      lower.includes("fifaplusweb/api") ||
      lower.includes("/api/") ||
      lower.includes("match") ||
      lower.includes("standing") ||
      lower.includes("schedule") ||
      lower.includes("competition") ||
      lower.includes("tournament") ||
      lower.includes("group")
    ) {
      fragments.push(value);
    }
  }

  return unique(fragments).slice(0, 80);
}

function classifyContext(marker, contextText) {
  const lower = contextText.toLowerCase();

  const hasFetch = /fetch\(|axios\.get\(|usequery\(|basequery|createapi/.test(contextText);
  const hasServiceApi = lower.includes("fifaplusweb/api") || lower.includes("service_api") || lower.includes("react_app_service_api");
  const hasLikelySchedule = lower.includes("schedule") || lower.includes("matches") || lower.includes("matchrail");
  const hasLikelyStandings = lower.includes("standings") || lower.includes("groupstable") || lower.includes("table standings");
  const hasCompetition = lower.includes("competition") || lower.includes("tournament");

  if (hasFetch && hasServiceApi && hasLikelySchedule) return "high_value_schedule_api_context_candidate";
  if (hasFetch && hasServiceApi && hasLikelyStandings) return "high_value_standings_api_context_candidate";
  if (hasServiceApi && (hasLikelySchedule || hasLikelyStandings)) return "medium_value_service_api_context_candidate";
  if (hasFetch && (hasLikelySchedule || hasLikelyStandings || hasCompetition)) return "medium_value_fetch_context_candidate";
  if (marker.toLowerCase().includes("schedule") || marker.toLowerCase().includes("match")) return "schedule_marker_context";
  if (marker.toLowerCase().includes("standing")) return "standings_marker_context";
  if (marker.toLowerCase().includes("competition") || marker.toLowerCase().includes("tournament")) return "competition_marker_context";

  return "generic_marker_context";
}

function buildContextRows(snapshots, radius) {
  const markers = [
    "fifaplusweb/api",
    "SERVICE_API",
    "REACT_APP_SERVICE_API",
    "fetch(",
    "useQuery",
    "MatchRail",
    "matches",
    "schedule",
    "Standings",
    "standings",
    "competition",
    "tournament",
    "groups",
    "canadamexicousa2026",
    "club-world-cup"
  ];

  const rows = [];

  for (const snapshot of snapshots) {
    const rawText = asText(snapshot.rawText);
    const fetchInputId = asText(snapshot.fetchInputId);
    const candidateUrl = asText(snapshot.candidateUrl);
    const hostname = asText(snapshot.hostname);

    if (!rawText) continue;

    for (const marker of markers) {
      let searchFrom = 0;
      let markerHitIndex = 0;

      while (searchFrom < rawText.length) {
        const idx = rawText.indexOf(marker, searchFrom);
        if (idx < 0) break;

        markerHitIndex += 1;
        searchFrom = idx + marker.length;

        if (markerHitIndex > 40) break;

        const ctx = contextAround(rawText, idx, radius);
        const contextText = ctx.text;
        const compactContext = compact(contextText);

        rows.push({
          contextId: `${fetchInputId}:${marker.replace(/[^a-zA-Z0-9]+/g, "_")}:${String(markerHitIndex).padStart(3, "0")}`,
          sourceFetchInputId: fetchInputId,
          sourceCandidateUrl: candidateUrl,
          sourceHostname: hostname,
          marker,
          markerHitIndex,
          sourceStart: ctx.start,
          sourceEnd: ctx.end,
          contextLength: contextText.length,
          contextClass: classifyContext(marker, contextText),
          signalCounts: {
            fetch: countRegex(contextText, /fetch\(/g),
            useQuery: countRegex(contextText, /useQuery/g),
            serviceApi: countRegex(contextText, /fifaplusweb\/api|SERVICE_API|REACT_APP_SERVICE_API/g),
            schedule: countRegex(contextText, /schedule/gi),
            matches: countRegex(contextText, /matches|MatchRail/g),
            standings: countRegex(contextText, /standings|Standings/g),
            competition: countRegex(contextText, /competition/gi),
            tournament: countRegex(contextText, /tournament/gi),
            groups: countRegex(contextText, /groups/gi)
          },
          quotedPathFragments: extractQuotedPathFragments(contextText),
          fetchLikeSnippets: extractFetchLikeSnippets(contextText),
          compactContext: compactContext.slice(0, 4200),
          endpointTruthState: "context_only_not_truth",
          canonicalWrites: 0,
          productionWrite: false,
          dryRun: true
        });
      }
    }
  }

  const seen = new Set();
  const deduped = [];

  for (const row of rows) {
    const key = `${row.sourceFetchInputId}|${row.marker}|${row.sourceStart}|${row.sourceEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function buildPlan(input, options = {}) {
  const snapshots = asArray(input.fetchedSourceSnapshots);
  if (!snapshots.length) throw new Error("No fetchedSourceSnapshots found in input.");

  const contextRows = buildContextRows(snapshots, options.radius || 1800);

  const byContextClass = {};
  const byMarker = {};
  const bySourceFetchInputId = {};

  for (const row of contextRows) {
    byContextClass[row.contextClass] = (byContextClass[row.contextClass] || 0) + 1;
    byMarker[row.marker] = (byMarker[row.marker] || 0) + 1;
    bySourceFetchInputId[row.sourceFetchInputId] = (bySourceFetchInputId[row.sourceFetchInputId] || 0) + 1;
  }

  const highValueContextRows = contextRows.filter((row) => row.contextClass.startsWith("high_value_"));
  const mediumValueContextRows = contextRows.filter((row) => row.contextClass.startsWith("medium_value_"));

  return {
    ok: true,
    job: "build-football-truth-fifa-js-marker-contexts-file",
    mode: "read_only_fifa_js_marker_context_extraction",
    generatedAt: new Date().toISOString(),
    date: asText(options.date),
    radius: options.radius || 1800,
    sourceSnapshotJob: asText(input.job),
    summary: {
      inputSnapshotCount: snapshots.length,
      contextRowCount: contextRows.length,
      highValueContextCount: highValueContextRows.length,
      mediumValueContextCount: mediumValueContextRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byContextClass,
      byMarker,
      bySourceFetchInputId
    },
    highValueContextRows,
    mediumValueContextRows,
    contextRows,
    nextStagePlan: {
      inspectHighAndMediumContexts: true,
      buildConcreteFifaEndpointProbeInputOnlyFromValidatedContext: true,
      requireExplicitAllowFetchForAnyEndpointProbe: true,
      noTruthPromotionFromContextOnly: true
    },
    policy: {
      noSearch: true,
      noFetchInThisJob: true,
      noUrlFetch: true,
      contextOnlyDoesNotEqualTruth: true,
      endpointProbeRequiresConcretePath: true,
      endpointProbeRequiresExplicitAllowFetch: true,
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
  const rawText = 'const SERVICE_API="https://cxm-api.fifa.com/fifaplusweb/api"; useQuery(["schedule"],()=>fetch(`${SERVICE_API}/matches?competition=abc`)); const x="Standings";';
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
  }, { date: "2026-06-12", radius: 600 });

  if (report.summary.contextRowCount < 1) throw new Error("expected context rows");
  if (report.summary.highValueContextCount < 1) throw new Error("expected high-value context");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-fifa-js-marker-contexts-file",
      summary: report.summary,
      highValueContextRows: report.highValueContextRows.slice(0, 5),
      mediumValueContextRows: report.mediumValueContextRows.slice(0, 5),
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildPlan(readJson(args.input), { date: args.date, radius: args.radius });
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    highValueContextRows: report.highValueContextRows.slice(0, 10),
    mediumValueContextRows: report.mediumValueContextRows.slice(0, 10),
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-fifa-js-marker-contexts-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}