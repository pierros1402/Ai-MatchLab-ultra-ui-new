import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const runnerRel = "engine-v1/jobs/run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file.js";
const configRel = "engine-v1/config/football-truth-modern-sportomedia-sef-current-or-new-proof-contract.json";
const verifierRel = "engine-v1/jobs/verify-football-truth-sportomedia-sef-previous-completed-proof-output-file.js";

const runnerPath = path.join(root, runnerRel);
const configPath = path.join(root, configRel);
const verifierPath = path.join(root, verifierRel);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-graphql-request-contract-${today}`);
const outputPath = path.join(outputDir, `sportomedia-sef-graphql-request-contract-${today}.json`);
const rowsOutputPath = path.join(outputDir, `sportomedia-sef-graphql-request-contract-rows-${today}.jsonl`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractStringLiterals(text) {
  return [...text.matchAll(/["'`]([^"'`]{2,500})["'`]/g)].map(match => match[1]);
}

function extractUrlCandidates(text) {
  const literalUrls = extractStringLiterals(text).filter(value => /^https?:\/\//i.test(value));
  const inlineUrls = [...text.matchAll(/https?:\/\/[^\s"'`<>)]+/g)].map(match => match[0]);
  return uniq([...literalUrls, ...inlineUrls]).sort();
}

function lineMatches(text, patterns, label, limit = 120) {
  const lines = text.split(/\r?\n/);
  const rows = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!patterns.some(pattern => pattern.test(line))) continue;

    rows.push({
      label,
      line: i + 1,
      text: line.slice(0, 320),
      literals: extractStringLiterals(line)
    });

    if (rows.length >= limit) break;
  }

  return rows;
}

function collectConfigSignals(obj, pointer = "$", out = []) {
  if (obj === null || obj === undefined) return out;

  if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") {
    const value = String(obj);
    if (/sportomedia|graphql|sef|swe\.1|swe\.2|allsvenskan|superettan|sweden|svensk|standings|table|season|year|2024|2025/i.test(value)) {
      out.push({ pointer, value });
    }
    return out;
  }

  if (Array.isArray(obj)) {
    obj.forEach((value, index) => collectConfigSignals(value, `${pointer}[${index}]`, out));
    return out;
  }

  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      if (/sportomedia|graphql|sef|swe|allsvenskan|superettan|standings|table|season|year|route|url|endpoint|query/i.test(key)) {
        out.push({ pointer: `${pointer}.${key}`, value: typeof value === "object" ? JSON.stringify(value).slice(0, 500) : String(value) });
      }
      collectConfigSignals(value, `${pointer}.${key}`, out);
    }
  }

  return out;
}

await fs.mkdir(outputDir, { recursive: true });

const blocks = [];

for (const [label, file] of [["runner", runnerPath], ["config", configPath], ["verifier", verifierPath]]) {
  if (!(await exists(file))) blocks.push(`missing_${label}_file`);
}

const runnerText = await fs.readFile(runnerPath, "utf8");
const configText = await fs.readFile(configPath, "utf8");
const configJson = JSON.parse(configText);

const runnerUrlCandidates = extractUrlCandidates(runnerText);
const configUrlCandidates = extractUrlCandidates(configText);
const allUrlCandidates = uniq([...runnerUrlCandidates, ...configUrlCandidates]).sort();

const graphqlEndpointCandidates = allUrlCandidates.filter(url => /graphql|sportomedia|api|fotboll|svenskfotboll|allsvenskan|superettan|sef/i.test(url));

