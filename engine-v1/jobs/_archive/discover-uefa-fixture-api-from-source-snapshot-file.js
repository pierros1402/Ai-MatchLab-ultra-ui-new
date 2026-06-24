#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function snapshotsOf(input) {
  if (Array.isArray(input?.fetchedSourceSnapshots)) return input.fetchedSourceSnapshots;
  if (Array.isArray(input?.sourceSnapshotRows)) return input.sourceSnapshotRows;
  if (Array.isArray(input?.snapshotRows)) return input.snapshotRows;
  if (Array.isArray(input?.rows)) return input.rows;
  return [];
}

function textOf(snapshot) {
  return asText(snapshot?.http?.text || snapshot?.rawText || snapshot?.text || snapshot?.plainText || snapshot?.body);
}

function extractWindowValue(rawText, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`window\\.${escaped}\\s*=\\s*'([^']*)'\\s*;`, "i"),
    new RegExp(`window\\.${escaped}\\s*=\\s*"([^"]*)"\\s*;`, "i"),
    new RegExp(`window\\.${escaped}\\s*=\\s*([0-9]+)\\s*;`, "i")
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match) return asText(match[1]);
  }

  return "";
}

function normalizeBaseUrl(baseUrl, pageUrl) {
  const value = asText(baseUrl);
  if (!value) return "";

  try {
    if (/^https?:\/\//i.test(value)) return new URL(value).toString();
    return new URL(value, pageUrl || "https://www.uefa.com/").toString();
  } catch {
    return value;
  }
}

function makeUrl(baseUrl, pathAndQuery) {
  try {
    return new URL(pathAndQuery, baseUrl).toString();
  } catch {
    return "";
  }
}

function uniqueRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [row.apiFamily, row.candidateUrl].join("::");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function discoverForSnapshot(snapshot, index) {
  const rawText = textOf(snapshot);
  const pageUrl = asText(snapshot.finalUrl || snapshot.candidateUrl);

  const competitionId = extractWindowValue(rawText, "competitionId");
  const competitionCode = extractWindowValue(rawText, "competitionCode");
  const competitionName = extractWindowValue(rawText, "competitionName");
  const competitionUrl = extractWindowValue(rawText, "competitionUrl");
  const currentSeason = extractWindowValue(rawText, "currentSeason");
  const currentPhase = extractWindowValue(rawText, "currentPhase");
  const apiKey = extractWindowValue(rawText, "apiKey");

  const uefaApiBaseUrl = normalizeBaseUrl(extractWindowValue(rawText, "uefaApiBaseUrl"), pageUrl);
  const matchApiUrl = normalizeBaseUrl(extractWindowValue(rawText, "matchApiUrl"), pageUrl);
  const compApiUrl = normalizeBaseUrl(extractWindowValue(rawText, "compApiUrl"), pageUrl);
  const standingsApiUrl = normalizeBaseUrl(extractWindowValue(rawText, "standingsApiUrl"), pageUrl);
  const domesticApiUrl = normalizeBaseUrl(extractWindowValue(rawText, "domesticApiUrl"), pageUrl);

  const baseMetadata = {
    sourceSnapshotIndex: index,
    leagueSlug: asText(snapshot.leagueSlug || snapshot.competitionSlug),
    hostname: asText(snapshot.hostname),
    sourcePageUrl: pageUrl,
    competitionId,
    competitionCode,
    competitionName,
    competitionUrl,
    currentSeason,
    currentPhase,
    hasApiKey: Boolean(apiKey),
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  const candidateRows = [];

  const addCandidate = (apiFamily, candidateUrl, confidence, reason, extra = {}) => {
    if (!candidateUrl) return;

    candidateRows.push({
      apiCandidateId: `${baseMetadata.leagueSlug || "uefa"}::${apiFamily}::${String(candidateRows.length + 1).padStart(3, "0")}`,
      apiFamily,
      candidateUrl,
      confidence,
      reason,
      ...baseMetadata,
      ...extra,
      requiredHeaders: apiKey ? { "x-api-key": apiKey } : {},
      fetchRequiresExplicitAllowFetch: true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    });
  };

  if (matchApiUrl && competitionId && currentSeason) {
    addCandidate(
      "match-api-competition-season-matches",
      makeUrl(matchApiUrl, `/v5/matches?competitionId=${encodeURIComponent(competitionId)}&seasonYear=${encodeURIComponent(currentSeason)}&offset=0&limit=100`),
      "speculative_high",
      "matchApiUrl plus competitionId/currentSeason discovered in UEFA page"
    );

    addCandidate(
      "match-api-competition-season-fixtures",
      makeUrl(matchApiUrl, `/v5/fixtures?competitionId=${encodeURIComponent(competitionId)}&seasonYear=${encodeURIComponent(currentSeason)}&offset=0&limit=100`),
      "speculative_medium",
      "matchApiUrl plus fixture-page context discovered in UEFA page"
    );
  }

  if (compApiUrl && competitionId && currentSeason) {
    addCandidate(
      "comp-api-competition-season-matches",
      makeUrl(compApiUrl, `/v1/competitions/${encodeURIComponent(competitionId)}/seasons/${encodeURIComponent(currentSeason)}/matches`),
      "speculative_medium",
      "compApiUrl plus competitionId/currentSeason discovered in UEFA page"
    );

    addCandidate(
      "comp-api-competition-season-calendar",
      makeUrl(compApiUrl, `/v1/competitions/${encodeURIComponent(competitionId)}/seasons/${encodeURIComponent(currentSeason)}/calendar`),
      "speculative_medium",
      "fixture page exposes calendar UI and compApiUrl"
    );
  }

  if (uefaApiBaseUrl && competitionUrl && currentSeason) {
    addCandidate(
      "uefa-site-api-fixtures-results",
      makeUrl(uefaApiBaseUrl, `${competitionUrl}/fixtures-results/${encodeURIComponent(currentSeason)}`),
      "speculative_low",
      "uefaApiBaseUrl plus competitionUrl/currentSeason discovered in UEFA page"
    );
  }

  if (standingsApiUrl && competitionId && currentSeason) {
    addCandidate(
      "standings-api-season",
      makeUrl(standingsApiUrl, `/v1/competitions/${encodeURIComponent(competitionId)}/seasons/${encodeURIComponent(currentSeason)}/standings`),
      "supporting_low",
      "standingsApiUrl exposed; useful as supporting competition-season endpoint, not fixture source"
    );
  }

  if (domesticApiUrl && competitionCode && currentSeason) {
    addCandidate(
      "domestic-api-competition-season",
      makeUrl(domesticApiUrl, `/v1/competitions/${encodeURIComponent(competitionCode)}/seasons/${encodeURIComponent(currentSeason)}`),
      "supporting_low",
      "domesticApiUrl exposed; supporting candidate only"
    );
  }

  return {
    config: {
      ...baseMetadata,
      uefaApiBaseUrl,
      matchApiUrl,
      compApiUrl,
      standingsApiUrl,
      domesticApiUrl
    },
    candidateRows: uniqueRows(candidateRows)
  };
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport(input, { inputPath = "" } = {}) {
  const snapshots = snapshotsOf(input);
  const discovery = snapshots.map(discoverForSnapshot);
  const uefaApiConfigRows = discovery.map((row) => row.config);
  const apiCandidateRows = discovery.flatMap((row) => row.candidateRows);

  return {
    ok: true,
    job: "discover-uefa-fixture-api-from-source-snapshot-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    summary: {
      inputSnapshotCount: snapshots.length,
      configRowCount: uefaApiConfigRows.length,
      apiCandidateCount: apiCandidateRows.length,
      byApiFamily: countBy(apiCandidateRows, "apiFamily"),
      byConfidence: countBy(apiCandidateRows, "confidence"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    uefaApiConfigRows,
    apiCandidateRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      discoversOnlyApiCandidatesFromProvidedSnapshots: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const input = {
    fetchedSourceSnapshots: [
      {
        leagueSlug: "uefa.champions",
        hostname: "www.uefa.com",
        finalUrl: "https://www.uefa.com/uefachampionsleague/fixtures-results/2026/",
        rawText: `
          window.uefaApiBaseUrl = '/api/v1/';
          window.competitionId = '1';
          window.competitionCode = 'ucl';
          window.competitionName = 'uefachampionsleague';
          window.competitionUrl = 'uefachampionsleague';
          window.currentSeason = 2026;
          window.currentPhase = 'TOURNAMENT';
          window.apiKey = 'test-key';
          window.matchApiUrl = 'https://match.uefa.com/';
          window.compApiUrl = 'https://comp.uefa.com/';
          window.standingsApiUrl = 'https://standings.uefa.com/';
          window.domesticApiUrl = 'https://domestic.uefa.com/';
        `
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test" });

  if (report.summary.inputSnapshotCount !== 1) throw new Error("expected 1 input snapshot");
  if (report.summary.apiCandidateCount < 3) throw new Error("expected at least 3 API candidates");
  if (!report.apiCandidateRows.some((row) => row.apiFamily === "match-api-competition-season-matches")) {
    throw new Error("expected match API candidate");
  }
  if (!report.apiCandidateRows.every((row) => row.sourceFetch === false && row.canonicalWrites === 0 && row.productionWrite === false)) {
    throw new Error("candidate rows must remain read-only");
  }
  if (report.guarantees.sourceFetch !== false || report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "discover-uefa-fixture-api-from-source-snapshot-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = buildReport(input, { inputPath: args.input });
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport };