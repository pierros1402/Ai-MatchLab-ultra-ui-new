import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const planPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-harness-plan-${today}`, `sportomedia-sef-previous-completed-proof-harness-plan-${today}.json`);
const planRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-harness-plan-${today}`, `sportomedia-sef-previous-completed-proof-harness-plan-rows-${today}.jsonl`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-exact-runner-interface-inspection-${today}`);
const outputPath = path.join(outputDir, `sportomedia-sef-exact-runner-interface-inspection-${today}.json`);
const rowsOutputPath = path.join(outputDir, `sportomedia-sef-exact-runner-interface-inspection-rows-${today}.jsonl`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function lineMatches(text, patterns, limit = 80) {
  const lines = text.split(/\r?\n/);
  const matches = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!patterns.some(pattern => pattern.test(line))) continue;

    matches.push({
      line: i + 1,
      text: line.slice(0, 260)
    });

    if (matches.length >= limit) break;
  }

  return matches;
}

function extractStringLiteralsNear(text, patterns, limit = 80) {
  const out = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!patterns.some(pattern => pattern.test(line))) continue;

    const literals = [...line.matchAll(/["'`]([^"'`]{2,240})["'`]/g)].map(match => match[1]);
    out.push({
      line: i + 1,
      literals
    });

    if (out.length >= limit) break;
  }

  return out;
}

function boolSignal(text, regex) {
  return regex.test(text);
}

await fs.mkdir(outputDir, { recursive: true });

const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const planRows = parseJsonl(await fs.readFile(planRowsPath, "utf8"));

const blocks = [];

if (plan.status !== "passed") blocks.push("plan_status_not_passed");
if (plan.contractVersion !== 3) blocks.push("plan_contract_version_not_3");
if (plan.summary?.family !== "sportomedia_sef") blocks.push("plan_family_not_sportomedia_sef");
if (plan.summary?.selectedExistingRunner !== "engine-v1/jobs/run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file.js") blocks.push("selected_runner_mismatch");
if (plan.summary?.planAllowsFetchNow !== false) blocks.push("plan_allows_fetch_now");
if (plan.summary?.verifierRequiredBeforeFetch !== true) blocks.push("verifier_required_before_fetch_not_true");

const selectedRunnerRel = plan.summary?.selectedExistingRunner;
const selectedRunnerPath = selectedRunnerRel ? path.join(root, selectedRunnerRel) : null;

if (!selectedRunnerPath || !(await exists(selectedRunnerPath))) blocks.push("selected_runner_missing_on_disk");

const selectedFiles = plan.selectedFiles || [];
const configCandidates = selectedFiles.filter(file => file.role === "family_config").map(file => file.path);
if (configCandidates.length !== 1) blocks.push("config_candidate_count_not_1");

const filesToInspect = [
  selectedRunnerRel,
  ...configCandidates
].filter(Boolean);

const rows = [];