const rows = [
  ...lineMatches(runnerText, [/graphql/i, /operationName/i, /query/i, /variables/i, /standings/i, /table/i], "runner_graphql_or_standings_line", 140),
  ...lineMatches(runnerText, [/swe\.1/i, /swe\.2/i, /Allsvenskan/i, /Superettan/i, /season/i, /year/i, /2024/i, /2025/i], "runner_target_or_season_line", 140),
  ...lineMatches(runnerText, [/fetch\(/i, /curl/i, /--request/i, /--data/i, /endpoint/i, /url/i, /headers/i], "runner_fetch_request_line", 140),
  ...lineMatches(configText, [/sportomedia/i, /graphql/i, /sef/i, /swe\.1/i, /swe\.2/i, /Allsvenskan/i, /Superettan/i, /season/i, /year/i, /2024/i, /2025/i, /standings/i, /table/i, /url/i, /endpoint/i], "config_signal_line", 140)
];

const configSignals = collectConfigSignals(configJson).slice(0, 300);

const targetRows = [
  {
    slug: "swe.1",
    league: "Allsvenskan",
    seasonScope: "previous_completed",
    seasonLabel: "2024",
    expectedRows: 16,
    expectedMaxPlayed: 30,
    signalTerms: ["Malmö FF", "Hammarby", "AIK", "Djurgården", "Mjällby", "Elfsborg"]
  },
  {
    slug: "swe.2",
    league: "Superettan",
    seasonScope: "previous_completed",
    seasonLabel: "2024",
    expectedRows: 16,
    expectedMaxPlayed: 30,
    signalTerms: ["Degerfors", "Öster", "Landskrona", "Helsingborg", "Sandviken", "Brage"]
  }
];

const hasGraphqlLines = rows.some(row => row.label === "runner_graphql_or_standings_line");
const hasFetchRequestLines = rows.some(row => row.label === "runner_fetch_request_line");
const hasTargetSeasonLines = rows.some(row => row.label === "runner_target_or_season_line" || row.label === "config_signal_line");
const hasVerifier = await exists(verifierPath);

if (graphqlEndpointCandidates.length === 0) blocks.push("no_graphql_or_api_endpoint_candidate_extracted");
if (!hasGraphqlLines) blocks.push("no_graphql_lines_extracted");
if (!hasFetchRequestLines) blocks.push("no_fetch_request_lines_extracted");
if (!hasTargetSeasonLines) blocks.push("no_target_or_season_lines_extracted");
if (!hasVerifier) blocks.push("proof_output_verifier_missing");

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "sportomedia_sef_graphql_request_contract_extraction",
  contractVersion: 1,
  purpose: "Extract exact Sportomedia/SEF GraphQL/API request hints from existing path-strict runner and config before building diagnostic-only previous_completed proof runner. No fetch/search/canonical/truth/production writes.",
  selectedRunner: runnerRel,
  selectedRunnerSha256: await sha256(runnerPath),
  selectedConfig: configRel,
  selectedConfigSha256: await sha256(configPath),
  selectedVerifier: verifierRel,
  selectedVerifierSha256: await sha256(verifierPath),
  output: rel(outputPath),
  rowsOutput: rel(rowsOutputPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    targetCount: targetRows.length,
    targetSlugs: targetRows.map(row => row.slug),
    targetSeasonScope: "previous_completed",
    targetSeasonLabel: "2024",
    runnerUrlCandidateCount: runnerUrlCandidates.length,
    configUrlCandidateCount: configUrlCandidates.length,
    graphqlEndpointCandidateCount: graphqlEndpointCandidates.length,
    extractedLineRowCount: rows.length,
    configSignalCount: configSignals.length,
    hasGraphqlLines,
    hasFetchRequestLines,
    hasTargetSeasonLines,
    hasVerifier,
    acceptedNowCount: 0,
    readyToImplementDiagnosticOnlyWrapper: blocks.length === 0,
    recommendedNextLane: blocks.length === 0
      ? "implement diagnostic-only Sportomedia previous_completed proof runner from extracted endpoint/request hints and verify with proof-output verifier"
      : "inspect extraction blocks before writing proof runner"
  },
  targetRows,
  runnerUrlCandidates,
  configUrlCandidates,
  graphqlEndpointCandidates,
  configSignals,
  rows,
  blocks
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  graphqlEndpointCandidates: report.graphqlEndpointCandidates.slice(0, 10),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
