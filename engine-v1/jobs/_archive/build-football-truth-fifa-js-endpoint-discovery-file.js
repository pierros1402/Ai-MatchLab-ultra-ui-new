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

function compactSample(text, index, radius = 240) {
  const start = Math.max(0, index - radius);
  const len = Math.min(text.length - start, radius * 2);
  return text.slice(start, start + len).replace(/\s+/g, " ");
}

function extractQuotedStrings(text) {
  const out = [];
  const regex = /["'`]([^"'`]{3,260})["'`]/g;
  for (const match of text.matchAll(regex)) {
    out.push(match[1]);
  }
  return unique(out);
}

function looksEndpointLike(value) {
  const v = value.toLowerCase();

  if (v.includes("fifaplusweb/api")) return true;
  if (v.startsWith("/fifaplusweb/api")) return true;
  if (v.startsWith("/api/")) return true;
  if (v.includes("/api/") && /(match|matches|standing|standings|group|groups|competition|competitions|schedule|tournament|fixture|fixtures)/.test(v)) return true;
  if (/(match|matches|standing|standings|group|groups|competition|competitions|schedule|tournament|fixture|fixtures)/.test(v) && /endpoint|path|url|api/.test(v)) return true;

  return false;
}

function classifyCandidate(value) {
  const v = value.toLowerCase();

  if (v.includes("matchrail")) return "matchrail_candidate";
  if (v.includes("standings")) return "standings_candidate";
  if (v.includes("schedule")) return "schedule_candidate";
  if (v.includes("matches")) return "matches_candidate";
  if (v.includes("competition")) return "competition_candidate";
  if (v.includes("groups")) return "groups_candidate";
  if (v.includes("tournament")) return "tournament_candidate";
  if (v.includes("fifaplusweb/api")) return "service_api_candidate";

  return "generic_endpoint_candidate";
}

function buildEndpointCandidateRows(snapshots) {
  const rows = [];

  for (const snapshot of snapshots) {
    const rawText = asText(snapshot.rawText);
    const fetchInputId = asText(snapshot.fetchInputId);
    const candidateUrl = asText(snapshot.candidateUrl);
    const hostname = asText(snapshot.hostname);

    if (!rawText) continue;

    const quoted = extractQuotedStrings(rawText)
      .filter(looksEndpointLike)
      .slice(0, 500);

    quoted.forEach((value, index) => {
      const position = rawText.indexOf(value);
      rows.push({
        endpointCandidateId: `${fetchInputId}:quoted:${String(index + 1).padStart(4, "0")}`,
        sourceFetchInputId: fetchInputId,
        sourceCandidateUrl: candidateUrl,
        sourceHostname: hostname,
        discoveryMethod: "quoted_string_scan",
        candidateKind: classifyCandidate(value),
        candidateValue: value,
        sampleContext: position >= 0 ? compactSample(rawText, position) : "",
        confidence: value.includes("fifaplusweb/api") || value.startsWith("/api/") ? "medium" : "low",
        endpointCandidateDoesNotEqualTruth: true,
        fetchRequiredToValidateEndpoint: true,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
    });

    const markerRegex = /(fifaplusweb\/api|MatchRail|Standings|standings|schedule|matches|competition|tournament|groups)/g;
    let markerIndex = 0;
    for (const match of rawText.matchAll(markerRegex)) {
      markerIndex += 1;
      if (markerIndex > 200) break;

      rows.push({
        endpointCandidateId: `${fetchInputId}:marker:${String(markerIndex).padStart(4, "0")}`,
        sourceFetchInputId: fetchInputId,
        sourceCandidateUrl: candidateUrl,
        sourceHostname: hostname,
        discoveryMethod: "marker_context_scan",
        candidateKind: classifyCandidate(match[1]),
        candidateValue: match[1],
        sampleContext: compactSample(rawText, match.index || 0),
        confidence: "context_only",
        endpointCandidateDoesNotEqualTruth: true,
        fetchRequiredToValidateEndpoint: true,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
    }
  }

  const seen = new Set();
  const deduped = [];

  for (const row of rows) {
    const key = `${row.sourceFetchInputId}|${row.discoveryMethod}|${row.candidateKind}|${row.candidateValue}|${row.sampleContext}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function buildPlan(input, options = {}) {
  const snapshots = asArray(input.fetchedSourceSnapshots);
  if (!snapshots.length) throw new Error("No fetchedSourceSnapshots found in input.");

  const endpointCandidateRows = buildEndpointCandidateRows(snapshots);
  const byCandidateKind = {};
  const byDiscoveryMethod = {};
  const bySourceFetchInputId = {};

  for (const row of endpointCandidateRows) {
    byCandidateKind[row.candidateKind] = (byCandidateKind[row.candidateKind] || 0) + 1;
    byDiscoveryMethod[row.discoveryMethod] = (byDiscoveryMethod[row.discoveryMethod] || 0) + 1;
    bySourceFetchInputId[row.sourceFetchInputId] = (bySourceFetchInputId[row.sourceFetchInputId] || 0) + 1;
  }

  const strongerEndpointCandidates = endpointCandidateRows.filter((row) => {
    return row.confidence === "medium" || row.candidateValue.includes("/api/") || row.candidateValue.includes("fifaplusweb/api");
  });

  return {
    ok: true,
    job: "build-football-truth-fifa-js-endpoint-discovery-file",
    mode: "read_only_fifa_js_endpoint_discovery",
    generatedAt: new Date().toISOString(),
    date: asText(options.date),
    sourceSnapshotJob: asText(input.job),
    summary: {
      inputSnapshotCount: snapshots.length,
      endpointCandidateRowCount: endpointCandidateRows.length,
      strongerEndpointCandidateCount: strongerEndpointCandidates.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byCandidateKind,
      byDiscoveryMethod,
      bySourceFetchInputId
    },
    endpointCandidateRows,
    strongerEndpointCandidates,
    nextStagePlan: {
      review: "inspect stronger endpoint candidates and marker contexts",
      fetchInput: "build concrete API endpoint probe inputs only from validated endpoint-like strings",
      truthExtraction: "extract official FIFA competition/date/match evidence only after concrete endpoint fetch validates payload"
    },
    policy: {
      noSearch: true,
      noFetchInThisJob: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromThisPlan: true,
      endpointCandidateDoesNotEqualTruth: true,
      markerContextDoesNotEqualEndpoint: true,
      concreteEndpointFetchRequiresExplicitAllowFetch: true,
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
  const report = buildPlan({
    job: "self",
    fetchedSourceSnapshots: [
      {
        fetchInputId: "fifa-js-asset:002",
        candidateUrl: "https://www.fifa.com/static/js/main.abc.js",
        hostname: "www.fifa.com",
        rawText: 'const A="/fifaplusweb/api/sections/matches"; const B="MatchRail"; const C="standings";'
      }
    ]
  }, { date: "2026-06-12" });

  if (report.summary.endpointCandidateRowCount < 2) throw new Error("expected endpoint candidates");
  if (report.summary.strongerEndpointCandidateCount < 1) throw new Error("expected stronger endpoint candidate");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-fifa-js-endpoint-discovery-file",
      summary: report.summary,
      strongerEndpointCandidates: report.strongerEndpointCandidates.slice(0, 10),
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
    strongerEndpointCandidates: report.strongerEndpointCandidates.slice(0, 20),
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-fifa-js-endpoint-discovery-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}