for (const relative of filesToInspect) {
  const absolute = path.join(root, relative);
  if (!(await exists(absolute))) {
    rows.push({
      path: relative,
      existsNow: false,
      inspectionStatus: "missing",
      acceptedNow: false,
      acceptanceAllowedNow: false,
      reviewOnly: true
    });
    continue;
  }

  const text = await fs.readFile(absolute, "utf8");

  const row = {
    path: relative,
    existsNow: true,
    sha256: await sha256(absolute),
    bytes: Buffer.byteLength(text, "utf8"),
    inspectionStatus: "inspected",
    fileRole: relative.startsWith("engine-v1/config/") ? "family_config" : "selected_exact_runner",
    signals: {
      usesAllowFetch: boolSignal(text, /allow-fetch|allowFetch/i),
      writesDiagnostics: boolSignal(text, /_diagnostics|outputPath|rowsOutput|writeFile/i),
      hasGraphqlSignal: boolSignal(text, /graphql|GraphQL|query\s*[:=]|operationName/i),
      hasSeasonSignal: boolSignal(text, /season|seasonLabel|seasonScope|year|Year/i),
      hasSlugSignal: boolSignal(text, /swe\.1|swe\.2|slug|competitionSlug/i),
      hasStandingsSignal: boolSignal(text, /standings|standing|table/i),
      hasArithmeticSignal: boolSignal(text, /points|played|wins|draws|losses|goalsFor|goalsAgainst|goalDifference|gd/i),
      hasCanonicalWriteSignal: boolSignal(text, /canonicalWrite|canonical candidate|canonicalPath/i),
      hasTruthSignal: boolSignal(text, /truthAssertion|truth assertion/i),
      hasRawPayloadSignal: boolSignal(text, /rawPayload|fullRaw|payload/i)
    },
    cliFlagLines: lineMatches(text, [/process\.argv/, /allow-fetch/i, /allowFetch/i, /--[a-z0-9-]+/i], 60),
    outputLines: lineMatches(text, [/outputPath/, /rowsOutput/, /writeFile/, /_diagnostics/, /console\.log/, /summary/, /guardrails/], 80),
    seasonLines: lineMatches(text, [/season/i, /year/i, /2024/, /2025/, /current_or_new/, /previous_completed/], 80),
    slugLines: lineMatches(text, [/swe\.1/, /swe\.2/, /slug/i, /Allsvenskan/i, /Superettan/i], 80),
    graphqlLines: lineMatches(text, [/graphql/i, /query/i, /operationName/i, /variables/i, /endpoint/i, /url/i], 80),
    validationLines: lineMatches(text, [/points/i, /played/i, /wins/i, /draws/i, /losses/i, /goals/i, /goalDifference/i, /expectedRows/i, /teamSignal/i], 80),
    stringLiteralsNearInterface: extractStringLiteralsNear(text, [/allow-fetch/i, /outputPath/i, /rowsOutput/i, /_diagnostics/i, /season/i, /swe\.1/i, /swe\.2/i, /graphql/i, /standings/i], 80),
    acceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true
  };

  rows.push(row);
}

const runnerRow = rows.find(row => row.fileRole === "selected_exact_runner");
const configRow = rows.find(row => row.fileRole === "family_config");

if (!runnerRow?.signals?.usesAllowFetch) blocks.push("runner_missing_allow_fetch_signal");
if (!runnerRow?.signals?.hasGraphqlSignal) blocks.push("runner_missing_graphql_signal");
if (!runnerRow?.signals?.hasStandingsSignal) blocks.push("runner_missing_standings_signal");
if (!runnerRow?.signals?.hasSeasonSignal) blocks.push("runner_missing_season_signal");
if (!configRow) blocks.push("config_row_missing");

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "sportomedia_sef_exact_runner_interface_inspection",
  contractVersion: 1,
  purpose: "Inspect selected path-strict Sportomedia/SEF exact GraphQL runner and config before creating a dedicated previous_completed verifier/proof runner. No fetch/search/canonical/truth/production writes.",
  planPath: rel(planPath),
  planRowsPath: rel(planRowsPath),
  planSha256: await sha256(planPath),
  planRowsSha256: await sha256(planRowsPath),
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
  sourcePlanSummary: plan.summary,
  summary: {
    inspectedFileCount: rows.length,
    selectedRunner: selectedRunnerRel,
    configCandidates,
    runnerUsesAllowFetch: runnerRow?.signals?.usesAllowFetch || false,
    runnerHasGraphqlSignal: runnerRow?.signals?.hasGraphqlSignal || false,
    runnerHasSeasonSignal: runnerRow?.signals?.hasSeasonSignal || false,
    runnerHasSlugSignal: runnerRow?.signals?.hasSlugSignal || false,
    runnerHasStandingsSignal: runnerRow?.signals?.hasStandingsSignal || false,
    runnerHasArithmeticSignal: runnerRow?.signals?.hasArithmeticSignal || false,
    runnerCanonicalWriteSignal: runnerRow?.signals?.hasCanonicalWriteSignal || false,
    runnerTruthSignal: runnerRow?.signals?.hasTruthSignal || false,
    runnerRawPayloadSignal: runnerRow?.signals?.hasRawPayloadSignal || false,
    planTargetSlugs: plan.summary?.targetSlugs || [],
    planTargetSeasonScope: plan.summary?.targetSeasonScope || null,
    planTargetSeasonLabel: plan.summary?.targetSeasonLabel || null,
    acceptedNowCount: 0,
    recommendedNextLane: "create dedicated sportomedia_sef previous_completed verifier using this inspected interface, then create bounded proof runner"
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
