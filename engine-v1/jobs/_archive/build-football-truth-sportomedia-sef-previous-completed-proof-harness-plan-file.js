import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const inspectionPath = path.join(root, "data", "football-truth", "_diagnostics", `family-previous-completed-expansion-inspection-${today}`, `family-previous-completed-expansion-inspection-${today}.json`);
const inspectionRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `family-previous-completed-expansion-inspection-${today}`, `family-previous-completed-expansion-inspection-rows-${today}.jsonl`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-harness-plan-${today}`);
const outputPath = path.join(outputDir, `sportomedia-sef-previous-completed-proof-harness-plan-${today}.json`);
const rowsOutputPath = path.join(outputDir, `sportomedia-sef-previous-completed-proof-harness-plan-rows-${today}.jsonl`);

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

async function walk(dir) {
  const out = [];
  if (!(await exists(dir))) return out;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
    } else if (entry.isFile() && /\.(js|json|mjs|cjs)$/i.test(entry.name)) {
      out.push(full);
    }
  }

  return out;
}

function pathIsSportomediaFamily(relative) {
  const name = path.basename(relative).toLowerCase();
  return (
    name.includes("sportomedia") ||
    name.includes("sef-current") ||
    name.includes("sef-previous") ||
    name.includes("sef-proof")
  ) &&
  !name.includes("provider-api") &&
  !name.includes("family-previous-completed-expansion-inspection") &&
  !name.includes("sportomedia-sef-previous-completed-proof-harness-plan");
}

function classifyFile(relative) {
  const b = path.basename(relative).toLowerCase();

  if (relative.startsWith("engine-v1/config/")) return "family_config";
  if (b.startsWith("verify-")) return "verifier_candidate";
  if (b.includes("exact-graphql") || b.includes("exact")) return "preferred_exact_graphql_or_exact_runner";
  if (b.includes("standings-extraction")) return "standings_extraction_runner";
  if (b.includes("route-validation")) return "route_validation_runner";
  if (b.includes("route-discovery")) return "route_discovery_runner";
  if (b.startsWith("run-")) return "supporting_runner";
  return "supporting_family_file";
}

function scoreFile(file) {
  return (
    Number(file.role === "preferred_exact_graphql_or_exact_runner") * 100 +
    Number(file.signals.runnable) * 60 +
    Number(file.signals.verifier) * 55 +
    Number(file.signals.config) * 40 +
    Number(file.signals.exact) * 20 +
    Number(file.signals.seasonOrYear) * 10
  );
}

await fs.mkdir(outputDir, { recursive: true });

const inspection = JSON.parse(await fs.readFile(inspectionPath, "utf8"));
const inspectionRows = parseJsonl(await fs.readFile(inspectionRowsPath, "utf8"));

const sportomedia = inspectionRows.find(row => row.family === "sportomedia_sef");
const blocks = [];

if (!sportomedia) blocks.push("missing_sportomedia_sef_inspection_row");
if (inspection.summary?.selectedNextFamily !== "sportomedia_sef") blocks.push("inspection_selected_family_not_sportomedia");
if (inspection.summary?.providerTargetContractEligibleCount !== 0) blocks.push("provider_target_contract_eligible_not_zero");
if (inspection.summary?.providerCanonicalizationAllowedFromCurrentState !== false) blocks.push("provider_canonicalization_allowed");

const files = [
  ...await walk(path.join(root, "engine-v1", "jobs")),
  ...await walk(path.join(root, "engine-v1", "config"))
];

const selectedFiles = [];

for (const file of files) {
  const relative = rel(file);
  if (!pathIsSportomediaFamily(relative)) continue;

  const text = await fs.readFile(file, "utf8").catch(() => "");
  const role = classifyFile(relative);

  selectedFiles.push({
    path: relative,
    basename: path.basename(relative),
    role,
    sha256: await sha256(file),
    bytes: Buffer.byteLength(text, "utf8"),
    signals: {
      runnable: relative.startsWith("engine-v1/jobs/run-"),
      verifier: relative.startsWith("engine-v1/jobs/verify-"),
      builder: relative.startsWith("engine-v1/jobs/build-"),
      config: relative.startsWith("engine-v1/config/"),
      exact: /exact/i.test(text) || /exact/i.test(relative),
      controlled: /controlled/i.test(text) || /controlled/i.test(relative),
      graphqlOrAjax: /graphql|ajax/i.test(text) || /graphql|ajax/i.test(relative),
      seasonOrYear: /season|year|seasonLabel|seasonScope|matchweek/i.test(text),
      previousCompleted: /previous_completed|previous completed|completed season/i.test(text),
      standings: /standings|standing|table/i.test(text) || /standings/i.test(relative),
      allowFetch: /allow-fetch|allowFetch/i.test(text)
    }
  });
}

selectedFiles.sort((a, b) => scoreFile(b) - scoreFile(a) || a.path.localeCompare(b.path));

const preferredExactFiles = selectedFiles.filter(file => file.role === "preferred_exact_graphql_or_exact_runner");
const runnableFiles = selectedFiles.filter(file => file.signals.runnable);
const verifierFiles = selectedFiles.filter(file => file.signals.verifier);
const configFiles = selectedFiles.filter(file => file.signals.config);

if (runnableFiles.length === 0) blocks.push("no_path_strict_existing_runnable_sportomedia_file");
if (configFiles.length === 0) blocks.push("no_path_strict_existing_sportomedia_config_file");
if (preferredExactFiles.length === 0) blocks.push("no_path_strict_preferred_exact_sportomedia_file");

const verifierStatus = verifierFiles.length > 0
  ? "path_strict_existing_verifier_candidate_found"
  : "path_strict_missing_verifier_must_create_before_fetch";

const targetRows = [
  {
    slug: "swe.1",
    league: "Allsvenskan",
    country: "Sweden",
    family: "sportomedia_sef",
    seasonScope: "previous_completed",
    seasonLabel: "2024",
    expectedRows: 16,
    expectedMaxPlayed: 30,
    teamSignalTerms: ["Malmö FF", "Hammarby", "AIK", "Djurgården", "Mjällby", "Elfsborg"],
    validationMinimumTeamSignals: 4,
    reason: "Allsvenskan is current_or_new-only in lifecycle; 2024 is the bounded previous completed season target."
  },
  {
    slug: "swe.2",
    league: "Superettan",
    country: "Sweden",
    family: "sportomedia_sef",
    seasonScope: "previous_completed",
    seasonLabel: "2024",
    expectedRows: 16,
    expectedMaxPlayed: 30,
    teamSignalTerms: ["Degerfors", "Öster", "Landskrona", "Helsingborg", "Sandviken", "Brage"],
    validationMinimumTeamSignals: 4,
    reason: "Superettan is current_or_new-only in lifecycle; 2024 is the bounded previous completed season target."
  }
];

const rows = targetRows.map(target => ({
  ...target,
  proofHarnessStatus: "planned_not_executed",
  preferredExistingRunner: preferredExactFiles[0]?.path || runnableFiles[0]?.path || null,
  fallbackExistingRunners: runnableFiles.map(file => file.path),
  verifierStatus,
  verifierCandidates: verifierFiles.map(file => file.path),
  configCandidates: configFiles.map(file => file.path),
  requiredPreFetchWork: verifierFiles.length > 0
    ? ["confirm path-strict verifier validates exact previous_completed season scope and arithmetic gates"]
    : ["create dedicated sportomedia_sef previous_completed proof verifier before any allow-fetch execution"],
  requiredValidationGates: [
    "source_family_identity_must_be_sportomedia_sef",
    "slug_must_match_target",
    "seasonScope_must_equal_previous_completed",
    "seasonLabel_must_equal_2024",
    "expected_rows_must_match_16",
    "max_played_must_equal_30",
    "team_signal_minimum_must_pass",
    "played_equals_wins_plus_draws_plus_losses_for_all_rows",
    "points_equals_3wins_plus_draws_for_all_rows",
    "goal_difference_equals_for_minus_against_for_all_rows",
    "non_trivial_completed_table_required",
    "duplicate_team_guard_required",
    "no_canonical_write_without_explicit_approval",
    "no_truth_assertion"
  ],
  planAllowsFetchNow: false,
  fetchExecutionBlockedUntilVerifierExists: verifierFiles.length === 0,
  acceptedNow: false,
  acceptanceAllowedNow: false,
  reviewOnly: true
}));

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "sportomedia_sef_previous_completed_proof_harness_plan",
  contractVersion: 3,
  purpose: "Path-strict plan-only previous_completed proof harness for Sportomedia/SEF Swedish leagues. No fetch/search/canonical/truth/production writes.",
  inspectionPath: rel(inspectionPath),
  inspectionRowsPath: rel(inspectionRowsPath),
  inspectionSha256: await sha256(inspectionPath),
  inspectionRowsSha256: await sha256(inspectionRowsPath),
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
  sourceInspectionSummary: inspection.summary,
  summary: {
    family: "sportomedia_sef",
    targetCount: rows.length,
    targetSlugs: rows.map(row => row.slug),
    targetSeasonScope: "previous_completed",
    targetSeasonLabel: "2024",
    selectedExistingRunner: rows[0]?.preferredExistingRunner || null,
    pathStrictSportomediaFileCount: selectedFiles.length,
    fallbackExistingRunnerCount: runnableFiles.length,
    verifierCandidateCount: verifierFiles.length,
    verifierStatus,
    verifierRequiredBeforeFetch: verifierFiles.length === 0,
    configCandidateCount: configFiles.length,
    preferredExactFileCount: preferredExactFiles.length,
    planAllowsFetchNow: false,
    acceptedNowCount: 0,
    recommendedNextLane: verifierFiles.length === 0
      ? "create dedicated sportomedia_sef previous_completed proof verifier, then build bounded allow-fetch proof runner with exact 2024 season gates"
      : "build bounded sportomedia_sef previous_completed proof runner with exact 2024 season gates"
  },
  selectedFiles,
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
