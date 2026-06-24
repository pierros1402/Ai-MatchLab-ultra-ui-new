import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const runnerRel = "engine-v1/jobs/run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file.js";
const runnerPath = path.join(root, runnerRel);

const interfacePath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-exact-runner-interface-inspection-${today}`, `sportomedia-sef-exact-runner-interface-inspection-${today}.json`);
const planPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-harness-plan-${today}`, `sportomedia-sef-previous-completed-proof-harness-plan-${today}.json`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-exact-runner-safety-scan-${today}`);
const outputPath = path.join(outputDir, `sportomedia-sef-exact-runner-safety-scan-${today}.json`);
const rowsOutputPath = path.join(outputDir, `sportomedia-sef-exact-runner-safety-scan-rows-${today}.jsonl`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function lineWindow(lines, index, radius = 3) {
  const start = Math.max(0, index - radius);
  const end = Math.min(lines.length - 1, index + radius);
  const out = [];
  for (let i = start; i <= end; i += 1) {
    out.push({ line: i + 1, text: lines[i].slice(0, 260) });
  }
  return out;
}

function collectWindows(lines, patterns, label, limit = 30) {
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!patterns.some(pattern => pattern.test(lines[i]))) continue;
    rows.push({
      label,
      centerLine: i + 1,
      window: lineWindow(lines, i, 3)
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

function stringLiterals(line) {
  return [...line.matchAll(/["'`]([^"'`]{2,260})["'`]/g)].map(match => match[1]);
}

await fs.mkdir(outputDir, { recursive: true });

const blocks = [];
const text = await fs.readFile(runnerPath, "utf8");
const lines = text.split(/\r?\n/);

const interfaceBoard = JSON.parse(await fs.readFile(interfacePath, "utf8"));
const plan = JSON.parse(await fs.readFile(planPath, "utf8"));

if (interfaceBoard.status !== "passed") blocks.push("interface_board_status_not_passed");
if (plan.status !== "passed") blocks.push("plan_status_not_passed");
if (plan.summary?.selectedExistingRunner !== runnerRel) blocks.push("plan_selected_runner_mismatch");

const flagRows = [];
for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  if (!/process\.argv|args\.has|--[a-z0-9-]+|allowFetch|allow-fetch|canonical|truth|write/i.test(line)) continue;
  flagRows.push({
    line: i + 1,
    text: line.slice(0, 260),
    stringLiterals: stringLiterals(line)
  });
}

const diagnosticOutputRows = collectWindows(lines, [/outputPath/, /rowsOutput/, /_diagnostics/, /writeFile/, /console\.log/, /guardrails/], "diagnostic_output", 30);
const fetchRows = collectWindows(lines, [/fetch\(/, /allowFetch/, /allow-fetch/, /http/, /graphql/i], "fetch_and_graphql", 40);
const canonicalRows = collectWindows(lines, [/canonicalWrite|canonical write|canonical candidate|canonicalPath|write.*canonical/i], "canonical_write_signal", 40);
const truthRows = collectWindows(lines, [/truthAssertion|truth assertion|assert.*truth|truth.*write/i], "truth_signal", 40);
const rawRows = collectWindows(lines, [/rawPayload|fullRaw|payload/i], "raw_payload_signal", 40);
const seasonRows = collectWindows(lines, [/seasonScope|seasonLabel|season|year|2024|2025/i], "season_signal", 40);
const validationRows = collectWindows(lines, [/expectedRows|played|wins|draws|losses|points|goalsFor|goalsAgainst|goalDifference|teamSignal|duplicate/i], "validation_signal", 50);

const allFlagLiterals = [...new Set(flagRows.flatMap(row => row.stringLiterals).filter(value => value.startsWith("--")))].sort();

const hasAllowFetchFlag = allFlagLiterals.includes("--allow-fetch") || /allow-fetch|allowFetch/.test(text);
const hasCanonicalFlag = allFlagLiterals.some(flag => /canonical/i.test(flag)) || /allow.*canonical|canonical.*allow|canonicalWrite/i.test(text);
const hasTruthFlag = allFlagLiterals.some(flag => /truth/i.test(flag)) || /allow.*truth|truth.*allow|truthAssertion/i.test(text);
const hasDiagnosticOutput = /_diagnostics/.test(text) && /writeFile/.test(text);
const hasRawPayloadSignal = /rawPayload|fullRaw/.test(text);
const hasGraphqlSignal = /graphql|GraphQL|operationName|query/.test(text);
const hasSeasonSignal = /seasonScope|seasonLabel|season|year/.test(text);
const hasValidationSignal = /expectedRows|played|wins|draws|losses|points|goalsFor|goalsAgainst|goalDifference/.test(text);

const directExecutionSafeForProof =
  hasAllowFetchFlag &&
  hasDiagnosticOutput &&
  hasGraphqlSignal &&
  hasSeasonSignal &&
  hasValidationSignal &&
  !hasCanonicalFlag &&
  !hasTruthFlag;

const wrapperRequired = !directExecutionSafeForProof;

const rows = [
  ...flagRows.map(row => ({ category: "flag_or_write_gate_line", ...row })),
  ...diagnosticOutputRows,
  ...fetchRows,
  ...canonicalRows,
  ...truthRows,
  ...rawRows,
  ...seasonRows,
  ...validationRows
];

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "sportomedia_sef_exact_runner_safety_scan",
  contractVersion: 1,
  purpose: "Static safety scan of selected Sportomedia/SEF exact runner before any previous_completed proof execution. No fetch/search/canonical/truth/production writes.",
  selectedRunner: runnerRel,
  runnerSha256: await sha256(runnerPath),
  interfacePath: rel(interfacePath),
  interfaceSha256: await sha256(interfacePath),
  planPath: rel(planPath),
  planSha256: await sha256(planPath),
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
    selectedRunner: runnerRel,
    discoveredCliFlags: allFlagLiterals,
    hasAllowFetchFlag,
    hasCanonicalFlag,
    hasTruthFlag,
    hasDiagnosticOutput,
    hasRawPayloadSignal,
    hasGraphqlSignal,
    hasSeasonSignal,
    hasValidationSignal,
    directExecutionSafeForProof,
    wrapperRequired,
    canonicalWriteSignalLineCount: canonicalRows.length,
    truthSignalLineCount: truthRows.length,
    rawPayloadSignalLineCount: rawRows.length,
    diagnosticOutputLineCount: diagnosticOutputRows.length,
    fetchAndGraphqlLineCount: fetchRows.length,
    seasonSignalLineCount: seasonRows.length,
    validationSignalLineCount: validationRows.length,
    acceptedNowCount: 0,
    recommendedNextLane: wrapperRequired
      ? "create a dedicated diagnostic-only Sportomedia previous_completed proof runner/verifier; do not directly execute the existing runner"
      : "direct execution may be possible only if invoked with diagnostic-only flags and no write flags"
  },
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
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
